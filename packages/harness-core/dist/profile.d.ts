/**
 * Operator profile (feature operator-profile, ADR-001) — WHO the assistant is talking to,
 * stored per USER and delivered as a marked block in `~/.claude/CLAUDE.md`.
 *
 * The profile is a FILE the runtime loads, not a rule the agent remembers: a rule in agent
 * memory is layer 4 of the cost-of-detection ladder and failed three times in this repo before
 * this feature existed. The block lives at layer 2 — loaded once per session, in EVERY project
 * on the machine, including projects with no `.dz/` at all.
 *
 * Two axes (ADR Decision 2): a global register plus named domains that move it. `deepDomains`
 * upgrade to full pro; `weakDomains` make a plain sentence MANDATORY, not merely default — the
 * weak list is the load-bearing one, because there NOT explaining is the failure mode.
 *
 * Boundaries baked into every rendered block (ADR Decision 3), at every register:
 * - the register governs dialogue and owner-facing surfaces only — never ADRs, commit messages,
 *   code comments, QE reports or npm READMEs;
 * - the register changes FORM, never FACTS — numbers, caveats, risks and refutations survive
 *   every level. Without that sentence "simpler please" is a hole in the Integrity Rule.
 *
 * The store is per-user under `homedir()` — NEVER under a project root (`.dz/config.json` is
 * committed in this very repo; a personal file there leaks by construction) — and mode 0600
 * (the key-custody lesson of 2026-07-15 was a 0644 world-readable key).
 *
 * Nothing in this module throws on bad input: a missing file, unreadable JSON or a wrong shape
 * is an honest verdict (`problem`), never an exception.
 *
 * @packageDocumentation
 */
/** Marker pair delimiting the profile block inside `~/.claude/CLAUDE.md`. The redaction in
 * feature-adr-checkpoints.ts keeps its OWN copies of these literals (that file stays import-free
 * so the workflow can mirror it inline); `test/profile-redaction.test.ts` pins the two pairs equal. */
export declare const PROFILE_MARKER_START = "<!-- dz:profile:start -->";
export declare const PROFILE_MARKER_END = "<!-- dz:profile:end -->";
/** Dialogue register. `pro` = name the concept and move on; `pro-lite` = concept + one plain
 * sentence; `plain` = everyday words first, the term once in parentheses. */
export type Register = 'pro' | 'pro-lite' | 'plain';
/** The accepted register values, for refusal messages (teach-target precedent: an unknown value
 * is refused NAMING the accepted set, never silently defaulted). */
export declare const REGISTERS: readonly Register[];
/** One named domain. `note` is a short qualifier rendered in parentheses, e.g. "CCIE". */
export interface Domain {
    readonly tag: string;
    readonly note?: string;
}
/** The per-user operator profile, persisted at {@link profileStorePath}. */
export interface OperatorProfile {
    readonly version: 1;
    /** ISO-8601 instant of the last write — `dz profile show` reports age from it. */
    readonly updatedAt: string;
    /** Dialogue language, e.g. 'ru'. Artifacts keep their own conventions (the scope rule). */
    readonly language: string;
    /** Global default register. */
    readonly register: Register;
    /** Domains where the register upgrades to full pro — scaffolding reads as patronising. */
    readonly deepDomains: readonly Domain[];
    /** Domains where one plain sentence is MANDATORY every time, not merely default. */
    readonly weakDomains: readonly Domain[];
    /** The operator teaches: explanations must be re-tellable, not just satisfying in the moment. */
    readonly teaches: boolean;
}
/** The owner-facing echo of a stored register — `show`/`set` print both directions. */
export declare function registerOwnerWord(register: Register): string;
/** Parse a register from the owner's own words. Returns null for anything not in the accepted
 * set — the CALLER refuses, naming {@link REGISTERS}; this function never throws and never
 * silently defaults. */
export declare function parseRegister(raw: string): Register | null;
/**
 * Parse a human-typed, comma-separated domain list — the `init` onboarding answer
 * («networking (CCIE; NSX), cloud architecture»). Rules, each from a way people actually type:
 * - split on commas OUTSIDE parentheses ("networking (CCIE, NSX)" is ONE domain, not two);
 * - an optional trailing parenthetical is the note: `networking (CCIE; NSX)` → tag `networking`,
 *   note `CCIE; NSX`;
 * - the tag is kebab-cased (lowercased, whitespace runs → `-`) so `Cloud Architecture` and
 *   `cloud architecture` are the same domain;
 * - an empty/blank answer means NONE — an empty array, never an error (onboarding must not force
 *   an answer).
 * Never throws.
 */
export declare function parseDomainList(raw: string): Domain[];
/** The domains as the text a person would have typed — the re-init prompt default, so an Enter
 * keeps what is already stored. */
export declare function domainListText(domains: readonly Domain[]): string;
/** Parse a yes/no answer in the owner's words. Returns null for anything unrecognised — the
 * caller re-asks or takes the documented default OUT LOUD; this function never guesses (the
 * measured failure: a domains line fed to a y/n question silently became `teaches: no`). */
export declare function parseYesNo(raw: string): boolean | null;
/** Absolute path of the profile store: `<home>/.dz/profile.json`. Resolves under `homedir()`
 * and NEVER under a project root — there is deliberately no projectRoot parameter (AR-2:
 * `.dz/config.json` is committed in this repo, so personal data there is a leak by construction).
 * `home` exists as an explicit override so tests run against a scratch HOME. */
export declare function profileStorePath(home?: string): string;
/** Absolute path of the delivery target: `<home>/.claude/CLAUDE.md`. */
export declare function claudeMdPath(home?: string): string;
/** Verdict-style read result — `problem` instead of a throw, always. */
export interface ProfileReadResult {
    readonly profile: OperatorProfile | null;
    readonly path: string;
    /** null when profile is non-null; otherwise says exactly what is wrong ('missing',
     * 'unreadable JSON: …', 'invalid shape: …'). */
    readonly problem: string | null;
}
/** Validate an arbitrary value into an OperatorProfile, or say precisely why not.
 *
 * TOTAL by construction (round-6 finding): the shape checks below can themselves throw on hostile
 * input — `JSON.stringify(2n)` in a verdict message is a TypeError, a getter or Proxy can throw on
 * property access — and validateProfile is called OUTSIDE the try of every no-throw caller
 * (readProfile, writeProfile, syncProfileBlock), because it is the boundary those trys rely on.
 * So the boundary itself may never leak: any internal throw becomes a refusal verdict. */
export declare function validateProfile(v: unknown): {
    profile: OperatorProfile | null;
    problem: string | null;
};
/** Read + validate the store. Missing file, unreadable JSON and a wrong shape are three DIFFERENT
 * problems, all reported, none thrown. */
export declare function readProfile(home?: string): ProfileReadResult;
/** Write the store at mode 0600 (creating `<home>/.dz/` at 0700 if needed). The chmod runs even
 * when the file pre-existed: `writeFileSync`'s mode applies only at creation. */
export declare function writeProfile(profile: OperatorProfile, home?: string): {
    path: string;
    problem?: string;
};
/**
 * Render the block CONTENT (without the markers — {@link wrapProfileBlock} adds them).
 *
 * Invariants, each pinned by a test:
 * - both fixed rules (artifact scope; form-not-facts) appear at EVERY register — they are not
 *   user settings (ADR Decision 3);
 * - deep and weak domains render visibly DIFFERENT instructions: deep = full pro, no
 *   scaffolding; weak = one plain sentence EVERY time, unprompted — mandatory, not default.
 */
export declare function renderProfileBlock(profile: OperatorProfile): string;
/** Wrap rendered content in the marker pair, ready to merge into a target file. */
export declare function wrapProfileBlock(content: string): string;
/** Extract the CONTENT between the markers of `fileContent`, or null when no complete block
 * exists. Only the FIRST block is considered (sync never writes a second one). */
export declare function extractProfileBlock(fileContent: string): string | null;
/** Pure marked-block merge (the `installDriverDocs` pattern from setup.ts, upgraded from
 * append-if-absent to replace-in-place). Foreign content — everything outside the marker pair —
 * is preserved BYTE-FOR-BYTE; `changed: false` means the file already carries exactly this
 * content (idempotence). `existing: null` means the target file does not exist yet.
 *
 * `malformed: true` (with the input returned untouched) means the file is in a state this merge
 * refuses to write over. `malformedKind` names which of the two known states it is:
 *
 * - `'dangling-start'` — a START marker with no END marker after it. The first version APPENDED
 *   a complete fresh block in that case — and the NEXT sync then paired the OLD dangling start
 *   with the NEW block's end and deleted everything between them, damaged foreign text included
 *   (the second-sync corruption, cross-family finding 2026-08-28).
 * - `'nested-markers'` — ANOTHER start marker between the chosen start and its end. This is the
 *   LEGACY residue of exactly that pre-fix append: dangling start … foreign text … appended
 *   complete block. Pairing the old start with the appended block's end would delete the foreign
 *   text (second cross-family finding, 2026-08-28), and the `dangling-start` refusal above does
 *   not fire because an end marker DOES exist after the start.
 *
 * Both states are REFUSED, never repaired automatically: nothing is written, no further nesting
 * can ever be created, and the caller reports the named verdict. A stray END marker with no
 * start before it stays harmless (the block we append is complete, and every later replace
 * anchors at OUR start marker), so it does not refuse. */
export declare function mergeProfileBlock(existing: string | null, content: string): {
    merged: string;
    changed: boolean;
    hadBlock: boolean;
    malformed?: boolean;
    malformedKind?: 'dangling-start' | 'nested-markers';
};
/** Result of {@link syncProfileBlock}. */
export interface ProfileSyncResult {
    readonly target: string;
    readonly changed: boolean;
    /** Path of the timestamped backup written BEFORE the modifying write, or null when the write
     * was a no-op or the target did not exist yet (nothing to back up). */
    readonly backup: string | null;
    readonly problem: string | null;
}
/** Write the rendered block into `<home>/.claude/CLAUDE.md`: idempotent, foreign content
 * byte-for-byte, timestamped backup before every MODIFYING write of an existing file.
 * Never throws — an I/O failure (and a malformed block, named as `malformed block:`) is a
 * `problem` verdict.
 *
 * Modes (the delivered COPIES carry the same personal profile as the 0600 store, so none of
 * them may be left to the ambient umask — the key-custody lesson again, one file over):
 * - a target this function CREATES is 0600, and a `.claude/` dir it creates is 0700;
 * - a PRE-EXISTING target keeps its owner bits exactly and loses only group/other bits
 *   (`mode & 0o700`). We deliberately do not force 0600 on a file the user owns — their owner
 *   permissions are their call — but leaving non-owner read on a file we just wrote the profile
 *   into would be the 0644 world-readable-key defect verbatim, so that much IS tightened;
 * - every backup is a fresh file of ours and is written 0600 unconditionally. */
export declare function syncProfileBlock(profile: OperatorProfile, home?: string, now?: Date): ProfileSyncResult;
/** Drift verdicts. `in-sync` is the only green; every other state names what is missing —
 * never a throw, never a silent pass (FR-9: drift is detected deterministically). */
export type ProfileDriftVerdict = 'in-sync' | 'drift' | 'no-block' | 'malformed-block' | 'no-target' | 'no-profile' | 'invalid-profile';
export interface ProfileDriftResult {
    readonly verdict: ProfileDriftVerdict;
    readonly detail: string;
}
/** Does the block currently in `<home>/.claude/CLAUDE.md` match what `profile.json` would
 * render? Compares CONTENT (a hand-edited block that still says the same bytes is in sync;
 * anything else is drift). */
export declare function checkProfileDrift(home?: string): ProfileDriftResult;
/** Whole-days age of the profile, or null when updatedAt does not parse. */
export declare function profileAgeDays(profile: OperatorProfile, now?: Date): number | null;
//# sourceMappingURL=profile.d.ts.map