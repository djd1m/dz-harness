#!/usr/bin/env python3
"""
Relative risk never travels alone.

    "21× higher risk of heart attack"   is   1 excess case per 1394 people.
    "the risk doubles"                  is   4 per 1000 over 25 years.

Both sentences are true. Only one of each pair is interpretable, and the
uninterpretable one is the one that gets quoted. This module makes the
interpretable half STRUCTURALLY non-optional: `RiskStatement(relative, absolute)`
has two required positional arguments, and `absolute` is either a real
`AbsoluteEffect` or an explicit `UnknownBaseline(reason=…)`. A caller with no
baseline data cannot omit the absolute half — it must SAY the baseline is unknown,
and that sentence is printed in the slot where the number would have been:

    BASELINE RISK NOT ESTABLISHED

WHAT THIS MODULE DOES NOT CLAIM (D-19, ADR-002 §3)
    It cannot stop an agent from writing «в 21 раз выше» in its own free prose. The
    typed path here is the guarantee (`test_risk_absolute.py::
    test_relative_risk_cannot_be_emitted_by_any_path`); the report-gate scan in
    `check_report_evidence.py` is a BELT over prose the constructor never sees, it
    matches FORMATS not meaning, and it may never be cited as evidence that the
    property holds.

Stdlib only. Pure: no I/O, no network, no global state.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Optional, Union

# Grammar: the shapes a source may report an effect in. A new study reports a new
# NUMBER, not a new shape — so this list is grammar, not content.
RELATIVE_KINDS = ("RR", "HR", "OR", "IRR", "fold-change", "percent-change")

# ALLOWLIST OVER EMITTED STRUCTURE. `render_risk()` builds its output solely by
# iterating this tuple; a field added to RiskStatement without being added here is
# simply not printed — the safe direction.
RISK_KEYS = ("relative", "absolute", "nnt", "horizon", "population_match")

BASELINE_UNKNOWN_TEXT = "BASELINE RISK NOT ESTABLISHED"


class RiskError(ValueError):
    """Every refusal in this module (a ValueError subclass, so existing handlers work)."""


@dataclass(frozen=True)
class RelativeEffect:
    """A RATIO of two risks — and therefore not a risk.

    Deliberately has NO `__str__`, NO `__format__` and no accessor returning
    user-facing prose. The value is reachable in output only through a
    `RiskStatement` that already carries its absolute counterpart (ADR-002 §2).
    """

    kind: str
    value: float
    ci: Optional[str] = None

    def __post_init__(self) -> None:
        if self.kind not in RELATIVE_KINDS:
            raise RiskError(f"relative kind {self.kind!r} must be one of {RELATIVE_KINDS}")
        try:
            value = float(self.value)
        except (TypeError, ValueError):
            raise RiskError(f"relative value {self.value!r} is not a number") from None
        if not math.isfinite(value):
            raise RiskError("relative value must be finite")
        object.__setattr__(self, "value", value)


@dataclass(frozen=True)
class AbsoluteEffect:
    """Events over a stated denominator, over a stated horizon. NOT a percentage
    with no denominator."""

    control_events: float
    control_denominator: float
    treated_events: Optional[float] = None
    treated_denominator: Optional[float] = None
    horizon: Optional[str] = None

    def __post_init__(self) -> None:
        for name in ("control_events", "control_denominator", "treated_events", "treated_denominator"):
            value = getattr(self, name)
            if value is None:
                continue
            try:
                number = float(value)
            except (TypeError, ValueError):
                raise RiskError(f"{name} must be a number, got {value!r}") from None
            if not math.isfinite(number) or number < 0:
                raise RiskError(f"{name} must be a finite, non-negative number, got {value!r}")
            object.__setattr__(self, name, number)
        if self.control_denominator <= 0:
            raise RiskError("control_denominator must be > 0 — a rate needs a denominator")
        if (self.treated_events is None) != (self.treated_denominator is None):
            raise RiskError(
                "treated_events and treated_denominator must be supplied together — half a treated "
                "arm cannot produce an absolute risk difference"
            )
        if self.treated_denominator is not None and self.treated_denominator <= 0:
            raise RiskError("treated_denominator must be > 0")

    def control_rate(self) -> float:
        return self.control_events / self.control_denominator

    def treated_rate(self) -> Optional[float]:
        if self.treated_events is None or self.treated_denominator is None:
            return None
        return self.treated_events / self.treated_denominator

    def render(self) -> str:
        if self.treated_rate() is None:
            body = f"{_num(self.control_events)} per {_num(self.control_denominator)}"
        else:
            body = (f"{_num(self.control_events)} per {_num(self.control_denominator)} (control) vs "
                    f"{_num(self.treated_events)} per {_num(self.treated_denominator)} (treated)")
        return body + (f" over {self.horizon}" if self.horizon else "")


@dataclass(frozen=True)
class UnknownBaseline:
    """The source reports no control-arm event rate — AND WE SAY SO, with a reason.

    `reason=""` raises. A degradation whose cause is not recorded is
    indistinguishable from a bug (the same rule as `create_listing_fact(reason=…)`).
    """

    reason: str

    def __post_init__(self) -> None:
        if not isinstance(self.reason, str) or not self.reason.strip():
            raise RiskError(
                "UnknownBaseline requires a non-empty reason — 'how many times' is known, "
                "'how many people' is not, and the reader must be told which"
            )

    def render(self) -> str:
        return f"{BASELINE_UNKNOWN_TEXT} — {self.reason.strip()}"


@dataclass(frozen=True)
class NNT:
    """Number Needed to Treat/Harm. Exactly one of `value` / `not_applicable_reason`."""

    value: Optional[float] = None
    not_applicable_reason: Optional[str] = None
    horizon: Optional[str] = None

    def __post_init__(self) -> None:
        has_value = self.value is not None
        has_reason = self.not_applicable_reason is not None and str(self.not_applicable_reason).strip() != ""
        if has_value == has_reason:
            raise RiskError(
                "NNT carries exactly one of value / not_applicable_reason — "
                "an unnamed missing NNT is the thing this class exists to prevent"
            )
        if has_value:
            try:
                number = float(self.value)
            except (TypeError, ValueError):
                raise RiskError(f"NNT value {self.value!r} is not a number") from None
            if not math.isfinite(number) or number <= 0:
                raise RiskError(
                    f"NNT value must be finite and > 0, got {self.value!r}. An infinite NNT is a "
                    f"NAMED not_applicable_reason, never a number"
                )
            object.__setattr__(self, "value", number)

    def render(self) -> str:
        if self.value is None:
            return f"n/a — {str(self.not_applicable_reason).strip()}"
        text = _num(self.value)
        return text + (f" over {self.horizon}" if self.horizon else "")


AbsoluteHalf = Union[AbsoluteEffect, UnknownBaseline]


@dataclass(frozen=True)
class RiskStatement:
    """`relative` and `absolute` are REQUIRED POSITIONAL arguments. There is no
    default, and no `None` path (ADR-002 §1, D-11)."""

    relative: RelativeEffect
    absolute: AbsoluteHalf
    intervention: bool = False
    nnt: Optional[NNT] = None
    horizon: Optional[str] = None
    population_match: Optional[str] = None

    def __post_init__(self) -> None:
        if not isinstance(self.relative, RelativeEffect):
            raise TypeError(f"relative must be a RelativeEffect, got {type(self.relative).__name__}")
        if not isinstance(self.absolute, (AbsoluteEffect, UnknownBaseline)):
            raise TypeError(
                f"absolute must be an AbsoluteEffect or an explicit UnknownBaseline(reason=…), got "
                f"{type(self.absolute).__name__}. A relative effect may not travel alone (DC-2)."
            )
        if self.nnt is not None and not isinstance(self.nnt, NNT):
            raise TypeError(f"nnt must be an NNT, got {type(self.nnt).__name__}")
        if self.intervention and self.nnt is None:
            raise RiskError(
                "intervention=True requires an NNT — computed from the absolute figures, or a "
                "named not_applicable_reason (D-13)"
            )


def _num(value: float) -> str:
    number = float(value)
    if abs(number - round(number)) < 1e-9:
        return str(int(round(number)))
    return f"{number:.4g}"


def nnt_from_excess(excess_events: float, denominator: float, horizon: Optional[str] = None) -> NNT:
    """`NNT = M / N` from an "N excess cases per M people" figure (FR-7, FR-8).

    "1 excess case per 1394" → 1394.  "4 per 1000 over 25 years" → 250 over 25 years.
    Never raises for an unusable input, never returns Infinity or 0: an NNT that
    cannot be computed comes back as a NAMED reason (D-15).
    """
    try:
        excess = float(excess_events)
        total = float(denominator)
    except (TypeError, ValueError):
        return NNT(not_applicable_reason=f"non-numeric input ({excess_events!r} per {denominator!r})",
                   horizon=horizon)
    if not math.isfinite(excess) or not math.isfinite(total):
        return NNT(not_applicable_reason="non-finite input", horizon=horizon)
    if total <= 0:
        return NNT(not_applicable_reason="denominator is not positive — no population to count over",
                   horizon=horizon)
    if excess == 0:
        return NNT(not_applicable_reason="no excess cases reported — the absolute difference is zero, "
                                         "so no finite NNT exists", horizon=horizon)
    return NNT(value=abs(total / excess), horizon=horizon)


def nnt_from_absolute(absolute: AbsoluteHalf, horizon: Optional[str] = None) -> NNT:
    """`NNT = 1 / |ARC − ART|` — COMPUTED from the two arms, never supplied as prose (D-14)."""
    if isinstance(absolute, UnknownBaseline):
        return NNT(not_applicable_reason=f"cannot be computed without a baseline — {absolute.reason.strip()}",
                   horizon=horizon)
    if not isinstance(absolute, AbsoluteEffect):
        raise TypeError(f"nnt_from_absolute needs an AbsoluteEffect or UnknownBaseline, got "
                        f"{type(absolute).__name__}")
    treated = absolute.treated_rate()
    if treated is None:
        return NNT(not_applicable_reason="observational association, no intervention arm compared",
                   horizon=horizon or absolute.horizon)
    difference = abs(absolute.control_rate() - treated)
    if difference == 0:
        return NNT(not_applicable_reason="the two arms have the same event rate — no finite NNT exists",
                   horizon=horizon or absolute.horizon)
    return NNT(value=1.0 / difference, horizon=horizon or absolute.horizon)


def render_risk(statement: RiskStatement) -> str:
    """THE ONLY exit. Builds output solely by iterating RISK_KEYS; there is no
    `__str__`, no `format()`, and no accessor on RelativeEffect returning prose."""
    if not isinstance(statement, RiskStatement):
        raise TypeError(f"render_risk needs a RiskStatement, got {type(statement).__name__}")
    slots = {key: getattr(statement, key, None) for key in RISK_KEYS}
    relative = slots["relative"]
    lines = [f"risk: {relative.kind} {_num(relative.value)} (relative)"
             + (f", CI {relative.ci}" if relative.ci else "")]
    lines.append(f"  absolute: {slots['absolute'].render()}")
    if slots["nnt"] is not None:
        lines.append(f"  NNT: {slots['nnt'].render()}")
    elif statement.intervention:  # unreachable: __post_init__ requires nnt (D-13)
        lines.append("  NNT: n/a — not supplied")
    if slots["horizon"]:
        lines.append(f"  horizon: {slots['horizon']}")
    if slots["population_match"]:
        lines.append(f"  {slots['population_match']}")
    return "\n".join(lines)


__all__ = [
    "RELATIVE_KINDS", "RISK_KEYS", "BASELINE_UNKNOWN_TEXT", "RiskError",
    "RelativeEffect", "AbsoluteEffect", "UnknownBaseline", "NNT", "RiskStatement",
    "nnt_from_excess", "nnt_from_absolute", "render_risk",
]
