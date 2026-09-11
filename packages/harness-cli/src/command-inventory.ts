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
export const PSEUDO_COMMANDS: readonly CommandException[] = [
  {
    name: 'help',
    reason: 'pre-dispatch built-in: prints USAGE and returns before the main switch (command) — no case label, no flags',
    since: '2026-09-05',
  },
];

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
export const INTERNAL_ENTRY_POINTS: readonly CommandException[] = [];

const SINCE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
export function validateExceptionList(
  list: readonly CommandException[],
  label = 'command exception list',
): readonly CommandException[] {
  list.forEach((entry, index) => {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (name === '') {
      throw new Error(`${label}[${index}] has no name — every exemption names the command it exempts`);
    }
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    if (reason === '') {
      throw new Error(
        `${label}: "${name}" has no reason — an exemption without a written reason is an allowlist, not a decision (ADR-001 §5)`,
      );
    }
    const since = typeof entry.since === 'string' ? entry.since : '';
    if (!SINCE_PATTERN.test(since)) {
      throw new Error(`${label}: "${name}" has since="${since}" — expected a YYYY-MM-DD date so the exemption can be aged`);
    }
  });
  return list;
}

/**
 * Keywords after which a `/` can only open a REGEX literal, never a division: they end a statement or
 * an operator position, so no value precedes the slash. Without them `return /}/.test(x)` would be
 * read as a division and its braces counted (see {@link stripNonCode}).
 */
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'case', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'do',
  'else', 'yield', 'await',
]);

/**
 * Decide whether a `/` at this point opens a regex literal, given the code emitted so far.
 *
 * THE HEURISTIC, and it IS a heuristic (a real answer needs the TypeScript parser): a slash divides
 * when a VALUE precedes it — an identifier, a number, or a closing `)`/`]`/`}`/quote — and otherwise
 * opens a regex. The one exception is a preceding KEYWORD, which looks like an identifier but leaves
 * an operator position, hence {@link REGEX_PRECEDING_KEYWORDS}.
 *
 * THE LIMIT, named because it is deliberate: after `)`, `]` and `}` this answers "division", so
 * `if (x) /}/.test(y)` and `} /}/.test(y)` still leak their braces. That direction is chosen on
 * ASYMMETRY of damage — a missed regex reproduces today's known under-count, while a division
 * mistaken for a regex would SWALLOW real code and could hide or invent braces anywhere. The
 * same-line bound in {@link stripNonCode} caps what a false positive can eat.
 *
 * COST (QE round 3, `[P2]`): this used to run an END-ANCHORED regex over the whole accumulated
 * output, so every slash rescanned the entire prefix — QUADRATIC in a parser that is public API and
 * runs inside every `dz name-check` (MEASURED pre-fix: 4 000 division-heavy lines took 10 366 ms,
 * 21x longer than the 12x LARGER real `cli.ts`). Both inputs are now O(1): the caller tracks the
 * preceding identifier incrementally, so this function looks at nothing but its two arguments.
 *
 * @param lastIdentifier the identifier ending at `lastSignificant`, or `''` when that is not a word
 * @param lastSignificant the last non-whitespace CODE character emitted, or `''` at the start
 */
function regexMayStart(lastIdentifier: string, lastSignificant: string): boolean {
  if (lastSignificant === '') return true;
  // The value test. `"` is the MARKER a closed string, template or regex leaves behind — it can
  // never be a real code character, because a literal `"` in code opens a string instead. Omitting
  // it (QE round 4, `[P2]`) made `'4' / d` read as a regex opener: the scanner then ate up to the
  // next slash on the line, usually a trailing `//`, taking the case body's closing brace with it,
  // and every later `case` was dropped. MEASURED pre-fix: two cases lost per body, for all four
  // closers (`'`, `"`, backtick, flagless `/…/`).
  if (!/[\w$)\]}"]/.test(lastSignificant)) return true;
  return REGEX_PRECEDING_KEYWORDS.has(lastIdentifier);
}

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
export function stripNonCode(src: string): string {
  let out = '';
  let state: 'code' | 'line' | 'block' | "'" | '"' | '`' = 'code';
  /** Last non-whitespace CODE character emitted; a closed string/regex reports as a value (`"`). */
  let lastSignificant = '';
  /**
   * The identifier ending at {@link lastSignificant}, maintained in O(1) so {@link regexMayStart}
   * never rescans the prefix. Whitespace LEAVES it alone (`return /re/` must still see `return`);
   * any other character clears it; a closed string or regex clears it, because it is a value.
   */
  let lastIdentifier = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!; const n = src[i + 1];
    if (state === 'code') {
      if (c === '/' && n === '/') { state = 'line'; out += '  '; i++; continue; }
      if (c === '/' && n === '*') { state = 'block'; out += '  '; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { state = c; out += ' '; continue; }
      if (c === '/' && regexMayStart(lastIdentifier, lastSignificant)) {
        let j = i + 1; let inClass = false; let closed = false;
        for (; j < src.length; j++) {
          const d = src[j]!;
          if (d === '\n') break;                                   // no closing `/` on this line
          if (d === '\\') { if (src[j + 1] === '\n' || j + 1 >= src.length) break; j++; continue; }
          if (inClass) { if (d === ']') inClass = false; continue; }
          if (d === '[') { inClass = true; continue; }
          if (d === '/') { closed = true; break; }
        }
        if (closed) { out += ' '.repeat(j - i + 1); i = j; lastSignificant = '"'; lastIdentifier = ''; continue; }
        // not a regex after all — fall through and emit the slash as ordinary code
      }
      out += c;
      if (/[A-Za-z0-9_$]/.test(c)) { lastSignificant = c; lastIdentifier += c; }
      else if (!/\s/.test(c)) { lastSignificant = c; lastIdentifier = ''; }
      continue;
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; out += '\n'; } else out += ' '; continue; }
    if (state === 'block') { if (c === '*' && n === '/') { state = 'code'; out += '  '; i++; } else out += (c === '\n' ? '\n' : ' '); continue; }
    // inside a string/template: content → spaces, honour escapes, close on the matching quote.
    // An escaped NEWLINE is a LINE CONTINUATION and its newline must SURVIVE (QE round 3, `[P2]`):
    // emitting two spaces here destroyed a line, `stripNonCode` returned fewer lines than it was
    // given, and `dispatchedCommands` — which indexes `codeLines` against `origLines` by the same
    // `i` — then read every later label off the WRONG line and DROPPED real commands.
    if (c === '\\') { out += (src[i + 1] === '\n' ? ' \n' : '  '); i++; continue; }
    if (c === state) { state = 'code'; out += ' '; lastSignificant = '"'; lastIdentifier = ''; continue; }
    out += (c === '\n' ? '\n' : ' ');
  }
  return out;
}

/**
 * The names `dz <name>` will actually RUN: `case` labels of the MAIN `switch (command)`, found by
 * brace-aware scanning so extraction is indentation-independent (NFR-6).
 *
 * @throws Error when the main switch is absent — the "guard cannot run" signal: returning `[]` would
 *   let every set-equality above it pass at ∅ == ∅.
 */
export function dispatchedCommands(src: string): string[] {
  const origLines = src.split('\n');
  const codeLines = stripNonCode(src).split('\n');           // braces counted on this; NAME read from origLines
  let start = -1;
  for (let i = 0; i < codeLines.length; i++) { if (/switch \(command\)/.test(codeLines[i]!)) { start = i; break; } }
  if (start < 0) throw new Error('main switch (command) not found — the command inventory cannot be derived from this source');
  const names = new Set<string>();
  let depth = 0; let started = false;
  for (let i = start; i < codeLines.length; i++) {
    // Depth BEFORE this line's own braces are counted. A label belonging DIRECTLY to
    // `switch (command)` sits at depth 1 — inside the switch's braces and nothing else's.
    const depthBefore = depth;
    for (const ch of codeLines[i]!) { if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; } }
    // TWO independent conditions, both load-bearing, both from QE round 2:
    //   (a) the word `case` must have SURVIVED stripping at the same column — otherwise the line is
    //       a comment or a template and its `case 'phantom':` is prose, not a dispatch;
    //   (b) the label must sit at switch-body depth — otherwise it belongs to a nested sub-verb
    //       switch and `dz <that name>` would never reach it.
    const code = codeLines[i]!.match(/^(\s*)case\b/);
    const orig = origLines[i]!.match(/^(\s*)case ['"]([a-z][a-z0-9-]*)['"]:/);   // NAME from ORIGINAL
    const isCode = code !== null && orig !== null && code[1]!.length === orig[1]!.length;
    if (isCode && started && depthBefore === 1) names.add(orig![2]!);
    if (started && depth <= 0 && i > start) break;
  }
  return [...names].sort();
}

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
export function usageBlock(src: string): string {
  const opener = src.match(/const USAGE\s*(?::[^=]*)?=\s*`/);
  if (opener?.index === undefined) {
    throw new Error('the USAGE template literal was not found — the documented commands cannot be derived from this source');
  }
  const from = opener.index + opener[0].length;
  let interpolation = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i]!;
    if (c === '\\') { i++; continue; }
    if (c === '$' && src[i + 1] === '{') { interpolation++; i++; continue; }
    if (c === '}' && interpolation > 0) { interpolation--; continue; }
    if (c === '`' && interpolation === 0) return src.slice(from, i);
  }
  throw new Error('the USAGE template literal is unterminated — the documented commands cannot be derived from this source');
}

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
export function documentedCommands(src: string): string[] {
  const names = new Set<string>();
  for (const m of usageBlock(src).matchAll(/^ {2}dz {1,}([a-z][a-z0-9-]*)/gm)) names.add(m[1]!);
  return [...names].sort();
}

/**
 * The canonical enumeration: the names inside the `DZ_COMMANDS` literal block, parsed from TEXT so
 * all four sets come from ONE artefact. The runtime export is separately asserted equal to this,
 * which is what catches a parser that drifts from the literal it reads.
 *
 * @throws Error when the block is absent — same "cannot run" discipline as {@link dispatchedCommands}.
 */
export function declaredCommands(src: string): string[] {
  const block = src.match(/export const DZ_COMMANDS: readonly string\[\] = \[([\s\S]*?)\];/);
  if (block?.[1] === undefined) {
    throw new Error('the DZ_COMMANDS literal block was not found — the canonical enumeration cannot be derived from this source');
  }
  const names = new Set<string>();
  for (const m of block[1].matchAll(/'([a-z][a-z0-9-]*)'/g)) names.add(m[1]!);
  return [...names].sort();
}

/**
 * All four name sets from ONE `cli.ts` text, with both exception lists validated FIRST — deliberately
 * up front, so a real entry with an empty reason breaks the whole inventory rather than one
 * assertion, and the exemption channel cannot rot quietly (ADR-001 §5).
 *
 * @param src the full text of `packages/@dzhechkov/harness-cli/src/cli.ts`
 */
export function commandInventory(src: string): CommandInventory {
  validateExceptionList(PSEUDO_COMMANDS, 'PSEUDO_COMMANDS');
  validateExceptionList(INTERNAL_ENTRY_POINTS, 'INTERNAL_ENTRY_POINTS');
  return {
    declared: declaredCommands(src),
    dispatched: dispatchedCommands(src),
    documented: documentedCommands(src),
    pseudo: [...PSEUDO_COMMANDS.map((e) => e.name)].sort(),
    internal: [...INTERNAL_ENTRY_POINTS.map((e) => e.name)].sort(),
  };
}
