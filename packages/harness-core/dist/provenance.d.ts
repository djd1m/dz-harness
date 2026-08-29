/**
 * The provenance gate — nothing leaves this machine citing a source that may not.
 *
 * It checks PROVENANCE, not words. A denylist of forbidden phrases is an enumeration, and it loses
 * to the first confidential note it has never heard of; the `.gitignore` in this repository carries
 * a comment warning about exactly that mistake. An allowlist of SOURCES wins by construction: an
 * unknown source is refused because it is unknown.
 *
 * Two things this module deliberately does NOT do, both named in ADR-001 rather than implied:
 *  - it does not read CONTENT, so confidential text pasted by hand into an allowed file inherits
 *    that file's permission;
 *  - it cannot see a paraphrase with no citation. It proves what was CITED, never what was known.
 * The last line against both is a person reading the draft, and that is the design, not a gap.
 *
 * PURE: no filesystem, no git, no clock. The oracle runs in the CLI and arrives as a fact — a
 * verdict that needs a real repository to reproduce is a verdict no test can pin.
 *
 * See features/provenance-gate/03_adr/ for the decisions and the measurements behind them.
 */
/** Why one claim was refused. A CLOSED set, so a reason is machine-readable and never prose. */
export type SourceVerdict = 'allowed'
/** The claim names no source at all. A claim with no source is the thing we must not publish. */
 | 'no-source'
/** The manifest did not declare what kind of source this is — never inferred from its shape. */
 | 'unknown-kind'
/** A PUBLIC external web URL (http/https). It is already public by construction, so it cannot
 *  "leave this machine" — nothing local to protect. Refused only if the URL is malformed. */
 | 'public-url'
/** A `url` claim whose value is not a well-formed http(s) URL — a scheme this gate will not clear
 *  (a file://, a bare word, or a non-URL) must not pass as a public web source. */
 | 'malformed-url'
/** A store record that the TRACKED public list does not name. Default-deny. */
 | 'not-marked-public'
/** The path does not resolve. You cannot cite what does not exist. */
 | 'unresolvable'
/** Resolved outside the repository — a symlink out of the tree lands here too. */
 | 'outside-repo'
/** Git says this path is ignored: the owner's own boundary refuses it. */
 | 'ignored-path'
/** Not tracked by git — nobody has reviewed it, so "not ignored" proves nothing about it. */
 | 'untracked'
/** Tracked, but carrying uncommitted changes: its CURRENT contents went through no review. */
 | 'uncommitted';
export type SourceProvenanceOutcome = 'allowed' | 'blocked' | 'not-established';
/** One claim in a draft, and where it came from. */
export interface SourceClaim {
    readonly id: string;
    /** `path` — a file in the repository. `record` — an addressed row in a `.dz` store. */
    readonly kind?: string;
    readonly source?: string;
}
export interface SourceManifest {
    readonly version: number;
    readonly draft: string;
    readonly claims: readonly SourceClaim[];
}
export interface SourceProvenanceFacts {
    /**
     * Paths git reported as ignored. `null` means THE ORACLE DID NOT RUN — a different fact from
     * "nothing is ignored", and the one a naive gate reads as "everything is allowed". Measured in
     * this repo on a sibling command: `dz sync` prints `0/0` and exits 0 when it compared nothing.
     */
    readonly ignoredPaths: ReadonlySet<string> | null;
    /**
     * Record addresses declared public in a GIT-TRACKED file. Not a `visibility` field inside the
     * record: `.dz/` is gitignored, so a marker there appears in no diff, and the process that writes
     * the draft can write it too. MEASURED 2026-08-22: `grep -r '"visibility"' .dz/` returns 0 — the
     * field does not exist, and introducing it would have made "the owner opted in" mean "the
     * generator marked itself" (ADR-001).
     */
    readonly publicRecords: ReadonlySet<string>;
    /** Each `path` source resolved through the filesystem; `null` = missing or outside the repo. */
    readonly resolved: ReadonlyMap<string, string | null>;
    /**
     * Resolved paths git tracks. "Not ignored" is NOT "reviewed": a file the drafting process wrote a
     * second ago is neither, and the first version cleared it while calling it "a tracked path"
     * (cross-family review round 3, codex `gpt-5.6-sol`, 2026-08-22).
     */
    readonly trackedPaths: ReadonlySet<string>;
    /** Tracked paths with uncommitted changes — committed is what "reviewed" means here. */
    readonly dirtyPaths: ReadonlySet<string>;
}
export interface SourceClaimResolution {
    readonly id: string;
    readonly source: string | null;
    readonly verdict: SourceVerdict;
    readonly detail: string;
}
export interface SourceProvenanceDecision {
    readonly outcome: SourceProvenanceOutcome;
    /** 0 allowed · 1 blocked · 3 not established. A zero is only ever a proven pass. */
    readonly exit: 0 | 1 | 3;
    readonly claims: readonly SourceClaimResolution[];
    readonly reason: string;
}
/** Parse a manifest. Unparseable is `null` — which the caller must NOT read as "empty". */
export declare function parseSourceManifest(text: string): SourceManifest | null;
/**
 * Classify ONE claim's source.
 *
 * Order matters and is load-bearing. The KIND is read from the manifest and never guessed from the
 * string: `.dz/` holds 119 git-TRACKED files (measured), so `.dz/guard-audit.jsonl` is not ignored
 * and a shape-based guess would let it through as an ordinary repo path, skipping the public-list
 * requirement entirely.
 */
export declare function classifySource(claim: SourceClaim, facts: SourceProvenanceFacts): SourceClaimResolution;
/**
 * The whole-manifest verdict.
 *
 * Three outcomes, and neither non-pass returns zero. The dangerous one is the third: an empty
 * manifest does not mean "nothing confidential is cited", it means "we checked nothing".
 */
export declare function decideSourceProvenance(manifest: SourceManifest | null, facts: SourceProvenanceFacts): SourceProvenanceDecision;
/** What the operator sees. Every blocked claim names its id, its source and its reason. */
export declare function renderSourceProvenance(decision: SourceProvenanceDecision): string[];
//# sourceMappingURL=provenance.d.ts.map