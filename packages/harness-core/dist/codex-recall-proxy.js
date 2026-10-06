/** Owned stdio App Server proxy; authority comes only from this child's stdout. */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lstatSync, openSync, closeSync, constants, fstatSync, readSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { generateCodexHelpers } from './codex-hooks-assets.js';
import { buildManagedEntries, codexHookSha256, codexHooksPaths, DZ_HOOK_HELPER_VERSION, parseCodexHookManifest } from './codex-hooks.js';
import { CODEX_RECALL_OBSERVER_NONCE_ENV } from './codex-recall-frame.js';
import { CodexRecallObserver, codexRecallObject } from './codex-recall-observer.js';
import { createCodexRecallSnapshotWriter } from './codex-recall-store.js';
export const CODEX_RECALL_PROXY_MAX_LINE_BYTES = 1_048_576;
export const CODEX_RECALL_PROXY_MAX_REQUESTS = 32;
const INTERNAL_TIMEOUT_MS = 3000;
/** Reject unsafe/unbounded ownership files without printing their paths or contents. */
function file(path) {
    const s = lstatSync(path);
    if (!s.isFile() || s.isSymbolicLink() || s.size > CODEX_RECALL_PROXY_MAX_LINE_BYTES)
        throw Error('unsafe-hook-source');
    const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
        const st = fstatSync(fd);
        if (!st.isFile() || st.size > CODEX_RECALL_PROXY_MAX_LINE_BYTES)
            throw Error('unsafe-hook-source');
        const bytes = Buffer.alloc(CODEX_RECALL_PROXY_MAX_LINE_BYTES + 1);
        let size = 0, count = 0;
        do {
            count = readSync(fd, bytes, size, bytes.length - size, null);
            size += count;
        } while (count > 0 && size < bytes.length);
        if (size > CODEX_RECALL_PROXY_MAX_LINE_BYTES)
            throw Error('unsafe-hook-source');
        return bytes.subarray(0, size).toString('utf8');
    }
    finally {
        closeSync(fd);
    }
}
function ownedEntries(codexHome) {
    try {
        const paths = codexHooksPaths(realpathSync(codexHome));
        if (realpathSync(paths.helperDir) !== paths.helperDir)
            return undefined;
        const manifest = parseCodexHookManifest(file(paths.manifest));
        if (manifest === undefined || manifest.helperVersion !== DZ_HOOK_HELPER_VERSION || manifest.registryPath !== paths.registry
            || typeof manifest.nodePath !== 'string')
            return undefined;
        const recall = generateCodexHelpers().recall;
        if (file(paths.recallHelper) !== recall)
            return undefined;
        const entries = buildManagedEntries({ nodePath: manifest.nodePath, paths }).filter(e => e.id === 'codex-recall');
        if (!entries.every(e => manifest.entries.filter(m => m.id === e.id && m.commandSha256 === codexHookSha256(e.command)).length === 1))
            return undefined;
        return { entries, registryPath: paths.registry };
    }
    catch {
        return undefined;
    }
}
async function write(sink, bytes, signal) {
    if (signal.aborted)
        throw Error('transport-stopped');
    await new Promise((done, reject) => {
        const error = (e) => { cleanup(); reject(e); };
        const abort = () => error(Error('transport-stopped'));
        const cleanup = () => { sink.off('error', error); signal.removeEventListener('abort', abort); };
        sink.once('error', error);
        signal.addEventListener('abort', abort, { once: true });
        sink.write(bytes, e => { cleanup(); if (e)
            reject(e);
        else
            done(); });
    });
}
/** Oversize lines stream through without retention; observation closes permanently. */
async function lines(source, normal, bypass, invalid) {
    let held = Buffer.alloc(0), skipping = false;
    for await (const raw of source) {
        let chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        while (chunk.length > 0) {
            const end = chunk.indexOf(10);
            const part = end < 0 ? chunk : chunk.subarray(0, end + 1);
            chunk = end < 0 ? Buffer.alloc(0) : chunk.subarray(end + 1);
            if (skipping) {
                await bypass(part);
                if (end >= 0)
                    skipping = false;
                continue;
            }
            if (held.length + part.length > CODEX_RECALL_PROXY_MAX_LINE_BYTES) {
                invalid();
                await bypass(held);
                await bypass(part);
                held = Buffer.alloc(0);
                skipping = end < 0;
                continue;
            }
            held = Buffer.concat([held, part]);
            if (end >= 0) {
                await normal(held);
                held = Buffer.alloc(0);
            }
        }
    }
    if (held.length > 0) {
        invalid();
        await bypass(held);
    }
}
const parse = (line) => {
    try {
        const v = JSON.parse(line.toString('utf8'));
        return codexRecallObject(v) ? v : undefined;
    }
    catch {
        return undefined;
    }
};
export async function runCodexRecallProxy(options) {
    const root = realpathSync(resolve(options.projectRoot));
    const codexHome = resolve(options.codexHome ?? options.env?.CODEX_HOME ?? process.env.CODEX_HOME ?? join(homedir(), '.codex'));
    const observerId = randomBytes(16).toString('hex');
    const nonce = randomBytes(16).toString('hex');
    const observer = new CodexRecallObserver(observerId, nonce);
    const output = options.output ?? process.stdout;
    const errors = options.errorOutput ?? process.stderr;
    const transport = new AbortController();
    const sendBytes = (sink, bytes) => write(sink, bytes, transport.signal);
    let persist;
    let storageWarning = false;
    const diagnostic = (code) => { if (!errors.destroyed)
        errors.write(`dz codex-recall-observe: ${code}\n`); };
    const save = () => { try {
        persist?.(observer.snapshot());
    }
    catch {
        if (!storageWarning) {
            storageWarning = true;
            diagnostic('snapshot-unavailable');
        }
    } };
    try {
        persist = createCodexRecallSnapshotWriter(root, observerId);
    }
    catch {
        storageWarning = true;
        diagnostic('snapshot-unavailable');
    }
    diagnostic(`observer=${observerId} recorded-local-experimental`);
    options.onObserver?.(observerId);
    save();
    const child = spawn(options.binary ?? 'codex', ['app-server'], { cwd: root,
        env: { ...process.env, ...options.env, CODEX_HOME: codexHome, [CODEX_RECALL_OBSERVER_NONCE_ENV]: nonce }, stdio: ['pipe', 'pipe', 'pipe'] });
    const pending = new Map();
    const internal = new Map();
    let initialized = false, terminated = false, childFailed = false;
    let internalSequence = 0;
    const internalPrefix = `dz-internal-${nonce}-`;
    const send = (value) => sendBytes(child.stdin, `${JSON.stringify(value)}\n`);
    const rpc = async (method, params) => {
        if (!initialized || internal.size >= CODEX_RECALL_PROXY_MAX_REQUESTS)
            return undefined;
        const id = `${internalPrefix}${++internalSequence}`;
        const answer = new Promise(done => {
            const timer = setTimeout(() => { internal.delete(id); done(undefined); }, INTERNAL_TIMEOUT_MS);
            internal.set(id, { done, timer });
        });
        try {
            await send({ id, method, params });
        }
        catch {
            const entry = internal.get(id);
            if (entry) {
                clearTimeout(entry.timer);
                internal.delete(id);
                entry.done(undefined);
            }
        }
        return answer;
    };
    const refresh = async () => {
        const owned = ownedEntries(codexHome);
        if (owned === undefined) {
            observer.setHooks([], [], '');
            save();
            return;
        }
        const result = await rpc('hooks/list', { cwd: root });
        const hooks = [];
        if (codexRecallObject(result) && Array.isArray(result.data)) {
            for (const entry of result.data)
                if (codexRecallObject(entry) && entry.cwd === root && Array.isArray(entry.hooks)) {
                    for (const h of entry.hooks)
                        if (codexRecallObject(h))
                            hooks.push(h);
                }
        }
        observer.setHooks(hooks, owned.entries, owned.registryPath);
        save();
    };
    const stop = () => { if (terminated)
        return; terminated = true; observer.disconnect(); save(); child.kill('SIGTERM'); };
    const signals = () => requestStop();
    process.on('SIGINT', signals);
    process.on('SIGTERM', signals);
    let forceTimer;
    let eofTimer;
    let drainTimer;
    const requestStop = () => { transport.abort(); stop(); forceTimer ??= setTimeout(() => child.kill('SIGKILL'), 2000); forceTimer.unref(); };
    // A pending stdin write may emit EPIPE after cancellation removed its temporary listener.
    child.stdin.on('error', () => requestStop());
    const exit = new Promise(done => {
        child.once('error', () => { childFailed = true; diagnostic('child-unavailable'); observer.disconnect(); save(); });
        child.once('exit', () => { drainTimer ??= setTimeout(() => transport.abort(), 2000); });
        child.once('close', (code, signal) => {
            terminated = true;
            observer.disconnect();
            save();
            // A dead child cannot unblock an integrator's stalled sink. Allow a bounded final
            // drain, then cancel pending callbacks without destroying caller-owned streams.
            drainTimer ??= setTimeout(() => transport.abort(), 2000);
            for (const entry of internal.values()) {
                clearTimeout(entry.timer);
                entry.done(undefined);
            }
            internal.clear();
            done(childFailed ? 1 : code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1));
        });
    });
    const invalid = () => { observer.fail('stream-invalid'); save(); };
    const stdoutTask = lines(child.stdout, async (line) => {
        const event = parse(line);
        if (event === undefined) {
            invalid();
            await sendBytes(output, line);
            return;
        }
        if (typeof event.id === 'string' && event.id.startsWith(internalPrefix)) {
            const entry = internal.get(event.id);
            if (entry !== undefined) {
                clearTimeout(entry.timer);
                internal.delete(event.id);
                entry.done(event.error === undefined ? event.result : undefined);
            }
            return; // internal responses, including delayed timeouts, never reach the client
        }
        if ((typeof event.id === 'number' || typeof event.id === 'string') && pending.has(event.id)) {
            const request = pending.get(event.id);
            pending.delete(event.id);
            if (request.method === 'initialize' && codexRecallObject(event.result) && typeof event.result.userAgent === 'string') {
                const version = /^[A-Za-z0-9_.-]+\/([0-9]+\.[0-9]+\.[0-9]+) \(/u.exec(event.result.userAgent)?.[1] ?? null;
                observer.setRuntime(version);
                initialized = true;
            }
        }
        observer.consume(event);
        save();
        await sendBytes(output, line);
    }, bytes => sendBytes(output, bytes), invalid).catch(() => { diagnostic('output-unavailable'); requestStop(); });
    const stderrTask = (async () => { try {
        for await (const bytes of child.stderr)
            await sendBytes(errors, bytes);
    }
    catch { /* child exit closes stderr */ } })();
    const input = options.input ?? process.stdin;
    const stdinTask = lines(input, async (line) => {
        const request = parse(line);
        if (request === undefined) {
            invalid();
            await sendBytes(child.stdin, line);
            return;
        }
        // Requests/notifications that look like native evidence remain client input only.
        const method = request.method;
        if (typeof request.id === 'string' && request.id.startsWith(internalPrefix)) {
            invalid();
            diagnostic('reserved-request-id');
            return;
        }
        if (typeof method !== 'string') {
            await sendBytes(child.stdin, line);
            return;
        }
        let changed = false;
        const params = codexRecallObject(request.params) ? { ...request.params } : {};
        if (method === 'initialize') {
            params.capabilities = { ...(codexRecallObject(params.capabilities) ? params.capabilities : {}), experimentalApi: true };
            changed = true;
        }
        if (method === 'turn/start') {
            observer.beginTurn();
            save();
        }
        if (['thread/resume', 'thread/rollback', 'thread/compact/start'].includes(method)) {
            observer.invalidate();
            save();
        }
        if (['thread/start', 'thread/resume'].includes(method)) {
            // Source mapping is for exactly this project. A cross-project request passes through but
            // cannot mint observations attributed to the proxy's project snapshot.
            if (params.cwd !== undefined && (typeof params.cwd !== 'string' || resolve(params.cwd) !== root))
                observer.fail('hook-unverified');
            // 0.160.1 exposes this experimental field only on ThreadStartParams.
            // ThreadResumeParams has no equivalent: request no unsupported fields.
            if (method === 'thread/start') {
                params.experimentalRawEvents = true;
                changed = true;
            }
            await refresh();
        }
        if (typeof request.id === 'string' || typeof request.id === 'number') {
            if (pending.size >= CODEX_RECALL_PROXY_MAX_REQUESTS || pending.has(request.id))
                observer.fail('limit-exceeded');
            else
                pending.set(request.id, { method, params });
        }
        save();
        if (changed)
            await send({ ...request, params });
        else
            await sendBytes(child.stdin, line);
    }, bytes => sendBytes(child.stdin, bytes), invalid).then(() => {
        child.stdin.end();
        eofTimer = setTimeout(requestStop, 2000);
        eofTimer.unref();
    }).catch(() => { if (!terminated) {
        diagnostic('input-unavailable');
        requestStop();
    } });
    const code = await exit;
    // Stop a waiting client reader without consuming further input after the owned process exits.
    if (!input.destroyed)
        input.destroy();
    await Promise.allSettled([stdinTask, stdoutTask, stderrTask]);
    if (forceTimer)
        clearTimeout(forceTimer);
    if (eofTimer)
        clearTimeout(eofTimer);
    if (drainTimer)
        clearTimeout(drainTimer);
    process.off('SIGINT', signals);
    process.off('SIGTERM', signals);
    return code;
}
//# sourceMappingURL=codex-recall-proxy.js.map