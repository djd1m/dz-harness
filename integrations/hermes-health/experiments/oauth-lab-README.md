# Offline OAuth owner lab

**Это синтетическая лабораторная модель, не credential broker и не адаптер
Hermes.** Не передавайте реальные токены и не подключайте к сервисам.
Python stdlib/Linux flock; сеть, HTTP endpoints и environment credentials
не используются. Принимаются только искусственные FAKE_* значения.

## Что моделируется

Копии refresh chain конфликтуют; один owner под локальным flock выполняет
один refresh. Fake provider хранит собственный общий ledger между процессами.
Клиент получает access и expiry, но не refresh. Перед provider создаётся
сохранённый pending marker; после нового durable state marker удаляется.
Ошибки provider закрывают chain без автоматического retry. Нет reset API:
новый искусственный grant требует нового закрытого каталога.

## Запуск

```bash
python3 -m unittest discover -s integrations/hermes-health/experiments/tests -p test_night_oauth_lab.py -v
```

Тесты используют собственные0700 каталоги /var/tmp, файлы0600, barrier и реальные
процессы. Состояние cleanup после прогона содержит только искусственные значения.
Не запускать с реальными auth.json. В типовом Hermes runtime этот каталог не
устанавливается и tool/команда не регистрируются.

## Границы доказательства

Process exit и инъекция ошибки syscall не моделируют потерю питания или отказ
носителя. При failed fsync нового state pending сохраняется, новый процесс
отказывает. После durable state, но при failed fsync удаления pending, текущий
вызов отказывает, а следующий процесс может увидеть уже сохранённый successor:
это явно проверенное ограничение, не гарантия persisted uncertain.

Приватные пути и lock на local FS; нет поддержки NFS, враждебного администратора,
разных копий одного state, clock rollback и программ, игнорирующих этот lock.
Lock inode не удаляется при штатной работе. Физический disk durability, реальная
OAuth semantics и поддержка запрета refresh в Codex CLI этим не доказаны.
Нет автоматического login/reset, продакшен-monitoring или recovery сервиса.

Для эксплуатации сейчас проще проверять независимые штатные OAuth-сессии.
Общий refresh-owner потребует поддерживаемого клиента и отдельной интеграционной
приёмки — нельзя считать PASS этих тестов разрешением внедрения.
