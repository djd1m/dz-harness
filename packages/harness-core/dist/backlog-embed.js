/**
 * Backlog dedup EMBED FORM + lexical corroboration (the 2026-08-11 register-inflation fix).
 *
 * Zero-dep PURE module: imported by BOTH `backlog.ts` (query/mirror/harmonize) and
 * `agentdb-index.ts` (the reindex/index write path), so every dz-backlog vector — fresh mirror,
 * reindex, or query — is built from the SAME text form. A second definition of this form is exactly
 * the query-vs-row space split this module exists to prevent.
 *
 * WHY the bounded excerpt (all numbers MEASURED 2026-08-11 on the real 105-idea store, reproducer:
 * scratch pairwise-cosine harness over `EmbeddingService` / Xenova-paraphrase-multilingual-MiniLM-L12-v2,
 * the same model + `${taskType}: ${text}` form the tool uses):
 *
 *   - Full-length embeddings INVERT the duplicate signal on long texts. Genuine reworded paraphrases
 *     of 1073–1509-char ideas scored 0.35–0.61 against their own sources, while topically DISJOINT
 *     long-RU pairs scored up to 0.9195 (genai-tweets x dz-cost) — i.e. above every genuine long
 *     paraphrase. No threshold can separate classes that are ordered the wrong way round.
 *   - The inflation is a register/length effect, not topic: long-RU x long-RU pairs mean cosine
 *     0.6467 vs short-EN x short-EN 0.3929 (+0.25) over the same store; the 2026-08-05 incident
 *     (an agentdb zombie-process idea absorbed as DUPLICATE of a dz-guard publish-gate rule at
 *     cosine 0.941) shared only the register — правило/проверка/гейт/уровень/измерено.
 *   - Bounded to the first 400 chars, the same pairs separate: paraphrase-vs-source 0.73–0.95 with
 *     the source as top-1 in 8/8 probes, store-wide max non-duplicate pair 0.9181, and the
 *     patient-values long-form scored 0.80 against its own short reword (was 0.26 at full length,
 *     with an unrelated record at 0.89 on top).
 *
 * WHY the lexical corroboration: cosine alone still cannot tell a same-register pair from a true
 * paraphrase near the threshold. A TRUE re-capture shares the idea's DISTINCTIVE vocabulary
 * (subject nouns, identifiers); a register-only pair shares function words. Measured containment on
 * the labeled set: true duplicates 0.33–0.97 (>= 0.538 for every pair that also cleared the cosine
 * threshold); register-only false-positive pairs <= 0.171.
 */
/** The vector-store namespace that isolates ideas from lessons (ADR-001/005). */
export const BACKLOG_TASK_TYPE = 'dz-backlog';
/**
 * Version of the dedup embed FORM (not the model). v1 = `dz-backlog: <full text>`; v2 = bounded
 * excerpt (this module). Stored vectors written under an older form are in a DIFFERENT space than
 * v2 queries for texts longer than the cap — `ensureBacklogEmbedForm` re-mirrors them once.
 */
export const DEDUP_EMBED_FORM_VERSION = 2;
/**
 * Embed-input cap in UTF-16 units. NOT config: the cap is part of the embed form — two stores (or a
 * query and a row) built with different caps silently live in different spaces. 400 chosen over 300
 * by measurement: same store-wide max (0.9181) with higher paraphrase-vs-source cosines (0.88 vs
 * 0.84 on the hardest long-RU probe).
 */
export const DEDUP_EMBED_CAP = 400;
/**
 * The DISTINCTIVE excerpt of an idea for embedding: whitespace-collapsed, capped at
 * {@link DEDUP_EMBED_CAP}. Short texts pass through untouched (byte-identical semantics to v1 for
 * them). The cut never splits a surrogate pair.
 */
export function dedupExcerpt(text) {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (collapsed.length <= DEDUP_EMBED_CAP)
        return collapsed;
    let cut = collapsed.slice(0, DEDUP_EMBED_CAP);
    // A high surrogate at the cut would make the excerpt an invalid string — drop the half char.
    const lastCode = cut.charCodeAt(cut.length - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff)
        cut = cut.slice(0, -1);
    return cut;
}
/** The ONE dedup embed form (v2) — used by the query, the mirror write, and the reindex write. */
export function dedupEmbedText(text) {
    return `${BACKLOG_TASK_TYPE}: ${dedupExcerpt(text)}`;
}
/**
 * Register/function words excluded from the DISTINCTIVE token set — the shared technical register
 * that inflated the 0.941 false duplicate (правило/проверка/гейт/уровень/измерено + generic RU/EN
 * function words). Deliberately small: the containment cut (0.30) sits far from both measured
 * classes (<= 0.171 vs >= 0.538), so the list does not need to be complete to discriminate.
 */
const REGISTER_STOPWORDS = new Set(('правило проверка гейт уровень измерено замерено идея задача контекст исследование урок вердикт ' +
    'цель форма выход проблема источник материалы сегодня реально нужно нельзя должен должна должно ' +
    'обязан обязана обязано который которая которое только через после перед против всего этого чтобы ' +
    'если иначе когда где притом причем поэтому пока пусть надо есть нет был была было будут быть ' +
    'может можно станет стало сразу самый самая самое наш наша наше свой своя своё туда сюда здесь ' +
    'там опять снова очень давно потом чужой чужая every never always must should could would about ' +
    'there their these those with from into over under this that what when where which while откуда ' +
    'почему зачем такой такая такое весь вся всё они оный дать даёт дают взять берет берут').split(/\s+/));
/**
 * The distinctive-token set of an idea text: lowercased word-ish tokens (letters/digits, allowing
 * inner `_ . - /` so identifiers and paths survive whole), length >= 4, register stopwords removed,
 * Cyrillic words longer than 6 chars folded to their 6-char prefix (a crude but MEASURED-adequate
 * stem that matches RU inflections: подкрепление/подкрепления → подкре).
 */
export function distinctiveTokens(text) {
    const out = new Set();
    for (const m of text.toLowerCase().matchAll(/[\p{L}\p{N}][\p{L}\p{N}_.\-/]*/gu)) {
        let w = (m[0] ?? '').replace(/[.\-/]+$/, '');
        if (w.length < 4 || REGISTER_STOPWORDS.has(w))
            continue;
        if (/[а-яё]/.test(w) && w.length > 6)
            w = w.slice(0, 6);
        out.add(w);
    }
    return out;
}
/**
 * Lexical containment in [0,1]: |A ∩ B| / min(|A|, |B|) over distinctive tokens. `min` (containment,
 * not Jaccard) so a SHORT re-capture of a LONG idea — whose vocabulary is a subset — still scores
 * high; that asymmetry is exactly the length-moved-the-verdict incident. Empty token sets score 0
 * (no evidence is not corroboration).
 */
export function lexicalContainment(a, b) {
    const ta = distinctiveTokens(a);
    const tb = distinctiveTokens(b);
    if (ta.size === 0 || tb.size === 0)
        return 0;
    let inter = 0;
    for (const w of ta)
        if (tb.has(w))
            inter++;
    return inter / Math.min(ta.size, tb.size);
}
/**
 * THE two-signal pair decision — shared by `classifyDedup` (capture) and `harmonizeBacklog` (batch)
 * so the two paths can never disagree about what a duplicate is.
 *
 *   duplicate         cosine >= duplicateThreshold AND (containment unknown OR >= corroborationFloor)
 *   demoted           cosine >= duplicateThreshold but containment < corroborationFloor — the
 *                     register-only false positive (zombie x publish-gate @ 0.941, containment 0.077):
 *                     high cosine with DISJOINT subject vocabulary is not a duplicate.
 *   subset-duplicate  cosine in [subsetCosineFloor, duplicateThreshold) AND containment >=
 *                     subsetContainment — the same idea re-captured at a different LENGTH (measured
 *                     long-vs-short patient-values: cosine 0.8019, containment 0.971).
 *   below             everything else (related/new banding is the caller's job).
 */
export function dedupPairBand(cosine, containment, cfg) {
    if (cosine >= cfg.duplicateThreshold) {
        return containment === undefined || containment >= cfg.corroborationFloor ? 'duplicate' : 'demoted';
    }
    if (containment !== undefined && containment >= cfg.subsetContainment && cosine >= cfg.subsetCosineFloor) {
        return 'subset-duplicate';
    }
    return 'below';
}
//# sourceMappingURL=backlog-embed.js.map