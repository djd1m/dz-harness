# ai-factory-mapper

Скилл для Claude Code / Claude Desktop, который декомпозирует любую бизнес-задачу на оптимальный пайплайн из сервисов **Cloud.ru Evolution AI Factory** (Foundation Models, ML Inference, Managed RAG, ML Finetuning, Notebooks, AI Agents, AI Workflows + 50+ MCP-серверов и 21 готовый агент).

## Что делает

На входе — бизнес-сценарий (агент поддержки, обработка документов, маркетинг, discovery и т.д.).
На выходе:
1. Декомпозиция workflow на 7–12 шагов
2. Маппинг каждого шага на сервисы AI Factory
3. Категоризация покрытия: ✅ Полное / ⚠️ Частичное / ❌ Нет
4. Список gap'ов с вариантами закрытия
5. Воспроизводимая оценка покрытия в %
6. Mermaid-диаграмма пайплайна
7. Готовый Markdown + DOCX-отчёт
8. Если сценариев несколько — сводная таблица ранжирования

## Философия: оркестрация, а не копирование

Скилл **не дублирует** функционал других скиллов — он вызывает их через `view()`:
- `explore` — если задача сформулирована нечётко
- `problem-solver-enhanced` — для first-principles декомпозиции
- `goap-research-ed25519` — для верификации актуальности каталога
- `docx` — для генерации финального отчёта
- `analyst-manual-full` — для комплексных кейсов с checkpoints

Получает обновления этих скиллов автоматически.

## Структура

```
ai-factory-mapper/
├── SKILL.md                       # workflow и оркестрация (470 строк)
├── references/
│   ├── catalog.md                 # актуальный каталог AI Factory
│   ├── decomposition-checklist.md # 10-пунктов чек-лист
│   ├── coverage-formula.md        # воспроизводимая формула %
│   └── pattern-library.md         # 10 типовых паттернов
├── assets/
│   └── report-template.md         # шаблон отчёта
├── scripts/
│   └── build_docx_report.js       # генератор DOCX из JSON
└── evals/
    ├── evals.json                 # тест-кейсы
    ├── smoke_test_input.json      # минимальный smoke-тест
    └── real_case_input.json       # полный тест на 5 сценариях
```

## Триггеры

Скилл активируется на фразы вроде:
- «Разложи задачу X на сервисы AI Factory»
- «Какие сервисы Cloud.ru нужны для агента поддержки?»
- «Можно ли реализовать X на Evolution AI Factory?»
- «Собери пайплайн на AI Factory»
- «Какое покрытие у сценария X сервисами Cloud.ru?»
- «Сравни сценарии по покрытию AI Factory»

## Quick test

```bash
cd ai-factory-mapper
node scripts/build_docx_report.js evals/smoke_test_input.json /tmp/smoke.docx
# → ✅ DOCX создан: /tmp/smoke.docx
```

Для полной проверки:
```bash
node scripts/build_docx_report.js evals/real_case_input.json /tmp/real.docx
python3 <path-to-docx-skill>/scripts/office/validate.py /tmp/real.docx
```

## Maintenance

Раз в 1–2 месяца обновляй `references/catalog.md`:
1. Проверь `cloud.ru/products/evolution-ai-factory` на новые сервисы
2. Пройдись по Evolution Agents Marketplace
3. Обнови дату в шапке catalog.md

Если появились фундаментально новые категории — добавь паттерны в `pattern-library.md`.

## Dependencies

- Node.js + `docx` package (`npm install -g docx`)
- Python 3 для валидации DOCX
- Зависит от скиллов: `explore`, `problem-solver-enhanced`, `goap-research-ed25519`, `docx`, `analyst-manual-full`

## Версия

v1.0 — апрель 2026
