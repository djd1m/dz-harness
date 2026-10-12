#!/usr/bin/env node
// Canonical source for this docs pilot. Run with --check to detect stale outputs.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const palette = { bg: '#0b141b', panel: '#12232d', ink: '#e9f3f6', muted: '#adbec7', line: '#385360', cyan: '#66d9ed', lime: '#c5f277' };
const sceneGeometry = [
  {
    "id": "engineering-pipeline",
    "height": 830,
    "panelY": [
      136,
      256,
      376,
      496
    ],
    "coursePaths": [
      "../harness-architecture/",
      "../feature-adr/",
      "../skills-decision-mockups/"
    ],
    "noteY": 624
  },
  {
    "id": "feature-adr",
    "height": 980,
    "panelY": [
      128,
      238,
      348,
      458,
      568,
      678
    ],
    "coursePaths": [
      "../feature-adr/"
    ],
    "noteY": 796,
    "repair": true
  },
  {
    "id": "decision-mockups",
    "height": 1000,
    "panelY": [
      128,
      252,
      362,
      700
    ],
    "coursePaths": [
      "../skills-decision-mockups/"
    ],
    "noteY": 820,
    "mockup": true
  }
];

// Each locale is complete: no defaults or cross-locale text fallback.
const locales = {
  ru: {
  ui: {
    "animatedTitle": "цикл 10 секунд",
    "staticTitle": "статичная схема",
    "svgEyebrow": "ENGINEERING / КАРТА ДЕЙСТВИЙ",
    "mockupLabel": "03 / МАКЕТ, ЕСЛИ РАЗНИЦА ВИДНА",
    "mockupA": "A: список",
    "mockupB": "B: группы",
    "animatedCaption": "Подсветка шагов · цикл 10 секунд",
    "staticCaption": "Все шаги · без анимации",
    "previewAlt": "Статичная схема:",
    "previewAction": "Разобрать схему →",
    "sectionEyebrow": "Карта действий",
    "courseNav": "Курсы для",
    "openDiagram": "Открыть анимированную схему",
    "motionCaption": "Подсветка повторяется каждые 10 секунд. Закройте схему, чтобы убрать движение. При уменьшении движения в настройках устройства схема статична.",
    "staticView": "Статичная версия",
    "replay": "Анимация с начала ↗",
    "pageTitle": "Engineering pipeline — карты действий",
    "allTutorials": "← Все обучалки",
    "galleryEyebrow": "Engineering pipeline",
    "headingFirst": "От вопроса",
    "headingSecond": "к проверенному коду",
    "lede": "Три карты помогают увидеть путь: где договориться о результате, где получить решение владельца и как подтвердить готовность фичи.",
    "intro": "Превью статичны. Откройте разбор, затем раскройте анимированную схему — или выберите версию без движения.",
    "diagramNav": "Схемы",
    "footer": "Карты дополняют существующие курсы. Раскройте схему для просмотра шагов или откройте статичную версию.",
    "languageLabel": "English"
  },
  scenes: {
    "engineering-pipeline": {
      "title": "Инженерный конвейер",
      "subtitle": "От задачи к проверяемому результату",
      "description": "Семейство Engineering pipeline: требование задаёт результат, решение выбирает путь, доставка создаёт изменение, проверка подтверждает его. decision-mockups помогает получить ответ владельца на развилке; feature-adr ведёт выбранную фичу через доставку и проверку.",
      "context": "Карта семейства: где нужен ответ владельца, а где — дисциплина доставки одной фичи.",
      "alternative": "Требование → решение → доставка → проверка. На этапе решения decision-mockups готовит сравнение вариантов и вопрос владельцу. feature-adr связывает согласованные требования и решения с кодом и доказательствами проверки.",
      "courses": ["Карта курсов","Курс feature-adr","Курс decision-mockups"],
      "panels": [{"label":"01 / ТРЕБОВАНИЕ","title":"Что должно измениться?","lines":["Результат и критерии приёмки."]},{"label":"02 / РЕШЕНИЕ","title":"Какой путь выбираем?","lines":["decision-mockups → ответ владельца."]},{"label":"03 / ДОСТАВКА","title":"Сделать выбранную фичу","lines":["feature-adr → от контрактов до кода."]},{"label":"04 / ПРОВЕРКА","title":"Подтвердить результат","lines":["feature-adr → QE и доказательства."]}],
      "note": ["Два пакета — разные точки помощи.","Решение требует ответа владельца.","Готовность требует доказательств."]
    },
    "feature-adr": {
      "title": "feature-adr",
      "subtitle": "Одна фича. Проверяемая доставка.",
      "description": "Цикл feature-adr: согласованные контракты, архитектурное решение ADR, реализация, независимый QE, доказательства и готовность. Если QE находит проблему, реализацию исправляют и снова проверяют; готовность наступает после подтверждения результата.",
      "context": "Для фичи с понятной целью: закрепить договорённости и довести их до проверенного кода.",
      "alternative": "Контракты → ADR → реализация → независимый QE → доказательства → готовность. Замечания QE возвращают работу к исправлению реализации и повторному QE. Доказательства связывают результат с критериями приёмки.",
      "courses": ["Открыть курс feature-adr"],
      "panels": [{"label":"01 / КОНТРАКТЫ","title":"Зафиксировать ожидаемое","lines":["Требования и критерии приёмки."]},{"label":"02 / ADR","title":"Объяснить решение","lines":["Выбор, причины и последствия."]},{"label":"03 / РЕАЛИЗАЦИЯ","title":"Написать и проверить код","lines":["По контрактам и принятому ADR."]},{"label":"04 / НЕЗАВИСИМЫЙ QE","title":"Проверить чужим взглядом","lines":["Другая модель ищет пробелы."]},{"label":"05 / ДОКАЗАТЕЛЬСТВА","title":"Связать вывод с фактами","lines":["Тесты, замеры и шаги проверки."]},{"label":"06 / ГОТОВНОСТЬ","title":"Подтвердить приёмку","lines":["Приёмка подтверждена фактами."]}],
      "note": ["QE нашёл проблему → исправить код","→ повторить независимый QE.","Петля слева показывает этот возврат."]
    },
    "decision-mockups": {
      "title": "decision-mockups",
      "subtitle": "Показать развилку. Получить ответ.",
      "description": "Вопрос: как показать 30 задач? Вариант A — общий список, проще внедрение, но поиск вручную. Вариант B — группы по статусу, быстрее обзор, но нужны правила группировки. Макет нужен только при значимых видимых различиях. Владелец явно отвечает A, B или просит уточнить.",
      "context": "Когда есть настоящая развилка: показать жизнеспособные варианты, цену каждого и запросить ответ.",
      "alternative": "Как показать 30 задач? A: общий список — просто внедрить, но поиск вручную. B: группы по статусу — быстрее обзор, но нужны правила группировки. Если разница видна пользователю, показать макет. Владелец отвечает A, B или «уточнить». До его ответа выбор не сделан.",
      "courses": ["Открыть курс decision-mockups"],
      "panels": [{"label":"01 / НАСТОЯЩИЙ ВОПРОС","title":"Как показать 30 задач?","lines":["Быстро найти работу на день."]},{"label":"02 / ВАРИАНТ A","title":"Общий список","lines":["Просто внедрить; поиск вручную."]},{"label":"02 / ВАРИАНТ B","title":"Группы по статусу","lines":["Быстрее обзор; настройка групп."]},{"label":"04 / ОТВЕТ ВЛАДЕЛЬЦА","title":"A, B или «уточнить»","lines":["Ждём ответа владельца."]}],
      "note": ["Макет — только если разница видна.","Стоимость вариантов остаётся рядом.","Ответ возвращается в работу."]
    }
  }
  },
  en: {
  ui: {
    "animatedTitle": "10-second cycle",
    "staticTitle": "static diagram",
    "svgEyebrow": "ENGINEERING / ACTION MAP",
    "mockupLabel": "03 / MOCKUP IF VISUALS DIFFER",
    "mockupA": "A: list",
    "mockupB": "B: groups",
    "animatedCaption": "Step highlights · 10-second cycle",
    "staticCaption": "All steps · no animation",
    "previewAlt": "Static diagram:",
    "previewAction": "Explore the diagram →",
    "sectionEyebrow": "Action map",
    "courseNav": "Courses for",
    "openDiagram": "Open the animated diagram",
    "motionCaption": "Highlights repeat every 10 seconds. Close the diagram to hide the motion. With reduced motion enabled on your device, the diagram is static.",
    "staticView": "Static view",
    "replay": "Restart animation ↗",
    "pageTitle": "Engineering pipeline — action maps",
    "allTutorials": "← All tutorials (Russian)",
    "galleryEyebrow": "Engineering pipeline",
    "headingFirst": "From a question",
    "headingSecond": "to verified code",
    "lede": "Three maps show when to agree on the outcome, ask the owner to choose, and verify that a feature is ready.",
    "intro": "Previews are static. Open a section, then expand its animated diagram—or use the static view.",
    "diagramNav": "Diagrams",
    "footer": "These maps complement the existing Russian courses. Expand a diagram to follow its steps, or open the static view.",
    "languageLabel": "Русский"
  },
  scenes: {
    "engineering-pipeline": {
      "title": "Engineering pipeline",
      "subtitle": "From a request to a verified result",
      "description": "The Engineering pipeline family: requirements define the outcome, a decision sets the direction, delivery builds the change, and verification checks it. decision-mockups helps obtain the owner’s answer at a fork; feature-adr takes the agreed feature through delivery and verification.",
      "context": "A map of the family: where you need the owner’s answer and where you need a process for delivering one feature.",
      "alternative": "Requirements → decision → delivery → verification. At the decision stage, decision-mockups compares options and asks the owner to choose. feature-adr connects agreed requirements and decisions to code and evidence of verification.",
      "courses": ["Course map (Russian)","feature-adr course (Russian)","decision-mockups course (Russian)"],
      "panels": [{"label":"01 / REQUIREMENTS","title":"What needs to change?","lines":["Outcome and acceptance criteria."]},{"label":"02 / DECISION","title":"Which route do we take?","lines":["decision-mockups → owner’s answer."]},{"label":"03 / DELIVERY","title":"Build the agreed feature","lines":["feature-adr → from contracts to code."]},{"label":"04 / VERIFICATION","title":"Verify the result","lines":["feature-adr → review and evidence."]}],
      "note": ["Choose a route. Deliver with evidence.","A decision needs the owner’s answer.","Readiness needs evidence."]
    },
    "feature-adr": {
      "title": "feature-adr",
      "subtitle": "One feature. Verified delivery.",
      "description": "The feature-adr loop: agreed contracts, an architecture decision record (ADR), implementation, independent quality review (QE), evidence, and readiness. If QE finds a problem, fix the implementation and repeat the review. Readiness requires evidence that the result meets the acceptance criteria.",
      "context": "For a feature with a clear goal: record the agreements and carry them through to verified code.",
      "alternative": "Contracts → ADR → implementation → independent QE → evidence → readiness. QE findings send the work back for a code fix and another independent review. Evidence connects the result to the acceptance criteria.",
      "courses": ["Open the feature-adr course (Russian)"],
      "panels": [{"label":"01 / CONTRACTS","title":"Agree on the expected result","lines":["Requirements and acceptance criteria."]},{"label":"02 / ADR","title":"Explain the decision","lines":["Choice, reasons and trade-offs."]},{"label":"03 / IMPLEMENTATION","title":"Write and test the code","lines":["Follow the contracts and the ADR."]},{"label":"04 / INDEPENDENT QE","title":"Get an independent review","lines":["Another model checks for gaps."]},{"label":"05 / EVIDENCE","title":"Support the result with facts","lines":["Tests, measurements and verification."]},{"label":"06 / READINESS","title":"Confirm acceptance","lines":["Acceptance is backed by evidence."]}],
      "note": ["QE found a problem → fix the code","→ repeat the independent review.","The loop on the left shows the return."]
    },
    "decision-mockups": {
      "title": "decision-mockups",
      "subtitle": "Show the options. Get an answer.",
      "description": "Question: how do we show 30 tasks? Option A is a shared list: easy to build, but tasks must be found manually. Option B groups tasks by status: a quicker overview, but grouping rules must be configured. Use a mockup only for meaningful visual differences. The owner chooses A or B, or asks for clarification.",
      "context": "For a real fork in the road: show viable options, the cost of each, and ask for an answer.",
      "alternative": "How do we show 30 tasks? A: one shared list—easy to build, but manual search. B: groups by status—a quicker overview, but grouping rules need setup. Show a mockup if the visual differences matter. The owner chooses A or B, or asks for clarification. Until then, no option has been chosen.",
      "courses": ["Open the decision-mockups course (Russian)"],
      "panels": [{"label":"01 / REAL QUESTION","title":"How do we show 30 tasks?","lines":["Find today’s work quickly."]},{"label":"02 / OPTION A","title":"One shared list","lines":["Easy to build; manual search."]},{"label":"02 / OPTION B","title":"Groups by status","lines":["Quicker overview; configure groups."]},{"label":"04 / OWNER’S ANSWER","title":"A, B or “clarify”","lines":["Waiting for the owner’s answer."]}],
      "note": ["Mock up meaningful visual differences.","Keep each option’s cost in view.","Use the answer to guide the next step."]
    }
  }
  },
};

const uiKeys = ["animatedTitle","staticTitle","svgEyebrow","mockupLabel","mockupA","mockupB","animatedCaption","staticCaption","previewAlt","previewAction","sectionEyebrow","courseNav","openDiagram","motionCaption","staticView","replay","pageTitle","allTutorials","galleryEyebrow","headingFirst","headingSecond","lede","intro","diagramNav","footer","languageLabel"];
function validateText(value, schema, path) {
  if (schema === null) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Missing or empty translation: ' + path);
  } else if (Array.isArray(schema)) {
    if (!Array.isArray(value) || value.length !== schema.length) throw new Error('Incomplete translation array: ' + path);
    schema.forEach((entry, index) => validateText(value[index], entry, path + '[' + index + ']'));
  } else {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== Object.keys(schema).sort().join('|')) throw new Error('Incomplete translation keys: ' + path);
    for (const [key, entry] of Object.entries(schema)) validateText(value[key], entry, path + '.' + key);
  }
}
function validateLocales() {
  const schema = {
    ui: Object.fromEntries(uiKeys.map(key => [key, null])),
    scenes: Object.fromEntries(sceneGeometry.map(scene => [scene.id, {
      title: null, subtitle: null, description: null, context: null, alternative: null,
      courses: scene.coursePaths.map(() => null),
      panels: scene.panelY.map(() => ({ label: null, title: null, lines: [null] })),
      note: [null, null, null],
    }])),
  };
  if (Object.keys(locales).sort().join('|') !== 'en|ru') throw new Error('Expected complete ru and en locales');
  for (const [locale, copy] of Object.entries(locales)) validateText(copy, schema, locale);
}
function localizedScenes(locale) {
  return sceneGeometry.map(geometry => {
    const copy = locales[locale].scenes[geometry.id];
    return { ...geometry, ...copy,
      panels: copy.panels.map((panel, index) => ({ ...panel, y: geometry.panelY[index] })),
      courses: geometry.coursePaths.map((href, index) => [locale === 'en' ? '../' + href : href, copy.courses[index]]),
    };
  });
}

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

function mockup(ui) {
  const rows = [548, 568, 588].map(y => `<path class="mini-line" d="M70 ${y}h100"/>`).join('\n');
  return `<g class="panel phase-3"><rect class="surface" x="40" y="490" width="326" height="182" rx="12"/>
${text(56, 514, ui.mockupLabel, 'label')}
<rect class="mini" x="56" y="534" width="132" height="84" rx="6"/>${rows}
<rect class="mini" x="218" y="534" width="132" height="84" rx="6"/>
<path class="mini" d="M226 544h51v26h-51z M289 544h51v26h-51z"/>
<path class="mini-line" d="M228 584h47 M291 584h47 M228 600h47"/>
${text(56, 645, ui.mockupA)}${text(218, 645, ui.mockupB)}</g>`;
}

function svg(scene, animated, ui) {
  const connections = scene.mockup
    ? '<path class="connector" d="M203 216v18H18v172h22"/><path class="connector" d="M18 296h22"/><path class="connector" d="M366 296h16v180H203v14"/><path class="branch" d="M366 406h16"/><path class="connector" d="M203 672v28"/>'
    : scene.panels.slice(0, -1).map((item, index) => `<path class="connector" d="M203 ${item.y + 88}v${scene.panels[index + 1].y - item.y - 88}"/>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="${scene.height}" viewBox="0 0 390 ${scene.height}" role="img" aria-labelledby="title desc">
<title id="title">${escape(scene.title)} — ${animated ? ui.animatedTitle : ui.staticTitle}</title>
<desc id="desc">${escape(scene.description)}</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1l8 4-8 4" fill="none" stroke="${palette.line}" stroke-width="2"/></marker><marker id="repair-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1l8 4-8 4" fill="none" stroke="${palette.lime}" stroke-width="2"/></marker></defs>
<style>${styles(animated)}</style>
<rect width="390" height="${scene.height}" fill="${palette.bg}" rx="16"/>
${text(24, 34, ui.svgEyebrow, 'label')}
${text(24, 73, scene.title, 'title')}
${text(24, 102, scene.subtitle, 'subtitle')}
${connections}
${scene.repair ? '<path class="connector repair" d="M40 502H18V392h22"/>' : ''}
${scene.panels.map((item, index) => panel(item, scene.mockup && index === 3 ? 4 : index)).join('\n')}
${scene.mockup ? mockup(ui) : ''}
${scene.note.map((line, index) => text(40, scene.noteY + index * 23, line, 'note')).join('\n')}
<rect class="track" x="40" y="${scene.height - 72}" width="326" height="4" rx="2"/>
<rect class="meter" x="40" y="${scene.height - 72}" width="326" height="4" rx="2"/>
${text(40, scene.height - 42, animated ? ui.animatedCaption : ui.staticCaption, 'note')}
</svg>\n`;
}

function html(locale, scenes, ui) {
  const cards = scenes.map(scene => `<a class="preview" href="#${scene.id}"><img src="${scene.id}-static.svg" alt="${escape(ui.previewAlt)} ${escape(scene.title)}" width="390" height="${scene.height}"/><div><h2>${escape(scene.title)}</h2><p>${escape(scene.context)}</p><span>${escape(ui.previewAction)}</span></div></a>`).join('\n');
  const sections = scenes.map(scene => `<section id="${scene.id}" aria-labelledby="${scene.id}-heading">
<div class="explanation"><p class="eyebrow">${escape(ui.sectionEyebrow)}</p><h2 id="${scene.id}-heading">${escape(scene.title)}</h2><p>${escape(scene.context)}</p><p>${escape(scene.alternative)}</p><nav aria-label="${escape(ui.courseNav)} ${escape(scene.title)}">${scene.courses.map(([href, label]) => `<a href="${href}">${escape(label)}</a>`).join('\n')}</nav></div>
<div class="diagram"><details><summary>${escape(ui.openDiagram)}</summary><figure><picture><source media="(prefers-reduced-motion: reduce)" srcset="${scene.id}-static.svg"/><img class="animated" loading="lazy" src="${scene.id}.svg" alt="${escape(scene.alternative)}" width="390" height="${scene.height}"/></picture><figcaption>${escape(ui.motionCaption)}</figcaption></figure></details>
<p class="view-links"><a href="${scene.id}-static.svg">${escape(ui.staticView)}</a><a href="${scene.id}.svg" target="_blank" rel="noopener">${escape(ui.replay)}</a></p></div>
</section>`).join('\n');
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="dark"/><title>${escape(ui.pageTitle)}</title>
<style>
:root{color-scheme:dark;--bg:${palette.bg};--panel:${palette.panel};--ink:${palette.ink};--muted:${palette.muted};--line:${palette.line};--cyan:${palette.cyan};--lime:${palette.lime}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}a{color:var(--cyan);text-underline-offset:.22em}a:hover{color:var(--lime)}a:focus-visible,summary:focus-visible{outline:3px solid var(--lime);outline-offset:5px}main{max-width:1140px;margin:auto;padding:48px 24px 72px}header{max-width:740px;margin-bottom:36px}.eyebrow{color:var(--lime);font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}h1{font-size:clamp(32px,5vw,52px);line-height:1.1;letter-spacing:-.035em;margin:16px 0 20px}h2{font-size:24px;line-height:1.25;margin:0 0 16px}p{margin:0 0 18px}.lede{font-size:18px;color:var(--muted)}.gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:36px 0 64px}.preview{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--panel);text-decoration:none;color:var(--ink);display:flex;flex-direction:column}.preview:hover{color:var(--ink);border-color:var(--cyan)}.preview img{display:block;width:180px;height:auto;margin:22px auto 0}.preview div{padding:24px}.preview h2{font-size:21px}.preview p{color:var(--muted);font-size:15px}.preview span{color:var(--cyan);font-weight:600}section{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,390px);gap:48px;border-top:1px solid var(--line);padding:40px 0;scroll-margin-top:24px}.explanation{max-width:540px}.explanation p{color:var(--muted)}.explanation .eyebrow{color:var(--lime)}nav{display:flex;flex-wrap:wrap;gap:12px 24px}details{border:1px solid var(--line);border-radius:12px;overflow:hidden}summary{padding:16px;color:var(--cyan);cursor:pointer;font-weight:600;min-height:56px}details[open] summary{border-bottom:1px solid var(--line)}figure{margin:0}figure img{display:block;width:100%;height:auto}figcaption{padding:16px;color:var(--muted);font-size:14px}.view-links{display:flex;flex-wrap:wrap;gap:10px 20px;margin-top:16px;font-size:14px}footer{border-top:1px solid var(--line);padding-top:24px;color:var(--muted);font-size:14px}@media(max-width:740px){main{padding:28px 16px 48px}.gallery{grid-template-columns:1fr;gap:16px;margin-bottom:40px}.preview{display:grid;grid-template-columns:112px minmax(0,1fr)}.preview img{width:104px;margin:12px 4px}.preview div{padding:20px 14px}.preview h2{font-size:20px;overflow-wrap:anywhere}.preview p{font-size:14px}section{grid-template-columns:1fr;gap:20px;padding:32px 0}.diagram{max-width:390px;width:100%;margin:auto}}
</style></head><body><main>
<header><a href="${locale === 'en' ? '../../README.md' : '../README.md'}">${escape(ui.allTutorials)}</a> <a class="language" href="${locale === 'en' ? '../' : 'en/'}" lang="${locale === 'en' ? 'ru' : 'en'}" hreflang="${locale === 'en' ? 'ru' : 'en'}">${escape(ui.languageLabel)}</a><p class="eyebrow">${escape(ui.galleryEyebrow)}</p><h1>${escape(ui.headingFirst)}<br/>${escape(ui.headingSecond)}</h1><p class="lede">${escape(ui.lede)}</p><p>${escape(ui.intro)}</p></header>
<nav aria-label="${escape(ui.diagramNav)}">${scenes.map(scene => `<a href="#${scene.id}">${escape(scene.title)}</a>`).join('\n')}</nav>
<div class="gallery">${cards}</div>
${sections}
<footer>${escape(ui.footer)}</footer>
</main></body></html>\n`;
}

if (process.argv.slice(2).some(arg => arg !== '--check') || process.argv.slice(2).length > 1) {
  console.error('Usage: node generate.mjs [--check]');
  process.exitCode = 2;
} else {
  try {
    // Validate both dictionaries before building directories or writing any output.
    validateLocales();
    const outputs = new Map();
    for (const locale of ['ru', 'en']) {
      const prefix = locale === 'en' ? 'en/' : '';
      const scenes = localizedScenes(locale);
      const ui = locales[locale].ui;
      for (const scene of scenes) {
        outputs.set(prefix + scene.id + '.svg', svg(scene, true, ui));
        outputs.set(prefix + scene.id + '-static.svg', svg(scene, false, ui));
      }
      outputs.set(prefix + 'index.html', html(locale, scenes, ui));
    }
    const check = process.argv.includes('--check');
    if (!check) await mkdir(join(root, 'en'), { recursive: true });
    for (const [name, content] of outputs) {
      if (check) {
        const actual = await readFile(join(root, name), 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        if (actual !== content) { console.error('Stale or missing output: ' + name); process.exitCode = 1; }
      } else await writeFile(join(root, name), content);
    }
    if (!process.exitCode) console.log(check ? 'Course SVG outputs are current for ru and en.' : 'Generated twelve SVGs and both galleries.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
