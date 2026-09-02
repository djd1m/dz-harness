export type CourseStalenessState = 'S0_SHIPPED' | 'S3_TUTORIAL_STALE' | 'S4_PACKAGE_BEHIND' | 'E2_UNSTAMPED' | 'E3_INVALID_VERSION' | 'E4_PACKAGE_MISMATCH' | 'E5_REGISTRY_UNKNOWN';
export interface CourseStalenessInput {
    readonly source: unknown;
    readonly expectedPackage?: string | null;
    readonly registryVersion?: string | null;
}
export interface CourseStalenessResult {
    readonly state: CourseStalenessState;
    readonly reason: string;
    readonly courseVersion?: string;
    readonly registryVersion?: string;
    readonly package?: string;
}
/**
 * Classify only the version evidence supplied by the caller. Obtaining a registry version is a
 * caller responsibility; this function performs no filesystem, network, clock, or environment I/O.
 */
export declare function classifyCourseStaleness(input: CourseStalenessInput): CourseStalenessResult;
//# sourceMappingURL=course-staleness.d.ts.map