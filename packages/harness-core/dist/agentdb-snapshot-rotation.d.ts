/**
 * Pre-reindex snapshot rotation (feature `reindex-snapshot-rotation`, FR-1..FR-8).
 *
 * `reindexAgentdbRows` copies the store to `<db>.pre-reindex-<ms>.bak` (+ `.embed-manifest.json` /
 * `-shm` / `-wal` siblings) before every reindex, as an undo point. Nothing has ever pruned them,
 * so they accumulate without bound — 13 snapshots / 50 MB observed on the owner's hub, and no
 * command removed a single one.
 *
 * This module is the PURE planning half (NFR-2) — {@link listPreReindexSnapshots} (fs READ) and
 * {@link planSnapshotRotation} (no fs at all) — plus the thin fs-EFFECT wrapper
 * {@link rotatePreReindexSnapshots} that acts on the plan. A snapshot is a FAMILY of files sharing
 * one `<ms>` timestamp (FR-2): the family is removed or kept as a unit, never partially.
 *
 * @packageDocumentation
 */
/** One file belonging to a snapshot family — always a basename, never a full path. */
export interface SnapshotFile {
    readonly name: string;
    readonly bytes: number;
}
/** Every file sharing one `<ms>` timestamp — the unit rotation acts on (FR-2). */
export interface SnapshotFamily {
    readonly ms: number;
    readonly files: readonly SnapshotFile[];
    readonly bytes: number;
}
/** A rotation decision: which families survive, which are slated for removal. */
export interface SnapshotRotationPlan {
    readonly kept: readonly SnapshotFamily[];
    readonly removed: readonly SnapshotFamily[];
}
/** The fs-effect outcome (FR-4) — reported poimённо (by file name), never just a count. */
export interface SnapshotRotationReport {
    readonly kept: string[];
    readonly removed: string[];
    readonly removedBytes: number;
    readonly keep: number;
    /** Per-file unlink failures (FR-5) — never fatal to the caller's own success. */
    readonly errors?: string[];
    /**
     * AM-4 (fix-round after Codex review Grade D): a `readdirSync`/`lstatSync` failure other than
     * ENOENT makes the candidate list INCOMPLETE — a family the scan never saw would look "not old"
     * only because it was invisible, never because it truly survives review. Present ⇒ this call
     * removed NOTHING, however conservative that looks against a nonzero `kept`.
     */
    readonly scanErrors?: string[];
    /**
     * AM-2: `<ms>` of every family where a sibling unlink failed and the family's `.bak` — the one
     * file that alone still proves the snapshot ever existed — was therefore left in place rather
     * than deleted out from under a family whose removal turned out to be only partial.
     */
    readonly partialFamilies?: number[];
    /**
     * FR-3 (agentdb-snapshot-lock): honest observations that are neither an error nor a removal —
     * today, exactly one shape: a reindex-in-progress marker found PAST its TTL, ignored and deleted.
     * Never populated for a marker that is still live (it simply protects its family silently) nor
     * for the ordinary case of no marker at all.
     */
    readonly notes?: string[];
}
/**
 * Scan the directory next to `dbFile` for candidate families — the shared innards of
 * {@link listPreReindexSnapshots} (which drops `scanErrors` for callers that only ever listed) and
 * {@link rotatePreReindexSnapshots} (which must see them, per AM-4: an incomplete scan must never be
 * read as "these are all the old ones").
 *
 * NFR-1: symlinks are never followed and never treated as candidates. `lstatSync` — never `stat` —
 * decides this, so a matching NAME that resolves to a symlink is excluded entirely (AC-3), not
 * "rotated by its link size". An orphaned sibling (e.g. a `-shm` with no `.bak`) still forms its
 * own one-file family under its `<ms>` (AC-5) — FR-2 groups by timestamp, not by which siblings
 * happen to exist.
 *
 * AM-5: a `<ms>` that is not a safe non-negative integer within `Date`'s representable range
 * (`±8.64e15`) is never grouped into a candidate family — so it never reaches `new Date(ms)`, which
 * throws `RangeError` past that bound, and it is never silently treated as "the oldest one".
 */
export declare function scanSnapshotDir(dbFile: string): {
    families: SnapshotFamily[];
    scanErrors: string[];
};
/**
 * List every pre-reindex snapshot family sitting next to `dbFile`, newest `ms` first (families
 * unsorted internally are sorted here; per-family files are name-sorted for determinism). See
 * {@link scanSnapshotDir} for the scan rules (NFR-1, AM-5); this wrapper drops `scanErrors` — callers
 * that only ever want to LIST (never delete) have no unsafe decision to gate on them.
 */
export declare function listPreReindexSnapshots(dbFile: string): SnapshotFamily[];
/**
 * Pure decision (NFR-2, zero fs): given the families found in a directory, decide which survive.
 * The newest `keep` families survive (`keep` clamped to ≥ 0); the freshly created backup is
 * normally the newest family, so it is ordinarily already inside that top-`keep` slice. `protectMs`
 * names it explicitly and is the FALLBACK that fires only when it would otherwise fall OUTSIDE that
 * slice — the boundary case named by FR-1: at `keep=0` the top slice is empty, yet the snapshot this
 * very call just wrote must never be deleted. `families` need not be pre-sorted.
 *
 * AM-3 (fix-round): a family younger than `graceMs` (default {@link DEFAULT_GRACE_MS}, 10 minutes;
 * `ms > now - graceMs`) is rescued exactly like `protectMs`, even past `keep` — a fresh snapshot from
 * a DIFFERENT process/run than the one calling this must never look "old" just because nobody named
 * it via `protectMs`. There is no override: `now`/`graceMs` exist for deterministic tests, not for a
 * CLI knob that would let someone talk the grace period down to zero.
 */
export declare function planSnapshotRotation(families: readonly SnapshotFamily[], opts: {
    readonly keep: number;
    readonly protectMs?: number;
    readonly now?: number;
    readonly graceMs?: number;
}): SnapshotRotationPlan;
/** Options shared by {@link rotatePreReindexSnapshotsUnlocked} and {@link rotatePreReindexSnapshots}. */
export interface RotateSnapshotsOptions {
    readonly keep?: number;
    readonly protectPath?: string;
    readonly now?: number;
    readonly graceMs?: number;
}
/**
 * The fs-effect half: list, plan, delete. A per-file `unlink` failure lands in `errors[]` and never
 * stops the rest of the rotation (FR-5) — by the time this runs, the caller has already produced a
 * successful reindex, and a rotation hiccup must never be read as a reindex failure. `removedBytes`
 * counts only bytes of files ACTUALLY unlinked, so a partial failure never overstates what was freed.
 *
 * AM-1 (fix-round, Codex review Grade D): `keep` is validated HERE, before any fs read or delete.
 * The bug this closes: `Math.max(0, NaN)` is `NaN`, and `sorted.slice(0, NaN)` is `[]` — an EMPTY
 * kept slice, so every existing family looked "older than keep" and got removed. A `keep` that is
 * not a non-negative safe integer is refused outright; nothing is read, nothing is touched.
 *
 * AM-4: a scan error (readdir/lstat failing with anything but ENOENT) makes the candidate list
 * INCOMPLETE — deciding "these are the old ones" off a partial list is exactly the class of mistake
 * this rotation exists to avoid for the snapshots themselves, so this call removes NOTHING.
 *
 * AM-2: within a removed family, siblings unlink FIRST and the `.bak` LAST, and only once every
 * sibling actually unlinked — a failed sibling leaves the `.bak` in place (the one file that alone
 * still proves the snapshot ever existed) and names the family in `partialFamilies` rather than
 * guessing the family is gone.
 *
 * FR-3 (agentdb-snapshot-lock): a family named by a LIVE reindex-in-progress marker
 * ({@link readLiveReindexMarkers}) is rescued from `removed` exactly like `protectPath`, even past
 * `keep` and even past `graceMs` — a reindex that is still running must never lose the undo point it
 * is relying on. An EXPIRED marker is not a scan error: it is removed and named in `notes`.
 *
 * UNLOCKED by design (NFR-2): this is the internal primitive `rotatePreReindexSnapshots` (the public,
 * locked entry point) and `reindexAgentdbRows`'s own success-path rotation both call — each under
 * their OWN `withAgentdbSnapshotLock`, so the lock is never acquired twice in one call stack.
 */
export declare function rotatePreReindexSnapshotsUnlocked(dbFile: string, opts?: RotateSnapshotsOptions): SnapshotRotationReport;
/**
 * The PUBLIC, locked rotation entry point (FR-1) — used by `dz brain snapshots --prune` and by any
 * other caller outside `reindexAgentdbRows`'s own success path (which calls
 * {@link rotatePreReindexSnapshotsUnlocked} directly under its own lock, per NFR-2). A
 * `NamedLockTimeoutError` — the lock stayed held past the deadline — is reported exactly like any
 * other rotation refusal: `{ removed: [], errors: ['lock busy: …'] }` (FR-4), never a throw.
 *
 * `lockTimeoutMs` is test/tuning-only: omitted, the lock uses its ordinary default deadline.
 *
 * AM-4 (carried forward): `withNamedLockSync` creates `<dirname(dbFile)>/.dz/locks/` before it ever
 * runs `fn` — if `dirname(dbFile)` exists but is NOT a directory (a pathological store path, exactly
 * the shape AM-4's own fixture uses), that `mkdirSync` throws `ENOTDIR` before any lock is even
 * attempted. Scanning is therefore checked FIRST, outside the lock: an unreadable directory is a
 * property of the directory, not of contention over it, and must report the SAME honest
 * `scanErrors` (never touching, never throwing) whether or not locking is even reachable. MEASURED
 * (fix round, this feature): omitting this pre-check turned the pre-existing
 * `rotatePreReindexSnapshots(brokenDbFile, …)` / `dz brain snapshots --prune` "unscannable
 * directory" fixtures from a clean `scanErrors` report into an uncaught `ENOTDIR` thrown out of the
 * lock's own `mkdirSync` — reddening both `test/agentdb-snapshot-rotation.test.ts`'s AM-4 case and
 * `harness-cli/test/brain-snapshots.test.ts`'s "prune mode: an unscannable store directory" case.
 */
export declare function rotatePreReindexSnapshots(dbFile: string, opts?: RotateSnapshotsOptions & {
    readonly lockTimeoutMs?: number;
}): SnapshotRotationReport;
//# sourceMappingURL=agentdb-snapshot-rotation.d.ts.map