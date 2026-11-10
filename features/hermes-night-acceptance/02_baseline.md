# Зафиксированное исходное состояние

2026-11-09, проверено gh/git/systemd, без предположения по прошлому чату:

- Рабочая база публичного кандидата:5141b6b, branch feat/hermes-health-pdf-draft, pushed.
- Ночная ветка:feat/hermes-health-night-acceptance, отдельная от PR35.
- PR31 intake-confirm MERGED 2026-11-09T21:51:22Z, merge496e8bff.
- PR33 pdf-text-probe OPEN draft, base intake-confirm.
- PR35 pdf-draft OPEN draft, base pdf-text-probe.
- Core PR125 intake-write-contract OPEN, base main.
- В core worktree есть локальные .dz metadata; не включать их в коммиты и не сбрасывать.
- Медицинский backup timer и PDF broker active.
- Свободно около110GiB на момент проверки (df -h); snapshot health около2.11GiB.
- Restore check для S3 snapshot c48c1a01 и отдельного каталога успешно завершился.
- Документ backup-restore.md содержит актуальную вводную и устаревшие исторические
  sections (timer disabled, preliminary), требует однозначной новой инструкции.

Точная версия изображения и runtime будут повторно сверены перед clean-install.
Это baseline, не окончательный результат восстановления.
