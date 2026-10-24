# Research Quality Rules

## Research mode selection
- Use GOAP `moderate` for ordinary web and publication sources. Cite material factual claims,
  identify uncertainty and do not turn an unverified claim into a decisive conclusion.
- Select GOAP `strict` or `paranoid` only after confirming both `issuer_keys_available` (real
  pinned Ed25519 issuer keys) and `source_class_verified` (signed delivery for that source
  class). A URL or citation alone establishes neither capability.
- If the requested mode returns `GOAL_UNREACHABLE`, record the missing capabilities and stop
  the research checkpoint. Do not emit a success promise or advance to the next phase.
- Zero tolerance for invented citations applies in every mode. Source attribution and issuer
  signature verification are different claims.

## Citation Requirements
- Format: `[Claim] — Source: [URL or publication], [Date]`
- No bare claims without attribution in research documents
- Self-generated analysis must be explicitly marked as `[ANALYSIS]`

## Verification Checklist
Before completing any research phase:
- [ ] All claims have sources
- [ ] No unverified statistics or percentages presented as established facts
- [ ] Competitor names verified to exist
- [ ] Technology recommendations are for real, available products
- [ ] Regulatory references cite actual laws/standards
