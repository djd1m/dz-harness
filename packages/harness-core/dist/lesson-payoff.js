/**
 * Lesson Payoff — the anti-corruption layer around the vendored bandit engine
 * (feature lesson-bandit-rerank; ADR-001 / ADR-002 / ADR-003, domain model §6).
 *
 * WHAT THIS OWNS. One question: *how often did THIS lesson, in THIS kind of situation, actually
 * resolve a problem?* It knows a lesson only as an opaque `ArmKey` (its `dzId`). It never reads
 * lesson text, never writes to the pattern store, never decides candidate membership, and never
 * touches quarantine state (INV-9).
 *
 * WHY AN ACL WHEN WE OWN THE COPY. Vendoring gives us the FILE, not the LANGUAGE. The engine's
 * only counter-advancing method (`recordReward`) also moves the Beta parameters, so there is no way
 * to tell it "a pull happened, no evidence either way". Our domain MUST be able to say that: an
 * EXPOSURE is not a REWARD (INV-2 — the defect cross-model QE already removed once from
 * `patterns.ts`, where recall-hit telemetry was silently promoting every viewed lesson). So the
 * exposure counter lives in OUR envelope, beside the engine payload, and INV-2 is true by DATA
 * LAYOUT rather than by call-site discipline: there is no field in `bandit.contexts` an exposure is
 * allowed to touch.
 *
 * DETERMINISM (ADR-001 D-2 / D-7, reaffirmed by ADR-003's P5). The default payoff term is the
 * POSTERIOR MEAN `alpha/(alpha+beta)`, mapped to `[-1,+1]`, using ONLY `getArmStats` — never
 * `selectArm`, never `rerank`. Both of those Thompson-SAMPLE (`Math.random()` on every zero-pull
 * arm), which would make two identical recalls disagree, defeat the byte-identity proof, and hand
 * quarantined lessons a random lift. `05_architecture.md` §3 and `04_domain_model.md` §6.2 sketch an
 * order-projection over `rerank()` instead; that draft is refuted by ADR-003's P5 ("with
 * `banditExploration` absent, no `Math.random()` is consumed on the recall path"), which `rerank`
 * cannot satisfy. The ADRs are the decision record and they win; this file implements them, and the
 * bound the order-projection was chosen for is preserved exactly — the term is in `[-1,+1]` by
 * construction, so the caller's cap is an EXACT bound.
 *
 * FAILURE POSTURE (NFR-5 / INV-7). Every read here degrades to "no term applied, honest reason
 * recorded"; every write degrades to "this reward was dropped, counted, and logged". Nothing in
 * this module may throw into `hybridRecall` or `reinforcePattern`.
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { LessonBandit } from './lesson-bandit.js';
import { withNamedLockSync } from './named-lock.js';
import { readMemoryLearningConfig } from './patterns.js';
// ── Paths and constants ─────────────────────────────────────────────────────────────────────────
/** OUR envelope version — distinct from the engine's own `version` field (architecture §7.2). */
export const BANDIT_STATE_SCHEMA = 1;
/**
 * The named lock guarding the state file. It resolves to `<projectRoot>/.dz/locks/lesson-bandit.lock`,
 * i.e. the lock sits in the SAME `.dz` that holds the store — two worktrees pointing at one brain
 * therefore share one lock, which is the only placement that serializes the right writers.
 */
export const BANDIT_LOCK_NAME = 'lesson-bandit';
export function banditStateDir(projectRoot) {
    return join(projectRoot, '.dz', 'lesson-bandit');
}
/**
 * `<projectRoot>/.dz/lesson-bandit/state.json` (plan §0 D0-1 — the ADRs' worked examples say
 * `.dz/memory/bandit-state.json`; ADR-002's FR-2 already hedges "or equivalent path under `.dz/`",
 * and requirements/domain-model/architecture all key on this one).
 */
export function banditStatePath(projectRoot) {
    return join(banditStateDir(projectRoot), 'state.json');
}
const warnedNoOpExploration = new Set();
export function resolveBanditConfig(projectRoot, cfg = readMemoryLearningConfig(projectRoot)) {
    const enabled = cfg.banditRerank === true;
    const explorationRequested = cfg.banditExploration === true;
    if (explorationRequested && !enabled && !warnedNoOpExploration.has(projectRoot)) {
        warnedNoOpExploration.add(projectRoot);
        // ADR-003: this combination is a no-op, and a silently ignored flag is how an operator comes to
        // believe a feature is on. Warn ONCE per project per process — never on the armed path.
        try {
            process.stderr.write('dz: memory.learning.banditExploration is true but memory.learning.banditRerank is false — ' +
                'exploration has no re-rank to perturb and is doing nothing.\n');
        }
        catch { /* a closed stderr must not break recall */ }
    }
    return { enabled, explorationRequested, exploration: enabled && explorationRequested };
}
// ── Value objects ───────────────────────────────────────────────────────────────────────────────
/**
 * ContextKey (domain model §3.3) — the coarse situation bucket a recall happened in, derived from
 * the resolved recall domain (the axis `dz recall --domain` already boosts on). COARSE on purpose:
 * with a per-query key every arm would sit at `pulls === 0` forever and the term would be noise.
 * Normalising constructor, so two spellings of one domain cannot fork a posterior.
 */
export function contextKeyFor(domain) {
    if (typeof domain !== 'string')
        return 'general';
    // UNICODE-AWARE. The first draft stripped `[^a-z0-9._-]`, which MEASURED 2026-08-26 collapsed every
    // Cyrillic and CJK domain to the SAME bucket — `'медицина'` and `'健康'` both became `'general'`,
    // `'мед-обзор'` became the bare `'-'`, and `'café'` was silently mangled to `'caf'`. Distinct
    // international domains sharing one posterior is not a cosmetic defect: it CONTAMINATES the payoff
    // axis, teaching one domain's confirmations to reorder another's. Cyrillic is the majority of this
    // store's real query traffic, so the ASCII-only draft would have mis-scoped most of it.
    // NFKC folds compatibility forms so two spellings of one domain still cannot fork a posterior;
    // \p{L}\p{N} keeps letters and digits in ANY script; separators collapse to a single '-'.
    const norm = domain
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}._-]+/gu, '-')
        .replace(/^[-.]+|[-.]+$/g, '');
    return norm.length > 0 ? norm.slice(0, 64) : 'general';
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
/**
 * Build a {@link RewardEvent}, clamping reward into `[0,1]` at the domain boundary (INV-8/AC-7).
 *
 * A NON-FINITE reward (`NaN`, `Infinity`) is REJECTED (`null`), not coerced: `clamp01(NaN)` is
 * `NaN`, which would poison `alpha`; and coercing it to `0` would be worse still — `reward: 0` moves
 * `beta`, i.e. it records evidence the lesson FAILED. Dropping is the only fail-safe direction.
 */
export function makeRewardEvent(dzId, contextKey, reward, ts) {
    if (typeof reward !== 'number' || !Number.isFinite(reward))
        return null;
    return { dzId, contextKey, reward: clamp01(reward), ts };
}
/**
 * Translate one upstream learning sample into exactly one domain event (domain model §5).
 *
 * `kind:'merge'` and every UNRECOGNISED kind are DROPPED — a sample kind added upstream tomorrow
 * defaults to *ignored*, never to *rewarded*. That asymmetry is the whole point of translating
 * rather than subscribing.
 */
export function classifySignal(sample, contextKey) {
    if (sample.kind === 'recall-hit') {
        return { type: 'exposure', event: { dzId: sample.dzId, contextKey, ts: sample.ts } };
    }
    if (sample.kind === 'reinforce') {
        const ev = makeRewardEvent(sample.dzId, contextKey, sample.reward ?? 1, sample.ts);
        return ev === null ? null : { type: 'reward', event: ev };
    }
    return null;
}
export function freshBanditEnvelope(now = new Date().toISOString()) {
    return {
        schemaVersion: BANDIT_STATE_SCHEMA,
        bandit: new LessonBandit().serialize(),
        exposures: {},
        explorePulls: {},
        updatedAt: now,
    };
}
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const warnedCorrupt = new Set();
function warnOnce(projectRoot, reason) {
    const key = `${projectRoot}::${reason}`;
    if (warnedCorrupt.has(key))
        return;
    warnedCorrupt.add(key);
    try {
        process.stderr.write(`dz: bandit state at ${banditStatePath(projectRoot)} is unusable (${reason}) — ranking continues with no payoff term.\n`);
    }
    catch { /* a closed stderr must not break recall */ }
}
/**
 * Read the state envelope. **Never throws** (INV-7): every failure yields a FRESH empty envelope
 * plus an honest `reason`, and recall proceeds with no payoff axis.
 *
 * This function is READ-ONLY — it does not delete, repair, or rename anything. `dz recall` is not
 * the right process to destroy state, and the read path is lock-free (§7.4), so a rename here would
 * race every concurrent recall. Quarantining a corrupt file happens once, inside the WRITE
 * transaction, where a write is expected and the lock is held (see {@link mutateBanditState}).
 */
export function loadBanditState(projectRoot) {
    const path = banditStatePath(projectRoot);
    let raw;
    try {
        if (!existsSync(path))
            return { state: freshBanditEnvelope(), reason: 'absent' };
        raw = readFileSync(path, 'utf-8');
    }
    catch (err) {
        const reason = `corrupt: ${err instanceof Error ? err.message : String(err)}`;
        warnOnce(projectRoot, reason);
        return { state: freshBanditEnvelope(), reason };
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (err) {
        const reason = `corrupt: ${err instanceof Error ? err.message : String(err)}`;
        warnOnce(projectRoot, reason);
        return { state: freshBanditEnvelope(), reason };
    }
    if (!isPlainObject(parsed)) {
        warnOnce(projectRoot, 'malformed');
        return { state: freshBanditEnvelope(), reason: 'malformed' };
    }
    const schema = parsed['schemaVersion'];
    if (typeof schema === 'number' && schema > BANDIT_STATE_SCHEMA) {
        // A newer dz wrote this. Never downgrade it in place, never write over it.
        warnOnce(projectRoot, 'future-schema');
        return { state: freshBanditEnvelope(), reason: 'future-schema' };
    }
    const bandit = parsed['bandit'];
    if (!isPlainObject(bandit) || !isPlainObject(bandit['contexts'])) {
        warnOnce(projectRoot, 'malformed');
        return { state: freshBanditEnvelope(), reason: 'malformed' };
    }
    const contexts = {};
    for (const [ctxKey, arms] of Object.entries(bandit['contexts'])) {
        if (!isPlainObject(arms))
            continue;
        const out = {};
        for (const [armKey, stats] of Object.entries(arms)) {
            if (!isPlainObject(stats))
                continue;
            // Coercing a junk field to 0 was WRONG in the one direction that matters: a Beta posterior with
            // alpha=0 (or a negative alpha/beta) is not a conservative prior, it is an INVALID one, and it can
            // yield a maximal payoff term — i.e. a corrupt file would not merely be tolerated, it would push a
            // lesson to the top. The stated posture for malformed state is "apply no payoff axis at all", so an
            // arm that violates the invariants is DROPPED rather than repaired into something rankable.
            // Invariants: alpha >= 1 and beta >= 1 (Beta(1,1) is the uniform prior every arm starts from),
            // pulls >= 0, totalReward >= 0, and every field finite.
            const num = (k) => {
                const v = stats[k];
                return typeof v === 'number' && Number.isFinite(v) ? v : null;
            };
            const alpha = num('alpha');
            const beta = num('beta');
            const pulls = num('pulls');
            const totalReward = num('totalReward');
            const costEma = num('costEma');
            if (alpha === null || beta === null || pulls === null || totalReward === null || costEma === null)
                continue;
            if (alpha < 1 || beta < 1 || pulls < 0 || totalReward < 0)
                continue;
            out[armKey] = { alpha, beta, pulls, totalReward, costEma };
        }
        contexts[ctxKey] = out;
    }
    const cfgRaw = isPlainObject(bandit['config']) ? bandit['config'] : {};
    const num = (k, dflt) => {
        const v = cfgRaw[k];
        return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
    };
    const counters = (v) => {
        const out = {};
        if (!isPlainObject(v))
            return out;
        for (const [ctxKey, arms] of Object.entries(v)) {
            if (!isPlainObject(arms))
                continue;
            const inner = {};
            for (const [armKey, count] of Object.entries(arms)) {
                if (typeof count === 'number' && Number.isFinite(count) && count >= 0)
                    inner[armKey] = count;
            }
            out[ctxKey] = inner;
        }
        return out;
    };
    const updatedAt = typeof parsed['updatedAt'] === 'string' ? parsed['updatedAt'] : new Date().toISOString();
    return {
        state: {
            schemaVersion: typeof schema === 'number' ? schema : BANDIT_STATE_SCHEMA,
            bandit: {
                version: typeof bandit['version'] === 'number' ? bandit['version'] : 1,
                config: { costWeight: num('costWeight', 0.01), costDecay: num('costDecay', 0.1), explorationBonus: num('explorationBonus', 0.1) },
                contexts,
            },
            exposures: counters(parsed['exposures']),
            explorePulls: counters(parsed['explorePulls']),
            updatedAt,
        },
    };
}
/** Session-log sink — the file that already carries `{event:'reinforce'}` (patterns.ts). Best-effort. */
function logBanditEvent(projectRoot, record) {
    try {
        appendFileSync(join(projectRoot, '.dz', 'sessions.jsonl'), `${JSON.stringify(record)}\n`);
    }
    catch { /* best-effort: observability must never fail an operation */ }
}
function writeEnvelopeAtomic(projectRoot, env) {
    const dir = banditStateDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    const target = banditStatePath(projectRoot);
    // Backup INSIDE the critical section (ADR-002), matching the discipline every other modifying
    // write in this repo uses.
    if (existsSync(target)) {
        try {
            copyFileSync(target, `${target}.bak`);
        }
        catch { /* a missing .bak never blocks the write */ }
    }
    const tmp = `${target}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
    try {
        writeFileSync(tmp, `${JSON.stringify(env, null, 2)}\n`, 'utf-8');
        renameSync(tmp, target);
    }
    catch (err) {
        try {
            rmSync(tmp, { force: true });
        }
        catch { /* nothing to clean */ }
        throw err;
    }
}
/**
 * The write transaction (INV-5, AC-6): ONE short synchronous read-plan-write under the named lock,
 * ending in temp+rename.
 *
 * **Why the lock and not just the atomic rename.** MEASURED in this repo (2026-08-19, four
 * barrier-synchronised writers on one JSON file, all exit 0): ONE of four updates survived without a
 * lock; all four survived with `withNamedLockSync`. Temp+rename prevents a TORN read; it does
 * nothing about a LOST update, and the loss is silent — both writers report success.
 *
 * No network call, no subprocess, no model turn inside the section — an advisory lock held past its
 * stale threshold stops excluding anyone.
 */
function mutateBanditState(projectRoot, op, mutate) {
    try {
        return withNamedLockSync(projectRoot, BANDIT_LOCK_NAME, () => {
            const { state, reason } = loadBanditState(projectRoot);
            if (reason === 'future-schema') {
                // Refuse to clobber a state written by a newer dz. The reward is dropped, loudly.
                logBanditEvent(projectRoot, { event: 'bandit-error', ts: new Date().toISOString(), op, reason: 'future-schema' });
                return { ok: false, reason: 'future-schema' };
            }
            if (reason !== undefined && reason !== 'absent') {
                // Preserve the evidence before overwriting it — never delete, never "repair". This is the
                // ONE place a corrupt file is touched, and it is under the lock.
                const target = banditStatePath(projectRoot);
                try {
                    renameSync(target, `${target}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`);
                }
                catch { /* best-effort */ }
                logBanditEvent(projectRoot, { event: 'bandit-error', ts: new Date().toISOString(), op, reason });
            }
            const bandit = LessonBandit.deserialize(state.bandit);
            const exposures = { ...state.exposures };
            const explorePulls = { ...state.explorePulls };
            mutate(bandit, { exposures, explorePulls });
            writeEnvelopeAtomic(projectRoot, {
                schemaVersion: BANDIT_STATE_SCHEMA,
                bandit: bandit.serialize(),
                exposures,
                explorePulls,
                updatedAt: new Date().toISOString(),
            });
            return { ok: true };
        });
    }
    catch (err) {
        // A lock timeout, a compromised lock, a full disk: the reward is DROPPED, counted and logged.
        // It never propagates into `reinforcePattern` or `hybridRecall` (NFR-5, §10).
        const reason = err instanceof Error ? err.name : String(err);
        logBanditEvent(projectRoot, { event: 'bandit-error', ts: new Date().toISOString(), op, reason });
        return { ok: false, reason };
    }
}
/**
 * Record a genuine confirmation (ADR-001 D-5). This is the ONLY operation that moves reward mass.
 * Called from `reinforcePattern`'s non-exposure branch, AFTER the store lock is released.
 */
export function recordReward(projectRoot, event) {
    let pulls = 0;
    const out = mutateBanditState(projectRoot, 'reward', (bandit) => {
        bandit.recordReward(event.contextKey, event.dzId, event.reward);
        pulls = bandit.getArmStats(event.contextKey, event.dzId)?.pulls ?? 0;
    });
    if (out.ok) {
        logBanditEvent(projectRoot, { event: 'bandit-reward', ts: event.ts, dzId: event.dzId, ctx: event.contextKey, reward: event.reward, pulls });
    }
    return out;
}
/**
 * Record that lessons were merely SEEN (INV-2 / AC-2).
 *
 * ONE locked transaction per RECALL, not per hit (architecture §4) — `limit` transactions per recall
 * would hold the lock far more often than the work justifies.
 *
 * **No engine call happens here, at any reward value, including `0`.** `recordReward(ctx, arm, 0)`
 * adds `beta += 1`: it is evidence the lesson FAILED. Penalising a lesson for being read is the
 * mirror image of the promote-by-view defect this invariant exists to prevent.
 *
 * `exploredDzIds` are the arms that received a trial lift on this recall (ADR-003 §4) — counted in
 * their own projection, never in `alpha`/`beta`, and never touching `qStatus`.
 */
export function recordExposures(projectRoot, events, exploredDzIds = [], meta = {}) {
    if (events.length === 0 && exploredDzIds.length === 0)
        return { ok: true };
    const bump = (map, ctx, dzId) => {
        const inner = map[ctx] ?? {};
        inner[dzId] = (inner[dzId] ?? 0) + 1;
        map[ctx] = inner;
    };
    const out = mutateBanditState(projectRoot, 'exposure', (_bandit, env) => {
        for (const ev of events)
            bump(env.exposures, ev.contextKey, ev.dzId);
        const ctx = events[0]?.contextKey;
        if (ctx !== undefined)
            for (const dzId of exploredDzIds)
                bump(env.explorePulls, ctx, dzId);
    });
    if (out.ok) {
        logBanditEvent(projectRoot, {
            // DIFFERENT event name from `bandit-reward` on purpose: INV-2 must be auditable from the log
            // alone, by anyone, without reading the code (architecture §11, "the last row").
            event: 'bandit-exposure',
            ts: events[0]?.ts ?? new Date().toISOString(),
            ctx: events[0]?.contextKey ?? 'general',
            n: events.length,
            ...(meta.moved !== undefined ? { moved: meta.moved } : {}),
            ...(meta.arms !== undefined ? { arms: meta.arms } : {}),
            ...(exploredDzIds.length > 0 ? { explored: exploredDzIds.length } : {}),
        });
    }
    return out;
}
const EMPTY_TERMS = { terms: new Map(), reason: null, unknownArms: 0, explored: [], unknownDzIds: [] };
/**
 * Project the posterior for each arm into a bounded term (ADR-001 D-2). **Lock-free** (§7.4): the
 * writer's final step is a rename, so a reader sees the whole old document or the whole new one,
 * never a partial; a reader that loses the race by microseconds ranks with a state one reward stale,
 * which is a ranking hint, not a fact.
 *
 * ```
 * term = (alpha/(alpha+beta) - 0.5) * 2   ∈ [-1,+1]     when pulls > 0   ('posterior')
 * term = 0                                              when pulls === 0 ('unknown-arm')
 * ```
 * `pulls === 0 ⇒ 0` is the cold start ADR-001 accepts on purpose: no evidence ⇒ no nudge, and
 * crucially no RANDOM lift. `Math.random()` is reached only when `opts.exploration` is true, and
 * then only for a NON-QUARANTINED zero-pull arm (ADR-003 P5/P6) — quarantined lessons are excluded
 * here as a SET RELATION, in addition to the ranker's own arm-list filter upstream.
 *
 * Never throws (NFR-5): any failure yields an empty map plus a reason.
 */
export function payoffTermsFor(projectRoot, contextKey, armKeys, opts = {}) {
    if (armKeys.length === 0)
        return EMPTY_TERMS;
    try {
        const { state, reason } = loadBanditState(projectRoot);
        const bandit = LessonBandit.deserialize(state.bandit);
        const terms = new Map();
        const explored = [];
        const unknownDzIds = [];
        const quarantined = opts.quarantined ?? new Set();
        const rng = opts.rng ?? Math.random;
        let unknownArms = 0;
        for (const dzId of armKeys) {
            const s = bandit.getArmStats(contextKey, dzId);
            if (s === null || s.pulls === 0) {
                unknownArms += 1;
                unknownDzIds.push(dzId); // ids, so a downstream cut can narrow this counter too
                // The ONLY branch that can consume randomness, and it is unreachable while disarmed.
                if (opts.exploration === true && !quarantined.has(dzId)) {
                    const u = rng();
                    const lift = typeof u === 'number' && Number.isFinite(u) ? Math.max(0, Math.min(1, u)) : 0;
                    explored.push(dzId);
                    terms.set(dzId, { dzId, term: lift, basis: 'explored' });
                }
                else {
                    terms.set(dzId, { dzId, term: 0, basis: 'unknown-arm' });
                }
                continue;
            }
            const denom = s.alpha + s.beta;
            const mean = denom > 0 ? s.alpha / denom : 0.5;
            const raw = (mean - 0.5) * 2;
            const term = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
            terms.set(dzId, { dzId, term, basis: 'posterior' });
        }
        return { terms, reason: reason ?? null, unknownArms, explored, unknownDzIds };
    }
    catch {
        // A ranking aid that can throw on the hook path is a net loss.
        return EMPTY_TERMS;
    }
}
/**
 * Narrow a report to the hits a caller actually PRINTED. `dz recall` over-fetches under `--domain`
 * and truncates again, so the un-narrowed count would describe a PRE-cut list the reader never saw —
 * the exact dishonesty FR-8/AC-11 names.
 */
export function narrowBanditReport(report, shownDzIds) {
    const shown = new Set(shownDzIds);
    // Defensive reads: a report serialised by an older build carries none of the id lists, and a
    // ranking explanation must never be the thing that throws inside `dz recall` (NFR-5). A missing
    // list narrows to empty rather than crashing — and the counter it feeds goes to 0, which is the
    // honest reading of "this build cannot tell you", not a stale pre-cut number presented as post-cut.
    const list = (v) => (Array.isArray(v) ? v : []);
    const armDzIds = list(report.armDzIds).filter((id) => shown.has(id));
    const unknownDzIds = list(report.unknownDzIds).filter((id) => shown.has(id));
    const exploredDzIds = list(report.exploredDzIds).filter((id) => shown.has(id));
    // `moved` is RECOMPUTED, never intersected. Dropping candidates can UNDO a displacement — if the
    // only thing that pushed B past A was C, and C is cut, B and A may sit in their original order in
    // the list the reader actually saw. Filtering the old movedDzIds would keep claiming a move that
    // no longer exists in the shown ranking, which is the same dishonesty the narrowing exists to end.
    const beforeOrder = list(report.beforeOrder).filter((id) => shown.has(id));
    const afterOrder = list(report.afterOrder).filter((id) => shown.has(id));
    // With no orders to recompute from, fall back to the intersection — weaker, and labelled as such
    // in the type docs, but never a crash and never a pre-cut count worn as a post-cut one.
    const movedDzIds = afterOrder.length > 0 || beforeOrder.length > 0
        ? afterOrder.filter((id, i) => beforeOrder[i] !== id)
        : list(report.movedDzIds).filter((id) => shown.has(id));
    return {
        ...report,
        armsConsidered: armDzIds.length,
        unknownArms: unknownDzIds.length,
        explored: exploredDzIds.length,
        moved: movedDzIds.length,
        armDzIds, movedDzIds, unknownDzIds, exploredDzIds, beforeOrder, afterOrder,
    };
}
/** Read-only health snapshot from the state file + `sessions.jsonl`. Never throws. */
export function banditStats(projectRoot) {
    const present = existsSync(banditStatePath(projectRoot));
    const { state, reason } = loadBanditState(projectRoot);
    const bandit = LessonBandit.deserialize(state.bandit);
    const agg = bandit.getStats();
    let armsWithReward = 0;
    for (const arms of Object.values(state.bandit.contexts)) {
        // `alpha > 1` counted only POSITIVE evidence. An explicit confirmation carrying reward 0 moves
        // `beta` and `pulls` while leaving `alpha` at its prior — real, measured, ranking-affecting
        // evidence that the old predicate reported as "no payoff axis yet", so `dz compounding` could
        // announce an empty axis while a negative posterior was actively demoting lessons. Evidence is
        // EITHER posterior parameter having moved off its Beta(1,1) prior, or a recorded pull.
        for (const st of Object.values(arms))
            if (st.pulls > 0 || st.alpha > 1 || st.beta > 1)
                armsWithReward += 1;
    }
    const sum = (m) => {
        let t = 0;
        for (const inner of Object.values(m))
            for (const v of Object.values(inner))
                t += v;
        return t;
    };
    let rewardEvents = 0;
    let exposureEvents = 0;
    let banditWriteErrors = 0;
    // The field is documented as "mean `moved / armsConsidered` over logged recalls". Summing the
    // numerators and denominators separately computes a DIFFERENT statistic — a hit-count-weighted
    // rate, in which one 50-hit recall outweighs ten 5-hit ones. Recall limits vary per call here, so
    // the two answers genuinely diverge. Accumulate each event's own ratio and count the events.
    let rateSum = 0;
    let rateEvents = 0;
    try {
        const text = readFileSync(join(projectRoot, '.dz', 'sessions.jsonl'), 'utf-8');
        for (const line of text.split('\n')) {
            if (line.trim() === '')
                continue;
            try {
                const o = JSON.parse(line);
                if (o.event === 'bandit-reward')
                    rewardEvents += 1;
                else if (o.event === 'bandit-exposure') {
                    exposureEvents += 1;
                    if (typeof o.moved === 'number' && typeof o.arms === 'number' && o.arms > 0) {
                        rateSum += o.moved / o.arms;
                        rateEvents += 1;
                    }
                }
                else if (o.event === 'bandit-error')
                    banditWriteErrors += 1;
            }
            catch { /* skip one bad line, never the file */ }
        }
    }
    catch { /* no session log yet */ }
    return {
        present,
        // The honest posture `dz compounding` already takes: no state, no verdict.
        verdict: present && agg.totalPulls > 0 ? 'OK' : 'INSUFFICIENT_DATA',
        reason: reason ?? null,
        updatedAt: present ? state.updatedAt : null,
        contexts: agg.contexts,
        armsTotal: agg.totalArms,
        armsWithReward,
        totalPulls: agg.totalPulls,
        totalReward: agg.totalReward,
        exposureTotal: sum(state.exposures),
        explorePullTotal: sum(state.explorePulls),
        rewardEvents,
        exposureEvents,
        banditWriteErrors,
        movedRate: rateEvents > 0 ? rateSum / rateEvents : null,
    };
}
/** Text rendering of {@link banditStats} for `dz compounding`. Pure. */
export function renderBanditHealth(h) {
    const lines = ['bandit payoff axis (memory.learning.banditRerank)'];
    if (!h.present) {
        lines.push('  INSUFFICIENT_DATA — no bandit state file; the payoff axis has never been written.');
        return lines.join('\n');
    }
    lines.push(`  verdict: ${h.verdict}${h.reason !== null ? ` (state ${h.reason})` : ''}`);
    lines.push(`  arms: ${h.armsTotal} in ${h.contexts} context(s); with measured payoff (alpha>1): ${h.armsWithReward}`);
    lines.push(`  pulls: ${h.totalPulls}, reward mass: ${h.totalReward.toFixed(3)}, exposures: ${h.exposureTotal}, trial impressions: ${h.explorePullTotal}`);
    // The row that catches THIS project's recurring failure: a collect leg with no apply leg.
    lines.push(`  feed: ${h.rewardEvents} reward event(s) vs ${h.exposureEvents} exposure event(s)${h.rewardEvents === 0 && h.exposureEvents > 0 ? '  ← write-only: the view feed is alive and the reward feed is not' : ''}`);
    lines.push(`  write errors: ${h.banditWriteErrors}`);
    lines.push(`  movedRate: ${h.movedRate === null ? 'INSUFFICIENT_DATA' : h.movedRate.toFixed(3)}${h.movedRate === 0 ? '  ← armed, harmless, and useless' : ''}`);
    lines.push('  NOTE: none of this measures whether the re-ranking is BETTER — `moved` counts change, not improvement.');
    return lines.join('\n');
}
//# sourceMappingURL=lesson-payoff.js.map