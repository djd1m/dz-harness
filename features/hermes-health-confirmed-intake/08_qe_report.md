# Проверки — 2026-11-09

## Исходный baseline до исправления

Pinned health-advisor1.10.8, Node22.23.4, Hermes runtime; отдельный контейнер --network none, только исходники теста read-only. Медицинские тома не подключались.

Команда внутри подготовленного runtime:

```bash
python3 /plugin/tests/intake_write_contract_probe.py
```

Все четыре утверждения probe подтверждены:

1. Два ZIP с одинаковыми байтами и разными внутренними именами добавили две записи с одинаковым SHA-256.
2. ZIP с ранее добавленным файлом и одним новым вернул успех; последующий --verify вернул ошибку из-за лишнего raw.
3. После замены исходника на другие байты того же размера повтор исходного ZIP вернул idempotent=true; --verify выявил повреждение.
4. Принудительное завершение непосредственно перед writeCatalogAtomically оставило raw при неизменном manifest; --verify выявил расхождение.

Это characterization существующих дефектов, а не желательное поведение и не допуск writer в production. Проба не проверяет восстановление, авторизацию, шлюз или будущую транзакцию. Независимый reviewer изучил код, подтвердил ограничения и условия MVP; полный L-tier release-gate не запускался.

Этот baseline сохранён как воспроизведение прежних ошибок. Исправления ядра входят в source PR125; старый probe намеренно описывает дефекты1.10.8 и не является acceptance нового ядра.


## Кандидат0.3

Source82bcb0a и исправления d6d7026.58 тестов прошли офлайн на точном собранном health-advisor1.10.10-hermes.0, без production mounts. Включены реальный command handler, ContextVars, полный путь Mattermost posted→adapter→gateway→CLI, commit/replay, identity/expiry/tamper/refusal, unknown после потери ответа и durability parent-directory fsync.

Независимая gpt-6-astra проверка выявила и добилась исправления parentfsync и replay provenance drift. Владелец явно выбрал Codex different-model QE вместо cross-family Claude. Финальный отчёт08b_astra_review.md.

Реальный third-brain поиск по синтетическому документу прошёл в точном candidate image. hermes plugins validate и doctor прошли:5 tools; validator отдельно предупреждает о private ContextVars API. Версия Hermes закреплена0.22.2; обновление требует нового теста интерфейса. Реальная доставка из клиента Mattermost и запись технического документа пользователем ещё не приняты. Полный Direct Extended AQE не запускался: aqe отсутствует, использован Reference.
