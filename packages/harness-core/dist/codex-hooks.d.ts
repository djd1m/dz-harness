/**
 * The Codex hook registry model (`crossrt-2-codex-hooks`, ADR-001).
 *
 * Pure: paths, the managed entry set, sha-based attribution, the manifest, drift, and the TOML text
 * of a trust block. Every filesystem and process action lives in `operations.ts`.
 *
 * ## Measured facts this module encodes (M0 spike, codex-cli 0.147.0 — see
 * `features/crossrt-2-codex-hooks/07_code_changes/probe-results/spike-arming.md`)
 *
 * - `$CODEX_HOME/hooks.json` is the user registry and **`CODEX_HOME` relocates discovery**, which is
 *   what makes every automated probe hermetic (G-H). `$CODEX_HOME/hooks/hooks.json` is the PLUGIN
 *   bundle layout and does not fire.
 * - Entries are trust-gated. An untrusted entry is silently not run. Trust is persisted per entry in
 *   `$CODEX_HOME/config.toml` as `[hooks.state."<key>"] trusted_hash = "<currentHash>"`, and both
 *   `key` and `currentHash` come from the runtime's own `hooks/list` RPC — they are **read, never
 *   computed**, because `currentHash`'s preimage is internal to codex.
 * - `timeout` is in SECONDS and IS honored (600 → 5, MEASURED). `timeoutSec` in an entry is
 *   **silently ignored** and leaves the 600 s default in place — which is why this module emits
 *   `timeout` and a test pins the key set (AM-15, now probe-proven by spike S2).
 * - The hook runner spawns via `$SHELL -lc`, so the emitted command is a SHELL string: the
 *   interpreter is an absolute `process.execPath` and both paths are single-quoted (AM-32/AM-35d).
 *
 * @packageDocumentation
 */
/**
 * Bump when a helper BODY changes: a changed body changes codex's `currentHash` ⇒ re-trust.
 *
 * 2 — the independent-QE fix round: the veto note stopped persisting the raw command line and the
 * notes log/dir modes are now enforced on every write (finding 8).
 * 3 — fix round 2: the note's `commandSynopsis` is a binary NAME or `(redacted)` — an
 * env-assignment first token (`SECRET=xyz ssh …`) carried the credential the redaction removed
 * everywhere else (R2-8).
 */
export declare const DZ_HOOK_HELPER_VERSION = 3;
/** Seconds. Probe-proven (spike S2): `timeout` is honored, the unset default is 600 s. */
export declare const DZ_HOOK_TIMEOUT_SECONDS = 5;
/** The wide matcher (AM-8). Narrowing needs a recorded live probe; the guard keys on the payload. */
export declare const DZ_VETO_MATCHER = "Bash|shell|local_shell";
export interface CodexHooksPaths {
    readonly codexHome: string;
    readonly registry: string;
    readonly configToml: string;
    readonly helperDir: string;
    readonly vetoHelper: string;
    readonly recallHelper: string;
    readonly manifest: string;
    readonly errorLog: string;
}
/** Every path this leg touches, all `CODEX_HOME`-relative (AM-13). */
export declare function codexHooksPaths(codexHome: string): CodexHooksPaths;
/** The EMITTER's write-set (AM-12). The RUNTIME's is stated separately — see {@link runtimeWriteSet}. */
export declare function emitterWriteSet(paths: CodexHooksPaths): readonly string[];
/**
 * The RUNTIME's write-set (AM-33). Exactly one path beyond the emitter's, and it is
 * `CODEX_HOME`-local: a helper must never create a `.dz/` inside a repository the user merely ran
 * `codex` in. (Recall rows are the one exception and they are opt-in-gated: they land in an
 * ALREADY-EXISTING opted-in project's `.dz/`, so nothing is ever created.)
 */
export declare function runtimeWriteSet(paths: CodexHooksPaths): readonly string[];
/** A single quote inside a single-quoted shell word cannot be escaped — such a path is REFUSED. */
export declare function isSafeForSingleQuote(path: string): boolean;
export declare function singleQuote(path: string): string;
/**
 * The shell string codex runs. Absolute interpreter + single-quoted paths (AM-32/AM-35d).
 * @throws when either path cannot be safely quoted — never emit a broken entry that READS installed.
 */
export declare function buildHookCommand(nodePath: string, scriptPath: string): string;
export type CodexHookId = 'codex-veto' | 'codex-recall';
export type CodexHookEvent = 'PreToolUse' | 'UserPromptSubmit';
export interface CodexHookSpec {
    readonly id: CodexHookId;
    readonly event: CodexHookEvent;
    readonly matcher?: string;
    readonly script: 'veto' | 'recall';
}
/** The two entries this leg ships, and nothing else. */
export declare const CODEX_MANAGED_HOOKS: readonly CodexHookSpec[];
export interface BuildManagedEntriesOptions {
    readonly nodePath: string;
    readonly paths: CodexHooksPaths;
}
export interface ManagedEntry {
    readonly id: CodexHookId;
    readonly event: CodexHookEvent;
    readonly command: string;
    readonly entry: Record<string, unknown>;
}
/**
 * Build the managed entries.
 *
 * Key set is EXACTLY `{matcher?, hooks:[{type, command, timeout}]}` (AM-15). `timeout` is included
 * because spike S2 recorded a probe proving the registry loads with it AND honors it; every other
 * key stays out until it has its own probe.
 */
export declare function buildManagedEntries(opts: BuildManagedEntriesOptions): readonly ManagedEntry[];
/** `managed` in the shape {@link mergeManagedHookEntries} takes. */
export declare function managedByEvent(entries: readonly ManagedEntry[]): Record<string, unknown[]>;
export declare function codexHookSha256(text: string): string;
export interface CodexHookManifestEntry {
    readonly id: CodexHookId;
    readonly event: CodexHookEvent;
    readonly matcher?: string;
    readonly commandSha256: string;
    /** The runtime trust key, as reported by `hooks/list`. Absent until a list succeeded. */
    readonly trustKey?: string;
}
export interface CodexHookVerifyRecord {
    readonly verdict: string;
    readonly trust: string;
    readonly bypassed: boolean;
    readonly at: string;
    readonly transcript?: string;
}
export interface CodexHookManifest {
    readonly version: 1;
    readonly writtenAt: string;
    readonly codexVersion: string;
    readonly registryPath: string;
    readonly helperVersion: number;
    readonly nodePath: string;
    readonly entries: readonly CodexHookManifestEntry[];
    readonly lastVerify?: CodexHookVerifyRecord;
}
export interface BuildManifestOptions {
    readonly entries: readonly ManagedEntry[];
    readonly paths: CodexHooksPaths;
    readonly codexVersion: string;
    readonly writtenAt: string;
    readonly nodePath: string;
    readonly trustKeys?: Readonly<Record<string, string>>;
    readonly lastVerify?: CodexHookVerifyRecord;
}
export declare function buildCodexHookManifest(opts: BuildManifestOptions): CodexHookManifest;
export declare function parseCodexHookManifest(text: string): CodexHookManifest | undefined;
/**
 * Attribution is `codexHookSha256(command) ∈ manifest` — never a substring guess.
 *
 * ADR-001 §3: dz deletes only what it can PROVE it wrote. An entry that merely looks like ours (it
 * mentions our helper filename) but whose command hash is absent from the manifest is KEPT, counted
 * in `unattributable`, and warned about. A hand-edited managed command therefore survives.
 */
export declare function isDzManagedEntry(entry: unknown, manifest: CodexHookManifest | undefined): boolean;
/**
 * Rebuild an OWNED entry from only the handlers that are NOT ours — per-HANDLER attribution.
 *
 * ADR-001 §5 promises that dz deletes only what it can prove it wrote. Attribution was applied to a
 * whole MATCHER GROUP: a group holding one dz handler and one of the user's was removed (or
 * replaced) wholesale, so a foreign handler was deleted by a rule written to protect it
 * (independent review, finding 6). One dz handler in the group must cost exactly that handler.
 *
 * Returns `null` when every handler in the entry was ours (the entry itself is then dropped), and
 * a rebuilt entry — same keys, same order, minus our handlers — when something foreign survives.
 * A legacy FLAT entry (`{type, command}`) is one handler and has nothing to salvage.
 */
export declare function retainForeignHandlers(entry: unknown, manifest: CodexHookManifest | undefined): unknown | null;
/** Cheap resemblance test — drives the `unattributable` COUNT only, never a deletion. */
export declare function looksLikeDzEntry(entry: unknown): boolean;
export interface CodexRegistry {
    /** Every top-level key other than `hooks`, preserved verbatim. */
    readonly rest: Record<string, unknown>;
    readonly hooks: Record<string, unknown[]>;
}
export type ParseRegistryResult = {
    readonly ok: true;
    readonly registry: CodexRegistry;
} | {
    readonly ok: false;
    readonly error: string;
};
/**
 * Parse an existing registry. An unparseable file is an ERROR, never an empty registry: silently
 * treating it as `{}` would overwrite entries we promised to preserve (I1).
 */
export declare function parseCodexRegistry(text: string | undefined): ParseRegistryResult;
export declare function serializeCodexRegistry(registry: CodexRegistry): string;
export interface CodexHooksPlan {
    readonly registry: CodexRegistry;
    readonly text: string;
    readonly changed: boolean;
    readonly foreignPreserved: number;
    readonly unattributable: number;
}
export interface PlanCodexHooksInput {
    readonly currentText: string | undefined;
    readonly entries: readonly ManagedEntry[];
    readonly manifest: CodexHookManifest | undefined;
}
/**
 * Compute the merged registry.
 *
 * The merge itself is `mergeManagedHookEntries` — the SAME implementation the Claude path uses
 * (AM-3 / G-E). Only the attribution predicate differs.
 */
export declare function planCodexHooks(input: PlanCodexHooksInput): {
    ok: true;
    plan: CodexHooksPlan;
} | {
    ok: false;
    error: string;
};
export interface RemoveCodexHooksResult {
    readonly registry: CodexRegistry;
    readonly text: string;
    readonly removed: number;
    readonly changed: boolean;
    readonly unattributable: number;
}
/**
 * `--remove`: delete ONLY manifest-attributed entries.
 *
 * With the manifest deleted this removes **zero** entries and reports them all as `unattributable`.
 * That is the intended, conservative behaviour: dz never deletes what it cannot prove it wrote.
 */
export declare function removeCodexHooks(currentText: string | undefined, manifest: CodexHookManifest | undefined): {
    ok: true;
    result: RemoveCodexHooksResult;
} | {
    ok: false;
    error: string;
};
export interface DriftReport {
    /** Both managed entries present in the registry and attributable. */
    readonly installed: boolean;
    readonly presentIds: readonly CodexHookId[];
    readonly missingIds: readonly CodexHookId[];
    readonly foreignPreserved: number;
    readonly unattributable: number;
    /** A managed command whose hash is not the one the manifest records for that id. */
    readonly drifted: readonly CodexHookId[];
}
/** `--check` recomputes from the FILE; it never trusts the manifest's claim on its own. */
export declare function diffCodexHooks(currentText: string | undefined, entries: readonly ManagedEntry[], manifest: CodexHookManifest | undefined): DriftReport;
/** codex's snake_case event spelling inside a trust key (MEASURED from `hooks/list`). */
export declare function trustEventName(event: CodexHookEvent): string;
/**
 * Compare two event spellings the way the runtime actually spells them.
 *
 * MEASURED, both on this machine, on the SAME response shape:
 * - the trust KEY embeds `pre_tool_use` / `user_prompt_submit` (snake_case);
 * - `hooks/list`'s `eventName` FIELD is `preToolUse` / `userPromptSubmit` on **codex-cli 0.148.0**
 *   (reproducer: `listCodexHooks(<temp home>)` after an install — the rows are printed verbatim in
 *   `07_code_changes/probe-results/fixround/trust-diagnosis.txt`).
 *
 * Pinning either spelling alone silently drops every row: the fix round's first cut compared the
 * field against the KEY spelling, `hooks/list` matched 0 of 2 entries, trust was never written, and
 * the live probe's ARMED leg stopped blocking. Case and separators are therefore normalised away —
 * the spelling is the runtime's cosmetic choice, the EVENT is the fact.
 */
export declare function sameHookEvent(a: string, b: string): boolean;
/**
 * The trust key codex uses: `<sourcePath>:<snake_event>:<groupIndex>:<hookIndex>`.
 *
 * This is the EXPECTED spelling, used only to cross-check what `hooks/list` reports. The install
 * path uses the reported key verbatim — a computed key that drifts from the runtime's would arm
 * nothing while reading like success.
 */
export declare function expectedTrustKey(registryPath: string, event: CodexHookEvent, groupIndex: number, hookIndex: number): string;
/**
 * Split a `hooks/list` trust key into its parts, or `null` when it is not one.
 *
 * MEASURED shape: `<sourcePath>:<snake_event>:<groupIndex>:<hookIndex>`. The path may itself carry
 * a colon, so the split is anchored at the END — the last two fields are the indices and the third
 * from the end is the event.
 *
 * The INDICES are deliberately not predicted: they are positions inside the user's registry, and a
 * foreign entry shifts them. What IS ours to require is the rest — this key names OUR registry and
 * OUR event (fix round 2, R2-7: a row carrying an arbitrary key was selected on path+event+command
 * alone, and the key is what dz then writes trust against).
 */
export declare function parseTrustKey(key: string): {
    readonly sourcePath: string;
    readonly event: string;
    readonly groupIndex: number;
    readonly hookIndex: number;
} | null;
export interface HookTrustRow {
    readonly key: string;
    readonly trustedHash: string;
}
export declare const DZ_TRUST_BEGIN = "# --- dz codex hooks trust (managed block, dz-rewritten) ---";
export declare const DZ_TRUST_END = "# --- end dz codex hooks trust ---";
/**
 * Render dz's trust rows as a MANAGED BLOCK in `config.toml`.
 *
 * A managed block, not a whole-file rewrite: `~/.codex/config.toml` already carries a
 * `ruvnet-brain` managed block and seven `[projects."…"]` trust rows on this machine (MEASURED),
 * and dz is not the only writer. The block is delimited so a re-run replaces exactly dz's rows and
 * nothing else.
 */
export declare function renderTrustBlock(rows: readonly HookTrustRow[]): string;
export type TrustBlockResult = {
    readonly ok: true;
    readonly text: string;
} | {
    readonly ok: false;
    readonly error: string;
};
/**
 * Replace (or append) dz's managed trust block, leaving every other byte of config.toml alone.
 *
 * The fence must be **exactly one well-ordered pair**, or dz refuses (independent review, finding
 * 9). The old `indexOf`-pair logic was satisfiable by a damaged file in three ways, and each one
 * eats the user's TOML on the NEXT sync: a lone BEGIN made the rewrite append a second block, so
 * the following run's `begin…end` window spanned everything between the orphan marker and the new
 * block's END; a reversed pair did the same; duplicate pairs left an orphan block behind. Refusing
 * costs one manual edit — the alternative silently deletes `[projects."…"]` trust rows.
 */
export declare function upsertTrustBlock(configToml: string, rows: readonly HookTrustRow[]): TrustBlockResult;
export interface HooksListHookMetadata {
    readonly key: string;
    readonly eventName: string;
    readonly command?: string | null;
    readonly sourcePath: string;
    readonly source: string;
    readonly currentHash: string;
    readonly trustStatus: 'managed' | 'untrusted' | 'trusted' | 'modified';
    readonly enabled: boolean;
    readonly timeoutSec: number;
}
export interface SelectOwnHookOptions {
    /** The registry file dz wrote. A row from any other source path is not dz's row. */
    readonly registryPath: string;
}
/**
 * Pick, from a `hooks/list` response, the metadata of the entries WE wrote.
 *
 * The match is on THREE facts, not one (independent review, finding 7): the row's `sourcePath` is
 * the registry dz wrote, its `eventName` is the event dz registered the entry under, and the
 * command string is byte-equal. Command alone was not enough — a project-scoped
 * `<repo>/.codex/hooks.json` DOES load on codex 0.148 (MEASURED, see ADR-004's addendum), so a
 * shadow copy of dz's own command line could supply the `trusted` row that armed the user-global
 * entry nobody had approved.
 *
 * AMBIGUITY IS REFUSED, not resolved: two rows claiming the same entry drop BOTH, because the one
 * dz would arm is then a coin flip and the trust write is keyed by the row it picked.
 */
export declare function selectOwnHookMetadata(hooks: readonly HooksListHookMetadata[], entries: readonly ManagedEntry[], options: SelectOwnHookOptions): {
    readonly id: CodexHookId;
    readonly meta: HooksListHookMetadata;
}[];
//# sourceMappingURL=codex-hooks.d.ts.map