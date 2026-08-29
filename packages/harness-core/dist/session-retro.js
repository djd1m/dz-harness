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
import { existsSync, readFileSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
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
    // (cross-session / bounded-window reads, 88 false hits on the dogfood) and was dropped after cross-model QE.
    const editsPerFile = new Map();
    const failedAfterEdit = new Set(); // files that had a TEST failure after being edited
    let lastEditedFile;
    let changedSinceCommit = false; // a CODE Edit/Write happened since the last commit
    let verifiedSinceCommit = false; // a test/build ran AFTER the last code change
    const TESTFAIL_RE = /\b(fail(ed|ing|s)?|assertion|assert|expected|not ok|panic|traceback|error ts\d|\d+ failed)\b/i;
    for (let i = 0; i < events.length; i++) {
        const e = events[i];
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
 * Text blocks WITHIN one message are merged into a SINGLE assistant/user event, so a multi-block turn
 * ("Done." + "Fixed.") counts as ONE claim, not two (else the anti-noise guarantee is defeated).
 */
export function streamSessionEvents(path) {
    const out = [];
    const raw = readBounded(path);
    if (raw === '')
        return out;
    for (const line of raw.split('\n')) {
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
        const msg = obj.message;
        if (!isObj(msg))
            continue;
        const role = typeof msg.role === 'string' ? msg.role : '';
        const content = msg.content;
        if (typeof content === 'string') {
            if (content.trim() !== '')
                out.push({ kind: role === 'assistant' ? 'assistant' : 'user', text: content });
            continue;
        }
        if (!Array.isArray(content))
            continue;
        const textParts = [];
        for (const b of content) {
            if (!isObj(b))
                continue; // guard a `[null]` block (cross-model QE)
            if (b.type === 'text' && typeof b.text === 'string') {
                textParts.push(b.text);
            }
            else if (b.type === 'tool_use') {
                const input = isObj(b.input) ? b.input : undefined;
                const file = input?.file_path ?? input?.path;
                const name = typeof b.name === 'string' ? b.name : undefined;
                // Capture the Bash COMMAND as the event text so a real verification (`pnpm tsc`, `npm test`) is
                // visible — dropping it made the "done without verify" check blind (cross-model QE).
                const text = (name === 'Bash' && typeof input?.command === 'string') ? input.command : (name ?? '');
                out.push({ kind: 'tool', text, ...(name ? { tool: name } : {}), ...(file ? { file } : {}) });
            }
            else if (b.type === 'tool_result') {
                const c = b.content;
                const text = typeof c === 'string' ? c : JSON.stringify(c ?? '');
                out.push({ kind: 'tool', text: text.slice(0, 2000), ok: b.is_error !== true });
            }
        }
        if (textParts.length > 0)
            out.push({ kind: role === 'assistant' ? 'assistant' : 'user', text: textParts.join('\n') });
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
//# sourceMappingURL=session-retro.js.map