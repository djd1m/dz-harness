export type LessonForm = 'specific' | 'class';
export type LessonMatchedForm = 'specific' | 'class' | 'both';
export interface LessonFormsInput {
    readonly specific: string;
    readonly classForm?: string;
    readonly classAdvisory?: string;
}
export interface LessonFormRankedHit<T> {
    readonly key: string;
    readonly value: T;
    readonly matchedForm: LessonForm;
}
export interface MergedLessonFormHit<T> {
    readonly key: string;
    readonly value: T;
    readonly matchedForm: LessonMatchedForm;
    readonly score: number;
}
export declare function normalizeLessonForms(specific: string, classInput?: unknown): LessonFormsInput;
export declare function validateClassTemplate(specific: string, classTemplate: string): {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly reason: string;
};
export declare function lessonPairIdOf(specific: string, classTemplate: string, ts: string): string;
export declare function mergeLessonMatchedForms(left: LessonMatchedForm | undefined, right: LessonMatchedForm | undefined): LessonMatchedForm | undefined;
export declare function mergeLessonFormHits<T>(specificHits: readonly LessonFormRankedHit<T>[], classHits: readonly LessonFormRankedHit<T>[], limit: number): MergedLessonFormHit<T>[];
//# sourceMappingURL=lesson-generalization.d.ts.map