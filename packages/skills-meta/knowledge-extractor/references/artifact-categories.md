# Artifact Categories Reference

Seven mutually exclusive categories for classifying extracted findings.
Every finding must be assigned exactly one category before passing through the quality gates.
If a finding spans multiple categories, split it or assign the primary category.

## Category Taxonomy

| Category | Destination | Description | Examples | Agent Lens |
|----------|-------------|-------------|----------|------------|
| skills | .claude/skills/<name>/ | Complete skill bundles (SKILL.md + modules) | New analysis methodology, reusable research approach | All lenses (cross-cutting) |
| commands | .claude/commands/<name>.md | Slash commands for Claude Code | Pipeline phases, utility commands | extractor-commands |
| hooks | .claude/hooks/ or TOOLKIT_HARVEST.md | Event-driven automations, pre/post hooks | Pre-commit checks, post-phase triggers | extractor-commands |
| rules | .claude/rules/<name>.md | Constraints, quality gates, anti-patterns | Domain restrictions, naming conventions | extractor-rules |
| templates | TOOLKIT_HARVEST.md or lib/ | Document/config structure templates | ADR template, mermaid diagram template | extractor-templates |
| patterns | TOOLKIT_HARVEST.md or lib/ | Architecture and design patterns | Agent swarm topology, event-driven pipeline | extractor-patterns |
| snippets | TOOLKIT_HARVEST.md | Reusable code fragments | React components, utility functions, bash one-liners | extractor-snippets |

## Category Descriptions

### skills
A skill is a self-contained capability bundle that can be loaded by a Claude Code session.
It requires at minimum a SKILL.md with trigger conditions, usage instructions, and output specification.
Extract as a skill when the finding represents a repeatable methodology that warrants its own invocation pattern.
Destination: create a new directory under `.claude/skills/<name>/` with SKILL.md as the entry point.

### commands
A command is a slash command definition — a markdown file in `.claude/commands/` that Claude Code exposes as `/command-name`.
Extract as a command when the finding defines a distinct user-facing workflow step or utility.
Destination: `.claude/commands/<name>.md`

### hooks
A hook is an event-driven automation that fires on a specific lifecycle event (session start, phase completion, file save).
Extract as a hook when the finding describes behavior that should trigger automatically, not on user request.
Destination: `.claude/hooks/` directory if the project uses the hooks directory convention; otherwise document in TOOLKIT_HARVEST.md under the Hooks section.

### rules
A rule is a constraint, convention, or quality gate that governs agent behavior.
Extract as a rule when the finding specifies what agents must or must not do, regardless of context.
Destination: `.claude/rules/<name>.md`

### templates
A template is a document or configuration scaffold with placeholders that gets filled in for each use.
Extract as a template when the finding defines a repeatable document structure (not the content itself).
Destination: `lib/` if it will be referenced by multiple commands; otherwise TOOLKIT_HARVEST.md under Templates section.

### patterns
A pattern is an architectural or design solution to a recurring structural problem.
Extract as a pattern when the finding describes how to compose components or agents, not what they contain.
Patterns are higher-level than snippets and lower-level than skills.
Destination: `lib/` if it has widespread applicability; otherwise TOOLKIT_HARVEST.md under Patterns section.

### snippets
A snippet is a concrete, copy-paste-ready code or configuration fragment.
Extract as a snippet when the finding is language/framework-specific code that solves one small problem.
Destination: TOOLKIT_HARVEST.md under Snippets section, with language and framework tags.

## Scope Filtering Mapping (category to agent lens for /harvest only X)

When the user invokes `/harvest only <scope>`, only the corresponding extractor agent lens runs.
All other lenses are suppressed to reduce cost and noise.

| User Scope Argument | Active Agent Lenses | Categories Produced |
|--------------------|---------------------|---------------------|
| `skills` | ALL 5 lenses (cross-cutting) | skills |
| `commands` | extractor-commands | commands, hooks |
| `rules` | extractor-rules | rules |
| `templates` | extractor-templates | templates |
| `patterns` | extractor-patterns | patterns |
| `snippets` | extractor-snippets | snippets |
| `code` | extractor-snippets | snippets |
| `all` (default) | All 5 lenses | All 7 categories |

Note: hooks are produced by extractor-commands because hooks are closely related to command lifecycle automation.
Note: skills scope spawns ALL 5 lenses because skills are cross-cutting — any lens may discover patterns worthy of promotion to a full skill bundle.

## Deduplication Rules (per-category)

Deduplication is applied during gate G6 (Not Duplicate). The similarity threshold is 0.85.
Similarity is assessed by the orchestrator using structural comparison (not LLM) unless specified.

| Category | Deduplication Key | Comparison Method |
|----------|------------------|-------------------|
| skills | Skill name + trigger conditions | Exact name match OR semantic trigger overlap |
| commands | Command name (slug) | Exact slash-command name match |
| hooks | Event type + trigger condition | Exact event type + condition string match |
| rules | Rule title + first sentence of constraint | Normalized string similarity |
| templates | Template name + section headings list | Section heading set overlap |
| patterns | Pattern name + problem statement | Normalized string similarity on problem statement |
| snippets | Language + first 5 non-whitespace lines | Normalized code similarity |

When a near-duplicate is found (similarity 0.70–0.85), the extractor must decide:
- If the new finding improves the existing entry (adds a section, fixes an error): propose a MERGE, not a new entry.
- If the new finding is a different context of the same idea: add as a "variant" note under the existing entry.
- If similarity >= 0.85: treat as duplicate, reject via G6.

Merge proposals are surfaced in the harvest output as:
```
MERGE PROPOSAL: Finding #{X} improves existing entry "{existing_name}" — {reason}
```
