/**
 * Cost-as-first-class-metric for skill benchmarking (BTO).
 *
 * Inspired by Princeton HAL harness (https://github.com/princeton-pli/hal-harness),
 * which treats the cost-performance tradeoff as a first-class evaluation axis
 * rather than scoring accuracy alone.
 *
 * Two layers:
 *   1. Runtime cost accounting — normalize provider token-usage formats into a
 *      single shape, price it against a per-token table (with cached-read
 *      discounts), and combine with a quality score to get cost-efficiency.
 *   2. Static cost estimation — infer an a-priori cost band from a skill's
 *      SKILL.md content (model tiers it invokes, number of LLM layers/judges),
 *      so BTO can flag expensive skills before running them.
 *
 * @packageDocumentation
 */
/**
 * Build a {@link ModelPricing} from a base prompt + completion price.
 *
 * @param cacheReadFactor Discount on cached-read input tokens relative to the
 *   prompt price. Anthropic ≈ 0.1 (90% off); OpenAI ≈ 0.5 (50% off). Cache-write
 *   (creation) premium is an Anthropic concept (125%); OpenAI reports no
 *   cache-creation tokens so the multiplier is never exercised there.
 */
function priced(prompt, completion, cacheReadFactor = 0.1) {
    return {
        prompt,
        completion,
        cachedInput: prompt * cacheReadFactor,
        cacheCreation: prompt * 1.25,
    };
}
/**
 * Per-token model pricing (USD), normalized to price-per-token (not per-million).
 * Keys are matched case-insensitively against a prefix of the model id, so
 * `claude-opus-4-6-20250...` resolves to the `claude-opus` entry.
 */
export const MODEL_PRICES = {
    // Anthropic — Claude 4.x family (USD per token; e.g. Opus $5/$25 per Mtok)
    'claude-opus': priced(5 / 1e6, 25 / 1e6),
    'claude-sonnet': priced(3 / 1e6, 15 / 1e6),
    'claude-haiku': priced(1 / 1e6, 5 / 1e6),
    // OpenAI (cached input is 50% off, not Anthropic's 90% — pass 0.5)
    'gpt-4o': priced(2.5 / 1e6, 10 / 1e6, 0.5),
    'gpt-4o-mini': priced(0.15 / 1e6, 0.6 / 1e6, 0.5),
    'gpt-4.1': priced(2 / 1e6, 8 / 1e6, 0.5),
    'o3': priced(2 / 1e6, 8 / 1e6, 0.5),
    // Bedrock-hosted Claude 4.x (same list price as first-party)
    'anthropic.claude-opus': priced(5 / 1e6, 25 / 1e6),
    'anthropic.claude-sonnet': priced(3 / 1e6, 15 / 1e6),
    'anthropic.claude-haiku': priced(1 / 1e6, 5 / 1e6),
    // Bedrock-hosted legacy Claude-3 (legacy list price)
    'anthropic.claude-3-opus': priced(15 / 1e6, 75 / 1e6),
    'anthropic.claude-3-sonnet': priced(3 / 1e6, 15 / 1e6),
};
/** Fallback pricing when a model id matches no known prefix (assume sonnet-class). */
const FALLBACK_PRICING = priced(3 / 1e6, 15 / 1e6);
/**
 * Resolve a model id to its pricing by longest-prefix match.
 * `bedrock/anthropic.claude-3-opus...` → strips a leading `provider/` segment.
 */
/**
 * Whether {@link pricingFor} will find a REAL entry for this model id, or silently fall back to
 * {@link FALLBACK_PRICING} (sonnet-class).
 *
 * Exists so a cost surface can REPORT the fallback instead of hiding it: `claude-fable-*` has no
 * entry in {@link MODEL_PRICES} and is the default model of every recorded feature-adr run, so its
 * dollar figures are priced at a fallback rate (feature `cost-ledger`, ADR-003).
 */
export function hasKnownPricing(modelId) {
    if (typeof modelId !== 'string' || modelId.length === 0)
        return false;
    const id = modelId.toLowerCase().replace(/^[a-z0-9-]+\//, '');
    for (const key of Object.keys(MODEL_PRICES)) {
        if (id.startsWith(key))
            return true;
    }
    return false;
}
export function pricingFor(modelId) {
    // Strip a leading `provider/` segment (e.g. `bedrock/`, `us-east-1/`).
    const id = modelId.toLowerCase().replace(/^[a-z0-9-]+\//, '');
    let best;
    let bestLen = 0;
    for (const [key, price] of Object.entries(MODEL_PRICES)) {
        if (id.startsWith(key) && key.length > bestLen) {
            best = price;
            bestLen = key.length;
        }
    }
    return best ?? FALLBACK_PRICING;
}
function num(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
/**
 * Normalize a provider usage object into {@link NormalizedUsage}.
 *
 * Supported shapes:
 * - OpenAI: `prompt_tokens`, `completion_tokens`,
 *   `prompt_tokens_details.cached_tokens`
 * - Anthropic: `input_tokens`, `output_tokens`,
 *   `cache_read_input_tokens`, `cache_creation_input_tokens`
 * - Bedrock: `inputTokens`, `outputTokens`
 *
 * Cached/cache-creation tokens are reported by Anthropic *separately* from
 * `input_tokens`, so the prompt bucket is the raw input count as given.
 * For OpenAI, `cached_tokens` is a subset of `prompt_tokens`, so it is
 * subtracted out to avoid double-counting.
 */
export function normalizeUsage(raw) {
    // Anthropic
    if ('input_tokens' in raw || 'output_tokens' in raw) {
        return {
            promptTokens: num(raw.input_tokens),
            cachedInputTokens: num(raw.cache_read_input_tokens),
            cacheCreationTokens: num(raw.cache_creation_input_tokens),
            completionTokens: num(raw.output_tokens),
        };
    }
    // Bedrock
    if ('inputTokens' in raw || 'outputTokens' in raw) {
        return {
            promptTokens: num(raw.inputTokens),
            cachedInputTokens: 0,
            cacheCreationTokens: 0,
            completionTokens: num(raw.outputTokens),
        };
    }
    // OpenAI (default)
    const details = (raw.prompt_tokens_details ?? {});
    const cached = num(details.cached_tokens);
    const prompt = num(raw.prompt_tokens);
    return {
        promptTokens: Math.max(0, prompt - cached),
        cachedInputTokens: cached,
        cacheCreationTokens: 0,
        completionTokens: num(raw.completion_tokens),
    };
}
/** Dollar cost of a normalized usage against a model's pricing. */
export function usageCost(usage, modelId) {
    const p = pricingFor(modelId);
    return (usage.promptTokens * p.prompt +
        usage.cachedInputTokens * p.cachedInput +
        usage.cacheCreationTokens * p.cacheCreation +
        usage.completionTokens * p.completion);
}
/** Aggregate cost across all calls of one skill invocation. */
export function invocationCost(records) {
    const byModel = {};
    let totalUsd = 0;
    let totalTokens = 0;
    for (const rec of records) {
        const usage = normalizeUsage(rec.usage);
        const cost = usageCost(usage, rec.model);
        totalUsd += cost;
        totalTokens +=
            usage.promptTokens +
                usage.cachedInputTokens +
                usage.cacheCreationTokens +
                usage.completionTokens;
        byModel[rec.model] = (byModel[rec.model] ?? 0) + cost;
    }
    return { totalUsd, totalTokens, calls: records.length, byModel };
}
/**
 * Cost-efficiency = quality per dollar.
 *
 * @param qualityScore A 0–10 BTO quality score (L1/L2 average).
 * @param costUsd Dollar cost of the invocation that produced that quality.
 * @returns Quality points per US dollar. `Infinity` when cost is 0 (free path).
 */
export function costEfficiency(qualityScore, costUsd) {
    if (costUsd <= 0)
        return qualityScore > 0 ? Infinity : 0;
    return qualityScore / costUsd;
}
/** Relative cost weight per model tier (haiku baseline = 1). */
const TIER_UNITS = { haiku: 1, sonnet: 4, opus: 20 };
/**
 * Estimate a skill's cost band from its SKILL.md content by counting how many
 * times it routes work to each model tier. Used by BTO's BENCHMARK layer to
 * flag expensive skills before any LLM call is made.
 */
export function estimateSkillCost(skillContent) {
    const lower = skillContent.toLowerCase();
    const count = (re) => (lower.match(re) ?? []).length;
    const tiers = {
        haiku: count(/\bhaiku\b/g),
        sonnet: count(/\bsonnet\b/g),
        opus: count(/\bopus\b/g),
    };
    const relativeUnits = tiers.haiku * TIER_UNITS.haiku +
        tiers.sonnet * TIER_UNITS.sonnet +
        tiers.opus * TIER_UNITS.opus;
    let level;
    if (relativeUnits === 0)
        level = 'free';
    else if (relativeUnits <= 8)
        level = 'low';
    else if (relativeUnits <= 40)
        level = 'medium';
    else
        level = 'high';
    return { level, relativeUnits, tiers };
}
//# sourceMappingURL=cost-scoring.js.map