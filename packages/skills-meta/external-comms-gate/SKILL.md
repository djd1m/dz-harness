---
name: external-comms-gate
description: >
  Screens outbound communications for confidential information leaks before they go public.
  Covers PR descriptions, issue bodies, npm publish content, changelog entries, and README updates.
  Detects API keys, internal URLs, customer names, unreleased feature details, internal codenames,
  salary/financial data, and PII. Classifies findings as SAFE / WARNING / BLOCK with redaction suggestions.
  Triggers on: "check PR body", "screen this before publishing", "leak check", "comms gate",
  "review before posting", "safe to publish?".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# External Comms Gate

Screen outbound communications for confidential information before they reach public channels.
Inspired by [@windyroad/risk-scorer](https://agentskills.io) — applies risk-scoring principles
to the moment content crosses the public boundary.

## When to Use

- Before `gh pr create` — review PR title and body for leaks
- Before `gh issue create` — screen issue descriptions for internal details
- Before `npm publish` — scan the README and package.json `description` field
- Before committing CHANGELOG.md updates — check for unreleased feature hints
- Before pushing README updates — verify no internal codenames or customer references
- As a habit gate in CI — block publish jobs that contain flagged content

## When NOT to Use

- Internal-only documents (private wikis, internal Notion pages, local notes)
- Code review — use `security-testing` or `agentshield-scan` for source code secrets
- Runtime API call screening — this is static pre-publish analysis only
- Scanning already-published content for historical leaks (remediation scope differs)

## Protocol

### Step 1: Detect Outbound Content

Identify what content is about to go public and its channel:

| Source | Channel | Trigger |
|--------|---------|---------|
| `gh pr create --body "..."` | GitHub PR (public repo) | PR creation |
| `gh issue create --body "..."` | GitHub issue | Issue creation |
| `npm publish` README + description | npmjs.com | Package publish |
| `CHANGELOG.md` commit | Git history (public) | Changelog update |
| `README.md` push | GitHub repo | Doc push |
| Release notes / blog drafts | Any public publishing step | Manual trigger |

Extract the full text content to be screened.

### Step 2: Scan for Sensitive Patterns

Run each content block through the following detection categories:

| Category | Patterns | Examples |
|----------|----------|---------|
| **API keys / secrets** | Regex for common key formats | `sk-ant-`, `ghp_`, `AKIA`, JWT `eyJ...` |
| **Internal URLs** | Non-public hostnames, VPN addresses | `*.internal`, `*.corp`, `10.x.x.x`, `192.168.x.x` |
| **Customer names** | Proper nouns in client/customer context | "Acme Corp uses this to...", "deployed at ClientName" |
| **Unreleased features** | Version strings beyond current release, codename mentions | "coming in v5.0", "project Phoenix" |
| **Internal codenames** | CamelCase project names not in public vocabulary | Known internal project aliases |
| **Financial/salary data** | Dollar amounts in internal context, compensation figures | "$150k salary", "Q3 budget $2M" |
| **PII** | Email addresses (non-public), phone numbers, addresses | Personal contact details |
| **Internal ticket refs** | JIRA keys, internal tracker IDs used as sole context | "PROJ-1234 broke this" with no public link |

### Step 3: Classify Each Finding

Assign one of three classifications to each finding:

| Classification | Meaning | Action |
|---------------|---------|--------|
| **SAFE** | No sensitive content detected | Proceed — content is clear to publish |
| **WARNING** | Possibly sensitive — context-dependent | Human review required before publishing |
| **BLOCK** | Definite leak — must redact before publishing | Stop publish — provide redaction suggestion |

Classification rules:
- A confirmed API key format match → BLOCK regardless of context
- A customer name in a general example (e.g., "e.g., AcmeCorp") → WARNING
- A public API key shown in documentation as an example → SAFE (context: docs example)
- An internal URL with `.internal` TLD → BLOCK
- A JIRA ticket reference alone with no public context → WARNING

### Step 4: Report

Output a structured gate report:

```
EXTERNAL COMMS GATE REPORT
=============================================
Channel: {channel}
Content: {source description}
Overall: SAFE | WARNING | BLOCK

FINDINGS ({n}):
  [BLOCK] API key detected in PR body — line 14
    Found: "sk-ant-api03-..."
    Suggest: Replace with "<REDACTED>" or use a placeholder like "sk-ant-..."

  [WARNING] Customer name in changelog — line 8
    Found: "AcmeCorp integration now supported"
    Suggest: Replace with "Enterprise customer integration" or confirm name is public

  [SAFE] No PII found — pass

RECOMMENDATION:
  [ ] publish  (overall SAFE — zero BLOCK findings)
  [ ] review   (overall WARNING — review items above before publishing)
  [ ] hold     (overall BLOCK — redact before any public action)
=============================================
```

Overall is BLOCK if any individual finding is BLOCK.
Overall is WARNING if any finding is WARNING and none are BLOCK.
Overall is SAFE only when all findings are SAFE.

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|-------------|-------------|-----------------|
| Over-blocking technical terms | Flags "token", "key", "secret" as English words → false positives | Use pattern + context; require key-format regex, not bare words |
| Ignoring public documentation context | "API key goes here: `<YOUR_KEY>`" is safe in docs | Check for placeholder markers like `<...>`, `YOUR_`, `EXAMPLE_` |
| Treating all URLs as internal | Public CDN and GitHub URLs are fine | Flag only RFC-1918 ranges and non-public TLDs (.internal, .corp, .local) |
| Skipping changelog entries | Changelogs are public and often contain future-version hints | Always include CHANGELOG.md in the scan scope |
| Only scanning at PR time | npm publish and README pushes are separate channels | Apply gate to all identified outbound channels |

## Self-Check

- [ ] Content source and channel identified?
- [ ] All detection categories scanned?
- [ ] Each finding classified (SAFE / WARNING / BLOCK)?
- [ ] Redaction suggestion provided for every WARNING and BLOCK?
- [ ] Overall gate decision matches worst-case finding?
- [ ] Human notified of any WARNING or BLOCK before proceeding?

## Examples

**In scope:**
- "Check this PR body before I submit" → scan PR description for all categories
- "Is it safe to publish this npm package?" → scan package README + description field
- "Review my changelog before I push" → scan CHANGELOG.md entry
- "Screen this issue body for leaks" → scan issue content

**Out of scope:**
- "Scan my source code for hardcoded secrets" → use `agentshield-scan` skill
- "Audit my .claude/ hooks for security issues" → use `agentshield-scan` skill
- "Check my API for injection vulnerabilities" → use `security-testing` skill
