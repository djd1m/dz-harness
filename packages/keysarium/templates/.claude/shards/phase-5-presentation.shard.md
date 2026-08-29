# Phase 5: Presentation — Governance Shard

## Time Budget
20% of total timeline (largest allocation)

## Skill
Load: `.claude/skills/presentation-storyteller/SKILL.md`

## Prerequisites
- Phase 4 complete: `<promise>ARCHITECTURE_DEFINED</promise>`
- `{CHOSEN_CJM}` is set (for Slide 5)
- Files exist: `00_` through `04_`

## Mandatory Outputs (ALL 4 files required)
- `05_presentation_content.md` (10-12 slides with storytelling)
- `06_speaker_script.md` (per-slide: HOOK, CONTENT, BRIDGE, TONE, KEY MESSAGE)
- `07_qa_preparation.md` (7+ typical jury questions + answers)
- `08_executive_summary.md` (1 page for jury) ⭐ MANDATORY

## 08_executive_summary.md is NON-NEGOTIABLE
Missing Executive Summary is a FORBIDDEN anti-pattern. BLOCK if not created.

## Slide Structure (10-12 slides)
1. Title + Team + Case
2. Problem (SCQA, cost of inaction)
3. Key Question + Elevator Pitch
4. Concept (high-level, AI role)
5. User Flow / To-Be (`{CHOSEN_CJM}`)
6. AI Under the Hood (models, RAG/Agent, HITL)
7. Data Architecture
8. Security & Compliance
9. Metrics & ROI (As-Is → Target)
10. Roadmap (PoC → MVP → Scale)
11. Team + CTA
12. Q&A

## Agent Swarm (3 parallel)
- Agent 1 (opus): Presentation content (05) — storytelling
- Agent 2 (sonnet): Speaker script (06)
- Agent 3 (sonnet): Q&A + Executive Summary (07 + 08)

## Quality Gates
- No slide reading (text-heavy slides) → FLAG
- Every slide must have a visual anchor suggestion
- Speaker script must tell a connected story across slides
- Q&A must include tough/adversarial questions
- Executive Summary must fit on 1 page

## Promise
On completion: `<promise>PRESENTATION_READY</promise>`

## Anti-Patterns to Check
- Text-heavy slides → FLAG
- No storytelling arc → FLAG
- Missing Executive Summary → BLOCK
- Generic phrases without numbers → FLAG
