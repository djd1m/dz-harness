# Проверка синтетического recognized export

Это read-only verifier ограниченного offline export. Он принимает каталог snapshot, внешний доверенный descriptor и отдельный файл исходного 32-byte HMAC key. Descriptor и key находятся вне snapshot. Verifier не вызывает Hermes/core, не пишет файлы, не создаёт новые operation IDs, target mapping или разрешение на восстановление.

```bash
python3 recovery_verifier.py /private/snapshot /private/external/descriptor.json /private/external/key.bin
python3 -B -m unittest discover -s . -p test_recovery_verifier.py -v
```

Отчёт содержит только `schema`, `valid`, `executable:false`, `snapshot_digest`, `operation_count`, `file_count` и фиксированные `refusal_codes`. Exit 0 означает согласованность данного export с предъявленными descriptor/key и проверенными связями. Exit 2 означает отказ. Отчёт не содержит owner, пути, текст source/artifact, MAC или key.

Export profile: `inventory.json`; `workspace/sources/manifest.json` и выбранные `workspace/sources/raw/**`; `workspace/recognized/.machine-unverified/operations/<id>/{artifact.md,metadata.json}`; `recognized-state/<id>.recognized.json`. Inventory перечисляет все директории, включая пустые. Сам `inventory.json` связан SHA-256 во внешнем descriptor. `.recognized.key`, `.recognized.lock`, pending/staging, drafts и LOG исключены явно. Нельзя удалять эти объекты из live stores ради прохождения проверки. `fixtures.make(base)` создаёт synthetic пример; `fixtures.seal(snapshot, descriptor, key)` переиздаёт inventory и descriptor после намеренной тестовой мутации, `fixtures.resign(receipt_path, key)` переиздаёт тестовый HMAC.

Принимаются только завершённые `saved_unverified` receipts с `artifact_observed=true` и точным external expected owner/runtime. Core metadata проверяется по actual `JSON.stringify(meta)+'\n'` и SHA-256 от 14-element tuple; adapter MAC — по Python sorted-key compact UTF-8 encoding. В core tuple `dev/ino` являются canonical decimal **строками**, в sidecar — целыми числами. Логический `manifest.path` отличается от физического `manifest.stored_at`.

Лимиты: 1–32 operations, 128 перечисленных файлов, 256 директорий, 12 компонентов пути, 1024 UTF-8 bytes на относительный путь; inventory/descriptor 64 KiB, receipt/manifest 1 MiB, metadata 16 KiB, raw 32 MiB, artifact 2 MiB, перечисленные bytes 128 MiB, глубина JSON 32. Файлы — regular, effective-UID owned, `0600`, single-link; директории export — `0700`. Parents descriptor/key — private `0700`. Допустимы доверенные system/effective-UID ancestors без group/world write и root-owned sticky `/tmp`. Hostile same-UID mutation и coordinated freeze реальных stores вне модели доказательства.

Unit fixture проверяет форматы и отказы, но сам по себе не доказывает совместимость с установленными adapter/core. Отдельный `integration_actual.py` в закреплённом offline candidate image экспортирует фактические synthetic bytes adapter/core и проверяет их. Успех verifier не означает историческую полноту backup, согласие человека, медицинскую достоверность, право записи или activation.
