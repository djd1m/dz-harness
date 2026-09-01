'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PKG_DIR = path.resolve(__dirname, '..', '..');

test('the thirteen-rule contract retains the detection ladder', () => {
  const { COMPONENTS } = require(path.join(PKG_DIR, 'src', 'utils.js'));
  const rules = Object.keys(COMPONENTS.rules.items);
  assert.equal(rules.length, 13, 'the pre-shipped contract must require thirteen rules');
  assert.ok(rules.includes('cost-of-detection-ladder'),
    'doctor and verify must require cost-of-detection-ladder');
});

test('P13 - PR-022 writer guards are registered for targeted mutation proof', () => {
  const registry = JSON.parse(fs.readFileSync(
    path.join(PKG_DIR, 'test', 'mutation-registry.json'), 'utf8'));
  const expected = {
    'harvest-required-writer-receipt': {
      file: 'templates/.claude/commands/harvest.md', test: 'P1 - quick and full reject',
    },
    'harvest-first-write-creates-missing-carrier': {
      file: 'templates/.claude/hooks/write-insight.cjs', test: 'P2 - writer creates',
    },
    'harvest-exact-repeat-is-idempotent': {
      file: 'templates/.claude/hooks/write-insight.cjs', test: 'P2 - writer creates',
    },
    'session-insights-missing-is-visible': {
      file: 'templates/.claude/hooks/session-insights.cjs', test: 'P8 - missing store triggers',
    },
  };

  for (const [id, contract] of Object.entries(expected)) {
    const entry = registry.entries.find((candidate) => candidate.id === id);
    assert.ok(entry, `missing targeted mutation id ${id}`);
    assert.equal(entry.file, contract.file, `${id} mutates the wrong production surface`);
    assert.ok(entry.property && entry.property.length > 40,
      `${id} needs a behavioral property, not a cosmetic label`);
    assert.ok(entry.mutation?.find && entry.mutation?.replace,
      `${id} needs a real source mutation selected by --only`);
    assert.ok(Number.isInteger(entry.minFailing) && entry.minFailing >= 1,
      `${id} must require at least one failing behavioral test`);
    assert.match(entry.property, new RegExp(contract.test.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${id} must name the real-input confirmation test that kills it`);
  }

  assert.equal(registry.entries.filter((entry) => expected[entry.id]).length, 4,
    'all four and only the planned PR-022 guards must resolve by exact id');
});
