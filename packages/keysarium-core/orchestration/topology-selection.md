# Topology Selection — Agent Arrangement Patterns

> 6 topology types for organizing agents within a pipeline stage.

## Overview

When a pipeline stage uses multiple agents, the agents must be arranged in a topology that defines communication patterns and coordination. This document defines 6 standard topologies and provides guidance on when to use each.

## Topology Types

### 1. Star

```
        Coordinator
       /     |     \
    Agent1  Agent2  Agent3
```

**Description:** One coordinator spawns worker agents and collects their results. Workers do not communicate with each other.

**Best for:**
- Simple parallel tasks with independent sub-problems
- Tasks where a single synthesis step combines all results
- When fault isolation is important (one worker failure does not affect others)

**Properties:**
- Coordination: centralized
- Communication: hub-and-spoke
- Fault tolerance: medium (coordinator is single point of failure)
- Scalability: good (add more workers without topology change)

### 2. Mesh

```
    Agent1 ←→ Agent2
       ↕          ↕
    Agent3 ←→ Agent4
```

**Description:** All agents can communicate with all other agents. Each agent operates autonomously and shares findings.

**Best for:**
- Fault-tolerant research where any agent can cover for another
- Tasks where agents may discover information relevant to other agents
- When no single coordinator is needed

**Properties:**
- Coordination: decentralized
- Communication: all-to-all
- Fault tolerance: high (any agent can be lost)
- Scalability: limited (communication overhead grows quadratically)

### 3. Hierarchical

```
           Queen
          /     \
    Manager1    Manager2
    /    \      /    \
  W1     W2   W3    W4
```

**Description:** Multi-level hierarchy. The Queen delegates to managers, who delegate to workers. Results flow upward.

**Best for:**
- Complex stages with sub-stages
- When different expertise levels are needed at different tiers
- Large-scale parallelism (10+ agents)

**Properties:**
- Coordination: hierarchical
- Communication: parent-child only
- Fault tolerance: medium (manager failure affects its workers)
- Scalability: excellent (add more levels as needed)

### 4. Ring

```
    Agent1 → Agent2 → Agent3 → Agent4
       ↑                          |
       └──────────────────────────┘
```

**Description:** Agents pass work sequentially in a ring. Each agent processes the work and passes it to the next, adding refinements.

**Best for:**
- Iterative refinement tasks (draft -> review -> polish -> finalize)
- When each agent adds a specific type of value
- Pipeline-within-a-pipeline scenarios

**Properties:**
- Coordination: sequential
- Communication: unidirectional ring
- Fault tolerance: low (any break stops the ring)
- Scalability: limited (latency increases linearly)

### 5. Hybrid

```
           Coordinator
          /           \
    [Star cluster]   [Mesh cluster]
    /    |    \       A1 ←→ A2
  W1    W2    W3      ↕       ↕
                      A3 ←→ A4
```

**Description:** Combines two or more topologies. Different parts of the stage use different agent arrangements.

**Best for:**
- Stages with heterogeneous sub-tasks
- When some sub-tasks need isolation (star) and others need collaboration (mesh)

**Properties:**
- Coordination: mixed
- Communication: varies by cluster
- Fault tolerance: varies
- Scalability: good (each cluster scales independently)

### 6. Adaptive

**Description:** The topology starts as one type and evolves during execution based on conditions.

**Rules:**
- Start with Star
- If agent disagreement detected (scores differ by > 3 points): switch to Mesh for reconciliation
- If task is simple and progressing well: stay as Star
- If complexity exceeds threshold: elevate to Hierarchical

**Best for:**
- Uncertain tasks where the right topology is not known in advance
- When the system should self-organize based on outcomes

**Properties:**
- Coordination: dynamic
- Communication: evolves
- Fault tolerance: high (adapts around failures)
- Scalability: good (adapts structure to load)

## Selection Guide

| Stage Characteristic | Recommended Topology | Rationale |
|---------------------|---------------------|-----------|
| Independent parallel tasks | **Star** | Simple, reliable, easy to synthesize |
| Fault-tolerant research | **Mesh** | Any agent can cover for another |
| Multi-evaluator panel | **Star** (isolated) | Judges must NOT communicate |
| Iterative refinement | **Ring** | Each pass adds specific value |
| Complex multi-level work | **Hierarchical** | Delegate and aggregate |
| Heterogeneous sub-tasks | **Hybrid** | Match topology to sub-task type |
| Uncertain complexity | **Adaptive** | Start simple, evolve as needed |

## Integration with Model Routing

Each topology can specify model tiers for its agents:

```
Star:
  Coordinator: opus (complex synthesis)
  Workers: sonnet (analytical work) or haiku (simple tasks)

Hierarchical:
  Queen: opus
  Managers: sonnet
  Workers: haiku

Mesh:
  All agents: same tier (usually sonnet)
```

## Implementation Note

In Claude Code, topologies are implemented using the Agent tool:
- Star/Hierarchical: Orchestrator spawns Agent tool calls
- Mesh: Multiple Agent calls that read shared files
- Ring: Sequential Agent calls, each reading the previous agent's output
