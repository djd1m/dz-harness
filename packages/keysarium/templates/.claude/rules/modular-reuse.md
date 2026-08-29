# Modular Reuse Rules

## Skills are Domain-Agnostic
Skills in .claude/skills/ are designed to work across ANY domain:
- explore: works for any task clarification
- goap-research-ed25519: works for any research topic
- problem-solver-enhanced: works for any complex problem
- frontend-design: works for any UI task
- presentation-storyteller: works for any presentation
- reverse-engineering-unicorn: works for any company analysis

## Commands are Pipeline-Specific
Commands in .claude/commands/ implement the Casarium pipeline.
They can be adapted for other pipelines by:
1. Copying the command file
2. Modifying phase-specific content
3. Keeping the skill loading pattern intact

## Agent Templates are Reusable
Agent templates in .claude/agents/ define reusable agent configurations.
They can be composed for different workflows.

## Library Functions
Shared logic lives in lib/ directory:
- lib/phase-utils.md: Common phase utilities
- lib/agent-patterns.md: Agent spawning patterns
- lib/skill-loader.md: Skill loading conventions
- lib/domain-templates.md: Domain-specific templates

Under `init --minimal`, `lib/` is NOT installed; treat these modules as absent and skip the
optional behaviour they describe rather than failing.

## Extending the System
To add a new phase:
1. Create .claude/commands/new-phase.md
2. Create or reuse a skill in .claude/skills/
3. Add agent template in .claude/agents/ if parallelizable
4. Update CLAUDE.md pipeline table
5. Update docs/
