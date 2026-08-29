# Judge Rubrics — Evaluation Criteria by Artifact Type

## Universal Dimensions (1-10 scale)

All artifact types are evaluated on these 5 dimensions:

| Dimension | What it Measures | 1-3 (Poor) | 4-6 (Adequate) | 7-8 (Good) | 9-10 (Excellent) |
|-----------|-----------------|------------|----------------|------------|-------------------|
| METHODOLOGY | Approach soundness | No clear structure | Basic structure present | Well-designed protocol | Rigorous, innovative approach |
| DEPTH | Content thoroughness | Superficial | Covers basics | Thorough treatment | Comprehensive with nuances |
| CORRECTNESS | Accuracy of claims/instructions | Major errors | Minor inaccuracies | Accurate | Precise and verifiable |
| USABILITY | Ease of use | Confusing | Usable with effort | Clear and navigable | Intuitive, self-documenting |
| ROBUSTNESS | Edge case handling | No coverage | Some mentioned | Well-covered | Exhaustive with fallbacks |

---

## Skill Rubric

### METHODOLOGY
- 9-10: Clear multi-step protocol, modular design, explicit decision points
- 7-8: Good protocol structure, some modularity
- 4-6: Basic steps listed, no clear decision flow
- 1-3: No protocol, just description of what skill does

### DEPTH
- 9-10: Detailed modules, rich references, multiple examples, anti-patterns
- 7-8: Good detail in SKILL.md, has references and examples
- 4-6: Basic overview, minimal references
- 1-3: Stub-level content, no supporting files

### CORRECTNESS
- 9-10: All instructions produce expected output, cross-references valid
- 7-8: Instructions work, minor reference issues
- 4-6: Some instructions ambiguous, broken references
- 1-3: Instructions would produce wrong output

### USABILITY
- 9-10: Quick start section, clear navigation, progressive disclosure
- 7-8: Well-organized, findable information
- 4-6: Readable but poorly organized
- 1-3: Wall of text, no structure

### ROBUSTNESS
- 9-10: Anti-patterns documented, failure modes handled, abort conditions defined
- 7-8: Anti-patterns section present, some edge cases
- 4-6: Mentions some risks
- 1-3: No failure mode coverage

---

## Command Rubric

### METHODOLOGY
- 9-10: Clear step-by-step flow, proper checkpoints, skill loading pattern
- 7-8: Good flow, checkpoint present
- 4-6: Basic steps, missing checkpoint
- 1-3: No clear execution flow

### DEPTH
- 9-10: Handles all parameter combinations, parallel agent usage
- 7-8: Good parameter handling, some agent usage
- 4-6: Basic parameter handling
- 1-3: No parameter handling

### CORRECTNESS
- 9-10: $ARGUMENTS properly used, skill paths correct, agent configs valid
- 7-8: Mostly correct references
- 4-6: Some incorrect references
- 1-3: Wrong skill paths or broken references

### USABILITY
- 9-10: Clear usage line, example invocations, helpful error messages
- 7-8: Usage documented, some examples
- 4-6: Basic usage, no examples
- 1-3: Unclear how to invoke

### ROBUSTNESS
- 9-10: Input validation, fallbacks, timeout handling
- 7-8: Some input validation
- 4-6: Minimal validation
- 1-3: No error handling

---

## Research Artifact Rubric

### METHODOLOGY
- 9-10: PARANOID mode, systematic research plan, structured sections
- 7-8: Good research structure, mostly verified
- 4-6: Basic structure, some unverified claims
- 1-3: Unstructured, many unverified claims

### DEPTH
- 9-10: Multiple sources per claim, competitive analysis, quantitative data
- 7-8: Good source coverage, some quantitative data
- 4-6: Few sources, mostly qualitative
- 1-3: No sources, opinion-based

### CORRECTNESS
- 9-10: All claims sourced, no [UNVERIFIED] tags, real products/companies
- 7-8: Mostly sourced, few [UNVERIFIED]
- 4-6: Some sourced, several [UNVERIFIED]
- 1-3: Unsourced, potentially hallucinated

### USABILITY
- 9-10: Executive summary, clear sections, actionable takeaways
- 7-8: Well-organized, some actionable content
- 4-6: Readable but hard to act on
- 1-3: Dense, unstructured

### ROBUSTNESS
- 9-10: Limitations documented, alternative views considered, confidence levels
- 7-8: Some limitations noted
- 4-6: Minimal caveats
- 1-3: No limitations or alternative views

---

## Rule Rubric

### METHODOLOGY
- 9-10: Clear pattern/signal/fix structure, auto-detection instructions
- 7-8: Good table structure, detection guidance
- 4-6: List format, basic detection
- 1-3: Unstructured prose

### DEPTH
- 9-10: 8+ patterns, each with specific signals and actionable fixes
- 7-8: 5-7 patterns, good specificity
- 4-6: 3-4 patterns, generic
- 1-3: 1-2 patterns, vague

### CORRECTNESS
- 9-10: All patterns are real, signals are detectable, fixes work
- 7-8: Mostly accurate patterns
- 4-6: Some questionable patterns
- 1-3: Patterns don't match reality

### USABILITY
- 9-10: Scannable table format, clear action items
- 7-8: Table format, understandable
- 4-6: List format, requires interpretation
- 1-3: Hard to use as reference

### ROBUSTNESS
- 9-10: Covers common AND edge case patterns, priority ordering
- 7-8: Good pattern coverage
- 4-6: Only obvious patterns
- 1-3: Misses critical patterns

---

## Agent Template Rubric

### METHODOLOGY
- 9-10: Clear isolation, model selection, integration protocol
- 7-8: Good agent config, clear purpose
- 4-6: Basic config, unclear integration
- 1-3: No clear agent architecture

### DEPTH
- 9-10: Detailed prompt, context specification, output format
- 7-8: Good prompt, some output guidance
- 4-6: Basic prompt only
- 1-3: Stub template

### CORRECTNESS
- 9-10: Model choice justified, isolation enforced, no conflict with other agents
- 7-8: Reasonable model choice, basic isolation
- 4-6: Questionable model choice
- 1-3: Wrong model or no isolation

### USABILITY
- 9-10: Ready to use with Agent tool, clear parameters
- 7-8: Mostly ready, minor adjustments needed
- 4-6: Needs significant adaptation
- 1-3: Not usable as-is

### ROBUSTNESS
- 9-10: Timeout handling, failure protocol, cost bounds
- 7-8: Some failure handling
- 4-6: No failure handling but stable
- 1-3: Could cause issues (infinite loops, cost overrun)
