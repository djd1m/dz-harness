#!/usr/bin/env node
// Canonical source for this docs pilot. Run with --check to detect stale outputs.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const palette = { bg: '#0b141b', panel: '#12232d', ink: '#e9f3f6', muted: '#adbec7', line: '#385360', cyan: '#66d9ed', lime: '#c5f277' };
const scenes = [
  {
    id: 'engineering-pipeline', title: 'Инженерный конвейер', subtitle: 'От задачи к проверяемому результату', height: 830,
    description: 'Семейство Engineering pipeline: требование задаёт результат, решение выбирает путь, доставка создаёт изменение, проверка подтверждает его. decision-mockups помогает получить ответ владельца на развилке; feature-adr ведёт выбранную фичу через доставку и проверку.',
    context: 'Карта семейства: где нужен ответ владельца, а где — дисциплина доставки одной фичи.',
    alternative: 'Требование → решение → доставка → проверка. На этапе решения decision-mockups готовит сравнение вариантов и вопрос владельцу. feature-adr связывает согласованные требования и решения с кодом и доказательствами проверки.',
    courses: [['../harness-architecture/', 'Карта курсов'], ['../feature-adr/', 'Курс feature-adr'], ['../skills-decision-mockups/', 'Курс decision-mockups']],
    panels: [
      { y: 136, label: '01 / ТРЕБОВАНИЕ', title: 'Что должно измениться?', lines: ['Результат и критерии приёмки.'] },
      { y: 256, label: '02 / РЕШЕНИЕ', title: 'Какой путь выбираем?', lines: ['decision-mockups → ответ владельца.'] },
      { y: 376, label: '03 / ДОСТАВКА', title: 'Сделать выбранную фичу', lines: ['feature-adr → от контрактов до кода.'] },
      { y: 496, label: '04 / ПРОВЕРКА', title: 'Подтвердить результат', lines: ['feature-adr → QE и доказательства.'] },
    ],
    note: ['Два пакета — разные точки помощи.', 'Решение требует ответа владельца.', 'Готовность требует доказательств.'],
    noteY: 624,
  },
  {
    id: 'feature-adr', title: 'feature-adr', subtitle: 'Одна фича. Проверяемая доставка.', height: 980,
    description: 'Цикл feature-adr: согласованные контракты, архитектурное решение ADR, реализация, независимый QE, доказательства и готовность. Если QE находит проблему, реализацию исправляют и снова проверяют; готовность наступает после подтверждения результата.',
    context: 'Для фичи с понятной целью: закрепить договорённости и довести их до проверенного кода.',
    alternative: 'Контракты → ADR → реализация → независимый QE → доказательства → готовность. Замечания QE возвращают работу к исправлению реализации и повторному QE. Доказательства связывают результат с критериями приёмки.',
    courses: [['../feature-adr/', 'Открыть курс feature-adr']],
    panels: [
      { y: 128, label: '01 / КОНТРАКТЫ', title: 'Зафиксировать ожидаемое', lines: ['Требования и критерии приёмки.'] },
      { y: 238, label: '02 / ADR', title: 'Объяснить решение', lines: ['Выбор, причины и последствия.'] },
      { y: 348, label: '03 / РЕАЛИЗАЦИЯ', title: 'Написать и проверить код', lines: ['По контрактам и принятому ADR.'] },
      { y: 458, label: '04 / НЕЗАВИСИМЫЙ QE', title: 'Проверить чужим взглядом', lines: ['Другая модель ищет пробелы.'] },
      { y: 568, label: '05 / ДОКАЗАТЕЛЬСТВА', title: 'Связать вывод с фактами', lines: ['Тесты, замеры и шаги проверки.'] },
      { y: 678, label: '06 / ГОТОВНОСТЬ', title: 'Подтвердить приёмку', lines: ['Приёмка подтверждена фактами.'] },
    ],
    repair: true,
    note: ['QE нашёл проблему → исправить код', '→ повторить независимый QE.', 'Петля слева показывает этот возврат.'],
    noteY: 796,
  },
  {
    id: 'decision-mockups', title: 'decision-mockups', subtitle: 'Показать развилку. Получить ответ.', height: 1000,
    description: 'Вопрос: как показать 30 задач? Вариант A — общий список, проще внедрение, но поиск вручную. Вариант B — группы по статусу, быстрее обзор, но нужны правила группировки. Макет нужен только при значимых видимых различиях. Владелец явно отвечает A, B или просит уточнить.',
    context: 'Когда есть настоящая развилка: показать жизнеспособные варианты, цену каждого и запросить ответ.',
    alternative: 'Как показать 30 задач? A: общий список — просто внедрить, но поиск вручную. B: группы по статусу — быстрее обзор, но нужны правила группировки. Если разница видна пользователю, показать макет. Владелец отвечает A, B или «уточнить». До его ответа выбор не сделан.',
    courses: [['../skills-decision-mockups/', 'Открыть курс decision-mockups']],
    panels: [
      { y: 128, label: '01 / НАСТОЯЩИЙ ВОПРОС', title: 'Как показать 30 задач?', lines: ['Быстро найти работу на день.'] },
      { y: 252, label: '02 / ВАРИАНТ A', title: 'Общий список', lines: ['Просто внедрить; поиск вручную.'] },
      { y: 362, label: '02 / ВАРИАНТ B', title: 'Группы по статусу', lines: ['Быстрее обзор; настройка групп.'] },
      { y: 700, label: '04 / ОТВЕТ ВЛАДЕЛЬЦА', title: 'A, B или «уточнить»', lines: ['Ждём ответа владельца.'] },
    ],
    mockup: true,
    note: ['Макет — только если разница видна.', 'Стоимость вариантов остаётся рядом.', 'Ответ возвращается в работу.'],
    noteY: 820,
  },
];

function text(x, y, value, className = 'body') {
  return `<text x="${x}" y="${y}" class="${className}">${escape(value)}</text>`;
}

function panel(item, phase) {
  return `<g class="panel phase-${phase}"><rect class="surface" x="40" y="${item.y}" width="326" height="88" rx="12"/>
${text(56, item.y + 22, item.label, 'label')}
${text(56, item.y + 47, item.title, 'heading')}
${item.lines.map((line, index) => text(56, item.y + 70 + index * 20, line)).join('\n')}</g>`;
}

function styles(animated) {
  const base = `svg{background:${palette.bg};font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:${palette.ink}}
text{fill:${palette.ink}}.title{font-size:25px;font-weight:750;letter-spacing:-.5px}.subtitle,.body{font-size:15px}.subtitle,.note{fill:${palette.muted}}.heading{font-size:18px;font-weight:650}.label{font-size:14px;font-weight:700;letter-spacing:.4px;fill:${palette.cyan}}.note{font-size:15px}.surface{fill:${palette.panel};stroke:${palette.line};stroke-width:1.5}.connector,.branch{fill:none;stroke:${palette.line};stroke-width:2}.connector{marker-end:url(#arrow)}.repair{stroke:${palette.lime};marker-end:url(#repair-arrow)}.track{fill:${palette.line}}.meter{fill:${palette.cyan};transform-origin:40px 0}.mini{fill:none;stroke:${palette.cyan};stroke-width:2}.mini-line{stroke:${palette.muted};stroke-width:2;stroke-linecap:round}`;
  if (!animated) return base;
  return `${base}
.panel .surface{animation:focus 10s linear infinite}.phase-1 .surface{animation-delay:-8.3s}.phase-2 .surface{animation-delay:-6.6s}.phase-3 .surface{animation-delay:-4.9s}.phase-4 .surface{animation-delay:-3.2s}.phase-5 .surface{animation-delay:-1.5s}
.meter{animation:cycle 10s linear infinite}.repair{stroke-dasharray:6 5;animation:travel 10s linear infinite}
@keyframes focus{0%,15%{stroke:${palette.cyan};fill:#183744}20%,95%{stroke:${palette.line};fill:${palette.panel}}100%{stroke:${palette.cyan};fill:#183744}}
@keyframes cycle{0%{transform:scaleX(.02)}95%,100%{transform:scaleX(1)}}
@keyframes travel{from{stroke-dashoffset:0}to{stroke-dashoffset:-110}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}.meter{transform:none}.repair{stroke-dasharray:none}}`;
}

function mockup() {
  const rows = [548, 568, 588].map(y => `<path class="mini-line" d="M70 ${y}h100"/>`).join('\n');
  return `<g class="panel phase-3"><rect class="surface" x="40" y="490" width="326" height="182" rx="12"/>
${text(56, 514, '03 / МАКЕТ, ЕСЛИ РАЗНИЦА ВИДНА', 'label')}
<rect class="mini" x="56" y="534" width="132" height="84" rx="6"/>${rows}
<rect class="mini" x="218" y="534" width="132" height="84" rx="6"/>
<path class="mini" d="M226 544h51v26h-51z M289 544h51v26h-51z"/>
<path class="mini-line" d="M228 584h47 M291 584h47 M228 600h47"/>
${text(56, 645, 'A: список')}${text(218, 645, 'B: группы')}</g>`;
}

function svg(scene, animated) {
  const connections = scene.mockup
    ? '<path class="connector" d="M203 216v18H18v172h22"/><path class="connector" d="M18 296h22"/><path class="connector" d="M366 296h16v180H203v14"/><path class="branch" d="M366 406h16"/><path class="connector" d="M203 672v28"/>'
    : scene.panels.slice(0, -1).map((item, index) => `<path class="connector" d="M203 ${item.y + 88}v${scene.panels[index + 1].y - item.y - 88}"/>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="${scene.height}" viewBox="0 0 390 ${scene.height}" role="img" aria-labelledby="title desc">
<title id="title">${escape(scene.title)} — ${animated ? 'цикл 10 секунд' : 'статичная схема'}</title>
<desc id="desc">${escape(scene.description)}</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1l8 4-8 4" fill="none" stroke="${palette.line}" stroke-width="2"/></marker><marker id="repair-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1l8 4-8 4" fill="none" stroke="${palette.lime}" stroke-width="2"/></marker></defs>
<style>${styles(animated)}</style>
<rect width="390" height="${scene.height}" fill="${palette.bg}" rx="16"/>
${text(24, 34, 'ENGINEERING / КАРТА ДЕЙСТВИЙ', 'label')}
${text(24, 73, scene.title, 'title')}
${text(24, 102, scene.subtitle, 'subtitle')}
${connections}
${scene.repair ? '<path class="connector repair" d="M40 502H18V392h22"/>' : ''}
${scene.panels.map((item, index) => panel(item, scene.mockup && index === 3 ? 4 : index)).join('\n')}
${scene.mockup ? mockup() : ''}
${scene.note.map((line, index) => text(40, scene.noteY + index * 23, line, 'note')).join('\n')}
<rect class="track" x="40" y="${scene.height - 72}" width="326" height="4" rx="2"/>
<rect class="meter" x="40" y="${scene.height - 72}" width="326" height="4" rx="2"/>
${text(40, scene.height - 42, animated ? 'Подсветка шагов · цикл 10 секунд' : 'Все шаги · без анимации', 'note')}
</svg>\n`;
}

function html() {
  const cards = scenes.map(scene => `<a class="preview" href="#${scene.id}"><img src="${scene.id}-static.svg" alt="Статичная схема: ${escape(scene.title)}" width="390" height="${scene.height}"/><div><h2>${escape(scene.title)}</h2><p>${escape(scene.context)}</p><span>Разобрать схему →</span></div></a>`).join('\n');
  const sections = scenes.map(scene => `<section id="${scene.id}" aria-labelledby="${scene.id}-heading">
<div class="explanation"><p class="eyebrow">Карта действий</p><h2 id="${scene.id}-heading">${escape(scene.title)}</h2><p>${escape(scene.context)}</p><p>${escape(scene.alternative)}</p><nav aria-label="Курсы для ${escape(scene.title)}">${scene.courses.map(([href, label]) => `<a href="${href}">${escape(label)}</a>`).join('\n')}</nav></div>
<div class="diagram"><details><summary>Открыть анимированную схему</summary><figure><picture><source media="(prefers-reduced-motion: reduce)" srcset="${scene.id}-static.svg"/><img class="animated" loading="lazy" src="${scene.id}.svg" alt="${escape(scene.alternative)}" width="390" height="${scene.height}"/></picture><figcaption>Подсветка повторяется каждые 10 секунд. Закройте схему, чтобы убрать движение. При уменьшении движения в настройках устройства схема статична.</figcaption></figure></details>
<p class="view-links"><a href="${scene.id}-static.svg">Статичная версия</a><a href="${scene.id}.svg" target="_blank" rel="noopener">Анимация с начала ↗</a></p></div>
</section>`).join('\n');
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="dark"/><title>Engineering pipeline — карты действий</title>
<style>
:root{color-scheme:dark;--bg:${palette.bg};--panel:${palette.panel};--ink:${palette.ink};--muted:${palette.muted};--line:${palette.line};--cyan:${palette.cyan};--lime:${palette.lime}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}a{color:var(--cyan);text-underline-offset:.22em}a:hover{color:var(--lime)}a:focus-visible,summary:focus-visible{outline:3px solid var(--lime);outline-offset:5px}main{max-width:1140px;margin:auto;padding:48px 24px 72px}header{max-width:740px;margin-bottom:36px}.eyebrow{color:var(--lime);font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}h1{font-size:clamp(32px,5vw,52px);line-height:1.1;letter-spacing:-.035em;margin:16px 0 20px}h2{font-size:24px;line-height:1.25;margin:0 0 16px}p{margin:0 0 18px}.lede{font-size:18px;color:var(--muted)}.gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:36px 0 64px}.preview{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--panel);text-decoration:none;color:var(--ink);display:flex;flex-direction:column}.preview:hover{color:var(--ink);border-color:var(--cyan)}.preview img{display:block;width:180px;height:auto;margin:22px auto 0}.preview div{padding:24px}.preview h2{font-size:21px}.preview p{color:var(--muted);font-size:15px}.preview span{color:var(--cyan);font-weight:600}section{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,390px);gap:48px;border-top:1px solid var(--line);padding:40px 0;scroll-margin-top:24px}.explanation{max-width:540px}.explanation p{color:var(--muted)}.explanation .eyebrow{color:var(--lime)}nav{display:flex;flex-wrap:wrap;gap:12px 24px}details{border:1px solid var(--line);border-radius:12px;overflow:hidden}summary{padding:16px;color:var(--cyan);cursor:pointer;font-weight:600;min-height:56px}details[open] summary{border-bottom:1px solid var(--line)}figure{margin:0}figure img{display:block;width:100%;height:auto}figcaption{padding:16px;color:var(--muted);font-size:14px}.view-links{display:flex;flex-wrap:wrap;gap:10px 20px;margin-top:16px;font-size:14px}footer{border-top:1px solid var(--line);padding-top:24px;color:var(--muted);font-size:14px}@media(max-width:740px){main{padding:28px 16px 48px}.gallery{grid-template-columns:1fr;gap:16px;margin-bottom:40px}.preview{display:grid;grid-template-columns:112px minmax(0,1fr)}.preview img{width:104px;margin:12px 4px}.preview div{padding:20px 14px}.preview h2{font-size:20px;overflow-wrap:anywhere}.preview p{font-size:14px}section{grid-template-columns:1fr;gap:20px;padding:32px 0}.diagram{max-width:390px;width:100%;margin:auto}}
</style></head><body><main>
<header><a href="../README.md">← Все обучалки</a><p class="eyebrow">Engineering pipeline</p><h1>От вопроса<br/>к проверенному коду</h1><p class="lede">Три карты помогают увидеть путь: где договориться о результате, где получить решение владельца и как подтвердить готовность фичи.</p><p>Превью статичны. Откройте разбор, затем раскройте анимированную схему — или выберите версию без движения.</p></header>
<nav aria-label="Схемы">${scenes.map(scene => `<a href="#${scene.id}">${escape(scene.title)}</a>`).join('\n')}</nav>
<div class="gallery">${cards}</div>
${sections}
<footer>Карты дополняют существующие курсы. Раскройте схему для просмотра шагов или откройте статичную версию.</footer>
</main></body></html>\n`;
}

if (process.argv.slice(2).some(arg => arg !== '--check') || process.argv.slice(2).length > 1) {
  console.error('Usage: node generate.mjs [--check]');
  process.exitCode = 2;
} else {
  const outputs = new Map(scenes.flatMap(scene => [[`${scene.id}.svg`, svg(scene, true)], [`${scene.id}-static.svg`, svg(scene, false)]]));
  outputs.set('index.html', html());
  const check = process.argv.includes('--check');
  for (const [name, content] of outputs) {
    if (check) {
      const actual = await readFile(join(root, name), 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (actual !== content) { console.error(`Stale or missing output: ${name}`); process.exitCode = 1; }
    } else await writeFile(join(root, name), content);
  }
  if (!process.exitCode) console.log(check ? 'Course SVG outputs are current.' : 'Generated six SVGs and index.html.');
}
