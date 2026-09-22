/**
 * Свежесть резервной копии бэклога по журналу backup-backlog.
 *
 * Порядок строк важнее меток времени: отказ без даты ПОСЛЕ успеха — последний вердикт.
 * Отсутствие вердикта не доказывает ни актуальность копии, ни её отказ.
 */
export type BackupFreshnessVerdict = {
    readonly state: 'fresh';
    readonly verifiedAt: string;
    readonly ageHours: number;
    readonly tasks: number | null;
} | {
    readonly state: 'stale';
    readonly reason: 'too-old' | 'last-run-failed';
    readonly verifiedAt: string | null;
    readonly ageHours: number | null;
    readonly failureLine: string | null;
} | {
    readonly state: 'not-established';
    readonly reason: 'no-verdict' | 'bad-stamp' | 'unrecognized-after-success';
    readonly detail: string;
    readonly unrecognizedLine?: string;
};
/** Чистое решение. Ничего не читает и не запускает — строки и часы подаёт вызывающий. */
export declare function decideBackupFreshness(input: {
    readonly lines: readonly string[];
    readonly now: Date;
    readonly maxAgeHours: number;
}): BackupFreshnessVerdict;
/** Одна строка для человека: измеренный возраст либо конкретная строка отказа. */
export declare function renderBackupFreshness(verdict: BackupFreshnessVerdict): string;
//# sourceMappingURL=backup-freshness.d.ts.map