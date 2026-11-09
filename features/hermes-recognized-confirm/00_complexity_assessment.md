Task kind: feature. Tier: L: gateway trust boundary, durable proposal и вызов отдельного core процесса. Объём ограничен одним PDF draft и одним immutable core operation; индекс вне стадии.

| Acid | Сценарий |
| --- | --- |
| A1 | Изменение draft/source между prepare и confirm не приводит к записи. |
| A2 | Недоверенный model tool или cron не может вызвать confirm. |
| A3 | Crash/timeout core после durable intent не создаёт ложный отказ или двойную операцию. |
| A4 | Сохранённый текст остаётся unverified и не появляется в ответах/логах без запроса read. |
| A5 | Неподдерживаемый runtime или неработающий gateway transport блокирует confirm. |
