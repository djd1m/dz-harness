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
/**
 * Byte-length ceiling this module resolves under, measured via `Buffer.byteLength`. Chosen as a
 * safety margin below the tightest real platform limit (macOS `sun_path` = 104 bytes incl. NUL;
 * Linux = 108) rather than as a per-OS fork — a 100-byte project path always fits both.
 */
export declare const EMBED_SOCKET_PATH_BYTES_LIMIT = 100;
/** Why {@link resolveEmbedSocketPath} picked the path it returned. */
export type EmbedSocketPathReason = 'env' | 'project' | 'tmpdir-short';
/** The resolved socket path plus the reason, so callers can render an honest doctor/log message. */
export interface ResolvedEmbedSocketPath {
    readonly path: string;
    readonly reason: EmbedSocketPathReason;
    /** The computed fallback itself exceeds the byte limit — the daemon must refuse, not pretend. */
    readonly tooLong?: boolean;
}
/**
 * FR-1. `DZ_EMBED_SOCKET` (if set to a non-empty string) always wins — an explicit override is
 * never second-guessed. Otherwise: the natural `<projectRoot>/.dz/embed.sock` path if its BYTE
 * length is within {@link EMBED_SOCKET_PATH_BYTES_LIMIT}; otherwise a short, deterministic path
 * under `os.tmpdir()` keyed by a 12-hex-char SHA-1 of `projectRoot` — deterministic so a second
 * process resolving the SAME project (with the SAME `os.tmpdir()`) independently arrives at the
 * SAME path without needing to read a pointer file first.
 */
export declare function resolveEmbedSocketPath(projectRoot: string, env?: NodeJS.ProcessEnv): ResolvedEmbedSocketPath;
/** FR-2. Where the daemon writes (and a reader looks for) the tmpdir-short pointer file. */
export declare function embedSocketPointerPath(projectRoot: string): string;
/**
 * FR-2. Read back the pointer the daemon wrote when it picked the `tmpdir-short` branch. Returns
 * `undefined` on anything short of a non-empty file — absent, unreadable, or blank — never throws:
 * this is a hint a reader may trust, not a contract it depends on.
 */
export declare function readEmbedSocketPointer(projectRoot: string): string | undefined;
/**
 * FR-2/FR-5. The read-side combinator the hook and doctor both use: resolve as usual, and — ONLY
 * when the resolver itself would have picked the `tmpdir-short` branch — prefer an on-disk pointer
 * if one exists. This is deliberately narrower than "always prefer the pointer": the `env` and
 * `project` branches are computed the same way in every process (no `os.tmpdir()` dependency), so
 * there is nothing for a pointer to protect against there. `tmpdir-short` DOES depend on
 * `os.tmpdir()`, which can differ between the daemon's process and a reader's (a different
 * `TMPDIR`) — the pointer is the daemon's own record of the path it actually bound, and wins.
 */
export declare function resolveEffectiveEmbedSocketPath(projectRoot: string, env?: NodeJS.ProcessEnv): ResolvedEmbedSocketPath;
//# sourceMappingURL=embed-socket-path.d.ts.map