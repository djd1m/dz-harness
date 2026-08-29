#!/usr/bin/env python3
"""
Source-class tiers and staleness — the THIRD ceiling (FR-5, FR-6).

Before this, every fact carried trust_class=SELF_ATTESTED with a flat 0.60 cap,
so a Cochrane meta-analysis and a forum post were indistinguishable by that field.
Tiering by source CLASS is imperfect but incomparably more useful than flat.

What a tier is NOT: it is not a cryptographic statement about the issuer, and it
must never be confused with issuer key pinning (the `whitelist_available` defect
fused exactly these two ideas and made high-stakes modes unreachable). A tier is
a claim about the class a domain belongs to. Nothing more.

Ceilings compose as a MINIMUM with the other two axes — the weakest link decides:
    confidence = min(trust_ceiling, evidence_ceiling, tier_ceiling)

Data lives in TIER_DOMAINS below rather than in a config file on purpose: this is
a small, reviewable, version-controlled list, and a medical package should not
silently pick up trust rules from an unversioned file on disk.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple
from urllib.parse import urlparse

TIER_A = "A"  # guideline bodies, national registries, systematic-review orgs
TIER_B = "B"  # peer-reviewed literature
TIER_C = "C"  # preprints, trial registries
TIER_D = "D"  # secondary reviews, media, forums, unknown

TIER_CEILINGS: Dict[str, float] = {TIER_A: 0.90, TIER_B: 0.80, TIER_C: 0.60, TIER_D: 0.40}

# Suffix match on the registrable host: "www.cochrane.org" and "x.cochrane.org"
# both match "cochrane.org", while "cochrane.org.evil.com" does NOT (see _host_matches).
TIER_DOMAINS: Dict[str, str] = {
    # A — guidelines, registries, HTA/【systematic review】 bodies
    "cochrane.org": TIER_A,
    "cochranelibrary.com": TIER_A,
    "who.int": TIER_A,
    "nice.org.uk": TIER_A,
    "uspreventiveservicestaskforce.org": TIER_A,
    "escardio.org": TIER_A,
    "diabetes.org": TIER_A,
    "acc.org": TIER_A,
    "ahajournals.org": TIER_A,
    "cdc.gov": TIER_A,
    "nih.gov": TIER_A,
    "fda.gov": TIER_A,
    "ema.europa.eu": TIER_A,
    # B — peer-reviewed literature
    "pubmed.ncbi.nlm.nih.gov": TIER_B,
    "ncbi.nlm.nih.gov": TIER_B,
    "doi.org": TIER_B,
    "nejm.org": TIER_B,
    "thelancet.com": TIER_B,
    "bmj.com": TIER_B,
    "jamanetwork.com": TIER_B,
    "sciencedirect.com": TIER_B,
    "springer.com": TIER_B,
    "wiley.com": TIER_B,
    "nature.com": TIER_B,
    # C — preprints and registries (registered ≠ peer-reviewed ≠ completed)
    "medrxiv.org": TIER_C,
    "biorxiv.org": TIER_C,
    "clinicaltrials.gov": TIER_C,
    "osf.io": TIER_C,
}
# NOTE: keys are HOSTS only. A path-scoped rule ("who.int/trialsearch": C) is DEAD
# here — classify_source matches on hostname, so such a key can never fire and the
# URL silently inherits its host's tier (Codex QE #13). Path-scoped tiering needs a
# different matcher; until it exists, we do not pretend to have it.

# Freshness TTLs in days, by topic kind. A source older than its TTL is flagged
# `may_be_stale` — a flag, never a silent drop: an old guideline is still the
# guideline until a newer one is found.
TTL_DAYS: Dict[str, int] = {
    "guideline": 365 * 2,
    "registry": 180,
    "meta_analysis": 365 * 2,
    "trial": 365 * 3,
    "price": 7,
    "news": 30,
    "default": 365,
}


@dataclass(frozen=True)
class TierVerdict:
    tier: str
    ceiling: float
    matched_domain: Optional[str]
    known: bool


def _registrable_candidates(host: str) -> Tuple[str, ...]:
    """Progressive suffixes of the host, longest first: a.b.c → (a.b.c, b.c, c).

    Matching on suffix LABELS (not raw string endswith) is what stops
    `cochrane.org.evil.com` from inheriting tier A.
    """
    labels = [label for label in host.split(".") if label]
    return tuple(".".join(labels[i:]) for i in range(len(labels)))


def _host_matches(host: str) -> Optional[str]:
    for candidate in _registrable_candidates(host):
        if candidate in TIER_DOMAINS:
            return candidate
    return None


def classify_source(url: str) -> TierVerdict:
    """Tier for a URL. An UNKNOWN domain gets tier D — the most cautious class,
    not an exception and not a free pass. Unknown is a state, not an error."""
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        scheme = (parsed.scheme or "").lower()
    except Exception:
        host, scheme = "", ""
    # file://who.int/... must not read as tier A: a tier is a claim about a WEB
    # source class, and a local path is not one (Codex QE #13).
    if scheme not in ("http", "https"):
        return TierVerdict(tier=TIER_D, ceiling=TIER_CEILINGS[TIER_D], matched_domain=None, known=False)
    if not host:
        return TierVerdict(tier=TIER_D, ceiling=TIER_CEILINGS[TIER_D], matched_domain=None, known=False)
    matched = _host_matches(host)
    if matched is None:
        return TierVerdict(tier=TIER_D, ceiling=TIER_CEILINGS[TIER_D], matched_domain=None, known=False)
    tier = TIER_DOMAINS[matched]
    return TierVerdict(tier=tier, ceiling=TIER_CEILINGS[tier], matched_domain=matched, known=True)


def _parse_date(value: str) -> Optional[datetime]:
    raw = value.strip().replace("Z", "+00:00")
    for parse in (
        lambda v: datetime.fromisoformat(v),
        lambda v: datetime.strptime(v, "%Y-%m-%d"),
        lambda v: datetime.strptime(v, "%Y"),
    ):
        try:
            parsed = parse(raw)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
    return None


def is_stale(source_date: Optional[str], kind: str = "default", now: Optional[datetime] = None) -> Tuple[bool, str]:
    """(stale?, reason). An ABSENT date is reported as unknown-and-therefore-flagged:
    the report author must not be able to dodge the freshness question by omitting
    the field — that is how "is the Turkish ban still in force?" went wrong."""
    ttl = TTL_DAYS.get(kind, TTL_DAYS["default"])
    if not source_date:
        return True, "source_date missing — freshness cannot be established"
    parsed = _parse_date(source_date)
    if parsed is None:
        return True, f"source_date {source_date!r} is unparseable — freshness cannot be established"
    reference = now or datetime.now(timezone.utc)
    age_days = (reference - parsed).days
    if age_days < 0:
        # A source dated in the future is not "fresh forever" — it is a data error,
        # and treating it as fresh made 2099 an eternal pass (Codex QE #14).
        return True, f"source_date {source_date!r} is in the future ({-age_days}d ahead) — implausible"
    if age_days > ttl:
        return True, f"source is {age_days}d old, past the {ttl}d TTL for kind={kind}"
    return False, f"source is {age_days}d old, within the {ttl}d TTL for kind={kind}"
