# @dzhechkov/keysarium-core

Core framework for building multi-agent pipelines with governance, memory, orchestration, verification, and trust tier systems.

## What is keysarium-core?

keysarium-core provides **domain-agnostic protocols** for any AI-powered multi-agent pipeline. It defines how agents coordinate, how decisions are verified, how the system learns from past executions, and how governance rules are enforced.

Think of it as the "operating system" for multi-agent workflows. You bring the domain-specific skills and pipeline stages; keysarium-core provides the infrastructure.

## Modules

| Module | Purpose | Key Protocols |
|--------|---------|---------------|
| **governance/** | Structural rules and human checkpoints | Constitution, shard protocol, promise tags |
| **memory/** | Persistent learning across executions | memory_query, memory_store, reward tracking, dream cycles, **2-tier index, COW branching, record lifecycle (v1.1)** |
| **orchestration/** | Agent coordination and model routing | Queen protocol, 6 topologies, background workers, 3-tier routing |
| **verification/** | Cryptographic integrity and isolation proofs | SHA-256 witness chain, judge attestation, audit trail |
| **trust-tiers/** | Skill/artifact quality classification | 4-tier system (Advisory to Verified), promotion protocol |
| **platform/** | Multi-platform config generation | Cursor, OpenCode, GitHub Copilot adapters |

## Quick Start

### Installation

```bash
npm install @dzhechkov/keysarium-core
```

### Using with an Existing Pipeline

keysarium-core protocols are markdown-based. They define algorithms, schemas, and rules that AI agents read and follow. To integrate:

1. **Governance:** Read `governance/constitution.md` at pipeline start to load invariants
2. **Memory:** Call `memory_query()` before each stage, `memory_store()` after each checkpoint
3. **Orchestration:** Select topology per stage from `orchestration/topology-selection.md`
4. **Verification:** Create witness chain records at each stage completion
5. **Trust Tiers:** Classify your skills using `trust-tiers/tier-system.md`

### Using with Keysarium Research Pipeline

```bash
npm install @dzhechkov/keysarium @dzhechkov/keysarium-core
```

### Using with BTO Evaluation Pipeline

```bash
npm install @dzhechkov/skills-bto @dzhechkov/keysarium-core
```

## Architecture

```
@dzhechkov/keysarium-core          <-- You are here
        ^                ^
        |                |
   peerDep          peerDep
        |                |
@dzhechkov/keysarium    @dzhechkov/skills-bto
  (research)             (evaluation)
```

keysarium-core has **zero dependencies** on either consumer package. Both consumers declare keysarium-core as a peer dependency. Any team can use keysarium-core independently to build their own pipeline.

## Module Reference

### Governance

- `constitution.md` — Universal invariants that must never be violated
- `shard-protocol.md` — How to create per-stage governance rules that are reloaded at each stage to prevent context drift
- `checkpoint-protocol.md` — Human synchronization points with promise tags for machine-readable completion signals

### Memory (v1.1)

- `memory-protocol.md` — Core `memory_query()` / `memory_store()` protocol with reward scores. **v1.1 enhancements:**
  - **2-Tier Index** — `index.json` catalog for targeted reads instead of full directory scans
  - **Brain Container Schema** — Portable brain exports with SHA-256 manifest and checksum verification
  - **COW Branching** — Delta brain exports via JSON Patch (RFC 6902) for incremental knowledge transfer
  - **Record Lifecycle** — HOT/WARM/COLD/PURGE tiering with automatic archive compression
- `reward-tracker.md` — Analytics engine: per-stage averages, per-domain breakdowns, bottleneck detection, trend analysis
- `dream-engine.md` — Background consolidation: builds concept graphs from accumulated data and generates cross-domain insights

### Orchestration

- `queen-protocol.md` — 10-step coordinator lifecycle: init, health, load, detect, shard, orchestrate, monitor, collect, store, report
- `topology-selection.md` — 6 agent arrangement patterns: star, mesh, hierarchical, ring, hybrid, adaptive
- `background-workers.md` — Non-blocking worker protocol: launch, status, stop, error handling, isolation rules
- `model-routing.md` — 3-tier model assignment: haiku (fast/cheap), sonnet (balanced), opus (creative/complex)

### Verification

- `witness-chain.md` — SHA-256 hash-chain protocol for tamper-evident artifact integrity
- `judge-attestation.md` — Cryptographic proof that evaluators operated independently
- `audit-trail.md` — Complete evaluation history format with chain integrity verification

### Trust Tiers

- `tier-system.md` — 4-tier classification: Tier 0 (Advisory), Tier 1 (Structured), Tier 2 (Validated), Tier 3 (Verified)
- `promotion-protocol.md` — How to promote skills between tiers based on evaluation evidence

### Platform

- `adapter-registry.md` — Central registry of supported AI coding platforms
- `templates/cursor.md` — Cursor (.cursorrules) generation template
- `templates/opencode.md` — OpenCode (.opencode/) generation template
- `templates/copilot.md` — GitHub Copilot (.github/copilot-instructions.md) generation template

## Building Your Own Pipeline

To create a custom multi-agent pipeline using keysarium-core:

1. Define your stages (equivalent to Keysarium's phases or BTO's layers)
2. Create governance shards for each stage using `governance/shard-protocol.md`
3. Choose topologies per stage using `orchestration/topology-selection.md`
4. Configure model routing using `orchestration/model-routing.md`
5. Implement witness chain at stage boundaries using `verification/witness-chain.md`
6. Enable learning with `memory/memory-protocol.md`

## Origins

keysarium-core was extracted from the [Keysarium](https://github.com/dzhechko/product-keysarium-2026) project, which implements a 7-phase AI research pipeline. The protocols are inspired by:

- **Ruflo** — 7-layer governance, 6 topologies, 3-tier model routing
- **Agentic QE** — Trust tiers, reward-calibrated learning, dream cycles, PACT principles
- **Quality Forge** — Portable brain containers, SHA-256 witness chains
- **RVF (RuVector Format)** — Manifest catalogs, COW branching, progressive loading, data tiering (concepts adapted to JSON-native implementation)

## License

MIT
