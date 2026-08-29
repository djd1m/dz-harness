/**
 * Boolean flags DECLARED AS DATA — feature boolean-flags-declared (backlog 247ddcfa).
 *
 * Before this file, `parseArgs` had no concept of a boolean flag: ANY `--flag` greedily consumed
 * the next token unless it began with `--`. MEASURED 2026-08-22 on 0.7.0: `dz sync --dry-run .`
 * turned the safety flag into the option `dry-run=.` — `flags.has('dry-run')` was FALSE and the
 * run WROTE, its only trace a missing label. The same class swallowed positionals
 * (`dz recall --no-semantic "torque"` ate the query) across ~72 commands.
 *
 * GENERATED from a census of `cli.ts` reads — `test/boolean-flags.test.ts` re-derives the census
 * on every run and fails on ANY divergence, in BOTH directions: a name here that gains a valued
 * read, or a new flags.has-only name missing from here, each forces a conscious decision.
 *
 * Two names are declared beyond the mechanical census, both documented:
 * - `json` — its one valued read (cli.ts, the `--json <path>` recovery in the mcp-scan family) IS
 *   the hand-patch for this very defect; with the flag declared boolean the recovery goes
 *   harmlessly dead and `--json <path>` parses as flag + positional, which that code also accepts.
 * - `force` — valued ONLY under `dz guard` (`--force <reason>`, the audited override); boolean in
 *   every other command. Encoded via {@link VALUED_FORCE_COMMANDS}.
 */
export const BOOLEAN_CLI_FLAGS = new Set([
    'affected',
    'backfill',
    'all',
    'allow-same-family',
    'allow-same-family-qe',
    'any',
    'apply',
    'audit-dev',
    'auto',
    'books',
    'bto',
    'bump-only',
    'by-stage',
    'calibrate',
    'check',
    'confirm',
    'context-only',
    'deep',
    'diff',
    'done',
    'dry-run',
    'emit',
    'enrich',
    'fa-record',
    'fail-on-undergrant',
    'finalize',
    'force',
    'full',
    'gates',
    'guard',
    'guards',
    'harmonize',
    'help',
    'include-pairs',
    'init',
    'install',
    'install-driver',
    'install-hook',
    'json',
    'keep-scratch',
    'legacy',
    'lexical',
    'list',
    'live-content',
    'mock',
    'night',
    'no-dry-run',
    'no-evals',
    'no-hooks',
    'no-issue',
    'no-memory',
    'no-mirror',
    'no-provenance',
    'no-result',
    'no-semantic',
    'no-teach',
    'no-verify',
    'once',
    'override',
    'preview',
    'provenance',
    'prune-noise',
    'prune-quarantine',
    'publish',
    'reconcile',
    'record-provisional',
    'refresh-publishes',
    'remove',
    'require-plan',
    'require-signing',
    'rerank',
    'revise',
    'scope-check',
    'semantic',
    'send',
    'split',
    'stages-json',
    'static',
    'stats',
    'strict',
    'tag',
    'teach',
    'usage',
    'validate',
    'weak',
    'with-pairs',
    'with-references',
    'yes',
]);
/** Commands where `--force` takes a VALUE (`--force <reason>`, logged) and must stay greedy. */
export const VALUED_FORCE_COMMANDS = ['guard'];
/** Is `--<name>` a boolean flag for this command — i.e. it must never swallow the next token? */
export function isBooleanFlag(name, command) {
    if (name === 'force')
        return !VALUED_FORCE_COMMANDS.includes(command);
    return BOOLEAN_CLI_FLAGS.has(name);
}
//# sourceMappingURL=boolean-flags.js.map