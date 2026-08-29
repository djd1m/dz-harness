/**
 * Portable workflow trace bundles — the PURE half.
 *
 * The caller owns every external read and write. This module owns the decisions that must be
 * replayable in a test: which ledger rows belong to a run, whether the harness-record layout is
 * recognised, whether an import may touch a destination, and the exact relative writes it permits.
 * Keeping those decisions independent of the host makes a refusal a value rather than a partially
 * completed mutation.
 */
/** The version is part of the wire contract: readers refuse versions they do not understand. */
export declare const TRACE_BUNDLE_SCHEMA = "trace-bundle/1";
/** Native shelves used by both local runs and imported runs. */
export declare const TRACE_BUNDLE_LEDGER_PATH = ".dz/feature-adr/run-cost-ledger.jsonl";
export declare const TRACE_BUNDLE_RUN_META_FILE = "run-meta.json";
export interface BundleMember {
    /** path relative to the run directory, or the well-known source for non-run members */
    readonly origin: string;
    /** raw file content, verbatim — never re-serialised, never re-ordered */
    readonly content: string;
}
/** Absence is data: a portable bundle must explain every source it could not carry. */
export type MemberSlot = {
    readonly present: true;
    readonly member: BundleMember;
} | {
    readonly present: false;
    readonly reason: string;
};
export interface HarnessRecordResult {
    readonly modelsUsed: Record<string, string>;
    readonly usageEvents?: unknown[];
    readonly [key: string]: unknown;
}
/**
 * The harness record is kept whole so a consumer can recompute attribution from the transported
 * facts. These are only the fields this adapter recognises; extra persisted fields remain intact.
 */
export interface HarnessRecord {
    readonly runId: string;
    readonly timestamp: string;
    readonly agentCount: number;
    readonly args: unknown;
    readonly result: HarnessRecordResult;
    readonly [key: string]: unknown;
}
/**
 * Closed degradation vocabulary: callers can make strict-mode policy exhaustive.
 * Only `layout-unrecognised` is ACTIONABLE; `records-absent`, `no-match`, `unreadable`, and
 * `predates-model-routing` are not. The historical split follows a real-store measurement where
 * 3 of 32 distinct slugs were valid older feature-ADR runs without per-stage model routing.
 */
export type RunMetaReason = 'records-absent' | 'no-match' | 'unreadable' | 'predates-model-routing' | 'layout-unrecognised';
export type RunMeta = {
    resolved: true;
    records: HarnessRecord[];
    /** Joined records that were NOT usable, so attribution can never silently fold fewer
     * records than the run actually had. */
    skipped: {
        count: number;
        historical: number;
        unrecognised: number;
    };
} | {
    resolved: false;
    reason: RunMetaReason;
};
export type Attribution = {
    derived: true;
    rule: string;
    fromRecordIds: string[];
    byStage: Record<string, string>;
} | {
    derived: false;
    reason: string;
};
export interface TraceBundle {
    schema: string;
    provenance: {
        sourceRoot: string;
        runAddress: string;
        slug: string | null;
        runId: string | null;
        toolVersion: string;
        createdAt: string | null;
    };
    trace: MemberSlot;
    checkpoints: MemberSlot;
    ledger: {
        present: boolean;
        scanned: number;
        matched: number;
        malformed: number;
        lines: string[];
        reason?: string;
    };
    pairs: {
        included: false;
        reason: 'not-requested' | 'no-pairs-found';
    } | {
        included: true;
        files: BundleMember[];
    };
    runMeta: RunMeta;
    attribution: Attribution;
}
/** Counts make an honestly empty slice distinguishable from an unread ledger. */
export interface LedgerSelection {
    lines: string[];
    scanned: number;
    matched: number;
    malformed: number;
}
/** All external facts needed to build a bundle; optional values degrade to named absence. */
export interface BuildBundleInput {
    readonly sourceRoot: string;
    readonly runAddress: string;
    readonly slug?: string | null;
    readonly runId?: string | null;
    readonly toolVersion: string;
    readonly createdAt?: string | null;
    readonly trace?: MemberSlot | BundleMember | null;
    readonly checkpoints?: MemberSlot | BundleMember | null;
    /** null means the ledger itself was absent; each array item is one raw JSONL row. */
    readonly ledgerLines?: readonly string[] | null;
    readonly ledgerReason?: string;
    readonly includePairs?: boolean;
    readonly pairFiles?: readonly BundleMember[] | null;
    /** Each item is an already-read record file body, or an already-parsed record. */
    readonly records?: readonly unknown[] | null;
}
/** Refusals are deliberately small and discriminated so an importer cannot accidentally continue. */
export type ParseResult = {
    ok: true;
    bundle: TraceBundle;
} | {
    ok: false;
    reason: 'unparseable';
} | {
    ok: false;
    reason: 'unknown-schema';
    found: string;
} | {
    ok: false;
    reason: 'member-shape';
    member: string;
};
/** The two identities used by the existing run-addressing schemes. */
export interface RunIdentity {
    readonly slug: string | null;
    readonly runId: string | null;
}
/** Facts observed by the I/O caller; no path in the resulting plan is absolute. */
export interface ImportDestinationFacts {
    /** Target run directory relative to the explicitly supplied destination root. */
    readonly runDir?: string;
    readonly existingPaths?: readonly string[] | ReadonlySet<string>;
    readonly runDirHasContent: boolean;
    /** Identity read from the target run, or null when a fresh target has none. */
    readonly runIdentity: RunIdentity | null;
    readonly force?: boolean;
    readonly withPairs?: boolean;
    /** File name/address of the imported bundle, persisted in the run-meta sidecar. */
    readonly bundleName: string;
}
/** A caller executes writes only when ok is true; fatal refusals therefore produce no writes. */
export interface ImportPlan {
    writes: {
        path: string;
        content: string;
    }[];
    refusals: {
        path: string;
        reason: string;
    }[];
    ok: boolean;
}
/**
 * Select only rows attributable to this logical run. Slug fallback is deliberately disabled when
 * a row carries any run id: otherwise a foreign loop run sharing a slug leaks into the slice.
 */
export declare function selectLedgerRows(lines: readonly string[] | null | undefined, identity: {
    readonly runId: string | null;
    readonly slug: string | null;
} | null | undefined): LedgerSelection;
/**
 * Join persisted harness records without guessing through an unfamiliar layout. Returning no
 * records on a joined shape failure prevents a model-blind record from appearing model-aware.
 */
export declare function resolveRunMeta(records: readonly unknown[] | null | undefined, slug: string | null): RunMeta;
/**
 * Fold the labelled convenience view alongside its source records. Last-writer-wins is explicitly
 * a policy choice, and the source ids let a later consumer choose and audit a different policy.
 */
export declare function foldAttribution(records: readonly HarnessRecord[] | null | undefined): Attribution;
/** Assemble a bundle solely from facts the caller has already read. Malformed facts degrade safely. */
export declare function buildBundle(input: BuildBundleInput): TraceBundle;
/** JSON escaping changes only the container representation; member content round-trips verbatim. */
export declare function serializeBundle(bundle: TraceBundle): string;
/**
 * Recognise the complete current format or refuse it. Validation finishes before the bundle is
 * returned, so an importer can never receive a valid-looking subset of a corrupt artifact.
 */
export declare function parseBundle(text: string): ParseResult;
/**
 * Plan native-layout reconstruction without touching the destination. Every fatal check is
 * completed before writes are returned, preserving the all-or-nothing refusal boundary.
 */
export declare function planImport(bundle: TraceBundle, destFacts: ImportDestinationFacts): ImportPlan;
//# sourceMappingURL=trace-bundle.d.ts.map