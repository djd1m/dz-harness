# Maturity Model Reference

Three maturity levels are used to communicate how well-tested and battle-proven an extracted finding is.
Every finding must be assigned a maturity level at extraction time. The level is surfaced in the artifact card
and in TOOLKIT_HARVEST.md entries so consumers know how much trust to place in the finding.

## Maturity Levels

| Level | Label | Criteria | Badge |
|-------|-------|----------|-------|
| Alpha | Alpha | First extraction, untested. Used in exactly 1 project. No validation. | 🔴 |
| Beta | Beta | Used in 2+ projects. Basic validation. May have rough edges. | 🟡 |
| Stable | Stable | Used in 3+ projects. Proven track record. Passed /bto-test or equivalent. | 🟢 |

## Promotion Protocol

Promotion moves a finding from one maturity level to the next. Promotion requires evidence — it is not
self-declared. The `/harvest` command can suggest promotion but not enforce it; the user confirms.

### Alpha to Beta

Required evidence (any one of the following):
- The same pattern, rule, template, or snippet was independently observed in a second project's harvest.
- A team member explicitly applied the finding in a second project and confirmed it worked.
- The finding was referenced in a command or skill that was used in a second research session.

Promotion action:
1. Update the `maturity` field in the finding's TOOLKIT_HARVEST.md entry from `alpha` to `beta`.
2. Add a `used_in` list to the entry noting the two (or more) projects.
3. Log the promotion: `PROMOTED: "{name}" alpha -> beta — evidence: {source}`.

### Beta to Stable

Required evidence (ALL of the following):
- Used in 3 or more distinct projects (verified by `used_in` list).
- At least one of the following validation signals exists:
  - Passed `/bto-test` Layer 2 evaluation with score >= 7.0.
  - Has a documented test case in a `references/` or `examples/` directory.
  - Was reviewed and approved by a second human reviewer in a harvest session.

Promotion action:
1. Update the `maturity` field from `beta` to `stable`.
2. Record the validation signal: BTO score, test case path, or reviewer name.
3. Add the finding to the summary table in TOOLKIT_HARVEST.md under the Stable Findings section.
4. Log the promotion: `PROMOTED: "{name}" beta -> stable — validation: {signal}`.

### Demotion Protocol

A stable or beta finding may be demoted if evidence of unreliability emerges:
- A project reports the finding caused errors or required significant modification.
- A `/bto-test` run scores the finding below 5.0.

Demotion action:
1. Downgrade maturity by one level (stable -> beta, beta -> alpha).
2. Add a `demotion_reason` note to the TOOLKIT_HARVEST.md entry.
3. Log the demotion: `DEMOTED: "{name}" {from} -> {to} — reason: {reason}`.

## Initial Assignment Rules

1. The first extraction of any finding is ALWAYS assigned `alpha` maturity.
2. Exception: if the finding describes a pattern that was already in use across multiple projects
   prior to being formally extracted, it may be assigned `beta` at extraction time — but only if
   the extractor can cite at least 2 distinct prior uses in the finding's `used_in` field.
3. Exception: if the extracted finding is a verbatim copy of content that already exists in the
   toolkit at beta or stable maturity (e.g., an updated version of a known pattern), inherit the
   existing maturity level and propose a MERGE rather than a new entry.
4. No finding may be assigned `stable` at first extraction, regardless of prior use.

## Maturity in Artifact Card

Every finding written to TOOLKIT_HARVEST.md includes a maturity badge in its header card.

### Format

```
## [Category] — {finding_name}
**Maturity:** [ALPHA | BETA | STABLE]
**Confidence:** {confidence_score}
**Used in:** {project_slug_1}, {project_slug_2}, ...
**Validated by:** {bto_score or test_path or reviewer or "not yet validated"}
```

### Display Rules

- Display maturity label in uppercase.
- If `used_in` has only one entry, display it as `{slug} (source project)`.
- If `validated_by` is empty, display `not yet validated`.
- Include the maturity badge on the same line as the finding name when embedding in summary tables:

```
| {finding_name} [ALPHA] | {category} | {one-line description} |
```

- In summary tables, badge order is: STABLE first, then BETA, then ALPHA (most trustworthy at top).
