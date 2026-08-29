/**
 * Intra-monorepo skill-drift guard.
 *
 * The same skill is physically duplicated across many monorepo packages
 * (`packages/@dzhechkov/*​/<skill>/` + `.claude/skills/<skill>/`). A fix applied to ONE copy
 * silently leaves the others broken — this is exactly how a CRITICAL `goap-research-ed25519`
 * self-signed-forgery exploit shipped in 10 of 12 copies, and how a `brutal-honesty-review`
 * `set -e` crash reached the PUBLISHED `@dzhechkov/skills-qe`. Both were found only by accident.
 *
 * `dz sync-upstream` only checks against EXTERNAL repos and is structurally blind to this class of
 * drift. This module is the intra-monorepo complement:
 *
 *   • `sweepSkillDrift(root)`        — detector: which shared skills byte-differ between copies.
 *   • `syncCanonicalSkill(root, s)`  — healer: overwrite every copy from `skills-meta/<skill>`.
 *
 * Both are PURE functions that return plain data — no printing, no `process.exit`, no throwing on
 * the "canonical missing" / "drift found" business cases. The CLI layer owns exit codes and I/O.
 * Dependency-free: `node:fs` / `node:path` / `node:crypto` only.
 *
 * @packageDocumentation
 */
/** One shared skill whose copies byte-differ (`driftFiles > 0`). */
export interface DriftedSkill {
    /** Skill dir basename (e.g. `goap-research-ed25519`). */
    readonly name: string;
    /** How many locations hold this skill. */
    readonly copies: number;
    /** # relative paths where the copies disagree (≥1 ⇒ drift). */
    readonly driftFiles: number;
    /** Size of the union of relative file paths across all copies. */
    readonly totalFiles: number;
    /** # (copy × relative-path) pairs where the file is absent from a copy. */
    readonly missingFiles: number;
    /** Absolute paths of every copy — lets a human / `--json` consumer jump to the drifted dirs. */
    readonly locations: readonly string[];
}
/** Options for {@link sweepSkillDrift}. */
export interface SweepOptions {
    /**
     * Which copies to compare.
     * - `'packages'` (the CI-gate default): PUBLISHED package copies only (`packages/`). The dogfood
     *   `.claude/skills/<skill>` dev copies are excluded — the repo's own `dz sync` test treats them as
     *   "legitimately lagging" the published version, so counting them makes the gate red-on-arrival.
     *   The dangerous drift (goap, brutal-honesty) was always between PUBLISHED packages.
     * - `'installs'` (what the `no-skill-drift` HARD rule uses): packages + every per-target install
     *   root EXCEPT {@link DEV_SKILL_ROOT}. Machine-generated installs have no licence to lag, so
     *   holding them to byte-identity is a gate that can actually be satisfied — unlike `'all'`,
     *   which includes the hand-edited dev tree and is therefore red-on-arrival as a gate.
     * - `'all'`: packages + EVERY per-target skills install root ({@link SKILL_INSTALL_ROOTS}) — the
     *   raw sweep the audit script does. A root that is absent, or present without a `SKILL.md`,
     *   contributes nothing, so this is inert for a repo that installs only one target.
     */
    readonly scope?: 'packages' | 'installs' | 'all';
    /** Skill basenames whose drift is ACCEPTED (documented intentional forks) — reported separately, never counted as gate drift. */
    readonly allowlist?: readonly string[];
}
/** Result of a read-only intra-monorepo drift sweep. */
export interface SweepResult {
    /** # skills present in ≥2 locations (within scope). */
    readonly duplicated: number;
    /** Skills that byte-differ AND are not allowlisted, sorted by `driftFiles` desc — the gate keys on this. */
    readonly drifted: readonly DriftedSkill[];
    /** Skills that byte-differ but are allowlisted (intentional) — surfaced for transparency, not gated. */
    readonly allowlisted: readonly DriftedSkill[];
}
/**
 * How the canonical was resolved for a {@link syncCanonicalSkill} run.
 * - `from`        — an explicit `--from <dir>` was supplied.
 * - `skills-meta` — no `--from`; `skills-meta/<skill>` exists and was used.
 * - `auto`        — no explicit canonical; the WRITE path auto-detected the most-complete copy
 *                   (opt-in `--auto` ONLY — never a bare default).
 * - `none`        — no canonical could be resolved. `--check` still runs a canonical-free peer
 *                   comparison; a bare write refuses (safe-by-default).
 */
export type CanonicalSource = 'from' | 'skills-meta' | 'auto' | 'none';
/** Options for {@link syncCanonicalSkill}. */
export interface SyncCanonicalOptions {
    /** Report drift only, write NOTHING (CI mode). */
    readonly check?: boolean;
    /** Override the canonical source dir (default: `skills-meta/<skill>`). */
    readonly from?: string;
    /**
     * Opt-in for the WRITE path ONLY: when no `--from`/`skills-meta` canonical exists, auto-detect the
     * most-complete copy as canonical instead of refusing. A HEURISTIC — the CLI prints a loud warning
     * naming the pick + the exact overwrite list. Never affects the read-only `check` path.
     */
    readonly auto?: boolean;
}
/** Result of a canonical-wins sync (or a `check:true` dry-run / canonical-free peer check). */
export interface SyncResult {
    /** Resolved canonical dir (abs). Empty `''` in canonical-free peer / refuse modes. */
    readonly canonical: string;
    /** Whether a canonical source dir was resolved. `false` ⇒ `resolvedFrom === 'none'`. */
    readonly canonicalExists: boolean;
    /** How the canonical resolved: `from` | `skills-meta` | `auto` | `none`. */
    readonly resolvedFrom: CanonicalSource;
    /** # copies compared — non-canonical copies in resolved modes; ALL peers in canonical-free mode. */
    readonly copies: number;
    /** # copies overwritten (0 when `check:true`, in peer mode, or when a bare write refuses). */
    readonly synced: number;
    /** # copies/files that differ (from canonical in resolved modes; between peers in canonical-free mode). */
    readonly drifted: number;
    /** Abs paths of copies written (empty when `check:true` / peer / refuse — proves no writes). */
    readonly wrote: readonly string[];
}
/**
 * Detect intra-monorepo skill drift: find every skill duplicated across ≥2 locations and report
 * which copies byte-differ. Pure port of `scripts/drift-sweep-skills.mjs`.
 *
 * `result.drifted.length === 0` is the exact condition the CI gate keys on.
 */
export declare function sweepSkillDrift(root: string, opts?: SweepOptions): SweepResult;
/**
 * Heal one skill: treat the resolved canonical (`--from` → `skills-meta/<skill>` → `--auto`
 * most-complete copy) as authoritative and overwrite every other copy in the monorepo, proving
 * byte-identity. Pure port of `scripts/sync-canonical-skill.mjs`, extended with a canonical-free path.
 *
 * `check:true` writes NOTHING (`wrote` stays empty) and only reports the drift count.
 * Default overwrites drifting copies; a subsequent {@link sweepSkillDrift} then reports 0 drift.
 *
 * When NO canonical resolves (`resolvedFrom === 'none'` — no `--from`, no `skills-meta`, no `--auto`):
 *   • `check:true` → CANONICAL-FREE peer check: `drifted` = # files that differ ACROSS the copies
 *     (byte-identical copies ⇒ `drifted === 0`). Reuses {@link comparePeers} — the exact sweep logic.
 *   • write (bare) → REFUSES: returns `wrote:[]`, `synced:0`, mutates NOTHING. Safe-by-default: the
 *     tool never guesses a canonical for a write, because a wrong pick destroys the good copy. The
 *     operator must pass `--from`, run `--check`, or opt in to `--auto` (which the CLI announces).
 *
 * This function never throws / never `process.exit`s — the CLI owns exit codes, printing, and the
 * loud `--auto` warning.
 */
export declare function syncCanonicalSkill(root: string, skill: string, opts?: SyncCanonicalOptions): SyncResult;
//# sourceMappingURL=skill-drift.d.ts.map