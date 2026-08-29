# Каталог Cloud.ru Evolution AI Factory — справочник

> **Последнее обновление:** апрель 2026
> **Источник:** cloud.ru/products/evolution-ai-factory + Evolution Agents Marketplace
> **Как использовать:** это базовый справочник. Перед каждым анализом ОБЯЗАТЕЛЬНО делай `web_search` для проверки свежих анонсов — каталог обновляется ежемесячно.

---

## Содержание

1. [Платформенные сервисы (Core)](#1-платформенные-сервисы-core)
2. [Готовые AI-агенты](#2-готовые-ai-агенты)
3. [MCP-серверы](#3-mcp-серверы)
4. [Что AI Factory точно НЕ покрывает (типовые gap'ы)](#4-что-ai-factory-точно-не-покрывает-типовые-gapы)

---

## 1. Платформенные сервисы (Core)

Фундаментальный слой — на эти сервисы опирается всё остальное.

### Evolution Foundation Models (FM)
- **Что это:** LLM по API без развёртывания
- **Доступные модели:** GigaChat, Qwen, DeepSeek, LLaMA, GLM, OpenAI (через прокси)
- **Для чего использовать:** генерация текста, классификация, NER, reasoning, structured output, простой OCR через мультимодальные модели (Qwen-VL, GLM-4V)
- **Ограничения:** для узких доменов может понадобиться ML Finetuning

### Evolution ML Inference
- **Что это:** сервис для деплоя моделей из Hugging Face в кастомных Docker-образах на GPU
- **Для чего использовать:** когда нужна модель, которой нет в FM (специализированные OCR, STT, image-gen, embeddings, классификаторы)
- **Паттерн:** «нашли модель на HF → обернули в MCP → вызываем из AI Workflows»

### Evolution Managed RAG
- **Что это:** готовый RAG-сервис для работы с корпоративными данными
- **Для чего использовать:** база знаний, поиск по документации, семантический поиск, grounding ответов LLM
- **Интеграция:** есть MCP-клиент, можно подключить из AI Agents / AI Workflows

### Evolution ML Finetuning
- **Что это:** дообучение LLM под специфику домена
- **Для чего использовать:** специализированные классификаторы, стиль, узкие жаргоны
- **Когда нужно:** если RAG + prompting не дают нужной точности

### Evolution Notebooks
- **Что это:** Jupyter как сервис на GPU
- **Для чего использовать:** data science, аналитика, прототипирование, кастомные ETL-пайплайны, обучение моделей

### Evolution AI Agents
- **Что это:** визуальный low-code конструктор агентов
- **Для чего использовать:** создание агентов с инструментами (MCP), маршрутизация, conditional logic
- **Идеально для:** multi-step reasoning агентов с доступом к tools

### Evolution AI Workflows (GA апрель 2026)
- **Что это:** low-code оркестратор бизнес-процессов, n8n-like
- **Встроенные коннекторы:** Jira, 1С (частично), Confluence, PostgreSQL, SMTP/IMAP почта, мессенджеры (Max и др.), любые HTTP-API через generic-узел
- **Интеграция с AI Factory:** FM, ML Inference, AI Agents, Managed RAG — как нативные узлы
- **Для чего использовать:** детерминированные пайплайны без сложного reasoning (ETL, routing, scheduled jobs)

---

## 2. Готовые AI-агенты

Все на базе MiniMax-M2. Цены от 1.92 ₽/час.

### Поиск и данные
- **Агент для поиска информации** — web search, простой Q&A
- **Агент метеоролог** — погодные знания
- **Архивариус** — работа с базой знаний (BZ RAG)

### Бизнес и торговля
- **Агент бизнес-аналитик** — мониторинг контрагентов, оценка рисков, раннее предупреждение
- **Консультант по контрагентам** — due diligence перед заключением договоров
- **Агент для анализа компаний** — комплексный стратегический анализ, market research
- **Агент для работы с контрагентами** — проверка поставщиков, закупочная активность
- **Комплаенс агент** — юридическая проверка, проверка соответствия законодательству
- **Binance агент** — работа с Binance API (торговля крипто)
- **Агент - Python разработчик (Торговля)** — финансовый анализ, инвестиционная привлекательность

### DevOps / Infrastructure
- **SRE Агент** — сетевая диагностика, мониторинг инфраструктуры
- **IP Агент** — работа с IP-адресами
- **Managed Spark Agent** — управление Spark-инфраструктурой
- **Apache Spark аналитик** — работа с Spark-данными
- **Агент Postgres DBA** — бизнес- и теханалитика БД
- **Агент - Python разработчик (Evolution)** — динамическое выполнение Python-кода

### CRM / Офис
- **amoCRM ассистент** — автоматизация CRM-процессов
- **Figma ассистент** — работа с дизайн-файлами
- **Агент для Miro** — визуальные доски
- **Агент рекрутер** — анализ рынка труда, вакансии, зарплаты

---

## 3. MCP-серверы

> 50+ серверов в каталоге. Сгруппированы по категориям. Все от 1.92 ₽/час.

### Корпоративные системы (управление)
- **Confluence MCP** — управление пространствами, страницами, комментариями, метками
- **Jira MCP** — задачи, эпики, спринты, проекты
- **Trello MCP** — доски, списки, карточки
- **Miro MCP** — доски, элементы, теги, участники
- **amoCRM MCP** — полная интеграция с amoCRM (FastMCP)
- **HeadHunter MCP** — вакансии, резюме, рынок труда (от Союзтелеком)
- **Мессенджер Max MCP** — сообщения, чаты, файлы, автоматизация коммуникаций
- **Figma MCP** — работа с дизайн-файлами

### Данные и базы
- **Postgres MCP** — SQL, анализ, планы выполнения, советы по индексам (HypoPG)
- **MongoDB MCP** — базы, коллекции, документы
- **Apache Spark History MCP** — анализ Spark-задач
- **Cloud.ru Managed Spark MCP** — управление Spark-кластерами
- **Managed RAG MCP** — интеграция с Managed RAG
- **Росстат MCP** — федеральная статистика РФ (экономика, демография, регионы)
- **MOEX MCP** — Московская биржа (ценные бумаги, котировки)
- **Binance MCP** — Binance API (крипто)
- **EVM Universal MCP** — EVM-совместимые блокчейны
- **Валютные курсы MCP** — ЦБ РФ, конвертация
- **Kinopoisk MCP** — API Кинопоиска (kinopoisk.dev)

### Файлы и документы (офисный пакет)
- **FileSystem S3 MCP** — S3/Object Storage (AWS + Evolution): чтение, запись, управление объектами
- **DOCX MCP** — создание, редактирование .docx
- **Excel MCP** — xlsx через openpyxl + pandas
- **PowerPoint MCP** — создание/редактирование .pptx
- **Mermaid MCP** — генерация диаграмм (PNG/SVG из Mermaid-кода)

### Инфраструктура
- **Evolution IAM MCP** — пользователи, роли, разрешения, проекты, сервисные аккаунты
- **Evolution DNS MCP** — DNS-серверы, приватные/публичные зоны, VPC
- **Managed Kubernetes MCP** — кластеры, группы узлов, плагины, квоты, биллинг
- **Artifact Registry MCP** — образы и артефакты
- **Network Tools MCP** — сетевая диагностика (8 инструментов)
- **Grafana MCP** — доступ к Grafana и экосистеме

### Верификация и data enrichment
- **Контур.Фокус MCP** — ЕГРЮЛ/ЕГРИП, юрлица и ИП
- **Mermaid MCP** — диаграммы как сервис

### Поиск и внешние API
- **Web Searcher MCP** — поиск в интернете с аналитикой
- **Weather MCP** — Open-Meteo API
- **IP Location MCP** — геолокация по IP
- **Parking Moscow MCP** — парковки Москвы
- **Astronomy MCP** — астрономические данные

### Утилиты
- **Math MCP** — математические, бухгалтерские, статистические расчёты
- **Python Code Executor MCP** — безопасное выполнение Python-кода

### Наука
- **Medical Literature MCP** — медицинская/биологическая литература (FastMCP)
- **Научные БД MCP** — eLibrary, КиберЛенинка, РИНЦ, гранты

### Маркетплейсы
- **Avito Autoteka MCP** — проверка автомобилей с пробегом
- **Avito Messaging MCP** — автоматизация общения на Avito

---

## 4. Что AI Factory точно НЕ покрывает (типовые gap'ы)

Эти пробелы встречаются в большинстве enterprise-сценариев. Используй как чек-лист при поиске gap'ов.

### Нетекстовые модальности
- ❌ **OCR сканов** (печати, таблицы) — деплой PaddleOCR/docTR/TrOCR/Surya через ML Inference
- ❌ **STT / распознавание речи** — деплой Whisper/GigaAM через ML Inference или внешний API (Yandex SpeechKit)
- ❌ **TTS / синтез речи** — деплой XTTS/VITS или внешний API
- ❌ **Image generation** — деплой Flux/SDXL/Kandinsky через ML Inference или внешний API
- ❌ **Video generation** — out-of-scope для AI Factory (пока), только через внешние сервисы
- ❌ **Видео-аналитика / CV** — деплой через ML Inference

### Российские бизнес-системы
- ❌ **1С:Бухгалтерия / 1С:ERP / 1С:Документооборот** — нет MCP; через OData/COM-шлюз кастомом
- ❌ **SAP** — нет MCP; через RFC/OData
- ❌ **Битрикс24** — нет MCP; через REST API кастомом
- ❌ **ЭДО (Диадок / СБИС / Тензор / Такском)** — нет MCP; кастомные коннекторы к API ЭДО
- ❌ **ЭЦП (КриптоПро CSP / VipNet / VSign)** — out-of-scope, отдельный криптостек

### Helpdesk / Service Desk
- ❌ **Naumen Service Desk** — нет MCP
- ❌ **BPMSoft / ELMA / Omnidesk / Teamly / OTRS / Zendesk** — нет MCP; кастом через REST
- ❌ **Omnichannel ingest (звонки / SIP)** — нет коннектора, нужна телефония (Asterisk, FreeSWITCH) + STT

### Разработка
- ❌ **Git-хостинги** — ни GitLab, ни GitHub, ни GitVerse, ни Gitea, ни Bitbucket не имеют MCP; кастом через API
- ❌ **CI/CD системы** — GitLab CI, Jenkins, TeamCity, Argo CD, Tekton — нет MCP
- ❌ **SAST/DAST** — SonarQube, CodeQL, Semgrep, Snyk, Svace, AppScreener — нет MCP
- ❌ **Code coverage analytics** — нет MCP

### Маркетинг / Реклама
- ❌ **Рекламные кабинеты** — VK Ads, Yandex Direct, MyTarget, Telegram Ads — нет MCP
- ❌ **CDP / ESP** — Mindbox, SendPulse, Unisender, Enkod, DashaMail — нет MCP
- ❌ **Аналитика посещаемости** — Яндекс.Метрика, Google Analytics — нет MCP
- ❌ **ОРД (оператор рекламных данных)** — out-of-scope
- ❌ **A/B тестинг как сервис** — уровень Optimizely/VWO отсутствует

### Соцсети и контент
- ❌ **VK API / Telegram API (нативный)** — нет специализированных MCP (есть только Max)
- ❌ **X / LinkedIn / Instagram** — нет MCP
- ❌ **YouTube / Rutube / VK Video** — нет MCP

### Опросы и исследования
- ❌ **SurveyMonkey / Typeform / Testograf / Анкетолог / Яндекс.Формы** — нет MCP
- ❌ **Патентные базы** (Rospatent, Google Patents) — нет MCP
- ❌ **Платные data-provider'ы** (SimilarWeb, Statista, Bloomberg, Crunchbase, PitchBook, СПАРК премиум) — нет MCP, лицензионные ограничения

### Финансы (дополнительно)
- ❌ **ERP / MRP** (SAP, Oracle EBS, Microsoft Dynamics, Галактика) — нет MCP
- ❌ **Casino/банк-клиенты** — нет MCP
- ❌ **3-way matching** (счёт ↔ заказ ↔ акт) — не сервис, а детерминированная бизнес-логика; LLM-only подход рискован для финансов

---

## Как быстро найти подходящий сервис

1. **Нужна LLM?** → Foundation Models
2. **Нужна специфичная модель?** → ML Inference + HF
3. **Нужна база знаний / RAG?** → Managed RAG
4. **Нужно подключиться к трекеру задач?** → Jira/Trello MCP
5. **Нужны корпоративные документы/вики?** → Confluence MCP
6. **Нужны файлы в S3?** → FileSystem S3 MCP
7. **Нужна работа с Office-файлами?** → DOCX/Excel/PowerPoint MCP
8. **Нужно проверить контрагента?** → Контур.Фокус MCP + Бизнес-аналитик
9. **Нужны данные о рынке труда?** → HeadHunter MCP + Рекрутер
10. **Нужна статистика РФ?** → Росстат MCP
11. **Нужен мониторинг infra?** → Grafana MCP + SRE агент + Network Tools MCP
12. **Нужно оркестрировать несколько шагов?** → AI Workflows (low-code) или AI Agents (reasoning)

Если ничего не подходит из пунктов 1–12 — вероятно, это **gap**, и нужен кастомный MCP или деплой в ML Inference.
