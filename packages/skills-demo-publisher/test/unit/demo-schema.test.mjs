import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDemo, parseDemoSet } from '../../demo-site-publisher/scripts/demo-schema.mjs';

const demo = {
  slug: 'catalog-search', title: 'Поиск по каталогу', lang: 'ru', baseUrl: 'http://127.0.0.1:3000',
  scenarios: [{ id: '01-open', title: 'Открываем каталог', caption: 'Открываем карточку', steps: [{ goto: '/' }, { tap: '[data-testid="nav"]' }] }],
};
const config = { set: 'product-demos', title: 'Демонстрации', budget: {}, encode: {} };

test('valid demo and set fixtures parse', () => {
  assert.equal(parseDemo(demo).scenarios[0].steps[1].type, 'tap');
  assert.equal(parseDemoSet(config).budget.maxFileMB, 20);
});

test('rejects every key of demo.bad.json with the documented vocabulary', () => {
  const cases = [
    [{ ...demo, slug: 'Not Kebab' }, '$.slug'],
    [{ ...demo, scenarios: [] }, '$.scenarios'],
    [{ ...demo, scenarios: [{ ...demo.scenarios[0], id: 'open' }] }, '$.scenarios[0].id'],
    [{ ...demo, scenarios: [{ ...demo.scenarios[0], steps: [{ magic: true }] }] }, '$.scenarios[0].steps[0]'],
    [{ ...demo, budget: {} }, '$.budget'],
  ];
  for (const [input, path] of cases) assert.throws(() => parseDemo(input), new RegExp(path.replaceAll('$', '\\$').replaceAll('[', '\\[').replaceAll(']', '\\]')));
});

test('caps are clamped: "20"/0/-1/NaN → default 20 MB', () => {
  for (const value of ['20', 0, -1, Number.NaN]) {
    assert.equal(parseDemoSet({ ...config, budget: { maxFileMB: value } }).budget.maxFileMB, 20);
  }
});

test('budget overrides may only lower the owner-approved caps', () => {
  const parsed = parseDemoSet({ ...config, budget: { maxFileMB: 50, maxSetMB: 200, maxClipSeconds: 60, maxMontageSeconds: 300, maxRepoMB: 950 } });
  assert.deepEqual(parsed.budget, { maxFileMB: 20, maxSetMB: 100, maxClipSeconds: 32, maxMontageSeconds: 240, maxRepoMB: 900 });
});

test('maxFileMB 200 is rejected at parse (I7)', () => {
  assert.throws(() => parseDemoSet({ ...config, budget: { maxFileMB: 200 } }), /100 MB/);
});
