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
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { mergeManagedHookEntries } from './managed-hooks.js';
import { CLAUDE_DESTRUCTIVE_HOOK_COMMAND, CLAUDE_DESTRUCTIVE_HOOK_MATCHER, CLAUDE_DESTRUCTIVE_HOOK_RELPATH, generateClaudeDestructiveHook, isDzManagedHookBody, } from './claude-hooks-assets.js';
import { applyIntegrationFragments, IntegrationApplyError } from './integration-apply.js';
import { harnessCoreDistDir } from './harness-core-location.js';
import { ensureAgentdbSchema } from './agentdb-index.js';
import { APPLY_LEG_VERSION, applyLegHookEntries, applyLegVersionOf, bakedCoreDistDirOf, embedDaemonSource, recallHookSource, hookCommandInvokes, } from './apply-leg.js';
/**
 * FR-1/FR-2/FR-3 (feature `setup-backend-from-config`). Before this function, `runSetup` decided
 * the backend as `opts.memory ?? 'jsonl'` — a repeat `dz setup --target claude-code` (no `--memory`)
 * on an agentdb project silently reset it to jsonl and dropped `.dz/agentdb-writer.mjs` from
 * `SessionStart` (AC-1, red-first). This is the ONE place that decides the backend for a run, so
 * the config write, the printed source line, and the doctor cross-check can never disagree.
 *
 * - An explicit `--memory <x>` always wins (`source: 'flag'`) — including the one case that
 *   DOWNGRADES an agentdb-configured project to jsonl (FR-2): `downgraded` is set so the caller can
 *   warn and force the config write back in sync even without `--force`.
 * - No flag, and `.dz/config.json` has a recognised `memory.backend` → that value, `source: 'config'`.
 * - No flag, and no config (absent, unreadable, or an unrecognised backend value) → `jsonl`,
 *   `source: 'default'` — the literal ticket command on an empty project (no change, named in
 *   01_requirements.md "Что НЕ чинится").
 */
export function resolveSetupMemoryBackend(projectRoot, memoryOpt, noMemory = false) {
    // Lead edit after Codex review (findings 5/6): a config that EXISTS but cannot be read, or names an
    // unknown backend, is not "no config" — its source is labeled so, and a later step never overwrites
    // it silently. `--no-memory` disables memory entirely: no downgrade, no config rewrite.
    let configuredBackend;
    let configUnreadable = false;
    const configPath = join(projectRoot, '.dz', 'config.json');
    if (existsSync(configPath)) {
        try {
            const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
            if (cfg.memory?.backend === 'agentdb')
                configuredBackend = 'agentdb';
            else if (cfg.memory?.backend === 'jsonl')
                configuredBackend = 'jsonl';
            else
                configUnreadable = true;
        }
        catch {
            configUnreadable = true;
        }
    }
    if (noMemory) {
        return { backend: memoryOpt ?? configuredBackend ?? 'jsonl', source: 'disabled', downgraded: false };
    }
    if (memoryOpt !== undefined) {
        return { backend: memoryOpt, source: 'flag', downgraded: memoryOpt === 'jsonl' && configuredBackend === 'agentdb' };
    }
    if (configuredBackend !== undefined) {
        return { backend: configuredBackend, source: 'config', downgraded: false };
    }
    return { backend: 'jsonl', source: configUnreadable ? 'default-unreadable' : 'default', downgraded: false };
}
/**
 * FR-3: the human-readable "source" suffix, shared between `runSetup`'s own warning step and the
 * CLI's printed `memory backend: …` line so the two texts can never drift apart.
 */
export function memoryBackendSourceLabel(source) {
    if (source === 'flag')
        return 'from --memory';
    if (source === 'config')
        return 'from .dz/config.json';
    if (source === 'default-unreadable')
        return 'default — .dz/config.json unreadable or names no known backend';
    if (source === 'disabled')
        return 'memory disabled (--no-memory)';
    return 'default — no .dz/config.json';
}
/**
 * Absolute path to the store the generated session-hook writer opens NATIVELY (better-sqlite3).
 * It is the writer's own file: the agentdb MCP server must never be pointed at it — see
 * {@link agentdbMcpStorePath}.
 */
export function agentdbStorePath(projectRoot) {
    return join(projectRoot, '.dz', 'agentdb.db');
}
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
export function agentdbMcpStorePath(projectRoot) {
    return join(projectRoot, '.dz', 'agentdb-mcp.db');
}
/**
 * The ONE separation predicate — used by both printers (`runSetup`'s `agentdb wiring` step and
 * `runDoctor`'s `agentdb store separation` check), so a surface can never drift into its own
 * copied comparison.
 *
 * @param projectRoot the project whose `.mcp.json` was read
 * @param pinned the observed `mcpServers.agentdb.env.AGENTDB_PATH` (`undefined` when absent)
 * @returns `null` when the registration is correctly separated, else the WHY message
 */
export function agentdbStoreSeparationProblem(projectRoot, pinned) {
    if (pinned === agentdbStorePath(projectRoot)) {
        return 'SHARED STORE — .mcp.json pins the agentdb MCP server at the same file the session-hook '
            + 'writer opens (.dz/agentdb.db). Two engines on one SQLite file: an agentdb server that '
            + 'falls back to sql.js rewrites the WHOLE file and discards the writer\'s pages. Measured '
            + '2026-07-09: 5 of 20 samples zero bytes, 4 torn. Re-run `dz setup --memory agentdb` to '
            + 'repoint the server at .dz/agentdb-mcp.db.';
    }
    if (pinned !== agentdbMcpStorePath(projectRoot)) {
        return '.mcp.json agentdb missing or not pinned to the MCP store (.dz/agentdb-mcp.db)';
    }
    return null;
}
/**
 * Absolute path to the throttle marker holding the epoch-ms timestamp of the last consolidate the
 * writer spawned. Read before every SessionEnd/PreCompact consolidate: within THROTTLE_MS the spawn
 * is skipped so rapid compactions of a long session don't repeatedly load the embedding model.
 */
function consolidateMarkerPath(projectRoot) {
    return join(projectRoot, '.dz', '.last-consolidate');
}
/**
 * Version of the generated `.dz/agentdb-writer.mjs`. Bump on ANY change to
 * {@link generateAgentdbWriter}'s output — setup regenerates deployed writers whose
 * `dz-writer-version` stamp is older, WITHOUT requiring `--force` (audit gap G4: generated code
 * must not fossilize outside the package lifecycle).
 */
export const AGENTDB_WRITER_VERSION = 5;
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
export function generateAgentdbWriter(projectRoot) {
    const dbPath = agentdbStorePath(projectRoot);
    const sessionsPath = join(projectRoot, '.dz', 'sessions.jsonl');
    const markerPath = consolidateMarkerPath(projectRoot);
    return `#!/usr/bin/env node
// dz-writer-version: ${AGENTDB_WRITER_VERSION}
// Auto-generated by \`dz setup --memory agentdb\`. Do not edit — re-run \`dz setup\` to upgrade
// (setup regenerates automatically when this version stamp is outdated; --force not required).
// Writes a metadata-only session-event row into the writer's OWN AgentDB store (.dz/agentdb.db).
// This file is NEVER shared with the agentdb MCP server — that server has its own
// .dz/agentdb-mcp.db, because two engines on one SQLite file is a measured corruption path
// (2026-07-09: 5 of 20 samples zero bytes, 4 torn). Real learnings go into the vector index via
// the agentdb_* MCP tools; this is deliberately non-semantic telemetry.
// On SessionEnd AND PreCompact it ALSO fires a detached \`dz consolidate\` (Option C, ADR-003):
// harvest this session's learnings into the lexical store and mirror them — with real embeddings —
// into the shared AgentDB vector index. PreCompact is the RELIABLE periodic trigger: it fires on
// every compaction (manual /compact and auto-compact), so long/compacted/abnormally-terminated
// sessions — where SessionEnd frequently never fires — still consolidate. A .dz/.last-consolidate
// epoch-ms marker THROTTLES it (THROTTLE_MS): within the window the spawn is skipped so rapid
// compactions don't thrash the ~90 MB embedding-model load. Detached + unref'd: the hook returns
// immediately; the model-load cost happens off the session's critical path.
// Best-effort: on ANY error it appends a .dz/sessions.jsonl marker and exits 0 — never throws,
// never blocks the session.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const arg = process.argv[2];
const event = arg === 'end' ? 'end' : arg === 'precompact' ? 'precompact' : 'start';
const ts = new Date().toISOString();
// PINNED, deliberately NOT read from the ambient environment. Honouring an ambient store path re-opened the
// exact hole this feature closes: export AGENTDB_PATH=.dz/agentdb-mcp.db and the writer and the MCP
// server share ONE file again — two engines, one database — while the separation invariant still
// reports PASS, because it inspects the registration and not the writer's runtime resolution.
// Found by cross-family QE (Codex gpt-5.6-sol) against the first version of this fix. A store that
// needs to move is a REGENERATION (\`dz setup --memory agentdb\`), never an env override.
const DB = ${JSON.stringify(dbPath)};
const SESSIONS = ${JSON.stringify(sessionsPath)};
const ROOT = ${JSON.stringify(projectRoot)};
const CONSOLIDATE_MARKER = ${JSON.stringify(markerPath)};
const THROTTLE_MS = 15 * 60 * 1000; // 15 min — rapid compactions must not re-load the embed model

function note(extra) {
  try {
    appendFileSync(SESSIONS, JSON.stringify({ event, ts, ...extra }) + '\\n');
  } catch { /* last resort: swallow */ }
}
function fallback(err) {
  note({ backend: 'jsonl-fallback', error: String((err && err.message) || err) });
}

try {
  // Native better-sqlite3 ONLY (prebuilt; synchronous; WAL). Never the sql.js fallback — its
  // whole-file-in-memory persistence is the mechanism that corrupted a shared store.
  // Records start/end AND the lightweight precompact row via the SAME insert path.
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(DB);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000'); // wait out a brief MCP-server write lock instead of failing
  db.exec('CREATE TABLE IF NOT EXISTS dz_session_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, ts TEXT NOT NULL, source TEXT NOT NULL DEFAULT \\'dz-session-hook\\')');
  db.prepare('INSERT INTO dz_session_events (event, ts) VALUES (?, ?)').run(event, ts);
  db.close();
} catch (err) {
  fallback(err);
}

if (event === 'end' || event === 'precompact') {
  // Option C: harvest learnings + mirror to the vector index, DETACHED (fire-and-forget) so the
  // hook never waits on transcript parsing or the embedding model. Fires on BOTH SessionEnd and
  // PreCompact (the reliable trigger for long sessions) — THROTTLED via .dz/.last-consolidate so
  // rapid back-to-back compactions don't repeatedly pay the model-load cost.
  let last = 0;
  try { last = parseInt(String(readFileSync(CONSOLIDATE_MARKER, 'utf-8')).trim(), 10) || 0; } catch { last = 0; }
  if (Date.now() - last < THROTTLE_MS) {
    note({ consolidate: 'skipped-throttled' });
  } else {
    try { writeFileSync(CONSOLIDATE_MARKER, String(Date.now())); } catch { /* best-effort marker */ }
    // Uses the globally-installed \`dz\` from PATH. NO shell on posix: spawn's args-array +
    // shell:true silently word-splits a ROOT containing spaces AND is Node's documented
    // command-injection hazard (QE P1+P2); a plain spawn searches PATH itself and quotes nothing.
    // Windows needs a shell for the .cmd shim, so there we pass ONE pre-quoted string (") — quotes
    // are illegal in Windows paths, so wrapping is sufficient. Failure is detected via BOTH the
    // error event (posix ENOENT) and a non-zero exit code (shell-mediated "not found").
    try {
      const child = process.platform === 'win32'
        ? spawn('dz consolidate --project "' + ROOT + '"', { detached: true, stdio: 'ignore', shell: true, cwd: ROOT })
        : spawn('dz', ['consolidate', '--project', ROOT], { detached: true, stdio: 'ignore', cwd: ROOT });
      child.on('error', (err) => note({ consolidate: 'skipped', error: String((err && err.message) || err) }));
      child.on('exit', (code) => { if (code !== null && code !== 0) note({ consolidate: 'skipped', error: 'dz exited ' + code + ' (not on PATH?)' }); });
      child.unref();
    } catch (err) {
      note({ consolidate: 'skipped', error: String((err && err.message) || err) });
    }
  }
}
`;
}
/** Parse the `dz-writer-version` stamp from a deployed writer file ('' or absent → 0). */
export function writerVersionOf(content) {
    const m = /^\/\/ dz-writer-version:\s*(\d+)/m.exec(content);
    return m ? parseInt(m[1] ?? '0', 10) : 0;
}
/** Generate Claude Code hooks configuration for self-learning. */
/**
 * Commands of a Claude Code hook entry in EITHER shape: the valid matcher-group form
 * `{matcher?, hooks:[{type,command}]}` or the legacy flat `{type,command}` that dz ≤0.3.43
 * emitted (Claude Code silently ignores flat entries — the writer-hooks bug; migrated on setup).
 */
export function commandsOf(entry) {
    const e = entry;
    if (Array.isArray(e?.hooks))
        return e.hooks.map((h) => String(h?.command ?? ''));
    return [String(e?.command ?? '')];
}
/**
 * Prove the installed hook WORKS, by running it (feature `destructive-command-guard`, review
 * round 4, P2).
 *
 * Presence is not proof and a successful write is not proof either: the body must load its decider
 * (which lives in another package directory), and that resolution is exactly what broke in the
 * global-install layout one round ago. So the receipt is POSITIVE and end-to-end — the file is
 * spawned with a payload it is obliged to refuse, and only `exit 2` carrying our marker counts.
 * Anything else — a crash, a silent pass, a missing file, a spawn that could not happen — is `ok:
 * false` with the observation named, never an assumption about the cause.
 *
 * The registry entry is written only when this returns `ok`. A hook that is registered but cannot
 * run is worse than no hook at all: the breakage lands on EVERY Bash call instead of on none.
 *
 * SAFETY PRECONDITION (round 11): this SPAWNS the file, so the caller must only ever call it on a
 * body dz owns — one carrying the ownership marker, or one dz has just written itself. Calling it
 * on a preserved foreign body turns `dz setup` into a runner for whatever a cloned repository
 * committed at that path.
 */
export function probeInstalledGuard(hookPath, opts = {}) {
    const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf .agentic-qe' },
    });
    let run;
    try {
        // DZ_GUARD_TRUSTED_ONLY makes the hook resolve its decision module from the INSTALLED
        // harness-core alone. Without it the probe imports the project's own copy first, so a cloned
        // repository that commits `packages/@dzhechkov/harness-core/dist/destructive-guard-hook.js`
        // gets its top-level JavaScript executed by `dz setup` — the round-11 protection ("a foreign
        // BODY is never spawned") one resolution step further in (cross-family review, gpt-5.6-sol,
        // round 13). MEASURED before the fix: the planted module's marker reached stderr and its
        // decider answered `allow`.
        const env = { ...process.env, DZ_GUARD_TRUSTED_ONLY: '1' };
        if (opts.projectRoot !== undefined)
            env.CLAUDE_PROJECT_DIR = opts.projectRoot;
        run = spawnSync(process.execPath, [hookPath], {
            input: payload,
            encoding: 'utf-8',
            timeout: 15_000,
            env,
        });
    }
    catch (err) {
        return { ok: false, detail: `не удалось запустить хук: ${String(err.message)}` };
    }
    if (run.error !== undefined)
        return { ok: false, detail: `не удалось запустить хук: ${run.error.message}` };
    const firstLine = String(run.stderr ?? '').split('\n')[0] ?? '';
    if (run.status !== 2 || !firstLine.includes('DZ-DESTRUCTIVE:')) {
        return {
            ok: false,
            detail: `установленный хук НЕ отказал на контрольной команде (код выхода ${String(run.status)}; ${firstLine || 'пустой stderr'})`,
        };
    }
    return { ok: true, detail: 'живая проба: отказ на контрольной команде, код выхода 2' };
}
/**
 * The destructive-command guard's registry entry (feature `destructive-command-guard`, task T8).
 *
 * Emitted for EVERY backend, because the guard has nothing to do with where learning memory is
 * stored. MEASURED 2026-09-05, before this existed: `dz setup --target claude-code` into a clean
 * project wrote no `PreToolUse` key at all and created no `.claude/hooks/` — the guard we document
 * protected only our own checkout.
 */
const CLAUDE_DESTRUCTIVE_HOOK_TIMEOUT_MS = 5000;
const LEGACY_CLAUDE_DESTRUCTIVE_HOOK_COMMANDS = new Set([
    `node "\${CLAUDE_PROJECT_DIR:-.}/${CLAUDE_DESTRUCTIVE_HOOK_RELPATH}"`,
]);
/** Attribute only commands dz actually emitted, never arbitrary text that mentions the path. */
function isManagedClaudeDestructiveHookCommand(command) {
    return command === CLAUDE_DESTRUCTIVE_HOOK_COMMAND
        || LEGACY_CLAUDE_DESTRUCTIVE_HOOK_COMMANDS.has(command);
}
function destructiveGuardHookEntry() {
    return {
        matcher: CLAUDE_DESTRUCTIVE_HOOK_MATCHER,
        hooks: [{
                type: 'command',
                command: CLAUDE_DESTRUCTIVE_HOOK_COMMAND,
                timeout: CLAUDE_DESTRUCTIVE_HOOK_TIMEOUT_MS,
            }],
    };
}
export function generateHooksConfig(projectRoot, backend) {
    const dzDir = join(projectRoot, '.dz');
    if (backend === 'agentdb') {
        // agentdb backend: hooks invoke the generated writer, which does a REAL vector-store write
        // (ReasoningBank.storePattern) into the AGENTDB_PATH store the MCP server shares. The writer
        // self-degrades to a sessions.jsonl marker on any failure, so no hook ever throws.
        const writer = join(dzDir, 'agentdb-writer.mjs');
        // Claude Code's hooks schema requires MATCHER-GROUP entries: `[{ hooks: [{type, command}] }]`.
        // A flat `[{type, command}]` is silently ignored by Claude Code (QE find: writer hooks never
        // fired), so wrap every entry. Session events take no matcher.
        // PreCompact is MATCHER-LESS (matcher-group entry that omits the optional matcher field) and fires before EVERY
        // compaction — the reliable periodic trigger for long/compacted/abnormally-terminated sessions
        // where SessionEnd frequently never fires. runInBackground so it never blocks compaction; the
        // writer itself throttles + detaches the consolidate. SessionEnd stays as a belt-and-suspenders
        // trigger for clean exits.
        return JSON.stringify({
            hooks: {
                SessionStart: [{ hooks: [{ type: 'command', command: `node ${JSON.stringify(writer)} start` }] }],
                SessionEnd: [{ hooks: [{ type: 'command', command: `node ${JSON.stringify(writer)} end` }] }],
                PreCompact: [{ hooks: [{ type: 'command', command: `node ${JSON.stringify(writer)} precompact`, runInBackground: true }] }],
                PreToolUse: [destructiveGuardHookEntry()],
            },
        }, null, 2);
    }
    // JSONL backend (default) — honest session bookkeeping, no vector store involved.
    // Use a RELATIVE path (Claude Code runs hooks from the project root): interpolating the absolute
    // ${dzDir} into a single-quoted JS literal inside shell double-quotes breaks on Windows backslash
    // paths (\U, \b…) and on any path containing a quote. `.dz/sessions.jsonl` sidesteps all of it.
    // AM-5 (dz-harness-hub issue #10 defect 5): `mkdirSync('.dz',{recursive:true})` FIRST —
    // `appendFileSync` throws ENOENT when `.dz/` has been removed (a fresh checkout with `.dz`
    // gitignored, or a user who deleted it) or when custom `settings.json` runs hooks from a cwd
    // where the directory was never created; `mkdirSync` with `recursive:true` is a no-op when the
    // directory already exists, so this is free on the common path.
    const jsonlCmd = (event) => `node -e "const fs=require('fs');fs.mkdirSync('.dz',{recursive:true});const d=new Date().toISOString();fs.appendFileSync('.dz/sessions.jsonl',JSON.stringify({event:'${event}',ts:d,backend:'jsonl'})+'\\n')"`;
    // Matcher-less PreCompact mirrors the agentdb backend so long-session bookkeeping stays reliable
    // even without a vector store (jsonl has no consolidator — this is just an honest marker row).
    return JSON.stringify({
        hooks: {
            SessionStart: [{ hooks: [{ type: 'command', command: jsonlCmd('start') }] }],
            SessionEnd: [{ hooks: [{ type: 'command', command: jsonlCmd('end') }] }],
            PreCompact: [{ hooks: [{ type: 'command', command: jsonlCmd('precompact'), runInBackground: true }] }],
            PreToolUse: [destructiveGuardHookEntry()],
        },
    }, null, 2);
}
/** Generate .dz/config.json with learning settings. */
function generateDzConfig(target, preset, backend) {
    return JSON.stringify({
        version: '1.0.0',
        target,
        preset: preset ?? null,
        learning: {
            enabled: true,
            sessionTracking: true,
            // recommend() reads .dz/patterns.jsonl back as a ranking boost (audit #2).
            // Set false to disable the boost (recommend() reverts to pure keyword scoring).
            recommendBoost: true,
            // agentdb backend: the SessionEnd hook fires a detached `dz consolidate` that harvests
            // learnings and mirrors them into the vector index (Option C, ADR-003). jsonl backend has
            // no background consolidator — the flag must not advertise an unimplemented capability.
            patternConsolidation: backend === 'agentdb',
            // Store backend: 'auto' = SQLite (FTS5, scale) when better-sqlite3 is
            // available, else the JSON fallback. 'json'/'sqlite' force a backend (Tier-3).
            sqliteBackend: 'auto',
            // Honored at read time: records older than this are dropped (0 = keep forever).
            retentionDays: 90,
        },
        memory: {
            backend,
            // agentdb: the native SQLite vector store the session-hook writer opens. The agentdb MCP
            // server is pinned (via AGENTDB_PATH) to a SEPARATE file — see `mcpStorePath` below.
            path: backend === 'agentdb' ? '.dz/agentdb.db' : '.dz/sessions.jsonl',
            maxSizeMb: backend === 'agentdb' ? 100 : 10,
            agentdb: backend === 'agentdb' ? {
                learning: true,
                vectorDim: 384,
                mcpServer: 'agentdb',
                // The hook writer's own file. The MCP server gets `mcpStorePath` (env AGENTDB_PATH) —
                // the two are deliberately different files (ADR-001, 2026-08-26).
                storePath: '.dz/agentdb.db',
                mcpStorePath: '.dz/agentdb-mcp.db',
                embeddingModel: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
                sessionHookWrites: true,
            } : undefined,
        },
        hooks: {
            sessionStart: true,
            sessionEnd: true,
        },
    }, null, 2);
}
/** True if `agentdb` resolves from the project's node_modules (the hook writer needs it there). */
function isAgentdbInstalledLocally(projectRoot) {
    return existsSync(join(projectRoot, 'node_modules', 'agentdb', 'package.json'));
}
/**
 * The exact agentdb version installed in the project, or `'latest'` as a fallback. Used to pin the
 * MCP server spec (`agentdb@<version>`) so the long-running MCP server and the hook writer — which
 * imports the on-disk local copy — run the SAME schema against the shared DB (agentdb is alpha;
 * `@latest` could drift the MCP server's schema away from what the hook wrote).
 */
function installedAgentdbSpec(projectRoot) {
    try {
        const pkg = JSON.parse(readFileSync(join(projectRoot, 'node_modules', 'agentdb', 'package.json'), 'utf-8'));
        return pkg.version ? `agentdb@${pkg.version}` : 'agentdb@latest';
    }
    catch {
        return 'agentdb@latest';
    }
}
/**
 * Install `agentdb` + `better-sqlite3` as LOCAL project deps so the session-hook writer can
 * `import('agentdb')` and get a native SQLite store (better-sqlite3 ships prebuilt binaries — no
 * build tools — and gives true cross-process WAL concurrency so the hook and the MCP server share
 * one live store). Best-effort: returns false (caller degrades to jsonl) if install fails.
 */
function installAgentdbLocally(projectRoot) {
    if (isAgentdbInstalledLocally(projectRoot))
        return true;
    try {
        // Anchor npm to THIS project: without a package.json here, npm's prefix walk-up would
        // install into (and mutate the lockfile of) the nearest ANCESTOR project (audit code#2).
        const pkgJsonPath = join(projectRoot, 'package.json');
        if (!existsSync(pkgJsonPath)) {
            writeFileSync(pkgJsonPath, JSON.stringify({ name: 'dz-harness-project', private: true, version: '0.0.0' }, null, 2) + '\n');
        }
        // NB: use the ESM-imported execSync — `require()` is undefined in this ESM module (the
        // original agentdb hooks failed silently for exactly this reason). stdio:'ignore' (not
        // 'pipe') avoids execSync's 1 MB maxBuffer aborting the child on npm's verbose output.
        // --save-exact: agentdb is alpha; a semver range would let a later `npm update` drift the
        // local copy away from the version the MCP registration pins (audit gap G7).
        //
        // better-sqlite3@^11 (AM-2, dz-harness-hub issue #10 defect 1, MEASURED Node 20.20.2 with no
        // `make` on PATH): an unpinned `npm install better-sqlite3` resolved 12.11.1, which ships no
        // prebuilt binary for Node 20's ABI 115 — the install fell through to a node-gyp source build
        // and failed on a machine with no C toolchain. `agentdb` itself requests `^11.8.1`, which DOES
        // publish an ABI-115 prebuild, so pinning the range here costs nothing agentdb wasn't already
        // going to resolve to, and buys a working install on a bare Node 20/22 host.
        execSync('npm install agentdb better-sqlite3@^11 --save-exact --no-audit --no-fund --loglevel=error', {
            cwd: projectRoot,
            stdio: 'ignore',
            timeout: 300000,
        });
        return isAgentdbInstalledLocally(projectRoot);
    }
    catch {
        return false;
    }
}
/** Run full environment setup. */
/** Marker that brackets the dz-harness section in a shared CLAUDE.md/AGENTS.md. */
const DRIVER_MARKER_START = '<!-- dz-harness-driver:start -->';
const DRIVER_MARKER_END = '<!-- dz-harness-driver:end -->';
/**
 * Operating instructions for a coding agent that should *drive* the dz CLI
 * correctly. Inspired by Visa VVAH `--install-agents`: the toolkit ships its own
 * "how to operate me" doc so agents use the CLI as intended rather than guessing.
 */
function generateDriverInstructions() {
    return `# Operating dz-harness-hub (CLI driver)

You have the \`dz\` CLI (\`@dzhechkov/harness-cli\`) available. It manages cross-platform
AI skills (the agentskills.io \`SKILL.md\` format) across Claude Code, Codex, OpenCode,
Hermes, and OpenClaude.

## Core commands

| Command | Use it when |
|---------|-------------|
| \`dz recommend "<task>"\` | The user describes a task — suggests the right skills/preset/npx package. Start here. |
| \`dz setup --target <t> [--preset <p>] [--memory agentdb]\` | Bootstrap a project: config, hooks, learning memory. |
| \`dz init --target <t> [--preset <p>] [--select id,id]\` | Install skills into a project for a platform. |
| \`dz benchmark <skill-dir>\` | Score a skill (L0 structural checks, grade A–F, cost band). |
| \`dz pretrain\` | Detect the project's tech stack and pre-load relevant skills. |
| \`dz scout [--deep]\` | Discover new skill sources across the ecosystem. |
| \`dz import-ecc\` | Import skills from an ECC repo. |

## Rules for driving this CLI

1. **Do NOT hand-edit \`SKILL.md\` files to make a benchmark pass** — fix the underlying
   structure (missing frontmatter, sections, schema) instead.
2. **Do NOT hand-write \`.dz/config.json\`** — run \`dz setup\` and let it generate config.
3. **Skills are agentskills.io format** — YAML frontmatter (name, description, trust_tier,
   validation) + a Markdown body with a Protocol and Anti-Patterns section.
4. **Presets bundle skills**; prefer \`--preset\` over selecting individual skills unless the
   user wants a minimal install.
5. **Trust tiers**: tier 1 (Structured) → run \`/bto-test\` to promote to tier 2 (Validated).
6. When unsure which skills fit, run \`dz recommend\` first and follow its output.

## Targets (platform install dirs)

claude-code → \`.claude/skills/\` · codex → \`.agents/skills/\` · opencode → \`.opencode/\` ·
hermes → \`.hermes/\` · openclaude → \`.claude/skills/\` · copilot → \`.github/instructions/\` ·
agents-md → \`AGENTS.md\` (single root file) · cursor → \`.cursor/rules/\` (one \`.mdc\` per skill) ·
gemini → \`GEMINI.md\` (single root file, Gemini CLI / Code Assist) ·
windsurf → \`.windsurf/rules/\` (one \`.md\` per skill, Windsurf \`trigger\` frontmatter).
The SKILL.md format is identical across the five tree targets — only the directory differs;
copilot, agents-md, cursor, gemini, and windsurf are transforming/lossy targets (agents-md and gemini
merge ALL selected skills into one root \`AGENTS.md\` / \`GEMINI.md\`, preserving your own content; cursor
emits one \`.cursor/rules/<id>.mdc\` per skill with Cursor's 3-key frontmatter; windsurf emits one
\`.windsurf/rules/<id>.md\` per skill with Windsurf's \`trigger\`/\`description\` frontmatter).
`;
}
/** The same instructions packaged as a loadable Claude Code skill. */
function generateDriverSkill() {
    return `---
name: dz-harness-driver
description: >
  Operating instructions for the dz-harness-hub CLI (@dzhechkov/harness-cli). Load this when
  asked to install/manage AI skills, set up a project with dz, benchmark a skill, or pick
  the right preset. Tells you which dz command to run and the rules for driving the toolkit.
  Triggers on: "dz setup", "install skills", "benchmark skill", "which preset", "dz recommend".
trust_tier: 0
trust_tier_label: "Reference"
---

${generateDriverInstructions()}
`;
}
/**
 * Write the driver docs non-destructively. New files are created; an existing
 * CLAUDE.md/AGENTS.md gets a marked section appended only if not already present.
 * Returns a short detail string for the setup step.
 */
function installDriverDocs(projectRoot, force) {
    const written = [];
    const skipped = [];
    // 1. The loadable skill (own directory — always safe to write/refresh)
    const skillDir = join(projectRoot, '.claude', 'skills', 'dz-harness-driver');
    const skillPath = join(skillDir, 'SKILL.md');
    if (!existsSync(skillPath) || force) {
        mkdirSync(skillDir, { recursive: true });
        writeFileSync(skillPath, generateDriverSkill());
        written.push('skill');
    }
    else {
        skipped.push('skill');
    }
    // 2. Standalone agent docs — create only if absent (never clobber the user's).
    const instructions = generateDriverInstructions();
    for (const name of ['AGENTS.md', 'GEMINI.md']) {
        const p = join(projectRoot, name);
        if (!existsSync(p)) {
            writeFileSync(p, instructions);
            written.push(name);
        }
        else {
            skipped.push(name);
        }
    }
    // 3. CLAUDE.md — append a marked block if the file lacks one (additive, idempotent).
    const claudePath = join(projectRoot, 'CLAUDE.md');
    const block = `\n${DRIVER_MARKER_START}\n\n${instructions}\n${DRIVER_MARKER_END}\n`;
    if (!existsSync(claudePath)) {
        writeFileSync(claudePath, block.trimStart());
        written.push('CLAUDE.md');
    }
    else {
        const existing = readFileSync(claudePath, 'utf-8');
        if (!existing.includes(DRIVER_MARKER_START)) {
            writeFileSync(claudePath, existing + block);
            written.push('CLAUDE.md(appended)');
        }
        else {
            skipped.push('CLAUDE.md');
        }
    }
    const parts = [];
    if (written.length)
        parts.push(`wrote ${written.join(', ')}`);
    if (skipped.length)
        parts.push(`skipped ${skipped.join(', ')}`);
    return parts.join('; ') || 'no changes';
}
/**
 * Install the apply-leg (recall hook + embed daemon) — ADR-001 Decision 1, feature
 * `setup-installs-apply-leg`. The third self-learning leg (COLLECT/RANK are Steps 4/2 of
 * `runSetup`; APPLY is this one) lived only as hand-committed files in this hub's OWN
 * `.claude/helpers/` — a consumer's `dz setup --memory agentdb` wrote session hooks and a memory
 * store but never a `UserPromptSubmit` recall hook at all (00_complexity_assessment.md, MEASURED
 * 2026-09-12).
 *
 * WHY THIS RUNS ITS WORK BEFORE "Configure hooks", even though the STEP is reported after it
 * (`runSetup` calls this first, then pushes the returned step once "Configure hooks" has run).
 * "Configure hooks" owns SessionStart too (the session-hook writer's own entry) via
 * `mergeManagedHookEntries`'s drop-its-own-managed-entries/reappend-at-tail algorithm — a call that
 * is perfectly stable in isolation, but which REORDERS a genuinely foreign SessionStart entry
 * relative to its own the FIRST time one coexists (kept-foreign-entries-in-place, then append fresh
 * own at the tail — stable only once the foreign entry is already positioned before it). Running
 * this step's ADDITIVE-ONLY write first establishes that stable [foreign, own] layout on the VERY
 * FIRST run, so "Configure hooks" never has anything to reorder on any later run — MEASURED: with
 * the write ordered the other way, a repeat `runSetup` flips `SessionStart`'s two entries back and
 * forth forever and neither step ever reports `skipped`, breaking the pre-existing
 * `setup.test.ts` "PreCompact merge is idempotent" contract (FR-6) this feature must not touch.
 *
 * ADD-OR-REPLACE-IN-PLACE, deliberately NOT `mergeManagedHookEntries`: this step never REORDERS —
 * a match keeps its POSITION, only its command text is swapped — so it stays the same "is our
 * command already referenced under this event, anywhere, in any position?" question
 * `mergeManagedHookEntries`'s drop-and-reappend-at-tail algorithm answers differently (by moving
 * the entry), which is exactly what "Configure hooks" must never do to a foreign SessionStart entry
 * on the very first run (see above). Before feature `apply-leg-install-root` the two commands never
 * changed without an `APPLY_LEG_VERSION` bump (a version bump is about the FILE content, not the
 * hook command), so ADDITIVE-ONLY (skip on any match) and ADD-OR-REPLACE (rewrite text on a
 * stale-form match) were behaviourally identical; an install-root migration now changes the command
 * text on its own, independent of the file version, so a stale `CLAUDE_PROJECT_DIR`-relative entry
 * from a pre-feature install must be rewritten in place on the next `dz setup`, not left stale.
 */
function applyLegStepResult(opts, backend) {
    if (opts.noHooks)
        return { name: 'Install apply-leg', status: 'skipped', detail: '--no-hooks' };
    if (backend !== 'agentdb') {
        return {
            name: 'Install apply-leg',
            status: 'skipped',
            detail: "apply-leg needs --memory agentdb (embed daemon requires agentdb's transformers)",
        };
    }
    try {
        const coreDistDir = opts.coreDistDir ?? harnessCoreDistDir();
        // Re-review Codex (B) finding: the hub's own portable `null` marker must survive an ordinary
        // `dz setup` run INSIDE the hub — when harness-core resolves to a path inside THIS project's
        // `packages/@dzhechkov/harness-core`, the checkout is the monorepo itself and the helper is
        // baked portable (`null` → runtime `<project>/packages/...` candidate), never an absolute path
        // that would dirty the committed twin and break the twins test in any other clone.
        const monorepoCoreDist = join(opts.projectRoot, 'packages', '@dzhechkov', 'harness-core', 'dist');
        const relToMonorepo = relative(monorepoCoreDist, coreDistDir);
        const insideMonorepo = relToMonorepo === '' || (!relToMonorepo.startsWith('..') && !isAbsolute(relToMonorepo));
        const bakeTarget = insideMonorepo ? null : coreDistDir;
        const helpersDir = join(opts.projectRoot, '.claude', 'helpers');
        const recallHookPath = join(helpersDir, 'recall-hook.cjs');
        const embedDaemonPath = join(helpersDir, 'dz-embed-daemon.mjs');
        const settingsPath = join(opts.projectRoot, '.claude', 'settings.json');
        const deployedRecallContent = existsSync(recallHookPath) ? readFileSync(recallHookPath, 'utf-8') : undefined;
        const deployedEmbedContent = existsSync(embedDaemonPath) ? readFileSync(embedDaemonPath, 'utf-8') : undefined;
        const deployedRecallVersion = deployedRecallContent !== undefined ? applyLegVersionOf(deployedRecallContent) : -1;
        const deployedEmbedVersion = deployedEmbedContent !== undefined ? applyLegVersionOf(deployedEmbedContent) : -1;
        // MEDIUM finding "переезд ядра" (fix round 1): a version-only staleness check misses the case
        // where npm/nvm RELOCATED the installed harness-core without any template change — the deployed
        // file still stamps the current APPLY_LEG_VERSION, but its baked `CORE_DIST_DIR` now points at a
        // path that no longer exists, and `loadCoreModule` degrades to permanent silence rather than an
        // error nothing else would ever surface. Comparing the BAKED path against the CURRENT one closes
        // that gap independently of the version stamp.
        const deployedCoreDistDir = deployedRecallContent !== undefined ? bakedCoreDistDirOf(deployedRecallContent) : undefined;
        // Re-review Codex (B) finding: a path-staleness rewrite must never DOWNGRADE a helper that a
        // newer CLI already deployed — only a file at or below the current version is ours to rewrite.
        const recallDistDirStale = deployedRecallContent !== undefined
            && deployedRecallVersion <= APPLY_LEG_VERSION
            && deployedCoreDistDir !== bakeTarget;
        let wroteHelpers = false;
        if (deployedRecallVersion === -1 || opts.force || deployedRecallVersion < APPLY_LEG_VERSION || recallDistDirStale) {
            mkdirSync(helpersDir, { recursive: true });
            writeFileSync(recallHookPath, recallHookSource(bakeTarget), { mode: 0o755 });
            wroteHelpers = true;
        }
        if (deployedEmbedVersion === -1 || opts.force || deployedEmbedVersion < APPLY_LEG_VERSION) {
            mkdirSync(helpersDir, { recursive: true });
            writeFileSync(embedDaemonPath, embedDaemonSource(), { mode: 0o755 });
            wroteHelpers = true;
        }
        // ADD-OR-REPLACE, per event: "ours is added when no command of the event references OUR marker
        // yet, and REWRITTEN IN PLACE (same position) when one does but its text is stale". Never
        // removes or reorders an existing entry (foreign OR our own) — see the WHY above for why that
        // matters here.
        //
        // MEDIUM finding "совпадение подстроки в чужой команде" (fix round 1): the substring probe used
        // to be the bare filename (`recall-hook.cjs`), so a foreign command that merely MENTIONS the
        // filename (e.g. `echo recall-hook.cjs`) was indistinguishable from our own entry and silently
        // blocked ours from ever being added. "Ours is already present" now means either an EXACT match
        // of the command we would emit, or the command containing our full relative PATH
        // (`.claude/helpers/<file>`, the same marker `applyLegStatus` structurally looks for) — a bare
        // filename mention under any other wrapper text no longer counts.
        // FR-2 (ADR-001 D2, apply-leg-install-root): bake THIS install's own absolute root into the
        // two commands — the deployed helper already bakes an absolute CORE_DIST_DIR, so a relative
        // command only masked that non-portability (issue #2, `Cannot find module` when project ===
        // $HOME and a foreign session's CLAUDE_PROJECT_DIR pointed elsewhere, swallowed by
        // `2>/dev/null || true`).
        const entries = applyLegHookEntries(opts.projectRoot);
        const existingSettings = existsSync(settingsPath)
            ? JSON.parse(readFileSync(settingsPath, 'utf-8'))
            : {};
        const hooks = { ...(existingSettings['hooks'] ?? {}) };
        let hooksAdded = false;
        // ADD-OR-REPLACE, per event (FR-2/AC-3, apply-leg-install-root): a command that already
        // invokes our marker path is OURS, whatever exact form it takes — a pre-feature
        // `CLAUDE_PROJECT_DIR`-relative entry (or, in principle, a relocated install's stale absolute
        // one) is REPLACED by the current command in place, never left stale AND never duplicated. An
        // EXACT match of the command we would emit is a true no-op (idempotent re-setup — this is what
        // keeps a routine re-run from ever thrashing the file, same guarantee the prior ADDITIVE-ONLY
        // design gave when the command text truly never changed without a version bump; it can now
        // change on install-root migration too, so replace must be part of the contract).
        //
        // AM-2 (fix round 1, HIGH): the prior version replaced the WHOLE matching GROUP
        // (`hooks[event][i]`) with our bare `entry` — a group is Claude Code's matcher-plus-commands
        // shape (`{matcher, hooks:[...]}`), so that discarded the group's `matcher` and any FOREIGN
        // sibling command sharing the same `hooks[]` array whenever ours needed an upgrade. Fixed: only
        // the ONE command object inside the group's own `hooks[]` array that matches OUR marker is
        // replaced — the matcher and every other command in that array survive untouched. A single pass
        // also now upgrades EVERY matching group, not just the first `findIndex` hit, so two stale
        // managed entries left in two different groups (a prior bug's residue, or a hand-edited file)
        // are both fixed in place rather than the second one being silently ignored.
        const addIfMissing = (event, ownCommand, markerPath, entry) => {
            const current = Array.isArray(hooks[event]) ? hooks[event] : [];
            let anyMatch = false;
            let anyChanged = false;
            const updated = current.map((e) => {
                const cmds = commandsOf(e);
                const matchesHere = cmds.some((cmd) => cmd === ownCommand || hookCommandInvokes(cmd, markerPath));
                if (!matchesHere)
                    return e;
                anyMatch = true;
                const group = e;
                if (!Array.isArray(group.hooks)) {
                    if (cmds.some((cmd) => cmd === ownCommand))
                        return e; // legacy flat, already exact
                    anyChanged = true;
                    return entry; // legacy flat {command:...} — nothing else to preserve
                }
                // Codex round-2 (AM-2 residual): a group that holds BOTH the exact own command and a stale
                // copy (or two stale copies) used to be skipped as "already exact" — the stale twin stayed
                // forever. Walk the group once: the first own/stale command becomes the exact form, every
                // later own/stale copy is dropped, every foreign sibling and the group's `matcher` survive.
                let seenOwn = false;
                let groupChanged = false;
                const newGroupHooks = [];
                for (const h of group.hooks) {
                    const cmd = String(h?.command ?? '');
                    const isOurs = cmd === ownCommand || hookCommandInvokes(cmd, markerPath);
                    if (!isOurs) {
                        newGroupHooks.push(h);
                        continue;
                    }
                    if (seenOwn) {
                        groupChanged = true;
                        continue;
                    } // duplicate of ours — dropped
                    seenOwn = true;
                    if (cmd !== ownCommand)
                        groupChanged = true;
                    newGroupHooks.push(cmd === ownCommand ? h : { ...h, command: ownCommand });
                }
                if (!groupChanged)
                    return e;
                anyChanged = true;
                return { ...e, hooks: newGroupHooks };
            });
            if (!anyMatch) {
                hooks[event] = [...current, entry];
                hooksAdded = true;
                return;
            }
            if (anyChanged) {
                hooks[event] = updated;
                hooksAdded = true;
            }
        };
        addIfMissing('UserPromptSubmit', entries.userPromptSubmit.hooks[0]?.command ?? '', '.claude/helpers/recall-hook.cjs', entries.userPromptSubmit);
        addIfMissing('SessionStart', entries.sessionStart.hooks[0]?.command ?? '', '.claude/helpers/dz-embed-daemon.mjs', entries.sessionStart);
        if (hooksAdded) {
            existingSettings['hooks'] = hooks;
            mkdirSync(dirname(settingsPath), { recursive: true });
            writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2));
        }
        // AM-4 (dz-harness-hub issue #10 defect 4): create the empty AgentDB-schema store now, so a
        // lesson taught before the first session's SessionEnd/PreCompact writer has ever run still has
        // somewhere to mirror into — see `ensureAgentdbSchema`'s own doc for the full mechanism. Never
        // touches an EXISTING store (never re-opens a populated db on every routine re-run); "creates a
        // store" is a claim about a store that did not exist.
        const dbPath = join(opts.projectRoot, '.dz', 'agentdb.db');
        let schemaDetail = '';
        if (!existsSync(dbPath)) {
            const schemaResult = ensureAgentdbSchema(opts.projectRoot);
            schemaDetail = schemaResult.ok ? '; empty agentdb.db created' : `; agentdb.db NOT created (${schemaResult.error ?? 'unknown error'})`;
        }
        const changed = wroteHelpers || hooksAdded;
        return {
            name: 'Install apply-leg',
            status: changed ? 'done' : 'skipped',
            detail: (changed ? `Apply-leg: installed v${APPLY_LEG_VERSION}` : `Apply-leg: current (v${APPLY_LEG_VERSION})`) + schemaDetail,
        };
    }
    catch (err) {
        return {
            name: 'Install apply-leg',
            status: 'error',
            detail: `could not install apply-leg: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
export function runSetup(opts) {
    const steps = [];
    const dzDir = join(opts.projectRoot, '.dz');
    // FR-1/FR-2/FR-3 (feature `setup-backend-from-config`): read BEFORE this run writes anything, so
    // the comparison is against the PRIOR config, never the one this same call is about to produce.
    const resolvedMemory = resolveSetupMemoryBackend(opts.projectRoot, opts.memory, opts.noMemory === true);
    const backend = resolvedMemory.backend;
    // Step 0: Install agentdb + better-sqlite3 locally so the session-hook writer can import them
    // and share a native store with the MCP server. Best-effort — the writer self-degrades to a
    // jsonl marker (and self-heals once the deps exist) if this fails.
    if (backend === 'agentdb') {
        const ready = installAgentdbLocally(opts.projectRoot);
        if (ready) {
            steps.push({ name: 'Install agentdb + better-sqlite3', status: 'done', detail: 'local deps for real vector writes' });
        }
        else {
            steps.push({
                name: 'Install agentdb + better-sqlite3',
                status: 'error',
                detail: 'install failed — hooks log to sessions.jsonl until you run: npm i agentdb better-sqlite3',
            });
        }
    }
    // Step 1: Create .dz directory
    if (!existsSync(dzDir)) {
        mkdirSync(dzDir, { recursive: true });
        steps.push({ name: 'Create .dz directory', status: 'done', detail: dzDir });
    }
    else {
        steps.push({ name: 'Create .dz directory', status: 'skipped', detail: 'already exists' });
    }
    // Step 2: Write .dz/config.json. FR-2: a DOWNGRADE (explicit --memory jsonl over an
    // agentdb-configured project) forces the write even without --force — "two truths after any
    // setup coincide" means the config may not keep claiming agentdb once the caller has explicitly
    // asked for jsonl.
    const configPath = join(dzDir, 'config.json');
    if (!existsSync(configPath) || opts.force) {
        writeFileSync(configPath, generateDzConfig(opts.target, opts.preset, backend));
        steps.push({ name: 'Write .dz/config.json', status: 'done', detail: `${backend} backend` });
    }
    else if (resolvedMemory.downgraded) {
        // Lead edit after Codex review (finding 3): a downgrade changes ONLY memory.backend — every other
        // field the owner keeps in .dz/config.json survives; an unparsable file falls back to regeneration.
        let rewritten = false;
        try {
            const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));
            const memory = (cfg['memory'] !== null && typeof cfg['memory'] === 'object') ? cfg['memory'] : {};
            cfg['memory'] = { ...memory, backend };
            writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
            rewritten = true;
        }
        catch { /* fall through to regeneration */ }
        if (!rewritten)
            writeFileSync(configPath, generateDzConfig(opts.target, opts.preset, backend));
        steps.push({ name: 'Write .dz/config.json', status: 'done', detail: `memory.backend → ${backend} (other fields kept)` });
    }
    else {
        steps.push({ name: 'Write .dz/config.json', status: 'skipped', detail: 'already exists (use --force)' });
    }
    if (resolvedMemory.downgraded) {
        steps.push({
            name: 'Memory backend downgrade',
            status: 'done',
            detail: '⚠ memory backend downgraded agentdb → jsonl by --memory jsonl',
        });
    }
    // Step 3: Initialize session log
    const sessionsPath = join(dzDir, 'sessions.jsonl');
    if (!existsSync(sessionsPath)) {
        writeFileSync(sessionsPath, '');
        steps.push({ name: 'Initialize sessions.jsonl', status: 'done', detail: 'session tracking ready' });
    }
    else {
        steps.push({ name: 'Initialize sessions.jsonl', status: 'skipped', detail: 'already exists' });
    }
    // Step 4: Initialize memory store
    if (backend === 'agentdb') {
        // Write the session-hook writer. The agentdb.db store itself is auto-created on first write
        // by createDatabase() (both the writer and the MCP server init the schema), so there is no
        // orphan placeholder file — the writer targets the real, shared native store.
        const writerPath = join(dzDir, 'agentdb-writer.mjs');
        // Regenerate when missing, forced, OR the deployed stamp is older than the current
        // generator — deployed writers must not fossilize outside the package lifecycle (gap G4).
        const deployedVersion = existsSync(writerPath) ? writerVersionOf(readFileSync(writerPath, 'utf-8')) : -1;
        if (deployedVersion === -1 || opts.force || deployedVersion < AGENTDB_WRITER_VERSION) {
            writeFileSync(writerPath, generateAgentdbWriter(opts.projectRoot));
            steps.push({
                name: 'Write agentdb-writer.mjs',
                status: 'done',
                detail: deployedVersion > -1 && deployedVersion < AGENTDB_WRITER_VERSION
                    ? `upgraded v${deployedVersion} → v${AGENTDB_WRITER_VERSION}`
                    : `session telemetry writer v${AGENTDB_WRITER_VERSION}`,
            });
        }
        else {
            steps.push({ name: 'Write agentdb-writer.mjs', status: 'skipped', detail: `current (v${deployedVersion})` });
        }
        // Keep the jsonl fallback log available for the writer's degraded path.
        const sessionsPath = join(dzDir, 'sessions.jsonl');
        if (!existsSync(sessionsPath))
            writeFileSync(sessionsPath, '');
    }
    else {
        // JSONL backend
        const sessionsPath = join(dzDir, 'sessions.jsonl');
        if (!existsSync(sessionsPath)) {
            writeFileSync(sessionsPath, '');
            steps.push({ name: 'Initialize sessions.jsonl', status: 'done', detail: 'session tracking ready' });
        }
        else {
            steps.push({ name: 'Initialize sessions.jsonl', status: 'skipped', detail: 'already exists' });
        }
        const patternsPath = join(dzDir, 'patterns.jsonl');
        if (!existsSync(patternsPath)) {
            writeFileSync(patternsPath, '');
            steps.push({ name: 'Initialize patterns.jsonl', status: 'done', detail: 'pattern learning ready' });
        }
        else {
            steps.push({ name: 'Initialize patterns.jsonl', status: 'skipped', detail: 'already exists' });
        }
    }
    // Step 4.6: Install apply-leg — the WORK happens here (before "Configure hooks" writes
    // SessionStart), so a foreign SessionStart entry is already in place before that step's own
    // merge ever sees it; see `applyLegStepResult`'s doc for why order matters. The STEP is reported
    // further down, after "Configure hooks" pushes its own, so the printed order still reads as
    // "collect → rank → apply".
    const applyLegStep = applyLegStepResult(opts, backend);
    // Step 5: Configure hooks (write to .claude/settings.json) — EVENT-LEVEL merge (gap G2):
    // dz-generated entries (recognized by signature, incl. the broken legacy `agentdb add` hooks
    // this feature fixes) are replaced in place WITHOUT --force; the user's own hooks and every
    // other settings key are preserved. Full-file overwrite happens only when the file is absent.
    if (!opts.noHooks) {
        const settingsDir = join(opts.projectRoot, '.claude');
        const settingsPath = join(settingsDir, 'settings.json');
        // The BODY goes in first, and the ENTRY goes in only after a LIVE receipt that the body runs
        // and refuses. Written from the INSTALLED package, never copied out of our repository — a
        // consumer has no `packages/@dzhechkov/...` above their project.
        //
        // Round 4, P2: these two used to be independent. A failed write was recorded as an error and
        // the entry was merged anyway, so a consumer whose install failed got a `PreToolUse` entry
        // pointing at something that is not a runnable hook — and that breaks EVERY Bash call, not one.
        //
        // Round 5, P1: the write was also UNCONDITIONAL. Setup is additive everywhere else — the
        // settings merge keeps the user's own hooks, `.gitignore` is appended to, an existing skill is
        // skipped — and this path overwrote a well-known filename with no ownership check, so a
        // consumer's hand-authored `.claude/hooks/destructive-guard.cjs` was destroyed by a routine
        // run. A body we wrote carries a MARKER; a file without it is the consumer's, and only an
        // explicit `--force` may replace it, after a timestamped backup.
        const hookPath = join(opts.projectRoot, ...CLAUDE_DESTRUCTIVE_HOOK_RELPATH.split('/'));
        let installError = null;
        let preserved = null;
        let backupPath = null;
        // Unreadable (absent, or something that is not a file at all) is NOT a claim of ownership: it
        // falls through to the write, whose failure the round-4 receipt below already reports.
        let current = null;
        try {
            current = readFileSync(hookPath, 'utf-8');
        }
        catch {
            current = null;
        }
        const foreign = current !== null && !isDzManagedHookBody(current);
        if (foreign && opts.force !== true) {
            preserved =
                'файл на этом пути не наш (нет маркера dz) — ОСТАВЛЕН нетронутым и НЕ ЗАПУСКАЛСЯ; запись в settings.json на этот путь тоже не трогаем (ни своей не добавляем, ни вашу не снимаем); заменить: dz setup --force';
        }
        else {
            try {
                if (foreign && current !== null) {
                    // Same shape as the codex `hooks.json` backup: the original beside the original, stamped,
                    // so `--force` is recoverable rather than merely loud.
                    backupPath = `${hookPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
                    writeFileSync(backupPath, current);
                }
                mkdirSync(dirname(hookPath), { recursive: true });
                writeFileSync(hookPath, generateClaudeDestructiveHook(), { mode: 0o755 });
            }
            catch (err) {
                installError = String(err.message);
            }
        }
        const foreignBodyKept = preserved !== null;
        // The receipt SPAWNS the file, so it may only ever be taken on a body dz owns.
        //
        // Round 11, P1 SECURITY — correcting my own round-5 sentence, "the receipt is taken from the
        // file that IS there". Combined with round 6, which preserves a body dz does not own, that made
        // `dz setup` EXECUTE whatever a repository had committed at this path: clone a hostile repo,
        // run the documented setup command, and its `.claude/hooks/destructive-guard.cjs` ran — with
        // none of the host's hook-trust prompting in between. MEASURED: a foreign body writing a marker
        // file had written it by the time setup returned.
        //
        // So a preserved foreign body is NOT probed, NOT registered, and NOT run. `--force` is consent
        // to REPLACE it (our body is written above, before this line) — never consent to execute it.
        // The receipt is still taken whether or not the write threw, because a failed write over an
        // OLDER BODY OF OURS leaves something we may legitimately run.
        const receipt = foreignBodyKept
            ? { ok: false, detail: 'проба не проводилась — запускать чужой файл не наше право' }
            : probeInstalledGuard(hookPath);
        // Round 8, P2: ownership of the ENTRY follows ownership of the BODY, never the filename.
        //
        // Round 6 preserved a consumer's hook file; attribution of its registry entry stayed path-only,
        // so a routine run deleted the registration of the very file it had just decided not to touch —
        // their hook left on disk and switched off (MEASURED: their `PreToolUse` entry came back `[]`).
        // The reverse was just as wrong: a foreign body that happened to refuse made dz ADD an entry
        // for somebody else's file (MEASURED), taking responsibility for code it may neither read as
        // its own nor replace.
        //
        // So when a foreign body is kept, dz stands down from the whole event: it adds nothing, and
        // `isManaged` below stops claiming an entry that points at that path. Whether the foreign hook
        // refuses is not merely the consumer's business — it is a question dz no longer ASKS, because
        // asking meant running their file (round 11). All of it is said in one line rather than left
        // for them to find by diffing settings.json.
        const guardArmed = receipt.ok && !foreignBodyKept;
        // The receipt is taken from the file that IS at the path — ours, or the one we preserved. A
        // foreign hook that demonstrably refuses is registered on its own merits; a foreign hook that
        // does not refuse gets no entry, exactly like a failed install (round 4).
        const notes = [
            preserved === null ? '' : `${preserved}; `,
            backupPath === null ? '' : `прежний файл сохранён: ${basename(backupPath)}; `,
            installError === null ? '' : `${installError}; `,
        ].join('');
        steps.push(guardArmed
            ? { name: 'Install destructive guard', status: 'done', detail: `${notes}${CLAUDE_DESTRUCTIVE_HOOK_RELPATH} — ${receipt.detail}` }
            : {
                name: 'Install destructive guard',
                status: preserved === null ? 'error' : 'skipped',
                detail: `${notes}${receipt.detail} — запись в settings.json НЕ добавлена`,
            });
        const generated = JSON.parse(generateHooksConfig(opts.projectRoot, backend));
        // No working body ⇒ no entry, and the EVENT KEY STAYS — as an empty managed list when nothing
        // else of ours belongs there.
        //
        // CORRECTION OF RECORD (round 7, P1). The round-5 version DELETED the key and this comment
        // claimed the merge would then also drop a guard entry left by an earlier setup. That was
        // asserted without measuring and it is false: `mergeManagedHookEntries` iterates
        // `Object.keys(managed)`, so an event absent from the managed input is copied through
        // UNTOUCHED — a project whose guard used to be armed kept invoking it on every Bash call while
        // the report said the entry was not added. Handing the event an EMPTY list is what makes the
        // merge EXAMINE it: our entries are dropped by `isManaged`, the user's are preserved in order,
        // and nothing is appended. The round-5 test passed for the wrong reason — its project had no
        // pre-existing settings.json, so there was no stale entry for the claim to be wrong about.
        if (!guardArmed) {
            generated.hooks['PreToolUse'] = (generated.hooks['PreToolUse'] ?? []).filter((entry) => !entry.hooks.some((h) => isManagedClaudeDestructiveHookCommand(h.command)));
        }
        if (!existsSync(settingsPath)) {
            mkdirSync(settingsDir, { recursive: true });
            writeFileSync(settingsPath, JSON.stringify({ hooks: generated.hooks }, null, 2));
            steps.push({ name: 'Configure hooks', status: 'done', detail: `${backend} session hooks` });
        }
        else {
            try {
                const existing = JSON.parse(readFileSync(settingsPath, 'utf-8'));
                // ONE merge implementation, shared with the Codex target (AM-3 / G-E). Claude's exact
                // command attribution is passed in rather than reimplemented, so emitted bytes, report
                // tail text, and the no-write path stay on the shared merge contract (AM-37).
                const isManagedCommand = (cmd) => cmd.includes('agentdb add') ||
                    cmd.includes('agentdb-writer.mjs') ||
                    cmd.includes('sessions.jsonl') ||
                    // Ours ONLY while the body at that path is ours (round 8, P2). Without the
                    // path clause a second `dz setup` would append a duplicate guard entry instead of
                    // replacing the first; without the ownership clause it would delete the entry a
                    // consumer wrote for their own preserved hook.
                    (!foreignBodyKept && isManagedClaudeDestructiveHookCommand(cmd));
                const plan = mergeManagedHookEntries((existing['hooks'] ?? {}), generated.hooks, {
                    // Drop dz-generated entries (any vintage, either shape) — keep the user's own hooks
                    // untouched. Flat dz entries (≤0.3.43) are dropped too, migrating them to the valid
                    // matcher-group shape appended below.
                    isManaged: (entry) => commandsOf(entry).some(isManagedCommand),
                    isLegacy: (entry) => !Array.isArray(entry?.hooks) ||
                        commandsOf(entry).some((cmd) => cmd.includes('agentdb add')),
                    // Ownership is per HANDLER, not per matcher group. A user's handler may deliberately
                    // share the Bash group with dz's guard; replacing ours must retain their handler object
                    // and every surrounding group field byte-for-byte through JSON serialization.
                    retainForeign: (entry) => {
                        const grouped = entry;
                        if (!Array.isArray(grouped?.hooks))
                            return null;
                        const kept = grouped.hooks.filter((hook) => !isManagedCommand(String(hook?.command ?? '')));
                        return kept.length === 0
                            ? null
                            : { ...entry, hooks: kept };
                    },
                    reportLabel: backend,
                });
                if (plan.changed) {
                    existing['hooks'] = plan.hooks;
                    writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
                    steps.push({ name: 'Configure hooks', status: 'done', detail: plan.report });
                }
                else {
                    steps.push({ name: 'Configure hooks', status: 'skipped', detail: plan.report });
                }
            }
            catch {
                steps.push({ name: 'Configure hooks', status: 'error', detail: 'could not parse existing settings.json — fix it and re-run' });
            }
        }
    }
    else {
        steps.push({ name: 'Configure hooks', status: 'skipped', detail: '--no-hooks' });
    }
    // Step 5.6: Install apply-leg — report pushed AFTER "Configure hooks" below (for a report order
    // that reads naturally), but see `applyLegStepResult()` above `runSetup` for why the WRITE itself
    // happens BEFORE it.
    steps.push(applyLegStep);
    // Step 5.5: Register agentdb MCP through the SAME ownership-aware transaction used by `dz init`.
    // `.mcp.json` is the project-scope carrier Claude Code actually loads. A known historical dz
    // agentdb shape is adopted; an ambiguous hand-authored entry is preserved and named as an error.
    if (backend === 'agentdb') {
        const agentdbEntry = {
            command: 'npx',
            // Pin to the INSTALLED agentdb version (not @latest) so the MCP server and the hook
            // writer run the same alpha schema against one DB.
            args: [installedAgentdbSpec(opts.projectRoot), 'mcp', 'start'],
            // Pin the server to its OWN store — NEVER the writer's .dz/agentdb.db. Two engines on one
            // SQLite file (native better-sqlite3 + a silent sql.js fallback) whole-file-rewrite each
            // other: measured 2026-07-09, 5 of 20 samples zero bytes and 4 torn (ADR-001, 2026-08-26).
            env: { AGENTDB_PATH: agentdbMcpStorePath(opts.projectRoot) },
        };
        try {
            const applied = applyIntegrationFragments({
                projectRoot: opts.projectRoot,
                fragments: [{
                        component: 'mcp',
                        carrierPath: '.mcp.json',
                        scope: 'project',
                        format: 'json',
                        rootKey: 'mcpServers',
                        entries: { agentdb: agentdbEntry },
                    }],
            });
            if (applied.written.includes('.mcp.json')) {
                steps.push({
                    name: 'Register agentdb MCP',
                    status: 'done',
                    // No tool count: a hardcoded number is a lie waiting to age (the live server answered
                    // 35 while its own banner said 32 and the README said 41 — measured 2026-08-26).
                    detail: `.mcp.json: ${installedAgentdbSpec(opts.projectRoot)} → .dz/agentdb-mcp.db (own store; hooks keep .dz/agentdb.db)`,
                });
            }
            else {
                steps.push({ name: 'Register agentdb MCP', status: 'skipped', detail: 'already registered and current' });
            }
        }
        catch (error) {
            const reason = error instanceof IntegrationApplyError ? error.reasonCode : 'APPLY_FAILED';
            const detail = error instanceof Error ? error.message : String(error);
            steps.push({ name: 'Register agentdb MCP', status: 'error', detail: `${reason}: ${detail}` });
        }
        // Migrate off the legacy location: `.claude/mcp.json` is not loaded by Claude Code. If it
        // holds ONLY our old agentdb registration, remove the file; otherwise leave it and warn.
        const legacyPath = join(opts.projectRoot, '.claude', 'mcp.json');
        if (existsSync(legacyPath)) {
            try {
                const legacy = JSON.parse(readFileSync(legacyPath, 'utf-8'));
                const keys = Object.keys(legacy.mcpServers ?? {});
                if (keys.length === 1 && keys[0] === 'agentdb') {
                    rmSync(legacyPath);
                    steps.push({ name: 'Migrate legacy .claude/mcp.json', status: 'done', detail: 'removed (not loaded by Claude Code); registration now in .mcp.json' });
                }
                else {
                    steps.push({ name: 'Migrate legacy .claude/mcp.json', status: 'error', detail: 'contains other servers — Claude Code does NOT load this file; move them to .mcp.json' });
                }
            }
            catch {
                steps.push({ name: 'Migrate legacy .claude/mcp.json', status: 'error', detail: 'unparseable legacy file — Claude Code does not load it; review manually' });
            }
        }
    }
    // Step 5.9: agentdb wiring invariant check (audit code#3). Skip-branches across repeated runs
    // can leave inconsistent combinations (e.g. writer+MCP present but hooks still jsonl). Verify
    // the three-way invariant explicitly and surface a loud error step instead of silent "skipped"s.
    if (backend === 'agentdb' && !opts.noHooks) {
        const problems = [];
        if (!isAgentdbInstalledLocally(opts.projectRoot))
            problems.push('deps missing (npm i agentdb better-sqlite3)');
        try {
            const settings = JSON.parse(readFileSync(join(opts.projectRoot, '.claude', 'settings.json'), 'utf-8'));
            const refs = ['SessionStart', 'SessionEnd', 'PreCompact'].every((ev) => (settings.hooks?.[ev] ?? []).some((h) => commandsOf(h).some((cmd) => cmd.includes('agentdb-writer.mjs'))));
            if (!refs)
                problems.push('hooks do not invoke the writer (SessionStart/SessionEnd/PreCompact)');
        }
        catch {
            problems.push('settings.json unreadable');
        }
        try {
            const mcp = JSON.parse(readFileSync(join(opts.projectRoot, '.mcp.json'), 'utf-8'));
            // Separation is the REQUIRED state; a shared store is the error (inverted 2026-08-26).
            const sep = agentdbStoreSeparationProblem(opts.projectRoot, mcp.mcpServers?.['agentdb']?.env?.['AGENTDB_PATH']);
            if (sep)
                problems.push(sep);
        }
        catch {
            problems.push('.mcp.json unreadable');
        }
        steps.push(problems.length === 0
            ? { name: 'agentdb wiring', status: 'done', detail: 'hooks → writer → .dz/agentdb.db   ·   MCP → .dz/agentdb-mcp.db (separate stores, by design)' }
            : { name: 'agentdb wiring', status: 'error', detail: `INCOMPLETE: ${problems.join('; ')}` });
    }
    // Step 6: Update .gitignore. Append only the ENTRIES that are actually missing — a single
    // sentinel check (e.g. sessions.jsonl, present in both backends) would skip agentdb.db/-wal/-shm
    // on the documented jsonl→agentdb `--force` switch, leaking the binary store into git.
    const gitignorePath = join(opts.projectRoot, '.gitignore');
    const dzIgnoreLines = backend === 'agentdb'
        ? ['.dz/agentdb.db', '.dz/agentdb.db-wal', '.dz/agentdb.db-shm',
            '.dz/agentdb-mcp.db', '.dz/agentdb-mcp.db-wal', '.dz/agentdb-mcp.db-shm',
            '.dz/sessions.jsonl']
        : ['.dz/sessions.jsonl', '.dz/patterns.jsonl'];
    const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
    const missing = dzIgnoreLines.filter((line) => !existing.split(/\r?\n/).includes(line));
    if (missing.length > 0) {
        const prefix = existing === '' ? '' : (existing.endsWith('\n') ? '' : '\n');
        const block = `${prefix}\n# DZ Harness learning data\n${missing.join('\n')}\n`;
        writeFileSync(gitignorePath, existing + block);
        steps.push({
            name: existsSync(gitignorePath) && existing !== '' ? 'Update .gitignore' : 'Create .gitignore',
            status: 'done',
            detail: `added ${missing.join(', ')}`,
        });
    }
    else {
        steps.push({ name: 'Update .gitignore', status: 'skipped', detail: 'already ignoring .dz data' });
    }
    // Step 7: Install the CLI-driver skill + agent docs (--install-driver)
    if (opts.installDriver) {
        const detail = installDriverDocs(opts.projectRoot, opts.force ?? false);
        steps.push({ name: 'Install driver skill', status: 'done', detail });
    }
    return {
        steps,
        totalSteps: steps.length,
        completed: steps.filter((s) => s.status === 'done').length,
        skipped: steps.filter((s) => s.status === 'skipped').length,
        memoryBackend: resolvedMemory.backend,
        memoryBackendSource: resolvedMemory.source,
        memoryBackendDowngraded: resolvedMemory.downgraded,
    };
}
//# sourceMappingURL=setup.js.map