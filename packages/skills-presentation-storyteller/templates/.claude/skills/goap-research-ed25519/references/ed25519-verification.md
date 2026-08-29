# Ed25519 Verification Reference

Ed25519 is used here for provenance and tamper-evidence under pinned trusted-issuer keys. It proves that a specific key signed a specific canonical message and that the signed bytes were not altered. It does not prove the claim is true.

## Safe Install

Prefer an isolated Python environment:

```bash
python3 -m venv .venv
.venv/bin/pip install cryptography
```

`pynacl` is also supported. Avoid mutating system Python; `--break-system-packages` is only a last-resort local workaround when you understand the risk.

## Trust Bootstrap

Issuer trust requires an explicit pinned public key:

```python
verifier = Ed25519Verifier(
    trusted_issuers={
        "example.org": {"pubkey_b64": "base64-ed25519-public-key", "status": "active"}
    }
)
```

The embedded `issuer_pubkey` in a fact is an untrusted hint. For issuer-signed facts it must match the pinned key for the claimed issuer. Unknown issuer, missing pin, revoked key, malformed key, embedded-key mismatch, or invalid signature all reject with confidence `0.0`.

## Canonical Message

Both signing and verification use deterministic JSON containing:

- `issuer`
- `source_url`
- `claim`
- `source_hash`
- `timestamp`
- `research_context`

The code signs the raw canonical message bytes. Do not pre-hash with SHA-512; Ed25519 performs its own internal hashing. `source_hash` is a SHA-256 digest of source content and is one field inside the signed message.

## Trust Classes and Confidence

| Trust class | Verification path | Confidence |
|---|---|---|
| `ISSUER_SIGNED` | Signature verifies under active pinned key for `issuer` | capped at `0.95` |
| `SELF_ATTESTED` | Researcher signature verifies under embedded key | capped at `0.60` |
| `UNVERIFIED` | Unknown, revoked, mismatched, malformed, or invalid | `0.0` |

Invalid signatures are rejected. They are not downgraded to a `0.5` confidence.

## Citation Chains

Each child fact stores the actual content hash of the previous fact:

```python
child.parent_hash = sha256(canonical_message(parent_fact))
```

`chain_signature` signs the ordered list of fact hashes. Verification recomputes parent hashes and verifies the chain signature. Reordering or substituting facts fails.

## Replay and Revocation Limits

Revocation is enforced for configured pinned keys through `status: active|revoked`. Online revocation fetching is not implemented.

Replay protection is limited to binding a caller-provided `research_context` or nonce into the signed message. A persistent nonce ledger is not implemented, so replay detection across runs is not guaranteed.

## Minimal Usage

```python
from ed25519_verifier import Ed25519Verifier

issuer = Ed25519Verifier(auto_generate_keypair=True)
verifier = Ed25519Verifier(
    trusted_issuers={
        "example.org": {"pubkey_b64": issuer.get_public_key_b64(), "status": "active"}
    }
)

fact = issuer.create_issuer_signed_fact(
    claim="Example claim",
    source_url="https://example.org/source",
    source_content="source bytes",
    issuer="example.org",
    research_context="run-2026-07-06",
)

result = verifier.verify_fact(fact)
assert result.verified
assert result.confidence == 0.95
```
