/**
 * The L2 probe receipt (plan T7.9 / T8.3, amendment P2-f).
 *
 * The authoritative registration check is a LIVE probe: it needs an authenticated `claude` binary
 * and cannot run headless in CI, so it is a local pre-publish ritual. That leaves an obvious hole —
 * "I ran the probe, honest" is not evidence — and the plan closes it with a dated receipt this
 * module writes and the release step reads.
 *
 * The refusal is a MACHINE check, not a line in a checklist. That distinction is the whole point:
 * this repo's own cost-of-detection ladder says a deterministic property belongs on a deterministic
 * layer, and "did someone remember to run the probe?" is exactly the kind of question that gets a
 * confident yes from a tired human at 2am.
 *
 * Two properties, both tested:
 *   · a receipt is written ONLY when every vehicle passed — so it cannot be hand-edited into
 *     freshness without also lying about the vehicles;
 *   · a receipt older than the freshness window is REFUSED, because a probe from last month
 *     describes a package that no longer exists.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Deliberately NOT in `package.json#files` — local evidence, never a published artifact. */
export const RECEIPT_PATH = join(here, '..', '.l2-receipt.json');

/** How long a live probe stays believable. */
export const FRESHNESS_MS = 24 * 60 * 60 * 1000;

/** The vehicles the pre-publish ritual must cover (ADR-005; V4 is a shell smoke, not a Claude probe). */
export const VEHICLES = ['V1', 'V2', 'V3', 'V4'];

/**
 * Write a receipt — ONLY if every vehicle passed.
 *
 * @param {{vehicles: Record<string,string>, ccVersion: string, expectSets?: Record<string,unknown>, now?: number, path?: string}} input
 * @returns {{written: boolean, reason?: string, path: string}}
 */
export function writeReceipt(input) {
  const path = input.path ?? RECEIPT_PATH;
  const vehicles = input.vehicles ?? {};
  const missing = VEHICLES.filter((v) => vehicles[v] === undefined);
  if (missing.length > 0) return { written: false, reason: `no result recorded for ${missing.join(', ')}`, path };
  const notPass = VEHICLES.filter((v) => vehicles[v] !== 'pass');
  if (notPass.length > 0) {
    return { written: false, reason: `${notPass.join(', ')} did not pass — a receipt is written only for a fully passing run`, path };
  }
  const receipt = {
    date: new Date(input.now ?? Date.now()).toISOString(),
    ccVersion: input.ccVersion,
    vehicles: Object.fromEntries(VEHICLES.map((v) => [v, vehicles[v]])),
    expectSets: input.expectSets ?? {},
  };
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return { written: true, path };
}

/**
 * May the release proceed? Fail-closed: every unreadable, incomplete, non-passing or stale state is
 * a refusal with a NAMED reason, and there is no "assume it's fine" branch.
 *
 * @returns {{ok: boolean, reason: string, ageMs?: number}}
 */
export function checkReceipt(options = {}) {
  const path = options.path ?? RECEIPT_PATH;
  const now = options.now ?? Date.now();
  const freshnessMs = options.freshnessMs ?? FRESHNESS_MS;

  if (!existsSync(path)) {
    return { ok: false, reason: 'no .l2-receipt.json — run the L2 live probe ritual before publishing' };
  }
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { ok: false, reason: `.l2-receipt.json is unreadable (${error instanceof Error ? error.message : String(error)})` };
  }
  const missing = VEHICLES.filter((v) => receipt?.vehicles?.[v] === undefined);
  if (missing.length > 0) return { ok: false, reason: `receipt records no result for ${missing.join(', ')}` };
  const notPass = VEHICLES.filter((v) => receipt.vehicles[v] !== 'pass');
  if (notPass.length > 0) return { ok: false, reason: `receipt records a non-pass vehicle: ${notPass.join(', ')}` };

  const stamped = Date.parse(receipt.date);
  if (!Number.isFinite(stamped)) return { ok: false, reason: `receipt carries an unparseable date: ${String(receipt.date)}` };
  const ageMs = now - stamped;
  // A receipt dated in the FUTURE is not fresh, it is wrong — clock skew or a hand edit.
  if (ageMs < 0) return { ok: false, reason: 'receipt is dated in the future — refusing to trust it', ageMs };
  if (ageMs > freshnessMs) {
    return { ok: false, reason: `receipt is ${Math.round(ageMs / 3_600_000)}h old (limit ${Math.round(freshnessMs / 3_600_000)}h) — re-run the L2 ritual`, ageMs };
  }
  return { ok: true, reason: `L2 receipt is fresh (${Math.round(ageMs / 60_000)} min old, client ${receipt.ccVersion ?? 'unknown'})`, ageMs };
}
