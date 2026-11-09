import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAdviceReviewRequest, checkAdviceReview } from '../scripts/check-advice-review.mjs';
const registry = { schema: 'dz-registry/1', ok: true, entries: [{ id: 'sample' }] };
const draft = { task: 'Check health', recommendations: [{ name: 'sample', type: 'skill', fit: 'high', why: 'Checks health' }], gaps: ['Needs a URL'], pipeline: ['sample'] };
const sources = [{ id: 'sample', coverage: 'complete', text: 'Checks health for a supplied URL. Optional webhooks notify Slack.' }];
const request = () => makeAdviceReviewRequest(registry, draft, sources, draft.task);
const approval = req => ({ requestHash: req.requestHash, issues: [], checks: req.claims.map(c => ({ id: c.id, status: 'supported', reason: 'Supported by supplied source and task', evidence: /^(why:|gap:)/.test(c.id) ? [{ source: 'sample', quote: 'Checks health for a supplied URL.' }] : [] })) });
test('releases only normalized advice after a complete bound review', () => {
  const req = request(); const result = checkAdviceReview(req, approval(req));
  assert.equal(result.accepted, true);
  assert.equal(result.advice.recommendations[0].install, 'dz init --target opencode --select sample');
});
test('negative and uncertain checks never include displayable advice', () => {
  for (const status of ['unsupported', 'uncertain']) {
    const req = request(); const review = approval(req); review.checks[0].status = status;
    const result = checkAdviceReview(req, review);
    assert.equal(result.accepted, false); assert.equal(Object.hasOwn(result, 'advice'), false);
  }
});
test('rejects incomplete, duplicate, foreign and malformed checks', () => {
  for (const change of [r => r.checks.pop(), r => r.checks.push(r.checks[0]), r => r.checks[0].id = 'other', r => r.checks[0].status = 'pass', r => r.checks[0].reason = '']) {
    const req = request(); const review = approval(req); change(review);
    assert.throws(() => checkAdviceReview(req, review));
  }
});
test('rejects invented, missing and too short quote evidence', () => {
  for (const evidence of [[], [{ source: 'missing', quote: sources[0].text }], [{ source: 'sample', quote: 'Invented source words' }], [{ source: 'sample', quote: 'URL' }]]) {
    const req = request(); const review = approval(req); review.checks[0].evidence = evidence;
    assert.throws(() => checkAdviceReview(req, review));
  }
});
test('stale review cannot authorize changed advice or changed source', () => {
  const req = request(); const review = approval(req);
  const changed = makeAdviceReviewRequest(registry, { ...draft, gaps: ['No alerts'] }, sources, draft.task);
  assert.throws(() => checkAdviceReview(changed, review));
  const newSource = makeAdviceReviewRequest(registry, draft, [{ ...sources[0], text: 'Different skill source content' }], draft.task);
  assert.throws(() => checkAdviceReview(newSource, review));
  req.advice.gaps.push('Mutated after review');
  assert.throws(() => checkAdviceReview(req, review));
});
test('extra editorial issues block output even if individual checks pass', () => {
  const req = request(); const review = approval(req); review.issues.push('Pipeline contradicts conditional recommendation');
  assert.equal(checkAdviceReview(req, review).accepted, false);
});
test('requires actual snapshots for every selected skill without duplicate IDs', () => {
  assert.throws(() => makeAdviceReviewRequest(registry, draft, [], draft.task));
  assert.throws(() => makeAdviceReviewRequest(registry, draft, [{ ...sources[0], id: 'other' }], draft.task));
  assert.throws(() => makeAdviceReviewRequest(registry, draft, [...sources, ...sources], draft.task));
});

test('binds the original user task separately from the model summary', () => {
  assert.throws(() => makeAdviceReviewRequest(registry, draft, sources));
  const req = request();
  const changed = makeAdviceReviewRequest(registry, draft, sources, 'Deploy and monitor continuously');
  assert.throws(() => checkAdviceReview(changed, approval(req)));
});
test('accepts line wrapping but not changed wording in source quotes', () => {
  const req = request(); const review = approval(req);
  review.checks[0].evidence[0].quote = 'Checks health for a\nsupplied URL.';
  assert.equal(checkAdviceReview(req, review).accepted, true);
  review.checks[0].evidence[0].quote = 'Only checks health for a supplied URL.';
  assert.throws(() => checkAdviceReview(req, review));
});
