---
name: "security-audit"
description: "Reviews code changes for common security risks."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# security-audit

Review through a security lens looking for bugs with specific exploits, not vague "could be more secure" comments. Every finding must describe an input that triggers the bug, the path through the code, the impact, and how to fix it.

## When to use

- User asks for a security review, audit, or threat check
- User wants to know security implications before merging
- User pastes code involving auth, input parsing, file uploads, crypto, or network calls
- User pastes a security alert (Dependabot, Snyk, etc.) and asks if it applies to their code
- User asks "is this safe" about a code pattern

## When NOT to use

- User wants a general code review (use `pr-review`)
- User wants to fix a specific CodeQL/SAST finding (use `codeql-fix`)
- User wants to set up security tooling in CI (use `ci-fix` or general guidance)
- User is asking about security policy or compliance, not code

## Procedure

1. **Identify trust boundaries.** Map where untrusted data enters the system: HTTP request params, headers, body, file uploads, database reads of user-supplied data, environment variables set by external systems, message queue payloads, CLI arguments. Draw the line between "controlled by us" and "controlled by attacker."

2. **Walk each security category systematically.** For every file in scope, check for:
   - **Injection (SQL/Command/Template):** Is user input concatenated into SQL queries, shell commands, template strings, LDAP queries, or regex patterns? Look for string interpolation near `exec`, `query`, `eval`, `render`, `compile`.
   - **Authentication and Authorization:** Are auth checks present on every protected route? Can a user escalate privileges by changing an ID in the URL? Is session handling secure (HttpOnly, Secure, SameSite cookies)?
   - **Secret handling:** Are API keys, tokens, or passwords hardcoded, logged, or returned in API responses? Are secrets loaded from environment variables or a vault?
   - **Unsafe file operations:** Can an attacker control file paths (path traversal)? Are uploaded files validated for type, size, and content? Are temp files created securely?
   - **Unsafe network operations:** Does the code make requests to URLs controlled by the user (SSRF)? Are TLS certificates validated? Are redirects followed blindly?
   - **Deserialization:** Is user-supplied data deserialized with `JSON.parse` (safe), `pickle.loads` (unsafe), `yaml.load` (unsafe without SafeLoader), `ObjectInputStream` (unsafe)?
   - **XXE/SSRF:** Are XML parsers configured to disable external entities? Can the server be tricked into making internal network requests?
   - **Dependency risks:** Are there known-vulnerable dependencies? Are lockfiles committed? Are versions pinned?

3. **For each finding, document precisely:**
   - **Input trigger:** What specific input would an attacker send?
   - **Path:** Which functions does the input flow through, from entry point to dangerous sink?
   - **Impact:** What can the attacker achieve? Data theft, privilege escalation, RCE, DoS?
   - **Fix:** Concrete code change to close the vulnerability.

4. **Assign severity using standard criteria:**
   - **Critical:** Remote code execution, authentication bypass, mass data exposure. Exploitable without special access.
   - **High:** SQL injection, stored XSS, privilege escalation, sensitive data leak. Exploitable with normal user access.
   - **Medium:** CSRF, open redirect, information disclosure (stack traces, version headers), missing rate limiting.
   - **Low:** Missing security headers, verbose error messages, theoretical issues with high exploitation difficulty.

5. **Do not flag theoretical issues without an exploitation path.** If you cannot describe the specific input an attacker would send, it is not a finding. "This could theoretically be vulnerable" is not useful. "Sending `name='; DROP TABLE users; --` to the `/api/users` endpoint would execute arbitrary SQL because the value is interpolated into the query on line 42" is useful.

6. **Check framework defaults.** Many frameworks have built-in protections. Before flagging XSS, check if the template engine auto-escapes. Before flagging CSRF, check if the framework includes CSRF middleware. Note which protections are active and which are missing.

7. **Note existing mitigations.** If the code has input validation, WAF rules, CSP headers, or other defenses, acknowledge them. Explain whether they are sufficient or can be bypassed.

## Key Rules

- Every finding must have a concrete exploitation scenario, not just a CWE reference.
- Prefer the fix that is closest to the data source (validate input) over fixes at the sink (escape output), but recommend both when appropriate.
- If no security issues are found, say so explicitly. Do not invent issues to justify the audit.
- For dependency vulnerabilities, check if the vulnerable code path is actually reachable from the project's usage.

## Output Format

Return a structured audit with: overall risk assessment, findings by severity with exploitation paths, and a mitigations summary noting existing defenses.
