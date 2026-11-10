# Локальное исследование контрактов

Исследованы только файлы этого checkout, без внешнего поиска: `features/hermes-night-acceptance/03_adr/003-plan-recognized-recovery.md`, `recognized-recovery-challenge.md` (B1–B5), `features/hermes-recognized-recovery/03_adr/001-offline-verifier.md`, `future/002-proposed-offline-writer.md`, `integrations/hermes-health/experiments/recognized-recovery/recovery_verifier.py`, `integration_actual.py`, `integrations/hermes-health/recognized_confirm.py` и upstream `packages/@dzhechkov/health-advisor/lib/recognized-store.js` в checkout recognized.

| Факт | Следствие для лаборатории |
| --- | --- |
| Core tuple содержит operation ID, workspace realpath/dev/ino, source anchor и hash текста; `read` проверяет текущую identity/source. | Старые bytes нельзя просто скопировать как рабочую операцию. Новый core save создаёт новый tuple/ID; old bytes остаются свидетельством. |
| Core `save` пишет staging files с fsync, затем rename и fsync parent; после rename до parent fsync возможен `present` без подтверждённой долговечности. | После crash `present` принимается лишь после нового проверенного durability barrier. Исторический commit не заявляется. |
| Adapter receipt HMAC покрывает payload, но не означает человеческое согласие; `runtime_identity` хеширует installed `node_modules` closure и Node binary, проверяет capabilities. | Writer повторяет pinned closure check и не выпускает новый gateway receipt. |
| Read-only verifier возвращает только sanitized `valid/executable:false`, `snapshot_digest` и counts; его public `verify` не отдаёт validated bytes/FD. | Writer не превращает отчёт в executable plan. Его внутренний reader повторно проверяет входы/ограничения и держит или перечитывает проверенные bytes перед save; без согласованного offline fixture — отказ. |
| Actual integration уже создаёт synthetic PDF, adapter receipt и snapshot в pinned Docker image. | Новая integration расширяет только эту цепочку на свежий source-only target и actual installed core CLI, без сети. |

Открытый риск: прежний proposed writer сформулировал `attempting+present→observed` через readback; это недостаточно при crash между core rename и parent fsync. В этой feature обязателен новый fsync barrier либо `held`. Никакой local тест не докажет синхронность production stores или power-loss гарантию оборудования.
