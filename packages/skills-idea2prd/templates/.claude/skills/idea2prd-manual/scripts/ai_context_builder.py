#!/usr/bin/env python3
"""
AI Context Package Builder for idea2prd skills.
Assembles .ai-context/ directory for Vibe Coding AI agents.
"""

import os
import json
from dataclasses import dataclass, field
from typing import List, Dict, Optional
from datetime import datetime
from pathlib import Path


@dataclass
class BoundedContext:
    """Represents a bounded context."""
    name: str
    type: str  # Core, Supporting, Generic
    responsibility: str
    aggregates: List[str] = field(default_factory=list)
    events: List[str] = field(default_factory=list)


@dataclass
class ADRSummary:
    """Summary of an Architecture Decision Record."""
    id: str
    title: str
    decision: str
    rationale: str


@dataclass
class FitnessRule:
    """A fitness rule for AI to follow."""
    id: str
    rule: str
    threshold: str
    consequence: str


@dataclass
class AIContextPackage:
    """Complete AI context package data."""
    product_name: str
    description: str
    bounded_contexts: List[BoundedContext] = field(default_factory=list)
    adrs: List[ADRSummary] = field(default_factory=list)
    glossary: Dict[str, str] = field(default_factory=dict)
    coding_standards: Dict[str, str] = field(default_factory=dict)
    fitness_rules: List[FitnessRule] = field(default_factory=list)
    tech_stack: Dict[str, str] = field(default_factory=dict)


class AIContextBuilder:
    """Builds .ai-context/ package for AI agents."""

    def __init__(self, package: AIContextPackage):
        self.package = package

    def build_readme(self) -> str:
        """Generate README.md for .ai-context/"""
        return f"""# AI Context Package: {self.package.product_name}

This directory contains structured context for AI-assisted development (Vibe Coding).

## Contents

| File | Purpose |
|------|---------|
| `architecture-summary.md` | System overview and key components |
| `key-decisions.md` | Top architecture decisions (from ADRs) |
| `domain-glossary.md` | Ubiquitous language definitions |
| `bounded-contexts.md` | Context responsibilities and boundaries |
| `coding-standards.md` | Code style and conventions |
| `fitness-rules.md` | Rules AI must follow |

## Usage

When prompting AI for code generation, reference this context:

```bash
# Claude Code
claude --context .ai-context/ "Implement [feature]"

# In conversation
"Using the context in .ai-context/, implement the UserAggregate"
```

## Important Rules

1. **Follow ADRs** — All architecture decisions in `key-decisions.md` are binding
2. **Use Domain Language** — Terms in `domain-glossary.md` have specific meanings
3. **Respect Boundaries** — Don't cross bounded context boundaries directly
4. **Validate with Fitness** — Code must pass rules in `fitness-rules.md`

---
*Generated: {datetime.now().isoformat()}*
"""

    def build_architecture_summary(self) -> str:
        """Generate architecture-summary.md"""
        contexts_table = "\n".join([
            f"| {ctx.name} | {ctx.type} | {ctx.responsibility} |"
            for ctx in self.package.bounded_contexts
        ])

        tech_stack_lines = "\n".join([
            f"- **{k}:** {v}" for k, v in self.package.tech_stack.items()
        ])

        return f"""# Architecture Summary

## System Overview

**Product:** {self.package.product_name}
**Description:** {self.package.description}

## Technology Stack

{tech_stack_lines}

## Bounded Contexts

| Context | Type | Responsibility |
|---------|------|----------------|
{contexts_table}

## Key Integration Points

### Context Communication
- Contexts communicate via **Domain Events** (async)
- Direct API calls allowed for queries only
- No direct database access across contexts

### External Integrations
- Authentication: OAuth 2.0 / JWT
- Email: External service via API
- Storage: Cloud storage service

## Critical Constraints

1. **Single Aggregate per Transaction** — Never modify multiple aggregates in one transaction
2. **Event-Driven** — State changes emit domain events
3. **API-First** — All functionality exposed via API

---
*For detailed decisions, see `key-decisions.md`*
"""

    def build_key_decisions(self) -> str:
        """Generate key-decisions.md from ADR summaries."""
        decisions = "\n\n".join([
            f"""### {adr.id}: {adr.title}

**Decision:** {adr.decision}

**Rationale:** {adr.rationale}
"""
            for adr in self.package.adrs
        ])

        return f"""# Key Architecture Decisions

This document summarizes the most important architecture decisions.
For full details, see individual ADRs in `docs/adr/`.

{decisions}

---
*Total ADRs: {len(self.package.adrs)}*
"""

    def build_domain_glossary(self) -> str:
        """Generate domain-glossary.md from ubiquitous language."""
        terms = "\n".join([
            f"| **{term}** | {definition} |"
            for term, definition in sorted(self.package.glossary.items())
        ])

        return f"""# Domain Glossary (Ubiquitous Language)

Use these terms consistently in code, documentation, and communication.

| Term | Definition |
|------|------------|
{terms}

## Usage Guidelines

1. **In Code** — Use these exact terms for class/function/variable names
2. **In APIs** — Use these terms in endpoint paths and payloads
3. **In Documentation** — Don't use synonyms; use the defined terms
4. **In Communication** — Align team vocabulary with these definitions

---
*Terms: {len(self.package.glossary)}*
"""

    def build_bounded_contexts(self) -> str:
        """Generate bounded-contexts.md"""
        contexts = []

        for ctx in self.package.bounded_contexts:
            aggregates = ", ".join(ctx.aggregates) if ctx.aggregates else "TBD"
            events = ", ".join(ctx.events) if ctx.events else "TBD"

            contexts.append(f"""### {ctx.name}

**Type:** {ctx.type}
**Responsibility:** {ctx.responsibility}

**Aggregates:** {aggregates}
**Domain Events:** {events}

**Boundaries:**
- Owns its own database schema
- Exposes API for other contexts
- Publishes events for state changes
""")

        return f"""# Bounded Contexts

## Overview

This system is divided into {len(self.package.bounded_contexts)} bounded contexts.

## Context Details

{"".join(contexts)}

## Communication Rules

1. **No Direct DB Access** — Contexts don't share database tables
2. **API for Queries** — Use context's API to read data
3. **Events for Commands** — Publish events for state changes
4. **ACL for External** — Use Anti-Corruption Layer for external systems

---
*Contexts: {len(self.package.bounded_contexts)}*
"""

    def build_coding_standards(self) -> str:
        """Generate coding-standards.md"""
        standards = "\n".join([
            f"### {category}\n\n{rules}\n"
            for category, rules in self.package.coding_standards.items()
        ])

        return f"""# Coding Standards

Follow these standards when generating code.

{standards}

## File Structure

```
src/
├── [context]/
│   ├── domain/
│   │   ├── aggregates/
│   │   ├── entities/
│   │   ├── value-objects/
│   │   └── events/
│   ├── application/
│   │   ├── services/
│   │   └── commands/
│   ├── infrastructure/
│   │   ├── repositories/
│   │   └── external/
│   └── api/
│       ├── controllers/
│       └── dto/
```

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Aggregate | PascalCase | `UserAggregate` |
| Entity | PascalCase | `OrderItem` |
| Value Object | PascalCase | `EmailAddress` |
| Domain Event | PascalCase, past tense | `OrderPlaced` |
| Repository | PascalCase + Repository | `UserRepository` |
| Service | PascalCase + Service | `PricingService` |
"""

    def build_fitness_rules(self) -> str:
        """Generate fitness-rules.md"""
        rules = "\n".join([
            f"""### {rule.id}: {rule.rule}

- **Threshold:** {rule.threshold}
- **Consequence:** {rule.consequence}
"""
            for rule in self.package.fitness_rules
        ])

        return f"""# Fitness Rules

AI-generated code MUST follow these rules. Violations will be caught by automated checks.

{rules}

## Validation

All code is validated against these rules:
- On every commit (CI pipeline)
- On every PR (automated review)
- Before deployment (gate check)

## Consequences of Violation

| Severity | Action |
|----------|--------|
| Critical | Block merge, immediate fix required |
| High | Block merge, fix within 24h |
| Medium | Warning, fix within sprint |
| Low | Note for improvement |

---
*Rules: {len(self.package.fitness_rules)}*
"""

    def build_all(self, output_dir: str = ".ai-context") -> Dict[str, str]:
        """Build all context files."""
        files = {
            "README.md": self.build_readme(),
            "architecture-summary.md": self.build_architecture_summary(),
            "key-decisions.md": self.build_key_decisions(),
            "domain-glossary.md": self.build_domain_glossary(),
            "bounded-contexts.md": self.build_bounded_contexts(),
            "coding-standards.md": self.build_coding_standards(),
            "fitness-rules.md": self.build_fitness_rules()
        }

        return files

    def write_to_disk(self, output_dir: str = ".ai-context"):
        """Write all files to disk."""
        path = Path(output_dir)
        path.mkdir(parents=True, exist_ok=True)

        files = self.build_all(output_dir)

        for filename, content in files.items():
            filepath = path / filename
            filepath.write_text(content)
            print(f"Created: {filepath}")

        print(f"\n✅ AI Context Package created in {output_dir}/")
        print(f"   Files: {len(files)}")


def create_sample_package() -> AIContextPackage:
    """Create a sample AI context package for demonstration."""
    return AIContextPackage(
        product_name="Habit Tracker",
        description="Application for tracking daily habits with statistics and reminders",
        bounded_contexts=[
            BoundedContext(
                name="Identity",
                type="Supporting",
                responsibility="User authentication and profile management",
                aggregates=["User"],
                events=["UserRegistered", "UserProfileUpdated"]
            ),
            BoundedContext(
                name="Habits",
                type="Core",
                responsibility="Habit definition and daily tracking",
                aggregates=["Habit", "HabitLog"],
                events=["HabitCreated", "HabitCompleted", "StreakBroken"]
            ),
            BoundedContext(
                name="Analytics",
                type="Supporting",
                responsibility="Statistics and insights generation",
                aggregates=["UserStats"],
                events=["StatsUpdated", "InsightGenerated"]
            )
        ],
        adrs=[
            ADRSummary(
                id="ADR-001",
                title="Modular Monolith Architecture",
                decision="Use modular monolith with clear bounded context boundaries",
                rationale="Simpler deployment for MVP while maintaining clean architecture"
            ),
            ADRSummary(
                id="ADR-002",
                title="PostgreSQL Database",
                decision="Use PostgreSQL as primary database",
                rationale="ACID compliance, JSON support, and team expertise"
            ),
            ADRSummary(
                id="ADR-003",
                title="REST API",
                decision="Use REST with JSON for API design",
                rationale="Simple, widely supported, good tooling"
            ),
            ADRSummary(
                id="ADR-004",
                title="JWT Authentication",
                decision="Use JWT tokens with OAuth 2.0 for authentication",
                rationale="Stateless, mobile-friendly, standard approach"
            )
        ],
        glossary={
            "Habit": "A recurring activity that user wants to track",
            "Streak": "Consecutive days of completing a habit",
            "Check-in": "Recording completion of a habit for a specific day",
            "Reminder": "Notification to prompt user to complete a habit",
            "Insight": "AI-generated observation about user's habit patterns"
        },
        coding_standards={
            "TypeScript": """- Use strict mode
- Prefer `interface` over `type` for object shapes
- Use `readonly` for immutable properties
- Explicit return types for public functions""",
            "Testing": """- Unit tests for domain logic (Jest)
- Integration tests for repositories
- E2E tests for critical user journeys
- Minimum 80% coverage""",
            "Error Handling": """- Use custom error classes per bounded context
- Return RFC 7807 Problem Details from API
- Log errors with correlation ID"""
        },
        fitness_rules=[
            FitnessRule(
                id="FF-001",
                rule="No cross-context database access",
                threshold="0 violations",
                consequence="Block merge"
            ),
            FitnessRule(
                id="FF-002",
                rule="Aggregates must have ≤7 entities",
                threshold="7 entities max",
                consequence="Code review required"
            ),
            FitnessRule(
                id="FF-003",
                rule="All private endpoints require authentication",
                threshold="100% coverage",
                consequence="Block merge"
            ),
            FitnessRule(
                id="FF-004",
                rule="Test coverage minimum",
                threshold="≥80%",
                consequence="Block merge"
            )
        ],
        tech_stack={
            "Backend": "Node.js + Express + TypeScript",
            "Database": "PostgreSQL",
            "Cache": "Redis",
            "Frontend": "React + TypeScript",
            "API": "REST + JSON",
            "Auth": "JWT + OAuth 2.0",
            "Testing": "Jest + Playwright"
        }
    )


# =============================================================================
# Main / Example Usage
# =============================================================================

if __name__ == "__main__":
    # Create sample package
    package = create_sample_package()

    # Build context
    builder = AIContextBuilder(package)

    # Print all files
    files = builder.build_all()

    for filename, content in files.items():
        print("=" * 60)
        print(f"FILE: {filename}")
        print("=" * 60)
        print(content)
        print()

    # Optionally write to disk
    # builder.write_to_disk(".ai-context")
