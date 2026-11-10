# Проверка восстановления и установки

2026-11-09, действия на целевом хабе, без изменения рабочей карты.

## S3 restore

Штатный restore.sh --check:exit0. Затем restore.sh --yes --from offsite
--snapshot c48c1a01 --target /var/tmp/corp-restore/hermes-night-20261109:exit0.
Режим --apply не использовался. Секреты читались только самим backup tooling;
восстановленный каталог root0700, gateway не запускался.

- 123 записи manifest: размер и SHA-256 каждого raw file совпали.
- SHA-256 manifest совпал с сохранённым baseline PDF-релиза.
- 7 SQLite файлов в восстановленных карте/Hermes home:integrity_check=ok.
- Оба архива release images (Hermes и PDF parser) совпали с сохранёнными SHA-256.
- Это не проверка клинического содержания и не утверждение полноты всех внешних
  источников. Снимок не включает изменения карты/авторизации, появившиеся позже.

## Установка плагина в чистый home

Новый ephemeral контейнер точного установленного image c872058e59ba…,
--init, --network none, user1000:1001, новый tmpfs home. Только curated plugin
и read-only checks, без production volumes/auth/gateway.

Штатный enable/doctor/validate:PASS,6tools. Известное предупреждение private
ContextVars intake сохраняется; поддержка произвольного Hermes не заявляется.
Реальный integration_check.py:synthetic ingest/search, source SHA,
подмена индексного body, read-only, stale source и missing runtime:PASS.

Это чистый home/runtime-контейнер на текущем Docker host, не полностью новый
VPS и не rebuild всего образа из публичного registry. Архив образа восстановлен
из S3 и проверен; восстановленный production gateway намеренно не запускался.

## Повторная чистая установка candidate adapter

После independent adapter QE выполнена отдельная установка curated candidate из
commit `2172a56` (документация QE добавлена `3f77c23`) в новый tmpfs Hermes home.
Core read-only overlay — `1dbdcaed0`. Тот же pinned image, сеть отключена,
никаких production volumes или credentials.

MEASURED: enable/doctor/validate PASS, **7 tools**, integration_check.py PASS
для synthetic ingest, real CLI search, source hash, tampered index body,
read-only, stale source и missing runtime. Exit0, лог
`/tmp/hermes-night-candidate-clean.log`. Предупреждение private ContextVars
сохранилось. Это проверка загрузки candidate, не реальной Mattermost доставки.

Повторный fresh-home тест не переустанавливал production plugin. Сохранённые
recognized artifacts привязаны к dev/inode workspace: старый S3 restore не
доказывает их переносимость, recovery/rebind остаётся отдельным deployment gate.
