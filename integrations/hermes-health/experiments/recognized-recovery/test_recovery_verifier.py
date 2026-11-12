"""Offline synthetic input and refusal tests for recovery_verifier."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest


HERE = Path(__file__).parent


def module(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


f = module("fixtures")
v = module("recovery_verifier")


class RecoveryVerifierTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.snapshot, self.descriptor, self.key = f.make(Path(self.tmp.name))

    def check(self, expected):
        report = v.verify(str(self.snapshot), str(self.descriptor), str(self.key))
        self.assertEqual(report["refusal_codes"], [] if expected == "valid" else [expected])
        self.assertEqual(report["valid"], expected == "valid")
        self.assertIs(report["executable"], False)
        self.assertLess(len(json.dumps(report)), 4096)
        self.assertNotIn(str(self.snapshot), json.dumps(report))
        self.assertNotIn("synthetic primary source", json.dumps(report))
        return report

    def receipt_path(self):
        return self.snapshot / "recognized-state" / (f.OP + ".recognized.json")

    def meta_path(self):
        return self.snapshot / "workspace/recognized/.machine-unverified/operations" / f.OP / "metadata.json"

    def mutate_receipt(self, action, resign=True):
        path = self.receipt_path()
        env = json.loads(path.read_bytes())
        action(env)
        f.put(path, f.encode(env))
        if resign:
            f.resign(path)
        f.seal(self.snapshot, self.descriptor, self.key)

    def mutate_meta(self, action):
        path = self.meta_path()
        meta = json.loads(path.read_bytes())
        action(meta)
        f.put(path, f.encode(meta) + b"\n")
        f.seal(self.snapshot, self.descriptor, self.key)

    def test_valid_copy_new_inode_and_no_writes(self):
        before = {str(p.relative_to(self.snapshot)): p.read_bytes() for p in self.snapshot.rglob("*") if p.is_file()}
        self.check("valid")
        copied = Path(self.tmp.name) / "copy"
        shutil.copytree(self.snapshot, copied)
        self.snapshot = copied
        self.assertEqual(self.check("valid")["operation_count"], 1)
        after = {str(p.relative_to(copied)): p.read_bytes() for p in copied.rglob("*") if p.is_file()}
        self.assertEqual(before, after)

    def test_inventory_integrity_and_membership(self):
        path = self.snapshot / "workspace/sources/manifest.json"
        f.put(path, path.read_bytes() + b" ")
        self.check("inventory_integrity")
        manifest = json.loads(path.read_bytes())
        manifest["entries"][0]["bytes"] += 1
        f.put(path, f.encode(manifest))
        f.seal(self.snapshot, self.descriptor, self.key)
        self.check("source_invalid")
        extra = self.snapshot / "workspace/recognized/.machine-unverified/operations" / ".staging-crash"
        extra.mkdir(mode=0o700)
        self.check("inventory_membership")

    def test_reinventoried_empty_directory_refused(self):
        extra = self.snapshot / "workspace/unused"
        extra.mkdir(mode=0o700)
        f.seal(self.snapshot, self.descriptor, self.key)
        self.check("inventory_membership")

    def test_nested_operation_path_after_reinventory(self):
        opdir = self.meta_path().parent
        nested = opdir.parent / "unexpected" / f.OP
        nested.parent.mkdir(mode=0o700)
        os.chmod(nested.parent, 0o700)
        shutil.move(str(opdir), str(nested))
        f.seal(self.snapshot, self.descriptor, self.key)
        self.check("inventory_membership")

    def test_bool_byte_count_after_resign(self):
        self.mutate_receipt(lambda env: env["payload"]["sidecar"]["source"].__setitem__("bytes", True))
        self.check("receipt_invalid")

    def test_path_traversal_inventory(self):
        inv = self.snapshot / "inventory.json"
        value = json.loads(inv.read_bytes())
        value["entries"][0]["path"] = "../outside"
        f.put(inv, f.encode(value))
        desc = json.loads(self.descriptor.read_bytes())
        desc["inventory_sha256"] = f.sha(inv.read_bytes())
        f.put(self.descriptor, f.encode(desc))
        self.check("path_invalid")

    def test_wrong_key_and_mac(self):
        f.put(self.key, b"Z" * 32)
        self.check("key_integrity")
        f.put(self.key, f.KEY)
        self.mutate_receipt(lambda env: env.__setitem__("mac", "0" * 64), resign=False)
        self.check("receipt_integrity")

    def test_missing_key(self):
        self.key.unlink()
        self.check("key_missing")

    def test_manifest_values_after_reinventory(self):
        path = self.snapshot / "workspace/sources/manifest.json"
        bads = [
            ("media_type", {}), ("ingested_at", False), ("archive_id", 17),
            ("source.kind", []), ("source.url_redacted", []),
            ("source.url_sha256", []), ("source.local_path", []),
            ("source.digest_source", []),
        ]
        original = json.loads(path.read_bytes())
        for field, value in bads:
            with self.subTest(field=field):
                changed = json.loads(json.dumps(original))
                row = changed["entries"][0]
                if field.startswith("source."):
                    row["source"][field.split(".")[1]] = value
                else:
                    row[field] = value
                f.put(path, f.encode(changed))
                f.seal(self.snapshot, self.descriptor, self.key)
                self.check("source_invalid")

    def test_payload_workspace_float_and_bool_after_resign(self):
        for value in (11.0, True):
            with self.subTest(value=value):
                self.mutate_receipt(lambda env, n=value: env["payload"]["workspace"].__setitem__("dev", n))
                self.check("receipt_invalid")

    def test_inventory_mode_float(self):
        inv = self.snapshot / "inventory.json"
        value = json.loads(inv.read_bytes())
        value["entries"][0]["mode"] = 448.0
        f.put(inv, f.encode(value))
        desc = json.loads(self.descriptor.read_bytes())
        desc["inventory_sha256"] = f.sha(inv.read_bytes())
        f.put(self.descriptor, f.encode(desc))
        self.check("inventory_invalid")

    def test_unsafe_root_fd_no_leak(self):
        if not Path("/proc/self/fd").exists():
            self.skipTest("Linux /proc/self/fd required")
        before = len(list(Path("/proc/self/fd").iterdir()))
        os.chmod(self.snapshot, 0o755)
        for _ in range(20):
            self.check("unsafe_path")
        after = len(list(Path("/proc/self/fd").iterdir()))
        self.assertEqual(before, after)

    def test_state_matrix_after_resign(self):
        for state in ("prepared", "committing", "reconciliation_required", "expired", "cancelled"):
            with self.subTest(state=state):
                self.mutate_receipt(lambda env, s=state: env["payload"].__setitem__("state", s))
                self.check("state_invalid")
        self.mutate_receipt(lambda env: (env["payload"].__setitem__("state", "saved_unverified"), env["payload"].__setitem__("artifact_observed", False)))
        self.check("state_invalid")

    def test_owner_runtime_and_workspace_after_resign(self):
        self.mutate_receipt(lambda env: env["payload"]["owner"].__setitem__("user_id", "other"))
        self.check("receipt_binding")
        self.mutate_receipt(lambda env: (env["payload"].__setitem__("owner", f.OWNER), env["payload"].__setitem__("runtime", "0" * 64)))
        self.check("receipt_binding")
        self.mutate_receipt(lambda env: (env["payload"].__setitem__("runtime", f.RUNTIME), env["payload"]["sidecar"]["workspace"].__setitem__("ino", 99)))
        self.check("receipt_binding")

    def test_logical_vs_stored_at_after_resign(self):
        self.mutate_receipt(lambda env: env["payload"]["sidecar"]["source"].__setitem__("logical_path", env["payload"]["sidecar"]["source"]["path"]))
        self.check("source_binding")

    def test_core_tuple_and_encoding_after_reinventory(self):
        self.mutate_meta(lambda meta: meta["request_tuple"].__setitem__(7, "wrong.txt"))
        self.check("core_invalid")
        meta = json.loads(self.meta_path().read_bytes())
        meta["request_sha256"] = f.sha(f.encode(meta["request_tuple"]))
        f.put(self.meta_path(), f.encode(meta) + b"\n")
        f.seal(self.snapshot, self.descriptor, self.key)
        self.check("source_binding")
        f.put(self.meta_path(), f.encode(meta, sorted_keys=True) + b"\n")
        f.seal(self.snapshot, self.descriptor, self.key)
        self.check("core_invalid")

    def test_duplicate_json_and_extra_field(self):
        path = self.receipt_path()
        f.put(path, b'{"payload":{},"payload":{},"mac":"0"}')
        f.seal(self.snapshot, self.descriptor, self.key)
        self.check("json_invalid")
        self.mutate_receipt(lambda env: env.__setitem__("unexpected", 1))
        self.check("receipt_invalid")

    def test_symlink_hardlink_and_permissions(self):
        raw = self.snapshot / "workspace/sources/manifest.json"
        copy = raw.read_bytes()
        raw.unlink()
        raw.symlink_to(self.descriptor)
        self.check("unsafe_path")
        raw.unlink()
        f.put(raw, copy)
        os.link(raw, self.snapshot / "workspace/sources/other")
        self.check("unsafe_path")
        (self.snapshot / "workspace/sources/other").unlink()
        os.chmod(raw, 0o644)
        self.check("unsafe_path")

    def test_duplicate_inventory_and_snapshot_id(self):
        inv = self.snapshot / "inventory.json"
        data = json.loads(inv.read_bytes())
        data["entries"].append(data["entries"][0])
        f.put(inv, f.encode(data))
        desc = json.loads(self.descriptor.read_bytes())
        desc["inventory_sha256"] = f.sha(inv.read_bytes())
        f.put(self.descriptor, f.encode(desc))
        self.check("inventory_invalid")
        f.seal(self.snapshot, self.descriptor, self.key)
        data = json.loads(inv.read_bytes())
        data["snapshot_id"] = "0" * 32
        f.put(inv, f.encode(data))
        desc["inventory_sha256"] = f.sha(inv.read_bytes())
        f.put(self.descriptor, f.encode(desc))
        self.check("inventory_invalid")


if __name__ == "__main__":
    unittest.main()
