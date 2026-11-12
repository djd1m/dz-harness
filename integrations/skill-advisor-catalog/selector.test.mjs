import test from 'node:test';
import assert from 'node:assert/strict';
import { selectScenarios, SelectorError } from './selector.mjs';
import { completeRetrieval, policyMatch, validateLabels, validateLabelBinding } from './scoring.mjs';
const options = { model: 'test-model', apiKey: 'nonsecret-test' };
const retrieval = (query = 'Нужен мониторинг') => ({ query, candidates: [], revision: 'test' });
const reply = (decision, scenarioIds = [], finish_reason = 'stop') => ({ ok: true,
  json: async () => ({ model: 'test-model', choices: [{ finish_reason,
    message: { content: JSON.stringify({ decision, scenarioIds }) } }] }) });

test('nonblank empty retrieval reaches model; ambiguity and unsupported tasks remain distinct', async () => {
  let calls = 0;
  for (const decision of ['clarify', 'no-match']) {
    const result = await selectScenarios(retrieval(), { ...options, fetchImpl: async (_url, init) => {
      calls++;
      assert.deepEqual(JSON.parse(JSON.parse(init.body).messages[1].content).candidates, []);
      assert.ok(init.signal instanceof AbortSignal);
      return reply(decision);
    } });
    assert.equal(result.output.decision, decision);
    assert.equal(result.modelCalled, true);
  }
  assert.equal(calls, 2);
});
test('blank request asks for clarification without credentials or network', async () => {
  const result = await selectScenarios(retrieval('  '), { fetchImpl: () => assert.fail('must not call') });
  assert.equal(result.output.decision, 'clarify'); assert.equal(result.modelCalled, false);
});
test('network, timeout, HTTP and truncated responses never become semantic refusal', async () => {
  const failures = [async () => { throw Error('Network down'); },
    async () => { throw new DOMException('timed out', 'TimeoutError'); },
    async () => ({ ok: false, status: 503 }), async () => reply('no-match', [], 'length')];
  for (const fetchImpl of failures) await assert.rejects(selectScenarios(retrieval(), { ...options, fetchImpl }));
});
test('model cannot recommend invented IDs even when lexical retrieval is empty', async () => {
  await assert.rejects(selectScenarios(retrieval(), { ...options,
    fetchImpl: async () => reply('recommend', ['invented']) }), /invalid-choice/);
});
test('changed question text invalidates independent labels even with unchanged IDs', () => {
  const label = { questionFile: 'questions.json', questionSha256: 'old-content-hash' };
  assert.throws(() => validateLabelBinding(label, 'questions.json', 'new-content-hash'), /Stale/);
  assert.doesNotThrow(() => validateLabelBinding(label, 'questions.json', 'old-content-hash'));
});
test('truncated paid response keeps usage without returning raw model text', async () => {
  await assert.rejects(selectScenarios(retrieval(), { ...options, fetchImpl: async () => ({ ok: true,
    json: async () => ({ usage: { cost: 0.01 }, model: 'test-model', choices: [
      { finish_reason: 'length', message: { content: 'untrusted text' } }] }) }) }), error => {
    assert.ok(error instanceof SelectorError); assert.equal(error.code, 'incomplete-completion');
    assert.equal(error.usage.cost, 0.01); assert.equal(error.message.includes('untrusted'), false); return true;
  });
});
test('malformed message retains paid usage and rejects nonstring content', async () => {
  for (const message of [undefined, { content: null }, { content: [] }]) {
    await assert.rejects(selectScenarios(retrieval(), { ...options, fetchImpl: async () => ({ ok: true,
      json: async () => ({ usage: { cost: 0.02 }, model: 'test-model',
        choices: [{ finish_reason: 'stop', message }] }) }) }), error => {
      assert.equal(error.code, 'invalid-json'); assert.equal(error.usage.cost, 0.02); return true;
    });
  }
});
test('partial compound selection is not counted as full even if all chosen IDs are relevant', () => {
  const ground = { coverage: 'full', acceptableScenarioSets: [['first', 'second']] };
  assert.equal(policyMatch({ decision: 'recommend', scenarioIds: ['first'] }, ground), false);
  assert.equal(policyMatch({ decision: 'recommend', scenarioIds: ['second', 'first'] }, ground), true);
  assert.equal(policyMatch({ decision: 'recommend', scenarioIds: ['first', 'second', 'extra'] }, ground), false);
  assert.equal(completeRetrieval(['first'], ground.acceptableScenarioSets), false);
  assert.equal(completeRetrieval(['other', 'first', 'second'], ground.acceptableScenarioSets), true);
});
test('coverage labels must declare complete sets within the two-scenario limit', () => {
  const q = [{ id: 'q1' }];
  const label = { id: 'q1', coverage: 'full', relevantScenarioIds: ['a', 'b', 'c'] };
  assert.throws(() => validateLabels(q, [label]), /complete acceptable/);
  assert.throws(() => validateLabels(q, [{ ...label, acceptableScenarioSets: [['a', 'b', 'c']] }]), /complete acceptable/);
  assert.throws(() => validateLabels(q, [{ ...label, acceptableScenarioSets: [['unknown']] }]), /complete acceptable/);
  assert.doesNotThrow(() => validateLabels(q, [{ ...label, acceptableScenarioSets: [['a', 'b'], ['c']] }]));
});
