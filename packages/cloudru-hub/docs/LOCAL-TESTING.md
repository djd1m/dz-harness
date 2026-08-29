# Local testing — @dzhechkov/cloudru-hub (no publish, no licence needed)

The launcher and everything around it run TODAY against a locally present engine build.
Nothing here publishes anything; the ADR-001 hold stays untouched.

## 1. Point the launcher at an engine binary

Any of the three, in this precedence order:

```bash
# a) environment variable (simplest — what the self-test proof below uses)
export CLOUDRU_VM_BIN=/path/to/hermes-engine-main/engine-build/cloudru-vm

# b) persistent config
mkdir -p ~/.cloudru-hub
cat > ~/.cloudru-hub/config.json <<'EOF'
{ "enginePath": "/path/to/hermes-engine-main/engine-build/cloudru-vm" }
EOF

# c) (post-grant only) the platform package @dzhechkov/cloudru-vm-linux-x64
```

The pinned baseline archive is
`features/hermes-claude-adaptation/evidence/hermes-engine-src-20260718.tgz` (sha256 in
`evidence/ENGINE-BASELINE.json`); the matching prebuilt binary identifies itself as
`cloudru-vm 0.2.3-20260718`, sha256
`59f83fc0678b95146ca539764d0c805bd2514b8588f198c1e835b26e54c05124` — the launcher
verifies the resolved binary against exactly this pin and says so.

## 2. Self-test (end-to-end, no credentials required)

```bash
cd packages/@dzhechkov/cloudru-hub
node bin/cloudru-hub.js self-test
```

Expected output (MEASURED — live run on this server, 2026-08-10, baseline binary):

```
✓ resolve: …/engine-build/cloudru-vm (source: env)
✓ sha256: 59f83fc0678b95146ca539764d0c805bd2514b8588f198c1e835b26e54c05124 — MATCHES pinned baseline
✓ engine-version: cloudru-vm 0.2.3-20260718
✓ tools-list: 144 tools live (snapshot: 144)
✓ classification-coverage: every live tool is classified (144 golden entries)
self-test: ALL GREEN
```

`tools/list` needs no Cloud.ru credentials; real tool calls do (env
`CLOUDRU_KEY_ID`/`CLOUDRU_SECRET`/`CLOUDRU_PROJECT_ID`, see the engine's own docs).

## 3. Optional: `npm link` for a global `cloudru-hub`

```bash
cd packages/@dzhechkov/cloudru-hub && npm link   # linking is not publishing
cloudru-hub resolve
```

## 4. Wire it into a Claude Code project

```bash
node bin/cloudru-hub.js install --target claude-code --dir /path/to/project
```

This merges (never clobbers) `.mcp.json` (server `cloudru-vm` → the local launcher),
`.claude/settings.json` (the ADR-004 permission brake: ask on every mutating tool, deny
on the secret readers, allow on read-only recon; both `mcp__cloudru-vm__`/`mcp__cloudru_vm__`
spellings until the prefix is live-probed) and copies the PreToolUse veto hook — then
RUNS the forbidden-command fixtures through the emitted hook and refuses to claim
success unless the veto executes. Finish with the manual probe it prints: in a fresh
Claude Code session, call `mcp__cloudru-vm__deploy` and confirm a permission prompt
appears; note which prefix spelling the runtime used.

## 5. Testing from another server AFTER the grant (`npm install` path)

Blocked until ADR-001 clears — see README "Post-grant publish checklist". Until then,
another server can test by copying this package directory (or `npm pack` + install the
tarball) plus an engine binary, then steps 1–4 exactly as above.
