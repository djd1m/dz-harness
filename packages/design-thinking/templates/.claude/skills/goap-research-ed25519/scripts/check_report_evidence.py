#!/usr/bin/env python3
"""
Report evidence gate (FR-4) — the rule that makes the evidence axis load-bearing.

    ASSERTED facts do not reach a report at all.
    LISTING_ONLY facts reach it only with an explicit marker next to the claim.

This is an exit code, not advice. The lesson it encodes: a checklist item is
satisfied by writing it; only an executable check refuses. The whole point of the
evidence axis is lost if "don't include unread claims" stays a sentence in
SKILL.md that a tired model skips at 2am.

Usage:
    python3 check_report_evidence.py --report report.md --facts facts.json [--json]

Exit codes:
    0  clean — no ASSERTED used, every used LISTING_ONLY carries a marker
    1  violation — named facts printed
    2  usage/IO error (a gate that cannot read its inputs must not report "clean")

HONEST SCOPE: this gate proves the report does not LEAN ON unread sources. It
does not prove the cited sources support the claims, and it cannot judge legacy
facts that predate the evidence axis — those are counted and NAMED separately,
never silently folded into "clean". A report resting ENTIRELY on facts this gate
cannot judge exits 1, not 0: "I could not check this" and "this is fine" must not
share an exit code.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

EVIDENCE_FETCH_VERIFIED = "FETCH_VERIFIED"
EVIDENCE_LISTING_ONLY = "LISTING_ONLY"
EVIDENCE_ASSERTED = "ASSERTED"

# A LISTING_ONLY claim is admissible only if the report says so near the claim.
# Both spellings are accepted because the report may be written in either
# language; the marker must be VISIBLE to a reader, not a hidden attribute.
LISTING_MARKERS = (
    "LISTING_ONLY",
    "listing-only",
    "не открывалась",
    "карточка не открывалась",
    "из поисковой выдачи",
    "not opened directly",
    "from a search listing",
)

# How far from the claim's mention the marker may sit. A marker in the appendix
# does not warn the reader of a sentence on page 2.
MARKER_WINDOW_CHARS = 400

# ---------------------------------------------------------------------------
# SLICE C ADDITIONS (ADR-001 §5, ADR-002 §3) — ADDITIVE ONLY.
# No existing constant, rule, threshold or exit path above or below is modified:
# the new judgements live in their own functions (`evaluate_population`,
# `scan_relative_risk`) and are merged into the same findings list by `main()`,
# exactly as `verify_ledger_signatures()` already is.
# ---------------------------------------------------------------------------

# A claim whose population does not match this patient is admissible only if the
# report SAYS SO near the claim — same discipline as LISTING_MARKERS, and the same
# 400-char window. Both languages, because the report may be written in either.
POPULATION_MARKERS = (
    "POPULATION_MATCH",
    "популяция исследования",
    "не изучалась",
    "популяция не совпадает",
    "исследование проводилось",
    "study population",
    "population mismatch",
    "not studied in",
    "measured in",
)

# When the source states NO population at all there is no axis to name, so the
# axis-naming rule above cannot be satisfied by any honest sentence (QE G5): the
# discrepancy's field is the literal sentinel `(study population)`, and only that
# parenthesised token cleared the window. A report that SAYS the population is
# unknown is the sanctioned escape hatch — `StudyPopulation.unstated(reason)` — and
# must not be the one path the gate punishes. These are the ways of saying "not
# stated"; a generic "results may not generalise" contains none of them, so the
# anti-boilerplate property the axis rule exists for is preserved.
POPULATION_UNSTATED_MARKERS = (
    "POPULATION_MATCH unknown",
    "не указан",
    "не описан",
    "не сообщ",
    "не назван",
    "не приводит",
    "не раскры",
    "не стат",
    "неизвестн",
    "not stated",
    "not described",
    "not reported",
    "not specified",
    "does not state",
    "unstated",
)

# The lower bound at which `study_population` is inside the signed message (ADR-003).
# Below it the field is UNSIGNED JSON sitting next to a valid signature.
POPULATION_ATTESTED_MIN_SCHEMA = 3

# FORMAT patterns, not meaning (D-19). This is a BELT: `risk_statement.py`'s
# constructor is the guarantee, and a list of phrasings can never be one. A novel
# phrasing is missed — which is precisely why the gate's own output says so.
RELATIVE_RISK_PATTERNS = (
    r"в\s+\d+(?:[.,]\d+)?\s*раз",
    r"удваивает|удвоение|утраивает|утроение|риск\s+удваивается",
    r"\bdoubl(?:es|ing)\b|\btripl(?:es|ing)\b",
    r"\b\d+(?:[.,]\d+)?\s*-?\s*fold\b",
    r"\b(?:RR|HR|OR|IRR)\s*[=:]?\s*\d+(?:[.,]\d+)?",
    r"\b\d+(?:[.,]\d+)?\s*%\s*(?:relative\s+risk|RRR|relative)",
    r"\d+(?:[.,]\d+)?\s*%\s*относительн",
    r"[×x]\s*\d+(?:[.,]\d+)?\s*(?:риск|risk)",
)

# What must sit within the window for a relative figure to be admissible: a real
# absolute figure, an NNT, or the explicit "we do not know the baseline" sentence.
ABSOLUTE_COMPANION_PATTERNS = (
    r"на\s+\d+(?:\s?\d+)*\s+(?:челов|пациент)",
    r"\d+(?:[.,]\d+)?\s+из\s+\d+",
    r"\bper\s+\d+",
    r"\b\d+\s+in\s+\d+\b",
    r"\bNNT\b|\bNNH\b",
    # NOT a bare `абсолютн` (QE G7): that stem also matches the ADVERB «абсолютно»,
    # so "Риск удваивается, это абсолютно доказано" — a filler word, not a number —
    # cleared the belt. The negative lookahead keeps every ADJECTIVAL form
    # («абсолютный риск», «в абсолютных числах», «абсолютное снижение»), whose stem
    # is followed by a declension letter, and rejects the adverb, whose «о» ends the
    # word. A declension list would be an enumeration wearing an allowlist's clothes.
    r"абсолютн(?!о\b)",
    r"absolute\s+risk",
    r"BASELINE RISK NOT ESTABLISHED",
    r"базовый\s+риск\s+неизвест",
)

POPULATION_UNCHECKED_LINE = "population applicability: NOT CHECKED — no --profile supplied"


@dataclass
class Finding:
    kind: str
    claim: str
    source_url: str
    detail: str


def _load_facts(path: str) -> List[Dict[str, Any]]:
    """Load the ledger. Malformed entries RAISE rather than being skipped: a
    silently-dropped record is a record the gate did not judge, and this gate must
    never clear a report it could not fully read (Codex QE #9)."""
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, dict):
        for key in ("facts", "claims", "items"):
            if isinstance(data.get(key), list):
                data = data[key]
                break
        else:
            raise ValueError("facts JSON object has no 'facts'/'claims'/'items' array")
    if not isinstance(data, list):
        raise ValueError("facts JSON must be a list or an object containing one")
    bad = [i for i, item in enumerate(data) if not isinstance(item, dict)]
    if bad:
        raise ValueError(f"facts ledger has non-object entries at index/indices {bad} — refusing to judge a partial ledger")
    if not data:
        # An EMPTY ledger against a non-empty report is the total bypass: pass `[]`
        # and any medical report exits 0 (Codex QE #2). Emptiness is unevaluable,
        # not clean.
        raise ValueError("facts ledger is empty — a report with no recorded facts cannot be cleared, only unevaluated")
    return data


# Tokens that carry a claim's identity. NUMBERS COUNT (Codex QE #4): "LDL rose
# 40%" vs "LDL increased 40%" shares almost no long words but shares the number,
# and dosage/threshold claims are precisely where a silent miss is dangerous.
_TOKEN_RE = re.compile(r"[\wЀ-ӿ]{4,}|\d+(?:[.,]\d+)?", re.UNICODE)
_STOPWORDS = {
    "that", "this", "with", "from", "these", "those", "have", "been", "were", "which", "their",
    "there", "about", "would", "could", "should", "than", "then", "when", "what", "into",
    "что", "этот", "этого", "было", "были", "который", "которая", "если", "также", "более",
}


def _significant_words(text: str, limit: int = 12) -> List[str]:
    """Identity tokens of a claim: numerals plus content words, stopwords dropped.

    The first draft required 5+ letters, ignored digits and kept only 8 tokens, so
    ordinary paraphrases walked through. Detection here is deliberately GENEROUS —
    an over-detection is a visible, arguable false alarm; a miss lets an unread
    claim into a medical document silently.
    """
    tokens = [t for t in _TOKEN_RE.findall((text or "").lower()) if t not in _STOPWORDS]
    seen: List[str] = []
    for token in tokens:
        if token not in seen:
            seen.append(token)
        if len(seen) >= limit:
            break
    return seen


def claim_positions(report_text: str, claim: str) -> List[int]:
    """Offsets where the claim appears to be used.

    Exact substring first; otherwise a word-overlap probe, because a report
    paraphrases claims rather than pasting them. Deliberately generous: a MISSED
    usage would let an ASSERTED claim through, which is the failure this gate
    exists to prevent, so we prefer over-detection (a false alarm is visible and
    arguable; a miss is silent).
    """
    text_lower = report_text.lower()
    claim_lower = (claim or "").strip().lower()
    if not claim_lower:
        return []
    positions = [m.start() for m in re.finditer(re.escape(claim_lower), text_lower)]
    if positions:
        return positions
    words = _significant_words(claim_lower)
    if len(words) < 3:
        return []
    # Scan a SLIDING WINDOW over the whole text, not per physical line: markdown
    # wrapping split a claim across lines and hid it from the line-based scan.
    hits: List[int] = []
    window, step = 360, 120
    threshold = max(3, int(len(words) * 0.5))
    position = 0
    while position < max(len(text_lower), 1):
        chunk = text_lower[position:position + window]
        present = [w for w in words if w in chunk]
        if len(present) >= threshold:
            # Report where the claim ACTUALLY sits, not where the window started:
            # marker proximity is measured from this offset, and using the window
            # start put the measurement up to a full window away from the text it
            # was supposed to be next to (Codex QE r2).
            earliest = min(chunk.find(w) for w in present)
            hits.append(position + max(earliest, 0))
            position += window  # one hit per window; neighbours would double-count
        else:
            position += step
    return hits


def has_marker_near(report_text: str, position: int, window: int = MARKER_WINDOW_CHARS) -> bool:
    start = max(0, position - window)
    end = min(len(report_text), position + window)
    neighbourhood = report_text[start:end].lower()
    return any(marker.lower() in neighbourhood for marker in LISTING_MARKERS)


def verify_ledger_signatures(facts: Sequence[Dict[str, Any]], pins: Optional[Dict[str, str]] = None) -> List[Finding]:
    """Reject records whose signature does not cover their own contents.

    Without this the gate reads `evidence_class` as a plain unsigned JSON string:
    flipping a signed ASSERTED record to FETCH_VERIFIED in a text editor made the
    gate pass while `verify_fact()` would have rejected it (Codex QE #3). The
    signature protection and the report protection were not composed — each was
    sound alone and the pair had a hole between them.

    Verification is best-effort by design: if the verifier module or its crypto
    backend is unavailable, that is reported as a NAMED limitation, never as a
    pass — a gate that could not check must not imply it did.
    """
    try:
        import ed25519_verifier as ev
    except Exception as exc:
        return [Finding(kind="SIGNATURES_UNCHECKED", claim="(whole ledger)", source_url="",
                        detail=f"cannot import ed25519_verifier ({exc}) — evidence classes were read UNVERIFIED")]
    if getattr(ev, "CRYPTO_BACKEND", None) is None:
        return [Finding(kind="SIGNATURES_UNCHECKED", claim="(whole ledger)", source_url="",
                        detail="no Ed25519 backend installed — evidence classes were read UNVERIFIED")]

    verifier = ev.Ed25519Verifier()
    for issuer, pubkey in (pins or {}).items():
        try:
            verifier.registry.add(issuer, pubkey)
        except Exception:
            pass
    out: List[Finding] = []
    for fact in facts:
        if not fact.get("signature"):
            continue  # unsigned ledgers predate signing; the class fields are still judged
        trust = fact.get("trust_class")
        if trust == "ISSUER_SIGNED" and fact.get("issuer") not in (pins or {}):
            # REGRESSION GUARD (Codex QE r2, critical): the first version built an
            # EMPTY registry, so every legitimate ISSUER_SIGNED fact failed as
            # "unknown issuer" and was reported as TAMPERED. Accusing a sound record
            # of forgery is worse than not checking it: it teaches the reader to
            # ignore the gate. Without pins we say what we could not check.
            out.append(Finding(kind="SIGNATURES_UNCHECKED", claim=str(fact.get("claim", ""))[:120],
                               source_url=str(fact.get("source_url", "")),
                               detail=("ISSUER_SIGNED fact but no pinned key was supplied (--pins) — "
                                       "its signature was NOT checked; this is not an accusation")))
            continue
        try:
            result = verifier.verify_fact(ev.SignedFact.from_dict(fact))
        except Exception as exc:
            out.append(Finding(kind="UNVERIFIABLE_FACT", claim=str(fact.get("claim", ""))[:120],
                               source_url=str(fact.get("source_url", "")), detail=f"verification raised {exc}"))
            continue
        if not result.verified:
            out.append(Finding(kind="TAMPERED_FACT", claim=str(fact.get("claim", ""))[:120],
                               source_url=str(fact.get("source_url", "")),
                               detail=f"signature does not verify ({result.error}) — its evidence_class cannot be trusted"))
    return out


def evaluate(report_text: str, facts: Sequence[Dict[str, Any]]) -> Tuple[List[Finding], Dict[str, int]]:
    findings: List[Finding] = []
    counts = {EVIDENCE_FETCH_VERIFIED: 0, EVIDENCE_LISTING_ONLY: 0, EVIDENCE_ASSERTED: 0, "UNKNOWN_LEGACY": 0}

    for fact in facts:
        claim = str(fact.get("claim", ""))
        url = str(fact.get("source_url", ""))
        evidence = fact.get("evidence_class")
        bucket = evidence if evidence in counts else ("UNKNOWN_LEGACY" if evidence is None else "UNRECOGNISED")
        counts[bucket] = counts.get(bucket, 0) + 1

        positions = claim_positions(report_text, claim)
        if not positions:
            continue  # recorded but not used in this report — not this gate's business

        if evidence == EVIDENCE_ASSERTED:
            findings.append(
                Finding(
                    kind="ASSERTED_IN_REPORT",
                    claim=claim,
                    source_url=url,
                    detail="stated from memory, source never opened — must not appear in a report at all",
                )
            )
        elif evidence == EVIDENCE_LISTING_ONLY:
            # EVERY occurrence must be marked, not just one (Codex QE #5): a claim
            # marked on page 1 and repeated bare on page 4 warns nobody on page 4.
            unmarked = [pos for pos in positions if not has_marker_near(report_text, pos)]
            if unmarked:
                findings.append(
                    Finding(
                        kind="UNMARKED_LISTING_ONLY",
                        claim=claim,
                        source_url=url,
                        detail=(
                            f"{len(unmarked)} of {len(positions)} occurrence(s) unmarked; the source was never "
                            f"opened directly and the report must say so next to EACH mention "
                            f"(within {MARKER_WINDOW_CHARS} chars)"
                        ),
                    )
                )
        elif evidence not in (EVIDENCE_FETCH_VERIFIED, None):
            # An unrecognised or whitespace-damaged class ("ASSERTED ", "asserted",
            # null) must NOT read as legacy-and-therefore-fine (Codex QE #9). A
            # ledger we cannot interpret is a ledger we cannot clear.
            findings.append(
                Finding(
                    kind="UNRECOGNISED_EVIDENCE_CLASS",
                    claim=claim,
                    source_url=url,
                    detail=f"evidence_class {evidence!r} is not one of FETCH_VERIFIED/LISTING_ONLY/ASSERTED",
                )
            )
    return findings, counts


# ---------------------------------------------------------------------------
# SLICE C — population applicability (ADR-001 §5) and the relative-risk belt
# (ADR-002 §3). New functions; nothing above is rewritten.
# ---------------------------------------------------------------------------

def has_population_marker_near(report_text: str, position: int, field: Optional[str] = None,
                               window: int = MARKER_WINDOW_CHARS) -> bool:
    """A population caveat counts only if it NAMES the diverging axis.

    A generic "results may not generalise" boilerplate next to every claim would
    satisfy a marker-only rule while telling the reader nothing — so the discrepancy
    `field` must appear in the window too.

    EXCEPTION, and the reason it exists (QE G5): when the source states no population
    at all, the discrepancy's field is the sentinel `population_match.UNSTATED_
    POPULATION_FIELD` — not an axis, and no honest sentence names it. Requiring that
    literal token punished the one path the design SANCTIONS,
    `StudyPopulation.unstated(reason)`. For that sentinel the axis rule is replaced by
    a different, equally specific one: the window must SAY the population is unknown.
    """
    start = max(0, position - window)
    end = min(len(report_text), position + window)
    neighbourhood = report_text[start:end].lower()
    if not any(marker.lower() in neighbourhood for marker in POPULATION_MARKERS):
        return False
    if field and _is_unstated_population_field(field):
        return any(marker.lower() in neighbourhood for marker in POPULATION_UNSTATED_MARKERS)
    if field and field.lower() not in neighbourhood:
        return False
    return True


def _is_unstated_population_field(field: str) -> bool:
    """True for the wholly-unstated-population sentinel.

    The sentinel's spelling has ONE home — `population_match.UNSTATED_POPULATION_FIELD`
    — and is imported rather than restated, so the gate and the matcher cannot drift
    into disagreeing about which string means "the paper never said".
    """
    try:
        from population_match import UNSTATED_POPULATION_FIELD
    except Exception:  # pragma: no cover - import guard
        return False
    return str(field).strip().lower() == UNSTATED_POPULATION_FIELD.lower()


def ledger_schema_version(fact: Mapping[str, Any]) -> Optional[int]:
    """The schema version of a RAW ledger record, or None when it cannot be told.

    Delegates to `ed25519_verifier.schema_version_of_mapping` — the SAME dispatch the
    signature path uses — rather than restating it here, because two definitions of
    "which schema is this" would be free to disagree exactly where it matters.

    None means UNKNOWN, and unknown is treated as unattested by every caller: a gate
    that cannot tell whether a field was signed must not report it as signed.

    HONEST SCOPE — this is a SCHEMA check, not a signature check. It catches the
    injection that pins `schema_version` to a pre-v3 value (which is what let a
    genuinely-signed v2 fact carry a fabricated population and still verify). An
    injection that leaves `schema_version` absent or set to 3 reads as attested HERE
    and is caught THERE: the verifier rebuilds the v3 text, the signature does not
    match, and `verify_ledger_signatures()` reports TAMPERED_FACT. The two checks
    compose; neither is complete alone, and this docstring says which is which.
    """
    try:
        import ed25519_verifier as ev
        return ev.schema_version_of_mapping(dict(fact))
    except Exception:
        return None


def evaluate_population(report_text: str, facts: Sequence[Dict[str, Any]],
                        patient_profile: Optional[Dict[str, Any]] = None,
                        ) -> Tuple[List[Finding], Dict[str, int]]:
    """Merge the applicability judgement in WITHOUT losing any other one.

    Five rules, all exit 1:
      UNATTESTED_STUDY_POPULATION    a used fact whose schema predates v3 but which
                                     carries a study_population anyway — the field is
                                     OUTSIDE its signed message, so it is unsigned
                                     JSON sitting next to a valid signature;
      LEGACY_POPULATION_UNJUDGEABLE  a used pre-v3 fact carrying no study_population;
      MISSING_STUDY_POPULATION       a used v3 fact carrying an empty study_population —
                                     needs no patient profile to be wrong;
      UNMARKED_POPULATION_MISMATCH   verdict partial/none, no marker naming the
                                     diverging field within 400 chars of EACH mention;
      POPULATION_UNKNOWN_UNMARKED    verdict unknown, same proximity rule.

    THE FIRST TWO ARE THE POINT (QE G1 / G4). ADR-003 declares pre-v3 facts still
    vulnerable by construction — but a declared vulnerability that produces
    `POPULATION_MATCH full` with zero findings is not visible, it is LAUNDERED. A
    legitimately-signed v2 fact with an INJECTED population and `schema_version` pinned
    to its own schema verified, matched `full` and exited 0 (MEASURED). Both cases now
    say what they are, and both are findings — because "counted in a line nobody has to
    read" is the same shape as "inconclusive reads as pass", the defect this package
    has already paid for twice. Neither rule needs a patient profile: the fact is
    unjudgeable no matter WHO the patient is.

    Without a patient profile the two proximity rules cannot run — and the gate SAYS SO
    (`POPULATION_UNCHECKED_LINE`) instead of passing silently.
    """
    findings: List[Finding] = []
    counts = {"population-checked": 0, "legacy-population-unknown": 0,
              "population-unattested": 0,
              "population-full": 0, "population-partial": 0,
              "population-none": 0, "population-unknown": 0}

    try:
        import population_match as pmatch
    except Exception as exc:  # pragma: no cover - import guard
        return ([Finding(kind="POPULATION_UNCHECKED", claim="(whole ledger)", source_url="",
                         detail=f"cannot import population_match ({exc}) — applicability was NOT judged")],
                counts)

    for fact in facts:
        claim = str(fact.get("claim", ""))
        url = str(fact.get("source_url", ""))
        population = fact.get("study_population")
        positions = claim_positions(report_text, claim)

        if not positions:
            continue  # recorded but not used in this report — not this gate's business

        schema = ledger_schema_version(fact)
        attested = schema is not None and schema >= POPULATION_ATTESTED_MIN_SCHEMA

        if population is None:
            counts["legacy-population-unknown"] += 1
            findings.append(Finding(
                kind="LEGACY_POPULATION_UNJUDGEABLE", claim=claim, source_url=url,
                detail=("this used fact predates study_population (schema {s}), so its applicability "
                        "to this patient cannot be judged at all. Unjudgeable is not clean: re-record "
                        "the claim through a v{v} constructor, or state the limitation in the report "
                        "next to the claim.".format(s="unknown" if schema is None else schema,
                                                    v=POPULATION_ATTESTED_MIN_SCHEMA))))
            continue

        if not attested:
            counts["population-unattested"] += 1
            findings.append(Finding(
                kind="UNATTESTED_STUDY_POPULATION", claim=claim, source_url=url,
                detail=("the fact reports schema {s}, whose signed message does not cover "
                        "study_population — the population here is UNSIGNED JSON next to a valid "
                        "signature and anyone could have written it. It is NOT matched against the "
                        "patient, because a match computed from unattested data reads exactly like "
                        "a match computed from signed data.".format(
                            s="unknown" if schema is None else schema))))
            continue

        if not isinstance(population, dict) or not population:
            findings.append(Finding(kind="MISSING_STUDY_POPULATION", claim=claim, source_url=url,
                                    detail="the fact carries an empty study_population — a claim that "
                                           "does not say who it was measured in cannot be applied to anyone"))
            continue

        if patient_profile is None:
            continue  # reported as NOT CHECKED by render_population_and_risk()

        try:
            match = pmatch.match_from_fact(population, patient_profile)
        except Exception as exc:
            findings.append(Finding(kind="POPULATION_UNEVALUABLE", claim=claim, source_url=url,
                                    detail=f"study_population could not be evaluated ({exc}) — "
                                           f"unevaluable is never clean"))
            continue

        counts["population-checked"] += 1
        counts["population-" + match.verdict] += 1
        if match.verdict == "full":
            continue

        fields = [d.field for d in match.discrepancies]
        # EVERY occurrence must be marked, not just the first — the rule already
        # established for LISTING_ONLY at the existing gate.
        unmarked = [pos for pos in positions
                    if not any(has_population_marker_near(report_text, pos, field) for field in fields)]
        if not unmarked:
            continue
        kind = "POPULATION_UNKNOWN_UNMARKED" if match.verdict == "unknown" else "UNMARKED_POPULATION_MISMATCH"
        findings.append(Finding(
            kind=kind, claim=claim, source_url=url,
            detail=("POPULATION_MATCH {verdict}: {names}. {n} of {total} occurrence(s) carry no marker "
                    "naming the diverging axis — or, where the source states no population at all, "
                    "saying THAT — within {w} chars".format(
                        verdict=match.verdict,
                        names="; ".join(f"{d.field} — patient {d.patient_value}, study requires "
                                        f"{d.study_requirement} ({d.kind})" for d in match.discrepancies),
                        n=len(unmarked), total=len(positions), w=MARKER_WINDOW_CHARS))))
    return findings, counts


def scan_relative_risk(report_text: str) -> List[Finding]:
    """BELT (D-19): refuse a relative figure with no absolute companion in the window.

    HONEST SCOPE, stated here and printed in the gate's own output: this scan matches
    FORMATS, not meaning. It is a secondary belt over prose that the typed path in
    `risk_statement.py` never sees; `test_risk_absolute.py` is the proof of the
    property, and this scan may never be cited as one.
    """
    findings: List[Finding] = []
    for pattern in RELATIVE_RISK_PATTERNS:
        for hit in re.finditer(pattern, report_text, re.IGNORECASE | re.UNICODE):
            start = max(0, hit.start() - MARKER_WINDOW_CHARS)
            end = min(len(report_text), hit.end() + MARKER_WINDOW_CHARS)
            window = report_text[start:end]
            if any(re.search(companion, window, re.IGNORECASE | re.UNICODE)
                   for companion in ABSOLUTE_COMPANION_PATTERNS):
                continue
            findings.append(Finding(
                kind="RELATIVE_RISK_WITHOUT_ABSOLUTE",
                claim=report_text[max(0, hit.start() - 60):hit.end() + 60].strip(),
                source_url="",
                detail=("a relative effect ({matched!r}) with no absolute figure, NNT, or explicit "
                        "'BASELINE RISK NOT ESTABLISHED' within {w} chars. '21x higher' is 1 excess "
                        "case per 1394 people; only one of those two sentences is interpretable"
                        .format(matched=hit.group(0), w=MARKER_WINDOW_CHARS))))
    return findings


def render_population_and_risk(counts: Dict[str, int], profile_supplied: bool) -> str:
    """Printed BESIDE the existing gate output; `render()` itself is untouched."""
    lines: List[str] = []
    if not profile_supplied:
        lines.append("  " + POPULATION_UNCHECKED_LINE)
    else:
        lines.append(
            "  population: {c} checked — full {f} / partial {p} / none {n} / unknown {u}".format(
                c=counts.get("population-checked", 0), f=counts.get("population-full", 0),
                p=counts.get("population-partial", 0), n=counts.get("population-none", 0),
                u=counts.get("population-unknown", 0)))
    if counts.get("legacy-population-unknown"):
        lines.append(
            "  legacy-population-unknown: {n} used fact(s) predate study_population — this gate "
            "cannot judge their applicability, and does not pretend to. Each one is a FINDING "
            "above, not a footnote: a report resting entirely on them is unjudged, not clean.".format(
                n=counts["legacy-population-unknown"]))
    if counts.get("population-unattested"):
        lines.append(
            "  population-unattested: {n} used fact(s) carry a study_population that their own "
            "schema does not sign — unsigned JSON beside a valid signature. NOT matched against "
            "the patient.".format(n=counts["population-unattested"]))
    lines.append(
        "  belt scope: the relative-risk scan matches FORMATS, not meaning. It is a secondary belt; "
        "the guarantee is risk_statement.RiskStatement's constructor, proven by "
        "test_risk_absolute.py — never by this scan."
    )
    return "\n".join(lines)


def render(findings: Sequence[Finding], counts: Dict[str, int]) -> str:
    lines: List[str] = []
    total = sum(counts.values())
    lines.append("report evidence gate")
    lines.append(
        "  facts: {total} — FETCH_VERIFIED {f} / LISTING_ONLY {l} / ASSERTED {a} / legacy-unknown {u}".format(
            total=total,
            f=counts[EVIDENCE_FETCH_VERIFIED],
            l=counts[EVIDENCE_LISTING_ONLY],
            a=counts[EVIDENCE_ASSERTED],
            u=counts["UNKNOWN_LEGACY"],
        )
    )
    if counts["UNKNOWN_LEGACY"]:
        lines.append(
            "  NOTE: {n} fact(s) predate the evidence axis — this gate cannot judge them, "
            "and does not pretend to.".format(n=counts["UNKNOWN_LEGACY"])
        )
    if not findings:
        lines.append("  PASS — no ASSERTED claim used; every used LISTING_ONLY claim is marked.")
    else:
        lines.append("  FAIL — {n} violation(s):".format(n=len(findings)))
        for finding in findings:
            lines.append("    [{kind}] {claim}".format(kind=finding.kind, claim=finding.claim[:120]))
            lines.append("       source: {url}".format(url=finding.source_url or "(none)"))
            lines.append("       {detail}".format(detail=finding.detail))
    lines.append(
        "  scope: proves the report does not lean on unread sources AND that the ledger's evidence "
        "classes carry intact signatures. It does NOT prove the cited sources support the claims, "
        "and it can only judge claims it recognises as used — paraphrase detection is deliberately "
        "over-eager, because a missed unread claim is silent while a false alarm is arguable."
    )
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Refuse reports that lean on unread sources.")
    parser.add_argument("--report", required=True, help="path to the report markdown")
    parser.add_argument("--facts", required=True, help="path to facts.json")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    parser.add_argument("--pins", help="JSON file of {issuer: pubkey_b64} so ISSUER_SIGNED facts can be checked")
    # SLICE C: OPTIONAL on purpose. Making it mandatory would break every documented
    # invocation for a check that cannot always apply; letting its absence pass
    # silently would be "inconclusive reads as pass". Its absence is PRINTED instead.
    parser.add_argument("--profile", help="JSON file of patient values, so population applicability can be judged")
    args = parser.parse_args(argv)

    try:
        with open(args.report, "r", encoding="utf-8") as handle:
            report_text = handle.read()
        facts = _load_facts(args.facts)
        pins = None
        if args.pins:
            with open(args.pins, "r", encoding="utf-8") as handle:
                pins = json.load(handle)
            if not isinstance(pins, dict):
                raise ValueError("--pins must be a JSON object of {issuer: pubkey_b64}")
        profile = None
        if args.profile:
            with open(args.profile, "r", encoding="utf-8") as handle:
                profile = json.load(handle)
            if not isinstance(profile, dict):
                raise ValueError("--profile must be a JSON object of patient values")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        # Exit 2, never 0: a gate that could not read its inputs has not cleared anything.
        message = f"check_report_evidence: cannot evaluate — {exc}"
        print(json.dumps({"error": str(exc), "exitCode": 2}) if args.json else message, file=sys.stderr)
        return 2

    findings, counts = evaluate(report_text, facts)
    # Signature check FIRST in severity terms: a tampered record's evidence_class
    # is not evidence of anything, so its verdict above cannot be trusted either.
    findings = verify_ledger_signatures(facts, pins) + findings
    # SLICE C: three independent judgements merged into the SAME findings list — the
    # merge must not lose one, and the existing exit path below is unchanged.
    population_findings, population_counts = evaluate_population(report_text, facts, profile)
    findings = findings + population_findings + scan_relative_risk(report_text)
    if args.json:
        print(
            json.dumps(
                {
                    "ok": not findings,
                    "counts": dict(counts, **population_counts),
                    "populationChecked": profile is not None,
                    "findings": [f.__dict__ for f in findings],
                    "exitCode": 1 if findings else 0,
                },
                ensure_ascii=False,
            )
        )
    else:
        print(render(findings, counts))
        print(render_population_and_risk(population_counts, profile is not None))
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
