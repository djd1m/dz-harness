/**
 * The bare stub markers, ASSEMBLED so this module never fires on itself. Matched case-SENSITIVELY
 * (measured: case-insensitivity doubles hits and adds only prose) with hard word boundaries on both
 * sides, so a marker embedded in a word (a codename, a longer identifier) does not fire.
 */
export declare const STUB_MARKERS: readonly string[];
/**
 * Stub PHRASES: matched case-insensitively (a phrase is English, not a convention), with letter
 * boundaries. Assembled for the same self-exemption reason.
 */
export declare const STUB_PHRASES: readonly string[];
/**
 * File extensions the scan reads. EXPLICIT and testable — never a silent glob. Fixture/test paths
 * are NOT auto-exempt: a marker you just added to a fixture is still a decision, and the waiver is
 * where that decision gets its reason.
 */
export declare const STUB_SCAN_EXTENSIONS: readonly string[];
/** Is this path one the stub scan reads? (extension allowlist, case-insensitive on the extension) */
export declare function scannableStubPath(path: unknown): boolean;
export interface StubFinding {
    readonly path: string;
    /** 1-based line number. */
    readonly line: number;
    readonly kind: 'marker' | 'reasonless-waiver';
    /** which marker/phrase matched (for 'marker'), or the refusal text (for 'reasonless-waiver'). */
    readonly detail: string;
}
/** A config waiver: path-keyed, reason MANDATORY. A reasonless entry is refused, never honoured. */
export interface StubWaiver {
    readonly path?: string;
    readonly reason?: string;
}
/**
 * Scan ONE file's text. Case-sensitive bare markers + case-insensitive phrases, word-bounded.
 * Markdown gets PROSE scoping: fenced code blocks and inline backtick spans are QUOTES of a marker,
 * not stubs (the claim-check backtick-literal convention) — a doc explaining this very gate scans
 * clean, while a naked stub line in doc prose still fires. Code files are scanned in full: a marker
 * a code file must legitimately carry (another gate's source, a fixture) takes an inline
 * `no-stubs: <reason>` waiver — visible, reasoned, greppable.
 */
export declare function scanStubs(path: string, text: unknown): StubFinding[];
/**
 * The aggregate check the guard rule calls: scan the CHANGED files whose contents were gathered,
 * then apply config waivers. Missing contents for a changed file ⇒ that file reports nothing
 * (fail-open on missing evidence — the standing guard contract; a deleted file has no contents).
 *
 * Config-waiver semantics: an entry with a non-empty `path` AND a non-empty `reason` exempts that
 * exact repo-relative path. An entry with a path but NO reason is REFUSED as its own finding and
 * exempts nothing. An entry with no path at all is inert garbage and is ignored (there is nothing
 * it could exempt, and inventing a finding for it would punish a stray comma).
 */
export declare function checkNoStubs(files: readonly string[], contents: Readonly<Record<string, string>> | undefined, waivers: readonly StubWaiver[] | undefined): StubFinding[];
//# sourceMappingURL=no-stubs.d.ts.map