/**
 * The harness operations — `init`, `sync`, `verify`, `doctor` — as pure-ish
 * functions returning structured reports. `@dzhechkov/harness-cli` is a thin
 * argv shell over these.
 *
 * @packageDocumentation
 */
import { type CodexHooksPaths, type HooksListHookMetadata } from './codex-hooks.js';
import { type CodexHookTrustStatus, type VetoProbeEvidence, type VetoProbeResult } from './codex-hooks-verify.js';
import type { SkillApplyFailure, SkillLoadFailure } from './skills.js';
import type { TargetName } from './targets.js';
import { type IntegrationOutcome, type IntegrationManifestSource } from './target-integrations.js';
import { type IntegrationApplyFault } from './integration-apply.js';
import { type IntegrationProcessPort } from './integrations-verify.js';
import { type AgentsMdBudget, type PolicyDriftFinding, type PolicySource } from './agents-policy.js';
/** Options for {@link runInit}. */
export interface InitOptions {
    readonly target: TargetName;
    /** Source directory of canonical skills. */
    readonly skillsDir: string;
    /** Project root the platform tree is written under. */
    readonly projectRoot: string;
    /** Overwrite existing files. Default `false` — additive. */
    readonly force?: boolean;
    /** When set, install only these skill ids (a preset selection). */
    readonly select?: readonly string[];
    /** When set, generate platform-specific enrichment files alongside SKILL.md. */
    readonly enrich?: boolean;
    /** Exact content-bound digest printed by the first integration-aware run. */
    readonly allowIntegrations?: string;
    /** Explicit hook opt-out; maps hooks to not-requested. */
    readonly noHooks?: boolean;
    /** Explicit skills-only opt-out, even when selected skills carry manifests. */
    readonly noIntegrations?: boolean;
    /** Live verification is load-bearing; requesting this flag makes requested integrations refuse. */
    readonly noVerify?: boolean;
    /** Injectable process boundary for deterministic integration tests. */
    readonly integrationProcessPort?: IntegrationProcessPort;
    /** Test-only fault at the carrier/ownership-journal durability boundary. */
    readonly integrationApplyFault?: IntegrationApplyFault;
    /**
     * Install-level manifest sources. The CLI supplies this only on the first
     * per-directory run so companion planning, authorization, and probing happen
     * exactly once across every discovered skill pack.
     */
    readonly integrationManifestSources?: readonly IntegrationManifestSource[];
}
/** Per-skill outcome of {@link runInit}. */
export interface InitSkillResult {
    readonly id: string;
    readonly written: string[];
    readonly skipped: string[];
    readonly warnings: string[];
}
/** The outcome of {@link runInit}. */
export interface InitReport {
    readonly target: TargetName;
    readonly skillsDir: string;
    readonly projectRoot: string;
    readonly skills: InitSkillResult[];
    /**
     * Selected skill ids that were NOT found in `skillsDir`. Empty when no
     * `select` was given. Lets callers surface a warning instead of silently
     * installing fewer skills than the selection asked for.
     */
    readonly missing: string[];
    /**
     * Skill directories that could not be LOADED (unparseable `SKILL.md`, unreadable
     * file, schema rejection). Additive and always present — empty when nothing failed.
     *
     * Before feature dz-cli-defects a single unloadable skill threw out of the whole
     * loop, so `dz init`/`dz install` reported nothing at all. Skipping without a record
     * would only trade a loud failure for a silent one; this field is the record.
     */
    readonly failures: readonly SkillLoadFailure[];
    /**
     * Skills that LOADED cleanly but could not be compiled or written (fix round 1,
     * QE F4). Kept separate from {@link InitReport.failures} because the two name
     * different subjects: a load failure accuses the source `SKILL.md`, an apply
     * failure accuses the target tree. Merging them made `EEXIST: mkdir …` print under
     * the header "unparseable SKILL.md" against a perfectly valid file.
     *
     * Additive and always present — empty when nothing failed. Only `runInit` can
     * populate it; the single-file targets render in memory and write once, outside
     * any per-skill loop.
     */
    readonly applyFailures: readonly SkillApplyFailure[];
    /** Exactly two ordered companion outcomes: MCP, then hooks. */
    readonly integrations: readonly [IntegrationOutcome, IntegrationOutcome];
    /** Safe digest used by `--allow-integrations`; absent when no manifest exists. */
    readonly integrationDigest?: string;
}
/** Options for {@link runInitAgentsMd} / {@link runInitGeminiMd}. */
export interface AgentsMdInitOptions {
    /**
     * One or more canonical skill source directories. Unlike the per-skill tree
     * targets, the single-file adapters aggregate ACROSS all of them into ONE
     * root file — so the CLI must pass every discovered dir here (not one runInit
     * call per dir), or a later dir's merge would replace an earlier dir's skills.
     */
    readonly skillsDirs: readonly string[];
    /** Project root the single root file (`AGENTS.md`/`GEMINI.md`) is written under. */
    readonly projectRoot: string;
    /** When set, install only these skill ids (a preset selection). */
    readonly select?: readonly string[] | undefined;
    readonly noHooks?: boolean;
    readonly noIntegrations?: boolean;
}
/** The parts of a single-file managed-Markdown target that vary by filename. */
interface SingleFileMdConfig {
    /** CLI `--target` name reported on the {@link InitReport}. */
    readonly target: TargetName;
    /** The root file path (`AGENTS.md` / `GEMINI.md`). */
    readonly filePath: string;
    /** The merge helper that owns the dz fence for this file. */
    readonly merge: (existing: string | null, sections: readonly string[]) => string;
    /** The one-shot lossy warning surfaced once per install. */
    readonly lossyWarning: string;
}
export interface ManagedMarkdownWriteReport {
    readonly filePath: string;
    readonly changed: boolean;
    readonly bytes: number;
    /** The complete candidate bytes, returned so callers can run pure post-merge checks. */
    readonly content: string;
}
/**
 * The one read/merge/write path for every root managed-Markdown projection.
 * `write:false` is check-only and never creates a directory or target file.
 * A max-byte refusal happens before mkdir/write, leaving the target byte-identical.
 */
export declare function writeManagedMarkdown(projectRoot: string, sections: readonly string[], config: Pick<SingleFileMdConfig, 'filePath' | 'merge'>, options?: {
    readonly write?: boolean;
    readonly maxBytes?: number;
}): ManagedMarkdownWriteReport;
/**
 * Aggregate every selected skill into ONE root `AGENTS.md`, merging into any
 * user-authored file (dz owns only its fenced block). Thin wrapper over
 * {@link runInitSingleFileMd}. See it for the full contract.
 */
export declare function runInitAgentsMd(options: AgentsMdInitOptions): InitReport;
/**
 * Aggregate every selected skill into ONE root `GEMINI.md` (Gemini CLI / Code
 * Assist), merging into any user-authored file (dz owns only its fenced block).
 * Thin wrapper over {@link runInitSingleFileMd} — same single-file aggregation
 * as agents-md, different filename + merge helper. See it for the full contract.
 */
export declare function runInitGeminiMd(options: AgentsMdInitOptions): InitReport;
export interface AgentsPolicySyncOptions {
    readonly projectRoot: string;
    /** Verify only. No directory or file is created, even when AGENTS.md is absent. */
    readonly check?: boolean;
    /** Test/extension seam; production uses the fixed ordered registry. */
    readonly sources?: readonly PolicySource[];
}
export interface AgentsPolicySyncReport {
    readonly filePath: 'AGENTS.md';
    /** In check mode: the target would change. In write mode: the target did change. */
    readonly changed: boolean;
    readonly written: boolean;
    readonly inSync: boolean;
    readonly blocks: readonly {
        readonly id: string;
        readonly sha: string;
    }[];
    readonly missing: readonly string[];
    readonly drift: readonly PolicyDriftFinding[];
    readonly budget: AgentsMdBudget;
    readonly warnings: readonly string[];
}
/**
 * Refresh or verify the policy fence in root AGENTS.md. Source reads are an
 * explicit I/O shell around the pure agents-policy module; missing/unreadable
 * input returns inconclusive evidence and never writes a partial projection.
 */
export declare function runSyncAgentsPolicy(options: AgentsPolicySyncOptions): AgentsPolicySyncReport;
/** Compile every skill in `skillsDir` for `target` and apply it under `projectRoot`. */
export declare function runInit(options: InitOptions): Promise<InitReport>;
/** Options for {@link runVerify}. */
export interface VerifyOptions {
    readonly skillsDir: string;
    /** Target to verify against. Default `claude-code`. */
    readonly target?: TargetName;
}
/** Per-skill outcome of {@link runVerify}. */
export interface VerifySkillResult {
    readonly id: string;
    readonly ok: boolean;
    readonly errors: string[];
    readonly warnings: string[];
}
/** The outcome of {@link runVerify}. */
export interface VerifyReport {
    readonly target: TargetName;
    readonly skillsDir: string;
    readonly total: number;
    readonly valid: number;
    readonly skills: VerifySkillResult[];
}
/** Compile every skill for `target` and report whether each verifies. */
export declare function runVerify(options: VerifyOptions): Promise<VerifyReport>;
/** Options for {@link runSync}. */
export interface SyncOptions {
    /** Canonical skill pack directory (single source). */
    readonly canonicalDir?: string;
    /** Multiple canonical pack directories (multi-source). Takes precedence over canonicalDir. */
    readonly canonicalDirs?: readonly string[];
    /** Project root containing the legacy `.claude/skills` tree. */
    readonly projectRoot: string;
    /** Report only, write nothing. */
    readonly dryRun?: boolean;
    /** Overwrite drifted legacy files. Default `false`. */
    readonly force?: boolean;
}
/** Per-skill outcome of {@link runSync}. */
export interface SyncSkillResult {
    readonly id: string;
    readonly status: 'in-sync' | 'missing' | 'drift';
    readonly written: string[];
}
/** The outcome of {@link runSync}. */
export interface SyncReport {
    readonly dryRun: boolean;
    readonly skills: SyncSkillResult[];
    readonly summary: {
        total: number;
        inSync: number;
        missing: number;
        drift: number;
    };
    /**
     * Canonical skill directories that could not be LOADED. Additive, always present.
     * See {@link InitReport.failures} — same contract, same reason.
     */
    readonly failures: readonly SkillLoadFailure[];
}
/** Compare each canonical skill (compiled for Claude Code) to the legacy tree. */
export declare function runSync(options: SyncOptions): Promise<SyncReport>;
/** A detected legacy CLI installation. */
export interface MigrateDetection {
    readonly manifest: string;
    readonly version: string;
    readonly components: string[];
    readonly fileCount: number;
}
/** The outcome of {@link runMigrate}. */
export interface MigrateReport {
    readonly projectRoot: string;
    readonly detections: MigrateDetection[];
    readonly skillsFound: number;
    readonly recommendation: string;
}
/** Detect keysarium/bto/etc installations and report migration path. */
export declare function runMigrate(options: {
    projectRoot: string;
}): MigrateReport;
/** A single {@link runDoctor} check. */
export interface DoctorCheck {
    readonly name: string;
    readonly ok: boolean;
    readonly detail: string;
}
/** The outcome of {@link runDoctor}. */
export interface DoctorReport {
    readonly node: string;
    readonly checks: DoctorCheck[];
    readonly ok: boolean;
}
/** Report environment diagnostics for the harness. */
export declare function runDoctor(options: {
    projectRoot: string;
}): Promise<DoctorReport>;
export interface CodexHooksSyncOptions {
    /** Defaults to `$CODEX_HOME`, then `~/.codex`. Every automated probe passes a temp dir (AM-11). */
    readonly codexHome?: string;
    /** Verify only. NOTHING is created — not even the helper directory. */
    readonly check?: boolean;
    /** Remove manifest-attributed entries and stop. */
    readonly remove?: boolean;
    /** Absolute interpreter for the emitted command. Defaults to `process.execPath` (AM-32). */
    readonly nodePath?: string;
    /**
       * Test seam: `false` skips EVERY live runtime call — the `$SHELL -lc` liveness self-probe AND the
       * `hooks/list` trust query. Both spawn processes (the RPC drives a real `codex app-server`), which
       * is seconds per install; a test that installs six times to check backup pruning is measuring
       * pruning, not the runtime. With it off, `trust` is reported `'unknown'` rather than assumed.
       */
    readonly liveness?: boolean;
    /** Test seam. Production probes the real binary. */
    readonly codexVersion?: string | null;
    readonly now?: string;
    /**
     * Run the LIVE veto probe (ADR-002). Default `true` whenever live calls are enabled — a report
     * that says `ready` without one is the CRITICAL finding this option exists to close.
     * `false` (the CLI's `--no-verify`) never yields a success word and never exits 0.
     */
    readonly verify?: boolean;
    /**
     * MUTUAL EXCLUSION SEAM (feature qe-bridge-claude, round-2 CRITICAL C2). The caller wraps ONLY the
     * registry read-plan-write transaction — the part where two dz processes can lose each other's
     * entries. It must NOT span the live probes: those spawn a real `codex app-server` turn and can
     * block for minutes, far past any advisory lock's stale threshold, at which point a waiter is
     * entitled to break the lock and the holder becomes a liar. Default: run unwrapped.
     */
    readonly criticalSection?: <T>(fn: () => T) => T;
    /** The project whose consent the probe runs under (`--project`). See {@link runCodexVetoProbe}. */
    readonly project?: string;
    /** Pinned probe model id; defaults to `DZ_CODEX_PROBE_MODEL`, then codex's own configured model. */
    readonly probeModel?: string;
    /** Test seam: replace the live probe. Production runs {@link runCodexVetoProbe}. */
    readonly probe?: (options: CodexVetoProbeOptions) => CodexVetoProbeRun;
}
export interface CodexHooksSyncReport {
    readonly codexHome: string;
    readonly registryPath: string;
    /** Both managed entries are present in the file (recomputed from the FILE, not the manifest). */
    readonly installed: boolean;
    /** The emitted command actually RUNS through `$SHELL -lc`. A hook that cannot execute is not armed. */
    readonly executable: boolean;
    readonly written: boolean;
    readonly removed: number;
    readonly foreignPreserved: number;
    readonly unattributable: number;
    readonly drift: readonly string[];
    readonly trust: 'trusted' | 'trust-pending' | 'unknown';
    readonly codexVersion: string | null;
    /** The live veto probe's verdict. `null` ⇒ no probe ran (`--no-verify`, or the test seam). */
    readonly verify: VetoProbeResult | null;
    /** A live, non-bypassed probe ran AND witnessed our block. The only route to a success word. */
    readonly verified: boolean;
    /**
     * armed ∧ trusted, PROVEN — installed + executable + trusted + a witnessed live block. This is
     * the single predicate the CLI's `ready` line is allowed to read (AM-17 / G-G).
     */
    readonly ready: boolean;
    /** 0 = armed+trusted · 1 = not armed / drift / refusal · 3 = inconclusive. */
    readonly exitCode: 0 | 1 | 3;
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
    /** Written paths, for the declared-write-set test. */
    readonly writes: readonly string[];
}
/** The one place that decides WHERE `hooks.json` lives. Exported (feature qe-bridge-claude) so the
 * CLI can take the `codex-hooks` advisory lock BESIDE that registry — a lock in this repo's `.dz/`
 * would not serialize a writer operating from another checkout. */
export declare function resolveCodexHome(explicit: string | undefined): string;
/**
 * Run the emitted command THE WAY THE RUNTIME WILL — through `$SHELL -lc` (AM-32 / G-L).
 *
 * MEASURED: the codex hook runner spawns via `$SHELL -lc`, and under nvm/asdf/volta a
 * non-interactive login shell frequently lacks `node`. The helper then exits **127**, which the
 * runtime reads as **ALLOW** — a blocking guard that is silently dead in the fail-open direction,
 * with the helper's own self-failure note unable to fire because the process never started.
 * Grading on file presence would call that "installed".
 */
export declare function probeHookLiveness(command: string, payload: string): {
    readonly status: number | null;
    readonly stderr: string;
};
export declare function runSyncCodexHooks(options?: CodexHooksSyncOptions): CodexHooksSyncReport;
export interface CodexVetoProbeOptions {
    readonly paths: CodexHooksPaths;
    /** Where the probe runs. Absent ⇒ a hermetic temp workspace that opts INTO block mode. */
    readonly project?: string | undefined;
    /** Pinned model id (`DZ_CODEX_PROBE_MODEL`). Absent ⇒ codex's own configured default. */
    readonly model?: string | undefined;
    readonly timeoutMs?: number | undefined;
    readonly trustStatus?: CodexHookTrustStatus | undefined;
    readonly recordedCodexVersion?: string | undefined;
    readonly probedCodexVersion?: string | undefined;
}
export interface CodexVetoProbeRun {
    readonly evidence: VetoProbeEvidence;
    readonly result: VetoProbeResult;
    /** The directory the probe ran in, kept for the transcript record. */
    readonly workspace: string;
    readonly command: string;
    readonly notes: readonly string[];
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
export declare function runCodexVetoProbe(options: CodexVetoProbeOptions): CodexVetoProbeRun;
/**
 * Is the sentinel there? `true` / `false` / **`null` when we could not tell**.
 *
 * `existsSync` answers `false` for BOTH "it is not there" and "I could not look" — it swallows
 * EACCES, ENOTDIR, ELOOP and every I/O error into the same word that means "the command was
 * blocked" (fix round 2, R2-4). Only ENOENT is an established ABSENCE; every other errno is a
 * failed observation and must reach `inconclusive`.
 */
export declare function statSentinelPresence(path: string): {
    readonly present: boolean | null;
    readonly error?: string;
};
/**
 * Drive `codex app-server` over stdio for one `hooks/list` call.
 *
 * MEASURED headless (M0 spike, probe 1): `initialize` → `initialized` → `hooks/list` answers with
 * `key`, `currentHash`, `trustStatus` and `sourcePath` for every discovered entry, no TUI involved.
 */
export declare function listCodexHooks(codexHome: string, cwd?: string): readonly HooksListHookMetadata[] | null;
export {};
//# sourceMappingURL=operations.d.ts.map