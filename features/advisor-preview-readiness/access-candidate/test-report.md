# Local Caddy integration test

`node features/advisor-preview-readiness/access-candidate/gateway-test.mjs` — PASS, exit 0. The test ran the existing `caddy:2.10-alpine` image with host networking on loopback port 18443 and an internal test certificate. An HTTP stub on loopback port 18893 recorded only method, Host, Origin and whether Authorization was present. Fixture credentials and bcrypt hash are nonsecret.

Observed: unauthenticated GET to the page and API returned 401; authenticated POST with missing or incorrect Origin returned 403 without reaching the stub; authenticated GET returned 200; valid POST reached the stub with the loopback Host/Origin and without Authorization; authenticated OPTIONS returned 405 without a CORS allow-origin header. The test removed its owned container, stopped its stub and deleted its temporary config in `finally`.

The fixture adapts the candidate to loopback ports and internal TLS. It does not test production DNS, ACME, external firewalling, a persistent budget, logs of a deployed proxy or real browser credential caching; those remain deployment checks. No live Caddy configuration was changed.
