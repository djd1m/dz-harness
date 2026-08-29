/**
 * Full environment setup — skills + hooks + memory + pretrain.
 *
 * Unlike `dz init` (skills only), `dz setup` configures the complete
 * self-learning environment:
 * 1. Skills installation (via init)
 * 2. Claude Code session hooks (start/end) — with `--memory agentdb`, a real vector-store
 *    write via `.dz/agentdb-writer.mjs`; otherwise a `.dz/sessions.jsonl` marker
 * 3. Memory store: `.dz/agentdb.db` (agentdb — the session-hook writer's OWN file; the agentdb
 *    MCP server gets a SEPARATE `.dz/agentdb-mcp.db` via AGENTDB_PATH, never this one)
 *    or `.dz/sessions.jsonl` + `.dz/patterns.jsonl` (jsonl default)
 * 4. Pretrain (project analysis → auto-recommend)
 *
 * All operations are additive — never overwrites existing files.
 *
 * @packageDocumentation
 */
/** Memory backend type. */
export type MemoryBackend = 'jsonl' | 'agentdb';
/** Setup options. */
export interface SetupOptions {
    readonly projectRoot: string;
    readonly target: string;
    readonly preset?: string | undefined;
    readonly memory?: MemoryBackend | undefined;
    readonly noHooks?: boolean | undefined;
    readonly noMemory?: boolean | undefined;
    readonly noPretrain?: boolean | undefined;
    readonly force?: boolean | undefined;
    /** Also deploy the operating-instructions "driver" skill + agent docs. */
    readonly installDriver?: boolean | undefined;
}
/** Setup result. */
export interface SetupResult {
    readonly steps: readonly SetupStep[];
    readonly totalSteps: number;
    readonly completed: number;
    readonly skipped: number;
}
/** A single setup step. */
export interface SetupStep {
    readonly name: string;
    readonly status: 'done' | 'skipped' | 'error';
    readonly detail: string;
}
/**
 * Absolute path to the store the generated session-hook writer opens NATIVELY (better-sqlite3).
 * It is the writer's own file: the agentdb MCP server must never be pointed at it — see
 * {@link agentdbMcpStorePath}.
 */
export declare function agentdbStorePath(projectRoot: string): string;
/**
 * Absolute path to the agentdb MCP server's OWN store — never the hook writer's
 * (ADR-001 `agentdb-setup-shared-store-fix`, 2026-08-26).
 *
 * WHY two files: a single SQLite file opened by two different engines is a measured data-loss
 * path. `agentdb` falls back to sql.js when better-sqlite3 has no usable binary (no prebuild for
 * Node 24+/ABI 137, no binary in the npm tarball) — and sql.js persists by rewriting the WHOLE
 * file from its in-memory image, discarding whatever the native writer committed meanwhile.
 * MEASURED in this repo 2026-07-09 (commits 1d47a916 / 9ede3fb5): of 20 samples, 5 were zero
 * bytes and 4 were torn. The cure is separation, not a lock: a lock cannot bind a third-party
 * `npx` process, and sql.js ignores SQLite locking outright.
 */
export declare function agentdbMcpStorePath(projectRoot: string): string;
/**
 * The ONE separation predicate — used by both printers (`runSetup`'s `agentdb wiring` step and
 * `runDoctor`'s `agentdb store separation` check), so a surface can never drift into its own
 * copied comparison.
 *
 * @param projectRoot the project whose `.mcp.json` was read
 * @param pinned the observed `mcpServers.agentdb.env.AGENTDB_PATH` (`undefined` when absent)
 * @returns `null` when the registration is correctly separated, else the WHY message
 */
export declare function agentdbStoreSeparationProblem(projectRoot: string, pinned: string | undefined): string | null;
/**
 * Version of the generated `.dz/agentdb-writer.mjs`. Bump on ANY change to
 * {@link generateAgentdbWriter}'s output — setup regenerates deployed writers whose
 * `dz-writer-version` stamp is older, WITHOUT requiring `--force` (audit gap G4: generated code
 * must not fossilize outside the package lifecycle).
 */
export declare const AGENTDB_WRITER_VERSION = 5;
/**
 * Generate the `.dz/agentdb-writer.mjs` helper invoked by the session hooks.
 *
 * v2 (ADR-002, audit gaps G3 + code#1 + code#4): session markers are **metadata-only telemetry** —
 * a plain row in the `dz_session_events` table inside the writer's OWN `.dz/agentdb.db` (v5: the
 * MCP server is pinned to a SEPARATE `.dz/agentdb-mcp.db`). No embedding, no model load, no
 * `successRate`:
 * - ~ms latency (v1 loaded a ~90 MB transformers model → 12 s cold-timeout losing the marker);
 * - zero pollution of the HNSW index real learnings live in (those enter via `agentdb_*` MCP tools);
 * - uses better-sqlite3 DIRECTLY (WAL + busy_timeout) — if it is unavailable the writer falls back
 *   to the jsonl marker instead of ever touching the sql.js in-memory backend, whose
 *   last-write-wins semantics were the design's one real corruption vector.
 *
 * Best-effort and never throws: any failure degrades to a `.dz/sessions.jsonl` line labelled
 * `jsonl-fallback` (with the error), so the hook always exits 0 and never blocks a session.
 */
export declare function generateAgentdbWriter(projectRoot: string): string;
/** Parse the `dz-writer-version` stamp from a deployed writer file ('' or absent → 0). */
export declare function writerVersionOf(content: string): number;
/** Generate Claude Code hooks configuration for self-learning. */
/**
 * Commands of a Claude Code hook entry in EITHER shape: the valid matcher-group form
 * `{matcher?, hooks:[{type,command}]}` or the legacy flat `{type,command}` that dz ≤0.3.43
 * emitted (Claude Code silently ignores flat entries — the writer-hooks bug; migrated on setup).
 */
export declare function commandsOf(entry: unknown): string[];
export declare function generateHooksConfig(projectRoot: string, backend: MemoryBackend): string;
export declare function runSetup(opts: SetupOptions): SetupResult;
//# sourceMappingURL=setup.d.ts.map