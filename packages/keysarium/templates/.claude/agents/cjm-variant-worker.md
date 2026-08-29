# Agent Template: CJM Variant Worker

## Purpose
Генерирует один вариант CJM (Customer Journey Map) в рамках Phase 2.5.
Используется как один из 3 параллельных агентов.

## Spawning Pattern
```
Agent(
  subagent_type="general-purpose",
  description="Phase 2.5 CJM Variant [X]",
  prompt="""
    Read the skills:
    - .claude/skills/reverse-engineering-unicorn/modules/025-cjm-prototype.md
    - .claude/skills/frontend-design/SKILL.md

    Read the context:
    - researches/<slug>/00_product_discovery.md
    - researches/<slug>/01_case_brief.md
    - researches/<slug>/02_research_findings.md

    Generate CJM Variant [X]: [VARIANT_NAME]

    Approach: [APPROACH_DESCRIPTION]
    - Entry point: [pull/push/hybrid]
    - AI autonomy: [advisor/executor/partner]
    - Target segment: [user segment]

    Deliverable: Return a JSON-like structure:
    {
      name: "[variant name]",
      emoji: "[emoji]",
      trigger: { title, scenario, metric },
      input: { title, fields, scenario },
      processing: { title, steps, duration },
      result: { title, format, scenario },
      review: { title, hitl, scenario },
      action: { title, integration, scenario }
    }

    Plus a brief comparison row for the variant table.
  """
)
```

## Variants
1. **Agent A** — Variant A: основной подход (наиболее очевидный)
2. **Agent B** — Variants B + C: альтернативные подходы
3. **Agent C** — Trend Research для Variant D (Future-Ready)

## Agent C Special Instructions
Agent C uses GOAP research (`.claude/skills/goap-research-ed25519/SKILL.md`) to:
1. Research 5 trend categories (AI Evolution, UX Shifts, Infra, Regulatory, Competitive)
2. Create Trend Brief
3. Synthesize Variant D based on trends + best of A/B/C

## Synthesis
Orchestrator combines all variants into:
- `02.5_trend_brief.md` (from Agent C)
- `prototype/cjm-prototype.jsx` (unified React component with all 4 variants)
