#!/usr/bin/env python3
"""
ADR-002 Confirmation tests — relative risk never travels alone (T-12…T-14).

    cd .../goap-research-ed25519/scripts && python3 -m unittest discover -s . -p 'test_*.py' -v

T-12 is the load-bearing one and it is written by REFLECTION over every public
callable the module exports, not against a hand-listed set — so a renderer added
next month is covered without editing this file.
"""

import inspect
import sys

sys.dont_write_bytecode = True

import unittest

import risk_statement as rs
import check_report_evidence as gate


def _public_callables(module):
    return [(name, obj) for name, obj in vars(module).items()
            if not name.startswith("_") and callable(obj)
            and getattr(obj, "__module__", None) == module.__name__]


class StructuralBanTests(unittest.TestCase):
    """T-12 — no path emits a relative figure without its absolute counterpart."""

    def test_relative_risk_cannot_be_emitted_by_any_path(self):
        """Reflection over EVERY public callable × a bare relative effect.

        A callable that accepts a lone RelativeEffect and hands back prose carrying
        its value would be exactly the third path DC-2 forbids. Each one must either
        refuse (TypeError/ValueError) or return something that is not user-facing
        prose about the number.
        """
        relative = rs.RelativeEffect(kind="RR", value=21.0)
        checked = 0
        for name, obj in _public_callables(rs):
            with self.subTest(callable=name):
                checked += 1
                try:
                    result = obj(relative)
                except (TypeError, ValueError):
                    continue  # refused — the required shape
                if isinstance(result, str):
                    self.fail(f"{name}() emitted prose from a lone relative effect: {result!r}")
                self.assertNotIsInstance(result, rs.RiskStatement,
                                         f"{name}() built a statement with no absolute half")
        self.assertGreaterEqual(checked, 8, "reflection must actually have covered the module")

    def test_relative_effect_has_no_prose_accessor(self):
        """ADR-002 §2 — no __str__/__format__ override, no accessor returning prose."""
        relative = rs.RelativeEffect(kind="HR", value=0.74)
        self.assertIs(type(relative).__str__, object.__str__,
                      "RelativeEffect must not override __str__")
        self.assertIs(type(relative).__format__, object.__format__,
                      "RelativeEffect must not override __format__")
        for name in dir(relative):
            if name.startswith("_"):
                continue
            attribute = getattr(relative, name)
            if callable(attribute) and not inspect.signature(attribute).parameters:
                self.assertNotIsInstance(attribute(), str,
                                         f"RelativeEffect.{name}() returns user-facing prose")

    def test_thirty_refusal_cases(self):
        """The constructor refuses each omission SEPARATELY, over all 6 relative kinds:
        18 type/omission refusals + 12 blank-reason refusals = 30 (ADR-002 family 1)."""
        refusals = 0
        for kind in rs.RELATIVE_KINDS:
            relative = rs.RelativeEffect(kind=kind, value=2.0)
            with self.subTest(kind=kind, case="omitted"):
                with self.assertRaises(TypeError):
                    rs.RiskStatement(relative)
                refusals += 1
            with self.subTest(kind=kind, case="None"):
                with self.assertRaises(TypeError):
                    rs.RiskStatement(relative, None)
                refusals += 1
            with self.subTest(kind=kind, case="wrong type"):
                with self.assertRaises(TypeError):
                    rs.RiskStatement(relative, "1 excess case per 1394 people")
                refusals += 1
            for blank in ("", "   "):
                with self.subTest(kind=kind, case=f"blank reason {blank!r}"):
                    with self.assertRaises(rs.RiskError):
                        rs.RiskStatement(relative, rs.UnknownBaseline(reason=blank))
                    refusals += 1
        self.assertEqual(refusals, 30, "6 kinds x (3 absolute refusals + 2 blank reasons)")

    def test_unknown_baseline_is_printed_in_the_number_s_slot(self):
        """«если базовый риск неизвестен — так и писать, а не опускать»."""
        statement = rs.RiskStatement(
            rs.RelativeEffect(kind="HR", value=0.74),
            rs.UnknownBaseline(reason="the source reports no control-arm event rate"),
        )
        rendered = rs.render_risk(statement)
        self.assertIn(rs.BASELINE_UNKNOWN_TEXT, rendered)
        self.assertIn("no control-arm event rate", rendered)

    def test_intervention_requires_a_named_nnt(self):
        relative = rs.RelativeEffect(kind="RR", value=0.8)
        absolute = rs.AbsoluteEffect(control_events=10, control_denominator=1000)
        with self.assertRaises(rs.RiskError):
            rs.RiskStatement(relative, absolute, intervention=True)
        statement = rs.RiskStatement(relative, absolute, intervention=True,
                                     nnt=rs.NNT(not_applicable_reason="no treated arm reported"))
        self.assertIn("n/a — no treated arm reported", rs.render_risk(statement))
        with self.assertRaises(rs.RiskError):
            rs.NNT(value=250, not_applicable_reason="both set")
        with self.assertRaises(rs.RiskError):
            rs.NNT()


class NNTFixtureTests(unittest.TestCase):
    """T-14 — both real numeric cases, COMPUTED (FR-7), never hand-assembled strings."""

    def test_nnt_from_field_fixtures(self):
        """Case 1: «в 21 раз выше» is 1 excess case per 1394 → NNT 1394.

        Case 2: «риск удваивается» is 4 per 1000 over 25 years → NNT 250 over that
        window. INTERPRETATION, stated because the brief does not state a baseline:
        the "4 per 1000 over 25 y" figure is surfaced AS GIVEN and read as the excess;
        no control/treated split is inferred, because inventing a denominator is the
        exact harm this module exists to prevent (02_research.md's explicit note).
        """
        first = rs.nnt_from_excess(1, 1394)
        self.assertEqual(first.value, 1394)
        self.assertIsNone(first.not_applicable_reason)

        second = rs.nnt_from_excess(4, 1000, horizon="25 years")
        self.assertEqual(second.value, 250)
        self.assertEqual(second.horizon, "25 years")
        self.assertIn("250 over 25 years", second.render())

    def test_nnt_from_two_arms_is_one_over_the_absolute_difference(self):
        absolute = rs.AbsoluteEffect(control_events=20, control_denominator=1000,
                                     treated_events=10, treated_denominator=1000,
                                     horizon="5 years")
        self.assertEqual(rs.nnt_from_absolute(absolute).value, 100)

    def test_undefined_nnt_is_named_never_infinity_or_zero(self):
        """D-15 — the failure mode is a NAMED reason, not a number that lies."""
        for nnt in (rs.nnt_from_excess(0, 1000),
                    rs.nnt_from_excess(1, 0),
                    rs.nnt_from_excess("n/a", 1000),
                    rs.nnt_from_absolute(rs.UnknownBaseline(reason="no control arm reported")),
                    rs.nnt_from_absolute(rs.AbsoluteEffect(control_events=5, control_denominator=100)),
                    rs.nnt_from_absolute(rs.AbsoluteEffect(control_events=5, control_denominator=100,
                                                           treated_events=5, treated_denominator=100))):
            self.assertIsNone(nnt.value)
            self.assertTrue(str(nnt.not_applicable_reason).strip())
            self.assertIn("n/a", nnt.render())
        with self.assertRaises(rs.RiskError):
            rs.NNT(value=float("inf"))

    def test_full_rendering_of_the_field_case(self):
        statement = rs.RiskStatement(
            rs.RelativeEffect(kind="RR", value=21.0),
            rs.AbsoluteEffect(control_events=1, control_denominator=1394),
            nnt=rs.nnt_from_absolute(rs.AbsoluteEffect(control_events=1, control_denominator=1394)),
        )
        rendered = rs.render_risk(statement)
        self.assertIn("RR 21 (relative)", rendered)
        self.assertIn("1 per 1394", rendered)
        self.assertIn("observational association", rendered)


class ReportBeltTests(unittest.TestCase):
    """T-13 (AM-3, SAFEGUARD) — the belt must actually FIRE on a real input."""

    def _exit_code(self, text):
        return 1 if gate.scan_relative_risk(text) else 0

    def test_relative_risk_without_absolute_fires_report_gate(self):
        bare = "Вывод: у него риск инфаркта выше в 21 раз, поэтому нужно действовать немедленно."
        findings = gate.scan_relative_risk(bare)
        self.assertTrue(findings, "a bare 21x must not pass")
        self.assertEqual(findings[0].kind, "RELATIVE_RISK_WITHOUT_ABSOLUTE")
        self.assertEqual(self._exit_code(bare), 1)

        paired = ("Вывод: у него риск инфаркта выше в 21 раз — это 1 избыточный случай "
                  "на 1394 человека.")
        self.assertEqual(self._exit_code(paired), 0, "the absolute companion clears it")

    def test_doubles_without_absolute_fires_too(self):
        bare = "При таком уровне риск удваивается."
        self.assertEqual(self._exit_code(bare), 1)
        paired = "При таком уровне риск удваивается — это 4 на 1000 человек за 25 лет."
        self.assertEqual(self._exit_code(paired), 0)

    def test_english_and_hazard_ratio_forms(self):
        self.assertEqual(self._exit_code("The risk doubles in this cohort."), 1)
        self.assertEqual(self._exit_code("Mortality fell (HR 0.74)."), 1)
        self.assertEqual(self._exit_code("Mortality fell (HR 0.74); absolute risk 2 per 1000."), 0)

    def test_explicit_unknown_baseline_sentence_clears_the_belt(self):
        text = ("Mortality fell (HR 0.74). " + rs.BASELINE_UNKNOWN_TEXT +
                " — the source reports no control-arm event rate.")
        self.assertEqual(self._exit_code(text), 0)

    def test_the_russian_adverb_does_not_clear_the_belt(self):
        """QE G7 — `абсолютн` also matched the FILLER ADVERB «абсолютно».

        MEASURED before the fix: `scan_relative_risk('Риск удваивается, это абсолютно
        доказано.')` returned NO findings, while the same sentence without the adverb
        returned `['RELATIVE_RISK_WITHOUT_ABSOLUTE']` — a rhetorical word disarmed the
        belt, which is the worst possible clearing condition for a medical report.
        """
        self.assertEqual(self._exit_code("Риск удваивается, это абсолютно доказано."), 1)
        self.assertEqual(self._exit_code("Риск удваивается, это доказано."), 1,
                         "the control: the adverb was the ONLY difference")

    def test_genuine_adjectival_forms_still_clear_it(self):
        """DISCRIMINATION in the other direction: the fix must not blind the belt to a
        real absolute figure. Every declension of the ADJECTIVE still clears — the fix
        is a lookahead, not a hand-kept list of endings."""
        for phrase in ("абсолютный риск 4 на 1000",
                       "абсолютное снижение составило 2 случая",
                       "в абсолютных числах это 3 человека",
                       "абсолютная разница — 1 случай",
                       "с абсолютным риском 5 на 1000"):
            with self.subTest(phrase=phrase):
                self.assertEqual(self._exit_code("Риск удваивается: " + phrase + "."), 0)

    def test_the_belt_declares_itself_a_belt(self):
        """D-19 — the gate's OWN output must say the scan matches formats, not meaning,
        so nobody quotes it as evidence that the property holds."""
        rendered = gate.render_population_and_risk({}, True)
        self.assertIn("FORMATS, not meaning", rendered)
        self.assertIn("test_risk_absolute.py", rendered)


if __name__ == "__main__":
    unittest.main()
