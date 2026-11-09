# Hermes PDF draft — candidate 0.4

1. Resolve only manifest entry_id; verify bounded PDF bytes and SHA-256 before isolated parsing.
2. Send raw bytes to operator-configured Unix socket; strictly validate bounded broker JSON.
3. Re-read original to reject drift; create private, unverified Markdown/HTML drafts outside map/Git.
4. Register candidate tool and document real-file delivery using existing Hermes send_file.
5. Exercise synthetic source, hostile broker text/schema, drift, and filesystem permissions.

No production deployment, patient data, commits, OCR, clinical verification, or automatic delivery.

## Adapter completed

- Candidate plugin 0.4 registration and strict `entry_id` tool implemented.
- Strict framed broker client, schema/version validation, pre/post source hash checks.
- Private unique artifacts, escaped Russian drafts with pypdf version, fsync, 100-directory/256-MiB quota and advisory write lock.
- Delivery docs require actual file paths and existing Hermes transport.
- Verification: 9 synthetic PDF adapter tests and 15 existing adapter tests passed. Real sandbox integration remains parent/broker validation scope.
