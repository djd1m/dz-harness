# Доменная модель synthetic adapter

DraftSnapshot — приватный immutable снимок rendered MD, связанный sidecar с source row и workspace inode. Parser status относится к полноте извлечения, не к медицинской проверке.

Proposal — отдельный HMAC aggregate: proposal_id, operation_id, owner(platform/user/chat/profile), workspace, runtime pin, source/draft binding, created/expires, state. Prepare создаёт proposal без записи карты. Consent предоставляется gateway command boundary, а не моделью или административным core.

RecognizedArtifact — core immutable результат operation_id; статус только unverified. Adapter receipt содержит authority человека; core request её не принимает. Artifact integrity и receipt durability — разные свойства. Reconciliation не повторяет save и не переименовывает operation_id.

Состояния и переходы определены таблицей в плане. Aggregate lock сериализует confirm/cancel/status. TTL применяется лишь к prepared. После intent удаление draft не уничтожает способность наблюдать core artifact. Source drift может сосуществовать с persisted artifact.

ProductionTransportAcceptance — внешний неустановленный gate. Синтетический dispatch доказывает routing только внутри теста. В этом slice production enable запрещён.
