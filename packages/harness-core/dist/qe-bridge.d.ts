/**
 * `dz qe-bridge` — the pure half of the reverse QE bridge (feature qe-bridge-claude, ADR-001).
 *
 * WHY THIS EXISTS. The cross-family QE rule ("the model that writes code must not self-review") is
 * enforceable today in exactly one direction: a Claude driver dispatches `codex exec` to review
 * Claude work. When CODEX hosts the run there is no vehicle for the mandatory Claude review —
 * `buildReqeBrief` literally returns `codexCmdTemplate: null` for the claude branch
 * (`reqe.ts:165-171`). This module turns the raw `claude -p` primitive into a Step-8-shaped review
 * with a PARSEABLE signoff that the existing `dz reqe --done` settles unchanged.
 *
 * THE DOCTRINE, in three rules, each of which has scar tissue behind it:
 *
 * 1. PARSE-NEVER-SYNTHESIZE. Empty, gradeless, marker-less or JSON-less output is a FAILED call
 *    with a NAMED reason — never a clean review, never a synthesized `findings: []`. The deleted
 *    `{grade:'codex-review', gaps:[]}` stub is the canonical bug this rule exists to prevent.
 * 2. LAST-ANCHORED, MULTI-CHANNEL AGREEMENT. Content under review flows INTO the prompt and comes
 *    back quoted, so an earlier planted verdict must lose to the genuine terminal one (the G-F1
 *    marker-injection lesson, `feature-adr-routing.ts:1522-1526`). Three channels — the LAST marker
 *    line, the LAST fenced signoff block, and `extractReportGrade` over the report body — must all
 *    EXIST and AGREE. This is not only an injection defence: MEASURED at T0 on this machine,
 *    `claude -p` prints a session-start hook banner on stdout BEFORE the answer, so first-match
 *    parsing reads host noise even with no adversary in the picture.
 * 3. INGRESS DEFANG. Repo content is untrusted with respect to the verdict grammar: every extract
 *    is neutralised before embedding, so quoted content can never mint a verdict.
 *
 * IMPURE PLUMBING (spawn, timeouts, file writes) lives in `harness-cli`'s `cmdQeBridge`; everything
 * here is pure and directly testable.
 *
 * DELIBERATELY NOT UNIFIED with `parseCodexGrade` (`feature-adr-routing.ts:1343-1347`, first-match,
 * A–D): that parser answers a different threat model. The divergence is named in ADR-001 and is a
 * candidate later refactor, not a blocker.
 */
export declare const QE_BRIDGE_SCHEMA = "qe-bridge-signoff-1";
export declare const QE_BRIDGE_FAILURE_SCHEMA = "qe-bridge-failure-1";
/**
 * Loud refusal ceiling for the assembled prompt. NOT a truncation budget: silently trimming the
 * evidence would produce a review of something other than the change (the stance of
 * `feature-adr-routing.ts:1274-1285`). Sized for a real review, not a probe.
 */
export declare const CLAUDE_BRIDGE_PROMPT_CEILING_CHARS = 200000;
/**
 * Data-only default id order — the same policy as `KNOWN_CODEX`. An allowlist says a name is
 * SPELLABLE; only the probe says it ANSWERS (MEASURED at T0: `--model no-such-model-xyz` exits 1).
 * Ids outside this map are still usable via `--model`; this is the default search order.
 */
export declare const KNOWN_CLAUDE: Record<string, 1>;
/** The terminal verdict grammar: `QE-BRIDGE-SIGNOFF grade=<A-F> findings=<n>`. */
export declare const BRIDGE_MARKER = "QE-BRIDGE-SIGNOFF";
/** The fenced block's info string. */
export declare const BRIDGE_FENCE_LABEL = "qe-bridge-signoff";
/** The boundary that closes an embedded extract in the prompt (defanged on ingress). */
export declare const BRIDGE_EXTRACT_END = "<<<END-EXTRACT>>>";
export type BridgeFamily = 'claude' | 'openai';
/**
 * THE canonical model-spec → FAMILY mapper (feature dz-workflow-run, ADR-002 W20 / AM-17).
 *
 * Family is the load-bearing input of the cross-model rule: the family that WROTE the code may not
 * be the family that reviews it. That rule is only as trustworthy as the mapping behind it, so
 * there is exactly ONE mapping — `cmdQeBridge`'s `--coder-family` normalization and the loop
 * runner's same-family comparison both call this function, and an agreement test pins them
 * together over a representative spec list (ADR-002 Confirmation-2b). Two lookalike normalizations
 * is how a codex-coded run comes to be reviewed by codex under a claude label.
 *
 *   • `'codex'` (the bare alias) and every `codex*` / `gpt*` / `openai*` spec — including the
 *     routing forms `codex:<id>` and `codex:<id>:<effort>` — map to `'openai'`;
 *   • `opus` | `sonnet` | `haiku` | `fable` and every `claude*` spec map to `'claude'`;
 *   • null / empty / unrecognized maps to `null` — NOT to a default. An unroutable spec is a
 *     refusal the caller must make loudly (`plan-model-unroutable`, or `--default-family`), never a
 *     silent guess: guessing here would silently decide who is allowed to review.
 *
 * Case- and whitespace-insensitive; the domain is the SPEC string, not a provider API name.
 *
 * NOT related to `trainingPairFamily` (`feature-adr-checkpoints.ts`), whose `'claude' | 'codex'`
 * domain is a recorded DATASET schema — a named pre-existing divergence, deliberately not migrated.
 */
export declare function modelFamily(spec: string | null | undefined): BridgeFamily | null;
/**
 * The CLOSED set of named non-successes. A closed set is testable; free text is not (the
 * `parseLandingSignal` precedent, `feature-adr-routing.ts:1097-1108`). Every member is exercised by
 * a test — see the taxonomy describe in `test/qe-bridge.test.ts`.
 */
export type BridgeFailureReason = 'claude-not-found' | 'claude-not-logged-in' | 'probe-failed' | 'timeout' | 'exit-nonzero' | 'empty-output' | 'envelope-unparseable' | 'no-grade-marker' | 'marker-not-terminal' | 'no-signoff-json' | 'grade-mismatch' | 'ambiguous-grade' | 'findings-count-mismatch' | 'same-family-review-refused' | 'prompt-over-ceiling' | 'audit-write-failed' | 'report-write-failed';
/** Every member of the closed set, as DATA — so a test can drive the list instead of restating it
 * (the round-1 taxonomy test was a hand-written map of strings, which proves nothing about
 * reachability). */
export declare const BRIDGE_FAILURE_REASONS: readonly ["claude-not-found", "claude-not-logged-in", "probe-failed", "timeout", "exit-nonzero", "empty-output", "envelope-unparseable", "no-grade-marker", "marker-not-terminal", "no-signoff-json", "grade-mismatch", "ambiguous-grade", "findings-count-mismatch", "same-family-review-refused", "prompt-over-ceiling", "audit-write-failed", "report-write-failed"];
export interface BridgeFinding {
    n: number;
    severity: string;
    title: string;
    file?: string;
    line?: number;
}
export interface BridgeSignoff {
    schema: typeof QE_BRIDGE_SCHEMA;
    slug: string;
    /** A–F, agreed across all three channels. */
    grade: string;
    /** The PROBED id, not the requested one. */
    gradedBy: {
        family: 'claude';
        model: string;
    };
    coderFamily: BridgeFamily;
    /** From the JSON block ONLY; `[]` only when the reviewer wrote it. */
    findings: BridgeFinding[];
    promptSha256: string;
    elapsedMs: number;
    emittedAt: string;
}
/** Where each channel was found, for the audit bundle: an auditor can re-derive the verdict from
 * the retained raw stdout without trusting this process's summary. */
export interface BridgeChannels {
    /** Byte offset of the LAST signoff marker line inside the reviewer's result text. */
    markerIndex: number;
    /** Byte offset of the LAST fenced signoff block. */
    fenceIndex: number;
    /** Length of the reviewer's result text (the envelope payload, not raw stdout). */
    resultChars: number;
    /** Length of the raw stdout the envelope was extracted from. */
    rawChars: number;
}
export interface BridgeParseOk {
    ok: true;
    signoff: BridgeSignoff;
    reason: null;
    detail: string;
    channels: BridgeChannels;
}
export interface BridgeParseFail {
    ok: false;
    signoff: null;
    reason: BridgeFailureReason;
    detail: string;
    channels?: undefined;
}
/** A discriminated union: there is no state in which `ok` is true and `signoff` is null, and none in
 * which a failure carries no reason. The round-1 shape allowed both, which is how the CLI ended up
 * with a `?? 'no-grade-marker'` fallback that could launder an unknown state into a named one. */
export type BridgeParse = BridgeParseOk | BridgeParseFail;
export declare function isSafeClaudeId(id: string): boolean;
/**
 * ISOLATION (round-2 CRITICAL C1). The reviewer must judge the extracts WE send it, and nothing
 * else. Without these flags `claude -p` runs as a fully customized session in whatever directory it
 * was launched from: CLAUDE.md, skills, plugins, hooks, MCP servers and tools all load, and
 * customization output reaches stdout AHEAD of the model's answer — MEASURED on this machine, four
 * separate runs, and again in the before/after capture in `probe-results/c1-isolation-probe.txt`.
 * A parser reading that stream cannot tell the model's verdict from a hook's.
 *
 * Every flag below was PROBED on the installed runtime before being used (`claude --help` lists
 * them; a live `-p` call with the full set answered normally):
 *   --safe-mode              disables ALL customizations — CLAUDE.md, skills, plugins, hooks, MCP,
 *                            commands, agents, output styles. (Admin-managed POLICY settings still
 *                            apply — the honest residue, stated in the SKILL doc.)
 *   --strict-mcp-config      use only MCP servers from --mcp-config; we pass none, so: none.
 *   --tools ''               the reviewer needs no tools: the extracts arrive on stdin.
 *   --no-session-persistence nothing is written into the isolated working directory.
 *   --output-format json     the answer arrives as a STRUCTURED field, so text that never came from
 *                            the model cannot be mistaken for its verdict.
 * The CLI additionally runs both calls from an EMPTY temporary directory, so project-scoped
 * discovery has nothing to discover.
 */
export declare const CLAUDE_ISOLATION_ARGS: readonly string[];
/** Validated argv for the liveness probe; null when the id is unsafe. */
export declare function claudeProbeArgs(model: string): string[] | null;
/**
 * Mirror of `interpretCodexProbe` (`feature-adr-routing.ts:1310-1313`): exit 0 AND a word-bounded
 * `OK`. Substring, not equality — MEASURED at T0, this machine's `claude -p` prefixes a hook banner
 * to stdout, so an equality check would call a live model dead.
 */
export declare function interpretClaudeProbe(out: {
    stdout: string;
    exitCode: number;
}): boolean;
/**
 * Validated argv for the review call. NO inline prompt: the prompt travels on stdin (MEASURED at
 * T0 — `printf '…' | claude -p` answers with exit 0, so there is no ARG_MAX ceiling and no shell).
 */
export declare function claudeReviewArgs(model: string): string[] | null;
export type ClaudeResultExtraction = {
    ok: true;
    text: string;
} | {
    ok: false;
    reason: BridgeFailureReason;
    detail: string;
};
/**
 * Pull the assistant's final text out of `--output-format json` stdout.
 *
 * LAST-anchored like every other channel: the envelope is located by scanning candidate JSON
 * objects from the END of the stream, so anything a customization printed BEFORE it is structurally
 * outside the reviewed text. MEASURED shape (2026-08-19, `claude -p --output-format json`):
 * one object carrying `{"type":"result","subtype":"success","is_error":false,"result":"…"}`.
 */
export declare function extractClaudeResult(stdout: string): ClaudeResultExtraction;
/**
 * Neutralise the VERDICT GRAMMAR inside untrusted text before embedding it in the prompt.
 *
 * Three channels are defanged, because the verdict has three channels: the marker line, the fenced
 * block's label, and a line-anchored `GRADE: <A-F>` verdict line. Defanging only the marker (the
 * literal wording of SEC-3) would leave the third channel live — and the bridge's normal job is to
 * review a feature whose `08_qe_report.md` CONTAINS a `GRADE:` line, so an echoed extract would
 * routinely collide with the reviewer's own verdict and produce `ambiguous-grade`. This is a
 * deliberate, documented extension of SEC-3 to the whole grammar, not a drift.
 *
 * Idempotent, and byte-identical on text that carries none of the grammar.
 */
export declare function defangSignoffEchoes(text: string): string;
export interface NamedExtract {
    label: string;
    text: string;
}
export interface BridgePromptInput {
    slug: string;
    coderFamily: BridgeFamily;
    allowSameFamily: boolean;
    /** The change manifest, the ADR Confirmation section, named files — SCOPED, never a repo dump. */
    extracts: readonly NamedExtract[];
}
/**
 * The Step-8-shaped brief (the instruction list of `buildReqeBrief`, `reqe.ts:155-163`) plus the
 * output grammar. Refuses same-family review and an over-ceiling prompt, each with its named
 * reason — a refusal is a first-class result here, never a truncation or a shrug.
 */
export declare function buildBridgePrompt(input: BridgePromptInput): {
    ok: true;
    prompt: string;
} | {
    ok: false;
    reason: BridgeFailureReason;
    detail: string;
};
/**
 * PARSE-NEVER-SYNTHESIZE. All three channels must exist and agree, LAST-anchored; every miss is a
 * named reason and a null signoff.
 */
export declare function parseBridgeOutput(raw: string | null | undefined, ctx: {
    slug: string;
    coderFamily: BridgeFamily;
    model: string;
    elapsedMs: number;
    promptSha256: string;
    emittedAt: string;
}): BridgeParse;
/**
 * The AUDIT BUNDLE (round-2 M7). A record that only carries a conclusion asks the reader to trust
 * the process that wrote it. These fields let someone else re-derive the verdict: which executable
 * answered, whether it was an override, which prompt (by digest), where each channel was found in
 * the retained raw stdout, which report path was requested, and whether that report actually landed.
 */
export interface BridgeAudit {
    /** Stable id for this run — the common key across the record, the raw stdout and the report. */
    runId: string;
    /** The executable actually spawned (the resolved path when it is a path). */
    claudeBin: string;
    /** True when the executable was NOT the plain `claude` on PATH — a loud provenance marker. */
    binOverride: boolean;
    /** The `--out` path the caller asked for, recorded even (especially) when nothing was written. */
    requestedOut: string;
    /** Did a report land at `requestedOut`? A failure record says `false` in as many words, instead
     * of leaving "no report exists" as an inference from an absent file. */
    reportWritten: boolean;
    /** Where the raw reviewer stdout was retained, or null when there was none to retain. */
    rawStdoutFile: string | null;
    /** sha256 of the exact prompt sent, so the digest in the signoff can be recomputed. */
    promptSha256: string | null;
    channels?: BridgeChannels;
}
/**
 * The failure record written to `.fa-state/qe-bridge/failed-<stamp>.json`. Deliberately carries NO
 * grade field: a failed call has no verdict, and a record with a grade key would be one refactor
 * away from being read as one.
 */
export declare function buildBridgeFailureRecord(reason: BridgeFailureReason, detail: string, ctx: {
    slug: string;
    model: string | null;
    emittedAt: string;
} & Partial<BridgeAudit>): object;
/** The success record: the parsed signoff PLUS the audit bundle that lets it be re-checked. */
export declare function buildBridgeSignoffRecord(signoff: BridgeSignoff, audit: BridgeAudit): object;
/**
 * Render the human report (`08b_reqe_report.md` by default). Guaranteed to carry EXACTLY ONE
 * line-anchored `GRADE: <X>` and ≥200 chars of substance, so `settleReqeDebt` (`reqe.ts:202-215`)
 * accepts it — proved by a test that imports and EXECUTES that validator rather than assuming it.
 *
 * Every reviewer-supplied string goes through the defang on the way out: a finding titled
 * "see GRADE: A above" would otherwise mint a second verdict line and make the report unsettleable.
 */
export declare function renderBridgeReport(signoff: BridgeSignoff): string;
//# sourceMappingURL=qe-bridge.d.ts.map