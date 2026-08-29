# Artifact Card Template

## Usage
This template is rendered once per approved finding during Module 04 (Integrate).
Replace all {PLACEHOLDER} values with finding data.

## Template

---

### {NAME}

**Category:** {CATEGORY}
**Maturity:** {MATURITY_BADGE} {MATURITY_LEVEL}
**Reusability Confidence:** {CONFIDENCE}
**Extracted from:** {SOURCE_PROJECT}
**Last updated:** {DATE}

#### Description

{DESCRIPTION}

#### When to use

{WHEN_TO_USE}

#### When NOT to use

{WHEN_NOT_TO_USE}

#### Example

{EXAMPLE}

#### Changelog

- v1: Initial extraction from {SOURCE_PROJECT} ({DATE})

---

## Placeholder Reference

| Placeholder | Source | Example |
|-------------|--------|---------|
| {NAME} | finding.title | "Agent Swarm Topology" |
| {CATEGORY} | finding.category | "patterns" |
| {MATURITY_BADGE} | maturity-model.md lookup | "🔴" |
| {MATURITY_LEVEL} | finding.maturity | "Alpha" |
| {CONFIDENCE} | finding.confidence | "0.85" |
| {SOURCE_PROJECT} | session.slug | "bank-kc-automation" |
| {DATE} | current date | "2026-03-03" |
| {DESCRIPTION} | finding.content (first paragraph) | "..." |
| {WHEN_TO_USE} | finding.when_to_use | "..." |
| {WHEN_NOT_TO_USE} | finding.when_not_to_use | "..." |
| {EXAMPLE} | finding.example | "..." |

## Placement Rules

For **skills** category: This template becomes the initial SKILL.md skeleton
For **commands** category: This template becomes the command .md file body
For **rules** category: Convert to rule table format (see .claude/rules/ convention)
For **templates/patterns/snippets** category: This card is appended to TOOLKIT_HARVEST.md under the relevant section
For **hooks** category: This card is appended to TOOLKIT_HARVEST.md hooks section (or created inline)
