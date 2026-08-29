/**
 * Skill scaffolder — creates a complete SKILL.md directory structure.
 *
 * Generates: SKILL.md (agentskills.io frontmatter), schemas/output.json,
 * scripts/validate-config.json. Optionally: evals/, references/.
 *
 * @packageDocumentation
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/** Generate SKILL.md content with agentskills.io frontmatter. */
function generateSkillMd(opts) {
    const tier = opts.trustTier ?? 1;
    return `---
name: "${opts.name}"
description: "${opts.description}"
trust_tier: ${tier}
trust_tier_label: "${tier === 3 ? 'Verified' : tier === 2 ? 'Validated' : 'Structured'}"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# ${opts.name}

${opts.description}

## When to use

Use when [describe the trigger conditions].

## Protocol

1. [Step 1]
2. [Step 2]
3. [Step 3]

## Output

Structured output per \`schemas/output.json\`.
`;
}
/** Generate output schema template. */
function generateOutputSchema(name) {
    return JSON.stringify({
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: `${name} output`,
        type: 'object',
        properties: {
            status: { type: 'string', enum: ['success', 'failure', 'partial'] },
            summary: { type: 'string' },
            artifacts: { type: 'array', items: { type: 'string' } },
        },
        required: ['status', 'summary'],
    }, null, 2);
}
/** Generate validate-config.json template. */
function generateValidateConfig(name) {
    return JSON.stringify({
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: `${name} config validation`,
        type: 'object',
        properties: {
            enabled: { type: 'boolean', default: true },
        },
    }, null, 2);
}
/** Generate eval template. */
function generateEval(name) {
    return `# ${name} evaluation
# Run: aqe eval ${name}

test_cases:
  - name: "basic invocation"
    input: "Run ${name}"
    expected:
      status: success
      summary_contains: "${name}"
`;
}
/** Generate BTO-compatible eval template with 3-layer benchmarks. */
function generateBtoEval(name) {
    return `# ${name} — BTO evaluation
# Run: /bto-test .claude/skills/${name}
# Layers: L0 (deterministic) → L1 (single judge) → L2 (3-judge panel)

artifact_type: skill
bto_version: "1.0"

# ── Layer 0: Deterministic Pre-checks (free, always runs) ──────────
layer_0:
  gate_threshold: 80  # percent pass rate to proceed
  checks:
    # Universal checks (U1-U5)
    - id: U1
      name: "file exists"
      check: "SKILL.md exists in skill directory"
    - id: U2
      name: "valid UTF-8"
      check: "SKILL.md is valid UTF-8"
    - id: U3
      name: "has headings"
      check: "SKILL.md contains at least one markdown heading"
    - id: U4
      name: "no excessive blanks"
      check: "no more than 3 consecutive blank lines"
    - id: U5
      name: "size bounds"
      check: "file size between 100 bytes and 50KB"
    # Skill-specific checks (S1-S10)
    - id: S1
      name: "frontmatter present"
      check: "SKILL.md starts with YAML frontmatter (---)"
    - id: S2
      name: "name field"
      check: "frontmatter contains name field"
    - id: S3
      name: "description field"
      check: "frontmatter contains description field"
    - id: S4
      name: "trust_tier field"
      check: "frontmatter contains trust_tier (1-3)"
    - id: S5
      name: "protocol section"
      check: "SKILL.md contains ## Protocol or ## Steps"
    - id: S6
      name: "output section"
      check: "SKILL.md contains ## Output"
    - id: S7
      name: "schema exists"
      check: "schemas/output.json exists and is valid JSON"
    - id: S8
      name: "validator exists"
      check: "scripts/validate-config.json exists"
    - id: S9
      name: "when to use"
      check: "SKILL.md contains ## When to use"
    - id: S10
      name: "no TODO placeholders"
      check: "no [TODO] or [PLACEHOLDER] markers in SKILL.md"

# ── Layer 1: Single LLM Judge (Haiku, quick) ──────────────────────
layer_1:
  model: haiku
  pass_threshold: 7.0
  dimensions:
    - name: CLARITY
      weight: 1.0
      anchors:
        "9-10": "Instructions unambiguous, no interpretation needed"
        "5-6": "Mostly clear but some steps need clarification"
        "1-3": "Confusing, contradictory, or missing instructions"
    - name: COMPLETENESS
      weight: 1.0
      anchors:
        "9-10": "All sections filled, protocol covers edge cases"
        "5-6": "Main path covered, edge cases missing"
        "1-3": "Stub-level, most sections empty"
    - name: ACTIONABILITY
      weight: 1.0
      anchors:
        "9-10": "Each step produces a concrete, verifiable output"
        "5-6": "Some steps vague or unmeasurable"
        "1-3": "Steps are descriptions, not actions"
    - name: QUALITY
      weight: 1.0
      anchors:
        "9-10": "Production-ready, well-structured, follows conventions"
        "5-6": "Functional but needs polish"
        "1-3": "Draft quality, significant issues"
    - name: ANTI_PATTERNS
      weight: 1.0
      anchors:
        "9-10": "No anti-patterns detected"
        "5-6": "Minor anti-patterns (e.g., wall of text)"
        "1-3": "Major anti-patterns (e.g., no error handling, no abort)"

# ── Layer 2: Full Judge Panel (3 × Sonnet, deep) ──────────────────
layer_2:
  judges:
    - role: expert
      weight: 0.40
      focus: "methodology, depth, correctness, domain fit"
    - role: critic
      weight: 0.30
      focus: "gaps, weaknesses, anti-patterns, failure modes"
    - role: auditor
      weight: 0.30
      focus: "structure, coverage, cross-references, completeness"
  model: sonnet
  pass_threshold: 7.0
  dimensions:
    - METHODOLOGY
    - DEPTH
    - CORRECTNESS
    - USABILITY
    - ROBUSTNESS
  disagreement_threshold: 3  # max-min > 3 triggers meta-judge

# ── Quality Gates ──────────────────────────────────────────────────
gates:
  layer_0: "pass_rate >= 80%"
  layer_1: "average >= 7.0"
  layer_2: "weighted_average >= 7.0"
  optimization_delta: 0.5  # min improvement per iteration
  max_iterations: 10

# ── Test Cases ─────────────────────────────────────────────────────
test_cases:
  - name: "basic invocation"
    input: "Run ${name}"
    expected:
      status: success
      summary_contains: "${name}"
  - name: "edge case — empty input"
    input: ""
    expected:
      status: failure
      summary_contains: "input required"
  - name: "edge case — malformed input"
    input: "{{RANDOM_GARBAGE}}"
    expected:
      status: failure
      summary_contains: "invalid"
`;
}
/** Generate BTO judge rubrics reference file. */
function generateBtoRubrics(name) {
    return `# ${name} — Judge Rubrics

## Evaluation Dimensions (Layer 2)

| Dimension | Expert (0.40) | Critic (0.30) | Auditor (0.30) |
|-----------|--------------|---------------|----------------|
| METHODOLOGY | Multi-step protocol with decision points | Missing decision branches | Steps are numbered and sequential |
| DEPTH | Detailed modules, references, examples | Stub sections, no examples | All sections present and non-empty |
| CORRECTNESS | Instructions produce expected output | Wrong output or side effects | Schema matches actual output |
| USABILITY | Quick start, clear navigation | Wall of text, no structure | Cross-references work, paths valid |
| ROBUSTNESS | Anti-patterns, failure modes, abort | No error handling | Failure modes documented |

## Scoring Anchors

| Score | Label | Description |
|-------|-------|-------------|
| 9-10 | Excellent | Production-ready, no changes needed |
| 7-8 | Good | Minor improvements possible |
| 5-6 | Needs work | Functional but gaps exist |
| 3-4 | Poor | Significant rework required |
| 1-2 | Failed | Does not meet minimum standards |

## Anti-Patterns to Flag

- Score inflation: all judges score >8.5 on first attempt
- Conformity collapse: identical scores across all judges
- Missing rejection log: failed checks silently skipped
- Phantom improvement: score delta >0.5 but no content change
`;
}
/**
 * Create a new skill directory with all required files.
 *
 * Returns the list of created files. If the skill directory already exists,
 * returns `alreadyExists: true` and creates nothing.
 */
export function createSkill(opts) {
    const skillsDir = opts.skillsDir ?? '.claude/skills';
    const skillDir = join(skillsDir, opts.name);
    const filesCreated = [];
    if (existsSync(skillDir)) {
        return { skillDir, filesCreated: [], alreadyExists: true };
    }
    // Create directories
    mkdirSync(join(skillDir, 'schemas'), { recursive: true });
    mkdirSync(join(skillDir, 'scripts'), { recursive: true });
    // SKILL.md
    const skillMdPath = join(skillDir, 'SKILL.md');
    writeFileSync(skillMdPath, generateSkillMd(opts));
    filesCreated.push('SKILL.md');
    // schemas/output.json
    writeFileSync(join(skillDir, 'schemas', 'output.json'), generateOutputSchema(opts.name));
    filesCreated.push('schemas/output.json');
    // scripts/validate-config.json
    writeFileSync(join(skillDir, 'scripts', 'validate-config.json'), generateValidateConfig(opts.name));
    filesCreated.push('scripts/validate-config.json');
    // Optional: evals/
    if (opts.withEvals !== false) {
        mkdirSync(join(skillDir, 'evals'), { recursive: true });
        const evalContent = opts.bto ? generateBtoEval(opts.name) : generateEval(opts.name);
        writeFileSync(join(skillDir, 'evals', `${opts.name}.yaml`), evalContent);
        filesCreated.push(`evals/${opts.name}.yaml`);
    }
    // Optional: references/
    if (opts.withReferences || opts.bto) {
        mkdirSync(join(skillDir, 'references'), { recursive: true });
        if (opts.bto) {
            writeFileSync(join(skillDir, 'references', 'judge-rubrics.md'), generateBtoRubrics(opts.name));
            filesCreated.push('references/judge-rubrics.md');
        }
        else {
            writeFileSync(join(skillDir, 'references', '.gitkeep'), '');
            filesCreated.push('references/.gitkeep');
        }
    }
    return { skillDir, filesCreated, alreadyExists: false };
}
//# sourceMappingURL=create-skill.js.map