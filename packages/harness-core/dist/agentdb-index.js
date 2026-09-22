/**
 * Generic native AgentDB indexer — the reusable primitive behind Option C's learnings-mirror
 * AND the book-knowledge-digitizer's KB indexer (ADR-001 v2, `features/book-knowledge-digitizer`).
 *
 * Writes rows NATIVELY via the project's `better-sqlite3`, replicating `ReasoningBank`'s exact
 * schema (`reasoning_patterns` + `pattern_embeddings`, embed text `${taskType}: ${text}`) so the
 * `agentdb` MCP server's `agentdb_pattern_search` reads what we write. `agentdb` is used ONLY for
 * its `EmbeddingService` — never its `createDatabase` (hardwired to sql.js, whose whole-file save
 * corrupts concurrent native-WAL writers; QE P1). Best-effort: never throws, returns an honest
 * error string when the deps are absent.
 *
 * @packageDocumentation
 */
import { existsSync, mkdirSync, copyFileSync, realpathSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { openSqliteReadOnly } from '@dzhechkov/memory';
import { applyReadonlyPragmas } from './sqlite-read-helpers.js';
import { rotatePreReindexSnapshotsUnlocked } from './agentdb-snapshot-rotation.js';
import { snapshotSqliteDatabase, restoreSqliteSnapshot } from './agentdb-snapshot.js';
import { withAgentdbSnapshotLock, writeReindexMarker, clearReindexMarker, markReindexMarkerRecoveryRequired, reindexMarkerPath, msFromBackupPath } from './agentdb-reindex-marker.js';
import { NamedLockTimeoutError, withDirLockSync } from './named-lock.js';
// The backlog dedup embed form (PURE, zero-dep — no cycle): dz-backlog rows must be embedded in the
// SAME bounded form the dedup query uses, including through the reindex path.
import { BACKLOG_TASK_TYPE, dedupEmbedText } from './backlog-embed.js';
import { currentEmbedManifest, guardEmbedSpace, readEmbedManifest, resolveEmbedModel, writeEmbedManifest, } from './embedding-config.js';
/** Resolve the shared store path: explicit opt → AGENTDB_PATH env → `<project>/.dz/agentdb.db`. */
export function resolveAgentdbPath(projectRoot, dbPath) {
    if (dbPath !== undefined && dbPath !== '')
        return dbPath;
    const env = process.env['AGENTDB_PATH'];
    return env !== undefined && env !== '' ? env : join(projectRoot, '.dz', 'agentdb.db');
}
/** ReasoningBank's schema, verbatim — so the MCP server reads exactly what we insert. */
const REASONING_BANK_SCHEMA = `CREATE TABLE IF NOT EXISTS reasoning_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER DEFAULT (strftime('%s', 'now')),
  task_type TEXT NOT NULL,
  approach TEXT NOT NULL,
  success_rate REAL NOT NULL DEFAULT 0.0,
  uses INTEGER DEFAULT 0,
  avg_reward REAL DEFAULT 0.0,
  tags TEXT,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_patterns_task_type ON reasoning_patterns(task_type);
CREATE INDEX IF NOT EXISTS idx_patterns_success_rate ON reasoning_patterns(success_rate);
CREATE INDEX IF NOT EXISTS idx_patterns_uses ON reasoning_patterns(uses);
CREATE TABLE IF NOT EXISTS pattern_embeddings (
  pattern_id INTEGER PRIMARY KEY,
  embedding BLOB NOT NULL,
  FOREIGN KEY (pattern_id) REFERENCES reasoning_patterns(id) ON DELETE CASCADE
);`;
/**
 * Create (or verify) an EMPTY AgentDB-schema store at `resolveAgentdbPath(projectRoot, dbPath)`,
 * without indexing any rows (AM-4, feature `setup-installs-apply-leg`, dz-harness-hub issue #10
 * defect 4).
 *
 * WHY THIS EXISTS: before this, `.dz/agentdb.db` came into being only as a side effect of the
 * SessionEnd/PreCompact writer's first `dz consolidate` — so a project that had run
 * `dz setup --memory agentdb` but not yet completed one full session had `memory.backend=agentdb`
 * configured with NO database file at all, and any lesson taught in that window before the first
 * consolidate had nothing to mirror into (the apply leg's daemon reads THIS file — see
 * `dz-embed-daemon.mjs`). `dz setup`'s "Install apply-leg" step now calls this directly so the
 * store exists from the moment setup finishes, not from the moment a session happens to end.
 *
 * SYNCHRONOUS deliberately: `runSetup` is a synchronous function (a `child_process.execSync`
 * install already precedes every write it does), and creating an empty schema needs only
 * `better-sqlite3` — never the async `EmbeddingService` {@link indexPatternsToAgentdb} loads for a
 * real write. Reuses {@link REASONING_BANK_SCHEMA} verbatim — the ONE schema string every writer in
 * this module execs — so this path can never drift into declaring a second, competing schema.
 *
 * Best-effort, like every setup step: a project without `better-sqlite3` installed yet (or one
 * whose native binary is unusable) gets `{ok:false, error}` and setup reports it in the step detail
 * rather than throwing — the writer/daemon still self-heal on the next session either way.
 */
export function ensureAgentdbSchema(projectRoot, dbPath) {
    try {
        const req = createRequire(join(projectRoot, 'package.json'));
        const Database = req('better-sqlite3');
        const dbFile = resolveAgentdbPath(projectRoot, dbPath);
        mkdirSync(dirname(dbFile), { recursive: true });
        const db = new Database(dbFile);
        try {
            db.pragma('journal_mode = WAL');
            db.exec(REASONING_BANK_SCHEMA);
        }
        finally {
            db.close();
        }
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: `agentdb schema init failed: ${err instanceof Error ? err.message : String(err)}` };
    }
}
/** `<dbFile>.generation` — a sidecar counter next to the store itself, so it travels with any copy
 * of `.dz/agentdb.db` (backup, mirror sync) without a separate path to keep in sync. */
function generationFilePath(dbFile) {
    return `${dbFile}.generation`;
}
/** `<dbFile>.generation.recovered` (T2, `store-generation-residuals`, record `1d465496`) — the
 * corrupt-sidecar recovery floor's own memory, a SEPARATE file next to the counter (never a
 * module-level variable: two OS processes do not share one, and two processes are exactly what
 * race here). Substring `.generation` deliberately preserved so any future sidecar-enumeration
 * point that greps for the counter family (checked, none exists today — see Р-2 in
 * `features/store-generation-residuals/06_implementation_plan.md`) still finds this file. */
function recoveredMemoryFilePath(genFile) {
    return `${genFile}.recovered`;
}
/** AM-5 (fix-round): the ONLY shape {@link readStoreGeneration} trusts — one or more ASCII digits,
 * nothing else. `Number.parseInt` alone accepts a leading-numeric-with-trailing-junk string like
 * `"12junk"` as `12`; that reads a corrupt sidecar as a plausible generation instead of degrading to
 * the documented `0` compatibility floor. */
const STRICT_GENERATION = /^\d+$/;
/** Shared degrade-to-0 read for any sidecar holding a single non-negative decimal integer: garbage,
 * a missing file, or anything not matching {@link STRICT_GENERATION} reads as `0`, never throws.
 * Both {@link readStoreGeneration} (the counter itself) and T2's recovery memory
 * ({@link recoveredMemoryFilePath}) use this ONE primitive — the recovery memory must degrade
 * exactly like the counter it accompanies (T2 NFR-1), not by a second, possibly-diverging rule. */
function readNonNegativeIntFile(path) {
    try {
        const raw = readFileSync(path, 'utf8').trim();
        if (!STRICT_GENERATION.test(raw))
            return 0;
        const n = Number.parseInt(raw, 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    }
    catch {
        return 0;
    }
}
/**
 * FR-2/FR-3 (`store-generation-counter`): the store's write-generation counter, read back. A
 * missing file (a store that predates this feature, or one that has never been written through
 * {@link bumpStoreGeneration}) reads as `0` — the compatibility floor {@link getOrOpenEngine}'s
 * caller compares against, never an error. A corrupt/non-numeric file degrades the same way (best
 * effort — a bad counter must never crash a read path), never a throw. AM-5: the content must match
 * {@link STRICT_GENERATION} exactly — `Number.parseInt`'s leading-digits-only tolerance is NOT used
 * to decide validity, only to convert an already-validated string.
 */
export function readStoreGeneration(projectRoot, dbPath) {
    return readNonNegativeIntFile(generationFilePath(resolveAgentdbPath(projectRoot, dbPath)));
}
/**
 * FR-1 (`store-generation-counter`): monotonically advance the store's write-generation counter by
 * one (absent file ⇒ starts at 1), atomically (tmp + rename — the same durability discipline every
 * other sidecar file in this module uses; a reader can never observe a half-written counter) AND
 * under mutual exclusion (AM-2, fix-round after Codex review). A bare read→compute→rename with no
 * lock lets two concurrent writers both read the same current value and both publish `current+1` —
 * one bump is lost — or lets a DELAYED writer overwrite a later value with an earlier one (the
 * counter briefly goes backwards on disk). `withDirLockSync` (`named-lock.ts`, the repo's
 * advisory lock for a read-modify-write file store — `.claude/rules/cross-runtime-concurrency.md`)
 * serializes the critical section; the counter is RE-READ from disk *inside* the lock (never trusted
 * from before acquisition), so the sequence every process observes is strictly monotonic
 * (`agentdb-reindex-marker.ts`'s `withAgentdbSnapshotLock` is the precedent this mirrors — a lock
 * addressed by `dirname(dbFile)`, a pure function of the store's own directory, never of
 * `process.cwd()`).
 *
 * NEVER throws (FR-4): a write failure (read-only `.dz`, a full disk, a permissions error, an
 * unresolvable path, OR a lock that could not be acquired by its deadline) is reported honestly as
 * `{ok:false, error}` so the caller can log it — the store write it accompanies must stay successful
 * regardless, telemetry is never a gate. AM-4: {@link resolveAgentdbPath} itself now runs INSIDE this
 * function's outer `try` — an unresolvable path can no longer throw OUT of `bumpStoreGeneration`
 * either; "never throws" now covers the whole function, not just the file-write tail.
 *
 * T2 (`store-generation-residuals`, record `1d465496`): the corrupt-sidecar recovery floor below
 * used to be a bare `Date.now()` — NOT strictly monotonic on its own (two recoveries inside the same
 * millisecond publish the same value; a backward clock step can publish a SMALLER one than an
 * earlier recovery). It is now `max(now(), lastPublished + 1)`, where `lastPublished` is read from
 * {@link recoveredMemoryFilePath} — a file, not a module-level variable, because the two writers who
 * actually race here are two OS PROCESSES, which do not share process memory. `now` is an injectable
 * time source (default `Date.now`) — AC-3's only reason to exist: a real clock cannot be rolled back
 * from a test.
 *
 * Fix-round 1 (independent Codex review, gpt-5.6-sol — items 2/3/4/5/7), on top of T2:
 * - item 2: {@link recoveredMemoryFilePath} now holds the LAST **published** generation, not the
 *   last **recovered** one — it is written on EVERY successful bump, not only inside the
 *   corrupt-sidecar branch. Before this fix, a run of ordinary bumps after a recovery left the
 *   memory stale, so a LATER recovery under a rolled-back clock could float the counter below a
 *   generation an ordinary bump already published (HIGH #2 finding).
 * - item 3: the memory file is published BEFORE the counter file (was: counter first, memory
 *   "best-effort" after). A crash between the two writes now leaves the memory AHEAD of the counter
 *   — the SAFE direction: the next recovery floors too high rather than too low, so monotonicity
 *   survives a half-done bump (HIGH #3 finding).
 * - item 4: a memory-write failure (e.g. a directory sitting at its path) does NOT block the counter
 *   publish below it — invalidation is the load-bearing behaviour — but the degradation is reported
 *   on stderr via {@link reportBumpMemoryDegraded}, never swallowed. LIMITATION: while the memory
 *   sidecar stays unwritable, a future corrupt-sidecar recovery on this store floors only at the wall
 *   clock, same as pre-fix-round behaviour — not strictly above every ordinary bump published in the
 *   meantime (HIGH #4 finding).
 * - item 5: every error-to-string conversion in this function goes through {@link safeErrorMessage},
 *   which cannot itself throw even if `err` carries a poisoned `toString` — "never throws" is
 *   absolute (MEDIUM #5 finding).
 * - item 7: the memory sidecar's own tmp file is cleaned up on a failed write, matching the counter's
 *   existing tmp-cleanup discipline (LOW #7 finding).
 */
/** Codex round-2 (NEW HIGH): most mutators discard the bump result, so a failed bump must be
 * VISIBLE on its own — one stderr line, written by the helper itself. Telemetry never throws. */
function reportBumpFailure(error) {
    try {
        process.stderr.write(`dz: store generation not bumped — ${error}\n`);
    }
    catch { /* telemetry never throws */ }
    return { ok: false, error };
}
/** Fix-round 1, item 4: a bump whose COUNTER publish succeeded but whose recovery-memory sidecar
 * ({@link recoveredMemoryFilePath}) could not be written must not swallow that fact — same
 * stderr-report shape as {@link reportBumpFailure}, but this one never changes the return value:
 * the counter genuinely advanced, so `{ok:true, generation}` stands. LIMITATION (documented here per
 * the brief, item 4): until the memory sidecar is writable again, a FUTURE corrupt-sidecar recovery
 * on this store is not guaranteed to floor above every generation an ordinary bump already published
 * in the meantime (item 2's fix depends on the memory file being current) — it still floors above the
 * wall clock, same as before this fix-round. */
function reportBumpMemoryDegraded(reason) {
    try {
        process.stderr.write(`dz: store generation recovery memory not updated — ${reason} — a future corrupt-sidecar recovery on this store is not guaranteed to stay strictly monotonic until this is fixed\n`);
    }
    catch { /* telemetry never throws */ }
}
/** Fix-round 1, item 5: `String(err)` itself can throw if `err` carries a poisoned `toString` (or
 * `Error.prototype.message` getter). `bumpStoreGeneration`'s "never throws" contract (FR-4) is
 * ABSOLUTE, so every place in this function that turns a caught error into a string goes through
 * this ONE protected helper — never a bare `err instanceof Error ? err.message : String(err)`.
 * Exported test-only (same convention as {@link needsRescueBump}/{@link resetAgentdbEmbedderCache}).
 */
export function safeErrorMessage(err) {
    try {
        return err instanceof Error ? err.message : String(err);
    }
    catch {
        return '(unstringifiable error)';
    }
}
export function bumpStoreGeneration(projectRoot, dbPath, 
/** T2: the ONLY signature extension the plan permits — injectable wall clock, default `Date.now`,
 * so AC-3 (a rolled-back system clock) can be reproduced without touching the real clock. */
now = Date.now) {
    try {
        const dbFile = resolveAgentdbPath(projectRoot, dbPath);
        const genFile = generationFilePath(dbFile);
        // Fix-round 1, item 2: computed UNCONDITIONALLY (was: only inside the corrupt-sidecar branch) —
        // this sidecar now tracks "last PUBLISHED generation", updated on every successful bump, not just
        // a recovery.
        const recoveredMemoryFile = recoveredMemoryFilePath(genFile);
        return withDirLockSync(dirname(dbFile), 'store-generation', () => {
            // AM-2: re-read the CURRENT value from disk while holding the lock — a value observed before
            // acquisition may already be stale, another holder may have advanced it in the meantime.
            let current = readStoreGeneration(projectRoot, dbPath);
            const tmp = `${genFile}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const recTmp = `${recoveredMemoryFile}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            try {
                // Codex round-2 (AM-2 residual) / T2 (record `1d465496`): a sidecar that EXISTS but is
                // corrupt reads as 0 and would reset the counter to 1 — a value an engine-cache entry may
                // already be keyed on. Floor a corrupt value at max(wall-clock, lastPublished+1) instead:
                // still monotonic (ms-since-epoch exceeds any count reached by bumping) AND strictly
                // increasing across successive corrupt recoveries even inside the same millisecond or
                // across a backward clock step — the bare `Date.now()` this replaces was neither. Absent
                // file (not corrupt, simply missing) still takes the ordinary `current === 0` path below,
                // unaffected — only a genuinely corrupt EXISTING sidecar enters this branch.
                if (current === 0 && existsSync(genFile)) {
                    const raw = readFileSync(genFile, 'utf8').trim();
                    if (raw !== '0' && !STRICT_GENERATION.test(raw)) {
                        // NFR-1: a memory file that cannot be read (missing, or itself corrupt) degrades to 0,
                        // exactly like the counter's own read — never a throw, never a special-cased error.
                        // Fix-round 1, item 2: `lastPublished` now reflects every prior successful bump
                        // (ordinary or recovery), not only the previous recovery — see the doc comment above.
                        const lastPublished = readNonNegativeIntFile(recoveredMemoryFile);
                        current = Math.max(now(), lastPublished + 1);
                    }
                }
                const next = current + 1;
                mkdirSync(dirname(genFile), { recursive: true });
                // Fix-round 1, item 3: the memory sidecar is published BEFORE the counter sidecar — a crash
                // between the two then leaves the memory AHEAD of the counter (safe: the next recovery
                // floors too high, never too low). Fix-round 1, item 2: this now runs on EVERY successful
                // bump, not only inside the corrupt-sidecar branch above.
                let memoryError;
                try {
                    writeFileSync(recTmp, String(next), { encoding: 'utf8', flag: 'wx' });
                    renameSync(recTmp, recoveredMemoryFile);
                }
                catch (memErr) {
                    // Fix-round 1, item 4: the counter publish below still goes ahead — invalidation matters
                    // more than the memory sidecar — but the degradation is reported, not swallowed (see the
                    // stderr write after the counter publish). Fix-round 1, item 7: clean up a half-written
                    // memory tmp file the same way the counter's own tmp is cleaned up on failure below.
                    try {
                        if (existsSync(recTmp))
                            unlinkSync(recTmp);
                    }
                    catch { /* best-effort only */ }
                    memoryError = safeErrorMessage(memErr);
                }
                writeFileSync(tmp, String(next), { encoding: 'utf8', flag: 'wx' });
                renameSync(tmp, genFile);
                // Fix-round 1, item 4: reported AFTER the counter publish succeeds, so the stderr line
                // never implies the bump itself failed — it names exactly the narrower, degraded guarantee.
                if (memoryError !== undefined)
                    reportBumpMemoryDegraded(memoryError);
                return { ok: true, generation: next };
            }
            catch (err) {
                // Best-effort cleanup of a half-written temp file (e.g. rename failed after a successful
                // write) so it never lingers as clutter — never lets a cleanup failure mask the real error.
                try {
                    if (existsSync(tmp))
                        unlinkSync(tmp);
                }
                catch { /* best-effort only */ }
                try {
                    if (existsSync(recTmp))
                        unlinkSync(recTmp);
                }
                catch { /* best-effort only */ } // item 7
                return reportBumpFailure(`store generation bump failed: ${safeErrorMessage(err)}`);
            }
        });
    }
    catch (err) {
        // AM-2/FR-4: a lock that could not be acquired by its deadline (`NamedLockTimeoutError`) — and
        // any other failure reaching this point (an unresolvable path, AM-4) — degrades to the same
        // honest `{ok:false, error}` shape; it never throws into the store write it accompanies.
        return reportBumpFailure(`store generation bump failed: ${safeErrorMessage(err)}`);
    }
}
/**
 * Index `rows` into the shared AgentDB vector store. Returns `{indexed:0}` for an empty input and
 * `{indexed:0, error}` when `agentdb`/`better-sqlite3` cannot be resolved from the project.
 */
export async function indexPatternsToAgentdb(projectRoot, rows, opts = {}) {
    if (rows.length === 0)
        return { indexed: 0 };
    let sqliteUrl;
    try {
        const req = createRequire(join(projectRoot, 'package.json'));
        sqliteUrl = pathToFileURL(req.resolve('better-sqlite3')).href;
    }
    catch {
        return { indexed: 0, error: 'agentdb/better-sqlite3 not installed in project (run: dz setup --memory agentdb)' };
    }
    try {
        const { default: Database } = (await import(sqliteUrl));
        const model = resolveEmbedModel(projectRoot);
        if ('error' in model)
            return { indexed: 0, error: model.error };
        const dbFile = resolveAgentdbPath(projectRoot, opts.dbPath);
        // D1 (embed-daemon-memory, ADR-001): a single embedder per process — the SAME cached pipeline
        // `resolveAgentdbEmbedder` hands to search/the daemon, never a private `new EmbeddingService(...)`
        // built here. `dbFile` (not just `projectRoot`) so an EXISTING store's dtype (manifest, D2) wins
        // over the config for an ordinary incremental index — only `reindexAgentdbRows` re-stamps the
        // manifest first and thereby moves the dtype (see resolveStoreEmbedDtype's own doc comment).
        const emb = await resolveAgentdbEmbedder(projectRoot, dbFile);
        if ('error' in emb)
            return { indexed: 0, error: emb.error };
        const db = new Database(dbFile);
        try {
            db.pragma('journal_mode = WAL');
            db.pragma('busy_timeout = 5000'); // wait out a brief MCP-server write lock instead of failing
            db.exec(REASONING_BANK_SCHEMA);
            const guard = guardEmbedSpace({
                storePath: dbFile,
                configured: model,
                hasRows: embeddingRowCount(db) > 0,
                reindexHint: 'dz vector reindex',
            });
            if (!guard.ok)
                return { indexed: 0, error: guard.error };
            const insPattern = db.prepare('INSERT INTO reasoning_patterns (task_type, approach, success_rate, uses, avg_reward, tags, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)');
            const insEmb = db.prepare('INSERT OR REPLACE INTO pattern_embeddings (pattern_id, embedding) VALUES (?, ?)');
            // Embeddings are async (can't run inside better-sqlite3's sync transaction) — compute them
            // ALL first, then commit the writes atomically (QE P2: a mid-loop failure must not leave a
            // partial batch reported as indexed:0).
            const prepared = [];
            // dz-backlog rows use the BOUNDED dedup embed form (backlog-embed.ts) — the same form the
            // dedup query and `mirrorIdeaVector` use, so a `dz vector reindex` lands backlog rows in the
            // space they are queried in. Every other task type keeps the classic `${taskType}: ${text}`.
            for (const row of rows) {
                const embedText = row.taskType === BACKLOG_TASK_TYPE ? dedupEmbedText(row.text) : `${row.taskType}: ${row.text}`;
                prepared.push({ row, vec: await emb.embed(embedText) });
            }
            const commit = db.transaction(() => {
                for (const { row, vec } of prepared) {
                    const r = insPattern.run(row.taskType, row.text, Math.max(0, Math.min(1, Number.isFinite(row.score) ? row.score : 0)), Number.isFinite(row.uses) ? Math.max(0, Math.floor(row.uses ?? 0)) : 0, Number.isFinite(row.avgReward) ? Math.max(0, Math.min(1, row.avgReward ?? 0)) : 0.0, row.tags ? JSON.stringify(row.tags) : null, row.metadata ? JSON.stringify(row.metadata) : null);
                    insEmb.run(Number(r.lastInsertRowid), Buffer.from(vec.buffer));
                }
                return prepared.length;
            });
            const indexed = commit();
            // AM-3 (fix-round): bump the generation IMMEDIATELY after the commit — BEFORE
            // `writeEmbedManifest` — not after it. The store already changed on disk the instant `commit()`
            // returned; if the manifest write throws (a jammed manifest path, a full disk), the OLD order
            // left the DB changed with no generation ever published — a stale-cache read would then serve
            // an engine that never saw this write, with no signal anywhere that anything went wrong. Moving
            // the bump here makes "the store changed" and "the generation reflects it" atomic in effect:
            // whichever of the two calls below throws, the generation is already correct for the rows that
            // are already on disk.
            const bump = bumpStoreGeneration(projectRoot, opts.dbPath);
            // Fix-round 1 (CRITICAL, item 1a): `writeEmbedManifest` can throw (a directory sitting at the
            // manifest sidecar path — see the AM-3 test). Before this fix, that throw escaped to the outer
            // `catch` below, which returned the GENERIC `{indexed: 0, error: ...}` — discarding the two
            // facts already true by this point: `indexed` rows are on disk, and `bump` already ran. A
            // caller reading `indexed === 0` would conclude "nothing happened" and skip its own rescue-bump
            // logic even though the store had genuinely changed — the under-bump C-1 forbids. Catching the
            // throw HERE, with the real `indexed`/bump outcome already captured in scope, preserves both.
            try {
                writeEmbedManifest(dbFile, currentEmbedManifest(model, guard.manifest.version, 'agentdb'));
            }
            catch (manifestErr) {
                const manifestError = `index failed: ${safeErrorMessage(manifestErr)}`;
                return bump.ok
                    ? { indexed, generationBumped: true, error: manifestError }
                    : { indexed, generationBumped: false, generationReason: bump.error, error: manifestError };
            }
            return bump.ok
                ? { indexed, generationBumped: true }
                : { indexed, generationBumped: false, generationReason: bump.error };
        }
        finally {
            db.close();
        }
    }
    catch (err) {
        return { indexed: 0, error: `index failed: ${safeErrorMessage(err)}` };
    }
}
/* ------------------------------------------------------------------ */
/*  READ half (dz-rvf-vector-bridge FR-3): semantic search + id scan   */
/* ------------------------------------------------------------------ */
/**
 * The RECALL/search default task_types. Deliberately EXCLUDES `dz-backlog`: `dz recall` (and
 * feature-adr Step-0) must never surface raw backlog ideas as if they were earned lessons (ADR-005).
 */
/**
 * The PATTERN scope — the task types a learned-pattern count covers. Exported so `dz vector status`
 * can report a mirrored count comparable to its lexical one; the lifecycle superset below is for
 * ownership, and reporting IT beside a pattern count once led a reader to conclude half the index
 * was orphaned when none of it was.
 */
export const DZ_PATTERN_TASK_TYPES = ['dz-teach', 'dz-learning'];
const DZ_TASK_TYPES = DZ_PATTERN_TASK_TYPES;
/**
 * The dz-owned task_types for LIFECYCLE scans (id enumeration + reindex ownership) — a SUPERSET of
 * the recall default that ALSO owns `dz-backlog` (smart-backlog, ADR-001/005). Reindex must re-embed
 * these on a model bump (else backlog rows rot in a stale embedding space), and id-scans must see them
 * (mirror idempotency). Kept SEPARATE from {@link DZ_TASK_TYPES} so ownership never leaks ideas into
 * lesson recall: search defaults to DZ_TASK_TYPES, lifecycle to DZ_OWNED_TASK_TYPES.
 */
export const DZ_OWNED_TASK_TYPES = ['dz-teach', 'dz-learning', 'dz-backlog'];
const DEPS_MISSING = 'agentdb/better-sqlite3 not installed in project (run: dz setup --memory agentdb)';
/**
 * `agentdb-embedder-cache` (feature): the transformers pipeline behind `EmbeddingService` is
 * expensive to stand up (MEASURED 2026-09-14: 2-3.6s per `resolveAgentdbEmbedder` call — see
 * `features/agentdb-embedder-cache/00_complexity_assessment.md`), yet the resolved model/dim never
 * changes within one process. Keyed by `${agentdbDir}|${model}|${dim}` so a config/env change (a
 * different `resolveEmbedModel` source) gets its own entry (FR-2) rather than reusing a stale
 * pipeline. The PROMISE is cached, not the awaited result (FR-4): concurrent first callers for the
 * same key join the same in-flight initialization instead of racing two pipelines. An `{error}`
 * outcome (or a rejection) evicts its own entry so the next call retries cleanly (FR-3) — a failure
 * must never "stick".
 */
const embedderCache = new Map();
let embedderCacheInitializations = 0;
/**
 * Fix round 1 (F6, Codex #6): `embedderCacheInitializations` only counts calls to
 * {@link resolveAgentdbEmbedder} that missed the cache — it proves cache REUSE, not that a real
 * pipeline was actually constructed. This counter increments at the exact two call sites where a
 * pipeline construction primitive actually runs: the direct `pipeline('feature-extraction', …)` call
 * in {@link initAgentdbEmbedder} and `EmbeddingService.initialize()` in
 * {@link initViaAgentdbEmbeddingService} (the COMPAT FALLBACK path) — never merely on entry to
 * `initAgentdbEmbedder`, which can also return an `{error}` (dtype:'q8' with no resolvable
 * transformers, NFR-4) without ever attempting either.
 */
let embedderCachePipelinesBuilt = 0;
/** Test-only (and future warm-start) reset — callers (`vector-tier.ts`, `backlog.ts`) are unaffected. */
export function resetAgentdbEmbedderCache() {
    embedderCache.clear();
    embedderCacheInitializations = 0;
    embedderCachePipelinesBuilt = 0;
}
/** `entries` = cached keys right now — a SUCCESSFUL pipeline or an IN-FLIGHT initialization (the promise is
 * cached before it settles, FR-4; a failed one is evicted, FR-3); `initializations` = pipelines actually
 * started since the last reset. (Codex round-1, 2026-09-14: the earlier wording said "successful" only.)
 * `pipelinesBuilt` (fix round 1, F6) = the count of REAL pipeline-construction primitives that actually
 * ran (`pipeline()` or `EmbeddingService.initialize()`), never merely the number of times the resolver
 * was entered — see {@link embedderCachePipelinesBuilt}'s own doc comment for why the two can diverge. */
export function getAgentdbEmbedderCacheStats() {
    return { entries: embedderCache.size, initializations: embedderCacheInitializations, pipelinesBuilt: embedderCachePipelinesBuilt };
}
/**
 * Walk UP from `startDir` (inclusive) looking for `<dir>/node_modules/<name>` as a real, existing
 * path — a PLAIN FILESYSTEM CHECK, deliberately never `require.resolve()` alone. MEASURED
 * 2026-09-16: under this package's own vitest harness, `createRequire(join(projectRoot,
 * 'package.json')).resolve('@huggingface/transformers')` succeeds even for a deliberately isolated
 * `/tmp` fixture that installs no such dependency at all (`agentdb-embedder-cache.test.ts`'s AC-3) —
 * the test runner's module loader resolves more liberally than plain Node does, reaching the
 * monorepo's real install regardless of `projectRoot`. `require.resolve` is used only AFTER this
 * filesystem walk has already named a legitimate ancestor, so it can no longer be fooled that way.
 * Returns the ancestor directory whose OWN `node_modules/<name>` exists, or `undefined` if none does
 * all the way to the filesystem root (a handful of synchronous `existsSync` calls either way).
 */
function findAncestorWithModule(startDir, name) {
    let dir = resolve(startDir);
    for (;;) {
        if (existsSync(join(dir, 'node_modules', name)))
            return dir;
        const parent = dirname(dir);
        if (parent === dir)
            return undefined;
        dir = parent;
    }
}
/**
 * C-3 (`embed-daemon-memory`): the SAME resolution order the daemon's own `resolveDeps` uses
 * (`.claude/helpers/dz-embed-daemon.mjs`) — project `package.json` first, then `agentdb`'s own
 * declared dependency (possibly hoisted elsewhere) — so core and the daemon agree on which install
 * of transformers they find, in a monorepo or a plain install alike. Each candidate root is
 * confirmed by {@link findAncestorWithModule} BEFORE `require.resolve` is trusted (see its own doc
 * comment for why the plain try/catch this replaced was not safe under this package's test runner).
 *
 * Exported (fix round 1, F4, same convention as {@link safeErrorMessage}/{@link resetAgentdbEmbedderCache}):
 * `embedder-single-owner.test.ts`'s live-dep skip gate needs the SAME resolution order the production
 * code uses to decide, BEFORE running, whether a live embedder failure is a dependency gap (named skip)
 * or a real defect (must fail) — a text-matching heuristic on the error message cannot tell those apart.
 */
export function resolveTransformersModule(projectRoot) {
    const candidates = ['@huggingface/transformers', '@xenova/transformers'];
    for (const name of candidates) {
        const ancestor = findAncestorWithModule(projectRoot, name);
        if (ancestor === undefined)
            continue;
        try {
            return { url: pathToFileURL(createRequire(join(ancestor, 'package.json')).resolve(name)).href };
        }
        catch {
            /* an ancestor that named the directory but whose require still can't resolve it (e.g. a
               broken symlink) — try the next candidate */
        }
    }
    let agentdbDir;
    try {
        agentdbDir = dirname(createRequire(join(projectRoot, 'package.json')).resolve('agentdb'));
    }
    catch {
        return { error: DEPS_MISSING };
    }
    for (const name of candidates) {
        const ancestor = findAncestorWithModule(agentdbDir, name);
        if (ancestor === undefined)
            continue;
        try {
            return { url: pathToFileURL(createRequire(join(ancestor, 'package.json')).resolve(name)).href };
        }
        catch {
            /* try the next candidate */
        }
    }
    return { error: DEPS_MISSING };
}
/**
 * D1 (ADR-001): builds the `transformers` pipeline DIRECTLY — the exact call agentdb's own
 * `EmbeddingService.embed` makes for a symmetric model (`pipeline(text, { pooling:'mean',
 * normalize:true })`, `EmbeddingService.js:205`), never through agentdb's wrapper class. This is
 * the ONLY way to request `dtype:'q8'` at pipeline construction (D2) — `EmbeddingService.initialize`
 * hardcodes `transformers.pipeline('feature-extraction', model)` with no dtype option at all, so a
 * quantized store is unreachable through it at any dtype but fp32.
 *
 * COMPAT FALLBACK (deviation from the ADR's literal "иначе ядро отдаёт {error} как сегодня" —
 * documented in `features/embed-daemon-memory/07_code_changes/change_manifest.md`): when
 * `@huggingface/transformers`/`@xenova/transformers` cannot be resolved directly AND the requested
 * dtype is the default `fp32`, this falls back to agentdb's `EmbeddingService` exactly as this
 * function's pre-T2 body did. Measured (2026-09-16): seven OTHER features' test files
 * (`agentdb-index.test.ts`, `agentdb-snapshot-{consistency,lock,rotation}.test.ts`, `brain.test.ts`,
 * `quarantine-mirror-projection.test.ts`, `store-generation.test.ts`, `vector-tier{,​-rvf}.test.ts`)
 * fake ONLY `agentdb/controllers/EmbeddingService.js` for their offline fixtures, never a
 * `@huggingface/transformers`/`@xenova/transformers` stub — a literal "no fallback" implementation
 * reddens all of them (out of scope here: `.claude/rules/cross-runtime-concurrency.md` and this
 * feature's own hard rule both forbid touching another feature's files). `dtype:'q8'` NEVER falls
 * back (NFR-4) — an unresolvable transformers module with `dtype:'q8'` requested is a hard `{error}`
 * naming the model and dtype, exactly as the ADR specifies; only the fp32 path is widened.
 */
async function initAgentdbEmbedder(projectRoot, agentdbDir, model, dim, dtype) {
    const transformers = resolveTransformersModule(projectRoot);
    if (!('error' in transformers)) {
        try {
            const { pipeline } = (await import(transformers.url));
            const extractor = await pipeline('feature-extraction', model, dtype === 'q8' ? { dtype: 'q8' } : {});
            embedderCachePipelinesBuilt += 1; // F6: the real primitive ran and returned a usable extractor
            return { embed: async (t) => Float32Array.from((await extractor(t, { pooling: 'mean', normalize: true })).data) };
        }
        catch (err) {
            return { error: `embedder init failed (model ${model}, dtype ${dtype}): ${err instanceof Error ? err.message : String(err)}` };
        }
    }
    if (dtype === 'q8') {
        // NFR-4: a quantized store must never silently downgrade to fp32 for lack of a transformers
        // install — the caller needs to know exactly why q8 is unreachable here.
        return { error: `embedder init failed (model ${model}, dtype ${dtype}): ${transformers.error}` };
    }
    return initViaAgentdbEmbeddingService(agentdbDir, model, dim);
}
/** The pre-T2 implementation, preserved verbatim as the fp32-only COMPAT FALLBACK documented on
 * {@link initAgentdbEmbedder} above. */
async function initViaAgentdbEmbeddingService(agentdbDir, model, dim) {
    try {
        const { EmbeddingService } = (await import(pathToFileURL(join(agentdbDir, 'controllers', 'EmbeddingService.js')).href));
        const emb = new EmbeddingService({
            model,
            dimension: dim,
            provider: 'transformers',
            // agentdb >= 3.0.0-alpha.20 refuses UNREGISTERED models without an explicit role policy
            // (its built-in registry knows all-MiniLM-L6-v2 but not our multilingual variant — grounded
            // in dist/src/controllers/EmbeddingService.js:53). paraphrase-multilingual-MiniLM is a
            // SYMMETRIC sentence-transformer (no query/passage instruction prefixes), so the policy is
            // {kind:'symmetric'} — the same one the registry assigns its own symmetric models. On
            // alpha.18 the extra field is ignored; without it alpha.20 threw and the vector tier fell
            // to lexical SILENTLY (mirror writes answered {indexed:0, error} — measured 2026-08-24).
            rolePolicy: { kind: 'symmetric' },
        });
        await emb.initialize();
        embedderCachePipelinesBuilt += 1; // F6: the COMPAT FALLBACK's own primitive ran
        return { embed: (t) => emb.embed(t) };
    }
    catch (err) {
        return { error: `embedder init failed: ${err instanceof Error ? err.message : String(err)}` };
    }
}
/**
 * D2 (`embed-daemon-memory`): the dtype a QUERY/write is embedded with is the STORE's own dtype
 * (its manifest) when the store already exists, falling back to the CONFIGURED dtype only for a
 * store that does not exist yet (its first-ever write picks up the config). This is the ONE place
 * that decision is made — {@link resolveAgentdbEmbedder} calls it so every caller (search, an
 * ordinary incremental index) agrees; `reindexAgentdbRows` is the sole exception (T2/plan): it
 * stamps the manifest with the NEW configured dtype BEFORE it re-embeds, so by the time this
 * function runs during a reindex the manifest already names the new dtype — config and manifest
 * necessarily agree at that point, which is what makes reindex "the one place dtype changes".
 */
export function resolveStoreEmbedDtype(projectRoot, dbPath) {
    const configured = resolveEmbedModel(projectRoot);
    if ('error' in configured)
        return { error: configured.error };
    const manifest = readEmbedManifest(resolveAgentdbPath(projectRoot, dbPath));
    // Fix round 1 (Codex #4): a manifest dtype that is PRESENT but unrecognized must refuse, not fall
    // through to the configured default — the same discipline guardEmbedSpace applies, needed here too
    // because THIS is what resolveAgentdbEmbedder actually keys its cache and pipeline construction on.
    if (manifest?.readError !== undefined) {
        return { error: `embedding manifest unreadable (${manifest.readError}); run dz vector reindex` };
    }
    if (manifest?.dtypeError !== undefined) {
        return { error: `unknown embedding dtype "${manifest.dtypeError}" in manifest; run dz vector reindex` };
    }
    return manifest?.dtype ?? configured.dtype;
}
/**
 * Resolve the shared embedder from the PROJECT (same dynamic-resolution discipline as
 * {@link indexPatternsToAgentdb}); every dz call site uses the same resolved model/dtype so query
 * and row vectors stay in the same space. Cached per process — see {@link embedderCache} above.
 *
 * Fix round 1 (F1, doc correction — the prior wording was misleading): `dbPath` is passed straight
 * to {@link resolveStoreEmbedDtype}, which calls {@link resolveAgentdbPath}`(projectRoot, dbPath)` —
 * and THAT function already returns the project's DEFAULT store path (`<project>/.dz/agentdb.db`,
 * or `AGENTDB_PATH`) when `dbPath` is omitted, not "no path". So an omitted `dbPath` still reads the
 * default store's OWN manifest when one exists; the CONFIGURED dtype is used only as the fallback
 * for a store that has no manifest yet (i.e. does not exist, or predates this feature) — never as
 * the default behaviour for "no dbPath given".
 */
export async function resolveAgentdbEmbedder(projectRoot, dbPath) {
    let agentdbDir;
    try {
        const req = createRequire(join(projectRoot, 'package.json'));
        agentdbDir = dirname(req.resolve('agentdb'));
    }
    catch {
        return { error: DEPS_MISSING };
    }
    const model = resolveEmbedModel(projectRoot);
    if ('error' in model)
        return { error: model.error };
    const dtype = resolveStoreEmbedDtype(projectRoot, dbPath);
    if (typeof dtype === 'object' && 'error' in dtype)
        return { error: dtype.error };
    const key = `${agentdbDir}|${model.model}|${model.dim}|${dtype}`;
    const hit = embedderCache.get(key);
    if (hit !== undefined)
        return hit;
    embedderCacheInitializations += 1;
    const promise = initAgentdbEmbedder(projectRoot, agentdbDir, model.model, model.dim, dtype);
    embedderCache.set(key, promise);
    // FR-3: an init failure must not stick — evict so the next call retries instead of replaying
    // the same {error} forever. `.catch` here only guards a rejection that slips past
    // `initAgentdbEmbedder`'s own try/catch; it never rethrows (this is bookkeeping, not the return path).
    void promise.then((result) => {
        if ('error' in result && embedderCache.get(key) === promise)
            embedderCache.delete(key);
    }, () => {
        if (embedderCache.get(key) === promise)
            embedderCache.delete(key);
    });
    return promise;
}
/** `absent: true` = no store file yet — an EMPTY mirror is a state, not an error (backfill relies on this). */
function openReadonly(projectRoot, dbPath) {
    const dbFile = resolveAgentdbPath(projectRoot, dbPath);
    if (!existsSync(dbFile))
        return { absent: true };
    let Database;
    try {
        const req = createRequire(join(projectRoot, 'package.json'));
        Database = req('better-sqlite3');
    }
    catch {
        return { error: DEPS_MISSING };
    }
    try {
        // ADR-001: `{ readonly: true }` alone still fails `unable to open database file` on a
        // directory that cannot create `-wal`/`-shm` — the ladder in `openSqliteReadOnly` falls
        // back to a tmp copy instead, so this "best-effort, never throws" contract keeps working
        // from a read-only-mounted sandbox too. `close()` on the returned handle removes the copy.
        const handle = openSqliteReadOnly(dbFile, { Database });
        const db = handle.db;
        // FR-1 (readonly-residuals): a throwing pragma must not leak the connection or a tmp-copy —
        // applyReadonlyPragmas closes + cleans up before rethrowing.
        applyReadonlyPragmas(handle, dbFile);
        return {
            // `ReadonlyDb` (above) intentionally exposes only `pragma`/`prepare`/`close` — the real
            // better-sqlite3 instance underneath also has `transaction`/`exec`/etc, but no caller in
            // this file uses them (confirmed, fix round 1, Q4/#8), so they stay hidden by the type on
            // purpose. Widening `ReadonlyDb` to add a method should be a deliberate decision, not an
            // incidental leak through `db as ReadonlyDb` above.
            db: {
                pragma: db.pragma.bind(db),
                prepare: db.prepare.bind(db),
                close: () => {
                    // `cleanup()` in `finally` — the tmp-copy must be removed even if `db.close()` throws
                    // (fix round 1, MEDIUM #3; matches `SqliteReadOnlyStore.close()` in `sqlite-readonly.ts`).
                    try {
                        db.close();
                    }
                    finally {
                        handle.cleanup();
                    }
                },
            },
        };
    }
    catch (err) {
        return { error: `open failed: ${err instanceof Error ? err.message : String(err)}` };
    }
}
function hasDzTables(db) {
    const t = (name) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
    return t('reasoning_patterns') && t('pattern_embeddings');
}
function embeddingRowCount(db) {
    const row = db.prepare('SELECT COUNT(*) AS n FROM pattern_embeddings').get();
    return typeof row?.n === 'number' ? row.n : 0;
}
/**
 * Cosine similarity in [-1, 1] over two embeddings. Exported (was file-private) so
 * `harmonizeVectorStore` scores near-duplicate pairs with the IDENTICAL math the semantic search
 * path uses — one cosine implementation, no drift between search and harmonize.
 */
export function cosineSimilarity(a, b) {
    const n = Math.min(a.length, b.length);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < n; i += 1) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
}
function dzIdOf(metadataJson) {
    if (typeof metadataJson !== 'string' || metadataJson === '')
        return undefined;
    try {
        const meta = JSON.parse(metadataJson);
        const id = meta['dzId'] ?? meta['dreamId'] ?? meta['kuId'] ?? meta['ku_id'];
        return typeof id === 'string' ? id : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Semantic search over the dz rows of the shared AgentDB store: embed the query, brute-force
 * cosine over `pattern_embeddings` BLOBs (`Float32Array`), top-K. Brute force is deliberate —
 * the pool is O(10²–10³), and a scan has zero index-maintenance/drift risk while the MCP
 * server writes the same file (WAL). READONLY open + `busy_timeout 5000` (ADR R5). Honest:
 * `{hits:[], error}` on any unavailability, never a throw.
 */
export async function searchAgentdbPatterns(projectRoot, query, opts = {}) {
    const limit = Math.max(1, opts.limit ?? 10);
    const opened = openReadonly(projectRoot, opts.dbPath);
    if ('absent' in opened)
        return { hits: [] }; // nothing mirrored yet — zero semantic hits, honestly
    if ('error' in opened)
        return { hits: [], error: opened.error };
    const { db } = opened;
    try {
        if (!hasDzTables(db))
            return { hits: [] };
        const taskTypes = opts.taskTypes ?? DZ_TASK_TYPES;
        const placeholders = taskTypes.map(() => '?').join(', ');
        const rows = db
            .prepare(`SELECT p.id, p.approach, p.success_rate, p.metadata, e.embedding
         FROM reasoning_patterns p JOIN pattern_embeddings e ON e.pattern_id = p.id
         WHERE p.task_type IN (${placeholders})`)
            .all(...taskTypes);
        const model = resolveEmbedModel(projectRoot);
        if ('error' in model)
            return { hits: [], error: model.error };
        const guard = guardEmbedSpace({
            storePath: resolveAgentdbPath(projectRoot, opts.dbPath),
            configured: model,
            hasRows: rows.length > 0,
            reindexHint: opts.reindexHint ?? 'dz vector reindex',
        });
        if (!guard.ok)
            return { hits: [], error: guard.error };
        // D2: the query is embedded with the STORE's own dtype (the guard above already proved the
        // manifest and the config agree) — pass the resolved store path so resolveAgentdbEmbedder reads
        // the same manifest guardEmbedSpace just read, never the config's dtype in isolation.
        const emb = await resolveAgentdbEmbedder(projectRoot, resolveAgentdbPath(projectRoot, opts.dbPath));
        if ('error' in emb)
            return { hits: [], error: emb.error };
        let qvec;
        try {
            qvec = await emb.embed(query);
        }
        catch (err) {
            return { hits: [], error: `query embed failed: ${err instanceof Error ? err.message : String(err)}` };
        }
        const scored = rows.map((r) => {
            const vec = new Float32Array(r.embedding.buffer, r.embedding.byteOffset, Math.floor(r.embedding.byteLength / 4));
            return {
                patternId: r.id,
                dzId: dzIdOf(r.metadata),
                text: r.approach,
                similarity: cosineSimilarity(qvec, vec),
                score: r.success_rate,
            };
        });
        scored.sort((a, b) => b.similarity - a.similarity || a.patternId - b.patternId);
        return { hits: scored.slice(0, limit) };
    }
    catch (err) {
        return { hits: [], error: `search failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    finally {
        db.close();
    }
}
/**
 * READONLY scan of the dz join keys (`metadata.dzId` / `dreamId`) already mirrored into the
 * shared store — the I-5 dedup + `dz vector status` observability primitive. Needs only
 * `better-sqlite3` (no embedder). Honest `{ids:[], error}` on unavailability.
 */
export async function listAgentdbDzIds(projectRoot, opts = {}) {
    const opened = openReadonly(projectRoot, opts.dbPath);
    if ('absent' in opened)
        return { ids: [] }; // empty mirror — everything is backfillable
    if ('error' in opened)
        return { ids: [], error: opened.error };
    const { db } = opened;
    try {
        if (!hasDzTables(db))
            return { ids: [] };
        // LIFECYCLE scan ⇒ the OWNED superset (incl. dz-backlog) so idea ids are visible for mirror
        // idempotency + `dz vector status`. Recall/search still defaults to the narrower DZ_TASK_TYPES.
        const taskTypes = opts.taskTypes ?? DZ_OWNED_TASK_TYPES;
        const placeholders = taskTypes.map(() => '?').join(', ');
        const rows = db
            .prepare(`SELECT metadata FROM reasoning_patterns WHERE task_type IN (${placeholders})`)
            .all(...taskTypes);
        const ids = new Set();
        for (const r of rows) {
            const id = dzIdOf(r.metadata);
            if (id !== undefined)
                ids.add(id);
        }
        return { ids: [...ids] };
    }
    catch (err) {
        return { ids: [], error: `id scan failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    finally {
        db.close();
    }
}
/**
 * Read the rows that ACTUALLY EXIST IN THE STORE for a task_type, as re-indexable {@link AgentdbRow}s
 * (their stored `approach` text + score/uses/reward/tags/metadata, dzId preserved). This is the correct
 * source for a REINDEX: a reindex re-embeds what is physically in the store to the new model — reading it
 * back from the store (not reconstructing from a sidecar file like ideas.jsonl) means an empty/unreadable
 * sidecar can never leave real store rows un-re-embedded and stale under an advanced manifest (HIGH-G).
 * Readonly, best-effort ({rows:[]} on absent/unavailable), never throws.
 */
export function readAgentdbRowsByTaskType(projectRoot, taskType, opts = {}) {
    const opened = openReadonly(projectRoot, opts.dbPath);
    if ('absent' in opened)
        return { rows: [] };
    if ('error' in opened)
        return { rows: [], error: opened.error };
    const { db } = opened;
    try {
        if (!hasDzTables(db))
            return { rows: [] };
        const raw = db
            .prepare('SELECT approach, success_rate, uses, avg_reward, tags, metadata FROM reasoning_patterns WHERE task_type = ?')
            .all(taskType);
        const rows = raw.map((r) => {
            let metadata;
            if (typeof r.metadata === 'string' && r.metadata !== '') {
                try {
                    const m = JSON.parse(r.metadata);
                    if (m !== null && typeof m === 'object')
                        metadata = m;
                }
                catch {
                    /* drop unparseable metadata */
                }
            }
            let tags;
            if (typeof r.tags === 'string' && r.tags !== '') {
                try {
                    const t = JSON.parse(r.tags);
                    if (Array.isArray(t))
                        tags = t.filter((x) => typeof x === 'string');
                }
                catch {
                    /* drop unparseable tags */
                }
            }
            return {
                taskType,
                text: r.approach,
                score: r.success_rate,
                uses: r.uses,
                avgReward: r.avg_reward,
                ...(tags !== undefined ? { tags } : {}),
                ...(metadata !== undefined ? { metadata } : {}),
            };
        });
        return { rows };
    }
    catch (err) {
        return { rows: [], error: `row scan failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    finally {
        db.close();
    }
}
/**
 * UPSERT precomputed vectors into the shared AgentDB store, keyed on `metadata.dzId` — the write
 * half of `dz vector import`. For each row: look up the existing `reasoning_patterns` row for the
 * dzId; if found, REPLACE its `pattern_embeddings` BLOB in place (never a new row); if absent,
 * INSERT both the pattern row (`approach = text`, `metadata.dzId`) and its embedding. The vector is
 * stored VERBATIM. NON-DESTRUCTIVE: only the imported dzIds are inserted/replaced — every other
 * dzId's vector and pattern are left untouched (no blind table overwrite). Idempotent — re-importing
 * the same dzIds REPLACEs in place, adding 0 rows. Same dynamic `better-sqlite3` resolve + WAL +
 * `busy_timeout 5000` as {@link indexPatternsToAgentdb}. Best-effort: honest `{ error }`, never a throw.
 */
export async function importVectorsToAgentdb(projectRoot, rows, opts = {}) {
    if (rows.length === 0)
        return { imported: 0 };
    let sqliteUrl;
    try {
        const req = createRequire(join(projectRoot, 'package.json'));
        sqliteUrl = pathToFileURL(req.resolve('better-sqlite3')).href;
    }
    catch {
        return { imported: 0, error: DEPS_MISSING };
    }
    try {
        const { default: Database } = (await import(sqliteUrl));
        const model = resolveEmbedModel(projectRoot);
        if ('error' in model)
            return { imported: 0, error: model.error };
        // MED-C: the store manifest guards the MODEL, but a per-vector guard was missing — a malformed or
        // TOCTOU vector (wrong length / NaN / ±Infinity) would be stamped compatible. Fail CLOSED and LOUD:
        // reject the whole batch if any vector's dimensionality ≠ the store dim or any component is non-finite,
        // so a vector can only enter the store bound to the model+dim the manifest names.
        for (const row of rows) {
            if (!(row.vector instanceof Float32Array) || row.vector.length !== model.dim) {
                return { imported: 0, error: `vector validation failed for ${row.dzId}: length ${row.vector?.length} != store dim ${model.dim}` };
            }
            for (let i = 0; i < row.vector.length; i += 1) {
                if (!Number.isFinite(row.vector[i])) {
                    return { imported: 0, error: `vector validation failed for ${row.dzId}: non-finite component at index ${i}` };
                }
            }
        }
        const dbFile = resolveAgentdbPath(projectRoot, opts.dbPath);
        mkdirSync(dirname(dbFile), { recursive: true }); // better-sqlite3 won't create the parent dir
        const db = new Database(dbFile);
        try {
            db.pragma('journal_mode = WAL');
            db.pragma('busy_timeout = 5000'); // wait out a brief MCP-server write lock instead of failing
            db.exec(REASONING_BANK_SCHEMA);
            const guard = guardEmbedSpace({
                storePath: dbFile,
                configured: model,
                hasRows: embeddingRowCount(db) > 0,
                reindexHint: 'dz vector reindex',
            });
            if (!guard.ok)
                return { imported: 0, error: guard.error };
            const findByDzId = db.prepare("SELECT id FROM reasoning_patterns WHERE json_extract(metadata, '$.dzId') = ?");
            const insPattern = db.prepare('INSERT INTO reasoning_patterns (task_type, approach, success_rate, uses, avg_reward, tags, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)');
            const upsertEmb = db.prepare('INSERT OR REPLACE INTO pattern_embeddings (pattern_id, embedding) VALUES (?, ?)');
            const commit = db.transaction(() => {
                let imported = 0;
                for (const row of rows) {
                    const buf = Buffer.from(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength);
                    const existing = findByDzId.get(row.dzId);
                    if (existing !== undefined) {
                        upsertEmb.run(existing.id, buf); // REPLACE the embedding in place — never a duplicate row
                    }
                    else {
                        const meta = { ...(row.metadata ?? {}), dzId: row.dzId };
                        const r = insPattern.run(row.taskType, row.text, Math.max(0, Math.min(1, Number.isFinite(row.score) ? row.score : 0)), 0, 0.0, null, JSON.stringify(meta));
                        upsertEmb.run(Number(r.lastInsertRowid), buf);
                    }
                    imported += 1;
                }
                return imported;
            });
            const imported = commit();
            // AM-1 (fix-round): `importVectorsToAgentdb` is the write-half of `dz vector import` — it
            // changes `pattern_embeddings`/`reasoning_patterns` exactly like `indexPatternsToAgentdb`, so
            // it must bump the SAME counter (the whole point of a single "did the store change" signal is
            // that every writer feeds it, not just one). Ordered before `writeEmbedManifest`, same AM-3
            // rationale: the rows are already on disk by the time `commit()` returns.
            bumpStoreGeneration(projectRoot, opts.dbPath);
            writeEmbedManifest(dbFile, currentEmbedManifest(model, guard.manifest.version, 'agentdb'));
            return { imported };
        }
        finally {
            db.close();
        }
    }
    catch (err) {
        return { imported: 0, error: `import failed: ${err instanceof Error ? err.message : String(err)}` };
    }
}
/**
 * lesson-quarantine: mark mirrored rows as promoted after a promotion — the hook daemon reads ONLY
 * this mirror's metadata, so a promoted lesson must stop being excluded there while retaining its
 * quarantine history. Best-effort, same custody model as {@link bumpAgentdbUses} (missing db/deps ⇒ no-op).
 */
export function clearAgentdbQuarantine(projectRoot, dzIds, opts = {}) {
    if (dzIds.length === 0)
        return { cleared: 0 };
    const dbFile = resolveAgentdbPath(projectRoot, opts.dbPath);
    if (!existsSync(dbFile))
        return { cleared: 0 };
    let Database;
    try {
        const req = createRequire(join(projectRoot, 'package.json'));
        Database = req('better-sqlite3');
    }
    catch {
        return { cleared: 0, error: DEPS_MISSING };
    }
    try {
        const db = new Database(dbFile);
        try {
            db.pragma('journal_mode = WAL');
            db.pragma('busy_timeout = 5000');
            db.exec(REASONING_BANK_SCHEMA);
            const stmt = db.prepare("UPDATE reasoning_patterns SET metadata = json_set(metadata, '$.qStatus', 'promoted', '$.promotedAt', ?) WHERE json_extract(metadata, '$.dzId') = ? AND json_extract(metadata, '$.qStatus') = 'quarantined'");
            const tx = db.transaction(() => {
                let cleared = 0;
                for (const dzId of dzIds) {
                    const r = stmt.run(new Date().toISOString(), dzId);
                    cleared += Number(r.changes ?? 0);
                }
                return cleared;
            });
            const cleared = tx();
            // AM-1 (fix-round): a quarantine clear mutates `metadata` on rows the hook daemon reads
            // straight from this mirror (see the doc comment above) — it changes what a query returns, so
            // it must bump too, exactly like every other mutator. Only when something actually changed
            // (`cleared > 0`) — same "no write, no bump" discipline as `indexPatternsToAgentdb`'s
            // empty-rows case (AC-2).
            if (cleared > 0)
                bumpStoreGeneration(projectRoot, opts.dbPath);
            return { cleared };
        }
        finally {
            db.close();
        }
    }
    catch (err) {
        return { cleared: 0, error: `quarantine clear failed: ${err instanceof Error ? err.message : String(err)}` };
    }
}
/**
 * DELETE mirrored rows by `metadata.dzId` (pattern + its embedding), optionally scoped to a task_type
 * set. The write-half of a structured-store removal: when `harmonize --apply` drops ideas from
 * `ideas.jsonl`, their `dz-backlog` vectors must be pruned too, or a later semantic search matches an
 * ORPHAN dzId that no longer has a structured record (smart-backlog HIGH-A). Best-effort, same custody
 * model as {@link clearAgentdbQuarantine} (missing db/deps ⇒ no-op). Never throws.
 */
export function deleteAgentdbByDzIds(projectRoot, dzIds, opts = {}) {
    if (dzIds.length === 0)
        return { deleted: 0 };
    const dbFile = resolveAgentdbPath(projectRoot, opts.dbPath);
    if (!existsSync(dbFile))
        return { deleted: 0 };
    let Database;
    try {
        const req = createRequire(join(projectRoot, 'package.json'));
        Database = req('better-sqlite3');
    }
    catch {
        return { deleted: 0, error: DEPS_MISSING };
    }
    try {
        const db = new Database(dbFile);
        try {
            db.pragma('journal_mode = WAL');
            db.pragma('busy_timeout = 5000');
            db.exec(REASONING_BANK_SCHEMA);
            const scope = opts.taskTypes !== undefined && opts.taskTypes.length > 0;
            const scopeSql = scope ? ` AND task_type IN (${opts.taskTypes.map(() => '?').join(', ')})` : '';
            const findIds = db.prepare(`SELECT id FROM reasoning_patterns WHERE json_extract(metadata, '$.dzId') = ?${scopeSql}`);
            const delEmb = db.prepare('DELETE FROM pattern_embeddings WHERE pattern_id = ?');
            const delPat = db.prepare('DELETE FROM reasoning_patterns WHERE id = ?');
            const tx = db.transaction(() => {
                let deleted = 0;
                for (const dzId of dzIds) {
                    const rows = scope ? findIds.all(dzId, ...opts.taskTypes) : findIds.all(dzId);
                    for (const { id } of rows) {
                        delEmb.run(id);
                        delPat.run(id);
                        deleted += 1;
                    }
                }
                return deleted;
            });
            const deleted = tx();
            // AM-1 (fix-round): a DELETE removes rows from a query's result set exactly as surely as an
            // INSERT adds them — it must bump too. Only when rows actually left the store (`deleted > 0`).
            if (deleted > 0)
                bumpStoreGeneration(projectRoot, opts.dbPath);
            return { deleted };
        }
        finally {
            db.close();
        }
    }
    catch (err) {
        return { deleted: 0, error: `delete by dzId failed: ${err instanceof Error ? err.message : String(err)}` };
    }
}
export function bumpAgentdbUses(projectRoot, dzIds, opts = {}) {
    if (dzIds.length === 0)
        return { bumped: 0 };
    const dbFile = resolveAgentdbPath(projectRoot, opts.dbPath);
    if (!existsSync(dbFile))
        return { bumped: 0 };
    let Database;
    try {
        const req = createRequire(join(projectRoot, 'package.json'));
        Database = req('better-sqlite3');
    }
    catch {
        return { bumped: 0, error: DEPS_MISSING };
    }
    try {
        const db = new Database(dbFile);
        try {
            db.pragma('journal_mode = WAL');
            db.pragma('busy_timeout = 5000');
            db.exec(REASONING_BANK_SCHEMA);
            const stmt = db.prepare(opts.reward !== undefined
                ? "UPDATE reasoning_patterns SET uses = uses + 1, avg_reward = ((avg_reward * uses) + ?) / (uses + 1) WHERE json_extract(metadata, '$.dzId') = ?"
                : "UPDATE reasoning_patterns SET uses = uses + 1 WHERE json_extract(metadata, '$.dzId') = ?");
            const tx = db.transaction(() => {
                let bumped = 0;
                for (const dzId of dzIds) {
                    const r = opts.reward !== undefined
                        ? stmt.run(Math.max(0, Math.min(1, opts.reward)), dzId)
                        : stmt.run(dzId);
                    bumped += Number(r.changes ?? 0);
                }
                return bumped;
            });
            const bumped = tx();
            // AM-1 (fix-round): `uses`/`avg_reward` feed reward-weighted ranking — a change here is a real
            // store mutation, so it bumps the SAME counter (deliberately NOT named `bump` — that identifier
            // is this function's own return value; the counter helper is called by its full name below to
            // avoid the collision). Only when a row actually changed (`bumped > 0`).
            if (bumped > 0)
                bumpStoreGeneration(projectRoot, opts.dbPath);
            return { bumped };
        }
        finally {
            db.close();
        }
    }
    catch (err) {
        return { bumped: 0, error: `uses bump failed: ${err instanceof Error ? err.message : String(err)}` };
    }
}
/**
 * Fix-round 1 (CRITICAL, item 1b — the belt): whether {@link reindexAgentdbRows} must run its own
 * rescue bump, given the DELETE's own observed `changes` count and the nested
 * {@link indexPatternsToAgentdb} call's result. Exported test-only (same convention as
 * {@link resetAgentdbEmbedderCache}) so the DECISION can be exercised directly and deterministically,
 * independent of forcing a real concurrent bump-lock race.
 *
 * `!nestedBumped && (deleteChanges > 0 || indexed.indexed > 0 || indexed.error !== undefined)`:
 * - `deleteChanges > 0` — the DELETE genuinely removed rows; the store changed regardless of the
 *   nested call's outcome.
 * - `indexed.indexed > 0` — the nested call committed rows itself but its OWN bump failed
 *   (`generationBumped: false`) or was never attempted.
 * - `indexed.error !== undefined` — the nested call's post-write state is UNKNOWN (item 1a: an error
 *   here may still carry accurate `indexed`/`generationBumped` facts, but a caller must not assume a
 *   future error path will). C-1: when in doubt, bump — an extra bump only over-invalidates a cache
 *   (safe), a missed one serves stale data (not safe).
 */
export function needsRescueBump(deleteChanges, indexed) {
    const nestedBumped = indexed.generationBumped === true;
    return !nestedBumped && (deleteChanges > 0 || indexed.indexed > 0 || indexed.error !== undefined);
}
export async function reindexAgentdbRows(projectRoot, rows, opts = {}) {
    const dbFile = resolveAgentdbPath(projectRoot, opts.dbPath);
    const ms = Date.now();
    const backupPath = opts.backupPath ?? `${dbFile}.pre-reindex-${ms}.bak`;
    // agentdb-snapshot-lock: test/tuning-only override for every lock acquisition this call makes
    // (snapshot, rollback, success-path rotation) — omitted, each uses its ordinary default timeout.
    const lockOpts = opts.lockTimeoutMs !== undefined ? { timeoutMs: opts.lockTimeoutMs } : {};
    // AM-5: opts.backupPath must resolve INSIDE dirname(dbFile) — normalized via `resolve`, checked via
    // `relative` so neither a `..`-escaping relative path nor a foreign absolute path can steer the
    // snapshot (and its `-wal`/`-shm`/manifest siblings) outside the db's own directory. No snapshot is
    // attempted when this check fails — the reindex aborts before sqlite is even resolved.
    if (opts.backupPath !== undefined) {
        // Lead edit after re-review (Codex C): the boundary is PHYSICAL, not lexical — a symlinked
        // parent (`<dbDir>/link/x.bak` with `link` pointing outside) is resolved with realpath before the
        // comparison. A parent that does not exist yet cannot be a symlink, so the lexical path stands.
        const physical = (p) => { try {
            return realpathSync(p);
        }
        catch {
            return p;
        } };
        const dbDir = physical(resolve(dirname(dbFile)));
        const candidate = resolve(opts.backupPath);
        const rel = relative(dbDir, join(physical(dirname(candidate)), basename(candidate)));
        if (rel.startsWith('..') || isAbsolute(rel)) {
            return { reembedded: 0, error: `opts.backupPath must stay inside ${dbDir}, got: ${opts.backupPath}` };
        }
    }
    // FR-3: sqlite resolves BEFORE any snapshot is taken — an unavailable dependency must abort with
    // no new `pre-reindex-*` file on disk, not a snapshot immediately followed by a DEPS_MISSING error.
    let sqliteUrl;
    try {
        const req = createRequire(join(projectRoot, 'package.json'));
        sqliteUrl = pathToFileURL(req.resolve('better-sqlite3')).href;
    }
    catch {
        return { reembedded: 0, error: DEPS_MISSING };
    }
    let Database;
    try {
        ({ default: Database } = (await import(sqliteUrl)));
    }
    catch {
        return { reembedded: 0, error: DEPS_MISSING };
    }
    let snapshotMethod;
    let snapshotNote;
    // exactOptionalPropertyTypes: an optional field must be OMITTED, never assigned `undefined` —
    // spread `snapMeta()` in at every return site instead of naming the two fields directly. A
    // function (not a value computed once) so a return that runs BEFORE the snapshot fully finishes
    // (the manifest-copy failure below) still reports whatever method was already determined —
    // FR-2/"absence of a receipt is not success": snapshotMethod is named whenever a snapshot ran,
    // even one that failed on a LATER best-effort step.
    const snapMeta = () => ({
        ...(snapshotMethod !== undefined ? { snapshotMethod } : {}),
        ...(snapshotNote !== undefined ? { snapshotNote } : {}),
    });
    // AM-2 (fix-round after Codex review Grade D): the reindex-in-progress marker is written INSIDE
    // the SAME critical section as the snapshot itself, under ONE lock acquisition — never before it.
    // A lock timeout now throws before EITHER the snapshot OR the marker exist, so a busy lock leaves
    // the directory byte-identical (previously the marker was written unconditionally BEFORE the
    // lock was even attempted, so a busy lock still left a transient marker on disk for the life of
    // this call). AM-1: the marker write is attempted FIRST inside the callback, before any snapshot
    // — a live marker from a still-running reindex refuses this call "без снимка" (no snapshot ever
    // taken for the refused attempt; nothing has been deleted yet, so there is nothing to roll back).
    // AM-4: the marker's `ms` is recomputed from the ACTUAL `backupPath` filename — decoupled from the
    // `ms` variable above, which only seeds the DEFAULT backupPath. A non-standard `opts.backupPath`
    // (no `.pre-reindex-<n>.bak` suffix) names no family, so the marker carries `ms: null`.
    const markerMs = msFromBackupPath(backupPath);
    let markerToken;
    try {
        const markerResult = withAgentdbSnapshotLock(dbFile, () => {
            const written = writeReindexMarker(dbFile, { ms: markerMs, pid: process.pid, startedAt: Date.now(), backupPath });
            if (!written.ok)
                return written; // AM-1: refuse before touching the database at all
            // FR-1/FR-2 (agentdb-snapshot-lock): the critical section under the lock is exactly the file
            // operations below (`VACUUM INTO`/copy + the manifest-sibling copy, plus the marker write
            // above) — short and synchronous. Re-embedding (the long, unlocked part of a reindex) happens
            // well after this block returns.
            // Lead edit after re-review (Codex D, finding 2): a snapshot that THROWS inside this section
            // must not leave the just-written marker behind until the TTL — clear it (we own the token)
            // and rethrow so the outer catch reports the snapshot failure as before.
            try {
                if (existsSync(dbFile)) {
                    const outcome = snapshotSqliteDatabase(Database, dbFile, backupPath, opts.snapshotStrategy !== undefined ? { strategy: opts.snapshotStrategy } : {});
                    snapshotMethod = outcome.method;
                    snapshotNote = outcome.note;
                    if (existsSync(`${dbFile}.embed-manifest.json`)) {
                        copyFileSync(`${dbFile}.embed-manifest.json`, `${backupPath}.embed-manifest.json`);
                    }
                }
            }
            catch (snapErr) {
                clearReindexMarker(dbFile, written.token);
                throw snapErr;
            }
            return written;
        }, lockOpts);
        if (!markerResult.ok) {
            return { reembedded: 0, backupPath, ...snapMeta(), error: markerResult.error };
        }
        markerToken = markerResult.token;
    }
    catch (err) {
        // FR-4: a busy snapshot lock is reported distinctly ("snapshot lock busy: …") and aborts with
        // NO snapshot, NO marker and NO change to the database — `fn` above never ran, so nothing was
        // written (AM-2).
        if (err instanceof NamedLockTimeoutError) {
            return { reembedded: 0, error: `snapshot lock busy: ${err.message}` };
        }
        return { reembedded: 0, backupPath, ...snapMeta(), error: `snapshot failed — reindex aborted: ${err instanceof Error ? err.message : String(err)}` };
    }
    // AM-3: the marker is cleared in `finally` below only when no rollback was needed, or the
    // rollback SUCCEEDED. A FAILED rollback leaves the marker in place as "requires manual recovery"
    // — its family may be the only intact copy of the pre-reindex state, and clearing the marker here
    // would let a concurrent `dz brain snapshots --prune` remove it right out from under an operator
    // who has not yet acted on the advice named in the returned error.
    let rollbackFailed = false;
    try {
        const model = resolveEmbedModel(projectRoot);
        if ('error' in model)
            return { reembedded: 0, backupPath, ...snapMeta(), error: model.error };
        const oldVersion = readEmbedManifest(dbFile)?.version ?? 1;
        const version = Math.max(oldVersion + 1, 2);
        const markerPath = reindexMarkerPath(dbFile);
        /** AM-3: names both paths a failed rollback leaves an operator to reconcile by hand. */
        const rollbackFailNote = () => `snapshot at ${backupPath} was not confirmed restored; marker at ${markerPath} is left in place — requires manual recovery`;
        /**
         * Undo a half-done reindex. The DELETE has already run and the manifest may already name the new
         * model, so leaving the store as-is would be WORSE than before we started: a manifest that claims a
         * space the rows are not in. Restore both from the snapshot taken above. FR-4: the caller of
         * `rollback()` has ALREADY closed every write connection this function opened (both the DELETE's
         * `db.close()` in the `finally` below and `indexPatternsToAgentdb`'s own `finally { db.close() }`)
         * before this runs.
         *
         * AM-3: never throws, but never silently reports a failed restore as a success either — "absence of
         * a receipt is not success" applies to a rollback exactly as much as to a forward operation. Returns
         * `{ restored: 'restored' }` or `{ restored: 'failed', error }`; the caller folds `error` into the
         * top-level `error` string as "; rollback failed: …" and surfaces `rollback`/`rollbackError`.
         */
        const rollback = async () => {
            try {
                // Lead edit after re-review: a snapshot that WAS taken but is now missing is a FAILED rollback,
                // never a silently "restored" one. Only the no-snapshot case (the db did not exist) has nothing to restore.
                if (!existsSync(backupPath) && snapshotMethod !== undefined) {
                    return { restored: 'failed', error: `rollback failed: snapshot missing at ${backupPath}` };
                }
                // FR-1/FR-2 (agentdb-snapshot-lock): the restore + manifest-copy are the file operations this
                // lock guards. The caller has ALREADY closed every write connection before `rollback()` runs
                // (see the doc comment above), so this critical section stays exactly as short as the forward
                // snapshot's.
                return withAgentdbSnapshotLock(dbFile, () => {
                    if (existsSync(backupPath)) {
                        if (snapshotMethod === undefined) {
                            // Structurally should not happen (a backup file with no recorded method), but AM-1's whole
                            // point is: never guess the method from file presence. Fail loudly instead.
                            return { restored: 'failed', error: 'rollback failed: snapshot method unknown, refusing to guess -wal handling' };
                        }
                        const outcome = restoreSqliteSnapshot(dbFile, backupPath, snapshotMethod);
                        if (!outcome.ok) {
                            return { restored: 'failed', error: `rollback failed: ${outcome.error ?? 'restore failed'}` };
                        }
                    }
                    const manifestBak = `${backupPath}.embed-manifest.json`;
                    if (existsSync(manifestBak))
                        copyFileSync(manifestBak, `${dbFile}.embed-manifest.json`);
                    return { restored: 'restored' };
                }, lockOpts);
            }
            catch (err) {
                if (err instanceof NamedLockTimeoutError) {
                    return { restored: 'failed', error: `rollback failed: lock busy: ${err.message}` };
                }
                return { restored: 'failed', error: `rollback failed: ${err instanceof Error ? err.message : String(err)}` };
            }
        };
        let stale = [];
        // T1 (`store-generation-residuals`, record `3cfcec83`): the OBSERVED fact — `changes` from the
        // DELETE's own prepared-statement result, never inferred from `rows.length` or any other adjacent
        // signal (06_implementation_plan.md's T1 section names exactly that inference as the mistake to
        // avoid). Declared outside the `db` block so it survives to the bump decision below `db.close()`.
        let deleteChanges = 0;
        try {
            mkdirSync(dirname(dbFile), { recursive: true });
            const db = new Database(dbFile);
            try {
                db.pragma('journal_mode = WAL');
                db.pragma('busy_timeout = 5000');
                db.exec(REASONING_BANK_SCHEMA);
                const taskTypes = opts.taskTypes ?? DZ_TASK_TYPES;
                const placeholders = taskTypes.map(() => '?').join(', ');
                // Task types this reindex does NOT own. Their vectors stay in the OLD embedding space while the
                // manifest below starts naming the new one. That is safe only because every read path filters by
                // task type (`searchAgentdbPatterns` defaults to DZ_TASK_TYPES; the brain reads its own store),
                // so no query ever compares across spaces. We report them so the caller can tell the user which
                // sibling reindex still has to run — silently leaving them would be the trap.
                stale = foreignTaskTypesWithEmbeddings(db, taskTypes);
                const delEmb = db.prepare(`DELETE FROM pattern_embeddings WHERE pattern_id IN (SELECT id FROM reasoning_patterns WHERE task_type IN (${placeholders}))`);
                const delPat = db.prepare(`DELETE FROM reasoning_patterns WHERE task_type IN (${placeholders})`);
                const tx = db.transaction(() => {
                    delEmb.run(...taskTypes);
                    return delPat.run(...taskTypes).changes;
                });
                deleteChanges = tx();
            }
            finally {
                db.close();
            }
            // Stamp the NEW manifest BEFORE re-indexing. `indexPatternsToAgentdb` runs `guardEmbedSpace`,
            // which refuses to write when the manifest names a different model — so with the old manifest
            // still in place, reindex (the documented cure for exactly that mismatch) is refused by the very
            // guard it exists to satisfy, and its own error message tells you to run itself. Stamping first
            // makes the cure reachable; `rollback()` restores both file and manifest if the re-embed fails,
            // so a mid-way failure can never leave a manifest that lies about the rows.
            writeEmbedManifest(dbFile, currentEmbedManifest(model, version, 'agentdb'));
            const indexed = await indexPatternsToAgentdb(projectRoot, rows, { dbPath: dbFile });
            if (indexed.error !== undefined) {
                // Fix-round 1 (CRITICAL, item 1b — the belt): before this fix, NO bump was attempted anywhere
                // on this branch, regardless of `deleteChanges` — the DELETE above may have genuinely removed
                // rows from the store (a real change on disk) and the counter would never move to reflect it,
                // even though `rollback()` below may itself fail and leave that changed state in place. An
                // error from the nested call means the post-write state is UNKNOWN — C-1 resolves unknown in
                // favour of bumping (a spurious extra bump only over-invalidates a cache; a missed one serves
                // stale data). `needsRescueBump` is the SAME decision used on the success path below — one
                // rule, not two that could drift apart.
                if (needsRescueBump(deleteChanges, indexed))
                    bumpStoreGeneration(projectRoot, opts.dbPath);
                const rb = await rollback();
                if (rb.restored === 'failed')
                    rollbackFailed = true; // AM-3: the `finally` below must not clear the marker
                return {
                    reembedded: 0,
                    backupPath,
                    ...snapMeta(),
                    rollback: rb.restored,
                    ...(rb.error !== undefined ? { rollbackError: rb.error } : {}),
                    error: rb.restored === 'failed' ? `${indexed.error}; ${rb.error}; ${rollbackFailNote()}` : indexed.error,
                };
            }
            // FR-1/FR-6: rotation runs ONLY on this success path — an `error` return above never reaches
            // here, so old snapshots are never touched while they might be the only working copy left.
            // NFR-2: calls the UNLOCKED primitive under OUR OWN `withAgentdbSnapshotLock` — never the public
            // `rotatePreReindexSnapshots` wrapper, which would try to take the same named lock a second time.
            const keepSnapshots = opts.keepSnapshots ?? 3;
            let snapshots;
            try {
                snapshots = withAgentdbSnapshotLock(dbFile, () => rotatePreReindexSnapshotsUnlocked(dbFile, { keep: keepSnapshots, protectPath: backupPath }), lockOpts);
            }
            catch (err) {
                if (!(err instanceof NamedLockTimeoutError))
                    throw err;
                snapshots = { kept: [], removed: [], removedBytes: 0, keep: keepSnapshots, errors: [`lock busy: ${err.message}`] };
            }
            // T1 (`store-generation-residuals`, record `3cfcec83` — supersedes the AM-1 comment this
            // replaces, which documented the double-bump as "harmless" rather than fixing it). AM-1's
            // underlying concern stands unchanged: `reindexAgentdbRows` is ITSELF a mutator (the DELETE
            // above rebuilds the owned task types) and must not rely solely on `indexPatternsToAgentdb`'s
            // own internal bump, because that nested call is a no-op — bumps nothing, sets no
            // `generationBumped` — when `rows` is empty, yet the DELETE just above may have changed the
            // store regardless of whether there was anything to re-insert.
            //
            // The rule (now the shared {@link needsRescueBump} helper — fix-round 1, item 1b — used
            // identically on the error branch above) uses OBSERVED facts, never inferred from an adjacent
            // signal (the mistake named in the plan's T1 section, fresh from the worker-ceiling fix that
            // predates this one): `deleteChanges` is the DELETE's own `changes` count, read directly off the
            // prepared-statement result; `indexed.generationBumped` is a field `indexPatternsToAgentdb` sets
            // ONLY where its own bump actually ran (never guessed from `indexed.indexed > 0`, which is
            // itself a real fact but a DIFFERENT one — see below).
            //
            // The condition is intentionally `!nestedBumped && (deleteChanges > 0 || indexed.indexed > 0 ||
            // indexed.error !== undefined)`, NOT the narrower `deleteChanges > 0 && !nestedBumped` the
            // plan's prose formula reads as: a bare `deleteChanges > 0` gate would MISS the case where the
            // DELETE removed nothing (a first-ever reindex of these task types) but the nested insert then
            // ran and its OWN bump failed (`indexed.generationBumped === false`, e.g. a transient lock
            // timeout) — under the narrower gate the store would have changed on disk with no rescue bump at
            // all, a genuine under-bump. C-1 (`01_requirements.md`) makes correctness here non-negotiable:
            // "при сомнении поднимать счётчик ЛИШНИЙ раз безопаснее, чем не поднять" — so the OR-of-facts
            // form below is what actually ships; it satisfies every case FR-1's AC-1 enumerates AND closes
            // the gaps the plan's literal formula and the pre-fix-round-1 condition left open, verified by
            // exhaustive case analysis in `features/store-generation-residuals/07_code_changes/change_manifest.md`.
            if (needsRescueBump(deleteChanges, indexed)) {
                bumpStoreGeneration(projectRoot, opts.dbPath);
            }
            return {
                reembedded: indexed.indexed,
                model: model.model,
                version,
                backupPath,
                ...snapMeta(),
                ...(stale.length > 0 ? { staleTaskTypes: stale } : {}),
                snapshots,
            };
        }
        catch (err) {
            const rb = await rollback();
            if (rb.restored === 'failed')
                rollbackFailed = true; // AM-3: the `finally` below must not clear the marker
            const baseError = `reindex failed: ${err instanceof Error ? err.message : String(err)}`;
            return {
                reembedded: 0,
                backupPath,
                ...snapMeta(),
                rollback: rb.restored,
                ...(rb.error !== undefined ? { rollbackError: rb.error } : {}),
                error: rb.restored === 'failed' ? `${baseError}; ${rb.error}; ${rollbackFailNote()}` : baseError,
            };
        }
    }
    finally {
        // AM-3: never clear a marker left behind by a FAILED rollback (see the comment above
        // `rollbackFailed`'s declaration) — every other path (no rollback needed, or a rollback that
        // actually restored) clears it exactly as before.
        // Lead edit after re-review (Codex D, findings 3/4): every marker mutation runs under the snapshot
        // lock, so compare-and-delete and stale replacement can never interleave with another owner.
        // A failed rollback flags the marker as recovery-required instead (never expires, refuses reindex).
        try {
            withAgentdbSnapshotLock(dbFile, () => {
                if (rollbackFailed)
                    markReindexMarkerRecoveryRequired(dbFile, markerToken, 'rollback failed — restore the snapshot manually');
                else
                    clearReindexMarker(dbFile, markerToken);
            }, lockOpts);
        }
        catch {
            /* lock busy at cleanup: the marker stays; a live one expires by TTL, a recovery-required one is
               re-flagged on the next attempt — never throw out of finally over the real result */
        }
    }
}
/**
 * Task types present in the store (with embeddings) that this reindex does not rebuild. Pure read,
 * never throws — an unreadable store simply reports none.
 */
function foreignTaskTypesWithEmbeddings(db, owned) {
    try {
        // `UpsertDb` (the write-side surface) does not declare `all()`, but the live better-sqlite3
        // statement has it. Narrow here rather than widening the shared write interface.
        const q = db;
        const rows = q
            .prepare(`SELECT DISTINCT p.task_type AS t FROM reasoning_patterns p
           JOIN pattern_embeddings e ON e.pattern_id = p.id`)
            .all();
        return rows
            .map((r) => (typeof r.t === 'string' ? r.t : ''))
            .filter((t) => t !== '' && !owned.includes(t))
            .sort();
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=agentdb-index.js.map