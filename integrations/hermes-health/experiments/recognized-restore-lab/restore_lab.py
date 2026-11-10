"""Synthetic-only offline restore lab. No gateway, index, or production activation."""
from __future__ import annotations

import argparse
import contextlib
import copy
import ctypes
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import struct
import subprocess
import sys
import time


HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("recovery_verifier", HERE.parent / "recognized-recovery" / "recovery_verifier.py")
rv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rv)

HEX = re.compile(r"[0-9a-f]{64}\Z")
ID = re.compile(r"[0-9a-f]{32}\Z")
OP = re.compile(r"rc-[0-9a-f]{32}\Z")
SCHEMA = "hermes-restore-intent-1"
CAPABILITY = {"schema": "ha-recognized-capabilities-1", "version": 1, "request_schema": "ha-recognized-save-1", "experimental": True,
              "capabilities": ["immutable-opid", "exact-source-binding", "unverified-only", "status-no-text"]}
PROJECTION = ("schema", "batch_id", "snapshot_id", "inventory_sha256", "descriptor_sha256", "source_workspace", "target", "target_source_sha256", "runtime_sha256", "mapping")
ENVELOPE = (*PROJECTION, "plan_sha256", "generation", "batch_state", "items", "actions", "seal")
CONTROL = ".restore-lab"
MAX_INTENT = 65536


def _checkpoint(_name):
    """Test-only process fault seam; not exposed by the CLI."""
    return None


class Refusal(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def need(value, code):
    if not value:
        raise Refusal(code)


def canonical(value, lf=False):
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return raw + (b"\n" if lf else b"")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def exact(value, keys, code="schema_invalid"):
    need(type(value) is dict and set(value) == set(keys), code)


def check_id(value, pattern, code="schema_invalid"):
    need(type(value) is str and pattern.fullmatch(value), code)


def decimal(value):
    need(type(value) is str and re.fullmatch(r"(?:0|[1-9][0-9]*)", value), "schema_invalid")


def same_identity(path):
    fd, chain = rv.open_abs(str(path), directory=True)
    try:
        s = os.fstat(fd)
        real = os.path.realpath(path)
        need(str(path) == real, "unsafe_target")
        return {"realpath": real, "dev": str(s.st_dev), "ino": str(s.st_ino)}, chain
    finally:
        os.close(fd)


def private_file(path, limit):
    fd, _ = rv.open_abs(str(path), private_parent=True)
    try:
        return rv.read_fd(fd, limit)
    finally:
        os.close(fd)


def input_data(snapshot, descriptor, key):
    report = rv.verify(str(snapshot), str(descriptor), str(key))
    need(report["valid"], "export_invalid")
    desc_raw = private_file(descriptor, 65536)
    desc = rv.strict_json(desc_raw, 65536)
    root, _ = rv.open_abs(str(snapshot), directory=True)
    try:
        files, dirs = rv.scan(root)
    finally:
        os.close(root)
    inv = rv.validate_inventory(files, dirs, desc)
    need(rv.semantic(files, dirs, desc, private_file(key, 32)) >= 1, "export_invalid")
    rows = rv.strict_json(files["workspace/sources/manifest.json"][0], 1024*1024)["entries"]
    raw = {"sources/manifest.json": files["workspace/sources/manifest.json"][0]}
    for row in rows:
        raw[row["stored_at"]] = files["workspace/" + row["stored_at"]][0]
    metas = [p for p in files if p.startswith("workspace/recognized/.machine-unverified/operations/") and p.endswith("/metadata.json")]
    mapping_source = []
    workspaces = set()
    for path in metas:
        ident = path.split("/")[-2]
        meta = rv.strict_json(files[path][0], 16384)
        t = meta["request_tuple"]
        side = rv.strict_json(files["recognized-state/" + ident + ".recognized.json"][0], 1024*1024)["payload"]["sidecar"]
        workspaces.add((t[2], t[3], t[4]))
        mapping_source.append({"old_id": ident, "entry_id": t[6], "logical_path": t[7], "stored_at": side["source"]["path"],
                               "source_sha256": t[8], "source_bytes": t[9], "text_sha256": t[10], "text_bytes": t[11],
                               "engine": {"name": t[12], "version": t[13]}, "text": files[path[:-len("metadata.json")] + "artifact.md"][0]})
    need(len(workspaces) == 1, "export_invalid")
    old = next(iter(workspaces))
    return {"descriptor": desc, "descriptor_sha256": sha(desc_raw), "files": files, "source": raw,
            "snapshot_id": inv["snapshot_id"], "source_workspace": {"realpath": old[0], "dev": old[1], "ino": old[2]},
            "old_items": sorted(mapping_source, key=lambda x: x["old_id"])}


def _scan_target(fd):
    """Bounded fd-relative tree; file bytes read once, all unknown entries remain visible."""
    files, dirs = {}, {"": (0o700, None)}
    total = 0
    def walk(parent, prefix, depth):
        nonlocal total
        need(depth <= 12, "target_limit")
        with os.scandir(parent) as entries:
            for entry in entries:
                path = prefix + entry.name
                rv.safe_path(path)
                s = os.stat(entry.name, dir_fd=parent, follow_symlinks=False)
                if stat.S_ISDIR(s.st_mode):
                    need(len(dirs) < 256, "target_limit")
                    child = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                    try:
                        cur = os.fstat(child)
                        mode = stat.S_IMODE(cur.st_mode)
                        expected_mode = 0o755 if path in (".recognized-write", ".recognized-write/.dz") else 0o700
                        need((s.st_dev, s.st_ino) == (cur.st_dev, cur.st_ino) and cur.st_uid == os.geteuid() and mode == expected_mode and cur.st_dev == os.fstat(fd).st_dev, "unsafe_target")
                        dirs[path] = (mode, (cur.st_dev, cur.st_ino))
                        walk(child, path + "/", depth + 1)
                    finally:
                        os.close(child)
                else:
                    need(len(files) < 160 and stat.S_ISREG(s.st_mode) and s.st_nlink == 1, "unsafe_target")
                    child = os.open(entry.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
                    try:
                        cur = os.fstat(child)
                        need((s.st_dev, s.st_ino) == (cur.st_dev, cur.st_ino) and cur.st_uid == os.geteuid() and stat.S_IMODE(cur.st_mode) == 0o600 and cur.st_nlink == 1 and cur.st_dev == os.fstat(fd).st_dev, "unsafe_target")
                        limit = 2*1024*1024 if path.endswith("artifact.md") else 1024*1024
                        if path.endswith("metadata.json"):
                            limit = 16384
                        if path.startswith("sources/raw/"):
                            limit = 32*1024*1024
                        if path == CONTROL + "/intent.json":
                            limit = MAX_INTENT
                        need(total + cur.st_size <= 128*1024*1024 and cur.st_size <= limit, "target_limit")
                        data = rv.read_fd(child, limit)
                        total += len(data)
                        files[path] = data
                    finally:
                        os.close(child)
    walk(fd, "", 0)
    return files, dirs


def target_scan(target):
    fd, _ = rv.open_abs(str(target), directory=True)
    try:
        return _scan_target(fd)
    finally:
        os.close(fd)


def source_projection(source):
    records = []
    dirs = set()
    for path, data in source.items():
        records.append({"path": path, "bytes": len(data), "sha256": sha(data), "mode": 0o600})
        parts = path.split("/")
        dirs.update("/".join(parts[:i]) for i in range(1, len(parts)))
    records.extend({"path": p, "mode": 0o700} for p in dirs)
    return sha(canonical(sorted(records, key=lambda x: x["path"].encode())))


def expected_dirs(paths):
    out = {""}
    for path in paths:
        parts = path.split("/")
        out.update("/".join(parts[:i]) for i in range(1, len(parts)))
    return out


def check_target(target, source, *, phase, ids=()):
    files, dirs = target_scan(target)
    for path, data in source.items():
        need(path in files and files[path] == data, "target_source_drift")
    source_paths = set(source)
    if phase == "initial":
        need(set(files) == source_paths and set(dirs) == expected_dirs(source_paths), "target_membership")
    elif phase == "init_control":
        allowed = source_paths | {CONTROL + "/lock"}
        need(set(files) == allowed and set(dirs) == expected_dirs(allowed), "target_membership")
    else:
        control_files = {CONTROL + "/lock", CONTROL + "/claim.json", CONTROL + "/intent.json"}
        opbase = "recognized/.machine-unverified/operations/"
        operations = {opbase + ident + "/" + name for ident in ids for name in ("metadata.json", "artifact.md")}
        # Partial core saves may have artifact only; never allow foreign objects.
        need(set(files) <= source_paths | control_files | operations, "target_membership")
        scaffold = {".recognized-write", ".recognized-write/.dz"}
        need(set(dirs) <= expected_dirs(source_paths | control_files | operations) | scaffold, "target_membership")
        need(CONTROL in dirs and control_files <= set(files), "target_membership")
    return files, dirs


def runtime_identity(node, runtime):
    node = Path(node)
    runtime = Path(runtime)
    need(node.is_absolute() and runtime.is_absolute(), "runtime_invalid")
    root = runtime / "node_modules"
    need(root.is_dir() and not root.is_symlink(), "runtime_invalid")
    result = {}
    total = count = 0
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if ".bin" in rel.parts:
            continue
        need(not path.is_symlink(), "runtime_invalid")
        if not path.is_file() or path.suffix not in {".js", ".cjs", ".mjs", ".json", ".node"}:
            continue
        count += 1
        need(count <= 32768 and path.stat().st_size <= 16*1024*1024, "runtime_limit")
        data = path.read_bytes()
        total += len(data)
        need(total <= 128*1024*1024, "runtime_limit")
        result[str(rel)] = sha(data)
    for name in ("@dzhechkov/health-advisor/lib/recognized-cli.js", "@dzhechkov/health-advisor/lib/recognized-store.js", "@dzhechkov/harness-core/package.json"):
        need(name in result, "runtime_invalid")
    fd = os.open(node, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        s = os.fstat(fd)
        need(stat.S_ISREG(s.st_mode) and s.st_size <= 256*1024*1024, "runtime_invalid")
        digest = hashlib.sha256()
        while chunk := os.read(fd, 1024*1024):
            digest.update(chunk)
        result["node-executable"] = digest.hexdigest()
    finally:
        os.close(fd)
    return sha(canonical(result))


def core_run(node, runtime, action, request, target):
    need(action in {"capabilities", "save", "status", "read"}, "core_invalid")
    cli = str(Path(runtime) / "node_modules/@dzhechkov/health-advisor/lib/recognized-cli.js")
    argv = [str(node), cli, action]
    if action != "capabilities":
        argv += ["--workspace", str(target)]
    payload = canonical(request)
    need(len(payload) <= 16*1024*1024, "core_limit")
    proc = None
    try:
        proc = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                start_new_session=True, env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
        data = payload if action != "capabilities" else b""
        output = bytearray()
        total = offset = 0
        deadline = time.monotonic() + 25
        with selectors.DefaultSelector() as selector:
            for stream in (proc.stdin, proc.stdout, proc.stderr):
                os.set_blocking(stream.fileno(), False)
            if data:
                selector.register(proc.stdin, selectors.EVENT_WRITE)
            else:
                proc.stdin.close()
            selector.register(proc.stdout, selectors.EVENT_READ)
            selector.register(proc.stderr, selectors.EVENT_READ)
            while selector.get_map():
                left = deadline - time.monotonic()
                need(left > 0, "core_unknown")
                for event, _ in selector.select(left):
                    stream = event.fileobj
                    if stream is proc.stdin:
                        offset += os.write(stream.fileno(), data[offset:offset+65536])
                        if offset == len(data):
                            selector.unregister(stream)
                            stream.close()
                    else:
                        chunk = os.read(stream.fileno(), 65536)
                        if not chunk:
                            selector.unregister(stream)
                            stream.close()
                            continue
                        total += len(chunk)
                        need(total <= 65536, "core_unknown")
                        if stream is proc.stdout:
                            output.extend(chunk)
        left = deadline - time.monotonic()
        need(left > 0 and proc.wait(timeout=left) == 0, "core_unknown")
        return rv.strict_json(bytes(output), 65536)
    except (OSError, subprocess.TimeoutExpired):
        raise Refusal("core_unknown") from None
    finally:
        if proc is not None:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()
            for stream in (proc.stdin, proc.stdout, proc.stderr):
                if not stream.closed:
                    stream.close()


def new_id(snapshot_id, inventory, batch, target, old):
    fields = [snapshot_id, inventory, batch, target["realpath"], target["dev"], target["ino"], old]
    payload = b"hermes-restore-op-v1\0" + b"".join(struct.pack(">I", len(x.encode())) + x.encode() for x in fields)
    return "rc-" + sha(payload)[:32]


def build_plan(data, target, batch, runtime_hash):
    check_id(batch, ID)
    target_ident, _ = same_identity(target)
    need(target_ident != data["source_workspace"], "target_identity")
    snapshot_ident, snapshot_chain = same_identity(data["snapshot_path"])
    need((target_ident["dev"], target_ident["ino"]) != (snapshot_ident["dev"], snapshot_ident["ino"]) and (int(target_ident["dev"]), int(target_ident["ino"])) not in snapshot_chain, "target_identity")
    mapping = []
    new_ids = set()
    old_ids = {x["old_id"] for x in data["old_items"]}
    for old in data["old_items"]:
        ident = new_id(data["snapshot_id"], data["descriptor"]["inventory_sha256"], batch, target_ident, old["old_id"])
        need(ident not in new_ids and ident not in old_ids, "mapping_collision")
        new_ids.add(ident)
        mapping.append({k: (ident if k == "new_id" else old[k]) for k in ("old_id", "new_id", "entry_id", "logical_path", "stored_at", "source_sha256", "source_bytes", "text_sha256", "text_bytes", "engine")})
    projection = {"schema": SCHEMA, "batch_id": batch, "snapshot_id": data["snapshot_id"],
                  "inventory_sha256": data["descriptor"]["inventory_sha256"], "descriptor_sha256": data["descriptor_sha256"],
                  "source_workspace": data["source_workspace"], "target": target_ident, "target_source_sha256": source_projection(data["source"]),
                  "runtime_sha256": runtime_hash, "mapping": mapping}
    plan_hash = sha(canonical(projection))
    return projection, plan_hash


def _fsync_path(path, directory=False):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | (os.O_DIRECTORY if directory else os.O_NONBLOCK))
    try:
        s = os.fstat(fd)
        need((stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode)), "durability_unknown")
        os.fsync(fd)
    finally:
        os.close(fd)


def source_barrier(target, source):
    for name in sorted(source):
        _fsync_path(Path(target) / name)
    for name in sorted(expected_dirs(source), key=lambda x: x.count("/"), reverse=True):
        _fsync_path(Path(target) / name, directory=True)
    _fsync_path(Path(target).parent, directory=True)


def operation_barrier(target, ident, source):
    base = Path(target) / "recognized/.machine-unverified/operations"
    for name in ("metadata.json", "artifact.md"):
        _fsync_path(base / ident / name)
    for path in (base / ident, base, base.parent, base.parent.parent):
        _fsync_path(path, directory=True)
    source_barrier(target, source)


def _noreplace(src, dst):
    libc = ctypes.CDLL(None, use_errno=True)
    function = getattr(libc, "renameat2", None)
    need(function is not None, "atomic_unsupported")
    function.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    function.restype = ctypes.c_int
    result = function(-100, os.fsencode(src), -100, os.fsencode(dst), 1)
    if result != 0:
        errno = ctypes.get_errno()
        if errno in (38, 22, 95):
            raise Refusal("atomic_unsupported")
        if errno == 17:
            raise Refusal("intent_exists")
        raise Refusal("durability_unknown")


def atomic_file(path, data, *, initial=False, generation=0, batch=""):
    path = Path(path)
    need(len(data) <= MAX_INTENT, "intent_limit")
    temp = path.parent / (".intent.tmp." + batch + "." + str(generation))
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(fd)
        if initial:
            _noreplace(temp, path)
        else:
            os.replace(temp, path)
        _fsync_path(path.parent, directory=True)
    finally:
        os.close(fd)
        # Leftover temp is intentionally never removed on error.


def write_exclusive(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(fd)
    finally:
        os.close(fd)
    _fsync_path(Path(path).parent, directory=True)


def validate_envelope(env, expected, digest):
    exact(env, ENVELOPE, "intent_invalid")
    def strings(value):
        if type(value) is str:
            need(not any(ord(c) < 32 or ord(c) == 127 or 0xD800 <= ord(c) <= 0xDFFF for c in value), "intent_invalid")
        elif type(value) is dict:
            for key, item in value.items():
                strings(key)
                strings(item)
        elif type(value) is list:
            for item in value:
                strings(item)
    strings(env)
    check_id(env["batch_id"], ID, "intent_invalid")
    check_id(env["snapshot_id"], ID, "intent_invalid")
    for name in ("inventory_sha256", "descriptor_sha256", "target_source_sha256", "runtime_sha256", "plan_sha256"):
        check_id(env[name], HEX, "intent_invalid")
    for name in ("source_workspace", "target"):
        identity = env[name]
        exact(identity, ["realpath", "dev", "ino"], "intent_invalid")
        need(type(identity["realpath"]) is str and identity["realpath"].startswith("/") and len(identity["realpath"].encode()) <= 4096, "intent_invalid")
        decimal(identity["dev"]); decimal(identity["ino"])
    need(type(env["mapping"]) is list and 1 <= len(env["mapping"]) <= 32, "intent_invalid")
    for row in env["mapping"]:
        exact(row, ["old_id", "new_id", "entry_id", "logical_path", "stored_at", "source_sha256", "source_bytes", "text_sha256", "text_bytes", "engine"], "intent_invalid")
        check_id(row["old_id"], OP, "intent_invalid")
        check_id(row["new_id"], OP, "intent_invalid")
        check_id(row["entry_id"], ID, "intent_invalid")
        check_id(row["source_sha256"], HEX, "intent_invalid")
        check_id(row["text_sha256"], HEX, "intent_invalid")
        need(all(type(row[k]) is int and 0 <= row[k] <= (32*1024*1024 if k == "source_bytes" else 2*1024*1024) for k in ("source_bytes", "text_bytes")), "intent_invalid")
        for path_name in ("logical_path", "stored_at"):
            need(type(row[path_name]) is str and 0 < len(row[path_name].encode()) <= 4096, "intent_invalid")
        exact(row["engine"], ["name", "version"], "intent_invalid")
        need(all(type(v) is str and 0 < len(v) <= 64 for v in row["engine"].values()), "intent_invalid")
    need(all(env[k] == expected[k] for k in PROJECTION) and env["plan_sha256"] == digest, "intent_drift")
    need(type(env["generation"]) is int and 0 <= env["generation"] <= 10000 and type(env["items"]) is list and len(env["items"]) == len(expected["mapping"]) and type(env["actions"]) is list and len(env["actions"]) <= 64, "intent_invalid")
    states = []
    for item, row in zip(env["items"], expected["mapping"]):
        exact(item, ["old_id", "state", "observation"], "intent_invalid")
        need(item["old_id"] == row["old_id"] and item["state"] in ("planned", "attempting", "observed", "held") and (item["observation"] is None) == (item["state"] != "observed"), "intent_invalid")
        states.append(item["state"])
        if item["observation"] is not None:
            exact(item["observation"], ["request_sha256", "text_sha256", "text_bytes", "source_sha256", "source_bytes"], "intent_invalid")
            need(type(item["observation"]["text_bytes"]) is int and type(item["observation"]["source_bytes"]) is int, "intent_invalid")
            for field in ("request_sha256", "text_sha256", "source_sha256"):
                check_id(item["observation"][field], HEX, "intent_invalid")
            need(all(item["observation"][field] == row[field] for field in ("text_sha256", "text_bytes", "source_sha256", "source_bytes")), "intent_invalid")
    for action in env["actions"]:
        exact(action, ["kind", "plan_sha256", "at"], "intent_invalid")
        need(action["kind"] in ("apply", "reconcile") and action["plan_sha256"] == digest and type(action["at"]) is str and re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", action["at"]), "intent_invalid")
        try:
            datetime.datetime.strptime(action["at"], "%Y-%m-%dT%H:%M:%S.%fZ")
        except ValueError:
            raise Refusal("intent_invalid") from None
    batch = env["batch_state"]
    allowed = ((batch == "planned" and all(s == "planned" for s in states) and env["seal"] is None) or
               (batch == "applying" and any(s in ("attempting", "observed") for s in states) and "held" not in states and env["seal"] is None) or
               (batch == "held" and "held" in states and env["seal"] is None) or
               (batch == "sealed" and all(s == "observed" for s in states) and env["seal"] is not None))
    need(allowed, "intent_invalid")
    if env["seal"] is not None:
        exact(env["seal"], ["plan_sha256", "inventory_sha256", "target", "observations_sha256"], "intent_invalid")
        need(env["seal"] == {"plan_sha256": digest, "inventory_sha256": expected["inventory_sha256"], "target": expected["target"], "observations_sha256": sha(canonical([x["observation"] for x in env["items"]]))}, "seal_drift")


def _read_intent(control, expected, digest):
    with os.scandir(control) as entries:
        names = set()
        for entry in entries:
            need(len(names) < 4, "control_unknown")
            names.add(entry.name)
    need(names == {"lock", "claim.json", "intent.json"}, "control_unknown")
    claim_raw = private_file(control / "claim.json", 16384)
    claim = rv.strict_json(claim_raw, 16384)
    exact(claim, ["schema", "batch_id", "plan_sha256", "target"], "claim_invalid")
    need(claim_raw == canonical(claim, True) and claim == {"schema": "hermes-restore-claim-1", "batch_id": expected["batch_id"], "plan_sha256": digest, "target": expected["target"]}, "claim_invalid")
    raw = private_file(control / "intent.json", MAX_INTENT)
    env = rv.strict_json(raw, MAX_INTENT)
    need(raw == canonical(env, True), "intent_invalid")
    validate_envelope(env, expected, digest)
    return env


def _update(control, env, expected, digest):
    next_env = copy.deepcopy(env)
    next_env["generation"] += 1
    validate_envelope(next_env, expected, digest)
    atomic_file(control / "intent.json", canonical(next_env, True), generation=next_env["generation"], batch=expected["batch_id"])
    return next_env


def _timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _core_read(node, runtime, target, row):
    ident = row["new_id"]
    status = core_run(node, runtime, "read", {"operation_id": ident}, target)
    exact(status, ["ok", "status", "operation_id", "request_sha256", "artifact_path", "source", "text_sha256",
                   "text_bytes", "engine", "created_at", "verification_status", "human_verification", "content_trust",
                   "label", "index_status", "current_source_integrity", "text"], "core_readback")
    need(status.get("ok") is True and status.get("status") == "present_unverified" and status.get("operation_id") == ident, "core_not_present")
    text = status.get("text")
    need(type(text) is str and sha(text.encode()) == row["text_sha256"] and len(text.encode()) == row["text_bytes"], "core_readback")
    target_ident, _ = same_identity(target)
    tuple_ = ["ha-recognized-save-1", ident, target_ident["realpath"], target_ident["dev"], target_ident["ino"], "ha-source-anchor-1", row["entry_id"], row["logical_path"], row["source_sha256"], row["source_bytes"], row["text_sha256"], row["text_bytes"], row["engine"]["name"], row["engine"]["version"]]
    request_hash = sha(rv.enc(tuple_))
    need(status.get("request_sha256") == request_hash and status.get("source") == {"entry_id": row["entry_id"], "sha256": row["source_sha256"], "bytes": row["source_bytes"]} and status.get("engine") == row["engine"] and status.get("text_sha256") == row["text_sha256"] and type(status.get("text_bytes")) is int and status["text_bytes"] == row["text_bytes"] and status.get("verification_status") == "unverified" and status.get("human_verification") == "not_established" and status.get("content_trust") == "untrusted_document" and status.get("index_status") == "not_requested" and status.get("current_source_integrity") == "valid_at_read_time" and status.get("label") == "НЕПРОВЕРЕНО" and status.get("artifact_path") == f"recognized/.machine-unverified/operations/{ident}/artifact.md", "core_readback")
    opdir = Path(target) / "recognized/.machine-unverified/operations" / ident
    meta_raw = private_file(opdir / "metadata.json", 16384)
    meta = rv.strict_json(meta_raw, 16384)
    exact(meta, ["schema", "request_tuple", "request_sha256", "created_at", "verification_status", "content_trust"], "core_readback")
    need(meta_raw == rv.enc(meta) + b"\n" and meta.get("schema") == "ha-recognized-operation-1" and meta.get("request_tuple") == tuple_ and meta.get("request_sha256") == request_hash and meta.get("verification_status") == "unverified" and meta.get("content_trust") == "untrusted_document" and meta.get("created_at") == status["created_at"], "core_readback")
    need(private_file(opdir / "artifact.md", 2*1024*1024) == text.encode(), "core_readback")
    return {"request_sha256": request_hash, "text_sha256": row["text_sha256"], "text_bytes": row["text_bytes"], "source_sha256": row["source_sha256"], "source_bytes": row["source_bytes"]}


def _hold(control, env, expected, digest, item):
    changed = copy.deepcopy(env)
    changed["items"][item]["state"] = "held"
    changed["items"][item]["observation"] = None
    changed["batch_state"] = "held"
    return _update(control, changed, expected, digest)


def _lock_control(target, *, initial):
    control = Path(target) / CONTROL
    if initial:
        os.mkdir(control, 0o700)
        _fsync_path(target, directory=True)
        lock = os.open(control / "lock", os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        os.fsync(lock)
        _fsync_path(control, directory=True)
    else:
        lock = os.open(control / "lock", os.O_RDWR | os.O_NOFOLLOW)
    try:
        s = os.fstat(lock)
        need(stat.S_ISREG(s.st_mode) and s.st_uid == os.geteuid() and stat.S_IMODE(s.st_mode) == 0o600 and s.st_nlink == 1, "control_invalid")
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return control, lock
    except Exception:
        os.close(lock)
        raise


def execute(action, snapshot, descriptor, key, target, batch, node, runtime, confirmed=None):
    need(action in ("plan", "apply", "reconcile"), "action_invalid")
    data = input_data(snapshot, descriptor, key)
    data["snapshot_path"] = str(snapshot)
    expected_runtime = runtime_identity(node, runtime)
    need(expected_runtime == data["descriptor"]["expected_runtime"], "runtime_mismatch")
    need(core_run(node, runtime, "capabilities", {}, None) == CAPABILITY, "runtime_invalid")
    projection, digest = build_plan(data, target, batch, expected_runtime)
    summary = {"schema": "hermes-restore-report-1", "ok": True, "executable": False, "plan_sha256": digest,
               "batch_state": "planned", "operation_count": len(projection["mapping"]), "refusal_codes": []}
    if action == "plan":
        check_target(target, data["source"], phase="initial")
        return summary
    need(confirmed == digest, "plan_confirmation")
    control = Path(target) / CONTROL
    initial = not control.exists()
    if action == "reconcile":
        need(not initial, "control_missing")
    if initial:
        check_target(target, data["source"], phase="initial")
        source_barrier(target, data["source"])
    control, lock = _lock_control(target, initial=initial)
    try:
        if initial:
            check_target(target, data["source"], phase="init_control")
            claim = {"schema": "hermes-restore-claim-1", "batch_id": batch, "plan_sha256": digest, "target": projection["target"]}
            write_exclusive(control / "claim.json", canonical(claim, True))
            env = {**projection, "plan_sha256": digest, "generation": 0, "batch_state": "planned",
                   "items": [{"old_id": row["old_id"], "state": "planned", "observation": None} for row in projection["mapping"]],
                   "actions": [{"kind": "apply", "plan_sha256": digest, "at": _timestamp()}], "seal": None}
            validate_envelope(env, projection, digest)
            atomic_file(control / "intent.json", canonical(env, True), initial=True, generation=0, batch=batch)
        else:
            check_target(target, data["source"], phase="active", ids=[r["new_id"] for r in projection["mapping"]])
            if action == "reconcile":
                _fsync_path(control / "intent.json")
                _fsync_path(control, directory=True)
            env = _read_intent(control, projection, digest)
            if env["batch_state"] == "sealed":
                for row, item in zip(projection["mapping"], env["items"]):
                    obs = _core_read(node, runtime, target, row)
                    need(obs == item["observation"], "seal_drift")
                summary["batch_state"] = "sealed"
                return summary
            if action == "apply":
                need(env["batch_state"] in ("planned", "applying") and all(item["state"] != "attempting" for item in env["items"]), "reconcile_required")
                need(env["actions"][-1]["kind"] == "reconcile", "reconcile_required")
            changed = copy.deepcopy(env)
            changed["actions"].append({"kind": action, "plan_sha256": digest, "at": _timestamp()})
            env = _update(control, changed, projection, digest)
        rows = projection["mapping"]
        for i, (item, row) in enumerate(zip(env["items"], rows)):
            state = item["state"]
            started_here = False
            if state == "held":
                raise Refusal("batch_held")
            if state == "planned":
                status = core_run(node, runtime, "status", {"operation_id": row["new_id"]}, target)
                if status.get("ok") is not True or status.get("status") != "absent_at_read_time":
                    env = _hold(control, env, projection, digest, i)
                    raise Refusal("core_ambiguous")
                if action == "reconcile":
                    continue
                changed = copy.deepcopy(env)
                changed["items"][i]["state"] = "attempting"
                changed["batch_state"] = "applying"
                env = _update(control, changed, projection, digest)
                _checkpoint("attempting_durable")
                old = next(x for x in data["old_items"] if x["old_id"] == row["old_id"])
                request = {"operation_id": row["new_id"], "entry_id": row["entry_id"], "source_sha256": row["source_sha256"],
                           "source_bytes": row["source_bytes"], "text": old["text"].decode("utf-8"), "engine": row["engine"]}
                try:
                    core_run(node, runtime, "save", request, target)
                except Refusal:
                    raise Refusal("core_unknown") from None
                _checkpoint("core_returned")
                state = "attempting"
                started_here = True
            if state in ("attempting", "observed"):
                try:
                    check_target(target, data["source"], phase="active", ids=[r["new_id"] for r in rows])
                    obs = _core_read(node, runtime, target, row)
                    operation_barrier(target, row["new_id"], data["source"])
                    need(_core_read(node, runtime, target, row) == obs, "core_readback")
                except Refusal:
                    env = _hold(control, env, projection, digest, i)
                    raise
                if state == "attempting":
                    if action == "apply" and not started_here:
                        raise Refusal("reconcile_required")
                    changed = copy.deepcopy(env)
                    changed["items"][i]["state"] = "observed"
                    changed["items"][i]["observation"] = obs
                    env = _update(control, changed, projection, digest)
                else:
                    need(item["observation"] == obs, "core_readback")
        if all(x["state"] == "observed" for x in env["items"]):
            for row, item in zip(rows, env["items"]):
                before = _core_read(node, runtime, target, row)
                need(before == item["observation"], "core_readback")
                operation_barrier(target, row["new_id"], data["source"])
                need(_core_read(node, runtime, target, row) == before, "core_readback")
            _checkpoint("before_seal")
            changed = copy.deepcopy(env)
            changed["batch_state"] = "sealed"
            changed["seal"] = {"plan_sha256": digest, "inventory_sha256": projection["inventory_sha256"], "target": projection["target"],
                               "observations_sha256": sha(canonical([x["observation"] for x in env["items"]]))}
            env = _update(control, changed, projection, digest)
        summary["batch_state"] = env["batch_state"]
        return summary
    finally:
        os.close(lock)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Synthetic offline recognized restore lab")
    parser.add_argument("action", choices=["plan", "apply", "reconcile"])
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--descriptor", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--batch-id", required=True)
    parser.add_argument("--node", required=True)
    parser.add_argument("--runtime", required=True)
    parser.add_argument("--confirm-plan-digest")
    args = parser.parse_args(argv)
    try:
        report = execute(args.action, args.snapshot, args.descriptor, args.key, args.target, args.batch_id, args.node, args.runtime, args.confirm_plan_digest)
        status = 0
    except (Refusal, rv.Refusal) as exc:
        report = {"schema": "hermes-restore-report-1", "ok": False, "executable": False, "plan_sha256": "", "batch_state": "unknown", "operation_count": 0,
                  "refusal_codes": [exc.code if isinstance(exc, Refusal) else "export_invalid"]}
        status = 2
    except (OSError, KeyError, ValueError, TypeError, UnicodeError):
        report = {"schema": "hermes-restore-report-1", "ok": False, "executable": False, "plan_sha256": "", "batch_state": "unknown", "operation_count": 0,
                  "refusal_codes": ["input_invalid"]}
        status = 2
    sys.stdout.write(json.dumps(report, separators=(",", ":")) + "\n")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
