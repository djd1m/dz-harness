# CP3.5 family routing gate — PASS

- Gateway activation: **90.0%** (45/50), threshold >=80%.
- Family activation: **98.0%** (49/50), threshold >=80%.
- Family sibling-steal: **2.0%** (1/50), threshold <=10%.
- Global hard-negative violations: **0/85**; exact owner 83/85.
- Family seam exact-owner: 6/20.
- Judge fallbacks: 0.

| Family | gateway | family | sibling steal | leak |
|---|---:|---:|---:|---:|
| fsa-family-boundaries-and-coupling | 80.0% (8/10) | 100.0% (10/10) | 0.0% | 0 |
| fsa-family-choice-and-fit | 100.0% (10/10) | 100.0% (10/10) | 0.0% | 0 |
| fsa-family-distributed-interaction | 90.0% (9/10) | 90.0% (9/10) | 10.0% | 0 |
| fsa-family-guardrails-and-risk | 80.0% (8/10) | 100.0% (10/10) | 0.0% | 0 |
| fsa-family-organization-and-participation | 100.0% (10/10) | 100.0% (10/10) | 0.0% | 0 |

## Misroutes

- global fsa-family-boundaries-and-coupling#global-pos12 -> solid: Код меняется по нескольким причинам и разные области связаны совместными изменениями. Найди архитектурные границы ответственности и coupling до refactoring diff.
- global fsa-family-boundaries-and-coupling#global-pos17 -> solid: Several areas change together for different reasons. Identify defensible responsibility and coupling boundaries before producing a refactoring diff.
- global fsa-family-distributed-interaction#global-pos28 -> ddia-batch-and-stream-processing: There are loss windows between commit, publish, receive, and handling. Compare delivery and recovery policies before configuring a broker.
- global fsa-family-guardrails-and-risk#global-pos32 -> qcsd-ideation-swarm: Команда оценивает архитектурный риск по-разному. Проведи risk storming с независимыми находками, консенсусом и владельцем меры.
- global fsa-family-guardrails-and-risk#global-pos37 -> qcsd-ideation-swarm: The team rates one architecture risk differently. Run risk storming with independent findings, consensus, and an owner for the mitigation.
- family fsa-family-distributed-interaction#pos10 -> fsa-family-choice-and-fit: Distribution adds network and failure boundaries. Run an architecture preflight and decide whether its cost is justified without running a chaos experiment.
