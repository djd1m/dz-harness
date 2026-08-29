/**
 * GitHub API rate limiter with exponential backoff.
 *
 * @packageDocumentation
 */
export interface RateLimitState {
    remaining: number;
    resetAt: number;
    retryCount: number;
}
/** Create a fresh rate limit state. */
export declare function createRateLimitState(): RateLimitState;
/** Update state from GitHub response headers. */
export declare function updateFromHeaders(state: RateLimitState, headers: Headers): void;
/** Calculate delay before next request. Returns 0 if no wait needed. */
export declare function getDelay(state: RateLimitState): number;
/** Should we retry after a failure? */
export declare function shouldRetry(state: RateLimitState): boolean;
/** Mark a retry attempt. */
export declare function markRetry(state: RateLimitState): void;
/** Reset retry count after a successful request. */
export declare function markSuccess(state: RateLimitState): void;
//# sourceMappingURL=rate-limiter.d.ts.map