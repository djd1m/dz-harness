/**
 * An unrecognised `--flag` must not pass in silence.
 *
 * MEASURED 2026-08-24: `dz recall "x" --breif --limit 2` printed the full ordinary output and exited
 * 0. Someone who typed `--breif` for `--brief` reads that as "the mode worked" — and every `dz`
 * command behaves the same way, because the argv parser accepts any `--name` it is handed.
 *
 * WHY THIS WARNS RATHER THAN REFUSES, and the measurement behind it. Two ways to build a per-command
 * allowlist were tried and BOTH are unsafe:
 *
 *  - from the help text: 53 of the 220 flag names the CLI actually reads appear nowhere in help, so
 *    refusing on a help-derived list would break 53 working invocations;
 *  - from static extraction over the dispatch table: it lost `--week` from `dz recap` (those flags
 *    are read through a loop over a constant, not a literal `flags.has('week')`) and picked up a
 *    neighbouring command's flags for `dz usage`. It both under- and over-covers.
 *
 * A refusal built on either would reject working commands, and breaking a correct invocation is a
 * worse failure than the one being fixed. So the KNOWN set here is the union of every name the CLI
 * reads and every name its help documents, and an unrecognised name is reported loudly while the
 * command still does its work. That removes the SILENCE, which is the actual harm.
 *
 * HONEST LIMIT, and it is real: this catches a name no command anywhere knows. It does NOT catch a
 * name that is valid for a different command — `dz recap --manifest` stays quiet. Closing that needs
 * a hand-curated per-command list, which is filed with these measurements rather than guessed at.
 */

/**
 * Damerau-Levenshtein distance — Levenshtein plus ADJACENT TRANSPOSITION at cost 1.
 *
 * The transposition case is not a refinement, it is the common case: `--limti` for `--limit` is one
 * swapped pair, which plain Levenshtein scores 2 and a length-scaled bound then rejected, so the
 * most frequent kind of typo got no suggestion at all (measured on this very set 2026-08-24).
 * Suggestion only — never a decision.
 */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array<number>(n).fill(0)]);
  for (let j = 0; j <= n; j++) (d[0] as number[])[j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        ((d[i] as number[])[j - 1] as number) + 1,
        ((d[i - 1] as number[])[j] as number) + 1,
        ((d[i - 1] as number[])[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, ((d[i - 2] as number[])[j - 2] as number) + 1);
      }
      (d[i] as number[])[j] = best;
    }
  }
  return (d[m] as number[])[n] as number;
}

/**
 * Every known name as close to `name` as the closest one is.
 *
 * TIES ARE NOT BROKEN. `--wek` sits one edit from both `--week` and `--weak`, and picking whichever
 * came first in the list points the reader confidently at a coin flip. All of them are named, and
 * the reader decides.
 *
 * The bound scales with length so a three-letter name cannot match everything: at most a third of
 * the name may differ, and never more than two characters.
 */
export function nearestKnownFlag(name: string, known: readonly string[]): string[] {
  const limit = Math.min(2, Math.max(1, Math.floor(name.length / 3)));
  let bestScore = limit + 1;
  let best: string[] = [];
  for (const candidate of known) {
    const dist = editDistance(name, candidate);
    if (dist < bestScore) {
      bestScore = dist;
      best = [candidate];
    } else if (dist === bestScore) {
      best.push(candidate);
    }
  }
  return bestScore <= limit ? [...new Set(best)].sort() : [];
}

export interface UnknownFlagNotice {
  readonly name: string;
  /** Every equally-close known name. Empty when nothing is close enough to be worth naming. */
  readonly suggestions: readonly string[];
  readonly line: string;
}

/**
 * One notice per unrecognised name, or an empty list when everything is known.
 *
 * `passed` is every `--name` the user typed, whether it took a value or not: a typo'd OPTION
 * (`--limti 5`) is exactly as silent as a typo'd flag, and was equally unreported.
 */
export function unknownFlagNotice(passed: readonly string[], known: readonly string[]): UnknownFlagNotice[] {
  const set = new Set(known);
  const out: UnknownFlagNotice[] = [];
  for (const name of passed) {
    if (name === '' || set.has(name)) continue;
    const suggestions = nearestKnownFlag(name, known);
    const hint = suggestions.length === 0
      ? 'no dz command reads it.'
      : `did you mean ${suggestions.map((s) => `--${s}`).join(' or ')}?`;
    out.push({
      name,
      suggestions,
      line: `dz: unknown option --${name} — ${hint} It was IGNORED, not applied`,
    });
  }
  return out;
}
