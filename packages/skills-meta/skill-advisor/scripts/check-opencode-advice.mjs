#!/usr/bin/env node
// Native OpenCode route only. Reads data; never runs a recommended command.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const strings = value => Array.isArray(value) && value.every(nonempty);
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Decode the draft, never forward the surrounding model prose to the reader.
 * Accepted frames: plain JSON, one fenced JSON block, or JSON on the final line.
 * Deliberately does not scan arbitrary brace substrings or repair malformed JSON.
 */
export function parseOpenCodeDraft(text) {
  if (typeof text !== 'string') throw new Error('Expected assistant text.');
  try { return JSON.parse(text); } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  const blocks = [...text.matchAll(/^```json[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm)];
  if (blocks.length > 1) throw new Error('Ambiguous draft: multiple JSON blocks.');
  if (blocks.length === 1) {
    const block = blocks[0];
    if (text.slice(block.index + block[0].length).trim()) {
      throw new Error('Ambiguous draft: content follows the JSON block.');
    }
    return JSON.parse(block[1]);
  }
  return JSON.parse(text.trim().split(/\r?\n/).at(-1));
}

/** Validate a draft against a caller-supplied, successful `dz registry --json` snapshot.
 * The caller owns snapshot provenance/freshness; this does not attest ranking quality.
 * Omitted install strings are generated; supplied incompatible strings are rejected.
 */
export function checkOpenCodeAdvice(registry, draft) {
  if (!object(registry) || registry.schema !== 'dz-registry/1' || registry.ok !== true ||
      !Array.isArray(registry.entries) || registry.entries.length === 0 ||
      !registry.entries.every(entry => object(entry) && typeof entry.id === 'string' &&
        idPattern.test(entry.id))) {
    throw new Error('Expected a successful, nonempty dz registry --json snapshot (dz-registry/1).');
  }
  const names = new Set(registry.entries.map(entry => entry.id));
  if (!object(draft) || !nonempty(draft.task) || !Array.isArray(draft.recommendations) ||
      draft.recommendations.length === 0 || !strings(draft.gaps)) {
    throw new Error('Expected task, nonempty recommendations, and a gaps array of strings.');
  }
  const seen = new Set();
  const recommendations = draft.recommendations.map(item => {
    if (!object(item) || item.type !== 'skill' || !names.has(item.name)) {
      throw new Error('Native OpenCode advice requires type=skill and an exact live registry name; put unverified toolkits/presets in gaps.');
    }
    if (seen.has(item.name)) throw new Error(`Duplicate recommendation: ${item.name}`);
    seen.add(item.name);
    if (!['high', 'medium', 'low'].includes(item.fit) || !nonempty(item.why)) {
      throw new Error(`Expected fit=high|medium|low and a rationale for ${item.name}.`);
    }
    const install = `dz init --target opencode --select ${item.name}`;
    if (Object.hasOwn(item, 'install') && item.install !== install) {
      throw new Error(`Incompatible install command for ${item.name}; expected: ${install}`);
    }
    // Return only the supported output fields; do not forward arbitrary model keys.
    return { name: item.name, type: 'skill', fit: item.fit, why: item.why, install };
  });
  const fitOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => fitOrder[a.fit] - fitOrder[b.fit]);
  const result = { task: draft.task, recommendations, gaps: draft.gaps };
  if (Object.hasOwn(draft, 'pipeline')) {
    if (!strings(draft.pipeline) || !draft.pipeline.every(name => seen.has(name))) {
      throw new Error('Every pipeline step must be one of the recommended skills (with an install command).');
    }
    result.pipeline = draft.pipeline;
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node check-opencode-advice.mjs <registry.json> <draft.json>');
    const registry = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const draft = parseOpenCodeDraft(readFileSync(process.argv[3], 'utf8'));
    console.log(JSON.stringify(checkOpenCodeAdvice(registry, draft), null, 2));
  } catch (error) {
    console.error(`OpenCode advice rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
