#!/usr/bin/env python3
"""Load-bearing security tests for ed25519_verifier.py.

RUN COMMAND (ADR-006 / D-21) — this module, like every other `test_*.py` beside it,
is collected by the ONE canonical command, never by a hand-kept enumeration:

    cd .../goap-research-ed25519/scripts && python3 -m unittest discover -s . -p 'test_*.py' -v

That is not a formatting preference. Before slice C this file — the security suite of
the very module the slice edits — was named by NO run command anywhere, so a "full
suite green" claim could have been true of the command and false of the code
(AM-14). `test_suite_completeness.py` now asserts the collected set equals `ls
test_*.py`, so a module that stops being collected fails BY NAME.
"""

import copy
import hashlib
import sys

# Import NOTHING local before this line: a stray __pycache__ inside this vendored
# skill reads as canonical drift and turns an unrelated repo test red.
sys.dont_write_bytecode = True

import unittest

import ed25519_verifier as ev
import evidence_fetch as ef
import quote_provenance as qp


def _pop():
    """A minimal VALID study population (FR-1 / D-1 made it mandatory, no default).

    These four call sites are the reason AM-14 is a P0: they are the security suite of
    the module being edited, and they were in no run command, so this migration could
    have silently broken them while every report still said "green".
    """
    return {
        "description": "adults enrolled in the cited cohort",
        "criteria": {
            "age": {"op": "range", "value": [18, 80], "kind": "eligibility",
                    "verbatim": "adults aged 18-80", "locator": "[Methods]"},
        },
    }


@unittest.skipIf(ev.CRYPTO_BACKEND is None, "No Ed25519 backend installed")
class Ed25519VerifierSecurityTests(unittest.TestCase):
    def make_pinned_pair(self):
        signer = ev.Ed25519Verifier(auto_generate_keypair=True)
        verifier = ev.Ed25519Verifier(
            trusted_issuers={
                "nature.com": {
                    "pubkey_b64": signer.get_public_key_b64(),
                    "status": "active",
                }
            }
        )
        return signer, verifier

    def test_attacker_self_signed_trusted_string_rejected(self):
        _, verifier = self.make_pinned_pair()
        attacker = ev.Ed25519Verifier(auto_generate_keypair=True)

        fact = attacker.create_issuer_signed_fact(
            claim="Fabricated result was published",
            source_url="https://nature.com/articles/example",
            source_content="attacker-controlled content",
            issuer="nature.com",
            study_population=_pop(),
        )

        result = verifier.verify_fact(fact)

        self.assertFalse(result.verified)
        self.assertEqual(result.confidence, 0.0)
        self.assertNotEqual(result.confidence, 0.95)

    def test_fact_signed_by_pinned_trusted_key_verifies(self):
        """A THIRD assertion whose meaning changed in slice C — re-derived, not nudged.

        The architecture named two such assertions (`test_evidence_provenance.py:97`
        and `:123`). This is a third, found only by RUNNING this file — which is
        exactly AM-14's point, since before slice C no run command named it.

        What changed: `create_issuer_signed_fact` used to mint a **v1** fact, and v1 is
        exempt from the source-tier ceiling (D-20's lower edge). It now mints **v3**,
        so the third ceiling applies and the documented chain
        `min(trust, evidence, tier)` is finally computed in full for this factory.
        `nature.com` is tier B (0.80), so 0.80 — not 0.95 — is the formula being
        HONOURED, not a downgrade bug. The assertion is written against
        `source_tier_ceiling(fact)` so it states the reason, not just the number.
        """
        signer, verifier = self.make_pinned_pair()

        fact = signer.create_issuer_signed_fact(
            claim="Pinned-key fact",
            source_url="https://nature.com/articles/example",
            source_content="source content",
            issuer="nature.com",
            study_population=_pop(),
        )

        result = verifier.verify_fact(fact)

        self.assertTrue(result.verified)
        self.assertEqual(result.trust_class, ev.TRUST_CLASS_ISSUER_SIGNED)
        self.assertEqual(ev.fact_schema_version(fact), 3, "every newly created fact is v3")
        self.assertEqual(ev.source_tier_ceiling(fact), 0.80, "nature.com is a tier-B source")
        self.assertEqual(result.confidence, 0.80,
                         "min(trust 0.95, evidence 1.0, tier 0.80) — the tier term is the binding one")

    def test_relabelled_or_moved_fact_fails(self):
        signer, verifier = self.make_pinned_pair()
        fact = signer.create_issuer_signed_fact(
            claim="Pinned-key fact",
            source_url="https://nature.com/articles/example",
            source_content="source content",
            issuer="nature.com",
            study_population=_pop(),
        )

        relabelled = copy.deepcopy(fact)
        relabelled.issuer = "science.org"
        relabelled_result = verifier.verify_fact(relabelled)

        moved = copy.deepcopy(fact)
        moved.source_url = "https://nature.com/articles/other"
        moved_result = verifier.verify_fact(moved)

        self.assertFalse(relabelled_result.verified)
        self.assertEqual(relabelled_result.confidence, 0.0)
        self.assertFalse(moved_result.verified)
        self.assertEqual(moved_result.confidence, 0.0)

    def test_reordered_citation_chain_fails(self):
        signer, verifier = self.make_pinned_pair()
        chain = ev.CitationChain(chain_id="test-chain")

        for index in range(3):
            chain.add_fact(
                signer.create_issuer_signed_fact(
                    claim=f"Claim {index}",
                    source_url=f"https://nature.com/articles/{index}",
                    source_content=f"source content {index}",
                    issuer="nature.com",
                    study_population=_pop(),
                )
            )

        signer.sign_chain(chain)
        ok, _, error = verifier.verify_citation_chain(chain, signer.get_public_key_b64())
        self.assertTrue(ok, error)

        reordered = ev.CitationChain(
            chain_id=chain.chain_id,
            facts=[chain.facts[1], chain.facts[0], chain.facts[2]],
            chain_signature=chain.chain_signature,
        )
        reordered_ok, _, reordered_error = verifier.verify_citation_chain(
            reordered,
            signer.get_public_key_b64(),
        )

        self.assertFalse(reordered_ok)
        self.assertIn("Invalid", reordered_error)

    def test_schema_v4_signs_quote_provenance_and_tamper_fails(self):
        signer = ev.Ed25519Verifier(auto_generate_keypair=True)
        body = b"The source explicitly recommends gradual refeeding."
        record = ef.FetchRecord(
            url="https://example.test/source",
            final_url="https://example.test/source",
            status=200,
            sha256_body=hashlib.sha256(body).hexdigest(),
            bytes_len=len(body),
            fetched_at="2026-09-02T00:00:00Z",
            content_type="text/plain; charset=utf-8",
            witness=ef._FETCH_WITNESS,
        )
        quote = qp.QuoteRecord(
            quote="The source explicitly recommends gradual refeeding",
            acquisition="raw-fetch",
            source_url=record.final_url,
            sha256_body=record.sha256_body,
            locator="paragraph 1",
            excerpt_id="quote.json",
        )
        fact = signer.create_fetched_fact(
            claim=quote.quote,
            fetch_record=record,
            issuer="researcher",
            study_population=_pop(),
            quote=quote,
        )

        result = signer.verify_fact(fact)
        self.assertTrue(result.verified, result.error)
        self.assertEqual(ev.fact_schema_version(fact), ev.QUOTE_ATTESTED_MIN_SCHEMA)
        self.assertIn("quote", result.signed_fields)
        self.assertIn("acquisition", result.signed_fields)
        self.assertIn("sha256_body", result.signed_fields)

        tampered = copy.deepcopy(fact)
        tampered.quote = "The source recommends immediate supplementation"
        self.assertFalse(signer.verify_fact(tampered).verified)

    def test_non_fetch_factory_cannot_claim_raw_fetch_acquisition(self):
        signer = ev.Ed25519Verifier(auto_generate_keypair=True)
        quote = qp.QuoteRecord(
            quote="A raw quote",
            acquisition="raw-fetch",
            source_url="https://example.test/source",
            sha256_body="a" * 64,
        )
        with self.assertRaisesRegex(ValueError, "requires create_fetched_fact"):
            signer.create_listing_fact(
                claim=quote.quote,
                source_url=quote.source_url,
                reason="listing only",
                study_population=_pop(),
                quote=quote,
            )


if __name__ == "__main__":
    unittest.main()
