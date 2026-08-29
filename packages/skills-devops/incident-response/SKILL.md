---
name: "incident-response"
description: "Guides production incident handling — triage, mitigation, root cause analysis, and postmortem."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# incident-response

Guide the operator through a production incident from first alert to completed postmortem. Every step produces a concrete artifact: a severity tag, a mitigation action, a timeline entry, or a postmortem document. The goal is to restore service first, understand cause second, and prevent recurrence third.

## When to use

- Production system is down or degraded
- User reports unexpected errors at scale
- Monitoring alerts firing (PagerDuty, Grafana, CloudWatch, Datadog)
- Need to write a postmortem after an incident
- Need to decide severity (SEV1/SEV2/SEV3/SEV4)
- On-call engineer needs a structured checklist during an active incident
- Leadership asks for an incident summary with quantified impact

## When NOT to use

- Designing a monitoring or alerting system from scratch (use an infrastructure skill)
- Debugging a local development environment issue
- Performing a scheduled maintenance window (use a runbook)
- Handling a security breach with legal/compliance implications (escalate to security team first, then use this for the technical response)

## Procedure

### Step 1: Acknowledge

Claim the incident immediately. Every minute without an owner is a minute of chaos.

**Actions:**
- Set incident status to "Investigating" in your status page
- Post in the dedicated incident Slack channel
- Page the on-call if not already paged

**Slack announcement template:**

```
:rotating_light: INCIDENT DECLARED — [Brief description]
Severity: [SEV1/SEV2/SEV3/SEV4] (preliminary)
Incident Commander: @[your-name]
Comms Lead: @[comms-person]
Status: Investigating
War Room: #inc-[YYYY-MM-DD]-[short-slug]
Next update: [time, e.g., 14:30 UTC]
```

**PagerDuty acknowledgment (via API):**

```bash
curl -s -X PUT \
  "https://api.pagerduty.com/incidents/{incident_id}" \
  -H "Authorization: Token token=YOUR_PD_TOKEN" \
  -H "Content-Type: application/json" \
  -H "From: oncall@yourcompany.com" \
  -d '{
    "incident": {
      "type": "incident_reference",
      "status": "acknowledged"
    }
  }'
```

### Step 2: Classify Severity

Use the severity matrix below. Preliminary classification can change as you learn more, but set it early so communication cadence and escalation are correct.

| SEV | Impact | Response Time | Communication | Example |
|-----|--------|---------------|---------------|---------|
| SEV1 | Full outage, data loss, security breach | Immediate, all-hands | Every 30min, exec notify | Database corruption, auth service down, payment data exposed |
| SEV2 | Major feature broken, significant user impact | 15 min, on-call + team | Every 1h, PM notify | Payment processing failing, search completely broken, API latency >10s |
| SEV3 | Minor feature broken, workaround exists | 1h, on-call | Daily update | Search returning stale results, email notifications delayed, admin panel slow |
| SEV4 | Cosmetic, no user impact | Next business day | Ticket only | Typo in error message, wrong icon on settings page, stale cache for internal tool |

**Decision tree for ambiguous cases:**
1. Is revenue directly impacted? -> SEV1 or SEV2
2. Can users complete their primary workflow? No -> SEV2. Yes with degradation -> SEV3
3. Is data integrity at risk? -> SEV1
4. Is the issue visible to users? No -> SEV4. Yes -> at least SEV3

### Step 3: Assemble Team

Every incident needs clear roles. One person can hold multiple roles for SEV3/SEV4, but SEV1 demands dedicated people.

| Role | Responsibility | SEV1 | SEV2 | SEV3 | SEV4 |
|------|---------------|------|------|------|------|
| Incident Commander (IC) | Coordinates response, makes decisions, owns timeline | Required | Required | On-call | On-call |
| Comms Lead | Status page, Slack updates, stakeholder emails | Required | Required | IC doubles | N/A |
| Subject Matter Expert(s) | Debug the specific system(s) affected | 2-3 people | 1-2 people | On-call | On-call |
| Scribe | Records timeline, decisions, actions in real-time | Required | Optional | N/A | N/A |

**Escalation contacts (populate for your org):**

```
IC Rotation:        #oncall-ic or @ic-rotation in PagerDuty
Backend SME:        @backend-oncall
Frontend SME:       @frontend-oncall
Infra/SRE:          @infra-oncall
Database:           @dba-oncall
Security:           @security-oncall
Exec Sponsor:       @vp-engineering (SEV1 only)
```

### Step 4: Triage

Determine what is broken, who is affected, and when it started. Gather facts before guessing at causes.

**Key questions:**
- What changed recently? (deploys, config changes, infrastructure updates)
- When did the first alert fire? When did users first report issues?
- What is the blast radius? (percentage of users, specific regions, specific API endpoints)
- Is the issue getting worse, stable, or intermittently recovering?

**Quick diagnostic commands:**

```bash
# Check recent deployments (GitHub)
gh run list --limit 10 --json conclusion,headBranch,createdAt \
  | jq '.[] | select(.conclusion != "success")'

# Check Kubernetes pod health
kubectl get pods -n production --field-selector=status.phase!=Running

# Check error rate spike in CloudWatch (last 30 min)
aws cloudwatch get-metric-statistics \
  --namespace "AWS/ApplicationELB" \
  --metric-name "HTTPCode_Target_5XX_Count" \
  --start-time "$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%S)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
  --period 300 \
  --statistics Sum

# Check database connections
psql -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Check recent error logs (structured logging with jq)
kubectl logs -n production deploy/api-server --since=30m \
  | jq -r 'select(.level == "error") | "\(.timestamp) \(.message)"' \
  | tail -20
```

**Impact quantification template:**

```
Users affected:     [X out of Y total, or Z%]
Revenue impact:     [$X/hour estimated or "not directly impacted"]
Regions affected:   [us-east-1, eu-west-1, or "all"]
Endpoints affected: [POST /api/payments, GET /api/search, or "all"]
Data impact:        [none / stale reads / writes lost / corruption risk]
Started at:         [YYYY-MM-DD HH:MM UTC]
Duration so far:    [X minutes]
```

### Step 5: Mitigate

**Mitigation comes before root cause.** Your job is to restore service, not to understand why it broke. Understanding comes later in the postmortem.

**Mitigation playbook (try in order of speed):**

| Strategy | When to use | Command/action |
|----------|------------|----------------|
| Feature flag off | Bad deploy with flag-gated code | `flagsmith set --flag broken-feature --enabled false` or toggle in LaunchDarkly UI |
| Rollback deploy | Recent deploy correlates with incident start | `kubectl rollout undo deploy/api-server -n production` or `gh run rerun <last-good-run-id>` |
| Scale up | Traffic spike or resource exhaustion | `kubectl scale deploy/api-server -n production --replicas=10` |
| Failover to secondary | Primary region/database is down | Update Route53 health check or trigger Aurora failover |
| DNS redirect | Entire region is unreachable | `aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch file://failover.json` |
| Circuit breaker | Downstream dependency is failing | Enable circuit breaker in service mesh config or API gateway |
| Rate limit | Abuse or unexpected traffic pattern | `kubectl apply -f rate-limit-emergency.yaml` |
| Drop to static | Full app is down, need a placeholder | Point CDN to static maintenance page |

**After applying mitigation:**

```bash
# Verify metrics are recovering
watch -n 5 'curl -s https://api.yourcompany.com/health | jq .'

# Verify error rate is dropping
# (Check your Grafana/Datadog dashboard for the error rate panel)
```

### Step 6: Communicate

Bad communication during an incident causes more organizational damage than the incident itself.

**Status page update (Statuspage.io API example):**

```bash
curl -s -X POST \
  "https://api.statuspage.io/v1/pages/PAGE_ID/incidents" \
  -H "Authorization: OAuth YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "incident": {
      "name": "Elevated error rates on API",
      "status": "investigating",
      "impact_override": "major",
      "body": "We are investigating elevated 5xx error rates affecting the API. Payments and user registration are impacted. We will provide an update within 30 minutes.",
      "component_ids": ["component-id-api"],
      "components": {
        "component-id-api": "major_outage"
      }
    }
  }'
```

**Communication cadence:**

| SEV | Update frequency | Channels | Stakeholders |
|-----|-----------------|----------|-------------|
| SEV1 | Every 30 minutes | Slack #incidents, status page, email | Exec team, PM, support, marketing |
| SEV2 | Every 60 minutes | Slack #incidents, status page | PM, support |
| SEV3 | Daily or on resolution | Slack #incidents | Team lead |
| SEV4 | On resolution only | Ticket | Assignee |

**Stakeholder email template (SEV1/SEV2):**

```
Subject: [SEV1] Ongoing incident — API outage affecting payments

Team,

What's happening: Our payment processing API has been returning errors
since 14:23 UTC. Approximately 35% of payment attempts are failing.

Current status: We have rolled back the most recent deploy and error
rates are declining. We are monitoring for full recovery.

Impact: Estimated $X in failed transactions during the 47-minute window.
No data loss has occurred.

Next update: 15:30 UTC or sooner if status changes.

Incident Commander: [Name]
War room: #inc-2026-06-03-payment-outage
```

### Step 7: Root Cause Analysis

Once service is restored, shift to understanding. Do not rush this step.

**5 Whys technique:**

```
Problem: Payment API returning 500 errors
  Why? -> The payments service was throwing NullPointerException
  Why? -> A new code path accessed a field that was null for legacy accounts
  Why? -> The migration script to backfill that field skipped accounts created before 2024
  Why? -> The migration query used created_at > '2024-01-01' instead of >=
  Why? -> The migration was not tested against a production-like dataset with old accounts

Root cause: Insufficient test coverage for data migration edge cases.
Contributing factor: No integration test validating the payments flow for legacy accounts.
```

**Timeline reconstruction:**

Build a minute-by-minute timeline from multiple sources:

```
14:00 UTC  Deploy #1847 rolled out (commit abc123)
14:12 UTC  First PagerDuty alert: 5xx rate > 5%
14:14 UTC  On-call acknowledges alert
14:15 UTC  Incident declared in Slack, SEV2 preliminary
14:18 UTC  IC identifies deploy #1847 as suspect
14:20 UTC  Error rate climbing: 15% of requests failing
14:22 UTC  Upgraded to SEV1 — payments confirmed impacted
14:25 UTC  Rollback initiated: kubectl rollout undo
14:28 UTC  Rollback complete, pods healthy
14:32 UTC  Error rate dropping: 8% -> 3% -> <1%
14:40 UTC  Metrics at baseline, monitoring continues
15:00 UTC  All-clear declared
```

**Log analysis queries:**

```bash
# Find the first error occurrence
kubectl logs -n production deploy/api-server --since=2h \
  | jq -r 'select(.level == "error") | .timestamp' \
  | head -1

# Correlate errors with specific endpoint
kubectl logs -n production deploy/api-server --since=2h \
  | jq -r 'select(.level == "error") | "\(.method) \(.path) \(.status_code) \(.message)"' \
  | sort | uniq -c | sort -rn | head -10

# Check if errors correlate with a specific upstream
kubectl logs -n production deploy/api-server --since=2h \
  | jq -r 'select(.level == "error" and .upstream != null) | .upstream' \
  | sort | uniq -c | sort -rn
```

### Step 8: Resolve

Deploy the actual fix (not just the rollback) and verify.

**Resolution checklist:**
- [ ] Root cause identified and documented
- [ ] Fix implemented and code-reviewed
- [ ] Fix tested in staging with the specific failure scenario
- [ ] Fix deployed to production
- [ ] Metrics confirmed at baseline for 30+ minutes
- [ ] Smoke tests passing

```bash
# Run production smoke tests after fix deploy
curl -sf https://api.yourcompany.com/health | jq .
curl -sf -X POST https://api.yourcompany.com/api/payments/test \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{"amount": 100, "currency": "USD", "test": true}' | jq .

# Verify error rate is at baseline
# Check: p99 latency, error rate, throughput in your dashboard
```

### Step 9: Postmortem

Write the postmortem within 48 hours while memory is fresh. The postmortem is blameless: it examines systems, processes, and tooling, not individuals.

**Blameless Postmortem Template:**

```markdown
# Postmortem: [Incident title]

**Date:** YYYY-MM-DD
**Duration:** X hours Y minutes (HH:MM UTC to HH:MM UTC)
**Severity:** SEV[1-4]
**Authors:** [Names]
**Status:** [Draft / In Review / Final]

## Summary

[2-3 sentences. What happened, what was the impact, how was it resolved.]

Example: On 2026-06-03, a deployment introduced a null reference error
in the payments service that caused 35% of payment requests to fail for
47 minutes. The issue was mitigated by rolling back the deployment and
permanently fixed by adding null-safety checks and backfilling legacy
account data. Estimated revenue impact was $12,400.

## Impact

- **Users affected:** 12,847 unique users experienced at least one failed request
- **Requests failed:** 34,291 API calls returned 5xx (out of 97,974 total)
- **Error rate peak:** 42% at 14:22 UTC
- **Revenue impact:** $12,400 in failed payment attempts ($8,200 recovered on retry)
- **Duration:** 47 minutes (14:12 UTC detection to 14:59 UTC all-clear)
- **Data impact:** No data loss or corruption

## Timeline

| Time (UTC) | Event |
|------------|-------|
| 14:00 | Deploy #1847 rolled out to production |
| 14:12 | PagerDuty alert: 5xx rate exceeded 5% threshold |
| 14:14 | On-call engineer acknowledged, began investigation |
| 14:15 | Incident declared in #incidents, classified SEV2 |
| 14:18 | Correlated error spike with deploy #1847 |
| 14:22 | Upgraded to SEV1 after confirming payment impact |
| 14:25 | Initiated rollback of deploy #1847 |
| 14:28 | Rollback complete, pods restarted |
| 14:35 | Error rate returned to baseline (<0.5%) |
| 14:59 | All-clear declared after 30 minutes of stable metrics |
| 15:30 | Root cause identified: null reference for legacy accounts |

## Root Cause

The payments service introduced a new field `payment_profile_id` on user
accounts. The deploy assumed all accounts had this field populated.
However, 23,412 accounts created before 2024-01-01 were not backfilled
because the migration query used `created_at > '2024-01-01'` instead of
`created_at >= '2024-01-01'` — and more importantly, did not cover
accounts from before the cutoff date at all.

When these legacy accounts attempted a payment, the service threw a
NullPointerException at `PaymentService.java:247`.

**5 Whys:**
1. Payment API returned 500 -> NullPointerException in PaymentService
2. `payment_profile_id` was null -> Migration did not backfill legacy accounts
3. Migration missed legacy accounts -> Query predicate was wrong
4. Wrong predicate went unnoticed -> No integration test with legacy data
5. No integration test -> Test fixtures only contained post-2024 accounts

## What Went Well

- PagerDuty alerted within 12 minutes of first errors
- On-call acknowledged in 2 minutes
- Rollback was executed quickly (3 minutes from decision to healthy pods)
- Communication was clear and timely in Slack and status page
- No data was lost or corrupted

## What Went Wrong

- Migration was not tested against production-like data
- Code review did not catch the assumption about non-null fields
- No canary deployment — the change went to 100% of traffic immediately
- The staging environment does not have legacy accounts from before 2024

## Action Items

| Action | Owner | Due Date | Priority |
|--------|-------|----------|----------|
| Add null-safety check for payment_profile_id | @backend-dev | 2026-06-05 | P0 |
| Backfill payment_profile_id for all legacy accounts | @dba | 2026-06-05 | P0 |
| Add integration test with pre-2024 account fixtures | @backend-dev | 2026-06-10 | P1 |
| Seed staging environment with legacy account data | @infra | 2026-06-10 | P1 |
| Implement canary deployment for payments service | @sre-team | 2026-06-30 | P2 |
| Add migration validation step to CI pipeline | @platform | 2026-06-30 | P2 |
| Review all other services for similar non-null assumptions | @tech-lead | 2026-06-17 | P1 |
```

### Step 10: Follow-up

The postmortem is worthless if action items are not tracked.

**Follow-up protocol:**
- Convert every action item to a ticket (Jira, Linear, GitHub Issue) within 24 hours
- Assign each ticket to a specific person (never a team)
- Set due dates based on priority: P0 = this week, P1 = this sprint, P2 = this quarter
- Schedule a 30-minute review meeting 2 weeks after the incident
- Update runbooks with anything learned
- Share the postmortem with the broader engineering team

**Tracking template (for the review meeting):**

```
# Incident Follow-up Review — [Incident title]
# Date: [2 weeks after incident]

## Action Item Status
| # | Action | Owner | Due | Status |
|---|--------|-------|-----|--------|
| 1 | Null-safety check | @dev | 06-05 | DONE |
| 2 | Backfill legacy data | @dba | 06-05 | DONE |
| 3 | Integration test | @dev | 06-10 | IN PROGRESS |
| 4 | Seed staging data | @infra | 06-10 | NOT STARTED |
| 5 | Canary deploys | @sre | 06-30 | IN PROGRESS |

## Remaining risks: [any items blocked or at risk of missing deadline]
## Process improvements: [anything new learned since the postmortem]
```

## Anti-patterns

Avoid these common mistakes during incident response:

| Anti-pattern | Why it hurts | What to do instead |
|-------------|-------------|-------------------|
| Blaming individuals | Creates fear, reduces reporting, people hide mistakes | Focus on systems and processes that allowed the failure |
| Skipping postmortem for "small" incidents | Small incidents reveal systemic issues that cause big incidents later | Write a lightweight postmortem for every SEV1-SEV3 |
| Fixing root cause before mitigating | Users suffer longer while you debug | Rollback/mitigate first, then investigate at leisure |
| No communication cadence | Stakeholders interrupt with "any update?", creating more chaos | Set a timer and post updates even if there is no new information |
| Action items without owners or due dates | Nothing gets done, same incident recurs | Every action item must have exactly one owner and a specific date |
| Hero culture | One person staying up all night leads to burnout and mistakes | Rotate roles, hand off after 4 hours, respect on-call schedules |
| Changing multiple things at once during mitigation | Cannot tell which change helped | Make one change, observe for 5 minutes, then decide on next step |

## Self-check

Before closing an incident, verify:

- [ ] Is severity classified using the matrix above?
- [ ] Is there a clear incident commander identified by name?
- [ ] Was mitigation prioritized over root cause investigation?
- [ ] Does the postmortem have quantified impact (users, revenue, duration)?
- [ ] Do all action items have a single owner and a specific due date?
- [ ] Has the status page been updated to "Resolved"?
- [ ] Have stakeholders received the all-clear communication?
- [ ] Is the postmortem scheduled to be written within 48 hours?

## Examples

**In scope:**
- "Production API returning 500s for 20% of requests" -- full incident response from triage to postmortem
- "Write a postmortem for yesterday's 2-hour database outage" -- jump to Step 9 with context gathering
- "Classify this alert: CPU at 95% on 3 of 8 app servers" -- help with Step 2 (severity classification)
- "Our payment provider is returning timeouts, what do we do?" -- guide through Steps 4-6 (triage, mitigate, communicate)

**Out of scope:**
- "Design a monitoring system" -- use an infrastructure or observability skill
- "Set up PagerDuty for our team" -- use a tooling/ops skill
- "Write an SLA for our API" -- use a product/policy skill
- "Perform a security penetration test" -- use the security-audit skill
