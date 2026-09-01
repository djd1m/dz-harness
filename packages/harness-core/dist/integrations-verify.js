/** Bounded, non-executing target registration verification. */
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAUDE_MCP_RECEIPT, assessClaudeMcpEvidence } from './integration-evidence.js';
import { TARGET_INTEGRATION_POLICY } from './target-integrations.js';
export const INTEGRATION_PROBE_TIMEOUT_MS = 30_000;
export const INTEGRATION_PROBE_STREAM_MAX_BYTES = 1024 * 1024;
export const INTEGRATION_PROBE_AGGREGATE_MAX_BYTES = 2 * 1024 * 1024;
/** Resolve PATH once and reject a project-controlled probe binary before spawning it. */
export function resolveIntegrationExecutable(command, cwd, pathValue = process.env['PATH'] ?? '') {
    const candidates = isAbsolute(command)
        ? [command]
        : command.includes('/') || command.includes('\\')
            ? [resolve(cwd, command)]
            : pathValue.split(delimiter).map((dir) => join(dir.length === 0 ? cwd : dir, command));
    for (const candidate of candidates) {
        if (!existsSync(candidate))
            continue;
        try {
            accessSync(candidate, constants.X_OK);
            const actual = realpathSync(candidate);
            const rel = relative(realpathSync(cwd), actual);
            if (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))) {
                return { ok: false, errorCode: 'UNSAFE_EXECUTABLE' };
            }
            return { ok: true, path: actual };
        }
        catch {
            continue;
        }
    }
    return { ok: false, errorCode: 'ENOENT' };
}
export const defaultIntegrationProcessPort = {
    run(request) {
        const executable = resolveIntegrationExecutable(request.command, request.cwd);
        if (!executable.ok) {
            return { status: null, signal: null, stdout: new Uint8Array(), stderr: new Uint8Array(), errorCode: executable.errorCode };
        }
        const workerPath = fileURLToPath(new URL('./integration-probe-worker.js', import.meta.url));
        const result = spawnSync(process.execPath, [workerPath], {
            input: JSON.stringify({
                ...request,
                command: executable.path,
                streamMaxBytes: INTEGRATION_PROBE_STREAM_MAX_BYTES,
                aggregateMaxBytes: INTEGRATION_PROBE_AGGREGATE_MAX_BYTES,
            }),
            cwd: request.cwd,
            timeout: request.timeoutMs + 5_000,
            killSignal: 'SIGKILL',
            maxBuffer: 4 * 1024 * 1024,
            encoding: 'utf8',
            windowsHide: true,
        });
        if (result.error !== undefined || result.status !== 0) {
            return {
                status: result.status,
                signal: result.signal,
                stdout: new Uint8Array(),
                stderr: new Uint8Array(),
                errorCode: result.error?.code ?? 'PROCESS_ERROR',
            };
        }
        let observation;
        try {
            observation = JSON.parse(result.stdout);
        }
        catch {
            return { status: null, signal: null, stdout: new Uint8Array(), stderr: new Uint8Array(), errorCode: 'PROCESS_ERROR' };
        }
        return {
            status: observation.status,
            signal: observation.signal,
            stdout: Buffer.from(observation.stdoutBase64, 'base64'),
            stderr: Buffer.from(observation.stderrBase64, 'base64'),
            ...(observation.errorCode !== undefined ? { errorCode: observation.errorCode } : {}),
        };
    },
};
function decodeBounded(observation) {
    const stdout = Buffer.from(observation.stdout);
    const stderr = Buffer.from(observation.stderr);
    if (stdout.length > INTEGRATION_PROBE_STREAM_MAX_BYTES || stderr.length > INTEGRATION_PROBE_STREAM_MAX_BYTES ||
        stdout.length + stderr.length > INTEGRATION_PROBE_AGGREGATE_MAX_BYTES)
        return 'LIVE_PROBE_FAILED';
    try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        return { stdout: decoder.decode(stdout), stderr: decoder.decode(stderr) };
    }
    catch {
        return 'LIVE_PROBE_FAILED';
    }
}
function parseClaudeVersion(text) {
    return /(?:Claude Code\s+)?(\d+\.\d+\.\d+)/i.exec(text)?.[1];
}
function failed(options, reasonCode, remediation, runtimeVersion) {
    return {
        ok: false,
        target: options.target,
        component: options.component,
        registrations: [],
        reasonCode,
        remediation,
        ...(runtimeVersion !== undefined ? { runtimeVersion } : {}),
    };
}
function parseClaudeProjectRegistration(options, id, observation, runtimeVersion) {
    if (observation.errorCode === 'ETIMEDOUT' || observation.signal === 'SIGKILL') {
        return failed(options, 'LIVE_PROBE_TIMEOUT', `Claude mcp get exceeded ${INTEGRATION_PROBE_TIMEOUT_MS}ms`, runtimeVersion);
    }
    if (observation.errorCode !== undefined) {
        return failed(options, 'LIVE_PROBE_FAILED', `Claude registration probe failed before a trustworthy observation (${observation.errorCode})`, runtimeVersion);
    }
    const text = decodeBounded(observation);
    if (typeof text === 'string')
        return failed(options, text, 'Claude registration output was oversized or invalid UTF-8', runtimeVersion);
    if (observation.status !== 0)
        return failed(options, 'POST_WRITE_REGISTRATION_NOT_OBSERVED', `claude mcp get ${id} did not observe the project registration`, runtimeVersion);
    const output = `${text.stdout}\n${text.stderr}`;
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Claude 2.1.235 prints either `Name: <id>` or an exact `<id>:` heading depending on the
    // installation channel. Require one whole attributable line; a prose mention is not evidence.
    if (!new RegExp(`^(?:Name\\s*:\\s*${escapedId}|${escapedId}:)\\s*$`, 'im').test(output) ||
        !/Scope\s*:\s*Project\b/i.test(output)) {
        return failed(options, 'POST_WRITE_REGISTRATION_NOT_OBSERVED', `claude mcp get ${id} did not attribute the exact id to project scope`, runtimeVersion);
    }
    const pending = /pending approval/i.test(output);
    return {
        ok: true,
        target: options.target,
        component: options.component,
        runtimeVersion,
        evidenceVersion: CLAUDE_MCP_RECEIPT.runtimeVersion,
        registrations: [{ id, scope: 'project', registered: true, approval: pending ? 'pending' : 'unknown', ready: !pending }],
    };
}
/**
 * Verify only code-owned native list/get surfaces. Manifest command/URL fields
 * are intentionally absent from this API, so they cannot be executed here.
 */
export function verifyTargetIntegration(options) {
    const port = options.processPort ?? defaultIntegrationProcessPort;
    if (options.target !== 'claude-code' || options.component !== 'mcp') {
        const cell = TARGET_INTEGRATION_POLICY[options.target][options.component];
        return failed(options, cell.reasonCode ?? 'NO_QUALIFYING_LIVE_RECEIPT', 'no qualifying exact-version live receipt exists for this target/component');
    }
    const versionObs = port.run({ command: 'claude', args: ['--version'], cwd: options.projectRoot, timeoutMs: INTEGRATION_PROBE_TIMEOUT_MS });
    if (versionObs.errorCode === 'ENOENT')
        return failed(options, 'TARGET_BINARY_UNAVAILABLE', 'install Claude Code and rerun dz integrations-verify');
    if (versionObs.errorCode === 'ETIMEDOUT' || versionObs.signal === 'SIGKILL')
        return failed(options, 'LIVE_PROBE_TIMEOUT', `Claude version probe exceeded ${INTEGRATION_PROBE_TIMEOUT_MS}ms`);
    if (versionObs.errorCode !== undefined)
        return failed(options, 'LIVE_PROBE_FAILED', `Claude version probe failed before a trustworthy observation (${versionObs.errorCode})`);
    const versionText = decodeBounded(versionObs);
    if (typeof versionText === 'string')
        return failed(options, versionText, 'Claude version output was oversized or invalid UTF-8');
    if (versionObs.status !== 0)
        return failed(options, 'LIVE_PROBE_FAILED', 'Claude version probe exited non-zero');
    const runtimeVersion = parseClaudeVersion(`${versionText.stdout}\n${versionText.stderr}`);
    if (runtimeVersion === undefined)
        return failed(options, 'LIVE_PROBE_FAILED', 'Claude version output did not contain an attributable semantic version');
    const evidence = assessClaudeMcpEvidence(runtimeVersion);
    if (!evidence.eligible)
        return failed(options, evidence.reasonCode ?? 'RECEIPT_STALE', `expected Claude Code ${CLAUDE_MCP_RECEIPT.runtimeVersion}; rerun after a matching receipt is recorded`, runtimeVersion);
    if ((options.phase ?? 'preflight') === 'preflight') {
        const probeId = 'dz-registration-probe';
        const probeRoot = mkdtempSync(join(tmpdir(), 'dz-claude-mcp-probe-'));
        try {
            writeFileSync(join(probeRoot, '.mcp.json'), `${JSON.stringify({
                mcpServers: { [probeId]: { type: 'stdio', command: 'node', args: ['-e', 'process.exit(0)'] } },
            }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
            const observation = port.run({
                command: 'claude', args: ['mcp', 'get', probeId], cwd: probeRoot, timeoutMs: INTEGRATION_PROBE_TIMEOUT_MS,
            });
            const parsed = parseClaudeProjectRegistration(options, probeId, observation, runtimeVersion);
            return parsed.ok ? { ...parsed, registrations: [] } : parsed;
        }
        finally {
            rmSync(probeRoot, { recursive: true, force: true });
        }
    }
    const id = options.registrationId;
    if (id === undefined)
        return failed(options, 'LIVE_PROBE_FAILED', 'post-write verification requires an exact registration id', runtimeVersion);
    return parseClaudeProjectRegistration(options, id, port.run({ command: 'claude', args: ['mcp', 'get', id], cwd: options.projectRoot, timeoutMs: INTEGRATION_PROBE_TIMEOUT_MS }), runtimeVersion);
}
export function runIntegrationsVerify(options) {
    return verifyTargetIntegration(options);
}
//# sourceMappingURL=integrations-verify.js.map