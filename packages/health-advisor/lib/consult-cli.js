'use strict';

// consult-cli.js — CLI adapters for the `consult-gate` and `triage` verbs (the I/O half; the gate
// and the comparator themselves are pure — architecture §1.1). Returns process exit codes:
//
//   consult-gate:  0 PASS or ANY shadow run whatsoever (INV-12) · 1 FAIL (enforce) ·
//                  2 usage/IO error · 3 INCONCLUSIVE (enforce) — inconclusive NEVER exits 0.
//   triage:        0 evaluated (hits are DATA, not an error) · 2 usage/IO/registry error.
//
// ENFORCEMENT CONJUNCTION (ADR-002 #2 as pinned in plan §2.3): enforcing requires BOTH
// `--mode enforce` AND `caveat_gate.enforce_policy: "v1"` in the NON-shipped workspace config
// `<cwd>/.dz/config.json`. Absent, unparseable, or any version other than "v1" ⇒ shadow
// (fail-safe: bumping the gate to v2 silently DISARMS an old workspace rather than blocking it).

const fs = require('node:fs');
const path = require('node:path');

const { evaluateCaveatGate } = require('./caveat-gate.js');
const { renderGateReportJson, renderGateReportText } = require('./caveat-gate-report.js');
const { evaluateTriage, ThresholdRegistryError } = require('./emergency-triage.js');

const ENFORCE_POLICY_VERSION = 'v1';

/** Read the workspace consilium config. NEVER throws: absent/unparseable ⇒ {} (fail-safe shadow). */
function readConsiliumConfig(cwd) {
  try {
    const raw = fs.readFileSync(path.join(cwd, '.dz', 'config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && parsed.caveat_gate && typeof parsed.caveat_gate === 'object') ? parsed.caveat_gate : {};
  } catch (err) {
    return {};
  }
}

/**
 * Round 4: validate a previously written --report file against the EXACT ha-gate-report-1 shape
 * (the fields renderGateReportJson always writes). Returns null when valid, else a defect string
 * NAMING what is wrong. Deliberately a full-shape check, not just the pins: a report this gate
 * could never have produced is evidence of tampering or corruption, and enforce must not trust
 * ANY part of it (Codex round-3 R1: `{}` is valid JSON and silently reset the pin carry).
 */
function gateReportShapeDefect(prev) {
  if (!prev || typeof prev !== 'object' || Array.isArray(prev)) return 'not a JSON object';
  if (prev.schema !== 'ha-gate-report-1') return `schema is ${JSON.stringify(prev.schema)}, expected "ha-gate-report-1"`;
  if (!['PASS', 'FAIL', 'INCONCLUSIVE'].includes(prev.verdict)) return `verdict is ${JSON.stringify(prev.verdict)}, expected PASS|FAIL|INCONCLUSIVE`;
  if (!prev.axes || typeof prev.axes !== 'object' || Array.isArray(prev.axes)) return 'axes is missing or not an object';
  if (!Array.isArray(prev.lane_failures)) return 'lane_failures is missing or not an array';
  if (!Array.isArray(prev.inconclusive_reasons)) return 'inconclusive_reasons is missing or not an array';
  if (!Array.isArray(prev.pinned_caveat_ids)) return 'pinned_caveat_ids is missing or not an array';
  for (let i = 0; i < prev.pinned_caveat_ids.length; i++) {
    if (typeof prev.pinned_caveat_ids[i] !== 'string') return `pinned_caveat_ids[${i}] is not a string — pins must be an ALL-string array, non-string entries are rejected, never filtered away`;
  }
  if (!Array.isArray(prev.residual_limits)) return 'residual_limits is missing or not an array';
  return null;
}

function runConsultGate({ synthesis, lanesDir, mode, json, report, expect, runId, cwd = process.cwd() }) {
  if (!synthesis) {
    console.error('[ERROR] consult-gate: no synthesis file given. Usage: consult-gate <synthesis.md> --lanes <dir> [--mode shadow|enforce] [--expect <s1,s2,…>] [--run-id <id>] [--json] [--report <path>]');
    return 2;
  }
  if (mode && mode !== 'shadow' && mode !== 'enforce') {
    console.error(`[ERROR] consult-gate: --mode must be shadow|enforce, got ${JSON.stringify(mode)}`);
    return 2;
  }
  const synthesisAbs = path.resolve(cwd, synthesis);
  if (!fs.existsSync(synthesisAbs) || !fs.statSync(synthesisAbs).isFile()) {
    console.error(`[ERROR] consult-gate: synthesis not found: ${synthesisAbs}`);
    return 2;
  }
  if (!lanesDir) {
    console.error('[ERROR] consult-gate: --lanes <dir> is required (the lane findings are the source the synthesis is audited against)');
    return 2;
  }
  const lanesAbs = path.resolve(cwd, lanesDir);
  if (!fs.existsSync(lanesAbs) || !fs.statSync(lanesAbs).isDirectory()) {
    console.error(`[ERROR] consult-gate: lanes directory not found: ${lanesAbs}`);
    return 2;
  }

  // G3: --expect <specialty,…> names the roster the caller EXPECTED. A lane the readdir cannot
  // see (a dead agent that wrote nothing) is then a NAMED 'missing' LaneFailure the synthesis must
  // disclose — never a silently smaller consult. Components are kept RAW here (round 4): blanks
  // are only filtered for the shadow report; enforce REJECTS them below instead of dropping them.
  const expectedComponents = typeof expect === 'string'
    ? expect.split(',').map((s) => s.trim())
    : undefined;
  const expectedLanes = expectedComponents === undefined ? undefined : expectedComponents.filter(Boolean);

  // Round 3 (Codex re-QE R2: "enforcement accepts absent or empty --expect"): an ENFORCE request
  // is fail-closed at the request surface — usage errors, decided BEFORE the two-switch config
  // conjunction, exactly like a missing --lanes. Shadow stays report-only and may run rosterless
  // (a report over whatever readdir found is still an honest report; there is nothing to block).
  // Round 4 (Codex round-3 R2, executed: `--expect 'cardiology,,clinical-pharmacology'` PASSED —
  // filter(Boolean) silently dropped the empty member): an empty roster COMPONENT is a validation
  // error, never a silent shrink.
  // Round 4 (Codex round-3 R2: "HIGH remains unless enforce always requires --run-id"): --run-id
  // is now UNCONDITIONALLY mandatory in enforce — an entirely run-id-free lane set could otherwise
  // pass enforcement unbound (stripping every lane.run_id plus omitting the flag was the bypass).
  // Round 4 (Codex round-3 R1: a valid-but-wrong-schema report silently RESET the pin carry):
  // --report is mandatory in enforce — the gate's cross-attempt "EVER seen with a pinned type"
  // guarantee lives in the report file; enforce without it would silently make no such claim.
  if (mode === 'enforce') {
    if (expectedLanes === undefined) {
      console.error('[ERROR] consult-gate: --mode enforce requires --expect <s1,s2,…> (the roster the caller expected) — without it a dead lane silently vanishes from the enforcing check');
      return 2;
    }
    if (expectedLanes.length === 0) {
      console.error('[ERROR] consult-gate: --mode enforce with an EMPTY --expect roster is an error, not a trivially-satisfied check — name the expected specialties');
      return 2;
    }
    if (expectedComponents.length !== expectedLanes.length) {
      console.error(`[ERROR] consult-gate: --expect roster contains an EMPTY component (${JSON.stringify(expect)}) — a silently dropped member would shrink the enforced roster; name every specialty or remove the stray comma`);
      return 2;
    }
    if (new Set(expectedLanes).size !== expectedLanes.length) {
      console.error('[ERROR] consult-gate: --expect roster contains duplicate specialties — two roster lanes would collapse into one identity');
      return 2;
    }
  }

  // Round 3: --run-id binds every lane file to the run under audit (lane.run_id, byte-equal).
  // Full cryptographic lane integrity is OUT OF SCOPE (see RESIDUAL_LIMITS / README): this is the
  // honest cheap layer — a stale or copied-over lane file from another run becomes a NAMED
  // run_mismatch LaneFailure the synthesis cannot have disclosed, so the enforcing run FAILS.
  const expectedRunId = typeof runId === 'string' && runId.trim() !== '' ? runId.trim() : undefined;

  if (mode === 'enforce') {
    // Round 4: unconditional (was: required only when lane files already carried lane.run_id —
    // which let a lane set with EVERY run_id stripped pass enforcement entirely unbound). Under a
    // mandatory binding, a lane without lane.run_id is a named run_mismatch failure, never data.
    if (expectedRunId === undefined) {
      console.error('[ERROR] consult-gate: --mode enforce requires --run-id <id> — an unbound enforcing audit accepts stale/spoofed lane files, and a run-id-free lane set would escape binding entirely (stale/spoofed-lane defence)');
      return 2;
    }
    // Round 4: the pin carry ("a caveat_id EVER seen with a pinned type in this run") exists ONLY
    // through the --report file. Enforce without --report would silently drop the cross-attempt
    // guarantee — require the flag instead of making the claim conditionally true.
    if (!report) {
      console.error('[ERROR] consult-gate: --mode enforce requires --report <path> — the cross-attempt pin carry (pinned_caveat_ids) lives in the report file; without it "EVER seen with a pinned type in this run" cannot be enforced');
      return 2;
    }
  }

  const config = readConsiliumConfig(cwd);
  const enforcing = mode === 'enforce' && config.enforce_policy === ENFORCE_POLICY_VERSION;
  if (mode === 'enforce' && !enforcing) {
    // LOUD, never silent: the operator asked for enforce and did not get it.
    console.error(`consult-gate: --mode enforce requested but the workspace policy is ${config.enforce_policy === undefined ? 'ABSENT' : JSON.stringify(config.enforce_policy)} (need caveat_gate.enforce_policy: "${ENFORCE_POLICY_VERSION}" in <cwd>/.dz/config.json) — running in SHADOW (fail-safe; enforcement is a two-switch conjunction, ADR-002)`);
  }

  let gateReport;
  try {
    const laneSources = fs.readdirSync(lanesAbs)
      .filter((f) => f.endsWith('.findings.json'))
      .sort()
      .map((f) => ({ specialty: f.replace(/\.findings\.json$/, ''), raw: fs.readFileSync(path.join(lanesAbs, f), 'utf8') }));

    // Round 3 id-pinning carry: if a gate report from an EARLIER attempt of this same run exists
    // at the --report path, its pinned_caveat_ids are fed back — a caveat_id ever seen with a
    // pinned type in this run can never be re-counted as unpinned (CAVEAT_RETYPED otherwise).
    // Round 4 (Codex round-3 R1, executed: "first run pins; replace report with {}; retype and
    // omit; enforcing second run exits 0"): JSON-parseability is NOT validity. In enforce, an
    // existing report must match the EXACT ha-gate-report-1 shape (all-string pins included);
    // any defect is exit 2 NAMING it — a valid-but-wrong report must never silently reset carry.
    let pinnedCaveatIds;
    if (report) {
      const reportAbs = path.resolve(cwd, report);
      if (fs.existsSync(reportAbs)) {
        try {
          const prev = JSON.parse(fs.readFileSync(reportAbs, 'utf8'));
          const defect = gateReportShapeDefect(prev);
          if (defect === null) {
            pinnedCaveatIds = prev.pinned_caveat_ids;
          } else if (mode === 'enforce') {
            // A schema-invalid prior report could be HIDING pins — enforce must not guess it empty.
            console.error(`[ERROR] consult-gate: the existing --report file is not a valid ha-gate-report-1 (${defect}) — cannot trust this run's pin carry; restore the real report or delete the file explicitly`);
            return 2;
          } else {
            console.error(`consult-gate (shadow): existing --report is not a valid ha-gate-report-1 (${defect}) — pin carry skipped, shadow stays exit 0`);
          }
        } catch (err) {
          if (mode === 'enforce') {
            // An unreadable prior report could be HIDING pins — enforce must not guess it empty.
            console.error(`[ERROR] consult-gate: an existing --report file is unreadable (${err.message}) — cannot recover this run's pinned caveat ids; delete or fix it explicitly`);
            return 2;
          }
          console.error(`consult-gate (shadow): existing --report unreadable (${err.message}) — pin carry skipped, shadow stays exit 0`);
        }
      }
    }

    gateReport = evaluateCaveatGate({ laneSources, synthesisText: fs.readFileSync(synthesisAbs, 'utf8'), expectedLanes, expectedRunId, pinnedCaveatIds });
  } catch (err) {
    if (enforcing) {
      // Enforce: a crashed gate STOPS the caller (a gate that cannot run must not wave anything through).
      console.error(`[ERROR] consult-gate crashed in enforce mode: ${err.message}`);
      return 2;
    }
    // Shadow may not affect the caller even by crashing (INV-12) — report the crash, exit 0.
    console.error(`consult-gate (shadow): gate crashed — reported, output unchanged, exit 0 by construction (INV-12): ${err.message}`);
    return 0;
  }

  const rendered = json ? renderGateReportJson(gateReport) : renderGateReportText(gateReport);
  process.stdout.write(rendered);
  if (report) {
    try {
      fs.writeFileSync(path.resolve(cwd, report), renderGateReportJson(gateReport));
    } catch (err) {
      if (enforcing) { console.error(`[ERROR] consult-gate: could not write --report: ${err.message}`); return 2; }
      console.error(`consult-gate (shadow): could not write --report (${err.message}) — shadow stays exit 0`);
    }
  }

  if (!enforcing) return 0; // INV-12: any shadow run whatsoever exits 0 — the report above is the whole product
  if (gateReport.verdict === 'FAIL') return 1;
  if (gateReport.verdict === 'INCONCLUSIVE') return 3; // inconclusive never passes
  return 0;
}

function runTriage({ profile, json, cwd = process.cwd(), packageRoot }) {
  if (!profile) {
    console.error('[ERROR] triage: --profile <path> is required. Usage: triage --profile <profile.json> [--json]');
    return 2;
  }
  const profileAbs = path.resolve(cwd, profile);
  if (!fs.existsSync(profileAbs) || !fs.statSync(profileAbs).isFile()) {
    console.error(`[ERROR] triage: profile not found: ${profileAbs}`);
    return 2;
  }
  let labs;
  try {
    const doc = JSON.parse(fs.readFileSync(profileAbs, 'utf8'));
    labs = Array.isArray(doc) ? doc : doc.labs;
    if (!Array.isArray(labs)) throw new Error('profile must be {labs: [...]} or a top-level array of {analyte, value, unit}');
  } catch (err) {
    console.error(`[ERROR] triage: could not read profile labs: ${err.message}`);
    return 2;
  }
  let result;
  try {
    const registryDoc = JSON.parse(fs.readFileSync(path.join(packageRoot, 'lib', 'registry', 'emergency-thresholds.json'), 'utf8'));
    result = evaluateTriage(labs, registryDoc);
  } catch (err) {
    // A broken registry is a STOP, never "assume no emergency" — the caller must treat exit 2 as
    // "could not evaluate the emergency table", which is NOT the same claim as "no emergency".
    const label = err instanceof ThresholdRegistryError ? 'threshold registry invalid' : 'triage failed';
    console.error(`[ERROR] triage: ${label}: ${err.message}`);
    return 2;
  }
  if (json) {
    process.stdout.write(JSON.stringify({ route: result.route, emergency_hits: result.hits, skipped: result.skipped, closed_world_note: result.closed_world_note }, null, 2) + '\n');
  } else {
    if (result.hits.length === 0) console.log(`triage: no threshold fired — ${result.closed_world_note}`);
    else {
      console.log(`triage: route=${result.route}`);
      for (const h of result.hits) console.log(`  ${h.action === 'ambulance' ? 'СКОРАЯ ПОМОЩЬ (103/112)' : 'Срочно к врачу (24 ч)'} — ${h.analyte} ${h.value} ${h.unit} (${h.bound.operator}${h.bound.threshold}); ${h.significance || ''}`);
      console.log(`  ${result.closed_world_note}`);
    }
    for (const s of result.skipped) console.log(`  skipped: ${s.analyte} — ${s.reason}`);
  }
  return 0;
}

module.exports = { runConsultGate, runTriage, readConsiliumConfig, gateReportShapeDefect, ENFORCE_POLICY_VERSION };
