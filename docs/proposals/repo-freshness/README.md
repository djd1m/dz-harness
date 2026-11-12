# repo-freshness — unreleased skill candidate

Focused assessment of code, release and support currency for a repository **and the
component/version someone intends to use**. It does not discover new projects or
replace a security audit. [Skill](skills/repo-freshness/SKILL.md) ·
[Duplicate audit](DEDUPLICATION.md) · [Behavior cases](evals/cases.json) ·
[Verification and limits](VERIFICATION.md).

The public repository is a mirror of npm tarballs. This proposal lives outside
`packages/` so published versions, signed manifests and SBOMs continue to describe
the existing published inventory. It is not available from npm or the default catalog.

## Try locally from this branch

From the repository root, using an already installed `dz`, target an empty scratch
project rather than replacing an existing installation:

```sh
dz list --skills-dir docs/proposals/repo-freshness/skills
dz init --target codex --project /tmp/repo-freshness-trial --skills-dir docs/proposals/repo-freshness/skills --select repo-freshness --no-hooks --no-integrations
```

The second command writes a local skill installation; it does not assess a repository
or configure hooks. Read the copied SKILL.md in the target's skills directory to use it.
No third-party repository code needs to run for this assessment.

## Canonical integration before release

Port the candidate directory into the canonical `skills-meta` source; add it to that
package's shipped files, source metadata and inventory. Verify registry discovery,
target compilation and packed consumer installation there. Then use the canonical
release/signing/mirror process. Do not repair old published signatures by editing this
mirror or claim the release is done when this draft PR exists.

The companion `repo-assessment` proposal is a broader selection workflow. These PRs
are independently reviewable; neither requires the other to be installed.
