/**
 * Writer-quiescence probe for Step 8 — feature qe-writer-quiescence (backlog 700b46a4).
 *
 * MEASURED (crossrt-1, 2026-08-18): Step-8 graded a MOVING tree — a background worker wrote at
 * 19:25, 19:32 and 19:46, AFTER the verdict, its last write clobbering a file the same round had
 * just written. The reviewer hand-waited six consecutive 30-second zero-write windows and
 * re-measured everything. This module is that wait, as a machine: the same idea the publish gate
 * already enforces («не публикуй, пока рой жив»), applied to grading.
 *
 * A BELT, not the root: mutual exclusion of writers (worktree isolation) is item 9520e506. The
 * probe therefore NEVER blocks a run — a moving tree downgrades the verdict's standing loudly
 * instead of stopping the pipeline.
 *
 * PURE: the shell script is GENERATED here and executed by a workflow agent (the workflow sandbox
 * has no child_process — the agent is the shell, same as the landing barrier); the answer is
 * PARSED here, parse-never-synthesize: an empty or malformed probe is 'inconclusive', never
 * 'quiet'.
 */

export interface WriterQuiescenceDecision {
  readonly verdict: 'quiet' | 'moving' | 'inconclusive';
  /** Per-window changed counts actually parsed, in order. */
  readonly windows: readonly number[];
  readonly note: string;
}

export const WQ_WINDOW_SECONDS = 20;
export const WQ_MAX_WINDOWS = 9;
export const WQ_REQUIRED_QUIET = 3;

/**
 * The probe script a workflow agent runs verbatim. Polls the declared targets PLUS the feature
 * dir (FR-4: the feature's own artifacts are exactly the surface crossrt-1 saw clobbered) in
 * fixed windows; prints one `WQ-WINDOW <n> changed=<count>` line per window and exits early after
 * `requiredQuiet` consecutive zeros. `find -newermt '-<w+5> seconds'` widens the lookback slightly
 * past the sleep so a write on the window boundary cannot fall between two polls.
 */
export function quiescenceProbeScript(
  paths: readonly string[],
  opts?: { windowSeconds?: number; maxWindows?: number; requiredQuiet?: number },
): string {
  const w = opts?.windowSeconds ?? WQ_WINDOW_SECONDS;
  const max = opts?.maxWindows ?? WQ_MAX_WINDOWS;
  const need = opts?.requiredQuiet ?? WQ_REQUIRED_QUIET;
  const targets = paths
    .map((p) => String(p).trim())
    .filter((p) => p !== '' && !p.startsWith('-') && !p.includes("'"))
    .map((p) => `'${p.replace(/'/g, '')}'`)
    .join(' ');
  const lookback = w + 5;
  // Cross-family review (round 1, D): find errors — a missing/typo'd target, a permission failure —
  // used to feed ZERO to `wc -l`, so a probe that could not look reported quiet. Errors now print
  // `changed=ERR` and the parser refuses to let an ERR window feed a quiet streak.
  return (
    `quiet=0; n=0; while [ $n -lt ${max} ]; do n=$((n+1)); sleep ${w}; ` +
    `out=$(find ${targets} -type f -newermt '-${lookback} seconds' 2>&1 >/tmp/wq-list.$$); st=$?; ` +
    `if [ $st -ne 0 ] || [ -n "$out" ]; then c=ERR; else c=$(wc -l < /tmp/wq-list.$$); fi; rm -f /tmp/wq-list.$$; ` +
    `echo "WQ-WINDOW $n changed=$c"; ` +
    `if [ "$c" = "0" ]; then quiet=$((quiet+1)); if [ $quiet -ge ${need} ]; then echo "WQ-DONE quiet"; exit 0; fi; else quiet=0; fi; ` +
    `done; echo "WQ-DONE budget"`
  );
}

/** Parse the probe transcript into a verdict. Empty/malformed ⇒ inconclusive, never quiet. */
export function decideWriterQuiescence(probeText: unknown, requiredQuiet = WQ_REQUIRED_QUIET): WriterQuiescenceDecision {
  const text = probeText === null || probeText === undefined ? '' : String(probeText);
  // -1 encodes an ERR window (find could not look): it can never join a quiet streak, and its
  // presence degrades a no-streak outcome to 'inconclusive' — an instrument that failed to observe
  // must not testify to movement either.
  const windows: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /WQ-WINDOW\s+\d+\s+changed=(\d+|ERR)/.exec(line);
    if (m) windows.push(m[1] === 'ERR' ? -1 : Number(m[1]));
  }
  if (windows.length === 0) {
    return { verdict: 'inconclusive', windows, note: 'quiescence probe returned no windows — grading standing NOT established (probe failure is never quiet)' };
  }
  let streak = 0;
  for (const c of windows) {
    streak = c === 0 ? streak + 1 : 0;
    if (streak >= requiredQuiet) {
      // The claim is exactly what was measured (cross-family review): mtime evidence of no recent
      // writes — never a writer-lifecycle guarantee. The root guarantee is worktree isolation.
      return { verdict: 'quiet', windows, note: `no observed writes in ${requiredQuiet} consecutive windows (mtime evidence only — not a writer-lifecycle guarantee)` };
    }
  }
  if (windows.some((c) => c < 0)) {
    return { verdict: 'inconclusive', windows, note: 'quiescence probe could not observe every window (find errored) — grading standing NOT established' };
  }
  return {
    verdict: 'moving',
    windows,
    note: `tree is MOVING: no ${requiredQuiet} consecutive quiet windows within budget (per-window changed counts: ${windows.join(',')}) — the verdict below was graded on a moving tree and must say so`,
  };
}
