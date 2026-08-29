# Направления улучшений Keysarium & Skills-BTO

> **`/bto*` commands are NOT part of @dzhechkov/keysarium.** The BTO evaluator
> (Build-Benchmark-Test-Optimize) ships as a SEPARATE npm package. Install it first —
> `npx @dzhechkov/skills-bto init` — otherwise every `/bto…` command referenced below will
> not resolve in your project.


> Результат deep research по репозиториям [Ruflo](https://github.com/ruvnet/ruflo), [Agentic QE](https://github.com/proffesor-for-testing/agentic-qe) и статье [The Portable Orchestra](https://qualityforge.substack.com/p/the-portable-orchestra) (Dragan Spiridonov).
>
> Дата исследования: 2026-03-01

---

## Содержание

1. [Governance & Constitution](#1-governance--constitution)
2. [Portable Brain / Knowledge Export](#2-portable-brain--knowledge-export)
3. [Learning & Memory System](#3-learning--memory-system)
4. [Trust Tiers для скиллов](#4-trust-tiers-для-скиллов)
5. [Enhanced Agent Orchestration](#5-enhanced-agent-orchestration)
6. [Multi-Platform Support](#6-multi-platform-support)
7. [Cryptographic Verification Upgrade](#7-cryptographic-verification-upgrade)
8. [Modular Reuse: keysarium-core extraction](#8-modular-reuse-keysarium-core-extraction)
9. [Приоритезация](#9-приоритезация)
10. [Источники](#10-источники)

---

## 1. Governance & Constitution

**Текущее состояние:** 7 правил в `.claude/rules/` — мягкие рекомендации, которые Claude может "забыть" через ~40 минут контекста.

### 1.1. Constitution + Shards

| | |
|---|---|
| **Источник** | Ruflo (7-layer governance), AQE (domain shards) |
| **Проблема** | Правила загружаются один раз и дрифтуют при длинных сессиях |
| **Решение** | Каждая фаза пайплайна получает свой `.shard.md` с жёсткими правилами, которые перечитываются перед каждой фазой |

**Ruflo** реализует 7-слойную систему governance:
1. Constitutional Layer — неизменяемые инварианты
2. Policy Layer — правила, изменяемые через голосование
3. Enforcement Layer — автоматическая проверка на каждом шаге
4. Audit Layer — логирование всех решений
5. Amendment Layer — процесс изменения политик
6. Arbitration Layer — разрешение конфликтов
7. Attestation Layer — криптографическое подтверждение

**AQE** использует domain shards (`.claude/guidance/shards/{domain}.shard.md`), которые определяют:
- Правила и пороги качества для конкретного домена
- Права агентов (кто может писать, кто read-only)
- Триггеры эскалации с уровнями серьёзности
- Namespace памяти и политику retention

**Реализация для Keysarium:**

```
.claude/shards/
├── phase-0-discovery.shard.md      ← Правила для Phase 0
├── phase-1-explore.shard.md        ← Правила для Phase 1
├── phase-2-research.shard.md       ← Правила для Phase 2 (PARANOID mode)
├── phase-25-cjm.shard.md           ← Правила для Phase 2.5 (MANDATORY)
├── phase-3-solve.shard.md          ← Правила для Phase 3
├── phase-4-architecture.shard.md   ← Правила для Phase 4
├── phase-5-presentation.shard.md   ← Правила для Phase 5
└── bto-evaluation.shard.md         ← Правила для BTO pipeline
```

Каждый shard перечитывается агентом перед началом работы фазы, что решает проблему context drift.

### 1.2. Unbreakable Invariants

| | |
|---|---|
| **Источник** | AQE (7 invariants в Constitution) |
| **Проблема** | Критические правила записаны как текст — их можно случайно нарушить |
| **Решение** | Формализовать инварианты как enforcement gates |

AQE определяет 7 неизменяемых инвариантов:
1. Test Execution Integrity — доказательство реального выполнения
2. Security Scan Requirement — zero critical vulnerabilities
3. Backup Before Delete — обязательный бэкап
4. Loop Detection — max 3 идентичных действия подряд
5. Budget Enforcement — лимиты сессии
6. Memory Consistency — нет противоречивых паттернов
7. Verification Before Claim — claims require proof

**Предлагаемые инварианты для Keysarium:**

| Инвариант | Enforcement |
|-----------|-------------|
| CJM Phase 2.5 НИКОГДА не пропускается | Gate check перед Phase 3 |
| Executive Summary (08) ОБЯЗАТЕЛЕН | Gate check перед packaging |
| PARANOID mode: ноль unverified claims | Automated scan артефактов Phase 2 |
| BTO: judge и generator — разные модели | Model check в BTO pipeline |
| Layer 0 rejection = NO escalation без 3 retries | Retry counter в BTO test |
| Файлы создаются в момент фазы, не в Phase 6 | File existence check на checkpoint |

### 1.3. Policy Compilation

| | |
|---|---|
| **Источник** | Ruflo (`CLAUDE.md → PolicyBundle → shards → gates → ledger`) |
| **Решение** | `CLAUDE.md` компилируется в per-phase шарды при `/casarium` старте |

Каждый агент получает только релевантный шард вместо всего CLAUDE.md (~300 строк). Это снижает нагрузку на контекст и повышает точность следования правилам.

---

## 2. Portable Brain / Knowledge Export

**Текущее состояние:** `/harvest` извлекает знания в `TOOLKIT_HARVEST.md` — плоский текстовый файл. One-way процесс без импорта.

### 2.1. Portable Intelligence Container

| | |
|---|---|
| **Источник** | Quality Forge (`.rvf` format — "Docker for quality intelligence"), Ruflo (`brain export/import`) |
| **Проблема** | Знания не переносятся между проектами и командами |
| **Решение** | Формат portable brain container с export/import |

Quality Forge вводит концепцию "Docker для quality intelligence" — `.rvf` (RuVector Format):
- Упаковывает все паттерны, оценки, метаданные в один файл
- Включает версионирование и совместимость
- Поддерживает selective import (только нужные домены)

**Реализация для Keysarium:**

```bash
npx @dzhechkov/keysarium brain export             # → keysarium-brain-2026-03-01.json
npx @dzhechkov/keysarium brain import brain.json   # Импорт в другой проект
npx @dzhechkov/keysarium brain merge brain1 brain2 # Слияние из нескольких проектов
```

Структура brain container:
```json
{
  "version": "1.0",
  "exported_at": "2026-03-01T12:00:00Z",
  "source_project": "dz-harness-hub",
  "patterns": [...],
  "bto_evaluations": [...],
  "harvest_data": [...],
  "domain_templates": [...],
  "metadata": {
    "total_cases_processed": 12,
    "skill_trust_tiers": {...},
    "domain_statistics": {...}
  }
}
```

### 2.2. Cross-project Knowledge Transfer

| | |
|---|---|
| **Источник** | AQE (ReasoningBank, cross-project patterns) |
| **Проблема** | BTO-оценки скиллов не переносятся |
| **Решение** | Если скилл прошёл Layer 2 в проекте A, в проекте B можно пропустить полную ре-оценку |

### 2.3. Hash-chained Audit Trail

| | |
|---|---|
| **Источник** | Quality Forge (SHA-256 witness chain), Ruflo (AttestationLog) |
| **Проблема** | Нет гарантии целостности цепочки решений |
| **Решение** | Каждое решение BTO подписывается и чейнится |

```
Artifact_v1 → hash_1 → Judge_scores → hash_2 → Optimization_v2 → hash_3 → ...
```

Невозможно задним числом подправить оценку или подменить промежуточный артефакт.

---

## 3. Learning & Memory System

**Текущее состояние:** Нет никакой персистентной памяти. Каждая сессия начинается с нуля. 10-й кейс решается так же, как первый.

### 3.1. Reward-calibrated Learning

| | |
|---|---|
| **Источник** | AQE (0-1 reward scale на каждую задачу каждого агента) |
| **Проблема** | Нет обратной связи по качеству работы агентов |
| **Решение** | Каждый агент записывает reward после завершения |

Протокол AQE:
1. **Pre-task:** `memory_query()` — загрузить релевантные паттерны
2. **Post-task:** `memory_store()` — сохранить результат с reward score (0.0–1.0)
3. **Submit:** Отчёт координатору

Шкала reward:
- 1.0 = Отличный результат на checkpoint, пользователь сказал "ок" сразу
- 0.7 = Хороший результат, минимальные правки
- 0.3 = Потребовалась существенная доработка
- 0.0 = Полный провал, переделка с нуля

**Применение к Keysarium:** Со временем система показывает, какие фазы проблемные, какие скиллы дают лучшие результаты в каких доменах.

### 3.2. Cross-phase Feedback Loops

| | |
|---|---|
| **Источник** | AQE (4 named feedback loops с TTL namespaces) |
| **Проблема** | Передача данных между фазами ручная (через `{CHOSEN_CJM}`) |
| **Решение** | Формализованные именованные feedback loops |

AQE реализует 4 кросс-фазных цикла обратной связи:

1. **Production → Ideation (Strategic):** Прошлые дефекты влияют на планирование
2. **Production → Refinement (Tactical):** История дефектов задаёт вес факторам
3. **CI/CD → Development (Operational):** Провалы гейтов направляют генерацию тестов
4. **Development → Refinement (Quality Criteria):** Пробелы покрытия выявляют дефициты критериев

**Предлагаемые feedback loops для Keysarium:**

| Loop | Маршрут | Данные |
|------|---------|--------|
| CJM → Solve | Phase 2.5 → Phase 3 | `{CHOSEN_CJM}`, pain points, conversion metrics |
| Research → Presentation | Phase 2 → Phase 5 | Ключевые finding'ы, verified sources |
| Solve → Architecture | Phase 3 → Phase 4 | Выбранная стратегия, constraints |
| BTO Judges → Optimize | Layer 2 → Optimizer | Judge feedback, weak dimensions |
| History → Discovery | Past cases → Phase 0 | Domain patterns, common pitfalls |

Все loops используют именованные namespaces с TTL:
```
keysarium/cross-phase/cjm-to-solve/{case-slug}     — 30 days
keysarium/cross-phase/research-to-pres/{case-slug}  — 30 days
keysarium/history/domain-patterns/{domain}          — 90 days
```

### 3.3. Dream Cycles (Background Consolidation)

| | |
|---|---|
| **Источник** | AQE (биологическая метафора: сон → консолидация памяти) |
| **Проблема** | Нет автоматического анализа паттернов между сессиями |
| **Решение** | Фоновый процесс анализирует накопленные паттерны |

Как работает Dream Cycle в AQE:
1. **Pattern Collection** — хуки автоматически собирают опыт
2. **Dream Triggers** — по времени (60 мин), по объёму (20 событий), по провалу quality gate
3. **The Dream** — DreamEngine загружает топ-200 паттернов, строит concept graph, обнаруживает кросс-доменные ассоциации
4. **Insight Application** — инсайты становятся actionable паттернами
5. **Future Influence** — HNSW search обогащает маршрутизацию агентов

**Применение к Keysarium:**
После нескольких `/casarium` запусков фоновый процесс анализирует паттерны:
- "В банковских кейсах Phase 2 занимает 2x дольше запланированного"
- "TRIZ чаще даёт прорывы, чем Game Theory для retail-доменов"
- "CJM Variant B выигрывает в 70% enterprise-кейсов"

### 3.4. Semantic Completion Promises

| | |
|---|---|
| **Источник** | AQE (`<promise>TESTS_GREEN</promise>` — машинно-читаемые сигналы состояния) |
| **Проблема** | Статус фазы — текстовый, не machine-readable |
| **Решение** | `<promise>` теги как формальные сигналы |

AQE использует semantic promises:
- `<promise>TESTS_GREEN</promise>`
- `<promise>COVERAGE_MET</promise>`
- `<promise>QUALITY_GATES_PASSED</promise>`
- `<promise>SECURITY_CLEARED</promise>`
- `<promise>DEPLOYMENT_READY</promise>`

**Предлагаемые promises для Keysarium:**

| Promise | Фаза | Значение |
|---------|------|----------|
| `DISCOVERY_COMPLETE` | Phase 0 | JTBD + конкуренты + ROI проанализированы |
| `CASE_EXPLORED` | Phase 1 | Кейс полностью понят, brief создан |
| `RESEARCH_PARANOID_PASSED` | Phase 2 | Все claims верифицированы, zero unverified |
| `CJM_VALIDATED` | Phase 2.5 | CJM прототип создан и выбран |
| `SOLUTION_DESIGNED` | Phase 3 | Стратегия решения сформирована |
| `ARCHITECTURE_DEFINED` | Phase 4 | C4 диаграммы + sequence flows готовы |
| `PRESENTATION_READY` | Phase 5 | Все 4 артефакта (05-08) созданы |
| `BTO_LAYER0_PASSED` | BTO | 71 детерминистическая проверка пройдена |
| `BTO_LAYER2_SCORED` | BTO | Panel из 3 judges оценила артефакт |
| `BTO_OPTIMIZED` | BTO | Оптимизация завершена, convergence достигнута |

---

## 4. Trust Tiers для скиллов

**Текущее состояние:** 9 скиллов с градацией по валидированности (Tier 0–2). knowledge-extractor прошёл BTO Layer 2 и продвинут до Tier 2.

### Система тиров (из AQE)

AQE классифицирует 78 скиллов по 4 уровням доверия:

| Tier | Определение | Требования |
|------|------------|------------|
| **Tier 3 — Verified** | Полностью валидирован | Eval test suites с детерминистической валидацией |
| **Tier 2 — Validated** | Протестирован | Тестирование без формальной eval-инфраструктуры |
| **Tier 1 — Structured** | Структурирован | JSON output schemas, документация |
| **Tier 0 — Advisory** | Рекомендательный | Базовые инструкции без тестов |

**Применение к текущим скиллам Keysarium:**

| Скилл | Текущий тир | Путь к повышению |
|-------|------------|------------------|
| knowledge-extractor | **Tier 2 — Validated** | BTO Layer 2 score 7.5, optimized 2026-03-03. → score ≥ 8.5 + eval tests для Tier 3 |
| explore | Tier 1 — Structured | SKILL.md + references → прогнать `/bto-test` |
| goap-research-ed25519 | Tier 1 — Structured | SKILL.md + references + scripts → прогнать `/bto-test` |
| problem-solver-enhanced | Tier 1 — Structured | SKILL.md → прогнать `/bto-test` |
| reverse-engineering-unicorn | Tier 1 — Structured | SKILL.md + modules + examples → прогнать `/bto-test` |
| presentation-storyteller | Tier 1 — Structured | SKILL.md + references → прогнать `/bto-test` |
| bto | Tier 1 — Structured | SKILL.md + 3 modules → self-evaluate через `/bto-test` |
| feature-adr | Tier 1 — Structured | SKILL.md + modules + references → прогнать `/bto-test` |
| frontend-design | Tier 0 — Advisory | Только SKILL.md → нужны references |

**Реализация:**
```bash
npx @dzhechkov/keysarium doctor    # Показывает tier каждого скилла
npx @dzhechkov/skills-bto test .claude/skills/explore/   # Повысить tier
```

Вывод `doctor`:
```
Skills Health Check:
  ★  knowledge-extractor           Tier 2 — Validated (BTO 7.5/10, 2026-03-03)
  ✅ explore                        Tier 1 — Structured
  ✅ goap-research-ed25519          Tier 1 — Structured
  ✅ problem-solver-enhanced        Tier 1 — Structured
  ✅ reverse-engineering-unicorn    Tier 1 — Structured
  ✅ presentation-storyteller       Tier 1 — Structured
  ✅ bto                            Tier 1 — Structured
  ✅ feature-adr                    Tier 1 — Structured
  ⚠️  frontend-design              Tier 0 — Advisory (missing: references/)

Tip: Run /bto-test on each skill to promote to Tier 2+
```

---

## 5. Enhanced Agent Orchestration

**Текущее состояние:** Простой параллелизм через Agent tool (2–3 агента на фазу), advisory рекомендации в `agent-swarm.md`.

### 5.1. Queen Coordinator Protocol

| | |
|---|---|
| **Источник** | AQE (10-phase mandatory protocol для queen coordinator) |
| **Проблема** | Нет формального протокола координации — ad-hoc параллелизм |
| **Решение** | `/casarium` становится queen-координатором |

10-фазный протокол AQE:
1. `fleet_init()` — инициализация с выбранной топологией
2. `fleet_health()` — проверка готовности системы
3. `memory_query()` — загрузка исторических паттернов
4. Анализ задачи, определение нужных доменов
5. `agent_spawn()` — spawn агентов по доменам
6. `task_orchestrate()` — отправка работы (parallel/sequential/adaptive)
7. `task_list()` — мониторинг до завершения
8. `agent_metrics()` — сбор результатов
9. `memory_store()` — архивация паттернов
10. Structured report

**Адаптация для Keysarium `/casarium`:**

```
1. INIT        — Создать researches/<slug>/, проверить структуру
2. HEALTH      — Проверить наличие всех скиллов и зависимостей
3. LOAD        — Загрузить паттерны из прошлых кейсов (если есть brain)
4. DETECT      — Определить домен (banking/retail/enterprise/healthcare)
5. SHARD       — Загрузить domain-specific shard
6. ORCHESTRATE — Запустить фазы с правильной топологией
7. MONITOR     — Checkpoint после каждой фазы
8. COLLECT     — Собрать все артефакты
9. STORE       — Сохранить паттерны в brain
10. REPORT     — Финальный отчёт + packaging
```

### 5.2. 3-Tier Model Routing (формализация)

| | |
|---|---|
| **Источник** | Ruflo (WASM/Haiku/Sonnet-Opus), AQE (TinyDancer ADR-026) |
| **Проблема** | В `agent-swarm.md` есть haiku/sonnet/opus рекомендации, но это advisory |
| **Решение** | Формализовать model routing в enforcement rules |

| Tier | Модель | Latency | Cost | Когда использовать |
|------|--------|---------|------|--------------------|
| Tier 1 | Haiku | ~500ms | $0.0002 | Layer 0 checks, file formatting, simple transforms |
| Tier 2 | Sonnet | ~2s | $0.003 | Research synthesis, analysis, BTO judge panel |
| Tier 3 | Opus | ~5s | $0.015 | Creative CJM design, presentation storytelling, BTO crossover |

AQE дополнительно использует **Agent Booster (WASM)** — skip LLM entirely для простых трансформов (<1ms, $0). Это даёт **87% cost reduction**.

**Enforcement rule:**
```markdown
# Model Routing Enforcement
- Layer 0 checks: model="haiku" ALWAYS — no exceptions
- File formatting agents: model="haiku"
- Research synthesis: model="sonnet" minimum
- Creative work (CJM, storytelling): model="opus" or default
- BTO judges: model="sonnet" — NEVER haiku for Layer 2
- BTO optimization crossover: model="opus" — creative synthesis
```

### 5.3. Background Workers

| | |
|---|---|
| **Источник** | Ruflo (12 worker types), AQE (dream cycle workers) |
| **Проблема** | Вся обработка synchronous, блокирует foreground |
| **Решение** | Фоновые воркеры для non-blocking операций |

Ruflo использует 12 типов background workers:
- State checkpointing
- Brain export/import
- Pattern consolidation
- Metrics collection
- Hook processing

**Применение к Keysarium:**
```bash
keysarium daemon consolidate    # Фоновый анализ паттернов
keysarium daemon export-brain   # Фоновый brain export
keysarium daemon health-check   # Периодическая проверка здоровья скиллов
```

### 5.4. Topology Selection

| | |
|---|---|
| **Источник** | Ruflo (6 topologies: hierarchical, mesh, ring, star, hybrid, adaptive) |
| **Проблема** | Один тип параллелизма для всех фаз |
| **Решение** | Выбор топологии в зависимости от фазы |

| Фаза | Топология | Обоснование |
|------|-----------|-------------|
| Phase 0 (Discovery) | **Star** — coordinator + 2 workers | Простая параллелизация, coordinator агрегирует |
| Phase 2 (Research) | **Mesh** — 3 independent agents | Fault-tolerant, каждый агент автономен |
| Phase 2.5 (CJM) | **Hierarchical** — queen + 3 variant workers | Queen выбирает лучший вариант |
| Phase 5 (Presentation) | **Hierarchical** — storyteller orchestrates | Storyteller координирует script + Q&A |
| BTO Test | **Star** — 3 isolated judges | Judges ОБЯЗАНЫ быть изолированы |
| BTO Optimize | **Mesh** — N mutation workers | Независимые мутации, convergence check |

---

## 6. Multi-Platform Support

**Текущее состояние:** Только Claude Code. Один формат (`.claude/` directory).

### Поддерживаемые платформы (из AQE)

AQE поддерживает **11 платформ** через `aqe platform setup [platform]`:

| Платформа | Конфигурация | Сложность внедрения | Ценность |
|-----------|-------------|---------------------|----------|
| Claude Code | `.claude/` (native) | Есть | Базовая |
| **Cursor** | TOML rules | Низкая | Высокая (самый популярный AI-IDE) |
| **OpenCode** | `.opencode/` directory | Низкая | Высокая (open-source) |
| **GitHub Copilot** | JSON config | Средняя | Высокая (enterprise) |
| **AWS Kiro** | `.kiro/` assets | Средняя | Средняя (AWS ecosystem) |
| Cline | YAML config | Средняя | Средняя |
| Windsurf | Config file | Средняя | Средняя |
| Roo Code | Config file | Средняя | Низкая |
| Kilo Code | Config file | Средняя | Низкая |
| Continue.dev | Config file | Средняя | Низкая |
| OpenAI Codex CLI | Config file | Высокая | Средняя |

**Реализация для Keysarium:**

```bash
npx @dzhechkov/keysarium init                         # Claude Code (default)
npx @dzhechkov/keysarium init --platform cursor        # Cursor
npx @dzhechkov/keysarium init --platform opencode      # OpenCode
npx @dzhechkov/keysarium init --platform copilot       # GitHub Copilot
npx @dzhechkov/keysarium init --platform kiro          # AWS Kiro
npx @dzhechkov/keysarium init --platform all           # Все платформы
```

Skills и rules — тот же markdown, меняется только:
- Способ загрузки (`.claude/skills/` → `.cursor/skills/` → `.opencode/skills/`)
- Формат конфигурации (JSON → TOML → YAML)
- Platform-specific hooks

**Рекомендация:** Начать с Cursor + OpenCode как первых кандидатов (низкая сложность, высокая ценность). Это резко расширяет аудиторию.

---

## 7. Cryptographic Verification Upgrade

**Текущее состояние:** `goap-research-ed25519` использует Ed25519 для подписи source claims. Остальные скиллы и артефакты без верификации.

### 7.1. SHA-256 Witness Chain

| | |
|---|---|
| **Источник** | Quality Forge (SHA-256 hash-chained audit trail), Ruflo (AttestationLog) |
| **Решение** | Каждый phase artifact получает hash, chain связывает артефакты |

```
Phase 0: 00_product_discovery.md → SHA-256(content) = hash_0
Phase 1: 01_case_brief.md → SHA-256(content + hash_0) = hash_1
Phase 2: 02_research_findings.md → SHA-256(content + hash_1) = hash_2
...
```

Невозможно подменить промежуточный артефакт без разрыва цепочки.

### 7.2. BTO Judge Isolation Proof

| | |
|---|---|
| **Источник** | AQE (judge isolation enforcement), Ruflo (attestation) |
| **Решение** | Криптографическое доказательство независимости судей |

Каждый judge записывает свою оценку с `timestamp + SHA-256(evaluation)` **ДО** того, как видит оценки других. Это доказуемо верифицирует, что judges не влияли друг на друга.

```json
{
  "judge_id": "domain-expert",
  "artifact_hash": "sha256:abc...",
  "score": 8.2,
  "evaluation_hash": "sha256:def...",
  "timestamp": "2026-03-01T12:00:00Z",
  "previous_chain_hash": "sha256:ghi..."
}
```

### 7.3. Memory Write Gate

| | |
|---|---|
| **Источник** | Ruflo (quorum writes), AQE (Byzantine consensus) |
| **Решение** | Write quorum для критических операций |

Для обновления `TOOLKIT_HARVEST.md` — минимум 2 из 3 агентов должны согласиться на запись. Предотвращает случайную порчу накопленных знаний.

### 7.4. Ценность для доменов

Особенно важно для **банковского домена** (ФЗ-152, аудит ЦБ):
- Аудиторский trail каждого решения
- Верификация целостности артефактов
- Доказательство независимости оценок

---

## 8. Modular Reuse: keysarium-core extraction

**Текущее состояние:** Два пакета (`@dzhechkov/keysarium` и `@dzhechkov/skills-bto`), skills-bto зависит от keysarium templates.

### Предлагаемая 3-package архитектура

```
@dzhechkov/keysarium-core          ← NEW: общие паттерны (фреймворк)
├── governance/                    ← Constitution + shards + invariants
├── memory/                        ← Learning protocol + reward system
├── orchestration/                 ← Queen protocol + topology selection
├── verification/                  ← Witness chain + audit trail
├── trust-tiers/                   ← Tier classification system
└── platform/                      ← Multi-platform config generators

@dzhechkov/keysarium                ← Использует keysarium-core
├── phases/                        ← 7-phase pipeline (domain: AI research)
├── skills/                        ← Research-specific skills
├── shards/                        ← Phase-specific governance shards
└── domain-templates/              ← Banking, Retail, Enterprise, Healthcare

@dzhechkov/skills-bto               ← Использует keysarium-core
├── modules/                       ← BUILD / TEST / OPTIMIZE
├── judges/                        ← Judge panel + trust tiers
├── shards/                        ← BTO-specific governance shards
└── optimization/                  ← Evolutionary optimization engine
```

**Ценность:** `keysarium-core` становится фреймворком для ЛЮБОГО multi-agent pipeline:
- QE (Quality Engineering) — подключает свои skills и phases
- DevOps — подключает deployment pipelines
- Content Creation — подключает контент-воркеры
- Data Science — подключает ML pipelines

Общие паттерны (governance, memory, orchestration, verification) переиспользуются без дублирования.

---

## 9. Приоритезация

### По Impact / Effort

| # | Направление | Impact | Effort | ROI | Пакет | Статус |
|---|-------------|--------|--------|-----|-------|--------|
| 1 | Trust Tiers для скиллов | High | Low | **Highest** | keysarium + bto | ✅ Реализовано |
| 2 | Semantic Completion Promises | High | Low | **Highest** | keysarium | ✅ Реализовано |
| 3 | 3-Tier Model Routing (формализация) | High | Low | **Highest** | keysarium + bto | ✅ Реализовано |
| 4 | Constitution + Shards | High | Medium | High | keysarium | ✅ Реализовано |
| 5 | Cross-phase Feedback Loops | High | Medium | High | keysarium | ✅ Реализовано |
| 6 | Reward-calibrated Learning | Very High | Medium | High | keysarium-core | ✅ Реализовано |
| 7 | Portable Brain export/import | Very High | Medium | High | keysarium-core | ✅ Реализовано |
| 8 | Multi-platform support (Cursor + OpenCode) | Very High | Medium | High | keysarium + bto | ✅ Реализовано |
| 9 | keysarium-core extraction | Transformative | High | Medium | NEW package | ✅ Реализовано |
| 10 | Witness Chain для BTO judges | Medium | Medium | Medium | bto | ✅ Реализовано |

### Рекомендуемый порядок реализации

**Wave 1 — Quick Wins (1–2 сессии): ✅ DONE**
- Trust Tiers (обновить `doctor` command)
- Semantic Completion Promises (добавить `<promise>` теги в checkpoint protocol)
- Model Routing Enforcement (формализовать в rules)

**Wave 2 — Core Infrastructure (3–5 сессий): ✅ DONE**
- Constitution + Shards (разбить rules на per-phase shards)
- Cross-phase Feedback Loops (именованные namespaces)
- Portable Brain v1 (JSON export/import через CLI)

**Wave 3 — Learning System (5–8 сессий): ✅ DONE**
- Reward-calibrated Learning (persistence layer)
- Dream Cycles (background consolidation)
- Multi-platform support (Cursor + OpenCode)

**Wave 4 — Architecture Evolution (8+ сессий): ✅ DONE**
- keysarium-core extraction (3-package architecture)
- Witness Chain (cryptographic audit trail)
- Background Workers (daemon system)

---

## 10. Источники

### Репозитории

| Источник | URL | Ключевые паттерны |
|----------|-----|-------------------|
| **Ruflo** | [github.com/ruvnet/ruflo](https://github.com/ruvnet/ruflo) | 7-layer governance, 6 topologies, AgentDB, RuVector, 3-tier model routing |
| **Agentic QE** | [github.com/proffesor-for-testing/agentic-qe](https://github.com/proffesor-for-testing/agentic-qe) | 13 DDD domains, 60 agents, trust tiers, ReasoningBank, dream cycles, PACT principles |

### Статьи и публикации

| Источник | URL | Ключевые идеи |
|----------|-----|---------------|
| **The Portable Orchestra** | [qualityforge.substack.com](https://qualityforge.substack.com/p/the-portable-orchestra) | Portable Brain (.rvf), Witness Chain, MinCut optimization, "Docker for quality intelligence" |
| **Agentic QE on Ministry of Testing** | [ministryoftesting.com](https://www.ministryoftesting.com/software-testing-tools/agentic-qe-fleet) | PACT framework, fleet architecture |
| **Evil Tester Podcast #030** | [eviltester.com](https://www.eviltester.com/show/030-agentic-ai-quality-engineering/) | Automation ceiling, coordination vs intelligence |
| **Xray Blog: AI QA Leadership 2026** | [getxray.app](https://www.getxray.app/blog/how-ai-will-shape-qa-leadership-in-2026-xray-blog) | Industry trends, agentic QE adoption |

### Авторы

| Автор | Контрибуция |
|-------|------------|
| **Dragan Spiridonov** | Agentic QE Fleet, PACT framework, Quality Forge articles |
| **ruvnet** | Ruflo framework, AgentDB, RuVector format |
