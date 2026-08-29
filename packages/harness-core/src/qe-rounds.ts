/**
 * qe-rounds — how many Step-8 review rounds has one feature already had?
 *
 * The stopping rule existed ONLY as a sentence in a prose module:
 *
 *     .claude/skills/feature-adr/modules/08-qe.md:246
 *     "Max iterations: 3. After 3 iterations, flag remaining gaps for user decision."
 *
 * MEASURED 2026-08-27: no counter existed anywhere — `grep -rl 'ReviewScope|scopeId|findingId|
 * lineage'` over harness-core/src and harness-cli/src returned nothing. So the rule sat at layer 4 of
 * the cost-of-detection ladder, and every restart of the agent forgot the sentence. One real slug
 * accumulated **38** graded rounds and 4 failed attempts against a documented ceiling of 3.
 *
 * This module READS what `dz qe-bridge` already writes. It records nothing of its own — deliberately:
 * a counter that starts recording today could not answer for the 38 rounds already on disk, which are
 * the only real evidence this feature has.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** One graded review round, as `dz qe-bridge` recorded it. */
export interface QeRound {
  runId: string;
  emittedAt: string;
  grade: string;
  /** Findings by severity, lowercased. Absent severities are simply not present. */
  severities: Record<string, number>;
  /** The file this round was read from, so a caller can point at it. */
  file: string;
}

/** An attempt that produced NO verdict. Never merged into the round count, never dropped. */
export interface QeFailedAttempt {
  runId: string;
  emittedAt: string;
  reason: string;
  file: string;
}

export type QeRoundsStatus = 'under-ceiling' | 'at-or-over-ceiling' | 'not-established';

export interface QeRoundsReport {
  status: QeRoundsStatus;
  /** Present only when status is 'not-established'. */
  notEstablishedReason?: string | undefined;
  /** The directory actually read. One directory — never a union. */
  dir: string;
  ceiling: number;
  /** Distinct runIds among graded sign-offs. THIS is the number the ceiling applies to. */
  rounds: number;
  /** Graded rounds in emission order. */
  roundList: QeRound[];
  /** Attempts that produced no verdict. Reported separately, on purpose. */
  failedAttempts: QeFailedAttempt[];
  /** Files that would not parse or carried no runId. Named, never silently skipped. */
  unreadable: { file: string; why: string }[];
  /** Grades in emission order, e.g. ['C','C','B'] — a shape a reader can judge at a glance. */
  grades: string[];
  firstAt?: string | undefined;
  lastAt?: string | undefined;
}

export const QE_ROUNDS_DEFAULT_CEILING = 3;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Severity tallies from a sign-off's findings. Unknown shapes contribute nothing rather than throwing. */
function severitiesOf(findings: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(findings)) return out;
  for (const f of findings) {
    if (!isRecord(f)) continue;
    const s = typeof f.severity === 'string' ? f.severity.toLowerCase() : '';
    if (!s) continue;
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

/**
 * Read ONE feature directory's review rounds.
 *
 * `featureDir` is a directory, never a slug — and that is load-bearing. MEASURED 2026-08-27: the slug
 * `package-story-page-hardening` exists in two separate checkouts holding 38 and 7 records. A function
 * that resolved a slug by searching would have summed them to 45 for a run that had 38, and the
 * output would look identical to a correct one. Resolving a slug to a directory is the caller's job.
 */
export function readQeRounds(featureDir: string, opts?: { ceiling?: number }): QeRoundsReport {
  // A non-finite ceiling is the quietest fail-open there is: `Math.max(1, Math.floor(NaN))` is NaN,
  // and `rounds >= NaN` is FALSE for every count, so the loop never stops. The CLI validates its own
  // input, but this is a public export and a direct caller bypasses that guard. MEASURED: 2 >= NaN
  // is false. Every numeric clamp needs Number.isFinite — a lesson this repo has already paid for.
  const rawCeiling = opts?.ceiling ?? QE_ROUNDS_DEFAULT_CEILING;
  const ceiling = Number.isFinite(rawCeiling)
    ? Math.max(1, Math.floor(rawCeiling as number))
    : QE_ROUNDS_DEFAULT_CEILING;
  const dir = join(featureDir, '.fa-state', 'qe-bridge');

  const base: QeRoundsReport = {
    status: 'not-established', dir, ceiling, rounds: 0,
    roundList: [], failedAttempts: [], unreadable: [], grades: [],
  };

  // "No bridge has ever run here" and "zero rounds so far" are DIFFERENT facts. Reporting the first
  // as the second would tell a caller to keep going on the basis of a measurement never taken.
  let entries: string[];
  try {
    if (!statSync(dir).isDirectory()) {
      return { ...base, notEstablishedReason: `${dir} exists but is not a directory` };
    }
    entries = readdirSync(dir);
  } catch {
    return {
      ...base,
      notEstablishedReason:
        `no ${dir} — this feature has no qe-bridge history, which is not the same as zero rounds`,
    };
  }

  const byRunId = new Map<string, QeRound>();
  const failed: QeFailedAttempt[] = [];
  const unreadable: { file: string; why: string }[] = [];

  for (const name of entries.slice().sort()) {
    const isSignoff = name.startsWith('signoff-') && name.endsWith('.json');
    const isFailed = name.startsWith('failed-') && name.endsWith('.json');
    if (!isSignoff && !isFailed) continue;

    const file = join(dir, name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf-8'));
    } catch (e) {
      // NAMED, not skipped. A silently dropped record makes the count quietly too low — in a counter
      // whose whole job is to stop a loop, that fails OPEN.
      unreadable.push({ file: name, why: `unparseable JSON: ${(e as Error).message}` });
      continue;
    }
    if (!isRecord(parsed)) { unreadable.push({ file: name, why: 'not a JSON object' }); continue; }

    const runId = typeof parsed.runId === 'string' ? parsed.runId : '';
    const emittedAt = typeof parsed.emittedAt === 'string' ? parsed.emittedAt : '';

    // A ROUND needs a runId, because that is what deduplicates it. An ATTEMPT does not: it produced
    // no verdict, so there is nothing to deduplicate against, and dropping it would hide a run
    // burning attempts. FOUND BY DOGFOODING 2026-08-27 — the first live run of this command against
    // this repo's own `wave1-scorer-negation` reported 4 unreadable records, and all four were
    // `failed-*.json` written before `runId` was added to that record shape. Calling them unreadable
    // was wrong twice: it lost real attempts, and it declared the round count a lower bound when the
    // rounds themselves were complete.
    if (isFailed) {
      failed.push({
        runId: runId || `(no runId: ${name})`,
        emittedAt,
        reason: typeof parsed.reason === 'string' ? parsed.reason : 'unstated',
        file: name,
      });
      continue;
    }

    if (!runId) { unreadable.push({ file: name, why: 'no runId — a round cannot be deduplicated without one' }); continue; }

    // A round is a runId. Two records sharing one are ONE round — first wins, and the collision is
    // not an error: a re-emitted sign-off for the same run is still that run.
    if (byRunId.has(runId)) continue;
    byRunId.set(runId, {
      runId, emittedAt,
      grade: typeof parsed.grade === 'string' ? parsed.grade : '',
      severities: severitiesOf(parsed.findings),
      file: name,
    });
  }

  const roundList = [...byRunId.values()].sort((a, b) => a.emittedAt.localeCompare(b.emittedAt));
  failed.sort((a, b) => a.emittedAt.localeCompare(b.emittedAt));

  if (roundList.length === 0 && failed.length === 0) {
    return {
      ...base, unreadable,
      notEstablishedReason: unreadable.length
        ? `${dir} holds ${unreadable.length} record(s), none of them readable`
        : `${dir} holds no signoff or failed records`,
    };
  }

  const stamps = [...roundList.map((r) => r.emittedAt), ...failed.map((f) => f.emittedAt)]
    .filter((t) => t !== '').sort();
  const bounds = { first: stamps[0], last: stamps[stamps.length - 1] };

  const rounds = roundList.length;

  // FAIL CLOSED. Until cross-family review caught it, an unreadable record only downgraded the
  // count to a "lower bound" in the printed text while the STATUS still came out `under-ceiling` —
  // so the command answered "another round is within budget" when the true count might already be
  // at the ceiling. That is the exact fail-open this whole module was written against, sitting in
  // the module itself. If ANY candidate record could not be counted, the honest verdict is that the
  // number is not established — not a smaller number presented as if it were the answer.
  if (unreadable.length > 0 && rounds < ceiling) {
    return {
      status: 'not-established',
      notEstablishedReason:
        `${rounds} readable round(s) plus ${unreadable.length} record(s) that could not be counted — `
        + `the true count may already be at the ceiling of ${ceiling}, so this cannot say another `
        + `round is within budget`,
      dir, ceiling, rounds, roundList, failedAttempts: failed, unreadable,
      grades: roundList.map((r) => r.grade),
      firstAt: bounds.first, lastAt: bounds.last,
    };
  }

  return {
    status: rounds >= ceiling ? 'at-or-over-ceiling' : 'under-ceiling',
    dir, ceiling, rounds, roundList, failedAttempts: failed, unreadable,
    grades: roundList.map((r) => r.grade),
    firstAt: bounds.first,
    lastAt: bounds.last,
  };
}

/** The number alone, for a caller that only needs to compare it. `-1` means NOT ESTABLISHED. */
export function countQeRounds(featureDir: string, opts?: { ceiling?: number }): number {
  const r = readQeRounds(featureDir, opts);
  return r.status === 'not-established' ? -1 : r.rounds;
}
