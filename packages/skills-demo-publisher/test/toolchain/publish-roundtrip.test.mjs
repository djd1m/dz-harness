import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertPreflight } from '../../demo-site-publisher/scripts/preflight.mjs';
import { publishDemo } from '../../demo-site-publisher/scripts/publish-demo.mjs';
import { sizeGate } from '../../demo-site-publisher/scripts/size-gate.mjs';
import { command, fileRecord, mediaDigest } from '../../demo-site-publisher/scripts/common.mjs';
import { makeTemp, writeJson } from '../_fixtures.mjs';

void assertPreflight;
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'Demo Test', GIT_AUTHOR_EMAIL: 'demo@example.invalid', GIT_COMMITTER_NAME: 'Demo Test', GIT_COMMITTER_EMAIL: 'demo@example.invalid' };
const exec = (name, args, options = {}) => command(name, args, { encoding: 'utf8', env: gitEnv, ...options });
const git = (args, options = {}) => exec('git', args, options);
const hubRoot = resolve(import.meta.dirname, '..', '..', '..', '..', '..');
function publishable(name = 'dry-set') {
  const root = makeTemp(name); const site = join(root, 'site'); mkdirSync(join(site, 'video'), { recursive: true });
  writeFileSync(join(site, 'index.html'), '<!doctype html><html><head></head><body><video><source src="video/demo.mp4"></video></body></html>\n'); writeFileSync(join(site, 'video', 'demo.mp4'), 'video-bytes');
  const media = [fileRecord(site, 'video/demo.mp4')]; writeJson(join(site, 'site-manifest.json'), { set: name, media, mediaSha256: mediaDigest(media), clips: [] });
  const config = join(root, 'config.json'); writeJson(config, { set: name, title: name }); sizeGate({ siteDir: site, configPath: config });
  return { root, site, config };
}

test('demo site round-trips through the publish path and the leak gate stays green', async () => {
  const root = makeTemp('roundtrip'); const bare = join(root, 'remote.git'); const seed = join(root, 'seed'); const site = join(root, 'site'); mkdirSync(join(site, 'video'), { recursive: true });
  writeFileSync(join(site, 'index.html'), '<!doctype html><html><head></head><body><video><source src="video/demo.mp4"></video></body></html>\n'); writeFileSync(join(site, 'video', 'demo.mp4'), 'video-bytes');
  const media = [fileRecord(site, 'video/demo.mp4')]; writeJson(join(site, 'site-manifest.json'), { set: 'roundtrip', media, mediaSha256: mediaDigest(media), clips: [] });
  const config = join(root, 'config.json'); writeJson(config, { set: 'roundtrip', title: 'Roundtrip' }); sizeGate({ siteDir: site, configPath: config });
  git(['init', '--bare', bare]); git(['clone', bare, seed]); writeFileSync(join(seed, 'README.md'), '# Public\n'); git(['-C', seed, 'add', 'README.md']); git(['-C', seed, 'commit', '-m', 'seed']); git(['-C', seed, 'push', 'origin', 'HEAD']);
  await publishDemo({ siteDir: site, configPath: config, remote: pathToFileURL(bare).href, sanction: 'Owner approved local test', noLiveCheck: true, execFn: exec, commitDate: '2026-09-02' });
  const clone = join(root, 'clone'); git(['clone', bare, clone]); assert.ok(existsSync(join(clone, 'tutorials', 'demo', 'roundtrip', 'index.html'))); assert.ok(existsSync(join(clone, 'tutorials', 'demo', 'roundtrip', 'video', 'demo.mp4')));
  const mirror = await import(pathToFileURL(join(hubRoot, 'scripts', 'build-public-mirror.mjs')));
  const roots = readdirSync(clone).sort(); assert.deepEqual(roots.filter((name) => !mirror.ALLOWED_ROOT.has(name)), []);
  const before = readFileSync(join(hubRoot, 'tutorials', 'README.md'));
  const toc = command(process.execPath, [join(hubRoot, 'scripts', 'publish-tutorial.mjs'), '--toc-only', '--dry-run']);
  assert.doesNotMatch(toc, /\.\/demo\//); assert.deepEqual(readFileSync(join(hubRoot, 'tutorials', 'README.md')), before);
});

test('no .mp4 ever enters the hub repository', async () => {
  const before = git(['-C', hubRoot, 'status', '--porcelain', '--', '*.mp4']); const f = publishable('hub-guard');
  await publishDemo({ siteDir: f.site, configPath: f.config, sanction: 'Owner approved dry test', dryRun: true, execFn: () => { throw new Error('git must not run'); } });
  assert.equal(git(['-C', hubRoot, 'status', '--porcelain', '--', '*.mp4']), before);
});

test('publish-tutorial --toc-only lists no demo/ row', () => {
  const toc = command(process.execPath, [join(hubRoot, 'scripts', 'publish-tutorial.mjs'), '--toc-only', '--dry-run']); assert.doesNotMatch(toc, /\.\/demo\//);
});

test('--toc-only --dry-run leaves tutorials/README.md byte-identical', () => {
  const path = join(hubRoot, 'tutorials', 'README.md'); const before = readFileSync(path); command(process.execPath, [join(hubRoot, 'scripts', 'publish-tutorial.mjs'), '--toc-only', '--dry-run']); assert.deepEqual(readFileSync(path), before);
});
