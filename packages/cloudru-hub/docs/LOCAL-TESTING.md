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

The pinned binary identifies itself as `cloudru-vm 0.2.8-20261029` and has SHA-256
`0095d3911da7e3a93f1d2ee064708820b9b9c50bfc5cbd99fc46c7da6db8be08`.

## 2. Self-test (end-to-end, no credentials required)

```bash
cd packages/@dzhechkov/cloudru-hub
node bin/cloudru-hub.js self-test
```

Example output from the verified engine (installation path varies):

```
✓ resolve: …/cloudru-vm-linux-x64/native/cloudru-vm (source: env)
✓ sha256: 0095d3911da7e3a93f1d2ee064708820b9b9c50bfc5cbd99fc46c7da6db8be08 — MATCHES pinned baseline
✓ engine-version: cloudru-vm 0.2.8-20261029
✓ tools-list: 146 tools live (snapshot: 146)
✓ classification-coverage: every live tool is classified (146 golden entries)
self-test: ALL GREEN
```

The tool's word “live” means a real local MCP catalog observation: 146
registered tools, without Cloud.ru credentials or cloud API calls. It does
not mean 146 cloud operations were exercised. A sandbox that prohibits child
processes can instead report `spawnSync /usr/bin/node EPERM`; run the same
self-test where the engine can start, rather than treating that refusal as a pass.

For `--toolsets vm-deploy`, place
temporary keys in the owner-only JSON file described in `HERMES-CODEX.md`;
the proxy maps them to the Go child's environment without shell evaluation.

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

On Linux/x64, install `@dzhechkov/cloudru-hub@0.1.18` normally and run `cloudru-hub self-test` without setting `CLOUDRU_VM_BIN`. npm installs the exact `@dzhechkov/cloudru-vm-linux-x64@0.2.8` optional engine package. If optional dependencies were disabled or the platform is unsupported, provide a matching trusted binary explicitly.
