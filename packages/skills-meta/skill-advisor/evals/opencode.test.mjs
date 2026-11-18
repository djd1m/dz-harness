import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkOpenCodeAdvice, parseOpenCodeDraft } from '../scripts/check-opencode-advice.mjs';

const registry = { schema: 'dz-registry/1', ok: true, entries: [{ id: 'feature-adr' }, { id: 'explore' }] };
const draft = () => ({ task: 'Implement one feature', recommendations: [
  { name: 'feature-adr', type: 'skill', fit: 'high', why: 'Requirements through verification.' }
], pipeline: ['feature-adr'], gaps: ['Companion toolkit hooks are not installed by this route.'] });

test('accepts documented JSON frames while discarding surrounding model prose', () => {
  const json = JSON.stringify(draft());
  for (const text of [json, `Internal draft:\n${json}`, `Draft:\n\n\`\`\`json\n${json}\n\`\`\`\n`]) {
    assert.deepEqual(parseOpenCodeDraft(text), draft());
    assert.equal(checkOpenCodeAdvice(registry, parseOpenCodeDraft(text)).task, draft().task);
  }
});

test('rejects ambiguous blocks, malformed JSON, trailing prose and incidental braces', () => {
  const json = JSON.stringify(draft());
  for (const text of [null, 'Nothing useful {here}', 'prefix {"task":',
    `${json}\nUnchecked postscript`, `\`\`\`json\n${json}\n\`\`\`\n\`\`\`json\n${json}\n\`\`\``]) {
    assert.throws(() => parseOpenCodeDraft(text));
  }
});

test('rejects a fenced draft followed by a corrected JSON answer', () => {
  const first = JSON.stringify(draft());
  const corrected = JSON.stringify({ ...draft(), task: 'Corrected task' });
  assert.throws(() => parseOpenCodeDraft(`\`\`\`json\n${first}\n\`\`\`\n${corrected}`), /Ambiguous/);
  assert.throws(() => parseOpenCodeDraft(`\`\`\`json\n${first}\n\`\`\`\nPostscript`), /Ambiguous/);
});

test('generates the native target from live skill identities without mutating input', () => {
  const input = draft();
  const output = checkOpenCodeAdvice(registry, input);
  assert.equal(output.recommendations[0].install, 'dz init --target opencode --select feature-adr');
  assert.equal(input.recommendations[0].install, undefined);
});

for (const install of [
  'dz init --target claude-code --select feature-adr',
  'dz init --target codex --select feature-adr',
  'npx @dzhechkov/skills-feature-adr init',
  'dz init --target opencode --select feature-adr; touch /tmp/unsafe'
]) test(`rejects incompatible supplied command: ${install}`, () => {
  const input = draft(); input.recommendations[0].install = install;
  assert.throws(() => checkOpenCodeAdvice(registry, input), /Incompatible install/);
});

test('preserves a matching command', () => {
  const input = draft(); input.recommendations[0].install = 'dz init --target opencode --select feature-adr';
  assert.equal(checkOpenCodeAdvice(registry, input).recommendations[0].install, input.recommendations[0].install);
});

test('ranks higher stated fit first without changing the execution pipeline', () => {
  const input = draft(); input.recommendations.unshift({ name: 'explore', type: 'skill', fit: 'medium', why: 'Clarify first.' });
  input.pipeline = ['explore', 'feature-adr'];
  const output = checkOpenCodeAdvice(registry, input);
  assert.deepEqual(output.recommendations.map(item => item.name), ['feature-adr', 'explore']);
  assert.deepEqual(output.pipeline, input.pipeline);
  assert.equal(input.recommendations[0].name, 'explore');
});

test('rejects unlisted skills, npm toolkits and unchecked preset routes', () => {
  for (const item of [
    { name: 'invented-skill', type: 'skill' },
    { name: 'feature-adr', type: 'npx-package' },
    { name: 'feature-adr', type: 'preset' }
  ]) {
    const input = draft(); Object.assign(input.recommendations[0], item);
    assert.throws(() => checkOpenCodeAdvice(registry, input), /exact live registry name/);
  }
});

test('rejects failed, empty, malformed or shell-unsafe registry data', () => {
  for (const data of [null, {}, { ...registry, ok: false }, { ...registry, entries: [] },
    { ...registry, entries: [{ id: 'feature-adr; echo bad' }] }, { ...registry, entries: [null] }
  ]) assert.throws(() => checkOpenCodeAdvice(data, draft()), /snapshot/);
});

test('rejects malformed advice and fabricated pipeline steps', () => {
  for (const input of [null, {}, { ...draft(), gaps: null }, { ...draft(), task: '' },
    { ...draft(), recommendations: [] }, { ...draft(), pipeline: ['unknown'] },
    { ...draft(), recommendations: [{ ...draft().recommendations[0], why: '' }] },
    { ...draft(), recommendations: [{ ...draft().recommendations[0], fit: 'perfect' }] }
  ]) assert.throws(() => checkOpenCodeAdvice(registry, input));
});

test('rejects a known but unrecommended pipeline skill', () => {
  assert.throws(() => checkOpenCodeAdvice(registry, { ...draft(), pipeline: ['explore', 'feature-adr'] }), /recommended skills/);
});

test('rejects duplicate picks and does not forward arbitrary output fields', () => {
  const input = draft(); input.recommendations.push(input.recommendations[0]);
  assert.throws(() => checkOpenCodeAdvice(registry, input), /Duplicate/);
  const fresh = draft(); fresh.recommendations[0].unverifiedCommand = 'npx unknown init';
  assert.equal(checkOpenCodeAdvice(registry, fresh).recommendations[0].unverifiedCommand, undefined);
});

test('CLI emits data on success and nonzero with no stdout for invalid inputs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'advisor-opencode-'));
  const script = fileURLToPath(new URL('../scripts/check-opencode-advice.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  try {
    const registryPath = join(directory, 'registry.json'), draftPath = join(directory, 'draft.json');
    writeFileSync(registryPath, JSON.stringify(registry)); writeFileSync(draftPath, JSON.stringify(draft()));
    const good = run(registryPath, draftPath);
    assert.equal(good.status, 0); assert.equal(JSON.parse(good.stdout).recommendations[0].type, 'skill');
    for (const args of [[], [registryPath, '/nonexistent/draft.json']]) {
      const bad = run(...args); assert.equal(bad.status, 1); assert.equal(bad.stdout, '');
    }
    writeFileSync(draftPath, '{');
    const malformed = run(registryPath, draftPath);
    assert.equal(malformed.status, 1); assert.equal(malformed.stdout, '');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
