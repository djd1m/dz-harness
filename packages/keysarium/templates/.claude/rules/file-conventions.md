# File Conventions

## Research Artifacts
All research artifacts MUST be created inside `researches/<case-slug>/` directory.
NEVER create research files in the project root.

## Naming
- Case slugs: snake_case, Latin characters only (e.g., `bank_kc_automation`)
- Phase artifacts: numbered prefix (00_, 01_, 02_, etc.)
- Diagrams: descriptive kebab-case (e.g., `architecture-c4.mermaid`)
- Prototypes: in `prototype/` subdirectory

## File Creation Timing
Artifacts are created AT THE END of their phase, NOT deferred to Phase 6.
Each phase checkpoint verifies the file exists.

## Directory Structure per Research
```
researches/<slug>/
├── 00_product_discovery.md
├── 01_case_brief.md
├── 02_research_findings.md
├── 02.5_trend_brief.md
├── 03_solution_strategy.md
├── 04_architecture.md
├── 05_presentation_content.md
├── 06_speaker_script.md
├── 07_qa_preparation.md
├── 08_executive_summary.md
├── prototype/
│   └── cjm-prototype.jsx
├── diagrams/
│   ├── architecture-c4.mermaid
│   ├── sequence-main-flow.mermaid
│   ├── process-as-is.mermaid
│   └── process-to-be.mermaid
└── README.md
```
