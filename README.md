# DZ Harness

Harness CLI связывает задачу, контракт, реализацию агентом и независимые проверки.
Вердикт опирается на evidence: замечания возвращают работу к реализации, а принятые
проверки ведут к результату с проверяемыми свидетельствами.

[Быстрый старт](#quickstart) · [Выбрать задачу](#routes) · [Возможности](#capabilities) · [Пакеты](#packages)

<a id="quickstart"></a>
## Быстрый старт

```sh
npm install -g @dzhechkov/harness-cli
dz --help
dz doctor
```

[Открыть руководство CLI](https://github.com/djd1m/dz-harness/blob/main/packages/harness-cli/README.md)

[![Задача → контракт → реализация → независимые проверки → evidence и вердикт; результат при принятии или возврат на исправление](presentations/harness-cli-30-min/harness-flow.svg)](https://djd1m.github.io/dz-harness/presentations/harness-cli-30-min/)

- Контракт до реализации
- Проверка независима от исполнителя
- Результат содержит проверяемое evidence

<a id="routes"></a>
## Выбрать задачу

| Задача | Куда перейти |
|---|---|
| [Начать с CLI](https://github.com/djd1m/dz-harness/blob/main/packages/harness-cli/README.md) | Установка, справка и проверка окружения. |
| [Провести фичу](https://github.com/djd1m/dz-harness/blob/main/packages/skills-feature-adr/README.md) | От требований и ADR к реализации и проверкам. |
| [Разобраться на практике](https://djd1m.github.io/dz-harness/tutorials/harness-cli/) | Публичные обучалки: объяснения и упражнения. |
| [Посмотреть очередь](https://djd1m.github.io/dz-harness/dashboard/) | Публичные задачи и доступные свидетельства работы. |

<a id="capabilities"></a>
## Возможности

| Инструмент | Для чего |
|---|---|
| [Harness CLI](https://github.com/djd1m/dz-harness/blob/main/packages/harness-cli/README.md) | Установка, справка и проверка окружения. |
| [Feature ADR](https://github.com/djd1m/dz-harness/blob/main/packages/skills-feature-adr/README.md) | От требований и ADR к реализации и проверкам. |
| [Skills Meta](https://github.com/djd1m/dz-harness/blob/main/packages/skills-meta/README.md) | Инструкции для выбора и применения инженерных методик. |
| [Skills QE](https://github.com/djd1m/dz-harness/blob/main/packages/skills-qe/README.md) | Методики проверок и оценки качества реализации. |

### Presentations

- [Harness CLI + Codex: от промпта к проверяемому результату](https://djd1m.github.io/dz-harness/presentations/harness-cli-30-min/)

### Обучалки

- [adapters](https://djd1m.github.io/dz-harness/tutorials/adapters/)
- [book-digitizer](https://djd1m.github.io/dz-harness/tutorials/book-digitizer/)
- [cloudru-hub](https://djd1m.github.io/dz-harness/tutorials/cloudru-hub/)
- [design-thinking](https://djd1m.github.io/dz-harness/tutorials/design-thinking/)
- [engine](https://djd1m.github.io/dz-harness/tutorials/engine/)
- [evidence-wiki](https://djd1m.github.io/dz-harness/tutorials/evidence-wiki/)
- [feature-adr](https://djd1m.github.io/dz-harness/tutorials/feature-adr/)
- [harness-architecture](https://djd1m.github.io/dz-harness/tutorials/harness-architecture/)
- [harness-cli](https://djd1m.github.io/dz-harness/tutorials/harness-cli/)
- [health-advisor](https://djd1m.github.io/dz-harness/tutorials/health-advisor/)
- [idea2prd](https://djd1m.github.io/dz-harness/tutorials/idea2prd/)
- [keysarium](https://djd1m.github.io/dz-harness/tutorials/keysarium/)
- [loop-designer](https://djd1m.github.io/dz-harness/tutorials/loop-designer/)
- [news](https://djd1m.github.io/dz-harness/tutorials/news/)
- [p-replicator](https://djd1m.github.io/dz-harness/tutorials/p-replicator/)
- [presentation-storyteller](https://djd1m.github.io/dz-harness/tutorials/presentation-storyteller/)
- [scout](https://djd1m.github.io/dz-harness/tutorials/scout/)
- [skills-12factor](https://djd1m.github.io/dz-harness/tutorials/skills-12factor/)
- [skills-academic](https://djd1m.github.io/dz-harness/tutorials/skills-academic/)
- [skills-analyst-manual](https://djd1m.github.io/dz-harness/tutorials/skills-analyst-manual/)
- [skills-book-ai-apps](https://djd1m.github.io/dz-harness/tutorials/skills-book-ai-apps/)
- [skills-book-ddia](https://djd1m.github.io/dz-harness/tutorials/skills-book-ddia/)
- [skills-book-fundamental-software-architecture](https://djd1m.github.io/dz-harness/tutorials/skills-book-fundamental-software-architecture/)
- [skills-bto](https://djd1m.github.io/dz-harness/tutorials/skills-bto/)
- [skills-decision-mockups](https://djd1m.github.io/dz-harness/tutorials/skills-decision-mockups/)
- [skills-demo-publisher](https://djd1m.github.io/dz-harness/tutorials/skills-demo-publisher/)
- [skills-devops](https://djd1m.github.io/dz-harness/tutorials/skills-devops/)
- [skills-ecc](https://djd1m.github.io/dz-harness/tutorials/skills-ecc/)
- [skills-edu-site](https://djd1m.github.io/dz-harness/tutorials/skills-edu-site/)
- [skills-mcp](https://djd1m.github.io/dz-harness/tutorials/skills-mcp/)
- [skills-package-story-page](https://djd1m.github.io/dz-harness/tutorials/skills-package-story-page/)
- [skills-pm](https://djd1m.github.io/dz-harness/tutorials/skills-pm/)
- [skills-qe](https://djd1m.github.io/dz-harness/tutorials/skills-qe/)
- [skills-reasoning](https://djd1m.github.io/dz-harness/tutorials/skills-reasoning/)
- [skills-reverse-engineering](https://djd1m.github.io/dz-harness/tutorials/skills-reverse-engineering/)
- [skills-taste](https://djd1m.github.io/dz-harness/tutorials/skills-taste/)
- [skills-transcript-site](https://djd1m.github.io/dz-harness/tutorials/skills-transcript-site/)
- [skills-web3](https://djd1m.github.io/dz-harness/tutorials/skills-web3/)
- [skills-website-cloner](https://djd1m.github.io/dz-harness/tutorials/skills-website-cloner/)
- [trip-planner](https://djd1m.github.io/dz-harness/tutorials/trip-planner/)
- [tutorial-factory](https://djd1m.github.io/dz-harness/tutorials/tutorial-factory/)

### Очередь

- [Публичные задачи и evidence](https://djd1m.github.io/dz-harness/dashboard/)

<a id="packages"></a>
<details>
<summary>Публичный каталог · 56 пакетов и сведения о зеркале</summary>

Read-only mirror of the published surface of 56 npm packages under the @dzhechkov scope. Пакеты содержат публичный npm-инвентарь. Разработка ведётся в приватном монорепозитории.
Источник каталога: [публичный manifest](https://github.com/djd1m/dz-harness/blob/main/MIRROR-MANIFEST.json).

## Пакеты — 56

| Package | Version | Документация |
|---|---|---|
| @dzhechkov/adapter-agents-md | 0.1.9 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/adapter-agents-md/README.md) |
| @dzhechkov/adapter-claude | 0.2.9 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/adapter-claude/README.md) |
| @dzhechkov/adapter-codex | 0.2.8 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/adapter-codex/README.md) |
| @dzhechkov/adapter-copilot | 0.1.9 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/adapter-copilot/README.md) |
| @dzhechkov/adapter-cursor | 0.1.9 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/adapter-cursor/README.md) |
| @dzhechkov/adapter-gemini | 0.1.9 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/adapter-gemini/README.md) |
| @dzhechkov/adapter-hermes | 0.2.8 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/adapter-hermes/README.md) |
| @dzhechkov/adapter-openclaude | 0.1.8 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/adapter-openclaude/README.md) |
| @dzhechkov/adapter-opencode | 0.2.8 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/adapter-opencode/README.md) |
| @dzhechkov/adapter-windsurf | 0.1.9 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/adapter-windsurf/README.md) |
| @dzhechkov/cloudru-hub | 0.1.12 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/cloudru-hub/README.md) |
| @dzhechkov/core | 0.2.30 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/core/README.md) |
| @dzhechkov/design-thinking | 1.0.15 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/design-thinking/README.md) |
| @dzhechkov/evidence-wiki | 0.2.7 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/evidence-wiki/README.md) |
| @dzhechkov/harness-cli | 0.8.49 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/harness-cli/README.md) |
| @dzhechkov/harness-core | 0.8.56 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/harness-core/README.md) |
| @dzhechkov/harness-presets | 0.5.25 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/harness-presets/README.md) |
| @dzhechkov/health-advisor | 1.10.8 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/health-advisor/README.md) |
| @dzhechkov/keysarium | 1.7.12 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/keysarium/README.md) |
| @dzhechkov/keysarium-core | 1.1.32 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/keysarium-core/README.md) |
| @dzhechkov/loop-designer-plugin | 0.1.7 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/loop-designer-plugin/README.md) |
| @dzhechkov/mcp-server-tools | 0.2.11 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/mcp-server-tools/README.md) |
| @dzhechkov/memory | 0.2.23 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/memory/README.md) |
| @dzhechkov/p-replicator | 1.13.5 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/p-replicator/README.md) |
| @dzhechkov/scout | 0.8.12 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/scout/README.md) |
| @dzhechkov/skills-12factor | 0.1.14 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-12factor/README.md) |
| @dzhechkov/skills-academic | 0.3.8 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-academic/README.md) |
| @dzhechkov/skills-analyst-manual | 1.0.15 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-analyst-manual/README.md) |
| @dzhechkov/skills-book-ai-apps | 0.2.11 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-book-ai-apps/README.md) |
| @dzhechkov/skills-book-clean-code | 0.1.2 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-book-clean-code/README.md) |
| @dzhechkov/skills-book-ddia | 0.1.6 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-book-ddia/README.md) |
| @dzhechkov/skills-book-digitizer | 0.2.20 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-book-digitizer/README.md) |
| @dzhechkov/skills-book-fundamental-software-architecture | 0.1.4 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-book-fundamental-software-architecture/README.md) |
| @dzhechkov/skills-bto | 1.4.7 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-bto/README.md) |
| @dzhechkov/skills-decision-mockups | 0.2.0 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-decision-mockups/README.md) |
| @dzhechkov/skills-demo-publisher | 0.1.2 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-demo-publisher/README.md) |
| @dzhechkov/skills-devops | 0.3.18 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-devops/README.md) |
| @dzhechkov/skills-ecc | 0.1.13 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-ecc/README.md) |
| @dzhechkov/skills-edu-site | 1.1.11 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-edu-site/README.md) |
| @dzhechkov/skills-feature-adr | 1.5.19 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-feature-adr/README.md) |
| @dzhechkov/skills-idea2prd | 0.1.16 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-idea2prd/README.md) |
| @dzhechkov/skills-mcp | 0.3.11 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-mcp/README.md) |
| @dzhechkov/skills-meta | 0.9.68 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-meta/README.md) |
| @dzhechkov/skills-news | 0.1.17 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-news/README.md) |
| @dzhechkov/skills-package-story-page | 0.2.5 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-package-story-page/README.md) |
| @dzhechkov/skills-pm | 0.1.6 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-pm/README.md) |
| @dzhechkov/skills-presentation-storyteller | 0.1.15 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-presentation-storyteller/README.md) |
| @dzhechkov/skills-qe | 0.3.15 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-qe/README.md) |
| @dzhechkov/skills-reasoning | 0.1.6 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-reasoning/README.md) |
| @dzhechkov/skills-reverse-engineering | 0.3.5 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-reverse-engineering/README.md) |
| @dzhechkov/skills-taste | 0.1.6 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-taste/README.md) |
| @dzhechkov/skills-transcript-site | 1.0.12 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-transcript-site/README.md) |
| @dzhechkov/skills-tutorial-factory | 0.7.3 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-tutorial-factory/README.md) |
| @dzhechkov/skills-web3 | 0.2.10 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-web3/README.md) |
| @dzhechkov/skills-website-cloner | 0.1.6 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/skills-website-cloner/README.md) |
| @dzhechkov/trip-planner | 1.0.12 | [README](https://github.com/djd1m/dz-harness/blob/main/packages/trip-planner/README.md) |

</details>

Вопросы и замечания: [issue tracker](https://github.com/djd1m/dz-harness/issues).
