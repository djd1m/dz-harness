/**
 * `dz guard promote` — lesson → guard-rule PROMOTION with a "win twice to promote" gate.
 *
 * The cost-of-detection ladder says: put every check on the strongest layer that can express it.
 * `dz compounding` MEASURED (2026-07-29) that this repo's learned store is ~82% write-only while the
 * rules that DID reach layer 1 collapsed their own violation rate (no-workspace-star 31→0,
 * readme-first 49→4). This module is the elevator: it moves a lesson from layer 5 (agent memory) to
 * layer 1 (a deterministic rule) — but only when real evidence earns it.
 *
 * Ported from rUv's `@claude-flow/guidance` ADR-G008 (optimizer-promotion-rule, ACCEPTED) +
 * `src/optimizer.ts` / `src/ledger.ts` (`score = frequency * cost`, promotionTracker, two
 * consecutive wins, one loss resets). IMPROVEMENT OVER SOURCE: ADR-G008's own Negative section
 * admits its A/B uses hard-coded SIMULATED reduction percentages. Here a "win" is a REPLAY of the
 * candidate's check over REAL commits — the firings are real or there is no win.
 *
 * PURE: zero imports, zero I/O, no wall clock. Callers inject lessons, existing rules, and the
 * change history; this module only computes. Same facts ⇒ byte-identical report.
 *
 * WHAT THIS DELIBERATELY IS NOT: a rule SYNTHESISER. Rule code is never generated from lesson text —
 * that is layer-4 model judgment wearing layer-1 clothing, and its failure mode is silent. The fixed
 * template vocabulary below is the entire executable surface (ADR-002).
 */
export const TEMPLATES = ['pairing-check', 'absence-check', 'format-match'];
/** Params are well-formed for their template (a hand-edited config cannot smuggle a half-rule in). */
export function validTemplateParams(template, params) {
    if (typeof template !== 'string' || !TEMPLATES.includes(template))
        return false;
    if (!params || typeof params !== 'object' || Array.isArray(params))
        return false;
    const p = params;
    const str = (k) => typeof p[k] === 'string' && p[k].length > 0 && p[k].length <= MAX_GLOB_LENGTH;
    // Glob-valued params are additionally bounded in WILDCARD DEGREE, so a hand-edited `.dz/guard.json`
    // cannot install a rule whose pattern makes the engine backtrack catastrophically. `mustMatch` is
    // a literal substring, never compiled, so only its length is bounded.
    const glob = (k) => str(k) && isSafeGlob(p[k]);
    if (template === 'pairing-check')
        return glob('when') && glob('requires');
    if (template === 'absence-check')
        return glob('forbid');
    return glob('file') && str('mustMatch');
}
// ── Glob matching (tiny, anchored, injection-proof) ──────────────────────────────────────────────
/**
 * `**` matches any run of characters (including `/`); `*` matches any run WITHOUT `/`. Every other
 * character is regex-escaped, so a lesson-derived token can never become an expression. Anchored at
 * both ends. Never throws.
 *
 * The leading `**​/` is OPTIONAL — `**​/package.json` matches BOTH `packages/a/package.json` and a
 * root-level `package.json`. A naive `.*` + `/` made the segment mandatory, so every promoted rule
 * silently missed root-level files: the shadow replay of a real 12-commit history scored 0 firings
 * and the candidate WAITED forever, looking like an honest verdict. A false gate is only ever found
 * by RUNNING it — the unit tests were green throughout.
 */
/**
 * The most wildcard groups a glob may contain. Our own classifier emits exactly ONE (`**​/<token>`),
 * so 2 is already generous; the cap exists because a regex built from `**a**a**a…` backtracks
 * catastrophically (Codex QE MEASURED >10 s on such a pattern). Collapsing adjacent `.*` does NOT
 * fix that — `.*a.*a.*a` is polynomial in the number of groups, so degree is the thing to bound.
 * Refusal is the right answer here: these params come from a classifier we control, and a glob
 * beyond the cap is a hand-edited config, not a promotion.
 */
export const MAX_GLOB_WILDCARDS = 2;
/** Longest path a glob is matched against; beyond this the input is not a repo path. */
export const MAX_GLOB_PATH_LENGTH = 4096;
/** Longest glob accepted. Mirrors the length bound in {@link validTemplateParams}. */
export const MAX_GLOB_LENGTH = 200;
/** Collapse `***`/`****`/… runs to `**`, so padding cannot inflate the wildcard count. */
export function normalizeGlob(glob) {
    return glob.replace(/\*{2,}/g, '**');
}
/** How many wildcard groups (`**` or `*`) a NORMALIZED glob contains. */
export function globWildcardCount(glob) {
    if (typeof glob !== 'string')
        return 0;
    return (normalizeGlob(glob).match(/\*\*|\*/g) ?? []).length;
}
/** A glob this module is willing to compile: bounded length AND bounded wildcard degree. */
export function isSafeGlob(glob) {
    return typeof glob === 'string' && glob.length > 0 && glob.length <= MAX_GLOB_LENGTH && globWildcardCount(glob) <= MAX_GLOB_WILDCARDS;
}
export function globMatch(glob, path) {
    if (typeof glob !== 'string' || typeof path !== 'string' || glob === '')
        return false;
    if (path.length > MAX_GLOB_PATH_LENGTH)
        return false;
    // REFUSE rather than compile: an unbounded-degree pattern is a denial of service, and a glob
    // that never matches is the safe failure here (a promoted rule that reports nothing, not a hang).
    if (!isSafeGlob(glob))
        return false;
    const g = normalizeGlob(glob);
    let re = '';
    for (let i = 0; i < g.length; i++) {
        const c = g[i];
        if (c === '*') {
            if (g[i + 1] === '*') {
                if (g[i + 2] === '/') {
                    re += '(?:.*/)?'; // `**/` spans zero or more directory segments
                    i += 2;
                }
                else {
                    re += '.*';
                    i += 1;
                }
            }
            else {
                re += '[^/]*';
            }
            continue;
        }
        re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    try {
        return new RegExp(`^${re}$`).test(path);
    }
    catch {
        return false;
    }
}
/**
 * Does this (template, params) fire on this change? ONE definition, used by BOTH the historical
 * replay and `evaluateGuard`'s template checker — a second copy would let the promoter promise a
 * rule the guard then enforces differently, silently.
 *
 * `undecidable` (not `fired:false`) when the evidence the template needs is absent: a
 * `format-match` over a change whose contents were not fetched is NOT a clean change, and counting
 * it as a non-firing would convert missing data into a LOSS (the INSUFFICIENT_DATA discipline).
 */
export function templateFires(template, params, change) {
    const files = Array.isArray(change?.files) ? change.files.filter((f) => typeof f === 'string') : [];
    if (template === 'pairing-check') {
        const armed = files.filter((f) => globMatch(params.when, f));
        if (armed.length === 0)
            return { fired: false };
        if (files.some((f) => globMatch(params.requires, f)))
            return { fired: false };
        return { fired: true, detail: `${armed.slice(0, 3).join(', ')} changed without any ${params.requires}` };
    }
    if (template === 'absence-check') {
        const hit = files.filter((f) => globMatch(params.forbid, f));
        return hit.length === 0 ? { fired: false } : { fired: true, detail: `${hit.slice(0, 3).join(', ')} matches the forbidden pattern ${params.forbid}` };
    }
    // format-match
    const targets = files.filter((f) => globMatch(params.file, f));
    if (targets.length === 0)
        return { fired: false };
    const contents = change.contents;
    if (!contents || typeof contents !== 'object')
        return { undecidable: `no content for ${targets.length} file(s) matching ${params.file}` };
    const missing = [];
    for (const t of targets) {
        const text = Object.hasOwn(contents, t) ? contents[t] : undefined;
        if (typeof text !== 'string')
            return { undecidable: `no content for ${t}` };
        if (!text.includes(String(params.mustMatch)))
            missing.push(t);
    }
    return missing.length === 0 ? { fired: false } : { fired: true, detail: `${missing.slice(0, 3).join(', ')} does not contain ${JSON.stringify(params.mustMatch)}` };
}
export function isClassified(x) {
    return Object.hasOwn(x, 'template');
}
/** Extensions a token must carry to count as an artifact reference. Closed list on purpose. */
const ARTIFACT_EXT = ['md', 'json', 'ts', 'tsx', 'js', 'mjs', 'cjs', 'yaml', 'yml', 'toml', 'lock', 'txt'];
const ARTIFACT_RE = new RegExp(`\\b[\\w.@/-]*[\\w@-]\\.(?:${ARTIFACT_EXT.join('|')})\\b`, 'g');
const PAIRING_RE = /\b(?:without|in the same (?:commit|change|diff|pr|merge request)|must also|requires? a[n]? [\w-]*\s*refresh|alongside)\b/i;
const ABSENCE_RE = /\b(?:never|must not|do not|don't|no longer)\b[^.]{0,80}?\b(?:commit|publish|ship|include|contain|add|check in)\b/i;
const FORMAT_RE = /\b(?:must (?:match|agree|equal|contain|carry)|in sync with|consistent with|agree with)\b/i;
/** Repo-STATE phrasing — recognised only so the refusal can name WHY (ADR-002). */
const PRESENCE_RE = /\b(?:every|each|all)\b[^.]{0,80}?\b(?:must (?:have|carry|ship with|contain|include)|needs? an?)\b/i;
/**
 * The discriminator between a repo-STATE predicate and a CHANGE predicate that happen to share the
 * phrase *"must contain"*. Codex QE MED-4: *"Every package must contain X in package.json"* is a
 * state predicate over repo entities and slipped through as `format-match`; *"Every CHANGED
 * package.json must contain X"* scopes over the change set and is genuinely per-commit decidable.
 * The word that scopes it is the whole difference, so it is the whole test.
 */
const CHANGE_SCOPED_RE = /\b(?:changed|modified|touched|edited|updated|committed|staged)\b/i;
/** Backticked spans, in order — the highest-confidence token source. */
function backticked(text) {
    const out = [];
    const re = /`([^`\n]{1,120})`/g;
    let m;
    while ((m = re.exec(text)) !== null)
        if (m[1] !== undefined)
            out.push(m[1].trim());
    return out;
}
/** Artifact tokens in TEXT ORDER, deduped. A token with no `/` becomes a basename glob. */
export function artifactTokens(text) {
    const seen = new Set();
    const out = [];
    for (const raw of text.match(ARTIFACT_RE) ?? []) {
        const t = raw.replace(/^[./]+/, '');
        if (t === '' || seen.has(t))
            continue;
        seen.add(t);
        out.push(t);
    }
    return out;
}
/** `README.md` → `**​/README.md`; `packages/x/README.md` → itself. */
export function tokenToGlob(token) {
    return token.includes('/') ? token : `**/${token}`;
}
/**
 * Reduce a lesson to a (template, params) pair, or refuse WITH A REASON.
 *
 * Conservative by construction and asymmetric by design: a false negative costs a missed promotion
 * (the lesson stays exactly where it already was); a false positive is caught downstream by the
 * win-twice gate and the duplicate refusal, and even a survivor lands SOFT + advisory.
 */
export function classifyLesson(text) {
    if (typeof text !== 'string' || text.trim() === '')
        return { reason: 'not-promotable: empty lesson text' };
    const tokens = artifactTokens(text);
    // PAIRING first: it is the most specific shape and the corpus phrases it explicitly.
    if (PAIRING_RE.test(text)) {
        if (tokens.length < 2)
            return { reason: `not-promotable: pairing-shaped but only ${tokens.length} artifact token(s) — cannot bind when/requires` };
        if (tokens.length > 3)
            return { reason: `not-promotable: pairing-shaped but ambiguous (${tokens.length} distinct artifact tokens; the classifier binds at most 2)` };
        const when = tokens[0];
        const requires = tokens[1];
        return { template: 'pairing-check', params: { when: tokenToGlob(when), requires: tokenToGlob(requires) }, tokens: [when, requires] };
    }
    if (ABSENCE_RE.test(text)) {
        if (tokens.length !== 1)
            return { reason: `not-promotable: absence-shaped but ${tokens.length} artifact token(s) — absence-check binds exactly 1` };
        return { template: 'absence-check', params: { forbid: tokenToGlob(tokens[0]) }, tokens: [tokens[0]] };
    }
    // PRESENCE IS TESTED BEFORE FORMAT (Codex QE MED-4). Both surface as "must contain", but only the
    // change-scoped one is decidable per commit. A state predicate that reached `format-match` would be
    // replayed against whatever files happened to change — an answer to a different question.
    if (PRESENCE_RE.test(text) && !CHANGE_SCOPED_RE.test(text)) {
        return {
            reason: 'not-promotable: presence-shaped (a repo-STATE predicate over repo entities, not over a change). v1 has no shadow evaluator for state predicates — replaying one against today\'s tree returns the same answer every window and would MANUFACTURE two consecutive wins from one observation. Re-word it to scope over the CHANGE ("every CHANGED <file> must …") if that is what you mean (ADR-002)',
        };
    }
    if (FORMAT_RE.test(text)) {
        const literals = backticked(text).filter((s) => !ARTIFACT_RE.test(s) && s.length >= 3);
        ARTIFACT_RE.lastIndex = 0; // the /g regex above is stateful — reset or the next call skips matches
        if (tokens.length !== 1)
            return { reason: `not-promotable: format-shaped but ${tokens.length} artifact token(s) — format-match binds exactly 1` };
        if (literals.length !== 1)
            return { reason: `not-promotable: format-shaped but ${literals.length} backticked literal(s) — format-match needs exactly 1 to match against` };
        return { template: 'format-match', params: { file: tokenToGlob(tokens[0]), mustMatch: literals[0] }, tokens: [tokens[0]] };
    }
    return { reason: 'not-promotable: no template matched (the lesson is semantic, not a deterministic change predicate)' };
}
/**
 * FNV-1a, 32-bit — a DISCRIMINATOR, not a security primitive, and labelled as one.
 *
 * It exists solely to keep two DIFFERENT rule bodies from claiming the same id after slug
 * normalisation (`a.b.json` and `a-b.json` both slug to `a-b-json`). Nothing trusts it for
 * integrity or authenticity; the key space is a few dozen self-generated rule bodies, so a
 * non-cryptographic 32-bit mix is ample. Kept in-module because this file is deliberately pure with
 * zero imports (NFR-1) — reaching for `node:crypto` here would buy nothing the threat model needs.
 */
export function fnv1a32(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}
/**
 * Stable rule id derived from the template + its bound params.
 *
 * The trailing hash is load-bearing (Codex QE MED-6): the slug lowercases and collapses every
 * non-alphanumeric run, so `a.b.json` and `a-b.json` — two genuinely different rules — produced the
 * SAME id and the second silently read as a duplicate of the first. The hash is taken over the
 * template and the actual PARAMS (not the pre-normalisation tokens), so two rules collide only if
 * they would enforce exactly the same thing.
 */
export function derivedRuleId(c) {
    const slug = c.tokens
        .map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
        .filter(Boolean)
        .join('-');
    const kind = c.template.replace('-check', '').replace('format-match', 'format');
    const hash = fnv1a32(paramsKey(c.template, c.params)).slice(0, 6);
    return `${`promoted-${kind}-${slug}`.slice(0, 72)}-${hash}`;
}
/**
 * The character set a promoted rule id may use. Enforced wherever an id becomes part of a FILE PATH:
 * an id is data that has round-tripped through `.dz/promotion-state.json`, and a path segment built
 * from unvalidated data is an arbitrary-write primitive (Codex QE HIGH-1).
 */
export function isSafeRuleId(id) {
    return typeof id === 'string' && id.length > 0 && id.length <= 100 && /^promoted-[a-z0-9][a-z0-9-]*$/.test(id);
}
/** The one place mini-ADR paths are defined (POSIX-relative, forward slashes). */
export const PROMOTIONS_REL_DIR = 'features/guard-promotion/promotions';
/**
 * DERIVE a mini-ADR path from a validated id + an integer sequence — the only way a promotion
 * document path is ever produced (Codex QE HIGH-1). Returns `null` when either input fails
 * validation, so a caller that gets `null` writes nothing rather than falling back to a raw string.
 * The character set (`isSafeRuleId`) admits no `/`, no `.`, and no `..`, so the result cannot escape
 * {@link PROMOTIONS_REL_DIR}; callers still assert containment after resolving, because a derivation
 * that is correct today is not a substitute for checking the thing you are about to write.
 */
export function promotionAdrRelPath(ruleId, seq) {
    if (!isSafeRuleId(ruleId))
        return null;
    if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0 || seq > 100_000)
        return null;
    return `${PROMOTIONS_REL_DIR}/${String(seq).padStart(3, '0')}-${ruleId}.md`;
}
// ── Coverage: what the built-in rules ALREADY do (ADR-002) ──────────────────────────────────────
/**
 * Template-equivalents of the built-in guard rules that have one. Rule ids are plain literals — this
 * module must not import `guard.ts` (guard.ts imports THIS one).
 *
 * DELIBERATELY PARTIAL. `no-secrets` (content regexes), `readme-consistency` (numeric parity),
 * `no-skill-drift` (byte comparison) and `store-bloat-cap` (a counter) have no template equivalent
 * and are simply absent. Partiality errs in the SAFE direction only because over-refusing costs a
 * missed promotion while under-refusing ships a duplicate rule — so when in doubt, add an entry.
 */
export const BUILTIN_COVERAGE = {
    'readme-first': { template: 'pairing-check', params: { when: '**/package.json', requires: '**/README.md' } },
    'lockfile-in-sync': { template: 'pairing-check', params: { when: '**/package.json', requires: '**/pnpm-lock.yaml' } },
};
/** Order-insensitive, whitespace-insensitive params key for equality. */
export function paramsKey(template, params) {
    const p = params ?? {};
    const parts = Object.keys(p)
        .sort()
        .map((k) => `${k}=${String(p[k]).trim()}`);
    return `${template}|${parts.join('&')}`;
}
/** The id of the rule that already covers this candidate, or `null`. */
export function coveringRule(c, existing) {
    const key = paramsKey(c.template, c.params);
    for (const [id, cov] of Object.entries(BUILTIN_COVERAGE)) {
        if (paramsKey(cov.template, cov.params) === key && existing.some((e) => e?.id === id))
            return id;
    }
    for (const e of existing) {
        if (!e || typeof e.id !== 'string')
            continue;
        if (e.template !== undefined && e.params !== undefined && paramsKey(e.template, e.params) === key)
            return e.id;
    }
    return null;
}
// ── The win-twice gate (ADR-003) ────────────────────────────────────────────────────────────────
export const DEFAULT_WINDOW_DAYS = 7;
export const DEFAULT_PERIODS = 4;
/** Below this many changes a window carries no information — it is SKIPPED, never counted a loss. */
export const MIN_CHANGES_PER_PERIOD = 5;
export const WINS_TO_PROMOTE = 2;
/** Cap on `git show` fetches per run; over it, a format-match candidate is insufficient-data. */
export const MAX_CONTENT_FETCHES = 200;
const DAY_MS = 86_400_000;
/**
 * Cut history into `periods` consecutive `windowDays` windows anchored at `nowMs`, walking BACKWARDS
 * and returned oldest→newest. Wall-clock windows, NOT per-invocation and NOT per-commit-count: an
 * operator's invocation frequency must never be an input to a safety gate (ADR-003 option A).
 */
export function buildPeriods(changes, nowMs, windowDays = DEFAULT_WINDOW_DAYS, periods = DEFAULT_PERIODS) {
    const w = Number.isFinite(windowDays) && windowDays >= 1 ? Math.min(Math.floor(windowDays), 365) : DEFAULT_WINDOW_DAYS;
    const n = Number.isFinite(periods) && periods >= 1 ? Math.min(Math.floor(periods), 52) : DEFAULT_PERIODS;
    const now = Number.isFinite(nowMs) ? nowMs : 0;
    const timed = (Array.isArray(changes) ? changes : [])
        .map((c) => ({ c, ms: Date.parse(c?.ts ?? '') }))
        .filter((x) => Number.isFinite(x.ms));
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
        const end = now - i * w * DAY_MS;
        const start = end - w * DAY_MS;
        out.push({
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
            changes: timed.filter((x) => x.ms > start && x.ms <= end).map((x) => x.c),
        });
    }
    return out;
}
/**
 * Replay the candidate over each period.
 *
 * A period below {@link MIN_CHANGES_PER_PERIOD} is SKIPPED — a one-commit week that happens not to
 * touch package.json is NOT evidence the pairing rule is worthless, it is NO evidence, and absence
 * of data must never be converted into a negative observation.
 */
export function evaluateCandidate(c, periods, minChanges = MIN_CHANGES_PER_PERIOD) {
    const floor = Number.isFinite(minChanges) && minChanges >= 1 ? Math.floor(minChanges) : MIN_CHANGES_PER_PERIOD;
    const results = [];
    let wins = 0;
    let evaluated = 0;
    let totalFirings = 0;
    let undecidable;
    for (const p of Array.isArray(periods) ? periods : []) {
        const changes = Array.isArray(p?.changes) ? p.changes : [];
        if (changes.length < floor) {
            results.push({ start: p.start, end: p.end, changes: changes.length, firings: 0, outcome: 'skipped' });
            continue;
        }
        let firings = 0;
        let evidence;
        for (const ch of changes) {
            const r = templateFires(c.template, c.params, ch);
            if (Object.hasOwn(r, 'undecidable')) {
                undecidable = undecidable ?? r.undecidable;
                continue;
            }
            if (r.fired) {
                firings += 1;
                evidence = evidence ?? `${ch.id}${r.detail ? `: ${r.detail}` : ''}`;
            }
        }
        evaluated += 1;
        totalFirings += firings;
        // A win increments; a LOSS RESETS TO ZERO (ADR-G008's rule, kept verbatim).
        if (firings > 0)
            wins += 1;
        else
            wins = 0;
        results.push({ start: p.start, end: p.end, changes: changes.length, firings, outcome: firings > 0 ? 'win' : 'loss', ...(evidence !== undefined ? { evidence } : {}) });
    }
    return { periods: results, evaluatedPeriods: evaluated, wins, totalFirings, ...(undecidable !== undefined ? { undecidable } : {}) };
}
/**
 * A promotion also needs this many WINDOW-LENGTHS of REAL elapsed time since the candidate was first
 * recorded — a defence Codex QE (MED-7) showed the window logic alone does not provide.
 *
 * The threat is not an attacker; it is ACCIDENTAL SELF-GAMING. Commit timestamps are author-supplied
 * (`GIT_COMMITTER_DATE`, a rebase, an import, a clock skew), so a repo whose history is minted in one
 * afternoon can present two full "windows" instantly, and the gate that is supposed to mean *"this
 * recurred over two separate stretches of work"* would mean nothing.
 *
 * THE HONEST SPLIT, stated so it is not mistaken for more than it is:
 *   • committer dates are trusted for firing ATTRIBUTION — which commit a violation belongs to;
 *   • the LOCAL clock, journalled in state, gates ELAPSED time — how long we have been watching.
 * This is not cryptographic and does not resist a determined forger (state is a local JSON file you
 * can edit). It resists the realistic failure: history that only LOOKS like it spans two windows.
 */
export const ELAPSED_WINDOWS_REQUIRED = 2;
export function promotedRuleObject(c, ruleId, lessonId) {
    const what = c.template === 'pairing-check'
        ? `a change touching ${c.params.when} must also touch ${c.params.requires}`
        : c.template === 'absence-check'
            ? `no change may touch ${c.params.forbid}`
            : `every changed ${c.params.file} must contain ${JSON.stringify(c.params.mustMatch)}`;
    return {
        id: ruleId,
        severity: 'soft',
        ops: ['publish'],
        enabled: true,
        template: c.template,
        params: c.params,
        description: `${what} — promoted from lesson ${lessonId} after ${WINS_TO_PROMOTE} consecutive shadow wins (dz guard promote)`,
    };
}
/**
 * Rank every lesson and decide. Deterministic: the sort is (score desc, ruleId asc, lessonId asc), so
 * ties never reorder between runs.
 */
export function assembleCandidates(facts) {
    const lessons = Array.isArray(facts?.lessons) ? facts.lessons : [];
    const existing = Array.isArray(facts?.existingRules) ? facts.existingRules : [];
    const nowMs = Date.parse(facts?.nowTs ?? '');
    const windowDays = Number.isFinite(facts?.windowDays) ? facts.windowDays : DEFAULT_WINDOW_DAYS;
    const periodCount = Number.isFinite(facts?.periods) ? facts.periods : DEFAULT_PERIODS;
    const periods = buildPeriods(facts?.changes ?? [], Number.isFinite(nowMs) ? nowMs : 0, windowDays, periodCount);
    // The REAL-elapsed requirement (MED-7), derived from the same window length the replay uses.
    const windowMs = (Number.isFinite(windowDays) && windowDays >= 1 ? Math.min(Math.floor(windowDays), 365) : DEFAULT_WINDOW_DAYS) * DAY_MS;
    const elapsedRequiredMs = ELAPSED_WINDOWS_REQUIRED * windowMs;
    const firstSeenMap = facts?.firstSeen && typeof facts.firstSeen === 'object' ? facts.firstSeen : {};
    const out = [];
    let quarantinedSkipped = 0;
    for (const l of lessons) {
        if (!l || typeof l.dzId !== 'string')
            continue;
        const uses = Number.isFinite(l.uses) && l.uses >= 0 ? Math.floor(l.uses) : 0;
        const cost = 1 + uses;
        const base = { lessonId: l.dzId, lessonText: typeof l.text === 'string' ? l.text : '', cost, ruleId: null, template: null, params: null, score: 0, firings: 0, wins: 0, evaluatedPeriods: 0, periods: [], proposedRule: null, firstSeenTs: null, elapsedMs: 0, elapsedRequiredMs };
        if (l.quarantined === true)
            quarantinedSkipped += 1;
        // (b) CHECKABILITY runs FIRST — not because it outranks trust, but because a refusal that names
        //     WHAT the lesson would become is a roadmap, and one that just says "quarantined" is a
        //     shrug. The trust gate below still decides the verdict; classification only informs it.
        const cls = classifyLesson(l.text);
        if (!isClassified(cls)) {
            // For an unclassifiable lesson, quarantine is moot — the deeper fact is that no deterministic
            // check can express it, and that stays true however reinforced it becomes.
            out.push({ ...base, verdict: 'not-promotable', reason: cls.reason });
            continue;
        }
        const ruleId = derivedRuleId(cls);
        const covering = coveringRule(cls, existing);
        // LOCAL-clock first observation. Absent (or unparseable) ⇒ this run IS the first observation, so
        // elapsed is 0 and nothing can promote — the clock starts when the candidate is first RECORDED,
        // which `--dry-run` deliberately never does.
        const firstSeenRaw = Object.hasOwn(firstSeenMap, ruleId) ? firstSeenMap[ruleId] : undefined;
        const firstSeenMs = typeof firstSeenRaw === 'string' ? Date.parse(firstSeenRaw) : Number.NaN;
        const firstSeenTs = Number.isFinite(firstSeenMs) ? firstSeenRaw : null;
        // A FUTURE firstSeen (clock skew, hand-edited state) must not mint elapsed time: clamp at 0.
        const elapsedMs = Number.isFinite(firstSeenMs) && Number.isFinite(nowMs) ? Math.max(0, nowMs - firstSeenMs) : 0;
        const shaped = { ...base, ruleId, template: cls.template, params: cls.params, firstSeenTs, elapsedMs };
        // (a) TRUST — a fresh lesson is a hypothesis (lesson-quarantine ADR). Enforcement is the LAST
        //     thing an unproven hypothesis should earn. This gate BINDS, whatever the classification says.
        if (l.quarantined === true) {
            out.push({
                ...shaped,
                verdict: 'not-promotable',
                reason: `not-promotable: quarantined (an unproven hypothesis must not become an enforced rule) — it WOULD classify as ${cls.template}${covering !== null ? `, and is already covered by '${covering}'` : ''}; confirm it with \`dz teach --reinforce\` to make it eligible`,
            });
            continue;
        }
        if (covering !== null) {
            out.push({ ...shaped, verdict: 'duplicate', reason: `duplicate: already covered by the existing rule '${covering}'` });
            continue;
        }
        const ev = evaluateCandidate(cls, periods);
        const score = ev.totalFirings * cost;
        const common = { ...shaped, score, firings: ev.totalFirings, wins: ev.wins, evaluatedPeriods: ev.evaluatedPeriods, periods: ev.periods };
        if (ev.undecidable !== undefined && ev.totalFirings === 0) {
            out.push({ ...common, verdict: 'insufficient-data', reason: `insufficient-data: ${ev.undecidable}` });
            continue;
        }
        if (ev.evaluatedPeriods < 2) {
            out.push({ ...common, verdict: 'insufficient-data', reason: `insufficient-data: only ${ev.evaluatedPeriods} period(s) had >= ${MIN_CHANGES_PER_PERIOD} changes — WAITING (thin evidence never promotes and never rejects)` });
            continue;
        }
        if (ev.wins >= WINS_TO_PROMOTE) {
            // The SECOND clock (MED-7). Two "windows" of committer dates can be minted in one afternoon;
            // real elapsed time since the candidate was first RECORDED cannot. Both must pass.
            if (elapsedMs < elapsedRequiredMs) {
                const days = (ms) => (ms / DAY_MS).toFixed(1);
                out.push({
                    ...common,
                    verdict: 'wait',
                    reason: `wait: ${ev.wins} consecutive shadow win(s), but only ${days(elapsedMs)}d of the ${days(elapsedRequiredMs)}d REAL elapsed time required since first observation` +
                        (firstSeenTs === null
                            ? ' — this run is the first observation; commit dates are author-supplied, so elapsed time is measured by the local clock recorded in .dz/promotion-state.json (a --dry-run never starts that clock)'
                            : ` (first seen ${firstSeenTs})`),
                });
                continue;
            }
            out.push({ ...common, verdict: 'promote', reason: `promote: ${ev.wins} consecutive shadow win(s) over ${ev.evaluatedPeriods} evaluated period(s), ${ev.totalFirings} real firing(s), and ${(elapsedMs / DAY_MS).toFixed(1)}d of real elapsed time since first observation`, proposedRule: promotedRuleObject(cls, ruleId, l.dzId) });
            continue;
        }
        out.push({ ...common, verdict: 'wait', reason: `wait: ${ev.wins}/${WINS_TO_PROMOTE} consecutive shadow win(s) over ${ev.evaluatedPeriods} evaluated period(s)` });
    }
    out.sort((a, b) => b.score - a.score || (a.ruleId ?? '').localeCompare(b.ruleId ?? '') || a.lessonId.localeCompare(b.lessonId));
    const n = (v) => out.filter((c) => c.verdict === v).length;
    const verdict = `${out.length} lesson(s) · promote ${n('promote')} · wait ${n('wait')} · insufficient-data ${n('insufficient-data')} · duplicate ${n('duplicate')} · not-promotable ${n('not-promotable')}`;
    return {
        candidates: out,
        totalLessons: lessons.length,
        quarantinedSkipped,
        windowDays: periods.length > 0 ? windowDays : DEFAULT_WINDOW_DAYS,
        periodCount: periods.length,
        totalChanges: Array.isArray(facts?.changes) ? facts.changes.length : 0,
        verdict,
    };
}
export const EMPTY_PROMOTION_STATE = { version: 1, nextAdrSeq: 1, entries: {} };
/**
 * Keys that must never become an entry name. `Object.hasOwn` stops a polluted JSON from being READ
 * through the prototype, but it does not stop `entries[key] = …` from WRITING through it: `JSON.parse`
 * gives `__proto__` as an own property, and a plain assignment with that key sets the object's
 * prototype instead of adding a member — so `state.entries.ruleId` then resolves to the attacker's
 * value. (Found by this feature's own hostile-input test, not by review.)
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/**
 * Read state defensively. `Object.hasOwn` (never `in`) so a prototype-polluted JSON cannot conjure an
 * entry; `Number.isInteger` on every counter because `1e400` parses to `Infinity`, passes `> 0`, and
 * this repo has already been bitten by exactly that twice (storeCap, auto-cost).
 */
export function normalizePromotionState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return EMPTY_PROMOTION_STATE;
    const o = raw;
    if (!Object.hasOwn(o, 'version') || o['version'] !== 1)
        return EMPTY_PROMOTION_STATE;
    const seqRaw = o['nextAdrSeq'];
    const nextAdrSeq = typeof seqRaw === 'number' && Number.isInteger(seqRaw) && seqRaw >= 1 && seqRaw <= 100_000 ? seqRaw : 1;
    const entries = {};
    const rawEntries = o['entries'];
    if (rawEntries && typeof rawEntries === 'object' && !Array.isArray(rawEntries)) {
        for (const key of Object.keys(rawEntries)) {
            if (!Object.hasOwn(rawEntries, key) || UNSAFE_KEYS.has(key))
                continue;
            const e = rawEntries[key];
            if (!e || typeof e !== 'object' || Array.isArray(e))
                continue;
            const r = e;
            const str = (k) => (typeof r[k] === 'string' ? r[k] : undefined);
            const int = (k) => (typeof r[k] === 'number' && Number.isInteger(r[k]) && r[k] >= 0 ? r[k] : 0);
            const ruleId = str('ruleId');
            const lessonId = str('lessonId');
            if (ruleId === undefined || lessonId === undefined)
                continue;
            // The KEY is used to derive a file path, so it must satisfy the id whitelist — and it must
            // agree with the entry's own ruleId, so a well-named key cannot smuggle a hostile body.
            if (!isSafeRuleId(key) || key !== ruleId)
                continue;
            const seqRawE = r['adrSeq'];
            const adrSeq = typeof seqRawE === 'number' && Number.isInteger(seqRawE) && seqRawE >= 0 && seqRawE <= 100_000 ? seqRawE : undefined;
            entries[key] = {
                ruleId,
                lessonId,
                // A malformed-but-nonempty firstSeenTs would WEDGE the elapsed clock forever (now − NaN is
                // never ≥ anything) — an unparseable timestamp RESTARTS the clock instead (Codex re-QE LOW).
                firstSeenTs: (() => { const v = str('firstSeenTs') ?? ''; return v !== '' && Number.isFinite(Date.parse(v)) ? v : ''; })(),
                lastRunTs: str('lastRunTs') ?? '',
                wins: int('wins'),
                evaluatedPeriods: int('evaluatedPeriods'),
                verdict: ['promote', 'wait', 'insufficient-data', 'duplicate', 'not-promotable'].includes(str('verdict')) ? str('verdict') : 'wait',
                ...(adrSeq !== undefined ? { adrSeq } : {}),
                ...(str('appliedTs') !== undefined ? { appliedTs: str('appliedTs') } : {}),
            };
        }
    }
    return { version: 1, nextAdrSeq, entries };
}
/**
 * Fold a report into the state journal.
 *
 * THE ANTI-GAMING PROPERTY (SP-3): `wins` is OVERWRITTEN with the freshly recomputed value — it is
 * never `prev.wins + …`. The state is a JOURNAL, not the source of truth, so running the promoter
 * ten times over unchanged history leaves the counter exactly where one run leaves it. (Recalled
 * lesson: "a learning loop's write path can promote by EXPOSURE without anyone noticing.")
 */
export function nextPromotionState(prev, report, nowTs, adrSeqs = {}, newlyAllocated) {
    const base = normalizePromotionState(prev);
    const entries = { ...base.entries };
    for (const c of report.candidates) {
        // Unclassifiable lessons get no journal entry (they have no rule identity); an id that fails the
        // whitelist gets none either, because the key is later turned into a file path.
        if (c.ruleId === null || UNSAFE_KEYS.has(c.ruleId) || !isSafeRuleId(c.ruleId))
            continue;
        const old = Object.hasOwn(entries, c.ruleId) ? entries[c.ruleId] : undefined;
        entries[c.ruleId] = {
            ruleId: c.ruleId,
            lessonId: c.lessonId,
            firstSeenTs: old?.firstSeenTs && old.firstSeenTs !== '' ? old.firstSeenTs : nowTs,
            lastRunTs: nowTs,
            wins: c.wins, // OVERWRITE, never accumulate — SP-3
            evaluatedPeriods: c.evaluatedPeriods,
            verdict: c.verdict,
            ...(Object.hasOwn(adrSeqs, c.ruleId) ? { adrSeq: adrSeqs[c.ruleId] } : old?.adrSeq !== undefined ? { adrSeq: old.adrSeq } : {}),
            ...(old?.appliedTs !== undefined ? { appliedTs: old.appliedTs } : {}),
        };
    }
    // Only NEWLY allocated documents advance the sequence — a re-refused candidate rewrites its own
    // file, so counting every path would leave permanent gaps in the numbering.
    const seq = Number.isInteger(newlyAllocated) && newlyAllocated >= 0 ? newlyAllocated : Object.keys(adrSeqs).length;
    return { version: 1, nextAdrSeq: Math.min(100_000, base.nextAdrSeq + seq), entries };
}
// ── Rendering ───────────────────────────────────────────────────────────────────────────────────
const GLYPH = {
    promote: '★',
    wait: '·',
    'insufficient-data': '?',
    duplicate: '=',
    'not-promotable': '✗',
};
export function renderPromotionReport(r, limit = 15) {
    const out = [];
    out.push('dz guard promote — lesson → guard-rule promotion (two consecutive shadow wins required)');
    out.push('');
    out.push(`  corpus: ${r.totalLessons} lesson(s) · ${r.quarantinedSkipped} quarantined · ${r.totalChanges} change(s) over ${r.periodCount} × ${r.windowDays}d window(s)`);
    out.push('');
    // A lesson that REDUCED to a template is shown even when refused — that is the interesting half of
    // the report. Only the unclassifiable ones collapse into the histogram below.
    const ranked = r.candidates.filter((c) => c.ruleId !== null);
    if (ranked.length === 0) {
        out.push('  RANKED CANDIDATES: none — no lesson in the store reduces to a v1 rule template');
    }
    else {
        out.push('  RANKED CANDIDATES (score = firings × cost, cost = 1 + lesson uses — cost is a PROXY, not a token figure):');
        for (const c of ranked.slice(0, limit)) {
            out.push(`    ${GLYPH[c.verdict]} [${String(c.score).padStart(4)}] ${c.ruleId ?? '(unclassified)'}  ${c.verdict.toUpperCase()}`);
            out.push(`        ${c.reason}`);
            if (c.periods.length > 0) {
                out.push(`        periods (oldest→newest): ${c.periods.map((p) => `${p.outcome === 'win' ? 'W' : p.outcome === 'loss' ? 'L' : '–'}${p.firings}/${p.changes}`).join(' ')}`);
                const ev = c.periods.find((p) => p.evidence !== undefined);
                if (ev?.evidence !== undefined)
                    out.push(`        evidence: ${ev.evidence}`);
            }
        }
        if (ranked.length > limit)
            out.push(`    … ${ranked.length - limit} more`);
    }
    const refused = r.candidates.filter((c) => c.verdict === 'not-promotable' && c.ruleId === null);
    if (refused.length > 0) {
        out.push('');
        out.push(`  NOT PROMOTABLE — no template matched (${refused.length}), by reason:`);
        const byReason = new Map();
        for (const c of refused) {
            const short = c.reason.replace(/^not-promotable: /, '').split(' —')[0].split(' (the classifier')[0];
            byReason.set(short, (byReason.get(short) ?? 0) + 1);
        }
        for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1]))
            out.push(`    ${String(n).padStart(4)} × ${reason}`);
    }
    out.push('');
    out.push(`  VERDICT: ${r.verdict}`);
    return out.join('\n');
}
/**
 * The mini-ADR for one decision. Written for PROMOTIONS and REJECTIONS alike (ADR-G008 requires
 * both) — a refusal is a decision about the harness's own capability, and it is what turns the
 * "not promotable" list into a roadmap instead of a shrug. `wait` / `insufficient-data` get NO
 * document: they are not decisions yet, and one per run would bury the real ones.
 */
export function renderPromotionAdr(c, seq, nowTs) {
    const decision = c.verdict === 'promote' ? 'PROMOTED (proposal)' : 'REFUSED';
    const out = [];
    out.push(`# ${String(seq).padStart(3, '0')} — ${c.ruleId ?? c.lessonId}`);
    out.push('');
    out.push(`**Decision:** ${decision}`);
    out.push(`**Date:** ${nowTs}`);
    out.push(`**Lesson:** \`${c.lessonId}\``);
    out.push('');
    out.push('## Lesson');
    out.push('');
    out.push('> ' + c.lessonText.replace(/\n/g, '\n> '));
    out.push('');
    out.push('## Classification');
    out.push('');
    out.push(`- template: \`${c.template ?? '(none)'}\``);
    out.push(`- params: \`${JSON.stringify(c.params ?? {})}\``);
    out.push('');
    out.push('## Evidence');
    out.push('');
    out.push(`- score: **${c.score}** = ${c.firings} firing(s) × cost ${c.cost} (cost = 1 + lesson uses — a named PROXY, not a token/dollar figure)`);
    out.push(`- consecutive shadow wins: **${c.wins}** / ${WINS_TO_PROMOTE} required`);
    out.push(`- evaluated periods: ${c.evaluatedPeriods} (a period with < ${MIN_CHANGES_PER_PERIOD} changes is SKIPPED, never counted a loss)`);
    if (c.periods.length > 0) {
        out.push('');
        out.push('| window start | window end | changes | firings | outcome | evidence |');
        out.push('|---|---|---|---|---|---|');
        for (const p of c.periods)
            out.push(`| ${p.start} | ${p.end} | ${p.changes} | ${p.firings} | ${p.outcome} | ${p.evidence ?? '—'} |`);
    }
    out.push('');
    out.push('## Reason');
    out.push('');
    out.push(c.reason);
    out.push('');
    if (c.proposedRule !== null) {
        out.push('## The rule `--apply` would write into `.dz/guard.json`');
        out.push('');
        out.push('```json');
        out.push(JSON.stringify(c.proposedRule, null, 2));
        out.push('```');
        out.push('');
        out.push('Severity is `soft` and cannot be raised: `resolveRules` forces SOFT for every');
        out.push('template-backed rule, so a hand-edited `"severity": "hard"` in the config is ignored');
        out.push('(ADR-004 / the `lockfile-in-sync` precedent).');
    }
    return out.join('\n') + '\n';
}
//# sourceMappingURL=guard-promotion.js.map