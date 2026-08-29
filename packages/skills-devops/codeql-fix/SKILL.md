---
name: "codeql-fix"
description: "Reads a CodeQL or static-analysis finding and produces a targeted fix."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# codeql-fix

A static-analysis tool has flagged a specific data flow. Read the finding, verify the flow is real, and write the smallest change that closes it. Do not refactor the surrounding code -- fix the vulnerability and nothing else.

## When to use

- User pastes a CodeQL alert or finding
- User pastes a Semgrep, Snyk, SonarCloud, SonarQube, or Bandit finding
- User asks why a static-analysis tool flagged a specific line
- User thinks a finding is a false positive and wants confirmation
- User has a list of SAST findings and wants them triaged and fixed

## When NOT to use

- User wants a broad security review (use `security-audit`)
- User wants to set up CodeQL or SAST tooling in CI (general DevOps guidance)
- User wants to understand a vulnerability class in the abstract (just explain it)
- User wants to fix a runtime error, not a static-analysis finding

## Procedure

1. **Read the finding precisely.** Extract these fields from the alert:
   - **Rule ID:** e.g., `js/sql-injection`, `python/command-injection`, `java/xxe`
   - **Severity:** Critical, High, Medium, Low (as reported by the tool)
   - **File and line:** The exact location flagged
   - **Data-flow path:** Source (where untrusted data enters) through steps (functions it passes through) to sink (where it reaches a dangerous API). CodeQL and Semgrep usually show this as a multi-step path. Read every step.
   - **Tool:** Which scanner produced this (CodeQL, Semgrep, Snyk Code, SonarCloud, Bandit, etc.)

2. **Triage: real flow or false positive?** Read the actual code at each step in the data-flow path. Ask:
   - Does the source really contain untrusted data? (A hardcoded constant is not untrusted.)
   - Is there validation or sanitization between source and sink that the tool missed?
   - Does the framework provide automatic protection? (e.g., Django ORM parameterizes by default, React escapes JSX by default.)
   - Is the sink actually dangerous in this context? (e.g., `exec` with a fully controlled static command is not injection.)
   - If it is a false positive, explain exactly why and provide the suppression annotation with a justification comment.

3. **Pick the right fix layer by rule class.** Use the canonical fix for each vulnerability type:

   | Rule Class | Canonical Fix |
   |------------|--------------|
   | SQL injection | Parameterized queries (`$1` / `?` placeholders). Never string concatenation. |
   | Command injection | Array-form arguments, no shell. Use `execFile` not `exec`, `subprocess.run([...])` not `subprocess.run(shell=True)`. |
   | XSS (cross-site scripting) | Context-aware output encoding. Use the template engine's auto-escape. For dynamic HTML, use a sanitization library (DOMPurify, bleach). |
   | Path traversal | `path.resolve()` then verify the result starts with the allowed base directory. Reject `..` segments. |
   | Open redirect | Allowlist of permitted redirect targets. Parse the URL and reject external hosts. |
   | SSRF | Resolve the hostname, reject private/internal IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254). |
   | Unsafe deserialization | Replace with a schema-validating parser. Use `JSON.parse` (safe), `yaml.safe_load` (safe), avoid `pickle.loads`, `eval`, `ObjectInputStream` on untrusted data. |
   | XXE | Disable external entities in the XML parser configuration. Set `disallow-doctype-decl`, `external-general-entities=false`, `external-parameter-entities=false`. |
   | Hardcoded credentials | Move to environment variable or secret manager. Add the file pattern to `.gitignore`. |
   | Prototype pollution | Use `Object.create(null)` for lookup maps, or validate keys against a known allowlist. Avoid recursive merge of user-controlled objects. |
   | ReDoS | Rewrite the regex to avoid nested quantifiers. Use a regex complexity checker. Consider `re2` for user-supplied patterns. |

4. **Write the smallest fix.** Change only what is necessary to close the data-flow path. Do not refactor, rename, restructure, or "improve" surrounding code. The goal is a minimal, reviewable diff that a security engineer can approve quickly. If the fix requires a new dependency (e.g., a sanitization library), note it explicitly.

5. **Handle false positives correctly.** If the finding is genuinely a false positive:
   - Add a suppression annotation appropriate for the tool:
     - CodeQL: `// lgtm[rule-id]` or `// CodeQL: rule-id - <justification>`
     - Semgrep: `// nosemgrep: rule-id`
     - SonarCloud: `// NOSONAR`
     - Bandit: `# nosec B101`
   - Always include a justification comment explaining why the finding is not exploitable.
   - Never suppress a real finding. If you are not sure, treat it as real.

## Key Rules

- Read the full data-flow path, not just the flagged line. The fix often belongs at the source or at an intermediate step, not at the sink.
- One finding, one fix. Do not batch unrelated findings into a single change.
- Prefer the framework's built-in protection over manual sanitization. If the framework can handle it, use the framework.
- If the fix changes behavior (e.g., previously accepted `../` in paths, now rejects it), note the behavior change for the PR reviewer.
- Always test the fix: verify the finding disappears and existing tests still pass.

## Output Format

Return a structured result with: finding details (rule, severity, path), triage verdict (real/false positive), fix applied (diff or suppression), and verification status.
