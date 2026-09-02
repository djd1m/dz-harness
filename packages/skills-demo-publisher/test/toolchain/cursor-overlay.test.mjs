import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPreflight } from '../../demo-site-publisher/scripts/preflight.mjs';
import { CURSOR_OVERLAY, tapTiming } from '../../demo-site-publisher/scripts/cursor-overlay.mjs';

void assertPreflight;
test('overlay script is idempotent and pointer-events none', () => {
  assert.match(CURSOR_OVERLAY, /dataset\.demoPointerReady/);
  assert.match(CURSOR_OVERLAY, /pointer-events:none/);
  assert.match(CURSOR_OVERLAY, /data-demo-ripple/);
});
test('tap() timing math', () => {
  assert.deepEqual(tapTiming({ pre: 10, hold: 20, post: 30 }), { pre: 10, hold: 20, post: 30, total: 60 });
});
