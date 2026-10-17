type Row = {
    path: string;
    digest: string | null;
};
type Context = {
    featurePath: string;
    previous: Row[];
    current: Row[];
    witnesses?: Map<string, Buffer>;
    logObservations?: {
        path: string;
        size: number;
        bytesRead: number;
        digest: string;
        identityStable: boolean;
    }[];
    elapsedMs?: number;
};
/** Validate canonical descriptor structure and total scope algebra against measured manifests. */
export declare function validateNativePostCiEvidence(e: any, c: Context): any;
/** One observation's cross-class identity map; same canonical path may be rechecked. */
export declare function nativePostCiIdentityRegistry(): (path: string, stat: {
    dev: number;
    ino: number;
}, directory?: boolean) => void;
export {};
//# sourceMappingURL=native-post-ci-evidence.d.ts.map