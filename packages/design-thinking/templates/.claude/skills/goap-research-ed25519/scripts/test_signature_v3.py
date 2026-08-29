#!/usr/bin/env python3
"""
ADR-003 / ADR-005 Confirmation tests — the v3 signed message (T-1…T-8, T-17, T-19).

    cd .../goap-research-ed25519/scripts && python3 -m unittest discover -s . -p 'test_*.py' -v

The load-bearing test here is `test_trust_class_reclaim_breaks_v3_signature_discrimination`:
it models the LIVE attack — sign ISSUER_SIGNED while the pin is active, revoke the
pin at verify time, reclaim to SELF_ATTESTED, verify — because a pin that was never
active would fail for the wrong reason and prove nothing.
"""

import copy
import json
import os
import re
import sys

# Import NOTHING local before this line (stray __pycache__ reads as canonical drift).
sys.dont_write_bytecode = True

import unittest

import ed25519_verifier as ev

HERE = os.path.dirname(os.path.abspath(__file__))


def _pop(description="men with obesity (BMI >= 30) enrolled in a weight-loss trial"):
    return {
        "description": description,
        "criteria": {
            "bmi_min": {"op": ">=", "value": 30, "kind": "baseline",
                        "verbatim": "men with obesity (BMI >= 30 kg/m2)",
                        "locator": "[Methods, Participants]"},
        },
    }


def _verifier():
    v = ev.Ed25519Verifier()
    v.generate_keypair()
    return v


def _fixture(name):
    with open(os.path.join(HERE, name), "r", encoding="utf-8") as handle:
        return json.load(handle)


@unittest.skipIf(ev.CRYPTO_BACKEND is None, "No Ed25519 backend installed")
class MandatoryStudyPopulationTests(unittest.TestCase):
    """T-1 (AM-1 / FR-1) — five factories x four malformed inputs = 20 refusals.

    ASSERTS THE `TypeError`, never "the suite is green" (AM-13): giving the argument
    a default keeps the whole suite green and makes only this test fail — which is
    exactly why it is written this way.
    """

    def setUp(self):
        self.v = _verifier()
        import evidence_fetch as ef
        self.record = ef.FetchRecord(
            url="https://pubmed.ncbi.nlm.nih.gov/123", final_url="https://pubmed.ncbi.nlm.nih.gov/123",
            status=200, sha256_body="a" * 64, bytes_len=10, fetched_at="2026-08-03T10:00:00Z",
            witness=ef._FETCH_WITNESS)

    def _factories(self):
        return {
            "create_signed_fact": lambda **kw: self.v.create_signed_fact(
                claim="c", source_url="https://x.test", source_content="b", issuer="researcher", **kw),
            "create_issuer_signed_fact": lambda **kw: self.v.create_issuer_signed_fact(
                claim="c", source_url="https://x.test", source_content="b", issuer="researcher", **kw),
            "create_fetched_fact": lambda **kw: self.v.create_fetched_fact(
                claim="c", fetch_record=self.record, issuer="researcher", **kw),
            "create_listing_fact": lambda **kw: self.v.create_listing_fact(
                claim="c", source_url="https://x.test", reason="offline run", **kw),
            "create_asserted_fact": lambda **kw: self.v.create_asserted_fact(claim="c", **kw),
        }

    def test_create_fact_without_study_population_raises(self):
        cases = 0
        for name, factory in self._factories().items():
            with self.subTest(factory=name, case="omitted"):
                with self.assertRaises(TypeError):
                    factory()
                cases += 1
            for case, value in (("None", None), ("empty string", ""),
                                ("present but meaningless", {"description": "   ", "criteria": {}})):
                with self.subTest(factory=name, case=case):
                    with self.assertRaises(ValueError):
                        factory(study_population=value)
                    cases += 1
        self.assertEqual(cases, 20, "5 factories x 4 malformed inputs")

    def test_study_population_blank_or_empty_raises(self):
        """T-2 — the API-shape refusal, exercised through the fact-construction path."""
        for bad in ({"description": "adults", "criteria": {}},
                    {"description": "", "criteria": {"bmi": 1}},
                    {"criteria": {"bmi": 1}},
                    "adults"):
            with self.subTest(value=bad):
                with self.assertRaises(ValueError):
                    self.v.create_asserted_fact(claim="c", study_population=bad)

    def test_unstated_requires_reason(self):
        with self.assertRaises(ValueError):
            self.v.create_asserted_fact(claim="c", study_population={
                "description": "population not stated", "criteria": {}, "unstated_reason": "   "})
        fact = self.v.create_asserted_fact(claim="c", study_population={
            "description": "population not stated", "criteria": {},
            "unstated_reason": "the abstract never describes who was enrolled"})
        self.assertTrue(self.v.verify_fact(fact).verified)

    def test_every_new_fact_is_v3(self):
        for name, factory in self._factories().items():
            with self.subTest(factory=name):
                fact = factory(study_population=_pop())
                self.assertEqual(ev.fact_schema_version(fact), 3)
                self.assertIsNotNone(fact.study_population)
                if fact.trust_class == ev.TRUST_CLASS_ISSUER_SIGNED:
                    # An issuer-signed fact verifies against the PINNED key, never the
                    # embedded one — that is the whole point of the class, so the pin
                    # must exist for this check to mean anything.
                    self.v.registry.add("researcher", self.v.get_public_key_b64())
                self.assertTrue(self.v.verify_fact(fact).verified)

    def test_from_dict_stays_permissive(self):
        """FR-1's other half: mandatory on CREATION, never on LOADING. A loader that
        refuses a legacy record cannot report on it."""
        legacy = _fixture("fixture_legacy_v1_fact.json")["fact"]
        fact = ev.SignedFact.from_dict(legacy)
        self.assertIsNone(fact.study_population)
        self.assertEqual(ev.fact_schema_version(fact), 1)


@unittest.skipIf(ev.CRYPTO_BACKEND is None, "No Ed25519 backend installed")
class V3SignatureCoverageTests(unittest.TestCase):
    """T-3 / T-5 — the four new keys are UNDER the signature, both tamper directions."""

    def setUp(self):
        self.v = _verifier()

    def _fact(self, **kw):
        return self.v.create_listing_fact(claim="c", source_url="https://x.test",
                                          reason="offline run", study_population=_pop(), **kw)

    def test_tamper_study_population_breaks_v3_signature(self):
        """T-3 (AM-2 / FR-13) — strip / add / swap, the same three-test shape the
        evidence axis already uses."""
        stripped = self._fact()
        self.assertTrue(self.v.verify_fact(stripped).verified)
        stripped.study_population = None
        self.assertFalse(self.v.verify_fact(stripped).verified, "stripping it must break the signature")

        swapped = self._fact()
        swapped.study_population = _pop("a completely different cohort")
        self.assertFalse(self.v.verify_fact(swapped).verified, "swapping it must break the signature")

        added = ev.SignedFact.from_dict(_fixture("fixture_legacy_v2_fact.json")["fact"])
        self.assertTrue(self.v.verify_fact(added).verified)
        added.study_population = _pop()
        self.assertFalse(self.v.verify_fact(added).verified, "adding it to a v2 fact must break it")

    def test_dispatch_tamper_table(self):
        """ADR-003 §2's dispatch rows — MEASURED, and one row came back different from
        what the ADR predicted.

        What refuses a tampered fact is the KEY-SET/VALUE difference between the two
        reconstructed texts, never the `schema` marker or the `schema_version` field
        (both are self-description). This module has already been taught that lesson
        once: ADR-002's first draft credited the v2 marker with closing the downgrade
        attack and its own discrimination run refuted it.
        """
        rows = {}
        edited = self._fact()
        edited.trust_class = ev.TRUST_CLASS_ISSUER_SIGNED
        rows["edit trust_class"] = edited

        downgraded = self._fact()
        downgraded.schema_version = 1
        rows["schema_version = 1"] = downgraded

        both_stripped = self._fact()
        both_stripped.schema_version = None
        both_stripped.study_population = None
        rows["strip schema_version AND study_population (the real downgrade)"] = both_stripped

        upgraded = ev.SignedFact.from_dict(_fixture("fixture_legacy_v2_fact.json")["fact"])
        upgraded.schema_version = 3
        rows["schema_version added to a v2 fact"] = upgraded

        for name, fact in rows.items():
            with self.subTest(row=name):
                self.assertFalse(self.v.verify_fact(fact).verified, f"{name} must not verify")

    def test_stripping_schema_version_alone_is_a_no_op_not_an_attack(self):
        """MEASURED CORRECTION to ADR-003 §2's predicted tamper table (reported, not
        smoothed over — the ADR listed this row as "must fail").

        It does NOT fail, and it should not: dispatch is by PRESENCE (D-5), so with
        `study_population` still there the verifier recovers version 3, rebuilds the
        identical text, and the signature matches. Nothing about the fact changed —
        `schema_version` is not in the signed message, it is a convenience mirror of a
        property already derivable from the fields. The attack it was supposed to model
        is covered by the row above: stripping the FIELD as well really does downgrade
        the reconstruction, and really does fail.
        """
        fact = self._fact()
        fact.schema_version = None
        self.assertEqual(ev.fact_schema_version(fact), 3, "presence-dispatch recovers the version")
        self.assertTrue(self.v.verify_fact(fact).verified,
                        "a no-op edit must not be reported as tampering")

    def test_tamper_metadata_breaks_v3_signature(self):
        """T-5 / AC-13 — `evidence_note` is the MANDATORY reason for a LISTING_ONLY
        degradation; rewriting it hollows out the audit trail the axis exists for."""
        fact = self._fact()
        self.assertIn("evidence_note", fact.metadata)
        fact.metadata["evidence_note"] = "fetched and verified"
        self.assertFalse(self.v.verify_fact(fact).verified)

        stripped = self._fact()
        stripped.metadata.pop("evidence_note")
        self.assertFalse(self.v.verify_fact(stripped).verified)

    def test_tamper_confidence_breaks_v3_signature(self):
        """A DIFFERENT protection than the min() clamp: it protects a consumer that
        reads `fact.confidence` directly without re-running verify_fact()."""
        fact = self._fact()
        fact.confidence = 0.99
        self.assertFalse(self.v.verify_fact(fact).verified)

    def test_confidence_is_signed_as_a_fixed_width_string(self):
        """Float repr differs across runtimes; a signed text two runtimes serialize
        differently is a signature that fails for the wrong reason."""
        fact = self._fact()
        message = json.loads(ev.canonical_fact_message_v3(fact))
        self.assertEqual(message["confidence"], "0.5000")
        self.assertIsInstance(message["confidence"], str)

    def test_unserializable_payload_refuses_to_sign(self):
        """D-18 — a silently dropped key is an UNSIGNED key, so signing fails closed."""
        with self.assertRaises(ValueError):
            self.v.create_asserted_fact(claim="c", metadata={"bad": float("nan")},
                                        study_population=_pop())
        with self.assertRaises(ValueError):
            self.v.create_asserted_fact(claim="c", study_population={
                "description": "d", "criteria": {"bmi": float("inf")}})


@unittest.skipIf(ev.CRYPTO_BACKEND is None, "No Ed25519 backend installed")
class TrustClassReclaimDiscriminationTests(unittest.TestCase):
    """T-4 (AM-4) — the MANDATORY discrimination proof, modelled as the live attack."""

    def test_trust_class_reclaim_breaks_v3_signature_discrimination(self):
        signer = ev.Ed25519Verifier(auto_generate_keypair=True)
        verifier = ev.Ed25519Verifier(trusted_issuers={
            "nature.com": {"pubkey_b64": signer.get_public_key_b64(), "status": "active"}})

        fact = signer.create_issuer_signed_fact(
            claim="testosterone therapy showed no excess cardiovascular harm",
            source_url="https://nature.com/articles/example", source_content="body",
            issuer="nature.com", study_population=_pop())
        before = verifier.verify_fact(fact)
        self.assertTrue(before.verified, "signed while the pin was ACTIVE")
        self.assertEqual(before.trust_class, ev.TRUST_CLASS_ISSUER_SIGNED)

        # …the key is revoked AFTER signing. This sequencing is the point: a pin that
        # was never active would fail for the wrong reason and prove nothing.
        verifier.registry.add("nature.com", signer.get_public_key_b64(), status="revoked")
        self.assertFalse(verifier.verify_fact(fact).verified, "a revoked pin refuses the honest fact")

        reclaimed = copy.deepcopy(fact)
        reclaimed.trust_class = ev.TRUST_CLASS_SELF_ATTESTED  # the attack, in a text editor
        result = verifier.verify_fact(reclaimed)
        self.assertFalse(result.verified,
                         f"the reclaim must not verify (got verified={result.verified}, "
                         f"confidence={result.confidence})")
        self.assertEqual(result.confidence, 0.0,
                         "pre-fix this returned confidence=0.60 on a revoked-pin fact")

        # …and the reverse direction, for completeness (FR-11).
        promoted = signer.create_signed_fact(
            claim="c", source_url="https://nature.com/articles/example", source_content="b",
            issuer="nature.com", study_population=_pop())
        self.assertTrue(ev.Ed25519Verifier().verify_fact(promoted).verified)
        promoted.trust_class = ev.TRUST_CLASS_ISSUER_SIGNED
        self.assertFalse(verifier.verify_fact(promoted).verified,
                         "SELF_ATTESTED -> ISSUER_SIGNED must break it too")

    def test_legacy_reclaim_belt_is_bounded_and_honest(self):
        """M3.7 — the v1/v2 belt catches the REVOKED-BUT-PINNED case (issuer IS signed
        in v1/v2, so the lookup cannot be redirected) and openly does NOT catch the
        unpinned-issuer case, which stays launderable to SELF_ATTESTED @ 0.60."""
        signer = ev.Ed25519Verifier(auto_generate_keypair=True)
        legacy = ev.SignedFact(
            claim="c", source_url="https://x.test", source_hash="0" * 64, issuer="nature.com",
            issuer_pubkey=f"ed25519:{signer.get_public_key_b64()}", signature="",
            timestamp="2026-08-03T12:16:18.191716Z", confidence=0.60,
            trust_class=ev.TRUST_CLASS_SELF_ATTESTED)
        legacy.signature, _ = signer.sign_content(ev.canonical_fact_message_v1(legacy))
        self.assertEqual(ev.fact_schema_version(legacy), 1)

        unpinned = ev.Ed25519Verifier()
        residual = unpinned.verify_fact(legacy)
        self.assertTrue(residual.verified, "the unclosable residual, named rather than hidden")
        self.assertEqual(residual.confidence, 0.60)

        pinned = ev.Ed25519Verifier(trusted_issuers={
            "nature.com": {"pubkey_b64": signer.get_public_key_b64(), "status": "revoked"}})
        caught = pinned.verify_fact(legacy)
        self.assertFalse(caught.verified)
        self.assertIn("revoked", caught.error)


@unittest.skipIf(ev.CRYPTO_BACKEND is None, "No Ed25519 backend installed")
class BackwardCompatibilityTests(unittest.TestCase):
    """T-6 / T-7 (AM-5) — COMMITTED fixtures, replayed. Comparing two CURRENT code
    paths would mask exactly the regression these exist to catch."""

    def test_v1_legacy_fact_still_verifies_after_v3(self):
        fact = ev.SignedFact.from_dict(_fixture("fixture_legacy_v1_fact.json")["fact"])
        self.assertEqual(ev.fact_schema_version(fact), 1)
        self.assertTrue(ev.Ed25519Verifier().verify_fact(fact).verified)

    def test_v2_legacy_fact_still_verifies_after_v3(self):
        """The v2 fixture was generated from PRE-CHANGE code and committed (M0.2):
        generating it after the first edit would have made this test self-fulfilling."""
        fact = ev.SignedFact.from_dict(_fixture("fixture_legacy_v2_fact.json")["fact"])
        self.assertEqual(ev.fact_schema_version(fact), 2)
        self.assertIsNotNone(fact.evidence_class)
        self.assertIsNone(fact.study_population)
        self.assertTrue(ev.Ed25519Verifier().verify_fact(fact).verified)

    def test_v1_and_v2_messages_are_byte_frozen(self):
        """D-4 / D-4a — the two older texts must not gain a key when v3 lands."""
        v1 = ev.SignedFact.from_dict(_fixture("fixture_legacy_v1_fact.json")["fact"])
        v2 = ev.SignedFact.from_dict(_fixture("fixture_legacy_v2_fact.json")["fact"])
        self.assertEqual(
            sorted(json.loads(ev.canonical_fact_message_v1(v1))),
            ["claim", "issuer", "research_context", "source_hash", "source_url", "timestamp"])
        self.assertEqual(
            sorted(json.loads(ev.canonical_fact_message_v2(v2))),
            ["claim", "evidence_class", "fetch_date", "issuer", "research_context", "schema",
             "source_date", "source_hash", "source_url", "timestamp"])


@unittest.skipIf(ev.CRYPTO_BACKEND is None, "No Ed25519 backend installed")
class SignedFieldsTests(unittest.TestCase):
    """T-8 (D-6) — the pre-v3 hole becomes a VALUE a caller can branch on."""

    def test_verification_result_names_unsigned_fields(self):
        v1 = ev.SignedFact.from_dict(_fixture("fixture_legacy_v1_fact.json")["fact"])
        v2 = ev.SignedFact.from_dict(_fixture("fixture_legacy_v2_fact.json")["fact"])
        verifier = ev.Ed25519Verifier()

        r1 = verifier.verify_fact(v1)
        self.assertEqual(r1.schema_version, 1)
        self.assertNotIn("trust_class", r1.signed_fields)

        r2 = verifier.verify_fact(v2)
        self.assertEqual(r2.schema_version, 2)
        self.assertNotIn("trust_class", r2.signed_fields)
        self.assertIn("evidence_class", r2.signed_fields)

        signer = _verifier()
        v3 = signer.create_asserted_fact(claim="c", study_population=_pop())
        r3 = signer.verify_fact(v3)
        self.assertEqual(r3.schema_version, 3)
        for key in ("trust_class", "metadata", "confidence", "study_population"):
            self.assertIn(key, r3.signed_fields)


class TierCeilingTests(unittest.TestCase):
    """T-19 (AM-15 / ADR-005 / D-20) — the ceiling survives the schema bump."""

    @unittest.skipIf(ev.CRYPTO_BACKEND is None, "No Ed25519 backend installed")
    def test_am15_tier_ceiling_applies_to_schema_3_facts(self):
        """Three assertions, one property.

        Minting schema 3 must NOT switch the third ceiling off. The predicate used to
        read `fact_schema_version(fact) != 2` — "applies to exactly v2" — so every fact
        this slice creates would have scored 0.60 instead of the promised 0.40 from an
        unknown domain, silently. The tier-A row proves the tier term is actually being
        MEASURED rather than being a constant; the v1 row proves the lower edge (no
        retroactive re-scoring) still holds.
        """
        v = _verifier()
        unknown_domain = v.create_fetched_fact(
            claim="c", issuer="researcher", study_population=_pop(),
            fetch_record=_authentic_record("https://some-blog.example/p"))
        self.assertEqual(ev.fact_schema_version(unknown_domain), 3)
        self.assertEqual(v.verify_fact(unknown_domain).confidence, 0.40,
                         "tier D must cap a schema-3 fact, exactly as it caps a schema-2 one")

        tier_a = v.create_fetched_fact(
            claim="c", issuer="researcher", study_population=_pop(),
            fetch_record=_authentic_record("https://www.cochrane.org/x"))
        self.assertEqual(v.verify_fact(tier_a).confidence, 0.60,
                         "tier A leaves the trust ceiling binding — the tier term is measured, not constant")

        legacy = ev.SignedFact(
            claim="c", source_url="https://some-blog.example/p", source_hash="0" * 64,
            issuer="researcher", issuer_pubkey=f"ed25519:{v.get_public_key_b64()}", signature="",
            timestamp="2026-08-03T12:16:18.191716Z", confidence=0.60,
            trust_class=ev.TRUST_CLASS_SELF_ATTESTED)
        legacy.signature, _ = v.sign_content(ev.canonical_fact_message_v1(legacy))
        self.assertEqual(ev.fact_schema_version(legacy), 1)
        self.assertEqual(v.verify_fact(legacy).confidence, 0.60,
                         "v1 stays exempt — old records keep the semantics they were created under")

    def test_the_scope_is_a_lower_bound_not_an_equality(self):
        """The shape of the fix, asserted directly: any FUTURE schema must inherit the
        ceiling without another migration. An equality gate has to be re-edited by
        every migration; a lower bound is edited once."""
        self.assertEqual(ev.TIER_CEILING_MIN_SCHEMA, 2)
        source = open(os.path.join(HERE, "ed25519_verifier.py"), encoding="utf-8").read()
        self.assertNotIn("fact_schema_version(fact) != 2", source,
                         "the equality predicate must not return")
        self.assertIn("< TIER_CEILING_MIN_SCHEMA", source,
                      "the scope must stay a `<` lower bound against the named constant")


@unittest.skipIf(ev.CRYPTO_BACKEND is None, "No Ed25519 backend installed")
class SchemaVersionRefusalTests(unittest.TestCase):
    """QE G6 — a schema the verifier cannot identify is REFUSED, never crashed on.

    MEASURED before the fix: loading the committed v2 fixture with
    `schema_version='not-a-number'` and calling `verify_fact` raised an UNCAUGHT
    `ValueError` out of `int(fact.schema_version)`, taking down a gate run with a
    traceback instead of returning `verified=False`. And within the old `>= 3` band the
    value was not covered by the signed text, so `3` could be moved to `99` and the
    fact still verified.
    """

    def _v3_fact(self):
        v = _verifier()
        return v, v.create_listing_fact(claim="c", source_url="https://x.test",
                                        reason="offline run", study_population=_pop())

    def test_malformed_schema_version_refuses_instead_of_raising(self):
        fact = ev.SignedFact.from_dict(_fixture("fixture_legacy_v2_fact.json")["fact"])
        verifier = ev.Ed25519Verifier()
        self.assertTrue(verifier.verify_fact(fact).verified, "the honest fixture still verifies")

        fact.schema_version = "not-a-number"
        result = verifier.verify_fact(fact)          # must NOT raise
        self.assertFalse(result.verified)
        self.assertIn("not an integer", result.error)
        self.assertEqual(result.schema_version, ev.SCHEMA_VERSION_UNIDENTIFIED,
                         "an unidentifiable record is not reported as legacy v1")

    def test_every_malformed_spelling_is_refused(self):
        for bad in ("not-a-number", "", "3.5", "  ", [], {}, True, 2.9, object()):
            with self.subTest(value=bad):
                self.assertIsNone(ev.coerce_schema_version(bad))
        for good, expected in ((3, 3), ("3", 3), (" 2 ", 2), (3.0, 3)):
            with self.subTest(value=good):
                self.assertEqual(ev.coerce_schema_version(good), expected)

    def test_moving_the_version_inside_the_old_band_now_breaks_verification(self):
        """`3 → 99` used to verify: the band accepted anything at or above 3 as v3."""
        v, fact = self._v3_fact()
        self.assertTrue(v.verify_fact(fact).verified)
        fact.schema_version = 99
        result = v.verify_fact(fact)
        self.assertFalse(result.verified, "an unknown schema must not be treated as v3")
        self.assertIn("99", result.error)
        self.assertEqual(ev.KNOWN_SCHEMA_VERSIONS, (1, 2, 3))

    def test_an_unknown_schema_has_no_message_to_reconstruct(self):
        v, fact = self._v3_fact()
        fact.schema_version = 4
        with self.assertRaises(ev.SchemaVersionError):
            ev.canonical_fact_message(fact)
        self.assertEqual(ev.signed_fields_for(fact), (),
                         "and no field may be claimed as signed for it")

    def test_the_gate_reports_a_malformed_record_instead_of_dying(self):
        """The composition that motivated the finding: this ran inside a gate."""
        import check_report_evidence as gate
        fact = dict(_fixture("fixture_legacy_v2_fact.json")["fact"], schema_version="not-a-number")
        findings = gate.verify_ledger_signatures([fact])
        self.assertTrue(findings, "a record the verifier refuses must surface as a finding")
        self.assertIn(findings[0].kind, ("TAMPERED_FACT", "UNVERIFIABLE_FACT"))


def _authentic_record(url):
    import evidence_fetch as ef
    return ef.FetchRecord(url=url, final_url=url, status=200, sha256_body="a" * 64,
                          bytes_len=10, fetched_at="2026-08-03T10:00:00Z", witness=ef._FETCH_WITNESS)


class GrepGateTests(unittest.TestCase):
    """T-17 — no module builds a canonical fact message outside the three functions."""

    def test_no_inlined_canonical_message_dict(self):
        """Step-0 recalled pattern #2: a new resolver does not deliver a migration
        unless every call site is wired — so grep for old/duplicate literals."""
        offenders = []
        for name in ("population_match.py", "risk_statement.py", "check_report_evidence.py"):
            text = open(os.path.join(HERE, name), encoding="utf-8").read()
            for match in re.finditer(r'"claim"\s*:', text):
                window = text[max(0, match.start() - 400):match.start() + 400]
                if '"source_hash"' in window or '"issuer_pubkey"' in window:
                    offenders.append(f"{name}:{text[:match.start()].count(chr(10)) + 1}")
        self.assertEqual(offenders, [], "a canonical message is built in ed25519_verifier.py only")

    def test_verifier_never_imports_the_semantics_module(self):
        """05_architecture §1.1c — a crypto module whose correctness depends on
        importing a semantics module repeats the fail-open shape source_tier_ceiling
        was already bitten by."""
        source = open(os.path.join(HERE, "ed25519_verifier.py"), encoding="utf-8").read()
        self.assertNotIn("import population_match", source)
        self.assertNotIn("from population_match", source)

    def test_no_new_file_assumes_an_install_layout(self):
        """M7.2 — keeps the eventual cross-copy propagation cheap.

        The needles are assembled at runtime so that this file, which must scan
        ITSELF, does not fail on its own assertion text.
        """
        needles = ("base" + "/skills", "templates" + "/.claude")
        for name in ("population_match.py", "risk_statement.py", "test_signature_v3.py",
                     "test_population_match.py", "test_risk_absolute.py",
                     "fixtures_field_cases.json", "fixture_legacy_v2_fact.json"):
            with open(os.path.join(HERE, name), encoding="utf-8") as handle:
                text = handle.read()
            for needle in needles:
                with self.subTest(file=name, needle=needle):
                    self.assertNotIn(needle, text)


class SkillDocumentationTests(unittest.TestCase):
    """T-16 (FR-15 / AC-15) — a WEAK test on purpose: it proves the sentence exists,
    never that it is true. Documentation is layer 4 and this file says so."""

    def test_skillmd_names_the_pre_v3_signature_hole(self):
        path = os.path.join(os.path.dirname(HERE), "SKILL.md")
        text = open(path, encoding="utf-8").read()
        self.assertIn("can be rewritten without invalidating the signature", text)
        self.assertIn("fact-v3", text)
        self.assertIn("out of scope for this slice", text)

    def test_skillmd_states_the_relative_risk_rule(self):
        path = os.path.join(os.path.dirname(HERE), "SKILL.md")
        text = open(path, encoding="utf-8").read()
        self.assertIn("Relative risk never travels alone", text)
        self.assertIn("BASELINE RISK NOT ESTABLISHED", text)


if __name__ == "__main__":
    unittest.main()
