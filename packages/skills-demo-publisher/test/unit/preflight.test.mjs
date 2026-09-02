import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertPreflight } from '../../demo-site-publisher/scripts/preflight.mjs';
import { makeTemp } from '../_fixtures.mjs';

function shim({ filters = [], encoders = [], muxers = ['mp4', 'webm'], demuxers = ['concat'] }) {
  const dir = makeTemp('preflight');
  const tool = join(dir, 'media-tool');
  writeFileSync(tool, `#!/bin/sh\ncase "$*" in *-filters*) echo '${filters.join(' ')}';; *-encoders*) echo '${encoders.join(' ')}';; *-muxers*) echo '${muxers.join(' ')}';; *-demuxers*) echo '${demuxers.join(' ')}';; *-version*) echo 'ffmpeg version test';; *) echo ok;; esac\n`);
  chmodSync(tool, 0o755);
  const browser = join(dir, 'chromium');
  writeFileSync(browser, '#!/bin/sh\nexit 0\n');
  chmodSync(browser, 0o755);
  return { ...process.env, DEMO_FFMPEG: tool, DEMO_FFPROBE: tool, DEMO_CHROMIUM: browser };
}
const full = ['scale', 'pad', 'fps', 'format', 'setpts', 'fade', 'overlay', 'concat'];

test('shim without overlay → exit 4, stderr names overlay', async () => {
  await assert.rejects(assertPreflight({ env: shim({ filters: full.filter((x) => x !== 'overlay'), encoders: ['libx264'] }) }), (e) => e.exitCode === 4 && /overlay/.test(e.message));
});

test('shim without libx264 → exit 4', async () => {
  await assert.rejects(assertPreflight({ env: shim({ filters: full, encoders: [] }) }), (e) => e.exitCode === 4 && /libx264/.test(e.message));
});

test('full shim → exit 0', async () => {
  const value = await assertPreflight({ env: shim({ filters: full, encoders: ['libx264'] }) });
  assert.deepEqual(value.missing, []);
});

test('every missing item is listed, not just the first', async () => {
  await assert.rejects(assertPreflight({ env: shim({ filters: ['scale'], encoders: [] }), needWebm: true }), (e) => ['overlay', 'concat', 'libx264', 'libvpx-vp9'].every((x) => e.message.includes(x)));
});
