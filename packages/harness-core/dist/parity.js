/**
 * Target-parity model (`dz parity`, feature target-parity-matrix, ADR-001).
 *
 * The honest map of "which harness feature works on which target, and HOW". The matrix does NOT
 * exist as a hand-written document anywhere (the sitedoc lesson, b57e686: a hand-maintained
 * duplicate list is a second drift surface) — this declarative model is the ONLY source, and the
 * table is always COMPUTED from it.
 *
 * Honesty contract (FR-6): a capability flag states only what has been VERIFIED, each with its
 * source in a comment. Unknown support is NOT flagged — a feature falsely promised on a target
 * is worse than one conservatively marked absent.
 *
 * Derivation anchor (FR-4): `TARGET_CAPABILITIES` is typed `Record<TargetName, …>`, so ADDING an
 * 11th target to the registry refuses to compile until it is classified here; the model test
 * re-asserts coverage at runtime and validates every capability reference.
 *
 * @packageDocumentation
 */
/** All declared capabilities — the closed vocabulary the model test validates references against. */
export const RUNTIME_CAPABILITIES = [
    'shell',
    'skills',
    'hooks-write',
    'hooks-shell',
    'hooks-prompt',
    'mcp',
    'mcp-configured',
    'workflows',
    'statusline',
];
/**
 * What each target has been VERIFIED to provide (FR-6: source per line; conservative — an
 * unverified capability stays absent until proven, never assumed).
 */
export const TARGET_CAPABILITIES = {
    // Daily-driven harness: hooks (claim-check PreToolUse, recall UserPromptSubmit), MCP servers,
    // Workflow runtime and the statusline are all exercised in this repo every session.
    'claude-code': ['shell', 'skills', 'hooks-write', 'hooks-shell', 'hooks-prompt', 'mcp', 'mcp-configured', 'workflows', 'statusline'],
    // MCP subsystem probed live: `codex mcp --help` + `codex mcp list` answer (2026-07-19).
    // hooks-shell + hooks-prompt: user-global `$CODEX_HOME/hooks.json`, installed and ARMED
    // unattended, proved by a live two-sided block probe (2026-08-19, codex-cli 0.147.0 — the
    // transcripts named in CAPABILITY_EVIDENCE). `hooks-write` is NOT granted: this leg ships no
    // PreToolUse guard on Write/Edit, so `claim-check` stays `manual` on codex.
    //
    // Fact CORRECTED 2026-08-19: a project-level `<repo>/.codex/hooks.json` DOES load on 0.147.0
    // (`source: "project"`, MEASURED). The earlier note that project-level files are ignored was
    // measured on 0.144.6 and is stale. dz still writes only the user-global registry, but that is
    // now a DECISION (one carrier, one removable unit) rather than a description of the runtime.
    codex: ['shell', 'skills', 'mcp', 'hooks-shell', 'hooks-prompt'],
    // Conservative v1: skills emission verified by the adapters; richer runtimes unproven.
    opencode: ['shell', 'skills'],
    hermes: ['shell', 'skills'],
    openclaude: ['shell', 'skills'],
    copilot: ['shell', 'skills'],
    // Lowest common denominator: one merged AGENTS.md — skills arrive as a single managed file.
    'agents-md': ['shell', 'skills'],
    cursor: ['shell', 'skills'],
    gemini: ['shell', 'skills'],
    windsurf: ['shell', 'skills'],
};
export const CAPABILITY_EVIDENCE = {
    'claude-code': {
        shell: { evidence: 'dz --version', kind: 'reproducer', at: '2026-07-19' },
        skills: { evidence: 'dz compose --target claude-code', kind: 'reproducer', at: '2026-07-19' },
        'hooks-write': { evidence: 'grep -n claim-check-hook .claude/settings.json', kind: 'reproducer', at: '2026-07-19' },
        'hooks-shell': { evidence: 'grep -n PreToolUse .claude/settings.json', kind: 'reproducer', at: '2026-07-19' },
        'hooks-prompt': { evidence: 'grep -n recall-hook.cjs .claude/settings.json', kind: 'reproducer', at: '2026-07-19' },
        mcp: { evidence: 'cat .mcp.json', kind: 'reproducer', at: '2026-07-19' },
        'mcp-configured': { evidence: 'cat .mcp.json', kind: 'reproducer', at: '2026-07-19' },
        workflows: { evidence: 'ls .claude/workflows/feature-adr.js', kind: 'reproducer', at: '2026-07-19' },
        statusline: { evidence: 'dz statusline', kind: 'reproducer', at: '2026-07-19' },
    },
    codex: {
        shell: { evidence: 'codex exec -m <id> "Reply with exactly: OK"', kind: 'reproducer', at: '2026-07-19' },
        skills: { evidence: 'dz compose --target codex', kind: 'reproducer', at: '2026-07-19' },
        mcp: { evidence: 'codex mcp list', kind: 'reproducer', at: '2026-07-19' },
        // The two-sided live block: our marker in the transcript AND the sentinel side effect absent,
        // in a NON-bypassed run, with the entry reported `trusted` by codex's own `hooks/list`.
        // RE-PROBED on the installed runtime at the independent-QE fix round (review finding 3): the
        // 0.147.0 evidence was stale on a machine running 0.148.0, and re-running it was NOT a
        // formality — the arming path had silently stopped working, because `hooks/list` spells its
        // `eventName` field `preToolUse` on 0.148 while the trust KEY still says `pre_tool_use`.
        // All four legs pass on 0.148.0 with the trust axis PARSED from `hooks/list` rather than
        // hard-coded (the pre-fix grader asserted `trustStatus: 'trusted'` as a constant).
        'hooks-shell': {
            evidence: 'features/crossrt-2-codex-hooks/07_code_changes/probe-results/fixround/veto-armed.txt',
            kind: 'transcript',
            at: '2026-08-19',
            runtimeVersion: 'codex-cli 0.148.0',
        },
        // NOT re-probed on 0.148: the recall canary is a separate live run (forced hit + removed twin)
        // and this round did not execute it. The version it was measured on is recorded HONESTLY, so
        // `findUnbackedCapabilities` reports it `stale-runtime-version` — INCONCLUSIVE — the moment a
        // caller supplies the probed 0.148.0. That is the correct state: the grant is not withdrawn,
        // it is awaiting its re-probe.
        'hooks-prompt': {
            evidence: 'features/crossrt-2-codex-hooks/07_code_changes/probe-results/recall-canary.md',
            kind: 'transcript',
            at: '2026-08-19',
            runtimeVersion: 'codex-cli 0.147.0',
        },
    },
    opencode: { shell: { evidence: 'adapter emit', kind: 'reproducer', at: '2026-07-19' }, skills: { evidence: 'dz compose --target opencode', kind: 'reproducer', at: '2026-07-19' } },
    hermes: { shell: { evidence: 'adapter emit', kind: 'reproducer', at: '2026-07-19' }, skills: { evidence: 'dz compose --target hermes', kind: 'reproducer', at: '2026-07-19' } },
    openclaude: { shell: { evidence: 'adapter emit', kind: 'reproducer', at: '2026-07-19' }, skills: { evidence: 'dz compose --target openclaude', kind: 'reproducer', at: '2026-07-19' } },
    copilot: { shell: { evidence: 'adapter emit', kind: 'reproducer', at: '2026-07-19' }, skills: { evidence: 'dz compose --target copilot', kind: 'reproducer', at: '2026-07-19' } },
    'agents-md': { shell: { evidence: 'adapter emit', kind: 'reproducer', at: '2026-07-19' }, skills: { evidence: 'dz compose --target agents-md', kind: 'reproducer', at: '2026-07-19' } },
    cursor: { shell: { evidence: 'adapter emit', kind: 'reproducer', at: '2026-07-19' }, skills: { evidence: 'dz compose --target cursor', kind: 'reproducer', at: '2026-07-19' } },
    gemini: { shell: { evidence: 'adapter emit', kind: 'reproducer', at: '2026-07-19' }, skills: { evidence: 'dz compose --target gemini', kind: 'reproducer', at: '2026-07-19' } },
    windsurf: { shell: { evidence: 'adapter emit', kind: 'reproducer', at: '2026-07-19' }, skills: { evidence: 'dz compose --target windsurf', kind: 'reproducer', at: '2026-07-19' } },
};
/**
 * Every capability grant that is NOT backed by usable evidence.
 *
 * PURE, with the filesystem injected as `transcriptExists`. That is deliberate: the property this
 * enforces — *a grant with a dangling transcript is not a grant* — has to be provable without a
 * repository on disk, or the mutation gate (which copies the PACKAGE, not the repo) could never
 * turn its mutant red, and an unkillable mutant is a false green wearing a gate's clothes.
 */
export function findUnbackedCapabilities(transcriptExists, capabilities = TARGET_CAPABILITIES, evidence = CAPABILITY_EVIDENCE, probedVersions = {}) {
    const out = [];
    for (const target of Object.keys(capabilities)) {
        for (const capability of capabilities[target]) {
            const record = evidence[target]?.[capability];
            if (record === undefined) {
                out.push({ target, capability, reason: 'no-evidence-record' });
                continue;
            }
            if (record.kind === 'transcript' && !transcriptExists(record.evidence)) {
                out.push({ target, capability, reason: 'dangling-transcript', evidence: record.evidence });
                continue;
            }
            // Version pin (ADR-006, finding 3). Only fires when BOTH sides are known: an unprobed target
            // stays silent rather than reporting every grant stale on a machine without the runtime.
            const probed = probedVersions[target];
            if (record.runtimeVersion !== undefined && probed !== undefined && probed !== record.runtimeVersion) {
                out.push({
                    target,
                    capability,
                    reason: 'stale-runtime-version',
                    evidence: record.evidence,
                    recordedVersion: record.runtimeVersion,
                    probedVersion: probed,
                });
            }
        }
    }
    return out;
}
/**
 * Compare two recorded runtime versions the way a version string means it.
 *
 * `null` when the two are not comparable (different product, unparseable) — which the caller reads
 * as "not the newest", the conservative direction.
 */
function compareRuntimeVersions(a, b) {
    const parse = (v) => {
        const m = /^(.*?)\s*(\d+(?:\.\d+)*)\s*$/.exec(v.trim());
        if (m === null)
            return null;
        return { product: (m[1] ?? '').trim(), parts: (m[2] ?? '').split('.').map((n) => Number(n)) };
    };
    const pa = parse(a);
    const pb = parse(b);
    if (pa === null || pb === null || pa.product !== pb.product)
        return null;
    const len = Math.max(pa.parts.length, pb.parts.length);
    for (let i = 0; i < len; i += 1) {
        const x = pa.parts[i] ?? 0;
        const y = pb.parts[i] ?? 0;
        if (x !== y)
            return x < y ? -1 : 1;
    }
    return 0;
}
/**
 * The newest runtime version recorded among a target's TRANSCRIPT evidence, or `null`.
 *
 * This is what makes staleness detectable WITHOUT running anything: the records date themselves
 * against each other. `dz parity` computes a matrix and must keep doing so deterministically — a
 * `codex --version` subprocess inside it would make a pure report depend on the machine it prints
 * on. Re-probing one capability is what dates the others (fix round 2, R2-3).
 */
export function newestRecordedRuntimeVersion(target, evidence = CAPABILITY_EVIDENCE) {
    let newest = null;
    for (const record of Object.values(evidence[target] ?? {})) {
        if (record === undefined || record.kind !== 'transcript' || record.runtimeVersion === undefined)
            continue;
        if (newest === null) {
            newest = record.runtimeVersion;
            continue;
        }
        const cmp = compareRuntimeVersions(newest, record.runtimeVersion);
        if (cmp !== null && cmp < 0)
            newest = record.runtimeVersion;
    }
    return newest;
}
/**
 * Transcript evidence that is out of date with the newest record for its own target.
 *
 * SCOPE, stated because it is a judgement and not a derivation: the version rule applies to
 * `kind: 'transcript'` records only. A transcript FREEZES one runtime moment, so it can go stale; a
 * `reproducer` is a command anyone can re-run, and calling it stale would report `dz --version` as
 * expired. A transcript with NO `runtimeVersion` is stale too — an undated observation cannot be
 * shown to be current.
 *
 * INCONCLUSIVE, never a refutation: the grant is not withdrawn, it is awaiting its re-probe.
 */
export function findStaleTranscriptEvidence(capabilities = TARGET_CAPABILITIES, evidence = CAPABILITY_EVIDENCE) {
    const out = [];
    for (const target of Object.keys(capabilities)) {
        const newest = newestRecordedRuntimeVersion(target, evidence);
        if (newest === null)
            continue; // nothing version-pinned on this target ⇒ nothing to be stale against
        for (const capability of capabilities[target]) {
            const record = evidence[target]?.[capability];
            if (record === undefined || record.kind !== 'transcript')
                continue;
            const recorded = record.runtimeVersion;
            if (recorded !== undefined && compareRuntimeVersions(recorded, newest) === 0)
                continue;
            out.push({
                target,
                capability,
                reason: 'stale-runtime-version',
                evidence: record.evidence,
                ...(recorded !== undefined ? { recordedVersion: recorded } : {}),
                probedVersion: newest,
            });
        }
    }
    return out;
}
/**
 * The harness feature inventory for the parity map. A feature may carry SEVERAL forms — parity
 * for a target is the BEST form whose requirements the target provides (e.g. claim-check: the
 * hook form is automatic on every Write/Edit; the CLI form works anywhere but must be invoked).
 */
export const PARITY_FEATURES = [
    {
        id: 'dz-cli',
        title: 'dz CLI (all commands)',
        forms: [{ form: 'shell command', requires: ['shell'], level: 'full' }],
    },
    {
        id: 'skills-packs',
        title: 'Skill packs (compiled per target)',
        forms: [{ form: 'compiled skills via adapter', requires: ['skills'], level: 'full' }],
    },
    {
        id: 'feature-adr',
        title: 'feature-adr pipeline',
        forms: [
            { form: 'ultracode deterministic workflow', requires: ['workflows'], level: 'full' },
            { form: 'interactive skill (plain /feature-adr)', requires: ['skills'], level: 'manual' },
        ],
    },
    {
        id: 'delivery-gate',
        title: 'Step-10 Delivery Gate',
        forms: [
            { form: 'workflow delivery block', requires: ['workflows'], level: 'full' },
            // Portable form (portable-gates, run #3): the CLI runs the deterministic parts (artifact probes,
            // hand-off arithmetic, cross-validation bookkeeping) and DISPATCHES the semantic review to the
            // target's own agent runtime — the `dz challenge` cartridge precedent. Requires only `shell`.
            { form: 'dz delivery-check (CLI 4-plane hand-off protocol)', requires: ['shell'], level: 'manual' },
        ],
    },
    {
        id: 'challenge-panel',
        title: 'Adversarial challenge-panel (plan gate)',
        forms: [
            { form: 'workflow plan gate', requires: ['workflows'], level: 'full' },
            { form: 'dz challenge (CLI)', requires: ['shell'], level: 'manual' },
        ],
    },
    {
        id: 'claim-check',
        title: 'Integrity claim-check',
        forms: [
            { form: 'PreToolUse hook (automatic on Write/Edit)', requires: ['hooks-write'], level: 'full' },
            { form: 'dz claim-check (CLI) + publish gate', requires: ['shell'], level: 'manual' },
        ],
    },
    {
        id: 'learning-collect',
        title: 'Self-learning: collect + rank (dz teach/recall)',
        forms: [{ form: 'dz teach / consolidate / recall', requires: ['shell'], level: 'full' }],
    },
    {
        id: 'learning-apply',
        title: 'Self-learning: automatic apply-leg',
        forms: [
            { form: 'UserPromptSubmit hook (auto recall)', requires: ['hooks-prompt'], level: 'full' },
            { form: 'manual dz recall before a task', requires: ['shell'], level: 'manual' },
        ],
    },
    {
        id: 'statusline-gates',
        title: 'Live 🚦 gates status line',
        forms: [{ form: 'statusline integration', requires: ['statusline'], level: 'full' }],
    },
    {
        id: 'project-guards',
        title: 'Deterministic project guards (setup --guards)',
        forms: [{ form: 'zero-dependency check.mjs (runs anywhere node runs)', requires: ['shell'], level: 'full' }],
    },
    {
        id: 'release-signing',
        title: 'Verified release + signing (dz release/sign/sbom)',
        forms: [{ form: 'dz release / sign / sbom / publish', requires: ['shell'], level: 'full' }],
    },
    {
        id: 'mcp-memory',
        title: 'MCP memory (AgentDB, agentic-qe)',
        forms: [
            { form: 'preconfigured MCP servers (.mcp.json ships in-repo)', requires: ['mcp-configured'], level: 'full' },
            { form: 'manual MCP server config (e.g. `codex mcp add`)', requires: ['mcp'], level: 'manual' },
        ],
    },
];
/**
 * Short column labels for the grid renderer — kept NEXT TO the model and covered by the same
 * coverage test (a hand map in the CLI would be a second, unchecked target registry).
 */
export const TARGET_SHORT_LABELS = {
    'claude-code': 'cc',
    codex: 'cdx',
    opencode: 'ocd',
    hermes: 'hrm',
    openclaude: 'ocl',
    copilot: 'cop',
    'agents-md': 'amd',
    cursor: 'cur',
    gemini: 'gem',
    windsurf: 'wsf',
};
/**
 * The quality-GATE class of features — what the scaffolded gates doc lists under "Gates runnable
 * here" (a full parity dump put "Skill packs — full" under a gates heading; delivery finding).
 * Must stay a subset of PARITY_FEATURES ids (pinned by test).
 */
export const GATE_FEATURE_IDS = [
    'feature-adr',
    'delivery-gate',
    'challenge-panel',
    'claim-check',
    'project-guards',
    'release-signing',
];
/** Compute the parity cell for one feature on one target (pure; best form wins, `full` first). */
export function computeParity(feature, capabilities) {
    const caps = new Set(capabilities);
    const usable = feature.forms.filter((f) => f.requires.every((r) => caps.has(r)));
    const full = usable.find((f) => f.level === 'full');
    if (full !== undefined)
        return { level: 'full', via: full.form };
    const manual = usable.find((f) => f.level === 'manual');
    if (manual !== undefined)
        return { level: 'manual', via: manual.form };
    return { level: 'none' };
}
/**
 * Downgrade a cell whose DECIDING form rests on stale evidence to `inconclusive`.
 *
 * The round-1 gate could tell that `hooks-prompt` evidence was stale and nothing a user runs ever
 * asked it (fix round 2, R2-3): `dz parity` printed `full` for the auto-recall leg on codex off a
 * transcript recorded on a runtime that is no longer installed. A cell that says `full` on evidence
 * nobody has re-confirmed is the same class of claim this whole feature exists to refuse.
 */
export function downgradeForStaleEvidence(feature, cell, staleCapabilities) {
    if (cell.level === 'none' || cell.via === undefined || staleCapabilities.length === 0)
        return cell;
    const form = feature.forms.find((f) => f.form === cell.via);
    if (form === undefined)
        return cell;
    const hit = form.requires.filter((r) => staleCapabilities.includes(r));
    if (hit.length === 0)
        return cell;
    return { level: 'inconclusive', via: cell.via, staleEvidence: hit };
}
/** The full computed matrix over every declared feature × every registered target. */
export function buildParityMatrix() {
    const targets = Object.keys(TARGET_CAPABILITIES);
    return PARITY_FEATURES.map((feature) => {
        const cells = {};
        for (const t of targets)
            cells[t] = computeParity(feature, TARGET_CAPABILITIES[t]);
        return { feature, cells };
    });
}
//# sourceMappingURL=parity.js.map