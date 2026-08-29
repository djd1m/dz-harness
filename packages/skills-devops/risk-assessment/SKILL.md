---
name: "risk-assessment"
description: "Scores pipeline risks, validates commits for security issues, and detects secret leaks before push."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# risk-assessment

Scores pipeline risks using a probability-times-impact matrix, validates commits for security issues, detects secret leaks before push, and gates deployments based on risk thresholds. Based on DevSecOps risk scoring principles.

## When to use

- User wants to assess risk of a code change before merging
- User needs pre-push secret leak detection
- User wants to score a PR for security, performance, and reliability risks
- User asks to evaluate dependency vulnerabilities
- User wants a risk gate for CI/CD pipelines
- User needs breaking change detection

## When NOT to use

- User wants a full security audit (use `security-audit` or `codeql-fix`)
- User wants to fix a specific CVE (use `codeql-fix`)
- User wants code quality review without risk focus (use `pr-review`)
- User wants to write security tests (use `playwright-testing` or test generation)

## Procedure

1. **Identify risk categories.** Classify the change across four dimensions:
   - **Security:** Does this change touch authentication, authorization, encryption, secrets, user input handling, or external API calls?
   - **Performance:** Does this change affect query patterns, caching, concurrency, memory allocation, or hot code paths?
   - **Reliability:** Does this change affect error handling, retries, circuit breakers, timeouts, or data consistency?
   - **Compliance:** Does this change affect data retention, PII handling, logging of sensitive data, or regulatory requirements (GDPR, SOC2, HIPAA)?

2. **Score each change using a 5x5 risk matrix.** For each risk found, assign:
   - **Probability** (1-5): How likely is this risk to materialize?
     - 1 = Rare (< 5%), 2 = Unlikely (5-20%), 3 = Possible (20-50%), 4 = Likely (50-80%), 5 = Almost certain (> 80%)
   - **Impact** (1-5): How severe is the consequence?
     - 1 = Negligible, 2 = Minor degradation, 3 = Moderate outage/breach, 4 = Major incident, 5 = Critical data loss/breach
   - **Risk score** = Probability x Impact (1-25)
   - Severity: Low (1-5), Medium (6-10), High (11-15), Critical (16-25)

3. **Secret detection.** Scan changed files for:
   - API keys (patterns: `AKIA`, `sk-`, `ghp_`, `glpat-`, `xoxb-`, `xoxp-`)
   - Tokens and passwords in strings (`password=`, `token=`, `secret=`, `Bearer `)
   - Private keys (`-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN EC PRIVATE KEY-----`)
   - Connection strings with credentials (`postgresql://user:pass@`, `mongodb+srv://`)
   - `.env` files or environment variable definitions with values
   - High-entropy strings (base64-encoded secrets, hex tokens > 32 chars)
   Any secret detected is an automatic **Critical** risk and blocks the pipeline.

4. **Dependency vulnerability scan.** Check changed or added dependencies:
   - New dependencies: Are they well-maintained? Check last publish date, download count, known CVEs.
   - Updated dependencies: Are there breaking changes? Security advisories?
   - Removed dependencies: Could removal break other packages that depend on them?
   - Lockfile changes: Was the lockfile regenerated? Could supply chain attacks affect new resolutions?

5. **Commit message quality check.** Validate that:
   - Commit messages follow conventional commits or repo convention
   - No commits with messages like "fix", "wip", "asdf", "temp"
   - Breaking changes are marked with `BREAKING CHANGE:` or `!` after type
   - Related issue/ticket numbers are referenced

6. **Breaking change detection.** Identify changes that could break consumers:
   - Removed or renamed public API functions, classes, or exports
   - Changed function signatures (added required parameters, changed return types)
   - Database schema changes (dropped columns, renamed tables, changed types)
   - Changed environment variable names or configuration keys
   - Removed or changed API endpoints, request/response formats

7. **Generate risk report.** Produce a structured report with:
   - Overall risk score (highest individual risk across all categories)
   - Risk breakdown by category (security, performance, reliability, compliance)
   - Individual risk items with probability, impact, score, and mitigation suggestions
   - Secret detection results (pass/fail)
   - Dependency vulnerability summary

8. **Gate decision.** Based on configured thresholds:
   - **Pass:** Overall risk score <= configured threshold (default: 10). No secrets detected. No critical dependency vulnerabilities.
   - **Warn:** Overall risk score 11-15, or medium dependency vulnerabilities. Pipeline continues but reviewers are notified.
   - **Block:** Overall risk score >= 16, or any secret detected, or critical dependency vulnerability. Pipeline stops.

## Anti-patterns

- **Ignoring low-probability high-impact risks.** A risk with probability 1 but impact 5 is still score 5 (Low) -- but catastrophic if it happens. Flag these separately as "tail risks."
- **No secret scanning.** Relying on developers to never commit secrets is naive. Always scan, always block on secrets.
- **Manual-only reviews.** Risk assessment must be automated in CI. Human reviewers miss secrets and dependency issues at scale.
- **Binary pass/fail without context.** A "fail" with no explanation is useless. Always provide the specific risk, its score, and a mitigation suggestion.
- **Ignoring transitive dependencies.** A direct dependency may be clean, but its transitive dependencies may have CVEs. Check the full dependency tree.
- **Skipping lockfile changes.** Lockfile diffs are where supply chain attacks hide. Always review lockfile changes.

## Self-check

Before delivering, verify:

1. [ ] All four risk categories assessed (security, performance, reliability, compliance)
2. [ ] Each risk item has probability, impact, and computed score
3. [ ] Secret detection scan completed on all changed files
4. [ ] Dependency vulnerabilities checked for new/changed dependencies
5. [ ] Commit messages evaluated for quality and convention adherence
6. [ ] Breaking changes explicitly identified and listed
7. [ ] Overall risk score computed as the maximum individual risk
8. [ ] Gate decision (pass/warn/block) is clear and justified
9. [ ] Each risk item includes a specific mitigation suggestion
10. [ ] Report includes both the score and human-readable severity label
