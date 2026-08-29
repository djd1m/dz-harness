/**
 * `dz name-check` — is this name free, before a line of code is written?
 *
 * WHY THIS EXISTS, stated plainly: twice in one day a name collision broke the build outright.
 * `dz retro` was already a command (the per-session process retro), and its star re-export clash
 * stopped the CLI from importing at all; `decideProvenance` was already an export (npm provenance),
 * and the build went red mid-feature. MEASURED 2026-08-24: `case 'retro':` is in the dispatcher, and
 * both `buildRetro` and `decideProvenance` are in the core's 1020-name public surface — so BOTH were
 * answerable before any code, and nobody asked.
 *
 * The owner's question was "what guarantees you will check?". An agent's intention is layer 4 on this
 * project's cost-of-detection ladder: it works while remembered and is silent when it lapses. A
 * command is the guarantee; a promise is not.
 *
 * PURE: no filesystem here. The scan runs in the CLI and arrives as facts — see ADR-001 for why
 * those facts come from SOURCE and never from `dist`.
 */
/** Is a proposed name already spoken for? */
export function classifyName(query, facts) {
    const name = query.name.trim();
    const at = (verdict, where) => ({ kind: query.kind, name, verdict, where });
    if (query.kind === 'command') {
        return facts.commands.has(name) ? at('taken', 'already dispatched as a dz command') : at('free', '');
    }
    if (query.kind === 'module') {
        const file = facts.modules.get(name);
        return file === undefined ? at('free', '') : at('taken', file);
    }
    const file = facts.exports.get(name);
    return file === undefined ? at('free', '') : at('taken', file);
}
/**
 * The whole verdict.
 *
 * Two ways to be not-established, and neither returns zero: nothing was asked, or the scan did not
 * run. "I checked nothing" and "nothing is taken" are different answers, and a gate that conflates
 * them is green exactly when it is blind — the defect measured on `dz sync` (0/0, exit 0) and on the
 * source scanner that printed `github: 0` for a 401.
 */
export function decideNameCheck(queries, facts) {
    if (facts.scanFailed === true) {
        return { outcome: 'not-established', exit: 2, results: [], reason: 'the workspace could not be scanned, so no name was checked — this is not a clean bill' };
    }
    const asked = queries.filter((q) => q.name.trim() !== '');
    if (asked.length === 0) {
        return { outcome: 'not-established', exit: 2, results: [], reason: 'no name was asked about — pass --command, --module or --export' };
    }
    // ESTABLISHMENT IS PER KIND. A question about an export cannot be answered by a sweep that found
    // no exports at all; a question about a command cannot be answered without having seen a CLI. A
    // sweep of a lookalike tree satisfies neither, and the honest verdict there is "not established",
    // not "free".
    const unanswerable = asked.filter((q) => {
        if (q.kind === 'command')
            return facts.commands.size === 0;
        if (q.kind === 'module')
            return facts.modules.size === 0;
        return facts.exports.size === 0;
    });
    if (unanswerable.length > 0) {
        const kinds = [...new Set(unanswerable.map((q) => q.kind))].join(', ');
        return {
            outcome: 'not-established',
            exit: 2,
            results: [],
            reason: `the sweep found nothing of kind: ${kinds} — a tree with no ${kinds} cannot answer a question about one, and reporting "free" from it would be a clean bill from an empty room`,
        };
    }
    const results = asked.map((q) => classifyName(q, facts));
    const taken = results.filter((r) => r.verdict === 'taken');
    if (taken.length > 0) {
        return {
            outcome: 'taken',
            exit: 1,
            results,
            reason: `${taken.length} of ${results.length} name(s) already spoken for — rename before writing, not after the build goes red`,
        };
    }
    return { outcome: 'free', exit: 0, results, reason: `all ${results.length} name(s) are free` };
}
export function renderNameCheck(decision, scanned) {
    const out = [];
    if (scanned !== undefined) {
        // Printed always, pass or fail: the operator must be able to see that the sweep looked at a real
        // workspace and not at a directory that merely has the right shape.
        out.push(`  swept ${scanned.packages} package(s), ${scanned.files} source file(s) — ${scanned.exports} export(s), ${scanned.commands} command(s)`);
    }
    for (const r of decision.results) {
        out.push(r.verdict === 'taken'
            ? `  [taken] ${r.kind} ${r.name} — ${r.where}`
            : `  [free]  ${r.kind} ${r.name}`);
    }
    const label = decision.outcome === 'free' ? 'FREE' : decision.outcome === 'taken' ? 'TAKEN' : 'NOT ESTABLISHED';
    out.push(`dz name-check: ${label} — ${decision.reason}`);
    if (decision.outcome === 'free') {
        // Said on the passing path, because that is where the limit gets forgotten: the scan reads
        // declarations, so a re-export under a different name (`export { a as b }`) is invisible to it.
        out.push('  note: this reads declarations in source. A re-export under a different name is not visible here — the build still owns that case.');
    }
    return out;
}
/**
 * Exported identifiers declared in one TypeScript source file.
 *
 * Deliberately a scanner over DECLARATIONS, not a loader of the built package (ADR-001): a stale
 * `dist` answers "free" about a name the source already took, and answers it confidently. MEASURED
 * 2026-08-22 in this repo — half an hour of live runs against a previous build while `tsc` was red.
 */
/**
 * Source with comments blanked out, quotes respected.
 *
 * Trivia may sit between ANY two tokens: an `export` followed by a block comment and then `class`
 * was reported FREE, because the declaration pattern expects the keyword to be adjacent
 * (cross-family review round 4, codex gpt-5.6-sol, 2026-08-24). Rather than widen the pattern for
 * one shape of trivia, the trivia is removed first — which fixes the whole class at once.
 *
 * Newlines are PRESERVED so line-anchored patterns keep their anchors.
 */
export function stripComments(source) {
    let out = '';
    let i = 0;
    let quote = null;
    // The previous significant character decides whether a `/` opens a REGEX or divides. Without that
    // distinction the regex literal `/[/*]/` reads as a block-comment opener and everything after it
    // is blanked — so a later `export const Taken = 2;` vanished and was reported FREE (cross-family
    // review round 5, codex gpt-5.6-sol, 2026-08-24).
    let prev = '';
    const REGEX_MAY_FOLLOW = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>', '\n']);
    const KEYWORD_BEFORE_REGEX = /\b(return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await)\s*$/;
    while (i < source.length) {
        const c = source[i];
        const next = source[i + 1];
        if (quote !== null) {
            out += c;
            if (c === '\\') {
                out += next ?? '';
                i += 2;
                continue;
            }
            if (c === quote)
                quote = null;
            i++;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            quote = c;
            out += c;
            i++;
            prev = c;
            continue;
        }
        // Comment forms are checked FIRST because they are unambiguous: a regex literal can begin
        // with neither `/` nor `*`. Putting the regex check first made a block comment at the start
        // of a line look like a literal and survive the strip — a regression caught by its own test.
        if (c === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') {
                out += ' ';
                i++;
            }
            prev = '\n';
            continue;
        }
        if (c === '/' && next === '*') {
            const close = source.indexOf('*/', i + 2);
            if (close === -1) {
                // An UNTERMINATED block comment is not a comment — it is a misread. Blanking to EOF turned
                // every heuristic slip into a whole-file loss: `if (true) /[/*]/.test('*')` was read as an
                // opener after `)`, and every export below it vanished and was reported FREE (cross-family
                // review round 6, codex gpt-5.6-sol, 2026-08-24). Real source with an unclosed comment does
                // not compile, so treating the text as text is strictly the safer reading: the worst case
                // becomes a false TAKEN, which is conservative, instead of a false FREE, which is a lie.
                out += c;
                prev = c;
                i++;
                continue;
            }
            const stop = close + 2;
            for (let k = i; k < stop; k++)
                out += source[k] === '\n' ? '\n' : ' ';
            i = stop;
            prev = ' ';
            continue;
        }
        if (c === '/' && (REGEX_MAY_FOLLOW.has(prev) || KEYWORD_BEFORE_REGEX.test(out))) {
            // A regex literal: copy it verbatim to its unescaped closing slash. A `/` inside a character
            // class does not close it.
            let j = i + 1;
            let inClass = false;
            let closed = false;
            while (j < source.length) {
                const d = source[j];
                if (d === '\\') {
                    j += 2;
                    continue;
                }
                if (d === '\n')
                    break; // an unterminated literal is not one
                if (d === '[')
                    inClass = true;
                else if (d === ']')
                    inClass = false;
                else if (d === '/' && !inClass) {
                    closed = true;
                    j++;
                    break;
                }
                j++;
            }
            if (closed) {
                out += source.slice(i, j);
                prev = '/';
                i = j;
                continue;
            }
            // Not a regex after all — fall through to the comment checks below.
        }
        out += c;
        if (!/\s/.test(c) || c === '\n')
            prev = c;
        i++;
    }
    return out;
}
export function exportedNamesIn(rawSource) {
    const source = stripComments(rawSource);
    const names = new Set();
    // Non-binding declarations export exactly one name. The KEYWORD SET is the correctness of this
    // line just as much as the modifier set was: `export namespace Taken {}` was reported FREE because
    // `namespace` was missing (cross-family review round 3, codex gpt-5.6-sol, 2026-08-24). `module` is
    // the legacy spelling of the same thing and is admitted with it.
    const decl = /^\s*export\s+(?:(?:declare|abstract|async)\s+)*(?:function|class|interface|type|enum|namespace|module)\s+([A-Za-z_$][\w$]*)/gm;
    for (let m = decl.exec(source); m !== null; m = decl.exec(source))
        if (m[1] !== undefined)
            names.add(m[1]);
    // `const`/`let`/`var` can declare MANY names in one statement, and only the first was captured:
    // `export const Seen = 1, Taken = 2;` reported `Taken` FREE (cross-family review round 2, codex
    // gpt-5.6-sol, 2026-08-24). Destructuring exports names too. So the declarator list is parsed.
    const binding = /^\s*export\s+(?:declare\s+)*(?:const|let|var)\s+/gm;
    for (let m = binding.exec(source); m !== null; m = binding.exec(source)) {
        for (const n of declaredBindingNames(source.slice(m.index + m[0].length)))
            names.add(n);
    }
    // `export { a, b as c }` — the EXPORTED name is what a consumer collides with, so for an alias it
    // is the right-hand side. A bare list contributes its own names.
    const list = /^\s*export\s*\{([^}]*)\}/gm;
    for (let m = list.exec(source); m !== null; m = list.exec(source)) {
        for (const raw of (m[1] ?? '').split(',')) {
            const part = raw.trim();
            if (part === '' || part.startsWith('*'))
                continue;
            const alias = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(part);
            const bare = /^(?:type\s+)?([A-Za-z_$][\w$]*)$/.exec(part);
            const picked = alias?.[1] ?? bare?.[1];
            if (picked !== undefined && picked !== 'default')
                names.add(picked);
        }
    }
    return [...names];
}
const BINDING_NOISE = new Set(['readonly', 'as', 'const', 'await', 'typeof']);
/**
 * Every name bound by one `const`/`let`/`var` statement, given the text just after the keyword.
 *
 * Walks to the statement end at depth zero, splits the declarator list on top-level commas, and for
 * each declarator takes the identifiers before its first top-level `=` or `:` — so an initialiser
 * and a type annotation contribute nothing, while `a, b`, `{ a, b }` and `[a, b]` all do.
 */
function declaredBindingNames(after) {
    let depth = 0;
    let end = after.length;
    for (let i = 0; i < after.length; i++) {
        const c = after[i];
        if (c === '(' || c === '[' || c === '{')
            depth++;
        else if (c === ')' || c === ']' || c === '}') {
            if (depth === 0) {
                end = i;
                break;
            }
            depth--;
        }
        else if (c === ';' && depth === 0) {
            end = i;
            break;
        }
    }
    const stmt = after.slice(0, end);
    const parts = [];
    let level = 0;
    let start = 0;
    for (let i = 0; i < stmt.length; i++) {
        const c = stmt[i];
        if (c === '(' || c === '[' || c === '{')
            level++;
        else if (c === ')' || c === ']' || c === '}')
            level--;
        else if (c === ',' && level === 0) {
            parts.push(stmt.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(stmt.slice(start));
    const out = [];
    for (const part of parts) {
        let head = part;
        let lvl = 0;
        for (let i = 0; i < part.length; i++) {
            const c = part[i];
            if (c === '(' || c === '[' || c === '{')
                lvl++;
            else if (c === ')' || c === ']' || c === '}')
                lvl--;
            else if ((c === '=' || c === ':') && lvl === 0) {
                head = part.slice(0, i);
                break;
            }
        }
        for (const m of head.matchAll(/[A-Za-z_$][\w$]*/g)) {
            if (!BINDING_NOISE.has(m[0]))
                out.push(m[0]);
        }
    }
    return out;
}
/** Command names a CLI source dispatches. The help block is scanned separately by the caller. */
export function dispatchedCommandsIn(source) {
    const names = new Set();
    const re = /^\s*case\s+'([a-z][a-z0-9-]*)':/gm;
    for (let m = re.exec(source); m !== null; m = re.exec(source))
        if (m[1] !== undefined)
            names.add(m[1]);
    return [...names];
}
//# sourceMappingURL=name-check.js.map