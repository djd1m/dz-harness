/**
 * loop-render — the schema-driven GENERATOR of loop-designer (ADR-002): `loop-plan/1` plan →
 * ONE region-delimited, self-contained Workflow script + a sidecar `<name>.plan.json` (the plan is
 * written BEFORE and independently of the script — FR-4.1: the oracle diff compares against an
 * artifact the renderer has not touched).
 *
 * Region contract (architecture §3.1):
 *   BLOB      — verbatim bytes from the blob registry; replaced wholesale on re-render (INV-10).
 *   GENERATED — derived from the plan; replaced wholesale (lint rule `plan-binding`).
 *   USER      — the ONLY hand-editable regions; preserved BYTE-FOR-BYTE on re-render (INV-11).
 *
 * The exec fingerprint (FR-1.6 / AM-10) hashes ALL FOUR axes independently-sensitively:
 * topology (structural plan shape) + prompts (per-step prompt text ONLY) + models (per-step
 * declared model ONLY) + tools (the declared blob set with content hashes). The axis inputs are
 * NON-REDUNDANT by construction (QE round-2 G2): no axis embeds rendered text that would let it
 * subsume another. Changing ANY ONE axis alone changes the fingerprint, so a resume against a
 * stale fingerprint is REFUSED (the generated resume-guard call site supplies this hash where the
 * legacy feature-adr call site supplies inputHash alone — physical duplication only, no canonical-
 * file change).
 *
 * Merge is propose-never-clobber (§3.2): a target with no markers is refused (write
 * `<script>.proposed.js` + require --force); a USER region whose step vanished from the plan is a
 * NAMED conflict, never silently dropped.
 *
 * Pure: no fs (the CLI does the writes), no clock, no randomness.
 */
import { type LoopPlan } from './loop-plan.js';
import { type LoopBlob } from './loop-blobs.generated.js';
export declare const LOOP_RENDER_GENERATOR = "loop-render/1";
/** The checkpoint schema stamp — PINNED in v1 (QE round-6 narrowing: `checkpointing.schemaVersion`
 * is validated-away by ENACT-CKPT-OPT; the omitted-vs-explicit-default distinction false-flipped
 * the topology axis in round 3 and is now unrepresentable). Both the rendered runtime and the
 * fingerprint axis input carry this one constant. */
export declare const CKPT_SCHEMA_DEFAULT = "loop-ckpt-1";
export interface RenderManifest {
    planDigest: string;
    execFingerprint: string;
    blobs: {
        name: string;
        version: string;
        contentHash: string;
    }[];
    steps: string[];
    userRegions: string[];
}
export interface RenderResult {
    /** The full script text. */
    text: string;
    /** The sidecar plan JSON — write this FIRST, independently of the script (FR-4.1). */
    planJson: string;
    manifest: RenderManifest;
    execFingerprint: string;
}
export interface MergeResult {
    text: string;
    /** USER regions in the old file with no counterpart in the new plan — reported, never dropped. */
    conflicts: {
        stepId: string;
        reason: string;
    }[];
    /** True when the target had no markers and was refused (use --force to overwrite). */
    refused: boolean;
    proposedText?: string;
}
/** Which blobs a plan pulls in (opt-in subsystems + auto rules + requires closure). */
export declare function selectBlobs(plan: LoopPlan): LoopBlob[];
export interface ExecAxisInputs {
    topology: string;
    prompts: string;
    models: string;
    tools: string;
}
/** The four axis INPUT strings, built so no axis subsumes another (QE round-2 G2: the round-1
 * prompts axis embedded the full rendered step text, which already carried dep wiring and per-step
 * models — three of the four "independent" axes were mutually redundant, and deleting two of them
 * left every test green while a real resume-guard hole opened):
 *   topology — structural plan shape (ids, kinds, phases, deps, retry/budget/pause config,
 *              fanouts/joins/pauses) with prompt and model EXCLUDED;
 *   prompts  — per-step prompt text ONLY;
 *   models   — per-step declared model ONLY (covers fanout chain members too);
 *   tools    — the selected blob roster with content hashes.
 */
export declare function computeExecAxisInputs(plan: LoopPlan): ExecAxisInputs;
/** Per-axis hashes — exposed so the AM-10 test can assert each axis INDEPENDENTLY (a single-axis
 * plan change must flip exactly its own axis hash), not only the aggregate. */
export declare function execFingerprintAxisHashes(input: ExecAxisInputs): ExecAxisInputs;
/** Independent-axes execution fingerprint (FR-1.6/AM-10): each axis hashed separately, then the
 * four axis hashes hashed together — a change in ANY ONE axis flips the fingerprint. */
export declare function computeExecFingerprint(input: ExecAxisInputs): string;
/** Render a plan to a full script. Deterministic. */
export declare function renderPlan(plan: LoopPlan): RenderResult;
/** Extract USER regions keyed by label. */
export declare function extractUserRegions(text: string): Map<string, string>;
/**
 * Merge a fresh render over an existing target (propose-never-clobber, §3.2):
 * - target has markers → splice: new BLOB/GENERATED + OLD USER bytes (byte-for-byte, INV-11);
 *   a USER region with no counterpart in the new render is a NAMED conflict, never dropped.
 * - target has NO markers (hand-written) → refuse; return proposedText for `<script>.proposed.js`;
 *   `--force` (the caller's flag) overwrites explicitly.
 */
export declare function mergeRender(prevText: string, next: RenderResult, opts?: {
    force?: boolean;
}): MergeResult;
//# sourceMappingURL=loop-render.d.ts.map