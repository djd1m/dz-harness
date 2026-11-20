# Verification — 12 November 2026

## Observed checks

- Skill Creator `quick_validate.py`: valid name/frontmatter and no unfinished scaffold.
- `dz list --skills-dir ...`: discovers `repo-assessment` from this proposal.
- Installed CLI used for discovery/installation: `dz 0.8.49`.
- `dz init` into empty isolated Codex and OpenCode projects: exit 0, the skill and
  both references copied. The final clarified reference was installed again to new
  isolated projects and bytes matched. Explicit
  `--no-hooks --no-integrations`: no hook/MCP configuration created.
- Local Markdown links resolve; six unique fixture IDs parse. Parent independently
  recalculated the requested scenario arithmetic using rational arithmetic.
- Independent forward test by **gpt-6-astra**, supplied only the skill, references and
  raw six-case fixture, without expected answers/criteria. [Actual answers](evals/forward-results.md).
  Parent compared the outputs with [criteria](evals/criteria.md): 6/6 preserve the
  required distinctions and arithmetic. No tests/execution or live source retrieval
  are falsely claimed by those outputs.

Cases cover different component roles, high scores with failed eligibility, scenario
weights/ties/unknowns, README versus inspected source, an accepted local-only ADR, and
README instruction injection. They are authored synthetic cases, not a holdout or
evidence of production adoption.

## Reviewer ambiguity and repair

The forward evaluator identified ambiguity in "required axis" when an unknown P axis
has zero weight. It applied the intended stricter rule, withholding the total, while
  correctly noting the arithmetic could be independent of P. The reference now explicitly
names all-five-axis completeness, including zero-weight axes, as a policy of this
candidate. It distinguishes that policy from mathematical necessity and allows an
explicitly defined alternative model. The same independent reviewer reread that
paragraph and confirmed the ambiguity is resolved; this was not a new case run.
No other behavioral claim is inferred from this wording repair; the original
observation remains in the answer artifact.

## Limits

No live repository comparison, native runtime conversation, full routing benchmark,
canonical package build, registry-default installation, npm publication or signature
refresh. File-installation checks do not prove native skill invocation or semantic
quality. No trust-tier promotion or universal reliability claim follows from six
authored cases. Before release, port into the canonical source, renew deduplication,
and run its current packaging, target and release checks.
