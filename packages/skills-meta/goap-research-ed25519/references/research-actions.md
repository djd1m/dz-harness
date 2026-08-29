# GOAP Research Actions with Ed25519 Provenance

These actions describe how to use Ed25519 safely in the GOAP research workflow. Cryptographic verification means provenance and tamper-evidence under pinned keys; it does not establish truthfulness.

## configure_pinned_issuers

**Purpose:** Configure issuer -> pinned Ed25519 public key mappings.

**Preconditions:** You have obtained and reviewed the issuer public key out of band.

**Effects:** `pinned_issuers_configured`

```python
verifier.add_trusted_issuer("example.org", "ed25519:base64-public-key", status="active")
```

Do not add issuers without keys. A domain whitelist alone is not a crypto trust anchor.

## fetch_source

**Purpose:** Retrieve source content and record source metadata.

**Effects:** `content_retrieved`, `source_url_recorded`, `source_hash_calculated`

```python
source_hash = sha256(content)
```

The source hash is included in the canonical signed message.

## sign_extracted_facts

**Purpose:** Attach researcher self-attestation to extracted facts.

**Effects:** `signed_facts`, `researcher_signature_attached`

Self-attestation proves the research record was not altered after signing. It does not prove the source signed the claim and is capped below issuer-trusted confidence.

## verify_claim_cryptographic

**Purpose:** Verify issuer-signed facts against pinned active issuer keys.

**Preconditions:** `claim_identified`, `signature_available`, `pinned_issuer_key_available`

**Effects:** `cryptographic_provenance_verified` or `signature_rejected`

```python
result = verifier.verify_fact(fact)
if result.verified and result.trust_class == "ISSUER_SIGNED":
    accept_for_crypto_provenance(result)
else:
    reject_or_label_unverified(result.error)
```

Unknown issuer, missing pin, revoked key, embedded-key mismatch, malformed key, or invalid signature reject with confidence `0.0`.

## build_citation_chain

**Purpose:** Link signed facts with actual parent content hashes.

**Effects:** `citation_chain_complete`

```python
chain.add_fact(parent_fact)
chain.add_fact(child_fact)  # child.parent_hash = sha256(canonical_message(parent_fact))
chain_signature = verifier.sign_chain(chain)
```

## verify_citation_chain

**Purpose:** Verify per-fact signatures, parent hashes, and the chain signature over ordered fact hashes.

**Effects:** `chain_verified` or `chain_broken`

```python
all_verified, aggregate_confidence, error = verifier.verify_citation_chain(
    chain,
    chain_signer_pubkey_b64,
)
```

Reordered, substituted, edited, relabeled, or moved facts fail chain verification.

## recover_from_signature_failure

**Purpose:** Continue research after a failed crypto check without pretending the claim is cryptographically verified.

**Effects:** `alternative_source_found` or `unverified_but_documented`

Rules:

- Invalid signatures are rejected, not downgraded to `0.5`.
- Search for another source or another pinned issuer signature.
- If no valid signature exists and the mode allows it, label the claim unsigned/unverified and use ordinary source evaluation.
- In strict/paranoid mode, do not complete the plan with unsigned or invalid claims.

## Action Cost Notes

Verification adds cost because key pinning, signature checks, and chain checks take time. That cost never substitutes for trust. Trust comes only from the verified trust class and source evaluation.
