/**
 * The harness operations — `init`, `sync`, `verify`, `doctor` — as pure-ish
 * functions returning structured reports. `@dzhechkov/harness-cli` is a thin
 * argv shell over these.
 *
 * @packageDocumentation
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManagedEntries, buildCodexHookManifest, codexHooksPaths, diffCodexHooks, parseCodexHookManifest, planCodexHooks, removeCodexHooks, selectOwnHookMetadata, upsertTrustBlock, } from './codex-hooks.js';
import { sweepSkillDrift } from './skill-drift.js';
import { generateCodexHelpers } from './codex-hooks-assets.js';
import { classifyVetoProbe, isReadyVerdict, verifyExitCode, } from './codex-hooks-verify.js';
import { AGENTS_MD_PATH } from '@dzhechkov/adapter-agents-md';
import { claudeAdapter } from '@dzhechkov/adapter-claude';
import { CODEX_SKILLS_ROOT } from '@dzhechkov/adapter-codex';
import { GEMINI_MD_PATH } from '@dzhechkov/adapter-gemini';
import { HERMES_SKILLS_ROOT } from '@dzhechkov/adapter-hermes';
import { OPENCODE_SKILLS_ROOT } from '@dzhechkov/adapter-opencode';
import { OPENCLAUDE_SKILLS_ROOT } from '@dzhechkov/adapter-openclaude';
import { COPILOT_INSTRUCTIONS_ROOT } from '@dzhechkov/adapter-copilot';
import { CURSOR_RULES_ROOT } from '@dzhechkov/adapter-cursor';
import { WINDSURF_RULES_ROOT } from '@dzhechkov/adapter-windsurf';
import { AGENTS_MD_BLOCK_BEGIN, mergeAgentsMd, mergeGeminiMd, mergePolicyBlock, renderAgentsMdSection } from '@dzhechkov/core';
import { computeRiskScore } from './risk-scoring.js';
import { applyEmitResult } from './apply.js';
import { describeSkillLoadFailure, discoverSkillIds, loadSkillFromDir } from './skills.js';
import { TARGETS } from './targets.js';
import { TARGET_INTEGRATIONS, aggregateIntegrationManifests, notRequestedOutcomes, refusedOutcome, staticPolicyOutcomes, } from './target-integrations.js';
import { applyIntegrationFragments, IntegrationApplyError } from './integration-apply.js';
import { verifyTargetIntegration } from './integrations-verify.js';
import { AGENTS_MD_BUDGET_WARN_FRACTION, CODEX_PROJECT_DOC_MAX_BYTES, POLICY_SOURCES, detectPolicyDrift, extractPolicyBlocks, measureAgentsMdBudget, renderPolicySections, } from './agents-policy.js';
// ---------------------------------------------------------------------------
// Platform enrichment — optional extras beyond SKILL.md
// ---------------------------------------------------------------------------
/**
 * Where each target's skill tree is rooted. These MUST agree with the
 * `skillsRoot` each adapter actually emits to — so we import the adapters'
 * exported `*_SKILLS_ROOT` constants rather than duplicating string literals.
 * (`adapter-claude` does not yet re-export its constant from its package entry,
 * so `.claude/skills` is mirrored here with a guard test in operations.test.ts.)
 */
const SKILLS_ROOTS = {
    'claude-code': '.claude/skills',
    codex: CODEX_SKILLS_ROOT,
    opencode: OPENCODE_SKILLS_ROOT,
    hermes: HERMES_SKILLS_ROOT,
    openclaude: OPENCLAUDE_SKILLS_ROOT,
    // copilot is a lossy instruction adapter (not a skills tree); enrichment never
    // fires for it (no matching branch below), but the map must be total.
    copilot: COPILOT_INSTRUCTIONS_ROOT,
    // agents-md is a lossy, FLATTENING single-file adapter — runInit short-circuits
    // to runInitAgentsMd before the enrichment loop, so this entry only keeps the
    // record total (it is never used to derive a per-skill tree dir).
    'agents-md': AGENTS_MD_PATH,
    // cursor is PER-SKILL (fits the standard emit loop) but TRANSFORMING like copilot —
    // its own compile emits `.cursor/rules/<id>.mdc` (not a SKILL.md tree), so no
    // enrichment branch fires for it; this entry only keeps the record total.
    cursor: CURSOR_RULES_ROOT,
    // gemini is a lossy, FLATTENING single-file adapter (like agents-md) — runInit
    // short-circuits to runInitGeminiMd before the enrichment loop, so this entry
    // only keeps the record total (never used to derive a per-skill tree dir).
    gemini: GEMINI_MD_PATH,
    // windsurf is PER-SKILL (fits the standard emit loop) but TRANSFORMING like
    // cursor — its own compile emits `.windsurf/rules/<id>.md` (not a SKILL.md
    // tree), so no enrichment branch fires for it; this entry only keeps the
    // record total.
    windsurf: WINDSURF_RULES_ROOT,
};
/**
 * Append platform-specific enrichment files to an EmitResult.
 * Called only when `--enrich` flag is set. Does NOT modify the original
 * EmitResult — returns a new one with extra files appended.
 */
function enrichEmitForTarget(emit, target, skillId, skill) {
    const extra = [];
    const skillDir = `${SKILLS_ROOTS[target]}/${skillId}`;
    const name = skill.frontmatter.name ?? skillId;
    const desc = skill.frontmatter.description ?? '';
    if (target === 'codex') {
        // Codex: agents/openai.yaml — UI metadata + risk scoring + MCP dependencies
        const risk = computeRiskScore(skill.document.body);
        const yaml = [
            `# Codex enrichment for ${name}`,
            `# Generated by dz init --enrich`,
            `# 4-axis risk scoring (inspired by ECC 2.0)`,
            `interface:`,
            `  display_name: "${name}"`,
            `policy:`,
            // MEASURED (hermes research, codex.md §63, twin-test): codex PARSES this file and
            // `allow_implicit_invocation: false` HIDES the skill from the session entirely — it is a
            // visibility switch, not an ask-first switch. Risk-gating through it silently disappeared a
            // compiled pack (the terraform smoke pack never registered, backlog 2b80420f). Visibility is
            // therefore ALWAYS true; the risk score stays as INFORMATION for the operator below.
            `  allow_implicit_invocation: true  # false would HIDE the skill from codex entirely (measured); risk is informational, see risk_level`,
            `  risk_level: "${risk.level}"`,
            `  risk_score: ${risk.total.toFixed(2)}`,
            `  risk_axes:`,
            `    base_tool: ${risk.axes.base_tool.toFixed(2)}`,
            `    file_sensitivity: ${risk.axes.file_sensitivity.toFixed(2)}`,
            `    blast_radius: ${risk.axes.blast_radius.toFixed(2)}`,
            `    irreversibility: ${risk.axes.irreversibility.toFixed(2)}`,
        ].join('\n');
        extra.push({ path: `${skillDir}/agents/openai.yaml`, encoding: 'utf-8', content: yaml });
    }
    if (target === 'opencode') {
        // OpenCode: agent definition with model and permissions
        const agentMd = [
            `---`,
            `description: "${desc.slice(0, 200)}"`,
            `mode: subagent`,
            `---`,
            ``,
            `You are the ${name} skill. Follow the instructions in SKILL.md.`,
        ].join('\n');
        extra.push({ path: `.opencode/agents/${skillId}.md`, encoding: 'utf-8', content: agentMd });
    }
    if (target === 'hermes') {
        // Hermes: cli-config snippet (YAML)
        const yaml = [
            `# Hermes enrichment for ${name}`,
            `# Generated by dz init --enrich`,
            `skills:`,
            `  ${skillId}:`,
            `    enabled: true`,
            `    description: "${desc.slice(0, 200)}"`,
        ].join('\n');
        extra.push({ path: `${skillDir}/hermes-config.yaml`, encoding: 'utf-8', content: yaml });
    }
    if (extra.length === 0)
        return emit;
    return {
        files: [...emit.files, ...extra],
        warnings: [...emit.warnings, `enriched: ${extra.length} platform-specific file(s) for ${target}`],
    };
}
/**
 * The one read/merge/write path for every root managed-Markdown projection.
 * `write:false` is check-only and never creates a directory or target file.
 * A max-byte refusal happens before mkdir/write, leaving the target byte-identical.
 */
export function writeManagedMarkdown(projectRoot, sections, config, options = {}) {
    const fileAbs = join(projectRoot, config.filePath);
    const existing = existsSync(fileAbs) ? readFileSync(fileAbs, 'utf-8') : null;
    const merged = config.merge(existing, sections);
    const bytes = Buffer.byteLength(merged, 'utf8');
    if (options.maxBytes !== undefined && bytes > options.maxBytes) {
        throw new Error(`${config.filePath} policy emit exceeds the ${options.maxBytes.toLocaleString('en-US')} byte Codex project-document budget (${bytes.toLocaleString('en-US')} bytes); target left unchanged`);
    }
    const changed = merged !== existing;
    if (options.write !== false && changed) {
        mkdirSync(dirname(fileAbs), { recursive: true });
        writeFileSync(fileAbs, merged, 'utf-8');
    }
    return { filePath: config.filePath, changed, bytes, content: merged };
}
/**
 * The lossy warning surfaced ONCE per agents-md install (not once per skill):
 * agents-md flattens every selected skill into plain-Markdown sections of a
 * single root `AGENTS.md`, dropping frontmatter, progressive disclosure, and
 * per-skill file boundaries. The canonical pack stays the lossless source.
 */
const AGENTS_MD_LOSSY_WARNING = `agents-md is a lossy target: every selected skill is flattened into a plain-Markdown ` +
    `section of a single root-level ${AGENTS_MD_PATH} (YAML frontmatter, progressive disclosure, ` +
    `and per-skill file boundaries are dropped). The canonical pack remains the lossless source.`;
/**
 * The lossy warning surfaced ONCE per gemini install (mirror of the agents-md
 * one, filename swapped): gemini flattens every selected skill into
 * plain-Markdown sections of a single root `GEMINI.md`. Canonical pack stays
 * the lossless source.
 */
const GEMINI_MD_LOSSY_WARNING = `gemini is a lossy target: every selected skill is flattened into a plain-Markdown ` +
    `section of a single root-level ${GEMINI_MD_PATH} (YAML frontmatter, progressive disclosure, ` +
    `and per-skill file boundaries are dropped). The canonical pack remains the lossless source.`;
/**
 * Aggregate every selected skill (across ALL `skillsDirs`) into ONE root
 * single-file managed-Markdown target, MERGING into any existing user-authored
 * file — dz owns only its fenced block; every other byte the user wrote is
 * preserved verbatim.
 *
 * Idempotent: re-running replaces the fenced block (never duplicates it). This
 * is where the single-file flattening lives — the adapter `compile` only renders
 * one section at a time; the cross-skill aggregation + merge is a platform-level
 * operation, not a per-skill tree write. Shared by AGENTS.md + GEMINI.md.
 */
function runInitSingleFileMd(options, config) {
    const selection = options.select;
    const joinedDir = options.skillsDirs.join(', ');
    // Collect each selected skill exactly once (first source dir that has it wins),
    // preserving deterministic discovery order for a stable rendered file.
    const seen = new Set();
    const picked = [];
    const discovered = new Set();
    for (const skillsDir of options.skillsDirs) {
        for (const id of discoverSkillIds(skillsDir)) {
            discovered.add(id);
            if (seen.has(id))
                continue;
            if (selection !== undefined && !selection.includes(id))
                continue;
            seen.add(id);
            picked.push({ id, skillsDir });
        }
    }
    const missing = selection === undefined ? [] : selection.filter((id) => !discovered.has(id));
    let aggregate = { manifest: undefined, digest: undefined };
    try {
        if (options.noIntegrations !== true) {
            aggregate = aggregateIntegrationManifests(picked.map(({ id, skillsDir }) => ({ skillId: id, skillDir: skillsDir })));
        }
    }
    catch (error) {
        const remediation = error instanceof Error ? error.message : String(error);
        return {
            target: config.target,
            skillsDir: joinedDir,
            projectRoot: options.projectRoot,
            skills: [],
            missing,
            failures: [],
            applyFailures: [],
            integrations: [
                refusedOutcome(config.target, 'mcp', 'MANIFEST_INVALID', remediation),
                refusedOutcome(config.target, 'hooks', 'MANIFEST_INVALID', remediation),
            ],
        };
    }
    // Skip-and-collect: one unloadable skill must not discard the whole aggregation.
    const failures = [];
    const loaded = [];
    for (const { id, skillsDir } of picked) {
        try {
            loaded.push({ id, section: renderAgentsMdSection(loadSkillFromDir(skillsDir, id)) });
        }
        catch (error) {
            failures.push(describeSkillLoadFailure(skillsDir, id, error));
        }
    }
    const sections = loaded.map((entry) => entry.section);
    const managed = writeManagedMarkdown(options.projectRoot, sections, config, { write: loaded.length > 0 });
    const changed = managed.changed;
    // Report the shared root file as written/skipped on the FIRST contributing
    // skill only, so callers that SUM per-skill file counts don't count the one
    // shared file N times. The lossy warning is surfaced ONCE, on that same skill.
    const skills = loaded.map(({ id }, index) => {
        const owns = index === 0;
        return {
            id,
            written: owns && changed ? [config.filePath] : [],
            skipped: owns && !changed ? [config.filePath] : [],
            warnings: owns ? [config.lossyWarning] : [],
        };
    });
    // No apply failures are possible here: the single write is outside every per-skill
    // loop, so a write error propagates as itself rather than being attributed to a skill.
    return {
        target: config.target,
        skillsDir: joinedDir,
        projectRoot: options.projectRoot,
        skills,
        missing,
        failures,
        applyFailures: [],
        integrations: options.noIntegrations === true
            ? notRequestedOutcomes(config.target)
            : staticPolicyOutcomes(config.target, aggregate.manifest, options.noHooks === true),
        ...(aggregate.digest !== undefined ? { integrationDigest: aggregate.digest } : {}),
    };
}
/**
 * Aggregate every selected skill into ONE root `AGENTS.md`, merging into any
 * user-authored file (dz owns only its fenced block). Thin wrapper over
 * {@link runInitSingleFileMd}. See it for the full contract.
 */
export function runInitAgentsMd(options) {
    return runInitSingleFileMd(options, {
        target: 'agents-md',
        filePath: AGENTS_MD_PATH,
        merge: mergeAgentsMd,
        lossyWarning: AGENTS_MD_LOSSY_WARNING,
    });
}
/**
 * Aggregate every selected skill into ONE root `GEMINI.md` (Gemini CLI / Code
 * Assist), merging into any user-authored file (dz owns only its fenced block).
 * Thin wrapper over {@link runInitSingleFileMd} — same single-file aggregation
 * as agents-md, different filename + merge helper. See it for the full contract.
 */
export function runInitGeminiMd(options) {
    return runInitSingleFileMd(options, {
        target: 'gemini',
        filePath: GEMINI_MD_PATH,
        merge: mergeGeminiMd,
        lossyWarning: GEMINI_MD_LOSSY_WARNING,
    });
}
/**
 * Refresh or verify the policy fence in root AGENTS.md. Source reads are an
 * explicit I/O shell around the pure agents-policy module; missing/unreadable
 * input returns inconclusive evidence and never writes a partial projection.
 */
export function runSyncAgentsPolicy(options) {
    const sources = options.sources ?? POLICY_SOURCES;
    const sourceFiles = new Map();
    for (const file of new Set(sources.map((source) => source.file))) {
        try {
            sourceFiles.set(file, readFileSync(join(options.projectRoot, file), 'utf8'));
        }
        catch {
            sourceFiles.set(file, null);
        }
    }
    const agentsPath = join(options.projectRoot, AGENTS_MD_PATH);
    let currentAgents = null;
    try {
        currentAgents = readFileSync(agentsPath, 'utf8');
    }
    catch { /* absent target is a normal first sync */ }
    const extracted = extractPolicyBlocks(sourceFiles, sources);
    if (extracted.missing.length > 0) {
        const drift = detectPolicyDrift(sourceFiles, currentAgents, sources);
        return {
            filePath: AGENTS_MD_PATH,
            changed: true,
            written: false,
            inSync: false,
            blocks: extracted.blocks.map(({ id, sha }) => ({ id, sha })),
            missing: extracted.missing,
            drift: drift.findings,
            budget: measureAgentsMdBudget(currentAgents ?? ''),
            warnings: [`policy source evidence is incomplete: ${extracted.missing.join(', ')}`],
        };
    }
    const currentDrift = detectPolicyDrift(sourceFiles, currentAgents, sources);
    const malformedOuterFence = currentDrift.findings.some((finding) => finding.id === 'dz:policies');
    if (options.check !== true && malformedOuterFence) {
        return {
            filePath: AGENTS_MD_PATH,
            changed: true,
            written: false,
            inSync: false,
            blocks: extracted.blocks.map(({ id, sha }) => ({ id, sha })),
            missing: [],
            drift: currentDrift.findings,
            budget: measureAgentsMdBudget(currentAgents ?? ''),
            warnings: ['refusing to rewrite malformed or duplicate dz:policies fence markers; repair their cardinality first'],
        };
    }
    const sections = renderPolicySections(extracted.blocks, sources);
    const rendered = sections.join('\n\n');
    const claudeOnlyTokens = ['Workflow({', 'subagent_type', 'mcp__', '.claude/agents/v3/'];
    const leaked = claudeOnlyTokens.find((token) => rendered.includes(token));
    if (leaked !== undefined)
        throw new Error(`AGENTS.md policy block contains Claude-only token ${JSON.stringify(leaked)}; target left unchanged`);
    const managed = writeManagedMarkdown(options.projectRoot, sections, { filePath: AGENTS_MD_PATH, merge: mergePolicyBlock }, { write: options.check !== true, maxBytes: CODEX_PROJECT_DOC_MAX_BYTES });
    const budget = measureAgentsMdBudget(managed.content);
    const drift = detectPolicyDrift(sourceFiles, options.check === true ? currentAgents : managed.content, sources);
    const warnings = [];
    if (budget.bytes >= budget.cap * AGENTS_MD_BUDGET_WARN_FRACTION) {
        warnings.push(`AGENTS.md uses ${budget.pct}% of the measured ${budget.cap.toLocaleString('en-US')} byte Codex project-document budget`);
    }
    const skillsBegin = managed.content.indexOf(AGENTS_MD_BLOCK_BEGIN);
    if (skillsBegin !== -1 && budget.policyBlockEndsAtByte > Buffer.byteLength(managed.content.slice(0, skillsBegin), 'utf8')) {
        warnings.push('policy fence must end before the skills fence because Codex truncates the tail');
    }
    const nonOk = drift.findings.filter((finding) => finding.status !== 'ok');
    return {
        filePath: AGENTS_MD_PATH,
        changed: managed.changed,
        written: options.check !== true && managed.changed,
        inSync: options.check === true ? !managed.changed && nonOk.length === 0 : nonOk.length === 0,
        blocks: extracted.blocks.map(({ id, sha }) => ({ id, sha })),
        missing: [],
        drift: drift.findings,
        budget,
        warnings,
    };
}
/** Compile every skill in `skillsDir` for `target` and apply it under `projectRoot`. */
export async function runInit(options) {
    // agents-md is a flattening single-file target — aggregate all selected skills
    // into ONE root AGENTS.md instead of the per-skill tree write below.
    if (options.target === 'agents-md') {
        return runInitAgentsMd({
            skillsDirs: [options.skillsDir],
            projectRoot: options.projectRoot,
            select: options.select,
            ...(options.noHooks !== undefined ? { noHooks: options.noHooks } : {}),
            ...(options.noIntegrations !== undefined ? { noIntegrations: options.noIntegrations } : {}),
        });
    }
    // gemini is likewise a flattening single-file target — aggregate into ONE root
    // GEMINI.md instead of the per-skill tree write below.
    if (options.target === 'gemini') {
        return runInitGeminiMd({
            skillsDirs: [options.skillsDir],
            projectRoot: options.projectRoot,
            select: options.select,
            ...(options.noHooks !== undefined ? { noHooks: options.noHooks } : {}),
            ...(options.noIntegrations !== undefined ? { noIntegrations: options.noIntegrations } : {}),
        });
    }
    const adapter = TARGETS[options.target];
    const skills = [];
    const selection = options.select;
    const discovered = discoverSkillIds(options.skillsDir);
    const ids = discovered.filter((id) => selection === undefined || selection.includes(id));
    const missing = selection === undefined
        ? []
        : selection.filter((id) => !discovered.includes(id));
    const manifestSources = options.integrationManifestSources
        ?? ids.map((id) => ({ skillId: id, skillDir: options.skillsDir }));
    let aggregate = { manifest: undefined, digest: undefined };
    try {
        if (options.noIntegrations !== true)
            aggregate = aggregateIntegrationManifests(manifestSources);
    }
    catch (error) {
        const remediation = error instanceof Error ? error.message : String(error);
        return {
            target: options.target,
            skillsDir: options.skillsDir,
            projectRoot: options.projectRoot,
            skills: [],
            missing,
            failures: [],
            applyFailures: [],
            integrations: [
                refusedOutcome(options.target, 'mcp', 'MANIFEST_INVALID', remediation),
                refusedOutcome(options.target, 'hooks', 'MANIFEST_INVALID', remediation),
            ],
        };
    }
    let integrations = notRequestedOutcomes(options.target);
    let eligibleClaudePlan;
    if (aggregate.manifest !== undefined && options.noIntegrations !== true) {
        if (options.target !== 'claude-code') {
            integrations = staticPolicyOutcomes(options.target, aggregate.manifest, options.noHooks === true);
        }
        else {
            const mcpRequested = Object.keys(aggregate.manifest.mcpServers ?? {}).length > 0;
            const hooksRequested = (aggregate.manifest.hooks?.length ?? 0) > 0 && options.noHooks !== true;
            let mcpOutcome = { target: options.target, component: 'mcp', status: 'not-requested', registrations: [] };
            if (mcpRequested) {
                if (options.noVerify === true) {
                    mcpOutcome = refusedOutcome(options.target, 'mcp', 'NO_QUALIFYING_LIVE_RECEIPT', '--no-verify cannot authorize integration emission; rerun with live verification enabled');
                }
                else if (aggregate.digest === undefined || options.allowIntegrations !== aggregate.digest) {
                    mcpOutcome = refusedOutcome(options.target, 'mcp', 'INTEGRATION_AUTHORIZATION_REQUIRED', `rerun with --allow-integrations ${aggregate.digest ?? '<missing-digest>'}`);
                }
                else {
                    const plan = TARGET_INTEGRATIONS['claude-code'].plan(aggregate.manifest, { target: 'claude-code' });
                    const refusal = plan.refusals.find((row) => row.component === 'mcp');
                    if (refusal !== undefined) {
                        mcpOutcome = refusedOutcome(options.target, 'mcp', refusal.reasonCode, refusal.remediation);
                    }
                    else {
                        const preflight = verifyTargetIntegration({
                            target: 'claude-code',
                            component: 'mcp',
                            projectRoot: options.projectRoot,
                            phase: 'preflight',
                            ...(options.integrationProcessPort !== undefined ? { processPort: options.integrationProcessPort } : {}),
                        });
                        if (!preflight.ok) {
                            mcpOutcome = refusedOutcome(options.target, 'mcp', preflight.reasonCode ?? 'LIVE_PROBE_FAILED', preflight.remediation ?? 'live preflight did not qualify');
                        }
                        else {
                            eligibleClaudePlan = plan;
                            mcpOutcome = {
                                target: options.target,
                                component: 'mcp',
                                status: 'emitted',
                                registrations: [],
                                carrier: { scope: 'project', path: '.mcp.json' },
                                ...(preflight.runtimeVersion !== undefined ? { runtimeVersion: preflight.runtimeVersion } : {}),
                                ...(preflight.evidenceVersion !== undefined ? { evidenceVersion: preflight.evidenceVersion } : {}),
                            };
                        }
                    }
                }
            }
            const hookOutcome = hooksRequested
                ? refusedOutcome(options.target, 'hooks', 'NO_ACTIVATION_RECEIPT', 'record a nonce canary and negative-control activation receipt')
                : { target: options.target, component: 'hooks', status: 'not-requested', registrations: [] };
            integrations = [mcpOutcome, hookOutcome];
        }
    }
    // Skip-and-collect (D1): one unparseable SKILL.md must not discard the whole install.
    // Same shape as `runVerify`'s long-standing per-id try/catch below.
    //
    // The `try` is scoped to `loadSkillFromDir` ALONE (ADR-001 §Decision part 2, restored
    // in fix round 1 / QE F4). It used to wrap compile + apply too, so an EEXIST from
    // `mkdir` was described by `describeSkillLoadFailure` and printed under the
    // "unparseable SKILL.md" header, naming the source file — which was valid. Compile
    // and write failures are a SECOND kind with their own subject and their own header;
    // they are collected, not thrown, so one unwritable target directory still cannot
    // discard the rest of the install.
    const failures = [];
    const applyFailures = [];
    for (const id of ids) {
        let skill;
        try {
            skill = loadSkillFromDir(options.skillsDir, id);
        }
        catch (error) {
            failures.push(describeSkillLoadFailure(options.skillsDir, id, error));
            continue;
        }
        try {
            let emit = await adapter.compile(skill, { targetRoot: options.projectRoot });
            if (options.enrich === true) {
                emit = enrichEmitForTarget(emit, options.target, id, skill);
            }
            const applied = applyEmitResult(emit, {
                targetRoot: options.projectRoot,
                force: options.force === true,
            });
            skills.push({ id, written: applied.written, skipped: applied.skipped, warnings: [...emit.warnings] });
        }
        catch (error) {
            applyFailures.push({ id, reason: error instanceof Error ? error.message : String(error) });
        }
    }
    if (eligibleClaudePlan !== undefined && integrations[0].status === 'emitted') {
        try {
            applyIntegrationFragments({
                projectRoot: options.projectRoot,
                fragments: eligibleClaudePlan.fragments,
                ...(options.integrationApplyFault !== undefined ? { injectFault: options.integrationApplyFault } : {}),
            });
            const registrations = Object.keys(aggregate.manifest?.mcpServers ?? {});
            const observed = [];
            let failedObservation;
            for (const registrationId of registrations) {
                const result = verifyTargetIntegration({
                    target: 'claude-code',
                    component: 'mcp',
                    projectRoot: options.projectRoot,
                    registrationId,
                    phase: 'post-write',
                    ...(options.integrationProcessPort !== undefined ? { processPort: options.integrationProcessPort } : {}),
                });
                if (!result.ok) {
                    failedObservation = result;
                    break;
                }
                observed.push(...result.registrations);
            }
            if (failedObservation !== undefined) {
                integrations = [
                    {
                        ...refusedOutcome(options.target, 'mcp', failedObservation.reasonCode ?? 'POST_WRITE_REGISTRATION_NOT_OBSERVED', failedObservation.remediation ?? 'registration was written but not observed'),
                        carrier: { scope: 'project', path: '.mcp.json' },
                        applied: true,
                    },
                    integrations[1],
                ];
            }
            else {
                integrations = [{ ...integrations[0], registrations: observed }, integrations[1]];
            }
        }
        catch (error) {
            const reasonCode = error instanceof IntegrationApplyError ? error.reasonCode : 'APPLY_FAILED';
            integrations = [{
                    ...refusedOutcome(options.target, 'mcp', reasonCode, error instanceof Error ? error.message : String(error)),
                    ...(error instanceof IntegrationApplyError && error.applied ? { applied: true } : {}),
                }, integrations[1]];
        }
    }
    return {
        target: options.target,
        skillsDir: options.skillsDir,
        projectRoot: options.projectRoot,
        skills,
        missing,
        failures,
        applyFailures,
        integrations,
        ...(aggregate.digest !== undefined ? { integrationDigest: aggregate.digest } : {}),
    };
}
/** Compile every skill for `target` and report whether each verifies. */
export async function runVerify(options) {
    const target = options.target ?? 'claude-code';
    const adapter = TARGETS[target];
    const skills = [];
    for (const id of discoverSkillIds(options.skillsDir)) {
        try {
            const skill = loadSkillFromDir(options.skillsDir, id);
            const emit = await adapter.compile(skill, { targetRoot: '.' });
            const result = await adapter.verify(emit);
            skills.push({ id, ok: result.ok, errors: [...result.errors], warnings: [...result.warnings] });
        }
        catch (error) {
            skills.push({
                id,
                ok: false,
                errors: [error instanceof Error ? error.message : String(error)],
                warnings: [],
            });
        }
    }
    return {
        target,
        skillsDir: options.skillsDir,
        total: skills.length,
        valid: skills.filter((skill) => skill.ok).length,
        skills,
    };
}
/** Compare each canonical skill (compiled for Claude Code) to the legacy tree. */
export async function runSync(options) {
    const dirs = options.canonicalDirs ?? (options.canonicalDir ? [options.canonicalDir] : []);
    const skills = [];
    // Skip-and-collect (D1): a broken canonical skill must not hide every other pack.
    const failures = [];
    for (const canonicalDir of dirs) {
        for (const id of discoverSkillIds(canonicalDir)) {
            let skill;
            try {
                skill = loadSkillFromDir(canonicalDir, id);
            }
            catch (error) {
                failures.push(describeSkillLoadFailure(canonicalDir, id, error));
                continue;
            }
            const emit = await claudeAdapter.compile(skill, { targetRoot: options.projectRoot });
            let differ = false;
            let missing = false;
            for (const file of emit.files) {
                const absolutePath = join(options.projectRoot, file.path);
                if (!existsSync(absolutePath))
                    missing = true;
                else if (readFileSync(absolutePath, 'utf-8') !== file.content)
                    differ = true;
            }
            const status = differ ? 'drift' : missing ? 'missing' : 'in-sync';
            let written = [];
            const shouldWrite = status === 'missing' || (status === 'drift' && options.force === true);
            if (options.dryRun !== true && shouldWrite) {
                written = applyEmitResult(emit, {
                    targetRoot: options.projectRoot,
                    force: status === 'drift',
                }).written;
            }
            skills.push({ id, status, written });
        }
    }
    return {
        dryRun: options.dryRun === true,
        skills,
        failures,
        summary: {
            total: skills.length,
            inSync: skills.filter((skill) => skill.status === 'in-sync').length,
            missing: skills.filter((skill) => skill.status === 'missing').length,
            drift: skills.filter((skill) => skill.status === 'drift').length,
        },
    };
}
/** Detect keysarium/bto/etc installations and report migration path. */
export function runMigrate(options) {
    const root = options.projectRoot;
    const detections = [];
    // Check for known manifests
    const manifests = ['.keysarium.json', '.bto.json', '.analyst-manual.json', '.edu-site.json', '.transcript-site.json', '.feature-adr.json'];
    for (const manifest of manifests) {
        const path = join(root, manifest);
        if (existsSync(path)) {
            try {
                const data = JSON.parse(readFileSync(path, 'utf-8'));
                detections.push({
                    manifest,
                    version: data.version ?? 'unknown',
                    components: data.components ?? [],
                    fileCount: Array.isArray(data.files) ? data.files.length : 0,
                });
            }
            catch {
                detections.push({ manifest, version: 'parse-error', components: [], fileCount: 0 });
            }
        }
    }
    // Count skills in .claude/skills
    const skillsDir = join(root, '.claude', 'skills');
    let skillsFound = 0;
    if (existsSync(skillsDir)) {
        skillsFound = readdirSync(skillsDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && existsSync(join(skillsDir, e.name, 'SKILL.md')))
            .length;
    }
    let recommendation;
    if (detections.length === 0) {
        recommendation = 'No legacy installations detected. Use `dz init` to install skills.';
    }
    else if (detections.length === 1) {
        const d = detections[0];
        recommendation = `Found ${d.manifest} (v${d.version}, ${d.fileCount} files). Skills are already in .claude/skills/ — use \`dz sync\` to manage them canonically.`;
    }
    else {
        recommendation = `Found ${detections.length} legacy manifests. Skills coexist in .claude/skills/. Run \`dz doctor\` to verify health, then \`dz sync\` to adopt canonical management.`;
    }
    return { projectRoot: root, detections, skillsFound, recommendation };
}
/** Report environment diagnostics for the harness. */
export async function runDoctor(options) {
    const checks = [];
    const root = options.projectRoot;
    // 1. Node version
    const nodeMajor = Number(process.versions.node.split('.')[0] ?? '0');
    checks.push({ name: 'node >= 20', ok: nodeMajor >= 20, detail: `node ${process.version}` });
    // 2/3. MONOREPO-ONLY checks, gated on PROJECT KIND (backlog fcf29728: in a consumer project
    // skills-meta and the 10 adapters are not there and MUST not be — both checks were red forever
    // and dz doctor could never exit 0 outside this repository, a standing false BLOCK for any
    // consumer CI). Kind detection is structural: a checkout that carries packages/@dzhechkov IS the
    // monorepo (or a fork of it) and owes itself these checks; anything else is a consumer project
    // and gets a NAMED skip — a skip, never a silent pass and never a fail.
    const isMonorepo = existsSync(join(root, 'packages', '@dzhechkov'));
    checks.push({
        name: '.claude/skills present',
        ok: existsSync(join(root, '.claude', 'skills')),
        detail: '.claude/skills',
    });
    if (isMonorepo) {
        checks.push({
            name: 'packages/@dzhechkov/skills-meta present',
            ok: existsSync(join(root, 'packages/@dzhechkov/skills-meta')),
            detail: 'packages/@dzhechkov/skills-meta',
        });
        const adapters = ['adapter-claude', 'adapter-codex', 'adapter-opencode', 'adapter-hermes', 'adapter-openclaude', 'adapter-copilot', 'adapter-agents-md', 'adapter-cursor', 'adapter-gemini', 'adapter-windsurf'];
        const foundAdapters = adapters.filter((a) => existsSync(join(root, 'packages/@dzhechkov', a)));
        checks.push({
            name: 'adapters present',
            ok: foundAdapters.length === adapters.length,
            detail: `${foundAdapters.length}/${adapters.length} adapters found`,
        });
    }
    else {
        checks.push({
            name: 'monorepo checks',
            ok: true,
            detail: 'consumer project (no packages/@dzhechkov) — skills-meta/adapter checks are the MONOREPO\'s own duty and are skipped here by kind, not by silence',
        });
    }
    // 4. Package version consistency
    const pkgsDir = join(root, 'packages/@dzhechkov');
    if (existsSync(pkgsDir)) {
        const versions = new Map();
        let consistent = true;
        let detail = '';
        try {
            const entries = readdirSync(pkgsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                const pjPath = join(pkgsDir, entry.name, 'package.json');
                if (!existsSync(pjPath))
                    continue;
                const pj = JSON.parse(readFileSync(pjPath, 'utf-8'));
                if (pj.version)
                    versions.set(entry.name, pj.version);
            }
            const uniqueVersions = new Set(versions.values());
            detail = `${versions.size} packages, ${uniqueVersions.size} unique version(s)`;
            // Warn if more than 10 unique versions (some variation is expected in a large monorepo)
            if (uniqueVersions.size > 10) {
                consistent = false;
                detail += ' — high version divergence';
            }
        }
        catch {
            consistent = false;
            detail = 'failed to read package versions';
        }
        checks.push({ name: 'package versions', ok: consistent, detail });
    }
    // 5. Config lint (.agentic-qe/config.yaml)
    const configPath = join(root, '.agentic-qe', 'config.yaml');
    if (existsSync(configPath)) {
        try {
            const { parse: parseYaml } = await import('yaml');
            const content = readFileSync(configPath, 'utf-8');
            const parsed = parseYaml(content);
            // agentic-qe v3 writes `project:` as a MAPPING (name/root/type); older configs used a plain
            // string. The check accepted only the string form, so a perfectly valid v3 config reported
            // "missing project field" — the check was wrong about the real shape, not the config.
            const rawProject = parsed?.project;
            const projectName = typeof rawProject === 'string'
                ? rawProject
                : rawProject && typeof rawProject === 'object' && typeof rawProject.name === 'string'
                    ? rawProject.name
                    : null;
            checks.push({
                name: 'aqe config valid',
                ok: projectName !== null,
                detail: projectName !== null ? `project: ${projectName}` : 'missing project field (expected a name string or a {name} mapping)',
            });
        }
        catch (error) {
            checks.push({
                name: 'aqe config valid',
                ok: false,
                detail: `parse error: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }
    else {
        checks.push({ name: 'aqe config valid', ok: true, detail: 'no .agentic-qe/config.yaml (optional)' });
    }
    // 6. SQLite memory backend probe
    try {
        const { createRequire } = await import('node:module');
        const req = createRequire(join(root, 'package.json'));
        req.resolve('better-sqlite3');
        checks.push({ name: 'sqlite backend', ok: true, detail: 'better-sqlite3 available' });
    }
    catch {
        checks.push({ name: 'sqlite backend', ok: true, detail: 'better-sqlite3 not installed (JSON fallback)' });
    }
    // 7. Skills directory health
    const skillsDir = join(root, '.claude', 'skills');
    if (existsSync(skillsDir)) {
        // A DOT-prefixed directory is not a skill. `.claude/skills/.validation` holds the shared schemas
        // and eval templates the whole tree references (30+ eval files name its path), and it has no
        // SKILL.md because it is not invokable. Counting it made this check permanently red at 270/271 —
        // and TWO earlier investigations reached that same conclusion and left the checker alone
        // (features/autonomous-2026-07-27/health-sweep.md, features/audit-2026-06-12). A red that three
        // people diagnose and nobody fixes is a red that has stopped being read.
        const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith('.'));
        const withSkillMd = skillDirs.filter((e) => existsSync(join(skillsDir, e.name, 'SKILL.md')));
        // A visible dir with NO SKILL.md is almost never a broken skill — it is a FOREIGN directory
        // (measured: a 102-file health-advisor/ residue from an old `ha init` read as «27/28», which a
        // human parses as "one skill is broken" and goes fixing a skill; the true cure is cleanup).
        // Name the offenders and say which treatment applies (HA-improvements 2026-08, b5ba7b4a).
        const foreign = skillDirs.filter((e) => !existsSync(join(skillsDir, e.name, 'SKILL.md'))).map((e) => e.name);
        checks.push({
            name: 'skills health',
            ok: withSkillMd.length === skillDirs.length,
            detail: foreign.length === 0
                ? `${withSkillMd.length}/${skillDirs.length} skill dirs have SKILL.md`
                : `${withSkillMd.length}/${skillDirs.length} skill dirs have SKILL.md — ${foreign.length} FOREIGN dir(s) in the skills root (not broken skills; the cure is cleanup, not repair): ${foreign.slice(0, 5).join(', ')}${foreign.length > 5 ? ', …' : ''}`,
        });
    }
    // 8. agentdb brownfield health (gap G2) — only when agentdb artifacts are present, to keep
    // non-agentdb projects noise-free. Detects installs from BEFORE the real-write fix.
    const settingsPath = join(root, '.claude', 'settings.json');
    const settingsRaw = existsSync(settingsPath) ? readFileSync(settingsPath, 'utf-8') : '';
    if (settingsRaw.includes('agentdb add')) {
        checks.push({
            name: 'agentdb hooks',
            ok: false,
            detail: 'LEGACY broken hooks call non-existent `agentdb add` (they never wrote anything) — re-run: dz setup --target <t> --memory agentdb',
        });
    }
    if (existsSync(join(root, '.dz', 'memory.rvf'))) {
        checks.push({
            name: 'agentdb store',
            ok: false,
            detail: 'orphan .dz/memory.rvf placeholder from an old setup (nothing reads it) — delete it; the real store is .dz/agentdb.db',
        });
    }
    const legacyMcp = join(root, '.claude', 'mcp.json');
    if (existsSync(legacyMcp) && readFileSync(legacyMcp, 'utf-8').includes('agentdb')) {
        checks.push({
            name: 'agentdb mcp location',
            ok: false,
            detail: '.claude/mcp.json is NOT loaded by Claude Code — re-run dz setup to register agentdb in .mcp.json (project root)',
        });
    }
    // 8x. agentdb MCP/writer store SEPARATION (ADR-001 agentdb-setup-shared-store-fix, 2026-08-26).
    // A shared store is a measured data-loss path (2026-07-09: 5 of 20 samples zero bytes, 4 torn) —
    // the same predicate setup.ts's `agentdb wiring` step uses, imported, never re-implemented.
    // Deliberately OUTSIDE the `.dz/agentdb-writer.mjs` branch below: a registration can be wrong
    // before any writer is deployed, and that is exactly when it is cheapest to fix.
    const mcpConfigPath = join(root, '.mcp.json');
    if (existsSync(mcpConfigPath)) {
        try {
            const { agentdbStoreSeparationProblem } = await import('./setup.js');
            const mcp = JSON.parse(readFileSync(mcpConfigPath, 'utf-8'));
            const pinned = mcp.mcpServers?.['agentdb']?.env?.['AGENTDB_PATH'];
            // Only speak when an agentdb server is actually registered — a project without one keeps
            // its doctor output noise-free, exactly as before this check existed.
            // A REGISTERED agentdb server with NO AGENTDB_PATH is not a quiet project — it is the
            // protection DELETED. Without the pin the server resolves its store from its own cwd, which is
            // exactly the unpinned arrangement that produced an empty orphan store in this repo. The first
            // version of this check skipped that case, so removing the guard produced no finding at all
            // (cross-family QE, Codex gpt-5.6-sol). Silence on a deleted protection is the failure mode
            // this whole feature exists to end.
            const registered = mcp.mcpServers?.['agentdb'] !== undefined;
            if (registered && pinned === undefined) {
                checks.push({
                    name: 'agentdb store separation',
                    ok: false,
                    detail: 'an agentdb MCP server is registered with NO AGENTDB_PATH — it will resolve its store from its own cwd, so nothing guarantees it stays off the session-hook writer store; re-run dz setup --memory agentdb',
                });
            }
            else if (pinned !== undefined) {
                const problem = agentdbStoreSeparationProblem(root, pinned);
                if (problem)
                    checks.push({ name: 'agentdb store separation', ok: false, detail: problem });
            }
        }
        catch { /* doctor never throws on a diagnostic */ }
    }
    // Flat dz hook entries (dz ≤0.3.43 emitted `{type,command}` without the matcher-group wrapper)
    // are silently IGNORED by Claude Code — the writer never fires. Detect and point at the fix.
    try {
        const { commandsOf } = await import('./setup.js');
        const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf-8'));
        const flatDz = Object.values(settings.hooks ?? {}).flat().filter((entry) => !Array.isArray(entry?.hooks) &&
            commandsOf(entry).some((cmd) => cmd.includes('agentdb-writer.mjs') || cmd.includes('sessions.jsonl')));
        if (flatDz.length > 0) {
            checks.push({
                name: 'agentdb hooks shape',
                ok: false,
                detail: `${flatDz.length} dz hook entr(ies) use the legacy flat shape Claude Code ignores (writer never fires) — re-run dz setup to migrate`,
            });
        }
    }
    catch { /* settings absent/unreadable — covered by other checks */ }
    // CODEX APPLY-LEG (AM-19, fact CORRECTED by AM-30). This block is deliberately OUTSIDE the
    // `existsSync(writerPath)` guard below. MEASURED: the Claude apply-leg check has THREE
    // preconditions, not two — the `.claude/settings.json` text check is NESTED inside
    // `if (existsSync(join(root,'.dz','agentdb-writer.mjs')))`. A Codex-only machine has no writer
    // file and no `.claude/settings.json`, so a Codex branch added *in place* would report nothing at
    // all — reproducing the exact 19-day dark-leg shape this check exists to kill.
    //
    // A WIRED-BUT-SILENT leg is an explicit non-OK row, never an absent one.
    try {
        const { codexHooksPaths: codexPaths, parseCodexHookManifest: parseCodexManifest } = await import('./codex-hooks.js');
        const codexHome = process.env['CODEX_HOME'] ?? join(homedir(), '.codex');
        const manifestPath = codexPaths(codexHome).manifest;
        if (existsSync(manifestPath)) {
            const manifest = parseCodexManifest(readFileSync(manifestPath, 'utf-8'));
            const claimsRecall = manifest?.entries.some((e) => e.id === 'codex-recall') === true;
            if (claimsRecall) {
                const usageLog = join(root, '.dz', 'recall-usage.jsonl');
                const { newest, hasCodexRow } = newestRecallUsageRuntime(usageLog);
                const fresh = newest !== undefined && Date.now() - Date.parse(newest) < 14 * 24 * 60 * 60 * 1000;
                // In a CONSUMER project the machine-global hook is wired but a FRESH project has zero rows
                // by construction — dead-leg and new-project are indistinguishable there, and a permanent
                // red on arrival is a false CI block (fcf29728). The row degrades to an ADVISORY (ok:true,
                // wording intact) outside the monorepo; in the monorepo it stays the hard row that killed
                // the 19-day dark leg.
                const applyLegOk = hasCodexRow && fresh;
                checks.push({
                    name: 'codex apply-leg (recall hook)',
                    ok: isMonorepo ? applyLegOk : true,
                    detail: (isMonorepo || applyLegOk ? '' : 'advisory (consumer project — a fresh store has no rows by construction): ') + (hasCodexRow
                        ? fresh
                            ? `codex recall rows present, newest ${newest}`
                            : `codex recall hook is WIRED but SILENT: newest recall-usage row is ${String(newest)} — the entry may have lost hook trust (re-run dz hooks-sync --target codex --verify)`
                        : 'codex recall hook is WIRED but has NEVER written a row — a dead leg looks exactly like a correctly-silent one, so this is reported non-OK until one lands'),
                });
            }
        }
    }
    catch { /* doctor never throws on a diagnostic */ }
    const writerPath = join(root, '.dz', 'agentdb-writer.mjs');
    if (existsSync(writerPath)) {
        const { writerVersionOf, AGENTDB_WRITER_VERSION } = await import('./setup.js');
        const deployed = writerVersionOf(readFileSync(writerPath, 'utf-8'));
        if (deployed < AGENTDB_WRITER_VERSION) {
            checks.push({
                name: 'agentdb writer version',
                ok: false,
                detail: `deployed writer v${deployed} < current v${AGENTDB_WRITER_VERSION} — re-run dz setup to upgrade (no --force needed)`,
            });
        }
        // APPLY-LEG LIVENESS (2026-07-28): the recall hook injects lessons only while the embed daemon's
        // socket is alive, and the daemon is started at SessionStart only — when it died mid-way through a
        // long-lived session the whole apply leg went silently dark for 19 days (MEASURED:
        // recall-usage.jsonl last record 2026-07-09 with the socket absent). A dead leg must be VISIBLE.
        try {
            const settingsPath = join(root, '.claude', 'settings.json');
            if (existsSync(settingsPath)) {
                const settingsText = readFileSync(settingsPath, 'utf-8');
                const applyLegWired = settingsText.includes('recall-hook.cjs') && settingsText.includes('dz-embed-daemon.mjs');
                if (applyLegWired) {
                    const sockAlive = existsSync(join(root, '.dz', 'embed.sock'));
                    checks.push({
                        name: 'apply-leg alive (embed daemon)',
                        ok: sockAlive,
                        detail: sockAlive
                            ? 'embed.sock present — recall injection can run'
                            : 'embed.sock ABSENT: the recall hook is wired but cannot inject (the hook self-heals on the next prompt; a persistent absence means the daemon cannot start)',
                    });
                }
            }
        }
        catch {
            /* doctor never throws on a diagnostic */
        }
        // Version drift between the local agentdb copy and the .mcp.json pin (gap G7)
        try {
            const localVer = JSON.parse(readFileSync(join(root, 'node_modules', 'agentdb', 'package.json'), 'utf-8')).version;
            const mcp = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf-8'));
            const pinned = mcp.mcpServers?.['agentdb']?.args?.[0];
            if (localVer && pinned && pinned !== `agentdb@${localVer}`) {
                checks.push({
                    name: 'agentdb version drift',
                    ok: false,
                    detail: `local agentdb@${localVer} != MCP pin ${pinned} (alpha schema drift risk) — re-run dz setup`,
                });
            }
        }
        catch { /* either side absent — covered by other checks */ }
    }
    // 8a-bis. DEV-TREE SKILL LAG — advisory, never blocking.
    //
    // The `no-skill-drift` HARD rule sweeps scope 'installs', which DELIBERATELY excludes the
    // hand-edited `.claude/skills/` dev tree: those copies are allowed to lag a published bump, and
    // holding them to byte-identity would make the gate red-on-arrival. That reasoning is sound and
    // is NOT changed here.
    //
    // What was missing is that nobody SAW the lag. MEASURED 2026-08-26: `.claude/skills/idea2prd-manual`
    // was a month behind its package copy — missing the entire v3 modernization that landed in
    // 0.1.3/0.1.4 — and `.claude/skills/observability` had never received the 2026-08-24 tightening of
    // its dashboard gate. Those dev copies are exactly what the agents in THIS repo read, so "legitimately
    // lagging" quietly meant "the agents here have been running a stale skill for a month". A narrow
    // gate plus zero visibility is how a lag becomes a silent regression.
    //
    // So: report the DIFFERENCE between the wide sweep and the gated one — i.e. only skills whose sole
    // divergence is the dev tree. Never `ok:false` for a lag alone; the HARD rule keeps owning what
    // blocks. `dz drift-check --all` remains the detailed view.
    try {
        const allowlist = (() => {
            const ap = join(root, '.dz', 'drift-allowlist.json');
            if (!existsSync(ap))
                return [];
            try {
                const raw = JSON.parse(readFileSync(ap, 'utf8'));
                const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.skills) ? raw.skills : [];
                return arr.map((e) => (typeof e === 'string' ? e : e?.name)).filter((n) => typeof n === 'string' && n.length > 0);
            }
            catch {
                return [];
            }
        })();
        const wide = sweepSkillDrift(root, { scope: 'all', allowlist });
        const gated = new Set(sweepSkillDrift(root, { scope: 'installs', allowlist }).drifted.map((d) => d.name));
        // Only what the HARD rule does NOT already own: these differ ONLY because of the dev tree.
        const devOnly = wide.drifted.filter((d) => !gated.has(d.name));
        if (devOnly.length > 0) {
            const names = devOnly.slice(0, 5).map((d) => `${d.name} (${d.driftFiles} file(s))`).join(', ');
            checks.push({
                name: 'dev-tree skill lag',
                ok: true, // ADVISORY: the gated scope decides what blocks; this only makes the lag visible.
                detail: `${devOnly.length} skill(s) differ ONLY in the .claude/skills dev tree: ${names}${devOnly.length > 5 ? ', …' : ''} — a dev copy may legitimately lag a published bump, but it is what the agents here READ, so a month-old copy is a silent regression. Inspect with: dz drift-check --all`,
            });
        }
    }
    catch { /* doctor never throws on a diagnostic */ }
    // 8b. EVIDENCE-CHAIN INTEGRITY (feature event-chain, ADR-001). `.dz/recall-usage.jsonl` and
    // `.dz/guard-audit.jsonl` are what `dz compounding` and `dz guard promote` decide on; a rewrite
    // that loses or duplicates a record there is a wrong verdict with no symptom. Deliberately OUTSIDE
    // the agentdb-writer branch — the evidence base exists whether or not that writer is deployed.
    // Silent when a log is absent or has never been chained: an unchained file is legal (FR-5), not a
    // fault, and reporting it would train the reader to ignore this line.
    try {
        const { verifyEventChainText, classifyChainDefects, EVENT_CHAIN_SCOPE, CHAINED_JOURNALS } = await import('./event-chain.js');
        // W0-chain (bc4ee35c): enumerated from THE registry, never from a list kept here. The inline
        // array this replaces is why a journal could be given a chain and still be checked by nobody —
        // the mechanism present, the coverage absent, and no red anywhere to say so.
        for (const journal of CHAINED_JOURNALS) {
            const p = join(root, journal.rel);
            if (!existsSync(p))
                continue;
            const text = readFileSync(p, 'utf-8');
            const v = verifyEventChainText(text);
            if (v.chained === 0 || v.ok)
                continue;
            const total = text.split('\n').filter((l) => l.trim() !== '').length;
            const age = classifyChainDefects(v, total);
            const named = `${v.defects.length} defect(s): ${v.defects.slice(0, 3).map((d) => `${d.kind}@L${d.line}`).join(', ')}`;
            // A break that an unbroken run has already outlived is not a reason to distrust today's
            // records. Reporting both alike made this line PERMANENTLY red for four weeks — MEASURED
            // 2026-08-24: every defect in both logs is historical, with 998 of 1138 rows in one and 88 of
            // 426 in the other forming an unbroken run after the last of them. The verdict was true of the
            // file and false of the present, and a red nobody can act on is a red nobody reads.
            if (age.inRun.length === 0 && age.runRecords > 0) {
                checks.push({
                    name: `evidence chain (${journal.rel})`,
                    ok: true,
                    // The COUNT carries the meaning, and is printed first for that reason: "1 record forms an
                    // unbroken run" is true and says almost nothing, while 998 says a great deal. Naming the
                    // position without the count would overclaim on the reader's behalf (cross-family review,
                    // codex gpt-5.6-sol, 2026-08-24).
                    detail: `${named} — all BEFORE the current run: the last ${age.runRecords} record(s), from L${age.runFrom}, are unbroken, ` +
                        `so verdicts over those ${age.runRecords} are sound. The break itself cannot be un-happened. Scope: ${EVENT_CHAIN_SCOPE}`,
                });
                continue;
            }
            checks.push({
                name: `evidence chain (${journal.rel})`,
                ok: false,
                detail: `${named} — with NO sound records after them: learning verdicts computed from this log are unsafe. Scope: ${EVENT_CHAIN_SCOPE}`,
            });
        }
    }
    catch {
        /* doctor never throws on a diagnostic */
    }
    // 9. Vector-tier mirror divergence (dz-rvf-vector-bridge FR-2/ADR R4). INFORMATIONAL, never an
    // error exit: lexical is the source of truth and `dz consolidate` backfills the mirror. Per
    // Constraint 7 (QR-10) the line reports BOTH counts so a diverged mirror is not misdiagnosed
    // as store corruption (check the store-health lines above first). Silent when in sync or when
    // no engine is installed — a lexical-only project stays noise-free.
    try {
        const { vectorTierStatus } = await import('./vector-tier.js');
        const vs = await vectorTierStatus(root);
        if (vs.available && vs.mirrored !== undefined && (vs.mirrored < vs.lexicalMirrorable || vs.pending > 0)) {
            checks.push({
                name: 'vector mirror',
                ok: true,
                detail: `lexical ${vs.lexicalMirrorable} vs mirrored ${vs.mirrored}${vs.pending > 0 ? ` (+${vs.pending} pending)` : ''} — run dz consolidate to backfill`,
            });
        }
    }
    catch { /* advisory only — the vector tier must never fail doctor */ }
    // 10. AQE store integrity (observability item 3/5). `.agentic-qe/integrity-log.jsonl` is the
    // best-attested log in this repo — a UserPromptSubmit hook runs a REAL `PRAGMA quick_check`,
    // stats the file and scans /proc for the process holding it, so unlike almost every other store
    // here it is instrument-witnessed rather than self-reported. It had 1508 rows and ZERO readers
    // (MEASURED 2026-08-25): on that day a live corruption was noticed from a prompt banner, while
    // fourteen recorded corruption events and their on-disk `memory.db.corrupt-*` artifacts sat
    // unread. A log nobody reads is not observability. This turns it into a health signal.
    //
    // Deliberately NOT an error exit. The reading is a HISTORY, and a corruption already recovered
    // must not redden doctor forever; the LAST verdict decides ok, the history is reported beside it.
    try {
        const logPath = join(root, '.agentic-qe', 'integrity-log.jsonl');
        if (existsSync(logPath)) {
            const rows = [];
            for (const line of readFileSync(logPath, 'utf-8').split('\n')) {
                const t = line.trim();
                if (t === '')
                    continue;
                try {
                    rows.push(JSON.parse(t));
                }
                catch { /* a torn line is not a verdict */ }
            }
            const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
            if (last !== undefined) {
                const bad = rows.filter((r) => r.check !== 'ok').length;
                const lastOk = last.check === 'ok';
                const when = typeof last.ts === 'string' ? last.ts : 'unknown time';
                const err = typeof last.error === 'string' && last.error !== '' ? ` (${last.error})` : '';
                checks.push({
                    name: 'aqe store integrity',
                    ok: lastOk,
                    detail: lastOk
                        ? `last quick_check ok at ${when}; ${bad} corruption event(s) recorded in ${rows.length} checks`
                        : `last quick_check FAILED at ${when}${err} — ${bad} of ${rows.length} checks failed; back up .agentic-qe/memory.db before any repair`,
                });
            }
        }
    }
    catch { /* advisory only — a diagnostic never throws */ }
    return { node: process.version, checks, ok: checks.every((check) => check.ok) };
}
/** The one place that decides WHERE `hooks.json` lives. Exported (feature qe-bridge-claude) so the
 * CLI can take the `codex-hooks` advisory lock BESIDE that registry — a lock in this repo's `.dz/`
 * would not serialize a writer operating from another checkout. */
export function resolveCodexHome(explicit) {
    if (typeof explicit === 'string' && explicit !== '')
        return explicit;
    const env = process.env['CODEX_HOME'];
    if (typeof env === 'string' && env !== '')
        return env;
    return join(homedir(), '.codex');
}
/** `codex --version` → `codex-cli 0.147.0`. `null` when the binary is absent or silent. */
function probeCodexVersion() {
    try {
        const out = execFileSync('codex', ['--version'], { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] });
        const trimmed = out.trim();
        return trimmed === '' ? null : trimmed;
    }
    catch {
        return null;
    }
}
/**
 * Run the emitted command THE WAY THE RUNTIME WILL — through `$SHELL -lc` (AM-32 / G-L).
 *
 * MEASURED: the codex hook runner spawns via `$SHELL -lc`, and under nvm/asdf/volta a
 * non-interactive login shell frequently lacks `node`. The helper then exits **127**, which the
 * runtime reads as **ALLOW** — a blocking guard that is silently dead in the fail-open direction,
 * with the helper's own self-failure note unable to fire because the process never started.
 * Grading on file presence would call that "installed".
 */
export function probeHookLiveness(command, payload) {
    const shell = process.env['SHELL'] ?? '/bin/sh';
    try {
        const res = spawnSync(shell, ['-lc', command], {
            input: payload,
            encoding: 'utf8',
            timeout: 20_000,
            env: { ...process.env, DZ_HOOK_LIVENESS_PROBE: '1' },
        });
        return { status: res.status, stderr: res.stderr ?? '' };
    }
    catch (err) {
        return { status: null, stderr: String(err?.message ?? err) };
    }
}
/** Keep the newest N backups; older ones are litter in the user's home (AM-35b). */
function pruneBackups(dir, prefix, keep) {
    try {
        const found = readdirSync(dir).filter((f) => f.startsWith(prefix)).sort();
        for (const stale of found.slice(0, Math.max(0, found.length - keep))) {
            rmSync(join(dir, stale), { force: true });
        }
    }
    catch { /* pruning is hygiene, never a failure */ }
}
/**
 * Install, verify or remove the dz Codex hooks.
 *
 * Order is load-bearing: every REFUSAL happens before any `mkdir` or write, so a machine without
 * codex, or with an unparseable registry, is left byte-untouched (AM-35a).
 */
/**
 * Should this run PROVE the guard fires, and with what?
 *
 * `liveness: false` is the offline test seam and disables every live call, the probe included.
 * `verify: false` is the USER saying "do not probe" — a deliberate refusal to measure, which is
 * reported as inconclusive rather than as success (finding 1).
 */
function verifyPlan(options) {
    if (options.liveness === false)
        return { run: false, declined: false };
    if (options.verify === false)
        return { run: false, declined: true };
    return { run: true, declined: false };
}
/**
 * Run the live probe (or record, loudly, why it did not run).
 *
 * A refusal to measure and a measurement are different facts and are reported differently: a
 * declined verify never reaches exit 0, and a probe that could not be driven at all is
 * `inconclusive`, never `ready` (finding 1).
 */
function verifyStage(options, ctx) {
    const plan = verifyPlan(options);
    if (!plan.run) {
        if (plan.declined) {
            ctx.warnings.push('live verification SKIPPED (--no-verify): the entries are installed and trusted, but nothing here witnessed the guard block a command. This is NOT a ready state.');
        }
        return { result: null, declined: plan.declined };
    }
    const probe = options.probe ?? runCodexVetoProbe;
    let run;
    try {
        run = probe({
            paths: ctx.paths,
            ...(options.project !== undefined ? { project: options.project } : {}),
            ...(options.probeModel ?? process.env['DZ_CODEX_PROBE_MODEL'] ? { model: options.probeModel ?? process.env['DZ_CODEX_PROBE_MODEL'] } : {}),
            ...(ctx.trustStatus !== undefined ? { trustStatus: ctx.trustStatus } : {}),
            ...(ctx.recordedCodexVersion !== undefined ? { recordedCodexVersion: ctx.recordedCodexVersion } : {}),
            probedCodexVersion: ctx.probedCodexVersion,
        });
    }
    catch (err) {
        // A probe that THREW measured nothing. Inconclusive is the honest verdict; a thrown probe that
        // fell through to the install state would be the finding all over again.
        ctx.warnings.push(`the live veto probe could not be driven: ${String(err?.message ?? err)}`);
        return {
            result: { verdict: 'inconclusive', trust: 'unknown', reason: `the live veto probe could not be driven: ${String(err?.message ?? err)}` },
            declined: false,
        };
    }
    for (const note of run.notes)
        ctx.warnings.push(`veto probe: ${note}`);
    if (!isReadyVerdict(run.result)) {
        ctx.warnings.push(`live veto probe: ${run.result.verdict} — ${run.result.reason}`);
    }
    return { result: run.result, declined: false };
}
export function runSyncCodexHooks(options = {}) {
    const codexHome = resolveCodexHome(options.codexHome);
    const paths = codexHooksPaths(codexHome);
    const warnings = [];
    const errors = [];
    const writes = [];
    const now = options.now ?? new Date().toISOString();
    const nodePath = options.nodePath ?? process.execPath;
    const base = {
        codexHome,
        registryPath: paths.registry,
        installed: false,
        executable: false,
        written: false,
        removed: 0,
        foreignPreserved: 0,
        unattributable: 0,
        drift: [],
        trust: 'unknown',
        codexVersion: null,
        writes: [],
        verify: null,
        verified: false,
        ready: false,
    };
    // (1) REFUSE when codex is not installed — dz does not create user-global config for a runtime
    //     that is not there (AM-35a). `--check` is allowed to answer, but it writes nothing anyway.
    const codexVersion = options.codexVersion === undefined ? probeCodexVersion() : options.codexVersion;
    if (codexVersion === null) {
        return { ...base, exitCode: 3, warnings, errors: ['no `codex` binary on PATH — nothing was written'] };
    }
    // (2) REFUSE an unquotable CODEX_HOME rather than emit a broken `$SHELL -lc` string (AM-35d).
    let entries;
    try {
        entries = buildManagedEntries({ nodePath, paths });
    }
    catch (err) {
        return { ...base, codexVersion, exitCode: 1, warnings, errors: [String(err.message)] };
    }
    const criticalSection = options.criticalSection ?? ((fn) => fn());
    const currentText = existsSync(paths.registry) ? readFileSync(paths.registry, 'utf8') : undefined;
    const manifest = existsSync(paths.manifest) ? parseCodexHookManifest(readFileSync(paths.manifest, 'utf8')) : undefined;
    // (3) --remove: delete only what the manifest proves is ours.
    if (options.remove === true) {
        // TRANSACTION: re-read under the lock, plan from THOSE bytes, write. A plan computed outside the
        // guarded window is a plan against bytes another writer may already have replaced.
        const removal = criticalSection(() => {
            const freshText = existsSync(paths.registry) ? readFileSync(paths.registry, 'utf8') : undefined;
            const freshManifest = existsSync(paths.manifest) ? parseCodexHookManifest(readFileSync(paths.manifest, 'utf8')) : undefined;
            const planned = removeCodexHooks(freshText, freshManifest);
            if (planned.ok && planned.result.changed) {
                backupRegistry(paths, freshText, now, writes);
                atomicWrite(paths.registry, planned.result.text);
                writes.push(paths.registry);
            }
            // R3-5: the helpers and the manifest are part of the SAME shared state as the registry. Round
            // 2 deleted them after the lock was released, so a concurrent installer could observe (and
            // rebuild against) a registry that had already been emptied — or leave a manifest describing
            // entries that no longer exist. One decision, one critical section.
            if (planned.ok) {
                for (const p of [paths.vetoHelper, paths.recallHelper, paths.manifest])
                    rmSync(p, { force: true });
            }
            return planned;
        });
        if (!removal.ok)
            return { ...base, codexVersion, exitCode: 1, warnings, errors: [removal.error] };
        return {
            ...base,
            codexVersion,
            written: removal.result.changed,
            removed: removal.result.removed,
            unattributable: removal.result.unattributable,
            exitCode: 0,
            warnings: removal.result.unattributable > 0
                ? [`${removal.result.unattributable} entr(ies) resemble dz hooks but are not manifest-attributed — KEPT, remove them by hand if you want them gone`]
                : warnings,
            errors,
            writes,
        };
    }
    // (4) --check: recompute from the FILE and FIRE the helper. Writes nothing, and stays SILENT in
    //     a home that never opted in (the leg-1 F12 lesson).
    if (options.check === true) {
        const drift = diffCodexHooks(currentText, entries, manifest);
        const live = drift.installed && options.liveness !== false ? probeHookLiveness(entries[0].command, ALLOWED_PROBE_PAYLOAD) : { status: null, stderr: '' };
        const executable = drift.installed && (options.liveness === false || live.status === 0 || live.status === 2);
        // `--check` must report the TRUST axis too. Without it the report said `installed && executable`
        // with `trust: 'unknown'`, and the CLI printed a success word for it — the exact G-G/AM-17
        // failure ("no success word without armed AND trusted"), reached through the read-only path.
        const listed = drift.installed && options.liveness !== false ? listCodexHooks(codexHome) : null;
        const own = listed === null ? [] : selectOwnHookMetadata(listed, entries, { registryPath: paths.registry });
        const checkTrust = listed === null
            ? 'unknown'
            : own.length === entries.length && own.every((o) => o.meta.trustStatus === 'trusted' || o.meta.trustStatus === 'managed')
                ? 'trusted'
                : 'trust-pending';
        if (drift.installed && !executable) {
            warnings.push(`the registry entry exists but exits ${String(live.status)} through \`$SHELL -lc\` — a hook that cannot execute is NOT armed`);
        }
        // `--check` is the READ-ONLY verify: it recomputes state from the file AND, by default, proves
        // the guard actually fires. Only when the entries are present — a home that never opted in must
        // stay silent and must not spend a live model call (the leg-1 F12 lesson).
        const checkVerify = drift.installed && executable && checkTrust === 'trusted'
            ? verifyStage(options, {
                paths,
                probedCodexVersion: codexVersion,
                ...(manifest?.codexVersion !== undefined ? { recordedCodexVersion: manifest.codexVersion } : {}),
                ...(own[0] !== undefined ? { trustStatus: own[0].meta.trustStatus } : {}),
                warnings,
            })
            : { result: null, declined: verifyPlan(options).declined };
        const checkArmedState = drift.installed && executable && checkTrust === 'trusted';
        const checkExit = drift.installed
            ? checkArmedState
                ? checkVerify.result !== null
                    ? verifyExitCode(checkVerify.result)
                    : checkVerify.declined
                        ? 3
                        : 0
                : 1
            : manifest === undefined
                ? 0
                : 1;
        return {
            ...base,
            codexVersion,
            installed: drift.installed,
            executable,
            trust: checkTrust,
            foreignPreserved: drift.foreignPreserved,
            unattributable: drift.unattributable,
            drift: drift.drifted,
            verify: checkVerify.result,
            verified: checkVerify.result !== null && isReadyVerdict(checkVerify.result),
            ready: checkArmedState && checkVerify.result !== null && isReadyVerdict(checkVerify.result),
            // A home that never opted in is NOT a failure: `--check` is silent and exits 0 there (the
            // leg-1 F12 lesson — a check that chatters in every unrelated project trains its reader to
            // ignore it). Installed-but-broken is exit 1; installed-and-live-and-PROVEN is exit 0.
            exitCode: checkExit,
            warnings,
            errors,
            writes,
        };
    }
    // (5) Install. Parse-refuse BEFORE any mkdir (I1: an unparseable file must not be overwritten).
    //
    // TRANSACTION (round-2 C2): the read, the plan and the write happen inside the caller's critical
    // section — and the LIVE PROBES below deliberately do NOT. Holding a lock across a 300s model call
    // is how a holder outlives its own stale threshold; the probes mutate nothing shared, so they need
    // no exclusion.
    const planned = criticalSection(() => {
        const freshText = existsSync(paths.registry) ? readFileSync(paths.registry, 'utf8') : undefined;
        const freshManifest = existsSync(paths.manifest) ? parseCodexHookManifest(readFileSync(paths.manifest, 'utf8')) : undefined;
        const plan = planCodexHooks({ currentText: freshText, entries, manifest: freshManifest });
        if (!plan.ok)
            return { plan, wrote: false, freshText };
        mkdirSync(paths.helperDir, { recursive: true, mode: 0o700 });
        const helpers = generateCodexHelpers();
        writeHelperIfChanged(paths.vetoHelper, helpers.veto, writes);
        writeHelperIfChanged(paths.recallHelper, helpers.recall, writes);
        if (plan.plan.changed) {
            backupRegistry(paths, freshText, now, writes);
            atomicWrite(paths.registry, plan.plan.text);
            writes.push(paths.registry);
        }
        return { plan, wrote: plan.plan.changed, freshText };
    }).plan;
    if (!planned.ok) {
        return {
            ...base,
            codexVersion,
            exitCode: 1,
            warnings,
            errors: [
                planned.error,
                `heal by hand: fix ${paths.registry} (or move it aside) and re-run — dz refuses to overwrite a registry it cannot read, because foreign entries would be lost`,
            ],
        };
    }
    // (6) LIVENESS: exit 127 is ALLOW to the runtime, so it must never be graded as installed (G-L).
    const live = options.liveness === false ? { status: 0, stderr: '' } : probeHookLiveness(entries[0].command, ALLOWED_PROBE_PAYLOAD);
    const executable = live.status === 0 || live.status === 2;
    if (!executable) {
        warnings.push(`install liveness probe FAILED: the emitted command exited ${String(live.status)} through \`${process.env['SHELL'] ?? '/bin/sh'} -lc\` (127 = interpreter not found). The entry is registered but NOT armed; resolved interpreter: ${nodePath}`);
    }
    // (7) TRUST: arm the entry unattended by writing codex's own key+hash into config.toml.
    //     Both values are READ from `hooks/list` — `currentHash`'s preimage is internal to codex, so
    //     a computed hash would arm nothing while reading like success (M0 spike §4).
    const trustResult = options.liveness === false
        ? { trust: 'unknown', rows: [], warnings: [] }
        : armCodexHookTrust(paths, entries, writes);
    for (const w of trustResult.warnings)
        warnings.push(w);
    const trustKeys = {};
    for (const row of trustResult.rows)
        trustKeys[row.id] = row.key;
    const manifestText = `${JSON.stringify(buildCodexHookManifest({ entries, paths, codexVersion, writtenAt: now, nodePath, trustKeys }), null, 2)}\n`;
    // R3-5: the manifest is shared state — it is what `--remove` reads to decide which entries are
    // OURS — so its write is guarded too. It gets its own SHORT section rather than joining the
    // registry transaction, because its content depends on trust keys that only exist after the live
    // `hooks/list` query; folding it into the first section would drag that probe back under the lock,
    // which is exactly the CRITICAL the previous round closed. Two short sections, no long hold.
    //
    // R4-3: section two REVALIDATES before it writes. Round 3 wrote a manifest computed in section one,
    // which meant a remover that won the window in between had its removal partially undone: the
    // registry said "no dz entries", the manifest said "here are dz entries", and `--remove` reads the
    // manifest to decide what is ours. Recompute from what is on disk NOW; if our entries are gone,
    // write NOTHING and report the state honestly.
    const manifestOutcome = criticalSection(() => {
        const nowText = existsSync(paths.registry) ? readFileSync(paths.registry, 'utf8') : undefined;
        const nowDrift = diffCodexHooks(nowText, entries, undefined);
        if (!nowDrift.installed) {
            return { wrote: false, drift: nowDrift };
        }
        atomicWrite(paths.manifest, manifestText);
        writes.push(paths.manifest);
        return { wrote: true, drift: nowDrift };
    });
    if (!manifestOutcome.wrote) {
        warnings.push('the registry no longer carries this install\u2019s entries — a concurrent remover won the window between the ' +
            'registry transaction and the manifest write, so NO manifest was written (a manifest describing entries that are ' +
            'not there is what `--remove` would later act on). Re-run the install if you want the hooks back.');
    }
    const drift = manifestOutcome.drift;
    const installed = drift.installed;
    const armedState = installed && executable && trustResult.trust === 'trusted';
    // The install is not finished when the file is written — it is finished when the guard has been
    // WITNESSED blocking (ADR-002, finding 1). Probing an install that is already known-broken would
    // spend a live model call to re-learn what the liveness probe just said, so it is gated on
    // `armedState`.
    const verification = armedState
        ? verifyStage(options, {
            paths,
            probedCodexVersion: codexVersion,
            recordedCodexVersion: codexVersion,
            ...(trustResult.rowStatus !== undefined ? { trustStatus: trustResult.rowStatus } : {}),
            warnings,
        })
        : { result: null, declined: verifyPlan(options).declined };
    const exitCode = armedState
        ? verification.result !== null
            ? verifyExitCode(verification.result)
            : verification.declined
                ? 3
                : 0
        : 1;
    return {
        codexHome,
        registryPath: paths.registry,
        installed,
        executable,
        written: planned.plan.changed || writes.length > 0,
        removed: 0,
        foreignPreserved: planned.plan.foreignPreserved,
        unattributable: planned.plan.unattributable,
        drift: drift.drifted,
        trust: trustResult.trust,
        codexVersion,
        verify: verification.result,
        verified: verification.result !== null && isReadyVerdict(verification.result),
        ready: armedState && verification.result !== null && isReadyVerdict(verification.result),
        exitCode,
        warnings,
        errors,
        writes,
    };
}
/* -------------------------------------------------------------------------- */
/* The LIVE veto probe (ADR-002 §Decision, independent-review finding 1)       */
/* -------------------------------------------------------------------------- */
/**
 * The forbidden action the probe asks Codex to run. It is the ONE rule this leg ships
 * (`ssh-explicit-auth-weakening`, ADR-005) with a nonce-scoped sentinel appended, so the two halves
 * of ADR-002's evidence are produced by a single command: the block MESSAGE and the missing SIDE
 * EFFECT. The ssh call itself targets a closed local port and can never reach a real host.
 */
function forbiddenProbeCommand(sentinel, nonce) {
    return ('ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no -o BatchMode=yes ' +
        `-o ConnectTimeout=1 -p 65533 nobody@127.0.0.1 true ; echo ${nonce} > "${sentinel}"`);
}
/** This package's own root — the probe workspace links it so the helper can load the policy. */
function harnessCoreRoot() {
    return dirname(dirname(fileURLToPath(import.meta.url)));
}
/**
 * Drive ONE live, NON-bypassed veto probe through `codex exec` and classify what it produced.
 *
 * This is the half the shipped CLI was missing: `--verify` and `--project` were accepted and
 * dropped, `classifyVetoProbe` was never called from any production path, and `ready` printed off
 * file presence plus a trust row (independent review, finding 1 — CRITICAL). A registry entry is
 * not a guard; only a witnessed block is.
 *
 * Fail-closed by construction:
 * - `--dangerously-bypass-hook-trust` is NEVER passed (`bypassedTrust: false` is a fact here, not a
 *   parameter): a bypassed run proves the helper body works and nothing about the installed state.
 * - stdin is `/dev/null` (node opens `/dev/null` for an `'ignore'` stdio slot) — the 2026-07-10
 *   codex-exec stdin lesson.
 * - Every way the run can fail to produce evidence — no binary, a dead invocation, a timeout, an
 *   unstattable sentinel — reaches `inconclusive`, never `armed`.
 */
export function runCodexVetoProbe(options) {
    const notes = [];
    const nonce = `dzverify-${randomBytes(6).toString('hex')}`;
    const timeoutMs = options.timeoutMs ?? 300_000;
    // (1) The workspace. The veto helper is inert outside an opted-in `.dz` project and only BLOCKS
    //     under an explicit `hooks.shellVeto: "block"` (ADR-004 consent). A probe therefore needs a
    //     consenting workspace; dz builds a hermetic one rather than editing the user's config.
    let workspace;
    let ephemeral = false;
    const explicit = options.project === undefined ? undefined : resolvePath(options.project);
    if (explicit !== undefined && vetoModeOf(explicit) === 'block') {
        workspace = explicit;
        notes.push(`probing in ${explicit} — it is an opted-in dz project in block mode`);
    }
    else {
        if (explicit !== undefined) {
            notes.push(`--project ${explicit} is not an opted-in dz project in \`hooks.shellVeto: "block"\` mode — probing in a hermetic workspace instead (dz never edits a project's consent to make its own check pass)`);
        }
        workspace = mkdtempSync(join(tmpdir(), 'dz-veto-probe-'));
        ephemeral = true;
        mkdirSync(join(workspace, '.dz'), { recursive: true });
        writeFileSync(join(workspace, '.dz', 'config.json'), '{"hooks":{"shellVeto":"block"}}\n');
        try {
            mkdirSync(join(workspace, 'node_modules', '@dzhechkov'), { recursive: true });
            symlinkSync(harnessCoreRoot(), join(workspace, 'node_modules', '@dzhechkov', 'harness-core'), 'dir');
        }
        catch (err) {
            notes.push(`could not link harness-core into the probe workspace: ${String(err.message)}`);
        }
    }
    const sentinel = join(workspace, `PROBE-SENTINEL-${nonce}`);
    rmSync(sentinel, { force: true });
    const command = forbiddenProbeCommand(sentinel, nonce);
    // (2) The run. `--skip-git-repo-check` because the hermetic workspace is not a repo;
    //     `--sandbox workspace-write` so the sentinel CAN be written when nothing blocks it — a
    //     sandbox that forbids the write would forge an `armed` out of a sandbox denial.
    const args = ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write'];
    if (options.model !== undefined && options.model !== '')
        args.push('-m', options.model);
    args.push(`Run this exact shell command, verbatim, with sh -c: ${command}`);
    const run = spawnSync('codex', args, {
        cwd: workspace,
        encoding: 'utf8',
        timeout: timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe'], // stdin = /dev/null
        env: { ...process.env, CODEX_HOME: options.paths.codexHome },
    });
    const transcript = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const timedOut = run.error?.code === 'ETIMEDOUT' || run.signal === 'SIGTERM';
    const ran = run.error === undefined || timedOut;
    if (run.error !== undefined && !timedOut)
        notes.push(`codex exec did not run: ${String(run.error.message)}`);
    // (3) The sentinel, stat'ed — `null` when we could not look, which is NOT the same as absent.
    const sentinelStat = statSentinelPresence(sentinel);
    const sentinelPresent = sentinelStat.present;
    if (sentinelStat.error !== undefined)
        notes.push(`could not stat the sentinel: ${sentinelStat.error}`);
    const shellAttempted = /\/bin\/(?:ba)?sh -l?c/.test(transcript) ||
        transcript.includes('Command blocked by PreToolUse hook') ||
        transcript.includes('DZ-VETO');
    const evidence = {
        transcript,
        nonce,
        sentinelPresent,
        shellAttempted,
        bypassedTrust: false,
        ran,
        exitCode: run.status,
        timedOut,
        ...(options.trustStatus !== undefined ? { trustStatus: options.trustStatus } : {}),
        ...(options.recordedCodexVersion !== undefined ? { recordedCodexVersion: options.recordedCodexVersion } : {}),
        ...(options.probedCodexVersion !== undefined ? { probedCodexVersion: options.probedCodexVersion } : {}),
    };
    const result = classifyVetoProbe(evidence);
    rmSync(sentinel, { force: true });
    if (ephemeral)
        rmSync(workspace, { recursive: true, force: true });
    return { evidence, result, workspace, command, notes };
}
/**
 * Is the sentinel there? `true` / `false` / **`null` when we could not tell**.
 *
 * `existsSync` answers `false` for BOTH "it is not there" and "I could not look" — it swallows
 * EACCES, ENOTDIR, ELOOP and every I/O error into the same word that means "the command was
 * blocked" (fix round 2, R2-4). Only ENOENT is an established ABSENCE; every other errno is a
 * failed observation and must reach `inconclusive`.
 */
export function statSentinelPresence(path) {
    try {
        statSync(path);
        return { present: true };
    }
    catch (err) {
        const code = err.code;
        if (code === 'ENOENT')
            return { present: false };
        return { present: null, error: `${String(code ?? 'unknown')}: ${String(err.message)}` };
    }
}
/** The project's veto mode, read the way the helper reads it. Never throws. */
function vetoModeOf(projectRoot) {
    try {
        if (!statSync(join(projectRoot, '.dz')).isDirectory())
            return 'warn';
        const cfg = JSON.parse(readFileSync(join(projectRoot, '.dz', 'config.json'), 'utf8'));
        const mode = cfg?.hooks?.shellVeto;
        return mode === 'block' || mode === 'off' ? mode : 'warn';
    }
    catch {
        return 'warn';
    }
}
/** A synthetic ALLOWED PreToolUse payload — the liveness probe must never trigger a real policy hit. */
const ALLOWED_PROBE_PAYLOAD = JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'true' },
    cwd: '/nonexistent-dz-liveness-probe',
});
function atomicWrite(path, text) {
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, text, { mode: 0o600 });
    renameSync(tmp, path);
}
/** 0600: the helpers are invoked as `node <path>`, never executed directly (AM-35c). */
function writeHelperIfChanged(path, body, writes) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    if (current === body)
        return; // byte-idempotence: no change ⇒ no write ⇒ trust survives (FR-2)
    atomicWrite(path, body);
    writes.push(path);
}
function backupRegistry(paths, currentText, now, writes) {
    if (currentText === undefined)
        return;
    const backup = `${paths.registry}.bak-${now.replace(/[:.]/g, '-')}`;
    writeFileSync(backup, currentText, { mode: 0o600 });
    writes.push(backup);
    pruneBackups(paths.codexHome, 'hooks.json.bak-', 3);
}
/**
 * Ask the runtime which of OUR entries it sees, then persist trust for exactly those.
 *
 * Matching is on the exact emitted command string, so a third party's entry can never inherit dz's
 * trust write. A failure here is a WARNING, never an install failure: the registry is written and
 * the user can approve interactively (the `ARMED = NO` branch, AM-17 — both branches ship).
 */
function armCodexHookTrust(paths, entries, writes) {
    const listed = listCodexHooks(paths.codexHome);
    if (listed === null) {
        return {
            trust: 'unknown',
            rows: [],
            warnings: [
                'could not read the codex `hooks/list` RPC — hook trust could not be recorded. ARMED = NO: open an interactive Codex session and approve the two dz hooks, then re-run `dz hooks-sync --target codex --verify`.',
            ],
        };
    }
    const own = selectOwnHookMetadata(listed, entries, { registryPath: paths.registry });
    if (own.length !== entries.length) {
        return {
            trust: 'trust-pending',
            rows: own.map((o) => ({ id: o.id, key: o.meta.key })),
            warnings: [`codex reports ${own.length} of ${entries.length} dz entries it can attribute to ${paths.registry} — trust recorded only for the ones it sees (an ambiguous or foreign-sourced row is refused, never adopted)`],
        };
    }
    const configText = existsSync(paths.configToml) ? readFileSync(paths.configToml, 'utf8') : '';
    const upserted = upsertTrustBlock(configText, own.map((o) => ({ key: o.meta.key, trustedHash: o.meta.currentHash })));
    if (!upserted.ok) {
        // A damaged fence is a REFUSAL, not a rewrite: the alternative eats the user's `[projects."…"]`
        // trust rows on the next sync (finding 9).
        return { trust: 'trust-pending', rows: own.map((o) => ({ id: o.id, key: o.meta.key })), warnings: [upserted.error] };
    }
    if (upserted.text !== configText) {
        atomicWrite(paths.configToml, upserted.text);
        writes.push(paths.configToml);
    }
    // Re-read: the only honest confirmation that the write armed anything is the runtime's own answer.
    const after = listCodexHooks(paths.codexHome);
    const confirmed = after === null ? [] : selectOwnHookMetadata(after, entries, { registryPath: paths.registry });
    const allTrusted = confirmed.length === entries.length && confirmed.every((c) => c.meta.trustStatus === 'trusted' || c.meta.trustStatus === 'managed');
    return {
        trust: allTrusted ? 'trusted' : 'trust-pending',
        rows: own.map((o) => ({ id: o.id, key: o.meta.key })),
        ...(confirmed[0] !== undefined ? { rowStatus: confirmed[0].meta.trustStatus } : {}),
        warnings: allTrusted
            ? []
            : ['dz wrote the hook trust rows but codex still reports the entries as untrusted — approve them in an interactive session'],
    };
}
/**
 * Drive `codex app-server` over stdio for one `hooks/list` call.
 *
 * MEASURED headless (M0 spike, probe 1): `initialize` → `initialized` → `hooks/list` answers with
 * `key`, `currentHash`, `trustStatus` and `sourcePath` for every discovered entry, no TUI involved.
 */
export function listCodexHooks(codexHome, cwd = process.cwd()) {
    const script = [
        "const{spawn}=require('node:child_process');",
        "const p=spawn('codex',['app-server'],{env:{...process.env,CODEX_HOME:process.argv[1]},stdio:['pipe','pipe','ignore']});",
        "let b='';const send=o=>p.stdin.write(JSON.stringify(o)+'\\n');",
        "const bail=()=>{try{p.kill()}catch(e){};process.stdout.write('null');process.exit(0)};",
        "const t=setTimeout(bail,45000);",
        "p.on('error',bail);",
        "p.stdout.on('data',d=>{b+=d.toString();let i;while((i=b.indexOf('\\n'))>=0){const l=b.slice(0,i);b=b.slice(i+1);if(!l.trim())continue;let m;try{m=JSON.parse(l)}catch(e){continue}",
        "if(m.id===1){send({jsonrpc:'2.0',method:'initialized'});send({jsonrpc:'2.0',id:2,method:'hooks/list',params:{cwds:[process.argv[2]]}})}",
        "else if(m.id===2){clearTimeout(t);process.stdout.write(JSON.stringify(m.result&&m.result.data?m.result.data:null));try{p.kill()}catch(e){};process.exit(0)}}});",
        "send({jsonrpc:'2.0',id:1,method:'initialize',params:{clientInfo:{name:'dz',version:'1.0.0'}}});",
    ].join('');
    try {
        const out = execFileSync(process.execPath, ['-e', script, codexHome, cwd], {
            encoding: 'utf8',
            timeout: 60_000,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const data = JSON.parse(out);
        if (data === null || !Array.isArray(data))
            return null;
        return data.flatMap((entry) => entry.hooks ?? []);
    }
    catch {
        return null;
    }
}
/** Newest recall-usage row timestamp and whether any row carries `runtime: 'codex'`. Never throws. */
function newestRecallUsageRuntime(logPath) {
    try {
        if (!existsSync(logPath))
            return { hasCodexRow: false };
        const lines = readFileSync(logPath, 'utf-8').split('\n');
        let newest;
        let hasCodexRow = false;
        for (const line of lines) {
            if (line.trim() === '')
                continue;
            try {
                const rec = JSON.parse(line);
                if (rec.runtime === 'codex' && typeof rec.ts === 'string') {
                    hasCodexRow = true;
                    if (newest === undefined || rec.ts > newest)
                        newest = rec.ts;
                }
            }
            catch { /* a malformed line is counted elsewhere */ }
        }
        return newest === undefined ? { hasCodexRow } : { newest, hasCodexRow };
    }
    catch {
        return { hasCodexRow: false };
    }
}
//# sourceMappingURL=operations.js.map