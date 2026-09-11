/** Internal test scanner: parsing keeps comments and literal text out of code visits. */
export declare function findProcessAccessInCode(source: string): Array<{
    line: number;
    kind: string;
}>;
/** Count import declarations, import-equals, require, dynamic imports and process.getBuiltinModule, not mentions. */
export declare function countIoImports(source: string, modules?: readonly string[]): {
    files: number;
    imports: number;
};
//# sourceMappingURL=core-boundary.d.ts.map