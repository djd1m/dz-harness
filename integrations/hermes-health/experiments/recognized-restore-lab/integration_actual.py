"""Pinned offline image only: actual synthetic adapter/core export and new core save/read."""
import hashlib
import json
import os
import signal
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

sys.path.insert(0, "/lab")
sys.path.insert(0, "/lab/tests")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "recognized-recovery"))
import fixtures
import restore_lab as lab
from test_recognized_confirm import m, HealthTools
from test_intake_preview import synthetic_pdf
from recognized_fixture import pdf_draft
from gateway import session_context


class InstalledRestoreLabTest(unittest.TestCase):
    def test_actual_export_plan_apply_and_read(self):
        node = "/opt/health-node22/bin/node"
        runtime = Path("/opt/health-advisor-runtime")
        cli = runtime / "node_modules/@dzhechkov/health-advisor/bin/health-advisor.js"
        self.assertTrue(Path(node).is_file() and cli.is_file(), "pinned runtime unavailable")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            workspace = root / "old-map"
            workspace.mkdir(mode=0o700)
            drafts = root / "drafts"
            drafts.mkdir(mode=0o700)
            intake = root / "intake"
            intake.mkdir(mode=0o700)
            archive = root / "technical.zip"
            with zipfile.ZipFile(archive, "w") as zipped:
                zipped.writestr("technical.pdf", synthetic_pdf())
            result = subprocess.run([node, str(cli), "intake-archive", "--workspace", str(workspace), "--file", str(archive), "--json"], capture_output=True, timeout=30)
            self.assertEqual(result.returncode, 0, "actual synthetic intake failed")
            row = json.loads((workspace / "sources/manifest.json").read_bytes())["entries"][0]
            env = {"HEALTH_WORKSPACE": str(workspace), "HEALTH_DRAFTS": str(drafts), "HEALTH_INTAKE_STATE": str(intake),
                   "HEALTH_RECOGNIZED_STATE": str(root / "recognized-state"), "HEALTH_RECOGNIZED_SYNTHETIC_WRITE": "1",
                   "HEALTH_NODE": node, "HEALTH_RUNTIME": str(runtime)}
            with patch.dict(os.environ, env):
                session_context.set_session_vars(platform="mattermost", user_id="synthetic-owner", chat_id="synthetic-chat", profile="synthetic")
                self.addCleanup(session_context.reset_session_vars)
                tools = HealthTools.configured()
                reply = {"status": "partial_text", "engine": {"name": "pypdf", "version": "7.0.0"}, "pages": [
                    {"number": 1, "text": "SYNTHETIC-RESTORE-SENTINEL", "text_status": "text"},
                    {"number": 2, "text": "", "text_status": "no_text"}]}
                with patch.object(pdf_draft, "broker_request", return_value=reply):
                    draft = tools.call("pdf_draft", {"entry_id": row["entry_id"]})
                self.assertTrue(draft["ok"], draft)
                prepared = tools.call("recognized_prepare", {"draft_id": draft["draft_id"], "entry_id": row["entry_id"],
                                                          "expected_draft_sha256": draft["artifacts"][0]["sha256"]})
                self.assertTrue(prepared["ok"], prepared)
                old_id = prepared["proposal_id"]
                saved = json.loads(m.command_handler("confirm")(old_id))
                self.assertEqual(saved["state"], "saved_unverified")
                export = root / "snapshot"
                external = root / "external"
                export.mkdir(mode=0o700)
                external.mkdir(mode=0o700)
                source_paths = ["sources/manifest.json", row["stored_at"]]
                old_paths = [f"recognized/.machine-unverified/operations/{old_id}/artifact.md",
                             f"recognized/.machine-unverified/operations/{old_id}/metadata.json"]
                for relative in source_paths + old_paths:
                    fixtures.put(export / "workspace" / relative, (workspace / relative).read_bytes())
                state = root / "recognized-state"
                fixtures.put(export / "recognized-state" / f"{old_id}.recognized.json", (state / f"{old_id}.recognized.json").read_bytes())
                key = external / "key.bin"
                descriptor = external / "descriptor.json"
                fixtures.put(key, (state / ".recognized.key").read_bytes())
                fixtures.seal(export, descriptor, key)
                desc = json.loads(descriptor.read_bytes())
                desc["expected_owner"] = {"platform": "mattermost", "user_id": "synthetic-owner", "chat_id": "synthetic-chat", "profile": "synthetic"}
                desc["expected_runtime"] = m.runtime_identity(tools)
                fixtures.put(descriptor, fixtures.encode(desc))
                target = root / "new-map"
                target.mkdir(mode=0o700)
                for relative in source_paths:
                    fixtures.put(target / relative, (workspace / relative).read_bytes())
                for path in target.rglob("*"):
                    if path.is_dir():
                        os.chmod(path, 0o700)
                def stamp(folder):
                    return {str(p.relative_to(folder)): (p.stat().st_mode, p.stat().st_mtime_ns,
                            hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None) for p in folder.rglob("*")}
                before = stamp(export)
                batch = "f" * 32
                plan = lab.execute("plan", str(export), str(descriptor), str(key), str(target), batch, node, str(runtime))
                self.assertEqual(plan["batch_state"], "planned")
                self.assertFalse((target / ".restore-lab").exists())
                result = lab.execute("apply", str(export), str(descriptor), str(key), str(target), batch, node, str(runtime), plan["plan_sha256"])
                self.assertEqual(result["batch_state"], "sealed", result)
                intent = json.loads((target / ".restore-lab/intent.json").read_bytes())
                self.assertEqual(intent["batch_state"], "sealed")
                self.assertEqual(len(intent["mapping"]), 1)
                new_id = intent["mapping"][0]["new_id"]
                self.assertNotEqual(old_id, new_id)
                read = lab.core_run(node, runtime, "read", {"operation_id": new_id}, target)
                self.assertEqual(read["status"], "present_unverified")
                self.assertIn("SYNTHETIC-RESTORE-SENTINEL", read["text"])
                self.assertEqual(read["text"].encode(), (target / "recognized/.machine-unverified/operations" / new_id / "artifact.md").read_bytes())
                self.assertEqual(read["request_sha256"], intent["items"][0]["observation"]["request_sha256"])
                self.assertEqual(before, stamp(export))
                self.assertFalse((target / "recognized-state").exists())
                self.assertFalse((target / "sources/LOG.jsonl").exists())
                self.assertFalse(result["executable"])
                crash_results = {}
                for index, boundary in enumerate(("attempting_durable", "core_returned", "before_seal"), 1):
                    other = root / f"new-map-crash-{index}"
                    other.mkdir(mode=0o700)
                    for relative in source_paths:
                        fixtures.put(other / relative, (workspace / relative).read_bytes())
                    for path in other.rglob("*"):
                        if path.is_dir():
                            os.chmod(path, 0o700)
                    crash_batch = f"{index:032x}"
                    crash_plan = lab.execute("plan", str(export), str(descriptor), str(key), str(other), crash_batch, node, str(runtime))
                    pid = os.fork()
                    if pid == 0:
                        def kill_here(name):
                            if name == boundary:
                                os.kill(os.getpid(), signal.SIGKILL)
                        lab._checkpoint = kill_here
                        try:
                            lab.execute("apply", str(export), str(descriptor), str(key), str(other), crash_batch, node, str(runtime), crash_plan["plan_sha256"])
                        except Exception:
                            os._exit(4)
                        os._exit(5)
                    _, wait_status = os.waitpid(pid, 0)
                    self.assertTrue(os.WIFSIGNALED(wait_status) and os.WTERMSIG(wait_status) == signal.SIGKILL,
                                    f"fault boundary {boundary} was not reached: {wait_status}")
                    crashed = json.loads((other / ".restore-lab/intent.json").read_bytes())
                    self.assertNotEqual(crashed["batch_state"], "sealed")
                    if boundary == "attempting_durable":
                        with self.assertRaises(lab.Refusal):
                            lab.execute("reconcile", str(export), str(descriptor), str(key), str(other), crash_batch, node, str(runtime), crash_plan["plan_sha256"])
                        state_after = json.loads((other / ".restore-lab/intent.json").read_bytes())["batch_state"]
                        self.assertEqual(state_after, "held")
                    else:
                        recovered = lab.execute("reconcile", str(export), str(descriptor), str(key), str(other), crash_batch, node, str(runtime), crash_plan["plan_sha256"])
                        self.assertEqual(recovered["batch_state"], "sealed")
                        state_after = recovered["batch_state"]
                    self.assertFalse((other / "recognized-state").exists())
                    crash_results[boundary] = state_after
                self.assertEqual(before, stamp(export))
                print(json.dumps({"actual_core_save_read": "PASS", "new_id": new_id, "old_export_unchanged": True,
                                  "sealed": True, "receipt_replay": False, "index_activation": False,
                                  "sigkill_boundaries": crash_results}))


if __name__ == "__main__":
    unittest.main()
