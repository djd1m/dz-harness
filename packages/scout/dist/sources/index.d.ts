/**
 * Multi-source aggregator — runs all scanners and deduplicates.
 *
 * @packageDocumentation
 */
import type { RepoProfile, ScanOptions } from '../types.js';
/** Source tag for provenance tracking. */
export type SourceTag = 'github' | 'npm' | 'hackernews' | 'mcp-registry' | 'glama' | 'ossinsight-trending' | 'smithery' | 'semantic-scholar' | 'arxiv' | 'ecc' | 'agentbox';
/** A RepoProfile with source provenance. */
export interface TaggedProfile extends RepoProfile {
    readonly source: SourceTag;
}
/**
 * Why a source contributed nothing. `ok` is a real, measured zero; everything else is a source that
 * did not answer, and the two must never print alike.
 *
 * ЧЕТЫРЕ ИСХОДА С 2026-09-03 (ADR-001 source-outcome-typed). Пара `ok | failed` выставляла
 * `failed` только на ОТКЛОНЁННОМ обещании; источник, вернувший пусто из-за кода ошибки (403 при
 * исчерпании лимита запросов, 404), проходил как `ok` с нулём. Августовскую дыру ниже закрыли по
 * ветке исключения — и не закрыли ветку «ответил, но отказом». Таймаута не было ни в одном
 * источнике, поэтому «не дождались» было невыразимо в принципе.
 *
 * `refused` — ответил кодом ошибки · `timeout` — не ответил за бюджет · `failed` — обращение не
 * состоялось · `ok` — измерение было, и ноль при нём есть ИЗМЕРЕННЫЙ ноль.
 *
 * ЧЕСТНАЯ ГРАНИЦА: на новый примитив переведён ОДИН источник из одиннадцати (`ecc`). Остальные
 * десять дают прежние два исхода — их дыра осталась и названа, а не закрыта надеждой.
 *
 * MEASURED 2026-08-22: with a revoked GITHUB_TOKEN, `scanGitHub` threw `401 Bad credentials`,
 * `Promise.allSettled` swallowed it, and the report printed `github: 0` — the scan's PRIMARY source
 * silently absent, indistinguishable from "nothing new exists". The CLI warned only when a token was
 * ABSENT, so a bad token was quietly worse than none.
 */
export type SourceHealth = 'ok' | 'refused' | 'timeout' | 'failed';
export interface SourceStatus {
    readonly health: SourceHealth;
    /** First line of the failure, when it failed. Never invented for a healthy source. */
    readonly reason?: string;
}
/** Aggregate results from all sources, deduplicated by fullName. */
export declare function scanAllSources(options?: ScanOptions): Promise<{
    results: TaggedProfile[];
    totalBySource: Record<SourceTag, number>;
    /** Per-source health. A zero with `health: 'failed'` is NOT a finding about the world. */
    statusBySource: Record<SourceTag, SourceStatus>;
}>;
//# sourceMappingURL=index.d.ts.map