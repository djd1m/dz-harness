# WSJF — Weighted Shortest Job First

Rank the backlog by **economic urgency per unit of effort**, so the work with the highest
cost-of-delay relative to its size surfaces first.

```
WSJF = Cost of Delay (CoD)  ÷  Job Size
CoD  = user/business value + time criticality + risk reduction / opportunity enablement
```

Score each component on a relative scale (a modified Fibonacci is conventional: 1, 2, 3, 5, 8, 13, 20).
Absolute units don't matter — only the **relative** ranking across the backlog does.

| Component | Question | Scale |
|-----------|----------|-------|
| **User/business value** | How much pain does this remove / value does it add? | 1–20 |
| **Time criticality** | Does value decay if we wait? deadline? worsening? | 1–20 |
| **Risk reduction / enablement** | Does fixing it de-risk the system or unblock other work? | 1–20 |
| **Job size** | Relative effort to resolve (proxy for duration) | 1–20 |

```
CoD  = value + time_criticality + risk_reduction
WSJF = CoD / job_size      # higher = do sooner
```

## Ranking rules

- Compute WSJF for every **open** and **known-error** problem ticket.
- **verifying** and **parked** tickets get **WSJF weight 0** (excluded from the active ranking) — they're
  awaiting confirmation or blocked, not ready for dev work.
- Present as a descending table: `WSJF | id | title | severity | state | CoD | size`.
- Ties → break by severity, then by age (older first).

## Worked example

| id | value | time | risk | CoD | size | WSJF |
|----|-------|------|------|-----|------|------|
| 042 | 13 | 8 | 5 | 26 | 5 | **5.2** |
| 017 | 8 | 3 | 8 | 19 | 8 | 2.4 |
| 031 | 20 | 13 | 3 | 36 | 20 | 1.8 |

→ Work **042** first: not the highest CoD (031 is), but the best value-per-effort. This is the whole point
of WSJF — a smaller high-value job beats a huge one even when the huge one's total value is larger.
