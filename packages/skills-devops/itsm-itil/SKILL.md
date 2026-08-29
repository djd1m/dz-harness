---
name: "itsm-itil"
description: >
  Run lightweight ITIL/ITSM directly in your repo — incidents, problems, known-errors, and changes (RFCs) as linked Markdown tickets with an explicit state machine, prioritized by WSJF (Weighted Shortest Job First). This is the connective framework that ties the lifecycle together and orchestrates the deep-dive skills; use it to stand up service management, triage a backlog, or decide what to work next. Triggers on: "ITIL", "ITSM", "service management", "known error backlog", "WSJF", "prioritize the backlog", "incident vs problem", "raise an RFC", "change management", "/itsm".
trust_tier: 1
trust_tier_label: "DZ-original (ITIL methodology inspired by @windyroad/itil (MIT); clean-room, no plugin code/hooks/bin imported)"
---
# ITSM / ITIL (lightweight, in-repo)

Run service management as **Markdown tickets in your repo**, not a SaaS. Four linked record types
move through an explicit state machine, the backlog is ranked by **WSJF**, and the deep work hands off
to the specialist skills.

> **Attribution.** The ITIL practice modeled here (incident↔problem↔known-error↔change linkage, the
> ticket state machine, WSJF ranking) is **inspired by the MIT-licensed `@windyroad/itil` Claude Code
> plugin** and rewritten clean-room as a single self-contained skill. **No** plugin code, bin scripts,
> or shell hooks are imported — this skill is declarative guidance only.

## When to use

- Stand up lightweight service management in a repo (no Jira/ServiceNow).
- Decide **what to work next** across a mixed backlog (WSJF).
- Disambiguate **incident vs problem vs known-error vs change** and route correctly.
- Link a recurring incident to a problem, a confirmed root cause to a known-error, and a fix to a change (RFC).
- For the deep work, this skill hands off to `incident-response` (restore service) and `problem-management` (eliminate root cause).

## The four record types

| Type | Question it answers | Deep-dive skill |
|------|---------------------|-----------------|
| **Incident** | "Service is degraded — how do we restore it NOW?" | `incident-response` |
| **Problem** | "Why does this keep happening — what's the root cause?" | `problem-management` |
| **Known-error** | "Root cause confirmed, fix not yet released — how do we work around it?" | `problem-management` |
| **Change (RFC)** | "What change will we make, and is it approved/safe to release?" | `pr-review` / `risk-assessment` |

## Workflow

The lifecycle and how the records connect:

1. **Detect → Incident.** Service degraded → raise an incident; restore service (`incident-response`). An incident is about *time-to-restore*, not root cause.
2. **Recurring / unexplained → Problem.** Repeated or unexplained incidents → raise a problem and link the incidents to it. Investigate root cause (`problem-management`).
3. **Root cause found → Known-error.** Confirmed cause + workaround, fix not yet shipped → mark the problem as a known-error so the workaround is discoverable.
4. **Fix → Change (RFC).** The corrective fix is a change → raise an RFC, assess risk (`risk-assessment`), review (`pr-review`), release. On release, transition the known-error to verifying → closed.
5. **Prioritize continuously** with **WSJF** (see `references/wsjf.md`) — rank the open problem/known-error backlog so the highest cost-of-delay-per-effort work surfaces first.

See `references/lifecycle.md` for the state machines + the in-repo ticket layout, `references/wsjf.md`
for scoring, and `references/templates.md` for the Markdown ticket templates.

## In-repo layout

```
docs/
  incidents/<NNN>-<slug>.<state>.md     # open | mitigated | resolved | closed
  problems/<NNN>-<slug>.<state>.md      # open | known-error | verifying | closed
  changes/<NNN>-<slug>.<state>.md       # proposed | approved | released | closed
```

Each ticket's front-matter links to related tickets (`incidents: [..]`, `problem: NNN`, `change: NNN`)
so the graph is navigable from any node. (A per-state subdirectory layout, e.g. `docs/problems/open/`,
is an equally valid alternative — pick one and keep it consistent.)

## Output

A run produces or updates Markdown tickets and, on request, a ranked-backlog view. The structured
manifest a run can emit is described by `schemas/output.json` (ticket id, type, state, links, WSJF);
`scripts/validate-config.json` lists the ticket + WSJF validation rules (e.g. a `known-error` MUST carry
a workaround, `size > 0`, valid state-per-type) to check tickets against before relying on the ranking.

## Examples

```text
# Stand up ITSM in a repo
"set up lightweight ITIL in this repo"
  → create docs/{incidents,problems,changes}/, explain the state machine + templates

# Route correctly
"the checkout 500s spiked again — third time this month"
  → Incident (restore now, incident-response) + link to a Problem (recurring → root cause, problem-management)

# Decide what's next
"what should we work on from the problem backlog?"
  → compute WSJF across open + known-error tickets → ranked table, highest first

# Close the loop
"we shipped the fix for problem 042"
  → raise/approve the Change (RFC), transition problem 042 known-error → verifying → closed on confirmation
```

## Anti-patterns

- **Don't conflate incident and problem.** Incident = restore service (time-critical); problem = remove
  root cause (not time-critical). Mixing them buries root causes under firefighting.
- **Don't skip the known-error state.** A confirmed-cause-but-unreleased-fix is a known-error with a
  workaround — recording it stops the same incident being re-investigated from scratch.
- **Don't rank by gut.** Use WSJF (cost-of-delay ÷ job size); never let the loudest ticket win.
- **Don't import the source plugin's runtime.** This skill is declarative; it does not ship or run shell
  hooks or bin scripts (the `@windyroad/itil` plugin's coupling is exactly what we left out).
- **Don't let tickets drift from reality** — transition state when the world changes; a stale "open"
  incident that's actually resolved corrupts the backlog and WSJF ranking.

## Related skills

`incident-response` (restore service) · `problem-management` (root cause + known-error backlog) ·
`risk-assessment` (change risk + gates) · `pr-review` (review the corrective change) ·
`retrospective` (post-incident learning).
