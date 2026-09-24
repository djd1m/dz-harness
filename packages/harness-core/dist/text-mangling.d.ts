/** Symptoms of text already damaged by shell expansion; these are warnings, never refusals. */
export type MangleKind = 'teach' | 'backlog';
export type MangleSymptom = {
    kind: 'empty-substitution-hole' | 'dangling-arrow' | 'empty-brackets' | 'short-for-kind';
    /** UTF-16 code-unit index, as used by JavaScript strings (not a UTF-8 byte offset). */
    at: number;
    excerpt: string;
};
export declare function detectMangledText(text: string, kind: MangleKind): readonly MangleSymptom[];
//# sourceMappingURL=text-mangling.d.ts.map