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
    python3 check_report_evidence.py --report report.md --facts facts.json [--excerpts DIR] [--json]

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
import os
import re
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

import quote_provenance as quote_provenance

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

# Report quotes are paired to a fact through the existing generous claim scanner,
# but the verdict itself is an exact normalized comparison in quote_provenance.
# Keeping those two polarities separate is load-bearing: generosity is safe for
# finding a claim and unsafe for granting "verbatim".
QUOTE_MIN_SIGNIFICANT_CHARS = 15
QUOTE_PATTERNS = (
    re.compile(r'«([^»\n]+)»', re.UNICODE),
    re.compile(r'"([^"\n]+)"', re.UNICODE),
    re.compile(r'„([^“\n]+)“', re.UNICODE),
)

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


def _quoted_spans(report_text: str) -> List[Tuple[str, int, int]]:
    spans: List[Tuple[str, int, int]] = []
    occupied: List[Tuple[int, int]] = []
    for pattern in QUOTE_PATTERNS:
        for match in pattern.finditer(report_text):
            start, end = match.span(1)
            if any(left <= start < right or left < end <= right for left, right in occupied):
                continue
            span = match.group(1).strip()
            significant = len(re.sub(r"[^\w\d]", "", span, flags=re.UNICODE))
            if significant < QUOTE_MIN_SIGNIFICANT_CHARS:
                continue
            occupied.append(match.span(0))
            spans.append((span, start, end))
    return sorted(spans, key=lambda item: item[1])


def _quote_finding_kind(verdict: str) -> str:
    if verdict == "not-in-excerpt":
        return "QUOTE_NOT_IN_SOURCE"
    if verdict == "method-ineligible":
        return "QUOTE_METHOD_INELIGIBLE"
    return "QUOTE_NO_EXCERPT"


def evaluate_quotes(
    report_text: str,
    facts: Sequence[Dict[str, Any]],
    excerpt_dir: str,
) -> Tuple[List[Finding], Dict[str, int]]:
    """Grade report quotations only from captured excerpt bytes, never metadata.

    ``claim_positions`` is deliberately used only to associate report text with a
    fact. Its word-overlap fallback NEVER reaches ``verify_verbatim``: the latter
    performs the exact normalized substring comparison that alone can confirm.
    """
    findings: List[Finding] = []
    counts = {f"quote-{verdict}": 0 for verdict in quote_provenance.VERBATIM_VERDICTS}
    counts.update({f"quote-acquisition-{method}": 0 for method in quote_provenance.ACQUISITION_METHODS})
    counts["quote-acquisition-unknown"] = 0
    counts["quote-total"] = 0
    counts["quote-unchecked"] = 0
    spans = _quoted_spans(report_text)
    seen_pairs = set()

    for fact_index, fact in enumerate(facts):
        recorded_quote = fact.get("quote")
        if not isinstance(recorded_quote, str) or not recorded_quote.strip():
            continue
        acquisition = quote_provenance.read_acquisition(fact.get("acquisition"))
        claim = str(fact.get("claim", ""))
        positions = claim_positions(report_text, claim) or claim_positions(report_text, recorded_quote)
        normalized_recorded = quote_provenance.normalize_text(recorded_quote)
        candidates = [
            (span, start, end) for span, start, end in spans
            if quote_provenance.normalize_text(span) == normalized_recorded
            and any(abs(start - position) <= MARKER_WINDOW_CHARS for position in positions)
        ]
        for span, start, _ in candidates:
            pair = (fact_index, start)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            counts["quote-total"] += 1
            method_key = (
                f"quote-acquisition-{acquisition}"
                if acquisition in quote_provenance.ACQUISITION_METHODS
                else "quote-acquisition-unknown"
            )
            counts[method_key] += 1
            locator = fact.get("locator") or "(no locator)"
            source_url = str(fact.get("source_url", ""))

            try:
                schema_version = int(fact.get("schema_version"))
            except (TypeError, ValueError):
                schema_version = 0
            if schema_version < 4:
                verdict = quote_provenance.METHOD_UNKNOWN if acquisition == quote_provenance.METHOD_UNKNOWN else "no-excerpt"
                counts[f"quote-{verdict}"] += 1
                findings.append(Finding(
                    kind="QUOTE_NO_EXCERPT", claim=span, source_url=source_url,
                    detail=(f"quote {span!r} at {locator} is carried by schema v{schema_version or 'unknown'}; "
                            "quote provenance is not inside its signed message, so verbatim is unverified")))
                continue

            try:
                excerpt_rec = quote_provenance.load_excerpt(excerpt_dir, fact.get("excerpt_id"))
            except quote_provenance.ExcerptStoreError as exc:
                counts["quote-unchecked"] += 1
                findings.append(Finding(
                    kind="QUOTES_UNCHECKED", claim=span, source_url=source_url,
                    detail=f"quote {span!r} at {locator} could not be checked: {exc}"))
                continue

            verdict = quote_provenance.verify_verbatim(span, excerpt_rec, fact)
            counts[f"quote-{verdict}"] += 1
            if verdict == "verbatim-confirmed":
                continue
            reason = {
                "not-in-excerpt": "is absent from the single stored excerpt leaf; joining excerpts is forbidden",
                "no-excerpt": "has no decodable captured excerpt",
                "method-ineligible": f"uses acquisition method {acquisition!r}, whose ceiling forbids verbatim regardless of content",
                "hash-mismatch": "has an excerpt/body/source hash mismatch; author-constructed material grants nothing",
                quote_provenance.METHOD_UNKNOWN: "has an absent or unknown acquisition method; legacy method-unknown never grants verbatim",
            }[verdict]
            findings.append(Finding(
                kind=_quote_finding_kind(verdict), claim=span, source_url=source_url,
                detail=f"quote {span!r} at {locator} {reason} (verdict: {verdict})"))
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


# ---------------------------------------------------------------------------
# NEGATIVE CONCLUSIONS — the SECOND DIRECTION.
#
# Everything above this line walks FROM THE LEDGER TO THE REPORT: for each recorded
# fact, is it used, and is its use honest? That direction is structurally blind to a
# claim that HAS NO SOURCE — and the strongest claim a research report can make is
# exactly that shape: "no competitor has this; the niche is free."
#
# MEASURED on this package, 2026-09-01, by TWIN TEST rather than by grep (grep is not
# trustworthy here — it finds the vocabulary, not the blindness): two runs over ONE
# ledger, the reports differing by EXACTLY one line, that line being an unsupported
# negative conclusion. The gate's `--json` output was BYTE-IDENTICAL, both exit 0. So
# an unbacked negation can neither raise nor lower the finding count: it is outside
# the field of view by construction, not by oversight.
#
# THE MECHANISM: "we did not find it" and "we proved it is not there" arrive in the
# report in the SAME FORM, and decisions are made on both identically. The first is a
# property of the SEARCH. The second is a property of the WORLD. Only the second
# justifies building a product on an empty niche.
#
# THE CEILING, and why the obvious version of it is not enough. The first design said
# a negative conclusion needs an enumerable CORPUS declared exhaustive. A reviewing
# model called that the weakest part of the proposal and was RIGHT: an exhaustive LIST
# does not prove an exhaustive SEARCH. Twelve pages read end-to-end still miss the
# feature if the twelve were the wrong twelve, or if the query never used the vendor's
# word for it. So the ceiling also requires the SEARCH METHOD, the QUERY COVERAGE, the
# SAMPLING REFUSALS, and the corpus's TIME BOUNDARY. Without those, a strong "no"
# writes itself a licence.
#
# WHAT THIS SCAN CANNOT DECIDE, stated here and printed in the gate's output: whether
# the named corpus is the RIGHT corpus for the question. The record's own second case
# is exactly that — "does product X have feature Y", where the feature is documented
# only in the help centre and the corpus taken was the sitemap. A sitemap is a
# perfectly enumerable, perfectly exhaustive corpus, and the wrong one. This scan
# forces the corpus to be NAMED so a person can judge its fitness; judging it stays
# layer 3, and pretending otherwise would be the same false closure the whole gate
# exists to refuse.
# ---------------------------------------------------------------------------

# A NEGATIVE UNIVERSAL claim: absence asserted across a whole population of products,
# vendors or sources. Deliberately narrower than "any negation" — `there is no` alone
# fires on ordinary prose, and an eager gate is not a stricter gate, it is a deleted
# one. Every pattern here requires the UNIVERSAL, which is what makes the claim strong.
NEGATIVE_CLAIM_PATTERNS = (
    r"ни\s+у\s+одного",
    r"ни\s+один\s+из\s+[^.\n]{0,60}?\s+не\b",
    r"ни\s+одного\s+из",
    r"нет\s+ни\s+у\s+кого",
    r"ниша\s+свободна",
    r"никто\s+(?:из\s+\w+\s+)?не\s+(?:предлагает|поддерживает|делает|умеет)",
    r"отсутствует\s+у\s+всех",
    r"no\s+(?:competitor|vendor|provider|product|tool)s?\s+\w*\s*(?:has|have|offers?|supports?|provides?)",
    r"none\s+of\s+the\s+\w+\s+(?:has|have|offer|offers|support|supports|provide|provides)",
    r"nobody\s+(?:offers|supports|provides)",
    r"the\s+niche\s+is\s+(?:free|open|unoccupied)",
    r"we\s+found\s+no\s+\w+\s+(?:that|which)",
)

# The block that licenses such a claim. Both spellings, because a report may be written
# in either language; the fields must be VISIBLE to a reader, never a hidden attribute.
NEGATIVE_FIELDS = (
    ("corpus", ("КОРПУС", "CORPUS")),
    ("completeness", ("ПОЛНОТА", "COMPLETENESS")),
    ("method", ("СПОСОБ ПОИСКА", "SEARCH METHOD")),
    ("boundary", ("ГРАНИЦА КОРПУСА", "CORPUS AS OF")),
    ("implication", ("СЛЕДСТВИЕ", "IMPLICATION")),
)

# How far from the claim the licensing block may sit. Wider than MARKER_WINDOW_CHARS
# because this is a five-line block rather than a parenthetical, and narrower than the
# document because a basis in the appendix does not reach a sentence on page 2.
NEGATIVE_WINDOW_CHARS = 900

# CLOSED. Three, because collapsing them would erase the only distinction that matters:
# an enumerated corpus its own author calls complete is a different epistemic object
# from a sample, and both differ from not knowing which you have.
COMPLETENESS_VALUES = {
    "перечислимо и объявлено исчерпывающим": "exhaustive",
    "enumerable and declared exhaustive": "exhaustive",
    "выборка": "sample",
    "sample": "sample",
    "неизвестна": "unknown",
    "unknown": "unknown",
}

# CLOSED, and the whole point of the feature is that these two are not interchangeable.
IMPLICATION_VALUES = {
    "не встретилось": "not-encountered",
    "not encountered": "not-encountered",
    "намеренно отсутствует": "deliberately-absent",
    "deliberately absent": "deliberately-absent",
}


def _negative_field(window: str, spellings: Sequence[str]) -> Optional[str]:
    """The value of one licensing field inside the window, or None when it is absent.

    An EMPTY value returns '' and is never collapsed into absent: "КОРПУС:" with
    nothing after it is a different mistake from no КОРПУС line at all, and the two
    need different repairs.
    """
    for spelling in spellings:
        match = re.search(
            r"^[\s>*\-]*(?:\*\*)?" + re.escape(spelling) + r"(?:\*\*)?\s*[:：]\s*(.*)$",
            window, re.IGNORECASE | re.MULTILINE | re.UNICODE)
        if match:
            return match.group(1).strip().strip("*`")
    return None


def _closed_value(raw: Optional[str], table: Mapping[str, str]) -> Optional[str]:
    """Map a field value onto a CLOSED vocabulary, matching on the leading phrase so a
    author may add detail after it — `выборка — 12 из ~40 страниц` is a sample that
    says how big, which is better than a bare word and must not be refused for it."""
    if raw is None:
        return None
    lowered = raw.strip().lower()
    for key, value in table.items():
        if lowered == key or lowered.startswith(key + " ") or lowered.startswith(key + ",") \
                or lowered.startswith(key + " —") or lowered.startswith(key + " -") \
                or lowered.startswith(key + ":"):
            return value
    return "unrecognised"


def scan_negative_conclusions(report_text: str) -> List[Finding]:
    """The second direction: from the report's NEGATIVE conclusions back to their basis.

    A claim of universal absence must carry, within its window, the five fields that
    distinguish a property of the SEARCH from a property of the WORLD — and the strong
    implication (`намеренно отсутствует`) is admissible only on top of an exhaustive
    corpus, because an exhaustive list is not an exhaustive search.

    HONEST SCOPE: this matches CLAIM SHAPES and FIELD PRESENCE. It cannot tell whether
    the named corpus fits the question — a sitemap is enumerable, exhaustive and the
    wrong place to look for a feature. Naming the corpus is what makes that arguable;
    judging it is not this gate's to do.
    """
    findings: List[Finding] = []
    seen_spans: List[Tuple[int, int]] = []
    for pattern in NEGATIVE_CLAIM_PATTERNS:
        for hit in re.finditer(pattern, report_text, re.IGNORECASE | re.UNICODE):
            # One sentence, one finding: two patterns matching the same claim describe
            # one defect, and reporting it twice would inflate the count the twin test
            # measures.
            if any(start <= hit.start() < end for start, end in seen_spans):
                continue
            line_start = report_text.rfind("\n", 0, hit.start()) + 1
            line_end = report_text.find("\n", hit.end())
            line_end = len(report_text) if line_end < 0 else line_end
            seen_spans.append((line_start, line_end))
            claim = report_text[line_start:line_end].strip()

            window = report_text[max(0, hit.start() - NEGATIVE_WINDOW_CHARS):
                                 min(len(report_text), hit.end() + NEGATIVE_WINDOW_CHARS)]
            values = {name: _negative_field(window, spellings) for name, spellings in NEGATIVE_FIELDS}
            missing = [spellings[0] for name, spellings in NEGATIVE_FIELDS
                       if values[name] is None or values[name] == ""]
            if missing:
                findings.append(Finding(
                    kind="NEGATIVE_CONCLUSION_WITHOUT_BASIS", claim=claim, source_url="",
                    detail=("a claim of universal ABSENCE with no basis beside it — missing: {m}. "
                            "'we did not find it' and 'we proved it is not there' are written the "
                            "same way and decided on identically; the first is a property of the "
                            "SEARCH, the second of the WORLD. Required within {w} chars: {req}"
                            .format(m=", ".join(missing), w=NEGATIVE_WINDOW_CHARS,
                                    req=", ".join(s[0] for _, s in NEGATIVE_FIELDS)))))
                continue

            completeness = _closed_value(values["completeness"], COMPLETENESS_VALUES)
            implication = _closed_value(values["implication"], IMPLICATION_VALUES)
            if completeness == "unrecognised":
                findings.append(Finding(
                    kind="NEGATIVE_COMPLETENESS_UNRECOGNISED", claim=claim, source_url="",
                    detail=("ПОЛНОТА is {v!r}, which is outside the closed set {allowed}. An open "
                            "field here collects a word that sounds thorough and commits to nothing"
                            .format(v=values["completeness"],
                                    allowed=sorted(set(COMPLETENESS_VALUES.values()))))))
                continue
            if implication == "unrecognised":
                findings.append(Finding(
                    kind="NEGATIVE_IMPLICATION_UNRECOGNISED", claim=claim, source_url="",
                    detail=("СЛЕДСТВИЕ is {v!r}, which is outside the closed set {allowed}. These "
                            "two are exactly what must not be interchangeable"
                            .format(v=values["implication"],
                                    allowed=sorted(set(IMPLICATION_VALUES.values()))))))
                continue

            # THE CEILING, and the correction that made this record worth shipping: the
            # strong reading needs an exhaustive corpus UNDER it. A sample can support
            # "we did not encounter it" and can never support "it is deliberately absent".
            if implication == "deliberately-absent" and completeness != "exhaustive":
                findings.append(Finding(
                    kind="NEGATIVE_CLAIM_EXCEEDS_ITS_CEILING", claim=claim, source_url="",
                    detail=("СЛЕДСТВИЕ 'намеренно отсутствует' rests on ПОЛНОТА {c!r}. A sample — or "
                            "an unknown completeness — supports 'не встретилось' and nothing "
                            "stronger: absence in part of a corpus is absence from the SEARCH, not "
                            "from the world. Lower the implication, or make the corpus enumerable "
                            "and declare it exhaustive"
                            .format(c=values["completeness"]))))
    return findings


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


def render_quotes(counts: Dict[str, int]) -> str:
    """One compact, auditable line for the independent quote-verdict axis."""
    return (
        "  quotes: {total} checked — confirmed {confirmed} / absent {absent} / no-excerpt {missing} / "
        "method-ineligible {ineligible} / hash-mismatch {mismatch} / method-unknown {unknown} / "
        "unchecked {unchecked}; methods raw-fetch {raw} / tool-summary {tool} / search-listing {search} / "
        "manual {manual} / unknown {method_unknown}"
    ).format(
        total=counts.get("quote-total", 0),
        confirmed=counts.get("quote-verbatim-confirmed", 0),
        absent=counts.get("quote-not-in-excerpt", 0),
        missing=counts.get("quote-no-excerpt", 0),
        ineligible=counts.get("quote-method-ineligible", 0),
        mismatch=counts.get("quote-hash-mismatch", 0),
        unknown=counts.get("quote-method-unknown", 0),
        unchecked=counts.get("quote-unchecked", 0),
        raw=counts.get("quote-acquisition-raw-fetch", 0),
        tool=counts.get("quote-acquisition-tool-summary", 0),
        search=counts.get("quote-acquisition-search-listing", 0),
        manual=counts.get("quote-acquisition-manual", 0),
        method_unknown=counts.get("quote-acquisition-unknown", 0),
    )


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
        "over-eager, because a missed unread claim is silent while a false alarm is arguable. "
        "Negative conclusions are judged in the OTHER direction, from the claim back to its basis; "
        "that scan proves the basis is STATED, never that the named corpus fits the question."
    )
    return "\n".join(lines)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Refuse reports that lean on unread sources.")
    parser.add_argument("--report", required=True, help="path to the report markdown")
    parser.add_argument("--facts", required=True, help="path to facts.json")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    parser.add_argument("--pins", help="JSON file of {issuer: pubkey_b64} so ISSUER_SIGNED facts can be checked")
    parser.add_argument(
        "--excerpts",
        help="captured excerpt directory (default: evidence_excerpts beside the facts ledger)",
    )
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
    findings = (findings + population_findings + scan_relative_risk(report_text)
                + scan_negative_conclusions(report_text))
    excerpt_dir = args.excerpts or os.path.join(os.path.dirname(os.path.abspath(args.facts)), "evidence_excerpts")
    quote_findings, quote_counts = evaluate_quotes(report_text, facts, excerpt_dir)
    findings += quote_findings
    if args.json:
        print(
            json.dumps(
                {
                    "ok": not findings,
                    "counts": dict(counts, **population_counts, **quote_counts),
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
        print(render_quotes(quote_counts))
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
