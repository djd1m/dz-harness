/**
 * Pretrain — bootstrap intelligence by analyzing the target project.
 *
 * Scans the project's file structure, package.json, and tech stack to
 * automatically recommend the right skills and presets. Runs during
 * `dz init --pretrain` to eliminate manual preset selection.
 *
 * @packageDocumentation
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadSessions } from './patterns.js';
/** Tech detection rules: file/pattern → tech. */
const DETECTORS = [
    // Languages/Frameworks
    { glob: 'package.json', tech: 'node.js', category: 'runtime' },
    { glob: 'tsconfig.json', tech: 'typescript', category: 'language' },
    { glob: 'requirements.txt', tech: 'python', category: 'runtime' },
    { glob: 'pyproject.toml', tech: 'python', category: 'runtime' },
    { glob: 'go.mod', tech: 'go', category: 'runtime' },
    { glob: 'Cargo.toml', tech: 'rust', category: 'runtime' },
    { glob: 'Gemfile', tech: 'ruby', category: 'runtime' },
    // Frontend
    { glob: 'next.config', tech: 'next.js', category: 'frontend' },
    { glob: 'vite.config', tech: 'vite', category: 'frontend' },
    { glob: 'tailwind.config', tech: 'tailwind', category: 'frontend' },
    // Databases
    { glob: 'prisma', tech: 'prisma', category: 'database' },
    { glob: 'drizzle.config', tech: 'drizzle', category: 'database' },
    { glob: 'knexfile', tech: 'knex', category: 'database' },
    // Infrastructure
    { glob: 'Dockerfile', tech: 'docker', category: 'infra' },
    { glob: 'docker-compose', tech: 'docker-compose', category: 'infra' },
    { glob: '.github/workflows', tech: 'github-actions', category: 'ci' },
    { glob: '.gitlab-ci.yml', tech: 'gitlab-ci', category: 'ci' },
    { glob: 'terraform', tech: 'terraform', category: 'iac' },
    { glob: '.tf', tech: 'terraform', category: 'iac' },
    { glob: 'k8s', tech: 'kubernetes', category: 'infra' },
    { glob: 'helm', tech: 'helm', category: 'infra' },
    { glob: 'nginx.conf', tech: 'nginx', category: 'infra' },
    // Testing
    { glob: 'vitest.config', tech: 'vitest', category: 'testing' },
    { glob: 'jest.config', tech: 'jest', category: 'testing' },
    { glob: 'playwright.config', tech: 'playwright', category: 'testing' },
    { glob: 'cypress.config', tech: 'cypress', category: 'testing' },
    { glob: '.stryker', tech: 'stryker', category: 'testing' },
    // Data
    { glob: 'dbt_project.yml', tech: 'dbt', category: 'data' },
    { glob: 'airflow', tech: 'airflow', category: 'data' },
    // API
    { glob: 'openapi', tech: 'openapi', category: 'api' },
    { glob: 'swagger', tech: 'swagger', category: 'api' },
    { glob: '.graphql', tech: 'graphql', category: 'api' },
    { glob: 'schema.graphql', tech: 'graphql', category: 'api' },
    // Cache/Queue
    { glob: 'redis', tech: 'redis', category: 'cache' },
    // Knowledge
    { glob: '.obsidian', tech: 'obsidian', category: 'knowledge' },
];
/** Map tech categories to recommended skills. */
const CATEGORY_TO_SKILLS = {
    'runtime': ['debugging', 'test-writer', 'pr-review'],
    'language': ['test-writer', 'pr-review'],
    'frontend': ['frontend-implementation', 'playwright-testing'],
    'database': ['database-review', 'database-migration'],
    'infra': ['docker-compose', 'kubernetes', 'nginx-config'],
    'ci': ['ci-fix', 'github-actions'],
    'iac': ['terraform'],
    'testing': ['test-writer', 'playwright-testing'],
    'data': ['data-pipeline'],
    'api': ['api-design', 'graphql-schema'],
    'cache': ['redis-patterns'],
    'knowledge': ['obsidian'],
};
/** Map detected skills to presets. */
const SKILL_TO_PRESET = {
    'pr-review': 'devops', 'security-audit': 'devops', 'test-writer': 'devops',
    'ci-fix': 'devops', 'terraform': 'devops', 'kubernetes': 'devops',
    'docker-compose': 'devops', 'api-design': 'devops', 'debugging': 'devops',
    'database-review': 'devops', 'database-migration': 'devops',
    'github-actions': 'devops', 'nginx-config': 'devops', 'redis-patterns': 'devops',
    'graphql-schema': 'devops', 'playwright-testing': 'devops',
    'data-pipeline': 'devops', 'incident-response': 'devops',
    'frontend-implementation': 'devops', 'monorepo-management': 'devops',
    'brave-search': 'mcp', 'gmail': 'mcp', 'notion': 'mcp', 'obsidian': 'mcp',
    'git-mcp': 'mcp', 'context7': 'mcp',
};
/** Scan project directory for files matching detectors. */
function scanProject(projectRoot) {
    const techs = [];
    const seen = new Set();
    // Check top-level files
    let entries = [];
    try {
        entries = readdirSync(projectRoot).map((e) => e.toLowerCase());
    }
    catch {
        return [];
    }
    for (const detector of DETECTORS) {
        const globLower = detector.glob.toLowerCase();
        const match = entries.some((e) => e.includes(globLower));
        if (match && !seen.has(detector.tech)) {
            seen.add(detector.tech);
            techs.push({
                name: detector.tech,
                category: detector.category,
                confidence: 0.9,
                source: detector.glob,
            });
        }
    }
    // Check subdirectories (1 level deep)
    for (const entry of entries) {
        const subPath = join(projectRoot, entry);
        try {
            const subEntries = readdirSync(subPath).map((e) => e.toLowerCase());
            for (const detector of DETECTORS) {
                const globLower = detector.glob.toLowerCase();
                if (subEntries.some((e) => e.includes(globLower)) && !seen.has(detector.tech)) {
                    seen.add(detector.tech);
                    techs.push({
                        name: detector.tech,
                        category: detector.category,
                        confidence: 0.7,
                        source: `${entry}/${detector.glob}`,
                    });
                }
            }
        }
        catch { /* not a directory or no access */ }
    }
    // Parse package.json for deps
    const pkgPath = join(projectRoot, 'package.json');
    if (existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
            const depNames = Object.keys(allDeps).map((d) => d.toLowerCase());
            const depDetectors = [
                ['next', 'next.js', 'frontend'],
                ['react', 'react', 'frontend'],
                ['vue', 'vue', 'frontend'],
                ['express', 'express', 'api'],
                ['fastify', 'fastify', 'api'],
                ['prisma', 'prisma', 'database'],
                ['drizzle-orm', 'drizzle', 'database'],
                ['redis', 'redis', 'cache'],
                ['ioredis', 'redis', 'cache'],
                ['bullmq', 'bullmq', 'queue'],
                ['graphql', 'graphql', 'api'],
                ['playwright', 'playwright', 'testing'],
                ['vitest', 'vitest', 'testing'],
                ['jest', 'jest', 'testing'],
            ];
            for (const [dep, tech, category] of depDetectors) {
                if (depNames.some((d) => d.includes(dep)) && !seen.has(tech)) {
                    seen.add(tech);
                    techs.push({ name: tech, category, confidence: 0.8, source: `package.json dep: ${dep}` });
                }
            }
        }
        catch { /* invalid JSON */ }
    }
    return techs.sort((a, b) => b.confidence - a.confidence);
}
/** Run pretrain analysis on a project. */
export function pretrain(projectRoot) {
    const techs = scanProject(projectRoot);
    // Determine recommended skills from detected techs
    const skillSet = new Set();
    // Always recommend core skills
    skillSet.add('pr-review');
    skillSet.add('security-audit');
    skillSet.add('debugging');
    for (const tech of techs) {
        const skills = CATEGORY_TO_SKILLS[tech.category] ?? [];
        for (const s of skills)
            skillSet.add(s);
    }
    const recommendedSkills = [...skillSet].sort();
    // Determine recommended presets
    const presetCounts = new Map();
    for (const skill of recommendedSkills) {
        const preset = SKILL_TO_PRESET[skill];
        if (preset)
            presetCounts.set(preset, (presetCounts.get(preset) ?? 0) + 1);
    }
    const recommendedPresets = [...presetCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name);
    // Detect project type
    const categories = new Set(techs.map((t) => t.category));
    let projectType = 'generic';
    if (categories.has('frontend') && categories.has('api'))
        projectType = 'fullstack';
    else if (categories.has('frontend'))
        projectType = 'frontend';
    else if (categories.has('api'))
        projectType = 'backend';
    else if (categories.has('data'))
        projectType = 'data-engineering';
    else if (categories.has('iac'))
        projectType = 'infrastructure';
    // Detect package count (monorepo check)
    let packageCount = 1;
    const pkgPath = join(projectRoot, 'pnpm-workspace.yaml');
    if (existsSync(pkgPath)) {
        try {
            const dirs = readdirSync(join(projectRoot, 'packages'), { withFileTypes: true })
                .filter((e) => e.isDirectory());
            packageCount = dirs.length;
            if (packageCount > 3)
                skillSet.add('monorepo-management');
        }
        catch { /* no packages dir */ }
    }
    // Get project name
    let projectName = 'unknown';
    const rootPkg = join(projectRoot, 'package.json');
    if (existsSync(rootPkg)) {
        try {
            const pkg = JSON.parse(readFileSync(rootPkg, 'utf-8'));
            projectName = pkg.name ?? 'unknown';
        }
        catch { /* */ }
    }
    // Session read-back (audit #2): surface how much session history exists.
    // Absent/empty ⇒ sessionCount 0, lastSessionTs undefined (graceful).
    const sessions = loadSessions(projectRoot);
    return {
        projectName,
        techs,
        recommendedPresets,
        recommendedSkills: [...skillSet].sort(),
        projectType,
        hasTests: techs.some((t) => t.category === 'testing'),
        hasDocker: techs.some((t) => t.name === 'docker' || t.name === 'docker-compose'),
        hasCI: techs.some((t) => t.category === 'ci'),
        hasTerraform: techs.some((t) => t.name === 'terraform'),
        hasKubernetes: techs.some((t) => t.name === 'kubernetes' || t.name === 'helm'),
        packageCount,
        sessionCount: sessions.length,
        ...(sessions.length > 0 ? { lastSessionTs: sessions[sessions.length - 1].ts } : {}),
    };
}
//# sourceMappingURL=pretrain.js.map