/**
 * GitHub API rate limiter with exponential backoff.
 *
 * @packageDocumentation
 */
const INITIAL_DELAY_MS = 1000;
const MAX_RETRIES = 3;
/** Create a fresh rate limit state. */
export function createRateLimitState() {
    return { remaining: 5000, resetAt: 0, retryCount: 0 };
}
/** Update state from GitHub response headers. */
export function updateFromHeaders(state, headers) {
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    if (remaining !== null)
        state.remaining = parseInt(remaining, 10);
    if (reset !== null)
        state.resetAt = parseInt(reset, 10) * 1000;
}
/** Calculate delay before next request. Returns 0 if no wait needed. */
export function getDelay(state) {
    if (state.remaining <= 1) {
        const waitMs = Math.max(0, state.resetAt - Date.now());
        return waitMs > 0 ? waitMs : INITIAL_DELAY_MS;
    }
    if (state.retryCount > 0) {
        return INITIAL_DELAY_MS * Math.pow(2, state.retryCount - 1);
    }
    return 0;
}
/** Should we retry after a failure? */
export function shouldRetry(state) {
    return state.retryCount < MAX_RETRIES;
}
/** Mark a retry attempt. */
export function markRetry(state) {
    state.retryCount += 1;
}
/** Reset retry count after a successful request. */
export function markSuccess(state) {
    state.retryCount = 0;
}
//# sourceMappingURL=rate-limiter.js.map