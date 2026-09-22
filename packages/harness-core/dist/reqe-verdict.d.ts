export type ReqeSeverity = 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW' | 'unknown';
export interface ReqeSeverityCounts {
    readonly blocker: number;
    readonly high: number;
    readonly medium: number;
    readonly low: number;
    readonly unknown: number;
}
/** `where` is null when the location cell is an em dash — the title alone is echoed (ADR AM-5). */
export interface ReqeBlockingRow {
    readonly severity: 'BLOCKER' | 'HIGH';
    readonly title: string;
    readonly where: string | null;
}
/** THREE states, never two (03.5 C5b): `absent` = no Findings section; `rejected` = section present,
 *  table not canonical, reason NAMED; `accepted` = parsed. */
export type ReqeFindingsClass = {
    readonly kind: 'accepted';
    readonly counts: ReqeSeverityCounts;
    readonly rows: number;
    readonly declared: number | null;
    readonly blocking: readonly ReqeBlockingRow[];
} | {
    readonly kind: 'rejected';
    readonly reason: string;
} | {
    readonly kind: 'absent';
};
export type ReqePriorVerdict = {
    readonly kind: 'closed';
    readonly closed: number;
    readonly total: number;
} | {
    readonly kind: 'open';
    readonly open: readonly number[];
    readonly total: number;
} | {
    readonly kind: 'unassessed';
};
export interface ReqeVerdict {
    readonly new: 'ready' | 'blocked' | 'unassessed';
    readonly prior: ReqePriorVerdict;
    readonly findings: ReqeFindingsClass;
    readonly counts: ReqeSeverityCounts;
    readonly rows: number;
    readonly blocking: readonly ReqeBlockingRow[];
    readonly source: 'reviewer-declared';
}
/** Read only the single Findings section; malformed attempts carry an explicit reason. */
export declare function classifyReqeFindings(text: string): ReqeFindingsClass;
/** Independent pass: no classification or new-findings state participates in prior status. */
export declare function parsePriorFindings(text: string): ReqePriorVerdict;
/** The only blocking rule; prior status is reported independently. */
export declare function buildReqeVerdict(text: string): ReqeVerdict;
//# sourceMappingURL=reqe-verdict.d.ts.map