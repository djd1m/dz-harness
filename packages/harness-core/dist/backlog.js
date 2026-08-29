/**
 * `dz backlog` — the Smart Backlog: a personal, goal-directed idea pipeline (feature smart-backlog).
 *
 * Capture an idea → semantic dedup against existing ideas via the EXISTING Brain vector engine
 * (agentdb + the shared embedder — ADR-001; NO second store) → score alignment against a GoalMap
 * (ADR-003) → weighted-roulette pick (ADR-004) → stage an idea2prd enrich hand-off → draft a Jira
 * issue through a configurable, stub-first adapter seam (ADR-006).
 *
 * ARCHITECTURE (05): every load-bearing decision is a PURE function tested on a layer-1 deterministic
 * test; the CLI handler (`cmdBacklog`) is a thin arg-parse + call. Semantic work (embedding, cosine,
 * vector search) is an OUTBOUND PORT to harness-core's Brain engine — this file defines NO embedder,
 * NO cosine, and imports NO MCP client (ADR-001 / ADR-006, both grep-guarded).
 *
 * Ideas carry `task_type:'dz-backlog'` in the shared `.dz/agentdb.db`, so they never surface in
 * `dz recall`'s lesson namespace (ADR-005 T-005b, the discriminating isolation test). Structured
 * records live in a dedicated `.dz/backlog/ideas.jsonl`, never in `.dz/memory/patterns.*`.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
// ── Outbound ports to the Brain engine (ADR-001): reuse VERBATIM, define none locally. ──
// Backlog vectors are written DIRECTLY to the agentdb `dz-backlog` namespace via
// `importVectorsToAgentdb` (NOT the configurable `mirrorEntriesToVector` engine), so write and read
// ALWAYS hit the SAME store regardless of `memory.vector.engine` (ADR-001/005 — the single-store
// property; routing through the generic engine let `engine:'rvf'` split writes from reads).
import { cosineSimilarity, deleteAgentdbByDzIds, importVectorsToAgentdb, resolveAgentdbEmbedder, searchAgentdbPatterns } from './agentdb-index.js';
// The ONE dedup embed form + the two-signal pair decision (register-inflation fix, 2026-08-11) —
// shared with agentdb-index's write path so query and row vectors can never live in different spaces.
import { BACKLOG_TASK_TYPE, DEDUP_EMBED_FORM_VERSION, dedupEmbedText, dedupPairBand, lexicalContainment } from './backlog-embed.js';
import { resolveEmbedModel } from './embedding-config.js';
// Seeded PRNG — reuse the ONE mulberry32 already in the repo (no second RNG; ADR-004 determinism).
import { mulberry32 } from './compounding.js';
// Re-export the embed-form module through the backlog surface (index.ts stars this file).
export { BACKLOG_TASK_TYPE, DEDUP_EMBED_CAP, DEDUP_EMBED_FORM_VERSION, dedupEmbedText, dedupExcerpt, dedupPairBand, distinctiveTokens, lexicalContainment, } from './backlog-embed.js';
export const EFFORT_MIN = 1;
export const EFFORT_MAX = 5;
/**
 * PURE `--effort` interpreter. `dz backlog add --effort 13` used to store 5 and say NOTHING, so the user
 * kept a wrong mental model of the scale (idea 86096d6d). Every alteration now carries a printable note;
 * an in-range integer is returned untouched with `adjusted:false` (no noise on the happy path).
 */
export function parseEffort(raw, fallback) {
    if (raw === undefined)
        return { effort: fallback, adjusted: false };
    const v = Number(raw);
    if (!Number.isFinite(v)) {
        return { effort: fallback, adjusted: true, note: `effort ${JSON.stringify(raw)} → not a number, using ${fallback} (scale ${EFFORT_MIN}-${EFFORT_MAX})` };
    }
    if (v < EFFORT_MIN)
        return { effort: EFFORT_MIN, adjusted: true, note: `effort ${raw} → clamped to ${EFFORT_MIN} (scale ${EFFORT_MIN}-${EFFORT_MAX})` };
    if (v > EFFORT_MAX)
        return { effort: EFFORT_MAX, adjusted: true, note: `effort ${raw} → clamped to ${EFFORT_MAX} (scale ${EFFORT_MIN}-${EFFORT_MAX})` };
    const floored = Math.floor(v);
    if (floored !== v)
        return { effort: floored, adjusted: true, note: `effort ${raw} → rounded down to ${floored} (scale ${EFFORT_MIN}-${EFFORT_MAX}, whole numbers)` };
    return { effort: floored, adjusted: false };
}
/* ================================================================== */
/*  CONFIG (readBacklogConfig) — defensive, Number.isFinite clamps.     */
/* ================================================================== */
export const DEFAULT_DUPLICATE_THRESHOLD = 0.92; // measured house constant (02 §R-D)
export const DEFAULT_RELATEDNESS_FLOOR = 0.35; // GROUND_VECTOR_SIMILARITY_FLOOR (02 §R-D)
/**
 * Two-signal corroboration cuts (register-inflation fix, MEASURED 2026-08-11 on the real store —
 * see backlog-embed.ts for the full numbers). Containment on the labeled classes: register-only
 * false-positive pairs <= 0.171, true duplicates that also cleared the cosine threshold >= 0.538 —
 * 0.30 sits between with real margin on both sides. Subset band: long-vs-short same-idea pair
 * measured at containment 0.971 / cosine 0.8019; the nearest non-duplicate (a template-family pair
 * differing in ONE entity) at containment 0.889 — 0.95 splits them.
 */
export const DEFAULT_CORROBORATION_FLOOR = 0.3;
export const DEFAULT_SUBSET_CONTAINMENT = 0.95;
export const DEFAULT_SUBSET_COSINE_FLOOR = 0.75;
export const DEFAULT_ROULETTE_ALPHA = 1.5;
export const DEFAULT_HALF_LIFE_DAYS = 30;
export const DEFAULT_RECENCY_FLOOR = 0.3;
export const DEFAULT_EFFORT = 3;
/** Finite-and-in-range or the fallback (the recurring Infinity-clamp lesson). */
function clampNum(v, lo, hi, fallback, opts = {}) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi)
        return fallback;
    return opts.intOnly ? Math.floor(v) : v;
}
export function readBacklogConfig(projectRoot) {
    const fallback = {
        dedup: {
            duplicateThreshold: DEFAULT_DUPLICATE_THRESHOLD,
            relatednessFloor: DEFAULT_RELATEDNESS_FLOOR,
            corroborationFloor: DEFAULT_CORROBORATION_FLOOR,
            subsetContainment: DEFAULT_SUBSET_CONTAINMENT,
            subsetCosineFloor: DEFAULT_SUBSET_COSINE_FLOOR,
        },
        roulette: {
            alpha: DEFAULT_ROULETTE_ALPHA,
            halfLifeDays: DEFAULT_HALF_LIFE_DAYS,
            recencyFloor: DEFAULT_RECENCY_FLOOR,
            defaultEffort: DEFAULT_EFFORT,
        },
        jira: { adapter: 'none' },
    };
    const configPath = join(projectRoot, '.dz', 'config.json');
    if (!existsSync(configPath))
        return fallback;
    try {
        const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
        const b = parsed.backlog ?? {};
        // `> 0 && <= 1` — a value of 2 or NaN falls back to 0.92 (ADR-002 T-002d).
        const dup = clampNum(b.dedup?.duplicateThreshold, Number.MIN_VALUE, 1, DEFAULT_DUPLICATE_THRESHOLD);
        // The floor must sit in [0, dup]. MED-7: re-range-check the ADJUSTED value (clamp the RESULT, not
        // just the input) — a tiny `dup` (e.g. 5e-324) previously drove `dup - EPSILON` NEGATIVE, so a
        // cosine of -1e-16 fell into the RELATED band. Force the repaired floor back into [0, dup].
        let floor = clampNum(b.dedup?.relatednessFloor, 0, 1, DEFAULT_RELATEDNESS_FLOOR);
        if (floor >= dup)
            floor = DEFAULT_RELATEDNESS_FLOOR < dup ? DEFAULT_RELATEDNESS_FLOOR : dup;
        floor = Math.min(Math.max(floor, 0), dup);
        const adapter = isBacklogBackend(b.jira?.adapter) ? b.jira.adapter : 'none'; // unknown ⇒ none (ADR-006 T-006d)
        return {
            dedup: {
                duplicateThreshold: dup,
                relatednessFloor: floor,
                corroborationFloor: clampNum(b.dedup?.corroborationFloor, 0, 1, DEFAULT_CORROBORATION_FLOOR),
                subsetContainment: clampNum(b.dedup?.subsetContainment, 0, 1, DEFAULT_SUBSET_CONTAINMENT),
                subsetCosineFloor: clampNum(b.dedup?.subsetCosineFloor, 0, 1, DEFAULT_SUBSET_COSINE_FLOOR),
            },
            roulette: {
                alpha: clampNum(b.roulette?.alpha, Number.MIN_VALUE, Number.MAX_VALUE, DEFAULT_ROULETTE_ALPHA),
                halfLifeDays: clampNum(b.roulette?.halfLifeDays, Number.MIN_VALUE, Number.MAX_VALUE, DEFAULT_HALF_LIFE_DAYS),
                recencyFloor: clampNum(b.roulette?.recencyFloor, Number.MIN_VALUE, 1, DEFAULT_RECENCY_FLOOR),
                defaultEffort: clampNum(b.roulette?.defaultEffort, 1, 5, DEFAULT_EFFORT, { intOnly: true }),
            },
            jira: { adapter },
        };
    }
    catch {
        return fallback;
    }
}
/* ================================================================== */
/*  STORE (AM-1) — .dz/backlog/ideas.jsonl (append-only JSONL, ADR-005) */
/* ================================================================== */
export function backlogDir(projectRoot) {
    return join(projectRoot, '.dz', 'backlog');
}
export function ideasPath(projectRoot) {
    return join(backlogDir(projectRoot), 'ideas.jsonl');
}
export function goalsPath(projectRoot) {
    return join(backlogDir(projectRoot), 'goals.json');
}
export function jiraOutboxDir(projectRoot) {
    return join(backlogDir(projectRoot), 'jira-outbox');
}
/** Content-addressed id — `sha1(text|createdTs).slice(0,16)`; NO `Date.now()` (mirrors patterns.ts). */
export function ideaId(text, createdTs) {
    return createHash('sha1').update(`${text}|${createdTs}`).digest('hex').slice(0, 16);
}
/**
 * Strict id whitelist (mirrors `dz score`'s slug guard) — the ONLY shape that may be interpolated into
 * a filesystem path (jira-outbox/<id>.json, enrich slug fallback). Rejects `.`/`..`/`/`/`\` and any
 * traversal, so an idea id like `../../../owned` from a hand-edited store can NEVER escape its dir
 * (HIGH-1). A content-addressed `ideaId()` (16 hex) always passes; anything else is refused, not sanitised
 * into a surprising path.
 */
export function isSafeId(id) {
    return typeof id === 'string' && id.length > 0 && id.length <= 64 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) && !id.includes('..');
}
/** Strip an id to a filesystem-safe token (defence-in-depth for a slug fallback — never a path). */
function safeIdToken(id) {
    const t = id.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
    return t === '' ? 'idea' : t;
}
/** Normalise a partial/loaded object into a full IdeaRecord (defensive: bad fields ⇒ safe defaults). */
function normaliseIdea(raw) {
    // HIGH-1: an id that is not filesystem-safe can NEVER enter the store — it would later interpolate
    // into an outbox filename or an enrich slug and escape its directory. Drop the record entirely.
    if (!isSafeId(raw.id) || typeof raw.text !== 'string')
        return undefined;
    const status = ['new', 'enriched', 'in-progress', 'shipped', 'dropped'].includes(raw.status)
        ? raw.status
        : 'new';
    // MED-6: a bad createdTs (`Date.parse` ⇒ NaN) would poison the roulette weight; coerce it to a
    // valid, maximally-old ISO timestamp so recency degrades to the neutral floor, never NaN.
    const createdRaw = typeof raw.createdTs === 'string' && Number.isFinite(Date.parse(raw.createdTs)) ? raw.createdTs : new Date(0).toISOString();
    const rec = {
        id: raw.id,
        text: raw.text,
        status,
        createdTs: createdRaw,
        effort: clampNum(raw.effort, 1, 5, DEFAULT_EFFORT, { intOnly: true }),
        goalId: typeof raw.goalId === 'string' ? raw.goalId : null,
        goalAlignment: clampNum(raw.goalAlignment, 0, 1, 0),
        relatedIds: Array.isArray(raw.relatedIds) ? raw.relatedIds.filter((x) => typeof x === 'string') : [],
        uses: clampNum(raw.uses, 0, Number.MAX_VALUE, 0, { intOnly: true }),
        tags: Array.isArray(raw.tags) ? raw.tags.filter((x) => typeof x === 'string') : [],
    };
    if (typeof raw.proposal === 'string')
        rec.proposal = raw.proposal;
    if (typeof raw.enrichedPath === 'string')
        rec.enrichedPath = raw.enrichedPath;
    if (typeof raw.jiraKey === 'string')
        rec.jiraKey = raw.jiraKey;
    if (typeof raw.statusTs === 'string')
        rec.statusTs = raw.statusTs;
    if (typeof raw.statusReason === 'string')
        rec.statusReason = raw.statusReason;
    return rec;
}
/** Read the append-only store. A corrupt line is SKIPPED (never fatal) — the whole store never throws. */
export function readIdeas(projectRoot) {
    const path = ideasPath(projectRoot);
    if (!existsSync(path))
        return [];
    let text;
    try {
        text = readFileSync(path, 'utf-8');
    }
    catch {
        return [];
    }
    const out = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '')
            continue;
        try {
            const rec = normaliseIdea(JSON.parse(trimmed));
            if (rec !== undefined)
                out.push(rec);
        }
        catch {
            /* skip corrupt line */
        }
    }
    return out;
}
/** Atomic full rewrite (tmp + rename) so a crash mid-write never truncates the store. */
export function writeIdeas(projectRoot, ideas) {
    const path = ideasPath(projectRoot);
    mkdirSync(dirname(path), { recursive: true });
    const body = ideas.map((i) => JSON.stringify(i)).join('\n') + (ideas.length > 0 ? '\n' : '');
    const tmp = `${path}.tmp-${process.pid}`;
    try {
        writeFileSync(tmp, body);
        renameSync(tmp, path);
    }
    catch (e) {
        try {
            unlinkSync(tmp);
        }
        catch { /* best-effort litter cleanup */ }
        throw e;
    }
}
/**
 * THE transition table — the single source of truth for which statuses each verb may leave from.
 * `target` is where the verb lands. For the IDEMPOTENT verbs (ship/drop) a record ALREADY at
 * `target` is a no-op that SAYS so (not an error) — a cleanup batch may name already-marked ideas.
 * `reopen` is deliberately NOT idempotent: reopening an already-`new` idea almost always means the
 * user grabbed the wrong id (they believed it was shipped), so it is refused loudly. A status in
 * neither set is an ILLEGAL transition — notably `dropped → shipped` and `shipped → dropped` both
 * require an explicit `reopen` first; a terminal state never silently becomes the other terminal.
 */
export const IDEA_TRANSITIONS = {
    ship: { target: 'shipped', from: ['new', 'enriched', 'in-progress'], idempotent: true },
    drop: { target: 'dropped', from: ['new', 'enriched', 'in-progress'], idempotent: true },
    reopen: { target: 'new', from: ['shipped', 'dropped', 'in-progress'], idempotent: false },
};
/** PURE transition legality check against {@link IDEA_TRANSITIONS}. */
export function checkTransition(verb, current) {
    const t = IDEA_TRANSITIONS[verb];
    if (t.from.includes(current))
        return { kind: 'transition', to: t.target };
    if (current === t.target && t.idempotent)
        return { kind: 'noop' };
    if (current === t.target) {
        return { kind: 'illegal', message: `cannot ${verb} a ${current} idea — it is already ${t.target} (did you mean a different id?)` };
    }
    return {
        kind: 'illegal',
        message: `cannot ${verb} a ${current} idea (${verb}: ${t.from.join('|')} → ${t.target})`,
    };
}
/**
 * Resolve a (possibly short) id prefix against the store's ids — the roulette prints 8-char ids, so
 * the transition verbs accept them. An EXACT id always wins; otherwise a UNIQUE prefix resolves and
 * anything else (no match / several matches) is a loud error, never a silent no-op (the
 * inconclusive-≠-pass discipline from dz skills-verify).
 */
export function resolveIdPrefix(ids, prefix) {
    if (ids.includes(prefix))
        return { kind: 'ok', id: prefix };
    const matches = [...new Set(ids.filter((id) => id.startsWith(prefix)))];
    if (matches.length === 1)
        return { kind: 'ok', id: matches[0] };
    if (matches.length === 0)
        return { kind: 'not-found', prefix };
    return { kind: 'ambiguous', prefix, matches: matches.sort() };
}
/**
 * Apply a batch of status transitions to `.dz/backlog/ideas.jsonl`.
 *
 * ALL-OR-NOTHING: any unresolved/ambiguous prefix or illegal transition fails the WHOLE batch with
 * NO write (fail-closed — a partial batch that "mostly worked" is how shipped work silently stays
 * eligible). LINE-PRESERVING: untouched lines (including corrupt ones readIdeas would skip) are
 * emitted byte-for-byte; a transitioned line is re-serialized from ITS OWN parsed object, so
 * `JSON.parse`/`stringify` key-order preservation keeps every non-status field byte-identical —
 * unknown fields a future schema might add survive untouched. (Documented limit: exotic JSON
 * scalars — lone surrogates, -0, >2^53 integers — would not round-trip byte-identically; no schema
 * field has those shapes, ids are 16-hex.) ATOMIC: tmp + rename, same as {@link writeIdeas}, so a
 * crash never leaves a torn store. (Documented limit: the read-modify-write is NOT locked against a
 * concurrent writer — pre-existing across every backlog writer, same as writeIdeas.)
 */
export function transitionIdeas(projectRoot, verb, prefixes, opts = {}) {
    const dryRun = opts.dryRun === true;
    const path = ideasPath(projectRoot);
    if (!existsSync(path)) {
        return { ok: false, dryRun, changes: [], errors: ['no backlog store — nothing captured yet (dz backlog add "<idea>")'], written: false };
    }
    let text;
    try {
        text = readFileSync(path, 'utf-8');
    }
    catch (e) {
        return { ok: false, dryRun, changes: [], errors: [`cannot read ${path}: ${e.message}`], written: false };
    }
    // Preserve the file's exact line structure: split WITHOUT discarding anything; untouched entries
    // (and unparseable lines) go back out verbatim.
    const lines = text.split('\n');
    const parsed = [];
    for (let i = 0; i < lines.length; i += 1) {
        const trimmed = (lines[i] ?? '').trim();
        if (trimmed === '')
            continue;
        try {
            const obj = JSON.parse(trimmed);
            if (typeof obj.id === 'string' && obj.id !== '') {
                parsed.push({ index: i, obj, id: obj.id, status: typeof obj.status === 'string' ? obj.status : 'new' });
            }
        }
        catch {
            /* corrupt line — left byte-for-byte as-is */
        }
    }
    const ids = parsed.map((p) => p.id);
    const errors = [];
    const changes = [];
    const resolvedIds = [];
    const seen = new Set();
    for (const prefix of prefixes) {
        if (!isSafeId(prefix)) {
            errors.push(`refusing an unsafe idea id: ${JSON.stringify(prefix)}`);
            continue;
        }
        const res = resolveIdPrefix(ids, prefix);
        if (res.kind === 'not-found') {
            errors.push(`no idea matches ${prefix} — run dz backlog list to see the ids`);
            continue;
        }
        if (res.kind === 'ambiguous') {
            errors.push(`ambiguous prefix ${prefix} — matches ${res.matches.join(', ')}; give more characters`);
            continue;
        }
        if (seen.has(res.id))
            continue; // the same idea named twice in one batch — count it once
        seen.add(res.id);
        resolvedIds.push(res.id);
    }
    // Legality pass over EVERY resolved id BEFORE any mutation (all-or-nothing).
    //
    // Legality and mutation are decided over the SAME set of lines: every line bearing the id
    // (a hand-edited duplicate is a store-integrity problem, and deciding legality on the FIRST
    // line while mutating ALL lines produced both failure modes — a first-`shipped` twin turned
    // `ship` into a no-op that left the second `new` twin roulette-eligible forever, and a
    // first-`new` twin let `ship` drag a second `dropped` twin through the dropped→shipped hop
    // checkTransition refuses). The rule: ANY twin at an illegal source state refuses the WHOLE
    // id loudly, naming the duplicate, and writes nothing; otherwise every not-yet-at-target twin
    // transitions, so no stale twin remains. All twins already at target = a said no-op.
    const nowIso = opts.nowIso ?? new Date().toISOString();
    const toMutate = [];
    for (const id of resolvedIds) {
        const entries = parsed.filter((p) => p.id === id);
        const dupNote = entries.length > 1 ? ` — id ${id} appears ${entries.length}× in the store (duplicate lines; resolve the duplicate by hand)` : '';
        const twins = entries.map((entry) => {
            const current = (['new', 'enriched', 'in-progress', 'shipped', 'dropped'].includes(entry.status) ? entry.status : 'new');
            return { entry, current, check: checkTransition(verb, current) };
        });
        const textPreview = typeof entries[0].obj.text === 'string' ? entries[0].obj.text.slice(0, 70) : '';
        const illegal = twins.find((t) => t.check.kind === 'illegal');
        if (illegal !== undefined) {
            errors.push(`${id}: ${illegal.check.message}${dupNote}`);
            continue;
        }
        const transitioning = twins.filter((t) => t.check.kind === 'transition');
        if (transitioning.length === 0) {
            // EVERY twin is already at the target — a genuine, said no-op (nothing stale can remain).
            changes.push({ id, from: twins[0].current, to: twins[0].current, action: 'noop', text: textPreview });
            continue;
        }
        changes.push({ id, from: transitioning[0].current, to: transitioning[0].check.to, action: 'transitioned', text: textPreview });
        for (const t of transitioning)
            toMutate.push(t.entry);
    }
    if (errors.length > 0) {
        return { ok: false, dryRun, changes: [], errors, written: false }; // fail-closed: NOTHING was written
    }
    const target = IDEA_TRANSITIONS[verb].target;
    if (dryRun || toMutate.length === 0) {
        return { ok: true, dryRun, changes, errors: [], written: false };
    }
    for (const p of toMutate) {
        p.obj.status = target;
        p.obj.statusTs = nowIso;
        if (opts.reason !== undefined && opts.reason !== '')
            p.obj.statusReason = opts.reason;
        else
            delete p.obj.statusReason; // a stale reason describes the PREVIOUS transition — never carry it
        lines[p.index] = JSON.stringify(p.obj);
    }
    const tmp = `${path}.tmp-${process.pid}`;
    try {
        writeFileSync(tmp, lines.join('\n'));
        renameSync(tmp, path);
    }
    catch (e) {
        try {
            unlinkSync(tmp);
        }
        catch { /* best-effort litter cleanup — never mask the original failure */ }
        return { ok: false, dryRun, changes: [], errors: [`store write failed: ${e.message}`], written: false };
    }
    return { ok: true, dryRun, changes, errors: [], written: true };
}
/* ── Edit a captured idea's TEXT (idea 1fde7bf6) ─────────────────────────────────────────────
 *
 * Why this verb exists at all: editing the store by hand does NOT re-embed the record, so its dedup
 * vector keeps describing the OLD text and later duplicate checks run against something the record
 * no longer says. The verb owns the text change; the CALLER owns the re-embed (it is async and needs
 * the vector tier). Between the two, the record carries `embedStale` — see ADR-001: the guard against
 * a stale vector lives where the HARM would be (the dedup verdict), not where the failure happened.
 * ────────────────────────────────────────────────────────────────────────────────────────── */
/** Where an edit's PREVIOUS text is preserved. An edit destroys text and `reopen` cannot undo it the
 * way it undoes `drop`, so the old text is appended here before the store is rewritten. */
export function editsLogPath(projectRoot) {
    return join(projectRoot, '.dz', 'backlog', 'edits.jsonl');
}
/**
 * Replace or extend ONE idea's text. Mirrors `transitionIdeas`' line discipline exactly: the file is
 * split without discarding anything, every untouched line — including a line the parser cannot read —
 * goes back BYTE-FOR-BYTE, and only the matched record's line is re-serialised. The store holds
 * dozens of records; a whole-file JSON round-trip would reformat all of them to change one.
 */
export function editIdea(projectRoot, prefix, opts = {}) {
    const dryRun = opts.dryRun === true;
    const hasText = typeof opts.text === 'string' && opts.text !== '';
    const hasAppend = typeof opts.append === 'string' && opts.append !== '';
    if (hasText && hasAppend) {
        return { ok: false, dryRun, errors: ['--text and --append are mutually exclusive — pick one'], written: false };
    }
    if (!hasText && !hasAppend) {
        return { ok: false, dryRun, errors: ['nothing to do: give --text "<new text>" or --append "<more text>"'], written: false };
    }
    const path = ideasPath(projectRoot);
    if (!existsSync(path)) {
        return { ok: false, dryRun, errors: ['no backlog store — nothing captured yet (dz backlog add "<idea>")'], written: false };
    }
    let raw;
    try {
        raw = readFileSync(path, 'utf-8');
    }
    catch (e) {
        return { ok: false, dryRun, errors: [`cannot read ${path}: ${e.message}`], written: false };
    }
    // Same line discipline as transitionIdeas: nothing is discarded, corrupt lines are left alone.
    const lines = raw.split('\n');
    const parsed = [];
    for (let i = 0; i < lines.length; i += 1) {
        const trimmed = (lines[i] ?? '').trim();
        if (trimmed === '')
            continue;
        try {
            const obj = JSON.parse(trimmed);
            if (typeof obj.id === 'string' && obj.id !== '')
                parsed.push({ index: i, obj, id: obj.id });
        }
        catch {
            /* corrupt line — left byte-for-byte as-is */
        }
    }
    if (!isSafeId(prefix)) {
        return { ok: false, dryRun, errors: [`refusing an unsafe idea id: ${JSON.stringify(prefix)}`], written: false };
    }
    const res = resolveIdPrefix(parsed.map((p) => p.id), prefix);
    if (res.kind === 'not-found') {
        return { ok: false, dryRun, errors: [`no idea matches ${prefix} — run dz backlog list to see the ids`], written: false };
    }
    if (res.kind === 'ambiguous') {
        return { ok: false, dryRun, errors: [`ambiguous prefix ${prefix} — matches ${res.matches.join(', ')}; give more characters`], written: false };
    }
    const entries = parsed.filter((p) => p.id === res.id);
    if (entries.length > 1) {
        // Deciding on the first line while rewriting one is how the sibling verb grew its twin bug.
        return { ok: false, dryRun, errors: [`${res.id} appears ${entries.length}× in the store (duplicate lines; resolve the duplicate by hand)`], written: false };
    }
    const entry = entries[0];
    const previousText = typeof entry.obj.text === 'string' ? entry.obj.text : '';
    const newText = hasText ? opts.text : `${previousText}${previousText === '' ? '' : ' '}${opts.append}`;
    if (newText === previousText) {
        return { ok: true, dryRun, id: res.id, previousText, newText, errors: [], written: false };
    }
    if (dryRun) {
        return { ok: true, dryRun, id: res.id, previousText, newText, errors: [], written: false };
    }
    // Only `text` changes, plus the stale marker. Every other field is carried through untouched.
    entry.obj.text = newText;
    entry.obj.embedStale = true;
    lines[entry.index] = JSON.stringify(entry.obj);
    const nowIso = opts.nowIso ?? new Date().toISOString();
    const logPath = editsLogPath(projectRoot);
    try {
        mkdirSync(join(projectRoot, '.dz', 'backlog'), { recursive: true });
        appendFileSync(logPath, `${JSON.stringify({ id: res.id, previousText, newText, ts: nowIso })}\n`);
    }
    catch (e) {
        // The trail is the ONLY copy of the previous text. Refuse rather than destroy it untraceably.
        return { ok: false, dryRun, id: res.id, previousText, newText, errors: [`edit log write failed, store left untouched: ${e.message}`], written: false };
    }
    const tmp = `${path}.tmp-${process.pid}`;
    try {
        writeFileSync(tmp, lines.join('\n'));
        renameSync(tmp, path);
    }
    catch (e) {
        try {
            unlinkSync(tmp);
        }
        catch { /* best-effort litter cleanup */ }
        return { ok: false, dryRun, id: res.id, previousText, newText, errors: [`store write failed: ${e.message}`], written: false };
    }
    return { ok: true, dryRun, id: res.id, previousText, newText, errors: [], written: true };
}
/** Clear the stale marker after a successful re-embed. Separate from `editIdea` because the re-embed
 * is async and belongs to the caller; a marker cleared without a re-embed would be a lie. */
export function clearEmbedStale(projectRoot, id) {
    const path = ideasPath(projectRoot);
    if (!existsSync(path))
        return false;
    let raw;
    try {
        raw = readFileSync(path, 'utf-8');
    }
    catch {
        return false;
    }
    const lines = raw.split('\n');
    let touched = false;
    for (let i = 0; i < lines.length; i += 1) {
        const trimmed = (lines[i] ?? '').trim();
        if (trimmed === '')
            continue;
        try {
            const obj = JSON.parse(trimmed);
            if (obj.id === id && obj.embedStale === true) {
                delete obj.embedStale;
                lines[i] = JSON.stringify(obj);
                touched = true;
            }
        }
        catch { /* corrupt line — left alone */ }
    }
    if (!touched)
        return false;
    const tmp = `${path}.tmp-clear-${process.pid}`;
    try {
        writeFileSync(tmp, lines.join('\n'));
        renameSync(tmp, path);
        return true;
    }
    catch {
        try {
            unlinkSync(tmp);
        }
        catch { /* best-effort */ }
        return false;
    }
}
/** The entry + its one-line rationale, written verbatim so the file explains itself. */
const BACKLOG_IGNORE_ENTRY = '.dz/backlog/';
const BACKLOG_IGNORE_COMMENT = '# dz backlog — captured ideas are private prompt-class content';
/**
 * Normalise ONE .gitignore pattern to the bare path it targets, so the equally-valid spellings of the
 * same rule compare equal: a leading `/` (repo-root anchor), a trailing `/**` or `/*` (recursive glob),
 * and a trailing `/` (directory marker) are all decoration around the same path. Returns `undefined`
 * for anything that is not a plain path pattern (a comment, an empty line, or a pattern carrying a
 * wildcard we do NOT interpret) — an uninterpretable pattern must never be read as coverage.
 */
function normaliseIgnorePattern(body) {
    let p = body.trim();
    if (p === '' || p.startsWith('#'))
        return undefined;
    if (p.startsWith('/'))
        p = p.slice(1); // repo-root anchor: `/.dz/` ≡ `.dz/`
    p = p.replace(/\/\*\*$/, '').replace(/\/\*$/, ''); // `.dz/**` / `.dz/*` ≡ `.dz`
    p = p.replace(/\/+$/, ''); // trailing directory marker
    if (p === '' || p.includes('*') || p.includes('?') || p.includes('['))
        return undefined; // not a plain path
    return p;
}
/** True when the pattern targets the backlog store (directly or via its `.dz` parent). */
function targetsBacklogStore(pattern) {
    return pattern === '.dz' || pattern === '.dz/backlog';
}
/**
 * PURE .gitignore verdict for the backlog store. Deliberately NOT a full gitignore engine — it
 * recognises the plain-path spellings of the rule (`/.dz/`, `.dz/**`, `.dz/backlog`, …) and refuses to
 * interpret anything else, because a wrong-but-clever matcher either double-appends or silently
 * decides a store is private when it is not.
 *
 * `negated` wins over `covered`: a `!.dz/backlog/` line (anchored or not) is the user saying *"track
 * this on purpose"*. We obey it — appending a rule that overrides the user's explicit opt-out would be
 * this tool deciding it knows better.
 */
export function backlogIgnoreStatus(gitignoreText) {
    let covered = false;
    for (const raw of String(gitignoreText).split('\n')) {
        const line = raw.trim();
        if (line === '' || line.startsWith('#'))
            continue;
        const negated = line.startsWith('!');
        const pattern = normaliseIgnorePattern(negated ? line.slice(1) : line);
        if (pattern === undefined || !targetsBacklogStore(pattern))
            continue;
        if (negated)
            return 'negated'; // explicit user intent — decided, no further scanning
        covered = true;
    }
    return covered ? 'covered' : 'uncovered';
}
/** Back-compat shim: "is it ignored?" — a negation is NOT coverage (the store is tracked on purpose). */
export function backlogIgnoreCovered(gitignoreText) {
    return backlogIgnoreStatus(gitignoreText) === 'covered';
}
/** The file's dominant line ending, so an append does not mix CRLF and LF in one file. */
function dominantEol(text) {
    const crlf = (text.match(/\r\n/g) ?? []).length;
    const lf = (text.match(/\n/g) ?? []).length - crlf;
    return crlf > lf ? '\r\n' : '\n';
}
/** Atomic write (tmp + rename in the SAME dir) — the ideas.jsonl discipline: a crash never truncates. */
function writeFileAtomic(path, body) {
    const tmp = `${path}.tmp-${process.pid}`;
    try {
        writeFileSync(tmp, body);
        renameSync(tmp, path);
    }
    catch (e) {
        try {
            unlinkSync(tmp);
        }
        catch { /* best-effort litter cleanup */ }
        throw e;
    }
}
/**
 * Ensure the backlog store is gitignored, at the moment the feature FIRST creates it (idea ec4cd60d).
 * Creates a `.gitignore` when there is none; appends the entry (+ its comment) when the project has one
 * that does not cover the store; touches NOTHING when it is already covered OR when the user explicitly
 * negated the rule. The write is ATOMIC and preserves the file's dominant EOL.
 * Never throws — an unwritable .gitignore degrades to `skipped`, and the CALLER must say so out loud
 * (a silently un-ignored store is exactly the privacy leak this function exists to prevent).
 */
export function ensureBacklogGitignored(projectRoot) {
    const path = join(projectRoot, '.gitignore');
    try {
        if (!existsSync(path)) {
            writeFileAtomic(path, `${BACKLOG_IGNORE_COMMENT}\n${BACKLOG_IGNORE_ENTRY}\n`);
            return { action: 'created', path };
        }
        const text = readFileSync(path, 'utf-8');
        const status = backlogIgnoreStatus(text);
        if (status === 'covered')
            return { action: 'already-covered', path };
        if (status === 'negated') {
            return { action: 'user-opted-out', path, reason: 'a "!" negation for the backlog store is present — respecting the explicit opt-out and adding nothing' };
        }
        const eol = dominantEol(text);
        const sep = text === '' || text.endsWith('\n') ? '' : eol;
        writeFileAtomic(path, `${text}${sep}${eol}${BACKLOG_IGNORE_COMMENT}${eol}${BACKLOG_IGNORE_ENTRY}${eol}`);
        return { action: 'appended', path };
    }
    catch (err) {
        return { action: 'skipped', path, reason: err instanceof Error ? err.message : String(err) };
    }
}
export function snapshotIdeas(projectRoot, dest) {
    try {
        const ideas = readIdeas(projectRoot);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, ideas.map((i) => JSON.stringify(i)).join('\n') + (ideas.length > 0 ? '\n' : ''));
        return { path: dest, count: ideas.length };
    }
    catch (err) {
        return { path: dest, count: 0, error: `snapshot failed: ${err instanceof Error ? err.message : String(err)}` };
    }
}
/**
 * THE LOAD-BEARING CLASSIFIER (ADR-002 T-002a, two-signal since the register-inflation fix) — PURE.
 * Bands via {@link dedupPairBand} (shared with harmonize):
 *   DUPLICATE  top-1 cosine ≥ duplicateThreshold AND corroborated (containment ≥ corroborationFloor
 *              or unknown) — OR any candidate in the SUBSET band (containment ≥ subsetContainment,
 *              cosine ≥ subsetCosineFloor): the same idea re-captured at a different length.
 *   RELATED    relatednessFloor ≤ cosine < dup, PLUS any DEMOTED candidate (≥ threshold cosine that
 *              failed corroboration — the register-only false positive) ⇒ create + attach relatedIds.
 *   NEW        cosine < relatednessFloor
 * Flip any cut and exactly one boundary fixture crosses a band — the test REDS.
 */
export function classifyDedup(candidates, cfg, opts = {}) {
    // HIGH-4: a non-finite cosine (NaN/±Infinity) sorts unpredictably and can shove a real 0.97 duplicate
    // out of the top slot → misclassified NEW. Drop non-finite candidates BEFORE sorting/banding (the
    // recurring repo `Number.isFinite` lesson).
    // A record whose text was edited but whose vector has not been rewritten is EXCLUDED from vector
    // candidacy — the same treatment a non-finite cosine gets, and for the same reason: the number does
    // not describe the record. ADR-001: the guard sits where the HARM would be (this verdict, days after
    // the edit) rather than where the failure happened (the edit's own output, which nobody re-reads).
    const staleExcluded = candidates.filter((c) => c.embedStale === true).map((c) => c.id);
    const sorted = candidates
        .filter((c) => c.embedStale !== true)
        .filter((c) => Number.isFinite(c.cosine))
        .sort((a, b) => b.cosine - a.cosine);
    const top = sorted[0];
    const exactTextOnly = opts.exactTextOnly === true;
    if (top === undefined)
        return { action: 'new', cosine: -1, matchedId: undefined, topMatchId: undefined, relatedIds: [], exactTextOnly, staleExcluded };
    const bands = new Map(sorted.map((c) => [c.id, dedupPairBand(c.cosine, c.containment, cfg)]));
    if (bands.get(top.id) === 'duplicate') {
        return {
            action: 'duplicate',
            cosine: top.cosine,
            matchedId: top.id,
            topMatchId: top.id,
            relatedIds: [],
            exactTextOnly,
            staleExcluded,
            ...(top.containment !== undefined ? { containment: top.containment } : {}),
        };
    }
    // Demotion is OBSERVABLE, never silent: the highest-cosine candidate that cleared the threshold but
    // failed corroboration is reported (the zombie x publish-gate incident surface).
    const demotedTop = sorted.find((c) => bands.get(c.id) === 'demoted');
    const demoted = demotedTop !== undefined ? { demoted: { id: demotedTop.id, cosine: demotedTop.cosine, containment: demotedTop.containment ?? 0 } } : {};
    // SUBSET promotion: highest-cosine candidate whose distinctive vocabulary contains (or is contained
    // by) the new idea's — length alone must not move the verdict.
    const subset = sorted.find((c) => bands.get(c.id) === 'subset-duplicate');
    if (subset !== undefined) {
        return {
            action: 'duplicate',
            cosine: subset.cosine,
            matchedId: subset.id,
            topMatchId: top.id,
            relatedIds: [],
            exactTextOnly,
            staleExcluded,
            subsetMatch: true,
            ...(subset.containment !== undefined ? { containment: subset.containment } : {}),
            ...demoted,
        };
    }
    // A demoted candidate IS related (its cosine is above the whole related band by construction).
    const related = sorted.filter((c) => bands.get(c.id) === 'demoted' || (c.cosine >= cfg.relatednessFloor && c.cosine < cfg.duplicateThreshold));
    const topContainment = top.containment !== undefined ? { containment: top.containment } : {};
    if (related.length > 0) {
        return {
            action: 'related',
            cosine: top.cosine,
            matchedId: undefined,
            topMatchId: top.id,
            relatedIds: related.map((c) => c.id),
            exactTextOnly,
            staleExcluded,
            ...topContainment,
            ...demoted,
        };
    }
    return { action: 'new', cosine: top.cosine, matchedId: undefined, topMatchId: top.id, relatedIds: [], exactTextOnly, ...topContainment, staleExcluded };
}
/**
 * Production dedup: embed+search the `dz-backlog` vectors (RAW COSINE via `searchAgentdbPatterns`,
 * NEVER the RRF `recallHybrid().score` — ADR-002 T-002c), then band via {@link classifyDedup}. If the
 * embedder/search is unavailable it DEGRADES to exact-text dedup (identical text ⇒ DUPLICATE), never
 * blocking capture (NFR-2 / ADR-002 T-002e).
 */
export async function dedupIdea(projectRoot, text, cfg, deps = {}) {
    const ideas = deps.ideas ?? readIdeas(projectRoot);
    const search = deps.search ??
        ((root, query) => searchAgentdbPatterns(root, query, { taskTypes: [BACKLOG_TASK_TYPE], limit: 20 }));
    // Match the stored embed form — the BOUNDED v2 excerpt (backlog-embed.ts) — so query and row
    // vectors co-locate. Full-length embeds INVERTED the duplicate signal on long texts (MEASURED:
    // genuine long-RU paraphrases 0.35–0.61 vs unrelated long-RU pairs up to 0.9195).
    const result = await search(projectRoot, dedupEmbedText(text));
    // MED-5: build the VALID candidate set FIRST (a hit must carry a dzId AND a finite cosine). Only
    // then decide — a malformed hit (missing dzId / NaN cosine) must NOT bypass the exact-text net.
    // HIGH-A: a hit whose dzId is NOT a member of the CURRENT ideas.jsonl is an ORPHAN vector (its
    // structured record was removed, e.g. by `harmonize --apply`); matching it would report a DUPLICATE
    // of a nonexistent idea (a dead match). Drop orphans before deciding — defense in depth alongside the
    // prune-on-removal in `harmonizeBacklog`.
    const liveIds = new Set(ideas.map((i) => i.id));
    const textById = new Map(ideas.map((i) => [i.id, i.text]));
    const candidates = [];
    for (const h of result.hits) {
        if (typeof h.dzId === 'string' && liveIds.has(h.dzId) && Number.isFinite(h.similarity)) {
            // Lexical corroboration over the FULL texts (the excerpt bounds only the embedding): a member
            // of liveIds always has a text, so containment is always attached on this path.
            const candText = textById.get(h.dzId);
            candidates.push({
                id: h.dzId,
                cosine: h.similarity,
                ...(candText !== undefined ? { containment: lexicalContainment(text, candText) } : {}),
            });
        }
    }
    if (result.error !== undefined || candidates.length === 0) {
        // No usable semantic signal (embedder unavailable, nothing mirrored, or only malformed hits) ⇒
        // EXACT-text safety net: identical text among existing ideas is still a DUPLICATE (content-addressed
        // idempotency, ADR-002 §degrade). Otherwise NEW — the RELATED band needs cosine and is skipped.
        const match = ideas.find((i) => i.text === text);
        if (match !== undefined)
            return { action: 'duplicate', cosine: 1, matchedId: match.id, topMatchId: match.id, relatedIds: [], exactTextOnly: true };
        return { action: 'new', cosine: -1, matchedId: undefined, topMatchId: undefined, relatedIds: [], exactTextOnly: result.error !== undefined };
    }
    return classifyDedup(candidates, cfg.dedup);
}
/** Reason an entry cannot become a Goal — `undefined` when it is well-formed. */
function goalDropReason(o) {
    if (o === null || typeof o !== 'object' || Array.isArray(o))
        return 'not an object';
    const r = o;
    if (typeof r.id !== 'string')
        return 'missing "id"';
    if (typeof r.statement !== 'string')
        return 'missing "statement"';
    return undefined;
}
/**
 * Detailed GoalMap read — never throws, and REPORTS what it dropped (idea 960c9f26). `readGoalMap` is the
 * lossy runtime view of this; both share one parser so they can never disagree about what a goal is.
 */
export function readGoalMapDetailed(projectRoot) {
    const path = goalsPath(projectRoot);
    if (!existsSync(path))
        return { goalMap: { version: 1, goals: [] }, present: 0, dropped: [], repaired: [] };
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(path, 'utf-8'));
    }
    catch (err) {
        return {
            goalMap: { version: 1, goals: [] },
            present: 0,
            dropped: [],
            repaired: [],
            parseError: `goals.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
    // Valid JSON that is not an object (null, a number, an array) must not crash the never-throw
    // reader: `parsed.version` on null is a TypeError (Codex re-QE HIGH).
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
            goalMap: { version: 1, goals: [] },
            present: 0,
            dropped: [],
            repaired: [],
            parseError: 'goals.json is valid JSON but not an object',
        };
    }
    const version = typeof parsed.version === 'number' ? parsed.version : 1;
    if (!Array.isArray(parsed.goals)) {
        return {
            goalMap: { version, goals: [] },
            present: 0,
            dropped: [],
            repaired: [],
            parseError: 'goals.json has no `goals` array',
        };
    }
    const goals = [];
    const dropped = [];
    const repaired = [];
    parsed.goals.forEach((g, index) => {
        const reason = goalDropReason(g);
        if (reason !== undefined) {
            dropped.push({ index, reason });
            return;
        }
        const o = g;
        const id = o.id;
        // The clamp keeps the RUNTIME safe; the raw value is recorded so validation can still see what the
        // user wrote (MED-7: clamping before validating made the validator's out-of-range branch dead code).
        const weight = clampNum(o.weight, Number.MIN_VALUE, 1, 1);
        if (o.weight !== undefined && o.weight !== weight) {
            repaired.push({
                index,
                id,
                field: 'weight',
                raw: o.weight,
                used: weight,
                reason: typeof o.weight === 'number' && Number.isFinite(o.weight)
                    ? `weight ${o.weight} is out of (0,1]`
                    : `weight ${JSON.stringify(o.weight) ?? String(o.weight)} is not a number in (0,1]`,
            });
        }
        goals.push({
            id,
            statement: o.statement,
            weight,
            keywords: Array.isArray(o.keywords) ? o.keywords.filter((k) => typeof k === 'string') : [],
        });
    });
    return { goalMap: { version, goals }, present: parsed.goals.length, dropped, repaired };
}
/** Defensive GoalMap reader — never throws; a missing/corrupt file ⇒ empty compass (the runtime path). */
export function readGoalMap(projectRoot) {
    return readGoalMapDetailed(projectRoot).goalMap;
}
/** The text embedded for a goal: statement + keywords (same convention across cache + score). */
export function goalEmbedText(goal) {
    return goal.keywords.length > 0 ? `${goal.statement} ${goal.keywords.join(' ')}` : goal.statement;
}
/**
 * THE LOAD-BEARING ALIGNMENT SCORER (ADR-003 T-003a) — PURE. Alignment =
 * `max over goals of ( cosine(ideaVec, goalVec) * weight )`, clamped to [0,1]. Weighted-MAX (not
 * sum/mean) so a focused idea advancing ONE goal strongly scores high. No goals ⇒ 0 / null.
 */
export function scoreAlignment(ideaVec, goals) {
    let bestId = null;
    let best = 0;
    for (const g of goals) {
        const raw = Math.max(0, cosineSimilarity(ideaVec, g.vec)) * g.weight;
        if (raw > best) {
            best = raw;
            bestId = g.id;
        }
    }
    return { goalId: bestId, goalAlignment: Math.min(1, best) };
}
/**
 * Production alignment: embed the idea + each goal (same reused embedder) and score. No embedder or no
 * GoalMap ⇒ `{goalId:null, goalAlignment:0}` — capture and roulette still work (ADR-003 T-003d).
 */
export async function alignIdea(projectRoot, text, goalMap, deps = {}) {
    if (goalMap.goals.length === 0)
        return { goalId: null, goalAlignment: 0 };
    let embed = deps.embed;
    if (embed === undefined) {
        const resolved = await resolveAgentdbEmbedder(projectRoot);
        if ('error' in resolved)
            return { goalId: null, goalAlignment: 0 };
        embed = resolved.embed;
    }
    try {
        const ideaVec = await embed(`${BACKLOG_TASK_TYPE}: ${text}`);
        // LOW-10: USE the goal-embed cache (the ADR-003 design) — goal vectors are stable across captures,
        // so re-embedding them every `add` is waste. The cache is keyed by embed model+dim (a model change
        // invalidates it, T-003e) and by each goal's text hash. Cache use is best-effort: any failure just
        // falls through to a live embed, never breaks alignment.
        const model = resolveEmbedModel(projectRoot);
        const useCache = !('error' in model);
        const cache = useCache ? readGoalEmbedCache(projectRoot) : undefined;
        const nextGoals = {};
        const goalVecs = [];
        let cacheChanged = false;
        for (const g of goalMap.goals) {
            let vec = useCache && !('error' in model) ? goalCacheHit(cache, model.model, model.dim, g) : undefined;
            if (vec === undefined) {
                vec = await embed(`${BACKLOG_TASK_TYPE}: ${goalEmbedText(g)}`);
                cacheChanged = true;
            }
            goalVecs.push({ id: g.id, vec, weight: g.weight });
            if (useCache)
                nextGoals[g.id] = { hash: goalTextHash(g), vec: Array.from(vec) };
        }
        if (useCache && !('error' in model) && cacheChanged) {
            try {
                writeGoalEmbedCache(projectRoot, { model: model.model, dim: model.dim, goals: nextGoals });
            }
            catch {
                /* cache write is best-effort — a failure never affects the score */
            }
        }
        return scoreAlignment(ideaVec, goalVecs);
    }
    catch {
        return { goalId: null, goalAlignment: 0 };
    }
}
function goalCachePath(projectRoot) {
    return join(backlogDir(projectRoot), 'goal-embeds.json');
}
function goalTextHash(goal) {
    return createHash('sha1').update(goalEmbedText(goal)).digest('hex').slice(0, 16);
}
/**
 * PURE cache validity check (ADR-003 T-003e): a cache is valid for a goal ONLY when the embed
 * model+dim manifest matches AND the goal's embed-text hash is unchanged. A model change (different
 * `model`/`dim`) invalidates EVERY cached goal vector — forcing a recompute, never a stale alignment.
 */
export function goalCacheHit(cache, model, dim, goal) {
    if (cache === undefined || cache.model !== model || cache.dim !== dim)
        return undefined;
    const entry = cache.goals[goal.id];
    if (entry === undefined || entry.hash !== goalTextHash(goal))
        return undefined;
    return Float32Array.from(entry.vec);
}
export function readGoalEmbedCache(projectRoot) {
    const path = goalCachePath(projectRoot);
    if (!existsSync(path))
        return undefined;
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf-8'));
        if (typeof parsed.model !== 'string' || typeof parsed.dim !== 'number' || typeof parsed.goals !== 'object')
            return undefined;
        return parsed;
    }
    catch {
        return undefined;
    }
}
export function writeGoalEmbedCache(projectRoot, cache) {
    const path = goalCachePath(projectRoot);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cache, null, 2));
}
/* ================================================================== */
/*  ROULETTE (AM-5 / ADR-004) — WEIGHTED, seeded, no starvation.        */
/* ================================================================== */
/** Tiny base added to the compass term so an unaligned idea keeps a non-zero weight (no starvation). */
export const ROULETTE_EPSILON = 0.02;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Ideas eligible for a spin: only `new` and `enriched` (ADR-004). */
export function eligibleIdeas(ideas) {
    return ideas.filter((i) => i.status === 'new' || i.status === 'enriched');
}
/** Bounded recency decay ∈ [floor, 1]: `2^(-ageDays/halfLife)`, floored so old ideas are down-weighted, never zero. */
export function recencyDecay(ageMs, halfLifeDays, floor) {
    const ageDays = Math.max(0, ageMs) / DAY_MS;
    const decay = Math.pow(2, -ageDays / halfLifeDays);
    return Math.max(floor, Math.min(1, decay));
}
/**
 * THE selection weight (ADR-004): `(alignment^alpha + EPS) · recencyDecay(age) · (1/effort)`. Strictly
 * positive for every idea (EPS>0, floor>0, effort≥1) ⇒ no permanent starvation (T-004c). Equal
 * alignment+age+effort ⇒ equal weights ⇒ a uniform draw (the T-004a control).
 */
export function ideaWeight(idea, cfg, nowMs) {
    // MED-6: EVERY factor is Number.isFinite-guarded so one bad field (NaN alignment, an unparseable
    // createdTs) degrades to a neutral contribution — it can NEVER poison the whole spin's total (which
    // would make the draw always pick the last item). A bad timestamp ⇒ neutral (floor) recency.
    const alignment = Number.isFinite(idea.goalAlignment) ? Math.max(0, Math.min(1, idea.goalAlignment)) : 0;
    const compass = Math.pow(alignment, cfg.alpha) + ROULETTE_EPSILON;
    const parsed = Date.parse(idea.createdTs);
    const age = Number.isFinite(parsed) ? nowMs - parsed : Number.POSITIVE_INFINITY; // bad ts ⇒ maximally old ⇒ floor
    const recency = recencyDecay(age, cfg.halfLifeDays, cfg.recencyFloor);
    const effort = Number.isFinite(idea.effort) && idea.effort >= 1 ? Math.max(1, Math.min(5, idea.effort)) : cfg.defaultEffort;
    const w = compass * recency * (1 / effort);
    return Number.isFinite(w) && w > 0 ? w : ROULETTE_EPSILON; // last-resort finite floor
}
/** Deterministic ranked shortlist (`--pick N`): by weight desc, id asc — no RNG. */
export function rankRoulette(ideas, cfg, nowMs) {
    return eligibleIdeas(ideas)
        .map((i) => ({ i, w: ideaWeight(i, cfg, nowMs) }))
        .sort((a, b) => b.w - a.w || (a.i.id < b.i.id ? -1 : 1))
        .map((x) => x.i);
}
/**
 * A single WEIGHTED-RANDOM spin over normalised weights, using an injected seeded RNG (`rng()∈[0,1)`).
 * Same seed ⇒ identical pick (ADR-004 T-004b determinism). Returns `undefined` when nothing is eligible.
 */
export function spinRoulette(ideas, cfg, rng, nowMs) {
    const pool = eligibleIdeas(ideas);
    if (pool.length === 0)
        return undefined;
    const weights = pool.map((i) => ideaWeight(i, cfg, nowMs));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0)
        return pool[0];
    let r = rng() * total;
    for (let k = 0; k < pool.length; k += 1) {
        r -= weights[k];
        if (r < 0)
            return pool[k];
    }
    return pool[pool.length - 1];
}
/** Build a seeded RNG from a `--seed` integer (reuses the one repo mulberry32). */
export function seededRng(seed) {
    return mulberry32(Number.isFinite(seed) ? Math.floor(seed) : 0);
}
/* ================================================================== */
/*  ENRICH (AM-7 / FR-5) — stage the idea2prd hand-off, do NOT expand.  */
/* ================================================================== */
/** kebab-case, Latin-only, ≤40 chars (feature-adr slug convention). */
export function ideaSlug(idea) {
    const base = idea.text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
        .replace(/-+$/g, '');
    // HIGH-1: the fallback must be a filesystem-safe token, NOT the raw id — a hand-edited id like
    // `../../../owned` would otherwise make the slug traverse out of `features/`.
    return base === '' ? `idea-${safeIdToken(idea.id)}` : base;
}
/**
 * Stage the idea2prd INPUT and hand off to the `idea2prd-manual` skill (an AGENT phase — 02 §R-G).
 * The CLI writes the scaffold ONLY; it never fabricates a PRD (idea2prd is a skill, not a synchronous
 * transform). Returns the hand-off target so the agent can pick it up.
 */
export function stageEnrichment(projectRoot, idea, related, goalMap) {
    const slug = ideaSlug(idea);
    const dir = join(projectRoot, 'features', slug);
    const scaffoldPath = join(dir, 'idea2prd-input.md');
    const goal = idea.goalId !== null ? goalMap.goals.find((g) => g.id === idea.goalId) : undefined;
    const lines = [
        `# idea2prd input — ${slug}`,
        '',
        '> STAGED by `dz backlog enrich`. This is the HAND-OFF scaffold, not a PRD. Run the',
        '> `idea2prd-manual` skill (agent phase) to expand it — the CLI never fabricates the PRD.',
        '',
        '## Idea',
        '',
        idea.text,
        '',
        `- id: \`${idea.id}\``,
        `- effort: ${idea.effort}/5`,
        `- goal alignment: ${idea.goalAlignment.toFixed(3)}${goal !== undefined ? ` (top goal: ${goal.id} — ${goal.statement})` : ' (no aligned goal)'}`,
        '',
        '## Related ideas (dedup RELATED band)',
        '',
        related.length > 0 ? related.map((r) => `- \`${r.id}\` — ${r.text}`).join('\n') : '_none_',
        '',
        '## Goal context (the compass)',
        '',
        goalMap.goals.length > 0 ? goalMap.goals.map((g) => `- \`${g.id}\` (w=${g.weight}): ${g.statement}`).join('\n') : '_no GoalMap_',
        '',
        '## Verification & honesty (owned at the BACKLOG layer, per the user steer)',
        '',
        '- Apply claim-check discipline: every accuracy claim MEASURED with a reproducer.',
        '- Run an adversarial red-team pass on the resulting PRD/ADRs.',
        '- Recall Brain lessons before asserting what exists (`dz recall`).',
        '',
    ];
    mkdirSync(dir, { recursive: true });
    writeFileSync(scaffoldPath, lines.join('\n'));
    return { slug, scaffoldPath };
}
/* ================================================================== */
/*  JIRA PORT (AM-6 / ADR-006) — closed vocab + registry + real stub.   */
/*  ⚠ NO MCP CLIENT IMPORT ANYWHERE IN THIS SEAM (grep-guard T-006b).   */
/* ================================================================== */
export const BACKLOG_BACKENDS = ['jira-mcp', 'copilot-mcp', 'none'];
export function isBacklogBackend(v) {
    return typeof v === 'string' && BACKLOG_BACKENDS.includes(v);
}
/** Pure draft builder from an idea. */
export function buildJiraDraft(idea, goalMap) {
    const goal = idea.goalId !== null ? goalMap.goals.find((g) => g.id === idea.goalId) : undefined;
    const descLines = [
        idea.proposal ?? idea.text,
        '',
        `Source idea: ${idea.id} (effort ${idea.effort}/5, alignment ${idea.goalAlignment.toFixed(3)})`,
        goal !== undefined ? `Top goal: ${goal.id} — ${goal.statement}` : 'No aligned goal',
        idea.relatedIds.length > 0 ? `Related ideas: ${idea.relatedIds.join(', ')}` : '',
        idea.enrichedPath !== undefined ? `Enriched: ${idea.enrichedPath}` : '',
    ].filter((l) => l !== '');
    return {
        summary: idea.text.length > 120 ? `${idea.text.slice(0, 117)}...` : idea.text,
        description: descLines.join('\n'),
        labels: ['dz-backlog', ...idea.tags],
        sourceIdeaId: idea.id,
    };
}
/** The `none` adapter — a REAL stub (not an absence check): writes the full draft to the outbox. */
const noneAdapter = {
    backend: 'none',
    async createIssue(draft, io) {
        const outboxPath = io.writeOutbox(draft.sourceIdeaId, { backend: 'none', draft });
        return { backend: 'none', key: null, stub: true, outboxPath };
    },
    async verify() {
        return {
            form: 'manual',
            ready: true, // the stub IS ready — it writes an auditable outbox with no external wiring
            instruction: 'The `none` backend writes .dz/backlog/jira-outbox/<id>.json — no external wiring needed.',
        };
    },
};
/** A declared-not-wired MCP seam: builds+persists the SAME outbox payload; verify() reports `manual`. */
function declaredMcpAdapter(backend, instruction) {
    return {
        backend,
        async createIssue(draft, io) {
            // v1: build + persist the same payload; NO live MCP call (FR-8.2). Honest stub — the wire is a TODO. no-stubs: pre-existing documented declared-not-wired seam (FR-8.2), untouched by the dedup fix
            const outboxPath = io.writeOutbox(draft.sourceIdeaId, { backend, draft, note: 'declared-not-wired seam (v1)' });
            return { backend, key: null, stub: true, outboxPath };
        },
        async verify() {
            return { form: 'manual', ready: false, instruction };
        },
    };
}
/** The registry — coverage-tested (ADR-006 T-006a): keys ≡ BACKLOG_BACKENDS as a set. */
export const JIRA_ADAPTERS = {
    'jira-mcp': declaredMcpAdapter('jira-mcp', 'Wire a Jira MCP server: `claude mcp add jira ...` then add it to .mcp.json `mcpServers`. Live wiring is a post-v1 adapter.'),
    'copilot-mcp': declaredMcpAdapter('copilot-mcp', 'Wire a Copilot MCP server into .mcp.json `mcpServers`. Live wiring is a post-v1 adapter.'),
    none: noneAdapter,
};
/** Factory: pick the configured adapter; an unknown value fell back to `none` in readBacklogConfig. */
export function resolveJiraAdapter(cfg) {
    return JIRA_ADAPTERS[cfg.jira.adapter] ?? JIRA_ADAPTERS.none;
}
/** Production BacklogIO — writes `.dz/backlog/jira-outbox/<id>.json`. */
export function makeBacklogIO(projectRoot) {
    return {
        writeOutbox(id, payload) {
            // HIGH-1: refuse any id that is not filesystem-safe — the filename is derived from it. A
            // traversal id can never write outside jira-outbox/. Legit content-addressed ids always pass.
            if (!isSafeId(id))
                throw new Error(`refusing unsafe idea id for outbox path: ${JSON.stringify(id)}`);
            const dir = jiraOutboxDir(projectRoot);
            mkdirSync(dir, { recursive: true });
            const path = join(dir, `${id}.json`);
            writeFileSync(path, JSON.stringify(payload, null, 2));
            return path;
        },
    };
}
/** Deterministic keeper within a cluster: most uses → oldest → smallest id (stable, testable). */
function pickKeeper(members) {
    return [...members].sort((a, b) => b.uses - a.uses || Date.parse(a.createdTs) - Date.parse(b.createdTs) || (a.id < b.id ? -1 : 1))[0];
}
/**
 * Batch-dedup the backlog: cluster near-duplicate ideas (cosine ≥ threshold when an embedder is
 * available, EXACT text otherwise), keep one deterministic keeper per cluster, merge the others'
 * `uses` into it. DRY-RUN by default (writes nothing); `--apply` SNAPSHOTS FIRST then mutates and
 * ABORTS the mutation if the snapshot fails (NFR-6). Injectable `embed` for tests.
 */
export async function harmonizeBacklog(projectRoot, opts = {}) {
    const apply = opts.apply === true;
    const threshold = opts.threshold !== undefined && opts.threshold > 0 && opts.threshold <= 1 ? opts.threshold : DEFAULT_DUPLICATE_THRESHOLD;
    const ideas = readIdeas(projectRoot);
    let embed = opts.embed;
    if (embed === undefined) {
        const resolved = await resolveAgentdbEmbedder(projectRoot);
        embed = 'error' in resolved ? null : resolved.embed;
    }
    let fellBackToExact = embed === null;
    // Build clusters (union-find over ≥threshold cosine, or exact-text groups).
    const parent = ideas.map((_, i) => i);
    const find = (x) => {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    };
    const union = (a, b) => {
        parent[find(a)] = find(b);
    };
    if (embed !== null && ideas.length >= 2) {
        try {
            // The SAME bounded embed form + two-signal pair decision as capture-time dedup (backlog-embed.ts):
            // batch harmonize and `dz backlog add` must never disagree about what a duplicate is. The
            // corroboration knobs come from config; the cosine threshold honors the `--threshold` override.
            const bandCfg = { ...readBacklogConfig(projectRoot).dedup, duplicateThreshold: threshold };
            const vecs = await Promise.all(ideas.map((i) => embed(dedupEmbedText(i.text))));
            for (let a = 0; a < ideas.length; a += 1) {
                for (let b = a + 1; b < ideas.length; b += 1) {
                    const band = dedupPairBand(cosineSimilarity(vecs[a], vecs[b]), lexicalContainment(ideas[a].text, ideas[b].text), bandCfg);
                    if (band === 'duplicate' || band === 'subset-duplicate')
                        union(a, b);
                }
            }
        }
        catch {
            fellBackToExact = true;
        }
    }
    if (fellBackToExact) {
        const byText = new Map();
        ideas.forEach((idea, i) => {
            const first = byText.get(idea.text);
            if (first === undefined)
                byText.set(idea.text, i);
            else
                union(i, first);
        });
    }
    const groups = new Map();
    ideas.forEach((idea, i) => {
        const root = find(i);
        (groups.get(root) ?? groups.set(root, []).get(root)).push(idea);
    });
    const clusters = [];
    const keepById = new Map();
    const dropIds = new Set();
    for (const members of groups.values()) {
        if (members.length < 2)
            continue;
        const keeper = pickKeeper(members);
        const drops = members.filter((m) => m.id !== keeper.id);
        clusters.push({ keep: keeper.id, drops: drops.map((d) => d.id) });
        keepById.set(keeper.id, keeper);
        for (const d of drops)
            dropIds.add(d.id);
    }
    const report = {
        mode: apply ? 'apply' : 'dry-run',
        fellBackToExact,
        threshold,
        clusters,
        kept: clusters.length,
        dropped: dropIds.size,
        unique: ideas.length - clusters.length - dropIds.size,
    };
    if (!apply || dropIds.size === 0)
        return report;
    // --apply: snapshot FIRST, then merge uses into keepers and drop the rest.
    const snapDest = join(backlogDir(projectRoot), `ideas.pre-harmonize-${Date.now()}.jsonl`);
    const snap = snapshotIdeas(projectRoot, snapDest);
    if (snap.error !== undefined)
        return { ...report, error: `backup failed — drop aborted: ${snap.error}` };
    const merged = new Map();
    for (const [id, keeper] of keepById)
        merged.set(id, { ...keeper });
    for (const c of clusters) {
        const keeper = merged.get(c.keep);
        keeper.uses += c.drops.length;
    }
    const survivors = ideas
        .filter((i) => !dropIds.has(i.id))
        .map((i) => merged.get(i.id) ?? i);
    writeIdeas(projectRoot, survivors);
    // HIGH-A: prune the agentdb `dz-backlog` vectors for every removed idea, so a later `add` can't match
    // an ORPHAN dzId (a DUPLICATE of a nonexistent idea). Best-effort for the structured store (already
    // snapshotted + written) — but MED-E: the prune outcome must NOT be swallowed. If it failed, the store
    // has dangling vectors; report it (a non-clean status) so the user knows, rather than a false success.
    const prune = deleteAgentdbByDzIds(projectRoot, [...dropIds], { taskTypes: [BACKLOG_TASK_TYPE] });
    return {
        ...report,
        snapshotPath: snapDest,
        ...(prune.error !== undefined
            ? { pruneError: `${dropIds.size} idea(s) removed from ideas.jsonl, but their agentdb vectors were NOT pruned: ${prune.error}` }
            : {}),
    };
}
/* ================================================================== */
/*  MIRROR seam (ADR-001) — write idea vectors through the ONE seam.    */
/* ================================================================== */
/**
 * Mirror one idea's vector into the SHARED `.dz/agentdb.db` under `task_type:'dz-backlog'`, written
 * DIRECTLY through `importVectorsToAgentdb` (upsert-by-dzId) — NOT the configurable vector engine.
 * This is the load-bearing single-store guarantee (ADR-001/005): dedup ALWAYS searches agentdb, so
 * the write must ALWAYS land in agentdb, no matter what `memory.vector.engine` says. Upsert-by-dzId
 * makes a re-mirror idempotent (0 duplicate rows). `guardEmbedSpace` inside `importVectorsToAgentdb`
 * covers the write (ADR-001 T-001c). Best-effort: NEVER blocks capture (I-1) — honest `{error}`.
 */
export async function mirrorIdeaVector(projectRoot, idea) {
    const emb = await resolveAgentdbEmbedder(projectRoot);
    if ('error' in emb)
        return { mirrored: 0, error: emb.error };
    let vector;
    try {
        vector = await emb.embed(dedupEmbedText(idea.text)); // SAME bounded embed form the dedup query uses (v2)
    }
    catch (err) {
        return { mirrored: 0, error: `embed failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    const res = await importVectorsToAgentdb(projectRoot, [
        {
            dzId: idea.id,
            vector,
            text: idea.text,
            taskType: BACKLOG_TASK_TYPE,
            score: Math.max(0, Math.min(1, Number.isFinite(idea.goalAlignment) ? idea.goalAlignment : 0)),
            metadata: { kind: 'dz-backlog-idea' },
        },
    ]);
    return { mirrored: res.imported, ...(res.error !== undefined ? { error: res.error } : {}) };
}
export function absorbedLogPath(projectRoot) {
    return join(backlogDir(projectRoot), 'absorbed.jsonl');
}
/**
 * Append the absorbed capture to `.dz/backlog/absorbed.jsonl`. Until this log existed, a DUPLICATE
 * verdict was the only backlog path that DESTROYED user text: the 2026-08-05 zombie-process idea and
 * the 2026-08-11 patient-values idea were both false absorptions whose original wording is gone
 * forever (`uses++` keeps no copy). The log makes every absorption auditable and reversible
 * (`dz backlog add` the logged text again after fixing the config). Best-effort: never throws, never
 * blocks capture — an unwritable log returns `{error}` for the caller to surface.
 */
export function recordAbsorption(projectRoot, entry) {
    try {
        mkdirSync(backlogDir(projectRoot), { recursive: true });
        appendFileSync(absorbedLogPath(projectRoot), `${JSON.stringify(entry)}\n`);
        return {};
    }
    catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}
/* ================================================================== */
/*  EMBED-FORM migration — one-shot re-mirror when the form version bumps. */
/* ================================================================== */
/** Marker recording which dedup embed FORM the mirrored vectors were built with. */
export function backlogEmbedFormPath(projectRoot) {
    return join(backlogDir(projectRoot), 'embed-form.json');
}
/** The recorded embed-form version, or 1 (the pre-marker full-text form) when absent/corrupt. */
export function readBacklogEmbedFormVersion(projectRoot) {
    const p = backlogEmbedFormPath(projectRoot);
    if (!existsSync(p))
        return 1;
    try {
        const parsed = JSON.parse(readFileSync(p, 'utf-8'));
        return typeof parsed.version === 'number' && Number.isFinite(parsed.version) ? parsed.version : 1;
    }
    catch {
        return 1;
    }
}
/**
 * Bring the mirrored dz-backlog vectors into the CURRENT embed form ({@link DEDUP_EMBED_FORM_VERSION}).
 * v1 vectors were full-text embeds; v2 queries are bounded excerpts — comparing across the two forms
 * is a query-vs-row space split for any idea longer than the cap (the exact "stale space rot" the
 * ADR-001 comments warn about). Re-mirrors every idea through the ONE seam (upsert-by-dzId, so it is
 * idempotent), and writes the marker ONLY after every re-mirror succeeded — a half-migrated store
 * keeps claiming the old version and is retried next time. Best-effort: NEVER blocks capture; a
 * `deferred` outcome must be surfaced by the caller (a silent stale space is the trap).
 */
export async function ensureBacklogEmbedForm(projectRoot, deps = {}) {
    const stored = readBacklogEmbedFormVersion(projectRoot);
    if (stored >= DEDUP_EMBED_FORM_VERSION)
        return { action: 'current', version: stored };
    const ideas = readIdeas(projectRoot);
    const writeMarker = () => {
        mkdirSync(backlogDir(projectRoot), { recursive: true });
        writeFileAtomic(backlogEmbedFormPath(projectRoot), `${JSON.stringify({ version: DEDUP_EMBED_FORM_VERSION })}\n`);
    };
    if (ideas.length === 0) {
        // Nothing to re-embed — stamp the marker so a store born under v2 never "migrates".
        try {
            writeMarker();
            return { action: 'empty', version: DEDUP_EMBED_FORM_VERSION };
        }
        catch (err) {
            return { action: 'deferred', version: stored, error: `marker write failed: ${err instanceof Error ? err.message : String(err)}` };
        }
    }
    let remirrored = 0;
    if (deps.mirror !== undefined) {
        for (const idea of ideas) {
            const res = await deps.mirror(projectRoot, idea);
            if (res.error !== undefined) {
                // Abort WITHOUT the marker: the store stays honestly marked v1 and the migration retries later.
                return { action: 'deferred', version: stored, remirrored, error: res.error };
            }
            remirrored += 1;
        }
    }
    else {
        // BATCHED production path: ONE embedder init + ONE upsert transaction. A per-idea
        // `mirrorIdeaVector` loop re-initializes the transformer model per idea — MEASURED 2026-08-11:
        // 105 ideas = 105 model loads, minutes of pure init time.
        const emb = await resolveAgentdbEmbedder(projectRoot);
        if ('error' in emb)
            return { action: 'deferred', version: stored, remirrored: 0, error: emb.error };
        const rows = [];
        try {
            for (const idea of ideas) {
                rows.push({
                    dzId: idea.id,
                    vector: await emb.embed(dedupEmbedText(idea.text)),
                    text: idea.text,
                    taskType: BACKLOG_TASK_TYPE,
                    score: Math.max(0, Math.min(1, Number.isFinite(idea.goalAlignment) ? idea.goalAlignment : 0)),
                    metadata: { kind: 'dz-backlog-idea' },
                });
            }
        }
        catch (err) {
            return { action: 'deferred', version: stored, remirrored: 0, error: `embed failed: ${err instanceof Error ? err.message : String(err)}` };
        }
        const res = await importVectorsToAgentdb(projectRoot, rows);
        if (res.error !== undefined)
            return { action: 'deferred', version: stored, remirrored: res.imported, error: res.error };
        remirrored = res.imported;
    }
    try {
        writeMarker();
    }
    catch (err) {
        return { action: 'deferred', version: stored, remirrored, error: `marker write failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    return { action: 'migrated', version: DEDUP_EMBED_FORM_VERSION, remirrored };
}
//# sourceMappingURL=backlog.js.map