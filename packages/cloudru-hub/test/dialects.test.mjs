// Skill dialect compiler tests — ADR-006 Confirmation, all layer 1: size, links, dialect
// grep, determinism. Uses a SYNTHETIC fixture (our own text carrying the Hermes-dialect
// tokens) — the real canonical corpus is upstream content and never ships in this package.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { compileSkill, loadDialects, filterFrontmatter } = require('../src/dialects.js');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudru-dialects-'));
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---
name: cloudru-hub
description: Управление Cloud.ru Evolution.
metadata:
  hermes:
    trust_tier: high
---
# Skill

Сначала прогони tool_search по каталогу, затем tool_describe нужного тула.
Вызови mcp__cloudru_vm__deploy_plan и покажи план капитану.
Для поллинга: hermes cron create '6m' status --deliver telegram.
Логи пиши в /opt/data/cloudru/logs, SOUL-контекст не трогай.
Подробнее: [деплой](modules/deploy.md) и [несуществующее](modules/models.md).
`);
  fs.mkdirSync(path.join(dir, 'modules'));
  fs.writeFileSync(path.join(dir, 'modules', 'deploy.md'), 'Деплой: спроси капитана, затем mcp__cloudru_vm__deploy_apply c confirmed=true.\n');
  return dir;
}

test('claude-code dialect: forbidden Hermes tokens are gone, tool prefix normalized', () => {
  const result = compileSkill(fixture(), 'claude-code');
  assert.equal(result.ok, true, result.report.errors.join('; '));
  const skill = result.files['SKILL.md'];
  const cfg = loadDialects();
  for (const token of cfg.forbiddenHermesTokens) {
    for (const [rel, text] of Object.entries(result.files)) {
      if (!rel.endsWith('.md')) continue;
      assert.ok(!text.includes(token), `${rel} still contains "${token}"`);
    }
  }
  assert.ok(skill.includes('mcp__cloudru-vm__deploy_plan'), 'underscore server name normalized to hyphen');
  assert.ok(result.files['modules/deploy.md'].includes('пользователя'), 'капитан → пользователь');
  assert.ok(skill.includes('ToolSearch'), 'tool_search section replaced with the native deferred-tools contract');
});

test('codex dialect compiles clean too, with its own tool-search text', () => {
  const result = compileSkill(fixture(), 'codex');
  assert.equal(result.ok, true, result.report.errors.join('; '));
  assert.ok(result.files['SKILL.md'].includes('tool-search рантайма'));
});

test('dangling links are UNLINKED and reported; resolvable links survive', () => {
  const result = compileSkill(fixture(), 'claude-code');
  assert.equal(result.report.dangling.length, 1);
  assert.match(result.report.dangling[0], /models\.md/);
  const skill = result.files['SKILL.md'];
  assert.ok(skill.includes('[деплой](modules/deploy.md)'), 'live link kept');
  assert.ok(!skill.includes('(modules/models.md)'), 'dead link target removed');
  assert.ok(skill.includes('несуществующее'), 'link text kept');
});

test('frontmatter keeps only name + description — metadata.hermes does not travel', () => {
  const result = compileSkill(fixture(), 'claude-code');
  const skill = result.files['SKILL.md'];
  assert.match(skill, /name: cloudru-hub/);
  assert.match(skill, /description: /);
  assert.ok(!skill.includes('trust_tier'));
  assert.ok(!skill.includes('metadata:'));
});

test('determinism: compiling twice is byte-identical (the property that forbids hand forks)', () => {
  const dir = fixture();
  const a = compileSkill(dir, 'claude-code');
  const b = compileSkill(dir, 'claude-code');
  assert.deepEqual(a.files, b.files);
});

test('lossy layout enforces the 12000-char router cap as a hard error', () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '# big\n' + 'x'.repeat(13000));
  const cfg = loadDialects();
  const lossyCfg = { ...cfg, targets: { ...cfg.targets, lossy: { layout: 'lossy', replacements: cfg.targets['claude-code'].replacements } } };
  const result = compileSkill(dir, 'lossy', lossyCfg);
  assert.equal(result.ok, false);
  assert.match(result.report.errors.join(' '), /12000/);
});

test('a surviving forbidden token is a HARD compile failure, never a shipped lie', () => {
  const dir = fixture();
  const cfg = loadDialects();
  const crippled = {
    ...cfg,
    targets: { ...cfg.targets, 'claude-code': { layout: 'lossless', replacements: [] } },
  };
  const result = compileSkill(dir, 'claude-code', crippled);
  assert.equal(result.ok, false);
  assert.match(result.report.errors.join(' '), /forbidden Hermes-dialect tokens survive/);
});

// --- codename gate (2026-08-10, cross-model QE MEDIUM): the 8-token denylist let the
// bare word "Hermes" and the ~/.hermes/ path through (real-corpus compile returned
// ok=true with 5 case-insensitive survivors — MEASURED). The gate is now a POSITIVE
// invariant: no occurrence of the codename, in any case, in any emitted file. ---

test('codename gate: an unscrubbed "Hermes" in ANY casing is a HARD compile failure', () => {
  for (const planted of ['Движок Hermes сказал так.', 'РЕЖИМ HERMES АКТИВЕН.', 'малый hermesовский хвост']) {
    const dir = fixture();
    fs.appendFileSync(path.join(dir, 'modules', 'deploy.md'), '\n' + planted + '\n');
    const result = compileSkill(dir, 'claude-code');
    assert.equal(result.ok, false, `planted "${planted}" must fail the compile`);
    assert.match(result.report.errors.join(' '), /codename "hermes"/, planted);
  }
});

test('codename gate covers non-.md files too (emitted verbatim, so a leak there is caught, not shipped)', () => {
  const dir = fixture();
  fs.writeFileSync(path.join(dir, 'helper.sh'), '#!/bin/sh\necho hermes home is ~/.hermes\n');
  const result = compileSkill(dir, 'claude-code');
  assert.equal(result.ok, false);
  assert.match(result.report.errors.join(' '), /helper\.sh: codename "hermes"/);
});

test('the real-corpus leak shapes are SCRUBBED: ~/.hermes/ path, hermes-agent name, prose mentions', () => {
  const dir = fixture();
  fs.appendFileSync(path.join(dir, 'SKILL.md'),
    '\nПути — от workspace root (с хоста ВМ это `~/.hermes/workspace/`, кэш в `.hermes/memory`).\n' +
    '### Стоп-правила (уроки Hermes 30.06 + 15.07)\n' +
    'Дубль создания = осиротевшие VM (так при Hermes возникли 2 лишние VM).\n');
  fs.appendFileSync(path.join(dir, 'modules', 'deploy.md'), '\n    "name": "hermes-agent",\n');
  const result = compileSkill(dir, 'claude-code');
  assert.equal(result.ok, true, result.report.errors.join('; '));
  for (const [rel, text] of Object.entries(result.files)) {
    assert.ok(!/hermes/i.test(text), `${rel} still mentions the codename`);
  }
  assert.ok(result.files['SKILL.md'].includes('~/.cloudru-hub/workspace/'), 'path remapped, not deleted');
  assert.ok(result.files['modules/deploy.md'].includes('"agent-vm"'), 'example VM name neutralized');
});

// --- codename gate: full engine-identity set (AM-2, 2026-08-10). The allowlist covered only
// "hermes"; the rest of the engine identity — `dzhechko` (go-module owner), `cloudru-vm-cli`
// (CLI name), `captainkeys` (captainkeys.go) — compiled CLEAN (MEASURED). Now each hard-fails. ---

test('codename gate: each engine-identity token (dzhechko, cloudru-vm-cli, captainkeys) hard-fails when it SURVIVES scrubbing', () => {
  // The gate is the net UNDER the scrub — it fires on any token that reaches an emitted
  // file. To exercise the gate itself (not the scrub replacements that would neutralize
  // these), compile with replacements disabled (as test 22 does) and plant each token.
  const cfg = loadDialects();
  for (const [planted, needle] of [
    ['Автор движка — dzhechko лично.', 'dzhechko'],
    ['Собрано из cloudru-vm-cli как есть.', 'cloudru-vm-cli'],
    ['Ключи инжектит captainkeys напрямую.', 'captainkeys'],
  ]) {
    const dir = fixture();
    fs.appendFileSync(path.join(dir, 'modules', 'deploy.md'), '\n' + planted + '\n');
    const crippled = { ...cfg, targets: { ...cfg.targets, 'claude-code': { layout: 'lossless', replacements: [] } } };
    const result = compileSkill(dir, 'claude-code', crippled);
    assert.equal(result.ok, false, `planted "${planted}" must fail the compile`);
    assert.ok(result.report.forbidden.some((f) => f.includes(`codename "${needle}"`)),
      `${planted}: expected a codename "${needle}" finding, got ${JSON.stringify(result.report.forbidden)}`);
  }
});

test('RED-before / GREEN-after: dzhechko/cloudru-vm-cli/captainkeys compiled CLEAN under the old ["hermes"]-only list, now hard-fail', () => {
  const cfg = loadDialects();
  const dir = fixture();
  fs.appendFileSync(path.join(dir, 'modules', 'deploy.md'), '\ndzhechko / cloudru-vm-cli / captainkeys\n');
  const noScrub = { layout: 'lossless', replacements: [] };
  // RED-before: the previous single-token list let all three through.
  const before = compileSkill(dir, 'claude-code', { ...cfg, forbiddenCodenames: ['hermes'], targets: { ...cfg.targets, 'claude-code': noScrub } });
  for (const tok of ['dzhechko', 'cloudru-vm-cli', 'captainkeys']) {
    assert.ok(!before.report.forbidden.some((f) => f.includes(`codename "${tok}"`)), `old list must NOT flag ${tok}`);
  }
  // GREEN-after: the shipped expanded list flags each one.
  const after = compileSkill(dir, 'claude-code', { ...cfg, targets: { ...cfg.targets, 'claude-code': noScrub } });
  for (const tok of ['dzhechko', 'cloudru-vm-cli', 'captainkeys']) {
    assert.ok(after.report.forbidden.some((f) => f.includes(`codename "${tok}"`)), `expanded list must flag ${tok}`);
  }
});

test('word-boundary: the published scope @dzhechkov is NOT over-blocked (dzhechko is only a substring of it)', () => {
  const dir = fixture();
  // @dzhechkov/cloudru-hub is the legitimate published identity — must survive the dzhechko net.
  fs.appendFileSync(path.join(dir, 'SKILL.md'), '\nУстановка: `npx @dzhechkov/cloudru-hub install`.\n');
  const result = compileSkill(dir, 'claude-code');
  assert.equal(result.ok, true, result.report.errors.join('; '));
  assert.ok(result.files['SKILL.md'].includes('@dzhechkov/cloudru-hub'), 'published scope kept verbatim');
});

test('word-boundary: a Latin word merely CONTAINING a codename (thermes) is not a false positive', () => {
  const dir = fixture();
  fs.appendFileSync(path.join(dir, 'SKILL.md'), '\nСлово thermes и arithmetic не про движок.\n');
  const result = compileSkill(dir, 'claude-code');
  assert.equal(result.ok, true, result.report.errors.join('; '));
  assert.ok(result.files['SKILL.md'].includes('thermes'), 'thermes survives — not the codename');
});

test('the engine-identity leak shapes are SCRUBBED: go-module path, cloudru-vm-cli, captainkeys', () => {
  const dir = fixture();
  fs.appendFileSync(path.join(dir, 'modules', 'deploy.md'),
    '\nДвижок: `github.com/dzhechko/cloudru-vm-cli`, бинарь cloudru-vm-cli; ключи из captainkeys.go.\n');
  const result = compileSkill(dir, 'claude-code');
  assert.equal(result.ok, true, result.report.errors.join('; '));
  const text = result.files['modules/deploy.md'];
  assert.ok(text.includes('@dzhechkov/cloudru-hub'), 'go-module path remapped to the published package');
  assert.ok(!/\bcloudru-vm-cli\b/i.test(text), 'CLI name scrubbed');
  assert.ok(!/\bdzhechko\b/i.test(text), 'engine handle scrubbed');
  assert.ok(!/\bcaptainkeys\b/i.test(text), 'captainkeys scrubbed');
});

// --- engine binary-name leak forms (0.1.3, Variant A): the bare token `cloudru-vm` is BOTH
// the engine binary AND the legitimate MCP server name that MUST appear in output. PROVEN:
// \bcloudru-vm\b matches the compiler's OWN injected tool_search prose "сервера cloudru-vm
// видны" (over-block), and mcp__cloudru-vm__ is spared only because `_` is a word char — so
// the bare token must NEVER enter forbiddenCodenames. Instead the two UNAMBIGUOUS leak
// FORMS are scrubbed: the dotted config path `.cloudru-vm` and the CLI invocation
// `cloudru-vm <real-engine-verb>` (finite verb set from engine cmd/cloudru-vm/main.go). ---

const ENGINE_VERBS = ['deploy', 'status', 'logs', 'destroy', 'verify', 'init', 'version', 'list-zones', 'list-images', 'mcp', 'doctor'];

test('over-block guard: the legit MCP server name cloudru-vm (prose + mcp__ tool id) compiles CLEAN and is NOT rewritten', () => {
  for (const target of ['claude-code', 'codex']) {
    const dir = fixture();
    fs.appendFileSync(path.join(dir, 'SKILL.md'),
      '\nИнструменты сервера cloudru-vm видны в сессии.\nВызови mcp__cloudru-vm__stack_status и жди.\n');
    const result = compileSkill(dir, target);
    assert.equal(result.ok, true, `${target}: ${result.report.errors.join('; ')}`);
    assert.equal(result.report.forbidden.length, 0, `${target}: ${JSON.stringify(result.report.forbidden)}`);
    const skill = result.files['SKILL.md'];
    assert.ok(skill.includes('сервера cloudru-vm видны'), `${target}: legit MCP-server prose kept verbatim`);
    assert.ok(skill.includes('mcp__cloudru-vm__stack_status'), `${target}: mcp__ tool id kept verbatim`);
  }
});

test('leak scrub GREEN: ~/.cloudru-vm path and `cloudru-vm <real-verb>` are rewritten to cloudru-hub forms in EVERY target', () => {
  for (const target of ['claude-code', 'codex']) {
    const dir = fixture();
    fs.appendFileSync(path.join(dir, 'modules', 'deploy.md'),
      '\nКонфиг движка лежит в ~/.cloudru-vm/config.\nЗапусти cloudru-vm deploy, потом cloudru-vm list-zones.\n');
    const result = compileSkill(dir, target);
    assert.equal(result.ok, true, `${target}: ${result.report.errors.join('; ')}`);
    assert.equal(result.report.forbidden.length, 0, `${target}: 0 codename-gate survivors`);
    const text = result.files['modules/deploy.md'];
    assert.ok(text.includes('~/.cloudru-hub/config'), `${target}: config-dir path remapped`);
    assert.ok(text.includes('cloudru-hub deploy'), `${target}: CLI invocation remapped`);
    assert.ok(text.includes('cloudru-hub list-zones'), `${target}: hyphenated verb remapped too`);
    assert.ok(!/\.cloudru-vm(?![\w-])/.test(text), `${target}: dotted leak form gone`);
    assert.ok(!/cloudru-vm (?:deploy|list-zones)/.test(text), `${target}: invocation leak form gone`);
  }
});

test('leak scrub RED-before: without the two scrub entries the leak forms shipped INTACT with ok=true (the 0.1.2 behavior)', () => {
  const cfg = loadDialects();
  const isNewScrub = (r) => r.find.includes('\\.cloudru-vm(?!') || r.find.includes('\\bcloudru-vm[ \\t]+');
  // The shipped config MUST actually carry both new entries (else this test proves nothing).
  for (const target of ['claude-code', 'codex']) {
    assert.equal(cfg.targets[target].replacements.filter(isNewScrub).length, 2, `${target} carries both leak-form scrubs`);
  }
  const old = {
    ...cfg,
    targets: { ...cfg.targets, 'claude-code': { ...cfg.targets['claude-code'], replacements: cfg.targets['claude-code'].replacements.filter((r) => !isNewScrub(r)) } },
  };
  const dir = fixture();
  fs.appendFileSync(path.join(dir, 'modules', 'deploy.md'), '\n~/.cloudru-vm/config и cloudru-vm deploy.\n');
  const before = compileSkill(dir, 'claude-code', old);
  assert.equal(before.ok, true, 'the codename gate alone never caught the bare-binary leak forms');
  assert.ok(before.files['modules/deploy.md'].includes('~/.cloudru-vm/config'), 'RED: path leak survived under 0.1.2 config');
  assert.ok(before.files['modules/deploy.md'].includes('cloudru-vm deploy'), 'RED: invocation leak survived under 0.1.2 config');
});

test('leak scrub precision: non-verb prose, a non-whole-word verb, and .cloudru-vm-cli are all untouched by the new scrubs', () => {
  const dir = fixture();
  fs.appendFileSync(path.join(dir, 'SKILL.md'),
    '\nСервер cloudru-vm запускает деплой; слово cloudru-vm deployment — не команда.\n');
  const result = compileSkill(dir, 'claude-code');
  assert.equal(result.ok, true, result.report.errors.join('; '));
  const skill = result.files['SKILL.md'];
  assert.ok(skill.includes('cloudru-vm запускает'), 'Russian non-verb prose untouched');
  assert.ok(skill.includes('cloudru-vm deployment'), 'verb alternation is whole-word ((?:…)\\b): deployment ≠ deploy');
  // `.cloudru-vm-cli` is handled by the EARLIER (longer, ordered-first) cloudru-vm-cli scrub,
  // and the (?![\w-]) lookahead keeps the new path scrub from mis-splitting it into `.cloudru-hub-cli`.
  const dir2 = fixture();
  fs.appendFileSync(path.join(dir2, 'SKILL.md'), '\nСтарый путь был .cloudru-vm-cli/cache.\n');
  const r2 = compileSkill(dir2, 'claude-code');
  assert.equal(r2.ok, true, r2.report.errors.join('; '));
  assert.ok(r2.files['SKILL.md'].includes('.cloudru-hub/cache'), 'cloudru-vm-cli scrub owned it whole');
  assert.ok(!r2.files['SKILL.md'].includes('cloudru-hub-cli'), 'no mis-split by the path scrub');
});

test('the CLI-invocation verb set matches the engine cobra command set exactly (cmd/cloudru-vm/main.go AddCommand)', () => {
  const cfg = loadDialects();
  for (const target of ['claude-code', 'codex']) {
    const r = cfg.targets[target].replacements.find((x) => x.find.includes('\\bcloudru-vm[ \\t]+'));
    assert.ok(r, `${target} has the invocation scrub`);
    const m = r.find.match(/\(\?:\(\?:([^)]*)\)/) || r.find.match(/\(\?=\(\?:([^)]*)\)/);
    assert.ok(m, `${target}: lookahead alternation parseable`);
    assert.deepEqual(m[1].split('|').sort(), [...ENGINE_VERBS].sort(), `${target}: verb set is the engine's real command set`);
  }
});

test('unknown target is refused with the known list', () => {
  const result = compileSkill(fixture(), 'vim');
  assert.equal(result.ok, false);
  assert.match(result.report.errors[0], /unknown dialect target/);
});

test('filterFrontmatter is a no-op on files without frontmatter', () => {
  assert.equal(filterFrontmatter('# plain\n'), '# plain\n');
});
