import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSanction } from '../../demo-site-publisher/scripts/publish-demo.mjs';

test('publish refuses a confidential-scope slug and pushes nothing', () => {
  let calls = 0;
  assert.throws(() => { validateSanction({ slug: 'talk-ai-assistants', sanction: 'approved' }); calls++; }, (e) => e.exitCode === 7 && /запрещена политикой/.test(e.message));
  assert.equal(calls, 0);
});
test('publish without a recorded sanction is refused', () => {
  assert.throws(() => validateSanction({ slug: 'public-demo', sanction: '' }), (e) => e.exitCode === 7 && /санкция/.test(e.message));
});
