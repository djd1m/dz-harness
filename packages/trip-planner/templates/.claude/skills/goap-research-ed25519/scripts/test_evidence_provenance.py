#!/usr/bin/env python3
"""
ADR Confirmation tests for the evidence-provenance axis.

Every test here names the ADR property it proves. The three tamper tests are the
core: an evidence class that can be edited with a text editor is not evidence of
anything, and this feature would be decoration without them.

SUITE RUN — the ONE canonical command (ADR-006 / D-21), never an enumerated file list:

    cd .../goap-research-ed25519/scripts && python3 -m unittest discover -s . -p 'test_*.py' -v
"""

import sys

# Import NOTHING from this directory before this line. Running these tests used to
# leave a __pycache__ inside the skill directory, and this skill is vendored into 11
# copies kept byte-identical — so the stray directory read as canonical DRIFT and
# turned an unrelated repo test red. Bytecode caching buys nothing for a suite that
# runs in half a second; not writing it removes the failure mode entirely.
sys.dont_write_bytecode = True

import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

import ed25519_verifier as ev
import evidence_fetch as ef
import source_tiers as st
import check_report_evidence as gate


def _verifier():
    v = ev.Ed25519Verifier()
    v.generate_keypair()
    return v


def _pop():
    """A minimal VALID study population for tests whose subject is the EVIDENCE axis.

    Slice C made `study_population` a keyword-only argument with no default on all
    five factories (FR-1 / D-1), which by construction breaks every existing caller —
    that is the invariant working, not the invariant failing. These call sites are
    threaded explicitly rather than given a default, because a default would keep
    every recorded Confirmation green while deleting the guarantee.

    Deliberately a STATED population, not `unstated(...)`: a blanket `unstated`
    substitute would make every fact in this file read as "the paper never said",
    which is a different claim from "this test does not care".
    """
    return {
        "description": "adults enrolled in the cited cohort",
        "criteria": {
            "age": {"op": "range", "value": [18, 80], "kind": "eligibility",
                    "verbatim": "adults aged 18-80", "locator": "[Methods]"},
        },
    }


def _load_v1_fixture():
    """A GENUINE pre-axis record, replayed from the committed artifact.

    Since slice C, every `create_*` factory mints a v3 fact — so a test whose SUBJECT
    is a legacy record can no longer obtain one as a side effect of calling a
    constructor. It must load one (or build one deliberately, `_legacy_v1_fact`
    below). Retyping the expected schema number instead would keep the test green and
    quietly delete its subject.
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixture_legacy_v1_fact.json")
    with open(path, "r", encoding="utf-8") as handle:
        return ev.SignedFact.from_dict(json.load(handle)["fact"])


def _legacy_v1_fact(verifier, source_url, claim="c"):
    """Build a genuine v1 fact for a caller that needs a specific source_url.

    It carries no `evidence_class`, no `study_population` and no `schema_version`, and
    it is signed over `canonical_fact_message_v1` — the byte-frozen text (D-4). This
    is what the pre-slice `create_signed_fact` produced; the committed fixture is the
    same shape with a fixed URL.
    """
    fact = ev.SignedFact(
        claim=claim,
        source_url=source_url,
        source_hash=ev.hashlib.sha256(b"body").hexdigest(),
        issuer="researcher",
        issuer_pubkey=f"ed25519:{verifier.get_public_key_b64()}",
        signature="",
        timestamp="2026-08-03T12:16:18.191716Z",
        confidence=0.60,
        trust_class=ev.TRUST_CLASS_SELF_ATTESTED,
    )
    assert ev.fact_schema_version(fact) == 1, "the helper must produce a v1 fact, not a v3 one"
    fact.signature, _ = verifier.sign_content(ev.canonical_fact_message_v1(fact))
    return fact


def _authentic_record(**overrides):
    """A FetchRecord bearing this process's fetch witness.

    The test reaches into `evidence_fetch._FETCH_WITNESS` ON PURPOSE: these cases
    exercise SIGNATURE coverage, not fetch authenticity, and they must start from
    a record the API accepts. Authenticity itself is proven separately by
    `test_manual_path_cannot_mint_fetch_verified` (hand-built record REFUSED) and
    by the live local-server fetches in FetchTests.
    """
    base = dict(
        url="https://pubmed.ncbi.nlm.nih.gov/123",
        final_url="https://pubmed.ncbi.nlm.nih.gov/123",
        status=200,
        sha256_body="a" * 64,
        bytes_len=10,
        fetched_at="2026-08-03T10:00:00Z",
        witness=ef._FETCH_WITNESS,
    )
    base.update(overrides)
    return ef.FetchRecord(**base)


class EvidenceAxisTests(unittest.TestCase):
    """ADR-001 — the axis is ORTHOGONAL to trust_class."""

    def test_signed_but_asserted_is_expressible_and_gated(self):
        """ADR-001 Confirmation: ISSUER_SIGNED + ASSERTED must be REPRESENTABLE,
        verifiable as signed, and still refused by the report gate. Collapsing the
        two axes into one field would make this state impossible to say."""
        v = _verifier()
        fact = v.create_asserted_fact(claim="Testosterone recovers without refeeding", issuer="researcher",
                                    study_population=_pop())
        # Promote the trust axis while leaving the evidence axis untouched, then
        # re-sign: this is a legitimate actor asserting provenance of a record it
        # never read — the dangerous quadrant, and it must be expressible.
        fact.trust_class = ev.TRUST_CLASS_ISSUER_SIGNED
        fact.signature, _ = v.sign_content(ev.canonical_fact_message(fact))
        v.registry.add("researcher", v.get_public_key_b64())

        result = v.verify_fact(fact)
        self.assertTrue(result.verified, "the signature itself is sound — the axes are independent")
        self.assertEqual(fact.evidence_class, ev.EVIDENCE_ASSERTED)
        self.assertEqual(result.confidence, 0.0, "evidence ceiling wins over trust ceiling (weakest link)")

        report = "Conclusion: Testosterone recovers without refeeding, so no action is needed."
        findings, _ = gate.evaluate(report, [json.loads(fact.to_json())])
        self.assertTrue(findings, "a signed-but-unread claim must still be refused by the gate")
        self.assertEqual(findings[0].kind, "ASSERTED_IN_REPORT")

    def test_asserted_confidence_is_zero_not_low(self):
        v = _verifier()
        fact = v.create_asserted_fact(claim="X causes Y", study_population=_pop())
        self.assertEqual(fact.confidence, 0.0)
        self.assertEqual(ev.evidence_ceiling(ev.EVIDENCE_ASSERTED), 0.0)

    def test_legacy_fact_evidence_is_unknown_not_guessed(self):
        """A pre-axis fact must read as UNKNOWN — neither ASSERTED nor VERIFIED.

        SUBJECT RE-DERIVED IN SLICE C (AM-13, 04_domain_model.md §3.1), not nudged:
        this test used to CREATE its "legacy" fact with `create_signed_fact(...)`.
        Since FR-1 that call mints a **v3** fact, so a freshly created fact can no
        longer be a legacy one. Changing the expected `1` to `3` would have kept the
        test green and deleted its subject — a legacy RECORD. It is loaded instead.
        """
        v = _verifier()
        legacy = _load_v1_fixture()
        self.assertIsNone(legacy.evidence_class)
        self.assertIsNone(legacy.study_population, "a pre-axis fact states no population either")
        self.assertEqual(ev.fact_schema_version(legacy), 1)
        self.assertEqual(ev.evidence_ceiling(None), 1.0, "unknown contributes no ceiling of its own")
        self.assertTrue(v.verify_fact(legacy).verified)


class SignatureCoverageTests(unittest.TestCase):
    """ADR-002 — the evidence class is UNDER the signature; both tamper directions fail."""

    def setUp(self):
        self.v = _verifier()
        self.record = _authentic_record()

    def test_evidence_class_tamper_swap_fails(self):
        """Relabel LISTING_ONLY → FETCH_VERIFIED on a signed fact."""
        fact = self.v.create_listing_fact(claim="c", source_url="https://x.test", reason="offline run",
                                          study_population=_pop())
        self.assertTrue(self.v.verify_fact(fact).verified)
        fact.evidence_class = ev.EVIDENCE_FETCH_VERIFIED
        self.assertFalse(self.v.verify_fact(fact).verified, "swapping the class must break the signature")

    def test_evidence_class_tamper_strip_fails(self):
        """DOWNGRADE attack: remove the field so verification falls back to an older
        schema. What breaks it is that the signed text CONTAINS the evidence keys at
        all — not the schema marker (a discrimination run refuted that).

        THE MECHANISM CHANGED IN SLICE C, and the expected value with it (AM-13,
        04_domain_model.md §3.1). This fact is now **v3**: it carries an explicit
        `schema_version` and a `study_population`, so stripping `evidence_class` no
        longer makes it *look* legacy. It stays v3, with `evidence_class: null` inside
        the signed key set — and the signature still breaks, for a DIFFERENT reason
        than before (a changed value in the v3 text, not a fallback to the v1 text).
        The `3` below is that re-derivation, not a nudge to keep the test green.
        """
        fact = self.v.create_fetched_fact(claim="c", fetch_record=self.record, issuer="researcher",
                                          study_population=_pop())
        self.assertTrue(self.v.verify_fact(fact).verified)
        fact.evidence_class = None
        self.assertEqual(ev.fact_schema_version(fact), 3,
                         "a v3 fact does not fall back to v1 when evidence_class is stripped")
        self.assertFalse(self.v.verify_fact(fact).verified,
                         "…and the mutated v3 text must not match the signed one")

    def test_evidence_class_tamper_add_fails(self):
        """UPGRADE attack: bolt the field onto a legacy v1 fact.

        The subject is a LEGACY record, so it is loaded rather than created — since
        FR-1, `create_signed_fact` mints v3 (AM-13).
        """
        legacy = _load_v1_fixture()
        self.assertTrue(self.v.verify_fact(legacy).verified)
        legacy.evidence_class = ev.EVIDENCE_FETCH_VERIFIED
        self.assertEqual(ev.fact_schema_version(legacy), 2, "it now presents itself as v2…")
        self.assertFalse(self.v.verify_fact(legacy).verified, "…but adding the field must break a v1 signature")

    def test_fetch_date_and_source_date_are_also_covered(self):
        fact = self.v.create_fetched_fact(claim="c", fetch_record=self.record, issuer="researcher",
                                          source_date="2024-01-01", study_population=_pop())
        self.assertTrue(self.v.verify_fact(fact).verified)
        fact.fetch_date = "2099-01-01T00:00:00Z"
        self.assertFalse(self.v.verify_fact(fact).verified, "fetch_date is signed, not decorative")

    def test_v1_and_v2_messages_differ_for_identical_shared_fields(self):
        """The two schemas are distinguishable because v2 carries extra keys; the
        marker is self-description and the v3 growth point, not the protection."""
        fact = self.v.create_listing_fact(claim="c", source_url="https://x.test", reason="r",
                                          study_population=_pop())
        self.assertNotEqual(ev.canonical_fact_message_v1(fact), ev.canonical_fact_message_v2(fact))
        self.assertIn(ev.FACT_SCHEMA_V2, ev.canonical_fact_message_v2(fact))


class EarnedClassTests(unittest.TestCase):
    """ADR-003 — FETCH_VERIFIED requires an artifact only a real fetch produces."""

    def test_manual_path_cannot_mint_fetch_verified(self):
        """The load-bearing property: no manual route yields FETCH_VERIFIED."""
        v = _verifier()
        listing = v.create_listing_fact(claim="c", source_url="https://x.test", reason="hand-supplied body",
                                        study_population=_pop())
        asserted = v.create_asserted_fact(claim="c", study_population=_pop())
        self.assertEqual(listing.evidence_class, ev.EVIDENCE_LISTING_ONLY)
        self.assertEqual(asserted.evidence_class, ev.EVIDENCE_ASSERTED)

        # …and the constructor that CAN mint it refuses anything lacking proof.
        class NotAFetch:
            status = 200
            final_url = "https://x.test"
            # no sha256_body, no fetched_at
        with self.assertRaises(ValueError):
            v.create_fetched_fact(claim="c", fetch_record=NotAFetch(), issuer="researcher",
                                  study_population=_pop())

        # Forging it in the JSON is caught by the signature (ADR-002).
        forged = json.loads(listing.to_json())
        forged["evidence_class"] = ev.EVIDENCE_FETCH_VERIFIED
        self.assertFalse(v.verify_fact(ev.SignedFact.from_dict(forged)).verified)

    def test_non_2xx_fetch_is_refused_as_evidence(self):
        v = _verifier()
        error_page = _authentic_record(url="https://x.test", final_url="https://x.test", status=404)
        with self.assertRaises(ValueError):
            v.create_fetched_fact(claim="c", fetch_record=error_page, issuer="researcher",
                                  study_population=_pop())

    def test_listing_fact_demands_a_stated_reason(self):
        v = _verifier()
        with self.assertRaises(ValueError):
            v.create_listing_fact(claim="c", source_url="https://x.test", reason="  ",
                                  study_population=_pop())


class FetchTests(unittest.TestCase):
    """The network path itself — against a local server, never the internet."""

    @classmethod
    def setUpClass(cls):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                if self.path == "/ok":
                    body = b"hello evidence"
                    self.send_response(200)
                    self.send_header("Content-Type", "text/plain")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                elif self.path == "/redirect":
                    self.send_response(302)
                    self.send_header("Location", "/ok")
                    self.end_headers()
                elif self.path == "/big":
                    body = b"x" * 4096
                    self.send_response(200)
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                else:
                    self.send_response(404)
                    self.end_headers()

            def log_message(self, *args):  # silence
                pass

        cls.server = HTTPServer(("127.0.0.1", 0), Handler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def _url(self, path):
        return f"http://127.0.0.1:{self.port}{path}"

    def test_successful_fetch_produces_a_real_body_hash(self):
        import hashlib
        record = ef.fetch_source(self._url("/ok"), _allow_private=True)
        self.assertIsInstance(record, ef.FetchRecord)
        self.assertEqual(record.status, 200)
        self.assertEqual(record.sha256_body, hashlib.sha256(b"hello evidence").hexdigest())
        self.assertTrue(record.fetched_at.endswith("Z"))

    def test_redirect_is_followed_and_final_url_recorded(self):
        record = ef.fetch_source(self._url("/redirect"), _allow_private=True)
        self.assertIsInstance(record, ef.FetchRecord)
        self.assertTrue(record.final_url.endswith("/ok"))
        self.assertNotEqual(record.url, record.final_url)

    def test_oversize_body_is_refused_not_truncated(self):
        """A truncated body would hash to something no repeat fetch reproduces."""
        failure = ef.fetch_source(self._url("/big"), max_bytes=100, _allow_private=True)
        self.assertIsInstance(failure, ef.FetchFailure)
        self.assertIn("max_bytes", failure.reason)

    def test_404_is_a_named_failure_not_a_record(self):
        failure = ef.fetch_source(self._url("/missing"), _allow_private=True)
        self.assertIsInstance(failure, ef.FetchFailure)
        self.assertIn("404", failure.reason)

    def test_non_http_scheme_is_refused_before_io(self):
        """file:// would let a local read masquerade as network evidence."""
        failure = ef.fetch_source("file:///etc/passwd")
        self.assertIsInstance(failure, ef.FetchFailure)
        self.assertIn("scheme", failure.reason)

    def test_offline_degrades_to_listing_with_a_stated_reason(self):
        v = _verifier()
        failure = ef.fetch_source("http://127.0.0.1:1/unreachable", timeout=1, _allow_private=True)
        self.assertIsInstance(failure, ef.FetchFailure)
        fact = v.create_listing_fact(claim="c", source_url=failure.url, reason=failure.reason,
                                     study_population=_pop())
        self.assertEqual(fact.evidence_class, ev.EVIDENCE_LISTING_ONLY)
        self.assertIn("evidence_note", fact.metadata)


class SourceTierTests(unittest.TestCase):
    def test_known_domains_map_to_their_tier(self):
        self.assertEqual(st.classify_source("https://www.cochrane.org/x").tier, st.TIER_A)
        self.assertEqual(st.classify_source("https://pubmed.ncbi.nlm.nih.gov/123").tier, st.TIER_B)
        self.assertEqual(st.classify_source("https://www.medrxiv.org/y").tier, st.TIER_C)

    def test_unknown_domain_is_tier_d_not_an_exception(self):
        verdict = st.classify_source("https://some-blog.example/post")
        self.assertEqual(verdict.tier, st.TIER_D)
        self.assertFalse(verdict.known)

    def test_lookalike_domain_does_not_inherit_a_tier(self):
        """cochrane.org.evil.com must NOT read as tier A — suffix LABELS, not endswith."""
        self.assertEqual(st.classify_source("https://cochrane.org.evil.com/x").tier, st.TIER_D)

    def test_missing_source_date_is_flagged_not_waved_through(self):
        stale, reason = st.is_stale(None, kind="guideline")
        self.assertTrue(stale)
        self.assertIn("missing", reason)

    def test_old_source_is_stale_fresh_one_is_not(self):
        self.assertTrue(st.is_stale("2015-01-01", kind="guideline")[0])
        from datetime import datetime, timezone
        self.assertFalse(st.is_stale(datetime.now(timezone.utc).strftime("%Y-%m-%d"), kind="guideline")[0])


class ReportGateTests(unittest.TestCase):
    """FR-4 — the gate is an exit code, not advice."""

    def _fact(self, claim, evidence_class, url="https://x.test"):
        return {"claim": claim, "source_url": url, "evidence_class": evidence_class}

    def test_asserted_claim_used_in_report_fails(self):
        report = "The patient's metabolism recovered without fasting, so we proceed."
        facts = [self._fact("metabolism recovered without fasting", "ASSERTED")]
        findings, counts = gate.evaluate(report, facts)
        self.assertEqual(len(findings), 1)
        self.assertEqual(counts["ASSERTED"], 1)

    def test_asserted_fact_not_used_in_report_is_not_a_violation(self):
        report = "Unrelated content about iron saturation."
        facts = [self._fact("metabolism recovered without fasting", "ASSERTED")]
        findings, _ = gate.evaluate(report, facts)
        self.assertEqual(findings, [])

    def test_unmarked_listing_only_fails_marked_passes(self):
        claim = "transferrin saturation rose from 37 to 53 percent"
        unmarked = f"We note that {claim} over six months."
        marked = f"We note that {claim} (LISTING_ONLY: карточка не открывалась — перепроверьте)."
        facts = [self._fact(claim, "LISTING_ONLY")]
        self.assertEqual(len(gate.evaluate(unmarked, facts)[0]), 1)
        self.assertEqual(gate.evaluate(marked, facts)[0], [])

    def test_marker_far_from_the_claim_does_not_count(self):
        claim = "transferrin saturation rose from 37 to 53 percent"
        far = f"We note that {claim}." + ("filler. " * 200) + "LISTING_ONLY appendix note"
        findings, _ = gate.evaluate(far, [self._fact(claim, "LISTING_ONLY")])
        self.assertEqual(len(findings), 1, "a marker in the appendix does not warn the reader on page 2")

    def test_legacy_facts_are_counted_and_named_never_folded_into_clean(self):
        report = "Some claim about lipids appears here in the body of the report."
        facts = [{"claim": "Some claim about lipids", "source_url": "u"}]  # no evidence_class
        findings, counts = gate.evaluate(report, facts)
        self.assertEqual(findings, [])
        self.assertEqual(counts["UNKNOWN_LEGACY"], 1)
        self.assertIn("predate the evidence axis", gate.render(findings, counts))

    def test_paraphrased_claim_is_still_detected(self):
        claim = "omega-3 supplementation raised LDL cholesterol by forty percent"
        report = "Reported omega-3 supplementation figures show raised LDL cholesterol by roughly forty percent overall."
        findings, _ = gate.evaluate(report, [self._fact(claim, "ASSERTED")])
        self.assertEqual(len(findings), 1, "over-detection is preferred: a miss is silent, an alarm is arguable")

    def test_gate_cli_exit_codes(self):
        import tempfile, os
        with tempfile.TemporaryDirectory() as tmp:
            report_path = os.path.join(tmp, "r.md")
            facts_path = os.path.join(tmp, "f.json")
            with open(report_path, "w", encoding="utf-8") as fh:
                fh.write("The claim about iron overload appears in this report body.")
            with open(facts_path, "w", encoding="utf-8") as fh:
                json.dump([self._fact("claim about iron overload", "ASSERTED")], fh)
            self.assertEqual(gate.main(["--report", report_path, "--facts", facts_path]), 1)
            self.assertEqual(gate.main(["--report", report_path, "--facts", os.path.join(tmp, "nope.json")]), 2)




class HardeningTests(unittest.TestCase):
    """Findings from the cross-model QE round — each closed with its own test."""

    def test_qe1_hand_built_record_cannot_mint_fetch_verified(self):
        """A duck-typed record with four plausible attributes minted FETCH_VERIFIED
        without any network I/O. The record must be authentic, not merely shaped right."""
        v = _verifier()
        forged = ef.FetchRecord(
            url="https://pubmed.ncbi.nlm.nih.gov/1", final_url="https://pubmed.ncbi.nlm.nih.gov/1",
            status=200, sha256_body="c" * 64, bytes_len=5, fetched_at="2026-08-03T00:00:00Z",
        )  # constructed by hand → no witness
        self.assertFalse(forged.is_authentic())
        with self.assertRaises(ValueError) as ctx:
            v.create_fetched_fact(claim="c", fetch_record=forged, issuer="researcher",
                                  study_population=_pop())
        self.assertIn("fetch_source", str(ctx.exception))

        import types
        ns = types.SimpleNamespace(status=200, final_url="u", sha256_body="d" * 64, fetched_at="t")
        with self.assertRaises(ValueError):
            v.create_fetched_fact(claim="c", fetch_record=ns, issuer="researcher", study_population=_pop())

    def test_qe6_tier_ceiling_is_actually_applied_to_v2_facts(self):
        """The documented min(trust, evidence, tier) was not implemented — tier was
        never consulted, so an unknown-domain fact kept 0.60 instead of 0.40."""
        v = _verifier()
        unknown = v.create_listing_fact(claim="c", source_url="https://some-blog.example/p", reason="listing",
                                        study_population=_pop())
        self.assertEqual(v.verify_fact(unknown).confidence, 0.40, "tier D must cap below the 0.50 evidence ceiling")
        known = v.create_listing_fact(claim="c", source_url="https://www.cochrane.org/x", reason="listing",
                                      study_population=_pop())
        self.assertEqual(v.verify_fact(known).confidence, 0.50, "tier A leaves the evidence ceiling as the binding one")

    def test_qe6b_legacy_facts_are_not_retroactively_rescored(self):
        """Wiring a NEW ceiling must not change how OLD records score.

        This is the LOWER edge of D-20's bound (ADR-005): the tier ceiling applies
        from schema v2 **onward**, and v1 alone stays exempt. Its sibling
        `test_signature_v3.py::test_am15_tier_ceiling_applies_to_schema_3_facts` holds
        the upper edge. The fact is built as a genuine v1 record because every
        factory now mints v3 (AM-13).
        """
        v = _verifier()
        legacy = _legacy_v1_fact(v, "https://some-blog.example/p")
        self.assertEqual(ev.fact_schema_version(legacy), 1)
        self.assertEqual(v.verify_fact(legacy).confidence, 0.60, "a v1 fact keeps its original semantics")

    def test_qe16_frozen_v1_fixture_still_verifies(self):
        """Backward compatibility proven against a STORED artifact, not against the
        current implementation verifying its own current output — a regression that
        changed signing AND verification together would pass that weaker check."""
        import os
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixture_legacy_v1_fact.json")
        with open(path, "r", encoding="utf-8") as handle:
            fixture = json.load(handle)
        verifier = ev.Ed25519Verifier()
        fact = ev.SignedFact.from_dict(fixture["fact"])
        self.assertIsNone(fact.evidence_class, "the fixture is a genuine pre-axis fact")
        self.assertTrue(verifier.verify_fact(fact).verified, "a frozen v1 fact must verify forever")

    def test_qe2_empty_ledger_cannot_clear_a_report(self):
        """Passing an empty facts file made any medical report exit 0."""
        import tempfile, os
        with tempfile.TemporaryDirectory() as tmp:
            report = os.path.join(tmp, "r.md"); facts = os.path.join(tmp, "f.json")
            open(report, "w").write("Any claim at all appears in this report body.")
            json.dump([], open(facts, "w"))
            self.assertEqual(gate.main(["--report", report, "--facts", facts]), 2,
                             "an empty ledger is unevaluable, never clean")

    def test_qe3_tampered_fact_is_caught_by_the_gate_not_just_the_verifier(self):
        """Flipping a signed ASSERTED record to FETCH_VERIFIED in the JSON fooled the
        gate: it read evidence_class as an unsigned string and never verified."""
        v = _verifier()
        asserted = v.create_asserted_fact(claim="the IMEI ban was introduced in Turkey",
                                          study_population=_pop())
        forged = json.loads(asserted.to_json())
        forged["evidence_class"] = ev.EVIDENCE_FETCH_VERIFIED
        findings = gate.verify_ledger_signatures([forged])
        self.assertTrue(findings)
        self.assertEqual(findings[0].kind, "TAMPERED_FACT")

    def test_qe5_every_occurrence_needs_its_own_marker(self):
        claim = "transferrin saturation rose from 37 to 53 percent"
        text = (f"Early on we note that {claim} (LISTING_ONLY: не открывалась)." + " filler." * 120 +
                f" Later we repeat that {claim} without any warning at all.")
        findings, _ = gate.evaluate(text, [{"claim": claim, "source_url": "u", "evidence_class": "LISTING_ONLY"}])
        self.assertEqual(len(findings), 1, "one marked mention must not clear an unmarked one elsewhere")

    def test_qe4_short_and_numeric_paraphrase_is_detected(self):
        """`LDL rose 40%` vs `LDL increased 40%` shares the number, not long words."""
        claim = "LDL rose 40% on the higher dose"
        report = "In that arm LDL increased 40% on the higher dose, which we consider material."
        findings, _ = gate.evaluate(report, [{"claim": claim, "source_url": "u", "evidence_class": "ASSERTED"}])
        self.assertEqual(len(findings), 1)

    def test_qe4b_claim_wrapped_across_lines_is_detected(self):
        claim = "transferrin saturation above 45 percent warrants attention in men"
        report = "We note transferrin saturation\nabove 45 percent warrants\nattention in men here."
        findings, _ = gate.evaluate(report, [{"claim": claim, "source_url": "u", "evidence_class": "ASSERTED"}])
        self.assertEqual(len(findings), 1, "markdown wrapping must not hide a claim from the gate")

    def test_qe9_unrecognised_evidence_class_is_a_violation_not_legacy(self):
        claim = "iron overload warrants HFE testing in this context"
        report = f"Our position: {claim}, pending review."
        findings, counts = gate.evaluate(report, [{"claim": claim, "source_url": "u", "evidence_class": "ASSERTED "}])
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].kind, "UNRECOGNISED_EVIDENCE_CLASS")

    def test_qe9b_malformed_ledger_entry_refuses_evaluation(self):
        import tempfile, os
        with tempfile.TemporaryDirectory() as tmp:
            report = os.path.join(tmp, "r.md"); facts = os.path.join(tmp, "f.json")
            open(report, "w").write("body")
            json.dump([{"claim": "ok", "evidence_class": "ASSERTED"}, "not-an-object"], open(facts, "w"))
            self.assertEqual(gate.main(["--report", report, "--facts", facts]), 2)

    def test_qe8_ssrf_private_addresses_are_refused(self):
        for url in ("http://127.0.0.1/x", "http://localhost/x", "http://169.254.169.254/latest/meta-data/",
                    "http://10.0.0.1/x", "http://192.168.1.1/x"):
            failure = ef.fetch_source(url, timeout=2)
            self.assertIsInstance(failure, ef.FetchFailure, f"{url} must be refused")
            self.assertIn("non-public", failure.reason)

    def test_qe12_unbounded_max_bytes_is_refused(self):
        failure = ef.fetch_source("https://example.com/", max_bytes=10 ** 12)
        self.assertIsInstance(failure, ef.FetchFailure)
        self.assertIn("max_bytes", failure.reason)

    def test_qe11_malformed_urls_return_named_failures_not_exceptions(self):
        for url in ("http://[::1", "http://exa mple.com/x", "http://host:notaport/x", "notaurl"):
            result = ef.fetch_source(url, timeout=2)
            self.assertIsInstance(result, ef.FetchFailure, f"{url!r} must degrade, not raise")

    def test_qe13_non_http_scheme_gets_no_tier(self):
        self.assertEqual(st.classify_source("file://who.int/etc/passwd").tier, st.TIER_D)

    def test_qe14_future_dated_source_is_flagged(self):
        stale, reason = st.is_stale("2099-01-01", kind="guideline")
        self.assertTrue(stale)
        self.assertIn("future", reason)


class _BridgeHarness:
    """The fixture the bridge tests share: one temporary CWD per test, and a fake `dz`
    that keeps each project's store as a real file on disk."""

    def setUp(self):
        import os
        import tempfile
        import learning_bridge as lb
        self.lb = lb
        # teach() resolves BOTH stores from the CWD, so these tests must not run in the
        # skill directory: _protect_brain would create a real `.health-brain/` inside a
        # package that is vendored into 11 byte-identical copies, which is the same class
        # of accident as the __pycache__ this file's header describes.
        self._cwd = os.getcwd()
        self._tmp = tempfile.TemporaryDirectory()
        os.chdir(self._tmp.name)

    def tearDown(self):
        import os
        os.chdir(self._cwd)
        self._tmp.cleanup()

    def _store_rows(self, project):
        """The rows a fake store holds for one project — read from disk, as the mock
        wrote them."""
        import json as _json
        import os
        path = os.path.join(project, ".dz", "memory", "patterns.jsonl")
        try:
            with open(path, encoding="utf-8") as handle:
                return [_json.loads(line) for line in handle if line.strip()]
        except OSError:
            return []

    def _fake_store(self, honours_project=True, calls=None):
        """A mock dz that keeps each store as a REAL FILE at
        `<project>/.dz/memory/patterns.jsonl`.

        ROUND 17 CHANGED THIS ON PURPOSE. The previous mock held one in-memory list and
        ignored `--project` on reads, so every store was the same store — which is
        precisely the condition finding 7 is about, and a mock that is permanently in
        that condition cannot tell it apart from a healthy one. Writing files means
        aliasing is REAL: if two `--project` paths resolve to the same directory (a
        symlink at any depth, a bind mount), they are one store here exactly as they
        would be for the real CLI, with no modelling assumption in between.

        `honours_project=False` simulates the older CLI that accepts `--project` and
        writes from the current directory anyway: the brain never grows.
        """
        import json as _json
        import os
        root = os.path.realpath(os.getcwd())
        counter = {"n": 0}

        def path_for(project):
            return os.path.join(project, ".dz", "memory", "patterns.jsonl")

        def read(project):
            return self._store_rows(project)

        def write(project, rows):
            path = path_for(project)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as handle:
                for row in rows:
                    handle.write(_json.dumps(row) + "\n")

        def run(args, **kwargs):
            args = list(args)
            if calls is not None:
                calls.append(list(args))
            project = args[args.index("--project") + 1] if "--project" in args else root
            if args and args[0] == "teach":
                target = project if honours_project else root
                counter["n"] += 1
                write(target, read(target) + [{"dzId": f"id:{counter['n']}",
                                               "pattern": args[1],
                                               "domain": "health-research"}])
                return 0, "taught", ""
            if args and args[0] == "recall" and "--forget" in args:
                dz_id = args[args.index("--forget") + 1]
                write(project, [r for r in read(project) if r.get("dzId") != dz_id])
                return 0, "forgotten", ""
            # Since round 15 the canary is looked up BY ITS OWN TEXT, so the mock has to
            # answer that question rather than only report a count.
            if args and "--usage" in args:
                return 0, _json.dumps({"top": read(project)}), ""
            if args and args[0] == "recall":
                return 0, f"dz recall --all --stats  —  {len(read(project))} learned pattern(s)", ""
            return 0, "", ""

        return run


class LearningBridgeTests(_BridgeHarness, unittest.TestCase):
    """Slice H — the loop, after the design changed.

    THE HISTORY MATTERS, because these tests are much smaller than the ones they
    replaced and that is the point. The earlier version of learning_bridge.py tried to
    decide FROM THE TEXT whether a lesson described a method or a person. Seven rounds
    of independent cross-model review graded it F and the finding count never converged
    (11, 10, 5, 3, 6, 6, 8): the question is about meaning, so every pattern answering
    it failed in both directions — admitting `patient McDonald has HIV` while refusing
    `apoB`, and refusing a legitimate Chinese lesson for "a capitalised word".

    The work is now split by nature. FORMAT is checked here (identifiers have a shape).
    MEANING is judged by the agent, per the protocol in SKILL.md. The GUARANTEE is the
    export hold-out, tested on the TypeScript side where it lives.
    """

    # ------------------------------------------------------------ format: blocking

    def test_formatted_identifiers_are_refused_in_any_script(self):
        """These have a FORMAT, which is the one thing a regex is reliable about."""
        for leak in (
            "contact me at a.b@clinic.org",
            "MRN 84729163 note",
            "passport ab1234567 identifies the holder",
            "passport ab::1234567 identifies the holder",   # a RUN of joiners
            "passport αβ—1234567 identifies the holder",    # any script
            "trial NCT04368728 enrolled a cohort",
        ):
            with self.subTest(leak=leak):
                self.assertFalse(self.lb.check_lesson(leak).ok, leak)

    def test_a_threshold_is_not_an_identifier(self):
        """Measured false positives from the review, kept as regressions: a comparison
        operator marks a threshold, and four digits is a year."""
        for good in (
            "hcg>10000 warrants confirmation",
            "prefer pre-2020 baselines for longitudinal comparisons",
            "a cohort of 1200000 people shifted the estimate",
        ):
            with self.subTest(good=good):
                self.assertTrue(self.lb.check_lesson(good).ok, good)

    def test_the_check_no_longer_judges_MEANING_and_says_so(self):
        """The load-bearing change. `patient McDonald has HIV` is NOT refused here —
        not because it is acceptable, but because this layer cannot tell. Pretending it
        could was the defect. SKILL.md addresses that question to the agent, which can
        read meaning and is already running."""
        verdict = self.lb.check_lesson("patient McDonald has HIV")
        self.assertTrue(verdict.ok, "the format check passes it — meaning is not its job")
        self.assertIn("does not know whether the sentence describes a method or a person",
                      verdict.note)

    def test_lessons_in_any_language_pass_the_format_check(self):
        """A round refused this exact Chinese lesson for containing "a capitalised
        word", which is meaningless for Han script."""
        for good in ("检查 研究人群 再外推结论", "общий тестостерон нечитаем без ГСПГ",
                     "measure apoB before interpreting risk"):
            with self.subTest(good=good):
                self.assertTrue(self.lb.check_lesson(good).ok, good)

    def test_a_number_is_a_NOTICE_not_a_refusal(self):
        """A number may be knowledge (a guideline threshold) or a reading from one
        person. Only the second is a problem and only a reader can tell, so the check
        observes it out loud instead of guessing."""
        verdict = self.lb.check_lesson("transferrin saturation above 45% warrants attention")
        self.assertTrue(verdict.ok)
        self.assertTrue(any("is it knowledge" in n for n in verdict.notices))

    def test_ONE_digit_predicate(self):
        """`isdigit` alone misses `²` and Roman numerals; a round found the two halves
        of this file disagreeing about the word "digit"."""
        self.assertTrue(self.lb._has_digit("threshold is ²"))
        self.assertTrue(self.lb._has_digit("Ⅻ"))
        self.assertFalse(self.lb._has_digit("no numbers here"))

    def test_an_empty_lesson_is_refused(self):
        self.assertFalse(self.lb.check_lesson("").ok)
        self.assertFalse(self.lb.check_lesson("   ").ok)

    def test_round8_identifier_formats_that_got_through(self):
        """Every one of these was probed by review and returned ok=True."""
        for leak in (
            'contact "john..doe"@example.com for escalation',   # quoted local part

            "call +44/20/7946/0958 before the draw",             # slash separators
            "medical-record number 84729163 belongs to the subject",  # hyphenated vocabulary
            "accession 1234567AB identifies the specimen",       # digits BEFORE letters
            "accession AB_1234567 identifies the specimen",      # underscore is a word char
        ):
            with self.subTest(leak=leak):
                self.assertFalse(self.lb.check_lesson(leak).ok, leak)

    def test_a_two_group_number_is_NOT_classified(self):
        """`555-1234` and `500-1000` are the SAME SHAPE. An earlier pass refused both as
        phones, which broke `sample 500-1000 records`; refusing neither is the honest
        resolution, and it is stated rather than hidden. Three or more groups (a card
        number, a full phone) is a different shape and is still caught."""
        self.assertTrue(self.lb.check_lesson("call 555-1234 before the draw").ok)
        self.assertTrue(self.lb.check_lesson("sample 500-1000 records for manual validation").ok)
        self.assertFalse(self.lb.check_lesson("card 4111 1111 1111 1111 belongs to the patient").ok)

    def test_unicode_dashes_and_fullwidth_cannot_launder_a_format(self):
        """U+2011 folds to U+2010 under NFKC, not to ASCII `-`, so a vocabulary pattern
        written in ASCII missed `medical‑record number 84729163`."""
        self.assertFalse(self.lb.check_lesson("medical\u2011record number 84729163 belongs to the subject").ok)
        # Dashes fold by Unicode CATEGORY, so the ones I never listed fold too.
        self.assertFalse(self.lb.check_lesson("medical\u058arecord number 84729163 belongs to the subject").ok)
        self.assertFalse(self.lb.check_lesson("medical\u2e3arecord number 84729163 belongs to the subject").ok)
        # A word beside a long number is a QUANTITY, whatever its case. `NCT 04368728`
        # and `PCR 100000 reads per sample` are the SAME SHAPE — an upper-case token, a
        # space, a long number — so neither is classified. Refusing both broke a real
        # method lesson; refusing neither is the honest position, stated in the code.
        self.assertTrue(self.lb.check_lesson("in a cohort of 123456789 people, stratify first").ok)
        self.assertTrue(self.lb.check_lesson("PCR 100000 reads per sample should trigger review").ok)
        self.assertTrue(self.lb.check_lesson("trial NCT 04368728 enrolled a cohort").ok)
        # A dilution series has a two-digit group and is not a phone.
        self.assertTrue(self.lb.check_lesson("use a 1000-100-10 dilution series to test linearity").ok)

    def test_round8_legitimate_lessons_that_were_wrongly_refused(self):
        """The other half of the same finding: the phone pattern matched any run of nine
        digits, and the medical-record vocabulary fired on the PHRASE with no value."""
        for good in (
            "in a cohort of 123456789 people, stratify before extrapolating",
            "audit medical record number quality before dataset linkage",
        ):
            with self.subTest(good=good):
                self.assertTrue(self.lb.check_lesson(good).ok, good)

    def test_round8_the_docstring_no_longer_describes_the_deleted_guard(self):
        """Review found the module docstring still promising that check_lesson refuses
        patient-shaped text, enforces no digits and lower case. Stale prose about a
        safety property is a defect with no stack trace, so it gets a test."""
        doc = self.lb.__doc__ or ""
        self.assertIn("does NOT decide whether a lesson describes a method or a person", doc)
        self.assertNotIn("REFUSES the second shape", doc)
        # …and the docstring's own former bad example is indeed accepted now.
        self.assertTrue(self.lb.check_lesson(
            "the patient has fasted 3 days weekly for 7 years, testosterone 8.04").ok)

    # ------------------------------------------------------- meaning: the human gate

    def test_teach_REFUSES_without_an_explicit_confirmation(self):
        """The meaning check cannot be performed by this file, so it is not faked: the
        caller asserts it followed the protocol, and without that assertion nothing is
        written. The refusal restates the protocol rather than just saying no."""
        code, message = self.lb.teach("total testosterone is uninterpretable without SHBG")
        self.assertEqual(code, 1)
        self.assertIn("NOT RECORDED", message)
        self.assertIn("Write the RULE it taught", message)

    def test_confirmation_cannot_override_a_formatted_identifier(self):
        """--confirm-method asserts a judgement about MEANING. It has no authority over
        format: an email address is an identifier whatever anyone confirms."""
        code, message = self.lb.teach("write to a.b@clinic.org", confirmed=True)
        self.assertEqual(code, 1)
        self.assertIn("REFUSED", message)

    def test_a_confirmed_lesson_is_written_and_the_notices_travel_with_it(self):
        calls = []
        original = self.lb._run_dz
        self.lb._run_dz = self._fake_store(calls=calls)
        try:
            code, message = self.lb.teach("saturation above 45% warrants a repeat draw", confirmed=True)
            self.assertEqual(code, 0)
            self.assertIn("confirmed by the caller", message)
            self.assertIn("NOTICED", message, "the number observation is still reported")
            real = [c for c in calls if c and c[0] == "teach"
                    and not c[1].startswith(self.lb._CANARY_TEXT)]
            self.assertEqual(len(real), 1)
            self.assertIn("--domain", real[0])
            self.assertIn(self.lb.LEARNING_DOMAIN, real[0])
        finally:
            self.lb._run_dz = original
    def test_the_note_never_claims_to_have_checked_meaning(self):
        """The sentence that replaced a promise the code could not keep."""
        note = self.lb.check_lesson("a lesson about companion tests").note
        self.assertIn("That is all this check can tell you", note)
        self.assertNotIn("safe", note.lower())

    # ------------------------------------------------- ADR-004: the separate store

    def test_teach_writes_ONLY_to_the_health_brain(self):
        """A store that never receives the data cannot hand it out from any command.

        The assertion is about WRITES. Round 17 added a READ of the shared store — the
        canary must be absent from it — so "every call is scoped to the brain" is no
        longer the right shape of the promise, and asserting it would have made the
        finding-7 fix look like a regression. Reading the shared store is what recall
        has always done; what must never happen is a `teach` aimed anywhere else."""
        calls = []
        original = self.lb._run_dz
        self.lb._run_dz = self._fake_store(calls=calls)
        try:
            code, _ = self.lb.teach("a method lesson about fasting windows", confirmed=True)
            self.assertEqual(code, 0)
        finally:
            self.lb._run_dz = original
        writes = [c for c in calls if c and c[0] == "teach"]
        self.assertTrue(writes, "something was written")
        for call in writes:
            self.assertIn("--project", call, call)
            self.assertIn(self.lb.HEALTH_BRAIN_DIRNAME, call[call.index("--project") + 1])
        # …and nothing at all was written to the shared store.
        import os
        self.assertEqual(self._store_rows(os.path.realpath(os.getcwd())), [])
    def test_teach_FAILS_LOUDLY_when_the_write_did_not_land_in_the_brain(self):
        """An older CLI accepts --project on a write and ignores it, returning 0."""
        original = self.lb._run_dz
        self.lb._run_dz = self._fake_store(honours_project=False)
        try:
            code, message = self.lb.teach("a method lesson", confirmed=True)
        finally:
            self.lb._run_dz = original
        self.assertEqual(code, 1)
        self.assertIn("does not honour --project", message)

    def test_round14_the_canary_cleanup_uses_an_ID_not_the_text(self):
        """`--forget` takes dzIds. The first version passed the canary TEXT, so the probe
        stayed in the brain forever — and the suite blessed it, because the mock returned
        success for `forget`. Caught by RUNNING the flow, which is why this test asserts
        the SHAPE of the cleanup call rather than that it returned 0."""
        calls = []
        original = self.lb._run_dz
        canary = f"{self.lb._CANARY_TEXT} [deadbeef1234]"

        def run(args, **kwargs):
            calls.append(list(args))
            if args and args[0] == "teach":
                return 0, "taught", ""
            if args and "--usage" in args:
                import json as _json
                return 0, _json.dumps({"top": [{"dzId": "teach:abc123", "pattern": canary,
                                                "domain": "health-research"}]}), ""
            if args and args[0] == "recall" and "--forget" in args:
                return 0, "forgotten", ""
            return 0, "dz recall --all --stats  —  1 learned pattern(s)", ""

        self.lb._run_dz = run
        try:
            self.lb._forget_canary("/tmp/whatever/.health-brain", canary)
        finally:
            self.lb._run_dz = original
        forgets = [c for c in calls if "--forget" in c]
        self.assertEqual(len(forgets), 1)
        target = forgets[0][forgets[0].index("--forget") + 1]
        self.assertEqual(target, "teach:abc123", "forget by dzId, never by text")
        self.assertNotIn(canary, forgets[0])

    def test_round14_the_CANARY_is_written_before_the_real_lesson(self):
        """The ORDERING is the fix. Counting around the real write detected the leak only
        after permitting it — "fails closed" described the return status, not the
        mutation. Now a harmless probe pays that cost instead of a patient's finding."""
        calls = []
        original = self.lb._run_dz
        self.lb._run_dz = self._fake_store(honours_project=False, calls=calls)
        try:
            self.lb.teach("a method lesson about fasting windows", confirmed=True)
        finally:
            self.lb._run_dz = original
        teaches = [c for c in calls if c and c[0] == "teach"]
        self.assertTrue(teaches, "something was written")
        self.assertTrue(teaches[0][1].startswith(self.lb._CANARY_TEXT),
                        "the FIRST write is the canary")
        self.assertTrue(all(c[1].startswith(self.lb._CANARY_TEXT) for c in teaches),
                        "the real lesson is NEVER written when routing is broken")
    def test_recall_reads_BOTH_stores_and_only_one_of_them_is_written(self):
        """One-way transfer: engineering lessons flow INTO this work, medical ones never
        leave. Two calls out, one of them scoped to the health brain."""
        calls = []
        original = self.lb._run_dz

        def record(args, **kw):
            calls.append(list(args))
            return 0, 'dz recall "x"  —  1 hit(s)\n  [0.90] (d) a lesson', ""

        self.lb._run_dz = record
        try:
            out = self.lb.recall("fasting")
        finally:
            self.lb._run_dz = original
        self.assertEqual(len(calls), 2, "the health brain and the shared brain")
        scoped = [c for c in calls if "--project" in c]
        self.assertEqual(len(scoped), 1, "exactly one call is scoped to the health brain")
        self.assertIn(self.lb.HEALTH_BRAIN_DIRNAME, scoped[0][scoped[0].index("--project") + 1])
        self.assertIn("health brain", out)
        self.assertIn("never leave the health brain", out)

    def test_status_names_both_stores_and_the_direction(self):
        original = self.lb._run_dz
        self.lb._run_dz = lambda *a, **k: (0, "dz recall --all --stats  —  7 learned pattern(s)", "")
        try:
            out = self.lb.status()
        finally:
            self.lb._run_dz = original
        self.assertIn("health brain", out)
        self.assertIn("shared brain", out)
        self.assertIn("WRITTEN ONLY to the health brain", out)

    # ------------------------------------------------------------------ round 11

    def test_round11_a_NESTED_dz_symlink_is_refused(self):
        """Resolving only `.health-brain` missed `ln -s ../.dz .health-brain/.dz`: the
        parent resolved distinctly while the directory dz actually writes to WAS the
        shared store. The path that matters is the one that receives the data."""
        import os
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            os.makedirs(os.path.join(tmp, ".dz"))
            os.makedirs(os.path.join(tmp, self.lb.HEALTH_BRAIN_DIRNAME))
            os.symlink(os.path.join(tmp, ".dz"),
                       os.path.join(tmp, self.lb.HEALTH_BRAIN_DIRNAME, ".dz"))
            distinct, message = self.lb._health_brain_is_distinct(tmp)
            self.assertFalse(distinct)
            self.assertIn("shared store", message)

    def test_round11_a_failing_health_store_is_NOT_diagnosed_as_an_old_cli(self):
        """`--domain` goes to the health call alone, so judging the capability on the
        MERGED output blamed an old CLI whenever the health store failed — a confident
        diagnosis of the wrong thing, which is worse than silence."""
        original = self.lb._run_dz

        def half(args, **kw):
            if "--project" in args:
                return 1, "", "health corrupt"
            return 0, 'dz recall "x"  —  1 hit(s)\n  [0.90] (qe) a shared lesson', ""

        self.lb._run_dz = half
        try:
            out = self.lb.recall("x")
        finally:
            self.lb._run_dz = original
        self.assertIn("health brain UNAVAILABLE", out)
        self.assertNotIn("predates", out)

    def test_round11_a_failing_SHARED_store_is_named_too(self):
        """Reporting only when BOTH fail swallowed half the loop silently."""
        original = self.lb._run_dz

        def half(args, **kw):
            if "--project" in args:
                return 0, 'dz recall "x"  —  1 hit(s)\n  [0.90] (health-research) h', ""
            return 1, "", "shared corrupt"

        self.lb._run_dz = half
        try:
            out = self.lb.recall("x")
        finally:
            self.lb._run_dz = original
        self.assertIn("shared brain unavailable", out)

    def test_round11_identifier_and_quantity_boundary(self):
        """Both halves of one finding: formats that got through, and magnitudes that
        were wrongly refused."""
        for leak in ('"john@doe"@example.com is the contact', "MRN № 84729163 note",
                     "MRN = 84729163 note", "medical record number is 84729163",
                     "call +44/20/7946/0958 before the draw"):
            with self.subTest(leak=leak):
                self.assertFalse(self.lb.check_lesson(leak).ok, leak)
        for good in ("use a 100000-fold dilution to test linearity",
                     "amplify DNA×100000 before sequencing",
                     "test concentration steps +1 / 2 / 3 / 4 before fitting"):
            with self.subTest(good=good):
                self.assertTrue(self.lb.check_lesson(good).ok, good)

    # ------------------------------------------------------------------ round 12

    def test_round12_the_brain_is_SELF_IGNORING_for_git(self):
        """The monorepo .gitignore rule shipped with nothing: a consumer got a plaintext
        medical store one `git add -A` from a push, while the ADR promised protection
        from exactly that. A `.gitignore` holding `*` inside the directory needs no
        cooperation from the project and travels with the directory."""
        import os
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            brain = os.path.join(tmp, self.lb.HEALTH_BRAIN_DIRNAME)
            self.lb._protect_brain(brain)
            marker = os.path.join(brain, ".gitignore")
            self.assertTrue(os.path.exists(marker))
            self.assertIn("*", open(marker, encoding="utf-8").read())
            # A deliberate edit is preserved — as long as it STILL IGNORES. Round 14
            # showed the earlier rule accepted any regular file, so an empty or unrelated
            # .gitignore satisfied the check while ignoring nothing.
            with open(marker, "w", encoding="utf-8") as handle:
                handle.write("# my own note\n*\n")
            self.lb._protect_brain(brain)
            self.assertEqual(open(marker, encoding="utf-8").read(), "# my own note\n*\n")

    def test_round14_an_ignore_file_that_ignores_NOTHING_is_refused(self):
        """Presence is not validity, one level up from where round 13 fixed it: the
        directory case was closed and the case that actually happens — a pre-existing or
        hand-edited file with no rule in it — was left open."""
        import os
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            brain = os.path.join(tmp, self.lb.HEALTH_BRAIN_DIRNAME)
            os.makedirs(brain)
            for content in ("", "# just a comment\n", "*.log\n"):
                with open(os.path.join(brain, ".gitignore"), "w", encoding="utf-8") as handle:
                    handle.write(content)
                with self.subTest(content=content), self.assertRaises(RuntimeError):
                    self.lb._protect_brain(brain)

    def test_round12_the_write_check_opts_INTO_the_domain_it_counts(self):
        """The verification defeated itself: `recall --all` applies the export hold-out,
        which withholds this very domain, so a health-only brain read 0 before AND 0
        after a successful write. A check built on another safety measure must account
        for that measure."""
        calls = []
        original = self.lb._run_dz
        self.lb._run_dz = self._fake_store(calls=calls)
        try:
            code, _ = self.lb.teach("a method lesson", confirmed=True)
            self.assertEqual(code, 0)
        finally:
            self.lb._run_dz = original
        counts = [c for c in calls if "--stats" in c]
        self.assertTrue(counts, "the write is verified by counting")
        for call in counts:
            self.assertIn("--include-domain", call)
            self.assertIn(self.lb.LEARNING_DOMAIN, call)
    def test_round12_identifier_formats(self):
        for leak in ("MRN, 84729163 belongs to the subject",
                     'contact "john"@[192.0.2.1] before the draw'):
            with self.subTest(leak=leak):
                self.assertFalse(self.lb.check_lesson(leak).ok, leak)

    # ------------------------------------------------------------------ round 13

    def test_round13_a_store_symlinked_OUT_of_the_brain_is_refused(self):
        """Comparing against OUR project let `ln -s ../../B/.dz A/.health-brain/.dz`
        through: B's shared store is not A's, so the check passed while the lesson landed
        in another project's store — and the count then grew THERE and confirmed success.
        Containment is one question with one answer, not a list of forbidden places."""
        import os
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            a = os.path.join(tmp, "A")
            b = os.path.join(tmp, "B")
            os.makedirs(os.path.join(a, self.lb.HEALTH_BRAIN_DIRNAME))
            os.makedirs(os.path.join(b, ".dz"))
            os.symlink(os.path.join(b, ".dz"),
                       os.path.join(a, self.lb.HEALTH_BRAIN_DIRNAME, ".dz"))
            distinct, message = self.lb._health_brain_is_distinct(a)
            self.assertFalse(distinct)
            self.assertIn("OUTSIDE the brain", message)

    def test_round13_verification_FAILS_CLOSED_when_it_cannot_count(self):
        """An unreadable brain is not evidence the write landed."""
        original = self.lb._run_dz
        self.lb._run_dz = lambda args, **kw: (
            (1, "", "unreadable") if args and args[0] == "recall" else (0, "taught", "")
        )
        try:
            code, message = self.lb.teach("a method lesson", confirmed=True)
        finally:
            self.lb._run_dz = original
        self.assertEqual(code, 1)
        self.assertIn("REFUSED", message)
    def test_round13_a_brain_without_its_ignore_rule_is_REFUSED(self):
        """ADR-004 promises protection from a routine `git add -A`. Swallowing the
        failure to write the ignore rule left a plaintext medical store staged by the
        next one while the write reported success — a promise kept in prose only."""
        import os
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            brain = os.path.join(tmp, self.lb.HEALTH_BRAIN_DIRNAME)
            os.makedirs(brain)
            # A directory where the ignore FILE should be: opening it for write raises.
            os.makedirs(os.path.join(brain, ".gitignore"))
            with self.assertRaises(RuntimeError):
                self.lb._protect_brain(brain)

    def test_round13_identifier_separators_are_not_enumerated(self):
        for leak in ("MRN. 84729163 belongs to the subject",
                     "MRN; 84729163 belongs to the subject",
                     "medical record number / 84729163 belongs to the subject",
                     ):
            with self.subTest(leak=leak):
                self.assertFalse(self.lb.check_lesson(leak).ok, leak)
        self.assertTrue(self.lb.check_lesson(
            "audit medical record number quality before dataset linkage").ok)
        # ROUND 15: a run of two-digit groups is NO LONGER classified. `01 42 68 53 00`
        # (a French phone) and `10 20 30 40 50 weeks` (a time course) are the same shape;
        # a unit LIST missed `weeks` and inverting it to "any following word" matched
        # `before`. Neither is classified, consistently with 555-1234 and NCT/PCR.
        self.assertTrue(self.lb.check_lesson("call 01 42 68 53 00 before the draw").ok)
        self.assertTrue(self.lb.check_lesson("measure at 10 20 30 40 50 weeks").ok)
        # A grouped card number is still caught, by the three-groups-of-three branch.
        self.assertFalse(self.lb.check_lesson("card 4111 1111 1111 1111 belongs").ok)

    # --------------------------------------------------------------- dz integration

    def test_absent_dz_is_a_NOTE_never_a_failure(self):
        original = self.lb.dz_path
        self.lb.dz_path = lambda: None
        try:
            self.assertIn("self-learning is OFF", self.lb.status())
            code, message = self.lb.teach("a method lesson", confirmed=True)
            self.assertEqual(code, 0, "an optional dependency must never break the package")
            self.assertIn("harness-cli", message)
        finally:
            self.lb.dz_path = original

    def test_older_cli_is_detected_by_CAPABILITY_not_by_exit_code(self):
        """The previous dz did NOT reject --domain: it ignored the flag and exited 0, so
        an exit-code test could never fire. The observable difference is the boost note."""
        original = self.lb._run_dz
        self.lb._run_dz = lambda *a, **k: (0, 'dz recall "x"  —  1 hit(s)\n  [0.90] (general) a lesson', "")
        try:
            out = self.lb.recall("transferrin")
            self.assertIn("a lesson", out, "the results are still returned")
            self.assertIn("predates", out)
        finally:
            self.lb._run_dz = original

    def test_capability_cannot_be_FORGED_by_recalled_content(self):
        """A probe the payload can forge is not a probe: the marker was once the bare
        substring `domain "`, which a lesson can contain."""
        original = self.lb._run_dz
        self.lb._run_dz = lambda *a, **k: (
            0, 'dz recall "x"  —  1 hit(s)\n  [0.90] (general) remember domain "ownership" first', "")
        try:
            self.assertIn("predates", self.lb.recall("x"))
        finally:
            self.lb._run_dz = original

    def test_the_real_note_is_recognised_on_BOTH_renderings(self):
        """Copied verbatim from live runs. A --domain run that matched nothing still
        proves the CLI understands --domain."""
        original = self.lb._run_dz
        for note in (
            '  domain "health-research": among 6 candidate(s) — 1 exact match(es), 3 changed '
            'position; foreign-domain lessons kept (a boost, not a filter)',
            '  domain "health-research": no lesson in this result carries it — order unchanged, '
            'nothing was hidden',
        ):
            self.lb._run_dz = lambda *a, _n=note, **k: (0, 'dz recall "x"  —  1 hit(s)\n  [0.90] (x) y\n' + _n, "")
            with self.subTest(note=note[:40]):
                self.assertNotIn("predates", self.lb.recall("x"))
        self.lb._run_dz = original

    def test_an_exotic_line_separator_cannot_forge_the_probe(self):
        """splitlines() breaks on U+2028 where the renderer does not, so a lesson
        containing one produced a "line" the CLI never emitted."""
        tail = 'domain "health-research": order unchanged, nothing was hidden'
        self.assertFalse(self.lb._boost_note_present("  [0.90] (general) x\u2028" + tail))
        self.assertTrue(self.lb._boost_note_present("  [0.90] (general) x\n  " + tail))

    def test_a_real_failure_is_not_disguised_as_an_old_cli(self):
        original = self.lb._run_dz
        self.lb._run_dz = lambda *a, **k: (1, "", "store corrupt")
        try:
            out = self.lb.recall("x")
            self.assertIn("WITHOUT prior lessons", out)
            self.assertNotIn("predates", out)
        finally:
            self.lb._run_dz = original

    def test_only_a_double_dash_is_refused_as_an_option(self):
        """`dz` treats `-contrast` as ordinary text; refusing it defended against
        nothing and blocked legitimate lessons."""
        self.assertTrue(self.lb.check_lesson("-negative findings still require confirmation").ok)
        self.assertIn("--", self.lb.teach("--all", confirmed=True)[1])
        self.assertIn("--", self.lb.recall("--all"))



class RoundSixteenRegressions(unittest.TestCase):
    """Each name records what round-16 review found, so a rewrite cannot quietly undo it."""

    # The suite imports the bridge inside each test, as the other bridge tests do.
    def setUp(self):
        import os, tempfile, learning_bridge
        self.os, self.tempfile, self.lb = os, tempfile, learning_bridge

    def test_brain_symlinked_to_a_nested_project_is_refused(self):
        # `/A/.health-brain -> /A/subproject` passed BOTH containment checks (inside A,
        # store inside it) and the canary, found through the same alias, certified the
        # wrong store. Containment cannot say what a directory IS.
        with self.tempfile.TemporaryDirectory() as tmp:
            root = self.os.path.realpath(tmp)
            sub = self.os.path.join(root, "subproject")
            self.os.makedirs(self.os.path.join(sub, ".dz", "memory"))
            self.os.symlink(sub, self.os.path.join(root, self.lb.HEALTH_BRAIN_DIRNAME))
            ok, why = self.lb._health_brain_is_distinct(root)
            self.assertFalse(ok)
            self.assertIn("holds a dz store of its own", why)

    def test_symlink_to_a_directory_that_is_not_a_project_is_still_allowed(self):
        # The refusal is aimed at another PROJECT, not at symlinks as such — a link to
        # ordinary storage stays a legitimate way to place the brain.
        with self.tempfile.TemporaryDirectory() as tmp:
            root = self.os.path.realpath(tmp)
            target = self.os.path.join(root, "elsewhere")
            self.os.makedirs(target)
            self.os.symlink(target, self.os.path.join(root, self.lb.HEALTH_BRAIN_DIRNAME))
            ok, _ = self.lb._health_brain_is_distinct(root)
            self.assertTrue(ok)

    def test_gitignore_with_a_later_negation_is_refused(self):
        # git applies the LAST matching rule, so `*` then `!.dz/` leaves the store
        # exposed. Asserting that a `*` line EXISTS approved a file that does not ignore.
        with self.tempfile.TemporaryDirectory() as tmp:
            brain = self.os.path.join(tmp, self.lb.HEALTH_BRAIN_DIRNAME)
            self.os.makedirs(brain)
            with open(self.os.path.join(brain, ".gitignore"), "w", encoding="utf-8") as fh:
                fh.write("*\n!.dz/\n!.dz/**\n")
            with self.assertRaises(RuntimeError) as ctx:
                self.lb._protect_brain(brain)
            self.assertIn("IN FORCE", str(ctx.exception))

    def test_gitignore_that_really_ignores_is_accepted(self):
        for body in ("*\n", "# note\n*\n", "!keep\n*\n"):
            with self.tempfile.TemporaryDirectory() as tmp:
                brain = self.os.path.join(tmp, self.lb.HEALTH_BRAIN_DIRNAME)
                self.os.makedirs(brain)
                with open(self.os.path.join(brain, ".gitignore"), "w", encoding="utf-8") as fh:
                    fh.write(body)
                self.lb._protect_brain(brain)   # must not raise

    def test_identifiers_round_sixteen_missed(self):
        for text in (
            "contact customer!@localhost before enrollment",   # RFC local part, not the four picked chars
            "phone: 5551234567 belongs to the patient",        # the LABEL decides
            "call + (44) 20 7946 0958 before the draw",        # separator after the `+`
        ):
            with self.subTest(text=text):
                self.assertFalse(self.lb.check_lesson(text).ok)

    def test_method_prose_round_sixteen_wrongly_refused(self):
        for text in (
            "use a 1000-1000-1000 dilution series to test linearity",  # 3 groups is undecidable
            "compare medical record number in 3 hospitals",            # a lone digit is not a record number
        ):
            with self.subTest(text=text):
                self.assertTrue(self.lb.check_lesson(text).ok)


class RoundSeventeenRegressions(_BridgeHarness, unittest.TestCase):
    """One test per round-17 finding, named so the finding is identifiable from the
    failure line alone."""

    def test_finding7_descendant_symlink_is_caught_by_the_ABSENCE_of_the_canary(self):
        """FINDING 7 (HIGH) — `.health-brain/.dz/memory -> ../../.dz/memory`.

        `.health-brain` and `.health-brain/.dz` are REAL directories, so every path check
        in _health_brain_is_distinct passes (asserted below — that is what makes this a
        finding rather than a duplicate of round 11/13/16). The alias sits one level
        deeper, where dz actually keeps the data, so the canary, its lookup, both counts
        and the real teach all travelled it and the bridge certified the SHARED store as
        the health brain.

        The fix is an OUTCOME check, not another path shape: the canary must be present
        in the brain AND absent from the shared store. This test is written against the
        mechanism, not the shape — the fake store keeps real files, so the symlink makes
        the two paths one store the same way it would for the real CLI.

        MEASURED DISCRIMINATION: with the absence check removed, this test FAILS at
        `assertEqual(code, 1)` — teach returns 0 and reports "recorded in the health
        brain" while the lesson sits in the shared store.
        """
        import os
        root = os.path.realpath(os.getcwd())
        os.makedirs(os.path.join(root, ".dz", "memory"))
        os.makedirs(os.path.join(root, self.lb.HEALTH_BRAIN_DIRNAME, ".dz"))
        os.symlink(os.path.join("..", "..", ".dz", "memory"),
                   os.path.join(root, self.lb.HEALTH_BRAIN_DIRNAME, ".dz", "memory"))

        # Every PATH check passes. The finding is exactly that this is not enough.
        distinct, _ = self.lb._health_brain_is_distinct(root)
        self.assertTrue(distinct, "the path checks see nothing wrong — that is the finding")

        original = self.lb._run_dz
        self.lb._run_dz = self._fake_store()
        try:
            code, message = self.lb.teach("fasting windows need a repeat draw", confirmed=True)
        finally:
            self.lb._run_dz = original

        self.assertEqual(code, 1, "an aliased store must be REFUSED, not certified")
        self.assertIn("SAME store", message)
        self.assertIn("nonce", message, "the user must be able to find any stray probe")
        rows = self._store_rows(root)
        self.assertFalse(any("fasting windows" in r["pattern"] for r in rows),
                         "the real lesson must never reach the shared store")
        self.assertEqual(rows, [], "and the probe must not be left behind either")

    def test_finding7_a_healthy_brain_still_teaches(self):
        """The absence check must not refuse the ordinary case: two real, separate
        stores. A guard that refuses everything is not a guard."""
        import os
        original = self.lb._run_dz
        self.lb._run_dz = self._fake_store()
        try:
            code, message = self.lb.teach("repeat a lone abnormal result", confirmed=True)
        finally:
            self.lb._run_dz = original
        self.assertEqual(code, 0, message)
        brain = os.path.join(os.path.realpath(os.getcwd()), self.lb.HEALTH_BRAIN_DIRNAME)
        self.assertTrue(any("repeat a lone" in r["pattern"] for r in self._store_rows(brain)))
        self.assertEqual(self._store_rows(os.path.realpath(os.getcwd())), [],
                         "nothing reached the shared store")

    def test_finding8_a_negation_that_does_not_match_the_store_is_SAFE(self):
        """FINDING 8 (MEDIUM) — round 16 read "last match wins" as "any later `!` cancels
        the `*`", which refused this file although `!README.md` never matches `.dz`."""
        import os
        for body in ("*\n!README.md\n", "*\n!README.md\n!LICENSE\n", "*\n!*.md\n"):
            with self.subTest(body=body):
                brain = os.path.join(os.path.realpath(os.getcwd()),
                                     "safe-" + str(abs(hash(body))))
                os.makedirs(brain)
                with open(os.path.join(brain, ".gitignore"), "w", encoding="utf-8") as fh:
                    fh.write(body)
                self.lb._protect_brain(brain)   # must not raise

    def test_finding8_the_round16_refusals_still_refuse(self):
        """…and the fix must not reopen what round 16 closed: these negations DO match
        the store, so the last matching rule really does re-expose it."""
        import os
        for body in ("*\n!.dz/\n!.dz/**\n", "*\n!.dz/\n", "*\n!.dz/**\n", "*\n!*\n"):
            with self.subTest(body=body):
                brain = os.path.join(os.path.realpath(os.getcwd()),
                                     "unsafe-" + str(abs(hash(body))))
                os.makedirs(brain)
                with open(os.path.join(brain, ".gitignore"), "w", encoding="utf-8") as fh:
                    fh.write(body)
                with self.assertRaises(RuntimeError) as ctx:
                    self.lb._protect_brain(brain)
                self.assertIn("IN FORCE", str(ctx.exception))

    def test_finding9_formatted_identifiers_that_still_passed(self):
        """FINDING 9 (MEDIUM) — two CLOSED, SPECIFIED formats (a UUID, the 3-2-4
        national-identifier grouping), plus the two consequences of round 16's rule that
        a record-number value must be 3+ digits or letters-and-digits mixed."""
        for text in (
            "MRN: 7",
            "SSN 123-45-6789",
            "Patient key 550e8400-e29b-41d4-a716-446655440000",
            "Patient code A12345678",
            "MRN № 7",
            "MRN = 7",
            "PATIENT KEY 550E8400-E29B-41D4-A716-446655440000 IN THE LEDGER",
        ):
            with self.subTest(text=text):
                self.assertFalse(self.lb.check_lesson(text).ok, text)

    def test_finding9_prose_reached_across_words_is_still_allowed(self):
        """The other half: the separator/prose distinction must not re-refuse the method
        prose rounds 15 and 16 fixed."""
        for text in (
            "compare medical record number in 3 hospitals",
            "Compare medical record number use in 300 hospitals.",
            "audit medical record number quality before dataset linkage",
            "medical record number completeness across 3 sites is the first check",
        ):
            with self.subTest(text=text):
                self.assertTrue(self.lb.check_lesson(text).ok, text)

    def test_finding10_medical_method_prose_is_no_longer_refused(self):
        """FINDING 10 (MEDIUM) — four ordinary method sentences read as identifiers."""
        for text in (
            "Use apoB@baseline and apoB@week12 as study endpoints.",
            "Allocate 1000-1000-1000-1000 participants across four trial arms.",
            "Compare medical record number use in 300 hospitals.",
            "Use ISO15189-compliant laboratory workflows.",
        ):
            with self.subTest(text=text):
                self.assertTrue(self.lb.check_lesson(text).ok, text)

    def test_finding10_the_identifiers_those_branches_exist_for_are_still_caught(self):
        """Each loosening is paired with the case it must NOT let through: the bare-host
        email branch still catches `localhost`, and the card branch still catches a
        number whose Luhn check digit holds. MEASURED: 4111111111111111 satisfies Luhn,
        1000100010001000 does not — the shapes are identical, the outcome is not."""
        for text in (
            "contact customer!@localhost before enrollment",
            "contact me at a.b@clinic.org",
            "card 4111 1111 1111 1111 belongs to the patient",
            "card 5500 0000 0000 0004 belongs to the patient",
            "trial NCT04368728 enrolled a cohort",
            "passport ab1234567 identifies the holder",
        ):
            with self.subTest(text=text):
                self.assertFalse(self.lb.check_lesson(text).ok, text)
        self.assertTrue(self.lb._luhn_ok("4111111111111111"))
        self.assertFalse(self.lb._luhn_ok("1000100010001000"))

    def test_finding11_the_module_header_describes_the_TWO_store_topology(self):
        """FINDING 11 (LOW) — the header still taught the superseded one-store rule
        ("a loop only compounds when recall and teach hit ONE"), which a maintainer could
        follow straight through the isolation the rest of the file enforces. ADR-003 is
        AMENDED rather than rewritten, and so is this: the old reasoning stays visible,
        marked as superseded."""
        doc = self.lb.__doc__ or ""
        self.assertIn("SUPERSEDED", doc)
        self.assertIn("RECALL READS BOTH", doc)
        self.assertIn(self.lb.HEALTH_BRAIN_DIRNAME, doc)
        self.assertLess(doc.index("SUPERSEDED"), doc.index("hit ONE"),
                        "the one-store claim must be marked superseded BEFORE it is quoted")
        # …and the sentence round 8 pinned is still there.
        self.assertIn("does NOT decide whether a lesson describes a method or a person", doc)


if __name__ == "__main__":
    unittest.main()
