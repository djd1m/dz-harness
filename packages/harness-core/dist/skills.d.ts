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
/** Get detailed info about a single skill without loading all assets. */
export declare function getSkillInfo(skillsDir: string, id: string): SkillInfo | undefined;
/**
 * Load one `<skillsDir>/<id>/` directory into a {@link CanonicalSkill}: its
 * `SKILL.md` document plus every other file as a bundled asset.
 *
 * @throws if the skill directory has no `SKILL.md`.
 */
export declare function loadSkillFromDir(skillsDir: string, id: string): CanonicalSkill;
//# sourceMappingURL=skills.d.ts.map