# ADR-001: gateway confirmation перед core unverified save

Статус: решение для отдельного test adapter slice, 2026-11-09. Core `health-recognized-unverified` имеет собственный ADR и gate; настоящая интеграция зависит от принятого standalone CLI. Plain Codex и независимое QE другой моделью.

## Context

`pdf_draft.py` сейчас сохраняет `draft.md`/`draft.html` вне карты после сверки исходного PDF, но не выдаёт машинно проверяемую immutable связь draft с источником. `intake_confirm.py` демонстрирует task-local gateway identity, HMAC receipt и журнал, но его schema/receipt относится к оригиналам. `HealthTools.read` запрещает dot components, поэтому новый core path `recognized/.machine-unverified/...` недоступен текущим `source_get` и `search`. Core save административен и сам не доказывает согласие человека.

## Alternatives

| Вариант | Решение |
| --- | --- |
| A. Модель вызывает core save прямо после PDF parse | Отклонён: обход явного подтверждения пользователя и риск prompt injection из документа. |
| B. Sidecar + model prepare + отдельная gateway confirm + core CLI | Выбран для синтетического теста: доверенный transport авторизует запись, core хранит exact unverified bytes. |
| C. Использовать intake receipt/store без отдельного schema | Отклонён: смешивает оригиналы и machine text, усложняет idempotency и может менять существующий intake. |

## Decision

`health_pdf_draft` пишет `draft-provenance-1` sidecar **последним** в приватный draft directory после fsync MD/HTML. В sidecar фиксируются workspace realpath/dev/ino, source entry_id/SHA/bytes и manifest row identity, exact UTF-8 `draft.md` SHA/bytes, engine name/version, parser status `ok|partial_text`, schema и private draft ID. HTML — только preview, не payload. Sidecar создаётся из проверенных значений plugin, не из header draft или model args. Sidecar mode 0600, directory 0700; eligibility требует sidecar и повторной проверки всех bytes. Crash до sidecar делает draft ineligible; старые draft без sidecar требуют нового parse. Возврат `artifacts` продолжает содержать только MD/HTML, чтобы случайная отправка не раскрыла внутренний sidecar.

Model-facing `health_recognized_prepare` принимает только `(draft_id, entry_id, expected_draft_sha256)`. Path/текст/engine/status и destination не берутся из model args. Он проверяет private root через dirfd/no-follow, sidecar, exact draft bytes, текущий source manifest/raw, owner из доверенных task-local ContextVars и установленный runtime/capability. В отдельном private state root создаётся случайный opaque `proposal_id`, HMAC receipt с version, owner, workspace/runtime identity, source/draft binding, operation_id и TTL. `operation_id` заранее выбирается по grammar core и затем не меняется. Ответ `prepared_not_saved` даёт SHA, размер, source entry_id, срок и явное `НЕПРОВЕРЕНО`; текста нет. Prepare не меняет карту.

`health-recognized-confirm <proposal_id>` регистрируется как **gateway command**, не как tool. Требуются тот же platform/user/chat/profile (Mattermost), не cron, не истёкший и не cancelled receipt. Команда должна прийти через проверенный transport: слова «да» в model chat, env или prompt внутри PDF не авторизуют. Перед commit заново проверяются runtime/capability, workspace, sidecar/draft SHA/bytes и source manifest/raw. Если drift — `prepare_again`, без core вызова. Confirm сохраняет durable `committing` intent, затем передаёт exact draft bytes standalone core CLI через bounded stdin/pipe (без текста в argv, stderr/logs; очищенное env, timeout/output cap). Existing `bounded_run` использует stdin DEVNULL: нужен узкий bounded-input runner, а не передача текста через аргументы или env.

CLI response не является единственным доказательством. По тому же operation_id вызывается core status/read summary и сравнивается полный source/text/engine/workspace binding. Только доказанный immutable artifact даёт receipt `saved_unverified`, `index_status:not_requested`; core `read` с text для публичного ответа не вызывается. При timeout, crash или невозможности durable сохранить final receipt — `reconciliation_required`, не blind повтор. Reconcile читает core status по прежнему ID и проверяет binding; если core не доказывает существование, ответ остаётся uncertain/operator action. Saved artifact при позднем source drift не называется absent. Replay confirm с тем же receipt возвращает сохранённый результат лишь после повторной core проверки.

State root и HMAC key **отдельны** от `HEALTH_INTAKE_STATE` и `hermes-health-intake-1`; schema `hermes-health-recognized-confirm-1`. Reuse `gateway_identity`, `workspace_identity`, private path/atomic write/lock patterns допустим, но не переиспользовать intake receipt IDs и не менять его значения состояний. Отдельный feature flag write-enabled; без него confirm отказывает. Gateway transport acceptance и core CLI version/capability gate обязательны в тестовой среде. Наличие зарегистрированной команды не доказывает доставку.

## Consequences and limits

Core files в `.machine-unverified` нельзя читать существующим `HealthTools.read` из-за dot component; blanket allow для dot paths запрещён. В этом slice нет `health_source_get`/`health_search` для recognized, нет autoindex и нет promise о видимости текста в поиске. Следующий read/index adapter должен использовать узкую проверку core provenance или точную namespace policy. Legacy writers не используют core lock; adapter не заявляет глобальную транзакцию карты. Подтверждение означает только согласие **сохранить bytes как непроверенные**, не clinical verification или OCR quality. Никакой production install из синтетического PASS.

## Confirmation

`integrations/hermes-health/tests/test_pdf_draft.py` проверяет sidecar completion/binding и не меняет существующую выдачу MD/HTML. `integrations/hermes-health/tests/test_recognized_confirm.py` проверяет owner/cron/gateway, prepare без записи, drift, HMAC/permissions, crash/timeout/reconcile/replay, core CLI stdin/privacy и unverified labels. `integrations/hermes-health/tests/integration_recognized_confirm.py` запускает установленный тестовый core runtime на синтетической карте; skip/unavailable не считается PASS. Независимое QE другой моделью проверяет результаты.
