export type InstrumentFreshness = 'same' | 'stale' | 'unknown';
export interface InstrumentCheckInput {
    /** realpath of the running binary, or null when it could not be resolved. */
    readonly binPath: string | null;
    /** version from the package.json that owns binPath, or null. */
    readonly binVersion: string | null;
    /** version from packages/@dzhechkov/harness-cli/package.json, or null outside the monorepo. */
    readonly treeVersion: string | null;
    /** absolute, realpath'd project root. */
    readonly projectRoot: string;
    /**
     * Whether `projectRoot` above really IS realpath'd. The caller resolves it and falls back to a
     * plain resolve when that throws; with a symlinked root that fallback compares a realpath'd
     * binary against a non-realpath'd root, and an IN-TREE binary then looks external. Containment is
     * undecidable in that state, so it is answered `unknown` rather than guessed either way.
     * Named by independent review (Claude Sonnet, 2026-09-20).
     */
    readonly projectRootRealpathed: boolean;
    readonly isMonorepo: boolean;
}
/**
 * `level` is the WHOLE verdict — the caller renders it and never re-derives one of its own. That is
 * deliberate: the first wiring of this module answered `unknown` with `ok: false` while this decider
 * answered `ok`, and two answers to one question is the defect class this repo pays for most often.
 *
 * Three values, because two would lie: `ok` (the instrument is the tree's, or the check does not
 * apply here), `warn` (measured stale — worth saying loudly, never worth failing a health command
 * that gates other people's CI), `unknown` (the evidence could not be gathered — never rendered as
 * a pass, and never as a failure either, since absence of evidence is not a defect).
 */
export interface InstrumentCheckResult {
    readonly freshness: InstrumentFreshness;
    readonly level: 'ok' | 'warn' | 'unknown';
    readonly detail: string;
}
export interface RankingStateCheckInput {
    readonly flagOn: boolean;
    /** absolute path the state was looked for at. */
    readonly statePath: string;
    readonly stateExists: boolean;
    /** resolved binary path, for the detail — null when unknown. */
    readonly binPath: string | null;
}
/** Ranking state has no freshness concept, so it deliberately has its own result type. */
export interface RankingStateCheckResult {
    readonly level: 'ok' | 'warn';
    readonly detail: string;
}
/**
 * Decide whether the executable answering `dz doctor` is the workspace's current instrument.
 *
 * LIMITS NAMED BY INDEPENDENT REVIEW (Claude Sonnet, 2026-09-20), none of them hidden behind a
 * passing test:
 *  - Containment is a case-SENSITIVE path comparison. On a case-insensitive filesystem, or where the
 *    same location is reachable under two path forms, an in-tree binary can read as external. This
 *    repo runs on Linux; the cost of being wrong is one extra `warn` line and never an exit code.
 *  - The caller attributes a version by walking up from the binary to the NEAREST `package.json`.
 *    A shim in package A that loads package B's code is attributed to A, and a broken install with
 *    no own manifest is attributed to whatever ancestor has one. The detail always prints the
 *    resolved binary path so a reader can see which file was actually measured.
 */
export declare function checkInstrumentFreshness(input: InstrumentCheckInput): InstrumentCheckResult;
/** Decide whether enabled bandit re-ranking has the on-disk state needed to operate. */
export declare function checkRankingState(input: RankingStateCheckInput): RankingStateCheckResult;
//# sourceMappingURL=doctor-instrument.d.ts.map