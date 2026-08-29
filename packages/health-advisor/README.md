# @dzhechkov/health-advisor

**AI-помощник для анализа здоровья — установи одной командой, используй с Claude Code**

- Загрузите анализы, получите понятную интерпретацию с научными ссылками
- Проверьте лекарства на совместимость и побочные эффекты
- Получите персональный план тренировок, питания и мониторинга

---

## Быстрый старт (30 секунд)

```bash
npx @dzhechkov/health-advisor init
```

`init` устанавливает скиллы в `.claude/skills/` как **обычные (bare) скиллы** — Claude Code
подхватывает их автоматически при открытии проекта, **без маркетплейса и на любой версии CC**.
Скиллы вызываются напрямую:

- мастер-оркестратор — **`/health-advisor`**
- медицинские скиллы — **`/health-advisor-drug-interaction-checker`**, **`/health-advisor-lab-results`**, …
  (префикс `health-advisor-`)

Префикс исключает коллизии с уже установленными скиллами (`explore`, `deep-research` и т.п.); модули,
промпты и базовые зависимости оркестратора лежат внутри его директории как ресурсы и **не**
регистрируются как отдельные скиллы.

Готово! Откройте Claude Code в папке проекта и скажите:

> "Проанализируй мои анализы крови"

---

## Как устроена система

Health Advisor состоит из двух слоёв:

### Базовые скиллы (ядро)
Это оркестратор и 9 модулей, которые Claude Code загружает автоматически:

| Модуль | Фраза-триггер (внутренняя) | Что скажите Claude | Что получите |
|--------|---------------------------|-------------------|--------------|
| Intake | `ha-intake` | "Загрузи мои анализы" | Распознание PDF/фото, сохранение в проект |
| Profile | `ha-profile` | "Проанализируй мой профиль" | Синдромы, риски, динамика показателей |
| Medications | `ha-meds` | "Исследуй лекарство X" | Профиль лекарства, альтернативы, совместимость |
| Doctors | `ha-doctors` | "Найди эндокринолога в Москве" | ТОП врачей с рейтингами и контактами |
| Appointment | `ha-appointment` | "Подготовь к приёму у врача X" | Список анализов, вопросы, инструкция |
| Exercise | `ha-exercise` | "Составь программу тренировок" | План с учётом диагнозов и оборудования |
| Nutrition | `ha-nutrition` | "Проанализируй продукт X" | Влияние на ваши показатели с PubMed ссылками |
| Special | `ha-special` | "Безопасно ли мне голодание?" | Исследование практики с доказательной базой |
| Monitoring | `ha-monitoring` | "Составь план мониторинга" | График анализов и обследований |

> **`ha-*` — это НЕ slash-команды.** Модули не регистрируются как отдельные скиллы: они лежат
> ресурсами внутри директории мастер-скилла, а `ha-*` — внутренние имена, по которым оркестратор
> маршрутизирует запрос. Из Claude Code вызываются только `/health-advisor` (мастер) и
> `/health-advisor-<name>` (расширенные скиллы). Пользуйтесь колонкой «Что скажите Claude».

Базовые скиллы работают самостоятельно. Extended скиллы усиливают их точность и глубину.

### Аналитические скиллы (исследования)
Эти скиллы обеспечивают глубокий анализ и верификацию источников:

| Скилл | Когда используется | Что делает |
|-------|-------------------|------------|
| analyst-manual-full | "Проведи полный анализ..." | Трёхфазный pipeline: Explore → Research → Solve с контрольными точками |
| explore | "Разберись в задаче..." | Уточняющие вопросы, формирование Task Brief |
| goap-research-ed25519 | "Исследуй с проверкой источников" | Paranoid mode: каждый факт верифицирован, PubMed ссылки, Ed25519 подписи |
| problem-solver-enhanced | "Реши проблему..." | Структурированное решение задач с планом действий |

**Пример:** Вы говорите "Проведи полный анализ безопасности эзетимиба" →
1. **explore** уточняет задачу: какие аспекты важны? (DDI, побочные, эффективность)
2. **goap-research-ed25519** ищет в PubMed с верификацией каждого факта
3. **problem-solver-enhanced** формирует рекомендации с планом действий
4. Результат: отчёт с 30+ PubMed ссылками, GRADE-оценкой, дисклеймером

### Расширенные скиллы (extended)
25 специализированных скиллов (MEASURED 2026-08-09 в рабочем дереве, репродьюсер `node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js list` → `20 Base + 25 Extended`; скиллы `clinical-targets`, `preanalytical-guard`, `case-state` и `critical-appraisal` входят начиная с версии 1.5.0). Когда они установлены, базовые модули автоматически делегируют им подзадачи:

**Пример:** Вы говорите "Проанализируй мои анализы" →
1. Модуль Profile вызывает **lab-results** для интерпретации 34 показателей
2. Затем **health-trend-analyzer** строит динамику изменений
3. Затем **patiently-ai** упрощает результат понятным языком

Если extended скиллы не установлены — модули работают через базовый research pipeline.

---

## Пример: свободный запрос (без указания команды)

Необязательно знать команды. Просто опишите свою задачу:

> "У меня повышен холестерин и низкий витамин D, что делать?"

Health Advisor автоматически определит нужные модули и запустит pipeline:

**Шаг 1: Распознавание → health-advisor.md**
Триггер: "анализ здоровья" → выбирает Module 01 (Profile) + Module 02 (Medications)

**Шаг 2: Уточнение → explore**
"Какой именно холестерин повышен — ЛПНП, триглицериды? Есть ли свежие анализы?"

**Шаг 3: Исследование → goap-research-ed25519 (paranoid mode)**
Поиск в PubMed: "vitamin D deficiency treatment guidelines", "LDL reduction non-statin"
Каждый факт — с source URL, source-tier ceiling и явной confidence. Честная оговорка:
криптографическая Ed25519-верификация включается только при реальных ключах издателей
(`issuer_keys_available=True`) — PubMed/Cochrane/WHO подписанный контент не поставляют,
поэтому paranoid-планирование high-stakes целей без такой интеграции честно возвращает
`GOAL_UNREACHABLE`, а не фабрикует «верифицированный» план (детали — в SKILL.md навыка,
раздел "What strict and paranoid actually require").

**Шаг 4: Рекомендации → problem-solver-enhanced**
Формирует план действий с risk-benefit анализом:
- Увеличить D3 до 7500 МЕ + K2 + Mg → контроль 25(OH)D через 3 мес
- Рассмотреть эзетимиб как альтернативу статинам ([ESC/EAS 2019](https://pubmed.ncbi.nlm.nih.gov/31504418/))

**Шаг 5: Полный анализ → analyst-manual-full**
При запросе "проведи полный анализ" — трёхфазный pipeline с контрольными точками:
explore → goap-research-ed25519 → problem-solver-enhanced

**Результат:** отчёт в MD + HTML с PubMed ссылками, GRADE-оценкой и медицинским дисклеймером.

> **Совет:** Чем подробнее вы опишете ситуацию (возраст, диагнозы, текущие препараты), тем точнее будут рекомендации.

---

## Установка: набор навыков — правило, а не список

Набор устанавливаемых навыков ЧИТАЕТСЯ с диска: каждый каталог с `SKILL.md`, за вычетом объявленного
списка тех, что не ставятся отдельно (их движок обращается за пределы своего каталога, а установщик
копирует навык В ОДИНОЧКУ — такая копия сломается при первом запуске). Объявление проверяется машиной
в обе стороны на каждом прогоне тестов: каждый УСТАНАВЛИВАЕМЫЙ навык обязан разрешать все свои
зависимости после одиночного копирования, а каждый УДЕРЖАННЫЙ — обязан действительно ломаться. Так
список не может ни протухнуть, ни удержать здоровый навык.

Проверка установленных навыков — глагол `validate`, см. таблицу команд ниже — теперь понимает обе
раскладки: и «health-advisor-‹навык›/», и голую «‹навык›/», которую пишет установщик dz. Раньше
голая установка читалась как 25 провалов — включая навыки, которые были на месте.

## Что умеет

### Сценарий 1: "У меня есть анализы крови"

1. Загрузите фото или PDF анализов в проект
2. Скажите Claude: **"Проанализируй мои анализы крови"**
3. Получите:
   - Интерпретацию каждого показателя с референсными диапазонами
   - Выявление синдромов и рисков
   - Динамику изменений на графиках
   - Понятное объяснение без медицинского жаргона

**Используемые скиллы:** preanalytical-guard (первым — проверяет условия забора), lab-results,
health-trend-analyzer, patiently-ai

---

### Сценарий 2: "Мне назначили лекарство — безопасно ли?"

1. Скажите Claude: **"Исследуй лекарство метформин"**
2. Получите:
   - Полный профиль лекарства (механизм, показания, побочные эффекты)
   - Проверку взаимодействий с другими препаратами
   - Фармакогеномику — как ваши гены влияют на метаболизм лекарства
   - Ссылки на PubMed и клинические рекомендации

**Используемые скиллы:** tooluniverse-drug-research, drug-interaction-checker, clinpgx

---

### Сценарий 3: "Хочу план здоровья"

1. Скажите Claude: **"Составь план тренировок и питания"**
2. Получите:
   - Программу упражнений с расчётом MET и нагрузки
   - Анализ питания по RDA, нутриентам и калорийности
   - Анализ сна с оценкой PSQI
   - План мониторинга — что и когда пересдавать

**Используемые скиллы:** fitness-analyzer, nutrition-analyzer, sleep-analyzer, weightloss-analyzer

---

### Сценарий 4: "Готовлюсь к приёму у врача"

1. Скажите Claude: **"Подготовь меня к приёму у эндокринолога"**
2. Получите:
   - Список анализов, которые стоит сдать заранее
   - Экстренную медицинскую карточку (Emergency Card)
   - Вопросы, которые важно задать врачу
   - Поиск подходящих клинических исследований

**Используемые скиллы:** emergency-card, clinical-diagnostic-reasoning, clinicaltrials-database

---

### Сценарий 5: "Папка документов к приёму — в HTML" (render + check + форматы)

1. Скажите Claude: **"Собери вопросы к врачу по моим анализам и переведи документы в HTML"**
2. Агент строит вопросы по формату `formats/questions-for-doctor.md` (показать находку и
   спросить, что она значит — не требовать назначение), прикладывает
   `formats/evaluate-doctor-answer.md` (признание погрешности модели — ДО чек-листа)
   и рендерит каждый `.md` в самодостаточный HTML:

```bash
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js render research/diet_foods.md
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js check
```

Ожидаемый вывод:

```
rendered → /home/you/health/research/diet_foods.html   (template: bundled)
checked 1, paired 1
```

**Когда использовать:** `render` — после каждого создания/обновления пациентского `.md`
(шаблон всегда встроенный; чужой файл в каталогах-предках НИКОГДА не исполняется — ADR-004);
`check` — перед отправкой папки врачу: exit 1 означает, что остались `.md` без HTML-версии.

**Используемые форматы:** questions-for-doctor, evaluate-doctor-answer

---

### Сценарий 6: "Нужен научный ответ с доказательствами"

1. Скажите Claude: **"Исследуй влияние витамина D на иммунитет с PubMed ссылками"**
2. Получите:
   - Deep research с PMID-ссылками на конкретные исследования
   - Иерархию доказательств (мета-анализы, RCT, когорты)
   - GRADE-оценку качества доказательств
   - Поиск по 17 научным базам одновременно

**Используемые скиллы:** deep-research, pubmed-search, multi-search-engine

---

### Сценарий 7: "У меня архив документов из клиники" (`intake-archive`, v1.7.0)

Клиника отдала выгрузку одним zip. Руками его распаковывать **нельзя** — и не потому, что лень:
распаковка руками теряет всё, что делает медицинский корпус пригодным для работы. Что даёт команда
и чего не даёт `unzip`:

| Вопрос | `unzip` | `intake-archive` |
|---|---|---|
| Это точно тот архив, который прислали? | неизвестно | sha256 проверен **до разбора**, против дайджеста, полученного НЕЗАВИСИМО от архива |
| Не записал ли элемент файл ВНЕ папки? | может | `../`, абсолютные пути, `C:\`, обратный слэш, NUL и симлинки отвергаются **по имени** |
| Не съест ли zip-бомба диск? | съест | бюджеты на число элементов, размер, суммарный размер, степень сжатия и глубину пути — и по ОБЪЯВЛЕННЫМ, и по ФАКТИЧЕСКИМ байтам |
| Что если сломается на середине? | частичный корпус | не ляжет ничего: сначала staging, потом ОДИН атомарный `rename` |
| Что вообще лежит в корпусе? | что попало на диск | `sources/manifest.json` — строка на файл: sha256, размер, тип, дата приёма, редактированный источник |
| Что пытались принять? | нигде не записано | `sources/LOG.jsonl` — append-only, строка на попытку, **включая отказы** |
| Принять тот же архив дважды? | дубликаты | идемпотентно: без скачивания, без переразбора, одна строка `already-ingested` |

**Когда применять:** любой архив документов пациента — выгрузка из клиники, пачка сканов, zip от
лаборатории. Не применять: одиночный файл (это `sources/` напрямую), не-zip форматы (tar/7z/rar —
отвергаются по имени), зашифрованные архивы.

Формы вызова (`<…>` — подставьте своё; `--expect-sha256` для URL берётся **от отправителя**, не из URL):

```bash
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js intake-archive --workspace <dir> --url <https://storage.example/labs.zip> --expect-sha256 <64-hex>
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js intake-archive --workspace <dir> --file <~/Downloads/labs.zip>
```

Ниже — те же вызовы **конкретно**, и они ПРОГОНЯЮТСЯ гейтом документации
(`test/output-conventions-executable.test.js` запускает каждую строку и требует exit 0 — поэтому
вывод ниже не набран руками). `labs.zip` лежит в текущем каталоге, воркспейс — он же:

```bash
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js intake-archive --workspace . --file labs.zip --dry-run
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js intake-archive --workspace . --file labs.zip
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js intake-archive --verify --workspace .
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js intake-archive --workspace . --file labs.zip
```

Реальный вывод второй строки (архив из трёх файлов):

```
ingested 3 file(s) from archive sha256:f7e9503cba6f34efe4f4ea43a340aa91223a86217c0b720a60f9f6b21ca18e93
  raw zone:  /home/u/health/ivan/sources/raw/sha256-f7e9503cba6f34efe4f4ea43a340aa91223a86217c0b720a60f9f6b21ca18e93
  catalog:   +3 new row(s), 0 already present
    labs/2026-08-01-report.pdf  52 bytes  application/pdf  sha256 286abc236f8b5212…
    scans/thyroid.jpg  16 bytes  image/jpeg  sha256 36e51f40a0b3fd6e…
    structured/values.json  43 bytes  application/json  sha256 85875671afdb3fcc…
```

Проверить корпус позже — перечитывает каталог с диска и **пересчитывает** sha256 каждого файла
(не сверяет с памятью предыдущего запуска, иначе это была бы не проверка, а самоотчёт):

```bash
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js intake-archive --verify --workspace <dir>
```

```
intake-archive --verify /home/u/health/ivan
  catalog rows: 3  re-verified: 3  files in raw zone: 3
  OK — every catalogued file re-hashes to its recorded sha256, and every file in the raw zone is catalogued.
```

Повторный приём того же архива — идемпотентен (ни байта по сети, ни байта на диск):

```
already ingested: sha256-f7e9503cba6f34efe4f4ea43a340aa91223a86217c0b720a60f9f6b21ca18e93 — nothing was downloaded, extracted or written.
  3 catalogued file(s) already present at /home/u/health/ivan/sources/raw/sha256-f7e9…8e93
```

Отказ — громкий и **именованный**, а воркспейс после него байт-в-байт тот же (плюс одна строка в
`LOG.jsonl`, потому что отказ без следа нельзя разобрать):

```
$ node .../bin/health-advisor.js intake-archive --workspace <dir> --file <hostile.zip>
PathEscapeError: entry name escapes its destination: "../escape.pdf"
$ echo $?
1
```

Коды выхода: `0` принято / уже принято / `--verify` чисто · `1` **именованный** отказ или дрейф ·
`2` ошибка использования. `--json` отдаёт тот же код и несёт различающую личность отказа в
`error.code` — ветвиться в скрипте нужно по нему, а не по номеру.

Строка каталога (`sources/manifest.json`) — реальная, из того же запуска:

```json
{
  "entry_id": "0f44938c8e03bfbf0270df68e8d10362",
  "path": "labs/2026-08-01-report.pdf",
  "stored_at": "sources/raw/sha256-f7e9503c…8e93/labs/2026-08-01-report.pdf",
  "sha256": "286abc236f8b52124b441cf791ee792f6c6b515f38a14706d0abffc9183c7db6",
  "bytes": 52,
  "media_type": "application/pdf",
  "ingested_at": "2026-08-17T15:52:36.857Z",
  "archive_id": "sha256:f7e9503cba6f34efe4f4ea43a340aa91223a86217c0b720a60f9f6b21ca18e93",
  "source": { "kind": "local-file", "url_redacted": null, "url_sha256": null,
              "local_path": "labs-2026-08-17.zip", "digest_source": "local-stream" }
}
```

`digest_source` читается буквально: `caller` — дайджест дал вызывающий (для URL это единственный
вариант, флаг обязателен), `local-stream` — посчитан с локального файла. Архив, посчитавший себя
сам, никогда не выглядит как заверенный кем-то.

#### Канонический layout первичных данных (сведение двух деревьев, v1.7.0)

```
<workspace>/
  sources/
    raw/sha256-<64 hex>/     НЕИЗМЕНЯЕМЫЕ принятые архивы — пишет только intake-archive
    manifest.json            ИНДЕКС: строка на каждый принятый файл
    LOG.jsonl                append-only ЖУРНАЛ: строка на каждую попытку, включая отказы
    *.md + *.html            deliverables (гейт парности действует ВНЕ raw/)
  research/ analysis/ doctors/
```

До 1.7.0 layout был описан в четырёх местах, а `health-trend-analyzer` документировал ВТОРОЕ,
конкурирующее дерево (`data/profile.json`, `data/medical_records/**`). Теперь определение одно —
`lib/workspace-layout.js`, — и его импортируют все читатели.

- `sources/raw/**` **освобождён** от гейта парности `.md` ↔ `.html`: принятый первичный документ —
  не черновик, ждущий рендера. Всё остальное под `sources/` по-прежнему валит `ha check <dir>` с exit 1.
- **Принудительной миграции нет.** `data/**` ничем в 1.7.0 не читается, не переносится и не
  перезаписывается. Воркспейс без `data/` ведёт себя как раньше. Воркспейс С `data/` получает
  громкое `[LEGACY-LAYOUT]` — от `intake-archive` и его `--verify`, и ни от кого больше: `ha check <dir>`
  остаётся без warn-режима по своей доктрине (warn внутри гейта — это как гейт тихо умирает).
  Соответствие путей и то, у каких девяти источников канонического дома **пока нет**, — в
  `skills/health-trend-analyzer/data-sources.md`.
- Двойного молчаливого хранения нет: единственная цель записи — `sources/`.

#### Приватность — это граница, а не намерение (NFR-1)

- Принятые документы **никогда** не попадают в `~/.dz/brain`, `dz teach`, `dz recall` или любой
  общий стор паттернов (проверено grep-гейтом по всей поверхности, а не обещано).
- Сеть — только один переданный URL. Только `https:`; `user:pass@` отвергается; редиректы
  перепроверяются на КАЖДОМ шаге и ограничены по числу; литеральные приватные / loopback /
  link-local адреса отвергаются лексически. **Честная граница:** SSRF через DNS-резолв НЕ закрыт —
  имя, которое РЕЗОЛВИТСЯ в `169.254.169.254`, лексическую проверку проходит.
- Подпись presigned-URL не попадает ни в один долговечный файл: один редактор снимает userinfo,
  query и fragment до любой записи, а `url_sha256` сохраняет сопоставимость источника без хранения
  подписи.
- Воркспейс внутри git-репозитория без `.gitignore` на `sources/` даёт **громкое неподавляемое**
  предупреждение (предупреждение, не блокировка).
- `--workspace` внутри дерева пакета отвергается сразу: пакет — это то, что публикуется.

**Чего команда сознательно НЕ делает:** OCR, классификацию содержимого, транскрипцию, не-zip
форматы, zip64, зашифрованные архивы. Она переносит байты туда, где им можно доверять и где их
можно найти; понимать их — работа других скиллов, по `sources/manifest.json`.

**Используемые скиллы:** intake-archive (+ `case-state` для блокировки хранилища)

---

### Сценарий 8: "Вернуться к источнику" (`source_anchor`, v1.8.0)

В заключении стоит число. Через полгода вопрос: **из какого документа оно взято — и тот ли это ещё
документ?** До 1.8.0 ответа не было: `sources/manifest.json` знал, что за файлы приняты, а `labs[]`
знал, какие значения записаны, и ничто не связывало одно с другим.

`source_anchor` — это **ссылка-якорь**: `{entry_id, path, sha256}` — адрес одной строки каталога,
которая адресует один неизменяемый файл в raw-зоне. Поле **необязательное и аддитивное**: документ
без него полностью валиден и ведёт себя как раньше.

**Якорь — это АДРЕС, а не копия.** В нём никогда нет содержимого первички, её отрывка, источника
загрузки (`url_redacted` / `url_sha256` / `local_path`) и абсолютного пути. Ни якорь, ни содержимое
не попадают в общий brain (`dz teach` / `dz recall` / `.health-brain`) — граница проверена гейтом.

Шаг 1 — принять архив (та же команда, что в Сценарии 7):

```bash
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js intake-archive --workspace <dir> --file <labs.zip>
```

Шаг 2 — **отчеканить якорь** из реальной строки каталога (CLI-глагола нет — это осознанное решение
слайса; вызов идёт напрямую в модуль, как в Сценарии 7 параметризуются пути):

```bash
node -e "const s=require('/path/to/@dzhechkov/health-advisor/lib/source-anchor-store.js'); console.log(JSON.stringify(s.stampFromManifest({workspace:'<dir>', path:'labs/2026-08-01-report.pdf'}), null, 2))"
```

```json
{
  "schema": "ha-source-anchor-1",
  "entry_id": "0f44938c8e03bfbf0270df68e8d10362",
  "path": "labs/2026-08-01-report.pdf",
  "sha256": "286abc236f8b52124b441cf791ee792f6c6b515f38a14706d0abffc9183c7db6",
  "archive_id": "sha256:f7e9503cba6f34efe4f4ea43a340aa91223a86217c0b720a60f9f6b21ca18e93",
  "ingested_at": "2026-08-17T15:52:36.857Z"
}
```

Документа нет в каталоге → возвращается `null` (это обычный ответ, а не отказ). Якорь **никогда** не
синтезируется из строк вызывающего: все три обязательных поля приходят из строки, прочитанной с диска.

Шаг 3 — **приписать якорь строке `labs[]`** (через `withCaseLock` + atomic rename, как любая запись
case-state; повторная запись того же якоря — идемпотентный no-op, другого якоря — отказ
`AnchorConflictError`):

```bash
node -e "const s=require('/path/to/@dzhechkov/health-advisor/lib/source-anchor-store.js'); const w=require('/path/to/@dzhechkov/health-advisor/skills/case-state/engine/anchor-write.js'); const a=s.stampFromManifest({workspace:'<dir>', path:'labs/2026-08-01-report.pdf'}); w.stampLabRow({profilePath:'<dir>/profile.json', analyteId:'apoB', observedOn:'2026-08-01', sourceAnchor:a}).then(r=>console.log('stamped: ' + r.stamped))"
```

Шаг 4 — сколько текущих значений заякорено, видно на **существующем** глаголе `profile validate`
(новых глаголов слайс не добавляет — их по-прежнему пять):

```bash
node /path/to/@dzhechkov/health-advisor/skills/case-state/engine/cli.js profile validate <dir>/profile.json 2026-08-15
```

```
profile OK: /home/u/health/ivan/profile.json
  2 dated observations, 1 preanalytical context entries
  open_questions -> /home/u/health/ivan/open_questions.json (0 recorded)
questions due  as-of 2026-08-15: none
  anchored: 1/2 analytes carry a source_anchor
```

Шаг 5 — **вернуться к источнику**: sha256 пересчитывается ДО чтения, и байты выдаются только после
совпадения:

```bash
node -e "const s=require('/path/to/@dzhechkov/health-advisor/lib/source-anchor-store.js'); const a=s.stampFromManifest({workspace:'<dir>', path:'labs/2026-08-01-report.pdf'}); const r=s.readAnchoredBytes(a, {workspace:'<dir>', caseDir:'<dir>'}); console.log(JSON.stringify({verified:r.verified, bytes:r.bytes, sha256:r.sha256}))"
```

```json
{"verified":true,"bytes":52,"sha256":"286abc236f8b52124b441cf791ee792f6c6b515f38a14706d0abffc9183c7db6"}
```

Шаг 6 — **негатив: первичку подменили** (тем же числом байт, чтобы проверка размера её не увидела).
Отказ **именованный**, ничего не прочитано, код возврата ненулевой:

```bash
node -e "const s=require('/path/to/@dzhechkov/health-advisor/lib/source-anchor-store.js'); const a=s.stampFromManifest({workspace:'<dir>', path:'labs/2026-08-01-report.pdf'}); try { s.readAnchoredBytes(a, {workspace:'<dir>', caseDir:'<dir>'}); } catch (e) { console.error(e.name + ': ' + e.reason); process.exitCode = 1; }"
```

```
AnchorDriftError: anchor_sha256_drift
```

Флага, который прочитал бы байты после расхождения, нет. Устаревание — суждение, которое человек
может взять на себя (`makeCitedClaim` даёт `acknowledgeStale`); расхождение sha256 означает, что
**это не те байты, о которых был написан анализ**, и брать на себя тут нечего.

`caseDir` — **обязательный** параметр резолвера: `entry_id` — переносимая строка, а корпус — нет.
Якорь из чужого случая отвергается (`AnchorCrossCaseError`), а не молча резолвится в чужие байты.

**Честная граница (обе фразы, дословно):** чистый `resolveAnchor` доказывает, что *эти байты на диске
всё ещё совпадают со строкой, которую называет якорь*; `intake-archive --verify` доказывает, что
*весь корпус всё ещё совпадает со своим индексом*. Это разные проверки, и они дополняют друг друга.

Все шесть команд выше **прогоняются тестом** `test/anchor-readme-scenario-executable.test.js` — он
подставляет реальный воркспейс вместо `<dir>` и требует ровно этот вывод, включая отказ на шаге 6.

**Используемые скиллы:** case-state, intake-archive

---

### Сценарий 9: "Третий мозг — аналитика становится памятью" (`third-brain`, v1.9.0)

Сценарий 7 принёс в кейс **первичку**. Сценарий 8 научил возвращаться к ней от числа в заключении.
Остался третий слой, и до 1.9.0 его не было вовсе: **сами аналитические документы** — разбор
консилиума, трендовый анализ, заключение — нигде не индексировались. «Переиспользовать» означало
«вспомнить путь к файлу и перечитать его».

глагол `third-brain` кладёт **ПОЛНЫЙ** аналитический документ в `<workspace>/.health-brain` —
**сегрегированное** хранилище, куда `learning_bridge.py` уже носит дистиллированные уроки, — так что
через полгода документ находится по фразе **из его собственного текста**.

**Приватность — прямым текстом.** После ингеста в `<workspace>/.health-brain` лежит ВТОРАЯ копия
текста документа (разбитая на пассажи). Она локальная: сети в движке нет вообще (весь каталог
`skills/third-brain/` проходит тот же egress-скан, что и `lib/`, и ровно один файл в нём имеет право
запустить процесс). Ничего никуда не отправляется. Удалить — `rm -rf <workspace>/.health-brain`;
после этого не остаётся ничего. В **общий** `dz`-store не попадает ни байта — ни текст, ни `doc_id`,
ни sha256, ни путь; это проверяется тестом, который **обходит** общий store целиком и ищет там
канарейку из тела документа.

Шаг 1 — принять архив и отчеканить якорь (Сценарии 7 и 8, без изменений).

Шаг 2 — **зафайлить анализ**, сославшись на первичку, из которой он написан:

```bash
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js third-brain ingest analysis/synthesis.md --case ivanov-2026 --kind synthesis --date 2026-08-18 --anchor <entry_id> --workspace <dir> --json
```

```json
{
  "ok": true,
  "mode": "ingest",
  "case": "ivanov-2026",
  "kind": "synthesis",
  "date": "2026-08-18",
  "written": 2,
  "skipped": 0
}
```

Каждый пассаж записывается одной записью, первая строка которой — разбираемый заголовок
`ha-doc-1 doc_id=… case=… kind=… date=… chunk=n/m doc_sha256=… doc_path=… anchors=…`, а дальше идёт
текст пассажа дословно. Метаданные едут **в тексте записи**, а не в поле `type`: у стора закрытое
объединение из трёх значений, и `kind: 'consultation'` там молча стал бы `lesson-learned`.

Шаг 3 — **найти по фразе из тела**, а не по заголовку:

```bash
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js third-brain search "миопатия" --workspace <dir>
```

```
[synthesis 2026-08-18 chunk 2/2] analysis/synthesis.md — Кардиологическая линия (`cardiology:d9b4ac56f4ab`) и фармакологическая линия (`clinical-pharmacology:91496d6cfc3f`) не противоречат
```

Шаг 4 — **обратные ссылки**: от найденного документа обратно к первичным байтам, с пересчётом sha256:

```bash
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js third-brain backlinks <doc_id> --workspace <dir> --json
```

```json
{"ok":true,"incomplete":false,"anchors":[{"verified":true}]}
```

`incomplete: true` появляется, когда записей в сторе меньше, чем `chunk=n/m` объявляют сами
заголовки, — это **поиск по ключу**, а не ранжированный recall, поэтому «нашлось 3 из 5» не может
быть выдано за «все».

Шаг 5 — **повторный ингест того же документа ТОЙ ЖЕ командой** — успех, который ничего не пишет
(идемпотентность):

```bash
node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js third-brain ingest analysis/synthesis.md --case ivanov-2026 --kind synthesis --date 2026-08-18 --anchor <entry_id> --workspace <dir> --json
```

```json
{"ok":true,"written":0}
```

**«Той же командой» — не формальность.** Дедуп у стора идёт по ТОЧНОМУ тексту записи, а заголовок
`ha-doc-1` — часть этого текста, поэтому `--case`, `--kind`, `--date` и список `--anchor` входят в
личность записи. Повторный ингест с ДРУГИМ набором цитат — это не дубль, а другой факт филинга
(«тот же текст, но теперь известно, из какой первички он написан»), и он честно пишется новыми
записями. `doc_id` при этом не меняется: он считается только от байт документа и его пути
(`sha256(doc_sha256 + NUL + doc_path)`), поэтому `backlinks <doc_id>` собирает ОБЪЕДИНЕНИЕ цитат по
всем филингам этого документа и печатает `NOTE: N ingests share this doc_id`, если метаданные
расходятся, — вместо того чтобы молча выбрать один вариант.

**Отказы — закрытый набор из семи**, и каждый называет, что именно отказано:
`third_brain_not_segregated` · `third_brain_shared_store_targeted` ·
`third_brain_document_outside_workspace` · `third_brain_anchor_unresolvable` ·
`third_brain_write_unverified` · `third_brain_dz_unavailable` · `third_brain_payload_escape`.

Отсутствующий `dz` здесь — **жёсткий отказ**, сознательно расходясь с NOTE-поведением обучающей
петли: тот, кто запустил `third-brain ingest`, считает, что документ зафайлен. Один плохой `--anchor`
отменяет **весь** ингест: документ с меньшим числом цитат, чем указал оператор, — это ровно та
поломка, которой у провенанс-инструмента быть не должно.

**Параллельные ингесты сериализуются** (fix round 1): на время записи берётся лок воркспейса
(`.health-brain/.ingest-lock/`), поэтому два одновременных `third-brain ingest` в один воркспейс
выполняются по очереди, а не портят друг другу верификацию записи. Ожидание лока ограничено
таймаутом (`DZ_STORE_LOCK_TIMEOUT_MS`, по умолчанию 10 с) — не дождавшийся отвечает именованным
отказом `third_brain_write_unverified` с текстом про лок и ничего не пишет.

**Операторская заметка про `HEALTH_BRAIN_COUNT_STUB`** (тестовый шов, санкционирован ADR-001 D-3):
эта переменная окружения подменяет ТОЛЬКО показание счётчика в верификации записи — `none` заставит
каждый ингест отказывать как «непроверенный», целое число подделает счёт. Перенаправить запись она
не может (радиус — только верификация), но в рабочем окружении она должна быть **не установлена**:
если ингесты внезапно стабильно отказывают `third_brain_write_unverified`, проверьте
`env | grep HEALTH_BRAIN_COUNT_STUB`.

**Используемые скиллы:** third-brain, intake-archive (`source_anchor`)

---

## Все команды CLI

| Команда | Что делает | Пример |
|---------|-----------|--------|
| `init` | Установить все скиллы | `npx @dzhechkov/health-advisor init` |
| `init --base` | Только ядро (оркестратор + модули) | `npx @dzhechkov/health-advisor init --base` |
| `init --extended` | Только 25 мед. скиллов | `npx @dzhechkov/health-advisor init --extended` |
| `list` | Показать все скиллы (базовые + расширенные) | `npx @dzhechkov/health-advisor list` |
| `list --base` | Только базовые (20 компонентов ядра) | `npx @dzhechkov/health-advisor list --base` |
| `list --extended` | Только 25 мед. скиллов с Trust Tier | `npx @dzhechkov/health-advisor list --extended` |
| `install <name>` | Установить один скилл как `.claude/skills/health-advisor-<name>/` | `npx @dzhechkov/health-advisor install clinpgx` |
| `validate` | Проверить установленные скиллы (BTO Layer 0) | `npx @dzhechkov/health-advisor validate` |
| `info <name>` | Детали скилла | `npx @dzhechkov/health-advisor info emergency-card` |
| `render <file.md>` | Markdown → самодостаточный HTML для пациента (встроенный шаблон, работает из любого cwd — ADR-004) | `node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js render research/diet_foods.md` |
| `check [dir]` | Гейт парности .md ↔ .html: **exit 1**, если есть `.md` без парного `.html` (fail-closed, не warning) | `node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js check` |
| `consult-gate <synthesis.md> --lanes <dir>` | Гейт сохранности оговорок (консилиум, v1.6.1): shadow по умолчанию — только отчёт, exit 0 по построению | `npx @dzhechkov/health-advisor consult-gate synthesis.md --lanes lanes/ --json` |
| `triage --profile <p.json>` | Детерминированный компаратор экстренных порогов (12 канонических строк; действие — из строки таблицы, не из «суждения») | `npx @dzhechkov/health-advisor triage --profile profile.json --json` |
| `intake-archive --workspace <dir> (--url <https://…> --expect-sha256 <hex> \| --file <path>)` | Детерминированный приём архива документов (v1.7.0): дайджест ПЕРЕД разбором → закалённая распаковка (path traversal / zip-бомба / симлинки — отказ по имени) → АТОМАРНАЯ выкладка в `sources/raw/sha256-<hex>/` + `sources/manifest.json` + append-only `sources/LOG.jsonl`. Повторный приём идемпотентен | `node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js intake-archive --workspace <dir> --file <labs.zip>` |
| `intake-archive --verify --workspace <dir>` | Перечитывает каталог с диска и ПЕРЕСЧИТЫВАЕТ sha256 каждого файла в raw-зоне; **exit 1** при расхождении в любую сторону (пропавший файл / файл без строки каталога). Только чтение | `node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js intake-archive --verify --workspace <dir>` |
| `third-brain ingest <doc.md> --case <slug> --kind <kind> --date <YYYY-MM-DD> [--anchor <id>]…` | Третий мозг (v1.9.0): кладёт ПОЛНЫЙ аналитический документ в СЕГРЕГИРОВАННЫЙ `<workspace>/.health-brain` через существующий четырёхпроверочный гейт `learning_bridge.py`. Каждый `--anchor` чеканится и РЕЗОЛВИТСЯ до записи; один плохой якорь отменяет весь ингест. Повторный ингест — успех с `written: 0` | `node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js third-brain ingest analysis/synthesis.md --case ivanov-2026 --kind synthesis --date 2026-08-18 --workspace <dir>` |
| `third-brain search "<query>" [--limit N]` | Ищет по СОБСТВЕННОМУ тексту зафайленных документов — только в `.health-brain`, никогда в общем store | `node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js third-brain search "миопатия" --workspace <dir>` |
| `third-brain backlinks <doc_id>` | От документа обратно к первичным байтам: каждый якорь резолвится с пересчётом sha256; `incomplete: true`, если записей меньше, чем объявляют заголовки | `node /path/to/@dzhechkov/health-advisor/bin/health-advisor.js third-brain backlinks 3d46562e0c90a1b0 --workspace <dir>` |

`validate` — проверяет УСТАНОВЛЕННЫЕ скиллы. `check` — проверяет ВЫХОДНЫЕ файлы воркспейса (.md ↔ .html).

> Короткая форма через `npx` доступна: для глаголов `render`/`check` — начиная с версии `1.5.0`,
> для `consult-gate`/`triage` — начиная с `1.6.1`; на более
> ранних релизах их нет — используйте примеры из строк `render` и `check` таблицы выше (явный путь к
> бинарю в дереве пакета) или скрипт `assets/html-template.js` изнутри установленного скилла. Алиас
> `ha` объявлен в `package.json.bin` и появляется как команда после установки пакета / `npm link`.

**Опции** (работают со всеми командами выше):

| Опция | Что делает | Пример |
|-------|-----------|--------|
| `--dir <path>` | Своя директория установки/проверки вместо `./.claude/skills/health-advisor` | `npx @dzhechkov/health-advisor init --dir /srv/proj/.claude/skills/health-advisor` |
| `--base` | Только ядро (оркестратор + модули + промпты) | `init --base`, `list --base` |
| `--extended` | Только 25 расширенных мед. скиллов | `init --extended`, `list --extended` |
| `--out <path>` | render: путь выходного HTML (по умолчанию — соседний `<stem>.html`) | `render --out out.html research/diet_foods.md` |
| `--template <path>` | render: явное переопределение шаблона; путь печатается ДО использования (ADR-004; единственный способ переопределить — env-переменной и авто-поиска НЕТ) | `render --template ./my-template.js research/diet_foods.md` |
| `--stdout` | render: HTML в stdout вместо файла | `render --stdout research/diet_foods.md` |
| `--all` | check: сканировать всё дерево, а не только sources/research/analysis/doctors | `check --all` |
| `--json` | check / consult-gate / triage / intake-archive / third-brain: JSON-вывод с ТЕМИ ЖЕ кодами выхода | `check --json`, `third-brain search "q" --json` |
| `--url <https://…>` | intake-archive: архив в объектном хранилище. Только `https:`; `user:pass@` отвергается | `intake-archive --workspace <dir> --url <https://…> --expect-sha256 <hex>` |
| `--file <path>` | intake-archive: архив уже на этой машине — сокет не открывается вообще | `intake-archive --workspace <dir> --file <~/Downloads/labs.zip>` |
| `--expect-sha256 <hex>` | intake-archive: sha256 архива, полученный НЕЗАВИСИМО от него. **ОБЯЗАТЕЛЕН с `--url`** — дайджест, посчитанный с тех же байт, за которые он ручается, доказывает только что байты это байты | `--expect-sha256 f7e9503c…8e93` |
| `--workspace <dir>` | intake-archive / third-brain: воркспейс пациента. Для intake — внутри дерева пакета отказ; для third-brain — корень, чей `.health-brain` принимает документы | `--workspace <dir>` |
| `--allow-host <host>` | intake-archive: хост, на который разрешён кросс-хостовый редирект (можно повторять) | `--allow-host mirror.example` |
| `--limits <file>` | intake-archive: JSON, переопределяющий реестр бюджетов — ЕДИНСТВЕННАЯ ручка лимитов. Неизвестный ключ / не-конечное / отрицательное значение / значение выше потолка ⇒ **exit 2**, никогда молчаливый зажим | `--limits ./tighter-limits.json` |
| `--dry-run` | intake-archive: проверить вход и напечатать план. Ноль сетевых вызовов, ноль записей (даже лок не берётся). third-brain ingest: разобрать документ и напечатать план — ноль записей, ноль запусков процессов, ни одной строки в LOG | `intake-archive --workspace <dir> --file <labs.zip> --dry-run` |
| `--verify` | intake-archive: пересчитать raw-зону против каталога (только чтение) | `intake-archive --verify --workspace <dir>` |
| `--case <slug>` | third-brain ingest: кейс, к которому относится документ (пишется в заголовок КАЖДОЙ записи) | `--case ivanov-2026` |
| `--kind <kind>` | third-brain ingest: `consultation` \| `trend` \| `synthesis` \| `conclusion` | `--kind synthesis` |
| `--date <YYYY-MM-DD>` | third-brain ingest: дата САМОГО документа, не дата ингеста | `--date 2026-08-18` |
| `--anchor <entry_id>` | third-brain ingest: `entry_id` строки каталога, на которую ссылается документ (можно повторять). Каждый чеканится и резолвится ДО записи; один плохой якорь отменяет весь ингест | `--anchor 0f44938c8e03bfbf` |
| `--limit N` | third-brain search: сколько попаданий запрашивать у стора (по умолчанию 10) | `third-brain search "миопатия" --limit 5` |
| `--help`, `-h` | Справка | `npx @dzhechkov/health-advisor --help` |
| `--version`, `-v` | Версия | `npx @dzhechkov/health-advisor --version` |

`install <name>` кладёт скилл плоско и с префиксом — рядом с мастером, а не внутрь него:

```
$ npx @dzhechkov/health-advisor install clinpgx
+ Installed clinpgx to ./.claude/skills/health-advisor-clinpgx
  Invoke: /health-advisor-clinpgx
```

### Форматы для пациента

`init` устанавливает четыре первоклассных формата вывода в `.claude/skills/health-advisor/formats/`:

| Формат | Что задаёт | Несущее свойство |
|---|---|---|
| `questions-for-doctor.md` | Вопросы к врачу: находка → что хочу понять → вопрос | Не просить назначение — показать находку и спросить, что она значит |
| `evaluate-doctor-answer.md` | Как оценить ответ врача (сильный/слабый аргумент, «при каких цифрах…») | **Признание погрешности модели стоит ДО чек-листа** — без него (или с ним после чек-листа) формат превращается в инструмент давления на врача; охраняется именованным тестом |
| `plain-language-explanation.md` | Объяснение простым языком: аналогия + честная степень тревоги (4-значная шкала) | Вопросы «сколько осталось» переводятся в lifespan/healthspan без числовой оценки срока жизни |
| `prognosis-horizons.md` | Прогностический блок двумя горизонтами | Прогноз никогда не даётся одной величиной: lifespan И healthspan, с диапазоном и основанием |

---

## Что включено

### Анализы крови
| Скилл | Описание |
|-------|----------|
| preanalytical-guard | Проверяет условия забора крови ДО интерпретации значения (время суток, натощак, washout после голодания и нагрузки, сон, нужен ли повтор) + требует обязательные сопутствующие анализы |
| lab-results | Интерпретация 34 показателей крови (запускается только на наборе, допущенном preanalytical-guard) |
| clinical-targets | Клиническая ЦЕЛЬ отдельно от лабораторного РЕФЕРЕНСА — оба числа рядом, цитата порога, рамка «это не диагноз» |
| health-trend-analyzer | Тренды и визуализация изменений (ECharts) |

### Лекарства
| Скилл | Описание |
|-------|----------|
| tooluniverse-drug-research | Комплексные отчёты о лекарствах (50+ инструментов) |
| drug-interaction-checker | Проверка взаимодействий между препаратами |
| tooluniverse-drug-drug-interaction | Предсказание DDI, CYP450, QTc |
| clinpgx | Фармакогеномика через ClinPGx API |

### Тренировки и реабилитация
| Скилл | Описание |
|-------|----------|
| fitness-analyzer | Анализ тренировок, MET, корреляции |
| rehabilitation-analyzer | Реабилитация: ROM, MMT, фазы восстановления |

### Питание и вес
| Скилл | Описание |
|-------|----------|
| nutrition-analyzer | Анализ питания, RDA, нутриенты |
| weightloss-analyzer | BMR, TDEE, энергетический баланс |
| sleep-analyzer | Анализ сна, PSQI, циркадный ритм |

### Исследования и доказательства
| Скилл | Описание |
|-------|----------|
| deep-research | Автономное мультиисточниковое исследование |
| pubmed-search | PubMed поиск (PICO, PRISMA, MeSH) |
| multi-search-engine | 17 поисковых движков + медицинские базы |

### Документы и карты пациента
| Скилл | Описание |
|-------|----------|
| patiently-ai | Упрощение мед. документов для пациентов |
| emergency-card | Экстренная медицинская карточка |
| clinical-decision-support | Клинические документы (GRADE, KM) |

### Клиническое мышление
| Скилл | Описание |
|-------|----------|
| clinical-diagnostic-reasoning | Когнитивные bias в диагностике |
| clinicaltrials-database | Поиск по ClinicalTrials.gov API v2 |

### NLP-извлечение данных
| Скилл | Описание |
|-------|----------|
| clinical-nlp-extractor | Извлечение мед. сущностей из текста |
| medical-entity-extractor | NER из описаний пациента |

### Приём документов
| Скилл | Описание |
|-------|----------|
| intake-archive | Детерминированный приём архива документов пациента (v1.7.0): дайджест ПЕРЕД разбором, закалённая распаковка, АТОМАРНАЯ выкладка в `sources/raw/sha256-<hex>/`, append-only каталог + журнал, идемпотентный повтор. Определяет канонический layout первичных данных |
| case-state | Профиль как обязательный вход, реестр фактов и открытые вопросы; store-lock для всего воркспейса |

---

## Условия забора: почему число без них — ещё не факт (`preanalytical-guard`)

Одно и то же значение общего тестостерона `7.9 нмоль/л` значит «дефицит» или «человек голодал
56 часов» — и по ЛГ/ФСГ эти две ситуации **неразличимы**. Поэтому `preanalytical-guard`
отрабатывает **до** интерпретации, а не после: движок `lab-results` выпускает свою фразу в тот
момент, когда значение в него попало, и фильтровать его вывод — это уже не «до».

Что кодируется для каждого аналита (это **данные**, `registry/*.json`, а не проза — новый фактор
добавляется без правки кода; каждая запись ОБЯЗАНА нести величину эффекта и источник, иначе пакет
не загрузится):

| Фактор | Величина | Действие |
|---|---|---|
| Голодание ≥ 48 ч | `-34 %` при 56 ч (CLAIMED — полевой случай) | **withhold** — по ЛГ/ФСГ артефакт неотличим от истинного дефицита |
| Окно washout после голодания открыто (< 48 ч) | до `-34 %` — ВЕРХНЯЯ ГРАНИЦА, перенесённая со строки выше (CLAIMED; ни длина окна, ни остаток здесь не измерялись) | **withhold** — `fasting_hours` обнуляется, когда голодание кончилось, а артефакт нет |
| Сон ≤ 5 ч в среднем за неделю | `-12.5 %` (диапазон `-15…-10 %`, CLAIMED) | caveat — значение допускается, оговорка неотделима |
| Общий тестостерон без ГСПГ | пропуск вскрылся на 3-й неделе и почти привёл к обсуждению ЗГТ по артефакту (CLAIMED) | **блокировка** — сначала назначить ГСПГ |
| Первое значение ниже полосы | до `30 %` таких значений возвращаются в полосу при простом повторе, без лечения (CLAIMED) | повтор до любых выводов |
| Значение не сопоставимо с полосой | нет единицы, необъявленная единица, нечисловое значение | `unit_uncomparable` — «не смогли определить» никогда не равно «не ниже полосы» |
| Имя не объявлено, но опознаётся как gated-аналит | — | `unrecognised_variant` — **неизвестное имя не может быть безопаснее известного** |
| Условия неизвестны | — | `conditions_unknown` — полноценное состояние, а не «нет данных» |

**Имена аналитов и единицы (QE-раунд 1, 2026-08-05).** Сопоставление имени идёт по
**отсортированному множеству токенов**: регистр, пробелы, ПОРЯДОК СЛОВ, пунктуация и скобочные
уточнения сворачиваются кодом, поэтому одно объявление `Total Testosterone` покрывает и
`Testosterone, Total`, и `Total testosterone (T)`. Перевод кодом не выводится и объявляется данными
— `Тестостерон общий` и `ГСПГ` теперь объявлены (MEASURED: до этого все три неперечисленных
написания уходили в движок с `interpretable:true` — репродьюсер
`node --test /path/to/@dzhechkov/health-advisor/test/preanalytical-guard.test.js`, тест `:: T18`
итерирует 28+ имён). Добавлять по три алиаса за раз — это «перечисление в одежде
allowlist»: четвёртое написание сбежало бы так же. Полоса сравнивается **с учётом единиц**
(`unit_conversions` + обязательный `unit_conversions_source`): `230 ng/dL` — это ~8 нмоль/л, ниже
документированной полосы `<12`, и раньше оно проходило молча.

### Сценарий A: «Проанализируй общий тестостерон 7.9 нмоль/л»

1. Module 0 (Intake) собирает **пакет условий забора** одним блоком: время, натощак и сколько
   часов, часы с конца длительного голодания, часы после нагрузки, средний сон за неделю, повтор
   ли это. «Не знаю» записывается явно — это ответ, а не пропуск.
2. Module 1 запускает `preanalytical-guard` по всей панели.
3. ГСПГ в наборе нет → значение **не отправляется** в `lab-results` вообще.

Ожидаемый вывод:

```text
WITHHELD (1)
  - Total Testosterone = 7.9 nmol/L
      withheld — a required companion analyte is absent, so this value cannot be interpreted alone

REQUIRED BEFORE ANY CONCLUSION (1)
  - order SHBG alongside Total Testosterone
      why: a near-miss replacement-therapy discussion built on a probable artefact — total
           testosterone without SHBG cannot separate a binding-protein shift from a real change
      source: field-case: Step-0 brief, ha-slice-b
```

В том же ответе **нет** ни «низко», ни «норма», ни «высоко». Требование вместо вердикта — это и
есть смысл слайса.

### Сценарий B: то же значение, но ГСПГ сдан, а забор — после 56 ч голодания

Ожидаемый вывод:

```text
WITHHELD (1)
  - Total Testosterone = 7.9 nmol/L
      withheld — a recorded distorting factor was present at sampling
      factor fasting-washout-prolonged (fasting_hours) decreases this analyte by -34 % at 56 h fast
      indistinguishable along LH/FSH: at the SAME LH/FSH profile the fasting artefact is
      indistinguishable from true deficiency — the pituitary axis cannot tell them apart
```

Величина эффекта **сообщается, но никогда не применяется**: «исправленного на `-34 %`» числа не
появится — это была бы вторая, неатрибутируемая величина, неотличимая от измерения.

### Когда этим пользоваться

Автоматически — перед каждым запуском `lab-results`. Напрямую
(`/health-advisor-preanalytical-guard`) — только чтобы посмотреть аудит условий без шага
интерпретации.

### Честная граница

Гарантия держится на **API** стража: ни один его путь не выдаёт интерпретацию значения без аудита
условий (проверено именованным тестом + доказательством дискриминации: `npm test` при удалённой
проверке off-ticket даёт `pass 16 / fail 2`, при возвращённой — `pass 18 / fail 0`, MEASURED
2026-08-04). Страж **не** может помешать вызвать `/health-advisor-lab-results` напрямую или
запустить движок руками: `lab-results` — сторонний скилл, и добавлять защиту внутрь него нельзя.
Этот остаточный путь закрыт только строкой **BLOCK** в таблице анти-паттернов роли — то есть
слабее, и так и написано.

---

## Цель ≠ референс: почему «в референсе» — это ещё не «всё хорошо»

Референсный интервал — это диапазон, в который попадает бо́льшая часть **популяции**. Клиническая
цель — это то, где следует быть **именно вам** при задокументированном состоянии. Это разные
вопросы с разными источниками истины, и одно поле `status` не может нести оба чтения: второе молча
затирает первое.

Два случая из практики (**CLAIMED** — числа и пороги приведены так, как они пришли в обращении;
ни одно руководство этим инструментом не открывалось, поэтому обе цели поставляются с классом
доказательности `ASSERTED`):

- апоB `106 мг/дл` при референсе `66–133 мг/дл` читается как «в норме». При документированном
  атеросклерозе применимая цель — ниже `80 мг/дл`.
- насыщение трансферрина `53 %` при референсе `16–54 %` читается как «в норме». У мужчин порог
  настороженности начинается с `45 %`.

Скилл `clinical-targets` показывает **оба числа** и вычисляет их расхождение как поле, а не как
фразу, которую кто-то мог не написать.

### Как запустить

В пакете лежит готовый пример поля — те же две строки, что печатает `lab-results`, плюс контекст
пациента и референсы из бланка лаборатории:

```bash
node /path/to/@dzhechkov/health-advisor/skills/clinical-targets/engine/cli.js /path/to/@dzhechkov/health-advisor/skills/clinical-targets/examples/apob-field-case.json
```

Свой ввод подаётся так же — путём к файлу или через stdin
(`node .../engine/cli.js < мой-ввод.json`). Формат:

```json
{
  "rows": [
    { "test_name": "ApoB", "value": 106, "unit": "mg/dL",
      "reference_range": "-inf - inf", "status": "normal" }
  ],
  "patientContext": { "sex": "male", "conditions": ["documented_atherosclerosis"] },
  "labReport": { "ApoB": { "lo": 66, "hi": 133, "unit": "mg/dL" } }
}
```

Вывод (MEASURED 2026-08-04 — то, что печатает команда выше; пример содержит ДВЕ строки анализов,
ниже приведены оба блока. Длинные строки перенесены по ширине README — в терминале они идут одной
строкой):

```text
апоB (аполипопротеин B): 106 mg/dL (1.060 g/L)
  Референс лаборатории: 66 – 133 mg/dL (источник: lab-report) → В ПРЕДЕЛАХ РЕФЕРЕНСА
  Цель из руководства: <80 mg/dL (<0.800 g/L) → ВЫШЕ ЦЕЛИ на 26 mg/dL
  Ваше значение выше цели: 106 mg/dL (1.060 g/L) против <80 mg/dL (<0.800 g/L).
  Порог: «апоB 106 мг/дл при референсе 66-133 «в норме», но выше цели <80 при документированном
  атеросклерозе» — ИСТОЧНИК НЕ ОТКРЫТ ЭТИМ ИНСТРУМЕНТОМ — порог заявлен в исходном обращении
  (field brief), Конкретное руководство в обращении не названо и этим пайплайном не запрашивалось,
  раздел не указан, год не указан [evidence: ASSERTED]
  Кому адресован порог: взрослые с документированным атеросклерозом. Ваш контекст сверен по полям:
  conditions — совпадение подтверждено.
  Это не диагноз. Референсный интервал приходит из вашей лаборатории; порог — из указанного
  источника для указанной группы пациентов. Решение о том, применим ли порог к вам, принимает врач.
  ⚠ РАСХОЖДЕНИЕ: значение внутри референсного интервала, но выше цели.

Насыщение трансферрина: 53 %
  Референс лаборатории: 16 – 54 % (источник: lab-report) → В ПРЕДЕЛАХ РЕФЕРЕНСА
  Цель из руководства: ≤45 % → ВЫШЕ ЦЕЛИ на 8 %
  Ваше значение выше цели: 53 % против ≤45 %.
  Порог: «насыщение трансферрина 53% при референсе 16-54% «в норме», но у мужчин настораживает
  с 45%» — ИСТОЧНИК НЕ ОТКРЫТ ЭТИМ ИНСТРУМЕНТОМ — порог заявлен в исходном обращении (field brief),
  Конкретное руководство в обращении не названо и этим пайплайном не запрашивалось, раздел не
  указан, год не указан [evidence: ASSERTED]
  Кому адресован порог: мужчины. Ваш контекст сверен по полям: sex — совпадение подтверждено.
  Это не диагноз. Референсный интервал приходит из вашей лаборатории; порог — из указанного
  источника для указанной группы пациентов. Решение о том, применим ли порог к вам, принимает врач.
  ⚠ РАСХОЖДЕНИЕ: значение внутри референсного интервала, но выше цели.
```

### Когда этим пользоваться

- анализ «в референсе», но есть задокументированный диагноз, под который написан отдельный порог;
- в бланке лаборатории нет референса вообще (`ref: -inf - inf`) — движок скажет «референс не указан»,
  а не «в норме»;
- нужно перевести значение между единицами (`1.060 г/л ↔ 106 мг/дл`, `8.04 нмоль/л ↔ 232 нг/дл`)
  и сравнить с порогом с явным допуском, а не «на глазок».

### Что скилл принципиально не делает

Не ставит диагноз и не выносит самостоятельный вердикт. Фраза «выше цели» допустима **только**
вместе с обоими числами, дословной цитатой источника порога и рамкой «это не диагноз; порог из
такого-то руководства для такой-то группы» — и это не договорённость на ревью, а конструктор:
объект утверждения невозможно построить без всех трёх частей, а значит и напечатать нечего.
Порог не применяется к пациенту, чей контекст не совпал; при неизвестном контексте движок называет
недостающие поля и явно говорит, что не может определить применимость.

Расширяется данными: новый показатель или новый порог — это JSON-файл в
`skills/clinical-targets/engine/registry/`, без единой правки кода (`{"registryDirs": ["/свой/путь"]}`
во входном JSON подключает внешний каталог).

---

## Класс доказательства: читал ли источник кто-нибудь (v1.3.0)

Криптографическая подпись доказывает, что запись не меняли **после** подписания. Она ничего не
говорит о том, открывал ли источник кто-нибудь **до**. По опыту эксплуатации это и есть главный
источник содержательных ошибок: уверенный пересказ непрочитанного.

Поэтому у факта две независимые оси:

| | вопрос | значения |
|---|---|---|
| `trust_class` | запись не подменили? | `ISSUER_SIGNED` · `SELF_ATTESTED` · `UNVERIFIED` |
| `evidence_class` | источник реально открывали? | `FETCH_VERIFIED` · `LISTING_ONLY` · `ASSERTED` |

Факт бывает подписанным **и** `ASSERTED` одновременно — это легально, выразимо и опасно.

```bash
# в исследовании: загрузку делает инструмент, а не модель «по памяти»
python3 scripts/evidence_fetch.py   # используется скиллом; только stdlib, без зависимостей

# перед сдачей отчёта — гейт (код возврата, не совет):
python3 scripts/check_report_evidence.py --report report.md --facts facts.json
#   report evidence gate
#     facts: 3 — FETCH_VERIFIED 1 / LISTING_ONLY 1 / ASSERTED 1 / legacy-unknown 0
#     FAIL — 2 violation(s):
#       [ASSERTED_IN_REPORT] the IMEI registration ban was introduced in Turkey
#       [UNMARKED_LISTING_ONLY] transferrin saturation rose from 37 to 53 percent
#   → exit 1
```

**Правила:** `ASSERTED` в отчёт не попадает вовсе. `LISTING_ONLY` — только с видимой пометкой рядом
с **каждым** упоминанием. Уверенность = `min(подпись, доказательство, тир источника)` — самое
слабое звено; `ASSERTED` = `0.0`, потому что это не слабое доказательство, а его отсутствие.

**Честная граница, которую печатает сам инструмент:** `FETCH_VERIFIED` означает «скрипт выполнил
HTTP-запрос и получил тело с таким байт-хешем в такую дату». Это **не** значит, что источник
авторитетен, что утверждение из него следует или что его правильно поняли. Провенанс, не истина.

Старые факты (созданные до 1.3.0) продолжают проверяться как раньше: у них доказательство помечено
как **неизвестное** — не «asserted» и не «verified». Гейт их считает и называет отдельной строкой,
но не судит задним числом.

## Применимость к ЭТОМУ пациенту: население исследования и абсолютный риск

Правильно найденный, правильно подписанный и реально прочитанный факт всё ещё может ввести в
заблуждение того единственного читателя, ради которого всё делается. Два способа — и оба
встречались в реальной работе:

> **Все числа в двух списках ниже — CLAIMED**: они взяты из полевого отчёта, этот пайплайн сами
> источники не открывал и идентификаторы (DOI/NCT) для них не выдумывает. В фикстурах они несут
> `evidence_class = ASSERTED`. Проверяют они поведение **матчера**, которое от подлинности цитаты
> не зависит. Воспроизводимое здесь — только вывод модулей: `cd
> base/skills/base/goap-research-ed25519/scripts && python3 -m unittest discover -s . -p 'test_*.py'`.

1. **Число получено не в тех людях** (CLAIMED). `Похудение поднимает тестостерон` измеряли у мужчин
   с ожирением (`ИМТ ≥ 30`) — у пациента `ИМТ 25`. РКИ по обратимости эректильной дисфункции
   набирало только `ИМТ ≥ 30`. Безопасность TRAVERSE установлена у мужчин **высокого**
   сердечно-сосудистого риска. `+44.5% ЛПНП от омега-3` наблюдали при триглицеридах `≥ 800 мг/дл` —
   у пациента `236`.
2. **Относительный риск без абсолютного** (CLAIMED). `Риск инфаркта выше в 21 раз` — это
   `1 избыточный случай на 1394 человека`. `Риск удваивается` — это `4 на 1000 за 25 лет`. Оба
   предложения в каждой паре верны; интерпретируемо только одно, и цитируют обычно другое.

**Население исследования — обязательное поле факта.** Не соглашение, а аргумент без значения по
умолчанию: пропустил — `TypeError` от самого Python.

```python
# scripts/population_match.py + scripts/ed25519_verifier.py
fact = verifier.create_listing_fact(
    claim="Омега-3 повышает ЛПНП на 44.5%",
    source_url="https://pubmed.ncbi.nlm.nih.gov/…",
    reason="карточка из выдачи, полный текст не открывался",
    study_population={
        "description": "patients with severe hypertriglyceridemia (baseline triglycerides >= 800 mg/dL)",
        "criteria": {"triglycerides_mg_dl_min": {
            "op": ">=", "value": 800, "kind": "baseline",
            "verbatim": "baseline triglycerides >= 800 mg/dL",
            "locator": "[Methods, Baseline characteristics]"}},
    },
)

import population_match as pm
print(pm.render_population_match(
    pm.match_from_fact(fact.study_population, {"sex": "male", "bmi": 25,
                                               "triglycerides_mg_dl": 236, "cv_risk": "moderate"})))
```

```
POPULATION_MATCH: partial
  study population: patients with severe hypertriglyceridemia (baseline triglycerides >= 800 mg/dL)
  triglycerides — patient 236; study requires triglycerides >= 800 (baseline-out-of-range, below)
      enrollable, but the effect was not measured from this starting value
      "baseline triglycerides >= 800 mg/dL"  [Methods, Baseline characteristics]
```

Вердиктов **четыре**, и сам по себе вердикт ничего не стоит — ценно перечисление расхождений:
`full` (все критерии выполнены известными значениями), `partial` (**исходное** значение вне
диапазона: пациент мог бы участвовать, но эффект мерили не от той точки), `none` (критерий
**отбора** его исключает — он бы в исследование не попал), `unknown` (источник не указал ось или
её нет в профиле). `unknown` **никогда** не сворачивается в `partial`: неустановленный критерий —
это не более мягкое совпадение.

**Относительный риск не ходит в одиночку.** `RiskStatement(relative, absolute)` требует обе
половины позиционно; `absolute` — это либо реальные абсолютные числа, либо явное
`UnknownBaseline(reason=…)`. Опустить абсолютную половину нельзя — можно только **сказать**, что
базовый риск неизвестен, и это печатается в том месте, где стояло бы число:

```python
import risk_statement as rs
print(rs.render_risk(rs.RiskStatement(
    rs.RelativeEffect(kind="RR", value=21.0),
    rs.AbsoluteEffect(control_events=1, control_denominator=1394),
    nnt=rs.nnt_from_absolute(rs.AbsoluteEffect(control_events=1, control_denominator=1394)))))

print(rs.render_risk(rs.RiskStatement(
    rs.RelativeEffect(kind="HR", value=0.74),
    rs.UnknownBaseline(reason="в источнике нет частоты событий в контрольной группе"),
    nnt=rs.nnt_from_absolute(rs.UnknownBaseline(reason="в источнике нет частоты событий в контрольной группе")))))
```

```
risk: RR 21 (relative)
  absolute: 1 per 1394
  NNT: n/a — observational association, no intervention arm compared

risk: HR 0.74 (relative)
  absolute: BASELINE RISK NOT ESTABLISHED — в источнике нет частоты событий в контрольной группе
  NNT: n/a — cannot be computed without a baseline — в источнике нет частоты событий в контрольной группе
```

NNT **вычисляется** из абсолютных чисел (`1/|ARC−ART|` или `M/N` из «N избыточных случаев на M»), а
не подставляется текстом; если конечного NNT не существует — возвращается **названная** причина, а
не `Infinity` и не `0`.

**Гейт отчёта** сводит четыре независимых суждения над одним текстом и не теряет ни одного:

```bash
python3 scripts/check_report_evidence.py --report report.md --facts facts.json --profile patient.json
#   [UNMARKED_POPULATION_MISMATCH]  вердикт partial/none и рядом не названа расходящаяся ось
#   [POPULATION_UNKNOWN_UNMARKED]   вердикт unknown, то же правило близости
#   [MISSING_STUDY_POPULATION]      факт без населения исследования — тут пациент даже не нужен
#   [RELATIVE_RISK_WITHOUT_ABSOLUTE] «в 21 раз» без абсолютной цифры в пределах 400 символов
#   → exit 1
```

`--profile` необязателен; без него правила близости не запускаются, и гейт **печатает**
`population applicability: NOT CHECKED — no --profile supplied`, а не проходит молча.

**Когда этим пользоваться:** всякий раз, когда число из исследования переносится на конкретного
человека — то есть в любом ответе, где есть и источник, и пациент.

**Честные границы (их печатает сам инструмент):**
- ничто не проверяет, что цитата `verbatim` переписана из источника правдиво, и что выбранный
  критерий вообще клинически значим — поэтому цитата и локатор печатаются рядом с каждым
  расхождением, чтобы человек мог проверить и переспорить машину;
- словарь осей (`CRITERION_FIELDS`, 12 названий) закрыт: тринадцатая ось — это изменение кода. Ось
  вне списка **не отбрасывается молча**, а вызывает ошибку;
- скан относительного риска в гейте ловит **форматы, а не смысл**. Гарантия — конструктор
  `RiskStatement`; скан это ремень поверх свободного текста, новая формулировка его обойдёт, и
  ссылаться на него как на доказательство свойства нельзя;
- факты, подписанные до схемы v3, не несут `trust_class`/`metadata`/`confidence` под подписью — их
  `trust_class` можно переписать, не сломав подпись. Дыра названа в `SKILL.md`, а не замолчана.

## Профиль как обязательный вход, реестр фактов и открытые вопросы (slice F, `case-state`)

Один и тот же случай раз за разом собирался из прозы: значения аналитов жили в контексте разговора,
проверенные источники — в разрозненных файлах, а «спросить позже» терялось через месяц. Однажды это
дало **вывод на реальном числе не того поколения** — измерение было настоящим и на полгода
устаревшим, и снаружи такой вывод неотличим от правильного.

Скилл `case-state` даёт случаю одно каноническое состояние из трёх частей:

| Часть | Файл | Правило, которое нельзя обойти |
|---|---|---|
| Профиль | `profile.json` | «текущее» значение нигде не хранится — оно вычисляется свёрткой на **явную** дату; вывод принимает значение только как расписку, выданную в этом же вызове |
| Реестр фактов | `facts.json` | запись по ключу `(claim_hash, source_url)`; повторная проверка **дописывает** историю, а не создаёт вторую запись; истёкший TTL даёт явное «устарело», а не тихо отдаёт старое |
| Открытые вопросы | `open_questions.json` | вопрос переживает сессию и всплывает по `trigger_date` или по условию; открытый **блокирующий** вопрос делает вывод в своей области непостроимым |

### Как запустить

Проверить профиль и заодно увидеть созревшие вопросы на конкретную дату:

```bash
node /path/to/@dzhechkov/health-advisor/skills/case-state/engine/cli.js profile validate /path/to/@dzhechkov/health-advisor/skills/case-state/engine/fixtures/profile.json 2026-01-01
```

```
profile OK: .../skills/case-state/engine/fixtures/profile.json
  6 dated observations, 2 preanalytical context entries
  open_questions -> .../open_questions.json (5 recorded)
questions due  as-of 2026-01-01: none
```

Сравнить два забора (в примере ниже даты совпадают, поэтому расхождений нет и код возврата `0`):

```bash
node /path/to/@dzhechkov/health-advisor/skills/case-state/engine/cli.js profile diff /path/to/@dzhechkov/health-advisor/skills/case-state/engine/fixtures/profile.json 2026-04-15 2026-04-15
```

На РАЗНЫХ датах тот же глагол печатает поколенческий разрыв и выходит с кодом `1`
(`… profile diff … 2025-10-15 2026-04-15`):

```
profile diff  2025-10-15 → 2026-04-15   (source: .../fixtures/profile.json)
  hdl             1.24 → 1.12 mmol/L (-0.12, observed 2026-04-15)
  triglycerides   1.94 → 2.67 mmol/L (+0.73, observed 2026-04-15)
  ldl             —    → 3.6 mmol/L   (new, observed 2026-04-15)
2 changed, 1 unchanged, 1 new, 0 removed
```

Найти доказательства, которые пора перепроверить:

```bash
node /path/to/@dzhechkov/health-advisor/skills/case-state/engine/cli.js facts stale /path/to/@dzhechkov/health-advisor/skills/case-state/engine/fixtures/facts-fresh.json 2026-04-15
```

На реестре со смешанной свежестью (`fixtures/facts.json`) тот же глагол выходит с кодом `1` и
называет **оба** нездоровых состояния — истёкший TTL и «дату выборки никто не записал»:

```
facts stale  as-of 2026-04-15: 2 of 3 record(s) need attention
  FRESHNESS_UNKNOWN  e294bce4171c…  «Lp(a) concentration is largely genetically determined …»
    fetch_date is absent — the freshness question cannot be dodged by omitting the field
  STALE_NEEDS_REFETCH  f9bbd797b510…  «ApoB below 80 mg/dL is the recommended target …»
    our copy is 318 d old, past the 180 d re-check interval
```

Поднять созревшие вопросы перед новой сессией:

```bash
node /path/to/@dzhechkov/health-advisor/skills/case-state/engine/cli.js questions due /path/to/@dzhechkov/health-advisor/skills/case-state/engine/fixtures/open_questions.json 2026-01-01
```

Коды возврата одинаковы у всех пяти глаголов (`profile validate`, `profile diff`, `facts get`,
`facts stale`, `questions due`): `0` — норма, `1` — ожидаемый отрицательный ответ, `2` — ошибка
использования или нечитаемый вход. У каждого глагола есть собственный тест на код возврата.

### Когда этим пользоваться

- пациент возвращается через полгода, и надо честно показать, что изменилось между заборами;
- одна и та же ссылка проверяется третий раз за сессию — реестр узнаёт её и дописывает проверку
  вместо новой выборки;
- в отчёте появилась строка «вернуться к этому после следующей липидограммы» — ей нужен дом, из
  которого она сама всплывёт в нужную дату.

### Честная граница

Гарантия связывает выводы, построенные **через модуль**. Свободная проза агента в ответе чату не
достижима ни для какого кода, и скилл этого не утверждает. Расписка доказывает, что чтение БЫЛО,
но не то, что прочитанное значение — именно то, которое затем пересказали словами. Закрыта, однако,
**асимметрия** внутри самого модуля: раньше проза была строго ЛИБЕРАЛЬНЕЕ расписки — вывод, который
вписывал значение блокированного аналита словами, печатался, а честный вывод с распиской на то же
значение отклонялся. Теперь блокирующий вопрос останавливает оба, и `session.derive()` тоже.
Числа TTL — настраиваемые умолчания, а не клинические константы; `source_kind`, которого нет в
таблице (например, опечатка `prcie` вместо `price`), даёт `FRESHNESS_UNKNOWN`, а НЕ строку-умолчание
на 365 дней — опечатка не должна покупать более длинный TTL, чем правильное написание. С 1.5.1 тип
`source_kind` проверяется уже у ДВЕРИ записи: `facts.record()` отвергает не-строку (массив, число,
объект) громким `TypeError`, ничего не записывая, — тем же единственным определением
`sourceKindIdentity()`, которым выбирается TTL-строка. Дверь проверяет ТИП, таблица — членство:
опечатка-строка принимается у двери и честно отвечается `FRESHNESS_UNKNOWN` ниже, а старый реестр,
куда не-строка успела попасть до фикса, по-прежнему читается и ведёт себя fail-closed. Взаимное исключение двух пишущих процессов
работает через общий `withStoreLock` из `@dzhechkov/harness-core` (**необязательная** зависимость):
весь путь ЧТЕНИЯ не требует её вовсе, а если модуль недоступен, запись **громко отказывается**
(`CaseLockUnavailableError`) и не пишет ничего.

## Реестр против публикации: зарегистрированный и опубликованный первичный исход рядом (slice CA-2)

Клиническое испытание регистрируется ДО начала (ClinicalTrials.gov, ISRCTN) с заявленным первичным
исходом. Статья выходит годы спустя. Этот срез кладёт **зарегистрированный** и **опубликованный**
первичный исход РЯДОМ — с датой правки записи реестра и фактом, была ли правка после
`primaryCompletionDate` — и на этом останавливается. Продукт — предъявление доказательства
человеку, а не приговор.

### Когда этим пользоваться

Читаете статью об испытании и хотите сами увидеть, что было заявлено в реестре до старта — не
пересказ, а дословный текст обеих сторон с локаторами, по которым каждую строку можно перепроверить.

### Сценарий: от статьи к сопоставлению

Получение данных — вне процесса (агент или существующие скиллы `pubmed-search` /
`clinicaltrials-database` делают GET-запросы; сами модули не ходят в сеть вовсе). Порядок каскада
связывания: PubMed DataBankList → аннотации Europe PMC (с сохранением секции) → текст статьи;
Crossref `clinical-trial-number` — только подтверждение, никогда не источник (покрытие на порядки
ниже).

```js
const { resolveLinkage } = require('@dzhechkov/health-advisor/lib/registry-linkage.js');
const { buildComparison, renderComparison } = require('@dzhechkov/health-advisor/lib/registry-comparison.js');

const linkage = resolveLinkage(articleEnvelope);          // {trial_id, id_provenance, link_basis} | null
const record = buildComparison({ linkage, registry: registryEnvelope, article: articleEnvelope });
console.log(renderComparison(record));
```

Ожидаемый вывод (иллюстративно):

```
Registry <-> publication — NCT01234567
  link basis: annotated-section   (europepmc-annotation, section=Methods)
  REGISTERED (registry record, retrieved 2026-08-05)
  1. Change in HbA1c at 24 weeks
     time frame: baseline to 24 weeks
     https://clinicaltrials.gov/study/NCT01234567
  2. Proportion achieving HbA1c < 7.0% at 24 weeks
  PUBLISHED (article)
  1. Change in HbA1c at 24 weeks
     locator: Results ¶2
  registry timeline
    primary completion date:   2019-06-30
    record last update posted: 2019-11-04
    edit after primary completion: yes
    per-version outcome history: not available — this dates the record's LAST edit, not an edit to
    the outcome field; the tool cannot tell from this data which field changed.
    Registry records are routinely updated after the primary completion date for reasons unrelated
    to the outcome (administrative, recruitment, sponsor, results posting). The timing above is a
    dated fact; this tool draws no conclusion about why an edit was made.
  coverage: both-retrieved

  These two texts are shown for your own comparison. This tool does not decide whether they
  describe the same outcome; wording routinely differs without an outcome having changed.
```

### Чего этот срез принципиально не делает

- **Никогда не решает, был ли исход подменён** (K-9, ADR-001 §3): ни один выданный ключ и ни один
  токен рендера не является функцией содержимого ОБЕИХ сторон сразу — доказано тестом парной
  инвариантности (`T-5`), а не обещанием.
- **Никогда не говорит, что испытание «не зарегистрировано»** (K-6, FR-8): отсутствие связи с
  реестром — свойство индексов, а не испытания; выдаётся `unknown_reason` из закрытого набора
  (`T-6`), медианное покрытие авто-связок — меньшинство записей.
- **Никогда не скорит, не ранжирует и не подсвечивает пару** (ADR-001 §Decision): нет
  match/similarity/diff ни в каком виде; выравнивание — только позицией и количеством.
- **Никогда ничего никуда не отправляет** (FR-9, AM-12): в трёх модулях нет ни одной сетевой
  конструкции — free of network access by construction, подтверждено запретительным (не
  разрешительным) сканом и инъекционным доказательством D-T10 (зелёный прогон записан в ADR-005).

### Честные границы

- Правка записи после primary completion date — **не свидетельство нарушения**: записи рутинно
  обновляются по административным причинам (ADR-003 §7). Дисклеймер рендерится безусловно.
- Пока источник поверсионной истории недоступен, таймлайн датирует **последнюю правку записи**, а
  не правку поля исхода — рендер помечает это явно (слабое свидетельство, K-14/K-15).
- Одинаковые даты, частичные даты (`YYYY-MM`) и `ESTIMATED`-даты дают `unknown` с причиной — никогда
  «нет» (семистрочный контракт `editAfterPrimaryCompletion`, единственное определение на весь пакет).
- Дословное извлечение с локатором — это опровержимость, а не доказательство правильности
  извлечения: читатель может перепроверить каждую строку по `source_url`/`locator`.

## Детерминированная критическая оценка первоисточника (slice CA-1, `critical-appraisal`)

Скилл `health-advisor-critical-appraisal` — детерминированный слой прозрачности: семь проверок по
метаданным реестра и издателя, шесть доменов (`retraction-status`, `cites-retracted-work`,
`registration-timing`, `registry-record-changed-after-completion`, `enrollment-reporting-fidelity`,
`results-reporting-timeliness`). Это **ось прозрачности записи, не ось риска систематической
ошибки** — эмпирически эти оси не связаны, и инструмент говорит это в каждом выводе.

Реальная последовательность:

```bash
node /path/to/@dzhechkov/health-advisor/skills/critical-appraisal/scripts/appraise.js --help
node /path/to/@dzhechkov/health-advisor/skills/critical-appraisal/scripts/appraise.js --nct NCT04368728 --json > appraisal.json
node /path/to/@dzhechkov/health-advisor/skills/critical-appraisal/scripts/appraise.js --doi "10.1016/S0140-6736(97)11096-0" --format md > appraisal.md
```

Ожидаемая форма вывода (`--format md`): таблица «domain | verdict | evidence | what would refute
it», строка покрытия `assessed N of 6`, категориальная строка `worst verdict recorded` и
уведомление, что авторы не были контактированы. Код выхода: `0` — находок нет, `1` — есть хотя бы
одна находка, `2` — большинство доменов `unknown`; **`2` доминирует над `1`** — это «прочитай
вывод», а не «всё чисто».

**Чего эта фича никогда не делает:**

- не публикует и не отправляет ничего наружу — вывод локален, единственное «письмо» это черновик
  письма авторам (`--letter`), и отправка его — решение человека;
- не выдаёт сводный балл, оценку, ранг или звёзды — только таблица находок по доменам;
- не утверждает намерение — реестр знает, *когда* поле изменилось, но не *почему*; домен называет
  датированный факт записи и путь опровержения;
- не упорядочивает пары дат, которые данные упорядочить не позволяют — дата годовой или месячной
  точности (Retraction Watch и Crossref их регулярно отдают) или отсутствующая дата на любой
  стороне сравнения даёт `unknown` / «не упорядочиваемо при доступной точности», никогда не
  `concern` и никогда не чистый вердикт; порядок дат во всём пакете определяет одно
  прецизионно-осведомлённое ядро (`lib/registry-edit-timing.js`);
- не делает правовых заключений — проверка своевременности результатов сообщает прошедшее время,
  и только.

**Рамка честности (rules-ADR-003):** слой пока `NOT YET EVALUATED` против экспертов-оценщиков
(`calibration.md` в корне пакета; сам файл не публикуется в npm-тарболе, поэтому его вывод
продублирован здесь). Детерминизм означает воспроизводимость — те же входы дают те же находки, —
но воспроизводимость не устанавливает правильность: опубликованные человеческие ревьюеры на тех же
инструментах достигают лишь слабого взаимного согласия, поэтому цифры согласия ограничивают
воспроизводимость, а не доказывают качество.

## Самообучение: помнить свои ретракции (v1.5.0, опционально)

Самое ценное знание исследования появляется в момент, когда вывод оказался **неверным**.
Сейчас оно умирает вместе с сессией. Если в системе стоит
[`@dzhechkov/harness-cli`](https://www.npmjs.com/package/@dzhechkov/harness-cli),
пакет записывает такие уроки и проигрывает их в начале следующего исследования.

```bash
# 1. включена ли петля вообще
python3 scripts/learning_bridge.py status
#   self-learning ON via /usr/bin/dz
#     dz recall --all --stats  —  178 learned pattern(s)
#     lessons from this package are tagged domain=health-research

# 2. НАЧАЛО исследования — на чём этот аналит уже подводил
python3 scripts/learning_bridge.py recall "transferrin saturation"

# 3. вывод ОТОЗВАН — записываем ПРАВИЛО, которому он научил
python3 scripts/learning_bridge.py teach \
  "длительное голодание снижает общий тестостерон — проверь режим питания до выводов" \
  --confirm-method
#   recorded (domain=health-research, confirmed by the caller)
```

**Учить в четыре момента**, а не когда придётся: вывод **отозван**; проверка популяции
**изменила** вывод; преаналитическая находка **объяснила** тревожное значение; закрыт
открытый вопрос.

### Что именно запоминается — МЕТОД, а не вы

Урок — это **правило**, а не выписка. Проверка механическая: *пишется ли общее правило
без конкретного показателя?*

```
случай (не записываем)  «тестостерон 8.04 у этого пациента — артефакт голодания»
правило (записываем)    «длительное голодание снижает общий тестостерон —
                         проверь режим питания до выводов»
```

Если правило без показателя не пишется — это ещё не урок, а находка. Не записывайте.

**Кто это проверяет — честно.** Скрипт **не** отличает метод от выписки: это вопрос
смысла, а не формы. Он отказывает только идентификаторам с **форматом** (email, телефон,
номер карты, буквы вплотную к длинной череде цифр) — здесь регулярка надёжна на любом
языке. Смысловое решение принимает агент по протоколу из `SKILL.md` и подтверждает его
флагом `--confirm-method`; инструмент это подтверждение **не проверяет и не делает вид,
что проверяет**.

Так вышло не от лени: предыдущая версия пыталась судить по тексту и семь раундов
независимого кросс-модельного ревью подряд не прошла — счётчик находок не сошёлся
(11→10→5→3→6→6→8). Прокси смысла ошибается в обе стороны сразу: пропускал
`patient McDonald has HIV` и отвергал `apoB`; отвергал нормальный китайский урок с
формулировкой «заглавная буква». А главного случая не видит вообще никакая регулярка —
«пациент с situs inversus, пробежавший марафон» не содержит ни имени, ни цифры и
указывает на одного человека на планете.

### Гарантия, которая действительно держится

Медицинские уроки живут в **отдельном сторе** — `<проект>/.health-brain/.dz` — и в общий
не пишутся никогда. `recall` читает **оба**, поэтому инженерные уроки переносятся В эту
работу, а медицинские наружу не уходят:

```bash
python3 scripts/learning_bridge.py status
#   self-learning ON via /usr/bin/dz
#     health brain  /path/to/project/.health-brain
#       dz recall --all --stats  —  3 learned pattern(s)
#     shared brain  dz recall --all --stats  —  178 learned pattern(s)
#     lessons from this package are WRITTEN ONLY to the health brain (domain=health-research);
#     recall reads both, so engineering lessons transfer in and medical ones never leave
```

Почему именно так, а не фильтр на выдаче: **стор, который не получает данные, не может
их отдать** — ни одной командой, включая те, которых ещё не написали. Предыдущая версия
держала один стор и фильтровала каждую команду, отдающую текст урока; ревью закрыло
четыре и тут же принесло ещё пять (`guard promote`, `epoch-replay --emit`,
`vector harmonize`, `consolidate --prune-quarantine`, превью `recall --forget`). Фильтр
на каждой команде — это дисциплина, отдельный стор — свойство.

Цена названа честно: перенос стал **односторонним**. Медицинская находка больше не
всплывёт во время инженерной работы. Это менее ценное направление, и оно обменяно на
изоляцию, которая не зависит от памяти автора будущей команды.

Смотреть свои уроки: `dz recall "<запрос>" --project <проект>/.health-brain`. Удалить всё
разом — удалить каталог `.health-brain`. Выключить петлю — не устанавливать
`harness-cli`: без него пакет работает ровно как раньше и **один раз** говорит об этом.

### Важно: ведите медицинскую работу в отдельном каталоге проекта

Разделение выше покрывает то, что пишет **этот пакет**. Оно не покрывает то, что харнесс
записывает про **разговор**, и этот канал реален: хук `UserPromptSubmit` кладёт первые
200 символов каждого промпта в общий `.dz`, а `dz consolidate` умеет собирать сообщения
транскрипта в общие уроки с доменом `general`. То есть если вы наберёте в чате значение
анализа, этот текст попадёт в общий стор независимо от пакета — данные входят **выше**
него.

Проверки внутри пакета этого не закрывают, и мы её не предлагаем: классифицировать
произвольный текст промпта — та же неразрешимая задача, на которой эта фича потеряла семь
раундов ревью. Закрывает это **место работы**:

```bash
mkdir ~/health-research && cd ~/health-research   # медицинская работа живёт здесь
# уроки:        ~/health-research/.health-brain/.dz   (пакет)
# промпты/лог:  ~/health-research/.dz                 (харнесс)
```

Тогда «общий» стор этого проекта сам по себе медицинский, делить нечего, и всё —
промпты, транскрипты, уроки — лежит в одном каталоге, который можно осмотреть или удалить
целиком. **Не ведите медицинские исследования внутри рабочего репозитория с кодом.** Если
уже вели: лог промптов — `.dz/recall-usage.jsonl`, уроки — в `.health-brain/`.

**Если всё-таки решите положить медицинские уроки в общий стор — вам это не запретят,
но предупредят.** `dz teach --domain health-research` в общий стор печатает, что из этого
следует, называет рекомендацию по умолчанию и показывает команду, которая делает иначе;
`dz recall --all --json --include-domain health-research` отдаёт данные и говорит, сколько
именно медицинских уроков уехало в файл. Оба сообщения кончаются одинаково: *ничего не
заблокировано, это ваше решение*. Мы считаем, что решение о своих данных принимает их
владелец — наша задача, чтобы оно было осознанным, а не случайным.

## Консилиум: схема находок специалиста и гейт сохранности оговорок (v1.6.1)

Слой «терапевт + специалисты» для сложных случаев. **Честная рамка — что именно ставит этот
npm-пакет:**

- **Пакет ставит** структурную схему находок специалиста (`ha-finding-1`,
  `base/formats/specialist-findings.md`), контракт рендера синтеза
  (`base/formats/consult-synthesis.md`), детерминированный компаратор экстренных порогов
  (`triage`) и машинный гейт сохранности оговорок (`consult-gate`).
- **Пакет сам НЕ исполняет multi-agent-оркестрацию.** Разворачивание параллельных
  специалистов, чекпоинты состава и сборка синтеза — возможность ХОСТА (host-side workflow в
  репозитории, где живёт ваш агентский харнесс), а не самого npm-пакета: `npm install` даёт
  скиллы, схему и гейт — оркеструет их хост. Приписать пакету fan-out было бы capability
  laundering; эта фраза охраняется именованным тестом.

### Схема находок (`ha-finding-1`)

Каждый специалист отвечает структурным JSON, не прозой: стабильные, пересчитываемые из
содержимого `finding_id`/`caveat_id`; **обязательный** `caveats[]` (пустой допустим только для
наблюдений); каждая оговорка ПРИВЯЗАНА полями `applies_to` к утверждению/дозе/популяции/значениям.
Непарсящийся ответ = именованный упавший специалист (`LaneFailure` из закрытой таксономии причин),
не молчаливый пропуск.

### Гейт (`consult-gate`) — shadow по умолчанию

Детерминированная сверка синтеза против находок по СВЯЗКЕ (равенство множеств `applies-to`), не по
«текст присутствует»: оговорка под чужим утверждением — MISS даже при дословном тексте.
Байт-совпадение цитируемых значений (value И unit, без округления). Precision-правило: фабрикация
лишних оговорок не может улучшить ни одну ось и отдельно флагуется. Recall и precision — две
раздельные оси; вердикт — худшая ось (никаких средних и композитных баллов).

**Shadow-режим** (по умолчанию): только отчёт, вывод не меняется, exit 0 по построению — даже на
провальном синтезе. Enforcement — за ДВУМЯ независимыми переключателями (`--mode enforce` И
версионированный ключ `caveat_gate.enforce_policy: "v1"` в НЕпоставляемом воркспейс-конфиге
`.dz/config.json` вызывающего каталога); дефолт пакета — shadow, смена дефолта потребует нового ADR.

**Контракт enforce-режима (раунд 4 — все три флага ОБЯЗАТЕЛЬНЫ):** enforcing-вызов имеет ровно
одну форму —

```bash
health-advisor consult-gate synthesis.md --lanes <dir> --mode enforce \
  --expect cardiology,clinical-pharmacology --run-id run-1 \
  --report gate-report.json --json
```

Отсутствие ЛЮБОГО из `--expect` / `--run-id` / `--report` в enforce — usage-ошибка (exit 2) с
именем флага. Shadow остаётся report-only и может идти без всех трёх (блокировать там нечего).

**Ожидаемый состав (`--expect s1,s2,…`):** гейт видит только файлы, которые линии НАПИСАЛИ;
без ростера мёртвая линия (агент упал, файла нет) молча исчезала из проверки. С `--expect`
каждая ожидаемая специальность без файла находок становится ИМЕНОВАННЫМ отказом (`missing` из
закрытой таксономии), который синтез ОБЯЗАН раскрыть — нераскрытый мёртвый специалист валит
enforcing-прогон. Отсутствие флага, пустой ростер, ПУСТОЙ КОМПОНЕНТ ростера
(`'cardiology,,clinical-pharmacology'` — исполненная проба ревьюера раунда 3: `filter(Boolean)`
молча выбрасывал пустой член) или дубликаты — usage-ошибка (exit 2), а не тривиально- или
молчаливо-удовлетворённая проверка.

**Привязка к прогону (`--run-id <id>`):** каждая линия пишет `lane.run_id`; гейт с `--run-id`
отвергает файл с другим или отсутствующим `run_id` как именованный `run_mismatch` —
устаревший/подложенный файл чужого прогона не может удовлетворить ростер. С раунда 4 `--run-id`
в enforce обязателен БЕЗУСЛОВНО (раунд 3 требовал его только когда файлы линий уже несли
`run_id` — и полностью «раздетый» от run_id набор линий проходил enforce вообще без привязки;
исполненная проба ревьюера). Криптографическая целостность lane-файлов — ВНЕ рамок, и это
названо в residual-limits ДВУМЯ строками: (а) привязка доказывает ИДЕНТИЧНОСТЬ прогона, не
подлинность — файл, подделанный внутри ТОГО ЖЕ прогона с верным `run_id`, гейт не отличит
(`run_id` — не секрет); (б) перенос пинов живёт в `--report`-файле на честной файловой системе —
схемно-невалидный отчёт даёт громкий exit 2, но УДАЛЁННЫЙ между попытками отчёт неотличим от
первой попытки (пины сбрасываются незаметно).

**Валидация `--report`-файла (раунд 4):** JSON-парсабельность ≠ валидность. Существующий
`--report` в enforce обязан соответствовать ТОЧНОЙ схеме `ha-gate-report-1`, включая
`pinned_caveat_ids` строго из строк; любой дефект — exit 2 с именем дефекта. Валидный-но-чужой
файл (`{}` — исполненная проба ревьюера раунда 3) больше не может молча сбросить перенос пинов;
нестроковые элементы отвергаются, а не отфильтровываются.

**Материальность по ТИПУ (pinned types):** `severity_if_dropped` объявляет сама линия-эмитент —
та сторона, чью компрессию гейт и ловит; одно поле не должно уметь разоружать проверку связки.
Машинно гарантированы РОВНО две вещи (раунд 3): (1) типы `FRESHNESS_UNKNOWN`, `GRADE`,
`dose_scope`, `population_scope`, `contraindication_scope`, `measurement_context` материальны
ПО ТИПУ — переразметка `severity_if_dropped` вниз не выводит их потерю из блокирующей корзины;
(2) правило id-pinning: `caveat_id`, ХОТЬ РАЗ увиденный в этом прогоне с pinned-типом (перенос
между попытками — через `pinned_caveat_ids` в `--report`), навсегда материален — повторная
эмиссия под непиновым типом сама по себе нарушение `CAVEAT_RETYPED`. ОСТАТОЧНАЯ дыра, честно:
ТИП при ПЕРВОЙ эмиссии объявляет эмитент — специалист, с самого начала типизировавший
противопоказание непиновым типом или спрятавший его в свободный текст, под pinned-гарантию не
попадает (семантическое соответствие типа смыслу машина не докажет; названо в residual-limits).
Раздельный учёт material/informational назван в residual-limits футере каждого отчёта.

**Граница честности (non-goal):** гейт доказывает целостность документа относительно его
хранилища утверждений и сохранность оговорок — НЕ клиническую полноту: опасный паттерн,
размазанный по отдельно «несерьёзным» находкам, может пройти гейт. Эта граница задокументирована
и охраняется тестом.

### Экстренный триаж (`triage`)

12 канонических порогов (`base/skills/references/emergency-thresholds.md` — единственный источник;
машинный реестр и таблица скилла сверяются parity-тестом). Действие каждой строки — данные
(`ambulance` | `doctor_24h`), никогда не «суждение» компаратора; строка без действия валит загрузку
всего реестра. Чистый результат честен closed-world-рамкой: «ни один из 12 порогов не сработал» —
это НЕ «нет экстренности».

---

## Требования

- Node.js 18+
- [Claude Code](https://claude.ai/claude-code)
- Python 3.8+ — для скриптов провенанса (`evidence_fetch`, `check_report_evidence`); только
  стандартная библиотека. Для проверки подписей дополнительно `cryptography` или `pynacl`
  в отдельном venv.
- [`@dzhechkov/harness-cli`](https://www.npmjs.com/package/@dzhechkov/harness-cli) — **опционально,
  только для самообучения.** Без него пакет работает полностью: все исследования, провенанс,
  подписи и гейт отчёта не зависят от него. Выключается ровно одно — обучение на собственных
  ретракциях (см. ниже). Пакет обнаруживает `dz` в PATH сам и один раз честно говорит, что
  петля выключена; жёсткой ошибки не будет никогда.

---

## Важно знать

Это не медицинский прибор и не замена врачу. Все результаты носят информационный характер. Всегда проверяйте рекомендации с квалифицированным специалистом. Не принимайте медицинских решений только на основе этих данных.

---

## Ссылки

- [GitHub](https://github.com/djd1m/dz-harness-hub/tree/main/packages/@dzhechkov/health-advisor)
- [OpenClaw Medical Skills](https://github.com/FreedomIntelligence/OpenClaw-Medical-Skills)
- [Claude Code](https://claude.ai/claude-code)

## Лицензия

MIT
