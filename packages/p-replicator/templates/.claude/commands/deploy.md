---
description: Guide deployment to dev/staging/prod environments. Reads pre-deployment checklist from docs/Completion.md, runs gating checks per environment tier, executes deployment, and verifies post-deploy health.
argument-hint: '<dev | staging | prod>'
---

# /deploy $ARGUMENTS

## Purpose

Structured deployment workflow with environment-specific gates.

## Environment Tiers

| Tier | Confirmation | Checks | Auto-rollback |
|------|--------------|--------|---------------|
| `dev` | None — auto | Tests pass, build succeeds | No |
| `staging` | Implicit (after gate checks) | Tests + lint + smoke + health | Yes |
| `prod` | Explicit `yes` typed | All staging + manual review | Yes |

## Process

### Step 1: Determine Target

Parse `$ARGUMENTS`: `dev` (default) | `staging` | `prod`. Halt on invalid.

### Step 2: Read Pre-Deploy Checklist

From `docs/Completion.md`: env vars, external services, migrations, smoke tests, rollback procedure.

### Step 3: Gate Checks (per tier)

```
ALL TIERS:
  ✓ git status clean
  ✓ on main/master
  ✓ tests passing: npm test
  ✓ build succeeds: npm run build
  ✓ lint clean

STAGING + PROD:
  ✓ all .env.<tier> vars set
  ✓ external services reachable (DB, Redis)
  ✓ docker images tagged with current commit SHA

PROD ONLY:
  ✓ staging deploy was successful in last 24h
  ✓ no open critical issues
  ✓ on-call notified
  ✓ rollback plan reviewed
```

If any gate fails → halt with specific remediation.

### Step 4: Execute Deployment

```bash
docker build -t <project>:<commit-sha> .
docker tag <project>:<commit-sha> <registry>/<project>:<tier>
docker push <registry>/<project>:<tier>
docker compose -f docker-compose.<tier>.yml up -d
<migration-command>
until curl -f https://<tier-host>/health; do sleep 2; done
```

### Step 5: Smoke Tests

Run smoke test suite from `docs/Completion.md`.

### Step 6: Confirmation (prod only)

```
🚨 PROD DEPLOYMENT — confirm
   Tag: <commit-sha>
   Migrations: <list>
   Downtime: <duration>
   Rollback: <procedure>
   Type 'yes' to proceed.
```

### Step 7: Deploy + Monitor (5-15 min)

For prod: progressive rollout (canary → full) if infra supports.
Monitor: error rate, p95/p99 latency, health endpoint.

### Step 8: Report

```
✅ Deploy complete
   Tier: <tier>, Commit: <sha>
   Migrations: <N>, Smoke: <pass/fail>, Health: <status>
```

## Rollback

`/deploy <tier> --rollback`: re-deploy previous successful tag, run reverse migrations from Completion.md.

## Related

- `docs/Completion.md` — pre-deploy checklist source
- `.claude/rules/git-workflow.md` — branch + commit discipline
