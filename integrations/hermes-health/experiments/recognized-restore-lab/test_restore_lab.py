"""Fault-seam tests; installed core compatibility is tested separately."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


lab = load(HERE / "restore_lab.py", "restore_lab")
fixtures = load(HERE.parent / "recognized-recovery" / "fixtures.py", "fixtures")


class FakeCore:
    def __init__(self, target, marker=None):
        self.target = target
        self.marker = marker
        self.saves = 0
        self.timeout = False
        self.timeout_after_write = False
        self.read_count = 0
        self.bad_read_at = None
        self.calls = []

    def __call__(self, node, runtime, action, request, target):
        self.calls.append(action)
        if action == "capabilities":
            return lab.CAPABILITY
        if action == "status":
            ident = request["operation_id"]
            path = self.target / "recognized/.machine-unverified/operations" / ident
            if path.exists():
                return self.__call__(node, runtime, "read", request, target)
            return {"ok": True, "status": "absent_at_read_time", "operation_id": ident}
        if action == "save":
            self.saves += 1
            if self.marker is not None:
                fd = os.open(self.marker, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
                try:
                    os.write(fd, b"x")
                finally:
                    os.close(fd)
            if self.timeout:
                raise lab.Refusal("core_unknown")
            ident = request["operation_id"]
            t = ["ha-recognized-save-1", ident, str(self.target), str(self.target.stat().st_dev), str(self.target.stat().st_ino),
                 "ha-source-anchor-1", request["entry_id"], "report.txt", request["source_sha256"], request["source_bytes"],
                 lab.sha(request["text"].encode()), len(request["text"].encode()), request["engine"]["name"], request["engine"]["version"]]
            meta = {"schema": "ha-recognized-operation-1", "request_tuple": t, "request_sha256": lab.sha(lab.rv.enc(t)),
                    "created_at": "2026-01-01T00:00:00.000Z", "verification_status": "unverified", "content_trust": "untrusted_document"}
            op = self.target / "recognized/.machine-unverified/operations" / ident
            op.mkdir(parents=True, mode=0o700)
            for parent in [op, op.parent, op.parent.parent, op.parent.parent.parent]:
                os.chmod(parent, 0o700)
            fixtures.put(op / "artifact.md", request["text"].encode())
            fixtures.put(op / "metadata.json", lab.rv.enc(meta) + b"\n")
            if self.timeout_after_write:
                raise lab.Refusal("core_unknown")
            return {"ok": True, "status": "saved_unverified", "operation_id": ident}
        if action == "read":
            self.read_count += 1
            ident = request["operation_id"]
            op = self.target / "recognized/.machine-unverified/operations" / ident
            if not op.exists():
                return {"ok": True, "status": "absent_at_read_time", "operation_id": ident}
            meta = json.loads((op / "metadata.json").read_bytes())
            t = meta["request_tuple"]
            text = (op / "artifact.md").read_text()
            return {"ok": True, "status": "present_unverified", "operation_id": ident, "request_sha256": "0" * 64 if self.read_count == self.bad_read_at else meta["request_sha256"],
                    "source": {"entry_id": t[6], "sha256": t[8], "bytes": t[9]}, "engine": {"name": t[12], "version": t[13]},
                    "text_sha256": t[10], "text_bytes": t[11], "verification_status": "unverified", "human_verification": "not_established",
                    "content_trust": "untrusted_document", "index_status": "not_requested", "text": text,
                    "artifact_path": f"recognized/.machine-unverified/operations/{ident}/artifact.md",
                    "created_at": meta["created_at"], "label": "НЕПРОВЕРЕНО", "current_source_integrity": "valid_at_read_time"}
        raise AssertionError(action)


class RestoreLabTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        base = Path(self.tmp.name)
        self.snapshot, self.descriptor, self.key = fixtures.make(base)
        self.target = base / "target"
        self.target.mkdir(mode=0o700)
        for p in (self.snapshot / "workspace/sources").rglob("*"):
            relative = p.relative_to(self.snapshot / "workspace")
            dest = self.target / relative
            if p.is_dir():
                dest.mkdir(parents=True, exist_ok=True, mode=0o700)
                os.chmod(dest, 0o700)
            else:
                fixtures.put(dest, p.read_bytes())
        for p in self.target.rglob("*"):
            if p.is_dir():
                os.chmod(p, 0o700)
        self.marker = base / "save-events"
        self.fake = FakeCore(self.target, self.marker)
        self.batch = "a" * 32
        self.patches = [patch.object(lab, "runtime_identity", return_value=fixtures.RUNTIME),
                        patch.object(lab, "core_run", side_effect=self.fake)]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)

    def run_action(self, action, digest=None):
        return lab.execute(action, str(self.snapshot), str(self.descriptor), str(self.key), str(self.target),
                           self.batch, "/synthetic/node", "/synthetic/runtime", digest)

    def test_intent_before_first_save_and_seal(self):
        plan = self.run_action("plan")
        self.assertEqual(plan["batch_state"], "planned")
        self.assertFalse((self.target / ".restore-lab").exists())
        report = self.run_action("apply", plan["plan_sha256"])
        self.assertEqual(report["batch_state"], "sealed")
        self.assertEqual(self.fake.saves, 1)
        env = json.loads((self.target / ".restore-lab/intent.json").read_bytes())
        self.assertEqual(env["items"][0]["state"], "observed")
        self.assertEqual(env["batch_state"], "sealed")
        self.assertNotEqual(env["mapping"][0]["old_id"], env["mapping"][0]["new_id"])

    def test_invalid_export_refuses_before_target_write(self):
        path = self.snapshot / "inventory.json"
        fixtures.put(path, path.read_bytes() + b" ")
        with self.assertRaisesRegex(lab.Refusal, "export_invalid"):
            self.run_action("plan")
        self.assertEqual(self.fake.saves, 0)
        self.assertFalse((self.target / ".restore-lab").exists())

    def test_target_source_only_and_alias_refusal(self):
        extra = self.target / "foreign"
        fixtures.put(extra, b"x")
        with self.assertRaisesRegex(lab.Refusal, "target_membership"):
            self.run_action("plan")
        extra.unlink()
        source = self.target / "sources/manifest.json"
        fixtures.put(source, b"changed")
        with self.assertRaisesRegex(lab.Refusal, "target_source_drift"):
            self.run_action("plan")

    def test_no_blind_retry_after_timeout(self):
        digest = self.run_action("plan")["plan_sha256"]
        self.fake.timeout = True
        with self.assertRaisesRegex(lab.Refusal, "core_unknown"):
            self.run_action("apply", digest)
        self.assertEqual(self.fake.saves, 1)
        self.fake.timeout = False
        with self.assertRaisesRegex(lab.Refusal, "reconcile_required"):
            self.run_action("apply", digest)
        self.assertEqual(self.fake.saves, 1)

    def test_attempting_absent_is_held(self):
        digest = self.run_action("plan")["plan_sha256"]
        self.fake.timeout = True
        with self.assertRaisesRegex(lab.Refusal, "core_unknown"):
            self.run_action("apply", digest)
        self.fake.timeout = False
        with self.assertRaisesRegex(lab.Refusal, "core_readback"):
            self.run_action("reconcile", digest)
        env = json.loads((self.target / ".restore-lab/intent.json").read_bytes())
        self.assertEqual(env["batch_state"], "held")
        self.assertEqual(self.fake.saves, 1)

    def test_attempting_present_requires_reconcile_barrier(self):
        digest = self.run_action("plan")["plan_sha256"]
        self.fake.timeout_after_write = True
        with self.assertRaisesRegex(lab.Refusal, "core_unknown"):
            self.run_action("apply", digest)
        self.fake.timeout_after_write = False
        with self.assertRaisesRegex(lab.Refusal, "reconcile_required"):
            self.run_action("apply", digest)
        result = self.run_action("reconcile", digest)
        self.assertEqual(result["batch_state"], "sealed")
        self.assertEqual(self.fake.saves, 1)

    def test_seal_requires_full_readback(self):
        digest = self.run_action("plan")["plan_sha256"]
        self.fake.bad_read_at = 3
        with self.assertRaisesRegex(lab.Refusal, "core_readback"):
            self.run_action("apply", digest)
        env = json.loads((self.target / ".restore-lab/intent.json").read_bytes())
        self.assertNotEqual(env["batch_state"], "sealed")

    def test_unknown_fsync_fail_stop(self):
        digest = self.run_action("plan")["plan_sha256"]
        with patch.object(lab, "operation_barrier", side_effect=lab.Refusal("durability_unknown")):
            with self.assertRaisesRegex(lab.Refusal, "durability_unknown"):
                self.run_action("apply", digest)
        env = json.loads((self.target / ".restore-lab/intent.json").read_bytes())
        self.assertEqual(env["batch_state"], "held")
        self.assertEqual(self.fake.saves, 1)

    def test_mapping_collision_refuses(self):
        with patch.object(lab, "new_id", return_value=fixtures.OP):
            with self.assertRaisesRegex(lab.Refusal, "mapping_collision"):
                self.run_action("plan")
        self.assertFalse((self.target / ".restore-lab").exists())

    def test_runtime_mismatch_refuses(self):
        with patch.object(lab, "runtime_identity", return_value="0" * 64):
            with self.assertRaisesRegex(lab.Refusal, "runtime_mismatch"):
                self.run_action("plan")
        self.assertEqual(self.fake.calls, [])
        self.assertFalse((self.target / ".restore-lab").exists())

    def test_plan_digest_confirmation_required(self):
        with self.assertRaisesRegex(lab.Refusal, "plan_confirmation"):
            self.run_action("apply", "0" * 64)
        self.assertFalse((self.target / ".restore-lab").exists())

    def test_concurrent_claim_one_owner(self):
        if not hasattr(os, "fork"):
            self.skipTest("POSIX fork required")
        digest = self.run_action("plan")["plan_sha256"]
        start_r, start_w = os.pipe()
        result_r, result_w = os.pipe()
        children = []
        for _ in range(2):
            pid = os.fork()
            if pid == 0:
                os.close(start_w)
                os.close(result_r)
                os.read(start_r, 1)
                try:
                    answer = self.run_action("apply", digest)["batch_state"]
                except Exception as exc:
                    answer = getattr(exc, "code", "error")
                os.write(result_w, (answer + "\n").encode())
                os._exit(0)
            children.append(pid)
        os.close(start_r)
        os.close(result_w)
        os.write(start_w, b"xx")
        os.close(start_w)
        for pid in children:
            os.waitpid(pid, 0)
        outcomes = os.read(result_r, 4096).decode().splitlines()
        os.close(result_r)
        self.assertEqual(len(outcomes), 2)
        self.assertEqual(self.marker.read_bytes(), b"x")
        self.assertEqual(json.loads((self.target / ".restore-lab/intent.json").read_bytes())["batch_state"], "sealed")


if __name__ == "__main__":
    unittest.main()
