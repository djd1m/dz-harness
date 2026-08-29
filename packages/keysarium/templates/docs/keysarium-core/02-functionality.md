# Функциональность @dzhechkov/keysarium-core

> **`/bto*` commands are NOT part of @dzhechkov/keysarium.** The BTO evaluator
> (Build-Benchmark-Test-Optimize) ships as a SEPARATE npm package. Install it first —
> `npx @dzhechkov/skills-bto init` — otherwise every `/bto…` command referenced below will
> not resolve in your project.


> Полный справочник по всем протоколам, алгоритмам и JSON-схемам фреймворка.

## Содержание

1. [Governance — Управление](#1-governance--управление)
2. [Memory — Обучение](#2-memory--обучение)
3. [Orchestration — Оркестрация](#3-orchestration--оркестрация)
4. [Verification — Верификация](#4-verification--верификация)
5. [Trust Tiers — Классификация доверия](#5-trust-tiers--классификация-доверия)
6. [Platform — Мультиплатформенность](#6-platform--мультиплатформенность)

---

## 1. Governance — Управление

### 1.1. Constitution (constitution.md)

Набор **нерушимых инвариантов**, которые проверяются на каждом stage gate.

#### Формат инварианта

```markdown
### INV-{NNN}: {Short Name}

**Rule:** {Что всегда должно быть истинным}
**Enforcement:** {Как проверить — deterministic check, file existence, hash}
**On violation:** {HALT | WARN | RETRY(N)}
**Rationale:** {Зачем этот инвариант нужен}
```

#### 7 базовых инвариантов

| ID | Название | Rule | Enforcement | On Violation |
|----|---------|------|-------------|-------------|
| INV-001 | Artifact Integrity | Артефакт верифицируем по witness chain hash | SHA-256 check после каждого этапа | HALT |
| INV-002 | Stage Completion Signal | Этап не завершён без promise tag | Проверка `<promise>` в checkpoint output | HALT |
| INV-003 | Human Checkpoint Required | Нет авто-перехода без подтверждения человека | Orchestrator ждёт explicit user input | HALT |
| INV-004 | Evaluator Independence | Судьи в panel работают изолированно | Judge attestation protocol | HALT |
| INV-005 | Loop Detection | Агент не повторяет действие 3+ раз подряд | Track last 3 actions per agent | WARN + escalate |
| INV-006 | Memory Consistency | Нет противоречивых паттернов в памяти | Check pattern_id conflicts при store | WARN |
| INV-007 | No Unverified Claims | Research не содержит непроверенных фактов | Scan для claims без source citation | HALT |

#### Доменные расширения

Нумерация с INV-100. Примеры:

- **Banking:** INV-100 Data Perimeter — все LLM-вызовы только к on-premise моделям
- **BTO:** INV-100 Judge-Generator Separation — модель генерации ≠ модель оценки

#### Интеграция

На каждом stage gate:
1. Загрузить constitution + доменные расширения
2. Запустить enforcement check для каждого инварианта
3. HALT → остановить pipeline
4. WARN → логировать и продолжить
5. RETRY(N) → повторить до N раз, затем HALT

---

### 1.2. Shard Protocol (shard-protocol.md)

Решает проблему **context drift**: после ~40 минут правила «выпадают» из контекста агента.

#### Формат shard

```markdown
# {Stage Name} Governance Shard

## Time Budget
- Allocated: {percentage}% of total pipeline time
- Hard limit: {minutes} minutes

## Prerequisites
- Required upstream promises: [{PROMISE_TAG_1}, {PROMISE_TAG_2}]
- Required input files: [{file_list}]

## Skill to Load
- Primary: {skill_name} (read SKILL.md at: {path})

## Rules for This Stage
1. {Rule 1}
2. {Rule 2}

## Quality Gates
- [ ] {Gate 1}
- [ ] {Gate 2}

## Promise Tag
On successful completion, emit: `<promise>{PROMISE_TAG}</promise>`

## Anti-Patterns for This Stage
| Pattern | Fix |
|---------|-----|
| {Anti-pattern 1} | {Fix} |
```

#### Протокол загрузки (7 шагов)

1. **Determine shard path** — construct filename from stage ID
2. **Read shard** — load into agent context
3. **Validate prerequisites** — check upstream promises
4. **Validate inputs** — check required files exist
5. **Load skill** — read SKILL.md if specified
6. **Start timer** — track against budget
7. **Execute stage** — follow rules and quality gates

#### Naming Convention

```
{stage-id}.shard.md
```

Примеры: `stage-0-init.shard.md`, `bto-evaluation.shard.md`

#### Best Practice

- Держите shard под **100 строк** для оптимального context usage
- Включайте только правила релевантные текущему этапу
- Всегда включайте promise tag и time budget

---

### 1.3. Checkpoint Protocol (checkpoint-protocol.md)

Обязательные точки синхронизации «человек ↔ система».

#### Формат checkpoint

```
=====================================================
CHECKPOINT {N}: {Stage Name} Complete
<promise>{PROMISE_TAG}</promise>

{2-3 line summary}
Artifacts created: {list}

Options:
- "ok" / "proceed" — advance to next stage
- "deepen {section}" — elaborate
- "{specific feedback}" — adjust
=====================================================
```

#### Promise Tags

| Правило | Описание |
|---------|---------|
| Emit only when conditions met | Promise = подтверждение что quality gates пройдены |
| `_INCOMPLETE` suffix | Если условия НЕ выполнены: `<promise>TAG_INCOMPLETE</promise>` |
| Downstream check | Следующий этап проверяет upstream promises перед стартом |

#### Классификация reward по ответу пользователя

| Ответ | Reward | Label | Детекция |
|-------|--------|-------|----------|
| "ок", "proceed", одно слово | 1.0 | excellent | Single-word approval |
| "углуби X", feedback на 1 область | 0.7 | good | Scoped to one area |
| Переработка 3+ областей | 0.3 | needs_work | Multiple areas affected |
| "заново", "это неправильно" | 0.0 | failed | Full restart |

#### Интеграция

- **С governance:** на checkpoint запускаются все invariant checks
- **С memory:** после ответа пользователя → memory_store() с reward
- **С witness chain:** на "ok" → compute SHA-256 hash → append to chain

---

## 2. Memory — Обучение

### 2.1. memory_query(context)

Вызывается в **начале** каждого этапа для загрузки исторических паттернов.

#### Input

```json
{
  "stage": "stage-2",
  "domain": "banking",
  "slug": "bank-kc-automation",
  "skill": "goap-research-ed25519"
}
```

#### Алгоритм (7 шагов)

1. **Check enabled** — читаем `{memory-root}/config.json`, если `enabled: false` → пустой результат
2. **Resolve path** — `{memory-root}/{domain}/` (сканируем все slug, не только текущий)
3. **Scan records** — читаем все `{stage}_*.json` файлы по matching stage
4. **Filter expired** — исключаем records где `expires_at < current_date`
5. **Sort** — по `reward` DESC, затем `usage_count` DESC, затем `timestamp` DESC
6. **Limit** — top `max_results_per_query` записей (default 10)
7. **Enrich** — загружаем `_patterns/domain-patterns.json` для matching domain

#### Output

```json
{
  "records": [
    {
      "project_slug": "bank-kc-automation",
      "stage": "stage-2",
      "reward": 1.0,
      "reward_label": "excellent",
      "skill_used": "goap-research-ed25519",
      "outcome_summary": "Research completed with verified sources",
      "timestamp": "2026-02-15T14:30:00Z"
    }
  ],
  "patterns": [
    {
      "pattern_id": "banking-stage-2-bottleneck",
      "description": "Banking projects struggle in research phase",
      "confidence": 0.85,
      "actionable_advice": "Allocate extra time for regulatory research"
    }
  ],
  "count": 3,
  "domain": "banking"
}
```

#### Использование после query

1. Log: `"Loaded {count} historical patterns for {stage} in {domain} domain"`
2. Если `records` не пустые — review top 3 для relevant approaches
3. Если `patterns` не пустые — apply actionable advice
4. Если всё пустое (первый запуск) — продолжить нормально
5. **Increment usage_count** — для каждого применённого record (top 3) инкрементировать `usage_count` в файле и индексе

---

### 2.2. memory_store(result, reward)

Вызывается на каждом **checkpoint** после ответа пользователя.

#### Input

```json
{
  "project_slug": "bank-kc-automation",
  "domain": "banking",
  "stage": "stage-2",
  "stage_name": "Research",
  "skill_used": "goap-research-ed25519",
  "reward": 0.7,
  "reward_label": "good",
  "reward_reason": "User requested additional regulatory depth",
  "context": {
    "stage_number": 2,
    "domain_detected": "banking",
    "upstream_promises": ["DISCOVERY_COMPLETE", "CASE_EXPLORED"],
    "patterns_loaded": 3,
    "time_budget_pct": 15.0,
    "agent_count": 3
  },
  "outcome": {
    "artifacts_created": ["02_research_findings.md"],
    "checkpoint_response": "углуби регуляторику",
    "iterations": 2,
    "promise_emitted": "RESEARCH_PARANOID_PASSED"
  }
}
```

#### Алгоритм (6 шагов)

1. **Ensure directory** — создать `{memory-root}/{domain}/{slug}/` если не существует
2. **Build record** — полный RewardRecord JSON
3. **Compute expires_at** — `current_date + retention_days` (default 90)
4. **Generate filename** — `{stage}_{ISO-timestamp}.json`
5. **Write file** — JSON в `{memory-root}/{domain}/{slug}/{filename}`
6. **Log** — `"Stored reward {reward} ({label}) for {stage} of {slug}"`

#### RewardRecord Schema

```json
{
  "id": "bank-kc_stage-2_2026-02-15T14:30:00Z",
  "version": "1.0",
  "timestamp": "ISO-8601",
  "project_slug": "bank-kc-automation",
  "domain": "banking",
  "stage": "stage-2",
  "stage_name": "Research",
  "skill_used": "goap-research-ed25519",
  "reward": 0.7,
  "reward_label": "good",
  "reward_reason": "...",
  "context": { "..." },
  "outcome": { "..." },
  "promise_tag": "RESEARCH_PARANOID_PASSED",
  "usage_count": 0,
  "expires_at": "2026-05-15T14:30:00Z"
}
```

#### Namespace structure

```
{memory-root}/
├── config.json
├── _patterns/
│   └── domain-patterns.json
├── _stats/
│   └── reward-summary.json
├── banking/
│   └── bank-kc-automation/
│       ├── stage-0_2026-02-15T10:00:00Z.json
│       ├── stage-1_2026-02-15T10:30:00Z.json
│       └── stage-2_2026-02-15T14:30:00Z.json
└── retail/
    └── ecommerce-recommendations/
        └── ...
```

---

### 2.3. Reward Tracker (reward-tracker.md)

Аналитический движок, вычисляющий агрегаты и обнаруживающий паттерны.

#### 6-шаговый процесс

**Step 1: Load All Records** — рекурсивный scan `{memory-root}/`, исключая config/patterns/summary. Parse каждый JSON как RewardRecord. Exclude expired.

**Step 2: Per-Stage Averages**

```json
{
  "stage-2": {
    "avg_reward": 0.85,
    "total_runs": 12,
    "distribution": { "excellent": 8, "good": 3, "needs_work": 1, "failed": 0 },
    "trend": "stable",
    "best_project": "bank-kc",
    "worst_project": "healthcare-ai"
  }
}
```

**Trend Detection:** Делим records на 2 половины по timestamp. Newer_avg - Older_avg > 0.15 → "improving", < -0.15 → "degrading", иначе → "stable". Минимум 4 записи.

**Step 3: Per-Domain Averages**

```json
{
  "banking": {
    "avg_reward": 0.72,
    "total_runs": 18,
    "stage_breakdown": { "stage-0": 0.85, "stage-1": 0.90, "stage-2": 0.55 },
    "bottleneck_stage": "stage-2",
    "strongest_stage": "stage-1"
  }
}
```

**Bottleneck Detection:** Этап с минимальным средним reward в домене. Только если 3+ записей.

**Step 4: Per-Skill Effectiveness**

```json
{
  "goap-research-ed25519": {
    "overall_avg": 0.74,
    "total_runs": 15,
    "by_domain": {
      "banking": { "avg": 0.65, "runs": 8 },
      "retail": { "avg": 0.85, "runs": 7 }
    },
    "best_domain": "retail",
    "worst_domain": "banking"
  }
}
```

**Step 5: Pattern Detection** — 6 правил:

| Правило | Условие | Шаблон паттерна |
|---------|---------|----------------|
| Stage Bottleneck | avg < 0.5 в домене, 3+ записей | "{domain} struggles in {stage}" |
| Stage Excellence | avg > 0.9 в домене, 3+ записей | "{domain} excels in {stage}" |
| Skill-Domain Mismatch | avg < 0.5 в одном домене, > 0.7 в другом | "{skill} underperforms in {domain}" |
| Improving Trend | trend = "improving" | "{stage} quality improving in {domain}" |
| Degrading Trend | trend = "degrading" | "{stage} quality degrading — investigate" |
| Time Overhead | avg iterations > 2.0 | "{domain} requires more iterations in {stage}" |

**Confidence:** `min(1.0, evidence_count / 10)`

**Step 6: Write Outputs** — `reward-summary.json` и `domain-patterns.json`

---

### 2.4. DreamEngine (dream-engine.md)

Фоновый процесс, строящий concept graphs и генерирующий cross-domain insights.

#### Trigger Evaluation

```json
{
  "version": "1.0",
  "last_dream_completed_at": null,
  "records_since_last_dream": 0,
  "pending_events": [],
  "config": {
    "time_threshold_minutes": 60,
    "volume_threshold": 20,
    "event_triggers_enabled": true
  }
}
```

**3 типа триггеров:**

| Триггер | Условие | Default |
|---------|---------|---------|
| Time | Прошло > threshold минут с последнего dream | 60 min |
| Volume | records_since_last_dream ≥ threshold | 20 records |
| Event | pending_events непустой и enabled | true |

#### Dream Execution Protocol (5 шагов)

**Step 1: Load Data** — check memory root, read summary + patterns, scan records, exclude expired, sort by reward DESC, take top 200. Exit if < 5 records.

**Step 2: Build Concept Graph** — nodes (domain, stage, skill, outcome) + edges (domain→stage, stage→skill, skill→outcome) weighted by reward. Per-node aggregates: avg_reward, count, trend.

**Step 3: Detect Cross-Domain Associations (4 метода):**
- 3a: Cross-domain stage comparison (gap > 0.15)
- 3b: Skill-domain mismatch (gap > 0.15)
- 3c: Stage correlation (co-occurrence of low rewards ≥ 3)
- 3d: Temporal trends (systematic reward changes)

**Step 4: Generate Insights** — for each association → Insight JSON (type, description, confidence, impact, rank_score). Sort by rank_score DESC, take top 20.

**Step 5: Store and Clean** — write `dream-{timestamp}.json`, enforce max 10 files, reset triggers.

#### Dream Result Schema

```json
{
  "version": "1.0",
  "dream_id": "dream-20260301-143022",
  "status": "completed",
  "trigger_reason": "volume",
  "started_at": "ISO-8601",
  "completed_at": "ISO-8601",
  "records_analyzed": 200,
  "concept_graph_nodes": 24,
  "concept_graph_edges": 36,
  "associations_found": 8,
  "insights": [ "..." ],
  "metadata": {
    "domains_covered": ["banking", "retail"],
    "stages_covered": ["stage-0", "stage-1", "stage-2"],
    "total_reward_records_in_memory": 42
  }
}
```

---

## 3. Orchestration — Оркестрация

### 3.1. Queen Protocol (queen-protocol.md)

10-шаговый lifecycle координатора верхнего уровня.

| Step | Name | Purpose | Failure Mode |
|------|------|---------|-------------|
| 1 | INIT | Создать project directory | Abort on error |
| 2 | HEALTH | Проверить ресурсы (skills, shards, constitution) | Abort on missing |
| 3 | LOAD | Загрузить memory + dream insights + brain | Graceful (proceed without) |
| 4 | DETECT | Классифицировать domain + set variables | Default "general" |
| 5 | SHARD | Загрузить governance shard для текущего этапа | Fallback to master config |
| 6 | ORCHESTRATE | Выбрать topology + assign model + spawn agents | Halt at checkpoint |
| 7 | MONITOR | Track execution + display checkpoints | HALT if skipped (INV-003) |
| 8 | COLLECT | Собрать артефакты + verify quality gates | Halt if mandatory missing |
| 9 | STORE | memory_store() + update dream triggers | Graceful (log and continue) |
| 10 | REPORT | Summary + list artifacts + time report | Always succeeds |

```
INIT → HEALTH → LOAD → DETECT → SHARD
                                  ↓
                             ORCHESTRATE
                                  ↓
                              MONITOR ←→ (repeat per stage)
                                  ↓
                             COLLECT → STORE → REPORT
```

#### Customization

- Steps 1-3 (INIT, HEALTH, LOAD) — **универсальные**, оставить как есть
- Step 4 (DETECT) — кастомизировать detection logic
- Step 5 (SHARD) — указать на ваш shard directory
- Step 6 (ORCHESTRATE) — определить ваши stages и topologies
- Steps 7-10 (MONITOR, COLLECT, STORE, REPORT) — **универсальные**

---

### 3.2. Topology Selection (topology-selection.md)

6 типов топологий для организации агентов внутри этапа.

#### Star

```
        Coordinator
       /     |     \
    Agent1  Agent2  Agent3
```

- **Координация:** централизованная
- **Communication:** hub-and-spoke
- **Fault tolerance:** medium
- **Scalability:** good
- **Best for:** простые параллельные задачи, multi-evaluator panels (изолированные)

#### Mesh

```
    Agent1 ←→ Agent2
       ↕          ↕
    Agent3 ←→ Agent4
```

- **Координация:** децентрализованная
- **Communication:** all-to-all
- **Fault tolerance:** high
- **Scalability:** limited (O(n²) communication)
- **Best for:** fault-tolerant research

#### Hierarchical

```
           Queen
          /     \
    Manager1    Manager2
    /    \      /    \
  W1     W2   W3    W4
```

- **Координация:** иерархическая
- **Communication:** parent-child
- **Fault tolerance:** medium
- **Scalability:** excellent
- **Best for:** 10+ агентов, multi-level tasks

#### Ring

```
    Agent1 → Agent2 → Agent3 → Agent4
       ↑                          |
       └──────────────────────────┘
```

- **Координация:** последовательная
- **Communication:** unidirectional
- **Fault tolerance:** low
- **Scalability:** limited (linear latency)
- **Best for:** iterative refinement (draft → review → polish)

#### Hybrid

Комбинация двух+ топологий. Разные части stage используют разные arrangements.

#### Adaptive

Начинает как Star, эволюционирует:
- Если disagreement > 3 points → switch to Mesh
- Если простая задача → stay Star
- Если complexity выше threshold → elevate to Hierarchical

#### Selection Guide

| Характеристика | Рекомендация |
|---------------|-------------|
| Независимые параллельные задачи | **Star** |
| Fault-tolerant research | **Mesh** |
| Multi-evaluator panel | **Star** (isolated) |
| Итеративное улучшение | **Ring** |
| Complex multi-level | **Hierarchical** |
| Heterogeneous sub-tasks | **Hybrid** |
| Uncertain complexity | **Adaptive** |

---

### 3.3. Background Workers (background-workers.md)

Non-blocking агенты для долгих операций.

#### Directory Structure

```
{workers-root}/
├── registry.json                    ← Managed by orchestrator ONLY
├── wkr-{YYYYMMDD}-{HHmmss}-{type}/
│   ├── status.json                  ← Written by worker
│   ├── stop-requested              ← Flag file (orchestrator creates)
│   ├── output/                      ← Worker output
│   └── error.log                    ← On failure
```

#### Registry Schema

```json
{
  "version": "1.0",
  "max_concurrent": 3,
  "workers": [
    {
      "worker_id": "wkr-20260301-143022-consolidate",
      "type": "consolidate",
      "status": "running",
      "model": "sonnet",
      "started_at": "ISO-8601",
      "completed_at": null,
      "output_dir": "...",
      "retry_count": 0
    }
  ]
}
```

#### 6 правил изоляции

1. Workers MUST only write to their own directory
2. Workers MUST NOT modify project files directly
3. Workers MUST NOT modify pipeline configuration
4. Workers MUST NOT spawn sub-agents
5. Workers MAY read project files (read-only)
6. Workers write deltas/reports that user decides whether to apply

#### Протоколы

| Операция | Шаги |
|---------|------|
| **Launch** | Validate type → check concurrency (max 3) → create dir → update registry → spawn agent → confirm |
| **Status** | Read registry → read each status.json → update registry → prune 24h old entries → display |
| **Stop** | Verify running → write stop-requested flag → update registry → worker exits gracefully |

#### Error Handling

- Max 2 retries per original request
- Each retry = NEW worker (new ID, incremented retry_count)
- retry_count ≥ 2 → permanently failed

---

### 3.4. Model Routing (model-routing.md)

3-tier система назначения моделей по сложности задачи.

| Tier | Model | Latency | Cost | Задачи |
|------|-------|---------|------|--------|
| 1 | haiku | ~500ms | 1x | Formatting, validation, structural checks, quick ranking |
| 2 | sonnet | ~2s | 15x | Research synthesis, analysis, judge panels, mutation workers |
| 3 | opus | ~5s | 75x | Creative design, complex solving, storytelling, architecture |

#### Enforcement Rules

1. **NEVER** Tier 3 для structural checks — wasteful
2. **NEVER** Tier 1 для judge panels — insufficient quality
3. **NEVER** Tier 1 для creative work — shallow output
4. **ALWAYS** specify model при spawn агента
5. Без спецификации → наследуется от parent (обычно Tier 3)

#### Cost Impact

```
Without routing: 20 tasks × Tier 3 = 20 × 75x = 1500x
With routing:    8×Tier1 + 8×Tier2 + 4×Tier3 = 8 + 120 + 300 = 428x
Savings: ~71%
```

---

## 4. Verification — Верификация

### 4.1. Witness Chain (witness-chain.md)

SHA-256 hash-chain для tamper-evident целостности артефактов.

#### Constants

```
NULL_HASH = "0000000000000000000000000000000000000000000000000000000000000000"
CHAIN_FILE = ".witness-chain.json"
HASH_PREFIX = "sha256:"
```

#### Hash Computation

```bash
# Platform detection
if command -v sha256sum &>/dev/null; then SHA_CMD="sha256sum"
elif command -v shasum &>/dev/null; then SHA_CMD="shasum -a 256"
fi

# File hash
HASH=$(${SHA_CMD} "path/to/file.md" | awk '{print $1}')

# Chained hash
CHAINED_HASH=$(printf '%s%s' "${FILE_CONTENT}" "${PREV_HASH}" | ${SHA_CMD} | awk '{print $1}')
```

#### Chain Operations

| Операция | Preconditions | Procedure |
|---------|--------------|-----------|
| **Genesis** | First artifact created, no chain file | Compute hash with NULL_HASH → create chain file |
| **Append** | Chain exists, new artifact created | Read last hash → compute chained hash → append record |
| **Verify** | Chain file exists | Walk chain, recompute each hash, compare |
| **Repair** | Artifact legitimately modified | Rehash modified → cascade rehash ALL downstream |

#### Chain File Schema

```json
{
  "project_slug": "bank-kc-automation",
  "created_at": "ISO-8601",
  "last_updated": "ISO-8601",
  "chain": [
    {
      "sequence": 0,
      "stage": "stage-0",
      "artifact": "00_discovery.md",
      "hash": "sha256:<64 hex>",
      "previous_hash": "sha256:0000...0000",
      "timestamp": "ISO-8601",
      "promise_tag": "DISCOVERY_COMPLETE"
    }
  ]
}
```

---

### 4.2. Judge Attestation (judge-attestation.md)

Криптографическое доказательство независимости оценщиков.

#### Hash Construction

```
evaluation_hash = SHA-256(judge_id | artifact_hash | score | rationale_summary)
```

- `judge_id` — уникальный ID роли судьи
- `artifact_hash` — SHA-256 оцениваемого артефакта
- `score` — числовой score с 1 decimal ("8.2")
- `rationale_summary` — первые 500 символов rationale

#### Chain Linking

```
Judge 1: previous = NULL_HASH
Judge 2: previous = Judge 1's evaluation_hash
Judge 3: previous = Judge 2's evaluation_hash
```

#### Isolation Proof Logic

1. **Hash Independence** — each evaluation_hash computed from judge's own data only
2. **Chain Integrity** — previous_attestation_hash links order, NOT scores
3. **Timestamp Monotonicity** — timestamps strictly increasing

#### Attestation Schema

```json
{
  "evaluations": [
    {
      "evaluation_id": "bto-eval-001",
      "artifact_path": "path/to/artifact.md",
      "artifact_hash": "sha256:<hex>",
      "panel_size": 3,
      "attestations": [
        {
          "judge_id": "domain-expert",
          "score": 8.2,
          "rationale_summary": "...",
          "evaluation_hash": "sha256:<hex>",
          "timestamp": "ISO-8601",
          "previous_attestation_hash": "sha256:0000...0000"
        }
      ],
      "final_score": 7.94,
      "weights": { "domain-expert": 0.4, "critic": 0.3, "auditor": 0.3 }
    }
  ]
}
```

#### Meta-Judge

При disagreement > 3 points → meta-judge MAY reference other judges' scores (это synthesizer, не independent evaluator). Appended to attestation chain.

---

### 4.3. Audit Trail (audit-trail.md)

Единая история всех решений и оценок.

#### Directory Structure

```
{audit-root}/
├── audit-log.json              ← Master event log
├── witness-chains/
│   └── {project-slug}.json     ← Per-project witness chain
├── attestations/
│   └── {evaluation-id}.json    ← Per-evaluation attestations
└── decisions/
    └── {decision-id}.json      ← Decision records
```

#### 10 типов событий

| Event Type | Source Protocol |
|-----------|---------------|
| `artifact_created` | witness-chain.md |
| `artifact_verified` | witness-chain.md |
| `artifact_modified` | witness-chain.md (repair) |
| `evaluation_started` | judge-attestation.md |
| `evaluation_completed` | judge-attestation.md |
| `checkpoint_reached` | checkpoint-protocol.md |
| `checkpoint_approved` | checkpoint-protocol.md |
| `checkpoint_revised` | checkpoint-protocol.md |
| `reward_stored` | memory-protocol.md |
| `decision_made` | (this protocol) |

#### Retention

- Audit logs retained for **lifetime of project** (no auto-expiry)
- NOT subject to memory protocol's expiration rules
- On brain export: audit trail included as metadata (event counts, not full events)

---

## 5. Trust Tiers — Классификация доверия

### 5.1. Tier System (tier-system.md)

| Tier | Label | Requirements | Confidence |
|------|-------|-------------|-----------|
| 3 | Verified | Eval tests + panel score ≥ 8.5 | Highest — production-ready |
| 2 | Validated | Panel score ≥ 7.0 | High — tested |
| 1 | Structured | SKILL.md + references/ or modules/ | Medium — organized |
| 0 | Advisory | Basic SKILL.md | Low — use with caution |

#### Classification Checklist

```
[ ] SKILL.md exists                                    → Tier 0 minimum
[ ] SKILL.md has complete protocol                     → Tier 0
[ ] references/ OR modules/ OR structured output       → Tier 1
[ ] Multi-evaluator panel score ≥ 7.0                  → Tier 2
[ ] Deterministic eval tests exist and pass            → Tier 3
[ ] Panel score ≥ 8.5                                  → Tier 3
```

#### Enforcement

| Context | Rule |
|---------|------|
| Production pipeline | Warn on Tier 0 skills |
| Critical decisions | Require Tier 2+ |
| Evaluation panels | Judges should be Tier 1+ |
| Knowledge export | Include tier metadata |

---

### 5.2. Promotion Protocol (promotion-protocol.md)

#### Tier 0 → Tier 1

**Requirements:** Complete SKILL.md + references/ OR modules/ OR structured output
**Process:** Structural check (no formal evaluation)

#### Tier 1 → Tier 2

**Requirements:** Pass 3-judge panel with avg score ≥ 7.0, no judge < 5.0
**Panel:** Domain Expert (0.4) + Critic (0.3) + Completeness Auditor (0.3)
**Process:** Submit for evaluation → judges score independently → compute weighted average → if ≥ 7.0 → promote

#### Tier 2 → Tier 3

**Requirements:** Score ≥ 8.5 + deterministic eval test suite (5+ tests) passing
**Process:** Create test cases → verify all pass → re-evaluate or use existing score ≥ 8.5 → promote

#### Demotion

| Trigger | Demotion |
|---------|---------|
| Eval tests start failing | Tier 3 → Tier 2 |
| Re-evaluation score drops | Tier 2 → Tier 1 |
| Materials removed | Tier 1 → Tier 0 |

#### Cross-Project Transfer

При импорте скилла из другого проекта, tier = **recommendation**:
1. Accept as-is (trust source)
2. Require re-evaluation (verify locally)
3. Demote by one tier (conservative)

---

## 6. Platform — Мультиплатформенность

### 6.1. Adapter Registry (adapter-registry.md)

| Platform | Config Format | Max Size |
|----------|--------------|---------|
| Claude Code | `.claude/` directory | Native (no limit) |
| Cursor | `.cursorrules` flat file | < 10K tokens |
| OpenCode | `.opencode/` directory | No hard limit |
| GitHub Copilot | `.github/copilot-instructions.md` | < 8K tokens |

#### Translation Rules

| Source Element | Cursor | OpenCode | Copilot |
|---------------|--------|----------|---------|
| Skill loading | Inline summary | Separate .md | Inline summary |
| Agent tool refs | "Break into sub-tasks" | "Break into sub-tasks" | "Break into sub-tasks" |
| Model routing | Omit | Omit | Omit |
| Promise tags | Keep as markers | Keep as markers | Keep as markers |
| Governance shards | Omit (single-file) | Include | Omit (single-file) |

#### Adding New Platform

1. Create template: `platform/templates/{name}.md`
2. Add to registry table
3. Define: Target Format, Generation Protocol, Content Adaptation, Size Constraints, Example Output

---

## Error Handling — Сводная таблица

| Ситуация | Поведение |
|---------|----------|
| Memory root не существует | query → empty; store → create |
| config.json missing | Use defaults (90 days, 10 results) |
| Corrupted JSON | Skip file, log warning, continue |
| Write failure | Log error, continue (non-blocking) |
| sha256sum not available | Log WARNING, skip witness chain |
| Worker exceeds concurrency | Reject (not queue) |
| Invariant HALT violation | Stop pipeline, report to human |
| Invariant WARN violation | Log and continue |
| Dream insufficient data | Exit with status, zero insights |
