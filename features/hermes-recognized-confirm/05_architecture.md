# Native adapter architecture

`health_pdf_draft(entry_id)` → private MD/HTML + `draft-provenance-1` sidecar, sidecar last completion marker. `health_recognized_prepare(draft_id,entry_id,expected_draft_sha256)` → отдельный HMAC proposal store вне карты → gateway `health-recognized-confirm <proposal_id>` → bounded stdin core standalone recognized CLI → core status/read summary → durable `saved_unverified` receipt. `cancel/status` также gateway-only. Нет index operation.

Trust boundaries: PDF текст и model args недоверен; sidecar строится из plugin verified source/draft bytes; gateway ContextVars нельзя заменить args/env; core выполняет административное save без user-auth функции; adapter проверяет consent и binding. Private dirfd/no-follow, modes 0700/0600, quotas, HMAC and fsync/rename защищают proposal и draft от обычной path tampering. Same-UID shell adversary вне boundary как и у intake. Error response не содержит draft text, tokens, исходный JSON или stderr.

Core CLI contract проверяется по установленной версии, не по файлу в checkout. Bounded input runner необходим из-за stdin DEVNULL в текущем `bounded_run`. Перед core вызовом durable `committing`; после неопределённого исхода только status/reconcile по тому же operation ID. `HealthTools.read` не получает общего доступа к `.machine-unverified`; этот slice не даёт search/read UI.
