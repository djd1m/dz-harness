/**
 * Per-session retro & co-learning loop (feature session-retro-colearn, ADR-001).
 *
 * At session end, `dz retro` mines the CURRENT session transcript for recurring PROCESS rakes, drills the
 * user (socratic + checklist), and teaches/reinforces the agent — from the same mistake ("учиться вместе").
 * The recurrence ledger IS the `dz teach` store (domain `retro`), so agent-recall and user-recurrence read
 * ONE store (Step-0 recall: a feedback loop needs collect + rank + apply, not two write-only logs).
 *
 * parse/detect/render are PURE + deterministic (sorted, no clock/random); the stream/find helpers do disk
 * I/O with TOP-LEVEL node:fs (harness-core is ESM — a lazy require() is undefined at runtime; the R1 footgun)
 * and NEVER slurp a whole transcript (they reach ~95 MB — read + split lines, parse line-by-line).
 *
 * SAFETY PROPERTY (ADR-001 §3, load-bearing): a rake seen for the FIRST time (effective count < threshold)
 * is taught silently but NOT drilled — no nagging on a one-off. Drills are for recurrent patterns only.
 */
import { existsSync, readFileSync, readdirSync, statSync, openSync, readSync, closeSync, writeFileSync, renameSync, unlinkSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { withProjectLockSync, NamedLockTimeoutError } from './named-lock.js';
export const RETRO_DOMAIN = 'retro';
export const DEFAULT_DRILL_THRESHOLD = 2;
export const PROCESS_SIGNATURES = [
    {
        id: 'claimed-done-without-verify',
        label: 'claimed done/fixed without running a verification',
        socratic: 'Before you typed "done" — what exact command would have PROVEN it? Predict it, then check whether you actually ran it.',
        checklist: 'Run the verification (test / build / repro) and READ its output BEFORE claiming done. No completion claim without fresh evidence.',
        skill: 'validate',
    },
    {
        id: 'n-fix-cycles',
        label: 'multiple fix→break→fix cycles on one file (no root cause)',
        socratic: 'After the 2nd failed fix — did you find the ROOT cause, or keep patching symptoms? Predict the real cause before the next change.',
        checklist: 'Stop after 2 failed attempts. Revert, find the root cause (trace the bad value to its source), then ONE fix.',
        skill: 'systematic-debugging',
    },
    {
        id: 'ignored-user-correction',
        label: 'the user had to correct the same point repeatedly',
        socratic: 'When the user said "нет/wrong" the 2nd time — what did you keep assuming? Predict the misread before re-reading their message.',
        checklist: 'On the 2nd correction, STOP and re-read the user\'s messages literally. Restate the ask back before acting.',
    },
    {
        id: 'committed-without-verify',
        label: 'git commit after a code change without running tests/build first',
        socratic: 'Before that `git commit` — did the tests/build actually pass in THIS session, or did you assume? Predict what a fresh run would show.',
        checklist: 'Run the tests/build (and read the output) BEFORE `git commit`. A green commit you did not verify is a guess.',
        skill: 'validate',
    },
    {
        id: 'correction-narrated-without-teach',
        label: 'admitted an error in chat but never recorded it with `dz teach`',
        socratic: 'You wrote «моя ошибка» / "correction of record" — where is the `dz teach` from that same turn? Predict what the lesson text (with its reproducer) should have been, then check the store.',
        checklist: 'Narrating and recording are ONE action: in the SAME turn as the admission, run `dz teach "<lesson + reproducer>"`, then verify with a control `dz recall <keywords>` that surfaces it as a top hit. Chat is layer 4 — it compacts away; the store does not.',
    },
];
for (const s of PROCESS_SIGNATURES)
    Object.freeze(s);
Object.freeze(PROCESS_SIGNATURES);
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// NB: `\b` is an ASCII word boundary — it does NOT anchor Cyrillic (the R2 cross-model-QE lesson), so the
// Russian alternatives use a leading letter-class lookbehind only (no TRAILING lookahead — it would reject
// inflected stems like "прошли/проходят/исправила"; cross-model QE caught the truncated-stem miss).
const DONE_RE = /(?<![a-zа-яё])(done|fixed|works now|passes|passing|готово|исправил\w*|работает|прошл\w*|проход\w*)/i;
const VERIFY_RE = /\b(test|tests|vitest|pytest|jest|npm test|pnpm test|npm run|tsc|typecheck|noEmit|cargo test|go test|build|repro|coverage|lint)\b/i;
// Negation immediately before a done-claim ("not done", "isn't fixed", "не готово") — suppress the accusation.
const NEG_RE = /\b(not|isn'?t|aren'?t|wasn'?t|won'?t|can'?t|couldn'?t|didn'?t|no longer)\b|(?<![a-zа-яё])(не|нет|ещё не|еще не)(?![a-zа-яё])/i;
// Explicit corrections only — dropped bare "again/wrong" (matched "thanks again" / "don't get me wrong").
const CORRECTION_RE = /(?<![a-zа-яё])(нет,|не так|неверно|не то|переделай)(?![a-zа-яё])|\b(that'?s not right|not right|that'?s wrong|incorrect|redo this|you misread)\b/i;
const WINDOW = 8;
// A verification is a real test/build INVOCATION at a command boundary — NOT any Bash text containing
// "test" (cross-model QE: `echo 'tests not run'` was spoofing it). Used for committed-without-verify.
const VERIFY_CMD_RE = /(?:^|&&|\|\||;|\|)\s*(?:npm|pnpm|yarn|npx|bun|deno|cargo|go|make)\b[^&|;]*\b(?:test|build|tsc|typecheck|noemit|check|lint|coverage)\b|(?:^|&&|;|\s)(?:vitest|jest|pytest|tsc)\b/i;
// A code change (not a docs/config-only edit) — a docs commit without a test is not a rake (cross-model QE).
const CODE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|c|h|cc|cpp|css|scss|sh|sql|vue|svelte)$/i;
// A real `git commit` command (allows -C/flags), anchored to a command boundary so `echo 'git commit'`
// and `git log --grep commit` do NOT count (cross-model QE).
const GIT_COMMIT_RE = /(?:^|&&|\|\||;|\|)\s*git(?:\s+-[A-Za-z-]+(?:\s+\S+)?)*\s+commit\b/;
// ── correction-narrated-without-teach (feature narrated-error-must-be-taught, ADR-001) ─────────────
// The owner rule of 2026-08-28: an error ADMITTED in chat must be TAUGHT — narration without a
// `dz teach` is the rake the owner rule was written for (the record of the pipe-exit-code repeat is
// CLAUDE.md § «Narrated errors are taught in the same turn» — a chat observation, not a re-runnable
// measurement, so no count is claimed here). Cyrillic-safe:
// leading letter-class lookbehind, no `\b` (does not anchor Cyrillic), inflected stems tolerated
// (ошибся/ошибалась/ошиблись; моей/мою ошибку). HONEST LIMITS, stated rather than papered over:
//  · quotes are recognised ONLY as `>`-prefixed lines gated by a small fixed attribution list
//    («ревью», reviewer, Codex, grade) — a review pasted WITHOUT `>` markers still fires (we accept
//    that over missing real admissions), and any other quoting style is invisible to the heuristic;
//  · the "REFUTED" possessive gate is per-EVENT, not per-sentence — a "my" from another clause can
//    arm it; and it is case-sensitive by design (lowercase "refuted" quotes ordinary prose);
//  · EN coverage is deliberately narrow ("correction of record", possessive-gated "REFUTED"): a
//    plain "I was wrong" does not fire — extend only on measured evidence, precision first.
// Round 3, P1-1: the `я ошиб\w*` branch used to match the NOUN — «Я ошибку валидации исправил» is a
// COMPLETION REPORT, the commonest sentence an assistant writes, and it armed a teaching debt. The
// branch is now an ALLOWLIST of confession forms: the reflexive verb (ошибся/ошиблась/ошиблись), its
// imperfective and present (ошибался/ошибалась/ошибались/ошибаюсь) and the adverb (ошибочно). The
// noun survives ONLY in the possessive form the owner rule names literally, «моя ошибка» — a first
// branch that was always separate. MEASURED, reproducer
// `node features/narrated-error-must-be-taught/07_code_changes/field-admission-verb-probe.mjs`:
// over 95 transcripts the old and the new branch fire on the SAME 126 of 982 assistant texts — the
// tightening costs zero recall in the field. The defect itself is proven synthetically, on the
// reviewer's own string and two siblings (`--synthetic`), because this corpus happens to contain no
// instance of the noun form; that is stated rather than dressed up as a measured win.
// The adverb is in the allowlist for a measured reason: a verb-only draft dropped exactly one real
// field admission («я ошибочно склеил их»), quoted by `--removed`.
const ADMISSION_RE = /(?<![a-zа-яё])(?:мо(?:я|ей|ю|и|их)\s+ошибк\w*|я\s+(?:ошиб(?:ся|лась|лись)|ошиба(?:юсь|лся|лась|лись)|ошибочно)(?![a-zа-яё])|я\s+был[аи]?\s+неправ\w*|мой\s+диагноз[^.\n]{0,80}?невер\w*|correction of record)/i;
const FIRST_PERSON_RE = /(?<![a-zа-яё])(?:my|мой|моя|моё|мои|мою|моей|моего|моих)(?![a-zа-яё])/i;
const REFUTED_RE = /\bREFUTED\b/; // case-sensitive — see limits above
const ATTRIBUTION_RE = /(?<![a-zа-яё])(?:ревью|reviewer|codex|grade)(?![a-zа-яё])/i;
// A teach MENTION in event text: `dz teach`, `…/bin.js teach` (quoted path tolerated), `$DZ teach`.
// Used by the DETECTOR only (anti-accusation register — prefer a miss to a false "you never
// taught"); the sentinel requires the strict command form below.
const TEACH_RE = /(?:(?<![\w.$-])dz|bin\.js['"]?|\$DZ)\s+teach(?![a-zа-яё])/i;
// A teach INVOCATION as an EXECUTED COMMAND (cross-family QE P1-2): anchored at a COMMAND BOUNDARY
// (start, or after && ; | ||), optional `node` + path prefix, and accepted ONLY from a Bash
// tool_use event — never from tool_result OUTPUT and never from prose. Without the anchor,
// `echo "dz teach later"` / `grep "dz teach"` / a tool result echoing the phrase all CLEARED the
// sentinel with no lesson stored — a self-absolving loophole. Honest limits: this is a regex over
// a shell string, not a shell parser — a quoted `"…; dz teach …"` still matches (boundary chars
// inside quotes), and a `VAR=1 dz teach` env-prefix form does not; both are accepted as-is.
// ADR-005: the `m` flag makes the START OF EVERY LINE a boundary too, so a multi-line Bash command
// whose second line IS the teach (`cd /b\ndz teach …`; the dominant field form `DZ=…; B=…\n$DZ teach
// … --project $B`) pays. MEASURED 2026-09-06 over 95 transcripts — reproducer:
// `node features/narrated-error-must-be-taught/07_code_changes/field-teach-boundary-probe.mjs`
// → of 448 teach-shaped Bash strings, 89 paid under the old single-line `/i` regex, 241 more pay
// only once `m` is on, and 118 stay refused for other reasons. The REFUSE side is unchanged
// (every P1-2 decoy still leaves the debt armed).
// Named, accepted residual: a heredoc BODY line beginning with `dz teach` now reads as a command and
// pays — a regex is not a shell parser; ADR-003 Option C (tokenizer) is the deferred fix.
const TEACH_CMD_RE = /(?:^|&&|\|\||;|\|)\s*(?:node\s+)?(?:[^\s&|;]*\/)?(?:dz|bin\.js['"]?|\$DZ)\s+teach(?![a-zа-яё])/im;
// R1 (fix round 2, cross-family review of the fix round — Codex `gpt-5.6-sol`): the command TEXT
// proves a teach stood at a command boundary, never that it RAN. The reviewer's reproducer
// `exit 0\ndz teach "never runs"` matched `TEACH_CMD_RE` and settled the debt with nothing stored.
// So the text stays NECESSARY and this receipt — a line `dz teach` itself prints once the store was
// written — is what is SUFFICIENT. Accepted write-bearing lines include `Learned: "…"`,
// `Enriched: "…"`, `Reinforced existing: …`, `↳ reinforced …`,
// `↳ mirrored to vector tier (…)`, and positive `Imported N pattern(s) …`.
// Search decoded result text before truncating the diagnostic excerpt; anchor each marker to an
// output line so a filename cannot masquerade as a positive import receipt.
// Historical field probe under the earlier, broader receipt matcher; these counts are not a
// coverage claim for the stricter markers above. Reproducer:
// `node features/narrated-error-must-be-taught/07_code_changes/field-teach-receipt-probe.mjs`:
// of 329 executed-teach-shaped Bash calls in 95 transcripts, 288 carried a receipt in their paired
// result, 41 did not (decoys, failures, and redirected stdout), and 4 were is_error. Receipt-less
// calls remain armed. A matching store row cannot attribute a write to this specific call.
// Store-path and count lines also appear after a zero-row import, so neither proves a lesson was
// committed. Anchor each marker to its own output line: an import filename can contain a phrase
// such as "Imported 1 pattern" even when the actual imported count is zero.
const TEACH_RECEIPT_RE = /^(?:Learned:\s*"|Enriched:\s*"|Reinforced existing:\s+\S+|[ \t]*\u21b3[ \t]*(?:reinforced\b|mirrored to vector tier\b)|Imported [1-9]\d* pattern\(s\) from )/m;
// The injected debt directive itself names `dz teach` and lands in the transcript — without this
// exclusion the scanner would read its OWN directive as the payment (ADR-001 D4, the self-clearing
// trap). Events carrying the marker are excluded from BOTH teach and admission matching.
export const RETRO_DEBT_MARKER = '⚠ RETRO DEBT';
/** A teach MENTION in this event's text — never inside the injected directive (self-clear trap).
 * Detector register only; the sentinel uses {@link isTeachCommand}. */
function isTeachText(text) {
    return !text.includes(RETRO_DEBT_MARKER) && TEACH_RE.test(text);
}
/** A REAL executed teach: a Bash tool_use whose COMMAND invokes teach at a command boundary.
 * tool_result events carry no `tool` name in this stream, so echoed output can never qualify. */
function isTeachCommand(e) {
    return e.kind === 'tool' && e.tool === 'Bash' && !e.text.includes(RETRO_DEBT_MARKER) && TEACH_CMD_RE.test(e.text);
}
/**
 * The admission snippet of an assistant event, or null. Applies the quoted-review control and the
 * REFUTED possessive gate; excludes events carrying the directive marker (they QUOTE the snippet).
 */
function admissionSnippet(text) {
    if (text.includes(RETRO_DEBT_MARKER))
        return null;
    const m = ADMISSION_RE.exec(text);
    const r = REFUTED_RE.exec(text);
    const refutedAdmits = r !== null && FIRST_PERSON_RE.test(text.slice(0, r.index));
    if (m === null && !refutedAdmits)
        return null;
    if (ATTRIBUTION_RE.test(text)) {
        // Attribution present: an admission counts only if a marker appears on an UNQUOTED line.
        const unquoted = text
            .split('\n')
            .some((line) => !/^\s*>/.test(line) && (ADMISSION_RE.test(line) || (refutedAdmits && REFUTED_RE.test(line))));
        if (!unquoted)
            return null;
    }
    const idx = m !== null ? m.index : r.index;
    return text.slice(Math.max(0, idx - 30), idx + 170);
}
/**
 * Detect PROCESS rakes over the event stream. PURE + deterministic. Conservative (high-precision): prefer a
 * miss to a false accusation (a wrong "you claimed done without testing" erodes trust worse than a miss).
 * Returns ONE aggregated hit per signature that fired, `withinSession` = occurrence count.
 */
export function detectProcessRakes(events) {
    const counts = new Map();
    const bump = (sig, ev) => {
        const c = counts.get(sig) ?? { n: 0, evidence: [] };
        c.n += 1;
        if (c.evidence.length < 3)
            c.evidence.push(ev.replace(/\s+/g, ' ').trim().slice(0, 120));
        counts.set(sig, c);
    };
    // NB: no `didnt-read-before-edit` signature — the harness ENFORCES read-before-edit (an Edit fails
    // without a prior Read), so a genuine violation is near-impossible; that signal was pure artifact
    // (cross-session / bounded-window reads produced false hits on the dogfood run — that run is not
    // reproducible from this repo, so no count is quoted) and was dropped after cross-model QE.
    const editsPerFile = new Map();
    const failedAfterEdit = new Set(); // files that had a TEST failure after being edited
    let lastEditedFile;
    let changedSinceCommit = false; // a CODE Edit/Write happened since the last commit
    let verifiedSinceCommit = false; // a test/build ran AFTER the last code change
    const TESTFAIL_RE = /\b(fail(ed|ing|s)?|assertion|assert|expected|not ok|panic|traceback|error ts\d|\d+ failed)\b/i;
    // correction-narrated-without-teach is DEFERRED: an admission is settled only by a teach in a
    // LATER event, so the verdict is known at end-of-stream. Conservative (anti-accusation): here ANY
    // event text matching the teach pattern settles — prose "already taught with dz teach" suppresses
    // the drill; the sentinel in foldAdmissionDebt is stricter (tool-only) for the opposite reason.
    const admissions = [];
    let lastTeachIndex = -1;
    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (isTeachText(e.text))
            lastTeachIndex = i;
        if (e.kind === 'assistant' && !isTeachText(e.text)) {
            const snippet = admissionSnippet(e.text);
            if (snippet !== null)
                admissions.push({ index: i, snippet });
        }
        // A code change marks the commit cycle dirty AND invalidates any earlier verification (it is now
        // stale — a test that ran BEFORE this edit did not verify it; cross-model QE High).
        if (e.kind === 'tool' && (e.tool === 'Edit' || e.tool === 'Write') && e.file && CODE_FILE_RE.test(e.file)) {
            changedSinceCommit = true;
            verifiedSinceCommit = false;
        }
        if (e.kind === 'tool' && e.tool === 'Edit' && e.file) {
            editsPerFile.set(e.file, (editsPerFile.get(e.file) ?? 0) + 1);
            lastEditedFile = e.file;
            const edits = editsPerFile.get(e.file);
            if (edits >= 3 && failedAfterEdit.has(e.file)) {
                bump('n-fix-cycles', `${edits} edits to ${e.file} with a failing test between`);
                failedAfterEdit.delete(e.file);
            }
        }
        // committed-without-verify: check `git commit` FIRST (so a commit message containing "test" is not
        // mistaken for a verification run), then reset the commit cycle. Only fires when code changed and no
        // test/build ran since the last commit — a real rake the harness does NOT prevent (ties to `validate`).
        if (e.kind === 'tool' && e.tool === 'Bash') {
            const commitM = GIT_COMMIT_RE.exec(e.text);
            if (commitM) {
                // A compound `pnpm test && git commit` verifies IN-LINE before the commit — not a rake (cross-model QE).
                const inlineVerified = VERIFY_CMD_RE.test(e.text.slice(0, commitM.index));
                if (changedSinceCommit && !verifiedSinceCommit && !inlineVerified)
                    bump('committed-without-verify', e.text.slice(0, 100));
                changedSinceCommit = false;
                verifiedSinceCommit = false;
            }
            else if (VERIFY_CMD_RE.test(e.text)) {
                verifiedSinceCommit = true;
            }
        }
        // Only a TEST/BUILD failure (not a generic Read error) arms the most-recently-edited file, so an
        // UNRELATED failure no longer globally triggers a fix-cycle (cross-model QE High).
        if (e.kind === 'tool' && e.ok === false && lastEditedFile !== undefined && TESTFAIL_RE.test(e.text))
            failedAfterEdit.add(lastEditedFile);
        // claimed-done-without-verify: a done-claim that (a) FOLLOWS a code change in the window AND (b) has NO
        // verification tool in the window. The change-in-window gate cuts prose "done"/"tests pass" that made
        // no edit (measured over-firing on the dogfood — NFR-2 conservative).
        if (e.kind === 'assistant') {
            const m = DONE_RE.exec(e.text);
            if (m) {
                const before = e.text.slice(Math.max(0, m.index - 30), m.index);
                const negated = NEG_RE.test(before) || NEG_RE.test(e.text.slice(m.index, m.index + 6));
                if (!negated) {
                    let verified = false, changed = false;
                    for (let j = Math.max(0, i - WINDOW); j < i; j++) {
                        const p = events[j];
                        if (p.kind !== 'tool')
                            continue;
                        if (VERIFY_RE.test(`${p.tool ?? ''} ${p.text}`))
                            verified = true;
                        if (p.tool === 'Edit' || p.tool === 'Write')
                            changed = true;
                    }
                    if (changed && !verified)
                        bump('claimed-done-without-verify', e.text.slice(0, 120));
                }
            }
        }
        // ignored-user-correction: 2nd+ correction within a short window of user turns.
        if (e.kind === 'user' && CORRECTION_RE.test(e.text)) {
            let priorCorrections = 0;
            for (let j = Math.max(0, i - WINDOW * 2); j < i; j++) {
                const p = events[j];
                if (p.kind === 'user' && CORRECTION_RE.test(p.text))
                    priorCorrections++;
            }
            if (priorCorrections >= 1)
                bump('ignored-user-correction', e.text);
        }
    }
    // Resolve the deferred admissions: unpaid = no teach at a LATER index (its own event never
    // contains a teach — excluded above), so `lastTeachIndex <= index` means the debt stood at
    // end-of-stream. A teach BEFORE the admission does not settle it (acid A7).
    for (const a of admissions)
        if (lastTeachIndex <= a.index)
            bump('correction-narrated-without-teach', a.snippet);
    const hits = [];
    for (const sig of PROCESS_SIGNATURES) {
        const c = counts.get(sig.id);
        if (c)
            hits.push({ signature: sig.id, label: sig.label, withinSession: c.n, evidence: c.evidence });
    }
    return hits.sort((a, b) => b.withinSession - a.withinSession || byStr(a.signature, b.signature));
}
const sigById = (id) => PROCESS_SIGNATURES.find((s) => s.id === id);
/** The stable store-key lesson for a signature (so teach/reinforce dedups on it and the ledger counts it). */
export function retroLessonText(sig) {
    const s = sigById(sig);
    return `Process rake [${sig}]: ${s ? s.label : sig}. ${s?.checklist ?? ''}`.trim();
}
/** Render the mix drill: a socratic predict-then-reveal prompt, a marker, then the concrete checklist. */
export function renderDrill(sig, effective) {
    const skill = sig.skill ? ` (see the \`${sig.skill}\` skill)` : '';
    return [
        `  🔁 ${sig.label} — ${effective}× (recurring)`,
        `     ${sig.socratic}`,
        `     --- reveal (cover this, predict first) ---`,
        `     ✅ ${sig.checklist}${skill}`,
    ].join('\n');
}
/**
 * Build the retro. PURE. A hit is DRILLED only when `ledgerCount + withinSession >= threshold` (recurrent);
 * otherwise it ACCRUES (taught silently, no drill) — the load-bearing anti-noise property (ADR-001 §3).
 */
export function buildRetro(hits, ledger, totalEvents, drillThreshold = DEFAULT_DRILL_THRESHOLD) {
    const items = hits.map((hit) => {
        const ledgerCount = ledger.get(hit.signature) ?? 0;
        const effective = ledgerCount + hit.withinSession;
        if (effective >= drillThreshold) {
            const sig = sigById(hit.signature);
            const drill = sig ? renderDrill(sig, effective) : undefined;
            return drill !== undefined
                ? { hit, ledgerCount, effective, status: 'drill', drill }
                : { hit, ledgerCount, effective, status: 'drill' };
        }
        return { hit, ledgerCount, effective, status: 'accrue' };
    });
    return {
        items,
        drilled: items.filter((i) => i.status === 'drill').length,
        accrued: items.filter((i) => i.status === 'accrue').length,
        totalEvents,
    };
}
/** Human render of the retro. Deterministic. */
export function renderRetro(retro) {
    if (retro.items.length === 0)
        return `retro: no process rakes detected in ${retro.totalEvents} event(s). Clean session.`;
    const lines = [`retro: ${retro.drilled} recurring rake(s) to drill, ${retro.accrued} accruing (from ${retro.totalEvents} events):`, ''];
    for (const it of retro.items) {
        if (it.status === 'drill' && it.drill) {
            lines.push(it.drill);
            lines.push('');
        }
    }
    const accruing = retro.items.filter((i) => i.status === 'accrue');
    if (accruing.length > 0) {
        lines.push('  accruing (first time — taught, not drilled yet):');
        for (const it of accruing)
            lines.push(`    · ${it.hit.label} (×${it.hit.withinSession} this session)`);
    }
    return lines.join('\n');
}
/** Cap the read at the last N bytes for very large transcripts (a retro is about the RECENT session), so
 * memory stays bounded rather than slurping a multi-hundred-MB file whole (cross-model QE). */
const MAX_READ_BYTES = 48 * 1024 * 1024;
function readBounded(path) {
    let size = 0;
    try {
        size = statSync(path).size;
    }
    catch {
        return '';
    }
    if (size <= MAX_READ_BYTES) {
        try {
            return readFileSync(path, 'utf8');
        }
        catch {
            return '';
        }
    }
    // Read only the tail; drop the first (partial) line.
    const fd = openSync(path, 'r');
    try {
        const buf = Buffer.allocUnsafe(MAX_READ_BYTES);
        const bytes = readSync(fd, buf, 0, MAX_READ_BYTES, size - MAX_READ_BYTES);
        const tail = buf.toString('utf8', 0, bytes);
        const nl = tail.indexOf('\n');
        return nl >= 0 ? tail.slice(nl + 1) : tail;
    }
    catch {
        return '';
    }
    finally {
        closeSync(fd);
    }
}
const isObj = (x) => x !== null && typeof x === 'object';
/**
 * Parse a Claude Code JSONL transcript into a normalized event stream. Bad/`null`/malformed lines are
 * skipped (never throws — cross-model QE caught a crash on a `null` line and a `[null]` content block).
 * ADJACENT text blocks WITHIN one message are merged into a single assistant/user event, so a
 * multi-block turn ("Done." + "Fixed.") counts as ONE claim, not two (the anti-noise guarantee) —
 * but original CONTENT-BLOCK ORDER is preserved across tool blocks: admission text followed by a
 * `dz teach` tool_use in the SAME message must settle the debt, which requires the teach event to
 * land AFTER the text event (cross-family QE P1-1: the old flush-at-end put all text last, so a
 * same-turn teach looked EARLIER than its admission and the happy path read as an unpaid debt).
 */
export function streamSessionEvents(path) {
    const raw = readBounded(path);
    if (raw === '')
        return [];
    return parseSessionJsonl(raw);
}
/**
 * Parse a JSONL CHUNK (whole file or an incremental tail of complete lines) into events. PURE.
 * Extracted from streamSessionEvents so the per-turn tail scan parses only the new bytes.
 */
export function parseSessionJsonl(raw) {
    const out = [];
    for (const [messageIndex, line] of raw.split('\n').entries()) {
        const t = line.trim();
        if (t === '')
            continue;
        let obj;
        try {
            obj = JSON.parse(t);
        }
        catch {
            continue;
        }
        if (!isObj(obj))
            continue;
        // Claude's compacted summary is a transcript-only user line that can quote an old confession.
        // It is context, not a new turn/admission; ignore it regardless of its declared role.
        if (obj.isCompactSummary === true)
            continue;
        const timestamp = typeof obj.timestamp === 'string' && Number.isFinite(Date.parse(obj.timestamp))
            ? obj.timestamp : undefined;
        const msg = obj.message;
        if (!isObj(msg))
            continue;
        const role = typeof msg.role === 'string' ? msg.role : '';
        const content = msg.content;
        if (typeof content === 'string') {
            if (content.trim() !== '')
                out.push({ kind: role === 'assistant' ? 'assistant' : 'user', text: content, messageIndex, ...(timestamp ? { timestamp } : {}) });
            continue;
        }
        if (!Array.isArray(content))
            continue;
        const textParts = [];
        // Flush pending ADJACENT text before any tool block, so block order survives into the event
        // stream (cross-family QE P1-1 — see the doc comment above).
        const flushText = () => {
            if (textParts.length === 0)
                return;
            out.push({ kind: role === 'assistant' ? 'assistant' : 'user', text: textParts.join('\n'), messageIndex, ...(timestamp ? { timestamp } : {}) });
            textParts.length = 0;
        };
        for (const b of content) {
            if (!isObj(b))
                continue; // guard a `[null]` block (cross-model QE)
            if (b.type === 'text' && typeof b.text === 'string') {
                textParts.push(b.text);
            }
            else if (b.type === 'tool_use') {
                flushText();
                const input = isObj(b.input) ? b.input : undefined;
                const file = input?.file_path ?? input?.path;
                const name = typeof b.name === 'string' ? b.name : undefined;
                // Capture the Bash COMMAND as the event text so a real verification (`pnpm tsc`, `npm test`) is
                // visible — dropping it made the "done without verify" check blind (cross-model QE).
                const text = (name === 'Bash' && typeof input?.command === 'string') ? input.command : (name ?? '');
                out.push({ kind: 'tool', text, messageIndex, ...(name ? { tool: name } : {}), ...(file ? { file } : {}), ...(typeof b.id === 'string' ? { toolUseId: b.id } : {}), ...(timestamp ? { timestamp } : {}) });
            }
            else if (b.type === 'tool_result') {
                flushText();
                const c = b.content;
                const text = typeof c === 'string' ? c : Array.isArray(c)
                    ? c.map((part) => typeof part === 'string' ? part
                        : isObj(part) && part.type === 'text' && typeof part.text === 'string' ? part.text : '').filter(Boolean).join('\n')
                    : JSON.stringify(c ?? '');
                out.push({ kind: 'tool', text: text.slice(0, 2000), ok: b.is_error !== true, messageIndex,
                    ...(TEACH_RECEIPT_RE.test(text) ? { teachReceipt: true } : {}),
                    ...(typeof b.tool_use_id === 'string' ? { toolUseId: b.tool_use_id } : {}),
                    ...(timestamp ? { timestamp } : {}) });
            }
        }
        flushText();
    }
    return out;
}
/** Find the most recently modified session transcript (roam state, then ~/.claude/projects). Null if none. */
export function findLatestTranscript(repoRoot) {
    let best = null;
    const consider = (p) => {
        try {
            const st = statSync(p);
            // tie-break on path so equal mtimes are deterministic (cross-model QE).
            if (st.isFile() && (best === null || st.mtimeMs > best.mtime || (st.mtimeMs === best.mtime && p < best.path)))
                best = { path: p, mtime: st.mtimeMs };
        }
        catch { /* skip */ }
    };
    const scanDir = (dir) => {
        try {
            if (existsSync(dir))
                for (const e of readdirSync(dir))
                    if (e.endsWith('.jsonl'))
                        consider(join(dir, e));
        }
        catch { /* ignore */ }
    };
    scanDir(join(repoRoot, 'roam', 'claude-state'));
    // ~/.claude/projects/<encoded-repoRoot>/<uuid>.jsonl (the contract's second source).
    try {
        const enc = repoRoot.replace(/\//g, '-');
        scanDir(join(homedir(), '.claude', 'projects', enc));
    }
    catch { /* ignore */ }
    return best === null ? null : best.path;
}
// ── Per-turn admission-debt scan (feature narrated-error-must-be-taught, ADR-001 D2/D4) ────────────
// The Stop hook runs `dz retro --scan-tail` after EVERY assistant turn, so this half is built around
// one budget: O(new bytes) — a persisted byte offset, no full re-read, no store open and no subprocess.
// The sentinel `.dz/retro/<session>/pending.json` is the debt; the recall hook turns it into a
// next-prompt directive; a REAL teach invocation (a TOOL event — prose promises never pay, ADR-001 D4)
// clears it.
/** LEGACY flat names (pre retro-debt-sentinel-per-session): the ONE pair every session in a worktree
 * once shared under `.dz/`. A scan ADOPTS its own transcript's flat files once (FR-4) and never
 * writes them again; a stranger's flat file is never touched. */
export const RETRO_SCAN_STATE_FILE = 'retro-scan-state.json';
export const RETRO_PENDING_FILE = 'retro-pending.json';
// ── Per-session layout (feature retro-debt-sentinel-per-session, FR-1; backlog 58f3c56fbb9d6893) ──
// Two sessions in one worktree shared the flat pair above, so a Stop scan of EITHER unlinked the
// other's LIVE debt as "foreign", and the shared bookmark made each session's offset meaningless to
// the other (foreign transcript ⇒ offset 0 ⇒ a bounded re-scan every turn; MEASURED 22.09 20:23, a
// second session in this repo). The pair now lives in a directory named after the session.
export const RETRO_SESSION_DIRNAME = 'retro';
export const RETRO_SESSION_PENDING_BASENAME = 'pending.json';
export const RETRO_SESSION_STATE_BASENAME = 'scan-state.json';
/** A session dir whose scan-state is older than this belongs to a dead session: the next scan of
 * any other session sweeps it (FR-5). A live session that ran no Stop for 7 days loses only a debt
 * the hook would have called stale anyway (SENTINEL_FRESH_MS is 30 min) — accepted risk R2. */
export const RETRO_SESSION_STALE_MS = 7 * 24 * 3600 * 1000;
/** At most this many `.dz/retro/*` entries are examined per scan — the sweep's cost bound (NFR-1). */
const RETRO_SWEEP_MAX_ENTRIES = 64;
const SAFE_SESSION_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
/**
 * The directory name for a session id. PURE. A plain token is used as is; anything else — a
 * path-like string, the empty string, an over-long id, and the two dot names the charset regex
 * alone would let through (`.` ⇒ `<dzDir>/retro`, `..` ⇒ `<dzDir>` itself) — becomes the first
 * 32 hex of its sha256, so a session id can never name a path outside `.dz/retro/` (AC-2).
 * TWIN: the recall hook in `apply-leg.ts` carries a copy (the hook must stay dependency-free);
 * `test/retro-sentinel-per-session.test.ts` pins the two to equal outputs.
 */
export function safeSessionDirName(sessionId) {
    if (SAFE_SESSION_ID_RE.test(sessionId) && sessionId !== '.' && sessionId !== '..')
        return sessionId;
    return createHash('sha256').update(sessionId).digest('hex').slice(0, 32);
}
/** The session id the SCANNER derives: the transcript basename without `.jsonl`. Claude Code names
 * the transcript after the session id, so this equals the `session_id` the hook payload carries. PURE. */
export function sessionIdFromTranscript(transcriptPath) {
    return basename(transcriptPath).replace(/\.jsonl$/, '');
}
/** Where ONE session's debt and bookmark live: `<dzDir>/retro/<safeId>/{pending,scan-state}.json`. PURE, no fs. */
export function retroSessionPaths(dzDir, sessionId) {
    const dir = join(dzDir, RETRO_SESSION_DIRNAME, safeSessionDirName(sessionId));
    return { dir, pendingPath: join(dir, RETRO_SESSION_PENDING_BASENAME), statePath: join(dir, RETRO_SESSION_STATE_BASENAME) };
}
const RETRO_RECEIPT_ID_RE = /^[0-9a-f]{32}$/;
const retroReceiptPath = (dzDir, sessionId, id) => join(retroSessionPaths(dzDir, sessionId).dir, `receipt-${id}.json`);
/** An opaque ID is stable when the same transcript bytes are replayed after an interrupted scan. */
function retroReceiptId(transcript, fingerprint, offset, messageIndex, snippet, timestamp) {
    return createHash('sha256').update(JSON.stringify([transcript, fingerprint, offset, messageIndex,
        debtSnippetKey(snippet), timestamp ?? '']))
        .digest('hex').slice(0, 32);
}
/** A bounded identity of the first JSONL line. Appending later lines does not change it; replacing
 * the transcript with a new first message normally does. Admission timestamps also enter the ID. */
function transcriptFingerprint(path) {
    const fd = openSync(path, 'r');
    try {
        const bytes = Buffer.allocUnsafe(8_192);
        const got = readSync(fd, bytes, 0, bytes.length, 0);
        const firstNl = bytes.subarray(0, got).indexOf(0x0a);
        const length = firstNl >= 0 ? firstNl + 1 : got;
        return createHash('sha256').update(bytes.subarray(0, length)).digest('hex').slice(0, 32);
    }
    finally {
        closeSync(fd);
    }
}
/** Verify the exact bytes a pending debt covered, even when a replacement keeps its header,
 * path and length. The range begins at the scan that armed the debt, never at a huge session's
 * unscanned prefix. Stream in fixed blocks to keep memory bounded. */
function transcriptRangeHash(path, start, end) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
        throw new Error('invalid retro transcript range');
    }
    const fd = openSync(path, 'r');
    try {
        const hash = createHash('sha256');
        const buf = Buffer.allocUnsafe(256 * 1024);
        for (let at = start; at < end;) {
            const got = readSync(fd, buf, 0, Math.min(buf.length, end - at), at);
            if (got <= 0)
                throw new Error('retro transcript changed during scan');
            hash.update(buf.subarray(0, got));
            at += got;
        }
        return hash.digest('hex');
    }
    finally {
        closeSync(fd);
    }
}
function parseRetroReceiptRef(ref) {
    const colon = ref.lastIndexOf(':');
    const sessionKey = ref.slice(0, colon);
    const id = ref.slice(colon + 1);
    if (colon < 1 || sessionKey.length > 128 || safeSessionDirName(sessionKey) !== sessionKey
        || !RETRO_RECEIPT_ID_RE.test(id))
        return null;
    return { sessionKey, id };
}
function readPendingForReceipt(projectRoot, ref) {
    const parsed = parseRetroReceiptRef(ref);
    if (parsed === null)
        return null;
    try {
        const pending = JSON.parse(readFileSync(retroSessionPaths(join(projectRoot, '.dz'), parsed.sessionKey).pendingPath, 'utf8'));
        if (typeof pending.sessionId !== 'string' || safeSessionDirName(pending.sessionId) !== parsed.sessionKey
            || pending.receiptId !== parsed.id
            || typeof pending.transcript !== 'string' || typeof pending.snippet !== 'string' || pending.snippet === ''
            || typeof pending.coverageHash !== 'string' || !/^[0-9a-f]{64}$/.test(pending.coverageHash)
            || typeof pending.coverageStartOffset !== 'number' || !Number.isSafeInteger(pending.coverageStartOffset)
            || typeof pending.scanEndOffset !== 'number' || !Number.isSafeInteger(pending.scanEndOffset)
            || pending.coverageStartOffset < 0 || pending.scanEndOffset < pending.coverageStartOffset)
            return null;
        return { sessionId: pending.sessionId, id: parsed.id, pending };
    }
    catch {
        return null;
    }
}
/** Validate BEFORE teach writes, so a stale or mistyped debt reference cannot silently teach elsewhere. */
export function retroReceiptIsPending(projectRoot, ref) {
    try {
        return withProjectLockSync(projectRoot, RETRO_SCAN_LOCK_NAME, () => readPendingForReceipt(projectRoot, ref) !== null, { timeoutMs: RETRO_SCAN_LOCK_TIMEOUT_MS });
    }
    catch {
        return false;
    }
}
/** Call only after a lexical teach write or reinforcement has actually flushed. The scanner and
 * this writer share a lock, so a newer admission cannot borrow an older command's receipt. */
export function writeRetroTeachReceipt(projectRoot, ref, storeRoot, lessonId) {
    if (storeRoot === '' || lessonId === '')
        return false;
    try {
        return withProjectLockSync(projectRoot, RETRO_SCAN_LOCK_NAME, () => {
            const active = readPendingForReceipt(projectRoot, ref);
            if (active === null)
                return false;
            const path = retroReceiptPath(join(projectRoot, '.dz'), active.sessionId, active.id);
            writeJsonAtomic(path, { schema: 1, sessionId: active.sessionId, transcript: active.pending.transcript,
                receiptId: active.id, storeRoot, lessonId, writtenAt: new Date().toISOString() });
            return true;
        }, { timeoutMs: RETRO_SCAN_LOCK_TIMEOUT_MS });
    }
    catch {
        return false;
    }
}
function hasRetroTeachReceipt(dzDir, sessionId, transcript, id) {
    if (!RETRO_RECEIPT_ID_RE.test(id))
        return false;
    try {
        const receipt = JSON.parse(readFileSync(retroReceiptPath(dzDir, sessionId, id), 'utf8'));
        return receipt['schema'] === 1 && receipt['sessionId'] === sessionId && receipt['transcript'] === transcript
            && receipt['receiptId'] === id && typeof receipt['storeRoot'] === 'string' && receipt['storeRoot'] !== ''
            && typeof receipt['lessonId'] === 'string' && receipt['lessonId'] !== '';
    }
    catch {
        return false;
    }
}
/** Bound the very FIRST scan of an already-huge transcript; later scans read only the new bytes. */
const MAX_TAIL_SCAN_BYTES = 8 * 1024 * 1024;
/** Without a session id to compare, a sentinel older than this is stale (fallback freshness only). */
const SENTINEL_FRESH_MS = 30 * 60 * 1000;
const MAX_AWAITING_TEACHES = 16;
/**
 * Decide which transcript a `dz retro --scan-tail` run is entitled to read. PURE.
 *
 * Round 3, P1-3 (Codex r2 on `harness-cli/src/cli.ts:8508-8510`): the Stop-hook mode fell back to
 * `findLatestTranscript(root)` whenever no positional path was given, so it scanned whichever file
 * happened to have the newest mtime. With three to five sessions and their subagents alive at once —
 * the ordinary state of this machine, not an edge case — that is routinely ANOTHER session's file:
 * the scan advances the wrong session's offset and never sees the current turn's admission.
 *
 * The Stop hook hands the exact path on stdin (`{"session_id":…,"transcript_path":…}`), so the order
 * is: an explicit `--transcript`, then a positional path (a human running it by hand means THAT file),
 * then the hook payload. With none of the three the answer is a REFUSAL with a stated reason — never
 * a guess. Refusing is safe here in a way guessing is not: a skipped scan self-heals on the next turn
 * (nothing advanced), while a scan of the wrong transcript corrupts two sessions' state at once.
 *
 * A blank or whitespace-only string is NOT a path: an unset shell variable expands to exactly that.
 */
export function resolveScanTailTranscript(input) {
    const pick = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);
    const flag = pick(input.flag);
    if (flag !== null)
        return { path: flag, source: 'flag' };
    const positional = pick(input.positional);
    if (positional !== null)
        return { path: positional, source: 'positional' };
    const raw = typeof input.stdin === 'string' ? input.stdin.trim() : '';
    if (raw !== '') {
        let payload;
        try {
            payload = JSON.parse(raw);
        }
        catch {
            return {
                path: null,
                source: 'none',
                reason: 'the Stop-hook payload on stdin could not be parsed as JSON, so it names no transcript_path — pass --transcript <path> explicitly',
            };
        }
        const p = isObj(payload) ? payload.transcript_path : undefined;
        const named = typeof p === 'string' ? pick(p) : null;
        if (named !== null)
            return { path: named, source: 'stop-hook-stdin' };
    }
    return {
        path: null,
        source: 'none',
        reason: 'no transcript_path on stdin and no --transcript/positional path — refusing to scan the newest transcript on disk, which on a machine running several sessions at once is routinely another session\'s',
    };
}
/** The scan-state + sentinel pair is a read-modify-write store; per the repo concurrency rule
 * (`.claude/rules/cross-runtime-concurrency.md`) it gets a named lock in the same change. */
export const RETRO_SCAN_LOCK_NAME = 'retro-scan';
/** A Stop hook must not queue behind a long holder — give up fast; the skipped scan self-heals
 * (state not advanced ⇒ the next turn re-reads the same bytes). */
const RETRO_SCAN_LOCK_TIMEOUT_MS = 2_000;
const debtSnippetKey = (snippet) => snippet.replace(/\s+/g, ' ').trim().slice(0, 200);
function foldAdmissionDebtWithAge(events, prior, priorAge, fallbackTime, scanOffset, receipt) {
    let pending = prior;
    let admittedAt = priorAge.admittedAt;
    let lastTurn = priorAge.lastTurn === true;
    let admissionMessageIndex;
    let originScanOffset = priorAge.originScanOffset;
    let originMessageIndex = priorAge.originMessageIndex;
    let receiptId = priorAge.receiptId;
    // EVERY teach issued against the live debt and still awaiting its own result, by `tool_use_id`.
    // Round 3, P1-2: a single `lastPaid` slot lost the FIRST of two parallel teaches — the second call
    // saw an already-cleared `pending` and overwrote the slot with null, so when both results came back
    // receipt-less neither could re-arm and the debt was silently forgiven. A set, and settlement moved
    // to the RECEIPT, removes the whole class: the CALL now registers a candidate and changes nothing.
    // Old or malformed sentinels mean no candidates, without skipping the rest of the scan.
    const saved = prior?.awaiting;
    const awaiting = new Set(Array.isArray(saved) && saved.every((id) => typeof id === 'string') ? saved : []);
    const payRecorded = () => {
        if (pending === null || receiptId === undefined || receipt?.paid(receiptId) !== true)
            return;
        pending = null;
        awaiting.clear();
        admittedAt = undefined;
        lastTurn = false;
        admissionMessageIndex = undefined;
        originScanOffset = undefined;
        originMessageIndex = undefined;
        receiptId = undefined;
    };
    for (const e of events) {
        // A CLI receipt can arrive without any visible tool output. Check it before EACH event so a
        // second, identically worded admission after payment starts a distinct debt, including on replay.
        payRecorded();
        // A tool call within the admission's own JSONL message is still the same assistant turn.
        // Across scan chunks the origin index is unknown, so any new assistant activity ages it.
        if (pending !== null && (e.kind === 'assistant' || (e.kind === 'tool' && e.tool !== undefined))
            && (admissionMessageIndex === undefined || e.messageIndex !== admissionMessageIndex))
            lastTurn = false;
        if (isTeachCommand(e)) {
            if (typeof e.toolUseId === 'string') {
                // Registered, not settled. The debt stands until this call's own result carries a receipt.
                if (pending !== null) {
                    awaiting.add(e.toolUseId);
                    if (awaiting.size > MAX_AWAITING_TEACHES) {
                        const oldest = awaiting.values().next().value;
                        awaiting.delete(oldest);
                    }
                }
            }
            else {
                // No pairing key ⇒ no result can ever confirm OR refute this call, so it pays on the command
                // alone — the pre-ADR-004 behaviour, kept deliberately so every id-less fixture and every
                // transcript written before ids reproduce their old outcome exactly.
                pending = null;
                awaiting.clear();
                admittedAt = undefined;
                lastTurn = false;
                admissionMessageIndex = undefined;
                originScanOffset = undefined;
                originMessageIndex = undefined;
                receiptId = undefined;
            }
            continue;
        }
        // The RESULT of one of those calls (a tool_result carries no tool name in this stream, by
        // construction). A receipt on an ok result settles the debt the call was issued against; an
        // is_error result, or an exit-0 run whose teach line was never reached, settles nothing and the
        // candidate is simply dropped — the debt stays armed for the other candidates and for the scan.
        if (e.kind === 'tool' && e.tool === undefined && typeof e.toolUseId === 'string' && awaiting.has(e.toolUseId)) {
            awaiting.delete(e.toolUseId);
            if (e.ok !== false && (e.teachReceipt === true || TEACH_RECEIPT_RE.test(e.text))) {
                pending = null;
                awaiting.clear();
                admittedAt = undefined;
                lastTurn = false;
                admissionMessageIndex = undefined;
                originScanOffset = undefined;
                originMessageIndex = undefined;
                receiptId = undefined;
            }
            continue;
        }
        if (e.kind === 'assistant') {
            const snippet = admissionSnippet(e.text);
            // A distinct or newly armed admission supersedes in-flight teaches. Repeating identical
            // wording while the same debt remains unpaid preserves its origin and pending calls.
            if (snippet !== null) {
                const sameDebt = pending !== null && debtSnippetKey(pending.snippet) === debtSnippetKey(snippet);
                const replayedOrigin = prior !== null && debtSnippetKey(prior.snippet) === debtSnippetKey(snippet)
                    && scanOffset !== undefined && priorAge.originScanOffset === scanOffset
                    && e.messageIndex !== undefined && priorAge.originMessageIndex === e.messageIndex;
                if (replayedOrigin) {
                    // Replaying earlier bytes can have armed a DIFFERENT debt before reaching this origin.
                    // Restore only the age; this admission must still discard that older debt's calls.
                    if (!sameDebt)
                        awaiting.clear();
                    admittedAt = priorAge.admittedAt;
                    lastTurn = priorAge.lastTurn === true;
                    admissionMessageIndex = e.messageIndex;
                    originScanOffset = priorAge.originScanOffset;
                    originMessageIndex = priorAge.originMessageIndex;
                    receiptId = priorAge.receiptId;
                }
                else if (!sameDebt) {
                    admittedAt = e.timestamp ?? fallbackTime;
                    lastTurn = true;
                    admissionMessageIndex = e.messageIndex;
                    originScanOffset = scanOffset;
                    originMessageIndex = e.messageIndex;
                    receiptId = receipt !== undefined && e.messageIndex !== undefined
                        ? receipt.idFor(e.messageIndex, snippet, e.timestamp) : undefined;
                    awaiting.clear();
                }
                pending = { snippet };
            }
        }
    }
    payRecorded();
    const debt = pending === null ? null : {
        snippet: pending.snippet,
        ...(awaiting.size > 0 ? { awaiting: [...awaiting] } : {}),
    };
    return { debt, age: {
            ...(admittedAt !== undefined ? { admittedAt } : {}), lastTurn,
            ...(originScanOffset !== undefined ? { originScanOffset } : {}),
            ...(originMessageIndex !== undefined ? { originMessageIndex } : {}),
            ...(receiptId !== undefined ? { receiptId } : {}),
        } };
}
export function foldAdmissionDebt(events, prior) {
    return foldAdmissionDebtWithAge(events, prior, {}).debt;
}
const writeJsonAtomic = (path, value) => {
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(value));
    renameSync(tmp, path);
};
/**
 * One incremental scan transaction: read state → read the new transcript bytes (whole lines only —
 * a partial trailing line is left for the next scan) → fold the debt → persist state + sentinel.
 * NEVER throws (it runs inside a Stop hook; a broken scan must never surface as a turn failure).
 *
 * The WHOLE read→fold→write runs under `withProjectLockSync` (cross-family QE P1-3): two overlapping
 * Stop scans that both read the same offset/sentinel and then rename/unlink independently lose one
 * side's update — atomic per-file renames do not prevent that, only mutual exclusion does. The
 * critical section is synchronous (new tail reads are bounded ≤8 MB; validating an existing
 * pending debt also streams its covered range, which can grow across turns; no subprocess) and
 * the lock lives beside the store it guards: `<root>/.dz/locks/retro-scan.lock`
 * for the store files in `<root>/.dz/`. A contended scan gives up fast and reports `contended` —
 * nothing advanced, so the next turn re-scans the same bytes (self-healing, never a lost update).
 */
export function runRetroTailScan(dzDir, transcriptPath, nowIso) {
    if (transcriptPath === null || transcriptPath === '')
        return { status: 'no-transcript', scannedBytes: 0, offset: 0 };
    const sessionId = sessionIdFromTranscript(transcriptPath);
    const ids = { sessionId, pendingPath: retroSessionPaths(dzDir, sessionId).pendingPath };
    try {
        return withProjectLockSync(dirname(dzDir), RETRO_SCAN_LOCK_NAME, () => scanTailUnderLock(dzDir, transcriptPath, nowIso), { timeoutMs: RETRO_SCAN_LOCK_TIMEOUT_MS });
    }
    catch (e) {
        if (e instanceof NamedLockTimeoutError)
            return { status: 'contended', scannedBytes: 0, offset: 0, ...ids };
        // Compromised lock or any unexpected failure: report nothing, advance nothing (never-block).
        return { status: 'none', scannedBytes: 0, offset: 0, ...ids };
    }
}
/** The transaction body — call ONLY under the named lock. Never throws for ordinary fs failures. */
function scanTailUnderLock(dzDir, transcriptPath, nowIso) {
    // FR-2: every path this scan writes or removes is inside ITS OWN session dir; the only files it
    // ever touches outside are the legacy flat pair, and only to adopt its own (FR-4).
    const sessionId = sessionIdFromTranscript(transcriptPath);
    const { dir, pendingPath, statePath } = retroSessionPaths(dzDir, sessionId);
    const ids = { sessionId, pendingPath };
    try {
        const legacyStatePath = join(dzDir, RETRO_SCAN_STATE_FILE);
        const legacyPendingPath = join(dzDir, RETRO_PENDING_FILE);
        const readOffset = (p) => {
            try {
                const st = JSON.parse(readFileSync(p, 'utf8'));
                if (st.transcript === transcriptPath && typeof st.offset === 'number' && Number.isFinite(st.offset) && st.offset >= 0) {
                    return { offset: Math.floor(st.offset),
                        ...(typeof st.fingerprint === 'string' && RETRO_RECEIPT_ID_RE.test(st.fingerprint)
                            ? { fingerprint: st.fingerprint } : {}) };
                }
            }
            catch { /* absent or unreadable */ }
            return null;
        };
        let offset = 0;
        let savedFingerprint;
        let adoptLegacyState = false;
        const ownOffset = readOffset(statePath);
        if (ownOffset !== null) {
            offset = ownOffset.offset;
            savedFingerprint = ownOffset.fingerprint;
        }
        else if (!existsSync(statePath)) {
            // FR-4: the flat bookmark is adopted ONCE — only while this session has no bookmark of its own,
            // and only when it names THIS transcript. Another session's stays where it is.
            const legacyOffset = readOffset(legacyStatePath);
            if (legacyOffset !== null) {
                offset = legacyOffset.offset;
                savedFingerprint = legacyOffset.fingerprint;
                adoptLegacyState = true;
            }
        }
        const readSentinel = (p) => {
            try {
                const s = JSON.parse(readFileSync(p, 'utf8'));
                if (s.transcript === transcriptPath && typeof s.snippet === 'string') {
                    return {
                        prior: { snippet: s.snippet,
                            ...(s.awaiting !== undefined ? { awaiting: s.awaiting } : {}),
                        },
                        present: true,
                        ...(typeof s.admittedAt === 'string' && Number.isFinite(Date.parse(s.admittedAt)) ? { admittedAt: s.admittedAt } : {}),
                        ...(typeof s.lastTurn === 'boolean' ? { lastTurn: s.lastTurn } : {}),
                        ...(typeof s.originScanOffset === 'number' && Number.isSafeInteger(s.originScanOffset) && s.originScanOffset >= 0
                            ? { originScanOffset: s.originScanOffset } : {}),
                        ...(typeof s.originMessageIndex === 'number' && Number.isSafeInteger(s.originMessageIndex) && s.originMessageIndex >= 0
                            ? { originMessageIndex: s.originMessageIndex } : {}),
                        ...(typeof s.scanEndOffset === 'number' && Number.isSafeInteger(s.scanEndOffset) && s.scanEndOffset >= 0
                            ? { scanEndOffset: s.scanEndOffset } : {}),
                        ...(typeof s.transcriptFingerprint === 'string' && RETRO_RECEIPT_ID_RE.test(s.transcriptFingerprint)
                            ? { transcriptFingerprint: s.transcriptFingerprint } : {}),
                        ...(typeof s.coverageStartOffset === 'number' && Number.isSafeInteger(s.coverageStartOffset)
                            && s.coverageStartOffset >= 0 ? { coverageStartOffset: s.coverageStartOffset } : {}),
                        ...(typeof s.coverageHash === 'string' && /^[0-9a-f]{64}$/.test(s.coverageHash)
                            ? { coverageHash: s.coverageHash } : {}),
                        ...(typeof s.receiptId === 'string' && RETRO_RECEIPT_ID_RE.test(s.receiptId)
                            ? { receiptId: s.receiptId }
                            : { receiptId: createHash('sha256').update(JSON.stringify(['legacy', transcriptPath, s.snippet, s.ts ?? '']))
                                    .digest('hex').slice(0, 32) }),
                    };
                }
                return { prior: null, present: true };
            }
            catch {
                return { prior: null, present: false };
            }
        };
        // Prior debt: this session's own sentinel. One naming ANOTHER transcript can only mean the
        // transcript was moved or renamed under the same basename — it is IGNORED and overwritten (or
        // removed below when nothing is armed), never deleted as "foreign": the pre-feature branch that
        // unlinked a sentinel of another transcript deleted the NEIGHBOUR session's live debt (FR-2).
        const own = readSentinel(pendingPath);
        let prior = own.prior;
        let priorAge = own;
        const staleOwn = own.present && own.prior === null;
        let adoptLegacyPending = false;
        if (!own.present) {
            // FR-4: the flat sentinel is adopted only when it is THIS transcript's and this session has no
            // per-session copy yet; a stranger's, or a nobody's (no transcript field), is left untouched.
            const legacy = readSentinel(legacyPendingPath);
            if (legacy.prior !== null) {
                prior = legacy.prior;
                priorAge = legacy;
                adoptLegacyPending = true;
            }
        }
        const hadSentinel = prior !== null;
        let size = 0;
        try {
            size = statSync(transcriptPath).size;
        }
        catch {
            return prior !== null
                ? { status: 'pending', snippet: prior.snippet, scannedBytes: 0, offset, ...ids }
                : { status: 'none', scannedBytes: 0, offset, ...ids };
        }
        const fingerprint = transcriptFingerprint(transcriptPath);
        const cheapRotated = size < offset || (priorAge.scanEndOffset !== undefined && size < priorAge.scanEndOffset)
            || (savedFingerprint !== undefined && savedFingerprint !== fingerprint)
            || (priorAge.transcriptFingerprint !== undefined && priorAge.transcriptFingerprint !== fingerprint);
        const coverageChanged = !cheapRotated && priorAge.coverageHash !== undefined
            && priorAge.coverageStartOffset !== undefined && priorAge.scanEndOffset !== undefined
            && priorAge.scanEndOffset <= size
            && transcriptRangeHash(transcriptPath, priorAge.coverageStartOffset, priorAge.scanEndOffset)
                !== priorAge.coverageHash;
        const rotated = cheapRotated || coverageChanged;
        if (rotated) {
            offset = 0;
            prior = null;
            priorAge = {};
        }
        // A receipt pays every admission already folded into its pending debt. If the bookmark was
        // interrupted, skip those bytes as a unit; a later identical admission beyond this boundary
        // must still arm a new debt. The sentinel remains until the bookmark is committed below.
        const paidPrior = prior !== null && priorAge.receiptId !== undefined
            && priorAge.coverageHash !== undefined && priorAge.coverageStartOffset !== undefined
            && priorAge.scanEndOffset !== undefined
            && hasRetroTeachReceipt(dzDir, sessionId, transcriptPath, priorAge.receiptId);
        if (paidPrior && priorAge.scanEndOffset !== undefined && priorAge.scanEndOffset <= size) {
            offset = Math.max(offset, priorAge.scanEndOffset);
            prior = null;
            priorAge = {};
        }
        let jumped = offset === 0 && size > MAX_TAIL_SCAN_BYTES; // bound the first scan of a huge file
        if (size - offset > MAX_TAIL_SCAN_BYTES) {
            offset = size - MAX_TAIL_SCAN_BYTES;
            jumped = true;
        }
        let consumed = 0;
        let events = [];
        if (size > offset) {
            const fd = openSync(transcriptPath, 'r');
            try {
                const want = size - offset;
                const buf = Buffer.allocUnsafe(want);
                const got = readSync(fd, buf, 0, want, offset);
                let lastNl = -1;
                for (let i = got - 1; i >= 0; i--)
                    if (buf[i] === 0x0a) {
                        lastNl = i;
                        break;
                    }
                if (lastNl >= 0) {
                    consumed = lastNl + 1;
                    let chunk = buf.toString('utf8', 0, consumed);
                    if (jumped) { // landed mid-line: drop the partial head
                        const nl = chunk.indexOf('\n');
                        chunk = nl >= 0 ? chunk.slice(nl + 1) : '';
                    }
                    events = parseSessionJsonl(chunk);
                }
            }
            finally {
                closeSync(fd);
            }
        }
        const paidCache = new Map();
        const { debt: next, age } = foldAdmissionDebtWithAge(events, prior, priorAge, nowIso ?? new Date().toISOString(), offset, {
            idFor: (messageIndex, snippet, timestamp) => retroReceiptId(transcriptPath, fingerprint, offset, messageIndex, snippet, timestamp),
            // This scan holds retro-scan.lock, so a receipt cannot appear mid-fold. One file read per
            // admission ID keeps a large first transcript scan O(events), not O(events × disk reads).
            paid: (id) => {
                if (id === priorAge.receiptId && priorAge.coverageHash === undefined)
                    return false;
                const cached = paidCache.get(id);
                if (cached !== undefined)
                    return cached;
                const value = hasRetroTeachReceipt(dzDir, sessionId, transcriptPath, id);
                paidCache.set(id, value);
                return value;
            },
        });
        const newOffset = offset + consumed;
        mkdirSync(dir, { recursive: true });
        let outcome;
        if (next !== null) {
            const sentinel = {
                schema: 1,
                sessionId,
                transcript: transcriptPath,
                snippet: next.snippet.replace(/\s+/g, ' ').trim().slice(0, 200),
                ts: nowIso ?? new Date().toISOString(),
                ...(age.admittedAt !== undefined ? { admittedAt: age.admittedAt } : {}),
                lastTurn: age.lastTurn === true,
                ...(age.originScanOffset !== undefined ? { originScanOffset: age.originScanOffset } : {}),
                ...(age.originMessageIndex !== undefined ? { originMessageIndex: age.originMessageIndex } : {}),
                ...(age.receiptId !== undefined ? { receiptId: age.receiptId } : {}),
                transcriptFingerprint: fingerprint,
                scanEndOffset: newOffset,
                coverageStartOffset: age.originScanOffset ?? offset,
                coverageHash: transcriptRangeHash(transcriptPath, age.originScanOffset ?? offset, newOffset),
                ...(next.awaiting !== undefined ? { awaiting: next.awaiting } : {}),
            };
            writeJsonAtomic(pendingPath, sentinel);
            outcome = { status: 'pending', snippet: sentinel.snippet, scannedBytes: consumed, offset: newOffset };
        }
        else if (hadSentinel) {
            // Step-8 finding (23.09.2026, HIGH): swallowing EVERY unlink failure here and then advancing
            // the offset anyway recreates the very loss this feature removes — the sentinel survives, the
            // receipt that paid it is consumed, and every later scan re-arms the SAME stale snippet
            // forever. Only "already gone" is benign; any other failure must leave the bytes replayable,
            // so it propagates and the offset write below never runs. This makes the CLEAR branch
            // symmetric with the ARM branch, which already blocks the offset on a failed write.
            // With a CLI receipt, commit the bookmark first. If that write fails, keep the pending
            // sentinel and its scanEndOffset so a retry skips the same paid bytes safely.
            if (paidPrior)
                writeJsonAtomic(statePath, { schema: 1, transcript: transcriptPath, offset: newOffset, fingerprint });
            try {
                unlinkSync(pendingPath);
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    throw e;
            }
            outcome = { status: 'cleared', scannedBytes: consumed, offset: newOffset };
        }
        else {
            // Our own stale sentinel (moved transcript, see above) with nothing armed: removed, so the hook
            // never confronts a debt this transcript no longer carries. Same ENOENT-only tolerance.
            if (staleOwn) {
                try {
                    unlinkSync(pendingPath);
                }
                catch (e) {
                    if (e.code !== 'ENOENT')
                        throw e;
                }
            }
            outcome = { status: 'none', scannedBytes: consumed, offset: newOffset };
        }
        // Commit the debt BEFORE its offset: an interruption must leave these bytes replayable.
        if (!(hadSentinel && next === null && paidPrior)) {
            writeJsonAtomic(statePath, { schema: 1, transcript: transcriptPath, offset: newOffset, fingerprint });
        }
        // FR-4: the adopted flat files go only AFTER the per-session copies are committed — a failure
        // above leaves them in place for the next scan to adopt again. Best-effort: leftover debris
        // is harmless (a present per-session file blocks re-adoption), a thrown error here would
        // misreport an already-committed scan.
        if (adoptLegacyPending) {
            try {
                unlinkSync(legacyPendingPath);
            }
            catch { /* debris */ }
        }
        if (adoptLegacyState) {
            try {
                unlinkSync(legacyStatePath);
            }
            catch { /* debris */ }
        }
        sweepStaleSessionDirs(dzDir, dir, nowIso === undefined ? Date.now() : Date.parse(nowIso));
        return { ...outcome, ...ids };
    }
    catch {
        return { status: 'none', scannedBytes: 0, offset: 0, ...ids };
    }
}
/**
 * FR-5: remove dead sessions' dirs — `<dzDir>/retro/<x>/` whose `scan-state.json` mtime is older
 * than {@link RETRO_SESSION_STALE_MS}. The scanning session's own dir is excluded; a dir with no
 * readable scan-state cannot be dated and is left alone; every error is swallowed; at most
 * {@link RETRO_SWEEP_MAX_ENTRIES} entries are examined (one readdir + ≤64 stats — NFR-1).
 */
function sweepStaleSessionDirs(dzDir, ownDir, nowMs) {
    let names;
    try {
        names = readdirSync(join(dzDir, RETRO_SESSION_DIRNAME)).slice(0, RETRO_SWEEP_MAX_ENTRIES);
    }
    catch {
        return;
    }
    for (const name of names) {
        const d = join(dzDir, RETRO_SESSION_DIRNAME, name);
        if (d === ownDir)
            continue;
        try {
            const age = nowMs - statSync(join(d, RETRO_SESSION_STATE_BASENAME)).mtimeMs;
            if (age > RETRO_SESSION_STALE_MS)
                rmSync(d, { recursive: true, force: true });
        }
        catch { /* undatable or vanished: leave it */ }
    }
}
/**
 * Is this sentinel about the CURRENT session? Prefer identity (session id, then transcript path);
 * only when the hook payload carries neither does the ts-freshness window decide. PURE.
 */
/** TEST-ONLY handle on the UNLOCKED transaction body (ADR-002 D-4 / ADR-003 clause 3 RED half):
 * the lost-update reproducer must be able to run the same read→fold→write WITHOUT mutual
 * exclusion, so the named lock is proven to be what prevents the regression. Never call this from
 * production code — `runRetroTailScan` is the only sanctioned entry point. */
export const __scanTailUnderLockForTest = scanTailUnderLock;
export function retroSentinelIsFresh(sentinel, ctx) {
    if (typeof sentinel.snippet !== 'string' || sentinel.snippet === '')
        return false;
    // AM-1 (retro-debt-sentinel-per-session): an EMPTY session id carries no identity — a sentinel that
    // names no session never matches anyone, and an empty ctx id is the same as none (the hook side
    // returns '' before any fs call for it; this is the core half of the same rule).
    if (sentinel.sessionId === '')
        return false;
    if (typeof ctx.sessionId === 'string' && ctx.sessionId !== '')
        return sentinel.sessionId === ctx.sessionId;
    if (typeof ctx.transcriptPath === 'string' && ctx.transcriptPath !== '')
        return sentinel.transcript === ctx.transcriptPath;
    const ts = typeof sentinel.ts === 'string' ? Date.parse(sentinel.ts) : NaN;
    return Number.isFinite(ts) && ctx.nowMs - ts >= 0 && ctx.nowMs - ts < SENTINEL_FRESH_MS;
}
/**
 * The ≤300-char next-prompt directive. It deliberately does NOT spell a teach invocation the scanner
 * could mistake for the payment: events carrying RETRO_DEBT_MARKER are excluded from matching, and
 * the phrasing keeps `dz` and `teach` apart as a second guard (ADR-001 D4). It demands the SPECIFIC
 * lesson from the assistant — the hook itself only ever auto-teaches the templated one (D3).
 */
export function renderRetroDebtDirective(sentinel) {
    const snip = sentinel.snippet.replace(/\s+/g, ' ').trim().slice(0, 70);
    const when = sentinel.lastTurn === true ? 'last turn' : 'an earlier turn in this session';
    if (typeof sentinel.sessionId === 'string' && typeof sentinel.receiptId === 'string'
        && RETRO_RECEIPT_ID_RE.test(sentinel.receiptId)) {
        const ref = `${safeSessionDirName(sentinel.sessionId)}:${sentinel.receiptId}`;
        const lead = `${RETRO_DEBT_MARKER}: ${when} admitted an error`;
        const action = `; dz teach "<lesson+reproducer>" --retro-receipt ${ref}; dz recall to verify.`;
        return `${lead} «${snip.slice(0, Math.max(0, 300 - lead.length - action.length - 3))}»${action}`;
    }
    return `${RETRO_DEBT_MARKER}: ${when} admitted an error — «${snip}» — with no recorded lesson. First, run dz \`teach\` with the lesson + reproducer, then verify via dz recall. Narrating and recording are one action.`;
}
//# sourceMappingURL=session-retro.js.map