#!/usr/bin/env python3
"""
Population applicability — *was this number obtained in people like this patient?*

A signed, correctly-sourced fact can still mislead the one reader who matters. Four
real reversals motivated this module (ADR-001 §"Context"): a testosterone/weight-loss
finding measured in men with obesity applied to a patient at BMI 25; an
erectile-dysfunction RCT that enrolled only BMI >= 30; TRAVERSE's safety reassurance
established in high-cardiovascular-risk men; a +44.5% LDL effect observed at baseline
triglycerides >= 800 mg/dL quoted at 236 mg/dL.

Two criterion KINDS, because the four reversals are two different failures:

    eligibility  — the patient would NOT have been enrolled          → verdict 'none'
    baseline     — enrollable, but his starting value is outside the
                   range the effect was measured FROM                → verdict 'partial'

An inclusion-criteria-only model reproduces two of the four and calls it done.

WHAT THIS MODULE DOES NOT CLAIM
    * that `verbatim` was transcribed truthfully from the source — nothing here can
      check that; it is printed next to every discrepancy so a human can;
    * that the criterion the source used is the criterion that matters clinically;
    * that a `full` verdict means the claim is true. It means the patient is inside
      the population the number came from. Nothing more.

Stdlib only. No network, no global state. THE EVALUATION PATH IS I/O-FREE —
`parse_study_population`, `evaluate`, `derive_verdict`, `match`, `match_from_fact` and
`render_population_match` never touch the filesystem. The single exception is
`load_field_cases()`, which reads the committed fixture so the tests and the README
example replay the SAME artifact; it is not on any evaluation path.

This paragraph used to promise blanket purity while `load_field_cases()` opened a file
two screens below (QE G8). The header is narrowed to the guarantee the code actually
keeps, rather than the function being deleted to fit the header — and
`test_population_match.py` asserts the exception stays the only one.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field as dc_field
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

# --- Grammar (a new study never forces an edit here) --------------------------
CRITERION_OPS = (">=", "<=", ">", "<", "==", "in", "range")
CRITERION_KINDS = ("eligibility", "baseline")

DISCREPANCY_KINDS = (
    "eligibility-excluded",    # the patient would NOT have been enrolled      → 'none'
    "baseline-out-of-range",   # enrollable, but his starting value is outside → 'partial'
    "criterion-unstated",      # the paper does not state this axis            → 'unknown'
    "patient-value-missing",   # the profile does not carry this axis          → 'unknown'
)

DISCREPANCY_DIRECTIONS = ("below", "above", "outside-set", "absent")

POPULATION_MATCH_VERDICTS = ("full", "partial", "none", "unknown")

# The `field` a wholly-unstated population reports. It is a SENTINEL, not an axis:
# there is no criterion to name because the source named none. Exported so the report
# gate can recognise it instead of demanding this literal token appear in the prose —
# the bug that punished the sanctioned `StudyPopulation.unstated(reason)` path (QE G5).
UNSTATED_POPULATION_FIELD = "(study population)"

# ALLOWLIST OVER EMITTED STRUCTURE (ADR-001 §1, D-16's counterpart for output).
# The renderer iterates this tuple, so a field added to Discrepancy without being
# added here is simply NOT PRINTED — the safe direction, and the opposite of a
# blocklist that must anticipate every bad word.
DISCREPANCY_KEYS = (
    "field", "kind", "patient_value", "study_requirement", "verbatim", "locator", "direction",
)

# --- Content wearing grammar's clothes (ADR-001 §1 accepted this knowingly) ----
# A closed list of clinical axes. A thirteenth axis is a reviewed code change.
# The cost is made LOUD, never silent: an unlisted field RAISES at construction
# (D-16). A silently-dropped criterion is exactly how a patient gets told a number
# applies to him — the one outcome this module exists to prevent.
CRITERION_FIELDS = (
    "age", "sex", "bmi", "weight", "baseline_condition", "cv_risk",
    "triglycerides", "ldl", "hba1c", "egfr", "testosterone", "smoking_status",
)

# Unit spellings a source (or a patient profile) may append to a field name.
# `triglycerides_mg_dl_min` and `triglycerides` are the same AXIS; the unit is not
# a new axis. Stripping is exact-suffix only — no fuzzy matching, so an unknown
# spelling still reaches D-16's refusal rather than being guessed at.
UNIT_SUFFIXES = ("mg_dl", "mmol_l", "ng_dl", "nmol_l", "pct", "percent", "kg", "years", "ml_min")

# Comparator spellings a flat criteria dict may use as a key suffix.
_KEY_OP_SUFFIXES = (("_min", ">="), ("_max", "<="), ("_gt", ">"), ("_lt", "<"),
                    ("_in", "in"), ("_range", "range"))

_ORDERED_OPS = (">=", "<=", ">", "<")


class PopulationError(ValueError):
    """Every refusal in this module. A subclass of ValueError so callers that
    already handle malformed populations keep working."""


def normalize_field(name: str) -> str:
    """Map a wire key onto a CRITERION_FIELDS axis, or RAISE (D-16).

    `bmi_min` → `bmi`; `triglycerides_mg_dl_min` → `triglycerides`.
    An unlisted axis is never dropped, never coerced, never ignored.
    """
    if not isinstance(name, str) or not name.strip():
        raise PopulationError("criterion key must be a non-empty string")
    key = name.strip().lower()
    for suffix, _op in _KEY_OP_SUFFIXES:
        if key.endswith(suffix) and len(key) > len(suffix):
            key = key[: -len(suffix)]
            break
    if key in CRITERION_FIELDS:
        return key
    for unit in UNIT_SUFFIXES:
        tail = "_" + unit
        if key.endswith(tail) and key[: -len(tail)] in CRITERION_FIELDS:
            return key[: -len(tail)]
    raise PopulationError(
        f"criterion field {name!r} normalises to {key!r}, which is not in CRITERION_FIELDS "
        f"{CRITERION_FIELDS}. Growing the vocabulary is a reviewed code change; a criterion "
        f"the matcher cannot name must NOT be silently dropped (D-16)."
    )


def _op_for_key(name: str) -> str:
    key = name.strip().lower()
    for suffix, op in _KEY_OP_SUFFIXES:
        if key.endswith(suffix) and len(key) > len(suffix):
            return op
    return "=="


@dataclass(frozen=True)
class Criterion:
    """One comparable statement drawn from the source's own population description.

    `verbatim` is MANDATORY and non-blank: a criterion nobody transcribed is a
    criterion nobody can check. `unstated_reason` marks an axis the paper does not
    state — the honest third state, never a guessed value.
    """

    field: str
    op: str
    value: Any
    kind: str
    verbatim: str
    locator: Optional[str] = None
    unstated_reason: Optional[str] = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "field", normalize_field(self.field))
        if self.kind not in CRITERION_KINDS:
            raise PopulationError(
                f"criterion kind {self.kind!r} must be one of {CRITERION_KINDS}. The kind decides "
                f"whether a mismatch is an EXCLUSION (verdict 'none') or an out-of-range BASELINE "
                f"(verdict 'partial'); defaulting it would silently pick the verdict."
            )
        if not isinstance(self.verbatim, str) or not self.verbatim.strip():
            raise PopulationError(
                f"criterion {self.field!r} needs a non-empty `verbatim` — the source's own words, "
                f"so a reader can check and overrule the machine"
            )
        if self.unstated_reason is not None:
            if not str(self.unstated_reason).strip():
                raise PopulationError(
                    f"criterion {self.field!r}: unstated_reason must say WHY the axis is unstated"
                )
            return  # an unstated axis carries no op/value to validate
        if self.op not in CRITERION_OPS:
            raise PopulationError(f"criterion op {self.op!r} must be one of {CRITERION_OPS}")
        if self.value is None:
            raise PopulationError(
                f"criterion {self.field!r} has no value and no unstated_reason — one of the two is "
                f"required; an absent value is not the same as an axis the paper never stated"
            )
        if self.op == "in" and not isinstance(self.value, (list, tuple)):
            raise PopulationError(f"criterion {self.field!r} with op 'in' needs a list of values")
        if self.op == "range" and (not isinstance(self.value, (list, tuple)) or len(self.value) != 2):
            raise PopulationError(f"criterion {self.field!r} with op 'range' needs [low, high]")

    def requirement_text(self) -> str:
        if self.unstated_reason is not None:
            return f"{self.field}: not stated by the source ({self.unstated_reason})"
        if self.op == "in":
            return f"{self.field} in {list(self.value)}"
        if self.op == "range":
            return f"{self.field} between {self.value[0]} and {self.value[1]}"
        return f"{self.field} {self.op} {self.value}"


@dataclass(frozen=True)
class StudyPopulation:
    """Who the finding was obtained IN, as the source states it.

    Valid only when `description` is non-blank AND (`criteria` non-empty OR
    `unstated_reason` non-empty). `StudyPopulation(description="adults", criteria=())`
    is NOT a shape — that sentinel is what stops `study_population` from becoming
    the next field that is present and meaningless.
    """

    description: str
    criteria: Tuple[Criterion, ...] = ()
    unstated_reason: Optional[str] = None
    locator: Optional[str] = None

    def __post_init__(self) -> None:
        if not isinstance(self.description, str) or not self.description.strip():
            raise PopulationError("StudyPopulation.description must be a non-empty string")
        object.__setattr__(self, "criteria", tuple(self.criteria or ()))
        for criterion in self.criteria:
            if not isinstance(criterion, Criterion):
                raise PopulationError("StudyPopulation.criteria must contain Criterion objects")
        blank_reason = self.unstated_reason is None or not str(self.unstated_reason).strip()
        if not self.criteria and blank_reason:
            raise PopulationError(
                "StudyPopulation needs at least one criterion, or an explicit unstated_reason. "
                "An empty criteria list with no stated reason is indistinguishable from a bug "
                "(the same discipline as create_listing_fact(reason=…))."
            )

    @classmethod
    def unstated(cls, reason: str, description: str = "study population not stated by the source",
                 locator: Optional[str] = None) -> "StudyPopulation":
        """The single constructor for 'the paper does not say'. `reason` is MANDATORY
        and stored verbatim — mirroring `create_listing_fact(reason=…)`."""
        if not isinstance(reason, str) or not reason.strip():
            raise PopulationError("StudyPopulation.unstated() requires a non-empty reason")
        return cls(description=description, criteria=(), unstated_reason=reason.strip(), locator=locator)

    def to_dict(self) -> Dict[str, Any]:
        """The opaque JSON value that crosses into `ed25519_verifier` (never a type)."""
        out: Dict[str, Any] = {"description": self.description}
        if self.locator:
            out["locator"] = self.locator
        if self.unstated_reason:
            out["unstated_reason"] = self.unstated_reason
        criteria: Dict[str, Any] = {}
        for criterion in self.criteria:
            spec: Dict[str, Any] = {"kind": criterion.kind, "verbatim": criterion.verbatim}
            if criterion.unstated_reason is not None:
                spec["unstated_reason"] = criterion.unstated_reason
            else:
                spec["op"] = criterion.op
                spec["value"] = list(criterion.value) if isinstance(criterion.value, tuple) else criterion.value
            if criterion.locator:
                spec["locator"] = criterion.locator
            criteria[criterion.field] = spec
        if criteria:
            out["criteria"] = criteria
        return out


@dataclass(frozen=True)
class PatientProfile:
    """The one person the number is being applied to. A query key, not a record."""

    values: Mapping[str, Any] = dc_field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.values, Mapping):
            raise PopulationError("PatientProfile.values must be a mapping")
        normalized: Dict[str, Any] = {}
        for key, value in self.values.items():
            # ASYMMETRY, ON PURPOSE. A *criterion* naming an unlisted axis RAISES
            # (D-16) — it is a claim the matcher cannot check. A *patient* value
            # naming one is kept under its raw key instead: refusing a whole profile
            # because it carries one extra lab would be a loud failure in a
            # patient-facing flow, and the unsafe direction is closed anyway — an
            # unrecognised patient key can never satisfy a criterion, so the axis
            # reads `patient-value-missing` → verdict `unknown`, never `full`.
            try:
                name = normalize_field(key)
            except PopulationError:
                name = str(key).strip().lower()
            if name in normalized:
                raise PopulationError(
                    f"patient profile has two keys that mean the same axis {name!r} — refusing "
                    f"rather than silently keeping one of them"
                )
            normalized[name] = value
        object.__setattr__(self, "values", normalized)

    def has(self, field: str) -> bool:
        return field in self.values and self.values[field] is not None

    def get(self, field: str) -> Any:
        return self.values.get(field)


@dataclass(frozen=True)
class Discrepancy:
    """A NAMED difference. `«не просто вердикт, а перечисление того, чем именно
    пациент отличается»` — enforced as a construction precondition, not a rendering habit."""

    field: str
    kind: str
    patient_value: str
    study_requirement: str
    verbatim: str
    locator: Optional[str] = None
    direction: str = "outside-set"

    def __post_init__(self) -> None:
        if self.kind not in DISCREPANCY_KINDS:
            raise PopulationError(f"discrepancy kind {self.kind!r} must be one of {DISCREPANCY_KINDS}")
        if self.direction not in DISCREPANCY_DIRECTIONS:
            raise PopulationError(
                f"discrepancy direction {self.direction!r} must be one of {DISCREPANCY_DIRECTIONS}"
            )


def derive_verdict(discrepancies: Sequence[Discrepancy]) -> str:
    """THE ONLY producer of a verdict (D-9), imported by the runtime and the tests alike.

    Load-bearing invariant (D-10): `verdict == "full"` IFF `discrepancies == []`.
    `unknown` outranks `partial` but not `none` — an established exclusion is
    knowledge; an unestablished criterion is not, and must never be reported as a
    milder kind of match.
    """
    kinds = {d.kind for d in discrepancies}
    if "eligibility-excluded" in kinds:
        return "none"
    if kinds & {"criterion-unstated", "patient-value-missing"}:
        return "unknown"
    if discrepancies:
        return "partial"
    return "full"


@dataclass(frozen=True)
class PopulationMatch:
    """Derived, never asserted. There is no settable verdict."""

    verdict: str
    discrepancies: Tuple[Discrepancy, ...] = ()
    study_description: str = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "discrepancies", tuple(self.discrepancies or ()))
        expected = derive_verdict(self.discrepancies)
        if self.verdict != expected:
            raise PopulationError(
                f"PopulationMatch verdict {self.verdict!r} was not derived from its discrepancies "
                f"(derive_verdict says {expected!r}). The verdict has exactly one home (D-9)."
            )
        if self.verdict not in POPULATION_MATCH_VERDICTS:
            raise PopulationError(f"verdict {self.verdict!r} must be one of {POPULATION_MATCH_VERDICTS}")

    @classmethod
    def from_discrepancies(cls, discrepancies: Sequence[Discrepancy],
                           study_description: str = "") -> "PopulationMatch":
        return cls(verdict=derive_verdict(discrepancies), discrepancies=tuple(discrepancies),
                   study_description=study_description)


# --------------------------------------------------------------------- parsing
def parse_criterion(key: str, spec: Any) -> Criterion:
    """Parse ONE entry of the flat `criteria` dict.

    WIRE FORM — deliberate deviation from FR-2's bare-scalar example, recorded here
    because it is a contract: the value is a SPEC OBJECT, not a scalar. A scalar
    cannot state the criterion's `kind`, and the kind is what decides 'none' (you
    would have been excluded) versus 'partial' (the effect was simply not measured
    from where you stand). Defaulting it would let the wire format silently pick the
    verdict — the exact class of failure this slice exists to prevent.

        {"bmi_min": {"value": 30, "kind": "baseline",
                     "verbatim": "men with obesity (BMI >= 30 kg/m2)",
                     "locator": "[Methods, Participants]"}}
    """
    if not isinstance(spec, Mapping):
        raise PopulationError(
            f"criterion {key!r} must be an object carrying at least `kind` and `verbatim` "
            f"(got {type(spec).__name__}). A bare scalar cannot state the criterion kind, and "
            f"the kind decides the verdict — see parse_criterion's docstring."
        )
    unknown_keys = set(spec) - {"value", "op", "kind", "verbatim", "locator", "unstated_reason"}
    if unknown_keys:
        raise PopulationError(f"criterion {key!r} carries unknown keys {sorted(unknown_keys)}")
    return Criterion(
        field=key,
        op=str(spec.get("op") or _op_for_key(key)),
        value=spec.get("value"),
        kind=str(spec.get("kind", "")),
        verbatim=str(spec.get("verbatim", "")),
        locator=spec.get("locator"),
        unstated_reason=spec.get("unstated_reason"),
    )


def parse_study_population(data: Any) -> StudyPopulation:
    """Parse the opaque JSON dict that `ed25519_verifier` carries but never interprets.

    The direction of the dependency matters: the verifier NEVER imports this module
    (a crypto module whose correctness depends on a semantics module is the
    fail-open shape `source_tier_ceiling` was already bitten by). It validates the
    SHAPE; this function is the only place that reads the MEANING.
    """
    if not isinstance(data, Mapping):
        raise PopulationError("study_population must be a JSON object")
    criteria_raw = data.get("criteria") or {}
    if not isinstance(criteria_raw, Mapping):
        raise PopulationError("study_population.criteria must be an object keyed by field name")
    criteria = tuple(parse_criterion(key, spec) for key, spec in criteria_raw.items())
    return StudyPopulation(
        description=str(data.get("description", "")),
        criteria=criteria,
        unstated_reason=data.get("unstated_reason"),
        locator=data.get("locator"),
    )


# ------------------------------------------------------------------ evaluation
def _as_number(field: str, who: str, value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        raise PopulationError(
            f"{who} value {value!r} for {field!r} is not comparable as a number, but the criterion "
            f"uses an ordered operator. Refusing loudly rather than guessing which side it falls on."
        ) from None


def _satisfied(criterion: Criterion, patient_value: Any) -> Tuple[bool, str]:
    """(satisfied, direction-when-violated). One generic evaluator, no per-case branch (FR-5)."""
    op = criterion.op
    if op in _ORDERED_OPS:
        patient = _as_number(criterion.field, "patient", patient_value)
        required = _as_number(criterion.field, "study", criterion.value)
        if op == ">=":
            return patient >= required, "below"
        if op == "<=":
            return patient <= required, "above"
        if op == ">":
            return patient > required, "below"
        return patient < required, "above"
    if op == "range":
        patient = _as_number(criterion.field, "patient", patient_value)
        low = _as_number(criterion.field, "study", criterion.value[0])
        high = _as_number(criterion.field, "study", criterion.value[1])
        if patient < low:
            return False, "below"
        if patient > high:
            return False, "above"
        return True, "outside-set"
    if op == "in":
        allowed = [str(v).strip().lower() for v in criterion.value]
        return str(patient_value).strip().lower() in allowed, "outside-set"
    return str(patient_value).strip().lower() == str(criterion.value).strip().lower(), "outside-set"


def evaluate(study_population: StudyPopulation, patient: PatientProfile) -> List[Discrepancy]:
    """ONE generic evaluator over (op, value) pairs — the four real reversals and the
    synthetic cases all flow through here with different DATA (FR-5)."""
    if not isinstance(study_population, StudyPopulation):
        raise PopulationError("evaluate() needs a StudyPopulation (use parse_study_population first)")
    if not isinstance(patient, PatientProfile):
        raise PopulationError("evaluate() needs a PatientProfile")

    discrepancies: List[Discrepancy] = []

    if study_population.unstated_reason and not study_population.criteria:
        return [
            Discrepancy(
                field=UNSTATED_POPULATION_FIELD,
                kind="criterion-unstated",
                patient_value="n/a",
                study_requirement=f"not stated: {study_population.unstated_reason}",
                verbatim=study_population.description,
                locator=study_population.locator,
                direction="absent",
            )
        ]

    for criterion in study_population.criteria:
        if criterion.unstated_reason is not None:
            discrepancies.append(
                Discrepancy(
                    field=criterion.field,
                    kind="criterion-unstated",
                    patient_value=_render_value(patient.get(criterion.field)),
                    study_requirement=criterion.requirement_text(),
                    verbatim=criterion.verbatim,
                    locator=criterion.locator,
                    direction="absent",
                )
            )
            continue
        if not patient.has(criterion.field):
            discrepancies.append(
                Discrepancy(
                    field=criterion.field,
                    kind="patient-value-missing",
                    patient_value="не указан / not recorded",
                    study_requirement=criterion.requirement_text(),
                    verbatim=criterion.verbatim,
                    locator=criterion.locator,
                    direction="absent",
                )
            )
            continue
        patient_value = patient.get(criterion.field)
        ok, direction = _satisfied(criterion, patient_value)
        if ok:
            continue
        discrepancies.append(
            Discrepancy(
                field=criterion.field,
                kind="eligibility-excluded" if criterion.kind == "eligibility" else "baseline-out-of-range",
                patient_value=_render_value(patient_value),
                study_requirement=criterion.requirement_text(),
                verbatim=criterion.verbatim,
                locator=criterion.locator,
                direction=direction,
            )
        )
    return discrepancies


def _render_value(value: Any) -> str:
    if value is None:
        return "не указан / not recorded"
    return str(value)


def match(study_population: StudyPopulation, patient: PatientProfile) -> PopulationMatch:
    """The one entry point a caller needs: evaluate, then derive."""
    discrepancies = evaluate(study_population, patient)
    return PopulationMatch.from_discrepancies(discrepancies, study_population.description)


# ------------------------------------------------------------------- rendering
_KIND_PROSE = {
    "eligibility-excluded": "this patient would NOT have been enrolled",
    "baseline-out-of-range": "enrollable, but the effect was not measured from this starting value",
    "criterion-unstated": "the source does not state this axis",
    "patient-value-missing": "the patient profile does not carry this axis",
}


def render_population_match(match_result: PopulationMatch) -> str:
    """THE ONLY renderer. Iterates DISCREPANCY_KEYS — an allowlist over emitted
    structure — so a field added to Discrepancy without being added to the tuple is
    simply not printed. There is no path that prints a verdict without its
    discrepancies (D-10)."""
    if not isinstance(match_result, PopulationMatch):
        raise PopulationError("render_population_match() needs a PopulationMatch")
    lines = [f"POPULATION_MATCH: {match_result.verdict}"]
    if match_result.study_description:
        lines.append(f"  study population: {match_result.study_description}")
    if not match_result.discrepancies:
        lines.append("  no discrepancies — every stated criterion is satisfied by a known patient value")
        return "\n".join(lines)
    for discrepancy in match_result.discrepancies:
        row = {key: getattr(discrepancy, key) for key in DISCREPANCY_KEYS}
        lines.append(
            "  {field} — patient {patient_value}; study requires {study_requirement} "
            "({kind}, {direction})".format(**row)
        )
        lines.append("      {prose}".format(prose=_KIND_PROSE[row["kind"]]))
        quote = '      "{verbatim}"'.format(verbatim=row["verbatim"])
        if row["locator"]:
            quote += "  {locator}".format(locator=row["locator"])
        lines.append(quote)
    return "\n".join(lines)


def match_from_fact(fact_study_population: Any, patient_values: Mapping[str, Any]) -> PopulationMatch:
    """Convenience for the report gate: opaque dict + raw patient dict → verdict."""
    return match(parse_study_population(fact_study_population), PatientProfile(patient_values))


def load_field_cases(path: str) -> Dict[str, Any]:
    """Read the committed fixture file. Kept here so tests and the README example
    load the SAME artifact rather than each restating the four cases."""
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


__all__ = [
    "CRITERION_FIELDS", "CRITERION_KINDS", "CRITERION_OPS", "DISCREPANCY_KINDS",
    "DISCREPANCY_KEYS", "DISCREPANCY_DIRECTIONS", "POPULATION_MATCH_VERDICTS", "UNIT_SUFFIXES",
    "UNSTATED_POPULATION_FIELD",
    "PopulationError", "Criterion", "StudyPopulation", "PatientProfile", "Discrepancy",
    "PopulationMatch", "derive_verdict", "evaluate", "match", "match_from_fact",
    "normalize_field", "parse_criterion", "parse_study_population", "render_population_match",
    "load_field_cases",
]
