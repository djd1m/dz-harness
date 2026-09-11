export declare const RELEASE_LINE_RE: RegExp;
export interface ReleaseLineMatch {
    readonly index: number;
    readonly line: string;
    readonly core: string;
    readonly cli: string;
}
export declare function findReleaseLine(text: string): ReleaseLineMatch | null;
export declare function rewriteReleaseLine(text: string, core: string, cli: string): string | null;
//# sourceMappingURL=release-line.d.ts.map