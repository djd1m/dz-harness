# Complexity Matrix — Feature Classification Reference

## Dimension Scoring Guide

### 1. Files Affected

| Score | Range | Examples |
|-------|-------|---------|
| 1 (S) | 1-3 files | Fix typo, update config, add util function |
| 2 (M) | 4-10 files | New endpoint + tests + migration + handler |
| 3 (L) | 11-30 files | New module with models, services, controllers, tests |
| 4 (XL) | 30+ files | Framework migration, new subsystem |

**How to estimate:** Count modified + new + deleted files. Include tests.

### 2. Domains Touched

| Score | Range | Examples |
|-------|-------|---------|
| 1 (S) | 1 domain | Change within a single bounded context |
| 2 (M) | 1-2 domains | Feature spanning API + database |
| 3 (L) | 2-4 domains | Feature touching auth + billing + notifications |
| 4 (XL) | 4+ domains | Cross-cutting concern affecting all domains |

**How to identify domains:** Bounded contexts, microservices, top-level modules.

### 3. New Integrations

| Score | Range | Examples |
|-------|-------|---------|
| 1 (S) | 0 | No new external dependencies |
| 2 (M) | 0-1 | Adding a new npm package, calling a new API |
| 3 (L) | 1-3 | New database, message queue, 3rd-party service |
| 4 (XL) | 3+ | Multiple new infrastructure components |

### 4. Breaking Changes

| Score | Range | Examples |
|-------|-------|---------|
| 1 (S) | 0 | Fully backward compatible |
| 2 (M) | 0 | Backward compatible but behavior changes |
| 3 (L) | 0-2 | API version bump, schema migration with downtime |
| 4 (XL) | 2+ | Major API redesign, data model overhaul |

### 5. New Data Models

| Score | Range | Examples |
|-------|-------|---------|
| 1 (S) | 0 | No schema changes |
| 2 (M) | 0-1 | Add field to existing model, new simple entity |
| 3 (L) | 1-3 | New aggregate root, new relationship graph |
| 4 (XL) | 3+ | New bounded context with full entity graph |

### 6. Cross-Cutting Concerns

| Score | Range | Concerns |
|-------|-------|----------|
| 1 (S) | 0 | None |
| 2 (M) | 0-1 | Logging OR error handling |
| 3 (L) | 1-2 | Auth + caching, i18n + validation |
| 4 (XL) | 3+ | Auth + logging + caching + monitoring + i18n |

---

## Step Activation by Tier

ADR template weight: S/M -> Nygard/ITD-light; L/XL -> MADR+Confirmation.

### Tier S (Score 6-8)

```
Active:  0 → 1(light) → 6(inline) → 7 → 8(smoke)
Skipped: 2, 3, 4, 5
```

**Step adaptations:**
- Step 1: 3-5 bullet requirements, no formal document
- Step 3: skipped by default; if explicitly forced, use Nygard as the lightweight fallback
- Step 6: Inline in conversation, no separate file
- Step 8: Smoke tests only — does it compile? Do existing tests pass?

### Tier M (Score 9-13)

```
Active:  0 → 1 → 3(1 ADR) → 3.5 → 5(light) → 6 → 7 → 8
Skipped: 2, 4, 9
```

**Step adaptations:**
- Step 3: Single Nygard/ITD-light ADR for the main architectural decision; keep the invariant core plus drivers, options, rationale, consequences, and Confirmation
- Step 3.5: QCSD ideation swarm — 3 core agents + GO/CONDITIONAL/NO-GO verdict (mandatory for M+ — skipping is a BLOCK)
- Step 5: Component diagram only, no full C4

### Tier L (Score 14-19)

```
Active:  0 → 1 → [2 ‖ 3] → 3.5 → [4 ‖ 5] → 6 → 7 → 8 → 9
Parallel groups: (2,3) and (4,5); Step 3.5 runs after Step 3, Step 9 after Step 8
```

**Step adaptations:**
- Step 2: Research analogues in codebase and external patterns
- Step 3: Multiple MADR+Confirmation ADRs for each significant decision
- Step 3.5: QCSD ideation swarm — 3-9 parallel agents + GO/CONDITIONAL/NO-GO verdict (mandatory for M+ — skipping is a BLOCK)
- Step 4: Bounded contexts + ubiquitous language
- Step 5: Full C4 (Context + Container + Component)
- Step 8: Unit + integration tests + code review
- Step 9: Fleet QE assessment — 4 parallel agents (traceability ‖ risk ‖ integration ‖ regression) (mandatory for L/XL — skipping is a BLOCK)

### Tier XL (Score 20-24)

```
Active:  0 → 1 → [2 ‖ 3] → 3.5 → [4 ‖ 5] → 6 → 7(parallel) → 8(full) → 9
Parallel groups: (2,3), (4,5 — after 3.5), (7 per module)
```

**Step adaptations:**
- All steps at full depth
- Step 3: Full MADR+Confirmation ADRs; one decision per ADR with typed follow-up links
- Step 3.5: QCSD ideation swarm — 3-9 parallel agents + GO/CONDITIONAL/NO-GO verdict (mandatory for M+ — skipping is a BLOCK)
- Step 7: Multiple parallel agents, one per module/domain
- Step 8: Full QE — unit + integration + e2e + performance + security review
- Step 9: Fleet QE assessment — 4 parallel agents (4-7 with `--full-qe-extended`) (mandatory for L/XL — skipping is a BLOCK)

---

## Quick Reference Decision Tree

```
Is it a bug fix or config change?
  → YES → S

Does it add a new feature with new files?
  → YES, < 10 files → M
  → YES, 10-30 files → L
  → YES, 30+ files → XL

Does it touch multiple domains?
  → NO → max M
  → 2-4 → min L
  → 4+ → XL

Does it have breaking changes?
  → YES → min M, likely L/XL

Does it require new infrastructure?
  → YES → min L
```
