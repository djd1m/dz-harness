import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageRoot = new URL('../', import.meta.url);
const registry = JSON.parse(
  readFileSync(new URL('./mutation-registry.json', import.meta.url), 'utf8'),
);

test('mutation registry entries are complete', () => {
  for (const entry of registry.entries) {
    assert.ok(typeof entry.id === 'string' && entry.id.length > 0, 'entry has no id');
    assert.ok(typeof entry.file === 'string' && entry.file.length > 0, `${entry.id}: no file`);
    if (entry.uncoverable === true) {
      assert.ok(typeof entry.reason === 'string' && entry.reason.trim().length > 0,
        `${entry.id}: uncoverable entry has no reason`);
      continue;
    }
    assert.ok(typeof entry.mutation?.find === 'string' && entry.mutation.find.length > 0,
      `${entry.id}: ${entry.file}: no mutation.find`);
    assert.equal(typeof entry.mutation?.replace, 'string',
      `${entry.id}: ${entry.file}: mutation.replace is not a string`);
    assert.notEqual(entry.mutation.replace, entry.mutation.find,
      `${entry.id}: ${entry.file}: mutation.replace equals mutation.find`);
  }
});

test('every mutation.find occurs exactly once in its source file', () => {
  const stale = [];
  for (const entry of registry.entries) {
    if (entry.uncoverable === true) continue;
    const source = readFileSync(new URL(entry.file, packageRoot), 'utf8');
    const occurrences = source.split(entry.mutation.find).length - 1;
    if (occurrences !== 1) {
      stale.push(`${entry.id}: ${entry.file}: mutation.find occurs ${occurrences} time(s)`);
    }
  }
  assert.deepEqual(stale, [], `stale or ambiguous mutation entries:\n${stale.join('\n')}`);
});
