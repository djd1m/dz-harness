# keysarium-core Module Index

> Manifest of all modules in @dzhechkov/keysarium-core v1.1.0

## Module Registry

| Module | Version | Files | Trust Tier | Description |
|--------|---------|-------|------------|-------------|
| governance | 1.0 | 3 | Tier 1 — Structured | Constitution, shards, checkpoints |
| memory | 1.1 | 3 | Tier 1 — Structured | Reward-calibrated learning + dream cycles + index + tiering + COW |
| orchestration | 1.0 | 4 | Tier 1 — Structured | Coordinator protocol + topologies + workers |
| verification | 1.0 | 3 | Tier 1 — Structured | Hash chains + judge attestation + audit trail |
| trust-tiers | 1.0 | 2 | Tier 1 — Structured | 4-tier classification + promotion |
| platform | 1.0 | 4 | Tier 0 — Advisory | Multi-platform adapter templates |

## File Manifest

```
@dzhechkov/keysarium-core/
├── package.json
├── README.md
├── index.md                           ← This file
│
├── governance/
│   ├── constitution.md                ← v1.0 — Universal invariants
│   ├── shard-protocol.md              ← v1.0 — Per-stage governance shards
│   └── checkpoint-protocol.md         ← v1.0 — Checkpoints + promise tags
│
├── memory/
│   ├── memory-protocol.md             ← v1.1 — memory_query + memory_store + index + tiering + COW
│   ├── reward-tracker.md              ← v1.0 — Analytics + pattern detection
│   └── dream-engine.md                ← v1.0 — Background insight generation
│
├── orchestration/
│   ├── queen-protocol.md              ← v1.0 — 10-step coordinator lifecycle
│   ├── topology-selection.md          ← v1.0 — 6 topology types
│   ├── background-workers.md          ← v1.0 — Non-blocking worker protocol
│   └── model-routing.md               ← v1.0 — 3-tier model assignment
│
├── verification/
│   ├── witness-chain.md               ← v1.0 — SHA-256 hash-chain
│   ├── judge-attestation.md           ← v1.0 — Evaluator isolation proofs
│   └── audit-trail.md                 ← v1.0 — Evaluation history format
│
├── trust-tiers/
│   ├── tier-system.md                 ← v1.0 — 4-tier classification
│   └── promotion-protocol.md          ← v1.0 — Tier advancement rules
│
└── platform/
    ├── adapter-registry.md            ← v1.0 — Platform adapter definitions
    └── templates/
        ├── cursor.md                  ← v1.0 — Cursor generation template
        ├── opencode.md                ← v1.0 — OpenCode generation template
        └── copilot.md                 ← v1.0 — GitHub Copilot generation template
```

## Protocol Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-01 | Initial extraction from Keysarium v1.1.x and lib/ protocols |
| 1.1 | 2026-03-02 | Memory module v1.1: 2-tier index, record lifecycle (HOT/WARM/COLD/PURGE), brain container manifest, COW branching |

## Dependency Graph

```
governance ───> (standalone, no internal deps)
memory ───> (standalone, no internal deps)
orchestration ───> (standalone, no internal deps)
verification ───> (standalone, no internal deps)
trust-tiers ───> (standalone, no internal deps)
platform ───> (standalone, no internal deps)
```

All modules are independent. A consumer may use any subset of modules without importing the others.

## Schema Compatibility

JSON schemas use `"version"` as a schema version field. Memory module uses `"1.1"`, all other modules use `"1.0"`. Consumers should check this field and warn if it does not match expected version. v1.1 readers MUST accept v1.0 files for backward compatibility.

## Terminology Mapping

When adapting core protocols for a specific domain:

| Core Term | Replace With | Example |
|-----------|-------------|---------|
| stage | Your pipeline unit | "phase" (Keysarium), "layer" (BTO) |
| project | Your work unit | "research" (Keysarium), "artifact" (BTO) |
| domain | Your category system | "banking/retail" (Keysarium), "skill type" (BTO) |
| skill | Your capability unit | "explore/research" (Keysarium), "build/test" (BTO) |
