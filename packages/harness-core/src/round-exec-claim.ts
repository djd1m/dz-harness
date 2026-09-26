/**
 * round-exec-claim-takeover (FR-1): the pure verdict behind `dz round exec`'s claim transaction.
 *
 * A round claimed by an `exec` whose process died (SIGTERM, OOM, reboot) used to refuse every later
 * `exec` forever (backlog 280e914607397474). This decides — from facts the caller measured under the
 * state lock — whether the standing claim is held, provably stale-dead, or unknowable:
 *
 * - `pidAlive === true`  ⇒ `held`, regardless of age (a live owner is never taken over);
 * - `pidAlive === null`  ⇒ `unknown` (the probe was inconclusive — refusal is the safe side);
 * - `pid` not a positive safe integer ⇒ `unknown` («no pid recorded») — nothing to probe;
 * - `execClaimedAt` unparsable ⇒ `unknown` («claim time unreadable») — no age to debounce on;
 * - `pidAlive === false` and age ≥ `staleMinutes` ⇒ `stale-dead` with the floored age;
 * - `pidAlive === false` but younger ⇒ `held` — a just-died claim may be a restart in flight, and
 *   the threshold is the debounce.
 *
 * Pure: no clock, no process table — `now` and `pidAlive` are inputs so the caller keeps the
 * critical section short (`process.kill(pid, 0)`, NFR-1) and tests need no real processes.
 */
export type ExecClaimVerdict =
  | { kind: 'held' }
  | { kind: 'stale-dead'; ageMinutes: number }
  | { kind: 'unknown'; reason: string };

export type ExecClaimTakeoverInput = {
  readonly execClaimedAt?: string | undefined;
  readonly pid?: number | undefined;
  readonly pidAlive: boolean | null;
  readonly now: number;
  readonly staleMinutes: number;
};

export function decideExecClaimTakeover(input: ExecClaimTakeoverInput): ExecClaimVerdict {
  if (input.pidAlive === true) return { kind: 'held' };
  if (input.pid === undefined || !Number.isSafeInteger(input.pid) || input.pid <= 0) {
    return { kind: 'unknown', reason: 'no pid recorded' };
  }
  if (input.pidAlive === null) return { kind: 'unknown', reason: 'PID probe inconclusive' };
  const claimedMs = input.execClaimedAt === undefined ? Number.NaN : Date.parse(input.execClaimedAt);
  if (!Number.isFinite(claimedMs)) return { kind: 'unknown', reason: 'claim time unreadable' };
  const ageMinutes = Math.floor((input.now - claimedMs) / 60_000);
  if (ageMinutes >= input.staleMinutes) return { kind: 'stale-dead', ageMinutes };
  return { kind: 'held' };
}
