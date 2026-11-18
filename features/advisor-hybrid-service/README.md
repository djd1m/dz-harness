# Modular hybrid advisor — verified candidate

The reusable package is [integrations/hybrid-retrieval](../../integrations/hybrid-retrieval/README.md). It supports library use and a private HTTP transport, independent document corpora and injected lexicalizers. Package0.1.0 is private/not released to npm; tested via actual tarball installation into an unrelated project. Current native installation targets Linux x64 glibc/Node24; HTTP clients can use other languages.

The advisor adapter retains source approvals, cheap selector and course renderer. Two isolated container candidates are in the [site branch](https://github.com/djd1m/aicoding-site/tree/feat/package-advisor-navigation/deploy/advisor-containers). Search has no provider key/public port and holds a read-only snapshot; advisor alone holds the key and existing counters. Static site image/dependencies and publication flag remain unchanged.

[Implementation/evidence report](08_qe_report.md), [requirements](01_requirements.md), [ADRs](03_adr), [plan](06_implementation_plan.md), [traceability](traceability.md), [source/code review](code-review.md).

Source candidate pushed through existing harness PR30; no public page, production container, npm release or merge performed. Temporary tests stopped; existing VPS10containers retained. No /tmp/aicoding-* worktree was created. Live secret copy removed; original key and authoritative trial state unchanged.
