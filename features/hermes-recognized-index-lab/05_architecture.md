# Index lab architecture

Operator CLI (synthetic sentinel + confined lab root) → core read/status по immutable opid → deterministic `buildRecords` (kind=machine-unverified, source anchor, original artifact bytes/path) → explicit apply through existing JS `write.ingest` → strict read-only SQLite v2 snapshot + integrity/schema/size gates + exact pattern multiset comparison → optional real `third-brain search` known-source hit. No gateway, service or journal.

`plan_id`/SHA derives from immutable core receipt, case/date, ordered expected pattern hashes; changing case or artifact invalidates apply. `status` recomputes plan and reads brain, does not infer success from write counters. `reconcile` names missing patterns and blocks extras/variants. Retry is another explicit apply only after exact-subset classification. Synthetic brain and operator single-writer convention limit races; existing ingest lock covers its bridge, not all legacy writers. Search response repeats core provenance validation before marking hit `НЕПРОВЕРЕНО`.

Current Hermes `HealthTools.read` rejects dot path components. This lab calls core/read and third-brain directly; it does not modify generic HealthTools path policy. A later product adapter needs its own exact namespace gate and core status check.
