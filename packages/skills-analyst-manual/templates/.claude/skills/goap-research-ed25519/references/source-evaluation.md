# Source Evaluation with Ed25519 Provenance

Source evaluation and cryptographic provenance are separate checks.

Ed25519 can prove that an active pinned issuer key signed the canonical message and that the signed bytes were not altered. It does not prove that a claim is true. Continue to evaluate methodology, source independence, conflicts of interest, corroboration, and recency.

## Levels

| Level | Source type | Notes |
|---|---|---|
| 5 | Primary documents, official filings, peer-reviewed sources, direct data exports | Strongest non-crypto source tier. |
| 4 | Established reporting, official company materials, reputable databases | Strong but may have bias or interpretation. |
| 3 | Industry reports, analyst estimates, expert commentary | Useful with corroboration. |
| 2 | Blogs, social posts, marketing pages | Use carefully and label limitations. |
| 1 | Forums, uncited claims, unknown provenance | Low confidence. |

## Crypto Trust Classes

| Trust class | Meaning | Confidence impact |
|---|---|---|
| `ISSUER_SIGNED` | Valid signature under active pinned key for the claimed issuer | May reach trusted tier, capped at `0.95`. |
| `SELF_ATTESTED` | Researcher signed the extracted fact for audit-log tamper-evidence | Capped at `0.60`. |
| `UNVERIFIED` | Unknown, unsigned, revoked, mismatched, malformed, or invalid signature | `0.0` for crypto provenance. |

Invalid signatures are automatic rejection for crypto provenance. They are never a `0.50` multiplier.

## Single Confidence Formula

```
if trust_class == UNVERIFIED:
    confidence = 0.0
elif trust_class == SELF_ATTESTED:
    confidence = min(0.60, source_level / 5 * recency_factor)
elif trust_class == ISSUER_SIGNED:
    confidence = min(0.95, source_level / 5 * recency_factor)
```

Recency factors are domain-specific. A common default is `1.0` for current sources, `0.9` for recent sources, `0.8` for older but still relevant sources, and lower when the domain changes quickly.

## Mode Behavior

| Mode | Unsigned or invalid claims |
|---|---|
| `development` | Allowed only when labeled. |
| `moderate` | Allowed with lower confidence and explicit caveats. |
| `strict` | Rejected. |
| `paranoid` | Rejected. |

The planner enforces strict/paranoid rejection by discarding completed plans that still contain unsigned claims.

## Practical Checklist

- Identify the source URL for each claim.
- Record source level and recency.
- If using issuer-grade crypto, verify against a pinned active issuer key.
- Reject unknown, revoked, mismatched, malformed, or invalid signatures.
- Treat self-attestation as audit evidence only.
- Cross-check important claims through independent sources.
- Report limitations and unresolved uncertainty explicitly.
