/**
 * ONE definition of "a dz command", and the ONE enumeration every consumer derives from.
 *
 * WHY (backlog 3b2b05e0, ADR-001 in `features/command-count-triad/03_adr/`): three sources answered
 * "how many dz commands are there" with three numbers — the dispatcher's `case` labels, the rendered
 * `dz --help` list and `dz name-check`'s collision sweep — because each used its own definition, so
 * adding a command meant guessing which number to move and which test would redden.
 *
 * THE DEFINITION (ADR-001 §1): *a dz command is a name that is a `case` label of the main
 * `switch (command)` in `cli.ts` AND has a `  dz <name>` line in USAGE.* `DZ_COMMANDS` is the
 * canonical enumeration of exactly those names. `dispatched` and `documented` are DERIVED from the
 * SAME file text and must each equal `DZ_COMMANDS` as a SET — both directions — modulo two
 * explicit, reasoned exception lists:
 *
 *   dispatched == declared ∪ internal      (INTERNAL_ENTRY_POINTS — runs, deliberately not in USAGE)
 *   documented == declared ∪ pseudo        (PSEUDO_COMMANDS      — in USAGE, handled pre-dispatch)
 *
 * Everything here is PURE: text in, name sets out. It reads no file and never imports `cli.js` (that
 * would be a cycle — `cli.ts` imports THIS module), so the layer-1 test and `nameCheckScan` share one
 * parser and cannot drift apart by construction (ADR-001 DD3).
 *
 * NAMES, NEVER ONLY COUNTS (ADR-001 DD2): no count literal lives here or in any consumer. A
 * cardinality guard dies to add-one-delete-one — MEASURED live in this repo: the harness-cli README's
 * inventory held 85 names and passed a `size === 85` guard while listing `help` and omitting
 * `verify-pack`.
 */
/**
 * One reasoned exemption from the definition. `reason` is mandatory — an exemption without a written
 * reason is the allowlist this feature closed; `since` ages it.
 */
export interface CommandException {
    readonly name: string;
    readonly reason: string;
    /** `YYYY-MM-DD`. */
    readonly since: string;
}
/** The four name sets derived from one `cli.ts` text, plus the two exception lists in force. */
export interface CommandInventory {
    /** `DZ_COMMANDS` — the canonical enumeration, parsed from the literal block. */
    readonly declared: readonly string[];
    /** `case` labels of the main `switch (command)` — what `dz <name>` will actually RUN. */
    readonly dispatched: readonly string[];
    /** `  dz <name>` lines in USAGE — what a user can DISCOVER. */
    readonly documented: readonly string[];
    /** Documented but not dispatched ({@link PSEUDO_COMMANDS}). */
    readonly pseudo: readonly string[];
    /** Dispatched but deliberately not documented ({@link INTERNAL_ENTRY_POINTS}). */
    readonly internal: readonly string[];
}
/**
 * Documented in USAGE, handled BEFORE the dispatch switch, therefore not canonical commands. `help`
 * is the only member: it prints USAGE and takes no flags, and adding a `case 'help':` purely so a
 * definition holds would make the definition serve the number (ADR-001 §2, option O1b).
 */
export declare const PSEUDO_COMMANDS: readonly CommandException[];
/**
 * Dispatched but deliberately NOT documented — EMPTY today, and that emptiness is the decision, not
 * an oversight (ADR-001 §3, option O2a). The four names that sat in `command-count.test.ts`'s
 * `UNDOCUMENTED_ALLOWLIST` — `mr-rakes`, `retro`, `feature-adr-setup`, `bto-optimize` — got USAGE
 * lines instead of being parked here: discoverability IS existence, and an allowlist entry is a
 * promise to fix later that already cost one field bug report (`project-skills`, 2026-08-25).
 *
 * The list survives as the MECHANISM: a future genuinely internal entry point gets a reasoned home
 * instead of a silent regex exemption. Its members are NOT commands and are NOT in `DZ_COMMANDS`;
 * joining it costs a reason and a date, checked by {@link validateExceptionList}.
 */
export declare const INTERNAL_ENTRY_POINTS: readonly CommandException[];
/**
 * Refuse an exemption that carries no reason or no usable date, NAMING the offending entry. Without
 * it, "exception list with a reason" decays back into the allowlist it replaced. Proven to FIRE on a
 * synthetic reason-less entry, not merely exercised on the valid real lists (ADR-001 §5 / AM-3) — a
 * validator only ever fed valid input is dead code.
 *
 * @param list the exception list to check
 * @param label how to name the list in the error (e.g. `PSEUDO_COMMANDS`)
 * @throws Error naming the offending entry
 */
export declare function validateExceptionList(list: readonly CommandException[], label?: string): readonly CommandException[];
/**
 * Replace the CONTENT of every string, template literal, regex and comment with spaces (newlines
 * preserved), leaving only real code, so a `}` inside a string, a regex or a comment in a case body
 * cannot prematurely close the switch. Case LABELS are still matched on the ORIGINAL source. Promoted
 * out of `test/command-count.test.ts` so the CLI and the test share ONE parser.
 *
 * REGEX LITERALS (QE round 1, Codex `gpt-5.6-sol`, `[P2]` on this function): a lone `}` inside `/}/`
 * used to be counted as a real closing brace, so the brace walk in {@link dispatchedCommands} ended
 * on the FIRST case body and the inventory was TRUNCATED — with the parity guard, `dz name-check`
 * and the exported API all under-counting on valid source. Detection is {@link regexMayStart}, whose
 * heuristic and limit are stated there; on top of it this scanner adds a hard SAME-LINE bound: a
 * regex literal cannot contain an unescaped newline, so a candidate whose closing `/` is not on the
 * same line is declared a false positive and the slash is emitted as ordinary code. That bound is
 * what keeps a mis-read division from eating an unbounded span. `[...]` character classes are
 * tracked so `/[/]/` and `/[{}]/` close where they really close.
 */
export declare function stripNonCode(src: string): string;
/**
 * The names `dz <name>` will actually RUN: `case` labels of the MAIN `switch (command)`, found by
 * brace-aware scanning so extraction is indentation-independent (NFR-6).
 *
 * @throws Error when the main switch is absent — the "guard cannot run" signal: returning `[]` would
 *   let every set-equality above it pass at ∅ == ∅.
 */
export declare function dispatchedCommands(src: string): string[];
/**
 * Cut out the body of the `USAGE` template literal — the ONE block `dz --help` actually renders.
 *
 * WHY it is a function and not a regex (QE round 2, `[P2]`): the naive whole-file scan for
 * `  dz <name>` also swallowed every OTHER help template in `cli.ts`. Scanning stops at the first
 * unescaped backtick outside an `${…}` interpolation, so `${PRESET_NAMES.join(', ')}` on the last
 * USAGE line does not end the literal early.
 *
 * LIMIT, named: a template literal NESTED inside an interpolation would need recursion and is not
 * handled — `cli.ts` has none today, and if one appears this throws rather than guessing.
 *
 * @throws Error when the literal is absent or unterminated — same "cannot run" discipline as
 *   {@link dispatchedCommands}: silently returning `''` would let `documented == declared ∪ pseudo`
 *   pass at ∅ == ∅.
 */
export declare function usageBlock(src: string): string;
/**
 * The names a user can DISCOVER: the `  dz <name>` lines of USAGE, read from the SOURCE — the same
 * regex the old count test ran over RENDERED help, deliberately, because the parity test asserts
 * source-set == rendered-set: being right about the text and wrong about what users see is then a
 * FAILURE, not an invisible drift (FR-3.3 / NFR-6).
 *
 * BOUNDED TO USAGE (QE round 2, `[P2]` on the old whole-file regex): a per-command help template
 * such as `BRAIN_USAGE` (`cli.ts:5019+`) carries a dozen `  dz brain …` lines that global
 * `dz --help` never renders. They were being counted; they deduped onto the `brain` already in
 * USAGE, so the leak was invisible BY LUCK, and one unique name in such a block would have invented
 * a documented command for both `dz name-check` and the parity guard.
 */
export declare function documentedCommands(src: string): string[];
/**
 * The canonical enumeration: the names inside the `DZ_COMMANDS` literal block, parsed from TEXT so
 * all four sets come from ONE artefact. The runtime export is separately asserted equal to this,
 * which is what catches a parser that drifts from the literal it reads.
 *
 * @throws Error when the block is absent — same "cannot run" discipline as {@link dispatchedCommands}.
 */
export declare function declaredCommands(src: string): string[];
/**
 * All four name sets from ONE `cli.ts` text, with both exception lists validated FIRST — deliberately
 * up front, so a real entry with an empty reason breaks the whole inventory rather than one
 * assertion, and the exemption channel cannot rot quietly (ADR-001 §5).
 *
 * @param src the full text of `packages/@dzhechkov/harness-cli/src/cli.ts`
 */
export declare function commandInventory(src: string): CommandInventory;
//# sourceMappingURL=command-inventory.d.ts.map