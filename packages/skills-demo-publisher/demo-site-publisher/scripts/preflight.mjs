import { accessSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { CliError, EXIT, parseArgs, receipt, runCli, writeJsonAtomic } from './common.mjs';

export const REQUIRED_FILTERS = Object.freeze(['scale', 'pad', 'fps', 'format', 'setpts', 'fade', 'overlay', 'concat']);
export const REQUIRED_ENCODERS = Object.freeze(['libx264']);
export const REQUIRED_MUXERS = Object.freeze(['mp4']);
export const REQUIRED_DEMUXERS = Object.freeze(['concat']);

function invoke(binary, args, env) {
  const result = spawnSync(binary, args, { encoding: 'utf8', env });
  return { ok: result.status === 0, text: `${result.stdout || ''}\n${result.stderr || ''}`, error: result.error };
}

export function probeMediaTools({ env = process.env, needWebm = false } = {}) {
  const ffmpeg = env.DEMO_FFMPEG || 'ffmpeg';
  const ffprobe = env.DEMO_FFPROBE || 'ffprobe';
  const filters = invoke(ffmpeg, ['-hide_banner', '-filters'], env);
  const encoders = invoke(ffmpeg, ['-hide_banner', '-encoders'], env);
  const muxers = invoke(ffmpeg, ['-hide_banner', '-muxers'], env);
  const demuxers = invoke(ffmpeg, ['-hide_banner', '-demuxers'], env);
  const versionProbe = invoke(ffmpeg, ['-version'], env);
  const probe = invoke(ffprobe, ['-version'], env);
  const missing = [];
  if (!filters.ok || !encoders.ok) missing.push('ffmpeg');
  for (const name of REQUIRED_FILTERS) if (!new RegExp(`(?:^|\\s)${name}(?:\\s|$)`, 'm').test(filters.text)) missing.push(name);
  for (const name of [...REQUIRED_ENCODERS, ...(needWebm ? ['libvpx-vp9'] : [])]) {
    if (!new RegExp(`(?:^|\\s)${name}(?:\\s|$)`, 'm').test(encoders.text)) missing.push(name);
  }
  for (const name of [...REQUIRED_MUXERS, ...(needWebm ? ['webm'] : [])]) if (!new RegExp(`(?:^|\\s)${name}(?:\\s|$)`, 'm').test(muxers.text)) missing.push(`muxer:${name}`);
  for (const name of REQUIRED_DEMUXERS) if (!new RegExp(`(?:^|\\s)${name}(?:\\s|$)`, 'm').test(demuxers.text)) missing.push(`demuxer:${name}`);
  if (!probe.ok) missing.push('ffprobe');
  const version = versionProbe.text.match(/ffmpeg version[^\r\n]*/)?.[0] || 'unknown';
  return { ffmpeg, ffprobe, version, filters: REQUIRED_FILTERS.filter((x) => !missing.includes(x)), muxers: [...REQUIRED_MUXERS, ...(needWebm ? ['webm'] : [])].filter((x) => !missing.includes(`muxer:${x}`)), demuxers: REQUIRED_DEMUXERS.filter((x) => !missing.includes(`demuxer:${x}`)), missing };
}

export async function chromiumPath(env = process.env) {
  if (env.DEMO_CHROMIUM) return env.DEMO_CHROMIUM;
  try {
    const { chromium } = await import('playwright');
    return chromium.executablePath();
  } catch { return ''; }
}

export async function assertPreflight({ env = process.env, needWebm = false, requireChromium = true } = {}) {
  const result = probeMediaTools({ env, needWebm });
  let chromium = '';
  if (requireChromium) {
    chromium = await chromiumPath(env);
    try { accessSync(chromium, constants.X_OK); } catch { result.missing.push('Chromium'); }
  }
  result.chromium = chromium;
  result.missing = [...new Set(result.missing)];
  if (result.missing.length) {
    throw new CliError(`ffmpeg at ${result.ffmpeg} lacks: ${result.missing.join(', ')} — установите полный ffmpeg (apt install ffmpeg) и Chromium (npx playwright install chromium)`, EXIT.PREFLIGHT_MISSING);
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { webm: 'boolean', json: 'value' });
  const value = await assertPreflight({ needWebm: args.webm === true });
  if (args.json) writeJsonAtomic(args.json, value);
  receipt('preflight', `${value.version}; ${value.chromium}`);
}

runCli(main, import.meta.url);
