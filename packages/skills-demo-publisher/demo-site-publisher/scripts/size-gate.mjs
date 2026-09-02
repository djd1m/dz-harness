import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadDemoSet } from './demo-schema.mjs';
import { CliError, EXIT, fileRecord, formatBytes, mediaDigest, parseArgs, readJson, receipt, runCli, writeJsonAtomic } from './common.mjs';

const MB = 1024 * 1024;
function refusalLines(files, totalBytes, budget, clips, montageSeconds) {
  const lines = [];
  const fileCap = budget.maxFileMB * MB; const totalCap = budget.maxSetMB * MB;
  for (const file of files) if (file.bytes > fileCap) lines.push(`${file.rel} ${formatBytes(file.bytes)} > ${formatBytes(fileCap)} (maxFileMB ${budget.maxFileMB})`);
  if (totalBytes > totalCap) lines.push(`набор Σ ${formatBytes(totalBytes)} > ${formatBytes(totalCap)} (maxSetMB ${budget.maxSetMB})`);
  for (const clip of clips || []) if (clip.seconds > budget.maxClipSeconds) lines.push(`${clip.id || clip.file}: ${clip.seconds} s > ${budget.maxClipSeconds} s (maxClipSeconds)`);
  if (Number.isFinite(montageSeconds) && montageSeconds > budget.maxMontageSeconds) lines.push(`монтаж: ${montageSeconds} s > ${budget.maxMontageSeconds} s (maxMontageSeconds)`);
  return lines;
}
export function projectBudget(config) {
  const minutes = config.budget.maxMontageSeconds / 60;
  const realMB = minutes * 0.47; const syntheticMB = minutes * 15;
  if (realMB > config.budget.maxFileMB) throw new CliError(`проекция ${realMB.toFixed(2)} MB > maxFileMB ${config.budget.maxFileMB} MB`, EXIT.SIZE_REFUSED);
  return { realMB, syntheticMB, warning: syntheticMB > config.budget.maxFileMB };
}
export function sizeGate({ siteDir, configPath, project = false }) {
  const config = loadDemoSet(configPath);
  if (project) return projectBudget(config);
  const manifestPath = join(siteDir, 'site-manifest.json');
  if (!existsSync(manifestPath)) throw new CliError(`${manifestPath}: нет манифеста сайта`);
  const manifest = readJson(manifestPath); const videoDir = join(siteDir, 'video');
  const rels = readdirSync(videoDir).sort().filter((name) => statSync(join(videoDir, name)).isFile()).map((name) => `video/${name}`);
  const files = rels.map((rel) => fileRecord(siteDir, rel)); const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  const failures = refusalLines(files, totalBytes, config.budget, manifest.clips, manifest.montageSeconds);
  const report = { verdict: failures.length ? 'REFUSE' : 'PASS', caps: config.budget, files, totalBytes, totalCap: config.budget.maxSetMB * MB, mediaSha256: mediaDigest(files) };
  writeJsonAtomic(join(siteDir, 'size-report.json'), report);
  if (failures.length) throw new CliError(`✗ size-gate — ${failures.join('; ')}`, EXIT.SIZE_REFUSED);
  receipt('size-gate', `${manifest.set}: ${files.length} файлов ${formatBytes(totalBytes)} ≤ ${formatBytes(report.totalCap)}`);
  return report;
}
export const parseSizeArgs = (argv) => parseArgs(argv, { site: 'value', config: 'required', project: 'boolean' });
async function main() {
  const args = parseSizeArgs(process.argv.slice(2));
  if (args.project) {
    const result = sizeGate({ configPath: args.config, project: true });
    receipt('size-project', `${result.realMB.toFixed(2)} MB real; ${result.syntheticMB.toFixed(2)} MB synthetic${result.warning ? ' — предупреждение' : ''}`);
  } else {
    if (!args.site) throw new CliError('--site обязателен', EXIT.USAGE_OR_SCHEMA);
    sizeGate({ siteDir: args.site, configPath: args.config });
  }
}
runCli(main, import.meta.url);
