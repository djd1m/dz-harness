import test from 'node:test';
import assert from 'node:assert/strict';
import { runAdviceTeam } from '../scripts/run-advice-team.mjs';

const registry = { schema: 'dz-registry/1', ok: true, entries: [{ id: 'alpha' }, { id: 'beta' }] };
const sources = ['alpha', 'beta'].map(id => ({ id, text: `${id} supports testing workflows with reliable checks.`, coverage: 'complete' }));
const draft = () => ({ task: 'summary', recommendations: [{ name: 'alpha', type: 'skill', fit: 'high', why: 'Supports testing workflows.' }], gaps: [] });
const approved = request => ({ requestHash: request.requestHash, issues: [], checks: request.claims.map(claim => ({
  id: claim.id, status: 'supported', reason: 'Supported', evidence: claim.id.startsWith('why:') || claim.id.startsWith('gap:')
    ? [{ source: 'alpha', quote: 'supports testing workflows' }] : [],
})) });
const rejected = request => ({ ...approved(request), issues: ['Rationale needs correction'] });
const base = () => ({ registry, sources, userTask: 'Original task', select: async () => draft(), review: async r => approved(r), edit: async ({ advice }) => advice });

test('accepts unchanged advice without invoking editor and binds original task', async () => {
  const args = base();
  args.edit = () => { throw Error('unnecessary'); };
  args.review = async request => { assert.equal(request.userTask, 'Original task'); return approved(request); };
  const result = await runAdviceTeam(args);
  assert.equal(result.ok, true);
  assert.equal(result.advice.recommendations[0].install, 'dz init --target opencode --select alpha');
});

test('reviews edited claims with a fresh binding', async () => {
  const args = base(); let first; let calls = 0;
  args.review = async request => {
    calls++;
    if (calls === 1) { first = request.requestHash; return rejected(request); }
    assert.notEqual(request.requestHash, first);
    assert.equal(request.claims[0].text, 'Updated testing rationale.');
    return approved(request);
  };
  args.edit = async ({ advice }) => { advice.recommendations[0].why = 'Updated testing rationale.'; return advice; };
  assert.equal((await runAdviceTeam(args)).ok, true);
  assert.equal(calls, 2);
});

test('rejects stale approval and negative second verdict', async () => {
  for (const stale of [true, false]) {
    const args = base(); let first; let calls = 0;
    args.review = async request => { calls++; if (calls === 1) { first = approved(request); return rejected(request); } return stale ? first : rejected(request); };
    args.edit = async ({ advice }) => { advice.recommendations[0].why = 'Changed.'; return advice; };
    assert.equal((await runAdviceTeam(args)).ok, false);
  }
});

test('rejects excessive output and editor adding another pick', async () => {
  const long = base(); long.select = async () => ({ ...draft(), gaps: [Array(181).fill('word').join(' ')] });
  assert.equal((await runAdviceTeam(long)).ok, false);
  const added = base(); added.review = async r => rejected(r);
  added.edit = async ({ advice }) => { advice.recommendations.push({ name: 'beta', type: 'skill', fit: 'low', why: 'Testing.' }); return advice; };
  assert.equal((await runAdviceTeam(added)).ok, false);
  const editLong = base(); editLong.review = async r => rejected(r);
  editLong.edit = async ({ advice }) => { advice.gaps = [Array(181).fill('word').join(' ')]; return advice; };
  assert.equal((await runAdviceTeam(editLong)).ok, false);
});

test('errors and timeouts fail closed without exposing draft and abort cooperative adapter', async () => {
  const broken = base(); broken.select = async () => { throw Error('secret draft'); };
  assert.deepEqual(await runAdviceTeam(broken), { ok: false, error: 'advice_team_failed', stage: 'selection' });
  const slow = base(); slow.limits = { timeoutMs: 5 }; let aborted = false;
  slow.select = (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => { aborted = true; reject(Error('late')); }));
  assert.equal((await runAdviceTeam(slow)).ok, false);
  assert.equal(aborted, true);
});

test('snapshots protect host data from callback mutation', async () => {
  const args = base();
  args.select = async input => { input.registry.entries[0].id = 'changed'; input.sources[0].text = 'changed'; return draft(); };
  assert.equal((await runAdviceTeam(args)).ok, true);
  assert.equal(registry.entries[0].id, 'alpha');
});


test('configured count limits and exact final prose word boundary', async () => {
  const exact = base(); exact.limits = { maxWords: 4, maxPicks: 1, maxGaps: 1 };
  assert.equal((await runAdviceTeam(exact)).ok, true); // summary + three rationale words
  const task = base(); task.limits = { maxWords: 3 };
  assert.equal((await runAdviceTeam(task)).stage, 'selection_validation');
  const picks = base(); picks.limits = { maxPicks: 1 };
  picks.select = async () => ({ ...draft(), recommendations: [...draft().recommendations, { name: 'beta', type: 'skill', fit: 'low', why: 'Testing.' }] });
  assert.equal((await runAdviceTeam(picks)).stage, 'selection_validation');
  const gaps = base(); gaps.limits = { maxGaps: 1 };
  gaps.select = async () => ({ ...draft(), gaps: ['First gap.', 'Second gap.'] });
  assert.equal((await runAdviceTeam(gaps)).stage, 'selection_validation');
  const invalid = base(); invalid.limits = { timeoutMs: 300001 };
  assert.equal((await runAdviceTeam(invalid)).stage, 'configuration');
});

test('repeated refusal performs exactly one edit and two reviews', async () => {
  const args = base(); let edits = 0; let reviews = 0;
  args.review = async request => { reviews++; return rejected(request); };
  args.edit = async ({ advice }) => { edits++; return advice; };
  assert.equal((await runAdviceTeam(args)).stage, 'second_review');
  assert.equal(edits, 1); assert.equal(reviews, 2);
});

test('reviewer mutation cannot alter retained advice or source snapshots', async () => {
  const args = base();
  args.review = async request => {
    const verdict = approved(request);
    request.advice.recommendations[0].why = 'Injected';
    request.sources[0].text = 'Injected';
    return verdict;
  };
  const result = await runAdviceTeam(args);
  assert.equal(result.ok, true);
  assert.equal(result.advice.recommendations[0].why, 'Supports testing workflows.');
  assert.equal(sources[0].text, 'alpha supports testing workflows with reliable checks.');
});
test('editor receives bound host context and structured review checks in isolation', async () => {
  const args = base(); let calls = 0; let firstHash;
  args.review = async request => {
    calls++;
    if (calls === 1) {
      firstHash = request.requestHash;
      const review = rejected(request);
      review.checks[0].status = 'uncertain';
      review.checks[0].reason = 'Clarify the source';
      return review;
    }
    assert.equal(request.hostContext.target, 'opencode');
    assert.equal(request.sources[0].text, sources[0].text);
    return approved(request);
  };
  args.edit = async input => {
    assert.equal(input.userTask, 'Original task');
    assert.equal(input.request.requestHash, firstHash);
    assert.equal(input.hostContext.target, 'opencode');
    assert.equal(input.review.requestHash, firstHash);
    assert.equal(input.review.checks[0].status, 'uncertain');
    assert.equal(input.review.checks[0].reason, 'Clarify the source');
    assert.deepEqual(input.review.issues, ['Rationale needs correction']);
    assert.equal(input.request.claims[0].id, 'why:alpha');
    assert.equal(Object.hasOwn(input.request, 'sources'), false);
    input.hostContext.target = 'tampered';
    input.sources[0].text = 'tampered';
    input.review.checks[0].reason = 'tampered';
    return input.advice;
  };
  assert.equal((await runAdviceTeam(args)).ok, true);
});
