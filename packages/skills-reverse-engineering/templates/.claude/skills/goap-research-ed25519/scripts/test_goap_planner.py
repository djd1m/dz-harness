#!/usr/bin/env python3
"""
Tests for the GOAP planner's three fixed blockers (feature ha-slice-e-goap-blockers).

Blocker 1 — adaptive iteration budget: the package's own shipped high_stakes/STRICT
    demo scenario must find a plan at the DEFAULT budget (no max_iterations override).
Blocker 2 — verdict split: GOAL_UNREACHABLE (proven impossible, decided promptly by a
    reachability closure independent of the budget) vs SEARCH_EXHAUSTED(n) (budget ran
    out; carries retry-with-higher-limit guidance). Two separate tests, one per branch
    (NFR-1) — a combined test could pass by accident on either branch.
Blocker 3 — issuer_keys_available / source_class_verified split: the planner can no
    longer fabricate a "verified" high_stakes plan with zero real key material
    (configure_trusted_issuers is no longer a zero-precondition freebie), and both new
    flags are structurally initial-state-only (preconditions somewhere, effects nowhere).

QE re-check additions (2026-08, findings GAP-2/5/6/7/8 of 08_qe_report.md):
    honest SEARCH_EXHAUSTED wording pinned against the verification-blocked falsifier
    (GAP-2); the `is None` identity hazard pinned as documented behavior (GAP-5);
    max_seconds wall-clock ceiling bounds failure-path latency (GAP-6); PARANOID and
    DEVELOPMENT default budgets exercised by shipped scenarios (GAP-7/GAP-8).

    python3 -m unittest test_goap_planner -v
"""

import sys

# Import NOTHING from this directory before this line. Running these tests used to
# leave a __pycache__ inside the skill directory, and this skill is vendored into 11
# copies kept byte-identical — so the stray directory read as canonical DRIFT and
# turned an unrelated repo test red. (Same guard as test_evidence_provenance.py.)
sys.dont_write_bytecode = True

import time
import unittest

from goap_planner import (
    GOAPResearchPlanner,
    PlanNotFound,
    PlanVerdict,
    RESEARCH_ACTIONS,
    ResearchAction,
    ResearchPlan,
    VerificationMode,
    _default_max_iterations,
    _reachability_closure,
    create_research_goal,
    find_research_plan,
)

# A test double simulating a real signed-source integration: issuer key material
# genuinely held AND a source class capable of Ed25519-signed delivery. The
# package's honest default for the real health sources (PubMed/PMC/DOI/WHO) is
# that NEITHER fact holds.
_CAPABILITY_FLAGS = {"issuer_keys_available", "source_class_verified"}


def _verification_unreachable_scenario():
    """The GAP-2 falsifier (QE re-check, 2026-08): a goal that is
    CLOSURE-REACHABLE but permanently rejected by the STRICT unsigned-claims
    gate. No action in this library can ever produce ``signed_facts`` or
    ``cryptographically_verified``, so every goal node carries unsigned
    claims and STRICT rejects it at EVERY budget (measured: search_exhausted
    at max_iterations=1000 in 0.06s AND at 200000 in 14.16s). The 25 noise
    actions keep open_set non-empty past any practical cap."""
    actions = [ResearchAction(name="extract", preconditions={"start"},
                              effects={"claims_identified"}, cost=1, description="x")]
    actions += [ResearchAction(name=f"n{i}", preconditions={"start"},
                               effects={f"f{i}"}, cost=1, description="n")
                for i in range(25)]
    return {"start"}, {"claims_identified"}, actions


class Blocker2VerdictSplitTests(unittest.TestCase):
    """FR-2 / AC-2 / AC-3 / AM-2 — 'don't know' is a first-class verdict."""

    def test_goal_unreachable_for_sentinel_key(self):
        """AC-2: a goal fact no action's effects ever produce -> GOAL_UNREACHABLE,
        decided promptly and independently of max_iterations (AM-2 confirmation:
        near-identical wall-clock at budget 100 vs 200000 proves the verdict comes
        from a real reachability check, not a relabeled timeout)."""
        initial = {"topic_defined"}
        goal = {"sentinel_fact_no_action_produces"}
        # Sanity: the sentinel really is produced by no action.
        for action in RESEARCH_ACTIONS:
            self.assertNotIn("sentinel_fact_no_action_produces", action.effects)

        timings = {}
        for budget in (100, 200_000):
            t0 = time.perf_counter()
            result = find_research_plan(
                initial, goal,
                verification_mode=VerificationMode.MODERATE,
                max_iterations=budget,
            )
            timings[budget] = time.perf_counter() - t0
            self.assertIsInstance(result, PlanNotFound)
            self.assertIs(result.verdict, PlanVerdict.GOAL_UNREACHABLE)
            self.assertIsNone(result.iterations)
            self.assertIn("sentinel_fact_no_action_produces", result.message)

        # Promptness: both calls decided by the closure (plan budget: sub-10ms;
        # asserted at 50ms for CI-noise margin), and budget-independent — a
        # relabeled timeout at budget 200000 would burn >1s.
        for budget, elapsed in timings.items():
            self.assertLess(
                elapsed, 0.05,
                f"GOAL_UNREACHABLE at max_iterations={budget} took {elapsed:.4f}s — "
                "not the prompt closure-based verdict the contract promises",
            )
        self.assertLess(abs(timings[100] - timings[200_000]), 0.05)

    def test_search_exhausted_with_tiny_budget(self):
        """AC-3 (red half): a genuinely-reachable goal at max_iterations=1 ->
        SEARCH_EXHAUSTED(1) with concrete retry guidance, NOT GOAL_UNREACHABLE."""
        initial, goal = create_research_goal("quick", VerificationMode.MODERATE)
        result = find_research_plan(
            initial, goal,
            verification_mode=VerificationMode.MODERATE,
            max_iterations=1,
        )
        self.assertIsInstance(result, PlanNotFound)
        self.assertIs(result.verdict, PlanVerdict.SEARCH_EXHAUSTED)
        self.assertEqual(result.iterations, 1)
        # Actionable retry guidance: names the knob AND a concrete larger number.
        self.assertIn("max_iterations", result.message)
        self.assertIn("max_iterations=10", result.message)

    def test_search_exhausted_retry_succeeds_with_larger_budget(self):
        """AC-3 (green half): the SAME goal succeeds at a larger budget — proving
        the SEARCH_EXHAUSTED verdict's retry advice is real, not decorative."""
        initial, goal = create_research_goal("quick", VerificationMode.MODERATE)
        result = find_research_plan(
            initial, goal,
            verification_mode=VerificationMode.MODERATE,
            max_iterations=100,
        )
        self.assertIsInstance(result, ResearchPlan)

    def test_plan_not_found_is_falsy(self):
        """Defense in depth: a legacy `if plan:` TRUTHINESS check must degrade
        to the old None semantics, never treat 'search exhausted' as 'plan
        found'."""
        result = PlanNotFound(verdict=PlanVerdict.SEARCH_EXHAUSTED, iterations=1)
        self.assertFalse(bool(result))

    def test_plan_not_found_is_not_none_identity_hazard(self):
        """GAP-5 (QE re-check): the falsy safety net does NOT cover identity
        checks — `result is None` is now always False, so a legacy
        `if plan is not None:` caller reads a no-plan result as SUCCESS. This
        test pins that hazard as documented (not accidental) behavior; the
        loud warning lives in the PlanNotFound / find_research_plan / plan()
        docstrings and in SKILL.md."""
        initial, goal = create_research_goal("quick", VerificationMode.MODERATE)
        result = find_research_plan(
            initial, goal,
            verification_mode=VerificationMode.MODERATE,
            max_iterations=1,
        )
        self.assertIsInstance(result, PlanNotFound)
        self.assertIsNotNone(result)   # the documented hazard: identity checks lie
        self.assertFalse(bool(result))  # while truthiness checks stay safe

    def test_search_exhausted_message_honest_when_verification_gate_blocks(self):
        """GAP-2 (QE re-check): the SEARCH_EXHAUSTED message must not assert
        'the budget was the limiting factor' — for a closure-reachable goal
        that the STRICT unsigned-claims gate permanently rejects, NO budget
        finds a plan (measured falsifier: search_exhausted at both
        max_iterations=1000, 0.06s, and 200000, 14.16s). The message must say
        what is actually true: closure passed => not PROVABLY unreachable,
        which is NOT a guarantee a larger budget succeeds."""
        initial, goal, actions = _verification_unreachable_scenario()

        # Sanity 1: the goal IS closure-reachable (the relaxed check passes).
        self.assertTrue(goal.issubset(_reachability_closure(initial, actions)))
        # Sanity 2: the STRICT rejection is permanent — no action in the
        # library can ever produce the facts that clear unsigned claims.
        for action in actions:
            self.assertNotIn("signed_facts", action.effects)
            self.assertNotIn("cryptographically_verified", action.effects)

        result = find_research_plan(
            initial, goal, actions=actions,
            verification_mode=VerificationMode.STRICT,
            max_iterations=1000,
        )
        self.assertIsInstance(result, PlanNotFound)
        self.assertIs(result.verdict, PlanVerdict.SEARCH_EXHAUSTED)
        self.assertEqual(result.iterations, 1000)

        msg = result.message
        # The honest wording, pinned:
        self.assertIn("not provably unreachable", msg)
        self.assertIn("NOT a guarantee", msg)
        self.assertIn("max_iterations", msg)
        # The refuted over-claims, banned:
        self.assertNotIn("budget was the limiting factor", msg)
        self.assertNotIn("reachable in principle", msg)


class Blocker1AdaptiveBudgetTests(unittest.TestCase):
    """FR-1 / AC-1 — the default budget covers the package's own demo scenarios."""

    def test_default_budget_finds_high_stakes_demo_plan(self):
        """AC-1: the shipped high_stakes/STRICT demo scenario (with the demo's
        signed-source capability flags) finds a plan with NO max_iterations
        argument passed."""
        initial, goal = create_research_goal("high_stakes", VerificationMode.STRICT)
        result = find_research_plan(
            initial | _CAPABILITY_FLAGS, goal,
            verification_mode=VerificationMode.STRICT,
        )
        self.assertIsInstance(result, ResearchPlan)
        self.assertGreater(len(result.actions), 0)

    def test_default_budget_finds_all_moderate_demo_scenarios(self):
        """FR-1 calibration breadth: the MODERATE-mode shipped scenarios also
        succeed at the adaptive default (calibrated across scenarios, not
        extrapolated from one point)."""
        for goal_type in ("exploratory", "competitive", "quick"):
            with self.subTest(goal_type=goal_type):
                initial, goal = create_research_goal(goal_type, VerificationMode.MODERATE)
                result = find_research_plan(
                    initial, goal, verification_mode=VerificationMode.MODERATE
                )
                self.assertIsInstance(result, ResearchPlan)

    def test_default_budget_formula(self):
        """The adaptive default is mode-dominant (the MEASURED dominant variable)
        with a per-goal headroom term, and floors match the calibrated constants."""
        self.assertEqual(
            _default_max_iterations(set("abcde"), VerificationMode.STRICT), 100_000
        )
        self.assertEqual(
            _default_max_iterations(set("abcde"), VerificationMode.PARANOID), 100_000
        )
        self.assertEqual(
            _default_max_iterations(set("abcde"), VerificationMode.MODERATE), 5_000
        )
        # GAP-8 (QE re-check): DEVELOPMENT reaches the MODERATE floor via the
        # else-branch — asserted, not assumed.
        self.assertEqual(
            _default_max_iterations(set("abcde"), VerificationMode.DEVELOPMENT), 5_000
        )
        # Per-goal term takes over past the floor.
        big_goal = {f"g{i}" for i in range(300)}
        self.assertEqual(
            _default_max_iterations(big_goal, VerificationMode.STRICT), 150_000
        )
        self.assertEqual(
            _default_max_iterations(big_goal, VerificationMode.MODERATE), 15_000
        )
        self.assertEqual(
            _default_max_iterations(big_goal, VerificationMode.DEVELOPMENT), 15_000
        )

    def test_default_budget_finds_high_stakes_paranoid_plan(self):
        """GAP-7 (QE re-check): the PARANOID floor is no longer a bare
        extrapolation — this shipped scenario exercises it. PARANOID's search
        behavior is identical to STRICT in this planner (require_verification
        is the only search-relevant switch, shared by both; the 0.99 threshold
        affects reporting), so high_stakes/PARANOID must find a plan at the
        DEFAULT budget exactly as the STRICT twin does."""
        initial, goal = create_research_goal("high_stakes", VerificationMode.PARANOID)
        result = find_research_plan(
            initial | _CAPABILITY_FLAGS, goal,
            verification_mode=VerificationMode.PARANOID,
        )
        self.assertIsInstance(result, ResearchPlan)
        self.assertGreater(len(result.actions), 0)

    def test_development_mode_plan_at_default_budget(self):
        """GAP-8 (QE re-check): DEVELOPMENT mode is a working mode, not a dead
        enum member — a shipped scenario plans successfully at its (MODERATE-
        floor) default budget, with no verification gate applied."""
        initial, goal = create_research_goal("exploratory", VerificationMode.DEVELOPMENT)
        result = find_research_plan(
            initial, goal, verification_mode=VerificationMode.DEVELOPMENT
        )
        self.assertIsInstance(result, ResearchPlan)

    def test_explicit_override_still_respected(self):
        """Regression guard from the plan (task 2.1): an explicit
        max_iterations=200000 caller (the original repro command) still finds
        the high_stakes plan — the sentinel-default only changes behavior when
        the caller omits the argument."""
        initial, goal = create_research_goal("high_stakes", VerificationMode.STRICT)
        result = find_research_plan(
            initial | _CAPABILITY_FLAGS, goal,
            verification_mode=VerificationMode.STRICT,
            max_iterations=200_000,
        )
        self.assertIsInstance(result, ResearchPlan)


class FailurePathLatencyTests(unittest.TestCase):
    """GAP-6 (QE re-check) — the failure path must be boundable.

    Raising the STRICT default budget 1,000 -> 100,000 made the FAILURE path
    ~100x slower (measured on this class of scenario: 9.46s at the default
    budget vs 0.06s at the old cap): any closure-passing goal the search
    cannot satisfy burns the full budget. The fix is an opt-in wall-clock
    ceiling (max_seconds) independent of the iteration count; the DEFAULT
    stays None so the default search remains deterministic across machines
    (decision recorded in ADR 03_adr/001, 'wall-clock default' rejected
    option)."""

    def test_max_seconds_bounds_failure_path_wall_clock(self):
        """With max_seconds=0.5, the verification-blocked falsifier returns
        SEARCH_EXHAUSTED well before burning the 100,000-iteration STRICT
        default budget — bounded wall clock, honest verdict."""
        initial, goal, actions = _verification_unreachable_scenario()
        t0 = time.perf_counter()
        result = find_research_plan(
            initial, goal, actions=actions,
            verification_mode=VerificationMode.STRICT,   # default budget: 100,000
            max_seconds=0.5,
        )
        elapsed = time.perf_counter() - t0
        self.assertLess(
            elapsed, 2.0,
            f"failure path took {elapsed:.2f}s despite max_seconds=0.5 — "
            "the wall-clock ceiling is not bounding latency",
        )
        self.assertIsInstance(result, PlanNotFound)
        self.assertIs(result.verdict, PlanVerdict.SEARCH_EXHAUSTED)
        # The ceiling, not the iteration cap, stopped the search — and the
        # message says so instead of pretending the budget ran out.
        self.assertLess(result.iterations, 100_000)
        self.assertIn("max_seconds", result.message)
        self.assertIn("not provably unreachable", result.message)

    def test_max_seconds_does_not_cut_off_a_findable_plan(self):
        """A generous ceiling never affects a scenario the budget satisfies:
        the success path is unchanged."""
        initial, goal = create_research_goal("quick", VerificationMode.MODERATE)
        result = find_research_plan(
            initial, goal,
            verification_mode=VerificationMode.MODERATE,
            max_seconds=30.0,
        )
        self.assertIsInstance(result, ResearchPlan)


class Blocker3CapabilityFlagSplitTests(unittest.TestCase):
    """FR-3 / AC-4 / AM-1 — no more free 'verified' plans without real keys."""

    def test_high_stakes_reachable_with_keys_and_source_class(self):
        """AC-4a: with a test double supplying both capability facts (a real
        signed-source integration), high_stakes/STRICT finds a plan — exercised
        through the high-level planner so the constructor wiring is covered."""
        planner = GOAPResearchPlanner(
            verification_mode="strict",
            issuer_keys_available=True,
            source_class_verified=True,
        )
        result = planner.plan(goal_type="high_stakes", topic="test")
        self.assertIsInstance(result, ResearchPlan)

    def test_high_stakes_unreachable_with_default_no_keys(self):
        """AC-4b / AM-1 confirmation: the package's REAL default (no genuine
        issuer keys) yields GOAL_UNREACHABLE — never a silently-fabricated
        'verified' plan. Reverting configure_trusted_issuers.preconditions to
        set() flips this test to a fabricated ResearchPlan (proven in the
        discrimination cycle), so this test is the safeguard's tripwire."""
        initial, goal = create_research_goal("high_stakes", VerificationMode.STRICT)
        result = find_research_plan(
            initial, goal, verification_mode=VerificationMode.STRICT
        )
        self.assertIsInstance(result, PlanNotFound)
        self.assertIs(result.verdict, PlanVerdict.GOAL_UNREACHABLE)

        # Same honest default through the high-level planner: a bare issuer
        # DOMAIN LIST is not key possession.
        planner = GOAPResearchPlanner(
            verification_mode="strict",
            trusted_issuers=["pubmed.ncbi.nlm.nih.gov", "who.int"],
        )
        result = planner.plan(goal_type="high_stakes", topic="test")
        self.assertIsInstance(result, PlanNotFound)
        self.assertIs(result.verdict, PlanVerdict.GOAL_UNREACHABLE)

    def test_partial_flags_still_unreachable(self):
        """Two axes are genuinely two axes: neither flag alone unlocks
        high_stakes — keys without a verifiable source class (and vice versa)
        still yield GOAL_UNREACHABLE."""
        initial, goal = create_research_goal("high_stakes", VerificationMode.STRICT)
        for only in sorted(_CAPABILITY_FLAGS):
            with self.subTest(only_flag=only):
                result = find_research_plan(
                    initial | {only}, goal,
                    verification_mode=VerificationMode.STRICT,
                )
                self.assertIsInstance(result, PlanNotFound)
                self.assertIs(result.verdict, PlanVerdict.GOAL_UNREACHABLE)

    def test_new_flags_are_preconditions_never_effects(self):
        """FR-3 structural guard (layer-1 deterministic check): each new flag is
        READ as a precondition somewhere (the split is not cosmetic — the dead
        whitelist_available mistake is not repeated) and PRODUCED by no action
        (no action may manufacture its own key/source-class credibility)."""
        for flag in sorted(_CAPABILITY_FLAGS):
            with self.subTest(flag=flag):
                self.assertTrue(
                    any(flag in a.preconditions for a in RESEARCH_ACTIONS),
                    f"{flag} is never read as a precondition — the split is cosmetic",
                )
                producers = [a.name for a in RESEARCH_ACTIONS if flag in a.effects]
                self.assertEqual(
                    producers, [],
                    f"{flag} is produced for free by {producers} — the "
                    "whitelist_available defect reintroduced",
                )
        # And the dead flag itself is gone from the action graph entirely.
        for action in RESEARCH_ACTIONS:
            self.assertNotIn("whitelist_available", action.preconditions)
            self.assertNotIn("whitelist_available", action.effects)


if __name__ == "__main__":
    unittest.main()
