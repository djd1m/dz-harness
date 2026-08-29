'use strict';

// /replicate and /start both write docker-compose.yml and .gitignore — on the RECOMMENDED path.
//
// `replicate.md` Phase 4 FINALIZE generates docker-compose.yml (from Architecture.md services),
// Dockerfile and .gitignore; `start.md` Phase 1 generated package.json, docker-compose.yml,
// .env.example, .gitignore and tsconfig.base.json with no existence guard at all. And
// `replicate.md` itself says "Run /start to bootstrap the project" — so the collision was the normal
// sequence, not an edge case.
//
// The field report proposed splitting ownership "by origin": architecture-derived to /replicate,
// build-derived to /start. That cannot work here, because BOTH derive compose from the SAME source —
// replicate.md from "Architecture.md services", start.md from "docs/Architecture.md → monorepo
// structure, Docker Compose, tech stack". One artifact, derived twice; an origin split has nothing
// to split on. So the guard is existence-plus-stated-change, which closes the silent loss without
// deciding who owns the file — that ownership question is deliberately left to the owner.
//
// These are PROMPT files a model executes, so the deterministic layer available is their content.
// Every assertion below is DISCRIMINATING: remove what it names and it goes red.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CMDS = path.join(__dirname, '..', '..', 'templates', '.claude', 'commands');
const read = (f) => fs.readFileSync(path.join(CMDS, f), 'utf-8');

/** Phase 1 of start.md — placement matters: a guard in a later phase guards nothing. */
function startPhase1(src) {
  const start = src.indexOf('### Phase 1: Foundation');
  const end = src.indexOf('### Phase 2');
  assert.ok(start > 0, 'start.md must have a Phase 1');
  assert.ok(end > start, 'start.md must have a Phase 2 after it');
  return src.slice(start, end);
}

describe('/start must not silently discard what /replicate wrote (PR-008)', () => {
  test('P1 — Phase 1 names BOTH overlapping files under the guard', () => {
    const block = startPhase1(read('start.md'));
    assert.match(block, /docker-compose\.yml/, 'the compose file must be named');
    assert.match(block, /\.gitignore/, 'the gitignore must be named');
    // Codex found a THIRD overlap I had missed: /replicate Phase 3 enhances README.md and /start
    // Phase 4 generates-or-updates it, with no preservation rule on either side.
    assert.match(block, /README\.md/, 'README.md overlaps too and must be under the same rule');
    assert.match(block, /if not exists/,
      'the guard phrase must be present — and it is /replicate\'s own phrase, so the two commands '
      + 'read as one rule rather than two dialects');
  });

  test('P2 — the PRESENT case has its own stated action, not just an existence check', () => {
    // Checking existence and then overwriting anyway would satisfy a weaker assertion. The property
    // is what happens when the file IS there.
    const block = startPhase1(read('start.md'));
    assert.match(block, /файла НЕТ/, 'the absent case must be stated (a fresh tree still works)');
    assert.match(block, /файл ЕСТЬ/, 'the present case must be stated');
    assert.match(block, /не перегенерировать/,
      'the present case must forbid regeneration outright — "take it into account" permits it');
    // Cross-family QE (Codex gpt-5.6-sol): "keep it, change only for a documented reason" still let
    // a run rewrite the whole file while calling it "added the missing port". The rule now demands a
    // MINIMAL targeted edit, preservation of everything unrelated, and a look at the diff — the diff
    // is what distinguishes the two, and a promise is not.
    assert.match(block, /МИНИМАЛЬНУЮ/, 'the permitted edit must be bounded, not merely justified');
    assert.match(block, /ПОСМОТРЕТЬ ДИФ/,
      'inspecting the diff is what turns "I only added a port" from a claim into a check');
  });

  test('P3 — a permitted change must be NAMED, because an unannounced diff is the same loss', () => {
    const block = startPhase1(read('start.md'));
    assert.match(block, /НАЗВАТЬ каждый изменённый фрагмент/,
      'a legitimate edit is allowed, but every changed hunk has to be visible to the reader');
  });

  test('P4 — replicate.md still guards .gitignore with the same phrase, and points at /start', () => {
    const src = read('replicate.md');
    assert.match(src, /`\.gitignore` — if not exists/,
      'the pre-existing guard must survive — this feature adds one, it does not trade one for another');
    // Codex: the collision is SYMMETRIC. /replicate re-run over a tree that already has a compose
    // would discard it just as /start did; guarding one side only fixes half the defect.
    assert.match(src, /`docker-compose\.yml` — from Architecture\.md services, \*\*if not exists\*\*/,
      'replicate must guard its own compose too — the guard is symmetric or it is partial');
    assert.match(src, /Phase 1/,
      'replicate.md must point at the phase that reads these files, so the agreement is written down');
  });

  test('P5 — the guard is imperative and file-naming, not advisory', () => {
    const block = startPhase1(read('start.md'));
    // "be careful not to overwrite" would pass a reviewer and instruct nothing. The rule must name
    // its files and its actions.
    assert.ok(!/будьте осторожн|постарайтесь не|по возможности/i.test(block),
      'advisory wording is not a rule');
    assert.match(block, /Правило|правило/,
      'the block must present itself as a rule');
  });
});
