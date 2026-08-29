---
name: "retrospective"
description: "Facilitates sprint/project retrospectives — what went well, what to improve, action items with owners."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# retrospective

Facilitates sprint or project retrospectives by structuring feedback, identifying patterns, generating actionable improvements, and tracking follow-ups. Supports multiple retro formats and produces a markdown report with prioritized action items.

## When to use

- User wants to run a sprint retrospective
- User wants to analyze what went well and what did not in a project phase
- User needs structured action items from a post-mortem or retrospective
- User wants to identify recurring issues across multiple retros
- User asks to generate a retro report or summary

## When NOT to use

- User wants to run an incident post-mortem with timeline (use `incident-response`)
- User wants a code review (use `pr-review`)
- User wants project planning or estimation (general project management)
- User wants to track tasks and sprints (use project management tools)

## Procedure

1. **Choose retrospective format.** Select the format that best fits the team's needs:
   - **Start/Stop/Continue:** What should we start doing, stop doing, and keep doing? Good for teams new to retros.
   - **4Ls (Liked/Learned/Lacked/Longed For):** What did we like, learn, lack, and long for? Good for reflection-heavy teams.
   - **Mad/Sad/Glad:** What made us mad, sad, or glad? Good for emotional check-ins.
   - **Sailboat:** Wind (what propelled us), anchor (what slowed us), rocks (risks ahead), island (our goal). Good for visual teams.
   - **Timeline:** Walk through the sprint week by week or event by event. Good for complex sprints with many incidents.
   If the user does not specify a format, default to **Start/Stop/Continue** for simplicity.

2. **Gather data.** Collect facts before opinions:
   - Sprint metrics: velocity, burndown, story points completed vs planned
   - Timeline of key events: deployments, incidents, blockers, celebrations
   - Quantitative signals: build failures, test flakiness, PR review times, deployment frequency
   - Team observations: What did individuals notice? Collect input from all team members if available.
   - Previous retro action items: Were they completed? If not, why?

3. **Generate insights.** Analyze the gathered data for patterns:
   - **Recurring themes:** Issues that appear in multiple retros (e.g., "testing takes too long" appearing 3 sprints in a row)
   - **Root causes:** Use "5 Whys" to dig below surface symptoms. "Deployments are slow" -> why? -> "Builds take 20 minutes" -> why? -> "No caching in CI" -> actionable.
   - **Correlations:** Did the sprint with the most incidents also have the most scope changes? Did velocity drop when on-call rotation overlapped?
   - **Positive patterns:** What worked well that should be reinforced or shared with other teams?

4. **Categorize findings.** Organize into the chosen format's categories:
   - For Start/Stop/Continue: Group each finding into one of three buckets
   - For 4Ls: Group into Liked/Learned/Lacked/Longed For
   - For each item, note how many team members mentioned it (dot-voting equivalent)
   - Flag items that appeared in previous retros as "recurring"

5. **Prioritize actions using effort-vs-impact matrix.** For each potential action item:
   - **Impact** (1-5): How much will this improve the team's work?
   - **Effort** (1-5): How much effort does this require?
   - Quadrant: Quick wins (high impact, low effort) > strategic (high impact, high effort) > fill-ins (low impact, low effort) > time sinks (low impact, high effort)
   - Select the top 3-5 action items. More than 5 dilutes focus.

6. **Assign owners and due dates.** Every action item gets:
   - A single owner (not "the team" -- one person accountable)
   - A specific due date (not "next sprint" -- a calendar date)
   - A definition of done (how do we know this is complete?)
   - A link to an issue or ticket in the project tracker

7. **Generate retrospective report.** Produce a markdown report containing:
   - Sprint/project identifier and date range
   - Retro format used
   - Key metrics summary
   - Categorized findings (with vote counts)
   - Prioritized action items (with owner, due date, definition of done)
   - Recurring items flagged from previous retros
   - Follow-up status on previous retro action items

8. **Follow-up tracking.** Link action items to trackable artifacts:
   - Create issues/tickets for each action item
   - Set reminders for due dates
   - Add action items to the next retro's "review previous actions" section
   - Track completion rate across retros (meta-metric: are we actually improving?)

## Anti-patterns

- **Blame-focused.** Retros discuss processes, tools, and practices -- not individual people. Never allow "Person X caused the outage" framing. Reframe as "What process gap allowed the outage?"
- **No action items.** A retro without concrete action items is a venting session, not an improvement mechanism. Always produce at least 2 action items.
- **No follow-up.** Action items that are never reviewed at the next retro signal that retros are performative. Always review previous action items at the start of each retro.
- **Same issues every retro.** If the same problem appears 3+ times, it needs escalation -- not another action item. Escalate to management, change the process, or accept the tradeoff explicitly.
- **Too many action items.** More than 5 action items means nothing gets done. Prioritize ruthlessly.
- **"The team" as owner.** If everyone is responsible, no one is. Assign a single person per action item.

## Self-check

Before delivering, verify:

1. [ ] Retro format was chosen and applied consistently
2. [ ] Data was gathered (metrics, timeline, observations) before jumping to conclusions
3. [ ] Findings are categorized into the chosen format's structure
4. [ ] Root causes were explored (not just surface symptoms)
5. [ ] Action items are concrete and specific (not vague like "improve testing")
6. [ ] Each action item has a single owner (not "the team")
7. [ ] Each action item has a due date and definition of done
8. [ ] Previous retro action items were reviewed for completion status
9. [ ] Recurring items are flagged and escalation is suggested if 3+ occurrences
10. [ ] Report is formatted in clean markdown with clear sections
