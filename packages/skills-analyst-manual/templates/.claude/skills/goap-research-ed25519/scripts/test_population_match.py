#!/usr/bin/env python3
"""
ADR-001 Confirmation tests — population applicability (T-9…T-11, T-15, T-18).

    cd .../goap-research-ed25519/scripts && python3 -m unittest discover -s . -p 'test_*.py' -v

Each test names the property it proves. The four field cases are the acceptance bar:
they are the four times a correctly-signed, correctly-sourced fact flipped a real
conclusion, and they are replayed from a COMMITTED fixture, not restated inline.
"""

import itertools
import json
import os
import sys

# Import NOTHING local before this line (a stray __pycache__ in this vendored skill
# reads as canonical drift and turns an unrelated repo test red).
sys.dont_write_bytecode = True

import unittest

import population_match as pm
import check_report_evidence as gate

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures_field_cases.json")


def _load_cases():
    with open(FIXTURES, "r", encoding="utf-8") as handle:
        return json.load(handle)


class FieldReversalTests(unittest.TestCase):
    """T-9 — the four real reversals, each NAMING its discrepancy (AC-1…AC-4)."""

    def setUp(self):
        self.data = _load_cases()

    def _match_for(self, case):
        profile = dict(self.data["patient_profile"])
        if "patient_profile_override" in case:
            profile = dict(case["patient_profile_override"])
        return pm.match_from_fact(case["study_population"], profile)

    def test_four_field_reversals_name_their_discrepancy(self):
        """A verdict alone is worthless: «не просто вердикт, а перечисление того, чем
        именно пациент отличается». Every non-full verdict must carry a discrepancy
        naming the field, the study requirement, the patient value and the source's
        own words."""
        real = [c for c in self.data["cases"] if c["kind"] == "real-field-reversal"]
        self.assertEqual(len(real), 4, "the four field reversals are the acceptance bar")
        for case in real:
            with self.subTest(case=case["id"]):
                match = self._match_for(case)
                self.assertEqual(match.verdict, case["expected_verdict"])
                self.assertEqual(len(match.discrepancies), len(case["expected_discrepancies"]))
                for actual, expected in zip(match.discrepancies, case["expected_discrepancies"]):
                    self.assertEqual(actual.field, expected["field"])
                    self.assertEqual(actual.kind, expected["kind"])
                    self.assertEqual(actual.direction, expected["direction"])
                    self.assertTrue(actual.study_requirement.strip(), "must state the study's criterion")
                    self.assertTrue(actual.patient_value.strip(), "must state the patient's value")
                    self.assertTrue(actual.verbatim.strip(), "must quote the source's own words")
                rendered = pm.render_population_match(match)
                self.assertIn(case["expected_verdict"], rendered)
                for expected in case["expected_discrepancies"]:
                    self.assertIn(expected["field"], rendered)

    def test_eligibility_and_baseline_are_different_failures(self):
        """Cases 1/4 are `partial`, cases 2/3 are `none`, and the difference is the
        criterion KIND, not the analyte. An inclusion-criteria-only model would
        reproduce two of the four reversals and call it done."""
        verdicts = {c["id"]: self._match_for(c).verdict
                    for c in self.data["cases"] if c["kind"] == "real-field-reversal"}
        self.assertEqual(verdicts["testosterone-weight-loss"], "partial")
        self.assertEqual(verdicts["omega3-ldl"], "partial")
        self.assertEqual(verdicts["ed-rct-bmi30"], "none")
        self.assertEqual(verdicts["traverse-cv-safety"], "none")

    def test_synthetic_cases(self):
        """AC-5 (missing patient value) and AC-6 (full)."""
        for case in [c for c in self.data["cases"] if c["kind"] == "synthetic"]:
            with self.subTest(case=case["id"]):
                self.assertEqual(self._match_for(case).verdict, case["expected_verdict"])

    def test_same_matcher_no_per_case_branch(self):
        """FR-5 — all six cases flow through the SAME evaluator with different DATA."""
        for case in self.data["cases"]:
            with self.subTest(case=case["id"]):
                population = pm.parse_study_population(case["study_population"])
                profile = pm.PatientProfile(case.get("patient_profile_override", self.data["patient_profile"]))
                discrepancies = pm.evaluate(population, profile)
                self.assertEqual(pm.derive_verdict(discrepancies), case["expected_verdict"])


class VerdictOrderingTests(unittest.TestCase):
    """T-10 / AM-6 — `unknown` is a distinct FOURTH verdict, never folded into partial."""

    def _population(self, **criteria):
        return pm.parse_study_population({"description": "d", "criteria": criteria})

    def test_unknown_criterion_is_unknown_not_partial(self):
        """The paper does not state the axis. That is not a mild match."""
        population = self._population(
            bmi_min={"kind": "eligibility", "verbatim": "obese adults",
                     "unstated_reason": "the paper reports no BMI inclusion range"})
        match = pm.match(population, pm.PatientProfile({"bmi": 25}))
        self.assertEqual(match.verdict, "unknown")
        self.assertNotEqual(match.verdict, "partial")
        self.assertEqual(match.discrepancies[0].kind, "criterion-unstated")

    def test_missing_patient_value_is_unknown(self):
        """The profile does not carry the axis — never a default, never a guess."""
        population = self._population(
            bmi_min={"op": ">=", "value": 30, "kind": "eligibility", "verbatim": "BMI >= 30"})
        match = pm.match(population, pm.PatientProfile({"sex": "male"}))
        self.assertEqual(match.verdict, "unknown")
        self.assertEqual(match.discrepancies[0].kind, "patient-value-missing")
        self.assertEqual(match.discrepancies[0].direction, "absent")

    def test_wholly_unstated_population_is_unknown_with_its_reason(self):
        population = pm.StudyPopulation.unstated("the abstract never describes who was enrolled")
        match = pm.match(population, pm.PatientProfile({"bmi": 25}))
        self.assertEqual(match.verdict, "unknown")
        self.assertIn("never describes", match.discrepancies[0].study_requirement)

    def test_eligibility_exclusion_outranks_unknown(self):
        """An established exclusion is knowledge; an unestablished criterion is not."""
        population = self._population(
            bmi_min={"op": ">=", "value": 30, "kind": "eligibility", "verbatim": "BMI >= 30"},
            hba1c_max={"op": "<=", "value": 7, "kind": "eligibility", "verbatim": "HbA1c <= 7%"})
        match = pm.match(population, pm.PatientProfile({"bmi": 25}))
        self.assertEqual(match.verdict, "none", "none outranks unknown")

    def test_full_iff_no_discrepancies_over_every_kind_subset(self):
        """D-10, exhaustively: over all 2^4 = 16 subsets of DISCREPANCY_KINDS,
        `derive_verdict(d) == 'full'` IFF `d == []`. Imports the SAME `derive_verdict`
        the runtime calls — one definition of the verdict predicate, shared."""
        def sample(kind):
            return pm.Discrepancy(field="bmi", kind=kind, patient_value="25",
                                  study_requirement="bmi >= 30", verbatim="obese adults",
                                  direction="absent" if kind.endswith(("unstated", "missing")) else "below")

        seen = 0
        for size in range(len(pm.DISCREPANCY_KINDS) + 1):
            for combo in itertools.combinations(pm.DISCREPANCY_KINDS, size):
                seen += 1
                discrepancies = [sample(kind) for kind in combo]
                verdict = pm.derive_verdict(discrepancies)
                self.assertEqual(verdict == "full", len(discrepancies) == 0,
                                 f"biconditional broken for {combo}")
                self.assertIn(verdict, pm.POPULATION_MATCH_VERDICTS)
        self.assertEqual(seen, 16, "2^4 states")

    def test_verdict_cannot_be_asserted_out_of_thin_air(self):
        """D-9 — `derive_verdict` is the ONLY producer. A PopulationMatch whose verdict
        was not derived from its own discrepancies refuses to exist."""
        discrepancy = pm.Discrepancy(field="bmi", kind="eligibility-excluded", patient_value="25",
                                     study_requirement="bmi >= 30", verbatim="BMI >= 30", direction="below")
        with self.assertRaises(pm.PopulationError):
            pm.PopulationMatch(verdict="full", discrepancies=(discrepancy,))
        with self.assertRaises(pm.PopulationError):
            pm.PopulationMatch(verdict="partial", discrepancies=())


class VocabularyTests(unittest.TestCase):
    """T-11 / D-16 — the closed vocabulary fails LOUDLY, never silently."""

    def test_unlisted_criterion_field_raises(self):
        with self.assertRaises(pm.PopulationError) as ctx:
            pm.parse_study_population({"description": "d", "criteria": {
                "dialysis_status": {"op": "==", "value": "none", "kind": "eligibility",
                                    "verbatim": "not on dialysis"}}})
        self.assertIn("CRITERION_FIELDS", str(ctx.exception))

    def test_unit_suffixes_resolve_to_the_same_axis(self):
        self.assertEqual(pm.normalize_field("triglycerides_mg_dl_min"), "triglycerides")
        self.assertEqual(pm.normalize_field("bmi_min"), "bmi")
        self.assertEqual(pm.normalize_field("BMI"), "bmi")

    def test_unrecognised_patient_key_can_never_satisfy_a_criterion(self):
        """The asymmetry is deliberate: a criterion naming an unlisted axis RAISES; a
        patient value naming one is KEPT under its raw key, so the axis reads
        `patient-value-missing` → `unknown`, never `full`."""
        profile = pm.PatientProfile({"homa_ir": 3.1, "bmi": 33})
        self.assertIn("homa_ir", profile.values)
        population = pm.parse_study_population({"description": "d", "criteria": {
            "bmi_min": {"op": ">=", "value": 30, "kind": "eligibility", "verbatim": "BMI >= 30"}}})
        self.assertEqual(pm.match(population, profile).verdict, "full")

    def test_blank_shapes_raise(self):
        """T-2's value-object half: `{description: 'adults', criteria: {}}` is not a shape."""
        with self.assertRaises(pm.PopulationError):
            pm.StudyPopulation(description="   ", criteria=())
        with self.assertRaises(pm.PopulationError):
            pm.StudyPopulation(description="adults", criteria=())
        with self.assertRaises(pm.PopulationError):
            pm.StudyPopulation.unstated("   ")

    def test_criterion_kind_is_never_defaulted(self):
        """A bare scalar cannot state the kind, and the kind decides the verdict."""
        with self.assertRaises(pm.PopulationError) as ctx:
            pm.parse_study_population({"description": "d", "criteria": {"bmi_min": 30}})
        self.assertIn("kind", str(ctx.exception))

    def test_verbatim_is_mandatory(self):
        with self.assertRaises(pm.PopulationError):
            pm.parse_study_population({"description": "d", "criteria": {
                "bmi_min": {"op": ">=", "value": 30, "kind": "eligibility"}}})

    def test_incomparable_patient_value_refuses_loudly(self):
        population = pm.parse_study_population({"description": "d", "criteria": {
            "bmi_min": {"op": ">=", "value": 30, "kind": "eligibility", "verbatim": "BMI >= 30"}}})
        with self.assertRaises(pm.PopulationError):
            pm.match(population, pm.PatientProfile({"bmi": "не измерялся"}))

    def test_renderer_iterates_the_allowlist_not_the_dataclass(self):
        """D-5's sibling for output: DISCREPANCY_KEYS is an allowlist over emitted
        structure, so the renderer's key set is exactly the tuple."""
        self.assertEqual(set(pm.DISCREPANCY_KEYS),
                         {"field", "kind", "patient_value", "study_requirement",
                          "verbatim", "locator", "direction"})


class GateIntegrationTests(unittest.TestCase):
    """T-15 / T-18 — POPULATION_MATCH is load-bearing at the report gate, not decorative."""

    def setUp(self):
        self.data = _load_cases()
        self.case = next(c for c in self.data["cases"] if c["id"] == "ed-rct-bmi30")
        self.fact = {
            "claim": "Erectile dysfunction is reversible in this population",
            "source_url": "https://pubmed.ncbi.nlm.nih.gov/1",
            "evidence_class": "LISTING_ONLY",
            "study_population": self.case["study_population"],
        }

    def test_unmarked_population_mismatch_fires_gate(self):
        bare = ("Conclusion: Erectile dysfunction is reversible in this population, so weight "
                "loss should be recommended.")
        findings, _ = gate.evaluate_population(bare, [self.fact], self.data["patient_profile"])
        self.assertTrue(findings, "an unmarked mismatch must fire")
        self.assertEqual(findings[0].kind, "UNMARKED_POPULATION_MISMATCH")
        self.assertIn("bmi", findings[0].detail)

        marked = ("Conclusion: Erectile dysfunction is reversible in this population "
                  "(POPULATION_MATCH none — the study population required bmi >= 30 and this "
                  "patient's bmi is 25), so the finding does not transfer.")
        findings, _ = gate.evaluate_population(marked, [self.fact], self.data["patient_profile"])
        self.assertFalse(findings, "a marker naming the diverging axis clears it")

    def test_every_occurrence_needs_its_own_population_marker(self):
        claim = self.fact["claim"]
        text = (f"Early on: {claim} (POPULATION_MATCH none — bmi 25 vs bmi >= 30)."
                + " filler." * 150
                + f" Later we repeat that {claim} with no warning at all.")
        findings, _ = gate.evaluate_population(text, [self.fact], self.data["patient_profile"])
        self.assertTrue(findings, "a marker on page 1 does not warn the reader on page 2")

    def test_generic_caveat_without_the_axis_does_not_clear_it(self):
        text = ("Conclusion: Erectile dysfunction is reversible in this population. "
                "Note on study population: results may not generalise.")
        findings, _ = gate.evaluate_population(text, [self.fact], self.data["patient_profile"])
        self.assertTrue(findings, "boilerplate that names no axis tells the reader nothing")

    def test_unknown_verdict_has_its_own_finding_kind(self):
        fact = dict(self.fact, study_population={
            "description": "population not stated", "criteria": {},
            "unstated_reason": "the abstract never describes who was enrolled"})
        text = "Conclusion: Erectile dysfunction is reversible in this population."
        findings, _ = gate.evaluate_population(text, [fact], self.data["patient_profile"])
        self.assertEqual(findings[0].kind, "POPULATION_UNKNOWN_UNMARKED")

    def test_missing_study_population_needs_no_patient_to_be_wrong(self):
        fact = dict(self.fact, study_population={})
        text = "Conclusion: Erectile dysfunction is reversible in this population."
        findings, _ = gate.evaluate_population(text, [fact], None)
        self.assertEqual(findings[0].kind, "MISSING_STUDY_POPULATION")

    def test_legacy_fact_counted_not_folded_into_clean(self):
        """T-18 / D-7 — a used v1/v2 fact gets its OWN named line AND its own finding.

        AMENDED by QE G4. The first version asserted `assertFalse(findings)` and so
        encoded the defect it was written to prevent: the count went up, no finding was
        raised, and `main()` returned 0 on a report resting ENTIRELY on facts the gate
        cannot judge — while this module's own docstring claimed they are «never folded
        into clean (D-7)». A count nobody has to read is the same shape as
        "inconclusive reads as pass".
        """
        legacy = {"claim": "Erectile dysfunction is reversible in this population",
                  "source_url": "u", "evidence_class": "LISTING_ONLY"}
        text = "Conclusion: Erectile dysfunction is reversible in this population."
        findings, counts = gate.evaluate_population(text, [legacy], self.data["patient_profile"])
        self.assertEqual([f.kind for f in findings], ["LEGACY_POPULATION_UNJUDGEABLE"],
                         "unjudgeable is not clean")
        self.assertEqual(counts["legacy-population-unknown"], 1, "…and it is COUNTED, by name")
        rendered = gate.render_population_and_risk(counts, True)
        self.assertIn("legacy-population-unknown", rendered)

    def test_absent_profile_is_printed_never_silently_passed(self):
        """D-17 — unevaluable is never clean, and the gate SAYS which check did not run."""
        text = "Conclusion: Erectile dysfunction is reversible in this population."
        findings, counts = gate.evaluate_population(text, [self.fact], None)
        self.assertFalse(findings)
        self.assertIn(gate.POPULATION_UNCHECKED_LINE, gate.render_population_and_risk(counts, False))


class UnattestedPopulationTests(unittest.TestCase):
    """QE G1 — the slice's central guarantee, for the facts it was meant to protect.

    A pre-v3 signed message does not cover `study_population`. So a legitimately-signed
    v1/v2 fact can be handed a fabricated population in a text editor, with
    `schema_version` pinned to its OWN schema so the signature still verifies, and the
    gate used to answer `POPULATION_MATCH full` with zero findings.

    MEASURED before the fix, against this same committed fixture: `verified=True
    conf=0.5 schema=2`, `signed_fields` correctly omitting `study_population`, counts
    `{'population-checked': 1, 'population-full': 1}`, findings `[]`.
    """

    FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "fixture_legacy_v2_fact.json")

    def _injected_fact(self, **overrides):
        with open(self.FIXTURE, "r", encoding="utf-8") as handle:
            fact = dict(json.load(handle)["fact"])
        fact["study_population"] = {
            "description": "adults aged 18-99, any BMI",
            "criteria": {"bmi_min": {"value": 0, "kind": "baseline",
                                     "verbatim": "any BMI", "locator": "[fabricated]"}},
        }
        fact["schema_version"] = 2  # pinned to its OWN schema, so the signature holds
        fact.update(overrides)
        return fact

    def _report(self, fact):
        return "The finding: %s. See the table.\n" % fact["claim"]

    def test_the_injected_population_still_verifies_which_is_the_premise(self):
        """Not a proof of the fix — the SETUP the fix has to survive. If this ever goes
        red the attack changed shape and the test below is measuring something else."""
        import ed25519_verifier as ev
        if ev.CRYPTO_BACKEND is None:
            self.skipTest("No Ed25519 backend installed")
        fact = self._injected_fact()
        result = ev.Ed25519Verifier().verify_fact(ev.SignedFact.from_dict(fact))
        self.assertTrue(result.verified, "the signature covers the v2 fields and still holds")
        self.assertEqual(result.schema_version, 2)
        self.assertNotIn("study_population", result.signed_fields,
                         "the signed message does not cover the injected field — that IS the hole")

    def test_unattested_population_is_refused_never_matched(self):
        fact = self._injected_fact()
        findings, counts = gate.evaluate_population(self._report(fact), [fact], {"bmi": 25})
        self.assertEqual([f.kind for f in findings], ["UNATTESTED_STUDY_POPULATION"])
        self.assertEqual(counts["population-unattested"], 1)
        self.assertEqual(counts["population-full"], 0,
                         "an unsigned population must never produce a clean full match")
        self.assertEqual(counts["population-checked"], 0,
                         "it is not CHECKED against the patient at all — that is the point")
        self.assertIn("population-unattested", gate.render_population_and_risk(counts, True))

    def test_a_genuine_v3_population_is_still_matched(self):
        """DISCRIMINATION in the other direction: the refusal must be about ATTESTATION,
        not about populations in general. Same fixture, same fabricated population, but
        presented as v3 — now it is evaluated (and, being satisfied, matches full)."""
        fact = self._injected_fact(schema_version=3)
        findings, counts = gate.evaluate_population(self._report(fact), [fact], {"bmi": 25})
        self.assertEqual(counts["population-unattested"], 0)
        self.assertEqual(counts["population-checked"], 1)
        self.assertEqual(counts["population-full"], 1)
        self.assertEqual(findings, [])

    def test_a_malformed_schema_version_reads_as_unattested_not_as_v3(self):
        """QE G6's composition with G1: a version the dispatch cannot parse is UNKNOWN,
        and unknown is never 'attested'. It also must not raise out of the gate."""
        fact = self._injected_fact(schema_version="not-a-number")
        findings, counts = gate.evaluate_population(self._report(fact), [fact], {"bmi": 25})
        self.assertEqual([f.kind for f in findings], ["UNATTESTED_STUDY_POPULATION"])
        self.assertEqual(counts["population-unattested"], 1)

    def test_the_gate_exits_one_on_an_unattested_population(self):
        import tempfile
        fact = self._injected_fact()
        with tempfile.TemporaryDirectory() as tmp:
            report = os.path.join(tmp, "r.md")
            facts = os.path.join(tmp, "f.json")
            profile = os.path.join(tmp, "p.json")
            with open(report, "w", encoding="utf-8") as fh:
                fh.write(self._report(fact))
            with open(facts, "w", encoding="utf-8") as fh:
                json.dump([fact], fh)
            with open(profile, "w", encoding="utf-8") as fh:
                json.dump({"bmi": 25}, fh)
            self.assertEqual(
                gate.main(["--report", report, "--facts", facts, "--profile", profile]), 1)


class LegacyFactExitCodeTests(unittest.TestCase):
    """QE G4 — a report resting entirely on legacy facts must not exit 0.

    MEASURED before the fix: one used fact with no `study_population` produced
    `counts['legacy-population-unknown'] = 1`, ZERO findings, and `main()` returned 0.
    """

    def _write(self, tmp, fact, report_text):
        report = os.path.join(tmp, "r.md")
        facts = os.path.join(tmp, "f.json")
        profile = os.path.join(tmp, "p.json")
        with open(report, "w", encoding="utf-8") as fh:
            fh.write(report_text)
        with open(facts, "w", encoding="utf-8") as fh:
            json.dump([fact], fh)
        with open(profile, "w", encoding="utf-8") as fh:
            json.dump({"bmi": 25}, fh)
        return report, facts, profile

    def test_legacy_only_report_exits_one_with_and_without_a_profile(self):
        import tempfile
        fixture = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "fixture_legacy_v2_fact.json")
        with open(fixture, "r", encoding="utf-8") as handle:
            fact = json.load(handle)["fact"]
        text = ("The finding: %s (LISTING_ONLY, карточка не открывалась).\n" % fact["claim"])
        with tempfile.TemporaryDirectory() as tmp:
            report, facts, profile = self._write(tmp, fact, text)
            self.assertEqual(
                gate.main(["--report", report, "--facts", facts, "--profile", profile]), 1,
                "a report resting on facts the gate cannot judge is unjudged, not clean")
            self.assertEqual(
                gate.main(["--report", report, "--facts", facts]), 1,
                "the verdict does not depend on the patient — the fact is unjudgeable for anyone")

    def test_an_unused_legacy_fact_is_still_not_this_gate_s_business(self):
        """The bound on G4's fix: only USED facts are judged. A ledger may hold legacy
        records the report never leans on, and those are not violations."""
        legacy = {"claim": "some entirely unrelated claim about ferritin kinetics",
                  "source_url": "u", "evidence_class": "LISTING_ONLY"}
        findings, counts = gate.evaluate_population(
            "This report discusses lipoprotein(a) and nothing else at all.", [legacy], {"bmi": 25})
        self.assertEqual(findings, [])
        self.assertEqual(counts["legacy-population-unknown"], 0)


class UnstatedPopulationMarkerTests(unittest.TestCase):
    """QE G5 — the sanctioned escape hatch must not be the one path that is punished.

    `StudyPopulation.unstated(reason)` is the honest way to say the population is
    unknown. Its discrepancy field is the sentinel `(study population)`, and the marker
    rule demanded that literal token appear in the prose, so a report carrying
    `POPULATION_MATCH unknown` plus four natural caveats was STILL flagged
    `POPULATION_UNKNOWN_UNMARKED` (MEASURED).
    """

    def setUp(self):
        self.population = pm.StudyPopulation.unstated(
            "the abstract never describes who was enrolled").to_dict()
        self.fact = {"claim": "Testosterone improved erectile function in this group",
                     "source_url": "https://pubmed.ncbi.nlm.nih.gov/1",
                     "schema_version": 3,
                     "study_population": self.population}

    def _findings(self, text):
        return [f.kind for f in gate.evaluate_population(text, [self.fact], {"bmi": 25})[0]]

    def test_the_sentinel_has_one_home(self):
        """The gate recognises the matcher's constant, not a second copy of the string."""
        match = pm.match(pm.StudyPopulation.unstated("r"), pm.PatientProfile({"bmi": 25}))
        self.assertEqual(match.discrepancies[0].field, pm.UNSTATED_POPULATION_FIELD)

    def test_honest_prose_clears_the_unstated_case(self):
        for caveat in ("Популяция исследования не указана в источнике.",
                       "The study population is not stated by the paper.",
                       "POPULATION_MATCH unknown — study population unknown.",
                       "Популяция исследования неизвестна."):
            with self.subTest(caveat=caveat):
                text = ("Testosterone improved erectile function in this group. " + caveat)
                self.assertEqual(self._findings(text), [],
                                 "an honest sentence saying the population is unknown must clear it")

    def test_generic_boilerplate_still_does_not_clear_it(self):
        """The anti-boilerplate property the axis rule exists for is PRESERVED: saying
        «study population» while saying nothing about it is still not a caveat."""
        text = ("Testosterone improved erectile function in this group. "
                "Note on study population: results may not generalise.")
        self.assertEqual(self._findings(text), ["POPULATION_UNKNOWN_UNMARKED"])

    def test_bare_text_still_fires(self):
        self.assertEqual(self._findings("Testosterone improved erectile function in this group."),
                         ["POPULATION_UNKNOWN_UNMARKED"])

    def test_a_named_axis_still_has_to_be_named(self):
        """The exception is bounded to the sentinel: when the source DOES state an axis,
        the report must still name THAT axis — an 'unknown population' phrase nearby
        does not clear a bmi mismatch."""
        fact = {"claim": "Erectile dysfunction is reversible in this population",
                "source_url": "u", "schema_version": 3,
                "study_population": {"description": "men with obesity", "criteria": {
                    "bmi_min": {"op": ">=", "value": 30, "kind": "eligibility",
                                "verbatim": "BMI >= 30"}}}}
        text = ("Erectile dysfunction is reversible in this population. "
                "POPULATION_MATCH: the study population is not stated in detail.")
        findings, _ = gate.evaluate_population(text, [fact], {"bmi": 25})
        self.assertEqual([f.kind for f in findings], ["UNMARKED_POPULATION_MISMATCH"])


class ModuleHeaderHonestyTests(unittest.TestCase):
    """QE G8 — a header must not claim a property its own code falsifies.

    `population_match.py` said «Pure: no I/O, no network, no global state» while
    `load_field_cases()` opened a file. The SENTENCE was wrong, not the function, so the
    sentence was narrowed — and this test keeps the narrowed claim true by construction.
    """

    SOURCE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "population_match.py")

    def _text(self):
        with open(self.SOURCE, "r", encoding="utf-8") as handle:
            return handle.read()

    def test_the_header_does_not_claim_blanket_purity(self):
        header = self._text().split('"""')[1]
        self.assertNotIn("Pure: no I/O", header)
        self.assertIn("EVALUATION PATH IS I/O-FREE", header)
        self.assertIn("load_field_cases", header)

    def test_load_field_cases_is_the_only_file_opener(self):
        """Layer 1, not reviewer judgment: if a second function ever opens a file, the
        narrowed sentence becomes false and THIS goes red."""
        text = self._text()
        openers = []
        for index, line in enumerate(text.splitlines(), start=1):
            if "open(" not in line or line.strip().startswith("#"):
                continue
            preceding = "\n".join(text.splitlines()[:index])
            owner = [ln for ln in preceding.splitlines() if ln.startswith("def ")]
            openers.append(owner[-1] if owner else f"module level (line {index})")
        self.assertEqual(openers, ["def load_field_cases(path: str) -> Dict[str, Any]:"],
                         f"only load_field_cases may perform I/O; found {openers}")


if __name__ == "__main__":
    unittest.main()
