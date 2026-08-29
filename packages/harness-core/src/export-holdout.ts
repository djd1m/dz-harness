/**
 * Domain hold-out for the portable export — DEFENCE IN DEPTH, not the guarantee.
 *
 * WHY THIS EXISTS — AND WHY IT IS THE SECOND LINE, NOT THE FIRST.
 * (This heading once read "the thing that actually protects anything", contradicting the
 * first line of the same comment. ADR-004 moved the guarantee to a separate store; this
 * file did not move with it.)
 *
 * `health-advisor` teaches lessons learned from a real person's investigations. The
 * first design tried to keep patient data out of the store by INSPECTING THE TEXT —
 * deciding, from prose, whether a lesson described a method or a person. Seven rounds
 * of independent cross-model review graded that F and the finding count never
 * converged, because the question is about meaning: every pattern answering it fails
 * in both directions, and none of them can see the case that matters most (a rare
 * combination identifies a person with no name and no digits in the sentence).
 *
 * So the guarantee moved to where a guarantee can live. The realistic way a learned
 * store leaks is not "somebody read the disk" — it is that the store gets SHARED:
 * exported to JSON, committed, carried to another machine. `dz recall --all --json` is
 * that path by design; it is documented as the portable sharing form.
 *
 * Holding a domain out of that export is decided by a tag the writer set rather than by
 * parsing prose, so it is language-independent and provable by a test. But it is NOT the
 * isolation guarantee, and an earlier version of this comment claiming otherwise was
 * wrong: filtering each command that emits lesson text is itself an enumeration, and
 * review produced five more such commands (`guard promote --json`, `epoch-replay
 * --emit`, `vector harmonize`, `consolidate --prune-quarantine`, the `recall --forget`
 * preview) the moment four were closed. The guarantee is ADR-004 — health lessons are
 * written to a SEPARATE store and never reach this one. What remains here is a second
 * line for stray or legacy records, which is worth having and is not the promise.
 *
 * THE PROMISE, NARROWLY. This governs the EXPORT. It does not encrypt the local store,
 * it does not stop a human from copying a file, and it does not make the lesson text
 * safe to publish. It means: the one command whose job is to hand the store to someone
 * else will not hand over this domain unless you say so out loud.
 */

import type { PatternRecord } from './patterns.js';

/**
 * Canonical key for hold-out comparison — deliberately NOT `normalizeDomain`.
 *
 * `normalizeDomain` serves the RANKING boost, where being slightly wrong costs
 * ordering. Here being slightly wrong costs a leak, so the two must not share a
 * definition: review found `Health - Research` normalising to `health---research` and a
 * FULLWIDTH hyphen (U+FF0D) surviving as its own character — both then exported by the
 * `else` branch. A hold-out that a spelling variant defeats is not a hold-out.
 *
 * So: NFKC-fold first, then lower case, then collapse EVERY run of non-alphanumeric
 * characters to a single `-`. That is an allowlist over the key (letters and digits
 * survive, nothing else does) rather than a list of separators to keep up to date.
 *
 * NFKC is not decoration. Without it `Ｈｅａｌｔｈ－Ｒｅｓｅａｒｃｈ` in fullwidth forms
 * produced `ｈｅａｌｔｈ-ｒｅｓｅａｒｃｈ` — a different key, so the record exported. Compatibility
 * normalisation folds fullwidth, ligature and other presentation variants onto the
 * characters they stand for, which is exactly the equivalence a tag comparison needs.
 */
export function canonicalDomainKey(domain: string | null | undefined): string {
  return String(domain ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Domains held out of the portable export by default.
 *
 * `health-research` is written by the `goap-research-ed25519` skill when it runs inside
 * `health-advisor`. It is listed here rather than configured because a default that has
 * to be switched ON protects nobody: the person who would have configured it is the
 * person who already understood the risk.
 */
export const DEFAULT_HELD_OUT_DOMAINS: readonly string[] = ['health-research'];

export interface HoldoutResult<T> {
  /** What the export may hand over. */
  readonly exported: readonly T[];
  /** What was withheld — returned, not silently dropped, so the caller can COUNT it. */
  readonly withheld: readonly T[];
  /** Which held-out domains actually matched, for an honest message. */
  readonly domains: readonly string[];
}

/**
 * Split records into what may be exported and what is held back.
 *
 * Comparison goes through `canonicalDomainKey`, so `Health-Research`, `health_research`,
 * `Health - Research` and a fullwidth-hyphen spelling are one domain — a tag that leaks
 * through a spelling variant would be the same class of defect as the text guard this
 * replaced.
 *
 * AN UNTAGGED RECORD IS EXPORTED, and that is a real limit of tag-based isolation rather
 * than an oversight: with no domain there is nothing to compare, and withholding every
 * untagged lesson would empty the export for the ordinary case. What closes it upstream
 * is that the writer always tags — `learning_bridge.py` passes `--domain` on every call.
 */
export function applyExportHoldout<T extends { readonly domain?: string | null }>(
  records: readonly T[],
  heldOut: readonly string[] = DEFAULT_HELD_OUT_DOMAINS,
): HoldoutResult<T> {
  const targets = new Set(heldOut.map(canonicalDomainKey).filter((d) => d !== ''));
  if (targets.size === 0) return { exported: records, withheld: [], domains: [] };
  const exported: T[] = [];
  const withheld: T[] = [];
  const matched = new Set<string>();
  for (const record of records) {
    const domain = canonicalDomainKey(record.domain);
    if (domain !== '' && targets.has(domain)) {
      withheld.push(record);
      matched.add(domain);
    } else {
      exported.push(record);
    }
  }
  return { exported, withheld, domains: [...matched].sort() };
}

/**
 * The line the export prints when it held something back.
 *
 * Empty when nothing was withheld, so the common case stays quiet. When something WAS
 * withheld the count is stated: a silent hold-out would leave the reader believing they
 * had exported the whole store, which is its own kind of lie — and it would make a
 * broken hold-out indistinguishable from an empty domain.
 */
export function renderHoldoutNote(result: HoldoutResult<unknown>): string {
  if (result.withheld.length === 0) return '';
  const n = result.withheld.length;
  const domains = result.domains.join(', ');
  return `  ${n} lesson(s) in ${domains} were HELD BACK from this export — that domain carries medical research and does not travel by default. To include it deliberately: --include-domain ${domains}`;
}

/** Parse a comma-separated `--include-domain` value into the hold-out list that remains. */
export function heldOutAfterOptIn(
  optIn: string | undefined,
  heldOut: readonly string[] = DEFAULT_HELD_OUT_DOMAINS,
): readonly string[] {
  if (optIn === undefined) return heldOut;
  const requested = new Set(
    optIn.split(',').map((d) => canonicalDomainKey(d)).filter((d) => d !== ''),
  );
  return heldOut.filter((d) => !requested.has(canonicalDomainKey(d)));
}

/** Convenience for callers holding full `PatternRecord`s. */
export type PatternHoldout = HoldoutResult<PatternRecord>;

/**
 * The advice printed when a held-out domain is written into a SHARED store.
 *
 * NOT a refusal. Someone who wants their medical lessons in the shared store owns both
 * directories and the `dz` binary, and stopping them would mean defending a user against
 * themselves — which this design deliberately does not attempt (ADR-004, threat model).
 * What it does instead is make sure the choice is INFORMED: say what follows from it,
 * name the default, and show the one command that does it the other way.
 *
 * The distinction that decides whether to warn is the STORE, not the person: a project
 * whose directory is the health brain is exactly where these lessons belong, so writing
 * one there is silent. Anywhere else, the lesson is about to join lessons that travel.
 *
 * `projectRoot` MUST already be resolved by the caller. Deciding from the unresolved
 * NAME meant `ln -s <a shared project> /tmp/.health-brain` silenced the advice while the
 * write landed in the shared store — the advice went quiet in exactly the case it exists
 * for. A name is a claim about a path; only a resolved path is the path.
 */
export function renderSharedStoreAdvice(domain: string | null | undefined, resolvedProjectRoot: string): string {
  const key = canonicalDomainKey(domain);
  if (key === '' || !DEFAULT_HELD_OUT_DOMAINS.map(canonicalDomainKey).includes(key)) return '';
  if (/[\\/]\.health-brain\/?$/.test(resolvedProjectRoot)) return '';
  return [
    `  ⚠ "${domain}" is a medical domain, and this is a SHARED store.`,
    '    Lessons here are read by every command that reads this store, and the portable',
    '    export (dz recall --all --json) is how a store leaves a machine. We recommend',
    '    against it by default: keep medical lessons in their own store, which also keeps',
    '    the prompts and transcripts of that work in one place you can inspect or delete.',
    `    The other way: dz teach "<lesson>" --domain ${domain} --project <dir>/.health-brain`,
    '    Nothing was blocked — this is your call, and it is now on the record.',
  ].join('\n');
}

export interface VectorExportDecision {
  readonly allow: boolean;
  /** Why it was refused — empty when allowed. */
  readonly reason: string;
  /** What the caller should pass to proceed deliberately. */
  readonly optInHint: string;
}

/**
 * Whether `dz vector export` may write a checkpoint.
 *
 * EXTRACTED SO IT CAN BE TESTED. The decision used to live inline in the CLI behind an
 * earlier `return` (the RVF engine is opt-in and absent on most machines), so the branch
 * that matters could not be exercised at all in a normal checkout — I could reason about
 * it and not run it, which is the position this project treats as unverified.
 *
 * The rule: a `.rvf` checkpoint carries embeddings keyed by id and NO domain, so its
 * contents cannot be classified from the file. This export is also all-or-nothing — the
 * adapter copies the store whole. So when such a file exists the answer is REFUSE unless
 * the caller names what travels; `recall --forget` deletes a lexical record and leaves
 * its embedding behind, which is exactly why the lexical store cannot stand in for this.
 */
export function decideVectorExport(input: {
  readonly rvfExists: boolean;
  readonly heldOutLexicalCount: number;
  readonly heldOutDomains: readonly string[];
  readonly optedIn: string | undefined;
}): VectorExportDecision {
  // "NAMED" means the HELD-OUT domain was named, not that some flag was passed. The
  // first version accepted any non-empty value, so `--include-domain security` unlocked
  // an unclassifiable checkpoint — the message said "name what travels" and the code
  // asked only "did you type something". Worse, the test I wrote alongside it asserted
  // the same weak condition, so it locked the defect in instead of catching it.
  const optedKeys = new Set(
    (input.optedIn ?? '').split(',').map((d) => canonicalDomainKey(d)).filter((d) => d !== ''),
  );
  const named = DEFAULT_HELD_OUT_DOMAINS.some((d) => optedKeys.has(canonicalDomainKey(d)));
  const hint = (input.heldOutDomains.length > 0 ? input.heldOutDomains : DEFAULT_HELD_OUT_DOMAINS).join(',');
  if (input.rvfExists && !named) {
    return {
      allow: false,
      reason: 'a .rvf checkpoint stores embeddings keyed by id with no domain, so this gate cannot tell whether it holds held-out lessons — and it is exported whole',
      optInHint: hint,
    };
  }
  if (input.heldOutLexicalCount > 0 && !named) {
    return {
      allow: false,
      reason: `the store holds ${input.heldOutLexicalCount} lesson(s) in ${input.heldOutDomains.join(', ')}, and this export is all-or-nothing`,
      optInHint: hint,
    };
  }
  return { allow: true, reason: '', optInHint: hint };
}
