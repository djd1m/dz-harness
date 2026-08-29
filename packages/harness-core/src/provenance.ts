/**
 * The provenance gate — nothing leaves this machine citing a source that may not.
 *
 * It checks PROVENANCE, not words. A denylist of forbidden phrases is an enumeration, and it loses
 * to the first confidential note it has never heard of; the `.gitignore` in this repository carries
 * a comment warning about exactly that mistake. An allowlist of SOURCES wins by construction: an
 * unknown source is refused because it is unknown.
 *
 * Two things this module deliberately does NOT do, both named in ADR-001 rather than implied:
 *  - it does not read CONTENT, so confidential text pasted by hand into an allowed file inherits
 *    that file's permission;
 *  - it cannot see a paraphrase with no citation. It proves what was CITED, never what was known.
 * The last line against both is a person reading the draft, and that is the design, not a gap.
 *
 * PURE: no filesystem, no git, no clock. The oracle runs in the CLI and arrives as a fact — a
 * verdict that needs a real repository to reproduce is a verdict no test can pin.
 *
 * See features/provenance-gate/03_adr/ for the decisions and the measurements behind them.
 */

/** Why one claim was refused. A CLOSED set, so a reason is machine-readable and never prose. */
export type SourceVerdict =
  | 'allowed'
  /** The claim names no source at all. A claim with no source is the thing we must not publish. */
  | 'no-source'
  /** The manifest did not declare what kind of source this is — never inferred from its shape. */
  | 'unknown-kind'
  /** A PUBLIC external web URL (http/https). It is already public by construction, so it cannot
   *  "leave this machine" — nothing local to protect. Refused only if the URL is malformed. */
  | 'public-url'
  /** A `url` claim whose value is not a well-formed http(s) URL — a scheme this gate will not clear
   *  (a file://, a bare word, or a non-URL) must not pass as a public web source. */
  | 'malformed-url'
  /** A store record that the TRACKED public list does not name. Default-deny. */
  | 'not-marked-public'
  /** The path does not resolve. You cannot cite what does not exist. */
  | 'unresolvable'
  /** Resolved outside the repository — a symlink out of the tree lands here too. */
  | 'outside-repo'
  /** Git says this path is ignored: the owner's own boundary refuses it. */
  | 'ignored-path'
  /** Not tracked by git — nobody has reviewed it, so "not ignored" proves nothing about it. */
  | 'untracked'
  /** Tracked, but carrying uncommitted changes: its CURRENT contents went through no review. */
  | 'uncommitted';

export type SourceProvenanceOutcome = 'allowed' | 'blocked' | 'not-established';

/** One claim in a draft, and where it came from. */
export interface SourceClaim {
  readonly id: string;
  /** `path` — a file in the repository. `record` — an addressed row in a `.dz` store. */
  readonly kind?: string;
  readonly source?: string;
}

export interface SourceManifest {
  readonly version: number;
  readonly draft: string;
  readonly claims: readonly SourceClaim[];
}

export interface SourceProvenanceFacts {
  /**
   * Paths git reported as ignored. `null` means THE ORACLE DID NOT RUN — a different fact from
   * "nothing is ignored", and the one a naive gate reads as "everything is allowed". Measured in
   * this repo on a sibling command: `dz sync` prints `0/0` and exits 0 when it compared nothing.
   */
  readonly ignoredPaths: ReadonlySet<string> | null;
  /**
   * Record addresses declared public in a GIT-TRACKED file. Not a `visibility` field inside the
   * record: `.dz/` is gitignored, so a marker there appears in no diff, and the process that writes
   * the draft can write it too. MEASURED 2026-08-22: `grep -r '"visibility"' .dz/` returns 0 — the
   * field does not exist, and introducing it would have made "the owner opted in" mean "the
   * generator marked itself" (ADR-001).
   */
  readonly publicRecords: ReadonlySet<string>;
  /** Each `path` source resolved through the filesystem; `null` = missing or outside the repo. */
  readonly resolved: ReadonlyMap<string, string | null>;
  /**
   * Resolved paths git tracks. "Not ignored" is NOT "reviewed": a file the drafting process wrote a
   * second ago is neither, and the first version cleared it while calling it "a tracked path"
   * (cross-family review round 3, codex `gpt-5.6-sol`, 2026-08-22).
   */
  readonly trackedPaths: ReadonlySet<string>;
  /** Tracked paths with uncommitted changes — committed is what "reviewed" means here. */
  readonly dirtyPaths: ReadonlySet<string>;
}

export interface SourceClaimResolution {
  readonly id: string;
  readonly source: string | null;
  readonly verdict: SourceVerdict;
  readonly detail: string;
}

export interface SourceProvenanceDecision {
  readonly outcome: SourceProvenanceOutcome;
  /** 0 allowed · 1 blocked · 3 not established. A zero is only ever a proven pass. */
  readonly exit: 0 | 1 | 3;
  readonly claims: readonly SourceClaimResolution[];
  readonly reason: string;
}

/** Parse a manifest. Unparseable is `null` — which the caller must NOT read as "empty". */
export function parseSourceManifest(text: string): SourceManifest | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o['claims'])) return null;
  const claims: SourceClaim[] = [];
  for (const c of o['claims'] as unknown[]) {
    if (c === null || typeof c !== 'object') return null;
    const cc = c as Record<string, unknown>;
    claims.push({
      id: typeof cc['id'] === 'string' ? cc['id'] : '',
      ...(typeof cc['kind'] === 'string' ? { kind: cc['kind'] } : {}),
      ...(typeof cc['source'] === 'string' ? { source: cc['source'] } : {}),
    });
  }
  return {
    version: typeof o['version'] === 'number' ? o['version'] : 1,
    draft: typeof o['draft'] === 'string' ? o['draft'] : '',
    claims,
  };
}

/**
 * Classify ONE claim's source.
 *
 * Order matters and is load-bearing. The KIND is read from the manifest and never guessed from the
 * string: `.dz/` holds 119 git-TRACKED files (measured), so `.dz/guard-audit.jsonl` is not ignored
 * and a shape-based guess would let it through as an ordinary repo path, skipping the public-list
 * requirement entirely.
 */
export function classifySource(claim: SourceClaim, facts: SourceProvenanceFacts): SourceClaimResolution {
  const id = claim.id === '' ? '(unnamed claim)' : claim.id;
  const source = typeof claim.source === 'string' && claim.source.trim() !== '' ? claim.source.trim() : null;
  const at = (verdict: SourceVerdict, detail: string): SourceClaimResolution => ({ id, source, verdict, detail });

  if (source === null) return at('no-source', 'the claim names no source — a claim with no source is exactly what must not go out');

  if (claim.kind === 'record') {
    return facts.publicRecords.has(source)
      ? at('allowed', 'named in the tracked public-records list')
      : at('not-marked-public', 'this record is not in the tracked public list — marking one public must be a reviewable commit, not a field inside an ignored store');
  }

  if (claim.kind === 'path') {
    const real = facts.resolved.get(source);
    if (real === undefined || real === null) {
      return at('unresolvable', 'the path does not resolve inside the repository — a source that cannot be resolved cannot be shown to be safe');
    }
    if (facts.ignoredPaths === null) {
      // Defensive: `decideSourceProvenance` refuses before reaching here. Kept so a direct caller of
      // classifySource cannot obtain an `allowed` from an oracle that never ran.
      return at('unresolvable', 'the ignore oracle did not run, so no path can be cleared');
    }
    if (facts.ignoredPaths.has(real)) return at('ignored-path', 'git says this path is ignored — the owner\'s own boundary refuses it');
    // Three separate questions, and the first version asked only one. A brand-new file the drafting
    // process wrote is not ignored either, and clearing it would let the generator author its own
    // evidence.
    if (!facts.trackedPaths.has(real)) return at('untracked', 'git does not track this path, so nobody has reviewed it — not being ignored says nothing about a file that has never been committed');
    if (facts.dirtyPaths.has(real)) return at('uncommitted', 'this path has uncommitted changes, so its current contents went through no review');
    return at('allowed', 'committed, reviewed, and not refused by the owner\'s boundary');
  }

  if (claim.kind === 'url') {
    // The channel translates OTHERS' public tweets/posts; their sources are PUBLIC web URLs. Such a
    // URL is already public — it cannot leak off this machine, so there is no local secret to
    // protect (the whole point of the path/record checks). It is cleared iff it is a well-formed
    // http(s) URL; anything else (file://, a bare path, a non-URL) is refused, never inferred.
    let ok = false;
    try { const u = new URL(source); ok = u.protocol === 'http:' || u.protocol === 'https:'; } catch { ok = false; }
    return ok
      ? at('public-url', 'a public http(s) web source — already public, nothing local to protect')
      : at('malformed-url', 'kind "url" but the value is not a well-formed http(s) URL — a public web source must be a real http(s) URL');
  }

  return at('unknown-kind', `the manifest declares kind ${JSON.stringify(claim.kind ?? null)} — a kind this gate cannot check is refused, never inferred from the path's shape`);
}

/**
 * The whole-manifest verdict.
 *
 * Three outcomes, and neither non-pass returns zero. The dangerous one is the third: an empty
 * manifest does not mean "nothing confidential is cited", it means "we checked nothing".
 */
export function decideSourceProvenance(manifest: SourceManifest | null, facts: SourceProvenanceFacts): SourceProvenanceDecision {
  if (manifest === null) {
    return { outcome: 'not-established', exit: 3, claims: [], reason: 'the manifest could not be read — nothing was checked, which is not the same as nothing being wrong' };
  }
  if (facts.ignoredPaths === null) {
    // BEFORE classification, and for the WHOLE batch. Measured 2026-08-22: one out-of-repo path in
    // a `git check-ignore --stdin` batch prints the matches found so far, then dies with exit 128 —
    // so crediting what was printed would clear every path queued behind it (ADR-003).
    return { outcome: 'not-established', exit: 3, claims: [], reason: 'the ignore oracle did not run, so not one path was checked — this is not a pass' };
  }
  if (manifest.claims.length === 0) {
    return { outcome: 'not-established', exit: 3, claims: [], reason: 'the manifest lists no claims — a draft with nothing to check has not been shown to be safe, only left unchecked' };
  }
  const claims = manifest.claims.map((c) => classifySource(c, facts));
  // A claim passes iff its verdict is a CLEARED one: a repo-internal source proven safe (allowed),
  // or a public web URL that is already public by construction (public-url — the tg-post channel
  // case). Every other verdict is a refusal.
  const CLEARED = new Set(['allowed', 'public-url']);
  const blocked = claims.filter((c) => !CLEARED.has(c.verdict));
  if (blocked.length > 0) {
    return {
      outcome: 'blocked',
      exit: 1,
      claims,
      reason: `${blocked.length} of ${claims.length} claim(s) cite a source that may not leave this machine`,
    };
  }
  return { outcome: 'allowed', exit: 0, claims, reason: `all ${claims.length} claim(s) cite a source cleared to go out` };
}

/** What the operator sees. Every blocked claim names its id, its source and its reason. */
export function renderSourceProvenance(decision: SourceProvenanceDecision): string[] {
  const out: string[] = [];
  const label = decision.outcome === 'allowed' ? 'ALLOWED' : decision.outcome === 'blocked' ? 'BLOCKED' : 'NOT ESTABLISHED';
  for (const c of decision.claims) {
    if (c.verdict === 'allowed') continue;
    out.push(`  [${c.verdict}] ${c.id} — ${c.source ?? '(no source)'}: ${c.detail}`);
  }
  out.push(`dz provenance-check: ${label} — ${decision.reason}`);
  if (decision.outcome === 'allowed') {
    // Said on the PASSING path too, because that is the path where it gets forgotten: a green tick
    // here proves where the citations came from, not that the prose is safe.
    out.push('  note: this proves what was CITED. It cannot see a paraphrase with no citation, nor confidential text pasted by hand into an allowed file. Read the draft.');
  }
  return out;
}
