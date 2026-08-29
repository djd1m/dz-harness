#!/usr/bin/env python3
"""
Ed25519 provenance verifier for GOAP research.

Ed25519 provides provenance and tamper-evidence under pinned trusted-issuer
keys. It proves who signed the canonical message and that signed bytes were not
altered. It does not prove that a claim is true.

Install a backend in an isolated environment:
    python3 -m venv .venv
    .venv/bin/pip install cryptography
    # or: .venv/bin/pip install pynacl

Avoid mutating system Python. Use --break-system-packages only as a last-resort
local workaround when you understand the system-integrity risk.
"""

import base64
import hashlib
import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

try:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
        Ed25519PublicKey,
    )

    CRYPTO_BACKEND = "cryptography"
except ImportError:
    try:
        import nacl.exceptions
        import nacl.signing

        CRYPTO_BACKEND = "pynacl"
    except ImportError:
        CRYPTO_BACKEND = None


TRUST_CLASS_ISSUER_SIGNED = "ISSUER_SIGNED"
TRUST_CLASS_SELF_ATTESTED = "SELF_ATTESTED"
TRUST_CLASS_UNVERIFIED = "UNVERIFIED"

# --- Evidence provenance (ADR-001): a SECOND, ORTHOGONAL axis -----------------
# trust_class answers "was this record altered after signing?".
# evidence_class answers "did anyone actually open the source?".
# A fact can be ISSUER_SIGNED *and* ASSERTED — that combination is legal, and it
# is exactly the dangerous one: a cryptographically perfect record of something
# the model recited from memory. Merging the two axes into one field would make
# that state inexpressible (and would repeat the whitelist_available defect,
# where "issuer-signed" and "belongs to a trusted class" were fused).
EVIDENCE_FETCH_VERIFIED = "FETCH_VERIFIED"  # this script performed the HTTP request itself
EVIDENCE_LISTING_ONLY = "LISTING_ONLY"      # URL known from a listing / body supplied by hand
EVIDENCE_ASSERTED = "ASSERTED"              # stated from model memory, source never opened

EVIDENCE_CLASSES = (EVIDENCE_FETCH_VERIFIED, EVIDENCE_LISTING_ONLY, EVIDENCE_ASSERTED)

# Confidence ceilings per evidence class. ASSERTED is 0.0 by construction, not
# "low": a claim nobody checked is not weak evidence, it is no evidence.
EVIDENCE_CEILINGS = {
    EVIDENCE_FETCH_VERIFIED: 1.0,
    EVIDENCE_LISTING_ONLY: 0.50,
    EVIDENCE_ASSERTED: 0.0,
}

# Signed-message schema marker (ADR-002 + its AM-1 amendment).
#
# HONEST ROLE: this marker is self-description. It is NOT what stops tampering.
# What stops tampering is that the v2 message CONTAINS the three new keys at all:
#   strip evidence_class → verifier builds the 6-key v1 text ≠ signed v2 text → fail
#   add   evidence_class → verifier builds the v2 text      ≠ signed v1 text → fail
# The first draft of ADR-002 credited this marker with closing the downgrade
# attack; the discrimination run refuted that (removing the marker left
# tamper_strip green). Keeping the wrong attribution would have been the exact
# class of error this feature exists to prevent.
FACT_SCHEMA_V2 = "fact-v2"

# v3 has LANDED (slice C, ADR-003): study_population, trust_class, confidence and
# metadata are inside the signed message. The same honest role applies to this
# marker as to v2's — self-description, not the protection. What protects a v3
# fact is that its message CONTAINS those four keys, so any reclaim/rewrite
# rebuilds a different text than the one that was signed.
FACT_SCHEMA_V3 = "fact-v3"

# The source-tier ceiling applies FROM this schema ONWARD (ADR-005 / D-20).
# Written as a LOWER BOUND, never as an equality: `!= 2` meant "applies to exactly
# the schema that introduced it", which silently switched the third ceiling off the
# moment v3 was minted (MEASURED: an unknown-domain fact went 0.40 → 1.0). A future
# v4 must not be able to repeat this a third time.
TIER_CEILING_MIN_SCHEMA = 2

# The schemas this verifier can reconstruct a signed message for. A version outside
# this tuple is REFUSED, never approximated to the nearest known one (QE G6).
KNOWN_SCHEMA_VERSIONS = (1, 2, 3)

# `VerificationResult.schema_version` when the fact's own version could not be
# identified at all. Not 1: reporting an unidentifiable record as "legacy v1" is the
# same laundering this slice exists to stop.
SCHEMA_VERSION_UNIDENTIFIED = 0


@dataclass
class PinnedKey:
    """Pinned issuer key. Only active pins can grant issuer-grade trust."""

    pubkey_b64: str
    status: str = "active"
    added_at: Optional[str] = None
    not_after: Optional[str] = None


@dataclass
class VerificationResult:
    """Result of a verification operation."""

    verified: bool
    content_hash: str
    signature: str
    issuer: str
    issuer_pubkey: str
    timestamp: str
    confidence: float
    trust_class: str = TRUST_CLASS_UNVERIFIED
    error: Optional[str] = None
    # --- what the signature actually covered (ADR-003, D-6) --------------------
    # Turns "the pre-v3 hole is documented" into "the pre-v3 hole is a VALUE a
    # caller can branch on". A consumer asking *may I rely on trust_class?* gets an
    # answer from the object instead of from a paragraph a tired reader skips at 2am.
    schema_version: int = 1
    signed_fields: Tuple[str, ...] = ()

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SignedFact:
    """A signed fact. Signatures cover issuer, source URL, claim, hash, time, context."""

    claim: str
    source_url: str
    source_hash: str
    issuer: str
    issuer_pubkey: str
    signature: str
    timestamp: str
    parent_citation: Optional[str] = None
    parent_hash: Optional[str] = None
    confidence: float = 0.0
    trust_class: str = TRUST_CLASS_SELF_ATTESTED
    research_context: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    # --- evidence axis (ADR-001). None = legacy fact: evidence is UNKNOWN, which
    # is neither ASSERTED nor FETCH_VERIFIED. Unknown is named, never guessed.
    evidence_class: Optional[str] = None
    fetch_date: Optional[str] = None
    source_date: Optional[str] = None
    # --- applicability axis (slice C / ADR-001). None = legacy fact: the study
    # population is UNKNOWN, which is neither "stated" nor "unstated-with-reason".
    # The DTO stays PERMISSIVE on purpose — a loader that refuses to parse a legacy
    # record cannot report on it, and a record we cannot parse is one we cannot warn
    # about. The mandatory-ness lives on the five CREATION paths, not here.
    study_population: Optional[Dict[str, Any]] = None
    # Self-describing schema version. Signed indirectly, via the "schema" marker in
    # the v3 message: stripping it makes the verifier rebuild a different text.
    schema_version: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2, sort_keys=True)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SignedFact":
        allowed = {field_name for field_name in cls.__dataclass_fields__}
        cleaned = {k: v for k, v in data.items() if k in allowed}
        cleaned.setdefault("trust_class", TRUST_CLASS_SELF_ATTESTED)
        cleaned.setdefault("metadata", {})
        return cls(**cleaned)

    @classmethod
    def from_json(cls, json_str: str) -> "SignedFact":
        return cls.from_dict(json.loads(json_str))


@dataclass
class CitationChain:
    """Chain of signed citations with hash links and a verifiable chain signature."""

    chain_id: str
    facts: List[SignedFact] = field(default_factory=list)
    chain_signature: Optional[str] = None
    chain_hash: Optional[str] = None
    integrity_verified: bool = False
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")

    def add_fact(self, fact: SignedFact) -> None:
        """Add fact to chain with automatic parent hash linking."""
        if self.facts:
            fact.parent_hash = fact_content_hash(self.facts[-1])
            fact.parent_citation = f"chain:{self.chain_id}:fact:{len(self.facts) - 1}"
        self.facts.append(fact)
        self.chain_hash = None

    def ordered_hashes(self) -> List[str]:
        return [fact_content_hash(fact) for fact in self.facts]

    def get_chain_hash(self) -> str:
        if self.chain_hash is None:
            self.chain_hash = hashlib.sha256(
                canonical_json({"chain_id": self.chain_id, "hashes": self.ordered_hashes()}).encode("utf-8")
            ).hexdigest()
        return self.chain_hash

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chain_id": self.chain_id,
            "facts": [f.to_dict() for f in self.facts],
            "chain_signature": self.chain_signature,
            "chain_hash": self.get_chain_hash(),
            "integrity_verified": self.integrity_verified,
            "created_at": self.created_at,
        }


def canonical_json(data: Dict[str, Any]) -> str:
    """Return deterministic JSON for signatures and hashes.

    `allow_nan=False` (D-18): NaN/Infinity are not JSON, and Python's default emits
    them as bare `NaN`/`Infinity` tokens that another runtime may reject or reparse
    differently — a serialization difference on the far side of a signed message is
    a security bug, not a formatting nit. Signing REFUSES rather than emitting a
    text no other reader can reproduce. Byte-identical for every value that does
    not contain NaN/Infinity, so v1/v2 messages are unchanged.
    """
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)


def canonical_fact_message_v1(fact: SignedFact) -> str:
    """Legacy signed message. Frozen: every fact signed before the evidence axis
    existed verifies against exactly these six fields."""
    return canonical_json(
        {
            "claim": fact.claim,
            "issuer": fact.issuer,
            "research_context": fact.research_context,
            "source_hash": fact.source_hash,
            "source_url": fact.source_url,
            "timestamp": fact.timestamp,
        }
    )


def canonical_fact_message_v2(fact: SignedFact) -> str:
    """Signed message that COVERS the evidence axis (ADR-002).

    The `schema` marker is load-bearing, not decoration: it makes the v1 and v2
    messages differ even when the six shared fields are identical, so BOTH tamper
    directions break the signature —
      * strip evidence_class  → verifier picks v1 → v1 text != signed v2 text → fail
      * add evidence_class    → verifier picks v2 → v2 text != signed v1 text → fail
    """
    return canonical_json(
        {
            "schema": FACT_SCHEMA_V2,
            "claim": fact.claim,
            "evidence_class": fact.evidence_class,
            "fetch_date": fact.fetch_date,
            "issuer": fact.issuer,
            "research_context": fact.research_context,
            "source_date": fact.source_date,
            "source_hash": fact.source_hash,
            "source_url": fact.source_url,
            "timestamp": fact.timestamp,
        }
    )


def _canonical_metadata(metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """`metadata` enters the v3 message as a NESTED OBJECT, never as a digest.

    A digest would sign the bytes without letting a reader see what was signed; a
    nested object keeps the audit trail readable and still tamper-evident, because
    `canonical_json` sorts keys deterministically. Non-serializable content raises
    (D-18) instead of being dropped — a silently dropped key is an UNSIGNED key.
    """
    payload = dict(metadata or {})
    try:
        canonical_json(payload)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"metadata is not canonically serializable ({exc}) — refusing to sign a message whose "
            f"contents cannot be reproduced byte-for-byte by the verifier"
        ) from None
    return payload


def canonical_fact_message_v3(fact: SignedFact) -> str:
    """Signed message that ADDITIONALLY covers the fields that decide how far a fact
    is trusted (ADR-003): `study_population`, `trust_class`, `confidence`, `metadata`.

    Why this is the whole of Part 3: `verify_fact()` selects its verification branch
    from `fact.trust_class` BEFORE any signature check. While `trust_class` sat
    outside the signed bytes, a fact signed `ISSUER_SIGNED` under a since-revoked pin
    could be relabelled `SELF_ATTESTED` with a text editor — the signature still
    verified (against the embedded key, on a branch that never consults the pin) and
    the fact came back verified at 0.60. A field that SELECTS the verification branch
    must be inside the envelope that branch is verifying.

    `confidence` is signed as a FIXED-WIDTH string: float repr differs across
    runtimes, and a signed message that two runtimes serialize differently is a
    signature that fails for the wrong reason.

    v1 and v2 remain byte-frozen: this function is additive, never a rewrite of them.
    """
    return canonical_json(
        {
            "schema": FACT_SCHEMA_V3,
            "claim": fact.claim,
            "confidence": format(round(float(fact.confidence or 0.0), 4), ".4f"),
            "evidence_class": fact.evidence_class,
            "fetch_date": fact.fetch_date,
            "issuer": fact.issuer,
            "metadata": _canonical_metadata(fact.metadata),
            "research_context": fact.research_context,
            "source_date": fact.source_date,
            "source_hash": fact.source_hash,
            "source_url": fact.source_url,
            "study_population": fact.study_population,
            "timestamp": fact.timestamp,
            "trust_class": fact.trust_class,
        }
    )


class SchemaVersionError(ValueError):
    """A fact whose schema cannot be identified. A subclass of ValueError so callers
    that already handle malformed facts keep working."""


def coerce_schema_version(value: Any) -> Optional[int]:
    """`value` → an integer schema version, or None when it is not one (QE G6).

    `int("not-a-number")` raised an UNCAUGHT ValueError out of the middle of a gate
    run — a traceback instead of a refusal. Parsing is now total: every input either
    names a version or names nothing, and the caller decides what to do with nothing.
    `bool` is rejected explicitly (`True` is not schema 1), and a non-integral float
    is rejected rather than truncated: `2.9` is not "schema 2".
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if float(value).is_integer() else None
    if isinstance(value, str):
        try:
            return int(value.strip())
        except (TypeError, ValueError):
            return None
    return None


def schema_version_of_mapping(data: Any) -> int:
    """The schema dispatch, over a RAW ledger dict.

    ONE definition, two entry points: `fact_schema_version` (a `SignedFact`) delegates
    here, and the report gate calls it directly on the JSON it loaded. The gate cannot
    build a `SignedFact` from a partial ledger record — the DTO's fields are mandatory
    — and a second copy of "which schema is this?" would be free to disagree with this
    one exactly where it matters.
    """
    if not isinstance(data, dict):
        raise SchemaVersionError(f"schema dispatch needs a mapping, got {type(data).__name__}")
    declared = data.get("schema_version")
    if declared is not None:
        version = coerce_schema_version(declared)
        if version is None:
            raise SchemaVersionError(
                f"schema_version {declared!r} is not an integer — a fact whose schema "
                f"cannot be identified cannot be verified against any message"
            )
        return version
    if data.get("study_population") is not None:
        return 3
    if data.get("evidence_class") is not None:
        return 2
    return 1


def fact_schema_version(fact: SignedFact) -> int:
    """Which signed-message schema this fact uses.

    Self-describing first (a v3 fact stores `schema_version=3`), then dispatch by
    field PRESENCE for records written before that field existed. Both routes are
    tamper-evident, and for the same reason: whichever version the verifier picks, it
    rebuilds THAT version's text, and a text that differs from the signed one fails.
    Stripping `schema_version` from a v3 fact makes it look like v2 → the v2 text is
    rebuilt → mismatch → refused.

    A `schema_version` that is not an integer raises `SchemaVersionError` — a NAMED
    refusal that `verify_fact()` converts into `verified=False`, instead of the bare
    `int()` crash it used to be.
    """
    return schema_version_of_mapping({
        "schema_version": fact.schema_version,
        "study_population": fact.study_population,
        "evidence_class": fact.evidence_class,
    })


def signed_fields_for(fact: SignedFact) -> Tuple[str, ...]:
    """The keys the fact's own signed message actually covers, sorted (D-6).

    Derived from the message that was ACTUALLY built, not from a hand-maintained
    table — a table would be a second definition of the same truth, and the two
    would drift. `"schema"` is dropped: it is the marker, not a fact field.
    """
    try:
        payload = json.loads(canonical_fact_message(fact))
    except Exception:
        return ()
    return tuple(sorted(key for key in payload if key != "schema"))


def canonical_fact_message(fact: SignedFact) -> str:
    """Canonical signed message for a fact — dispatched by schema version.

    DISPATCH IS EXACT, NOT A BAND (QE G6). The band `version >= 3` accepted any
    number at or above 3 as "v3", so `schema_version` could be moved 3 → 99 and the
    fact still verified: within the band the value is not covered by the signed text,
    which made a self-describing field silently editable. An unknown version now
    RAISES — the verifier refuses to guess which text a schema it has never seen was
    signed against, and `verify_fact()` turns that refusal into `verified=False`.
    Adding v4 is one new branch, and the refusal is what forces that branch to exist.
    """
    version = fact_schema_version(fact)
    if version == 3:
        return canonical_fact_message_v3(fact)
    if version == 2:
        return canonical_fact_message_v2(fact)
    if version == 1:
        return canonical_fact_message_v1(fact)
    raise SchemaVersionError(
        f"schema_version {version!r} is not a schema this verifier knows "
        f"{KNOWN_SCHEMA_VERSIONS} — refusing to reconstruct a message for it"
    )


def evidence_ceiling(evidence_class: Optional[str]) -> float:
    """Confidence ceiling contributed by the evidence axis. An UNKNOWN (legacy)
    evidence class contributes NO ceiling (1.0) — absence of evidence data is not
    evidence of absence; the legacy fact is judged by its trust class alone.
    An UNRECOGNISED class is 0.0: a misspelling must not read as permission."""
    if evidence_class is None:
        return 1.0
    return EVIDENCE_CEILINGS.get(evidence_class, 0.0)


def source_tier_ceiling(fact: SignedFact) -> float:
    """Ceiling from the source-class tier (FR-5). Wired because a formula printed
    in SKILL.md but never called is a false claim — the first draft computed
    min(trust, evidence) while the docs promised min(trust, evidence, tier), so an
    unknown-domain fact kept 0.60 instead of the promised 0.40 (Codex QE #6).

    APPLIES FROM SCHEMA v2 ONWARD. A new ceiling must not retroactively re-score
    records signed before it existed: wiring it globally silently downgraded a legacy
    ISSUER_SIGNED fact from 0.95 to 0.40 and broke the backward-compatibility test
    that is this feature's NFR-2 evidence. Old facts keep the semantics they were
    created under; the tier applies from the schema that introduced it.

    THE SCOPE IS A LOWER BOUND, NOT AN EQUALITY (ADR-005 / D-20). The condition read
    `!= 2` — which says "applies to exactly v2" — and the two readings coincided only
    while 2 was the newest schema. Minting v3 therefore switched this ceiling OFF in
    silence (MEASURED: the same unknown-domain fact scored 0.40 at schema 2 and 1.0 at
    schema 3). That is the SAME defect this docstring already records as shipped once,
    with one difference that makes it worse: the first time the ceiling was never
    wired; the second time it was wired, tested, and then disarmed by a migration two
    functions away.

    Import is local and fail-open: source_tiers is a DATA module, and missing data
    must never break signature verification."""
    try:
        version = fact_schema_version(fact)
    except SchemaVersionError:
        # An unidentifiable schema is the MOST cautious case, not an exempt one: the
        # same fail-closed reasoning as a missing source_tiers module below.
        return 0.40
    if version < TIER_CEILING_MIN_SCHEMA or not fact.source_url:
        return 1.0
    # FAIL CLOSED (Codex QE r2): the first version returned 1.0 when source_tiers
    # was missing or raised, so losing the security-data module SILENTLY RAISED
    # every confidence. A ceiling that disappears when its data disappears is not a
    # ceiling. Absent data ⇒ the most cautious tier, and the caller sees the low
    # number rather than a comfortable one.
    try:
        from source_tiers import classify_source, TIER_CEILINGS, TIER_D
    except Exception:
        return 0.40
    try:
        return classify_source(fact.source_url).ceiling
    except Exception:
        return TIER_CEILINGS.get(TIER_D, 0.40)


def _require_study_population(value: Any) -> Dict[str, Any]:
    """SHAPE-ONLY validation of the `study_population` an author supplies (D-2).

    ARCHITECTURAL CONSTRAINT (05_architecture.md §1.1c): this module must NEVER
    import `population_match`. A crypto module whose correctness depends on importing
    a semantics module is exactly the fail-open shape `source_tier_ceiling` was
    already bitten by — losing a data module SILENTLY RAISED every confidence. So
    `study_population` crosses the boundary as an OPAQUE JSON dict: the verifier
    validates its shape, never its meaning, and never interprets a criterion.

    Accepts anything exposing `to_dict()` (e.g. population_match.StudyPopulation)
    without importing that type — duck-typing here is a boundary, not a shortcut.
    """
    if value is None:
        raise ValueError(
            "study_population is required — a fact that does not say WHO the finding was measured "
            "in cannot be checked against any patient. Use StudyPopulation.unstated(reason) if the "
            "source genuinely does not state it; an unrecorded reason is indistinguishable from a bug."
        )
    if hasattr(value, "to_dict") and not isinstance(value, dict):
        value = value.to_dict()
    if not isinstance(value, dict):
        raise ValueError(f"study_population must be a JSON object, got {type(value).__name__}")
    description = value.get("description")
    if not isinstance(description, str) or not description.strip():
        raise ValueError("study_population.description must be a non-empty string")
    criteria = value.get("criteria") or {}
    unstated_reason = value.get("unstated_reason") or ""
    if not criteria and not str(unstated_reason).strip():
        raise ValueError(
            "study_population needs at least one criterion, or an explicit unstated_reason — "
            "`{description: 'adults', criteria: {}}` is present and meaningless"
        )
    try:
        canonical_json(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"study_population is not canonically serializable ({exc}) — a key the verifier cannot "
            f"reproduce byte-for-byte is a key that is not really signed"
        ) from None
    return value


def fact_content_hash(fact: SignedFact) -> str:
    """Stable hash for chain linkage. Excludes parent links and chain position."""
    return hashlib.sha256(canonical_fact_message(fact).encode("utf-8")).hexdigest()


class PinnedIssuerRegistry:
    """Issuer -> pinned Ed25519 public key registry."""

    def __init__(self, pins: Optional[Dict[str, Any]] = None):
        self._pins: Dict[str, PinnedKey] = {}
        for issuer, value in (pins or {}).items():
            self.add(issuer, value)

    def add(self, issuer: str, value: Any, status: str = "active") -> None:
        if isinstance(value, PinnedKey):
            pin = value
        elif isinstance(value, str):
            pin = PinnedKey(pubkey_b64=strip_ed25519_prefix(value), status=status)
        elif isinstance(value, dict):
            pubkey = value.get("pubkey_b64") or value.get("public_key") or value.get("pubkey")
            if pubkey is None:
                raise ValueError(f"Missing pubkey for issuer {issuer}")
            pin = PinnedKey(
                pubkey_b64=strip_ed25519_prefix(pubkey),
                status=value.get("status", status),
                added_at=value.get("added_at"),
                not_after=value.get("not_after"),
            )
        else:
            raise ValueError(f"Issuer {issuer} must pin an Ed25519 public key")
        self._pins[issuer] = pin

    def remove(self, issuer: str) -> None:
        self._pins.pop(issuer, None)

    def get(self, issuer: str) -> Optional[PinnedKey]:
        return self._pins.get(issuer)

    def is_active(self, issuer: str) -> bool:
        pin = self.get(issuer)
        return bool(pin and pin.status == "active")

    def to_dict(self) -> Dict[str, Dict[str, Any]]:
        return {issuer: asdict(pin) for issuer, pin in self._pins.items()}


def strip_ed25519_prefix(pubkey: str) -> str:
    return pubkey[8:] if pubkey.startswith("ed25519:") else pubkey


def decode_pubkey_b64(pubkey_b64: str) -> bytes:
    return base64.b64decode(strip_ed25519_prefix(pubkey_b64))


class Ed25519Verifier:
    """
    Ed25519 verification system for GOAP research.

    DEFAULT_TRUSTED_ISSUERS is intentionally empty. Issuer-grade trust requires
    explicit pinned public keys supplied by the user or calling template.
    """

    DEFAULT_TRUSTED_ISSUERS: Dict[str, Dict[str, str]] = {}

    def __init__(
        self,
        trusted_issuers: Optional[Dict[str, Any]] = None,
        verification_threshold: float = 0.85,
        auto_generate_keypair: bool = False,
    ):
        if CRYPTO_BACKEND is None:
            raise RuntimeError(
                "No cryptographic backend available. Prefer an isolated venv:\n"
                "  python3 -m venv .venv && .venv/bin/pip install cryptography\n"
                "or install pynacl in the same venv."
            )

        self.registry = PinnedIssuerRegistry(trusted_issuers or self.DEFAULT_TRUSTED_ISSUERS)
        self.trusted_issuers = self.registry.to_dict()
        self.verification_threshold = verification_threshold
        self.verification_ledger: List[VerificationResult] = []
        self._private_key: Optional[bytes] = None
        self._public_key: Optional[bytes] = None

        if auto_generate_keypair:
            self.generate_keypair()

    def generate_keypair(self) -> Tuple[bytes, bytes]:
        if CRYPTO_BACKEND == "cryptography":
            private_key = Ed25519PrivateKey.generate()
            public_key = private_key.public_key()
            private_bytes = private_key.private_bytes(
                encoding=serialization.Encoding.Raw,
                format=serialization.PrivateFormat.Raw,
                encryption_algorithm=serialization.NoEncryption(),
            )
            public_bytes = public_key.public_bytes(
                encoding=serialization.Encoding.Raw,
                format=serialization.PublicFormat.Raw,
            )
        else:
            signing_key = nacl.signing.SigningKey.generate()
            private_bytes = bytes(signing_key)
            public_bytes = bytes(signing_key.verify_key)

        self._private_key = private_bytes
        self._public_key = public_bytes
        return private_bytes, public_bytes

    def load_keypair(self, private_key: bytes, public_key: Optional[bytes] = None) -> None:
        self._private_key = private_key
        if public_key is not None:
            self._public_key = public_key
        elif CRYPTO_BACKEND == "cryptography":
            pk = Ed25519PrivateKey.from_private_bytes(private_key)
            self._public_key = pk.public_key().public_bytes(
                encoding=serialization.Encoding.Raw,
                format=serialization.PublicFormat.Raw,
            )
        else:
            signing_key = nacl.signing.SigningKey(private_key)
            self._public_key = bytes(signing_key.verify_key)

    def load_keypair_from_files(self, private_path: str, public_path: Optional[str] = None) -> None:
        with open(private_path, "rb") as f:
            private_key = f.read()
        public_key = None
        if public_path:
            with open(public_path, "rb") as f:
                public_key = f.read()
        self.load_keypair(private_key, public_key)

    def save_keypair_to_files(self, private_path: str, public_path: str) -> None:
        if self._private_key is None or self._public_key is None:
            raise ValueError("No keypair to save. Generate or load one first.")
        with open(private_path, "wb") as f:
            f.write(self._private_key)
        os.chmod(private_path, 0o600)
        with open(public_path, "wb") as f:
            f.write(self._public_key)

    def get_public_key_b64(self) -> str:
        if self._public_key is None:
            raise ValueError("No public key available.")
        return base64.b64encode(self._public_key).decode("ascii")

    def sign_content(self, content: str) -> Tuple[str, str]:
        if self._private_key is None:
            raise ValueError("No private key loaded. Call generate_keypair() first.")
        content_bytes = content.encode("utf-8")
        content_hash = hashlib.sha256(content_bytes).hexdigest()
        if CRYPTO_BACKEND == "cryptography":
            private_key = Ed25519PrivateKey.from_private_bytes(self._private_key)
            signature = private_key.sign(content_bytes)
        else:
            signing_key = nacl.signing.SigningKey(self._private_key)
            signature = signing_key.sign(content_bytes).signature
        return base64.b64encode(signature).decode("ascii"), content_hash

    def verify_signature(self, content: str, signature_b64: str, public_key: bytes) -> bool:
        try:
            content_bytes = content.encode("utf-8")
            signature = base64.b64decode(signature_b64)
            if CRYPTO_BACKEND == "cryptography":
                Ed25519PublicKey.from_public_bytes(public_key).verify(signature, content_bytes)
            else:
                nacl.signing.VerifyKey(public_key).verify(content_bytes, signature)
            return True
        except Exception:
            return False

    def add_trusted_issuer(self, domain: str, public_key_b64: str, status: str = "active") -> None:
        """Pin an issuer public key. A key is required; None is never trusted."""
        self.registry.add(domain, public_key_b64, status=status)
        self.trusted_issuers = self.registry.to_dict()

    def remove_trusted_issuer(self, domain: str) -> None:
        self.registry.remove(domain)
        self.trusted_issuers = self.registry.to_dict()

    def check_key_status(self, issuer: str) -> str:
        pin = self.registry.get(issuer)
        return pin.status if pin else "unknown"

    def is_trusted_issuer(self, domain: str) -> bool:
        """True only when a domain has an active pinned key."""
        return self.registry.is_active(domain)

    def create_signed_fact(
        self,
        claim: str,
        source_url: str,
        source_content: str,
        issuer: str,
        metadata: Optional[Dict[str, Any]] = None,
        research_context: Optional[str] = None,
        *,
        study_population: Any,
    ) -> SignedFact:
        """Create a researcher self-attested fact. This never grants issuer trust.

        `study_population` is KEYWORD-ONLY WITH NO DEFAULT (FR-1, D-1): omitting it is
        a `TypeError` raised by Python itself, not a validation branch a later author
        can soften. Keyword-only rather than positional so an un-migrated caller fails
        AT the call, naming the parameter, instead of silently absorbing its next
        argument.
        """
        if self._private_key is None or self._public_key is None:
            raise ValueError("No keypair loaded.")

        population = _require_study_population(study_population)
        source_hash = hashlib.sha256(source_content.encode("utf-8")).hexdigest()
        timestamp = datetime.utcnow().isoformat() + "Z"
        public_key_b64 = self.get_public_key_b64()
        fact = SignedFact(
            claim=claim,
            source_url=source_url,
            source_hash=source_hash,
            issuer=issuer,
            issuer_pubkey=f"ed25519:{public_key_b64}",
            signature="",
            timestamp=timestamp,
            confidence=0.60,
            trust_class=TRUST_CLASS_SELF_ATTESTED,
            research_context=research_context,
            metadata=metadata or {},
            study_population=population,
            schema_version=3,
        )
        fact.signature, _ = self.sign_content(canonical_fact_message(fact))
        return fact

    # ---------------------------------------------------------------- evidence axis
    # THREE constructors, not one with an `evidence_class=` parameter (ADR-003).
    # The manual paths below cannot emit FETCH_VERIFIED because they never receive
    # a FetchRecord — the restriction is in the API shape, not in the author's
    # discipline. A single constructor taking the class as an argument would put
    # the guarantee back on the caller's honesty, which is the thing that failed.

    def _sign_evidence_fact(
        self,
        claim: str,
        source_url: str,
        source_hash: str,
        issuer: str,
        evidence_class: str,
        fetch_date: Optional[str],
        source_date: Optional[str],
        metadata: Optional[Dict[str, Any]],
        research_context: Optional[str],
        base_confidence: float,
        *,
        study_population: Any,
    ) -> SignedFact:
        if self._private_key is None or self._public_key is None:
            raise ValueError("No keypair loaded.")
        if evidence_class not in EVIDENCE_CLASSES:
            raise ValueError(f"unknown evidence_class {evidence_class!r}; expected one of {EVIDENCE_CLASSES}")
        population = _require_study_population(study_population)
        fact = SignedFact(
            claim=claim,
            source_url=source_url,
            source_hash=source_hash,
            issuer=issuer,
            issuer_pubkey=f"ed25519:{self.get_public_key_b64()}",
            signature="",
            timestamp=datetime.utcnow().isoformat() + "Z",
            confidence=min(base_confidence, evidence_ceiling(evidence_class)),
            trust_class=TRUST_CLASS_SELF_ATTESTED,
            research_context=research_context,
            metadata=metadata or {},
            evidence_class=evidence_class,
            fetch_date=fetch_date,
            source_date=source_date,
            study_population=population,
            schema_version=3,
        )
        # ORDERING IS LOAD-BEARING: `confidence` is clamped by the evidence ceiling
        # ABOVE, before signing. Signing first and clamping after would put a number
        # in the envelope that the verifier then contradicts.
        fact.signature, _ = self.sign_content(canonical_fact_message(fact))
        return fact

    def create_fetched_fact(
        self,
        claim: str,
        fetch_record: Any,
        issuer: str,
        source_date: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        research_context: Optional[str] = None,
        *,
        study_population: Any,
    ) -> SignedFact:
        """FETCH_VERIFIED — requires proof the request actually happened.

        `fetch_record` must be an evidence_fetch.FetchRecord for a 2xx response.
        Duck-typed on purpose (the verifier must not import the network module),
        but validated: anything lacking the proof fields is refused outright
        rather than silently downgraded, because a caller reaching for THIS
        constructor is asserting a fetch occurred.
        """
        # A duck-typed check was NOT enough (Codex QE #1): a SimpleNamespace with
        # four plausible attributes minted FETCH_VERIFIED without any network I/O.
        # The record must be the real type AND carry this process's fetch witness,
        # which only evidence_fetch.fetch_source() hands out.
        if not getattr(fetch_record, "is_authentic", None) or not fetch_record.is_authentic():
            raise ValueError(
                "create_fetched_fact requires a FetchRecord produced by evidence_fetch.fetch_source() "
                "in this process — a hand-built or duck-typed record is not proof that a fetch happened"
            )
        required = ("sha256_body", "final_url", "status", "fetched_at")
        missing = [f for f in required if getattr(fetch_record, f, None) is None]
        if missing:
            raise ValueError(
                f"create_fetched_fact requires a FetchRecord; missing proof fields: {', '.join(missing)}"
            )
        if not (200 <= int(getattr(fetch_record, "status")) < 300):
            raise ValueError(
                f"create_fetched_fact refuses a non-2xx fetch (status {getattr(fetch_record, 'status')}) — "
                "an error page is not the source it stands for"
            )
        meta = dict(metadata or {})
        meta.setdefault("fetch_status", int(getattr(fetch_record, "status")))
        meta.setdefault("fetch_bytes", getattr(fetch_record, "bytes_len", None))
        if getattr(fetch_record, "final_url", None) != getattr(fetch_record, "url", None):
            meta.setdefault("redirected_from", getattr(fetch_record, "url", None))
        return self._sign_evidence_fact(
            claim=claim,
            source_url=getattr(fetch_record, "final_url"),
            source_hash=getattr(fetch_record, "sha256_body"),
            issuer=issuer,
            evidence_class=EVIDENCE_FETCH_VERIFIED,
            fetch_date=getattr(fetch_record, "fetched_at"),
            source_date=source_date,
            metadata=meta,
            research_context=research_context,
            base_confidence=0.60,
            study_population=study_population,
        )

    def create_listing_fact(
        self,
        claim: str,
        source_url: str,
        reason: str,
        source_content: Optional[str] = None,
        issuer: str = "researcher",
        source_date: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        research_context: Optional[str] = None,
        *,
        study_population: Any,
    ) -> SignedFact:
        """LISTING_ONLY — the URL is known but this script did not fetch it, or a
        body was supplied by hand. `reason` is MANDATORY and stored verbatim: a
        degradation whose cause is not recorded is indistinguishable from a bug.
        """
        if not reason or not reason.strip():
            raise ValueError("create_listing_fact requires a non-empty reason (why was this not fetched?)")
        meta = dict(metadata or {})
        meta["evidence_note"] = reason.strip()
        digest = hashlib.sha256((source_content or "").encode("utf-8")).hexdigest()
        if source_content is None:
            meta.setdefault("source_body", "not supplied — source_hash is the hash of an empty body")
        return self._sign_evidence_fact(
            claim=claim,
            source_url=source_url,
            source_hash=digest,
            issuer=issuer,
            evidence_class=EVIDENCE_LISTING_ONLY,
            fetch_date=None,
            source_date=source_date,
            metadata=meta,
            research_context=research_context,
            base_confidence=0.50,
            study_population=study_population,
        )

    def create_asserted_fact(
        self,
        claim: str,
        issuer: str = "researcher",
        source_url: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        research_context: Optional[str] = None,
        *,
        study_population: Any,
    ) -> SignedFact:
        """ASSERTED — stated from model memory, source never opened. Confidence is
        0.0 by construction: this is not weak evidence, it is no evidence. Such a
        fact exists so it can be RECORDED and then refused by the report gate,
        rather than quietly becoming a sentence in a medical document.
        """
        return self._sign_evidence_fact(
            claim=claim,
            source_url=source_url,
            source_hash=hashlib.sha256(b"").hexdigest(),
            issuer=issuer,
            evidence_class=EVIDENCE_ASSERTED,
            fetch_date=None,
            source_date=None,
            metadata=metadata,
            research_context=research_context,
            base_confidence=0.0,
            study_population=study_population,
        )

    def create_issuer_signed_fact(
        self,
        claim: str,
        source_url: str,
        source_content: str,
        issuer: str,
        metadata: Optional[Dict[str, Any]] = None,
        research_context: Optional[str] = None,
        *,
        study_population: Any,
    ) -> SignedFact:
        """Create a fact intended to verify against the active pinned key for issuer."""
        if self._public_key is None:
            raise ValueError("No keypair loaded.")
        population = _require_study_population(study_population)
        source_hash = hashlib.sha256(source_content.encode("utf-8")).hexdigest()
        timestamp = datetime.utcnow().isoformat() + "Z"
        fact = SignedFact(
            claim=claim,
            source_url=source_url,
            source_hash=source_hash,
            issuer=issuer,
            issuer_pubkey=f"ed25519:{self.get_public_key_b64()}",
            signature="",
            timestamp=timestamp,
            confidence=0.95,
            trust_class=TRUST_CLASS_ISSUER_SIGNED,
            research_context=research_context,
            metadata=metadata or {},
            study_population=population,
            schema_version=3,
        )
        fact.signature, _ = self.sign_content(canonical_fact_message(fact))
        return fact

    def _result(
        self,
        fact: SignedFact,
        verified: bool,
        confidence: float,
        trust_class: str,
        error: Optional[str],
    ) -> VerificationResult:
        try:
            schema_version = fact_schema_version(fact)
        except SchemaVersionError:
            # The result object must be constructible for EVERY fact, including the
            # one whose version is the reason it is being refused (QE G6).
            schema_version = SCHEMA_VERSION_UNIDENTIFIED
        result = VerificationResult(
            verified=verified,
            content_hash=fact.source_hash,
            signature=fact.signature,
            issuer=fact.issuer,
            issuer_pubkey=fact.issuer_pubkey,
            timestamp=fact.timestamp,
            confidence=confidence,
            trust_class=trust_class,
            error=error,
            schema_version=schema_version,
            signed_fields=signed_fields_for(fact),
        )
        self.verification_ledger.append(result)
        return result

    def _schema_refusal(self, fact: SignedFact) -> Optional[str]:
        """The refusal text for a fact whose schema cannot be identified, or None.

        Two ways a schema is unusable, and both used to end in a traceback rather than
        a verdict (QE G6): a `schema_version` that is not an integer at all, and one
        that is an integer this verifier has no message builder for.
        """
        try:
            version = fact_schema_version(fact)
        except SchemaVersionError as exc:
            return str(exc)
        if version not in KNOWN_SCHEMA_VERSIONS:
            return (
                f"schema_version {version} is not one of {KNOWN_SCHEMA_VERSIONS} — this verifier "
                f"cannot reconstruct the message such a fact would have been signed against"
            )
        return None

    def _legacy_reclaim_belt(self, fact: SignedFact) -> Optional[str]:
        """BOUNDED BELT for pre-v3 facts, not a closure (M3.7).

        A v1/v2 fact never signed its `trust_class`, so the §0.1 reclaim attack
        remains available against every record signed before this slice. What CAN be
        checked is the one field those schemas DO sign: `issuer`. So if a fact claims
        SELF_ATTESTED while its issuer holds a NON-ACTIVE pin, refuse — the attacker
        cannot redirect the lookup, because `issuer` is inside the signed bytes.

        HONEST SCOPE: an UNPINNED issuer's fact is still launderable to
        SELF_ATTESTED @ 0.60. That residual is unclosable for bytes signed without
        `trust_class`, and it is named in SKILL.md rather than papered over.
        """
        if fact_schema_version(fact) >= 3:
            return None
        if fact.trust_class != TRUST_CLASS_SELF_ATTESTED:
            return None
        pin = self.registry.get(fact.issuer)
        if pin is not None and pin.status != "active":
            return (
                f"legacy fact claims {TRUST_CLASS_SELF_ATTESTED} but its issuer's pinned key is "
                f"{pin.status} — pre-v3 facts do not sign trust_class, so the claim cannot be trusted"
            )
        return None

    def verify_fact(self, fact: SignedFact) -> VerificationResult:
        """
        Verify a signed fact.

        ISSUER_SIGNED verifies against the pinned active key for fact.issuer, not
        the embedded key. SELF_ATTESTED verifies against the embedded researcher
        key but is capped at 0.60 and never promoted to issuer trust.
        """
        if not fact.issuer_pubkey.startswith("ed25519:"):
            return self._result(fact, False, 0.0, TRUST_CLASS_UNVERIFIED, "Invalid public key format")

        # A fact whose schema cannot be identified is REFUSED, never crashed on and
        # never guessed at (QE G6). This is deliberately the FIRST substantive check:
        # every branch below reconstructs a message, and there is no message to
        # reconstruct for a schema this verifier does not know.
        schema_refusal = self._schema_refusal(fact)
        if schema_refusal is not None:
            return self._result(fact, False, 0.0, TRUST_CLASS_UNVERIFIED, schema_refusal)

        embedded_pubkey_b64 = strip_ed25519_prefix(fact.issuer_pubkey)

        legacy_refusal = self._legacy_reclaim_belt(fact)
        if legacy_refusal is not None:
            return self._result(fact, False, 0.0, TRUST_CLASS_UNVERIFIED, legacy_refusal)

        if fact.trust_class == TRUST_CLASS_SELF_ATTESTED:
            try:
                public_key = decode_pubkey_b64(embedded_pubkey_b64)
            except Exception:
                return self._result(fact, False, 0.0, TRUST_CLASS_UNVERIFIED, "Invalid embedded public key")
            if self.verify_signature(canonical_fact_message(fact), fact.signature, public_key):
                # Weakest link, not the average: a signed-but-unread claim is capped by
                # the evidence axis regardless of how sound its signature is (ADR-001).
                capped = min(
                    fact.confidence or 0.60,
                    0.60,
                    evidence_ceiling(fact.evidence_class),
                    source_tier_ceiling(fact),
                )
                return self._result(fact, True, capped, TRUST_CLASS_SELF_ATTESTED, None)
            return self._result(fact, False, 0.0, TRUST_CLASS_UNVERIFIED, "Self-attestation signature failed")

        pin = self.registry.get(fact.issuer)
        if pin is None:
            return self._result(fact, False, 0.0, TRUST_CLASS_UNVERIFIED, "Unknown issuer or missing pinned key")
        if pin.status != "active":
            return self._result(fact, False, 0.0, TRUST_CLASS_UNVERIFIED, f"Issuer key status is {pin.status}")
        if embedded_pubkey_b64 != strip_ed25519_prefix(pin.pubkey_b64):
            return self._result(fact, False, 0.0, TRUST_CLASS_UNVERIFIED, "Embedded public key does not match pinned key")

        try:
            public_key = decode_pubkey_b64(pin.pubkey_b64)
        except Exception:
            return self._result(fact, False, 0.0, TRUST_CLASS_UNVERIFIED, "Pinned public key is malformed")

        verified = self.verify_signature(canonical_fact_message(fact), fact.signature, public_key)
        if not verified:
            return self._result(fact, False, 0.0, TRUST_CLASS_UNVERIFIED, "Signature verification failed")
        # An ISSUER_SIGNED fact that nobody actually read is still capped by the
        # evidence axis — this is the dangerous quadrant the axis exists to expose.
        capped = min(
            fact.confidence or 0.95,
            0.95,
            evidence_ceiling(fact.evidence_class),
            source_tier_ceiling(fact),
        )
        return self._result(fact, True, capped, TRUST_CLASS_ISSUER_SIGNED, None)

    def chain_message(self, chain: CitationChain) -> str:
        return canonical_json({"chain_id": chain.chain_id, "hashes": chain.ordered_hashes()})

    def sign_chain(self, chain: CitationChain) -> str:
        """Sign the ordered list of fact content hashes."""
        signature, _ = self.sign_content(self.chain_message(chain))
        chain.chain_signature = signature
        chain.chain_hash = chain.get_chain_hash()
        return signature

    def verify_chain_signature(self, chain: CitationChain, public_key_b64: Optional[str] = None) -> bool:
        if not chain.chain_signature:
            return False
        if public_key_b64 is None:
            if self._public_key is None:
                return False
            public_key = self._public_key
        else:
            try:
                public_key = decode_pubkey_b64(public_key_b64)
            except Exception:
                return False
        return self.verify_signature(self.chain_message(chain), chain.chain_signature, public_key)

    def verify_citation_chain(
        self,
        chain: CitationChain,
        chain_signer_pubkey_b64: Optional[str] = None,
    ) -> Tuple[bool, float, Optional[str]]:
        if not chain.facts:
            return False, 0.0, "Empty chain"

        all_verified = True
        total_confidence = 0.0
        errors: List[str] = []

        for i, fact in enumerate(chain.facts):
            result = self.verify_fact(fact)
            total_confidence += result.confidence
            if not result.verified:
                all_verified = False
                errors.append(f"Fact {i}: {result.error}")
            if i == 0:
                if fact.parent_hash:
                    all_verified = False
                    errors.append("Fact 0: Root fact must not have a parent hash")
            else:
                expected_parent_hash = fact_content_hash(chain.facts[i - 1])
                if fact.parent_hash != expected_parent_hash:
                    all_verified = False
                    errors.append(f"Fact {i}: Invalid parent hash")

        if not self.verify_chain_signature(chain, chain_signer_pubkey_b64):
            all_verified = False
            errors.append("Invalid or missing chain signature")

        aggregate_confidence = total_confidence / len(chain.facts)
        chain.integrity_verified = all_verified
        return all_verified, aggregate_confidence, "; ".join(errors) if errors else None

    def get_verification_ledger(self) -> List[Dict[str, Any]]:
        return [r.to_dict() for r in self.verification_ledger]

    def sign_ledger(self) -> str:
        ledger_json = canonical_json({"ledger": self.get_verification_ledger()})
        signature, _ = self.sign_content(ledger_json)
        return signature

    def export_ledger(self, filepath: str) -> None:
        data = {
            "ledger": self.get_verification_ledger(),
            "signature": self.sign_ledger(),
            "exported_at": datetime.utcnow().isoformat() + "Z",
            "signer_pubkey": f"ed25519:{self.get_public_key_b64()}" if self._public_key else None,
        }
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2, sort_keys=True)

    def clear_ledger(self) -> None:
        self.verification_ledger.clear()


def generate_keypair_b64() -> Tuple[str, str]:
    verifier = Ed25519Verifier()
    private_bytes, public_bytes = verifier.generate_keypair()
    return base64.b64encode(private_bytes).decode("ascii"), base64.b64encode(public_bytes).decode("ascii")


def quick_sign(content: str, private_key_b64: str) -> str:
    verifier = Ed25519Verifier()
    verifier.load_keypair(base64.b64decode(private_key_b64))
    signature, _ = verifier.sign_content(content)
    return signature


def quick_verify(content: str, signature_b64: str, public_key_b64: str) -> bool:
    verifier = Ed25519Verifier()
    return verifier.verify_signature(content, signature_b64, base64.b64decode(public_key_b64))


if __name__ == "__main__":
    print("Ed25519 Provenance Verifier Demo")
    print("=" * 60)
    print(f"Crypto Backend: {CRYPTO_BACKEND}")
    print()

    issuer = Ed25519Verifier(auto_generate_keypair=True)
    issuer_pubkey = issuer.get_public_key_b64()
    verifier = Ed25519Verifier(trusted_issuers={"nature.com": {"pubkey_b64": issuer_pubkey, "status": "active"}})
    issuer.load_keypair(issuer._private_key, issuer._public_key)

    # The demo is user-facing example code, so it must MODEL the required argument
    # rather than route around it. This is the shape a caller should copy.
    DEMO_POPULATION = {
        "description": "adults aged 40-70 enrolled in the demo cohort",
        "criteria": {
            "age": {"op": "range", "value": [40, 70], "kind": "eligibility",
                    "verbatim": "adults aged 40-70", "locator": "[Methods, Participants]"},
        },
    }

    fact = issuer.create_issuer_signed_fact(
        claim="The study found a 25% improvement in efficiency",
        source_url="https://nature.com/articles/example",
        source_content="Full article content here...",
        issuer="nature.com",
        research_context="demo-run",
        study_population=DEMO_POPULATION,
    )
    result = verifier.verify_fact(fact)
    print("[1] Pinned issuer fact")
    print(f"Verified: {result.verified}")
    print(f"Confidence: {result.confidence}")
    print(f"Trust class: {result.trust_class}")
    print()

    attacker = Ed25519Verifier(auto_generate_keypair=True)
    forged = attacker.create_issuer_signed_fact(
        claim="Fabricated claim",
        source_url="https://nature.com/articles/example",
        source_content="Fake content",
        issuer="nature.com",
        study_population=DEMO_POPULATION,
    )
    forged_result = verifier.verify_fact(forged)
    print("[2] Attacker self-signed trusted string")
    print(f"Verified: {forged_result.verified}")
    print(f"Confidence: {forged_result.confidence}")
    print(f"Error: {forged_result.error}")
    print()

    chain = CitationChain(chain_id="research_001")
    for i in range(2):
        chain.add_fact(
            issuer.create_issuer_signed_fact(
                claim=f"Claim {i + 1}",
                source_url=f"https://nature.com/articles/{i + 1}",
                source_content=f"Source content {i + 1}",
                issuer="nature.com",
                research_context="demo-run",
                study_population=DEMO_POPULATION,
            )
        )
    issuer.sign_chain(chain)
    all_verified, confidence, error = verifier.verify_citation_chain(chain, issuer_pubkey)
    print("[3] Citation chain")
    print(f"All verified: {all_verified}")
    print(f"Aggregate confidence: {confidence:.2%}")
    print(f"Errors: {error}")
