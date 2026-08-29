# Phase 4: Architecture — Техническая архитектура

## Использование
```
/architecture-phase [путь к директории исследования]
```

## Аргумент
$ARGUMENTS

## Действия

1. **Прочитай Phase 0-3** для полного контекста
2. **Спроектируй архитектуру:**
   - Архитектурная диаграмма (Mermaid C4)
   - Компоненты решения (технология, назначение, обоснование)
   - AI Models & Pipeline (задача, тип, конкретная модель)
   - Data Architecture (источники, ETL, storage, Vector DB)
   - Интеграции (система, протокол)
   - Security & Compliance (контур, RBAC, аудит, регуляторика)
   - Scalability (latency, throughput, масштабирование)
   - MVP Scope

3. **Обязательные диаграммы (минимум 2):**
   - `architecture-c4.mermaid` — C4 Context
   - `sequence-main-flow.mermaid` — Sequence diagram ключевого flow

4. **Создай файлы:**
   - `04_architecture.md`
   - `diagrams/architecture-c4.mermaid`
   - `diagrams/sequence-main-flow.mermaid`
5. **Покажи Checkpoint 4**

## Domain-specific правила
- **Банк:** on-premise LLM, ФЗ-152, ЦБ, ФСТЭК, GigaChat/YandexGPT
- **Ритейл:** Latency < 200ms, A/B тестирование
- **Enterprise:** Change Management, Legacy интеграции, SLA
