import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyLive } from '../../demo-site-publisher/scripts/publish-demo.mjs';
import { makeTemp } from '../_fixtures.mjs';

test('publish verification fails when a referenced video is absent from the live site', async () => {
  const root = makeTemp('receipt'); mkdirSync(join(root, 'video')); writeFileSync(join(root, 'index.html'), '<!doctype html>\n'); writeFileSync(join(root, 'video', 'missing.mp4'), '12345');
  const fetchFn = async (url, options = {}) => options.method === 'HEAD'
    ? { status: 404, headers: new Headers() }
    : { status: 200, arrayBuffer: async () => readFileSync(join(root, 'index.html')), headers: new Headers() };
  await assert.rejects(verifyLive({ siteDir: root, url: 'https://pages.invalid/demo', fetchFn, attempts: 1, pollMs: 0, cloneDir: '/tmp/public-clone', sha: 'abc123' }), (e) => e.exitCode === 8 && /video\/missing\.mp4/.test(e.message) && /git -C \/tmp\/public-clone revert --no-edit abc123 && git push/.test(e.message));
});

test('publish verification covers an optional WebM asset too', async () => {
  const root = makeTemp('receipt-webm'); mkdirSync(join(root, 'video')); writeFileSync(join(root, 'index.html'), '<!doctype html>\n'); writeFileSync(join(root, 'video', 'demo.mp4'), '12345'); writeFileSync(join(root, 'video', 'demo.webm'), '123456');
  const fetchFn = async (url, options = {}) => options.method === 'HEAD'
    ? { status: url.endsWith('.webm') ? 404 : 200, headers: new Headers({ 'content-length': '5' }) }
    : { status: 200, arrayBuffer: async () => readFileSync(join(root, 'index.html')), headers: new Headers() };
  await assert.rejects(verifyLive({ siteDir: root, url: 'https://pages.invalid/demo', fetchFn, attempts: 1, pollMs: 0 }), /video\/demo\.webm/);
});
