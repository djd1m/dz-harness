type Writer = (line: string) => void;
type Reaper = (token: string, scratch: string) => {
    readonly complete: boolean;
    readonly survivors: readonly number[];
};
export declare function runGoDiscriminationCheck(options: Map<string, string>, flags: Set<string>, cwd: string, write: Writer, reap: Reaper): Promise<number>;
export {};
//# sourceMappingURL=go-discrimination-executor.d.ts.map