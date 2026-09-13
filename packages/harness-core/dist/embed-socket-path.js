/**
 * embed-socket-short-path (feature, ADR-001 D4-A follow-on to `setup-installs-apply-leg`).
 *
 * The APPLY-leg daemon binds a unix domain socket at `<projectRoot>/.dz/embed.sock`. Unix sockets
 * carry a hard platform limit on `sun_path` — 108 bytes on Linux, 104 on macOS, NUL included — and
 * `Buffer.byteLength`, not `.length`, is the right measure (a multi-byte path component under a
 * deep, non-ASCII-free checkout costs more bytes than characters). Past that limit `listen()` fails
 * while everything else about the daemon (deps resolved, model loaded, patterns read) looks fine —
 * so a deeply nested project got a daemon that logged "ready" and a hook/doctor that both reported
 * ABSENT, three consumers agreeing on a wrong answer for three different reasons.
 *
 * This module is the ONE resolver all three consumers use:
 *   - the generated daemon ({@link "./apply-leg.js".embedDaemonSource}) — as inlined TEXT, since a
 *     template string cannot `import` a compiled module (apply-leg-twins.test.ts pins the copies);
 *   - the generated recall hook ({@link "./apply-leg.js".recallHookSource}) — same inlining;
 *   - `dz doctor` (`operations.ts`) — a real `import`, since doctor runs compiled code.
 *
 * A safety margin (100, not 108/104) is deliberate: it leaves room for the NUL terminator and for
 * platform differences without needing to fork the threshold per-OS.
 *
 * @packageDocumentation
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
/**
 * Byte-length ceiling this module resolves under, measured via `Buffer.byteLength`. Chosen as a
 * safety margin below the tightest real platform limit (macOS `sun_path` = 104 bytes incl. NUL;
 * Linux = 108) rather than as a per-OS fork — a 100-byte project path always fits both.
 */
export const EMBED_SOCKET_PATH_BYTES_LIMIT = 100;
/**
 * FR-1. `DZ_EMBED_SOCKET` (if set to a non-empty string) always wins — an explicit override is
 * never second-guessed. Otherwise: the natural `<projectRoot>/.dz/embed.sock` path if its BYTE
 * length is within {@link EMBED_SOCKET_PATH_BYTES_LIMIT}; otherwise a short, deterministic path
 * under `os.tmpdir()` keyed by a 12-hex-char SHA-1 of `projectRoot` — deterministic so a second
 * process resolving the SAME project (with the SAME `os.tmpdir()`) independently arrives at the
 * SAME path without needing to read a pointer file first.
 */
export function resolveEmbedSocketPath(projectRoot, env = process.env) {
    const fromEnv = env.DZ_EMBED_SOCKET;
    if (typeof fromEnv === 'string' && fromEnv !== '') {
        return { path: fromEnv, reason: 'env' };
    }
    const projectPath = join(projectRoot, '.dz', 'embed.sock');
    if (Buffer.byteLength(projectPath, 'utf8') <= EMBED_SOCKET_PATH_BYTES_LIMIT) {
        return { path: projectPath, reason: 'project' };
    }
    // Lead edit after Codex review (findings 2/4): the short socket lives in a PRIVATE per-user
    // directory (mode 0700, created by the daemon), never directly in the world-writable tmpdir; and
    // the fallback itself is measured — a long TMPDIR can still overflow sun_path, which is reported
    // as `tooLong` for the daemon to refuse with an exact diagnosis instead of a phantom "ready".
    const hash = createHash('sha1').update(projectRoot).digest('hex').slice(0, 12);
    const uid = String(process.getuid?.() ?? 'u');
    const shortPath = join(tmpdir(), `dz-${uid}`, `embed-${hash}.sock`);
    const tooLong = Buffer.byteLength(shortPath, 'utf8') > EMBED_SOCKET_PATH_BYTES_LIMIT;
    return tooLong ? { path: shortPath, reason: 'tmpdir-short', tooLong: true } : { path: shortPath, reason: 'tmpdir-short' };
}
/** FR-2. Where the daemon writes (and a reader looks for) the tmpdir-short pointer file. */
export function embedSocketPointerPath(projectRoot) {
    return join(projectRoot, '.dz', 'embed.sock.path');
}
/**
 * FR-2. Read back the pointer the daemon wrote when it picked the `tmpdir-short` branch. Returns
 * `undefined` on anything short of a non-empty file — absent, unreadable, or blank — never throws:
 * this is a hint a reader may trust, not a contract it depends on.
 */
export function readEmbedSocketPointer(projectRoot) {
    const pointerPath = embedSocketPointerPath(projectRoot);
    if (!existsSync(pointerPath))
        return undefined;
    try {
        const raw = readFileSync(pointerPath, 'utf-8').trim();
        return raw !== '' ? raw : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * FR-2/FR-5. The read-side combinator the hook and doctor both use: resolve as usual, and — ONLY
 * when the resolver itself would have picked the `tmpdir-short` branch — prefer an on-disk pointer
 * if one exists. This is deliberately narrower than "always prefer the pointer": the `env` and
 * `project` branches are computed the same way in every process (no `os.tmpdir()` dependency), so
 * there is nothing for a pointer to protect against there. `tmpdir-short` DOES depend on
 * `os.tmpdir()`, which can differ between the daemon's process and a reader's (a different
 * `TMPDIR`) — the pointer is the daemon's own record of the path it actually bound, and wins.
 */
export function resolveEffectiveEmbedSocketPath(projectRoot, env = process.env) {
    const resolved = resolveEmbedSocketPath(projectRoot, env);
    if (resolved.reason !== 'tmpdir-short')
        return resolved;
    // Lead edit after Codex review (finding 1): a pointer is trusted only while its target exists —
    // a stale pointer (daemon gone, TMPDIR changed) falls back to the computed path instead of
    // steering the hook/doctor at a dead or foreign socket.
    const pointer = readEmbedSocketPointer(projectRoot);
    return pointer !== undefined && existsSync(pointer) ? { path: pointer, reason: 'tmpdir-short' } : resolved;
}
//# sourceMappingURL=embed-socket-path.js.map