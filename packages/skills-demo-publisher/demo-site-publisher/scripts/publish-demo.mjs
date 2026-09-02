import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDemoSet } from './demo-schema.mjs';
import { sizeGate } from './size-gate.mjs';
import { scanIdentifiers } from './identifier-gate.mjs';
import { verifySite } from './verify-site.mjs';
import { CliError, EXIT, command, fileRecord, formatBytes, mediaDigest, parseArgs, readJson, runCli, sha256, writeJsonAtomic } from './common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const defaultPolicy = join(here, '..', 'references', 'publish-policy.json');
const PUBLIC_REPO = 'https://github.com/djd1m/dz-harness.git';
const PAGES_ROOT = 'https://djd1m.github.io/dz-harness/tutorials/demo';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const actualExec = (name, args, options = {}) => command(name, args, options);

export function validateSanction({ slug, sanction, policyPath = defaultPolicy }) {
  const policy = readJson(policyPath);
  const pattern = policy.confidentialSlugPatterns.find((source) => new RegExp(source).test(slug));
  if (pattern) throw new CliError(`публикация запрещена политикой: ${slug} совпал с ${pattern}`, EXIT.CONFIDENTIAL_REFUSED);
  if (policy.sanctionRequired && (!sanction || !sanction.trim())) throw new CliError(`для ${slug} нужна санкция владельца: --sanction`, EXIT.CONFIDENTIAL_REFUSED);
  return sanction.trim();
}
function currentMedia(siteDir) {
  const names = readdirSync(join(siteDir, 'video')).sort();
  const files = names.map((name) => fileRecord(siteDir, `video/${name}`));
  return { files, digest: mediaDigest(files) };
}
export function assertFreshBudget({ siteDir, configPath }) {
  const reportPath = join(siteDir, 'size-report.json');
  if (!existsSync(reportPath)) throw new CliError('нет PASS-отчёта бюджета — перегони size-gate', EXIT.SIZE_REFUSED);
  const report = readJson(reportPath); const site = readJson(join(siteDir, 'site-manifest.json')); const media = currentMedia(siteDir);
  if (report.verdict !== 'PASS' || report.mediaSha256 !== media.digest || site.mediaSha256 !== media.digest) throw new CliError('отчёт бюджета устарел — перегони size-gate', EXIT.SIZE_REFUSED);
  sizeGate({ siteDir, configPath });
  return report;
}
export async function verifyLive({ siteDir, url, fetchFn = fetch, attempts = 12, pollMs = 20000, cloneDir = '<clone>', sha = '<sha>' }) {
  const local = readFileSync(join(siteDir, 'index.html')); const expected = sha256(local);
  let last = 'страница не отвечает';
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const page = await fetchFn(`${url.replace(/\/$/, '')}/index.html`);
      if (page.status !== 200) last = `index.html: HTTP ${page.status}`;
      else if (sha256(Buffer.from(await page.arrayBuffer())) !== expected) last = 'index.html: sha256 ещё не совпал';
      else {
        for (const name of readdirSync(join(siteDir, 'video')).sort().filter((x) => /\.(?:mp4|webm)$/i.test(x))) {
          const response = await fetchFn(`${url.replace(/\/$/, '')}/video/${name}`, { method: 'HEAD' });
          const expectedBytes = fileRecord(siteDir, `video/${name}`).bytes; const actualBytes = Number(response.headers.get('content-length'));
          if (response.status !== 200 || actualBytes !== expectedBytes) throw new Error(`video/${name}: HTTP ${response.status}, Content-Length ${actualBytes}, ожидалось ${expectedBytes}`);
        }
        return { sha256: expected, status: 200 };
      }
    } catch (error) { last = error.message; }
    if (attempt + 1 < attempts) await pause(pollMs);
  }
  throw new CliError(`${last}\nrollback: git -C ${cloneDir} revert --no-edit ${sha} && git push`, EXIT.PUBLISH_NOT_LIVE);
}

export async function publishDemo({ siteDir, configPath, remote = PUBLIC_REPO, url, sanction, dryRun = false, noLiveCheck = false, execFn = actualExec, fetchFn = fetch, policyPath = defaultPolicy, commitDate }) {
  const config = loadDemoSet(configPath); const siteManifest = readJson(join(siteDir, 'site-manifest.json'));
  validateSanction({ slug: config.set, sanction, policyPath });
  for (const demo of siteManifest.demos || []) validateSanction({ slug: demo.slug, sanction, policyPath });
  verifySite(siteDir); scanIdentifiers(siteDir, { site: true });
  const report = assertFreshBudget({ siteDir, configPath });
  console.log(`✓ size-gate: ${config.set} ${report.files.length} files ${formatBytes(report.totalBytes)} ≤ ${formatBytes(report.totalCap)}${dryRun ? ' (dry-run)' : ''}`);
  if (dryRun) { console.log('✓ publish — git не вызван (dry-run)'); return { dryRun: true }; }
  if (remote === PUBLIC_REPO) {
    const repoMB = Number(execFn('gh', ['api', 'repos/djd1m/dz-harness', '--jq', '.size']).trim()) / 1024;
    const projected = repoMB + report.totalBytes / (1024 * 1024);
    console.log(`repo: ${repoMB.toFixed(1)} MB / 1024 MB`);
    if (projected > config.budget.maxRepoMB) throw new CliError(`репозиторий после push: ${projected.toFixed(1)} MB > maxRepoMB ${config.budget.maxRepoMB}`, EXIT.SIZE_REFUSED);
  }
  const cloneDir = mkdtempSync(join(tmpdir(), 'dz-demo-publish-'));
  execFn('git', ['clone', remote, cloneDir]);
  const target = join(cloneDir, 'tutorials', 'demo', config.set); mkdirSync(dirname(target), { recursive: true }); rmSync(target, { recursive: true, force: true }); cpSync(siteDir, target, { recursive: true, force: true });
  const date = commitDate || execFn('git', ['-C', dirname(siteDir), 'log', '-1', '--format=%cs']).trim();
  writeJsonAtomic(join(target, 'sanction.json'), { slug: config.set, date, text: sanction.trim() });
  execFn('git', ['-C', cloneDir, 'add', `tutorials/demo/${config.set}`]);
  execFn('git', ['-C', cloneDir, 'commit', '-m', `docs(demo): publish ${config.set}`]);
  const sha = execFn('git', ['-C', cloneDir, 'rev-parse', 'HEAD']).trim();
  const env = { ...process.env }; delete env.GITHUB_TOKEN;
  execFn('git', ['-C', cloneDir, 'push'], { env });
  console.log(execFn('git', ['-C', cloneDir, 'count-objects', '-vH']).trim());
  if (noLiveCheck) { console.log('⚠ live check skipped (local remote)'); return { cloneDir, sha }; }
  const liveUrl = url || `${PAGES_ROOT}/${config.set}/`;
  const live = await verifyLive({ siteDir: target, url: liveUrl, fetchFn, cloneDir, sha });
  console.log(`✓ GH Pages: ${liveUrl} отвечает 200`); console.log(`sha256 ${live.sha256.slice(0, 12)}`);
  return { cloneDir, sha, live };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { site: 'required', config: 'required', remote: 'value', url: 'value', sanction: 'value', 'dry-run': 'boolean', 'no-live-check': 'boolean' });
  await publishDemo({ siteDir: args.site, configPath: args.config, remote: args.remote, url: args.url, sanction: args.sanction, dryRun: args['dry-run'] === true, noLiveCheck: args['no-live-check'] === true });
}
runCli(main, import.meta.url);
