/**
 * npm-homepage — the facts behind the `dz guard` rule of the same name (backlog e5d0d383).
 *
 * Owner rule 2026-09-28 (`.claude/rules/npm-homepage.md`): every `packages/@dzhechkov/*` package, public or
 * private, carries `homepage` = exactly `https://aicoding.space`. The GitHub links are NOT replaced — npm has
 * one `homepage` field, so the site lives there and GitHub stays in `repository` (url + directory) and in
 * `bugs.url`, and the package README carries both links. The rule therefore checks all of them: dropping the
 * GitHub ones while "fixing" homepage is the exact regression the owner's clarification forbids.
 *
 * Every accepted value is an EXACT string from a closed list — no URL parsing, no normalisation (fix round 1,
 * review r1 finding 1: a substring test accepted `https://evil.example/github.com/djd1m/dz-harness`). The lead
 * measured all 57 manifests: each carries exactly the one value listed below.
 *
 * Two halves, so the evaluator is testable without a filesystem:
 *   - `npmHomepageFacts(records, discovery)` (here) is PURE: records in, per-package problem lists out;
 *   - `readNpmHomepageRecords(dir)` lives in harness-cli (`cli.ts`): it lists package directories (hidden ones
 *     included), parses `package.json`, reads `README.md`, and returns every entry it could NOT decide as a
 *     named discovery failure — a permission error is a failure, never "absent". It is NOT here because
 *     harness-core's IO ratchet (test/core-boundary.test.ts) forbids a new file importing node:fs —
 *     MEASURED 2026-09-28: 66 > pinned 65 when it lived here.
 */
/** The owner's site. Compared by strict equality: a trailing slash, a path or an anchor is a violation. */
export declare const NPM_HOMEPAGE_URL = "https://aicoding.space";
/** Accepted `repository.url` values — a closed list, compared by strict equality. One entry today. */
export declare const NPM_REPOSITORY_URLS: readonly string[];
/** The one accepted `bugs.url`. */
export declare const NPM_BUGS_URL = "https://github.com/djd1m/dz-harness/issues";
/** One package directory as the reader found it. */
export interface NpmHomepageRecord {
    /** The directory name under `packages/@dzhechkov/` — the expected tail of `repository.directory`. */
    readonly dir: string;
    readonly json?: unknown;
    readonly parseError?: string;
    /** README.md text; `null` = the file does not exist; absent = not read (treated as missing). */
    readonly readme?: string | null;
    /** README.md exists but could not be read. */
    readonly readmeError?: string;
}
/** An entry the reader could not decide (stat/read/existence failed for a reason other than "absent"). */
export interface NpmHomepageDiscoveryFailure {
    readonly path: string;
    readonly reason: string;
}
/** What the reader saw besides the records. `unreadableRoot` set ⇒ the rule is NOT ESTABLISHED. */
export interface NpmHomepageDiscovery {
    readonly failures?: readonly NpmHomepageDiscoveryFailure[];
    readonly unreadableRoot?: string;
}
/** The fact the guard rule reads: one entry per package; an empty `problems` list means compliant. */
export interface NpmHomepageFact {
    readonly dir: string;
    /** `name` from package.json when it is a string, else `packages/@dzhechkov/<dir>`. */
    readonly name: string;
    readonly problems: readonly string[];
}
/** The whole evidence set for the rule. */
export interface NpmHomepageFactSet {
    readonly packages: readonly NpmHomepageFact[];
    readonly discoveryFailures: readonly NpmHomepageDiscoveryFailure[];
    readonly unreadableRoot?: string;
}
/** Pure: evaluate each record against the field and README requirements. Private packages are NOT exempt. */
export declare function npmHomepageFacts(records: readonly NpmHomepageRecord[], discovery?: NpmHomepageDiscovery): NpmHomepageFactSet;
//# sourceMappingURL=npm-homepage.d.ts.map