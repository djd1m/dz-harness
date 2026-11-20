# repo-assessment — unreleased skill candidate

Task-specific selection of reusable repositories/components across C/F/M/P/O, with
evidence, eligibility, owner-facing tradeoffs and optional preference scenarios.
[Skill](skills/repo-assessment/SKILL.md) · [Duplicate audit](DEDUPLICATION.md) ·
[Behavior cases](evals/cases.json) · [Verification and limits](VERIFICATION.md).

This public repository is a mirror of published npm tarballs. The candidate is kept
under `docs/proposals/`, outside the published package inventory and signatures.
It is not a released skill or a change to the default `meta` preset.

## Try from this branch

With an existing `dz`, from the repository root:

```sh
dz list --skills-dir docs/proposals/repo-assessment/skills
dz init --target codex --project /tmp/repo-assessment-trial --skills-dir docs/proposals/repo-assessment/skills --select repo-assessment --no-hooks --no-integrations
```

This writes only the chosen skill to the explicit scratch project; use the copied
SKILL.md to perform a comparison. Neither `repo-freshness` nor an external research
runtime is required. A separately installed freshness skill may supply a deeper
same-component dated evidence record without duplicating its collection workflow.

## Integration before a release

Port to canonical `skills-meta`, register shipped files/source metadata/inventory,
verify discovery, target compilation and packed installation, then follow canonical
release/signing/mirror steps. Do not edit the mirror's old release version, manifests
or SBOM to make an unreleased candidate look published. This PR can be considered
independently of the companion repo-freshness proposal.

The method generalizes the owner's previous five-axis comparison. No private source
email, production log, credentials or private repository inventory is included.
