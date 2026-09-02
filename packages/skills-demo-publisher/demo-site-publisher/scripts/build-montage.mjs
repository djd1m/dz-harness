import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { loadDemo, loadDemoSet } from './demo-schema.mjs';
import { assertPreflight } from './preflight.mjs';
import { CliError, EXIT, command, parseArgs, receipt, runCli, sha256File, writeJsonAtomic } from './common.mjs';

const PROFILE = Object.freeze({ codec_name: 'h264', pix_fmt: 'yuv420p', r_frame_rate: '30/1' });
const ff = (env) => env.DEMO_FFMPEG || 'ffmpeg';
const fp = (env) => env.DEMO_FFPROBE || 'ffprobe';
const timecode = (seconds) => {
  const ms = Math.round(seconds * 1000); const h = Math.floor(ms / 3600000); const m = Math.floor(ms / 60000) % 60; const s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
export function subtitleDocuments(cues) {
  let cursor = 0;
  const srt = cues.map((cue, i) => { const start = cue.start ?? cursor; cursor = start + cue.seconds; return `${i + 1}\n${timecode(start)} --> ${timecode(cursor)}\n${cue.text}\n`; }).join('\n');
  return { srt, vtt: `WEBVTT\n\n${srt.replace(/,/g, '.').replace(/^\d+\n/gm, '')}` };
}
export function planMontage({ demo, recordingDir, cardDir }) {
  const missing = [];
  const recordingManifestPath = join(recordingDir, 'recording-manifest.json');
  if (!existsSync(recordingManifestPath)) throw new CliError(`не найден контракт записи: ${recordingManifestPath}`, EXIT.ERROR);
  const recordingManifest = JSON.parse(readFileSync(recordingManifestPath, 'utf8'));
  const clips = demo.scenarios.map((scenario) => {
    const record = recordingManifest.scenarios?.find((item) => item.id === scenario.id && item.status === 'ok');
    const path = record?.clip ? join(recordingDir, record.clip) : join(recordingDir, `${scenario.id}.missing`);
    if (!existsSync(path)) missing.push(path);
    return { id: scenario.id, path, caption: record?.caption || scenario.caption, card: cardDir ? join(cardDir, `section-${scenario.id}.png`) : null, captionImage: cardDir ? join(cardDir, `caption-${scenario.id}.png`) : null };
  });
  if (cardDir) for (const name of ['intro.png', 'outro.png']) if (!existsSync(join(cardDir, name))) missing.push(join(cardDir, name));
  for (const clip of clips) for (const path of [clip.card, clip.captionImage].filter(Boolean)) if (!existsSync(path)) missing.push(path);
  if (missing.length) throw new CliError(`не найдены входы: ${missing.join(', ')}`, EXIT.ERROR);
  const items = [];
  if (cardDir) items.push({ type: 'card', path: join(cardDir, 'intro.png'), name: '00-intro.mp4' });
  clips.forEach((clip, index) => {
    if (cardDir) items.push({ type: 'card', path: clip.card, name: `${String(index * 2 + 1).padStart(2, '0')}-${clip.id}-card.mp4` });
    items.push({ type: 'clip', clip, name: `${String(index * 2 + 2).padStart(2, '0')}-${clip.id}.mp4` });
  });
  if (cardDir) items.push({ type: 'card', path: join(cardDir, 'outro.png'), name: `${String(items.length).padStart(2, '0')}-outro.mp4` });
  return { clips, items, names: items.map((item) => item.name), concat: items.map((item) => `file '${item.name}'`).join('\n') + '\n' };
}
function duration(path, env) {
  const raw = command(fp(env), ['-loglevel', 'error', '-of', 'csv=p=0', '-show_entries', 'format=duration', path], { env }).trim();
  const value = Number(raw); if (!Number.isFinite(value) || value <= 0) throw new CliError(`ffprobe не определил длительность: ${path}`); return value;
}
export function mediaProfile(path, env = process.env) {
  return JSON.parse(command(fp(env), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt,r_frame_rate', '-of', 'json', path], { env })).streams[0];
}
export const assertProfile = (path, env = process.env) => {
  const got = mediaProfile(path, env);
  for (const [key, expected] of Object.entries(PROFILE)) if (got[key] !== expected) throw new CliError(`${path}: профиль ${key}=${got[key]}, ожидалось ${expected}`);
  return got;
};

export async function buildMontage({ demoPath, configPath, recordingDir, cardDir, outDir, env = process.env }) {
  const demo = loadDemo(demoPath); const config = loadDemoSet(configPath);
  const tools = await assertPreflight({ env, needWebm: config.webm, requireChromium: false });
  const plan = planMontage({ demo, recordingDir, cardDir });
  mkdirSync(outDir, { recursive: true });
  const durations = []; const cardSeconds = 1.2; let timeline = 0;
  for (const item of plan.items) {
    const target = join(outDir, item.name);
    if (item.type === 'card') {
      const vf = [`scale=${config.encode.viewport.width}:${config.encode.viewport.height}`, 'fps=30', 'fade=t=in:st=0:d=0.2', 'fade=t=out:st=1:d=0.2', 'format=yuv420p'].join(',');
      command(ff(env), ['-y', '-loop', '1', '-i', item.path, '-t', String(cardSeconds), '-vf', vf, '-an', '-map_metadata', '-1', '-c:v', 'libx264', '-crf', String(config.encode.crf), '-preset', 'veryfast', '-threads', '1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      assertProfile(target, env); timeline += cardSeconds; continue;
    }
    const clip = item.clip; const seconds = duration(clip.path, env); const bounded = Math.min(seconds, config.budget.maxClipSeconds);
    const ratio = seconds > bounded ? bounded / seconds : 1;
    const vf = [`scale=${config.encode.viewport.width}:${config.encode.viewport.height}:force_original_aspect_ratio=decrease`, `pad=${config.encode.viewport.width}:${config.encode.viewport.height}:(ow-iw)/2:(oh-ih)/2`, `setpts=${ratio}*PTS`, 'fps=30', 'format=yuv420p'];
    const args = ['-y', '-i', clip.path];
    if (clip.captionImage) args.push('-i', clip.captionImage, '-filter_complex', `[0:v]${vf.join(',')}[base];[base][1:v]overlay=0:0[v]`, '-map', '[v]');
    else args.push('-vf', vf.join(','));
    args.push('-an', '-map_metadata', '-1', '-c:v', 'libx264', '-crf', String(config.encode.crf), '-preset', 'veryfast', '-threads', '1', '-filter_threads', '1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target);
    command(ff(env), args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    assertProfile(target, env);
    durations.push({ id: clip.id, sourceSeconds: seconds, seconds: bounded, start: timeline, file: item.name, caption: clip.caption }); timeline += bounded;
  }
  const concatPath = join(outDir, 'concat.txt'); writeFileSync(concatPath, plan.concat);
  const output = join(outDir, 'montage.mp4');
  command(ff(env), ['-y', '-f', 'concat', '-safe', '1', '-i', 'concat.txt', '-map_metadata', '-1', '-c', 'copy', '-movflags', '+faststart', 'montage.mp4'], { cwd: outDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  assertProfile(output, env);
  if (config.webm) command(ff(env), ['-y', '-i', output, '-an', '-map_metadata', '-1', '-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-threads', '1', join(outDir, 'montage.webm')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const subs = subtitleDocuments(durations.map((item) => ({ text: item.caption, seconds: item.seconds, start: item.start })));
  writeFileSync(join(outDir, 'montage.srt'), subs.srt); writeFileSync(join(outDir, 'montage.ru.vtt'), subs.vtt);
  const manifest = { schema: 1, demo: demo.slug, ffmpeg: { path: tools.ffmpeg, version: tools.version, filters: tools.filters }, profile: PROFILE, clips: durations, seconds: timeline, outputs: { mp4: { path: 'montage.mp4', sha256: sha256File(output) }, ...(config.webm ? { webm: { path: 'montage.webm', sha256: sha256File(join(outDir, 'montage.webm')) } } : {}) } };
  writeJsonAtomic(join(outDir, 'montage-manifest.json'), manifest);
  receipt('montage', `${demo.slug}: ${manifest.seconds.toFixed(2)} s`);
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { demo: 'required', config: 'required', recording: 'required', cards: 'value', out: 'required' });
  await buildMontage({ demoPath: args.demo, configPath: args.config, recordingDir: args.recording, cardDir: args.cards, outDir: args.out });
}
runCli(main, import.meta.url);
