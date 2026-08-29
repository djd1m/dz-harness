# evidence-wiki

Claude Code plugin: **evidence-disciplined wiki** — атомарный граф-связанный слой концепт-страниц, где каждый факт несёт inline-источник.

**Версия:** 0.1.0 · **Лицензия:** MIT

## Что делает

1. **LLM-Wiki** — строит слой атомарных self-contained концепт-страниц поверх вашей документации (концепция Karpathy: каждая страница читается без контекста, явный граф связей, JSON-индекс для LLM resolver).
2. **3-pillar discipline** — гарантирует, что каждый факт опирается на 3 типа источников (по умолчанию: ADR / methodology / research — конфигурируемо).
3. **Автоматизация** — команды `/wiki-generate` и `/triple-check`, governance shard, git pre-commit хуки.

## Состав плагина

```
evidence-wiki/
├── .claude-plugin/plugin.json        — манифест + config
├── skills/concept-wiki-generator/    — 8-шаговый pipeline генерации
├── commands/
│   ├── wiki-generate.md              — /wiki-generate
│   └── triple-check.md               — /triple-check (валидатор)
├── shards/triple-pillar.shard.md     — governance gate (instantiation example)
├── governance/
│   ├── triple-pillar.governance.md   — домен-агностичная спецификация протокола
│   └── README.md
├── hooks/
│   ├── hooks.json                    — Claude Code PostToolUse advisory
│   ├── pre-commit-triple-check.sh    — git hook (bash)
│   ├── pre-commit-triple-check.ps1   — git hook (PowerShell)
│   └── README.md
└── templates/
    ├── concept.template.md           — шаблон концепт-страницы
    └── triple-pillar.config.yaml     — шаблон конфигурации
```

## Установка

### Как Claude Code plugin

```bash
# Из marketplace (когда опубликован):
/plugin install evidence-wiki

# Локально (из корня этого репозитория плагина):
cp -r . ~/.claude/plugins/evidence-wiki/
```

### Настройка под проект

1. Скопируйте `templates/triple-pillar.config.yaml` в корень проекта
2. Адаптируйте `pillar_types` и `pillar_paths` под вашу структуру (не у всех ADR/methodology/research — может быть decision/model/experiment)
3. Запустите `/wiki-generate` для первичной генерации

### Git pre-commit hook (опционально)

Установка hook'а в целевой проект — симлинком или копией в `.git/hooks/`. Точные команды (bash / PowerShell / `core.hooksPath`) — см. `hooks/README.md` и секцию `git_hooks` в `hooks/hooks.json`.

## Использование

| Команда | Назначение |
|---------|-----------|
| `/wiki-generate` | Полная генерация/регенерация wiki-слоя |
| `/wiki-generate <slug>` | Добавить/обновить один концепт |
| `/triple-check <path>` | Валидировать 3-pillar discipline в файле/директории |

## Пример: длительный продуктовый ресерч

Продуктовый ресерч на несколько недель копит решения, расчёты и глубинные разборы. У длинного ресерча две типичные болезни: он превращается в свалку утверждений, которые уже не проследить до источника, и теряет навигируемость. `evidence-wiki` лечит обе — дисциплиной источников и атомарным графом концептов.

Пример использует обобщённую структуру, без привязки к конкретному проекту.

**Шаг 0 — настройка (один раз).**

```bash
# в корне проекта ресерча
cp ~/.claude/plugins/evidence-wiki/templates/triple-pillar.config.yaml .
# pre-commit hook — команды установки см. hooks/README.md
```

**Шаг 1 — накапливай источники по мере работы (недели 1…N).**

`evidence-wiki` не генерирует исследование — он работает поверх документов, которые пишешь ты (в обычных диалогах с Claude Code или вручную). Три каталога:

```
adrs/            # решения: "почему выбрали X, а не Y"
methodologies/   # расчёты: формулы, допущения, sensitivity-анализ
researches/      # глубинные разборы: findings с верифицированными источниками
```

**Шаг 2 — держи источники честными: `/triple-check`.**

После каждого нового документа:

```
/triple-check researches/market-sizing/
```

Команда даёт вердикт на каждый факт: `GOLD` (полный 3-pillar) / `OK` / `WEAK` (только внешний URL) / `MISSING` (голый факт без источника). `MISSING` ловит «дрейф»: через месяц ты уже не помнишь, откуда взял цифру — triple-check помнит.

**Шаг 2b — авто-enforcement.** Установленный pre-commit hook прогоняет ту же проверку на каждом `git commit`. Дисциплина не зависит от того, помнишь ли ты про неё.

**Шаг 3 — собери навигируемый слой: `/wiki-generate`.**

Когда документов становится много:

```
/wiki-generate
```

Строит: `wiki/concepts/*.md` (атомарная страница на каждый концепт 1-го класса — `pricing-model`, `target-segment`, … — читается без контекста), `wiki/graph.json` (граф «концепт → ADR / methodology / research»), `wiki/INDEX.md` (canonical map) и backlink-секции в самих источниках. LLM-resolver (и ты) подтягивает по любому концепту минимальный context bundle, не перечитывая весь корпус.

**Шаг 4 — итерируй.** Новый концепт — `/wiki-generate <slug>`; раз в неделю — полная регенерация.

**Результат:** корпус, где каждая цифра прослеживается до источника, и граф, по которому достаётся ровно нужный контекст — даже когда ресерч вырос до сотни документов.

> `evidence-wiki` намеренно **не проводит ресерч за тебя** — он отвечает за верификацию и организацию. Сбор источников и анализ — отдельная работа (см. ниже).

## Зависимости — нужны ли другие скиллы?

**Короткий ответ: нет.** `evidence-wiki` самодостаточен.

- `plugin.json` → `skills` содержит **только** встроенный `concept-wiki-generator`. Команды `/wiki-generate` и `/triple-check` не вызывают ничего внешнего.
- **НЕ нужны** `explore`, `goap-research-ed25519`, `problem-solver-enhanced`, `keysarium`, `keysarium-core` — ни как зависимость, ни для установки.
- Governance-протокол происходит из `keysarium-core`, но его спецификация **вшита в плагин** (`governance/triple-pillar.governance.md`). Устанавливать `keysarium-core` отдельно не надо.

**Важное различие.** `evidence-wiki` — слой *дисциплины и навигации НАД* твоими `adrs/` / `methodologies/` / `researches/`. Он не *проводит* ресерч. Как ты производишь исходные документы — дело твоё:

| Чем писать источники | Нужно для `evidence-wiki`? |
|----------------------|----------------------------|
| Обычные диалоги с Claude Code | ✅ достаточно |
| Скиллы `explore` / `goap-research-ed25519` / `problem-solver-enhanced` | опционально — **напарник**, не зависимость |
| Полный пайплайн `keysarium` | опционально — независимая система |

`goap-research-ed25519` (research с верификацией источников) близок `evidence-wiki` по духу — но это **отдельный** инструмент. Ставь его, только если хочешь структурированную помощь в *сборе* источников; для работы самого `evidence-wiki` он не требуется.

## Конфигурируемость

Плагин **домен-агностичен**. `pillar_types` настраиваются: вместо ADR/methodology/research можно использовать decision/model/experiment, или standard/regulation/case-study — любые 2+ типа источников. См. `governance/triple-pillar.governance.md` §Configuration.

## Провенанс

Извлечён из проекта [GenAI-Bundle-GTM](https://github.com/djd1m/GenAI-Bundle-GTM), где провалидирован на 20 концептах, 21 ADR, 13 методиках, 13 исследованиях (все 20 концептов — full triple-pillar). Полная история — в `HARNESS_MANIFEST.md` корневого репозитория.

Core governance-протокол — часть `@dzhechkov/keysarium-core` (см. `governance/`).

## Roadmap

- [ ] `/wiki-link-check` — отдельная команда проверки всех wiki-ссылок
- [ ] HNSW vector index для semantic concept lookup
- [ ] MCP resolver `/concept <slug>` → context bundle
- [ ] Promotion остальных модулей keysarium-core (memory, orchestration, verification)
