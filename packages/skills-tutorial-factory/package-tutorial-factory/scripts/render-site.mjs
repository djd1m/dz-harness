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

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const coursePath = resolve(opt('course', 'course.json'));
const outPath = resolve(opt('out', join(dirname(coursePath), 'site', 'index.html')));

// ШТАМП ИСТОЧНИКА ЗДЕСЬ БОЛЬШЕ НЕ ЗОВЁТСЯ (решение владельца 2026-09-03, вариант А).
//
// Он остаётся на шве ПУБЛИКАЦИИ — в scripts/publish-tutorial.mjs, где стоит fail-closed и где
// он и нужен: наружу выкладывает только публикатор. В отрисовщике он был избыточен и ломал
// общий инструмент сразу тремя способами:
//   1. ХОДИЛ В СЕТЬ на каждую отрисовку (`npm view <пакет> version`) — сборка страницы стала
//      зависеть от достижимости реестра;
//   2. БРОСАЛ, если у каталога курса нет README со ссылкой на npm-пакет — то есть курс, не
//      привязанный к пакету, отрисовать было нельзя;
//   3. ПРАВИЛ ВХОДНОЙ ФАЙЛ, дописывая поле в course.json.
//
// Плюс он импортировал node:child_process, чем нарушал закреплённый тестом офлайновый договор
// фабрики: её скрипты не порождают процессов. Внести файл в исключения значило бы обойти
// настоящий страж.
//
// ИЗМЕРЕНО 2026-09-03: три красных теста (permission-jail, documented commands, closure mutants)
// падали именно на этом.

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

const CSS = readFileSync(join(__dirname, 'course-theme.css'), 'utf-8');
const FONT_NOTICES = ['Onest-OFL.txt', 'JetBrainsMono-OFL.txt'].map((name) =>
  `<h2>${esc(name.replace('-OFL.txt', ''))}</h2><pre>${esc(readFileSync(join(__dirname, '../references', name), 'utf-8'))}</pre>`
).join('');

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
  achievement: 'Достижение — ', locked: 'Закрыто: ', unlocked: 'Открыто: ', feedbackCorrect: 'Верно. ', feedbackWrong: 'Попробуй ещё раз. ', feedbackPartial: 'Результат. ', matchWrong: 'Эта пара не совпадает. Выбери другую.', codeScroll: 'Код — прокручивается по горизонтали',
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
// packagePath — путь В ПУБЛИЧНОМ ЗЕРКАЛЕ, где каталоги пакетов лежат БЕЗ префикса области
// (`packages/scout`, не `packages/@dzhechkov/scout`). ИЗМЕРЕНО 2026-09-02: с префиксом ссылка
// на README отдаёт 404 — так уехали 9 курсов, чинились вручную по одному. Нормализуем здесь,
// у ЕДИНСТВЕННОГО потребителя поля, чтобы правка не зависела от памяти автора курса.
// renders a prefilled new-issue link; absent feedback → no link (never a broken one).
// Docs link: a course is a GUIDED ENTRY, never the full reference. Whatever the course had no
// room for lives in the package README — link it, or the reader's next question has nowhere to go.
// Derived from the same feedback block (repo + packagePath), so one declaration feeds both.
const dl = course.feedback;
if (dl && typeof dl.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(dl.repo) && typeof dl.packagePath === 'string') {
  const branch = dl.branch || 'main';
  footerLinks.push({
    label: dl.docsLabel || (String(course.language || 'en').toLowerCase() === 'ru' ? 'Полная документация пакета' : 'Full package docs'),
    href: `https://github.com/${dl.repo}/blob/${branch}/${dl.packagePath.replace(/\/+$/, '').replace(/^packages\/@[^/]+\//, 'packages/')}/README.md`,
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
<details class="font-notices"><summary>Font licenses · SIL OFL 1.1</summary>${FONT_NOTICES}</details>
<script>${JS}</script>
`;

const full = `<!doctype html>
<html lang="${esc(course.language || 'en')}" data-course-theme="phosphor-v1">
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
// БАЙТЫ, А НЕ СИМВОЛЫ. `full.length` считает единицы строки; для кириллического курса это
// расходится с файлом на треть. ИЗМЕРЕНО 2026-09-03: печаталось «132258 bytes» при фактических
// 180829 байтах — тот же класс, что чинили в обоих публикаторах (запись aa8e9230). Подпись,
// называющая не ту величину, врёт даже когда вердикт верен.
console.log(`site → ${outPath}  (${Buffer.byteLength(full, 'utf-8')} bytes, ${course.sections.length} sections, ${course.achievements.length} achievements)`);
