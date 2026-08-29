// SPDX-License-Identifier: MIT
//
// feature-adr Step-8 claim-gate — the pure decision core for Deliverable B (feature:
// claim-check-authoring-time). QE reports are where untagged quantitative claims are BORN ("1094
// tests pass" with no tag and no reproducer). Step 8 of the feature-adr workflow runs
// `dz claim-check <FDIR>/08_qe_report.md --json --fail-on none` (in the QE agent's Bash tool, NOT
// here — this module does NO I/O) and reports the counts. This function folds those counts into an
// ADDITIVE result field plus a one-line human summary.
//
// Advisory only: it never changes the QE grade and never blocks the pipeline (mirroring the publish
// gate's warn default and the reward-learning "memory/QE side-channels never block" rule).
//
// Per the pure-core convention (`feature-adr-routing.ts`), this named function's BODY is inlined
// byte-equivalently into `.claude/workflows/feature-adr.js` (and its byte-identical
// skills-feature-adr template mirror); `feature-adr-model-routing.test.ts` asserts the inline copy
// matches this module body (drift guard). The body is written parser-safe (string `+` concat,
// explicit `if`/return, object literals — NO template literals) so the same source inlines verbatim.

/** The finding counts the Step-8 QE agent reported from `dz claim-check`. */
export interface Step8ClaimCounts {
  readonly findings: number;
  readonly high: number;
  readonly medium: number;
}

/** The additive Step-8 result field: the counts (or `null` when not run) plus a human summary line. */
export interface Step8ClaimGate {
  /** `null` ⇒ the QE agent did not / could not run claim-check — an HONEST gap, never a false zero. */
  readonly claimCheck: Step8ClaimCounts | null;
  /** One-line human summary folded into logs. */
  readonly note: string;
}

/**
 * Turn the claim-check counts the QE agent reported into the additive result field + a note.
 * `null`/absent counts yield an honest "not run" note — never a fabricated "0 findings" that would
 * read like a clean pass. Pure, never-throws. This body is inlined verbatim into the workflow.
 */
export function step8ClaimGate(counts: Step8ClaimCounts | null): Step8ClaimGate {
  if (!counts) return { claimCheck: null, note: 'claim-check: not run (no counts reported)' }
  return { claimCheck: counts, note: counts.findings + ' finding(s) (' + counts.high + ' high) in 08_qe_report.md' }
}
