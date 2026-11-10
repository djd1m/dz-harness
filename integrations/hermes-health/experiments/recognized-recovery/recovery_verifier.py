"""Bounded read-only verifier for an offline synthetic recognized export."""
from __future__ import annotations

import argparse
import datetime
import hashlib
import hmac
import json
import os
import re
import stat
import sys

HEX = re.compile(r"[0-9a-f]{64}\Z")
SNAP = re.compile(r"[0-9a-f]{32}\Z")
OP = re.compile(r"rc-[0-9a-f]{32}\Z")
DRAFT = re.compile(r"pdf-[0-9a-f]{32}\Z")
COMP = re.compile(r"[A-Za-z0-9._-]+\Z")
STAMP = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\Z")
MAX_TOTAL = 128 * 1024 * 1024


class Refusal(Exception):
    def __init__(self, code):
        self.code = code


def need(ok, code):
    if not ok:
        raise Refusal(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def exact(obj, names, code="schema_invalid"):
    need(type(obj) is dict and set(obj) == set(names), code)


def enc(value, *, sorted_keys=False):
    return json.dumps(value, ensure_ascii=False, sort_keys=sorted_keys, separators=(",", ":")).encode("utf-8")


def strict_json(data, limit):
    need(len(data) <= limit, "limit_exceeded")

    def pairs(items):
        out = {}
        for key, value in items:
            need(key not in out, "json_invalid")
            out[key] = value
        return out

    def bad(_):
        raise Refusal("json_invalid")

    try:
        obj = json.loads(data.decode("utf-8"), object_pairs_hook=pairs, parse_constant=bad)
        def walk(x, depth=0):
            need(depth <= 32, "limit_exceeded")
            if type(x) is dict:
                for k, v in x.items():
                    walk(k, depth + 1)
                    walk(v, depth + 1)
            elif type(x) is list:
                for v in x:
                    walk(v, depth + 1)
            elif type(x) is str:
                need(not any(0xD800 <= ord(c) <= 0xDFFF or c in "\x00\u2028\u2029" for c in x), "json_invalid")
            elif type(x) is float:
                need(x == x and abs(x) != float("inf"), "json_invalid")
        walk(obj)
        return obj
    except (UnicodeError, ValueError, RecursionError):
        raise Refusal("json_invalid") from None


def safe_path(path):
    need(type(path) is str and 0 < len(path.encode("utf-8")) <= 1024, "path_invalid")
    parts = path.split("/")
    need(len(parts) <= 12 and all(0 < len(p.encode()) <= 255 and COMP.fullmatch(p) and p not in (".", "..") for p in parts), "path_invalid")
    return parts


def _dir_ok(s, private):
    mode = stat.S_IMODE(s.st_mode)
    need(stat.S_ISDIR(s.st_mode), "unsafe_path")
    if private:
        need(s.st_uid == os.geteuid() and mode == 0o700, "unsafe_path")
    else:
        trusted = (s.st_uid in (0, os.geteuid()) and mode & 0o022 == 0)
        sticky_tmp = s.st_uid == 0 and mode == 0o1777
        need(trusted or sticky_tmp, "unsafe_path")


def open_abs(path, *, directory=False, private_parent=False):
    need(type(path) is str and path.startswith("/"), "unsafe_path")
    parts = [p for p in path.split("/") if p]
    need(parts and all(p not in (".", "..") for p in parts), "unsafe_path")
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    chain = []
    try:
        _dir_ok(os.fstat(fd), False)
        for i, part in enumerate(parts):
            last = i == len(parts) - 1
            isdir = not last or directory
            flags = os.O_RDONLY | os.O_NOFOLLOW | (os.O_DIRECTORY if isdir else os.O_NONBLOCK)
            child = os.open(part, flags, dir_fd=fd)
            try:
                s = os.fstat(child)
                if isdir:
                    _dir_ok(s, (last and directory) or (private_parent and i == len(parts)-2))
                    chain.append((s.st_dev, s.st_ino))
                else:
                    need(stat.S_ISREG(s.st_mode) and s.st_uid == os.geteuid() and stat.S_IMODE(s.st_mode) == 0o600 and s.st_nlink == 1, "unsafe_path")
            except Exception:
                os.close(child)
                raise
            os.close(fd)
            fd = child
        return fd, chain
    except Exception:
        os.close(fd)
        raise


def read_fd(fd, limit):
    s = os.fstat(fd)
    need(stat.S_ISREG(s.st_mode) and s.st_uid == os.geteuid() and stat.S_IMODE(s.st_mode) == 0o600 and s.st_nlink == 1 and s.st_size <= limit, "unsafe_path")
    chunks = []
    total = 0
    while True:
        chunk = os.read(fd, min(65536, limit + 1 - total))
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
        need(total <= limit, "limit_exceeded")
    need(total == s.st_size, "unsafe_path")
    return b"".join(chunks)


def scan(root):
    files, dirs = {}, {"": (0o700, None)}
    total_bytes = 0
    def walk(fd, prefix, depth):
        nonlocal total_bytes
        need(depth <= 12, "limit_exceeded")
        with os.scandir(fd) as iterator:
          for entry in iterator:
            name = entry.name
            need(len(files) + len(dirs) <= 384, "limit_exceeded")
            path = prefix + name
            safe_path(path)
            s = os.stat(name, dir_fd=fd, follow_symlinks=False)
            if stat.S_ISDIR(s.st_mode):
                need(len(dirs) < 256, "limit_exceeded")
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                try:
                    current = os.fstat(child)
                    _dir_ok(current, True)
                    need((s.st_dev, s.st_ino) == (current.st_dev, current.st_ino), "unsafe_path")
                    dirs[path] = (stat.S_IMODE(current.st_mode), child)
                    walk(child, path + "/", depth + 1)
                finally:
                    os.close(child)
            else:
                need(len(files) < 129, "limit_exceeded")
                need(stat.S_ISREG(s.st_mode) and s.st_nlink == 1, "unsafe_path")
                f = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
                try:
                    cur = os.fstat(f)
                    need((s.st_dev, s.st_ino) == (cur.st_dev, cur.st_ino), "unsafe_path")
                    need(cur.st_uid == os.geteuid() and stat.S_IMODE(cur.st_mode) == 0o600, "unsafe_path")
                    if path == "inventory.json":
                        limit = 65536
                    elif path == "workspace/sources/manifest.json" or path.startswith("recognized-state/"):
                        limit = 1024 * 1024
                    elif path.endswith("/metadata.json"):
                        limit = 16384
                    elif path.endswith("/artifact.md"):
                        limit = 2 * 1024 * 1024
                    elif path.startswith("workspace/sources/raw/"):
                        limit = 32 * 1024 * 1024
                    else:
                        raise Refusal("inventory_membership")
                    need(cur.st_size <= limit and total_bytes + cur.st_size <= MAX_TOTAL + 65536, "limit_exceeded")
                    data = read_fd(f, limit)
                    total_bytes += len(data)
                    files[path] = (data, stat.S_IMODE(cur.st_mode))
                finally:
                    os.close(f)
    walk(root, "", 0)
    return files, dirs


def validate_inventory(files, dirs, descriptor):
    raw = files.get("inventory.json", (None,))[0]
    need(raw is not None, "inventory_invalid")
    need(sha(raw) == descriptor["inventory_sha256"], "inventory_integrity")
    inv = strict_json(raw, 65536)
    exact(inv, ["schema", "snapshot_id", "entries"], "inventory_invalid")
    need(inv["schema"] == "hermes-recognized-recovery-inventory-1" and inv["snapshot_id"] == descriptor["snapshot_id"] and type(inv["entries"]) is list, "inventory_invalid")
    expected_files, expected_dirs = set(), set()
    paths = []
    total = 0
    for item in inv["entries"]:
        need(type(item) is dict, "inventory_invalid")
        typ = item.get("type")
        exact(item, ["type", "path", "mode"] + (["bytes", "sha256"] if typ == "file" else []), "inventory_invalid")
        path = item["path"]
        safe_path(path)
        paths.append(path)
        need(type(item["mode"]) is int, "inventory_invalid")
        if typ == "file":
            need(type(item["bytes"]) is int and 0 <= item["bytes"] <= 32*1024*1024 and type(item["sha256"]) is str and HEX.fullmatch(item["sha256"]) and item["mode"] == 0o600, "inventory_invalid")
            expected_files.add(path)
            data, mode = files.get(path, (None, None))
            need(data is not None and len(data) == item["bytes"] and sha(data) == item["sha256"] and mode == item["mode"], "inventory_integrity")
            total += item["bytes"]
        else:
            need(typ == "dir" and item["mode"] == 0o700, "inventory_invalid")
            expected_dirs.add(path)
            need(path in dirs and dirs[path][0] == 0o700, "inventory_integrity")
    need(paths == sorted(set(paths), key=lambda x: x.encode("utf-8")), "inventory_invalid")
    need(total <= MAX_TOTAL and len(expected_files) <= 128 and len(expected_dirs) <= 255, "limit_exceeded")
    need(set(files) == expected_files | {"inventory.json"} and set(dirs) == expected_dirs | {""}, "inventory_membership")
    return inv


def descriptor_check(value):
    exact(value, ["schema", "snapshot_id", "inventory_sha256", "key_sha256", "expected_owner", "expected_runtime"])
    need(value["schema"] == "hermes-recognized-recovery-descriptor-1" and type(value["snapshot_id"]) is str and SNAP.fullmatch(value["snapshot_id"]), "schema_invalid")
    for name in ("inventory_sha256", "key_sha256", "expected_runtime"):
        need(type(value[name]) is str and HEX.fullmatch(value[name]), "schema_invalid")
    exact(value["expected_owner"], ["platform", "user_id", "chat_id", "profile"])
    need(all(type(v) is str and len(v) <= 512 for v in value["expected_owner"].values()), "schema_invalid")


def semantic(files, dirs, descriptor, key):
    manifest = strict_json(files["workspace/sources/manifest.json"][0], 1024*1024)
    exact(manifest, ["schema", "entries"], "source_invalid")
    need(manifest["schema"] == "ha-intake-manifest-1" and type(manifest["entries"]) is list, "source_invalid")
    rows = {}
    raw_paths = set()
    used_rows = set()
    logical_paths = set()
    for row in manifest["entries"]:
        exact(row, ["entry_id", "path", "stored_at", "sha256", "bytes", "media_type", "ingested_at", "archive_id", "source"], "source_invalid")
        need(type(row["entry_id"]) is str and SNAP.fullmatch(row["entry_id"]) and type(row["sha256"]) is str and HEX.fullmatch(row["sha256"]) and type(row["bytes"]) is int and 0 <= row["bytes"] <= 32*1024*1024, "source_invalid")
        need(type(row["path"]) is str and type(row["stored_at"]) is str and row["stored_at"].startswith("sources/raw/"), "source_invalid")
        exact(row["source"], ["kind", "url_redacted", "url_sha256", "local_path", "digest_source"], "source_invalid")
        safe_path(row["path"]); safe_path(row["stored_at"])
        derived = sha(enc([row["path"], row["sha256"]]))[:32]
        need(derived == row["entry_id"] and row["entry_id"] not in rows and row["stored_at"] not in raw_paths and row["path"] not in logical_paths, "source_invalid")
        raw_name = "workspace/" + row["stored_at"]
        need(raw_name in files and len(files[raw_name][0]) == row["bytes"] and sha(files[raw_name][0]) == row["sha256"], "source_invalid")
        rows[row["entry_id"]] = row
        raw_paths.add(row["stored_at"])
        logical_paths.add(row["path"])
    need({p[len("workspace/"):] for p in files if p.startswith("workspace/sources/raw/")} == raw_paths, "source_invalid")
    receipts = {p for p in files if p.startswith("recognized-state/")}
    metadata = {p for p in files if p.endswith("/metadata.json") and p.startswith("workspace/recognized/.machine-unverified/operations/")}
    need(1 <= len(metadata) <= 32 and len(receipts) == len(metadata), "state_invalid")
    for mp in metadata:
        ident = mp.split("/")[-2]
        need(OP.fullmatch(ident), "state_invalid")
        ap = mp[:-len("metadata.json")] + "artifact.md"
        rp = "recognized-state/" + ident + ".recognized.json"
        need(ap in files and rp in files, "state_invalid")
        meta_raw = files[mp][0]
        meta = strict_json(meta_raw, 16384)
        exact(meta, ["schema", "request_tuple", "request_sha256", "created_at", "verification_status", "content_trust"], "core_invalid")
        need(meta_raw == enc(meta) + b"\n" and list(meta) == ["schema", "request_tuple", "request_sha256", "created_at", "verification_status", "content_trust"], "core_invalid")
        t = meta["request_tuple"]
        need(meta["schema"] == "ha-recognized-operation-1" and meta["verification_status"] == "unverified" and meta["content_trust"] == "untrusted_document" and type(meta["created_at"]) is str and STAMP.fullmatch(meta["created_at"]), "core_invalid")
        try:
            datetime.datetime.strptime(meta["created_at"], "%Y-%m-%dT%H:%M:%S.%fZ")
        except ValueError:
            raise Refusal("core_invalid") from None
        need(type(t) is list and len(t) == 14 and t[0] == "ha-recognized-save-1" and t[1] == ident and t[5] == "ha-source-anchor-1" and type(t[2]) is str and t[2].startswith("/") and all(type(t[i]) is str and re.fullmatch(r"(?:0|[1-9][0-9]*)", t[i]) for i in (3,4)) and all(type(t[i]) is int and t[i] >= 0 for i in (9,11)), "core_invalid")
        need(type(t[6]) is str and SNAP.fullmatch(t[6]) and type(t[7]) is str and type(t[8]) is str and HEX.fullmatch(t[8]) and type(t[10]) is str and HEX.fullmatch(t[10]), "core_invalid")
        need(meta["request_sha256"] == sha(enc(t)), "core_invalid")
        art = files[ap][0]
        try:
            txt = art.decode("utf-8")
        except UnicodeError:
            raise Refusal("core_invalid") from None
        need(bool(art) and len(art) <= 2*1024*1024 and "\x00" not in txt and t[10] == sha(art) and t[11] == len(art) and t[12:14] == ["pypdf", "7.0.0"], "core_invalid")
        env = strict_json(files[rp][0], 1024*1024)
        exact(env, ["payload", "mac"], "receipt_invalid")
        payload = env["payload"]
        need(type(env["mac"]) is str and HEX.fullmatch(env["mac"]), "receipt_invalid")
        need(hmac.compare_digest(hmac.new(key, enc(payload, sorted_keys=True), hashlib.sha256).hexdigest(), env["mac"]), "receipt_integrity")
        exact(payload, ["schema", "proposal_id", "operation_id", "owner", "workspace", "runtime", "sidecar", "created", "expires", "state", "artifact_observed"], "receipt_invalid")
        need(payload["schema"] == "hermes-health-recognized-confirm-1" and payload["proposal_id"] == ident and payload["operation_id"] == ident and payload["state"] == "saved_unverified" and payload["artifact_observed"] is True, "state_invalid")
        need(payload["owner"] == descriptor["expected_owner"] and payload["runtime"] == descriptor["expected_runtime"], "receipt_binding")
        need(all(type(payload[k]) in (int, float) for k in ("created", "expires")), "receipt_invalid")
        side = payload["sidecar"]
        exact(side, ["schema", "draft_id", "workspace", "source", "draft", "engine", "parser_status"], "receipt_invalid")
        exact(side["workspace"], ["path", "dev", "ino"], "receipt_invalid")
        exact(side["source"], ["entry_id", "path", "logical_path", "sha256", "bytes"], "receipt_invalid")
        exact(side["draft"], ["sha256", "bytes"], "receipt_invalid")
        exact(side["engine"], ["name", "version"], "receipt_invalid")
        need(side["schema"] == "draft-provenance-1" and type(side["draft_id"]) is str and DRAFT.fullmatch(side["draft_id"]) and side["parser_status"] in ("ok", "partial_text") and side["engine"] == {"name": "pypdf", "version": "7.0.0"}, "receipt_invalid")
        need(type(side["workspace"]["dev"]) is int and type(side["workspace"]["ino"]) is int and 0 <= side["workspace"]["dev"] <= 9007199254740991 and 0 <= side["workspace"]["ino"] <= 9007199254740991, "receipt_invalid")
        need(payload["workspace"] == side["workspace"] and side["workspace"]["path"] == t[2] and str(side["workspace"]["dev"]) == t[3] and str(side["workspace"]["ino"]) == t[4], "receipt_binding")
        need(type(side["draft"]["bytes"]) is int and type(side["draft"]["sha256"]) is str and type(side["source"]["bytes"]) is int and type(side["source"]["sha256"]) is str, "receipt_invalid")
        need(side["draft"] == {"sha256": sha(art), "bytes": len(art)}, "receipt_binding")
        row = rows.get(t[6])
        need(row is not None and side["source"] == {"entry_id": row["entry_id"], "path": row["stored_at"], "logical_path": row["path"], "sha256": row["sha256"], "bytes": row["bytes"]} and t[7:10] == [row["path"], row["sha256"], row["bytes"]], "source_binding")
        used_rows.add(row["entry_id"])
    need({"recognized-state/" + p.split("/")[-2] + ".recognized.json" for p in metadata} == receipts, "state_invalid")
    allowed = {"inventory.json", "workspace/sources/manifest.json"} | {"workspace/" + p for p in raw_paths} | metadata | {p[:-len("metadata.json")] + "artifact.md" for p in metadata} | receipts
    need(set(files) == allowed, "inventory_membership")
    need(used_rows == set(rows), "source_invalid")
    allowed_dirs = {""}
    for path in allowed:
        parts = path.split("/")
        allowed_dirs.update("/".join(parts[:n]) for n in range(1, len(parts)))
    need(set(dirs) == allowed_dirs, "inventory_membership")
    return len(metadata)


def verify(snapshot, descriptor_path, key_path):
    root = desc_fd = key_fd = None
    try:
        root, root_chain = open_abs(snapshot, directory=True)
        desc_fd, desc_chain = open_abs(descriptor_path, private_parent=True)
        key_fd, key_chain = open_abs(key_path, private_parent=True)
        need((os.fstat(root).st_dev, os.fstat(root).st_ino) not in desc_chain + key_chain and (os.fstat(desc_fd).st_dev, os.fstat(desc_fd).st_ino) != (os.fstat(key_fd).st_dev, os.fstat(key_fd).st_ino), "unsafe_path")
        desc = strict_json(read_fd(desc_fd, 65536), 65536)
        descriptor_check(desc)
        key = read_fd(key_fd, 32)
        need(len(key) == 32, "key_invalid")
        need(sha(key) == desc["key_sha256"], "key_integrity")
        files, dirs = scan(root)
        validate_inventory(files, dirs, desc)
        count = semantic(files, dirs, desc, key)
        return {"schema": "hermes-recognized-recovery-report-1", "valid": True, "executable": False, "snapshot_digest": desc["inventory_sha256"], "operation_count": count, "file_count": len(files), "refusal_codes": []}
    except Refusal as exc:
        return {"schema": "hermes-recognized-recovery-report-1", "valid": False, "executable": False, "snapshot_digest": "", "operation_count": 0, "file_count": 0, "refusal_codes": [exc.code]}
    except (OSError, KeyError, TypeError, IndexError, OverflowError):
        return {"schema": "hermes-recognized-recovery-report-1", "valid": False, "executable": False, "snapshot_digest": "", "operation_count": 0, "file_count": 0, "refusal_codes": ["input_invalid"]}
    finally:
        for fd in (root, desc_fd, key_fd):
            if fd is not None:
                os.close(fd)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Offline synthetic recognized export validation")
    parser.add_argument("snapshot")
    parser.add_argument("descriptor")
    parser.add_argument("key")
    args = parser.parse_args(argv)
    report = verify(args.snapshot, args.descriptor, args.key)
    sys.stdout.write(json.dumps(report, separators=(",", ":")) + "\n")
    return 0 if report["valid"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
