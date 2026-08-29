---
name: agentshield-scan
description: >
  Security scanner for AI agent configurations — scans .claude/ skills, hooks, MCP servers,
  agents, and settings for 170 security rules across 10 categories (secrets, permissions,
  hooks injection, MCP supply-chain, prompt injection, agent manipulation).
  Wraps ecc-agentshield (npx ecc-agentshield scan). Outputs JSON for CI integration.
  Triggers on: "security scan", "agent security", "agentshield", "scan hooks",
  "check permissions", "audit .claude config".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# AgentShield Security Scanner

Scan your AI agent configuration for security vulnerabilities using
[AgentShield](https://github.com/affaan-m/agentshield) (170 rules, 10 categories).

## When to Use

- Before deploying skills to production — audit `.claude/` directory
- After installing new MCP servers — check for supply-chain risks
- After adding hooks — check for command injection, data exfiltration
- During PR review — scan for hardcoded secrets, overly permissive settings
- As a CI quality gate — JSON output integrates with pipeline checks
- Before publishing skill packs — verify no secrets or dangerous patterns

## When NOT to Use

- Scanning application source code — AgentShield scans agent configs, not app code
- Runtime security monitoring — this is static analysis only
- For general SAST/DAST — use `security-testing` skill instead

## Prerequisites

```bash
# AgentShield is run via npx (no global install needed):
npx ecc-agentshield scan

# Or install globally:
npm install -g ecc-agentshield
agentshield scan
```

## Protocol

### Step 1: Run AgentShield Scan

```bash
npx ecc-agentshield scan --format json
```

This auto-discovers and scans:

| File Type | What it finds |
|-----------|--------------|
| `CLAUDE.md` | Dangerous instructions, prompt injection patterns |
| `settings.json` | Overly permissive allow rules, wildcard permissions |
| `mcp.json` | Unversioned packages, `npx -y` supply-chain risk, hardcoded secrets |
| `.claude/agents/*.md` | Unrestricted tool access, jailbreak patterns, hidden Unicode |
| `.claude/skills/*.md` | Auto-run instructions, data harvesting directives |
| `.claude/hooks/*.sh` | Command injection, reverse shells, data exfiltration |
| `.claude/rules/*.md` | Conflicting or dangerous always-apply rules |
| `package.json` | Plaintext registry credentials, lifecycle script risks |

### Step 2: Parse Findings

AgentShield JSON output structure:

```json
{
  "timestamp": "2026-06-08T...",
  "targetPath": "/project",
  "findings": [
    {
      "id": "SECRETS-001",
      "severity": "critical",
      "category": "secrets",
      "title": "Anthropic API key exposed",
      "description": "...",
      "file": "CLAUDE.md",
      "line": 15,
      "evidence": "sk-ant-api03-...",
      "fix": { "before": "...", "after": "...", "auto": true }
    }
  ],
  "score": { "grade": "B", "points": 78 },
  "summary": { "critical": 0, "high": 2, "medium": 5, "low": 3, "info": 1 }
}
```

### Step 3: Classify and Prioritize

Map findings to action categories:

| Severity | Action | Example |
|----------|--------|---------|
| **critical** | BLOCK — fix immediately before any deployment | Exposed API keys, reverse shell in hooks |
| **high** | FIX — address before next PR merge | Wildcard permissions, `npx -y` without version pin |
| **medium** | WARN — address in next sprint | Missing deny lists, unescaped variables in hooks |
| **low** | NOTE — track for future improvement | Missing PreToolUse hooks, broad MCP permissions |
| **info** | LOG — informational | Best practice suggestions |

### Step 4: Generate Report

```
AGENTSHIELD SECURITY REPORT
=============================================
Grade: {A-F} ({points}/100)
Scan: {N} files, {M} findings

CRITICAL ({n}):
  {id}: {title} — {file}:{line}
  Fix: {fix.before} → {fix.after}

HIGH ({n}):
  ...

MEDIUM ({n}):
  ...

RECOMMENDATION:
  [ ] pass (grade A-B, no critical/high)
  [ ] fix-and-rescan (grade C+, or any critical/high)
  [ ] block (grade D-F)
=============================================
```

### Step 5: Integration with QE Pipeline

Feed findings into other skills:

| Target | What to feed | Why |
|--------|-------------|-----|
| `security-testing` | High/critical findings | Deep OWASP analysis on flagged patterns |
| `brutal-honesty-review` | All findings as context | Code reviewer sees security posture |
| `feature-adr` Step 8 | Summary as QE input | Security is part of quality gate |
| AgentDB | Store scan results | Track security posture over time |

### Step 6: CI Integration (Optional)

For CI pipelines, use JSON output and gate on the severity summary:

```bash
npx ecc-agentshield scan --format json --output agentshield.json
# Parse agentshield.json (summary.critical / summary.high) to fail the build
```

> ecc-agentshield supports `--format terminal|json|markdown|html` (default `terminal`).
> It does NOT emit SARIF; gate CI on the JSON summary instead.

## 170 Rules Across 10 Categories

| Category | Rules | What it checks |
|----------|-------|---------------|
| Secrets | 10 | API keys, JWT tokens, connection strings, private keys |
| Permissions | 16 | Wildcard allows, missing deny lists, dangerous flags |
| Hooks | 40 | Command injection, data exfiltration, reverse shells, silent errors |
| MCP Servers | 26 | Supply-chain (`npx -y`), hardcoded env secrets, remote transport |
| Agents | 41 | Prompt injection, jailbreak, unrestricted tools, hidden Unicode |
| Prompt Defense | 13 | Injection detection patterns |
| Package Manager | 15 | Registry credentials, lifecycle scripts |
| MCP CVEs | 2 | Known MCP vulnerabilities |
| MCP Tool Poisoning | 5 | Tool description manipulation |
| Skills | 2 | Auto-run patterns in SKILL.md |

## Output

Structured report conforming to `schemas/output.json`:

- `grade` — A through F
- `score` — 0 to 100
- `findings_count` — total findings by severity
- `categories` — count per category
- `critical_findings` — list of critical issues
- `recommendation` — pass / fix-and-rescan / block

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|-------------|-------------|-----------------|
| Skip scan for "trusted" skills | Supply-chain attacks target trusted sources | Scan everything, including your own skills |
| Ignore medium/low findings | They accumulate into systemic risk | Track and address in sprints |
| Scan only CLAUDE.md | Hooks and MCP configs are higher risk | Scan entire .claude/ directory |
| Fix without rescanning | May introduce new issues | Always rescan after fixes |
| Use scan as sole security | Static analysis misses runtime issues | Combine with security-testing skill |

## Self-Check

- [ ] AgentShield installed and runnable (`npx ecc-agentshield scan`)?
- [ ] Scan completed without errors?
- [ ] All critical findings addressed?
- [ ] All high findings have remediation plan?
- [ ] JSON report exported for CI (if applicable)?
- [ ] Results stored in AgentDB (if available)?

## Examples

**In scope:**
- "Scan my .claude/ directory for security issues" → run agentshield scan
- "Are there any secrets in my CLAUDE.md?" → scan + filter secrets category
- "Check if my MCP servers are safe" → scan + filter mcp category
- "Generate a machine-readable report for CI" → `--format json --output agentshield.json`

**Out of scope:**
- "Scan my Python code for SQL injection" → use security-testing skill
- "Pen-test my API" → use pentest-validation skill
- "Monitor runtime security" → use shift-right-testing skill
