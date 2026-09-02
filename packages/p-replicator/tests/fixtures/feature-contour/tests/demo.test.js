'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

function accepts(value) {
  return value === 'valid';
}

test('accepts a valid value', () => {
  assert.equal(accepts('valid'), true);
});

test('rejects an invalid value', () => {
  assert.equal(accepts('invalid'), false);
});
