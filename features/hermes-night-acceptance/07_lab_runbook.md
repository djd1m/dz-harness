# Воспроизводимая лаборатория и границы внедрения

Этот шаблон предназначен для изолированных технических тестов. Он не включает
новые команды записи в рабочем медицинском контейнере.

## Закреплённые зависимости

- Hermes image: `sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961`.
- Node в image: `/opt/health-node22/bin/node`, 22.23.4.
- Runtime: `/opt/health-advisor-runtime`; сохраняются установленные harness-core и native SQLite.
- Core candidate: PR126 `djd1m/dz-harness-hub`, commit `1dbdcaed063540bafa629d5da9622b4f09728127`.
- Adapter source: PR36 `djd1m/dz-harness`, commit `2172a56f1b32381369443c40c3c94f0b208aaa46`; независимый отчёт добавлен `3f77c23`.

Имена локальных checkout приведены в командах QE. Для другого хоста меняются
только пути bind mounts, после проверки exact commit/hash. Image должен быть
уже получен доверенным способом; наличие digest в документе не делает image
публично доступным. Image backup из S3 проверен отдельно.

## Изоляция

Контейнер теста: `--rm --init --network none --user 1000:1001`, новый исполняемый
private tmpfs, исходники/runtime overlay `:ro`. Production volumes, `.env`, auth,
Mattermost token и настоящие медицинские документы не монтируются. Для SQLite
сохраняется совпадение Node ABI и native addon. Новый home исключает наследование
профиля рабочего агента.

Сначала копируются только runtime-файлы плагина и `skills/` в
`$HERMES_HOME/plugins/hermes-health`, затем:

```sh
hermes plugins enable hermes-health
hermes plugins doctor "$HERMES_HOME/plugins/hermes-health"
hermes plugins validate "$HERMES_HOME/plugins/hermes-health" --json
```

Полные команды regression/integration находятся в
`../hermes-recognized-confirm/08_qe_report.md`. Проверяется не только загрузка:
реальный core CLI сохраняет технический текст, повтор подтверждения не создаёт
второй артефакт, аварии переводятся в явное reconciliation.

## Конфигурация подтверждения в тесте

```dotenv
HEALTH_WORKSPACE=/test/medical
HEALTH_NODE=/opt/health-node22/bin/node
HEALTH_RUNTIME=/opt/health-advisor-runtime
HEALTH_DRAFTS=/test/drafts
HEALTH_INTAKE_STATE=/test/intake-state
HEALTH_RECOGNIZED_STATE=/test/recognized-state
HEALTH_RECOGNIZED_SYNTHETIC_WRITE=1
```

Это пример значений **только для синтетической лаборатории**. Создание private
каталогов выполняет fixture. Состояния, карта и drafts физически раздельны.
Имя флага не распознаёт медицинские данные и не заменяет операторскую проверку.
Для обычной установки флаг не задаётся: новая запись остаётся выключенной.

Модель может подготовить квитанцию; отдельная команда gateway подтверждает её
от доверенного отправителя. Статус текста остаётся `unverified`,
`human_verification=not_established`. Клиническая проверка, OCR и индексация
не подразумеваются. Прямой вызов handler в тесте не доказывает доставку команды
через настоящий Mattermost. Права shell того же UID лежат вне этой границы.

## Индексация

Управляемая индексация — отдельный operator-only experiment, не инструмент
Hermes и не часть подтверждения сохранения. Используется immutable operation
ID, точный план, явное подтверждение и private synthetic sentinel. Полнота
проверяется по SQLite, а известный источник — реальным поиском. `recall --all`
по умолчанию скрывает медицинский домен; это не свидетельство пустого индекса.
Инструкция experiment и его отдельный QE являются обязательными входами.

## Отказ и откат теста

При неопределённом сохранении не удалять квитанцию и не создавать новый operation
ID: сначала status/reconciliation. При неизвестном результате индекса — отдельный
reconcile, без автоматического повторения intake/save. Сохранённые данные и
квитанции не удаляются для маскировки ошибки.

Тестовые контейнеры одноразовые. Рабочий контейнер не пересоздавался; поэтому
production rollback этой итерации не требуется. Для будущего внедрения заранее
нужны backup state/HMAC и карты, восстановление новых артефактов на другом inode,
реальный Mattermost round-trip, согласование версии внутренних API и отдельное
разрешение на production. Восстановление старого снимка не закрывает эти условия.
