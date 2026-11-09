# Требования adapter slice

- FR-1: `health_pdf_draft` создаёт immutable private sidecar `draft-provenance-1` вместе с MD/HTML; sidecar last completion marker связывает workspace identity, source entry_id/SHA/bytes, exact draft.md SHA/bytes и engine/status. Старые draft без sidecar не принимаются.
- FR-2: model-facing `health_recognized_prepare` принимает только `draft_id`, `entry_id`, `expected_draft_sha256`, создаёт private HMAC receipt с owner/workspace/runtime/source/draft binding и TTL; prepare не пишет карту.
- FR-3: confirm/cancel/status только отдельные gateway commands с task-local ContextVars platform/user/chat/profile, Mattermost, cron deny; не methods модели, не env/текст документа как доказательство consent.
- FR-4: confirm revalidates exact sidecar/draft/source/current manifest/runtime, пишет durable committing intent, вызывает установленный standalone core recognized CLI с bounded stdin, readback/reconcile по тому же opid, затем saved_unverified. Crash/timeout/error → named reconciliation_required, без blind retry.
- FR-5: private proposal store отдельный от intake schema/key/receipt namespace; dirfd no-follow, 0700/0600, HMAC, lock, quotas, fsync/atomic rename. Можно reuse проверенные directory/identity functions и storage idioms; intake behavior не менять.
- FR-6: все ответы `human_verification:not_established`, `index_status:not_requested`, `content_trust:untrusted_document`; нет automatic index, search claim, clinical verification или text в логах/summary.
- FR-7: capability/version gate для core standalone CLI в фактически установленном test runtime; synthetic actual-runtime end-to-end и gateway dispatch tests без production install/publish.
- FR-8: `HealthTools.read` по умолчанию запрещает dot components; этот slice не расширяет общий read/search. Получить recognized artifact через `health_source_get` или `health_search` здесь нельзя; отдельный future read/index adapter потребует точной namespace/provenance policy.
