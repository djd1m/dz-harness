# @dzhechkov/skills-website-cloner

Website Cloner — skill for [Claude Code](https://claude.com/claude-code) that reverse-engineers **any website** into a **pixel-perfect Next.js clone**.

## What It Does

A 5-phase "foreman" pipeline (extraction and construction run in parallel):

1. **Reconnaissance** — screenshots, design-token extraction, interaction analysis (via a browser MCP)
2. **Foundation** — fonts, colors, downloaded assets
3. **Component Specs** — per-section specs with exact computed CSS values
4. **Parallel Build** — dispatches builder agents in **git worktrees**
5. **Assembly & QA** — merges worktrees, runs a **visual diff** against the original

Triggers on `"clone this site"`, `"rebuild this page"`, `"pixel-perfect clone"`, `"reverse-engineer this website"`. Pass one or more URLs as arguments.

> **Reverse-engineering, two halves.** This is the *frontend/implementation* counterpart to [`reverse-engineering-unicorn`](https://www.npmjs.com/package/@dzhechkov/skills-reverse-engineering) (which produces the *business* playbook). And it's the inverse of `frontend-design` (which creates a *new, distinctive* UI rather than replicating an existing one).

## ⚠️ Runtime Prerequisites (NOT bundled — provide your own)

This skill is **not** self-contained like most dz skills. It requires:

1. **A browser-automation MCP** — Chrome / Playwright / Browserbase / Puppeteer. In this ecosystem, `qe-browser` (Vibium, in [`@dzhechkov/skills-qe`](https://www.npmjs.com/package/@dzhechkov/skills-qe)) or `browser-qa` (in `@dzhechkov/skills-ecc`) satisfy this. **The skill cannot run without one.**
2. **A scaffold already in place** — Next.js 16 + React 19 + Tailwind v4 + shadcn/ui (`npm run build` must pass).

If either is missing, the skill's Pre-Flight will stop and tell you to set it up.

## How to Use

```bash
npx @dzhechkov/skills-website-cloner init
```

Then in Claude Code: `/clone-website https://example.com`.

## Provenance

**Imported (MIT)** from [JCodesMore/ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template) and canonicalized into this monorepo per [ADR-0001](https://github.com/djd1m/dz-harness-hub/blob/main/docs/adr/0001-skill-canonicalization-and-dependency-model.md). Only the `clone-website` SKILL.md is vendored (no upstream scripts); see `sources.json` for attribution + the runtime prerequisites. Original copyright © JCodesMore under the MIT License.

## CLI Commands

`init` *(default)* · `update` · `remove` · `list` · `doctor` — options `--force`, `--dry-run`, `--help`, `--version`.

## Also Available Via dz

```bash
dz init --select clone-website
dz info clone-website
```

## License

MIT (this packaging) · upstream skill MIT © JCodesMore.
