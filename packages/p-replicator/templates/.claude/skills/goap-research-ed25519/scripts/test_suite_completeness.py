#!/usr/bin/env python3
"""
T-20 / D-21 (AM-14, ADR-006) — every `test_*.py` on disk is actually COLLECTED.

    cd .../goap-research-ed25519/scripts && python3 -m unittest discover -s . -p 'test_*.py' -v

Why this file exists: before slice C, `test_ed25519_verifier.py` — the security suite
of the module the slice edits — was named by NO run command anywhere. A report of
"full suite green" would have been true of the command and false of the code. A test
module that nothing runs is a file, not a check; this makes forgetting one fail BY
NAME instead of by omission.
"""

import glob
import os
import sys

sys.dont_write_bytecode = True

import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PATTERN = "test_*.py"


def _on_disk():
    return sorted(os.path.basename(p)[:-3] for p in glob.glob(os.path.join(HERE, PATTERN)))


def _collected():
    names = set()

    def walk(suite):
        for item in suite:
            if isinstance(item, unittest.TestSuite):
                walk(item)
            elif isinstance(item, unittest.loader._FailedTest):
                # A module discovery could not IMPORT is reported BY NAME, never
                # silently skipped — a gate that cannot run has cleared nothing.
                names.add(item.id().split(".")[-1])
            else:
                names.add(type(item).__module__)

    walk(unittest.TestLoader().discover(start_dir=HERE, pattern=PATTERN, top_level_dir=HERE))
    return sorted(names)


class SuiteCompletenessTests(unittest.TestCase):
    def test_discovery_collects_every_test_file_on_disk(self):
        on_disk = _on_disk()
        collected = _collected()
        missing = [name for name in on_disk if name not in collected]
        self.assertEqual(missing, [],
                         f"these modules exist but discovery does not collect them: {missing}")
        self.assertGreaterEqual(len(on_disk), 6, "the directory must still hold its test modules")

    def test_the_security_suite_of_the_edited_module_is_in_the_run(self):
        """The specific omission AM-14 caught, pinned by name so it cannot recur."""
        collected = _collected()
        for required in ("test_ed25519_verifier", "test_evidence_provenance", "test_goap_planner",
                         "test_signature_v3", "test_population_match", "test_quote_provenance",
                         "test_risk_absolute"):
            self.assertIn(required, collected)

    def test_no_enumerated_run_command_is_reintroduced(self):
        """ADR-006 D5's Monitoring clause: a SUITE command must be the discovery one,
        so a hand-kept module list can never drift from the directory.

        Scope, stated precisely: TWO OR MORE module names after `-m unittest` is an
        enumeration and fails. A single module (`python3 -m unittest test_x -v`) is a
        run-just-this-file hint, not a claim about the suite, and is allowed. This
        file is skipped — it is the checker, and its own prose describes the pattern.
        """
        offenders = []
        for name in sorted(os.listdir(HERE)):
            if not name.endswith((".py", ".md")) or name == os.path.basename(__file__):
                continue
            with open(os.path.join(HERE, name), encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
            for line in text.splitlines():
                if "-m unittest" not in line or "discover" in line:
                    continue
                modules = [token for token in line.split("-m unittest")[1].split()
                           if token.startswith("test_")]
                if len(modules) > 1:
                    offenders.append(f"{name}: {line.strip()}")
        self.assertEqual(offenders, [], f"enumerated run commands found: {offenders}")


if __name__ == "__main__":
    unittest.main()
