#!/usr/bin/env python3
"""
GOAP Research Planner with Ed25519 Verification

Enhanced Goal-Oriented Action Planning for research tasks with
cryptographic provenance and tamper-evidence support.

Features:
- A* search for optimal research paths
- Ed25519 signature verification integration
- Verification penalty in cost function
- Citation chain management
- Trusted issuer whitelist support
"""

import heapq
import json
import hashlib
import time
from dataclasses import dataclass, field, asdict
from typing import Dict, FrozenSet, Set, List, Optional, Tuple, Any, Union
from datetime import datetime
from enum import Enum


class VerificationMode(Enum):
    """Research verification modes with different thresholds."""
    DEVELOPMENT = 0.75
    MODERATE = 0.85
    STRICT = 0.95
    PARANOID = 0.99


@dataclass
class ResearchAction:
    """Represents a research action with preconditions, effects, and verification."""
    name: str
    preconditions: Set[str]
    effects: Set[str]
    cost: int
    description: str = ""
    requires_verification: bool = False
    verification_type: Optional[str] = None  # 'signature', 'chain', 'multi-sig'
    
    def is_applicable(self, state: Set[str]) -> bool:
        """Check if action can be executed in current state."""
        return self.preconditions.issubset(state)
    
    def apply(self, state: Set[str]) -> Set[str]:
        """Apply action to state and return new state."""
        return state.union(self.effects)
    
    def get_total_cost(self, verification_enabled: bool = True) -> int:
        """Get total cost including verification overhead."""
        if verification_enabled and self.requires_verification:
            return self.cost + 1  # Verification overhead
        return self.cost


@dataclass(order=True)
class PlanNode:
    """Node in the A* search tree with verification tracking."""
    f_cost: float
    g_cost: float = field(compare=False)
    state: Set[str] = field(compare=False)
    actions: List[str] = field(compare=False)
    unsigned_claims: int = field(compare=False, default=0)


@dataclass
class VerificationResult:
    """Result of a verification operation."""
    verified: bool
    confidence: float
    source: str
    timestamp: str
    signature: Optional[str] = None
    error: Optional[str] = None


@dataclass
class ResearchPlan:
    """Complete research plan with metadata."""
    actions: List[str]
    total_cost: float
    state_progression: List[Set[str]]
    verification_mode: VerificationMode
    estimated_confidence: float
    unsigned_claims_count: int
    
    def to_dict(self) -> Dict:
        return {
            'actions': self.actions,
            'total_cost': self.total_cost,
            'state_progression': [list(s) for s in self.state_progression],
            'verification_mode': self.verification_mode.name,
            'estimated_confidence': self.estimated_confidence,
            'unsigned_claims_count': self.unsigned_claims_count
        }


class PlanVerdict(Enum):
    """
    Verdict for a planning attempt that did not produce a plan.

    Two fundamentally different situations that must never share one message
    (precedented in this repo: INSUFFICIENT_DATA in harness-core/src/compounding.ts
    and 'inconclusive' in harness-core/src/skills-verify.ts — "don't know" is a
    first-class verdict, not a failure collapsed into the same bucket as
    "definitely no"):

    - GOAL_UNREACHABLE: proven — no sequence of available actions can ever
      satisfy the goal from the initial state, regardless of budget.
    - SEARCH_EXHAUSTED: not proven unreachable — the search simply did not find
      a plan within its iteration budget. Retrying with a higher
      ``max_iterations`` may succeed.
    """
    GOAL_UNREACHABLE = "goal_unreachable"
    SEARCH_EXHAUSTED = "search_exhausted"


@dataclass
class PlanNotFound:
    """
    First-class "no plan" result carrying WHY no plan was returned.

    Callers must branch on ``isinstance(result, ResearchPlan)`` /
    ``isinstance(result, PlanNotFound)`` rather than truthiness. As defense in
    depth, ``__bool__`` returns False, so legacy TRUTHINESS checks
    (``if plan:`` / ``if not plan:``) keep behaving exactly as they did when
    this function returned ``None``.

    IDENTITY checks are NOT covered by that safety net: ``plan is None`` is
    now ALWAYS False. A caller migrating from the old contract via
    ``if plan is not None:`` will read a no-plan result as success and then
    raise ``AttributeError`` on ``.actions`` — or, worse, silently proceed.
    Migrate every ``is None`` / ``is not None`` check to
    ``isinstance(result, ResearchPlan)``.
    """
    verdict: PlanVerdict
    iterations: Optional[int] = None   # set for SEARCH_EXHAUSTED; None for GOAL_UNREACHABLE
    message: str = ""                  # actionable text; carries retry guidance for SEARCH_EXHAUSTED

    def __bool__(self) -> bool:
        return False


# Extended research actions library with Ed25519 verification support
RESEARCH_ACTIONS = [
    # Setup Actions
    #
    # NOTE on the two capability flags below (historical defect: `whitelist_available`):
    # `issuer_keys_available` (real Ed25519 issuer key material genuinely held) and
    # `source_class_verified` (this class of source is capable of signed delivery at all)
    # are INITIAL-STATE-ONLY facts about the deployment. No action in this library may
    # ever list either of them in `effects` — an action that could manufacture its own
    # key/source-class credibility for free would repeat the `whitelist_available`
    # defect, where a dead flag plus a zero-precondition `configure_trusted_issuers`
    # let the planner fabricate "verified" plans backed by nothing.
    ResearchAction(
        name="configure_trusted_issuers",
        preconditions={"issuer_keys_available"},
        effects={"whitelist_active", "verification_ready"},
        cost=0,
        description="Initialize trusted issuer whitelist (requires real issuer key material)"
    ),
    ResearchAction(
        name="generate_research_keypair",
        preconditions=set(),
        effects={"keypair_available", "signing_ready"},
        cost=1,
        description="Generate Ed25519 keypair for signing"
    ),
    
    # Search Actions
    ResearchAction(
        name="web_search_broad",
        preconditions={"topic_defined"},
        effects={"candidates_found", "subtopics_identified"},
        cost=1,
        description="Initial broad search to identify landscape"
    ),
    ResearchAction(
        name="web_search_verified",
        preconditions={"topic_defined", "whitelist_active", "source_class_verified"},
        effects={"verified_candidates_found", "trusted_sources_identified"},
        cost=2,
        description="Search with priority to trusted issuer sources",
        requires_verification=True,
        verification_type="domain"
    ),
    ResearchAction(
        name="web_search_specific",
        preconditions={"subtopics_identified"},
        effects={"detail_found", "sources_identified"},
        cost=1,
        description="Targeted search for specific information"
    ),
    ResearchAction(
        name="web_search_expert",
        preconditions={"topic_defined"},
        effects={"authorities_found", "expert_opinions_available"},
        cost=2,
        description="Find domain experts and authoritative sources"
    ),
    
    # Content Retrieval Actions
    ResearchAction(
        name="fetch_source",
        preconditions={"sources_identified"},
        effects={"content_retrieved", "full_context_available"},
        cost=2,
        description="Retrieve full content from identified sources"
    ),
    ResearchAction(
        name="fetch_signed_source",
        preconditions={"sources_identified", "whitelist_active", "source_class_verified"},
        effects={"signed_content_retrieved", "signature_verified"},
        cost=3,
        description="Retrieve content with Ed25519 signature verification",
        requires_verification=True,
        verification_type="signature"
    ),
    
    # Extraction Actions
    ResearchAction(
        name="extract_facts",
        preconditions={"content_retrieved"},
        effects={"facts_cataloged", "claims_identified"},
        cost=1,
        description="Extract verifiable claims from content"
    ),
    ResearchAction(
        name="sign_extracted_facts",
        preconditions={"facts_cataloged", "keypair_available"},
        effects={"signed_facts", "researcher_signature_attached"},
        cost=2,
        description="Cryptographically sign extracted facts",
        requires_verification=True,
        verification_type="signature"
    ),
    
    # Verification Actions
    ResearchAction(
        name="verify_claim",
        preconditions={"claims_identified", "sources_identified"},
        effects={"claims_verified"},
        cost=3,
        description="Verify specific claims against sources"
    ),
    ResearchAction(
        name="verify_claim_cryptographic",
        preconditions={"claims_identified", "signed_content_retrieved"},
        effects={"cryptographically_verified"},
        cost=4,
        description="Verify claim with Ed25519 cryptographic proof",
        requires_verification=True,
        verification_type="signature"
    ),
    ResearchAction(
        name="cross_reference",
        preconditions={"facts_cataloged", "sources_identified"},
        effects={"consistency_checked", "contradictions_identified"},
        cost=2,
        description="Check consistency across multiple sources"
    ),
    ResearchAction(
        name="cross_reference_signed",
        preconditions={"signed_facts", "trusted_sources_identified"},
        effects={"signed_consistency_checked", "multi_source_verified"},
        cost=3,
        description="Cross-reference with signed source verification",
        requires_verification=True,
        verification_type="multi-sig"
    ),
    ResearchAction(
        name="find_primary_source",
        preconditions={"claims_identified"},
        effects={"primary_located", "original_source_available"},
        cost=3,
        description="Trace claims to original sources"
    ),
    
    # Citation Chain Actions
    ResearchAction(
        name="build_citation_chain",
        preconditions={"facts_cataloged"},
        effects={"citation_chain_complete"},
        cost=2,
        description="Construct linked chain of cited facts"
    ),
    ResearchAction(
        name="verify_citation_chain",
        preconditions={"citation_chain_complete", "signed_facts"},
        effects={"chain_verified"},
        cost=3,
        description="Verify entire citation chain integrity",
        requires_verification=True,
        verification_type="chain"
    ),
    
    # Analysis Actions
    ResearchAction(
        name="identify_patterns",
        preconditions={"facts_cataloged"},
        effects={"patterns_identified", "themes_emerged"},
        cost=2,
        description="Discover recurring themes and connections"
    ),
    ResearchAction(
        name="timeline_construction",
        preconditions={"facts_cataloged"},
        effects={"chronology_established", "sequence_clear"},
        cost=2,
        description="Establish chronological sequence of events"
    ),
    ResearchAction(
        name="compare_perspectives",
        preconditions={"content_retrieved", "authorities_found"},
        effects={"viewpoints_mapped", "disagreements_clarified"},
        cost=2,
        description="Document different viewpoints on topic"
    ),
    
    # Synthesis Actions
    ResearchAction(
        name="synthesize_findings",
        preconditions={"claims_verified", "patterns_identified"},
        effects={"conclusions_formed", "confidence_assigned"},
        cost=3,
        description="Integrate research into coherent conclusions"
    ),
    ResearchAction(
        name="synthesize_verified_findings",
        preconditions={"cryptographically_verified", "patterns_identified"},
        effects={"verified_conclusions_formed", "high_confidence_assigned"},
        cost=3,
        description="Synthesize cryptographically verified findings"
    ),
    ResearchAction(
        name="generate_report",
        preconditions={"conclusions_formed"},
        effects={"report_delivered", "research_complete"},
        cost=2,
        description="Produce structured research output"
    ),
    ResearchAction(
        name="generate_signed_report",
        preconditions={"conclusions_formed", "keypair_available"},
        effects={"signed_report_delivered", "verification_ledger_attached"},
        cost=3,
        description="Produce cryptographically signed research report",
        requires_verification=True,
        verification_type="signature"
    ),
    
    # Recovery Actions
    ResearchAction(
        name="expand_search",
        preconditions={"dead_end_reached"},
        effects={"new_candidates_found"},
        cost=1,
        description="Broaden search when stuck"
    ),
    ResearchAction(
        name="recover_from_verification_failure",
        preconditions={"signature_invalid"},
        effects={"alternative_source_found"},
        cost=2,
        description="Handle failed signature verification"
    ),
]


def heuristic(state: Set[str], goal: Set[str], unsigned_claims: int = 0) -> float:
    """
    Estimate cost to reach goal from current state.
    
    Includes verification penalty for unsigned claims.
    """
    missing = goal - state
    base_cost = len(missing) * 1.5  # Weighted by average action cost
    verification_penalty = unsigned_claims * 0.5  # Penalty for unsigned content
    return base_cost + verification_penalty


# Adaptive default iteration budgets, calibrated by MEASUREMENT (feature
# ha-slice-e-goap-blockers, 2026-08-04): binary search for the minimal
# max_iterations that finds a plan for each shipped demo scenario showed the
# dominant variable is verification_mode, not goal-set size — STRICT scenarios
# need ~20-100x the iterations of MODERATE ones at comparable goal counts,
# because the strict-mode unsigned-claims rejection narrows the acceptable goal
# nodes drastically. Measured minima: competitive/MODERATE 3-goal = 2,249;
# high_stakes/STRICT 5-goal = 55,128. Floors carry ~2x margin over the worst
# measured scenario of their mode class. PARANOID inherits the STRICT floor:
# its search behavior is identical to STRICT in this planner (the only
# search-relevant switch is require_verification, shared by both modes; the
# 0.99-vs-0.95 threshold affects reporting, not the search), and the floor is
# exercised by a shipped scenario (test_default_budget_finds_high_stakes_
# paranoid_plan runs high_stakes/PARANOID to a plan at the default budget) —
# so "PARANOID = STRICT floor" is a tested identity, not a bare extrapolation.
# DEVELOPMENT shares the MODERATE floor via the else-branch (also tested).
_MODERATE_ITERATIONS_FLOOR = 5_000     # ~2.2x margin over measured competitive/MODERATE minimum (2,249)
_STRICT_ITERATIONS_FLOOR = 100_000     # ~1.8x margin over measured high_stakes/STRICT minimum (55,128)
_ITERATIONS_PER_GOAL_MODERATE = 50     # secondary headroom term for large goal sets
_ITERATIONS_PER_GOAL_STRICT = 500


def _default_max_iterations(goal_state: Set[str], verification_mode: VerificationMode) -> int:
    """Adaptive default search budget (see calibration note above)."""
    if verification_mode in (VerificationMode.STRICT, VerificationMode.PARANOID):
        return max(_STRICT_ITERATIONS_FLOOR, _ITERATIONS_PER_GOAL_STRICT * len(goal_state))
    return max(_MODERATE_ITERATIONS_FLOOR, _ITERATIONS_PER_GOAL_MODERATE * len(goal_state))


def _reachability_closure(initial_state: Set[str], actions: List[ResearchAction]) -> FrozenSet[str]:
    """
    Delete-free forward-chaining reachability closure (classic STRIPS
    relaxed-planning-graph technique).

    Because ``ResearchAction.apply()`` is a pure set-union (state only grows,
    facts are never removed), forward-chaining preconditions -> effects to a
    fixed point is bounded by ``len(actions)`` passes: each action can flip
    from inapplicable to applicable at most once. Cost: O(len(actions)^2) set
    operations — microseconds, and by construction independent of any
    iteration budget.

    SOUNDNESS NOTE: this closure is a *relaxed* check — it ignores the
    unsigned-claims / verification-mode gate entirely. ``goal not <= closure``
    is therefore a SOUND proof of unreachability (the closure is a superset of
    everything the constrained search could ever reach). ``goal <= closure``
    is NOT a guarantee the constrained A* search finds a plan within any given
    budget — which is exactly why SEARCH_EXHAUSTED remains meaningful even
    when the closure says "reachable in principle".
    """
    state = set(initial_state)
    changed = True
    while changed:
        changed = False
        for action in actions:
            if action.preconditions.issubset(state):
                before = len(state)
                state |= action.effects
                if len(state) > before:
                    changed = True
    return frozenset(state)


def find_research_plan(
    initial_state: Set[str],
    goal_state: Set[str],
    actions: List[ResearchAction] = None,
    verification_mode: VerificationMode = VerificationMode.MODERATE,
    max_iterations: Optional[int] = None,
    max_seconds: Optional[float] = None
) -> Union[ResearchPlan, "PlanNotFound"]:
    """
    A* search to find optimal research plan with verification support.

    Args:
        initial_state: Starting conditions
        goal_state: Target conditions to achieve
        actions: Available actions (defaults to RESEARCH_ACTIONS)
        verification_mode: How strict to be about verification
        max_iterations: Maximum search iterations. ``None`` (the default)
            selects an adaptive budget calibrated per verification mode and
            goal-set size (see ``_default_max_iterations``); an explicit value
            is respected unchanged.
        max_seconds: Optional wall-clock ceiling for the search, independent
            of the iteration count. ``None`` (the default) keeps the search
            deterministic (bounded only by ``max_iterations``) — note that on
            the FAILURE path this means the full iteration budget is burned
            (measured: ~7-10s at the default STRICT budget of 100,000 for a
            goal the verification gate never accepts). Latency-sensitive
            callers should pass a ceiling (e.g. ``max_seconds=2.0``); hitting
            it returns SEARCH_EXHAUSTED with the ceiling named in the message.

    Returns:
        ResearchPlan on success, otherwise a PlanNotFound whose ``verdict``
        distinguishes:
        - PlanVerdict.GOAL_UNREACHABLE — proven: no action sequence can ever
          satisfy the goal (decided promptly by a reachability closure, or by
          exhaustive exploration of the state space).
        - PlanVerdict.SEARCH_EXHAUSTED — the iteration budget (or the
          ``max_seconds`` wall-clock ceiling) ran out before a plan was found;
          ``iterations`` carries the iterations spent. This verdict is an
          honest "don't know": the relaxed closure passing means the goal is
          not PROVABLY unreachable, but it is NOT a guarantee that any budget
          will find a plan — the closure ignores the verification-mode gate,
          which can permanently reject every path (see the
          ``_reachability_closure`` soundness note).
        Branch on ``isinstance(result, ResearchPlan)`` — never on truthiness
        alone (PlanNotFound is falsy only as a legacy safety net), and NEVER
        on ``result is None`` (this function no longer returns ``None``; an
        identity check reads a no-plan result as success).
    """
    if actions is None:
        actions = RESEARCH_ACTIONS

    if max_iterations is None:
        max_iterations = _default_max_iterations(goal_state, verification_mode)

    # Check if goal already satisfied
    if goal_state.issubset(initial_state):
        return ResearchPlan(
            actions=[],
            total_cost=0.0,
            state_progression=[initial_state],
            verification_mode=verification_mode,
            estimated_confidence=1.0,
            unsigned_claims_count=0
        )

    # Prompt unreachability proof, independent of max_iterations: if the goal
    # is not inside the delete-free closure, no budget can ever reach it.
    closure = _reachability_closure(initial_state, actions)
    if not goal_state.issubset(closure):
        missing = sorted(goal_state - closure)
        return PlanNotFound(
            verdict=PlanVerdict.GOAL_UNREACHABLE,
            message=(
                "Goal is provably unreachable from the initial state: no sequence of "
                f"available actions can ever produce {missing}. "
                "Raising max_iterations cannot help. If the missing facts are "
                "deployment capabilities (e.g. issuer_keys_available, "
                "source_class_verified), they must be supplied in the initial state "
                "by a real integration — the planner cannot manufacture them."
            )
        )

    # Priority queue
    start_h = heuristic(initial_state, goal_state)
    open_set = [PlanNode(start_h, 0, frozenset(initial_state), [], 0)]
    
    # Track visited states
    visited: Set[frozenset] = set()
    
    # Verification settings
    require_verification = verification_mode in [VerificationMode.STRICT, VerificationMode.PARANOID]
    
    # Optional wall-clock ceiling (GAP-6): independent of the iteration count,
    # so a latency-sensitive caller is not forced to burn the full (large)
    # adaptive budget on a goal the verification gate never accepts.
    deadline = None if max_seconds is None else time.perf_counter() + max_seconds
    time_ceiling_hit = False

    iterations = 0
    while open_set and iterations < max_iterations:
        if deadline is not None and time.perf_counter() >= deadline:
            time_ceiling_hit = True
            break
        iterations += 1
        
        current = heapq.heappop(open_set)
        current_state = set(current.state)
        
        # Goal check
        if goal_state.issubset(current_state):
            # Check if verification requirements are met
            if require_verification and current.unsigned_claims > 0:
                # In strict/paranoid mode, unsigned or invalid claims are rejected.
                continue
            
            # Reconstruct state progression
            states = [initial_state]
            state = initial_state.copy()
            for action_name in current.actions:
                action = next(a for a in actions if a.name == action_name)
                state = action.apply(state)
                states.append(state.copy())
            
            # Calculate confidence based on verification
            base_confidence = 1.0 - (current.unsigned_claims * 0.1)
            estimated_confidence = min(1.0, base_confidence)
            
            return ResearchPlan(
                actions=current.actions,
                total_cost=current.g_cost,
                state_progression=states,
                verification_mode=verification_mode,
                estimated_confidence=estimated_confidence,
                unsigned_claims_count=current.unsigned_claims
            )
        
        # Skip if already visited
        if current.state in visited:
            continue
        visited.add(current.state)
        
        # Expand neighbors
        for action in actions:
            if action.is_applicable(current_state):
                new_state = action.apply(current_state)
                new_state_frozen = frozenset(new_state)
                
                if new_state_frozen not in visited:
                    # Calculate cost with verification overhead
                    action_cost = action.get_total_cost(require_verification)
                    new_g = current.g_cost + action_cost
                    
                    # Track unsigned claims
                    new_unsigned = current.unsigned_claims
                    if 'claims_identified' in new_state and 'signed_facts' not in new_state:
                        new_unsigned += 1
                    if 'signed_facts' in new_state or 'cryptographically_verified' in new_state:
                        new_unsigned = max(0, new_unsigned - 1)
                    
                    new_h = heuristic(new_state, goal_state, new_unsigned)
                    new_f = new_g + new_h
                    
                    new_node = PlanNode(
                        f_cost=new_f,
                        g_cost=new_g,
                        state=new_state_frozen,
                        actions=current.actions + [action.name],
                        unsigned_claims=new_unsigned
                    )
                    heapq.heappush(open_set, new_node)

    # No plan found — distinguish WHY (never conflate the two exits):
    if open_set:
        # Budget (iterations or wall clock) hit with work remaining: an honest
        # "don't know yet". The relaxed closure passing means the goal is NOT
        # PROVABLY unreachable — it does NOT mean a larger budget will find a
        # plan: the closure ignores the verification-mode unsigned-claims
        # gate, which (especially in strict/paranoid mode) can permanently
        # reject every path to the goal (see _reachability_closure's
        # soundness note; this message must never over-claim past it).
        if time_ceiling_hit:
            stopped = (
                f"Search stopped by the wall-clock ceiling (max_seconds={max_seconds}) "
                f"after {iterations} iterations without finding a plan."
            )
        else:
            stopped = (
                f"Search exhausted after {iterations} iterations without finding a plan."
            )
        return PlanNotFound(
            verdict=PlanVerdict.SEARCH_EXHAUSTED,
            iterations=iterations,
            message=(
                stopped + " The relaxed reachability closure passed, so the goal is "
                "not provably unreachable — but that is NOT a guarantee that a larger "
                "budget will find a plan: the closure ignores the verification-mode "
                "unsigned-claims gate, which can permanently reject every path to the "
                "goal (especially in strict/paranoid mode). A retry with a higher "
                f"max_iterations (e.g. max_iterations={max(iterations, 1) * 10}) MAY "
                "succeed; if repeated increases keep exhausting, treat the goal as "
                "unreachable under the active verification constraints instead of "
                "raising the budget further."
            )
        )
    # open_set genuinely emptied: the search exhaustively explored every
    # reachable state without accepting a goal node — a second, stronger,
    # exhaustive proof of unreachability under the active verification
    # constraints (the relaxed closure ignores those constraints, so both
    # outcomes are consistent).
    return PlanNotFound(
        verdict=PlanVerdict.GOAL_UNREACHABLE,
        message=(
            "Search space exhaustively explored (open set emptied) without a plan "
            "satisfying the active verification constraints — the goal is "
            "unreachable under the current verification mode; raising "
            "max_iterations cannot help."
        )
    )


def format_plan(plan: ResearchPlan, action_library: List[ResearchAction] = None) -> str:
    """Format research plan for display."""
    if action_library is None:
        action_library = RESEARCH_ACTIONS
    
    action_map = {a.name: a for a in action_library}
    
    # Verification status indicator
    if plan.verification_mode == VerificationMode.PARANOID:
        mode_indicator = "🔒 PARANOID (0.99)"
    elif plan.verification_mode == VerificationMode.STRICT:
        mode_indicator = "🛡️ STRICT (0.95)"
    elif plan.verification_mode == VerificationMode.MODERATE:
        mode_indicator = "✓ MODERATE (0.85)"
    else:
        mode_indicator = "⚡ DEVELOPMENT (0.75)"
    
    lines = [
        "=" * 70,
        "GOAP RESEARCH PLAN (Ed25519 Enhanced)",
        "=" * 70,
        f"Verification Mode: {mode_indicator}",
        f"Total Cost: {plan.total_cost}",
        f"Steps: {len(plan.actions)}",
        f"Estimated Confidence: {plan.estimated_confidence:.2%}",
        f"Unsigned Claims: {plan.unsigned_claims_count}",
        "",
        "EXECUTION SEQUENCE:",
        "-" * 50,
    ]
    
    for i, action_name in enumerate(plan.actions, 1):
        action = action_map.get(action_name)
        if action:
            # Verification indicator
            if action.requires_verification:
                ver_icon = "🔐"
            else:
                ver_icon = "  "
            
            lines.append(f"\n{ver_icon} Step {i}: {action.name}")
            lines.append(f"    Description: {action.description}")
            lines.append(f"    Cost: {action.cost}" + 
                        (" (+1 verification)" if action.requires_verification else ""))
            lines.append(f"    Requires: {', '.join(action.preconditions) or 'None'}")
            lines.append(f"    Produces: {', '.join(action.effects)}")
            
            if action.verification_type:
                lines.append(f"    Verification: {action.verification_type}")
            
            if i < len(plan.state_progression):
                new_effects = plan.state_progression[i] - plan.state_progression[i-1]
                if new_effects:
                    lines.append(f"    New state: +{', '.join(sorted(new_effects))}")
    
    lines.extend([
        "",
        "=" * 70,
        "FINAL STATE ACHIEVED:",
        "-" * 50,
        ", ".join(sorted(plan.state_progression[-1])) if plan.state_progression else "N/A",
        "",
        "VERIFICATION SUMMARY:",
        "-" * 50,
        f"Mode: {plan.verification_mode.name}",
        f"Threshold: {plan.verification_mode.value}",
        f"Estimated Confidence: {plan.estimated_confidence:.2%}",
        f"Meets Threshold: {'✅ YES' if plan.estimated_confidence >= plan.verification_mode.value else '❌ NO'}",
        "=" * 70,
    ])
    
    return "\n".join(lines)


def create_research_goal(
    goal_type: str,
    verification_mode: VerificationMode = VerificationMode.MODERATE
) -> Tuple[Set[str], Set[str]]:
    """
    Create initial and goal states for common research types.
    
    Args:
        goal_type: One of 'exploratory', 'verified_exploratory', 'verification', 
                   'competitive', 'technology', 'quick', 'high_stakes'
        verification_mode: Affects which goals require verification
    
    Returns:
        Tuple of (initial_state, goal_state)
    """
    initial = {"topic_defined"}
    
    goals = {
        "exploratory": {
            "research_complete",
            "conclusions_formed",
            "patterns_identified",
            "claims_verified"
        },
        "verified_exploratory": {
            "signed_report_delivered",
            "verified_conclusions_formed",
            "chain_verified",
            "high_confidence_assigned"
        },
        "verification": {
            "claims_verified",
            "primary_located",
            "consistency_checked"
        },
        "cryptographic_verification": {
            "cryptographically_verified",
            "chain_verified",
            "signed_report_delivered"
        },
        "competitive": {
            "viewpoints_mapped",
            "conclusions_formed",
            "patterns_identified"
        },
        "verified_competitive": {
            "viewpoints_mapped",
            "verified_conclusions_formed",
            "signed_report_delivered"
        },
        "technology": {
            "conclusions_formed",
            "claims_verified",
            "expert_opinions_available"
        },
        "quick": {
            "facts_cataloged",
            "content_retrieved"
        },
        "high_stakes": {
            "signed_report_delivered",
            "chain_verified",
            "cryptographically_verified",
            "multi_source_verified",
            "verification_ledger_attached"
        }
    }
    
    # Auto-upgrade to verified version in strict/paranoid mode
    if verification_mode in [VerificationMode.STRICT, VerificationMode.PARANOID]:
        upgrades = {
            "exploratory": "verified_exploratory",
            "verification": "cryptographic_verification",
            "competitive": "verified_competitive"
        }
        goal_type = upgrades.get(goal_type, goal_type)
    
    return initial, goals.get(goal_type, goals["exploratory"])


class GOAPResearchPlanner:
    """
    High-level interface for GOAP research planning with Ed25519 verification.
    """
    
    def __init__(
        self,
        verification_mode: str = "moderate",
        trusted_issuers: Optional[List[str]] = None,
        issuer_keys_available: bool = False,
        source_class_verified: bool = False
    ):
        """
        Initialize planner.

        Args:
            verification_mode: 'development', 'moderate', 'strict', or 'paranoid'
            trusted_issuers: List of trusted issuer domains (informational — a
                list of domain strings is NOT evidence of key possession)
            issuer_keys_available: True only when real Ed25519 key material for
                the configured issuers genuinely exists. Default False — the
                package's honest default, since no real issuer keys exist for
                PubMed/PMC/DOI/WHO.
            source_class_verified: True only for source classes actually
                capable of Ed25519-signed delivery. Default False for the same
                reason.
        """
        mode_map = {
            "development": VerificationMode.DEVELOPMENT,
            "moderate": VerificationMode.MODERATE,
            "strict": VerificationMode.STRICT,
            "paranoid": VerificationMode.PARANOID
        }
        self.verification_mode = mode_map.get(verification_mode.lower(), VerificationMode.MODERATE)
        self.trusted_issuers = trusted_issuers or []
        self.issuer_keys_available = issuer_keys_available
        self.source_class_verified = source_class_verified
        self.verification_ledger: List[VerificationResult] = []
    
    def plan(
        self,
        goal_type: str,
        topic: str,
        custom_goals: Optional[Set[str]] = None,
        max_seconds: Optional[float] = None
    ) -> Union[ResearchPlan, PlanNotFound]:
        """
        Generate research plan for given goal type.

        Args:
            goal_type: Type of research (see create_research_goal)
            topic: Research topic (for logging)
            custom_goals: Override default goals
            max_seconds: Optional wall-clock ceiling for the search (see
                find_research_plan) — bounds failure-path latency, which
                otherwise burns the full adaptive iteration budget.

        Returns:
            ResearchPlan on success, or PlanNotFound with a verdict
            (PlanVerdict.GOAL_UNREACHABLE — proven impossible; or
            PlanVerdict.SEARCH_EXHAUSTED — budget ran out; a retry with a
            higher max_iterations MAY succeed, but is not guaranteed to — the
            verification gate can permanently reject every path). Branch on
            ``isinstance(result, ResearchPlan)`` — never on ``result is None``
            (this method no longer returns ``None``; an identity check reads a
            no-plan result as success).
        """
        initial, goal = create_research_goal(goal_type, self.verification_mode)

        if custom_goals:
            goal = custom_goals

        # Deployment capability facts are initial-state-only: no action can
        # produce them (see the RESEARCH_ACTIONS setup note). Each is added
        # only when the deployment genuinely provides it.
        if self.issuer_keys_available:
            initial.add("issuer_keys_available")
        if self.source_class_verified:
            initial.add("source_class_verified")

        return find_research_plan(
            initial_state=initial,
            goal_state=goal,
            verification_mode=self.verification_mode,
            max_seconds=max_seconds
        )
    
    def format_plan(self, plan: ResearchPlan) -> str:
        """Format plan for display."""
        return format_plan(plan)
    
    def export_plan(self, plan: ResearchPlan) -> str:
        """Export plan as JSON."""
        return json.dumps(plan.to_dict(), indent=2)


# Example usage and demonstration
if __name__ == "__main__":
    print("GOAP Research Planner with Ed25519 Verification")
    print("=" * 70)
    
    # Example 1: Standard exploratory research
    print("\n[1] STANDARD EXPLORATORY RESEARCH (Moderate Mode)")
    print("-" * 50)
    
    initial, goal = create_research_goal("exploratory", VerificationMode.MODERATE)
    print(f"Initial State: {initial}")
    print(f"Goal State: {goal}")

    plan = find_research_plan(initial, goal, verification_mode=VerificationMode.MODERATE)
    if isinstance(plan, ResearchPlan):
        print(format_plan(plan))
    else:
        print(f"No plan: {plan.verdict.value} — {plan.message}")

    # Example 2: High-stakes verified research
    print("\n\n[2] HIGH-STAKES VERIFIED RESEARCH (Strict Mode)")
    print("-" * 50)

    initial, goal = create_research_goal("high_stakes", VerificationMode.STRICT)
    print(f"Initial State: {initial}")
    print(f"Goal State: {goal}")

    # Honest default: no real Ed25519 issuer keys exist for the package's
    # actual health sources (PubMed/PMC/DOI/WHO), so high_stakes is provably
    # unreachable — reported as a first-class verdict, not a fabricated plan.
    print("\n[2a] Honest default (no issuer keys):")
    plan = find_research_plan(initial, goal, verification_mode=VerificationMode.STRICT)
    if isinstance(plan, ResearchPlan):
        print(format_plan(plan))
    else:
        print(f"No plan: {plan.verdict.value} — {plan.message}")

    # With a real signed-source integration (issuer key material genuinely
    # held AND a source class capable of signed delivery), the same goal is
    # reachable at the DEFAULT adaptive budget:
    print("\n[2b] With real signed-source integration (issuer_keys_available + source_class_verified):")
    initial_with_keys = initial | {"issuer_keys_available", "source_class_verified"}
    plan = find_research_plan(initial_with_keys, goal, verification_mode=VerificationMode.STRICT)
    if isinstance(plan, ResearchPlan):
        print(format_plan(plan))
    else:
        print(f"No plan: {plan.verdict.value} — {plan.message}")

    # Example 3: Using the high-level planner interface
    print("\n\n[3] HIGH-LEVEL PLANNER INTERFACE")
    print("-" * 50)

    planner = GOAPResearchPlanner(
        verification_mode="strict",
        trusted_issuers=["reuters.com", "nature.com", "arxiv.org"],
        # Test-double capability flags simulating a real signed-source
        # integration; the honest default for both is False.
        issuer_keys_available=True,
        source_class_verified=True
    )

    plan = planner.plan(
        goal_type="verified_exploratory",
        topic="AI safety regulations 2025"
    )

    if isinstance(plan, ResearchPlan):
        print(planner.format_plan(plan))
        print("\nJSON Export:")
        print(planner.export_plan(plan))
    else:
        print(f"No plan: {plan.verdict.value} — {plan.message}")
