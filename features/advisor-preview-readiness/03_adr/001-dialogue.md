# ADR-001: Reviewed dialogue and private access boundary

Status: proposed. Context: the pilot combines paid model selection and reviewed fixed text. An unprotected public endpoint risks cost and exposure.

Decision: retain the existing catalog and provider adapter; treat conversation as bounded untrusted input, select reviewed text and keep access design separate from production. For future browser access, use an authenticated HTTPS gateway and short-lived secure session with same-origin checks; never place credentials in links. Implement only after separate security verification.

Alternatives: unrestricted public paid endpoint (rejected: cost and abuse); token in URL (rejected: logs, history and referrers); SSH-only tunnel (safe baseline but fails browser access goal). Consequences: model intent remains probabilistic, budgets and authentication require explicit fail-closed operation; design does not certify deployment.

## Confirmation

1. `integrations/skill-advisor-catalog/dialogue.test.mjs` checks bounded dialogue, reviewed responses and prior context.
2. `integrations/skill-advisor-catalog/preview-server.test.mjs` checks request limits, failure and private origin protections; a future gateway requires separate authentication and CSRF tests before exposure.

## Amendment: owner-only Basic authentication candidate

For a single-owner private preview, use a dedicated HTTPS Caddy gateway with Basic authentication and a bcrypt password hash supplied through protected environment, rather than requiring an external identity provider or a session cookie. The browser caches credentials, so revocation means rotating the credential or stopping access; no per-session revocation is claimed. Validate the original exact HTTPS Origin before proxy rewriting and keep the backend private. This remains a candidate, contingent on persistent budget and negative security tests; no deployment is authorized by this amendment.
