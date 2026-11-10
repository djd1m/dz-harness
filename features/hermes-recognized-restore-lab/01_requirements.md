# Требования к синтетическому restore lab

## Функциональные

- FR-1: Каждый `plan`/`apply`/`reconcile` заново проверяет export, внешний trusted descriptor и отдельный исходный key через правила read-only verifier ADR-001. Отчёт verifier не является разрешением записи. Только `saved_unverified` с `artifact_observed=true`; иной state/ambiguity отказывает batch до записи.
- FR-2: `plan` выдаёт bounded summary и immutable plan digest, без текста, owner, путей, key/MAC; `apply` требует явного совпадения оператором введённого digest. Это новое локальное действие для синтетики, не доказательство исторического human approval или личности оператора.
- FR-3: Target — свежий private workspace на ином `realpath/dev/ino`, до первого apply только с source manifest/raw, byte-identical export, без recognized/receipts/index. Target source durable до intent. Единственный target-anchored `.restore-lab` создаётся после source-only preflight и служит закрытым исключением профиля; user-selected control path запрещён. Root/ancestors, non-overlap, aliases, ownership/modes и lock проверяются; любые чужие объекты блокируют запись.
- FR-4: Все новые `rc-<32 hex>` ID детерминированы из batch/snapshot/inventory/target identity/old ID, взаимно однозначны и отличны от старых; полный mapping в одном durable atomic intent до первого core save. Collision или существующий ID — отказ, без reseed.
- FR-5: Для каждого item durable `planned→attempting` до вызова **установленного pinned Node core CLI**; core получает исходный UTF-8 text, source entry/hash/bytes и engine под новым ID. Старые metadata/artifacts/receipts не меняются и не replay. Новый core output остаётся unverified, вне индекса.
- FR-6: `attempting→observed` только после exact readback и durability barrier файлов операции, каталога операции, parents и target source; ошибочный/неподтверждённый fsync оставляет `held/unknown`. Reconcile — отдельное явное действие с digest плана; `attempting+absent/staging/corrupt/unknown` не вызывает retry.
- FR-7: Seal в том же atomic envelope после повторного readback всех items и durable barriers, привязан к inventory/mapping/target identity/exact digests. Partial/unknown/unsealed никогда не считается готовым batch; seal не запускает activation.
- FR-8: Ограниченный offline CLI, bounded subprocess/output/timeout и sanitized результаты. Нет сети, production данных/секретов, gateway, поиска, индекса или автоматического удаления при rollback.

## Нефункциональные и приёмка

- NFR-1: Один local filesystem с подтверждаемыми `fsync(file)`, `rename` и `fsync(directory)`; hostile same-UID, network FS и физический power loss вне доказанной модели. Отказ при недоступной предпосылке.
- NFR-2: Закреплённая closure runtime (Node binary, JS/JSON/native package tree и capabilities) должна совпасть с `expected_runtime` trusted descriptor; один совпавший CLI file недостаточен.
- AC-1 (A1,A2,A3): реальные синтетические adapter→core→export данные дают новый core `status/read` на новом inode, exact text/source и неизменный old export; все нарушения trust/identity отказывают до save.
- AC-2 (A4,A5,A6): fault matrix intent/attempting/core staging/rename/readback/observed/seal, два процесса и tamper доказывают fail-stop и отсутствие второго save/ID; исходы учитывают `held`, а не объявляют commit по present bytes.
- AC-3: Actual integration работает только в pinned offline image, при отсутствии image/runtime — явный отказ, не skipped success; результат показывает отсутствие receipt replay/index/activation.

Реальный freeze всех writers, происхождение backup, cryptographic operator authority и production DRP остаются за пределами этой лаборатории.
