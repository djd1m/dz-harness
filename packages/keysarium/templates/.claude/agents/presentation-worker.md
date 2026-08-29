# Agent Template: Presentation Worker

## Purpose
Генерирует один из компонентов презентации в рамках Phase 5.
Используется как один из 3 параллельных агентов.

## Spawning Pattern
```
Agent(
  subagent_type="general-purpose",
  description="Phase 5 [component]",
  prompt="""
    Read the skill: .claude/skills/presentation-storyteller/SKILL.md

    Read ALL prior artifacts for full context:
    - researches/<slug>/00_product_discovery.md
    - researches/<slug>/01_case_brief.md
    - researches/<slug>/02_research_findings.md
    - researches/<slug>/02.5_trend_brief.md
    - researches/<slug>/03_solution_strategy.md
    - researches/<slug>/04_architecture.md

    Component to generate: [COMPONENT]

    [COMPONENT-SPECIFIC INSTRUCTIONS]

    Write the result to: researches/<slug>/[FILENAME]
  """
)
```

## Components (spawn one agent per component)

### Agent 1: Presentation Content
- File: `05_presentation_content.md`
- 10-12 slides with structure: Title, Problem, Question+Answer, Concept, User Flow, AI Pipeline, Data, Security, Metrics+ROI, Roadmap, Team+CTA, Q&A
- Each slide: title, key message, visual description, data points

### Agent 2: Speaker Script
- File: `06_speaker_script.md`
- For each slide: HOOK (question/fact), CONTENT (30-60 sec), BRIDGE (transition), TONE, KEY MOMENT
- Total time: 7-10 minutes
- Storytelling arc: Problem → Journey → Solution → Impact

### Agent 3: Q&A + Executive Summary
- Files: `07_qa_preparation.md` + `08_executive_summary.md`
- Q&A: 7+ typical jury questions with 30-sec answers and supporting data
- Executive Summary: 1-page summary (Problem, Solution, Architecture, Metrics, Roadmap, Verification)
- Executive Summary is MANDATORY — never skip

## Synthesis
Orchestrator reviews all 3 outputs for:
- Consistency of narrative across presentation, script, and Q&A
- No contradictions between slides and speaker notes
- Executive summary accurately reflects the full solution
