"""Synthetic bytes and export sealing helpers; never touches production stores."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from pathlib import Path

KEY = bytes(range(32))
OWNER = {"platform": "synthetic", "user_id": "test", "chat_id": "test", "profile": "offline"}
RUNTIME = "a" * 64
SNAPSHOT = "b" * 32
OP = "rc-" + "c" * 32
DRAFT = "pdf-" + "d" * 32


def encode(value, sorted_keys=False):
    return json.dumps(value, ensure_ascii=False, sort_keys=sorted_keys, separators=(",", ":")).encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def put(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    for parent in [path.parent, *path.parent.parents]:
        if parent.name in ("snapshot", "external") or "snapshot" in parent.parts or "external" in parent.parts:
            os.chmod(parent, 0o700)
    path.write_bytes(data)
    os.chmod(path, 0o600)


def make(base: Path):
    base.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(base, 0o700)
    snap = base / "snapshot"
    ext = base / "external"
    snap.mkdir(mode=0o700)
    ext.mkdir(mode=0o700)
    raw = b"synthetic primary source\n"
    text = "Синтетический черновик\n".encode()
    logical = "report.txt"
    entry = sha(encode([logical, sha(raw)]))[:32]
    stored = "sources/raw/sha256-" + "e" * 64 + "/report.txt"
    row = {"entry_id": entry, "path": logical, "stored_at": stored, "sha256": sha(raw), "bytes": len(raw), "media_type": "text/plain", "ingested_at": "2026-01-01T00:00:00.000Z", "archive_id": "sha256:" + "e" * 64, "source": {"kind": "local-file", "url_redacted": None, "url_sha256": None, "local_path": "report.txt", "digest_source": "local-stream"}}
    put(snap / "workspace/sources/manifest.json", encode({"schema": "ha-intake-manifest-1", "entries": [row]}))
    put(snap / "workspace" / stored, raw)
    workspace = {"path": "/old/synthetic/workspace", "dev": 11, "ino": 22}
    tuple_ = ["ha-recognized-save-1", OP, workspace["path"], str(workspace["dev"]), str(workspace["ino"]), "ha-source-anchor-1", entry, logical, sha(raw), len(raw), sha(text), len(text), "pypdf", "7.0.0"]
    meta = {"schema": "ha-recognized-operation-1", "request_tuple": tuple_, "request_sha256": sha(encode(tuple_)), "created_at": "2026-01-01T00:00:00.000Z", "verification_status": "unverified", "content_trust": "untrusted_document"}
    opdir = snap / "workspace/recognized/.machine-unverified/operations" / OP
    put(opdir / "metadata.json", encode(meta) + b"\n")
    put(opdir / "artifact.md", text)
    side = {"schema": "draft-provenance-1", "draft_id": DRAFT, "workspace": workspace, "source": {"entry_id": entry, "path": stored, "logical_path": logical, "sha256": sha(raw), "bytes": len(raw)}, "draft": {"sha256": sha(text), "bytes": len(text)}, "engine": {"name": "pypdf", "version": "7.0.0"}, "parser_status": "ok"}
    payload = {"schema": "hermes-health-recognized-confirm-1", "proposal_id": OP, "operation_id": OP, "owner": OWNER, "workspace": workspace, "runtime": RUNTIME, "sidecar": side, "created": 1, "expires": 1801, "state": "saved_unverified", "artifact_observed": True}
    receipt = {"payload": payload, "mac": hmac.new(KEY, encode(payload, True), hashlib.sha256).hexdigest()}
    put(snap / "recognized-state" / (OP + ".recognized.json"), encode(receipt))
    key = ext / "key.bin"
    descriptor = ext / "descriptor.json"
    put(key, KEY)
    seal(snap, descriptor, key)
    return snap, descriptor, key


def seal(snapshot: Path, descriptor: Path, key: Path, *, snapshot_id=SNAPSHOT):
    """Reissue inventory/descriptor after intentional fixture mutations."""
    entries = []
    for root, dirs, files in os.walk(snapshot):
        for name in dirs:
            path = (Path(root) / name).relative_to(snapshot).as_posix()
            entries.append({"type": "dir", "path": path, "mode": 0o700})
        for name in files:
            if Path(root) == snapshot and name == "inventory.json":
                continue
            path = (Path(root) / name).relative_to(snapshot).as_posix()
            raw = (Path(root) / name).read_bytes()
            entries.append({"type": "file", "path": path, "bytes": len(raw), "sha256": sha(raw), "mode": 0o600})
    entries.sort(key=lambda e: e["path"].encode())
    inventory = {"schema": "hermes-recognized-recovery-inventory-1", "snapshot_id": snapshot_id, "entries": entries}
    inv_raw = encode(inventory)
    put(snapshot / "inventory.json", inv_raw)
    desc = {"schema": "hermes-recognized-recovery-descriptor-1", "snapshot_id": snapshot_id, "inventory_sha256": sha(inv_raw), "key_sha256": sha(key.read_bytes()), "expected_owner": OWNER, "expected_runtime": RUNTIME}
    put(descriptor, encode(desc))


def resign(receipt_path: Path, key=KEY):
    envelope = json.loads(receipt_path.read_bytes())
    envelope["mac"] = hmac.new(key, encode(envelope["payload"], True), hashlib.sha256).hexdigest()
    put(receipt_path, encode(envelope))
