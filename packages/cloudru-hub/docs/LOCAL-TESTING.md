# Local testing — @dzhechkov/cloudru-hub

The launcher runs against the pinned Go build. Its archive contains no engine bytes; the Linux/x64 optional package contains the static engine and its dependency-license inventory.

## 1. Point the launcher at an engine binary

Any of the three, in this precedence order:

```bash
# a) environment variable (simplest — what the self-test proof below uses)
export CLOUDRU_VM_BIN=/path/to/dz-harness-hub/packages/@dzhechkov/cloudru-vm-linux-x64/native/cloudru-vm

# b) persistent config
mkdir -p ~/.cloudru-hub
cat > ~/.cloudru-hub/config.json <<'EOF'
{ "enginePath": "/path/to/dz-harness-hub/packages/@dzhechkov/cloudru-vm-linux-x64/native/cloudru-vm" }
EOF

# c) no override: the installed Linux/x64 optional platform package
```

The pinned binary identifies itself as `cloudru-vm 0.2.6-20261020` and has SHA-256
`4463b09323c9dfe0c32d618d335734a947e7fab0a75d07a7bea089b97a97c9b6`.

## 2. Self-test (end-to-end, no credentials required)

```bash
cd packages/@dzhechkov/cloudru-hub
node bin/cloudru-hub.js self-test
```

Expected output for the current private build:

```
✓ resolve: …/cloudru-vm-linux-x64/native/cloudru-vm (source: env)
✓ sha256: 4463b09323c9dfe0c32d618d335734a947e7fab0a75d07a7bea089b97a97c9b6 — MATCHES pinned baseline
✓ engine-version: cloudru-vm 0.2.6-20261020
✓ tools-list: 144 tools live (snapshot: 144)
✓ classification-coverage: every live tool is classified (144 golden entries)
self-test: ALL GREEN
```

`tools/list` needs no Cloud.ru credentials. For `--toolsets vm-deploy`, place temporary keys in the owner-only JSON file described in `HERMES-CODEX.md`; the proxy maps them to the Go child's environment without shell evaluation.

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

## 5. Testing from another server (`npm install` path)

On Linux/x64, install `@dzhechkov/cloudru-hub@0.1.14` normally and run `cloudru-hub self-test` without setting `CLOUDRU_VM_BIN`. npm installs the exact optional engine package. If optional dependencies were disabled or the platform is unsupported, provide a matching trusted binary explicitly.
