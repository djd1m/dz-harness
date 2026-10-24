---
name: casarium
description: Run the installed Keysarium seven-phase case research pipeline in Codex, with phase artifacts and user checkpoints. Use when the user invokes $casarium or asks to work through a Keysarium case.
---

# Casarium in Codex

This project contains the complete Keysarium workflow. Start by reading
`.claude/commands/casarium.md`; it is the source of truth for phase order, outputs and
checkpoints. Treat its `$ARGUMENTS` as the user's request after `$casarium`. If the case is
missing, ask for it.

For each phase, read only its `.claude/shards/phase-*.shard.md` and the skill files it names
under `.claude/skills/`. Read `.claude/rules/checkpoint-protocol.md` and
`.claude/rules/research-quality.md` when reaching their gates. Create phase artifacts under
`researches/<case-name>/` as the phase runs. Show the checkpoint and wait for the user's
confirmation before advancing. Phase 2.5 requires an explicit CJM choice; preserve that
choice in later phases. A failed research gate cannot emit a success promise.

The `.claude/` files are workflow references in Codex. Claude slash commands, Agent tool
calls, hook settings and model names inside them are not Codex commands or installed Codex
integrations. Use available Codex tools for the work and state any unavailable capability;
do not claim that a named Claude agent or hook ran. Parallel work is optional when the host
supports it. The research mode requirements still apply to every worker.

If the case asks for AI Factory mapping, read
`.claude/shards/phase-ai-factory.shard.md` and its referenced skill before Phase 0. Otherwise
leave that branch inactive. The project-local `$casarium` skill is the Codex entrypoint;
`/casarium` remains the Claude Code entrypoint.
