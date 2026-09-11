/**
 * The directory holding this module's own compiled siblings.
 *
 * In a published install that is `<pkg>/dist`; under vitest, where the SOURCE is executed, it is
 * `<pkg>/src`. Callers that need a BUILT sibling must therefore ask for {@link harnessCoreDistDir},
 * which normalises the second case — a body that baked `<pkg>/src/foo.js` would be a path that
 * exists in no installation at all.
 */
export declare function harnessCoreModuleDir(): string;
/**
 * The directory the emitted hook bodies must point at: the one holding the BUILT modules.
 *
 * `src` → its sibling `dist`, anything else → itself. The mapping is deliberately this narrow: the
 * only two layouts that exist are "running the build" and "running the sources under the test
 * runner", and inventing a search would turn a fact into a guess.
 */
export declare function harnessCoreDistDir(): string;
//# sourceMappingURL=harness-core-location.d.ts.map