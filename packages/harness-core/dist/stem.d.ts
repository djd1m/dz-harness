/**
 * Dependency-free lexical normalization shared by registry search and recommend.
 * It deliberately handles only the measured RU/EN inflection cases; semantic
 * similarity and paraphrases belong to the separate recall/advisor tier.
 */
/** Unicode-aware word split without JavaScript's ASCII-only word-boundary escape. */
export declare function tokenize(text: string): string[];
/** Lowercase one token and remove at most one conservative inflectional suffix. */
export declare function stemToken(token: string): string;
/** Tokenize and stem a text with the shared RU/EN rules. */
export declare function stems(text: string): string[];
//# sourceMappingURL=stem.d.ts.map