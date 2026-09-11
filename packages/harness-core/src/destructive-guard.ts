// destructive-guard — feature `destructive-command-guard`, ADR-001
// ("the guard's scope is set by what it can DECIDE from the form, not by how bad the consequence is").
//
// WHY THIS IS SO NARROW. A measurement over 20 938 real shell commands from this project's
// transcripts showed that for the broad class "recursive deletion" the guard cannot justify 83 % of
// its own hits (44 % target in a shell variable, 39 % relative target after a directory change).
// A check that invents violations is worse than no check — people learn to switch it off, and the
// 17 % that worked goes with it. So the rules below fire ONLY on a LITERAL path into a protected
// store, where the form IS the fact.
//
// PURE BY CONTRACT: a string in, a structure out. No filesystem access, no subprocess, and above
// all no variable expansion — asking the shell where `$T` points means EXECUTING a fragment of an
// untrusted command inside the defence against that command (ADR-001, option C, rejected by
// construction).
//
// THREE OUTCOMES, NOT TWO. `undecidable` is never dressed up as `refuse`: a refusal derived from an
// inability to parse is a false guarantee, and the consumer must PASS on it (AC-10).

/** A verdict on one shell command. `limits` is always populated — see LIMITS below. */
export interface DestructiveVerdict {
  /** `refuse` = block it. `allow` = out of scope. `undecidable` = could not parse; consumer PASSES. */
  outcome: 'refuse' | 'allow' | 'undecidable';
  /** The literal path that triggered the refusal, as the SHELL would pass it to the program. */
  path: string | null;
  /** The id of the rule that fired — one of DESTRUCTIVE_RULES. */
  rule: string | null;
  /** One line naming what was decided and why. A refusal always names the path and the rule. */
  reason: string;
  /** What this guard does NOT decide. Printed on EVERY verdict, refusals included. */
  limits: readonly string[];
}

/**
 * The limits the guard is obliged to PRINT rather than keep quiet about.
 *
 * Verbatim from ADR-001, section "Пределы, которые страж обязан НАЗЫВАТЬ в собственном тексте".
 * MEASURED reason: a guard that stays silent about its limits reads as a guarantee. During the
 * 2026-09-04 shift the false-refusal class "text ABOUT a command is not a command" fired six times,
 * twice on the very lesson recording that class.
 */
const LIMITS: readonly string[] = Object.freeze([
  'цель в переменной оболочки — не разрешается, страж пропускает',
  'относительный путь после смены каталога — не разрешается, страж пропускает',
  '`git rm` — не удаление файлов, исключено по построению',
  'содержимое кавычек читается ТОЛЬКО у глагола удаления и у носителя команды, исполняемой оболочкой («sh -c», «npm/npx -c», «pnpm --shell-mode exec»); под любой другой головой это текст о команде, а не команда; тела вставных блоков не читаются никогда',
]);

/** The complete rule table. A refusal always carries one of these ids. */
export const DESTRUCTIVE_RULES: readonly { id: string; what: string }[] = Object.freeze([
  { id: 'protected-store-dz', what: 'буквальный путь в защищаемое хранилище .dz' },
  { id: 'protected-store-agentic-qe', what: 'буквальный путь в защищаемое хранилище .agentic-qe' },
  { id: 'database-file', what: 'буквальный путь к файлу базы данных (.db/.sqlite/.sqlite3/.rvf)' },
]);

/** Directory names that ARE a protected store, matched as a whole path segment. */
const PROTECTED_SEGMENTS: ReadonlyMap<string, string> = new Map([
  ['.dz', 'protected-store-dz'],
  ['.agentic-qe', 'protected-store-agentic-qe'],
]);

/** A live store file, recognised by extension. `-wal`/`-shm`/`-journal` are SQLite satellites. */
const DATABASE_FILE = /\.(db|sqlite|sqlite3|rvf)(-wal|-shm|-journal)?$/i;

/**
 * Options that make a deletion verb print something and EXIT — no operand is ever removed.
 *
 * MEASURED with GNU coreutils 8.32, each case in its own temp directory: `<verb> --help .dzprobe`,
 * `<verb> --version .dzprobe`, `rmdir --help …`, `unlink --help …` and `shred --version …` each
 * printed usage or a version banner, exited 0 and left the target ALIVE — and position does not
 * matter, `<verb> -rf .dzprobe --help` behaves the same. The classifier skipped these as ordinary
 * flags and then named the operand as a protected deletion (cross-family review, gpt-5.6-sol,
 * round 5): a refusal naming a store the command CANNOT touch, the R-flags defect.
 *
 * They are only modes BEFORE the option terminator. MEASURED the other way too:
 * `<verb> -rf -- --help .dzprobe` left the target GONE, and `<verb> -- --help .dzprobe` reported
 * `cannot remove '--help': No such file or directory` — past `--` the word is a FILE NAME.
 */
const TERMINAL_MODE_OPTIONS: ReadonlySet<string> = new Set(['--help', '--version']);

/** Verbs that delete from the filesystem. Deliberately short. */
const DELETE_VERBS: ReadonlySet<string> = new Set(['rm', 'rmdir', 'unlink', 'shred']);

/**
 * The option arity of the deletion verbs themselves — declared BELOW, next to OptionArity.
 *
 * `rm`, `rmdir` and `unlink` genuinely have no option that takes a separate word, and that is the
 * load-bearing half: an invented entry here would swallow the real target and the guard would go
 * silent on a live deletion. Only `shred` has any, and only those it truly has.
 */

/**
 * Which options of a command take the NEXT word as their value.
 *
 * WHY THIS EXISTS. "Skip everything that starts with a dash" is not a parse: in `env -u FOO rm …`
 * the word after `-u` is the variable to unset, not the program, and the guard read `FOO` as the
 * command being run — so the deletion behind it was never examined (cross-family review,
 * gpt-5.6-sol). The lists below are deliberately conservative: an option is named here only when
 * it unambiguously eats a word, because a WRONG entry swallows the verb and yields a silent miss.
 */
interface OptionArity {
  /** Short option LETTERS whose value is the next word, written on their own as `-u root`. */
  short: string;
  /** Long option names, without `--`, whose value is the next word (`--unset FOO`). */
  long: ReadonlySet<string>;
}

const NO_VALUE_OPTIONS: OptionArity = { short: '', long: new Set() };

/**
 * The first value-taking letter in a SHORT option cluster, and the value it carries.
 *
 * `getopt` reads a cluster left to right and stops at the first letter that wants a value: what
 * follows that letter inside the SAME word is the value, and when nothing follows it, the value is
 * the NEXT word. So `-uFOO` and `-u FOO` are one option written two ways, and in `-iu FOO` the
 * `-i` is a boolean while the trailing `-u` still eats `FOO`.
 *
 * ROUND-4 CORRECTION (cross-family review, gpt-5.6-sol). The rule used to be "only a bare
 * two-character flag takes the next word", justified by an asymmetry: consuming a word that was not
 * a value swallows the deletion verb, while NOT consuming one only leaves the classifier where it
 * already was. The second half of that is FALSE for a cluster — the unconsumed value becomes the
 * head word, an unknown head STOPS the search (see WRAPPERS), and the deletion behind it is
 * allowed. MEASURED with the real tools: `env -iu FOO printf RAN` prints RAN and
 * `sudo -nu root printf RAN` prints RAN, so `FOO`/`root` are values and the command is what follows
 * them; `env -uFOO printf RAN` also prints RAN, so an ATTACHED value does NOT eat the next word.
 * Both directions are pinned (F20, F20-guard).
 */
interface ShortClusterValue {
  /** The letter that takes the value. */
  letter: string;
  /** The value written in the SAME word, or null when the value is the next word. */
  attached: string | null;
}

function shortClusterValue(letters: string, flag: string): ShortClusterValue | null {
  if (letters === '' || flag.startsWith('--') || !flag.startsWith('-')) return null;
  for (let p = 1; p < flag.length; p++) {
    const letter = flag.charAt(p);
    if (!letters.includes(letter)) continue;
    const rest = flag.slice(p + 1);
    return { letter, attached: rest === '' ? null : rest };
  }
  return null;
}

/** True when `flag`, written exactly like this, consumes the word that follows it. */
function consumesNextWord(arity: OptionArity, flag: string): boolean {
  if (flag.startsWith('--')) {
    const name = flag.slice(2);
    return !name.includes('=') && arity.long.has(name);   // `--unset=FOO` carries its own value
  }
  const hit = shortClusterValue(arity.short, flag);
  return hit !== null && hit.attached === null;
}

/**
 * Commands that EXEC another command, so the real verb is the next word — with the arity of the
 * options each of them accepts.
 *
 * This is an ALLOWLIST on purpose: an unknown head word stops the search, i.e. the default is
 * "not a deletion, allow". A denylist would default to "keep looking", which refuses on
 * `echo rm .dz/x` — the very false-refusal class this feature exists to avoid.
 */
// The arities are named data consumed by the single carrier table below; none of them identifies a
// wrapper on its own. R17 deliberately removed the old parallel `ARGV_WRAPPER_OPTIONS` registry:
// splitting "where is the command?" across that map and the strategy table hid npm's shell carrier.
// `sudo`: `-h`/`--host` was the gap. sudo's own `--help` documents `-h, --host=host`, and the
  // value was not consumed, so the HOST became the command head and the deletion behind it was
  // allowed (cross-family review, gpt-5.6-sol, round 7). MEASURED honestly in both directions on
  // this build: `sudo -u root printf RAN` and `sudo -g root printf RAN` print RAN (the value IS
  // eaten), while `sudo -H/-E/-n/-s/-i/-b/-k printf RAN` print RAN written bare (they eat nothing).
  // `-h` itself could NOT be exercised here — `sudo -h localhost <verb> …` answers `a remote host
  // may only be specified when listing privileges` and deletes nothing on this build — so its
  // evidence is sudo's own synopsis, not a run. It is entered as value-taking anyway, because the
  // expensive direction of the error is a SILENT MISS on a build whose plugin does support remote
  // execution, while the false refusal it can cause costs a measured zero (`sudo -h`/`--host`
// appears 0 times in the 20 938-command corpus).
const SUDO_WRAPPER_OPTIONS: OptionArity = { short: 'ugpCUrtDRTh', long: new Set(['user', 'group', 'prompt', 'close-from', 'other-user', 'role', 'type', 'chdir', 'chroot', 'command-timeout', 'host']) };
const DOAS_WRAPPER_OPTIONS: OptionArity = { short: 'uCa', long: new Set() };
// `env`: `-S`/`--split-string` is NOT an ordinary value-taking option — its value IS the command
// (the option-value carrier in the table below), and the letter stays in `short` only so a cluster
// ending in it is walked correctly. The three signal options are absent on purpose: their argument is
  // OPTIONAL (`--ignore-signal[=SIG]`), so they never eat a separate word. MEASURED —
  // `env --ignore-signal printf RAN` prints RAN and exits 0, while `env --unset printf RAN`
  // consumes `RAN` and exits 127. Listing them as value-taking swallowed the deletion verb itself
// and the guard went silent on a live deletion (cross-family review, gpt-5.6-sol, round 4; F19).
const ENV_WRAPPER_OPTIONS: OptionArity = { short: 'uCS', long: new Set(['unset', 'chdir']) };
const NICE_WRAPPER_OPTIONS: OptionArity = { short: 'n', long: new Set(['adjustment']) };
const STDBUF_WRAPPER_OPTIONS: OptionArity = { short: 'ioe', long: new Set(['input', 'output', 'error']) };
const TIME_WRAPPER_OPTIONS: OptionArity = { short: 'of', long: new Set(['output', 'format']) };
// `xargs`: GNU spells three of its long options with an OPTIONAL argument — `--eof[=eof-str]`,
  // `--replace[=R]`, `--max-lines[=n]` — so written BARE they consume nothing and the next word is
  // the command. MEASURED with GNU findutils 4.8.0: `printf x | xargs --eof <verb> -rf .dzprobe`
  // exited 0 and left the target GONE, and so did `--replace` and `--max-lines`; the five that
  // remain each refused to run with the verb in the value slot (`invalid number "rm"`,
  // `Invalid input delimiter specification rm`, `invalid option -- 'f'`), which is the proof that
  // they DO consume a word. The SHORT spellings `-I`, `-E`, `-L` take a required argument and stay.
  // `xargs`: `--process-slot-var` was the gap — MEASURED end to end,
  // `printf x | xargs --process-slot-var SLOT <verb> -rf .dzprobe` exited 0 and left the target
  // GONE. The sweep confirmed the rest in both directions: `-I -E -n -P -s -a -d -L` and
  // `--max-args --max-procs --max-chars --arg-file --delimiter` each consume a word, while
// `-0 -r -t -x`, the optional-argument `-l`, and `--eof/--replace/--max-lines` (round 6) do not.
const XARGS_WRAPPER_OPTIONS: OptionArity = { short: 'IEnPsadL', long: new Set(['max-args', 'max-procs', 'max-chars', 'arg-file', 'delimiter', 'process-slot-var']) };
const EXEC_WRAPPER_OPTIONS: OptionArity = { short: 'a', long: new Set() };
// `ionice <verb> -rf .dz` runs the deletion, but ionice was missing from the allowlist, so
  // resolution stopped at an unknown head and allowed it (cross-family review, gpt-5.6-sol,
  // round 8). The arity is the round-8 sweep's, MEASURED: `-c`/`--class` and `-n`/`--classdata`
  // consume a word (`ionice -c 2 printf RAN` prints RAN, bare `-c` does not), `-t`/`--ignore`
  // consume nothing, and `--help`/`--version` exec nothing at all. The pid/uid selectors take a
  // value per ionice's own synopsis (`-p, --pid <pid>...`).
  //
  // Only ionice was added. The other candidates the sweep turned up — timeout, chroot, taskset,
  // chrt, flock, unbuffer, script, torify — are NOT here: widening the allowlist is an ADR question
  // for the owner (backlog 422f7596), not a fix-round decision, and "an unknown head stops the
// search" is a DELIBERATE limit of ADR-001 rather than a defect.
const IONICE_WRAPPER_OPTIONS: OptionArity = { short: 'cnpPu', long: new Set(['class', 'classdata', 'pid', 'pgid', 'uid']) };

/**
 * Options of a wrapper whose VALUE IS THE COMMAND, not a parameter of the wrapper.
 *
 * `env -S '<verb> -rf .dz'` does not run a program called `<verb> -rf .dz`; it SPLITS the string
 * into words and runs the result, with any remaining operands of the `env` line appended. Read as
 * an ordinary value-taking option, the whole command text was skipped and a live deletion of the
 * store was allowed (cross-family review, gpt-5.6-sol, round 4). MEASURED with GNU coreutils 8.32,
 * each case in its own temp directory: `env -S '<verb> -rf .dzprobe'`,
 * `env --split-string '<verb> -rf .dzprobe'` and `env --split-string=<verb> -rf .dzprobe` all exited
 * 0 and left the target GONE — note that the third carries only the VERB in the string, which is
 * why the rest of the line has to be appended rather than dropped.
 *
 * This does NOT widen the scope, for the same reason `sh -c` does not: a string is data about a
 * command only while the head does not EXECUTE it (ADR-001, limit 4).
 */
const ENV_COMMAND_STRING_OPTIONS: OptionArity = { short: 'S', long: new Set(['split-string']) };

/**
 * Options that turn a wrapper into an INSPECTION: it reports where a command lives and runs nothing.
 *
 * MEASURED: `command -v <verb> .dzprobe` printed `/usr/bin/rm`, `command -V <verb> .dzprobe` printed
 * `rm is /usr/bin/rm`, and `command -pv <verb> .dzprobe` printed `/bin/rm` — all exited 0 and left
 * the target ALIVE. Resolving the next word as an executable unconditionally refused a pure lookup
 * (cross-family review, gpt-5.6-sol, round 5); the idiom appears 16 times in the 20 938-command
 * corpus, so the false refusal is not hypothetical. The letters are what disarm it and nothing else:
 * `command <verb> -rf .dzprobe` and `command -p <verb> -rf .dzprobe` both left the target GONE.
 *
 * `builtin` is deliberately NOT here, and the reason is named rather than left to a reader's guess.
 * The review is right that `builtin <verb>` deletes nothing under bash — MEASURED for all four
 * verbs, each `not a shell builtin`, exit 1, target ALIVE — but `builtin` dispatches to whatever the
 * RUNNING shell has, and zsh's `zsh/files` module provides a real builtin `rm`. zsh is not installed
 * on this machine, so that could not be probed, and turning a refusal into `allow` on an unprobed
 * shell is the expensive direction of the error. The false refusal it leaves costs a measured zero:
 * `builtin` at the head of a command appears 0 times in the same corpus.
 */
const INSPECTION_OPTIONS: ReadonlyMap<string, OptionArity> = new Map([
  ['command', { short: 'vV', long: new Set() }],
]);

/** True when `flag` puts the wrapper into an inspection mode — any letter of a cluster counts. */
function isInspectionFlag(inspect: OptionArity, flag: string): boolean {
  if (flag.startsWith('--')) {
    const eq = flag.indexOf('=');
    return inspect.long.has(eq === -1 ? flag.slice(2) : flag.slice(2, eq));
  }
  for (let p = 1; p < flag.length; p++) if (inspect.short.includes(flag.charAt(p))) return true;
  return false;
}

/**
 * Wrappers for which a LONE `-` is an option rather than the command.
 *
 * MEASURED with GNU coreutils 8.32: `env - <verb> -rf .dzprobe` exited 0 and left the target GONE,
 * exactly like `env -i …`, and `env - printf RAN` prints RAN. A one-character word ended the
 * wrapper scan, so `-` resolved as the command head, an unknown head STOPS the search, and a live
 * deletion was allowed (cross-family review, gpt-5.6-sol, round 7).
 *
 * It also ENDS the options, like `--`: `env - -i <marker>` answers `env: '-i': No such file or
 * directory`, i.e. the word after the dash is the COMMAND. And it is env's spelling alone —
 * `sudo - <marker>` answers `sudo: -: command not found`.
 */
const LONE_DASH_WRAPPERS: ReadonlySet<string> = new Set(['env']);

/**
 * Options that make a WRAPPER print something and exit without exec'ing anything.
 *
 * MEASURED across all eight wrappers available here — env, nice, stdbuf, xargs, setsid, nohup,
 * sudo, ionice — sixteen runs, and the marker program executed in NONE of them. The classifier
 * walked past the option to the verb and refused a command that runs nothing (cross-family review,
 * gpt-5.6-sol, round 7).
 *
 * RECORDED BECAUSE THE FIRST MEASUREMENT WAS WRONG, and the error is the interesting half: the
 * probe counted output lines matching `RAN`, and the GNU version banner contains `WARRANTY`. Five
 * wrappers therefore looked as though `--version` still ran the command. The instrument decided the
 * verdict until it was re-run against the marker's full text.
 *
 * Only these two LONG spellings are claimed. Short spellings differ per tool (`sudo -V` is a
 * version request, `-V` is not that anywhere else here), so they are deliberately not generalised.
 */
const WRAPPER_TERMINAL_OPTIONS: ReadonlySet<string> = new Set(['--help', '--version']);

/** How many times one segment may be rewritten by a command-string option before we give up. */
const MAX_COMMAND_STRING_REWRITES = 4;

/**
 * `-S`'s value split into words the way GNU `env` splits it — MEASURED, not inferred.
 *
 * The distinction from a shell parse is load-bearing in BOTH directions. `env -S` hands the split
 * result to `execvp`, so `;`, `|` and `&` are ordinary characters of an argument: in
 * `env -S '<verb> -rf .dz; echo hi'` the operand handed to the verb is `.dz;`, a name that does not
 * exist, and the store is untouched — classifying that string as a shell command line would refuse
 * on a store the command does not delete (the R-flags defect).
 *
 * ROUND-6 CORRECTION. This function used to treat `\_` as an escaped underscore. It is env's WORD
 * SEPARATOR: `env -S '<verb>\_-rf\_.dzprobe'` exited 0 and left the target GONE, and printing argv
 * from inside `-S` shows `a\_b` arriving as TWO arguments, `<a><b>`. Read as one word, the head was
 * not a deletion verb and the guard allowed a live deletion (cross-family review, gpt-5.6-sol,
 * round 6).
 *
 * THE COMPLETE MEASURED TABLE (GNU coreutils 8.32, argv printed from inside `-S`):
 *  - OUTSIDE quotes: `\_` SEPARATES words (repeats and edges collapse: `\_a\_b\_` is `<a><b>`);
 *    `\t \n \f \r \v` are those control characters INSIDE the word, not separators; `\\ \# \$` are
 *    the literal character; `\c` ENDS the whole string (`a\cb\_c` is `<a>`); ordinary spaces
 *    separate as well.
 *  - Inside DOUBLE quotes: escapes still apply but `\_` is an ordinary SPACE (`a"b\_c"d` is
 *    `<ab cd>`), and `\c` is an ERROR (`'\c' must not appear in double-quoted -S string`).
 *  - Inside SINGLE quotes: NOTHING is processed (`a'b\_c'd` is `<ab\_cd>`, `'${HOME}'` stays
 *    literal).
 *  - `${VAR}` is expanded by env; a BARE `$VAR` is an error (`only ${VARNAME} expansion is
 *    supported`), and so is any unrecognised escape (`invalid sequence '\q' in -S`).
 *
 * WHAT AN ERROR MEANS HERE. When env refuses the string it runs NOTHING, so the safe reading is
 * "not decidable by form": the word is marked dynamic, which can never produce a refusal and cannot
 * hide a deletion that never happens. Expansion is marked the same way — it is the guard's first
 * printed limit.
 */

/** `env -S` escapes that stand for one character INSIDE a word, outside single quotes. */
const ENV_S_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['t', '\t'], ['n', '\n'], ['f', '\f'], ['r', '\r'], ['v', '\v'],
  ['\\', '\\'], ['#', '#'], ['$', '$'],
]);

/** The split of an `env -S` value, or null when env would REFUSE the whole string and run nothing. */
function splitStringWords(value: string): Word[] | null {
  const words: Word[] = [];
  let buf = '';
  let has = false;
  let dynamic = false;
  /**
   * True when env would reject the whole `-S` value and exec NOTHING.
   *
   * MEASURED, four spellings, each in a throwaway directory: an unterminated double quote, an
   * unterminated single quote, an unknown escape `\q` and a bare `$BARE` each make env exit 125
   * (`no terminating quote in -S string`, `invalid sequence '\q' in -S`, `only ${VARNAME}
   * expansion is supported`) and leave the target ALIVE. Marking only the offending WORD dynamic
   * left the words BEFORE it standing and produced a refusal for a command that runs nothing
   * (cross-family review, gpt-5.6-sol, round 10) — the invalidity belongs to the whole string.
   */
  let invalid = false;
  const flush = (): void => {
    if (!has) return;
    // `env -S` splits its string and calls execvp DIRECTLY — there is no shell left to expand
    // anything. MEASURED: with a directory `.dz` and a file literally named `{.dz,foo}` side by
    // side, `env -S '<verb> -rf {.dz,foo}'` removed the FILE and left `.dz` ALIVE, and argv printed
    // from inside `-S` shows `<{.dz,foo}>` as one literal argument. So every brace here is part of
    // the name; expanding it refused a path the command never touches (cross-family review,
    // gpt-5.6-sol, round 9). Operands the OUTER shell appends keep their own mask.
    words.push({ kind: 'word', text: buf, dynamic, literalMask: '1'.repeat(buf.length) });
    buf = '';
    has = false;
    dynamic = false;
  };
  /** One escape, shared by the unquoted and double-quoted paths. Returns the next index. */
  const escape = (i: number, inDoubleQuotes: boolean): number => {
    const e = value.charAt(i + 1);
    if (e === '_') {
      if (inDoubleQuotes) { buf += ' '; has = true; }   // an ordinary space inside quotes
      else flush();                                     // …but a WORD SEPARATOR outside them
      return i + 2;
    }
    if (e === 'c' && !inDoubleQuotes) { flush(); return value.length; }   // ends the whole string
    const lit = ENV_S_ESCAPES.get(e);
    if (lit !== undefined) { buf += lit; has = true; return i + 2; }
    invalid = true;                                     // env REFUSES this string and runs nothing
    return i + 2;
  };

  for (let i = 0; i < value.length; ) {
    const c = value.charAt(i);
    if (c === '\\') {
      if (i + 1 >= value.length) { invalid = true; break; }
      i = escape(i, false);
      continue;
    }
    if (c === "'") {                                    // single quotes: nothing is processed
      const end = value.indexOf("'", i + 1);
      if (end === -1) { invalid = true; break; }
      buf += value.slice(i + 1, end);
      has = true;
      i = end + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let closed = false;
      has = true;
      while (j < value.length) {
        const d = value.charAt(j);
        if (d === '"') { closed = true; break; }
        if (d === '\\') { j = escape(j, true); continue; }
        if (d === '$') { dynamic = true; buf += d; j++; continue; }
        buf += d;
        j++;
      }
      if (!closed) { invalid = true; break; }
      i = j + 1;
      continue;
    }
    // `${VARNAME}` is expanded; a BARE `$VAR` is an error env refuses to run.
    if (c === '$') {
      if (value.charAt(i + 1) !== '{') { invalid = true; break; }
      dynamic = true;
      buf += c;
      has = true;
      i++;
      continue;
    }
    if (/\s/.test(c)) { flush(); i++; continue; }
    buf += c;
    has = true;
    i++;
  }
  if (invalid) return null;
  flush();
  return words;
}

/** See the note next to DELETE_VERBS. `rm`/`rmdir`/`unlink` take no separate option values. */
const DELETE_OPTIONS: ReadonlyMap<string, OptionArity> = new Map([
  ['rm', NO_VALUE_OPTIONS],
  ['rmdir', NO_VALUE_OPTIONS],
  ['unlink', NO_VALUE_OPTIONS],
  // RETRACTED CLAIM. Round 1 wrote here that only a FILE-valued option can be mistaken for a
  // target, and that `-n`/`--iterations` and `-s`/`--size` — which take NUMBERS — give the same
  // verdict whether their value is skipped or scanned, so no test could tell the two tables apart.
  // That is FALSE for MALFORMED input, and the falsifier is a single line: `shred -s .dz/foo
  // /tmp/ordinary` makes shred read `.dz/foo` as the SIZE, reject it and destroy nothing (MEASURED
  // with GNU coreutils 8.32 on a throwaway file: `shred: invalid file size: '.dz/foo'`, exit 1,
  // the file byte-identical afterwards), while the classifier named that path as a protected
  // deletion and refused — a refusal naming a store the command does not touch, the R-flags
  // defect. The entries are back WITH the test that discriminates them (F16), and the claim is
  // retracted rather than left standing next to its own counterexample.
  ['shred', { short: 'ns', long: new Set(['random-source', 'iterations', 'size']) }],
]);

/**
 * The ONE registry that decides whether a command head carries another command and, if it does,
 * which grammar locates it. Grammar data such as option arity remains next to its parser, but no
 * head is exempted or unpacked outside this table.
 *
 * R16 corrected the old `SUBCOMMAND_TOOLS` set: it exempted EVERY invocation under a listed tool,
 * so `npm exec -- rm -rf .dz` was described as harmless `npm rm`. A subcommand wrapper now names
 * only its non-filesystem removal verbs as exempt, and names command-running subcommands
 * separately. Unknown subcommands stop as ordinary commands; they are never promoted to an
 * exemption merely because their parent tool is familiar.
 */
type CommandExecution = 'argv' | 'shell';

interface OptionValueCommandCarrier {
  /** The wrapper option whose value is the nested command. */
  options: OptionArity;
  execution: CommandExecution;
  /** `env -S` has its own splitter; shell carriers are parsed recursively as shell source. */
  split: 'env' | 'shell';
  /** GNU env appends the words after its -S value to the split argv. */
  appendRemaining?: boolean;
}

type NestedCommandRule =
  | {
      kind: 'argv';
      /** First positional after options (and any subject words) is the command. */
      location: 'first-positional';
      execution: CommandExecution;
      options: OptionArity;
      positionalsBeforeCommand?: number;
      /** Alternate options whose VALUE, rather than a positional, is the command. */
      optionValueCommands?: readonly OptionValueCommandCarrier[];
      /** Boolean options that change positional execution from argv to shell. */
      shellModeOptions?: OptionArity;
    }
  | { kind: 'external-script'; location: 'named-script'; execution: 'shell' };

type CommandWrapperStrategy =
  | NestedCommandRule
  | { kind: 'shell-c'; location: 'shell-c-string'; execution: 'shell' }
  | {
      kind: 'subcommand';
      options: OptionArity | null;
      shellModeOptions?: OptionArity;
      nonFilesystem: ReadonlySet<string>;
      commands: ReadonlyMap<string, NestedCommandRule>;
    };

const NPM_EXEC_OPTIONS: OptionArity = {
  short: 'pwc',
  long: new Set(['package', 'workspace']),
};
const NPM_CALL_OPTIONS: OptionArity = {
  short: 'c',
  long: new Set(['call']),
};
const PNPM_EXEC_OPTIONS: OptionArity = {
  short: 'C',
  long: new Set(['dir', 'filter']),
};
const NPM_GLOBAL_OPTIONS: OptionArity = {
  short: 'Cw',
  long: new Set(['cache', 'loglevel', 'prefix', 'registry', 'userconfig', 'workspace']),
};
const PNPM_GLOBAL_OPTIONS: OptionArity = {
  short: 'C',
  long: new Set(['config-dir', 'dir', 'filter', 'global-dir', 'store-dir', 'virtual-store-dir']),
};
const PNPM_SHELL_MODE_OPTIONS: OptionArity = {
  short: 'c',
  long: new Set(['shell-mode']),
};
const YARN_GLOBAL_OPTIONS: OptionArity = {
  short: '',
  long: new Set(['cwd']),
};
const YARN_EXEC_OPTIONS: OptionArity = {
  short: 'p',
  long: new Set(['package']),
};
const CONTAINER_EXEC_OPTIONS: OptionArity = {
  short: 'euw',
  long: new Set(['env', 'env-file', 'user', 'workdir', 'detach-keys']),
};
const KUBECTL_EXEC_OPTIONS: OptionArity = {
  short: 'cn',
  long: new Set(['container', 'namespace', 'pod-running-timeout', 'request-timeout']),
};

const argvCommand = (
  options: OptionArity,
  positionalsBeforeCommand = 0,
  extras: Pick<Extract<NestedCommandRule, { kind: 'argv' }>, 'execution' | 'optionValueCommands' | 'shellModeOptions'> = { execution: 'argv' },
): NestedCommandRule => ({
  kind: 'argv',
  location: 'first-positional',
  options,
  positionalsBeforeCommand,
  ...extras,
});
const subcommandWrapper = (
  nonFilesystem: readonly string[],
  commands: readonly (readonly [string, NestedCommandRule])[] = [],
  options: OptionArity | null = null,
  shellModeOptions?: OptionArity,
): CommandWrapperStrategy => ({
  kind: 'subcommand',
  options,
  ...(shellModeOptions === undefined ? {} : { shellModeOptions }),
  nonFilesystem: new Set(nonFilesystem),
  commands: new Map(commands),
});

const COMMAND_WRAPPER_STRATEGIES: ReadonlyMap<string, CommandWrapperStrategy> = new Map([
  ['sudo', argvCommand(SUDO_WRAPPER_OPTIONS)],
  ['doas', argvCommand(DOAS_WRAPPER_OPTIONS)],
  ['env', argvCommand(ENV_WRAPPER_OPTIONS, 0, {
    execution: 'argv',
    optionValueCommands: [{ options: ENV_COMMAND_STRING_OPTIONS, execution: 'argv', split: 'env', appendRemaining: true }],
  })],
  ['nice', argvCommand(NICE_WRAPPER_OPTIONS)],
  ['stdbuf', argvCommand(STDBUF_WRAPPER_OPTIONS)],
  ['time', argvCommand(TIME_WRAPPER_OPTIONS)],
  ['xargs', argvCommand(XARGS_WRAPPER_OPTIONS)],
  ['exec', argvCommand(EXEC_WRAPPER_OPTIONS)],
  ['command', argvCommand(NO_VALUE_OPTIONS)],
  ['builtin', argvCommand(NO_VALUE_OPTIONS)],
  ['nohup', argvCommand(NO_VALUE_OPTIONS)],
  ['setsid', argvCommand(NO_VALUE_OPTIONS)],
  ['ionice', argvCommand(IONICE_WRAPPER_OPTIONS)],
  ...['sh', 'bash', 'zsh', 'dash', 'ksh'].map((name): [string, CommandWrapperStrategy] => [
    name,
    { kind: 'shell-c', location: 'shell-c-string', execution: 'shell' },
  ]),
  ['npx', argvCommand(NPM_EXEC_OPTIONS, 0, {
    execution: 'argv',
    optionValueCommands: [{ options: NPM_CALL_OPTIONS, execution: 'shell', split: 'shell' }],
  })],
  ['npm', subcommandWrapper(
    ['rm', 'remove', 'uninstall', 'un'],
    [
      ['exec', argvCommand(NPM_EXEC_OPTIONS, 0, {
        execution: 'argv',
        optionValueCommands: [{ options: NPM_CALL_OPTIONS, execution: 'shell', split: 'shell' }],
      })],
      ['x', argvCommand(NPM_EXEC_OPTIONS, 0, {
        execution: 'argv',
        optionValueCommands: [{ options: NPM_CALL_OPTIONS, execution: 'shell', split: 'shell' }],
      })],
      ['run', { kind: 'external-script', location: 'named-script', execution: 'shell' }],
      ['run-script', { kind: 'external-script', location: 'named-script', execution: 'shell' }],
    ],
    NPM_GLOBAL_OPTIONS,
  )],
  ['pnpm', subcommandWrapper(
    ['rm', 'remove', 'uninstall', 'un'],
    [
      ['exec', argvCommand(PNPM_EXEC_OPTIONS)],
      ['dlx', argvCommand(PNPM_EXEC_OPTIONS)],
      ['run', { kind: 'external-script', location: 'named-script', execution: 'shell' }],
    ],
    PNPM_GLOBAL_OPTIONS,
    PNPM_SHELL_MODE_OPTIONS,
  )],
  ['yarn', subcommandWrapper(
    ['remove'],
    [
      ['exec', argvCommand(YARN_EXEC_OPTIONS)],
      ['dlx', argvCommand(YARN_EXEC_OPTIONS)],
      ['run', { kind: 'external-script', location: 'named-script', execution: 'shell' }],
    ],
    YARN_GLOBAL_OPTIONS,
  )],
  ['bun', subcommandWrapper(
    ['rm', 'remove', 'uninstall'],
    [
      ['x', argvCommand(NO_VALUE_OPTIONS)],
      ['run', { kind: 'external-script', location: 'named-script', execution: 'shell' }],
    ],
  )],
  ...['git', 'hg', 'svn', 'jj', 'bzr'].map((name): [string, CommandWrapperStrategy] => [name, subcommandWrapper(['rm'])]),
  ['cargo', subcommandWrapper(['rm'], [['run', { kind: 'external-script', location: 'named-script', execution: 'shell' }]])],
  ['pip', subcommandWrapper(['uninstall'])],
  ['pip3', subcommandWrapper(['uninstall'])],
  ['gem', subcommandWrapper(['uninstall'])],
  ['apt', subcommandWrapper(['remove'])],
  ['apt-get', subcommandWrapper(['remove'])],
  ['brew', subcommandWrapper(['rm', 'remove', 'uninstall'])],
  ['docker', subcommandWrapper(['rm'], [['exec', argvCommand(CONTAINER_EXEC_OPTIONS, 1)]])],
  ['podman', subcommandWrapper(['rm'], [['exec', argvCommand(CONTAINER_EXEC_OPTIONS, 1)]])],
  ['kubectl', subcommandWrapper([], [['exec', argvCommand(KUBECTL_EXEC_OPTIONS, 1)]])],
  ['helm', subcommandWrapper([])],
]);

const VCS_TOOLS: ReadonlySet<string> = new Set(['git', 'hg', 'svn', 'jj', 'bzr']);

/**
 * Shells that RUN an inline string given after `-c`.
 *
 * MEASURED, not theory: on the Codex host the model puts exactly `sh -c '…'` into
 * `tool_input.command` (features/crossrt-2-codex-hooks/07_code_changes/probe-results/
 * spike-arming.md:247), so a guard that only reads the direct call protects nothing there.
 *
 * This does NOT widen the scope — it applies the SAME rule as a quoted operand: a string is data
 * about a command only while the head does not EXECUTE it. Under `echo` it stays prose; under
 * `sh -c` it is the command, and it is classified as one.
 */
/**
 * Which shell runners perform BRACE EXPANSION on the string they are given.
 *
 * MEASURED by printing argv from inside each shell present here: `bash -c` and `ksh -c` turn
 * `.d{y..z} x{a,b}` into `<.dy><.dz><xa><xb>`, while `dash -c` passes `<.d{y..z}><x{a,b}>`
 * unchanged — dash has no brace expansion — and `dash -c '<verb> -rf .d{y..z}'` left the target
 * ALIVE. Classifying the inner string with the outer bash-like lexer refused a safe command
 * (cross-family review, gpt-5.6-sol, round 12).
 *
 * `sh` is DELIBERATELY on the expanding side even though `/bin/sh` resolves to `/usr/bin/dash` on
 * this machine, because what `sh` IS varies: it is bash on many systems, and there
 * `sh -c '<verb> -rf .d{y..z}'` deletes the store. Exempting it would trade a false refusal on one
 * machine for a silent MISS on another — the same tie-break as `builtin` (round 6), `sudo --host`
 * (round 8) and the unknown-option decision (round 9). `zsh` is documented to expand and is not
 * installed here, so it stays on the fail-closed side too (F55-guard).
 */
const SHELLS_WITHOUT_BRACE_EXPANSION: ReadonlySet<string> = new Set(['dash']);

/**
 * Options of a shell runner that take the NEXT word as their value.
 *
 * Same defect class as the wrapper arity table (F3), one command further along: the search for the
 * `-c` string stopped at the bare word `extglob` in `bash -O extglob -c '…'`, so the string the
 * shell actually RUNS was never unpacked and the deletion inside it was allowed (cross-family
 * review, gpt-5.6-sol, round 2). Only these four take a separate word in `sh`/`bash`/`zsh`/`dash`/
 * `ksh`; the list is short on purpose, because a wrong entry here consumes the `-c` itself and the
 * guard goes silent on the very form F7 exists to catch.
 */
const SHELL_VALUE_OPTIONS: ReadonlySet<string> = new Set(['-o', '-O', '+o', '+O']);

/**
 * GNU LONG options of a shell runner that take the NEXT word as their value.
 *
 * The same defect as SHELL_VALUE_OPTIONS, one option SPELLING further along: the search for the
 * `-c` string stopped at the bare word `/dev/null` in `bash --rcfile /dev/null -c '<deletion>'`,
 * so the string bash actually RUNS was never unpacked and the deletion inside it was allowed
 * (cross-family review, gpt-5.6-sol, round 3).
 *
 * WHAT WAS CHECKED, so the next reader need not guess at the completeness of a two-entry list.
 * `bash --help` (GNU bash 5.1.16) prints the COMPLETE set of 17 GNU long options: --debug,
 * --debugger, --dump-po-strings, --dump-strings, --help, --init-file, --login, --noediting,
 * --noprofile, --norc, --posix, --pretty-print, --rcfile, --restricted, --verbose, --version.
 * Exactly two of them take a separate word — `--rcfile` and `--init-file`, which are synonyms —
 * and that was PROBED, not read: each value-less one still ran `-c 'echo RAN'` and printed RAN,
 * while both of these two consumed the file name and then ran the `-c` string. `dash` has no long
 * options at all (`dash --help` → `Illegal option --`), and `ksh`/`ksh93` spell their long options
 * as set-option NAMES (`--posix`, `--noglob`, …), none of which takes a value — also probed.
 * `zsh` is NOT installed on this machine and was therefore NOT probed; its long forms are
 * documented as the same set-option names plus `-o option`, which SHELL_VALUE_OPTIONS already
 * covers, so no zsh-specific entry is claimed here.
 *
 * The `--rcfile=FILE` spelling is deliberately absent: bash REJECTS it (`bash --rcfile=/dev/null
 * -c 'echo RAN'` → exit 2, `invalid option`), so that line runs nothing at all.
 *
 * As with every arity table in this file, a WRONG entry consumes the `-c` itself and the guard
 * goes silent on the very form F7 exists to catch — which is why this list is exactly the probed
 * two and not "every long option that looks file-ish".
 */
const SHELL_LONG_VALUE_OPTIONS: ReadonlySet<string> = new Set(['--rcfile', '--init-file']);

/**
 * Shell options that make the `-c` string PARSED but never executed.
 *
 * MEASURED across four shells, each in a throwaway directory: `bash -n -c`, `sh -n -c`,
 * `dash -n -c` and `ksh -n -c` all exit 0 and leave the target ALIVE, as do the clustered
 * `bash -nc` and `bash -o noexec -c`. The string was unpacked and classified unconditionally, so a
 * syntax check was refused (cross-family review, gpt-5.6-sol, round 10).
 *
 * `n` is the only letter here, and that is measured rather than assumed: `-v` and `-x` print the
 * command AND run it — the target was GONE for both on all four shells — so neither may disarm the
 * unpacking (F47-guard).
 */
const SHELL_NO_EXEC_LETTER = 'n';
const SHELL_NO_EXEC_SET_OPTION = 'noexec';

/**
 * Shell options after which the `-c` string is never executed at all.
 *
 * MEASURED with bash 5.1.16, each in a throwaway directory: `--help`, `--version`, `-D`,
 * `--dump-strings` and `--dump-po-strings` print or dump and exit with the target ALIVE, and the
 * clustered `-Dc` behaves the same. On the other shells the same spellings are refused outright —
 * `sh`/`dash` answer `Illegal option --`, `ksh` prints its usage, all non-zero and ALIVE — so
 * nothing runs there either. They were skipped as ordinary flags and the string behind them was
 * then classified as a real deletion (cross-family review, gpt-5.6-sol, round 11).
 *
 * The list is exactly what was RUN, not what reads as terminal on a man page: `--pretty-print`,
 * `--noediting`, `--norc` and `--posix` all left the target GONE, so none of them is here
 * (F49-guard).
 */
const SHELL_TERMINAL_OPTIONS: ReadonlySet<string> = new Set([
  '--help', '--version', '--dump-strings', '--dump-po-strings',
]);

/** The short letter of bash's translation-dump mode, which also never runs the string. */
const SHELL_DUMP_LETTER = 'D';

/** How deep an inline `-c` string is unpacked. One level; deeper is answered `undecidable`. */
const MAX_SHELL_DEPTH = 1;

/**
 * Words the shell reads as SYNTAX in command position rather than as the name of a program.
 *
 * `! rm -rf .agentic-qe` and `if true; then rm -rf .agentic-qe; fi` both delete the store. The
 * classifier took `!` and `then` for an unknown executable, and an unknown head STOPS the search
 * (that default is deliberate — see WRAPPERS), so the deletion behind the keyword was never
 * examined (cross-family review, gpt-5.6-sol, round 2).
 *
 * This is an allowlist for the same reason WRAPPERS is one, and it is short: every entry is a word
 * the POSIX shell reserves in command position, so nothing that could be a real program is skipped.
 * `{`, `(`, `)` and `}` are not here because the lexer already treats a standalone brace or
 * parenthesis as a SEPARATOR, so they never reach this function as a word.
 *
 * `if`/`while`/`until` are transparent for the same reason as `then`/`do`: in `if rm -rf .dz; then
 * …` the condition itself is executed. The head of the segment AFTER the condition is reached
 * through `then`/`do`, since `;` already ends the segment.
 */
const CONTROL_WORDS: ReadonlySet<string> = new Set([
  '!', 'if', 'then', 'elif', 'else', 'while', 'until', 'do',
  // `coproc` EXECUTES the command that follows it, asynchronously. MEASURED:
  // `coproc <verb> -rf .dzprobe; wait $COPROC_PID` exited 0 and left the target GONE, as did the
  // named form `coproc NAME { <verb> -rf .dzprobe; }`. Read as an unknown executable it stopped the
  // search, so the deletion behind it was allowed (cross-family review, gpt-5.6-sol, round 5).
  'coproc',
]);

// -------------------------------------------------------------------------------------------
// Stage 1 — LEX. One pass over the raw string, producing the WORDS the shell would hand to the
// program, plus the separators between commands.
//
// WHY A LEXER AND NOT A MASK. The first version blanked every quoted span, so a deletion whose
// operand was quoted reached the rules with no operand at all and was allowed — while the shell
// still deletes the store, because quotes are the SHELL's syntax and never part of the file name
// (found by the cross-family review, gpt-5.6-sol). The lexer DECODES a word instead of erasing it.
//
// The ADR limit (now: "quotes are read ONLY under a deletion verb and under sh -c") SURVIVES, narrowed to what it was actually
// protecting: only a segment whose head is a deletion verb has its operands examined at all, so
// prose about a command — one quoted word under a head like `echo` or `dz` — is still allowed.
// -------------------------------------------------------------------------------------------

interface Word {
  kind: 'word';
  /** The word as the SHELL would pass it on: quotes removed, escapes decoded. */
  text: string;
  /** True when the word holds something only the shell can resolve: `$`, a backtick, a glob. */
  dynamic: boolean;
  /**
   * One character per character of `text`, saying what the SHELL will do with that position:
   * `0` bare syntax, `1` quoted or escaped literal, `d` something the shell expands.
   *
   * The third state is what lets a MIXED brace group keep the operand it always produces.
   * MEASURED: `{.dz,$OTHER}` arrives as `<.dz>` with OTHER unset and `<.dz><zzz>` with it set — the
   * literal alternative is expanded BEFORE parameter expansion, so it is a guaranteed operand
   * either way and the deletion happened in both runs. A word-wide dynamic flag threw the whole
   * group away and the guaranteed target was never examined (cross-family review, gpt-5.6-sol,
   * round 10). With the mask, `dynamic` is decided PER EXPANSION instead of per word.
   *
   * WHY A MASK AND NOT A FLAG. A word-wide flag disabled every expansion as soon as ONE brace was
   * quoted, and that is a bypass: MEASURED, `"{"x/{foo,.dz}` expands to `<{x/foo><{x/.dz>` — the
   * quoted brace is part of the file name while the SEPARATE unquoted group still expands, and the
   * deletion was allowed (cross-family review, gpt-5.6-sol, round 9). The converse is measured too:
   * a quoted ALTERNATIVE inside a bare group expands (`{"a",b}/.dz` is `<a/.dz><b/.dz>`), so the
   * quoting of the BRACES decides, not the quoting of anything near them.
   */
  literalMask?: string;
}

type Lexeme = Word | Separator | { kind: 'redirect' };

/**
 * One command separator, carrying the CHARACTER it was written with.
 *
 * The character is what tells a function DEFINITION from a subshell: `f` `(` `)` `{` … `}` binds
 * a name and runs nothing, while `(` … `)` on its own really executes. Without it every
 * parenthesis looked alike and the body of a definition was classified as a command the shell
 * never performs (cross-family review, gpt-5.6-sol, round 4; F22).
 */
interface Separator { kind: 'sep'; ch: string; }

interface LexResult {
  lexemes: readonly Lexeme[];
  /** null when the command lexed; otherwise why it could not be read at all. */
  failure: string | null;
  /**
   * True when the shell RUNS what was parsed before the failure, so the prefix must still be
   * classified.
   *
   * MEASURED, and the two cases are genuinely different: an unterminated HEREDOC is a warning —
   * `<verb> -rf .dzprobe; cat <<EOF` prints `warning: here-document ... delimited by end-of-file`,
   * exits 0 and the target is GONE — while an unclosed QUOTE is a syntax error — the same line with
   * `echo "unclosed` exits 2 with `unexpected EOF while looking for matching` and the target is
   * ALIVE. Discarding every parsed segment answered `undecidable`, which the hook passes, so the
   * deletion in front of the heredoc ran unexamined (cross-family review, gpt-5.6-sol, round 9).
   * Keeping the prefix for the syntax-error case would refuse a command that runs nothing.
   */
  prefixRuns: boolean;
}

/** Characters that end one command and start the next. */
const SEPARATORS: ReadonlySet<string> = new Set([';', '&', '|', '(', ')', '\n']);

/**
 * `{` and `}` are RESERVED WORDS, not metacharacters: the shell reads them as a group only when
 * each stands alone as a whole word. Splitting on every occurrence broke `rm /tmp/foo{bar}.db` into
 * an operand `/tmp/foo` plus debris, and the guard allowed a deletion the shell performed
 * (cross-family review, gpt-5.6-sol, round 2). Note the contrast with `(`/`)`, which ARE
 * metacharacters and separate a word wherever they appear — that is why they stay in SEPARATORS.
 */
const BRACE_ENDS_A_WORD: ReadonlySet<string> = new Set(['', ' ', '\t', '\n', ';', '&', '|', '(', ')']);

/** Metacharacters that end a heredoc DELIMITER word (whitespace ends it too). */
const DELIMITER_ENDS: ReadonlySet<string> = new Set([';', '&', '|', '(', ')', '<', '>']);

/** Unescaped occurrences of these always make an unquoted word undecidable by form. */
const DYNAMIC_CHARS = /[`*?]/;

/**
 * Whether `$` at `index` starts an expansion rather than denoting a literal dollar byte.
 *
 * A trailing `$` and `$` before `/` are literal in POSIX-like shells. Marking every dollar dynamic
 * skipped literal operands such as `.dz/$` and let a real deletion pass (R16 P2-2). Named,
 * positional and special parameters, `${...}`, `$()`, legacy `$[...]`, and bash's translated/
 * ANSI-C quote prefixes remain dynamic (the latter is decoded by its dedicated branch).
 */
function dollarExpands(command: string, index: number, inDoubleQuotes = false): boolean {
  const next = command.charAt(index + 1);
  if (next === '') return false;
  if (/[A-Za-z0-9_]/.test(next)) return true;
  if (inDoubleQuotes && (next === "'" || next === '"')) return false;
  return '@*#?-$!({[\'"'.includes(next);
}

/** The placeholder a text-less expansion occupies in a word — see addExpandedSpan. */
const DYNAMIC_SPAN_MARK = '\ue000';

/** The single-character ANSI-C escapes, exactly as `bash` expands them inside `$'…'`. */
const ANSI_C_SIMPLE: ReadonlyMap<string, string> = new Map([
  ['a', '\x07'], ['b', '\b'], ['e', '\x1b'], ['E', '\x1b'], ['f', '\f'],
  ['n', '\n'], ['r', '\r'], ['t', '\t'], ['v', '\v'],
  ['\\', '\\'], ["'", "'"], ['"', '"'], ['?', '?'],
]);

/**
 * The index of the `'` that closes an ANSI-C string opened at `open` (the index of the quote), or
 * -1 when it never closes. `\'` is an escaped quote there, so the scan skips escaped characters.
 */
function ansiCEnd(command: string, open: number): number {
  for (let j = open + 1; j < command.length; j++) {
    const c = command.charAt(j);
    if (c === '\\') { j++; continue; }
    if (c === "'") return j;
  }
  return -1;
}

/** Closing backtick for a command substitution, respecting the backtick escape grammar. */
function backtickEnd(command: string, open: number): number {
  for (let j = open + 1; j < command.length; j++) {
    if (command.charAt(j) === '\\') { j++; continue; }
    if (command.charAt(j) === '`') return j;
  }
  return -1;
}

/** Closing ordinary single quote. Kept as one reader so nested scanners do not grow private rules. */
function singleQuotedEnd(command: string, open: number): number {
  return command.indexOf("'", open + 1);
}

/**
 * `$'…'` decoded the way the shell decodes it.
 *
 * WHY THIS IS NOT THE GENERIC DYNAMIC PATH. `$'…'` is a QUOTING form, not an expansion: the shell
 * resolves it itself and hands the program a fully LITERAL word, so the form IS the fact. The lexer
 * saw the leading `$` and marked the operand dynamic, and a literal path into a protected store was
 * skipped by both hooks (cross-family review, gpt-5.6-sol, round 5). MEASURED in a throwaway
 * directory: `<verb> -rf $'.dzprobe'` and `<verb> -rf $'.dz\x70robe'` both exited 0 and left the
 * target GONE.
 *
 * THE DECODER MUST BE RIGHT, not merely present — a wrong byte either invents a path (a refusal
 * naming a store the command does not touch) or misses one. Every rule below was read off `bash`
 * 5.1.16 with `printf %s $'<case>' | od -An -tx1`, and the whole battery is pinned in F23-oracle:
 *  - an UNRECOGNISED escape keeps its backslash (`$'\.dz'` is four characters, `\.dz`);
 *  - `\nnn` is octal, at most three digits (`$'\1234'` is `S4`);
 *  - `\xHH` takes at most two hex digits and, with none at all, stays the literal `\x`;
 *  - `\cX` is a control character;
 *  - a NUL TERMINATES the word the shell builds (`$'ab\0cd'` is `ab`).
 */
/**
 * A code point rendered the way bash renders it, or null when bash emits bytes a JavaScript string
 * cannot hold.
 *
 * `String.fromCodePoint` THROWS above 0x10FFFF, and the hook's catch turns any exception from this
 * classifier into fail-OPEN — so `rm -rf $'\Uffffffff'; rm -rf .dz` deleted the store while the
 * guard said nothing (cross-family review, gpt-5.6-sol, round 9).
 *
 * MEASURED where the boundary is, because "invalid" is not one behaviour. `$'A\U########B'`:
 *  - `\U80000000`, `\UFFFFFFFE`, `\UFFFFFFFF` produce the two bytes `AB` — the escape expands to
 *    NOTHING. Reproducing that is load-bearing, not cosmetic: `rm -rf $'.d\Uffffffffz'` deletes
 *    `.dz`, so an empty expansion BUILDS a protected path.
 *  - `\U110000`, `\U1FFFFF`, `\U3FFFFFF`, `\U7FFFFFFF` emit four to six bytes of old-style UTF-8,
 *    which a UTF-16 string cannot represent. Those are answered `null`, and the caller marks the
 *    word not-decidable-by-form rather than inventing a spelling for it.
 */
const ANSI_C_EMPTY_FROM = 0x80000000;

function ansiCCharacter(code: number): string | null {
  if (code >= ANSI_C_EMPTY_FROM) return '';        // bash expands it to nothing at all
  if (code > 0x10ffff) return null;                // real bytes, but not expressible here
  return String.fromCodePoint(code);
}

/** The decoded text, plus whether any part of it could not be reproduced faithfully. */
interface AnsiCResult {
  text: string;
  /** True when bash would emit bytes this string cannot hold — the word is then not decidable. */
  inexpressible: boolean;
}

function decodeAnsiC(body: string): AnsiCResult {
  let inexpressible = false;
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body.charAt(i);
    if (c !== '\\') { out += c; continue; }
    const e = body.charAt(i + 1);
    if (e === '') { out += '\\'; break; }
    const simple = ANSI_C_SIMPLE.get(e);
    if (simple !== undefined) { out += simple; i++; continue; }
    if (e >= '0' && e <= '7') {                                   // \nnn — octal, up to three
      const m = /^[0-7]{1,3}/.exec(body.slice(i + 1)) as RegExpExecArray;
      const code = parseInt(m[0], 8);
      if (code === 0) return { text: out, inexpressible };         // a NUL ends the shell's word
      out += String.fromCharCode(code);
      i += m[0].length;
      continue;
    }
    if (e === 'x' || e === 'u' || e === 'U') {                    // \xHH / \uHHHH / \UHHHHHHHH
      const width = e === 'x' ? 2 : e === 'u' ? 4 : 8;
      const m = new RegExp(`^[0-9A-Fa-f]{1,${width}}`).exec(body.slice(i + 2));
      if (m === null) { out += '\\' + e; i++; continue; }         // `$'\x'` is the literal `\x`
      const code = parseInt(m[0], 16);
      if (code === 0) return { text: out, inexpressible };
      const rendered = ansiCCharacter(code);
      if (rendered === null) inexpressible = true;
      else out += rendered;
      i += 1 + m[0].length;
      continue;
    }
    if (e === 'c') {                                              // \cX — a control character
      const x = body.charAt(i + 2);
      if (x === '') { out += '\\c'; i++; continue; }
      const code = x === '?' ? 0x7f : x.toUpperCase().charCodeAt(0) & 0x1f;
      if (code === 0) return { text: out, inexpressible };
      out += String.fromCharCode(code);
      i += 2;
      continue;
    }
    out += '\\' + e;                                              // unrecognised: the backslash stays
    i++;
  }
  return { text: out, inexpressible };
}

/**
 * The subset that still expands INSIDE double quotes: parameter and command substitution, nothing
 * else. Globbing is filename expansion, and the shell does not perform it on a quoted word.
 *
 * MEASURED in a throwaway directory (bash 5.1.16): with a file literally named `*` inside the
 * store, `<verb> -rf ".dzprobe/*"` deleted THAT file and left the rest of the directory alone; with
 * both `a?.db` and `ab.db` present, `<verb> ".dzprobe/a?.db"` deleted `a?.db` and left `ab.db`. So
 * the operand is a LITERAL path and the form IS the fact. Applying the unquoted test inside quotes
 * marked it undecidable, and a literal path into a protected store was skipped (cross-family
 * review, gpt-5.6-sol, round 4; F21). The unquoted direction does not move — F21-guard.
 */
const DQ_DYNAMIC_CHARS = /[`]/;

type CaseSpanPhase = 'await-in' | 'patterns' | 'body';

interface CommandSpanFrame {
  readonly kind: 'command';
  parenDepth: number;
  atCommandPosition: boolean;
  word: string;
  wordBare: boolean;
  wordStarted: boolean;
  readonly cases: { phase: CaseSpanPhase; readonly patternParenDepth: number }[];
  readonly pendingHeredocs: { readonly delim: string; readonly stripTabs: boolean }[];
}

type ShellSpanFrame =
  | CommandSpanFrame
  | { readonly kind: 'double-quote' }
  | { readonly kind: 'parameter'; braceDepth: number }
  | { readonly kind: 'arithmetic'; parenDepth: number };

const SPAN_COMMAND_PREFIX_WORDS: ReadonlySet<string> = new Set([
  'if', 'then', 'elif', 'else', 'do', 'while', 'until', 'for', 'select', '!', 'time', 'coproc',
]);

function newCommandSpanFrame(): CommandSpanFrame {
  return {
    kind: 'command',
    parenDepth: 1,
    atCommandPosition: true,
    word: '',
    wordBare: true,
    wordStarted: false,
    cases: [],
    pendingHeredocs: [],
  };
}

function markSpanWordOpaque(frame: CommandSpanFrame): void {
  frame.wordStarted = true;
  frame.wordBare = false;
}

/** Finish one bare word only far enough to distinguish Bash grammar from literal `)` bytes. */
function finishSpanWord(frame: CommandSpanFrame): void {
  if (!frame.wordStarted) return;
  const token = frame.wordBare ? frame.word : '';
  const activeCase = frame.cases.at(-1);

  if (token === 'esac' && frame.atCommandPosition && activeCase !== undefined
    && activeCase.phase !== 'await-in') {
    frame.cases.pop();
    frame.atCommandPosition = false;
  } else if (token === 'in' && activeCase?.phase === 'await-in') {
    activeCase.phase = 'patterns';
    frame.atCommandPosition = true;
  } else if (token === 'case' && frame.atCommandPosition) {
    frame.cases.push({ phase: 'await-in', patternParenDepth: frame.parenDepth });
    frame.atCommandPosition = false;
  } else if (activeCase?.phase !== 'patterns') {
    frame.atCommandPosition = SPAN_COMMAND_PREFIX_WORDS.has(token);
  }

  frame.word = '';
  frame.wordBare = true;
  frame.wordStarted = false;
}

/** Read and dequote the one shell word naming a heredoc terminator. */
function readSpanHeredoc(command: string, operator: number): {
  readonly delim: string;
  readonly stripTabs: boolean;
  readonly next: number;
} | null {
  let j = operator + 2;
  let stripTabs = false;
  if (command.charAt(j) === '-') { stripTabs = true; j++; }
  while (command.charAt(j) === ' ' || command.charAt(j) === '\t') j++;

  let delim = '';
  let started = false;
  while (j < command.length) {
    const c = command.charAt(j);
    if (/\s/.test(c) || ';&|()<>'.includes(c)) break;
    if (c === '\\') {
      const next = command.charAt(j + 1);
      if (next === '') return null;
      delim += next;
      started = true;
      j += 2;
      continue;
    }
    if (c === '$' && command.charAt(j + 1) === "'") {
      const end = ansiCEnd(command, j + 1);
      if (end === -1) return null;
      delim += decodeAnsiC(command.slice(j + 2, end)).text;
      started = true;
      j = end + 1;
      continue;
    }
    if (c === "'" || c === '"') {
      let end = j + 1;
      let text = '';
      while (end < command.length && command.charAt(end) !== c) {
        if (c === '"' && command.charAt(end) === '\\' && end + 1 < command.length) {
          text += command.charAt(end + 1);
          end += 2;
        } else {
          text += command.charAt(end);
          end++;
        }
      }
      if (end >= command.length) return null;
      delim += text;
      started = true;
      j = end + 1;
      continue;
    }
    delim += c;
    started = true;
    j++;
  }
  return started ? { delim, stripTabs, next: j } : null;
}

/**
 * Find a double-quote or command-substitution boundary with one EXPLICIT stack.
 *
 * R20 made the two readers mutually recursive. That fixed one nesting level but made call-stack
 * depth attacker-controlled: enough alternating `"$(` frames threw before the trailing literal
 * deletion was read. This machine has no input-shaped calls; every byte advances `j` or pushes/
 * pops a heap frame.
 *
 * A `$()` body is shell grammar, not merely balanced punctuation. In particular, the `)` after a
 * case pattern is a branch delimiter. Command frames therefore keep the small amount of lexical
 * state needed to assign every bare `)` its grammatical role; quoted, parameter, arithmetic,
 * process-substitution and nested-command regions are separate frames rather than new recursion,
 * and heredoc bodies are skipped as data before any of their bytes can acquire syntax.
 */
function shellSpanEnd(command: string, open: number, initial: 'command' | 'double-quote'): number {
  const stack: ShellSpanFrame[] = [initial === 'command' ? newCommandSpanFrame() : { kind: 'double-quote' }];
  let j = open + 1;

  while (j < command.length) {
    const frame = stack.at(-1) as ShellSpanFrame;
    const c = command.charAt(j);

    if (frame.kind === 'double-quote') {
      if (c === '\\') { j += Math.min(2, command.length - j); continue; }
      if (c === '$' && command.charAt(j + 1) === '(' && command.charAt(j + 2) === '(') {
        stack.push({ kind: 'arithmetic', parenDepth: 2 });
        j += 3;
        continue;
      }
      if (c === '$' && command.charAt(j + 1) === '(') {
        stack.push(newCommandSpanFrame());
        j += 2;
        continue;
      }
      if (c === '$' && command.charAt(j + 1) === '{') {
        stack.push({ kind: 'parameter', braceDepth: 1 });
        j += 2;
        continue;
      }
      if (c === '`') {
        const end = backtickEnd(command, j);
        if (end === -1) return -1;
        j = end + 1;
        continue;
      }
      if (c === '"') {
        stack.pop();
        if (stack.length === 0) return j;
        j++;
        continue;
      }
      j++;
      continue;
    }

    if (frame.kind === 'parameter') {
      if (c === '\\') { j += Math.min(2, command.length - j); continue; }
      if (c === '$' && command.charAt(j + 1) === '(' && command.charAt(j + 2) === '(') {
        stack.push({ kind: 'arithmetic', parenDepth: 2 });
        j += 3;
        continue;
      }
      if (c === '$' && command.charAt(j + 1) === '(') {
        stack.push(newCommandSpanFrame());
        j += 2;
        continue;
      }
      if (c === '$' && command.charAt(j + 1) === '{') { frame.braceDepth++; j += 2; continue; }
      if (c === '"') { stack.push({ kind: 'double-quote' }); j++; continue; }
      if (c === "'") {
        const end = singleQuotedEnd(command, j);
        if (end === -1) return -1;
        j = end + 1;
        continue;
      }
      if (c === '}') {
        frame.braceDepth--;
        if (frame.braceDepth === 0) stack.pop();
      }
      j++;
      continue;
    }

    if (frame.kind === 'arithmetic') {
      if (c === '\\') { j += Math.min(2, command.length - j); continue; }
      if (c === '$' && command.charAt(j + 1) === '(' && command.charAt(j + 2) !== '(') {
        stack.push(newCommandSpanFrame());
        j += 2;
        continue;
      }
      if (c === '$' && command.charAt(j + 1) === '{') {
        stack.push({ kind: 'parameter', braceDepth: 1 });
        j += 2;
        continue;
      }
      if (c === '(') frame.parenDepth++;
      if (c === ')') {
        frame.parenDepth--;
        if (frame.parenDepth === 0) stack.pop();
      }
      j++;
      continue;
    }

    // From here the frame is a command-substitution body.
    if (c === '\\') { markSpanWordOpaque(frame); j += Math.min(2, command.length - j); continue; }
    if (c === '$' && command.charAt(j + 1) === "'") {
      markSpanWordOpaque(frame);
      const end = ansiCEnd(command, j + 1);
      if (end === -1) return -1;
      j = end + 1;
      continue;
    }
    if (c === '$' && command.charAt(j + 1) === '(' && command.charAt(j + 2) === '(') {
      markSpanWordOpaque(frame);
      stack.push({ kind: 'arithmetic', parenDepth: 2 });
      j += 3;
      continue;
    }
    if (c === '$' && command.charAt(j + 1) === '(') {
      markSpanWordOpaque(frame);
      stack.push(newCommandSpanFrame());
      j += 2;
      continue;
    }
    if (c === '$' && command.charAt(j + 1) === '{') {
      markSpanWordOpaque(frame);
      stack.push({ kind: 'parameter', braceDepth: 1 });
      j += 2;
      continue;
    }
    if (c === '<' && command.charAt(j + 1) === '<' && command.charAt(j + 2) !== '<') {
      finishSpanWord(frame);
      const heredoc = readSpanHeredoc(command, j);
      if (heredoc === null) return -1;
      frame.pendingHeredocs.push({ delim: heredoc.delim, stripTabs: heredoc.stripTabs });
      j = heredoc.next;
      continue;
    }
    if ((c === '<' || c === '>') && command.charAt(j + 1) === '(') {
      markSpanWordOpaque(frame);
      stack.push(newCommandSpanFrame());
      j += 2;
      continue;
    }
    if (c === '`') {
      markSpanWordOpaque(frame);
      const end = backtickEnd(command, j);
      if (end === -1) return -1;
      j = end + 1;
      continue;
    }
    if (c === "'") {
      markSpanWordOpaque(frame);
      const end = singleQuotedEnd(command, j);
      if (end === -1) return -1;
      j = end + 1;
      continue;
    }
    if (c === '"') {
      markSpanWordOpaque(frame);
      stack.push({ kind: 'double-quote' });
      j++;
      continue;
    }
    if (c === '#' && !frame.wordStarted) {
      const newline = command.indexOf('\n', j + 1);
      j = newline === -1 ? command.length : newline;
      continue;
    }
    if (c === '\n') {
      finishSpanWord(frame);
      j++;
      for (const heredoc of frame.pendingHeredocs) {
        let terminated = false;
        while (j <= command.length) {
          const newline = command.indexOf('\n', j);
          const lineEnd = newline === -1 ? command.length : newline;
          const line = command.slice(j, lineEnd);
          j = newline === -1 ? command.length + 1 : newline + 1;
          const comparable = heredoc.stripTabs ? line.replace(/^\t+/, '') : line;
          if (comparable === heredoc.delim) { terminated = true; break; }
          if (newline === -1) break;
        }
        if (!terminated) return -1;
      }
      frame.pendingHeredocs.length = 0;
      frame.atCommandPosition = true;
      continue;
    }
    if (/\s/.test(c)) { finishSpanWord(frame); j++; continue; }
    if (c === ';' || c === '&' || c === '|') {
      finishSpanWord(frame);
      const activeCase = frame.cases.at(-1);
      const caseEndLength = c === ';' && command.charAt(j + 1) === ';'
        ? (command.charAt(j + 2) === '&' ? 3 : 2)
        : c === ';' && command.charAt(j + 1) === '&' ? 2 : 0;
      if (caseEndLength > 0 && activeCase?.phase === 'body') activeCase.phase = 'patterns';
      frame.atCommandPosition = true;
      j += Math.max(caseEndLength, command.charAt(j + 1) === c ? 2 : 1);
      continue;
    }
    if (c === '(') {
      finishSpanWord(frame);
      frame.parenDepth++;
      frame.atCommandPosition = true;
      j++;
      continue;
    }
    if (c === ')') {
      finishSpanWord(frame);
      const activeCase = frame.cases.at(-1);
      if (activeCase?.phase === 'patterns' && frame.parenDepth === activeCase.patternParenDepth) {
        activeCase.phase = 'body';
        frame.atCommandPosition = true;
        j++;
        continue;
      }
      frame.parenDepth--;
      if (frame.parenDepth === 0) {
        stack.pop();
        if (stack.length === 0) return j;
      }
      j++;
      continue;
    }

    frame.wordStarted = true;
    frame.word += c;
    j++;
  }
  return -1;
}

/** Closing ordinary double quote, respecting iterative nested shell spans. */
function doubleQuotedEnd(command: string, open: number): number {
  return shellSpanEnd(command, open, 'double-quote');
}

/** Closing `)` for a `$(` opened at `open`, respecting iterative nested shell spans. */
function commandSubstitutionEnd(command: string, open: number): number {
  return shellSpanEnd(command, open, 'command');
}

function lex(command: string): LexResult {
  const n = command.length;
  const lexemes: Lexeme[] = [];
  const pending: { delim: string; stripTabs: boolean }[] = [];
  let buf = '';
  /** One character per character of `buf` — see Word.literalMask. */
  let mask = '';
  let hasWord = false;
  let dynamic = false;
  /** Append text the shell will NOT read as syntax, because it was quoted or escaped. */
  const addQuoted = (text: string): void => { buf += text; mask += '1'.repeat(text.length); };
  /** Append text the shell reads as bare syntax. */
  const addBare = (text: string): void => { buf += text; mask += '0'.repeat(text.length); };
  /**
   * A span the shell EXPANDS but that contributes no text of its own — `$(…)` and a backtick.
   *
   * It still has to occupy a POSITION, or the mask cannot say which brace alternative was dynamic:
   * MEASURED, `{.dzprobe,$(echo x)}` and `{.dzprobe,\`echo x\`}` both delete the store, so the
   * literal alternative must be refused while the substitution alternative is ignored. The
   * placeholder is a private-use character, and any expansion containing it is dynamic by
   * construction, so it can never reach a reported path.
   */
  const addExpandedSpan = (): void => { buf += DYNAMIC_SPAN_MARK; mask += 'd'; };
  let i = 0;

  const fail = (why: string): LexResult => ({ lexemes: [], failure: why, prefixRuns: false });
  /** The shell warns and runs what it already parsed — see LexResult.prefixRuns. */
  const failKeepingPrefix = (why: string): LexResult => ({ lexemes, failure: why, prefixRuns: true });
  /**
   * A numeric file descriptor written against a redirection operator (`2>`, `3<<EOF`) belongs to
   * the OPERATOR, not to the preceding word — the shell never passes it to the program.
   *
   * The ordinary-redirection branch had this; the HEREDOC branch did not, so `3<<EOF <deletion>`
   * flushed `3` as the segment's first word, the head became the unknown command `3`, and an
   * unknown head STOPS the search — the deletion the shell performs was never examined
   * (cross-family review, gpt-5.6-sol, round 3). Only an ALL-DIGIT word is dropped: dropping any
   * word before the operator would erase a live operand, e.g. `rm -rf .dz<<EOF` (F13-guard).
   */
  const dropAttachedDescriptor = (): void => {
    if (hasWord && /^\d+$/.test(buf)) { buf = ''; mask = ''; hasWord = false; dynamic = false; }
  };
  const flush = (): void => {
    if (!hasWord) return;
    lexemes.push({ kind: 'word', text: buf, dynamic, literalMask: mask });
    buf = '';
    mask = '';
    hasWord = false;
    dynamic = false;
  };

  while (i < n) {
    const c = command.charAt(i);

    // A heredoc body is swallowed at the newline that opens it — it is data, not command.
    if (c === '\n' && pending.length > 0) {
      flush();
      lexemes.push({ kind: 'sep', ch: '\n' });
      i++;
      for (const h of pending) {
        let terminated = false;
        while (i < n) {
          const nl = command.indexOf('\n', i);
          const lineEnd = nl === -1 ? n : nl;
          const line = command.slice(i, lineEnd);
          i = nl === -1 ? n : nl + 1;
          // EXACT, not trimmed. The shell closes a heredoc only on a line that IS the delimiter:
          // `EOF   ` is data, not the end of the block. Comparing with `trimEnd()` closed the block
          // one line early and the lines that are still DATA were then classified as commands — a
          // refusal on a deletion the shell never performs (cross-family review, gpt-5.6-sol,
          // round 2). `<<-` strips LEADING TABS and nothing else, which is the only relaxation the
          // shell itself allows.
          const cmp = h.stripTabs ? line.replace(/^\t+/, '') : line;
          if (cmp === h.delim) { terminated = true; break; }
        }
        if (!terminated) return failKeepingPrefix(`вставной блок не закрыт меткой ${h.delim}`);
      }
      pending.length = 0;
      continue;
    }

    // A backslash makes the NEXT character literal and is then REMOVED by the shell, so the guard
    // removes it too: `.d\z` is the file `.dz`. The first version erased both characters, which
    // left `.d` — a path that matches nothing (cross-family review, gpt-5.6-sol). An escaped
    // metacharacter stays a plain character: not a separator, not a quote, and not a glob, which
    // is why nothing here sets `dynamic`.
    if (c === '\\') {
      if (i + 1 >= n) { addQuoted('\\'); hasWord = true; i++; continue; }
      const e = command.charAt(i + 1);
      if (e === '\n') { i += 2; continue; }        // line continuation: the shell drops both
      addQuoted(e);
      hasWord = true;
      i += 2;
      continue;
    }

    // Inside SINGLE quotes the shell expands NOTHING: `$`, a backtick and a glob are ordinary
    // characters of the file name, so `rm -rf '.agentic-qe/$x'` deletes a literal path. Applying
    // the dynamic-character test to this body marked a perfectly decidable word undecidable and the
    // guard skipped it — the form WAS the fact and we chose not to look (cross-family review,
    // gpt-5.6-sol, round 2). Nothing here sets `dynamic`, for exactly the same reason the backslash
    // branch does not.
    if (c === "'") {
      const end = singleQuotedEnd(command, i);
      if (end === -1) return fail('незакрытая одинарная кавычка');
      addQuoted(command.slice(i + 1, end));
      hasWord = true;
      i = end + 1;
      continue;
    }

    if (c === '"') {
      let j = i + 1;
      let closed = false;
      let acc = '';
      let accMask = '';
      const keep = (text: string, kind: string): void => { acc += text; accMask += kind.repeat(text.length); };
      while (j < n) {
        const d = command.charAt(j);
        if (d === '\\') {
          if (j + 1 >= n) { keep('\\', '1'); j++; continue; }
          const e = command.charAt(j + 1);
          if (e === '"' || e === '\\' || e === '$' || e === '`') { keep(e, '1'); j += 2; continue; }
          if (e === '\n') { j += 2; continue; }
          keep('\\' + e, '1');
          j += 2;
          continue;
        }
        // `$()` remains active inside double quotes, but every byte of its BODY belongs to the
        // nested shell text. In particular, a `"` quoted inside that body cannot close THIS word.
        // Preserve the whole expansion as one dynamic position and let the shared balanced reader
        // skip it. Backticks are the same shell feature in the legacy spelling.
        if (d === '$' && command.charAt(j + 1) === '(') {
          const end = commandSubstitutionEnd(command, j + 1);
          if (end === -1) return fail('незакрытая подстановка команды $( в двойных кавычках');
          dynamic = true;
          keep(DYNAMIC_SPAN_MARK, 'd');
          j = end + 1;
          continue;
        }
        if (d === '`') {
          const end = backtickEnd(command, j);
          if (end === -1) return fail('незакрытая обратная кавычка в двойных кавычках');
          dynamic = true;
          keep(DYNAMIC_SPAN_MARK, 'd');
          j = end + 1;
          continue;
        }
        if (d === '"') { closed = true; break; }
        // Only `$` and a backtick still expand inside double quotes — a glob does not. See
        // DQ_DYNAMIC_CHARS for the measurement that separates the two.
        if (DQ_DYNAMIC_CHARS.test(d) || (d === '$' && dollarExpands(command, j, true))) {
          dynamic = true;
          keep(d, 'd');
        }
        else keep(d, '1');
        j++;
      }
      if (!closed) return fail('незакрытая двойная кавычка');
      buf += acc;
      mask += accMask;
      hasWord = true;
      i = j + 1;
      continue;
    }

    // `$(…)` is a command substitution — the SAME shell feature as a backtick in its modern
    // spelling, and the same deliberate refusal to read it (ADR-001, option C). It is a dynamic
    // SPAN INSIDE the word, not a separator. Reading its two parentheses as unconditional
    // separators STARTED a new segment headed by the word that followed, so `echo $(pwd) <deletion
    // words>` — which the shell hands to `echo`, deleting nothing — was REFUSED (cross-family
    // review, gpt-5.6-sol, round 3). Bare parentheses stay in SEPARATORS: `( <deletion> )` really
    // is a subshell, and if they stopped separating, the head of the group would become the
    // parenthesis itself and the deletion behind it would read as an unknown executable.
    //
    // The OUTCOME is the backtick's outcome, deliberately: a `$(…)` target is `allow` (the target
    // is resolved by the shell — the guard's first printed limit) and an UNCLOSED one is
    // `undecidable`. Two spellings of one shell feature may not decide differently.
    // `$'…'` is ANSI-C QUOTING — the shell resolves it and passes a literal word, so it is decoded
    // here rather than falling into the dynamic path below. See decodeAnsiC for the measurement.
    if (c === '$' && command.charAt(i + 1) === "'") {
      const end = ansiCEnd(command, i + 1);
      if (end === -1) return fail("незакрытая кавычка ANSI-C $'");
      const ansiC = decodeAnsiC(command.slice(i + 2, end));
      addQuoted(ansiC.text);
      if (ansiC.inexpressible) { dynamic = true; addExpandedSpan(); }
      hasWord = true;
      i = end + 1;
      continue;
    }

    if (c === '$' && command.charAt(i + 1) === '(') {
      const end = commandSubstitutionEnd(command, i + 1);
      if (end === -1) return fail('незакрытая подстановка команды $(');
      addExpandedSpan();
      hasWord = true;
      dynamic = true;
      i = end + 1;
      continue;
    }

    // A command substitution is a command we deliberately DO NOT read (ADR-001, option C).
    if (c === '`') {
      const j = backtickEnd(command, i);
      if (j === -1) return fail('незакрытая обратная кавычка');
      addExpandedSpan();
      hasWord = true;
      dynamic = true;
      i = j + 1;
      continue;
    }

    // `#` starts a comment only at the start of a word, so `http://x#y` is left alone.
    if (c === '#' && !hasWord) {
      const nl = command.indexOf('\n', i);
      i = nl === -1 ? n : nl;
      continue;
    }

    // Heredoc: `<<WORD`, `<<-WORD`, `<<'WORD'`. `<<<` is a here-STRING, not a heredoc.
    if (c === '<' && command.charAt(i + 1) === '<' && command.charAt(i + 2) !== '<') {
      let j = i + 2;
      let stripTabs = false;
      if (command.charAt(j) === '-') { stripTabs = true; j++; }
      while (j < n && (command.charAt(j) === ' ' || command.charAt(j) === '\t')) j++;
      // The delimiter is one WORD, and quoting is the SHELL's syntax inside it, not part of the
      // label: `<<E"OF"` is dequoted to `EOF`, exactly like `<<"EOF"` and `<<E\\OF`. Reading only up
      // to the first quote recorded `E`, so the block closed at the first `E` line and the lines
      // that are still DATA were classified as commands — a refusal on a deletion the shell never
      // performs (cross-family review, gpt-5.6-sol, round 5). MEASURED: `cat <<E"OF"` with a body
      // of `E` then `<verb> -rf .dzprobe`, closed by `EOF`, printed BOTH lines and left the target
      // ALIVE. Whether the delimiter was quoted decides expansion INSIDE the body, which this guard
      // never reads, so only the label text matters here.
      let delim = '';
      let sawLabel = false;
      while (j < n) {
        const d = command.charAt(j);
        if (d === "'" || d === '"') {
          const end = command.indexOf(d, j + 1);
          if (end === -1) return fail('незакрытая кавычка в метке вставного блока');
          delim += command.slice(j + 1, end);
          sawLabel = true;
          j = end + 1;
          continue;
        }
        // `$'…'` is a quoting form here too — MEASURED: `cat <<$'EOF'` with a plain `EOF`
        // terminator prints the body and runs on, so bash dequotes the delimiter to `EOF`. Keeping
        // the `$` recorded `$EOF`, the block never closed, the whole command failed to lex and the
        // hook failed open (cross-family review, gpt-5.6-sol, round 9).
        if (d === '$' && command.charAt(j + 1) === "'") {
          const close = ansiCEnd(command, j + 1);
          if (close === -1) return fail("незакрытая кавычка ANSI-C $' в метке вставного блока");
          delim += decodeAnsiC(command.slice(j + 2, close)).text;
          sawLabel = true;
          j = close + 1;
          continue;
        }
        if (d === '\\') {
          if (j + 1 >= n) break;
          delim += command.charAt(j + 1);
          sawLabel = true;
          j += 2;
          continue;
        }
        if (/\s/.test(d) || DELIMITER_ENDS.has(d)) break;
        delim += d;
        sawLabel = true;
        j++;
      }
      if (!sawLabel) return fail('вставной блок без метки');
      dropAttachedDescriptor();
      flush();
      i = j;
      pending.push({ delim, stripTabs });
      continue;
    }

    // A redirection is an OPERATOR, not text. Without this, a deletion with the redirection glued
    // to its operand arrives as ONE token whose first path segment is `.dz>` — which is not the
    // protected store, so the guard allowed it while the shell deleted the store (cross-family
    // review, gpt-5.6-sol). Must be tested BEFORE the separators, so `&>` is not read as `&`.
    if (c === '>' || c === '<' || (c === '&' && command.charAt(i + 1) === '>')) {
      // A leading file descriptor (`2>`) belongs to the operator, not to the previous word.
      dropAttachedDescriptor();
      flush();
      if (c === '&') i++;
      i++;
      while (command.charAt(i) === '>' || command.charAt(i) === '<') i++;   // `>>`, `<<<`
      if (command.charAt(i) === '&') i++;                                   // `>&`, `<&`
      lexemes.push({ kind: 'redirect' });
      continue;
    }

    // A brace separates only when it is a word of its own — see BRACE_ENDS_A_WORD.
    if (c === '{' || c === '}') {
      if (!hasWord && BRACE_ENDS_A_WORD.has(command.charAt(i + 1))) {
        flush();
        lexemes.push({ kind: 'sep', ch: c });
        i++;
        continue;
      }
      addBare(c);
      hasWord = true;
      i++;
      continue;
    }

    // Keep the identity of shell short-circuit operators. Treating both characters as unrelated
    // separators erased the one fact that can prove the right-hand command does not execute.
    if ((c === '&' || c === '|') && command.charAt(i + 1) === c) {
      flush();
      lexemes.push({ kind: 'sep', ch: c + c });
      i += 2;
      continue;
    }

    if (SEPARATORS.has(c)) {
      flush();
      lexemes.push({ kind: 'sep', ch: c });
      i++;
      continue;
    }

    if (/\s/.test(c)) {
      flush();
      i++;
      continue;
    }

    if (DYNAMIC_CHARS.test(c) || (c === '$' && dollarExpands(command, i))) {
      dynamic = true;
      buf += c;
      mask += 'd';
    }
    else addBare(c);
    hasWord = true;
    i++;
  }

  if (pending.length > 0) {
    flush();
    return failKeepingPrefix(`вставной блок не закрыт меткой ${pending[0]?.delim ?? ''}`);
  }
  flush();
  return { lexemes, failure: null, prefixRuns: false };
}

/**
 * Every word of one segment, with its brace groups expanded — the shell's own order, head included.
 *
 * MEASURED: bash expands braces in COMMAND position as well, and the FIRST expanded word becomes
 * the verb: `r{m,m} -rf x` arrives as `<rm><rm><-rf><x>` and `{rm,ls} -rf x` as
 * `<rm><ls><-rf><x>`, both deleting the target. Expanding only operands compared the head
 * unexpanded, an unknown head STOPS the search, and the deletion was allowed — a direct bypass
 * (cross-family review, gpt-5.6-sol, round 10). Doing it here, once, for the whole segment is also
 * what makes a MIXED group work: each expansion carries its OWN mask, so `{.dz,$OTHER}` becomes a
 * literal `.dz` and a dynamic `$OTHER`, exactly like `rm -rf .dz $OTHER`.
 *
 * null when the expansion is too large to enumerate — reported as "could not read", never as safe.
 */
function expandSegment(words: readonly Word[], expandsBraces: boolean): { words: Word[]; overflowed: boolean } {
  const out: Word[] = [];
  let overflowed = false;
  for (const word of words) {
    // A shell WITHOUT brace expansion passes the word through untouched — see SHELL_EXPANDS_BRACES.
    const parts = expandsBraces ? expandBraces(word.text, word.literalMask) : null;
    if (parts === null) {
      // Either this shell does not expand, or the expansion overflowed. In the OVERFLOW case only
      // THIS word is unreadable: MEASURED, ten adjacent `{a,b}` groups make exactly 1024 words and
      // `<verb> -rf {a,b}×10 .dzprobe` still deletes the store, so dropping the whole segment to
      // `undecidable` let the hooks pass it through (cross-family review, gpt-5.6-sol, round 12).
      // The word itself is marked dynamic so it can never produce a refusal of its own.
      if (expandsBraces) {
        overflowed = true;
        // `exactOptionalPropertyTypes` means an OPTIONAL property may be absent or a string, never
        // an explicit `undefined` — assigning `word.literalMask` straight through is TS2379 and it
        // fails `npm run typecheck`, i.e. it blocks the build and the publish (cross-family review,
        // gpt-5.6-sol, round 13). Round 13 shipped without running typecheck; vitest does not run it.
        out.push(
          word.literalMask === undefined
            ? { kind: 'word', text: word.text, dynamic: true }
            : { kind: 'word', text: word.text, dynamic: true, literalMask: word.literalMask },
        );
        continue;
      }
      out.push(word);
      continue;
    }
    for (const part of parts) {
      out.push({
        kind: 'word',
        text: part.text,
        // Decided PER EXPANSION: only an expansion that still holds something the shell resolves
        // is undecidable by form. That is the whole point of the third mask state.
        dynamic: part.mask.includes('d'),
        literalMask: part.mask,
      });
    }
  }
  return { words: out, overflowed };
}

interface CommandSegment {
  words: Word[];
  /** The shell separator immediately before this segment, or null for the first one. */
  connector: string | null;
}

function splitSegmentsWithConnectors(lexemes: readonly Lexeme[]): CommandSegment[] {
  const segments: CommandSegment[] = [];
  let current: Word[] = [];
  let connector: string | null = null;
  for (let k = 0; k < lexemes.length; k++) {
    const lx = lexemes[k] as Lexeme;
    if (lx.kind === 'sep') {
      const hadWords = current.length > 0;
      if (hadWords) segments.push({ words: current, connector });
      current = [];
      // An opening grouping delimiter starts the right-hand command; it does not replace the
      // `&&`/`||` that decides whether that command is reachable. Consecutive separators used to
      // erase the short-circuit here (`false && (rm …)`, `true || { rm …; }`).
      if (!hadWords && (lx.ch === '(' || lx.ch === '{') && (connector === '&&' || connector === '||')) {
        continue;
      }
      connector = lx.ch;
      continue;
    }
    if (lx.kind === 'redirect') {
      // The word after an operator is the redirection TARGET. It is not an operand of the verb:
      // `> .dz/log` creates or truncates a file, it does not delete one, and a refusal that names
      // a rule the command does not break is the first step to being switched off (see R-flags).
      if (lexemes[k + 1]?.kind === 'word') k++;
      continue;
    }
    current.push(lx);
  }
  if (current.length > 0) segments.push({ words: current, connector });
  return segments;
}

type StaticExitStatus = 'success' | 'failure' | 'unknown';

/** Only the literal shell builtins requested by F68 are treated as statically decidable. */
function literalExitStatus(words: readonly Word[]): StaticExitStatus {
  if (words.length !== 1 || words[0]?.dynamic) return 'unknown';
  if (words[0]?.text === 'true') return 'success';
  if (words[0]?.text === 'false') return 'failure';
  return 'unknown';
}

/**
 * Drop only branches whose non-execution follows from literal `true`/`false` status. Unknown
 * commands remain reachable in both directions, preserving the guard's prior fail-closed choice.
 */
function reachableSegments(lexemes: readonly Lexeme[]): Word[][] {
  const reachable: Word[][] = [];
  let status: StaticExitStatus = 'unknown';

  for (const segment of splitSegmentsWithConnectors(lexemes)) {
    const literal = literalExitStatus(segment.words);
    if (segment.connector === '&&') {
      if (status !== 'failure') reachable.push(segment.words);
      if (status === 'success') status = literal;
      else if (status === 'unknown') status = literal === 'failure' ? 'failure' : 'unknown';
      continue;
    }
    if (segment.connector === '||') {
      if (status !== 'success') reachable.push(segment.words);
      if (status === 'failure') status = literal;
      else if (status === 'unknown') status = literal === 'success' ? 'success' : 'unknown';
      continue;
    }
    reachable.push(segment.words);
    status = literal;
  }
  return reachable;
}

/** A function body lifted out of the main stream, together with the name it was bound to. */
interface FunctionBody {
  name: string;
  lexemes: Lexeme[];
}

/** A name the shell may bind a function to. Deliberately narrower than bash allows. */
const FUNCTION_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/**
 * Split the stream into what the shell EXECUTES and the function bodies it merely BINDS.
 *
 * MEASURED with bash 5.1.16, each case in its own temp directory: `f() { <verb> -rf .dzprobe; }`,
 * `f() ( <verb> -rf .dzprobe )` and `function f { <verb> -rf .dzprobe; }` all exit 0 and leave the
 * target ALIVE, while the same line followed by `; f` leaves it GONE. A definition binds a name and
 * runs nothing. The classifier read the body as an ordinary segment and refused a deletion the
 * shell never performs — the false-refusal class this feature exists to avoid (cross-family review,
 * gpt-5.6-sol, round 4; F22).
 *
 * FAIL-CLOSED IN EVERY DOUBTFUL DIRECTION, because the opposite error is a silent miss on a live
 * deletion:
 *  - a body whose opening brace or parenthesis is never matched is NOT a definition, so it stays in
 *    the executed stream and is classified in full;
 *  - a name that does not look like a function name is not a definition either;
 *  - a lifted body is put BACK the moment its name appears as a word anywhere else in the command —
 *    that criterion is deliberately blunter than "a segment head", so that a body reached through
 *    another body (`f() { g; }; g() { <verb> …; }; f`) cannot slip out. It over-refuses on
 *    `f() { … }; echo f`, which is the cheap direction of the error;
 *  - a body that IS reinstated is classified as written, so a definition nested inside it counts as
 *    executed. One level of leniency, never two.
 */
function liftFunctionBodies(lexemes: readonly Lexeme[]): { main: Lexeme[]; bodies: FunctionBody[] } {
  const main: Lexeme[] = [];
  const bodies: FunctionBody[] = [];
  const sepAt = (k: number): string | null => {
    const lx = lexemes[k];
    return lx !== undefined && lx.kind === 'sep' ? lx.ch : null;
  };
  /**
   * Step over NEWLINE separators only, which is what may stand between a function header and its
   * body. MEASURED with bash 5.1.16: `f()` on one line and `{ <verb> -rf .dzprobe; }` on the next
   * exited 0 and left the target ALIVE, as did a blank line between them, the `function f`
   * spelling, and a `( … )` body. A COMMAND separator is NOT part of a header — bash answers
   * `f() ; { … }` with `syntax error near unexpected token`, exit 2 — so nothing else is skipped:
   * lifting a body over a separator the shell itself rejects would widen the non-executed region
   * on input we cannot reason about.
   */
  const skipNewlines = (from: number): number => {
    let j = from;
    while (sepAt(j) === '\n') j++;
    return j;
  };
  /** The index of the separator closing a body opened at `open`, or -1 when it never closes. */
  const bodyEnd = (open: number): number => {
    const opener = sepAt(open);
    const closer = opener === '{' ? '}' : ')';
    if (opener === null) return -1;
    let depth = 0;
    for (let k = open; k < lexemes.length; k++) {
      const ch = sepAt(k);
      if (ch === opener) depth++;
      else if (ch === closer) { depth--; if (depth === 0) return k; }
    }
    return -1;
  };

  for (let k = 0; k < lexemes.length; k++) {
    const lx = lexemes[k] as Lexeme;
    if (lx.kind === 'word') {
      // `name () {` … `}` — and `name () (` … `)`, which binds a subshell body.
      const isKeyword = lx.text === 'function';
      const nameWord = isKeyword ? lexemes[k + 1] : lx;
      if (nameWord !== undefined && nameWord.kind === 'word' && FUNCTION_NAME.test(nameWord.text)) {
        let cursor = k + (isKeyword ? 2 : 1);
        // `function name` may write the parentheses or omit them; `name` alone may not.
        if (sepAt(cursor) === '(' && sepAt(cursor + 1) === ')') cursor += 2;
        else if (!isKeyword) { main.push(lx); continue; }
        cursor = skipNewlines(cursor);
        const opener = sepAt(cursor);
        if (opener === '{' || opener === '(') {
          const end = bodyEnd(cursor);
          if (end !== -1) {
            bodies.push({ name: nameWord.text, lexemes: lexemes.slice(cursor + 1, end) });
            k = end;
            continue;
          }
        }
      }
    }
    main.push(lx);
  }
  return { main, bodies };
}

// -------------------------------------------------------------------------------------------
// Stage 2 — resolve WHAT EACH SEGMENT IS, before any deletion rule runs.
// -------------------------------------------------------------------------------------------

type Invocation =
  | { kind: 'tool'; name: string; args: readonly Word[] }
  | { kind: 'delete'; name: string; args: readonly Word[]; optionMode: PosixOptionMode }
  | { kind: 'shell'; name: string; args: readonly Word[]; optionMode: PosixOptionMode }
  | { kind: 'shell-command'; name: string; command: Word; optionMode: PosixOptionMode }
  /** A named script whose body lives outside the command bytes supplied to this pure classifier. */
  | { kind: 'external-script'; name: string; subcommand: string }
  /** The segment carries a command the SHELL builds — it cannot be read at all (F18-guard). */
  | { kind: 'opaque'; why: string }
  | { kind: 'other'; name: string | null; args: readonly Word[] };

/** Whether POSIXLY_CORRECT's option grammar is known from the command bytes themselves. */
type PosixOptionMode = 'enabled' | 'disabled' | 'unknown';

/**
 * A word bash reads as an ENVIRONMENT ASSIGNMENT in front of a command, not as the command.
 *
 * MEASURED with bash 5.1.16, each case in its own temp directory: `FOO+=x <verb> -rf .dzprobe`
 * exited 0 and left the target GONE, and so did `FOO+=`, `A=1 B=2`, `A=`, `_A=1` and `A1=1`. The
 * APPEND form was not accepted here, so `FOO+=x` read as an unknown executable, an unknown head
 * STOPS the search (see WRAPPERS), and the deletion behind it was allowed (cross-family review,
 * gpt-5.6-sol, round 6).
 *
 * The subscripted form is included because bash RUNS THE COMMAND ANYWAY: `FOO[0]=x <verb> -rf
 * .dzprobe` prints `bash: FOO[0]: not a valid identifier`, exits 0 and the target is GONE — the
 * assignment fails, the deletion does not.
 *
 * The pattern is no looser than that, because a pattern that swallowed a real command word would
 * move the head past it. MEASURED in the other direction: `1A=1 <verb> -rf .dzprobe` and
 * `A-B=1 <verb> -rf .dzprobe` both exit 127 with `command not found` and leave the target ALIVE —
 * bash reads those as the COMMAND — so they must stop the search, exactly as they already did.
 */
const ASSIGNMENT_PREFIX = /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/;

/**
 * Wrappers that accept `VAR=value` in front of the command they run.
 *
 * MEASURED, one throwaway directory per wrapper, `<wrapper> FOO=bar <verb> -rf .dzprobe`:
 *  - ACCEPTS (target GONE): `env`, `sudo`.
 *  - REJECTS (target ALIVE, exit 125/127): `command` (`bash: FOO=bar: command not found`),
 *    `builtin`, `nohup`, `setsid`, `nice`, `stdbuf`, `ionice`, `exec`, `xargs`, and the BINARY
 *    `/usr/bin/time` (`cannot run FOO=bar`).
 * Skipping the word for every wrapper refused all of the second group even though the command
 * never reaches the verb (cross-family review, gpt-5.6-sol, round 13).
 *
 * `time` is on the ACCEPTING side anyway, and the reason is measured rather than assumed: the bare
 * word is a shell KEYWORD here (`type -t time` answers `keyword`), so `time FOO=bar <verb> -rf`
 * really does delete — the assignment is the SHELL's. A basename cannot tell the keyword from
 * `/usr/bin/time`, so the guard keeps the fail-closed reading of the two.
 *
 * `doas` is here for the same fail-closed reason and NOT because it was measured: it is not
 * installed on this machine, so its behaviour could not be run. Where the live answer is
 * unavailable the guard keeps the refusal rather than inventing a pass.
 */
const WRAPPERS_TAKING_ASSIGNMENTS: ReadonlySet<string> = new Set(['env', 'sudo', 'doas', 'time']);

/**
 * Wrappers that are RESERVED WORDS of the shell rather than programs, so what follows them is still
 * shell syntax.
 *
 * MEASURED: `time ! <verb> -rf .dzprobe` exits 1 and the target is GONE — `time` is a keyword, the
 * pipeline behind it still reads `!` as negation, and the deletion runs; `time -p !` and
 * `time time !` behave the same. Treating `time` as an ordinary wrapper cleared command position,
 * `!` became an unknown executable and the search stopped (cross-family review, gpt-5.6-sol,
 * round 14).
 *
 * Only the syntactically BARE word is the keyword. A path, quote or escape is a discriminator —
 * MEASURED, `/usr/bin/time`, `\time`, `'time'`, and `t"ime"` followed by `! <verb> -rf .dzprobe`
 * all exit 127 and leave the target ALIVE, because the binary tries to execute `!`. The lexer has
 * already decoded quotes/escapes, so `Word.literalMask` is what preserves that distinction.
 */
const SHELL_KEYWORD_WRAPPERS: ReadonlySet<string> = new Set(['time']);

const basename = (token: string): string => {
  const parts = token.split('/');
  return parts[parts.length - 1] || token;
};

/**
 * The value of a COMMAND-STRING option, when `flag` is one — `null` when it is an ordinary flag.
 *
 * The short spelling is read through the SAME cluster walk as every other option, so `-iS 'str'`
 * and `-Sstr` are answered consistently with `-iu FOO` and `-uFOO`, and a cluster whose first
 * value-taking letter is an ORDINARY one (`-uS`, where `S` is `-u`'s value) is not mistaken for a
 * command string.
 */
function commandStringValue(
  arity: OptionArity,
  cmd: OptionArity,
  flag: string,
): { attached: string | null } | null {
  if (flag.startsWith('--')) {
    const eq = flag.indexOf('=');
    const name = eq === -1 ? flag.slice(2) : flag.slice(2, eq);
    if (!cmd.long.has(name)) return null;
    return { attached: eq === -1 ? null : flag.slice(eq + 1) };
  }
  const hit = shortClusterValue(arity.short, flag);
  if (hit === null || !cmd.short.includes(hit.letter)) return null;
  return { attached: hit.attached };
}

function optionValueCommand(
  rule: Extract<NestedCommandRule, { kind: 'argv' }>,
  flag: string,
): { carrier: OptionValueCommandCarrier; attached: string | null } | null {
  for (const carrier of rule.optionValueCommands ?? []) {
    const value = commandStringValue(rule.options, carrier.options, flag);
    if (value !== null) return { carrier, attached: value.attached };
  }
  return null;
}

type OptionValueCommandResolution =
  | { kind: 'missing-value' }
  | { kind: 'opaque' }
  | { kind: 'shell'; command: Word }
  | { kind: 'argv'; words: readonly Word[] }
  | { kind: 'invalid' };

function resolveOptionValueCommand(
  rule: Extract<NestedCommandRule, { kind: 'argv' }>,
  words: readonly Word[],
  flagIndex: number,
): OptionValueCommandResolution | null {
  const flagWord = words[flagIndex] as Word;
  const carried = optionValueCommand(rule, flagWord.text);
  if (carried === null) return null;
  const value: Word | undefined = carried.attached !== null
    ? { kind: 'word', text: carried.attached, dynamic: flagWord.dynamic }
    : words[flagIndex + 1];
  if (value === undefined) return { kind: 'missing-value' };
  if (value.dynamic) return { kind: 'opaque' };
  if (carried.carrier.execution === 'shell') return { kind: 'shell', command: value };
  if (carried.carrier.split !== 'env') return { kind: 'invalid' };
  const split = splitStringWords(value.text);
  if (split === null) return { kind: 'invalid' };
  const rest = carried.carrier.appendRemaining === true
    ? words.slice(carried.attached !== null ? flagIndex + 1 : flagIndex + 2)
    : [];
  return { kind: 'argv', words: [...split, ...rest] };
}

/**
 * Locate the command word in an argv-style command carrier.
 *
 * Options are consumed only before the command. `--` ends the carrier's option grammar; any
 * required positional subjects (a container or pod for `docker exec` / `kubectl exec`) are then
 * skipped before the nested command is returned. The returned index points into `words`.
 */
interface ArgvCommandLocation {
  index: number;
  execution: CommandExecution;
}

/** True when a boolean option occurs before any value-taking short option swallows the suffix. */
function hasOptionFlag(arity: OptionArity, sought: OptionArity, flag: string): boolean {
  if (flag.startsWith('--')) {
    const eq = flag.indexOf('=');
    return sought.long.has(eq === -1 ? flag.slice(2) : flag.slice(2, eq));
  }
  for (let i = 1; i < flag.length; i++) {
    const letter = flag.charAt(i);
    if (sought.short.includes(letter)) return true;
    if (arity.short.includes(letter)) return false;
  }
  return false;
}

function argvCommandIndex(
  words: readonly Word[],
  start: number,
  rule: Extract<NestedCommandRule, { kind: 'argv' }>,
  executionOverride?: CommandExecution,
): ArgvCommandLocation | null {
  let optionsEnded = false;
  let remainingPositionals = rule.positionalsBeforeCommand ?? 0;
  let execution = executionOverride ?? rule.execution;
  for (let i = start; i < words.length; i++) {
    const t = words[i]?.text ?? '';
    if (!optionsEnded && t === '--') {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && (t.startsWith('-') || t.startsWith('+')) && t.length > 1) {
      if (rule.shellModeOptions !== undefined && hasOptionFlag(rule.options, rule.shellModeOptions, t)) {
        execution = 'shell';
      }
      if (consumesNextWord(rule.options, t)) i++;
      continue;
    }
    if (remainingPositionals > 0) {
      remainingPositionals--;
      continue;
    }
    return { index: i, execution };
  }
  return null;
}

/** A terminal option in the option prefix makes the carrier exit before any nested command. */
function hasTerminalOptionBeforeFirstPositional(
  words: readonly Word[],
  start: number,
  arity: OptionArity,
): boolean {
  for (let i = start; i < words.length; i++) {
    const flag = words[i]?.text ?? '';
    if (flag === '--') return false;
    if (!(flag.startsWith('-') && flag.length > 1)) return false;
    if (WRAPPER_TERMINAL_OPTIONS.has(flag)) return true;
    if (consumesNextWord(arity, flag)) i++;
  }
  return false;
}

/** The shell source pnpm constructs from the command tail in `--shell-mode`. */
function shellCommandTail(words: readonly Word[]): Word | null {
  if (words.length === 0) return null;
  return {
    kind: 'word',
    text: words.map((word) => word.text).join(' '),
    dynamic: words.some((word) => word.dynamic),
  };
}

const ENV_CLEAR_OPTIONS: OptionArity = { short: 'i', long: new Set(['ignore-environment']) };
const ENV_UNSET_OPTIONS: OptionArity = { short: 'u', long: new Set(['unset']) };

function resolveInvocation(words: readonly Word[], inheritedOptionMode: PosixOptionMode = 'unknown'): Invocation {
  let list: readonly Word[] = words;
  let i = 0;
  let rewrites = 0;
  let optionMode = inheritedOptionMode;
  /**
   * True while the resolver is still where the SHELL would accept a reserved word.
   *
   * MEASURED: once a wrapper or an assignment has taken command position, `!`, `if` and `then` are
   * ordinary program NAMES — `env '!' <verb> -rf .dzprobe` exits 127 with
   * `env: '!': No such file or directory` and the target is ALIVE, `sudo if …` answers
   * `sudo: if: command not found`, and `A=1 ! <verb> …` exits 127 — while at the head of a segment
   * they really are syntax and the deletion behind them HAPPENS (`! <verb> -rf .dzprobe` and
   * `! A=1 <verb> …` both left the target GONE). Skipping them unconditionally refused every one of
   * the first group (cross-family review, gpt-5.6-sol, round 11).
   */
  let atCommandPosition = true;
  /** The most recent wrapper that took command position — see WRAPPERS_TAKING_ASSIGNMENTS. */
  let lastWrapper: string | null = null;
  outer: while (i < list.length) {
    const t = list[i]?.text ?? '';
    // A leading shell assignment is always a prefix; after a WRAPPER has taken command position the
    // same shape is a program NAME unless that wrapper accepts assignments itself.
    // Before any wrapper, ANY number of leading assignments are a prefix (`A=1 B=2 <verb> …`
    // deletes — MEASURED round 7), so the test is the WRAPPER, not the command position: an
    // assignment ends control-word position but not assignment position.
    const assignmentAllowed = lastWrapper === null || WRAPPERS_TAKING_ASSIGNMENTS.has(lastWrapper);
    if (ASSIGNMENT_PREFIX.test(t) && assignmentAllowed) {
      if (/^POSIXLY_CORRECT(?:\+)?=/.test(t)) optionMode = 'enabled';
      i++;
      atCommandPosition = false;
      continue;
    }
    if (atCommandPosition && CONTROL_WORDS.has(t)) { i++; continue; }             // ! rm / then rm
    const name = basename(t);
    const strategy = COMMAND_WRAPPER_STRATEGIES.get(name);
    if (strategy?.kind === 'argv') {
      const arity = strategy.options;
      // A shell KEYWORD does not take command position away from what follows it — but only when
      // every character was syntactically bare. `\time`, `'time'`, `t"ime"`, a path spelling, and
      // a word produced by env -S all invoke the binary; text alone cannot distinguish them after
      // lexing, so the literal mask is load-bearing here.
      const isShellKeyword = SHELL_KEYWORD_WRAPPERS.has(name)
        && !t.includes('/')
        && (list[i]?.literalMask ?? '') === '0'.repeat(t.length);
      if (!isShellKeyword) atCommandPosition = false;
      lastWrapper = name;
      i++;
      while (i < list.length) {
        const flagWord = list[i] as Word;
        const flag = flagWord.text;
        if (flag === '--') { i++; break; }
        // A lone `-` is env's `-i`, and it ends the options — see LONE_DASH_WRAPPERS.
        if (flag === '-' && LONE_DASH_WRAPPERS.has(name)) {
          if (name === 'env') optionMode = 'disabled';
          i++;
          break;
        }
        if (!flag.startsWith('-') || flag.length < 2) break;

        if (name === 'env') {
          if (hasOptionFlag(ENV_WRAPPER_OPTIONS, ENV_CLEAR_OPTIONS, flag)) optionMode = 'disabled';
          const unset = commandStringValue(ENV_WRAPPER_OPTIONS, ENV_UNSET_OPTIONS, flag);
          if (unset !== null) {
            const value = unset.attached ?? list[i + 1]?.text ?? '';
            if (value === 'POSIXLY_CORRECT') optionMode = 'disabled';
          }
        }

        // `--help` / `--version` make the WRAPPER print and exit, so the segment execs nothing.
        // Reached only when the spelling is in an OPTION slot: a previous iteration has already
        // stepped over any word that was some option's VALUE (`sudo -h --help <verb> …`).
        if (WRAPPER_TERMINAL_OPTIONS.has(flag)) return { kind: 'other', name, args: [] };

        // A lookup option means the segment RUNS nothing — see INSPECTION_OPTIONS.
        const inspect = INSPECTION_OPTIONS.get(name);
        if (inspect !== undefined && isInspectionFlag(inspect, flag)) {
          return { kind: 'other', name, args: [] };
        }

        // An option whose VALUE IS THE COMMAND (`env -S '<verb> -rf .dz'`): the string is split into
        // words and the REST of the segment is appended to it, which is what makes
        // `env --split-string=<verb> -rf .dz` delete. Then the whole resolution restarts on the
        // rewritten word list, so the head is found by the ordinary rules.
        const carried = resolveOptionValueCommand(strategy, list, i);
        if (carried !== null) {
          if (carried.kind === 'missing-value') break;
          if (carried.kind === 'opaque') {
            return { kind: 'opaque', why: `«${name} ${flag}» получает команду, собранную оболочкой` };
          }
          if (rewrites >= MAX_COMMAND_STRING_REWRITES) {
            return { kind: 'opaque', why: `«${name} ${flag}» вложен глубже ${MAX_COMMAND_STRING_REWRITES} раз` };
          }
          if (carried.kind === 'shell') {
            return { kind: 'shell-command', name: `${name} ${flag}`, command: carried.command, optionMode };
          }
          if (carried.kind === 'invalid') {
            return { kind: 'opaque', why: `«${name} ${flag}» получает строку, которую env отвергает целиком — не исполняется ничего` };
          }
          rewrites++;
          list = carried.words;
          i = 0;
          continue outer;
        }

        i++;
        if (consumesNextWord(arity, flag)) i++;   // the value is NOT the command
      }
      continue;
    }
    if (strategy?.kind === 'subcommand') {
      if (strategy.options !== null
        && hasTerminalOptionBeforeFirstPositional(list, i + 1, strategy.options)) {
        return { kind: 'other', name, args: [] };
      }
      const subcommandLocation: ArgvCommandLocation | null = strategy.options === null
        ? { index: i + 1, execution: 'argv' }
        : argvCommandIndex(list, i + 1, {
            kind: 'argv',
            location: 'first-positional',
            execution: 'argv',
            options: strategy.options,
            ...(strategy.shellModeOptions === undefined ? {} : { shellModeOptions: strategy.shellModeOptions }),
          });
      if (subcommandLocation === null) return { kind: 'other', name, args: [] };
      const subcommandAt = subcommandLocation.index;
      const subcommandWord = list[subcommandAt];
      if (subcommandWord === undefined) return { kind: 'other', name, args: [] };
      if (subcommandWord.dynamic) {
        return { kind: 'opaque', why: `«${name}» получает подкоманду, собранную оболочкой` };
      }
      const subcommand = subcommandWord.text;
      if (strategy.nonFilesystem.has(subcommand)) {
        return { kind: 'tool', name, args: list.slice(i + 1) };
      }
      const nested = strategy.commands.get(subcommand);
      if (nested?.kind === 'external-script') {
        return {
          kind: 'external-script',
          name,
          subcommand,
        };
      }
      if (nested?.kind === 'argv') {
        if (hasTerminalOptionBeforeFirstPositional(list, subcommandAt + 1, nested.options)) {
          return { kind: 'other', name, args: [] };
        }
        for (let k = subcommandAt + 1; k < list.length; k++) {
          const flagWord = list[k] as Word;
          const flag = flagWord.text;
          if (flag === '--') break;
          if (!flag.startsWith('-') || flag.length < 2) break;
          const carried = resolveOptionValueCommand(nested, list, k);
          if (carried === null) {
            if (consumesNextWord(nested.options, flag)) k++;
            continue;
          }
          if (carried.kind === 'missing-value') return { kind: 'other', name, args: [] };
          if (carried.kind === 'opaque') {
            return { kind: 'opaque', why: `«${name} ${subcommand} ${flag}» получает команду, собранную оболочкой` };
          }
          if (carried.kind === 'shell') {
            return { kind: 'shell-command', name: `${name} ${subcommand} ${flag}`, command: carried.command, optionMode };
          }
          if (rewrites >= MAX_COMMAND_STRING_REWRITES) {
            return { kind: 'opaque', why: `«${name} ${subcommand} ${flag}» вложен глубже ${MAX_COMMAND_STRING_REWRITES} раз` };
          }
          if (carried.kind === 'invalid') {
            return { kind: 'opaque', why: `«${name} ${subcommand} ${flag}» получает строку, которую носитель отвергает целиком — не исполняется ничего` };
          }
          rewrites++;
          list = carried.words;
          i = 0;
          continue outer;
        }

        const commandLocation = argvCommandIndex(
          list,
          subcommandAt + 1,
          nested,
          subcommandLocation.execution === 'shell' ? 'shell' : undefined,
        );
        if (commandLocation === null) return { kind: 'other', name, args: [] };
        const command = list[commandLocation.index] as Word;
        if (command.dynamic) {
          return { kind: 'opaque', why: `«${name} ${subcommand}» получает имя команды, собранное оболочкой` };
        }
        if (rewrites >= MAX_COMMAND_STRING_REWRITES) {
          return { kind: 'opaque', why: `«${name} ${subcommand}» вложен глубже ${MAX_COMMAND_STRING_REWRITES} раз` };
        }
        if (commandLocation.execution === 'shell') {
          const shellCommand = shellCommandTail(list.slice(commandLocation.index));
          if (shellCommand === null) return { kind: 'other', name, args: [] };
          if (shellCommand.dynamic) {
            return { kind: 'opaque', why: `«${name} ${subcommand}» получает команду, собранную оболочкой` };
          }
          return { kind: 'shell-command', name: `${name} ${subcommand}`, command: shellCommand, optionMode };
        }
        rewrites++;
        list = list.slice(commandLocation.index);
        i = 0;
        continue;
      }
      break;
    }
    break;
  }
  if (i >= list.length) return { kind: 'other', name: null, args: [] };

  const head = basename(list[i]?.text ?? '');

  if (DELETE_VERBS.has(head)) {
    return { kind: 'delete', name: head, args: list.slice(i + 1), optionMode };
  }
  if (COMMAND_WRAPPER_STRATEGIES.get(head)?.kind === 'shell-c') {
    return { kind: 'shell', name: head, args: list.slice(i + 1), optionMode };
  }
  return { kind: 'other', name: head, args: list.slice(i + 1) };
}

/**
 * The inline string a shell was told to RUN: the first non-option word after option processing has
 * seen `c` (`-c`, `-lc`, `-ec`). Shells keep accepting options between `-c` and that word:
 * `bash -c -- '<cmd>'`, `bash -c -x '<cmd>'`, and `bash -c -o posix '<cmd>'` all execute `<cmd>`.
 *
 * A positional word BEFORE any `-c` is a script PATH, not an inline command — `sh script.sh` runs
 * a file this guard never reads, so the search stops there rather than guessing.
 *
 * `--` ends the options, so the word after it is a script NAME even when it is spelled `-c`:
 * `bash -- -c '<string>'` runs the FILE called `-c` and hands the string to it as `$1`. Reading it
 * would refuse on a deletion that never happens — the false-refusal class, in the OTHER direction.
 */
function inlineShellCommand(args: readonly Word[]): Word | null {
  // No-exec is a STATE, not a single match: the options are applied left to right and the LAST one
  // wins. MEASURED — `bash -n -c '<cmd>'` leaves the target ALIVE but `bash -n +n -c '<cmd>'`
  // leaves it GONE, and `-o noexec +o noexec -c` is GONE while `+o noexec -o noexec -c` is ALIVE.
  // Returning on the first no-exec option classified a real deletion as allowed (cross-family
  // review, gpt-5.6-sol, round 11).
  let noExec = false;
  let terminal = false;
  let commandRequested = false;
  for (let k = 0; k < args.length; k++) {
    const t = args[k]?.text ?? '';
    if (t === '--') {
      // Before `-c`, the next word is a script name. After `-c`, `--` merely ends the remaining
      // option scan and the next word is the requested command string (R16 live shell matrix).
      return commandRequested && !noExec && !terminal ? args[k + 1] ?? null : null;
    }
    if (SHELL_TERMINAL_OPTIONS.has(t)) { terminal = true; continue; }
    if (SHELL_VALUE_OPTIONS.has(t)) {
      // `-o noexec` sets it, `+o noexec` clears it; any other set-option is irrelevant here.
      if (args[k + 1]?.text === SHELL_NO_EXEC_SET_OPTION) noExec = t.startsWith('-');
      k++;
      continue;
    }
    if (SHELL_LONG_VALUE_OPTIONS.has(t)) { k++; continue; }  // `--rcfile FILE`: same, long spelling
    if (/^[-+][A-Za-z]+$/.test(t)) {
      const minus = t.startsWith('-');
      if (minus && t.includes(SHELL_DUMP_LETTER)) terminal = true;
      if (t.includes(SHELL_NO_EXEC_LETTER)) noExec = minus;
      // A CLUSTERED set-option letter still takes the next word as its value, and it does so
      // BEFORE the `-c` string is located. MEASURED: `bash -co posix '<cmd>'` deletes, and
      // `bash -co posix '<argv-printer> one two'` prints `<one><two>` — `posix` went to `-o`, and
      // the string is the word after it. Reading the `c` first returned `posix` as the script and
      // the deletion was allowed (cross-family review, gpt-5.6-sol, round 12). Letter order inside
      // the cluster does not matter: `-oc posix` behaves identically.
      const values = (t.match(/[oO]/g) ?? []).length;
      for (let v = 1; v <= values; v++) {
        if (args[k + v]?.text === SHELL_NO_EXEC_SET_OPTION) noExec = minus;
      }
      // `+c` runs the string exactly like `-c` — MEASURED on bash, sh, dash and ksh, all GONE.
      // Seeing `c` does NOT stop option processing; the first non-option does. Once that word is
      // reached, later words are `$0`, `$1`, ... and cannot change the option state (F48-guard).
      if (t.includes('c')) commandRequested = true;
      k += values;
      continue;
    }
    if ((t.startsWith('-') || t.startsWith('+')) && t.length > 1) continue;
    return commandRequested && !noExec && !terminal ? args[k] ?? null : null;
  }
  return null;
}

// -------------------------------------------------------------------------------------------
// Stage 3 — the rules. A literal path into a protected store, or a literal database file.
// -------------------------------------------------------------------------------------------

/**
 * The path as a list of segments, with `.` dropped and `..` cancelled LEXICALLY.
 *
 * WHY `..` HAD TO JOIN `.`. Dropping only `.` left `rm -rf .dz/../ordinary` matching on the segment
 * `.dz` in a path that leads OUT of the store, i.e. a refusal naming a store the command does not
 * touch — the false-refusal class this feature exists to avoid (cross-family review, gpt-5.6-sol,
 * round 2). Cancelling is safe in the other direction too: `ordinary/../.dz` still ends in `.dz`.
 *
 * LEXICAL, not resolved: a LEADING `..` has nothing to cancel against and is KEPT, because where it
 * points is exactly the guard's second printed limit — a relative path we do not resolve. No
 * filesystem is touched, so a symlink in the middle of the path can still make the lexical answer
 * differ from the real one; that is the same limit, not a new one.
 *
 * HONEST NOTE ON THE `push('..')` BRANCH. It is deliberately NOT claimed to be covered by a test,
 * because no test can cover it by outcome: a `..` segment matches neither PROTECTED_SEGMENTS nor
 * DATABASE_FILE, so keeping it and dropping it give the SAME verdict on every input (MEASURED
 * 2026-09-05, both normalisers run side by side over `../.dz`, `../../.agentic-qe`, `a/../../.dz`,
 * `../.dz/../x`, `../../x/../.dz`, `.dz/..`, `.dz/../..`, `../ordinary` — eight identical verdicts).
 * It is kept because it is the lexically correct answer, and because it is what stops this function
 * from silently becoming wrong if a future rule ever counts segments. The branch that IS observable
 * — cancelling `..` against a real segment — is pinned by F12 and F12-guard.
 */
function normalisedSegments(path: string): string[] {
  const out: string[] = [];
  for (const s of path.split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') {
      const last = out[out.length - 1];
      if (last !== undefined && last !== '..') out.pop();
      else out.push('..');
      continue;
    }
    out.push(s);
  }
  return out;
}

/** How many words one brace expansion may produce before the guard gives up on reading it. */
const MAX_BRACE_EXPANSIONS = 1000;

/**
 * One brace group the shell would EXPAND, or null when the word holds none.
 *
 * MEASURED with bash 5.1.16 by printing argv, which is what makes this narrow rather than
 * "anything in braces": a group expands only when it holds an unquoted top-level COMMA
 * (`.d{z,z}` → `<.dz><.dz>`, `{,.dz}` → `<.dz>`, the empty alternative disappearing) or a RANGE
 * (`{1..3}`, `{a..c}`, `{3..1}` descending, `{1..9..3}` stepped, `{01..3}` zero-padded to width,
 * `{-1..1}` signed). Everything else stays part of the file name: `{bar}` with no comma, `{}`,
 * an unclosed `x{a,b`, and a group whose braces were quoted or escaped.
 *
 * This is the discriminator F11 (round 2) never had. F11's assertions are unchanged and still
 * measured — `rm /tmp/foo{bar}.db` really does delete a file with braces in its name — but its
 * WORDING ("a brace inside a word is part of the file name") was broader than its evidence, and
 * the gap between the two was a direct bypass of every protected segment and database suffix
 * (cross-family review, gpt-5.6-sol, round 8).
 */
interface BraceGroup {
  start: number;
  end: number;
  alternatives: readonly string[];
  /** Where each alternative began in the ORIGINAL word, so its mask slice can follow it. */
  altStarts: readonly number[];
}

/** The alternatives of a `{a..b}` / `{a..b..step}` range, or null when the body is not a range. */
/**
 * `bodyMask` is the quoting mask of the body — a range is syntax only when ALL of it is bare.
 *
 * MEASURED: bash passes `.d{y..z}` UNCHANGED for `.d{y"."."z"}`, `.d{y".."z}`, `.d"{y..z}"` and
 * `.d{"y"..z}`, while the bare `.d{y..z}` expands to `<.dy><.dz>`. Reading only the dequeued body
 * manufactured `.dy`/`.dz` and refused a command that never touches the store (cross-family review,
 * gpt-5.6-sol, round 12). Note the contrast with a COMMA group, where a quoted ALTERNATIVE still
 * expands (`{"a",.dz}` is `<a><.dz>`) — that is a different rule, and it is unchanged.
 */
function braceRange(body: string, bodyMask: string): string[] | null {
  if (bodyMask.length === body.length && /[^0]/.test(bodyMask)) return null;
  const parts = body.split('..');
  if (parts.length < 2 || parts.length > 3) return null;
  const [rawFrom, rawTo, rawStep] = parts as [string, string, string | undefined];
  const step = rawStep === undefined ? null : Number(rawStep);
  if (rawStep !== undefined && (!Number.isInteger(step) || step === 0)) return null;

  if (/^-?\d+$/.test(rawFrom) && /^-?\d+$/.test(rawTo)) {
    const from = Number(rawFrom);
    const to = Number(rawTo);
    // A leading zero on either endpoint pads every result to the wider of the two spellings.
    const pad = /^-?0\d/.test(rawFrom) || /^-?0\d/.test(rawTo)
      ? Math.max(rawFrom.length, rawTo.length)
      : 0;
    const delta = Math.abs(step ?? 1) * (to >= from ? 1 : -1);
    const out: string[] = [];
    for (let v = from; delta > 0 ? v <= to : v >= to; v += delta) {
      const digits = String(Math.abs(v));
      const sign = v < 0 ? '-' : '';
      out.push(pad > 0 ? sign + digits.padStart(pad - sign.length, '0') : String(v));
      if (out.length > MAX_BRACE_EXPANSIONS) return null;
    }
    return out;
  }

  if (/^[A-Za-z]$/.test(rawFrom) && /^[A-Za-z]$/.test(rawTo)) {
    const from = rawFrom.charCodeAt(0);
    const to = rawTo.charCodeAt(0);
    const delta = Math.abs(step ?? 1) * (to >= from ? 1 : -1);
    const out: string[] = [];
    for (let v = from; delta > 0 ? v <= to : v >= to; v += delta) {
      out.push(String.fromCharCode(v));
      if (out.length > MAX_BRACE_EXPANSIONS) return null;
    }
    return out;
  }
  return null;
}

function findBraceGroup(word: string, mask: string): BraceGroup | null {
  /** A character the shell reads as SYNTAX — quoted or escaped ones are part of the name. */
  const bare = (at: number): boolean => mask.charAt(at) !== '1';
  for (let i = 0; i < word.length; i++) {
    if (word.charAt(i) !== '{' || !bare(i)) continue;
    let depth = 0;
    const commas: number[] = [];
    for (let j = i; j < word.length; j++) {
      const c = word.charAt(j);
      if (!bare(j)) continue;
      if (c === '{') { depth++; continue; }
      if (c === ',' && depth === 1) { commas.push(j); continue; }
      if (c !== '}') continue;
      depth--;
      if (depth > 0) continue;
      const body = word.slice(i + 1, j);
      if (commas.length > 0) {
        const alternatives: string[] = [];
        const altStarts: number[] = [];
        let from = i + 1;
        for (const at of commas) { altStarts.push(from); alternatives.push(word.slice(from, at)); from = at + 1; }
        altStarts.push(from);
        alternatives.push(word.slice(from, j));
        return { start: i, end: j, alternatives, altStarts };
      }
      const range = braceRange(body, mask.slice(i + 1, j));
      // A range's words are GENERATED, not lifted out of the text, so they carry no quoting: the
      // mask slice for them is empty and `walk` pads it to bare.
      if (range !== null) return { start: i, end: j, alternatives: range, altStarts: range.map(() => j) };
      break;                       // `{bar}`: not expandable — look for a later group instead
    }
  }
  return null;
}

/**
 * Every word the shell would produce from `word`, in the shell's own order, or null when the
 * expansion is too large to enumerate (which is reported as "could not read", never as safe).
 *
 * The order matters: the verdict names the FIRST operand that breaks a rule, and `{x,y}/{a,.dz}`
 * arrives as `<x/a><x/.dz><y/a><y/.dz>`, so the leftmost group is expanded first.
 */
interface Expansion {
  text: string;
  mask: string;
}

function expandBraces(word: string, literalMask?: string): Expansion[] | null {
  const out: Expansion[] = [];
  // The mask travels WITH the text through every substitution: an alternative lifted out of a bare
  // group keeps its own quoting, so `{"a",b}/.dz` still expands while `pre"{a,.dz}"` still does not.
  const walk = (w: string, m: string): boolean => {
    const group = findBraceGroup(w, m);
    if (group === null) {
      out.push({ text: w, mask: m });
      return out.length <= MAX_BRACE_EXPANSIONS;
    }
    const pre = w.slice(0, group.start);
    const post = w.slice(group.end + 1);
    const preMask = m.slice(0, group.start);
    const postMask = m.slice(group.end + 1);
    for (let k = 0; k < group.alternatives.length; k++) {
      const alt = group.alternatives[k] as string;
      const at = group.altStarts[k] as number;
      const altMask = (m.slice(at, at + alt.length) + '0'.repeat(alt.length)).slice(0, alt.length);
      if (!walk(pre + alt + post, preMask + altMask + postMask)) return false;
    }
    return true;
  };
  const mask = literalMask !== undefined && literalMask.length === word.length
    ? literalMask
    : '0'.repeat(word.length);
  return walk(word, mask) ? out : null;
}

function matchProtectedPath(token: string): { rule: string; what: string } | null {
  const trimmed = token.replace(/\/+$/, '');
  if (trimmed === '') return null;
  const segments = normalisedSegments(trimmed);

  for (const segment of segments) {
    const rule = PROTECTED_SEGMENTS.get(segment);
    if (rule) return { rule, what: describeRule(rule) };
  }

  const leaf = segments[segments.length - 1] ?? '';
  if (DATABASE_FILE.test(leaf)) return { rule: 'database-file', what: describeRule('database-file') };

  return null;
}

const describeRule = (id: string): string =>
  DESTRUCTIVE_RULES.find((r) => r.id === id)?.what ?? id;

interface ProtectedOperand {
  path: string;
  rule: string;
  what: string;
}

type DeleteAnalysis =
  | { kind: 'terminal'; option: string }
  | { kind: 'delete'; protected: ProtectedOperand[] }
  | { kind: 'undecidable'; why: string };

/** Whether shell expansion of this source word could produce an exact terminal-mode option. */
function dynamicWordCouldBeTerminalOption(word: Word): boolean {
  const mask = word.literalMask ?? '';
  const firstDynamic = mask.indexOf('d');
  if (firstDynamic === -1) return false;

  // Parameter expansion keeps its source spelling in `text`, while only `$` is marked dynamic.
  // The name characters are syntax, not output, so only the fixed prefix before `$` constrains the
  // resulting word. A non-dash prefix can never become either exact terminal option.
  const dollar = word.text.indexOf('$');
  if (dollar !== -1 && mask.charAt(dollar) === 'd') {
    const fixedPrefix = word.text.slice(0, dollar);
    return [...TERMINAL_MODE_OPTIONS].some((option) => option.startsWith(fixedPrefix));
  }

  // For glob/substitution masks, ask the narrower question we actually care about: can the
  // pattern produce exactly `--help` or `--version`? A late `.dz/backup-*` is dynamic, but it can
  // never become an option and therefore must not downgrade a real protected deletion.
  let pattern = '^';
  for (let i = 0; i < word.text.length; i++) {
    const ch = word.text.charAt(i);
    if (mask.charAt(i) === 'd') pattern += ch === '?' ? '.' : '.*';
    else pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  pattern += '$';
  const possible = new RegExp(pattern);
  return [...TERMINAL_MODE_OPTIONS].some((option) => possible.test(option));
}

/** Analyze one deletion under one explicit option grammar. */
function analyzeDeleteInvocation(
  name: string,
  args: readonly Word[],
  arity: OptionArity,
  posixlyCorrect: boolean,
): DeleteAnalysis {
  let terminal: string | null = null;
  for (let k = 0; k < args.length; k++) {
    const arg = args[k] as Word;
    if (arg.text === '--') break;
    if (TERMINAL_MODE_OPTIONS.has(arg.text)) { terminal = arg.text; break; }
    if (arg.text.startsWith('-') && arg.text.length > 1) {
      if (consumesNextWord(arity, arg.text)) k++;
      continue;
    }
    if (posixlyCorrect) break;
  }
  if (terminal !== null) return { kind: 'terminal', option: terminal };

  // A shell-built word in a live option slot might become a terminal option. GNU option grammar
  // keeps scanning after operands; POSIXLY_CORRECT ends option parsing at the first operand.
  let dynamicOption = false;
  for (let k = 0; k < args.length; k++) {
    const arg = args[k] as Word;
    if (arg.text === '--') break;
    if (dynamicWordCouldBeTerminalOption(arg)) { dynamicOption = true; break; }
    if (arg.text.startsWith('-') && arg.text.length > 1) {
      if (consumesNextWord(arity, arg.text)) k++;
      continue;
    }
    if (posixlyCorrect) break;
  }

  const protectedOperands: ProtectedOperand[] = [];
  let flagsEnded = false;
  for (let k = 0; k < args.length; k++) {
    const arg = args[k] as Word;
    if (!flagsEnded && arg.text === '--') { flagsEnded = true; continue; }
    if (!flagsEnded && arg.text.startsWith('-') && arg.text.length > 1) {
      if (consumesNextWord(arity, arg.text)) k++;
      continue;
    }
    if (posixlyCorrect) flagsEnded = true;
    if (arg.dynamic) continue;
    const hit = matchProtectedPath(arg.text);
    if (hit !== null) protectedOperands.push({ path: arg.text, ...hit });
  }

  if (dynamicOption && protectedOperands.length > 0) {
    return {
      kind: 'undecidable',
      why: `«${name}» получает аргумент, собранный оболочкой, там, где ещё возможна опция: он мог бы оказаться терминальным режимом, и тогда ${protectedOperands[0]?.path ?? 'цель'} не удаляется`,
    };
  }
  return { kind: 'delete', protected: protectedOperands };
}

/**
 * Decide whether a shell command must be refused BEFORE it runs.
 *
 * Refuses only when it can name a concrete literal path and the rule that path broke. Everything
 * else is allowed, and every verdict prints the guard's limits (LIMITS) so it is never read as a
 * total guarantee.
 */
export function classifyDestructive(command: string): DestructiveVerdict {
  try {
    return classifyAtDepth(command, 0);
  } catch (err) {
    // TOTALITY IS A SAFETY PROPERTY, not tidiness. The consuming hooks wrap this call in a catch
    // and treat an exception as "no verdict", i.e. they fail OPEN — so a single unhandled input
    // disarms the guard for the command that carries it, which is exactly how
    // `rm -rf $'\Uffffffff'; rm -rf .dz` got through (cross-family review, gpt-5.6-sol, round 9).
    // The known cause is fixed at its source in decodeAnsiC; this is the belt, and it answers
    // `undecidable` — never `allow`, which would dress a crash up as a clean review.
    // Pinned by F39-total: 10 000 fuzzed strings over the metacharacters this lexer gives meaning
    // to, no throw and a well-formed verdict every time.
    return {
      outcome: 'undecidable',
      path: null,
      rule: null,
      reason: `разобрать не удалось: классификатор не смог вынести вердикт (${String((err as Error)?.message ?? err)}); вердикт «проверить не удалось», потребитель обязан ПРОПУСТИТЬ`,
      limits: LIMITS,
    };
  }
}

function classifyAtDepth(
  command: string,
  depth: number,
  expandsBraces = true,
  inheritedOptionMode: PosixOptionMode = 'unknown',
): DestructiveVerdict {
  const verdict = (
    outcome: DestructiveVerdict['outcome'],
    reason: string,
    path: string | null = null,
    rule: string | null = null,
  ): DestructiveVerdict => ({ outcome, path, rule, reason, limits: LIMITS });

  if (typeof command !== 'string') {
    return verdict('undecidable', 'разобрать не удалось: вход не является строкой; вердикт «проверить не удалось», потребитель обязан ПРОПУСТИТЬ');
  }
  if (command.trim() === '') {
    return verdict('allow', 'пустая команда — классифицировать нечего');
  }

  const lexed = lex(command);
  if (lexed.failure !== null && !lexed.prefixRuns) {
    // NEVER `refuse` here, even if a protected path is plainly visible in the raw text. A refusal
    // derived from an inability to read the command is a false guarantee (AC-10).
    return verdict('undecidable', `разобрать не удалось: ${lexed.failure}; вердикт «проверить не удалось», потребитель обязан ПРОПУСТИТЬ`);
  }

  let sawDelete = false;
  let sawTool: string | null = null;
  let sawExternalScript: { name: string; subcommand: string } | null = null;
  /** A deletion verb that was asked to print its help or version, so it removes nothing. */
  let sawTerminal: string | null = null;
  let innerAllow: DestructiveVerdict | null = null;
  /**
   * The first segment that could not be read, REMEMBERED rather than returned.
   *
   * The verdict of a multi-segment command is `refuse` if ANY segment refuses, otherwise
   * `undecidable` if any segment is unreadable, otherwise `allow` (F17-guard). Returning on the
   * first unreadable segment broke the first half of that: the hook exits 0 on `undecidable`
   * (AC-10), so in `sh -c "$CMD"; <verb> -rf .dz` the literal deletion behind the unreadable
   * segment was never examined and ran (cross-family review, gpt-5.6-sol, round 4; F17). A
   * `refuse` may still return at once — it is the top of the order and nothing later can beat it.
   */
  let unreadable: DestructiveVerdict | null = null;
  const cannotRead = (why: string): void => {
    unreadable = unreadable ?? verdict('undecidable', `разобрать не удалось: ${why}; вердикт «проверить не удалось», потребитель обязан ПРОПУСТИТЬ`);
  };

  // The prefix in front of an unterminated heredoc RUNS, so it is classified — but the tail was
  // never read, and "could not check" must not decay into "checked and fine". A refusal found in
  // the prefix still wins, by the same precedence as F17.
  if (lexed.failure !== null) cannotRead(lexed.failure);

  // A function DEFINITION binds a name and executes nothing, so its body is classified only when
  // the same command uses that name again — see liftFunctionBodies for the measurement.
  const plan = liftFunctionBodies(lexed.lexemes);
  const streams: Lexeme[][] = [plan.main];
  if (plan.bodies.length > 0) {
    const mentioned = new Set<string>();
    for (const stream of [plan.main, ...plan.bodies.map((b) => b.lexemes)]) {
      // Function invocation happens after brace expansion. Comparing a bound name to the raw word
      // missed `f{,}`, `{f,f}` and `f{,,}` even though bash turns each into one or more calls to f.
      for (const rawWords of reachableSegments(stream)) {
        const expanded = expandSegment(rawWords, expandsBraces);
        if (expanded.overflowed) {
          cannotRead(`раскрытие имени функции даёт больше ${MAX_BRACE_EXPANSIONS} слов`);
        }
        for (const word of expanded.words) mentioned.add(word.text);
      }
    }
    for (const body of plan.bodies) if (mentioned.has(body.name)) streams.push(body.lexemes);
  }

  for (const rawWords of streams.flatMap((stream) => reachableSegments(stream))) {
    const expanded = expandSegment(rawWords, expandsBraces);
    if (expanded.overflowed) {
      cannotRead(`раскрытие фигурных скобок даёт больше ${MAX_BRACE_EXPANSIONS} слов`);
    }
    const words = expanded.words;
    const invocation = resolveInvocation(words, inheritedOptionMode);
    if (invocation.kind === 'tool') { sawTool = sawTool ?? invocation.name; continue; }
    if (invocation.kind === 'external-script') {
      sawExternalScript = sawExternalScript ?? invocation;
      continue;
    }
    if (invocation.kind === 'opaque') { cannotRead(invocation.why); continue; }

    // Every table row whose execution is `shell` converges here: a shell binary locates its `-c`
    // string, while npm/npx/pnpm already supplied the string from their carrier rule.
    if (invocation.kind === 'shell' || invocation.kind === 'shell-command') {
      const inline = invocation.kind === 'shell'
        ? inlineShellCommand(invocation.args)
        : invocation.command;
      if (inline === null) continue;
      if (inline.dynamic) {
        cannotRead(`«${invocation.name}» получает команду, собранную оболочкой`);
        continue;
      }
      if (depth >= MAX_SHELL_DEPTH) {
        cannotRead(`вложенная оболочка глубже ${MAX_SHELL_DEPTH} уровня`);
        continue;
      }
      const inner = classifyAtDepth(
        inline.text,
        depth + 1,
        !SHELLS_WITHOUT_BRACE_EXPANSION.has(invocation.name),
        invocation.optionMode,
      );
      if (inner.outcome === 'refuse') return inner;
      if (inner.outcome === 'undecidable') { unreadable = unreadable ?? inner; continue; }
      innerAllow = innerAllow ?? inner;
      continue;
    }

    if (invocation.kind !== 'delete') continue;

    const arity = DELETE_OPTIONS.get(invocation.name) ?? NO_VALUE_OPTIONS;

    const analyses = invocation.optionMode === 'unknown'
      ? [
          analyzeDeleteInvocation(invocation.name, invocation.args, arity, false),
          analyzeDeleteInvocation(invocation.name, invocation.args, arity, true),
        ]
      : [analyzeDeleteInvocation(
          invocation.name,
          invocation.args,
          arity,
          invocation.optionMode === 'enabled',
        )];

    if (analyses.some((analysis) => analysis.kind === 'undecidable')) {
      const uncertain = analyses.find((analysis): analysis is Extract<DeleteAnalysis, { kind: 'undecidable' }> =>
        analysis.kind === 'undecidable');
      cannotRead(uncertain?.why ?? `«${invocation.name}» получает неоднозначные аргументы`);
      continue;
    }

    const terminals = analyses.filter(
      (analysis): analysis is Extract<DeleteAnalysis, { kind: 'terminal' }> => analysis.kind === 'terminal',
    );
    if (terminals.length === analyses.length) {
      sawTerminal = sawTerminal ?? `${invocation.name} ${terminals[0]?.option ?? '--help'}`;
      continue;
    }
    if (terminals.length > 0) {
      cannotRead(`эффективный режим разбора опций «${invocation.name}» зависит от невидимого стражу POSIXLY_CORRECT: один режим завершает команду, другой обрабатывает операнды`);
      continue;
    }

    const deletes = analyses as Extract<DeleteAnalysis, { kind: 'delete' }>[];
    const certain = deletes[0]?.protected.find((candidate) =>
      deletes.every((analysis) => analysis.protected.some(
        (other) => other.path === candidate.path && other.rule === candidate.rule,
      )),
    );
    if (certain !== undefined) {
      return verdict(
        'refuse',
        `Отказ [${certain.rule}]: ${certain.path} — ${certain.what}`,
        certain.path,
        certain.rule,
      );
    }

    if (deletes.some((analysis) => analysis.protected.length > 0)) {
      cannotRead(`эффективный режим разбора опций «${invocation.name}» зависит от невидимого стражу POSIXLY_CORRECT: режимы расходятся в том, какие слова являются операндами`);
      continue;
    }
    sawDelete = true;
  }

  // No segment refused. An unreadable one now decides, because "could not check" must never be
  // reported as "checked and fine" — the second step of the refuse > undecidable > allow order.
  if (unreadable !== null) return unreadable;

  if (sawTool !== null) {
    const how = VCS_TOOLS.has(sawTool)
      ? `«${sawTool} rm» — операция индекса (index operation), а не файловой системы`
      : `«${sawTool} rm» — подкоманда инструмента, а не удаление файлов`;
    return verdict('allow', `${how}; правила удаления к ней не применяются`);
  }
  if (sawDelete) {
    return verdict('allow', 'удаление, но ни один аргумент не является буквальным путём в защищаемое хранилище');
  }
  if (sawTerminal !== null) {
    return verdict('allow', `«${sawTerminal}» печатает текст и завершается — операнды не удаляются`);
  }
  // The reason of the unpacked command, so the verdict says what was actually read, not that an
  // `sh -c` wrapper "is not a deletion".
  if (innerAllow !== null) return innerAllow;
  if (sawExternalScript !== null) {
    return verdict(
      'allow',
      `«${sawExternalScript.name} ${sawExternalScript.subcommand}» запускает именованный сценарий, чьё тело находится вне строки команды; чистый классификатор его не читает`,
    );
  }
  return verdict('allow', 'не команда удаления файлов');
}
