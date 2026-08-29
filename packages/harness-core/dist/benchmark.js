/**
 * Skill benchmarking — Layer 0 deterministic checks + scoring.
 *
 * Runs structural validation checks against a skill directory,
 * producing a scored report. Checks are based on BTO Layer 0
 * (universal U1-U5 + skill-specific S1-S10).
 *
 * @packageDocumentation
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { detectScriptCapabilities, parseDeclaredCapabilities } from './capability-vocab.js';
import { estimateSkillCost } from './cost-scoring.js';
function gradeFromRate(rate) {
    if (rate >= 90)
        return 'A';
    if (rate >= 80)
        return 'B';
    if (rate >= 70)
        return 'C';
    if (rate >= 60)
        return 'D';
    return 'F';
}
/** Run Layer 0 benchmark checks on a single skill directory. */
export function benchmarkSkill(skillDir, skillId) {
    const checks = [];
    const skillMdPath = join(skillDir, 'SKILL.md');
    // U1: SKILL.md exists
    const skillMdExists = existsSync(skillMdPath);
    checks.push({ id: 'U1', name: 'SKILL.md exists', passed: skillMdExists });
    if (!skillMdExists) {
        return {
            skillId, skillDir, checks, passed: 0, total: checks.length,
            passRate: 0, grade: 'F', cost: estimateSkillCost(''),
        };
    }
    const content = readFileSync(skillMdPath, 'utf-8');
    const stat = statSync(skillMdPath);
    // U2: Valid UTF-8 (if we can read it, it's valid)
    checks.push({ id: 'U2', name: 'valid UTF-8', passed: true });
    // U3: Has headings
    const hasHeadings = /^#{1,6}\s/m.test(content);
    checks.push({ id: 'U3', name: 'has headings', passed: hasHeadings });
    // U4: No excessive blanks (>3 consecutive blank lines)
    const excessiveBlanks = /\n{5,}/.test(content);
    checks.push({ id: 'U4', name: 'no excessive blanks', passed: !excessiveBlanks });
    // U5: Size bounds (100B - 50KB)
    const sizeOk = stat.size >= 100 && stat.size <= 50000;
    checks.push({
        id: 'U5', name: 'size bounds (100B-50KB)', passed: sizeOk,
        detail: `${stat.size} bytes`,
    });
    // S1: Frontmatter present
    const hasFrontmatter = content.startsWith('---');
    checks.push({ id: 'S1', name: 'frontmatter present', passed: hasFrontmatter });
    // S2: name field
    const hasName = /^name:\s/m.test(content);
    checks.push({ id: 'S2', name: 'name field', passed: hasName });
    // S3: description field
    const hasDescription = /^description:\s/m.test(content);
    checks.push({ id: 'S3', name: 'description field', passed: hasDescription });
    // S4: trust_tier field
    const hasTrustTier = /^trust_tier:\s/m.test(content);
    checks.push({ id: 'S4', name: 'trust_tier field', passed: hasTrustTier });
    // S5: Protocol/procedure section (EN + RU). Accepts conventional procedural
    // headings (Workflow, Usage, Operations, Activation, Step Execution Protocol, …),
    // keyword anywhere in the heading — not just a narrow whitelist.
    const hasProtocol = /^##\s+.*(Protocol|Procedure|Steps?\b|Workflow|Usage|Operations|Activation|How (to use|it works)|Instructions|When to use|Протокол|Процедура|Шаги|Использовани|Применени)/mi.test(content);
    checks.push({ id: 'S5', name: 'protocol/procedure section', passed: hasProtocol });
    // S6: Output section or schema reference
    const hasOutput = /^##\s+Output/mi.test(content) || /schema_path/m.test(content);
    checks.push({ id: 'S6', name: 'output section or schema ref', passed: hasOutput });
    // S7: schemas/output.json exists
    const hasSchema = existsSync(join(skillDir, 'schemas', 'output.json'));
    checks.push({ id: 'S7', name: 'schemas/output.json exists', passed: hasSchema });
    // S8: scripts/validate-config.json exists
    const hasValidator = existsSync(join(skillDir, 'scripts', 'validate-config.json'));
    checks.push({ id: 'S8', name: 'scripts/validate-config.json exists', passed: hasValidator });
    // S9: When to use section (EN + RU). Accepts Triggers / Use Cases / Activation.
    const hasWhenToUse = /^##\s+.*(When to (use|activate)|When To Activate|Use (this skill )?when|Use Cases?|Triggers?|Activation|Когда (использовать|применять))/mi.test(content);
    checks.push({ id: 'S9', name: 'when-to-use section', passed: hasWhenToUse });
    // S10: No TODO/PLACEHOLDER markers
    const hasTodos = /\[TODO\]|\[PLACEHOLDER\]|\[TBD\]/i.test(content);
    checks.push({ id: 'S10', name: 'no TODO/PLACEHOLDER markers', passed: !hasTodos });
    // S11: Evals exist
    const hasEvals = existsSync(join(skillDir, 'evals'));
    checks.push({ id: 'S11', name: 'evals directory exists', passed: hasEvals });
    // S12: Content depth (>20 lines)
    const lineCount = content.split('\n').length;
    checks.push({
        id: 'S12', name: 'content depth (>20 lines)', passed: lineCount > 20,
        detail: `${lineCount} lines`,
    });
    // S13: Examples section (EN + RU). Accepts Quick Start, Usage, Sample,
    // Walkthrough, and *Script headings (code-example sections), keyword anywhere.
    const hasExamples = /^##\s+.*(Examples?|Quick\s?Start|Quickstart|Usage|Sample|Walkthrough|Script|Примеры?|Использовани|Быстрый старт)/mi.test(content);
    checks.push({ id: 'S13', name: 'examples section', passed: hasExamples });
    // S14: Anti-patterns / pitfalls / self-check section (EN + RU). Accepts the
    // common pitfall conventions (Error Handling, Troubleshooting, Gotchas, Caveats,
    // Limitations, Pitfalls, Prohibited, Warnings) and a bold **PROHIBITED** block.
    const hasAntiPatterns = /^##\s+.*(Anti.?[Pp]atterns?|Self.?check|Error Handling|Troubleshooting|Gotchas|Caveats|Limitations|Pitfalls|Common (Mistakes|Issues|Pitfalls)|Prohibited|Warnings?|Антипаттерны|Самопроверка|Ошибки|Ограничения|Предостережени)/mi.test(content)
        || /\*\*\s*PROHIBITED/i.test(content);
    checks.push({ id: 'S14', name: 'anti-patterns or self-check', passed: hasAntiPatterns });
    // S15: capability declaration matches usage (advisory, contradiction-only).
    // Phase 1 auto-detects network + shell from scripts/ only (never SKILL.md prose).
    // PASS unless a declared `capabilities.<cap>: false` is contradicted by detected
    // usage. Absent block, or under-declaration (uses it, declares nothing), PASS —
    // so the ~all skills that declare nothing today stay green.
    const declaredCaps = parseDeclaredCapabilities(content);
    const detectedCaps = detectScriptCapabilities(skillDir);
    const contradictions = [];
    if (detectedCaps.network && declaredCaps.network === false)
        contradictions.push('network');
    if (detectedCaps.shell && declaredCaps.shell === false)
        contradictions.push('shell');
    checks.push({
        id: 'S15',
        name: 'capability declaration matches usage',
        passed: contradictions.length === 0,
        detail: contradictions.length > 0
            ? `scripts use ${contradictions.join(' + ')} but capabilities declare it false`
            : undefined,
    });
    // S16: side-effecting skills should declare their capabilities (ADVISORY — not
    // graded). Warns when scripts use network/shell but the capability is not
    // declared at all (neither true nor false). The adoption nudge for the manifest;
    // excluded from the grade so it never regresses an existing skill.
    const undeclaredUsed = [];
    if (detectedCaps.network && declaredCaps.network === undefined)
        undeclaredUsed.push('network');
    if (detectedCaps.shell && declaredCaps.shell === undefined)
        undeclaredUsed.push('shell');
    checks.push({
        id: 'S16',
        name: 'side-effects declared (advisory)',
        passed: undeclaredUsed.length === 0,
        advisory: true,
        detail: undeclaredUsed.length > 0
            ? `scripts use ${undeclaredUsed.join(' + ')} — add a capabilities: block declaring it`
            : undefined,
    });
    // grade math is over GRADED checks only — advisory checks (S16) are excluded
    // so they ship without changing any existing grade.
    const graded = checks.filter((c) => !c.advisory);
    const passed = graded.filter((c) => c.passed).length;
    const passRate = graded.length > 0 ? Math.round((passed / graded.length) * 100) : 0;
    return {
        skillId, skillDir, checks, passed, total: graded.length,
        passRate, grade: gradeFromRate(passRate), cost: estimateSkillCost(content),
    };
}
/** Benchmark multiple skills. */
export function benchmarkSkills(skillDirs) {
    const skills = skillDirs.map((s) => benchmarkSkill(s.dir, s.id));
    const totalPassed = skills.reduce((sum, s) => sum + s.passed, 0);
    const totalChecks = skills.reduce((sum, s) => sum + s.total, 0);
    return {
        skills,
        totalPassed,
        totalChecks,
        overallPassRate: totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 0,
    };
}
/** Compare two skills head-to-head. */
export function compareSkills(skillADir, skillAId, skillBDir, skillBId) {
    const skillA = benchmarkSkill(skillADir, skillAId);
    const skillB = benchmarkSkill(skillBDir, skillBId);
    // deltaChecks is GRADED-ONLY — advisory checks (e.g. S16) never touch the grade,
    // so surfacing them in the A/B diff would misrepresent an adoption nudge as a
    // quality difference. Mirrors the graded filter in the grade math above.
    const deltaChecks = [];
    for (const checkA of skillA.checks) {
        if (checkA.advisory)
            continue;
        const checkB = skillB.checks.find((c) => c.id === checkA.id);
        if (checkB && checkA.passed !== checkB.passed) {
            deltaChecks.push({ id: checkA.id, aPass: checkA.passed, bPass: checkB.passed });
        }
    }
    const winner = skillA.passRate > skillB.passRate ? skillAId
        : skillB.passRate > skillA.passRate ? skillBId
            : 'tie';
    return { skillA, skillB, winner, deltaChecks };
}
//# sourceMappingURL=benchmark.js.map