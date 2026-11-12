// Runtime-independent host orchestration; adapters own model/session isolation.
import { checkOpenCodeAdvice } from './check-opencode-advice.mjs';
import { makeAdviceReviewRequest, checkAdviceReview } from './check-advice-review.mjs';

const copy = value => structuredClone(value);
const defaults = { maxPicks: 2, maxGaps: 2, maxWords: 180, timeoutMs: 120000 };

function limitsFor(options) {
  const limits = { ...defaults, ...options };
  for (const key of Object.keys(limits)) {
    if (!Object.hasOwn(defaults, key) || !Number.isSafeInteger(limits[key]) || limits[key] < 1 ||
        limits[key] > (key === 'timeoutMs' ? 300000 : 10000)) throw new Error('Invalid team limits');
  }
  return limits;
}

function boundedAdvice(registry, draft, limits) {
  const advice = checkOpenCodeAdvice(registry, draft);
  const words = [advice.task, ...advice.recommendations.map(pick => pick.why), ...advice.gaps]
    .join(' ').trim().split(/\s+/u).filter(Boolean).length;
  if (advice.recommendations.length > limits.maxPicks || advice.gaps.length > limits.maxGaps ||
      words > limits.maxWords) throw new Error('Advice exceeds configured limits');
  return advice;
}

async function call(adapter, input, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => adapter(copy(input), { signal: controller.signal })),
      new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Adapter timed out')); }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Registry and source snapshots must come from the trusted host. The host must
 * provide separately isolated, stateless selector, reviewer and editor adapters,
 * using a fresh session for each invocation. Callback identity alone cannot
 * establish independent model sessions. Failures expose no draft.
 */
export async function runAdviceTeam({ registry, sources, userTask, select, review, edit, limits: options = {} }) {
  let stage = 'configuration';
  try {
    const limits = limitsFor(options);
    if (typeof userTask !== 'string' || !userTask.trim() ||
        [select, review, edit].some(fn => typeof fn !== 'function') || new Set([select, review, edit]).size !== 3) throw new Error('Invalid team inputs');
    const trustedRegistry = copy(registry);
    const trustedSources = copy(sources);
    stage = 'selection';
    const draft = await call(select, { registry: trustedRegistry, sources: trustedSources, userTask, limits }, limits.timeoutMs);
    stage = 'selection_validation';
    let advice = boundedAdvice(trustedRegistry, draft, limits);
    let request = makeAdviceReviewRequest(trustedRegistry, advice, trustedSources, userTask);
    stage = 'review';
    const firstReview = await call(review, request, limits.timeoutMs);
    let verdict = checkAdviceReview(request, firstReview);
    if (verdict.accepted) return { ok: true, advice: verdict.advice };

    stage = 'edit';
    const edited = await call(edit, { userTask, advice, issues: verdict.issues, sources: trustedSources, limits,
      hostContext: request.hostContext, request: { schema: request.schema, requestHash: request.requestHash, claims: request.claims },
      review: firstReview }, limits.timeoutMs);
    stage = 'edit_validation';
    const selectedNames = new Set(advice.recommendations.map(pick => pick.name));
    advice = boundedAdvice(trustedRegistry, edited, limits);
    if (advice.recommendations.some(pick => !selectedNames.has(pick.name))) throw new Error('Editor added a recommendation');
    request = makeAdviceReviewRequest(trustedRegistry, advice, trustedSources, userTask);
    stage = 'second_review';
    verdict = checkAdviceReview(request, await call(review, request, limits.timeoutMs));
    if (!verdict.accepted) throw new Error('Review rejected edited advice');
    return { ok: true, advice: verdict.advice };
  } catch {
    return { ok: false, error: 'advice_team_failed', stage };
  }
}
