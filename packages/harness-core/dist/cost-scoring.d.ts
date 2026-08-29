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
/** Per-token prices (USD) for a model, split by token role. */
export interface ModelPricing {
    /** Price per uncached input (prompt) token. */
    readonly prompt: number;
    /** Price per output (completion) token. */
    readonly completion: number;
    /** Price per cached-read input token (typically ~10% of prompt). */
    readonly cachedInput: number;
    /** Price per cache-creation (write) token (typically ~125% of prompt). */
    readonly cacheCreation: number;
}
/**
 * Per-token model pricing (USD), normalized to price-per-token (not per-million).
 * Keys are matched case-insensitively against a prefix of the model id, so
 * `claude-opus-4-6-20250...` resolves to the `claude-opus` entry.
 */
export declare const MODEL_PRICES: Readonly<Record<string, ModelPricing>>;
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
export declare function hasKnownPricing(modelId: string): boolean;
export declare function pricingFor(modelId: string): ModelPricing;
/**
 * Provider-agnostic token usage. Cross-provider shapes are normalized into
 * these four buckets (mirrors HAL's `_normalize_usage` 4-tuple).
 */
export interface NormalizedUsage {
    /** Uncached input (prompt) tokens. */
    readonly promptTokens: number;
    /** Input tokens served from cache (discounted). */
    readonly cachedInputTokens: number;
    /** Input tokens written to cache (premium). */
    readonly cacheCreationTokens: number;
    /** Output (completion) tokens. */
    readonly completionTokens: number;
}
/** Raw usage object from any supported provider SDK. */
export type RawUsage = Record<string, unknown>;
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
export declare function normalizeUsage(raw: RawUsage): NormalizedUsage;
/** Dollar cost of a normalized usage against a model's pricing. */
export declare function usageCost(usage: NormalizedUsage, modelId: string): number;
/** A single billed LLM call within a skill invocation. */
export interface CallRecord {
    readonly model: string;
    readonly usage: RawUsage;
}
/** Cost breakdown for a full skill invocation (many calls). */
export interface InvocationCost {
    /** Total USD cost of the invocation. */
    readonly totalUsd: number;
    /** Total tokens (all buckets) across all calls. */
    readonly totalTokens: number;
    /** Number of billed calls. */
    readonly calls: number;
    /** Per-model cost breakdown. */
    readonly byModel: Readonly<Record<string, number>>;
}
/** Aggregate cost across all calls of one skill invocation. */
export declare function invocationCost(records: readonly CallRecord[]): InvocationCost;
/**
 * Cost-efficiency = quality per dollar.
 *
 * @param qualityScore A 0–10 BTO quality score (L1/L2 average).
 * @param costUsd Dollar cost of the invocation that produced that quality.
 * @returns Quality points per US dollar. `Infinity` when cost is 0 (free path).
 */
export declare function costEfficiency(qualityScore: number, costUsd: number): number;
/** Static cost band inferred from a skill's declared model usage. */
export interface CostEstimate {
    /** Cost level derived from model tiers + LLM layer count. */
    readonly level: 'free' | 'low' | 'medium' | 'high';
    /** Relative cost units (haiku = 1, sonnet = 4, opus = 20) summed across layers. */
    readonly relativeUnits: number;
    /** Detected per-tier call counts. */
    readonly tiers: {
        readonly haiku: number;
        readonly sonnet: number;
        readonly opus: number;
    };
}
/**
 * Estimate a skill's cost band from its SKILL.md content by counting how many
 * times it routes work to each model tier. Used by BTO's BENCHMARK layer to
 * flag expensive skills before any LLM call is made.
 */
export declare function estimateSkillCost(skillContent: string): CostEstimate;
//# sourceMappingURL=cost-scoring.d.ts.map