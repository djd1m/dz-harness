---
name: health-advisor
description: >
  AI-помощник для анализа здоровья. Анализирует анализы крови, исследует лекарства,
  ищет врачей, составляет программы тренировок и питания.
  Точка входа для всех модулей Health Advisor.
  Триггеры: /health-advisor, "анализ здоровья", "проанализируй анализы",
  "health advisor", "помоги разобраться с анализами".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_note: "Master skill — orchestrates all Health Advisor modules"
---

# Health Advisor: AI-помощник для анализа здоровья

## Overview

Health Advisor — комплексный AI-скилл для анализа медицинских данных пациента. Обеспечивает пошаговую оценку лабораторных результатов, идентификацию синдромов и рисков, создание персонализированных рекомендаций по лекарствам, врачам, тренировкам и питанию. Все исследования выполняются в paranoid mode с обязательной PubMed-верификацией каждого факта через goap-research-ed25519.

## Emergency Protocol

> **КРИТИЧЕСКИ ВАЖНО.** Если при анализе данных пациента обнаружены показатели, требующие экстренной медицинской помощи, НЕМЕДЛЕННО прекратить обычный workflow и сообщить пациенту.

### Критические пороги (немедленная эскалация)

Эта таблица — ПРОИЗВОДНАЯ от канонического источника
`references/emergency-thresholds.md` (12 строк: 6 «СКОРАЯ ПОМОЩЬ» + 6 «Срочно к врачу»);
парность проверяется машинно (test/emergency-thresholds-parity.test.js, INV-11). Правки — сначала
в каноническом файле, затем здесь.

| Показатель | Критическое значение | Действие |
|---|---|---|
| Калий | <3.0 или >6.0 ммоль/л | **СКОРАЯ ПОМОЩЬ (103/112)** — риск аритмии |
| Глюкоза | <3.0 или >20.0 ммоль/л | **СКОРАЯ ПОМОЩЬ (103/112)** — гипо/гипергликемическая кома |
| Натрий | <120 или >160 ммоль/л | **СКОРАЯ ПОМОЩЬ (103/112)** — риск отёка мозга / судорог |
| Гемоглобин | <70 г/л | **СКОРАЯ ПОМОЩЬ (103/112)** — тяжёлая анемия |
| **Тропонин I/T** | **>0.04 нг/мл (или >99-й перцентиль)** | **СКОРАЯ ПОМОЩЬ (103/112)** — подозрение на инфаркт миокарда |
| **Лактат** | **>4.0 ммоль/л** | **СКОРАЯ ПОМОЩЬ (103/112)** — шок / сепсис / тяжёлая гипоперфузия |
| **D-димер** | **>500 нг/мл** | **Срочно к врачу (24 ч)** — подозрение на тромбоэмболию (ТЭЛА, ТГВ) |
| Тромбоциты | <50 x10⁹/л | **Срочно к врачу (24 ч)** — риск кровотечения |
| Креатинин | >350 мкмоль/л | **Срочно к врачу (24 ч)** — острая почечная недостаточность |
| АЛТ/АСТ | >500 Ед/л | **Срочно к врачу (24 ч)** — острое повреждение печени |
| ТТГ | >50 или <0.01 мМЕ/л | **Срочно к врачу (24 ч, эндокринолог)** — тиреотоксический криз / микседема |
| Кальций | <1.8 или >3.5 ммоль/л | **Срочно к врачу (24 ч)** — гипо/гиперкальциемический криз |

### Формат экстренного сообщения

```
⚠️ ВНИМАНИЕ: КРИТИЧЕСКИЙ ПОКАЗАТЕЛЬ

[Показатель]: [Значение] (критический порог: [порог])

ЭТО ТРЕБУЕТ НЕМЕДЛЕННОГО ОБРАЩЕНИЯ К ВРАЧУ.
Позвоните в скорую помощь: 103 (с мобильного: 112)
Или обратитесь в ближайшее отделение неотложной помощи.

Я НЕ ПРОДОЛЖАЮ стандартный анализ до подтверждения, что вы связались с врачом.
```

## Human-in-the-Loop (HITL) Policy

1. **Health Advisor НЕ ставит диагнозы** — только идентифицирует отклонения и синдромы
2. **Все рекомендации — информационные** — требуют подтверждения лечащим врачом
3. **Перед реализацией рекомендаций** — пациент ОБЯЗАН обсудить их с врачом
4. **Лекарственные назначения** — Health Advisor может предложить обсудить препарат с врачом, но НИКОГДА не назначает самостоятельно
5. **Checkpoint перед финальным отчётом** — подтверждение что пациент понимает, что это не медицинское назначение

## Patient Category Routing

| Категория | Маршрут | Ограничения |
|---|---|---|
| Мужчины 18-65 | Стандартный pipeline | Нет |
| Женщины 18-65 | Стандартный pipeline + учёт цикла, контрацептивов | Нет назначений гормональных препаратов |
| **Беременные** | **ТОЛЬКО Module 0-1** → направление к акушеру-гинекологу | **Не давать рекомендации по лекарствам, добавкам, тренировкам** |
| **Дети (<18 лет)** | **ТОЛЬКО Module 0-1** → направление к педиатру | **Не давать рекомендации по лекарствам, добавкам** |
| **Пожилые (>70 лет)** | Стандартный pipeline с поправками на возраст | Особые дозировки, риск падений при тренировках |
| **ХБП G3+ (СКФ <60)** | Стандартный pipeline + нефропротективные ограничения | Ограничение белка, калия, фосфора в питании |

## Dependencies

This skill requires:
- **analyst-manual-full:** базовый оркестратор (explore → research → solve)
- **explore:** для уточнения медицинских вопросов
- **goap-research-ed25519:** для верифицированного ресёрча с PubMed
- **problem-solver-enhanced:** для генерации персонализированных рекомендаций

Может быть использован standalone или как часть более крупной системы.

### Dependent Skills Detail

| Skill | Path | Purpose |
|-------|------|---------|
| health-advisor-research | `health-advisor-research.md` | Медицинский ресёрч (paranoid mode) |
| analyst-manual-full | `base/analyst-manual-full/SKILL.md` | Базовый оркестратор |
| explore | `base/explore/SKILL.md` | Уточнение задач |
| goap-research-ed25519 | `base/goap-research-ed25519/SKILL.md` | Верифицированный ресёрч |
| problem-solver-enhanced | `base/problem-solver-enhanced/SKILL.md` | Генерация решений |

> Paths above are relative to this master skill's own directory
> (`.claude/skills/health-advisor/skills/health-advisor/`). These base deps are bundled
> resources of the master — they are NOT separately-registered skills.

## Extended Skills (Optional)

The following OpenClaw-sourced skills can be integrated to enhance specific modules. They are optional — the core pipeline works without them. Trust Tiers are based on the BTO Layer 1+2 evaluation (2026-04-19).

| Module | Extended Skill | Purpose | Trust Tier |
|--------|---------------|---------|------------|
| 00 (Intake) | patiently-ai | Document simplification for patients | Tier 2 (Validated) — 8.0 |
| 01 (Profile) | preanalytical-guard | Pre-analytical guard: what distorts a value, checked BEFORE it is interpreted | First-party (not BTO-scored) |
| 01 (Profile) | lab-results | Lab result analysis and interpretation — **must be preceded by `preanalytical-guard`** | Tier 1 (Structured) — 4.4 |
| 01 (Profile) | clinical-targets | Клинические цели отдельно от лабораторных референсов (оба числа + цитата порога) | Tier 3 (Trusted) — 9.0 |
| 01 (Profile) | clinical-nlp-extractor | Entity extraction from clinical notes | Tier 1 (Structured) — 3.3 |
| 03 (Medications) | tooluniverse-drug-research | Comprehensive drug profiling (50+ tools) | Tier 3 (Trusted) — 8.8 |
| 03 (Medications) | tooluniverse-drug-drug-interaction | Drug-drug interaction checking | Tier 2 (Validated) — 7.7 |
| 05 (Exercise) | fitness-analyzer | Exercise analysis and program design | Tier 1 (Structured) — 6.6 |
| 06 (Nutrition) | nutrition-analyzer | Dietary analysis and recommendations | Tier 2 (Validated) — 7.9 |
| 07 (Research) | pubmed-search | PubMed literature search | Tier 1 (Structured) — 5.3 |
| 07 (Research) | multi-search-engine | Multi-engine web search | Tier 1 (Structured) — 5.7 |
| 08 (Monitoring) | health-trend-analyzer | Health trend analysis over time | Tier 2 (Validated) — 7.9 |
| 08 (Monitoring) | clinical-decision-support | Clinical document generation (GRADE, KM) | Tier 2 (Validated) — 8.3 |
| 03 (Medications) | drug-interaction-checker | Lightweight DDI checker with internal DB | Tier 2 (Validated) — 8.4 |
| 03 (Medications) | clinpgx | Pharmacogenomics via ClinPGx API | Tier 3 (Trusted) — 9.1 |
| 04 (Appointment) | emergency-card | Emergency medical card generator | Tier 3 (Trusted) — 9.3 |
| 04 (Appointment) | clinical-diagnostic-reasoning | Cognitive bias counter for medical decisions | Tier 3 (Trusted) — 9.0 |
| 04 (Appointment) | medical-entity-extractor | NER from patient text (symptoms, meds, labs) | Tier 2 (Validated) — 8.5 |
| 04 (Appointment) | clinicaltrials-database | ClinicalTrials.gov API v2 queries | Tier 3 (Trusted) — 9.0 |
| 05 (Exercise) | rehabilitation-analyzer | Rehab tracking: ROM, MMT, recovery phases | Tier 2 (Validated) — 8.5 |
| 06 (Nutrition) | weightloss-analyzer | BMR, TDEE, energy balance analysis | Tier 2 (Validated) — 8.4 |
| 07 (Research) | deep-research | Autonomous multi-step research orchestrator | Tier 2 (Validated) — 8.5 |
| 08 (Monitoring) | sleep-analyzer | Sleep quality analysis, PSQI, circadian rhythm | Tier 2 (Validated) — 7.9 |

The extended skills are installed as prefixed bare skills — invoke each directly as
`/health-advisor-<skill-name>` (e.g. `/health-advisor-drug-interaction-checker`, `/health-advisor-lab-results`).
When an extended skill is available, the corresponding module MAY delegate subtasks to it. When
unavailable, the module falls back to the base research pipeline (goap-research-ed25519).

## Available Modules

Модули НЕ регистрируются как отдельные скиллы — они лежат ресурсами в `modules/` внутри директории
этого мастер-скилла. `ha-*` ниже — ВНУТРЕННИЕ фразы-триггеры маршрутизации, а не slash-команды:
из Claude Code вызываются только `/health-advisor` и `/health-advisor-<name>`.

| # | Module | Internal trigger phrase | Description |
|---|--------|-------------------------|-------------|
| 0 | Intake | `ha-intake` | Загрузка и распознавание анализов |
| 1 | Profile | `ha-profile` | Анализ профиля, синдромы, риски |
| 2 | Medications | `ha-meds` | Исследование лекарств и альтернатив |
| 3 | Doctors | `ha-doctors` | Поиск врачей по городу и специальности |
| 4 | Appointment | `ha-appointment` | Подготовка к приёму у врача |
| 5 | Exercise | `ha-exercise` | Программа тренировок |
| 6 | Nutrition | `ha-nutrition` | Анализ питания |
| 7 | Special | `ha-special` | Спецпрактики (голодание и т.п.) |
| 8 | Monitoring | `ha-monitoring` | План мониторинга |

## Startup Flow

При вызове `/health-advisor`:

```
1. Приветствие + краткое описание возможностей
2. Запрос данных:
   "Отправьте фото анализов крови или опишите свою ситуацию"
3. Распознавание + структурирование → sources/
4. Диалог для дополнения (возраст, вес, лекарства, город...)
5. Автоматический анализ профиля (Module 1)
6. Предложение модулей:
   "Что вас интересует?"
   □ Лекарства — исследую ваши назначения
   □ Врачи — найду лучших в вашем городе
   □ Тренировки — составлю программу
   □ Питание — проанализирую ваш рацион
   □ Всё вместе
7. Запуск выбранных модулей
```

## Research Protocol

Все исследования в Health Advisor выполняются через `health-advisor-research.md`, который использует:
- **explore** → для уточнения медицинского вопроса
- **goap-research-ed25519** → для верифицированного ресёрча с PubMed
- **problem-solver-enhanced** → для генерации рекомендаций

Paranoid mode включён по умолчанию. Каждый факт = ссылка на PubMed.

## File Structure (создаётся автоматически)

```
[workspace]/
├── sources/              # Транскрибированные анализы + КАНОНИЧЕСКИЙ raw-слой (1.7.0)
│   ├── patient_profile.md
│   ├── biochemistry_YYYY-MM-DD.md
│   ├── prescriptions_YYYY-MM.md
│   ├── raw/              # sources/raw/sha256-<64 hex>/ — НЕИЗМЕНЯЕМЫЕ архивы (только intake-archive)
│   ├── manifest.json     # ИНДЕКС: строка на каждый принятый файл (path, sha256, bytes, media_type)
│   └── LOG.jsonl         # append-only ЖУРНАЛ: строка на каждую попытку приёма, включая отказы
├── research/             # Исследования (по одному на тему)
│   ├── medications_*.md
│   ├── diet_foods.md     # Сводный файл питания
│   ├── diet_beverages.md # Сводный файл напитков
│   ├── exercise_program.md
│   └── *.html            # HTML-версии
├── analysis/             # Аналитические записки
│   ├── prescription_analysis.md
│   ├── dynamics_report.md
│   └── *.html
└── doctors/              # Папки для врачей
    └── [doctor-name]/
        ├── 00_instructions.html
        └── [documents].html
```

## Output Conventions

- Каждый отчёт, где есть значение аналита, называет путь профиля и дату свёртки (`as-of`), из которой это значение получено — число без поколения нечитаемо задним числом
- Все файлы в MD + HTML
- HTML конвертация — формы A/B ниже; парность .md ↔ .html проверяет `check` (exit 1 при непарном .md)
- Форматы для пациента — `formats/questions-for-doctor.md`, `formats/evaluate-doctor-answer.md`,
  `formats/plain-language-explanation.md`, `formats/prognosis-horizons.md` (признание погрешности
  модели — ДО чек-листа; прогноз — всегда двумя горизонтами)
- Сводные файлы обновляются инкрементально (не дублировать!)
- Сводная таблица в конце каждого сводного файла
- Глоссарий в конце сложных документов
- Видео-ссылки для упражнений
- Ссылки на покупку для лекарств/добавок
- Ссылки на профили для врачей
- Дисклеймер в каждом документе

Команды конвертации и проверки (формы, работающие СЕГОДНЯ, — против установленной версии или
явного локального дерева):

```bash
# A. Внутри установленного скилла (.claude/skills/health-advisor/) — работает на установленной версии, без npm:
node assets/html-template.js research/diet_foods.md

# B. Из дерева пакета — путь к бинарю указан явно, поэтому cwd не важен:
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js render research/diet_foods.md
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js check
```

Короткая форма через `npx` (глаголы `render`/`check`) станет доступна начиная с первого релиза,
опубликованного после этого среза — опубликованная сейчас `1.4.2` этих глаголов не имеет; до тех
пор используйте формы A (внутри установленного скилла) или B (из дерева пакета).

## Communication Style

- В чат: краткая сводка + вердикты (✅ ❌ ⚠️)
- В файлы: полный анализ с источниками
- Медицинские термины: расшифровывать при первом использовании
- Аббревиатуры: всегда с пояснением (ЛПНП = «плохой» холестерин)
- Всегда отправлять файлы как вложения после сводки

## Anti-Patterns

| Анти-паттерн | Сигнал обнаружения | Исправление |
|---|---|---|
| Пропуск Intake (Module 0) | Анализ без загруженных данных | **BLOCK** — всегда начинать с Module 0 |
| Интерпретация лабораторного значения без преаналитической проверки | Вывод «низко / норма / высоко» по значению, для которого не проверены условия забора (время суток, натощак, washout после голодания и нагрузки, сон, повтор) | **BLOCK** — сначала `preanalytical-guard`, интерпретируется только допущенный им набор |
| Общий тестостерон без ГСПГ (SHBG) | Суждение по общему тестостерону, когда ГСПГ нет в том же наборе | **BLOCK** — назначить ГСПГ; общий тестостерон в одиночку не отделяет сдвиг связывающего белка от реального изменения |
| Анализ без Profile (Module 1) | Переход к Medications/Exercise без Module 1 | **BLOCK** — Module 1 обязателен для всех downstream |
| Значение аналита из памяти разговора, а не перечитанное из профиля в этом же вызове | В выводе стоит число, для которого в этом же вызове не было `session.readAnalyte()` — оно «уже называлось выше» | **BLOCK** — открыть сеанс `openCase({profilePath, asOf})` и перечитать значение; число из контекста реально, но неизвестного поколения |
| Вывод при созревшем блокирующем открытом вопросе, который просто НАЗВАН | Вывод в области вопроса выпущен с оговоркой «вопрос tg-recheck учтён» вместо ответа на него | **BLOCK** — «назвал, но не решил» это тихий обход; ответить на вопрос и записать ответ (`questions answer`), флага обхода нет |
| Цитата факта, свежесть которого не `FRESH`, без баннера | В отчёте есть ссылка на источник, у которого истёк TTL перепроверки или вовсе нет `fetch_date`, и нет строки `⚠ УСТАРЕЛО — НУЖНА ПОВТОРНАЯ ВЫБОРКА` | **BLOCK** — либо перевыбрать источник, либо явный `acknowledgeStale: {reason}`; баннер печатается всегда и не отключается |
| Факт без PubMed-ссылки | Медицинское утверждение без `[Author, Journal](pubmed.ncbi...)` | Найти источник или пометить `[UNVERIFIED]` |
| Пропуск дисклеймера | Выходной документ без строки «не является медицинской рекомендацией» | Добавить в каждый файл |
| Игнорирование contraindications | Рекомендация тренировок без проверки стресс-теста при атеросклерозе | Проверить Emergency Protocol + Patient Category Routing |
| Назначение лекарств | Агент «назначает» препарат вместо «рекомендует обсудить с врачом» | Переформулировать: «обсудите с врачом возможность назначения X» |
| Диагностика | Агент ставит диагноз: «у вас метаболический синдром» | Переформулировать: «ваши показатели соответствуют критериям метаболического синдрома — обсудите с врачом» |
| Игнорирование категории пациента | Рекомендации по тренировкам беременной | Проверить Patient Category Routing |
| Критические показатели без эскалации | Калий 2.8 обработан как обычное отклонение | **BLOCK** — активировать Emergency Protocol |
| Дублирование файлов | Создание нового файла вместо обновления сводного | Обновлять diet_foods.md, diet_beverages.md, exercise_program.md инкрементально |
| Отсутствие глоссария | Документ с аббревиатурами без расшифровки | Добавить Приложение: Глоссарий |
| Непроверенные ссылки на врачей | Рекомендация врача с рейтингом <4.0 или без проверки отзывов | Верифицировать рейтинг на ProDoctorov/NaPopravku |
| Оценка ответа врача без признания погрешности | Документ без блока `<!-- ha:fallibility-acknowledgment -->`, либо признание НИЖЕ чеклиста | **BLOCK** — без признания (и до чеклиста) формат превращается в инструмент давления на врача |
| Вопрос-назначение вместо вопроса-находки | «попросите назначить X» в списке вопросов | Показать находку и спросить, что она значит |
| Прогноз одной величиной | Вывод содержит срок жизни без срока дееспособности (или наоборот) | **BLOCK** — привести обе величины (или отказать в обеих) и связать с целью пациента |
