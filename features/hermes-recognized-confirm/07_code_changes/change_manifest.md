# Изменения synthetic recognized adapter

## Реализовано

- `integrations/hermes-health/recognized_confirm.py`: отдельный private HMAC store, strict bounded JSON/UTF-8, physically disjoint roots, стабильный flock, prepare, command capability + ContextVars, TTL до intent, no-retry reconcile, bounded full-duplex subprocess, core capabilities и полный runtime code/Node pin, closed response binding.
- `integrations/hermes-health/pdf_draft.py`: private sidecar-last с source stored/logical path, exact rendered MD и workspace/engine/status; MD/HTML artifacts сохранены.
- `integrations/hermes-health/{health_plugin.py,__init__.py,plugin.yaml}`: только model-facing prepare; confirm/cancel/status — отдельные команды. Existing intake не редактировался, dot-path read deny сохранён.
- `integrations/hermes-health/{README.md,skills/health-read/SKILL.md}`: synthetic-only contract и ограничения.
- `integrations/hermes-health/tests/{test_pdf_draft.py,test_recognized_confirm.py,test_health_plugin.py,integration_recognized_confirm.py}`: отрицательные resource/state/identity/schema/privacy тесты и actual whole candidate CLI на синтетической карте.

## Gates до реализации

Прочитан feature-adr SKILL и modules 07/08. В plugin root и его /home/dz-user родителе AGENTS.md отсутствовал. Existing `.fa-state/base-ref` сохранён без изменения.

K1: actual `dz name-check --module recognized_confirm --project /home/dz-user/dz-harness-health-core --json` exit0/free. Python plugin workspace native scan exit2/not-established, так как native sweep ориентирован на TS packages. Дополнительный actual `rg` по plugin registry/modules не нашёл коллизий. Lead явно принял scope limitation; это НЕ утверждение полного native Python coverage. Новый user-facing dz command не добавляется.

K2 plan-completeness PASS до code. Current target admission exit0/admitted: `5a94c51e11f0e7ec6f2e064392e0a5077a2c278709507919f559fdf154fb4e57`. Literal coder-context helper exit0/complete, labelled requirements/ADR Decision+Confirmation/plan прочитан. Challenge C1–C7 внесён в amendments до code.

## Верификация и пределы

Tests-first RED зафиксирован для нового recognized module (import failure) и sidecar completion (missing file); затем GREEN. Storage/state negatives расширялись во время реализации. Полный Docker regression: 95 tests PASS, zero skips (35.382s); после последней узкой finite-float correction targeted recognized suite: 24 PASS. Independent QE ещё pending. Host runtime-less regression skips не считались PASS acceptance. Actual installed integration с пятью SIGKILL boundaries, включая replace-before-dir-fsync, прошёл на предыдущем снимке (27.426s); после finite-float correction повторён отдельно.

Actual CLI integration использует readonly core package overlay в pinned image sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961, no network, uid1000/gid1001, tmpfs synthetic map. Real intake создаёт manifest; actual recognized CLI выполняет save/status. Parser broker fake лишь поставляет synthetic extracted text; CLI/runtime/store не mock. Human command transport acceptance отсутствует: real ContextVars + direct registered handler не доказывают Mattermost delivery.

Production writes/install/publish/merge не выполнялись. Same-UID malicious shell вне модели. Повторный status после process crash не доказывает power-loss durability. Полный runtime pin требует стабильных installed bytes; module/symlink drift fail-closed. Автоиндексации нет. Independent QE/Step9 и native review history находятся у lead/reviewer; автор не объявляет собственное acceptance.

Model tool API плагина не имеет confirm. Это не запрет записи карты для всего Hermes при доступном shell/terminal: same-UID shell adversary вне границы этого slice. Никакой production hardening этим изменением не заявлен.
