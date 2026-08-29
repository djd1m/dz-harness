// `no-stubs` — a deterministic layer-1 scan for unfinished-stub markers left in CHANGED files
// (backlog 0b403a0106103901, Karpathy-Michaels rule XI). `dz claim-check` catches false CLAIMS in
// prose; an unfinished stub in code was, until this rule, caught only by a QE agent's judgment
// (layer 4 on the cost-of-detection ladder). A five-line grep is layer 1 — cheap, deterministic,
// silent-proof — so that is where this check lives.
//
// MEASURED before design (2026-08-10, this repo): a case-INSENSITIVE whole-tree scan over
// packages/@dzhechkov/*/{src,lib,skills} yields 32 hits and over {test,fixtures} another 25 — the
// clear majority ancient and legitimate (prose "placeholder", a `todo` keyword list, `xxx` in an
// example URL). Two design decisions fall straight out of that measurement:
//   1. SCOPE = the CHANGE-SET, not the tree. The gate catches what YOU left in THIS change; it does
//      not relitigate 25 ancient fixture markers. The change-set is the same working-tree
//      `git status --porcelain` diff the readme-first rule and the template-rule `change` fact
//      already use — one notion of "changed", not a third.
//   2. CASE-SENSITIVE bare markers. Dropping case halves the hits (32 → 16) and EVERY line the
//      relaxation would add was inspected and found to be prose, not a stub. The uppercase
//      convention is the stub convention; lowercase is English.
//
// SELF-EXEMPTION IS STRUCTURAL, NOT A PATH SKIP: every marker below is assembled from fragments at
// module load, so this file — and any file that builds its patterns the same way — contains no
// literal marker for the scan to find. A test proves the scan of this very source yields nothing.
//
// PURE: no filesystem, no child_process. The caller (CLI / guard facts gatherer) hands in paths,
// contents, and config waivers; everything here is deterministic string work.
//
// ── KNOWN LIMITS (conscious trade-offs — the rule SAYS them rather than implying totality) ──────
// A guarantee the code asserts but does not hold is worse than an honest limit. Each item below is
// a DECISION, not an oversight; none is silently patched around.
//
// • WHOLE-LINE inline waiver (FN-2). The waiver token exempts the ENTIRE line it appears on
//   (indexOf-based, no position check) — any line can be silenced by appending the token. The
//   defence is AUDITABILITY, not prevention: the token is a fixed greppable string, so every
//   silencing is one grep away. That is a layer-4 defence (reviewer judgment over grep output) by
//   the cost-of-detection ladder, and it is named as such here on purpose.
// • REASON QUALITY is not judged (FN-6). A junk reason ('.', 'x') satisfies the reason
//   requirement. The design stops FORGETTING a reason, not FAKING one — a deterministic layer
//   cannot judge whether a reason is honest; that is review-plane work.
// • MARKDOWN FENCE MODEL is a single boolean toggle (FN-4). It cannot model CommonMark: a
//   mismatched pair of tilde/backtick fence styles, an INDENTED fence, an unclosed fence running
//   to EOF (everything after it reads as fenced ⇒ skipped), and a marker sitting on the fence
//   info-string line itself are all mis-scoped. Good enough for the docs this repo writes; not a
//   CommonMark parser and not claimed to be one.
// • GIT-QUOTED PATHS are not decoded (FN-3). A path `git status --porcelain` quotes (spaces,
//   non-ASCII under core.quotePath=true — the default) arrives here with quote characters baked
//   in, matches no real file, and is therefore NOT scanned. Fail-open by shape, and invisible per
//   file; the aggregate skipped-files note is the only trace when contents were also not gathered.
// • EXTENSION ALLOWLIST is a TS-monorepo set (FN-8). Extensionless bin scripts, Dockerfile,
//   Makefile, .txt/.html/.css/.vue/.svelte/.c/.cpp/.php/.toml/.sql/.ps1/.kt/.swift are NOT
//   scanned. MED risk if this rule template ships into a polyglot repo — extend
//   STUB_SCAN_EXTENSIONS there; the list is exported and testable for exactly that reason.
// • STAGED-BUT-NOT-WORKTREE content is not read (FN-5). The gatherer reads the WORKING TREE; a
//   change staged in the index but reverted in the worktree scans as the worktree text. Design-
//   consistent for the publish op, which packs the worktree — the index never ships.
// • CONFIG WAIVERS match the EXACT repo-relative path string. No normalization, no globs: a
//   waiver for a path spelled differently than git spells it simply does not match, and the
//   finding FIRES. Errs toward firing — the safe side for an exemption mechanism.
/**
 * The bare stub markers, ASSEMBLED so this module never fires on itself. Matched case-SENSITIVELY
 * (measured: case-insensitivity doubles hits and adds only prose) with hard word boundaries on both
 * sides, so a marker embedded in a word (a codename, a longer identifier) does not fire.
 */
export const STUB_MARKERS = [
    'TO' + 'DO',
    'FIX' + 'ME',
    'HA' + 'CK',
    'XX' + 'X',
    'PLACE' + 'HOLDER',
];
/**
 * Stub PHRASES: matched case-insensitively (a phrase is English, not a convention), with letter
 * boundaries. Assembled for the same self-exemption reason.
 */
export const STUB_PHRASES = ['imple' + 'ment later'];
// One regex per class, built once. `(?<![A-Za-z0-9_])` / `(?![A-Za-z0-9_])`: a marker glued to a
// word character on either side is part of an identifier/hash/codename, not a stub. XXXX therefore
// does NOT match the three-letter marker (its neighbours are word chars), and lowercase variants of
// the bare markers never match at all.
const BARE_RE = new RegExp('(?<![A-Za-z0-9_])(' + STUB_MARKERS.join('|') + ')(?![A-Za-z0-9_])');
const PHRASE_RE = new RegExp('(?<![A-Za-z])(' + STUB_PHRASES.join('|').replace(/ /g, '\\s+') + ')(?![A-Za-z])', 'i');
/**
 * The inline waiver token: a line carrying `no-stubs: <reason>` is exempt — WITH a non-empty reason.
 * A reasonless waiver is REFUSED LOUDLY (its own finding): an exemption you cannot explain is a
 * silent allowlist, the recurring defect class this repo keeps re-learning. The reason-required
 * shape follows the `dz feature-adr-setup --guards` waiver precedent (`waivers: [{path, reason}]`,
 * "a waiver without a reason is itself a violation").
 */
const WAIVER_TOKEN = 'no-stubs:';
/**
 * File extensions the scan reads. EXPLICIT and testable — never a silent glob. Fixture/test paths
 * are NOT auto-exempt: a marker you just added to a fixture is still a decision, and the waiver is
 * where that decision gets its reason.
 */
export const STUB_SCAN_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.go', '.rs', '.java', '.rb', '.sh', '.bash',
    '.md', '.mdx', '.markdown',
    '.yml', '.yaml', '.json',
];
/** Is this path one the stub scan reads? (extension allowlist, case-insensitive on the extension) */
export function scannableStubPath(path) {
    if (typeof path !== 'string' || path.length === 0)
        return false;
    const lower = path.toLowerCase();
    return STUB_SCAN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
function isMarkdown(path) {
    const lower = path.toLowerCase();
    return lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.markdown');
}
/** Mask inline `code spans` with spaces (length-preserving, so line/column geometry survives). */
function maskInlineCode(line) {
    return line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
}
/**
 * Scan ONE file's text. Case-sensitive bare markers + case-insensitive phrases, word-bounded.
 * Markdown gets PROSE scoping: fenced code blocks and inline backtick spans are QUOTES of a marker,
 * not stubs (the claim-check backtick-literal convention) — a doc explaining this very gate scans
 * clean, while a naked stub line in doc prose still fires. Code files are scanned in full: a marker
 * a code file must legitimately carry (another gate's source, a fixture) takes an inline
 * `no-stubs: <reason>` waiver — visible, reasoned, greppable.
 */
export function scanStubs(path, text) {
    if (typeof text !== 'string' || text.length === 0)
        return [];
    const md = isMarkdown(path);
    const out = [];
    let inFence = false;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        if (md && /^\s*(```|~~~)/.test(raw)) {
            inFence = !inFence;
            continue;
        }
        if (md && inFence)
            continue;
        const line = md ? maskInlineCode(raw) : raw;
        // Inline waiver first: with a reason ⇒ the line is exempt; without one ⇒ refuse loudly AND
        // leave the marker finding in place (a refused waiver must not half-work).
        const w = line.indexOf(WAIVER_TOKEN);
        if (w >= 0) {
            const reason = line.slice(w + WAIVER_TOKEN.length).replace(/(\*\/|-->|#>)\s*$/, '').trim();
            if (reason.length > 0)
                continue;
            out.push({ path, line: i + 1, kind: 'reasonless-waiver', detail: `inline waiver ("${WAIVER_TOKEN}") carries NO reason — refused; a waiver you cannot explain is a silent allowlist` });
        }
        const bare = BARE_RE.exec(line);
        if (bare && bare[1] !== undefined) {
            out.push({ path, line: i + 1, kind: 'marker', detail: bare[1] });
            continue;
        }
        const phrase = PHRASE_RE.exec(line);
        if (phrase && phrase[1] !== undefined)
            out.push({ path, line: i + 1, kind: 'marker', detail: phrase[1] });
    }
    return out;
}
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
export function checkNoStubs(files, contents, waivers) {
    const out = [];
    const waived = new Set();
    for (const w of Array.isArray(waivers) ? waivers : []) {
        if (!w || typeof w !== 'object' || typeof w.path !== 'string' || w.path.trim() === '')
            continue;
        const reason = typeof w.reason === 'string' ? w.reason.trim() : '';
        if (reason.length > 0)
            waived.add(w.path);
        else
            out.push({ path: w.path, line: 0, kind: 'reasonless-waiver', detail: 'config waiver (stubWaivers) carries NO reason — refused; add a reason or remove the entry' });
    }
    for (const f of Array.isArray(files) ? files : []) {
        if (!scannableStubPath(f) || waived.has(f))
            continue;
        const text = contents?.[f];
        if (typeof text !== 'string')
            continue; // no evidence gathered — fail-open, never guessed
        out.push(...scanStubs(f, text));
    }
    return out;
}
//# sourceMappingURL=no-stubs.js.map