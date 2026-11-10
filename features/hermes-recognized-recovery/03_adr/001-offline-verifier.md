# ADR-001: ограниченный offline verifier recognized export

Статус: proposed; implementation ждёт K2/design review. Это только synthetic read-only эксперимент. Production DRP blocker остаётся.

## Контекст и B1: доверие

Core tuple содержит исходные `realpath/dev/ino`; копия на новом inode не проходит обычный core `read/status`. Verifier принимает три раздельных входа: offline export root, trusted descriptor как private файл вне export и исходный 32-byte HMAC key как другой private файл вне export. Descriptor с закрытой схемой `hermes-recognized-recovery-descriptor-1` содержит ровно `schema`, `snapshot_id` (32 lowercase hex), `inventory_sha256`, `key_sha256` (оба 64 lowercase hex), `expected_owner` (точные `platform/user_id/chat_id/profile`) и `expected_runtime` (64 lowercase hex). Descriptor/key доставлены оператором независимо от export; verifier не доказывает их автора, время создания, полноту backup, личность или волю пациента. Подмена всех трёх входов вместе вне модели доверия. Отсутствующий key даёт отдельный отказ без fallback; неверный key и изменённый MAC дают общий integrity refusal.

`inventory.json` имеет закрытую схему `hermes-recognized-recovery-inventory-1`, тот же `snapshot_id` и полный список entries. File entry содержит ровно `path/bytes/sha256/mode`, directory entry — `path/mode`, тип указан явно. Сам `inventory.json` не перечисляется во избежание самоссылки; SHA-256 его точных bytes сравнивается с trusted descriptor. Entries отсортированы по UTF-8 bytes path, без дублей и aliases. Фактическое дерево и inventory сверяются в обе стороны, включая size, digest и mode.

## B2–B3: export profile, состояния, freeze

Export profile включает только `workspace/sources/manifest.json`, соответствующие `workspace/sources/raw/**`, `workspace/recognized/.machine-unverified/operations/<id>/{artifact.md,metadata.json}` и `recognized-state/<id>.recognized.json`. Manifest/raw охватывают только нужные rows и bytes; каждому core operation соответствует ровно одна receipt и наоборот. Это не whole-store snapshot. `.recognized.key`, `.recognized.lock`, `.recognized-pending-*`, `.staging-*`, prepared/transient receipts, `sources/LOG.jsonl`, draft tree и прочие штатные объекты исключены явно; их присутствие в export — extra object/refusal. Их не удаляют из live stores ради проверки. Fixtures создаются offline без writers; единый freeze core/adapter/key stores не доказан.

Допустима только `state=saved_unverified` при `artifact_observed=true`; другие state/flag, orphan и ambiguity отказывают всему batch. `proposal_id=operation_id` и имя receipt связываются с core ID. `owner` и `runtime` каждой receipt точно равны внешним `expected_owner/expected_runtime`; receipt workspace совпадает с sidecar и исходным core tuple. Старый TTL не продлевается и не превращается в согласие на save. HMAC считается по исходному adapter `encode(payload)` = Python `json.dumps(..., ensure_ascii=False, sort_keys=True, separators=(',', ':'))`, не по raw envelope bytes.

Core `metadata.json` проверяется по фактическому encoding `JSON.stringify(meta)+'\n'`, а `request_sha256` — SHA-256 от `JSON.stringify(request_tuple)` из 14 элементов. Нужны exact schema/labels, source/artifact bytes и hash, engine, sidecar draft и workspace. `request_tuple[7]` и `sidecar.source.logical_path` равны manifest `row.path` (логический путь); `sidecar.source.path` равен `row.stored_at` (адрес raw). Их нельзя смешивать. Inventory hash не заменяет эти проверки.

## B4: безопасное чтение и границы

Reader открывает private trusted ancestors и каждый компонент через `dir_fd` + `O_DIRECTORY|O_NOFOLLOW`, файлы через `dir_fd` + `O_NOFOLLOW|O_NONBLOCK`, затем `fstat`. Export, descriptor и key не вложены друг в друга и не alias по `dev/ino`; сами private файлы вне export. Directory принадлежит effective UID и имеет `0700`; regular file принадлежит тому же UID, `0600`, `nlink=1`. Symlink, hardlink, special file, unsafe ancestor, alias и несоответствие `lstat/fstat` отказываются. Same-UID hostile actor вне модели; reader не доказывает глобальный freeze.

Пределы: до 128 файлов и 256 directories (включая root), глубина до 12 компонентов, relative path до 1024 UTF-8 bytes, компонент до 255 bytes; inventory/descriptor до 64 KiB, receipt до 1 MiB, metadata до 16 KiB, manifest до 1 MiB, raw до 32 MiB каждый, artifact до 2 MiB каждый, total listed file bytes до 128 MiB, operations 1–32.

## Выход и последствия

Только bounded sanitized JSON: `schema`, `valid`, `executable:false`, `snapshot_digest` (inventory digest), `operation_count`, `file_count`, `refusal_codes` из фиксированного allowlist. Ошибка использует тот же формат с пустыми/нулевыми полями при невозможности проверки. Нет target, mapping, новых IDs, путей, owner, содержимого, MAC/key или команды применения. Успех говорит лишь о согласованности synthetic export с переданными descriptor/key. Writer, target ownership, mapping и durable seal (B5) требуют отдельного проекта и QE. In-place metadata rewrite отклонён: он уничтожил бы исходное свидетельство.

## Confirmation

`integrations/hermes-health/experiments/recognized-recovery/test_recovery_verifier.py`: real-format positive copy, external trust mutation, semantic binding, no writes, no sensitive output.
