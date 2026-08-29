# Basic Evaluation: Skill Crystallizer

## Eval 1: CAPTURED Mode — Extract Skill from Trace

**Input:** After successfully scaffolding a Starlight documentation site with specific patterns
(component structure, MDX imports, sidebar config), trigger: "crystallize skill from this"

**Expected behavior:**
- Activates CAPTURED mode
- Analyzes execution trace: tools used, file patterns, decisions made
- Identifies reusable pattern: "Starlight docs scaffolding"
- Extracts: name, description, protocol steps, when-to-use
- Runs `dz create-skill --name starlight-scaffold --bto`
- Fills SKILL.md with extracted protocol
- Runs `dz benchmark` and reports grade

**Pass criteria:**
- Skill name is descriptive (not generic like "task-1")
- Protocol steps match what was actually done (not hallucinated)
- Anti-patterns section includes at least 1 real pitfall from the trace
- Benchmark grade is A

---

## Eval 2: DERIVED Mode — Combine Two Skills

**Input:** "Combine explore and structured-reasoning into a research-with-reasoning skill"

**Expected behavior:**
- Activates DERIVED mode
- Analyzes both source skills for handoff points
- Creates composite protocol: explore for gathering, structured-reasoning for analysis
- Defines data flow: explore output feeds into reasoning input
- Scaffolds new SKILL.md referencing both sources

**Pass criteria:**
- source_skills contains both "explore" and "structured-reasoning"
- Composite protocol is not just concatenation (has actual integration logic)
- New skill has its own when-to-use distinct from either source

---

## Eval 3: FIX Mode — Repair Broken Skill

**Input:** "fix skill explore" (where explore has an outdated tool reference)

**Expected behavior:**
- Activates FIX mode
- Runs benchmark on explore, identifies failure points
- Classifies issue: outdated references
- Applies targeted fix (updates reference, not full rewrite)
- Re-benchmarks to verify repair

**Pass criteria:**
- Diagnosis identifies the specific broken reference
- Repair is minimal (targeted fix, not full SKILL.md rewrite)
- Post-repair benchmark shows improvement
- Anti-pattern documented for the failure mode
