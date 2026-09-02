#!/usr/bin/env node
// render-site — the factory's OWN executable renderer: gated course.json → one self-contained,
// dependency-free HTML file (opens over file://, no CDN, no network).
//
// WHY THIS LIVES HERE (dogfood finding F2): modules/05-render.md used to say "delegate to
// edu-site-generator" — but that is an agent SKILL (a model hand-writes a React/Vite project);
// nothing programmatic consumes course.json. This renderer is the deterministic seam: it maps the
// gated course object onto the same edu-site primitives (sections / 6 exercise types / per-section
// quiz / achievements / final test / FAQ / progress) with zero model involvement, so
// brief → gate → render → verify is executable end to end. Born in the first production course
// (features/harness-cli-course/ — that copy stays frozen as the origin); canonical home is here.
//
// CONTRACT: the input is a course.json that PASSED scripts/headfirst-gate.mjs. The renderer still
// fails LOUDLY on a non-course shape (never a blank page), but the gate is the real validator.
//
//   node scripts/render-site.mjs [--course course.json] [--out <course-dir>/site/index.html]
//
// node builtins only; deterministic (no Date/random in the output — same course, same bytes).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampSource } from './course-source-stamp.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const coursePath = resolve(opt('course', 'course.json'));
const outPath = resolve(opt('out', join(dirname(coursePath), 'site', 'index.html')));

if (!argv.includes('--no-stamp')) {
  stampSource(coursePath, { package: opt('package', undefined) });
}

const course = JSON.parse(readFileSync(coursePath, 'utf-8'));

// Loud minimal shape check — a wrong file must die with a named reason, not render a blank shell.
const shapeErrors = [];
if (typeof course.courseTitle !== 'string' || !course.courseTitle.trim()) shapeErrors.push('courseTitle missing/blank');
if (!course.persona || typeof course.persona.name !== 'string' || !course.persona.name.trim()) shapeErrors.push('persona.name missing (gate property D1)');
if (!Array.isArray(course.sections) || course.sections.length === 0) shapeErrors.push('sections missing/empty');
if (!Array.isArray(course.achievements)) shapeErrors.push('achievements missing');
if (!Array.isArray(course.faqData)) shapeErrors.push('faqData missing');
// Per-section minimums (Codex QE #11): `sections:[{}]` must die with named reasons here, not render
// a page that crashes or shows `undefined`. The headfirst gate stays the REAL validator.
const KNOWN_TYPES = new Set(['quiz', 'flashcards', 'matching', 'drag-and-drop', 'ordering', 'builder', 'scenario', 'simulation']);
if (Array.isArray(course.sections)) {
  course.sections.forEach((s, i) => {
    const at = `sections[${i}]`;
    if (!s || typeof s !== 'object') { shapeErrors.push(`${at} is not an object`); return; }
    if (typeof s.id !== 'string' || !s.id.trim()) shapeErrors.push(`${at}.id missing`);
    if (typeof s.title !== 'string' || !s.title.trim() || typeof s.shortTitle !== 'string' || !s.shortTitle.trim()) shapeErrors.push(`${at}.title/shortTitle missing`);
    if (typeof s.theory !== 'string' || !s.theory.trim()) shapeErrors.push(`${at}.theory missing/blank`);
    if (!KNOWN_TYPES.has(s.interactiveType)) shapeErrors.push(`${at}.interactiveType unknown: ${JSON.stringify(s.interactiveType)}`);
    if (!s.finalTest || !Array.isArray(s.finalTest.options) || typeof s.finalTest.correctAnswer !== 'number') shapeErrors.push(`${at}.finalTest malformed`);
    if (!s.reflection || typeof s.reflection !== 'object') shapeErrors.push(`${at}.reflection missing`);
    // per-type exercise payload — a section that renders then crashes the runtime is a blank page
    // with extra steps (Codex QE round-2 #11)
    const t = ({ ordering: 'drag-and-drop', simulation: 'scenario' })[s.interactiveType] || s.interactiveType;
    const ex = s.exercise || {};
    if (t === 'quiz') { if (!Array.isArray(s.quiz) || s.quiz.length === 0) shapeErrors.push(`${at}.quiz missing/empty for a quiz section`); }
    else if (t === 'flashcards') { if (!Array.isArray(ex.cards) || ex.cards.length === 0) shapeErrors.push(`${at}.exercise.cards missing/empty`); }
    else if (t === 'matching') { if (!Array.isArray(ex.pairs) || ex.pairs.length === 0) shapeErrors.push(`${at}.exercise.pairs missing/empty`); }
    else if (t === 'drag-and-drop') { if (!Array.isArray(ex.items) || ex.items.length === 0 || !Array.isArray(ex.correctOrder)) shapeErrors.push(`${at}.exercise.items/correctOrder missing`); }
    else if (t === 'builder') { if (!Array.isArray(ex.parts) || ex.parts.length === 0 || typeof ex.correctCommand !== 'string') shapeErrors.push(`${at}.exercise.parts/correctCommand missing`); }
    else if (t === 'scenario') { if (!Array.isArray(ex.steps) || ex.steps.length === 0) shapeErrors.push(`${at}.exercise.steps missing/empty`); }
  });
}
if (shapeErrors.length) {
  console.error(`render-site: ${coursePath} is not a gated course object — ${shapeErrors.join('; ')}`);
  process.exit(1);
}

// The embedded payload is the course object verbatim — the site is a VIEW of the gated data,
// never a second source of truth. JSON is escaped so it can never break out of the script tag.
const payload = JSON.stringify(course)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

// Quote escaping matters: esc() output lands in ATTRIBUTE values (lang, content) — an unescaped
// quote there is an attribute-injection hole even with < > handled (Codex QE #2).
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const CSS = String.raw`
:root{
  --bg:#f7f7f5; --panel:#ffffff; --ink:#191917; --muted:#6b6b63; --line:#e2e2dc;
  --accent:#c1502e; --accent-soft:#fdf0eb; --ok:#2f7d5d; --bad:#b4402c; --warn:#a2702a;
  --paper:#fffbef; --paper-line:#e6dcc0;
  --code-bg:#f0efeb; --shadow:0 1px 2px rgba(0,0,0,.05),0 8px 24px -12px rgba(0,0,0,.18);
  --radius:12px; --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  --sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
html.dark{
  --bg:#15150f; --panel:#1e1e1a; --ink:#eeeee6; --muted:#9d9d92; --line:#33332c;
  --accent:#e8825c; --accent-soft:#2e211b; --ok:#6cc79b; --bad:#e2765d; --warn:#d5a35a;
  --paper:#221f17; --paper-line:#40382a;
  --code-bg:#26261f; --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px -12px rgba(0,0,0,.6);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.65;font-size:16px}
a{color:var(--accent)}
code{font-family:var(--mono);font-size:.88em;background:var(--code-bg);padding:.12em .38em;border-radius:5px}
pre{background:var(--code-bg);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;overflow-x:auto;font-family:var(--mono);font-size:13.5px;line-height:1.55}
pre code{background:none;padding:0;font-size:inherit}
.layout{display:grid;grid-template-columns:296px 1fr;min-height:100vh}
aside{background:var(--panel);border-right:1px solid var(--line);padding:20px 16px 40px;position:sticky;top:0;height:100vh;overflow-y:auto}
main{padding:34px 40px 96px;max-width:940px;width:100%}
.brand{font-weight:700;font-size:15px;letter-spacing:-.01em;margin-bottom:4px}
.brand small{display:block;font-weight:400;color:var(--muted);font-size:12.5px;letter-spacing:0;margin-top:4px}
.progress-wrap{margin:18px 0 14px}
.bar{height:8px;background:var(--line);border-radius:99px;overflow:hidden}
.bar>i{display:block;height:100%;background:var(--accent);border-radius:99px;transition:width .45s cubic-bezier(.2,.8,.3,1)}
.progress-label{font-size:12px;color:var(--muted);margin-top:6px;display:flex;justify-content:space-between}
nav ul{list-style:none;margin:0;padding:0}
nav li{margin:1px 0}
nav button{width:100%;text-align:left;background:none;border:0;padding:8px 10px;border-radius:9px;cursor:pointer;color:var(--ink);font:inherit;font-size:13.5px;display:flex;gap:9px;align-items:center}
nav button:hover{background:var(--accent-soft)}
nav button[aria-current="true"]{background:var(--accent-soft);color:var(--accent);font-weight:600}
nav .tick{font-size:12px;color:var(--ok);width:14px;flex:0 0 14px}
.navhead{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:18px 0 7px;font-weight:600}
.ach-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.ach{aspect-ratio:1;display:grid;place-items:center;font-size:17px;border:1px solid var(--line);border-radius:9px;background:var(--bg);opacity:.32;cursor:help;filter:grayscale(1)}
.ach.on{opacity:1;filter:none;border-color:var(--accent);background:var(--accent-soft)}
.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);font-weight:700}
h1{font-size:33px;line-height:1.18;letter-spacing:-.022em;margin:.28em 0 .18em}
h2{font-size:20px;letter-spacing:-.012em;margin:2em 0 .5em}
.lede{color:var(--muted);font-size:16.5px;margin-bottom:22px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:22px 24px;box-shadow:var(--shadow);margin:20px 0}
.theory p{margin:0 0 1.05em}
.theory ol{padding-left:1.3em}
.theory li{margin:.35em 0}
.pattern-chip{display:inline-block;font-family:var(--mono);font-size:11.5px;background:var(--accent-soft);color:var(--accent);border:1px solid var(--accent);border-radius:99px;padding:2px 9px;font-weight:600}
.meta-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px}
/* the persona's notebook — an optional recurring visual device (one margin note per section,
   in the persona's own voice). Deliberately unlike .reflect: warm paper, torn-in edge, a slight tilt,
   ruled lines. It is how the reader SEES the character change across the sections. */
.notebook{position:relative;margin:22px 0;padding:15px 22px 16px;background:var(--paper);
  border:1px solid var(--paper-line);border-left:5px solid var(--accent);
  border-radius:3px 14px 14px 3px;box-shadow:var(--shadow);transform:rotate(-.32deg)}
.notebook::after{content:"";position:absolute;left:0;right:0;bottom:0;top:44px;pointer-events:none;
  background:repeating-linear-gradient(to bottom,transparent 0,transparent 25px,var(--paper-line) 25px,var(--paper-line) 26px);opacity:.5}
.notebook h3{display:flex;flex-wrap:wrap;gap:9px;align-items:baseline;margin:0 0 9px;font-size:12px;
  text-transform:uppercase;letter-spacing:.09em;color:var(--muted)}
.notebook .when{font-family:var(--mono);font-size:11px;letter-spacing:0;text-transform:none;
  color:var(--accent);border:1px solid var(--accent);border-radius:99px;padding:1px 9px}
.notebook p{position:relative;z-index:1;margin:0;font-size:15.5px;line-height:1.62;font-style:italic}
.notebook p::before{content:"\201C"}
.notebook p::after{content:"\201D"}
.reflect{border-left:3px solid var(--accent);background:var(--accent-soft);border-radius:0 var(--radius) var(--radius) 0;padding:16px 20px;margin:22px 0}
.reflect h3{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--accent)}
.reflect dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:14.5px}
.reflect dt{font-weight:700;color:var(--muted);white-space:nowrap}
.reflect dd{margin:0}
button.btn{font:inherit;font-size:14px;font-weight:600;background:var(--accent);color:#fff;border:0;border-radius:9px;padding:9px 17px;cursor:pointer}
button.btn:hover{filter:brightness(1.07)}
button.btn[disabled]{opacity:.45;cursor:not-allowed;filter:none}
button.ghost{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
.opt{display:block;width:100%;text-align:left;font:inherit;font-size:14.5px;background:var(--panel);border:1.5px solid var(--line);border-radius:10px;padding:11px 14px;margin:7px 0;cursor:pointer;color:var(--ink)}
.opt:hover{border-color:var(--accent)}
.opt.correct{border-color:var(--ok);background:color-mix(in srgb,var(--ok) 11%,transparent)}
.opt.wrong{border-color:var(--bad);background:color-mix(in srgb,var(--bad) 11%,transparent)}
.opt.chosen{font-weight:600}
.opt[disabled]{cursor:default}
.explain{font-size:14px;border-radius:9px;padding:11px 14px;margin:8px 0 4px;background:var(--code-bg);border-left:3px solid var(--muted)}
.explain.good{border-color:var(--ok)}
.explain.bad{border-color:var(--bad)}
.explain.mid{border-color:var(--warn)}
.flash{perspective:1200px;margin:16px 0}
.flash-inner{position:relative;min-height:172px;border:1.5px solid var(--line);border-radius:var(--radius);background:var(--panel);display:grid;place-items:center;padding:26px;text-align:center;cursor:pointer;font-size:17px;transition:transform .12s}
.flash-inner:active{transform:scale(.995)}
.flash-inner .side{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);position:absolute;top:11px;left:14px}
.row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.spacer{flex:1}
.match-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:14px}
.chip{display:block;width:100%;text-align:left;font:inherit;font-size:14px;background:var(--panel);border:1.5px solid var(--line);border-radius:9px;padding:10px 13px;margin:6px 0;cursor:pointer;color:var(--ink)}
.chip.sel{border-color:var(--accent);background:var(--accent-soft)}
.chip.done{border-color:var(--ok);background:color-mix(in srgb,var(--ok) 11%,transparent);cursor:default;opacity:.75}
.chip.miss{animation:shake .3s}
@keyframes shake{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
.order-item{display:flex;align-items:center;gap:10px;background:var(--panel);border:1.5px solid var(--line);border-radius:9px;padding:9px 12px;margin:6px 0;font-size:14.5px}
.order-item .grab{cursor:grab;color:var(--muted);font-size:13px;letter-spacing:-2px}
.order-item.ok{border-color:var(--ok)}
.order-item.no{border-color:var(--bad)}
.order-item .idx{font-family:var(--mono);font-size:12px;color:var(--muted);width:18px}
.mini{background:none;border:1px solid var(--line);border-radius:7px;width:26px;height:26px;cursor:pointer;color:var(--ink);font-size:12px;line-height:1}
.mini:hover{border-color:var(--accent);color:var(--accent)}
.build-line{font-family:var(--mono);font-size:14px;background:var(--code-bg);border:1.5px dashed var(--line);border-radius:9px;padding:13px 15px;min-height:48px;display:flex;flex-wrap:wrap;gap:7px;align-items:center}
.build-line .tok{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:2px 8px;cursor:pointer}
.part{font-family:var(--mono);font-size:13.5px;background:var(--panel);border:1.5px solid var(--line);border-radius:8px;padding:6px 11px;cursor:pointer;color:var(--ink)}
.part:hover{border-color:var(--accent)}
.part[disabled]{opacity:.35;cursor:not-allowed}
.hint{font-size:13.5px;color:var(--muted);margin:7px 0 0;padding-left:20px;position:relative}
.hint::before{content:"💡";position:absolute;left:0}
.faq details{border:1px solid var(--line);border-radius:10px;background:var(--panel);margin:8px 0;padding:0 16px}
.faq summary{cursor:pointer;padding:13px 0;font-weight:600;font-size:15px;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq summary::before{content:"▸ ";color:var(--accent)}
.faq details[open] summary::before{content:"▾ "}
.faq .a{padding:0 0 14px;font-size:14.5px;color:var(--muted)}
.toast{position:fixed;right:22px;bottom:22px;background:var(--panel);border:1.5px solid var(--accent);border-radius:12px;box-shadow:var(--shadow);padding:13px 17px;display:flex;gap:12px;align-items:center;max-width:340px;z-index:50;animation:pop .35s cubic-bezier(.2,1.3,.4,1)}
@keyframes pop{from{transform:translateY(14px) scale(.96);opacity:0}}
.toast .ic{font-size:24px}
.toast b{display:block;font-size:14.5px}
.toast small{color:var(--muted);font-size:12.5px}
.score-pill{font-family:var(--mono);font-size:12.5px;border:1px solid var(--line);border-radius:99px;padding:2px 10px;color:var(--muted)}
.score-pill.good{border-color:var(--ok);color:var(--ok)}
.big-score{font-size:52px;font-weight:800;letter-spacing:-.03em;line-height:1}
/* diagram: flex row on wide screens, column on a phone; colours come from the theme tokens, so
   dark mode needs no second rule and the figure can never fight the page it sits on. */
.diagram{margin:22px 0 26px;padding:18px 16px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius)}
.dg-track{display:flex;flex-wrap:wrap;align-items:stretch;gap:10px}
.dg-node{flex:1 1 130px;min-width:120px;background:var(--bg);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;padding:10px 12px}
.dg-node b{display:block;font-size:14px;letter-spacing:.01em}
.dg-node small{display:block;margin-top:4px;color:var(--muted);font-size:12.5px;line-height:1.45}
.dg-arrow{align-self:center;color:var(--accent);font-size:18px;line-height:1;flex:0 0 auto}
.dg-cycle{align-self:center;color:var(--muted);font-size:12.5px;font-style:italic;flex:0 0 auto}
/* compare — columns of options; on a phone they stack and read as a list */
.dg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.dg-col{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px}
.dg-col b{display:block;font-size:14px}
.dg-col small{display:block;margin-top:4px;color:var(--muted);font-size:12.5px;line-height:1.45}
.dg-items{margin:8px 0 0;padding-left:16px;font-size:12.5px;color:var(--muted);line-height:1.6}
.dg-items li{margin:2px 0}
/* scale — rungs where vertical POSITION is the meaning; the accent marks the load-bearing rung */
.dg-scale-wrap{display:flex;flex-direction:column;gap:6px}
.dg-rung{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 12px}
.dg-rung-n{font-family:var(--mono);font-size:12px;color:var(--muted);min-width:1.4em}
.dg-rung b{font-size:14px}
.dg-rung small{flex:1 1 100%;color:var(--muted);font-size:12.5px;line-height:1.45;margin-top:2px}
.dg-edge{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;padding:0 2px}
/* parts — a whole above, its required parts joined by + below */
.dg-parts-wrap{display:flex;flex-direction:column;gap:9px}
.dg-whole{font-weight:600;font-size:14px;padding:8px 12px;background:var(--accent-soft);border-radius:8px;text-align:center}
.dg-plus{align-self:center;color:var(--accent);font-size:17px;flex:0 0 auto}
.dg-accent{border-color:var(--accent)}
.diagram figcaption{margin-top:12px;color:var(--muted);font-size:13px;text-align:center}
@media (max-width:640px){.dg-track{flex-direction:column}.dg-arrow{align-self:flex-start;transform:rotate(90deg);margin-left:14px}}
.footer-nav{display:flex;gap:10px;margin-top:30px;padding-top:22px;border-top:1px solid var(--line)}
#site-footer{padding:18px 24px;border-top:1px solid var(--line);background:var(--panel);text-align:center;font-size:13px}
#site-footer a{color:var(--accent);text-decoration:none}
#site-footer a:hover{text-decoration:underline}
#site-footer .footer-sep{margin:0 10px;color:var(--muted)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (max-width:900px){.layout{grid-template-columns:1fr}aside{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}main{padding:24px 18px 80px}.match-grid{grid-template-columns:1fr}h1{font-size:26px}}
`;

// The app runtime lives in its own file so `node --check app.src.js` is a REAL syntax gate.
// (It exists because the first version embedded the JS in a template literal, where a stray
// backtick and an un-raw escape silently corrupted every regex — invisible until the browser ran it.)
const JS = readFileSync(join(__dirname, 'app.src.js'), 'utf-8');
// Defence in depth: nothing in the payload or the runtime may close the inline <script> element.
if (/<\/script/i.test(JS) || /<\/script/i.test(payload)) {
  throw new Error('render-site: content would close the inline <script> element — refusing to emit');
}

// UI locale: the chrome strings live HERE, in one place. The runtime (app.src.js) and the
// verifier (verify-site.mjs) both read the embedded #ui-strings block, so the three can never
// drift apart. course.language 'ru' selects Russian chrome; anything else keeps English.
// dz commands themselves are never translated — they are the one legitimate anglicism.
const UI_RU = {
  achievement: 'Достижение — ', locked: 'Закрыто: ',
  flashHint: 'Нажми на карточку, чтобы перевернуть её. Просмотри все карточки, чтобы закрыть раздел.',
  sideFront: 'лицо', sideBack: 'оборот', seen: 'просмотрено',
  prev: '← Назад', next: 'Дальше →',
  matchHint: 'Выбери элемент слева, затем его пару справа.', matched: 'совпало',
  moveUp: 'Выше', moveDown: 'Ниже',
  orderRight: 'Точно — именно в таком порядке это и происходит.',
  orderPartial: '{n} из {len} на своём месте. Зелёные строки верны; переставь остальные.',
  checkOrder: 'Проверить порядок',
  builderEmpty: 'собери команду из частей ниже…',
  builderCorrect: 'Верно — ровно эта команда.', builderNot: 'Пока нет — ты собрал: ', nothing: '(пусто)',
  checkCommand: 'Проверить команду', clear: 'Очистить',
  scenarioDone: 'Сценарий пройден — {p} из {n} решений были сильнейшим доступным вариантом.',
  step: 'Шаг {i} из {n}', seeResult: 'К результату →', nextStep: 'Следующий шаг →',
  quiz: 'Викторина', quizComplete: '{label}: готово — {r} / {n} верно ({p}%).', tryAgain: 'Ещё раз',
  question: 'Вопрос {i} из {n}', nextQuestion: 'Следующий вопрос →',
  brandTag: 'курс в стиле Head First · разделов: {n}', sectionsOf: '{c} / {n} разделов',
  startHere: 'Начни здесь', finalTest: 'Финальный тест', faqNav: 'Частые вопросы',
  achievements: 'Достижения — ', settings: 'Настройки',
  light: '☀️ Светлая', dark: '🌙 Тёмная', resetConfirm: 'Сбросить весь прогресс?', reset: '↺ Сброс',
  sectionOf: 'Раздел {o} из {n}',
  patternTitle: 'паттерн Head First, которому служит этот раздел (id в метод-KB)',
  patternNames: {
    P1: 'P1 · Сначала образ: понятие ведёт картинка или схема, слова живут внутри неё',
    P2: 'P2 · Избыточность: ключевая идея закодирована трижды — текст, упражнение, проверка',
    P3: 'P3 · Разговорный тон: напрямую к читателю, без лекторской сухости',
    P4: 'P4 · Неожиданность: поворот или «ага-момент», чтобы мысль запомнилась',
    P5: 'P5 · Сделай сам: к каждой идее — действие; понимание строится руками',
    P6: 'P6 · Несколько представлений: общая картина + шаги + конкретный артефакт',
    P7: 'P7 · Разнообразие: тип активности сменяется от раздела к разделу',
    P8: 'P8 · Истории и выбор: материал как история, читатель взвешивает и решает',
    P9: 'P9 · Открытые вопросы: вопрос без готового ответа — инсайт добывается работой',
    P10: 'P10 · Люди, не абстракции: материал держится на живом персонаже',
    P11: 'P11 · Метапознание: читателя побуждают следить за собственным пониманием',
    P12: 'P12 · Врезки — это суть: отступления и FAQ обязательны, а не украшение',
    D1: 'D1 · Сквозной персонаж: одна героиня проходит через весь курс',
    D2: 'D2 · Рефлексивная четвёрка: сильное/слабое/оценка/итог в конце темы',
    D3: 'D3 · Реши сам: раздел, где решения принимает читатель',
    D4: 'D4 · Открытый синтез: задача без единственно верного ответа',
  },
  completed: 'пройдено · ',
  notebookOf: '{name} — блокнот', notebook: 'Блокнот',
  quartet: 'Рефлексивная четвёрка', strengths: 'Сильное', weaknesses: 'Слабое', rating: 'Оценка', wrapup: 'Итог',
  doSomething: 'Сделай сам — ', checkYourself: 'Проверь себя', check: 'Проверка',
  types: { flashcards: 'карточки', matching: 'сопоставление', 'drag-and-drop': 'порядок шагов', ordering: 'порядок шагов', builder: 'конструктор команды', scenario: 'сценарий', simulation: 'сценарий', quiz: 'викторина' },
  meet: 'Знакомься: ', whatYouLearn: 'Чему ты научишься', startSection1: 'Начать раздел 1 →',
  finalH1: 'По одному вопросу с каждого раздела',
  finalLede: 'Порог — {p}%. Вопросов: {n}, по одному из каждого пройденного раздела.',
  fromSection: 'Из раздела {o} — {t}.',
  passed: 'Пройдено — ', courseComplete: 'курс завершён.',
  notYet: 'Пока нет — порог {p}%.',
  revisit: 'Возвращайся к любому разделу через меню, когда он понадобится.',
  reread: 'Перечитай разделы, на вопросах которых ошибся, и попробуй ещё раз.',
  lastSection: '← Последний раздел',
  faqEyebrow: 'Врезки — это суть', faqH1: 'Вопросы, которые у тебя вот-вот появятся',
  faqLede: 'Это не украшение: каждый вопрос — реальная ловушка, в которую кто-то уже попал.',
};
const uiStrings = (String(course.language || 'en').toLowerCase() === 'ru') ? UI_RU : null;
const uiPayload = uiStrings ? JSON.stringify(uiStrings) : 'null';
if (/<\/script/i.test(uiPayload)) {
  throw new Error('render-site: ui-strings would close the inline <script> element — refusing to emit');
}

// Footer links: course.footer.links overrides; default = the workshop's public channels.
// Navigation anchors only (<a href>) — they are NOT external loads, and verify-site's
// self-contained check deliberately counts loads (src/url()/@import/<link href>), not navigation.
const DEFAULT_FOOTER_LINKS = [
  { label: 'Telegram: LLM notes', href: 'https://t.me/llm_notes' },
  { label: 'aicoding.space', href: 'https://aicoding.space' },
];
// The channel links are the SITE's identity, not the course's decoration, so an authored
// `course.footer` EXTENDS them, it never replaces them. MEASURED 2026-09-02: six of eight courses
// in one batch authored their own footer and every one of them silently dropped the Telegram and
// aicoding links, because this was an either/or. A course cannot opt out of the site's own footer;
// duplicates (an author who wrote the channel link out by hand) are removed by href.
const authored = (course.footer && Array.isArray(course.footer.links) ? course.footer.links : []);
const seenHref = new Set(DEFAULT_FOOTER_LINKS.map((l) => l.href));
const footerLinks = DEFAULT_FOOTER_LINKS
  .concat(authored.filter((l) => l && typeof l.href === 'string' && !seenHref.has(l.href)))
  .filter((l) => l && typeof l.href === 'string' && /^https:\/\//.test(l.href) && typeof l.label === 'string');

// Feedback link: a reader who hits a defect must be one click from reporting it AGAINST THE RIGHT
// PACKAGE. course.feedback = { repo: 'owner/name', packagePath: 'packages/<dir>', title?, body? }
// renders a prefilled new-issue link; absent feedback → no link (never a broken one).
// Docs link: a course is a GUIDED ENTRY, never the full reference. Whatever the course had no
// room for lives in the package README — link it, or the reader's next question has nowhere to go.
// Derived from the same feedback block (repo + packagePath), so one declaration feeds both.
const dl = course.feedback;
if (dl && typeof dl.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(dl.repo) && typeof dl.packagePath === 'string') {
  const branch = dl.branch || 'main';
  footerLinks.push({
    label: dl.docsLabel || (String(course.language || 'en').toLowerCase() === 'ru' ? 'Полная документация пакета' : 'Full package docs'),
    href: `https://github.com/${dl.repo}/blob/${branch}/${dl.packagePath.replace(/\/+$/, '')}/README.md`,
  });
}

const fb = course.feedback;
if (fb && typeof fb.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(fb.repo) && typeof fb.packagePath === 'string') {
  const pkgName = fb.packagePath.split('/').filter(Boolean).pop() || fb.packagePath;
  const title = fb.title || `[${pkgName}] `;
  const body = fb.body || [
    `Замечание по итогам курса «${course.courseTitle}».`,
    '',
    `Пакет: \`${fb.packagePath}\``,
    '',
    '**Что ожидалось:**',
    '',
    '**Что произошло:**',
    '',
    '**Как воспроизвести:**',
    '',
  ].join('\n');
  const q = `title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  footerLinks.push({
    label: fb.label || (String(course.language || 'en').toLowerCase() === 'ru' ? 'Что-то работает не так?' : 'Something not working?'),
    href: `https://github.com/${fb.repo}/issues/new?${q}`,
  });
}
const FOOTER = `<footer id="site-footer">${footerLinks
  .map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`)
  .join('<span class="footer-sep">·</span>')}</footer>`;

const html = `<div class="layout">
  <aside id="aside"></aside>
  <main id="main"></main>
</div>
${FOOTER}
<script type="application/json" id="course-data">${payload}</script>
<script type="application/json" id="ui-strings">${uiPayload}</script>
<style>${CSS}</style>
<script>${JS}</script>
`;

const full = `<!doctype html>
<html lang="${esc(course.language || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(course.courseTitle)}</title>
<meta name="description" content="${esc(String(course.courseDescription).slice(0, 180))}">
</head>
<body>
${html}</body>
</html>
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, full);
console.log(`site → ${outPath}  (${full.length} bytes, ${course.sections.length} sections, ${course.achievements.length} achievements)`);
