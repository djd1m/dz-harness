#!/usr/bin/env node
'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DOMAIN = 'p-replicator-insights';
const MAX_RENDER_BYTES = 16 * 1024;
const PROCESS_OPTIONS = Object.freeze({
  encoding: 'utf8',
  timeout: 1500,
  killSignal: 'SIGTERM',
  maxBuffer: 1024 * 1024,
  shell: false,
});
const MISSING_HINT = 'инсайтов пока нет; /myinsights создаст первую запись\n';
const ENV_ROOT = process.env.CLAUDE_PROJECT_DIR;
const ROOT = (ENV_ROOT && path.isAbsolute(ENV_ROOT))
  ? ENV_ROOT
  : path.resolve(__dirname, '..', '..');

function parseHookEvent(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return { kind: 'session-start' };
  let parsed;
  try { parsed = JSON.parse(text); } catch (_error) {
    return { kind: 'user-prompt', prompt: '' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'user-prompt', prompt: '' };
  }
  const eventName = parsed.hook_event_name || parsed.hookEventName;
  if (eventName === 'SessionStart') return { kind: 'session-start' };
  for (const key of ['prompt', 'user_prompt', 'userPrompt']) {
    if (typeof parsed[key] === 'string' && parsed[key].trim()) {
      return { kind: 'user-prompt', prompt: parsed[key].trim() };
    }
  }
  return eventName === 'UserPromptSubmit'
    ? { kind: 'user-prompt', prompt: '' }
    : { kind: 'session-start' };
}

function readLocalCarrier(root) {
  const index = path.resolve(root, '.claude', 'insights', 'index.md');
  if (!fs.existsSync(index)) return { kind: 'missing', context: '' };
  const text = fs.readFileSync(index, 'utf8');
  const sections = text.split(/^## /m).filter(Boolean);
  const recent = sections.slice(-3).map((section) => '## ' + section.trim()).join('\n\n');
  if (!recent) return { kind: 'empty', context: '' };
  return { kind: 'populated', context: '## Recent project insights\n\n' + recent };
}

function truncateUtf8(value, maxBytes) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end).toString('utf8');
}

function renderRecallContext(rows) {
  const patterns = rows
    .filter((row) => row && row.domain === DOMAIN && typeof row.pattern === 'string')
    .map((row) => row.pattern.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (!patterns.length) return undefined;
  const heading = `## Recalled project insights (dz; ${patterns.length} hits)\n\n`;
  const body = truncateUtf8(patterns.join('\n\n'), MAX_RENDER_BYTES - Buffer.byteLength(heading));
  return body ? { context: heading + body, hitCount: patterns.length } : undefined;
}

function processFailure(error) {
  if (error && error.code === 'ENOENT') return { kind: 'absent' };
  if (error && error.code === 'ETIMEDOUT') return { kind: 'failing', reason: 'timeout' };
  const code = error && typeof error.code === 'string' && /^[A-Z0-9_-]{1,32}$/.test(error.code)
    ? error.code
    : 'unknown';
  return { kind: 'failing', reason: `spawn ${code}` };
}

function recallFromDz(prompt, root, { runner = childProcess.spawnSync } = {}) {
  let result;
  try {
    // --domain is a rank BOOST, not a filter: the caller still keeps only records whose domain
    // matches exactly. Without it, a shared multi-domain store buries insight records below the
    // top-12 cut and the armed state effectively never fires.
    result = runner('dz', ['recall', prompt, '--limit', '12', '--domain', DOMAIN, '--project', root, '--json'], {
      ...PROCESS_OPTIONS,
      cwd: root,
    });
  } catch (error) {
    return processFailure(error);
  }
  if (result.error) return processFailure(result.error);
  if (result.status !== 0) {
    const status = Number.isInteger(result.status) ? result.status : 'unknown';
    return { kind: 'failing', reason: `exit ${status}` };
  }
  let rows;
  try { rows = JSON.parse(result.stdout || ''); } catch (_error) {
    return { kind: 'failing', reason: 'invalid JSON' };
  }
  if (!Array.isArray(rows)) return { kind: 'failing', reason: 'invalid result' };
  const rendered = renderRecallContext(rows);
  return rendered ? { kind: 'ok', ...rendered } : { kind: 'empty' };
}

function renderPromptEnvelope(additionalContext) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  }) + '\n';
}

function emitContext(context, output) {
  if (typeof context === 'string' && context.trim()) {
    output.write(renderPromptEnvelope(context));
  }
}

function selectInsightOutput(localContext, recall) {
  if (recall.kind === 'failing') {
    return {
      source: 'local',
      context: `dz recall unavailable: ${recall.reason}; using local recent insights\n\n${localContext}`,
    };
  }
  return { source: 'local', context: localContext };
}

function emitInsights(root = ROOT, output = process.stdout, dependencies = {}) {
  try {
    const event = parseHookEvent(dependencies.rawEvent || '');
    const local = readLocalCarrier(root);
    if (event.kind === 'session-start') {
      if (local.kind === 'missing') output.write(MISSING_HINT);
      return;
    }
    if (local.kind !== 'populated') return;
    if (!event.prompt) {
      emitContext(local.context, output);
      return;
    }
    const recall = recallFromDz(event.prompt, root, { runner: dependencies.runner });
    if (recall.kind === 'ok') {
      emitContext(recall.context, output);
      return;
    }
    const selected = selectInsightOutput(local.context, recall);
    emitContext(selected.context, output);
  } catch (_error) {}
}

function main() {
  let rawEvent = '';
  try { rawEvent = fs.readFileSync(0, 'utf8'); } catch (_error) {}
  emitInsights(ROOT, process.stdout, { rawEvent });
}

module.exports = {
  emitInsights,
  parseHookEvent,
  recallFromDz,
  renderPromptEnvelope,
  selectInsightOutput,
};

if (require.main === module) main();
