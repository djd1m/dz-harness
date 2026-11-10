# Synthetic recognized export verifier

Read-only validation of a bounded **offline synthetic export**. It reads an export directory, a trusted descriptor file, and the original 32-byte HMAC key file. Descriptor and key must be separate private files outside the export. The command does not invoke Hermes/core, write files, create new operation IDs, produce a target mapping, or authorize recovery.

```bash
python3 recovery_verifier.py /private/snapshot /private/external/descriptor.json /private/external/key.bin
python3 -m unittest discover -s . -p 'test_recovery_verifier.py' -v
```

The report has only `schema`, `valid`, `executable:false`, `snapshot_digest`, `operation_count`, `file_count`, and fixed `refusal_codes`. Exit 0 means this export matched the supplied descriptor/key and semantic bindings. Exit 2 is refusal. No report contains owner, path, source text, artifact text, MAC, or key.

Export profile: `inventory.json`; `workspace/sources/manifest.json` and its selected `workspace/sources/raw/**` files; `workspace/recognized/.machine-unverified/operations/<id>/{artifact.md,metadata.json}`; `recognized-state/<id>.recognized.json`. Every directory, including empty directories, is listed in the inventory. `inventory.json` itself is covered by the external descriptor's SHA-256 instead of self-listing. `.recognized.key`, `.recognized.lock`, pending/staging files, drafts and LOG are excluded. An exporter must not delete these from live stores merely to satisfy this profile. The synthetic fixture helper `fixtures.make(base)` constructs a valid example; `fixtures.seal(snapshot, descriptor, key)` reissues the inventory and descriptor after intentional test mutations, and `fixtures.resign(receipt_path, key)` re-HMACs a test receipt.

The verifier accepts only completed `saved_unverified` receipts with `artifact_observed=true` and exact external expected owner/runtime. Core metadata is checked against actual `JSON.stringify(meta)+'\n'` bytes and the 14-element tuple hash; adapter MAC uses Python sorted-key compact UTF-8 encoding. Tuple workspace `dev/ino` are canonical decimal **strings**; sidecar values are integers. Source logical `manifest.path` is distinct from physical `manifest.stored_at`.

Limits: 1–32 operations, 128 listed files, 256 directories, 12 path components, 1024 UTF-8 bytes per relative path; inventory/descriptor 64 KiB, receipt/manifest 1 MiB, metadata 16 KiB, raw 32 MiB, artifact 2 MiB, listed bytes 128 MiB, JSON depth 32. Files must be regular, owned by effective UID, `0600`, single-link; export directories `0700`. External descriptor/key parents are private `0700`. Trusted system/effective-UID nonwritable ancestors and root-owned sticky `/tmp` are allowed. Same-UID hostile mutation and a coordinated freeze of actual stores are outside this verifier's claim.

The hand-authored unit fixture tests the format and refusal paths. The separate `integration_actual.py` exercise, run by the parent workflow in its pinned offline candidate image, exports actual synthetic adapter/core bytes and is the evidence for compatibility with those installed implementations. A unit-fixture pass alone is not that evidence.
