/** Journaled, ownership-aware project carrier transaction. */
import { type CarrierFragment, type IntegrationReasonCode } from '@dzhechkov/core';
export type IntegrationApplyFault = 'after-pending' | 'after-carrier' | 'after-committed';
export interface ApplyIntegrationOptions {
    readonly projectRoot: string;
    readonly fragments: readonly CarrierFragment[];
    /** Test-only fault seam; production callers omit it. */
    readonly injectFault?: IntegrationApplyFault;
}
export interface IntegrationApplyReport {
    readonly written: readonly string[];
    readonly alreadyCurrent: readonly string[];
    readonly journalPath: string;
}
export declare class IntegrationApplyError extends Error {
    readonly reasonCode: IntegrationReasonCode;
    /** Carrier bytes may already be durable while ownership remains unverified. */
    readonly applied: boolean;
    constructor(reasonCode: IntegrationReasonCode, message: string, 
    /** Carrier bytes may already be durable while ownership remains unverified. */
    applied?: boolean);
}
/** Apply all project JSON fragments under one short project-journal lock. */
export declare function applyIntegrationFragments(options: ApplyIntegrationOptions): IntegrationApplyReport;
//# sourceMappingURL=integration-apply.d.ts.map