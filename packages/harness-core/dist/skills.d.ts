/**
 * Skill discovery + loading — the consolidated filesystem loader.
 *
 * @packageDocumentation
 */
import type { CanonicalSkill } from '@dzhechkov/core';
/** A discovered skill — id plus its description, for listings. */
export interface SkillSummary {
    readonly id: string;
    readonly description: string;
}
/** Detailed skill info. */
export interface SkillInfo {
    readonly id: string;
    readonly description: string;
    readonly name: string;
    readonly trustTier: number | undefined;
    readonly version: string | number | undefined;
    readonly assetCount: number;
    readonly assetPaths: string[];
    readonly frontmatter: Record<string, unknown>;
}
/**
 * One filesystem entry skipped during skill asset discovery, named so nothing
 * vanishes silently (feature `skills-walk-symlinks-and-junk`, FR-1/FR-2). `path`
 * is the entry's own path (not its symlink target); `reason` is a short,
 * stable, human-readable tag: `'junk file (<pattern>)'` (e.g. `'junk file
 * (*.pyc)'` — fix-round 1 HIGH-1(b): the pattern that matched, not just the
 * verdict), `'junk directory (<name>)'`, `'broken symlink'`, `'symlink escapes
 * the skill directory'` (fix-round 1 AM-8), `'symlink cycle — directory
 * already visited'`, or `'unreadable directory (<errno message>)'` (fix-round
 * 1 MEDIUM-3).
 */
export interface SkippedEntry {
    readonly path: string;
    readonly reason: string;
}
/** The result of {@link walkFiles}: the real assets found, plus everything skipped. */
export interface SkillWalkResult {
    readonly files: readonly string[];
    readonly skipped: readonly SkippedEntry[];
}
/**
 * Directory names that never carry legitimate skill assets — build/cache artifacts a
 * skill author does not intend to ship. **This list IS the published contract for "what
 * counts as junk"** (fix-round 1 HIGH-1(a), REFUTED-by-contract — see
 * `packages/@dzhechkov/harness-core/README.md`, "What counts as junk"): a skill cannot
 * ship a directory bearing one of these exact names as an asset, on purpose or by
 * accident — that is the deliberate, documented trade the design makes, not an
 * oversight to be widened into content-sniffing heuristics. NOT a whitelist of allowed
 * directories: any OTHER name (including a dotdir the author added on purpose) is
 * walked as usual — filtering a user's own files is not this list's job (FR-2,
 * requirements AC-1).
 */
export declare const SKILL_JUNK_DIRS: ReadonlySet<string>;
/** Exact junk filenames skipped during skill asset discovery (FR-2). */
export declare const SKILL_JUNK_FILES: ReadonlySet<string>;
/** True when `name` matches a documented junk-file pattern (FR-2). */
export declare function isSkillJunkFile(name: string): boolean;
/**
 * Recursively list every real, non-junk file under `dir`, resolving symlinks to
 * their targets and guarding against symlink cycles.
 *
 * A `Dirent` from `readdirSync` answers `false` to BOTH `isDirectory()` and
 * `isFile()` for a symlink entry — trusting those two checks alone silently drops
 * every symlinked asset (MEASURED: 2 of 4 fixture assets vanished, exit 0). This
 * resolves each symlink with `statSync` (which follows the link) before deciding
 * whether it names a file or a directory.
 *
 * Cycle guard: each directory's `realpath` is recorded in `seenRealDirs` while
 * it is being walked and REMOVED again when its walk returns — the set is the
 * chain of ANCESTORS on the current recursion path, not every directory ever
 * visited. A directory (reached directly or through a symlink) whose real path is
 * already on that chain ends the walk there instead of recursing — this is what
 * stops `a -> ..` from hanging (AC-2; registry entry `walk-guards-cycles`). Two
 * non-cyclic aliases of the same directory (`alias1 -> shared`, `alias2 -> shared`)
 * are BOTH walked under their own logical paths (Codex r2 HIGH, lead fix): an
 * alias is not a cycle, and the earlier visited-set semantics silently dropped the
 * second one as if it were.
 *
 * Containment guard (lead item AM-8): every symlink's resolved target is checked
 * against `rootRealDir` — the real path of the directory the OUTERMOST call was
 * given (the skill directory itself, for every caller in this file) — before it is
 * followed. A symlink whose target resolves outside that root is skipped, named,
 * never bundled as an asset; `rootRealDir` is threaded through every recursive call
 * so a nested symlinked directory is still checked against the ORIGINAL skill root,
 * not against whichever subdirectory happens to be walking it.
 *
 * `readdirSync` failure (fix-round 1 MEDIUM-3) — e.g. an unreadable directory whose
 * own `realpath` still resolved — produces a named `skipped` entry, same as an
 * unresolvable `realpathSync`; it never throws out of this function or out of
 * {@link loadSkillFromDir}.
 */
export declare function walkFiles(dir: string, seenRealDirs?: Set<string>, rootRealDir?: string): SkillWalkResult;
/** Return the ids of every `<skillsDir>/<id>/SKILL.md`, sorted. */
export declare function discoverSkillIds(skillsDir: string): string[];
/**
 * Discover every skill in `skillsDir`, returning id + description.
 *
 * **Throws on the first unloadable skill — deliberately, and permanently.** This is a
 * published export; silently turning it into a skip-and-collect function would downgrade
 * every unknown third-party consumer from fail-closed to fail-silent without their
 * consent (an incomplete catalogue reported as complete). Callers that want a partial
 * listing ask for one by name: {@link listSkillsDetailed}. A pinned regression test
 * asserts this function still throws, so a future "helpful" refactor cannot quietly
 * erase the strict variant. (feature dz-cli-defects, ADR-001 as amended by AM-6.)
 */
export declare function listSkills(skillsDir: string): SkillSummary[];
/** How much of the offending file's first line is echoed back to the user. */
export declare const SKILL_FAILURE_FIRST_LINE_MAX = 100;
/** One skill directory that could not be loaded. Named, so a log is actionable. */
export interface SkillLoadFailure {
    /** The skill id (its directory name), e.g. `bto`. */
    readonly id: string;
    /** ABSOLUTE path to the offending `SKILL.md`. */
    readonly path: string;
    /** The caught error's message, verbatim — the classifier stays out of the loader. */
    readonly reason: string;
    /**
     * First line of the source text, trimmed and capped at
     * {@link SKILL_FAILURE_FIRST_LINE_MAX}; `''` when the file is unreadable. Echoing it
     * is what turns the message into a FIX — the user sees the H1 and knows to add the
     * frontmatter fence.
     */
    readonly firstLine: string;
}
/** A listing that separates what parsed from what did not. */
export interface SkillListing {
    /** Sorted by id — same order, same shape as {@link listSkills} produces today. */
    readonly skills: readonly SkillSummary[];
    /** Sorted by id. Empty when every skill loaded. */
    readonly failures: readonly SkillLoadFailure[];
}
/**
 * Attribute any skill-load throw to a file. Shared by every consumer
 * (`listSkillsDetailed`, `runInit`, `runInitSingleFileMd`, `runSync`).
 *
 * Best-effort on the first line: an unreadable file yields `''` rather than a second
 * throw — this helper runs on an error path and must never become one.
 */
export declare function describeSkillLoadFailure(skillsDir: string, id: string, error: unknown): SkillLoadFailure;
/**
 * Discover every skill in `skillsDir`, separating the ones that parsed from the ones
 * that did not. One broken `SKILL.md` never hides the rest.
 *
 * Catch policy: **every** error per id, not only `SkillDocumentError` — an `EACCES`, a
 * YAML syntax error and a Zod schema rejection are all equally "this one skill is
 * unusable". The `reason` is the caught message verbatim.
 */
export declare function listSkillsDetailed(skillsDir: string): SkillListing;
/**
 * Render a `SkillLoadFailure[]` as the diagnostic block a CLI writes to **stderr**.
 *
 * One helper, two rendering modes, chosen by the CALLER — never by the helper sniffing
 * the path. `dz list` / `dz sync` print absolute paths (the user can act on those);
 * `dz install` passes `relativeTo` = the downloaded package root, because a
 * `node_modules/**` absolute path is not something the user can act on.
 *
 * Returns `[]` for an empty input, so callers can splice it unconditionally.
 */
export declare function formatSkillLoadFailures(failures: readonly SkillLoadFailure[], opts?: {
    readonly relativeTo?: string;
}): string[];
/**
 * One skill that LOADED cleanly but could not be compiled for, or written to, the
 * target. The subject is the TARGET, never the source `SKILL.md`.
 */
export interface SkillApplyFailure {
    /** The skill id (its directory name). */
    readonly id: string;
    /** The caught error's message, verbatim. */
    readonly reason: string;
}
/**
 * Render a `SkillApplyFailure[]` as the diagnostic block a CLI writes to **stderr**.
 *
 * Deliberately a DIFFERENT header from {@link formatSkillLoadFailures}: the two kinds
 * point the user at two different files, and a shared header is what let a write
 * failure masquerade as a parse failure.
 *
 * Returns `[]` for an empty input, so callers can splice it unconditionally.
 */
export declare function formatSkillApplyFailures(failures: readonly SkillApplyFailure[]): string[];
export declare function getSkillInfo(skillsDir: string, id: string): SkillInfo | undefined;
/**
 * A {@link CanonicalSkill} plus, optionally, the {@link SkippedEntry} list
 * {@link loadSkillFromDir} collected while walking the skill's directory. The
 * field is additive and optional — a `CanonicalSkill`-typed caller (every
 * adapter, every existing consumer) sees exactly the shape it always saw;
 * only a caller that reads `.skipped` learns about junk/broken-symlink skips.
 */
export type LoadedSkill = CanonicalSkill & {
    readonly skipped?: readonly SkippedEntry[];
};
/**
 * Load one `<skillsDir>/<id>/` directory into a {@link CanonicalSkill}: its
 * `SKILL.md` document plus every other file as a bundled asset. Junk entries
 * and broken/cyclic symlinks encountered along the way are named in
 * `.skipped` (feature `skills-walk-symlinks-and-junk`, FR-1/FR-2) — omitted
 * entirely when nothing was skipped, never a silent drop.
 *
 * @throws if the skill directory has no `SKILL.md`.
 */
export declare function loadSkillFromDir(skillsDir: string, id: string): LoadedSkill;
//# sourceMappingURL=skills.d.ts.map