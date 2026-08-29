# CP3.5 Routing Gate — PASSED 10/10 (2026-07-04)
Oracle: **LLM-judge** (слепой роутер, каталог 20 описаний: 10 ddia + 10 arsenal) — соответствует
тому, как реально роутит Claude Code. Пороги: activation ≥80%, sibling-steal ≤10%.

| Skill | act | steal | neg routed-away | neg exact |
|---|---|---|---|---|
| reliability-scalability-foundations | 100% | 0% | 100% | 6/6 |
| data-model-selection | 100% | 0% | 100% | 7/7 |
| storage-engine-tradeoffs | 100% | 0% | 100% | 5/6 |
| encoding-and-schema-evolution | 100% | 0% | 100% | 7/7 |
| replication-topology-choice | 100% | 0% | 100% | 6/6 |
| partitioning-strategy | 100% | 0% | 100% | 6/6 |
| transaction-isolation-choice | 100% | 0% | 100% | 6/6 |
| distributed-consistency-consensus | 100% | 0% | 100% | 6/6 |
| batch-and-stream-processing | 90% | 10% | 100% | 6/6 |
| deriving-data-and-integration | 100% | 0% | 100% | 6/6 |

Итерации: v1-описания провалили embedding-cosine прокси-гейт (0/10, steal до 90%) → дифференциация
(уникальные лид-термины + boundary-клаузы «NOT … (→ sibling)») → cosine стало ХУЖЕ (embedding слеп
к отрицанию, упоминание соседа притягивает его промпты) → оракул заменён на LLM-judge (= продакшен-
роутер) → 10/10. **Урок: boundary-клаузы помогают LLM-роутеру и вредят cosine-прокси; гейт обязан
мерить продакшен-механизмом.** Evals: 100 positives + 62 hard-negatives (evals/routing.yaml per skill).
Промоут по гейту: trust_tier 0 → 1.
