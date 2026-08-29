export type NativeDepState = 'usable' | 'absent' | 'unusable';
export interface NativeDepVerdict {
    readonly state: NativeDepState;
    readonly pkg: string;
    readonly reason?: string;
    readonly path?: string;
}
export declare function exerciseSqliteOpen(mod: unknown): void;
export declare function probeNativeDep(projectRoot: string, pkg: string, exercise?: (mod: unknown) => unknown, exerciseId?: string): NativeDepVerdict;
export declare function describeNativeDep(verdict: NativeDepVerdict): string;
//# sourceMappingURL=native-dep-probe.d.ts.map