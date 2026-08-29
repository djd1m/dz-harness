# Evals: agentshield-scan

## Eval 1: Clean project
**Input:** Project with no .claude/ directory
**Expected:** grade A, score 100, recommendation "pass", 0 findings

## Eval 2: Project with exposed secret
**Input:** CLAUDE.md contains `sk-ant-api03-...`
**Expected:** 1 critical finding (SECRETS-001), recommendation "block"

## Eval 3: MCP supply-chain risk
**Input:** mcp.json with `npx -y some-package` (no version pin)
**Expected:** high finding for supply-chain risk, recommendation "fix-and-rescan"
