#!/usr/bin/env node
// verify-site — RUN the generated SPA, don't just parse it.
//
// There is no browser and no jsdom in this environment, so this ships a ~120-line DOM shim: enough
// of createElement / appendChild / classList / addEventListener / querySelector for the course
// runtime to execute for real. It then DRIVES the site the way a learner would — open the intro,
// walk every section, complete every exercise by clicking, take the final test — and asserts the
// observable outcomes (sections rendered, scores recorded, achievements unlocked, final test passed).
//
// A green run here means the page BOOTS AND WORKS, not merely that it is well-formed HTML.
//
//   node scripts/verify-site.mjs [--site <course-dir>/site/index.html]
// Exit 0 iff every assertion holds. Pairs with scripts/render-site.mjs (the factory's executable
// render seam, dogfood finding F2); the course object drives every assertion — nothing here is
// specific to any one course.

import { readFileSync } from 'node:fs';
// ОДИН матчер понятий на весь пакет: гейт и верификатор обязаны судить одинаково. Своя копия
// логики в верификаторе была слепа к русской морфологии («одиннадцать» vs «одиннадцати») и
// ложно валила корректно отрендеренную секцию (измерено 2026-08-31, курс feature-adr).
import { conceptEncodedIn } from './course-schema.mjs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const sitePath = resolve(opt('site', join('site', 'index.html')));

const html = readFileSync(sitePath, 'utf-8');

// ---------------------------------------------------------------- minimal DOM
class ClassList {
  constructor(node) { this.node = node; this.set = new Set(); }
  add(...cs) { for (const c of cs) if (c) this.set.add(c); }
  remove(...cs) { for (const c of cs) this.set.delete(c); }
  contains(c) { return this.set.has(c); }
  toggle(c, on) { if (on === undefined) on = !this.set.has(c); if (on) this.set.add(c); else this.set.delete(c); return on; }
  get value() { return [...this.set].join(' '); }
}
class Node {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this.childNodes = [];
    this.attrs = {};
    this.listeners = {};
    this.classList = new ClassList(this);
    this.style = {};
    this.parentNode = null;
    this.disabled = false;
    this._text = null;
  }
  get children() { return this.childNodes.filter((c) => c instanceof Node); }
  set className(v) { this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return this.classList.value; }
  set textContent(v) { this.childNodes = []; this._text = String(v); }
  get textContent() {
    if (this._text !== null) return this._text;
    return this.childNodes.map((c) => (c instanceof Node ? c.textContent : String(c.data))).join('');
  }
  set innerHTML(v) { this.childNodes = []; this._html = String(v); this._text = stripTags(String(v)); }
  get innerHTML() { return this._html || ''; }
  appendChild(c) { this._text = null; this._html = undefined; if (c instanceof Node) c.parentNode = this; this.childNodes.push(c); return c; }
  remove() { const p = this.parentNode; if (!p) return; p.childNodes = p.childNodes.filter((c) => c !== this); this.parentNode = null; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'disabled') this.disabled = true; }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  click() {
    if (this.disabled) return false;
    for (const fn of this.listeners.click || []) fn({ currentTarget: this, target: this, preventDefault() {} });
    return true;
  }
  _walk(out = []) { out.push(this); for (const c of this.children) c._walk(out); return out; }
  _matches(sel) {
    if (sel.startsWith('#')) return this.attrs.id === sel.slice(1);
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    const attr = sel.match(/^\[([a-z-]+)="([^"]*)"\]$/i);
    if (attr) return this.attrs[attr[1]] === attr[2];
    return this.tagName === sel.toUpperCase();
  }
  querySelector(sel) { return this._walk().slice(1).find((n) => n._matches(sel)) || null; }
  querySelectorAll(sel) { return this._walk().slice(1).filter((n) => n._matches(sel)); }
}
const stripTags = (s) => s.replace(/<[^>]*>/g, '');
class TextNode { constructor(d) { this.data = String(d); } get textContent() { return this.data; } }

const documentEl = new Node('html');
const body = new Node('body');
documentEl.appendChild(body);
const document = {
  documentElement: documentEl,
  body,
  title: '',
  createElement: (t) => new Node(t),
  createTextNode: (d) => new TextNode(d),
  getElementById: (id) => documentEl._walk().find((n) => n.attrs.id === id) || null,
  querySelector: (sel) => documentEl.querySelector(sel),
  querySelectorAll: (sel) => documentEl.querySelectorAll(sel),
};
const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
const timers = [];
const setTimeout_ = (fn) => { timers.push(fn); return timers.length; };
const window = { scrollTo() {}, confirm: () => true };

// ---------------------------------------------------------------- boot the page
const dataEl = new Node('script');
dataEl.setAttribute('id', 'course-data');
const jsonMatch = html.match(/<script type="application\/json" id="course-data">([\s\S]*?)<\/script>/);
if (!jsonMatch) fail('no embedded course-data block in the page');
dataEl.textContent = jsonMatch[1];
body.appendChild(dataEl);
// the ui-strings locale block must exist in the shim DOM too — the runtime reads it at boot
const uiBlock = html.match(/<script type="application\/json" id="ui-strings">([\s\S]*?)<\/script>/);
if (uiBlock) {
  const uiElNode = new Node('script');
  uiElNode.setAttribute('id', 'ui-strings');
  uiElNode.textContent = uiBlock[1];
  body.appendChild(uiElNode);
}
body.appendChild(Object.assign(new Node('aside'), {}) && (() => { const a = new Node('aside'); a.setAttribute('id', 'aside'); return a; })());
body.appendChild((() => { const m = new Node('main'); m.setAttribute('id', 'main'); return m; })());

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1) fail(`expected exactly 1 inline runtime <script>, found ${scripts.length}`);
const appJs = scripts[scripts.length - 1][1];

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });
function fail(msg) { console.error('verify-site: ' + msg); process.exit(1); }

let boot;
try {
  // eslint-disable-next-line no-new-func
  boot = new Function('document', 'localStorage', 'window', 'setTimeout', 'clearTimeout', 'confirm', appJs);
  boot(document, localStorage, window, setTimeout_, () => {}, () => true);
  ok('runtime.boots', 'the inline runtime executed without throwing');
} catch (e) {
  bad('runtime.boots', e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n'));
  report();
}

const course = JSON.parse(jsonMatch[1]);

// The UI locale table the RUNTIME uses — the verifier drives the page through the SAME strings,
// so a localized site is verified in its own language instead of failing on English probes.
const UI_PROBE_EN = {
  strengths: 'Strengths', weaknesses: 'Weaknesses', wrapup: 'Wrap-up',
  next: 'Next \u2192', checkOrder: 'Check the order', checkCommand: 'Check the command',
  finalTest: 'Final test', passed: 'Passed \u2014 ', reset: 'Reset', faqNav: 'FAQ',
  completed: 'completed \u00b7 ',
  doSomething: 'Do something \u2014 ', checkYourself: 'Check yourself', types: {},
};
const uiMatch = html.match(/<script type="application\/json" id="ui-strings">([\s\S]*?)<\/script>/);
const uiOver = uiMatch ? (JSON.parse(uiMatch[1]) || null) : null;
const T = Object.assign({}, UI_PROBE_EN, uiOver || {});
const typeLabel = (t) => (T.types && T.types[t]) || t;
const achRe = new RegExp((T.achievements || 'Achievements \u2014 ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+) / (\\d+)');
const main = () => document.getElementById('main');
const aside = () => document.getElementById('aside');
const text = (n) => (n ? n.textContent : '');
const navButtons = () => aside().querySelectorAll('BUTTON');

// The runtime sorts by `order` and resolves type aliases — the verifier must speak the SAME
// course dialect or a shuffled/aliased course fails verification while running fine (Codex QE #8).
const orderedSections = course.sections.slice().sort((a, b) => a.order - b.order);
const normType = (t) => ({ ordering: 'drag-and-drop', simulation: 'scenario' })[t] || t;

// ---------------------------------------------------------------- assertions
// The whole drive runs inside one containment: an exception mid-walk (e.g. a section whose payload
// the runtime cannot render) must land in the behavioural report as a named failure, never escape
// as a raw stack trace with exit-code noise (Codex QE round-2 #15).
try {
// 0. the emitted page carries the real scaffold. The shim above FABRICATES aside/main to host the
// runtime (it is not an HTML parser — an honest limitation), so the scaffold must be asserted on
// the emitted BYTES or a page missing its structure would still verify green (Codex QE #3).
{
  const wanted = ['<!doctype html>', '<div class="layout">', '<aside id="aside">', '<main id="main">', '<style>'];
  const missing = wanted.filter((w) => !html.includes(w));
  (missing.length === 0 ? ok : bad)('scaffold.emitted',
    missing.length === 0 ? 'doctype + layout + aside + main + style present in the emitted page' : `missing from the page: ${missing.join(' ')}`);
}
// 1. the intro rendered and names the persona
{
  const t = text(main());
  const good = t.includes(course.courseTitle) && t.includes(course.persona.name);
  (good ? ok : bad)('intro.renders', good ? `title + persona "${course.persona.name}" present` : 'intro missing title or persona');
}

// 2. the sidebar lists every section + final test + FAQ
{
  const labels = navButtons().map(text);
  const missing = course.sections.filter((s) => !labels.some((l) => l.includes(s.shortTitle)));
  const hasFinal = labels.some((l) => l.includes(T.finalTest));
  const good = missing.length === 0 && hasFinal;
  (good ? ok : bad)('nav.lists-every-section', good ? `${course.sections.length} sections + final test in the sidebar` : `missing: ${missing.map((s) => s.id).join(',')} finalTest=${hasFinal}`);
}

function openSection(shortTitle) {
  const b = navButtons().find((n) => text(n).includes(shortTitle));
  if (!b) return false;
  b.click();
  return true;
}

// 3. every section renders theory + the reflective quartet + its exercise
for (const s of orderedSections) {
  if (!openSection(s.shortTitle)) { bad(`section.${s.id}.opens`, 'no sidebar button'); continue; }
  const t = text(main());
  // the key concept must be encoded in the rendered prose (case-insensitive — prose sentence-cases it),
  // and the theory itself must actually be there: at least 80% of its first 10 distinctive words
  // (len >= 5) must appear in the rendered text. Word-level survives the markdown-lite transforms;
  // a fixed byte threshold would be tuned to one course's prose length.
  // Probe words must come from the VISIBLE text only. A markdown link's URL lands in an href
  // attribute, never in textContent, so sampling the raw source made url innards (https, npmjs,
  // package) look like missing theory words and false-failed a correctly rendered section
  // (measured 2026-08-31 on the feature-adr course, whose intro links its npm page).
  const theoryVisible = String(s.theory || '').replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '$1');
  const theoryWords = [...new Set(theoryVisible.toLowerCase().match(/[\p{L}\p{N}]{5,}/gu) || [])].slice(0, 10);
  const tLower = t.toLowerCase();
  const present = theoryWords.filter((w) => tLower.includes(w)).length;
  const theoryOk = conceptEncodedIn(s.keyConcept, t)
    && theoryWords.length > 0 && present >= Math.ceil(theoryWords.length * 0.8);
  const quartetOk = t.includes(T.strengths) && t.includes(T.weaknesses) && t.includes(T.wrapup);
  const personaOk = t.includes(course.persona.name);
  const patternOk = t.includes('Head First ' + s.methodPattern);
  const exerciseOk = t.includes(T.doSomething + typeLabel(s.interactiveType));
  // the secondary "Check yourself" quiz must RENDER on non-quiz sections that carry quiz data —
  // deleting it wholesale must not verify green (Codex QE #5)
  const secondaryOk = normType(s.interactiveType) === 'quiz' || !(s.quiz && s.quiz.length) || t.includes(T.checkYourself);
  const all = theoryOk && quartetOk && personaOk && patternOk && exerciseOk && secondaryOk;
  (all ? ok : bad)(`section.${s.id}.renders`,
    all ? `theory + quartet + persona + ${s.methodPattern} + ${s.interactiveType} exercise`
        : `theory=${theoryOk} quartet=${quartetOk} persona=${personaOk} pattern=${patternOk} exercise=${exerciseOk} secondaryQuiz=${secondaryOk}`);
}

// 3b. the persona's notebook — a recurring visual device — is OPTIONAL per course, but must be
// CONSISTENT: if any section carries one, every section must (a device that appears in only some
// sections is not a device, it is a one-off). That is deterministic, so it belongs on this layer
// rather than on a reviewer's memory. A course with no notebooks at all skips the walk honestly.
{
  const usesNotebook = course.sections.some((s) => s.notebook && s.notebook.note);
  if (!usesNotebook) {
    ok('notebook.device-consistency', 'course does not use the notebook device — nothing to assert');
  } else {
    for (const s of orderedSections) {
      if (!openSection(s.shortTitle)) { bad(`notebook.${s.id}.renders`, 'no sidebar button'); continue; }
      const nb = main().querySelector('.notebook');
      const t = text(nb);
      // the AUTHORED note must be what renders — word overlap, not an arbitrary length floor
      // (Codex QE #12): >= 80% of the note's first 10 distinctive words must appear.
      const noteWords = [...new Set(String((s.notebook && s.notebook.note) || '').toLowerCase().match(/[\p{L}\p{N}]{5,}/gu) || [])].slice(0, 10);
      const nbLower = t.toLowerCase();
      const noteOk = noteWords.length > 0 && noteWords.filter((w) => nbLower.includes(w)).length >= Math.ceil(noteWords.length * 0.8);
      const good = !!nb && !!s.notebook && !!s.notebook.when && t.includes(s.notebook.when)
        && t.includes(course.persona.name) && noteOk;
      (good ? ok : bad)(`notebook.${s.id}.renders`,
        good ? `notebook block present, stamped "${s.notebook.when}", authored note rendered` : 'notebook block missing, unstamped, or not the authored note');
    }
  }
}

// 4. drive each exercise type to completion by clicking, and assert a score lands
function progressPct() {
  const label = aside().querySelector('.progress-label');
  const m = text(label).match(/(\d+)%/);
  return m ? Number(m[1]) : -1;
}

function completeSecondaryQuiz(s) {
  // non-quiz sections may carry a secondary "Check yourself" quiz — drive it and COUNT the clicks;
  // a missing button is a defect signal, not something to skip silently (Codex QE round-2 #5)
  const m = main();
  let clicked = 0;
  for (let q = 0; q < s.quiz.length; q++) {
    const want = s.quiz[q].options[s.quiz[q].correctAnswer];
    const btn = m.querySelectorAll('.opt').find((b) => text(b) === want && !b.disabled);
    if (btn && btn.click()) clicked++;
    const nxt = m.querySelectorAll('BUTTON').filter((b) => text(b).includes(T.nextQuestion || 'Next question') || text(b).includes(T.seeResult || 'See the result')).pop();
    if (nxt) nxt.click();
  }
  return { clicked, total: s.quiz.length };
}

function completeSection(s) {
  openSection(s.shortTitle);
  const m = main();
  const type = normType(s.interactiveType);
  if (type === 'flashcards') {
    const next = m.querySelectorAll('BUTTON').find((b) => text(b).includes(T.next));
    for (let i = 0; i < s.exercise.cards.length + 1; i++) next.click();
  } else if (type === 'matching') {
    // click each left chip then its correct right chip
    for (const p of s.exercise.pairs) {
      const chips = m.querySelectorAll('.chip');
      const left = chips.find((c) => !c.classList.contains('done') && text(c) === p.left);
      if (left) left.click();
      const right = chips.filter((c) => text(c) === p.right).find((c) => !c.classList.contains('done'));
      if (right) right.click();
    }
  } else if (type === 'drag-and-drop') {
    // the start order is the reverse of correct: walk each item up to its place
    for (let target = 0; target < s.exercise.correctOrder.length; target++) {
      for (let pass = 0; pass < s.exercise.correctOrder.length; pass++) {
        const rows = m.querySelectorAll('.order-item');
        const want = s.exercise.correctOrder[target];
        const at = rows.findIndex((r) => text(r).includes(byLabel(s, want)));
        if (at <= target) break;
        rows[at].querySelectorAll('.mini').find((b) => text(b) === '↑').click();
      }
    }
    m.querySelectorAll('BUTTON').find((b) => text(b).includes(T.checkOrder)).click();
  } else if (type === 'builder') {
    for (const part of s.exercise.correctCommand.split(' ')) {
      const btn = m.querySelectorAll('.part').find((b) => text(b) === part && !b.disabled);
      if (btn) btn.click();
    }
    m.querySelectorAll('BUTTON').find((b) => text(b).includes(T.checkCommand)).click();
  } else if (type === 'scenario') {
    for (let step = 0; step < s.exercise.steps.length; step++) {
      const best = s.exercise.steps[step].options.find((o) => o.result === 'positive') || s.exercise.steps[step].options[0];
      const btn = m.querySelectorAll('.opt').find((b) => text(b) === best.text && !b.disabled);
      if (btn) btn.click();
      const nxt = m.querySelectorAll('BUTTON').filter((b) => text(b).includes(T.nextStep || 'Next step') || text(b).includes(T.seeResult || 'See the result')).pop();
      if (nxt) nxt.click();
    }
  } else if (type === 'quiz') {
    for (let q = 0; q < s.quiz.length; q++) {
      const want = s.quiz[q].options[s.quiz[q].correctAnswer];
      const btn = m.querySelectorAll('.opt').find((b) => text(b) === want && !b.disabled);
      if (btn) btn.click();
      const nxt = m.querySelectorAll('BUTTON').filter((b) => text(b).includes(T.nextQuestion || 'Next question') || text(b).includes(T.seeResult || 'See the result')).pop();
      if (nxt) nxt.click();
    }
  }
  if (type !== 'quiz' && s.quiz && s.quiz.length) return completeSecondaryQuiz(s);
  return null;
}
const byLabel = (s, id) => (s.exercise.items.find((it) => it.id === id) || {}).label || id;

// The assertion is on STATE, twice over: the re-rendered score pill AND the PERSISTED localStorage
// record (Codex QE #4 — prose alone would pass on a runtime that printed encouragement and stored
// nothing; the shim owns the storage Map, so the persisted truth is directly inspectable).
const STORAGE_KEY = 'dz-course:' + (course.courseTitle || 'course');
const persistedState = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } };
for (const s of orderedSections) {
  const secondary = completeSection(s);
  openSection(s.shortTitle);                      // re-render so the stored score is displayed
  const pill = main().querySelectorAll('.score-pill').map(text).find((x) => x.indexOf(T.completed) === 0);
  const scored = pill ? Number((pill.match(/(\d+)%/) || [])[1]) : -1;
  const st = persistedState();
  const stored = st && st.completed && st.completed[s.id] === true && st.scores && st.scores[s.id] === 100;
  const secondaryOk = !secondary || secondary.clicked === secondary.total;
  const good = scored === 100 && stored && secondaryOk;
  (good ? ok : bad)(`exercise.${s.id}.completable`,
    good ? `${s.interactiveType} driven to a rendered AND persisted 100% by clicks alone${secondary ? ` (+ secondary quiz ${secondary.clicked}/${secondary.total})` : ''}`
         : `${s.interactiveType}: rendered=${scored < 0 ? 'none' : scored + '%'} persisted=${stored}${secondary ? ` secondaryQuizClicked=${secondary.clicked}/${secondary.total}` : ''}`);
}

// achievement-condition evaluator shared by assertions 5 and 6
const sectionIdSet = new Set(course.sections.map((s) => s.id));
const satisfiable = (a, afterFinal) => {
  const c = a.conditionRef || {};
  if (c.type === 'sections-completed') return typeof c.n === 'number' && c.n >= 0 && c.n <= course.sections.length;
  if (c.type === 'all-sections' || c.type === 'perfect-section') return true; // we drive every section to 100
  if (c.type === 'section-group') return Array.isArray(c.ids) && c.ids.length > 0 && c.ids.every((id) => sectionIdSet.has(id));
  if (c.type === 'final-test-pass') return afterFinal; // only after a perfect final run
  return false; // unknown condition type: never counted as expected
};
const expectAfterSections = course.achievements.filter((a) => satisfiable(a, false));
const expectAfterFinal = course.achievements.filter((a) => satisfiable(a, true));
const unsatisfiable = course.achievements.filter((a) => !satisfiable(a, true)).map((a) => a.id);

// 5. progress reaches 100% and the completion achievements unlocked
{
  const pct = progressPct();
  (pct === 100 ? ok : bad)('progress.reaches-100', `sidebar progress = ${pct}%`);
  const label = text(aside().querySelector('.navhead'));
  const unlocked = (text(aside()).match(achRe) || [])[1];
  // Expected count is EVALUATED per condition against the driven state (all sections perfect,
  // final not yet taken) — not merely bucketed by type (Codex QE #9): a sections-completed n above
  // the section count or a section-group naming an absent id is UNSATISFIABLE and must not be
  // silently expected (they are reported loudly instead).
  // An achievement the course PROMISES but can never unlock is a defect, not a footnote — it must
  // turn the verdict red (Codex QE round-2 #9).
  const good = Number(unlocked) >= expectAfterSections.length && unsatisfiable.length === 0;
  const unsat = unsatisfiable.length ? ` — UNSATISFIABLE promised achievement(s): ${unsatisfiable.join(', ')}` : '';
  (good ? ok : bad)('achievements.unlock', `${unlocked} / ${course.achievements.length} unlocked after completing every section (expected >= ${expectAfterSections.length})${unsat}`);
  void label;
}

// 6. the final test renders one question per section and can be passed
{
  const b = navButtons().find((n) => text(n).includes(T.finalTest));
  b.click();
  const m = main();
  for (let q = 0; q < orderedSections.length; q++) {           // runtime asks in `order` order
    const ft = orderedSections[q].finalTest;
    const want = ft.options[ft.correctAnswer];
    const btn = m.querySelectorAll('.opt').find((x) => text(x) === want && !x.disabled);
    if (btn) btn.click();
    const nxt = m.querySelectorAll('BUTTON').filter((x) => text(x).includes(T.nextQuestion || 'Next question') || text(x).includes(T.seeResult || 'See the result')).pop();
    if (nxt) nxt.click();
  }
  const t = text(m);
  const stFinal = persistedState();
  const passed = t.includes('100%') && t.includes(T.passed) && stFinal.finalScore === 100;
  (passed ? ok : bad)('finaltest.passable', passed
    ? `all ${orderedSections.length} answered correctly → rendered AND persisted 100%, PASSED`
    : `final test did not record a pass on all-correct answers (persisted finalScore=${stFinal.finalScore})`);
  const allAch = (text(aside()).match(achRe) || [])[1];
  const good = Number(allAch) === expectAfterFinal.length && unsatisfiable.length === 0;
  const unsat = unsatisfiable.length ? ` — UNSATISFIABLE promised achievement(s): ${unsatisfiable.join(', ')}` : '';
  (good ? ok : bad)('achievements.all-unlockable', `${allAch} / ${course.achievements.length} after a perfect run (expected ${expectAfterFinal.length})${unsat}`);
}

// 6b. Reset actually resets — rendered progress AND the persisted record (a shared blank template
// mutated through live state silently turns Reset into a no-op; Codex QE #6).
{
  const rb = aside().querySelectorAll('BUTTON').concat(main().querySelectorAll('BUTTON')).find((x) => text(x).includes(T.reset));
  if (!rb) {
    bad('reset.works', 'no Reset button found');
  } else {
    rb.click();                                   // window.confirm shim answers true
    const st = persistedState();
    // EVERY progress facet must clear — completed, scores, unlocked, finalScore (round-2 #16:
    // a reset that keeps scores/achievements while clearing completion would otherwise pass)
    const cleared = Object.keys(st.completed || {}).length === 0
      && Object.keys(st.scores || {}).length === 0
      && (st.unlocked || []).length === 0
      && st.finalScore == null;
    const pct = progressPct();
    (cleared && pct === 0 ? ok : bad)('reset.works',
      cleared && pct === 0 ? 'reset cleared rendered progress and every persisted facet (completed/scores/unlocked/finalScore)'
                           : `after reset: progress=${pct}% completed=${Object.keys(st.completed || {}).length} scores=${Object.keys(st.scores || {}).length} unlocked=${(st.unlocked || []).length} finalScore=${st.finalScore}`);
  }
}

// 7. the FAQ accordion renders every entry
{
  const b = navButtons().find((n) => text(n).includes(T.faqNav));
  b.click();
  const details = main().querySelectorAll('DETAILS');
  const good = details.length === course.faqData.length;
  (good ? ok : bad)('faq.renders-all', `${details.length} / ${course.faqData.length} FAQ entries`);
}

// 8. self-containment, scoped honestly (Codex QE #10): markup references are scanned OUTSIDE the
// inert JSON data block (authored prose may legitimately mention a URL), and the runtime JS is
// additionally scanned for network-capable APIs. This is a STATIC scan — it proves the emitted
// artifact declares no external loads, not that arbitrary future code cannot construct one.
{
  // A URL as inert TEXT (e.g. in the meta description or prose) is not an external load — only
  // load-bearing constructs count: src= attributes, <link href>, css url(), @import (round-2 #10).
  // An <a href> NAVIGATION anchor loads nothing at render time and is deliberately NOT counted —
  // the footer's channel links are navigation, and counting them would conflate "self-contained
  // runtime" with "no outbound links", two different properties.
  const htmlSansData = html.replace(jsonMatch[0], '');
  const refs = (htmlSansData.match(/\ssrc=|url\(|@import|<link\b[^>]*\shref=/gi) || []);
  const netApis = (appJs.match(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|navigator\.serviceWorker)\b|\bimport\s*\(/g) || []);
  const cleanRefs = refs.length === 0;
  const cleanApis = netApis.length === 0;
  (cleanRefs && cleanApis ? ok : bad)('site.self-contained',
    cleanRefs && cleanApis
      ? 'zero external LOADS outside the data block (navigation anchors excluded by design); runtime uses no network APIs'
      : `${refs.length} external load(s) ${refs.slice(0, 3).join(' ')}; ${netApis.length} network API use(s) ${[...new Set(netApis)].slice(0, 3).join(' ')}`);
}

// 8b. diagrams: a declared diagram must actually APPEAR when the page runs, carry every label, and
// never turn an author's text into markup. The last part is the one that matters: cross-model review
// measured a hand-written SVG reaching the network through `<image href>` while this verifier stayed
// green, so the design removed author markup entirely — and this check is what keeps it removed. It
// goes red the day someone swaps the text insertion for an HTML one.
{
  const withDiagram = course.sections.filter((s) => s.diagram && Array.isArray(s.diagram.nodes));
  if (withDiagram.length === 0) {
    ok('diagram.renders', 'course declares no diagram — nothing to draw (a diagram is optional)');
  } else {
    const problems = [];
    for (const s of withDiagram) {
      openSection(s.shortTitle);
      const figs = main().querySelectorAll('FIGURE').filter((f) => f.classList.contains('diagram'));
      if (figs.length !== 1) { problems.push(`${s.id}: expected exactly 1 diagram figure, saw ${figs.length}`); continue; }
      const t = text(figs[0]);
      for (const n of s.diagram.nodes) {
        if (!t.includes(String(n.label))) problems.push(`${s.id}: label ${JSON.stringify(n.label)} absent from the rendered figure`);
      }
      if (s.diagram.title && !t.includes(String(s.diagram.title))) problems.push(`${s.id}: caption absent`);
      // Each kind draws its nodes in its own element class; counting only `dg-node` would silently
      // pass a compare/scale diagram that rendered zero nodes.
      const nodeBoxes = figs[0].querySelectorAll('DIV').filter((d) => d.classList.contains('dg-node') || d.classList.contains('dg-col') || d.classList.contains('dg-rung'));
      if (nodeBoxes.length !== s.diagram.nodes.length) problems.push(`${s.id}: ${nodeBoxes.length} boxes for ${s.diagram.nodes.length} nodes`);
      // markup in a label must remain letters: the guard is the insertion path, not a filter
      for (const box of nodeBoxes) {
        if (box.innerHTML !== '' && /<[a-z]/i.test(box.innerHTML)) problems.push(`${s.id}: a node box carries raw markup — labels must go in as TEXT`);
      }
    }
    (problems.length === 0 ? ok : bad)('diagram.renders', problems.length === 0
      ? `${withDiagram.length} diagram(s) drawn with every label and caption; no label became markup`
      : problems.slice(0, 4).join(' · '));
  }
}

// 9. footer: the site carries its channel links — every anchor is https and none is javascript:.
{
  const footerMatch = html.match(/<footer id="site-footer">([\s\S]*?)<\/footer>/);
  const anchors = footerMatch ? (footerMatch[1].match(/<a\s[^>]*href="([^"]+)"/g) || []) : [];
  const hrefs = anchors.map((a) => (a.match(/href="([^"]+)"/) || [])[1]).filter(Boolean);
  const allHttps = hrefs.length > 0 && hrefs.every((h) => /^https:\/\//.test(h));
  (footerMatch && allHttps ? ok : bad)('footer.renders',
    footerMatch && allHttps
      ? `footer present with ${hrefs.length} https link(s): ${hrefs.join(' ')}`
      : footerMatch ? `footer present but links are not all https: ${hrefs.join(' ') || '(none)'}` : 'no <footer id="site-footer"> in the emitted page');
}

} catch (e) {
  bad('verifier.crashed', e.message + ' @ ' + ((e.stack || '').split('\n')[1] || '').trim());
}

report();

function report() {
  const line = '─'.repeat(70);
  console.log(line);
  console.log('verify-site — the generated SPA was EXECUTED and driven, not just parsed');
  console.log(line);
  for (const r of results) console.log(`  ${r.pass ? 'ok  ' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  const failures = results.filter((r) => !r.pass);
  console.log(line);
  console.log(failures.length === 0
    ? `PASS — ${results.length} behavioural checks hold.`
    : `FAIL — ${failures.length}/${results.length} behavioural checks broken.`);
  console.log(line);
  process.exit(failures.length === 0 ? 0 : 1);
}
