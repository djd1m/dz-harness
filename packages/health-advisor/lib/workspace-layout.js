'use strict';

// lib/workspace-layout.js — THE ONE MACHINE DEFINITION OF THE PATIENT WORKSPACE LAYOUT (INV-10).
//
// Before 1.7.0 the four canonical directory names lived as a hand-copied array literal in
// lib/check.js plus prose copies in base/prompts/system-prompt.md and base/skills/health-advisor.md,
// while skills/health-trend-analyzer/ documented a SECOND, rival tree (`data/profile.json`,
// `data/medical_records/**`). Two layouts drift; four copies of one layout drift silently.
// This file is the single machine-readable definition every reader now imports.
//
// PURE AND fs-READ-ONLY BY CONTRACT. It is inside `lib/`, which lib/appraisal-egress-scan.js walks
// WHOLE (SOLE_NETWORK_SITE = lib/appraisal-transport.js, SURFACE_EXCLUSIONS asserted empty), so a
// network-capable import here would break CA-1. There is none, and `detectLegacyLayout` deliberately
// STATS rather than READS: presence-detection is all the migration needs, and never opening a legacy
// patient file is the cheapest possible privacy posture (AM-2).
//
// "A resolver no reader uses has not delivered a migration" — so the proof this file is load-bearing
// is behavioural: mutate CANONICAL_DIRS and `ha check`'s scope moves with it
// (test/layout-single-definition-grep-guard.test.js).

const fs = require('node:fs');
const path = require('node:path');

// The workspace convention documented in base/skills/health-advisor.md (File Structure Convention).
// MOVED here from lib/check.js's DEFAULT_SCOPE_DIRS literal — check.js now imports it.
const CANONICAL_DIRS = Object.freeze(['sources', 'research', 'analysis', 'doctors']);

// ── the raw zone: immutable, machine-written primary sources (Karpathy "Ingest" template) ────────
//
// sources/raw/sha256-<64 hex>/  — one content-addressed directory per ingested archive (AM-9: the
//                                 FULL sha256, never a truncated 16-hex prefix)
// sources/manifest.json         — the INDEX: one row per ingested file
// sources/LOG.jsonl             — the append-only LOG: one line per attempt, refusals included
//                                 (AM-8: a sibling of manifest.json, not a suffix of it)
const RAW_ZONE = 'sources/raw';
const MANIFEST_PATH = 'sources/manifest.json';
const LOG_PATH = 'sources/LOG.jsonl';

// Intake's own working directories. Dot-prefixed on purpose: lib/check.js's walk already skips
// dot-entries, so neither a staging tree nor a download blob can ever be mistaken for a deliverable.
// The staging root MUST sit on the same filesystem as sources/raw/ — that is what makes the single
// commit `rename()` atomic (INV-1), and it is why os.tmpdir() is NOT used for it.
const INTAKE_TMP = 'sources/.intake-tmp';
const INTAKE_STAGING = 'sources/.intake-staging';
// The lock SCOPE dirname handed to lock.withCaseLock(dir, fn, {scopeDirname}) — a scope of its own,
// so an intake never contends with a case-state write in the same workspace.
const INTAKE_LOCK_SCOPE = '.intake';

// ── the third brain: the SEGREGATED store full analytical documents are filed into (ADR-001 D-2) ──
//
// .health-brain/            — the store `learning_bridge.py` already writes DISTILLED lessons into.
//                             `ha third-brain` files FULL analytical documents into the SAME store,
//                             through the SAME four-check gate, and never into the shared `.dz`.
// .health-brain/LOG.jsonl   — the append-only audit trail (D-7), one line per ATTEMPT including
//                             every refusal. The sibling of sources/LOG.jsonl, one storey over.
// .health-brain/.ingest-tmp — the payload staging dir (D-8). Dot-prefixed and INSIDE the brain on
//                             purpose: the JSON batch handed to the store's bulk-import primitive
//                             carries patient text, so it must never touch os.tmpdir(), which is
//                             world-visible and outside the directory an operator isolates.
//                             (The primitive is NOT named here on purpose: this file is covered by
//                             test/layout-no-data-dir-code-reference.test.js's layer-1 guard, which
//                             greps the layout module for shared-brain write verbs. The guard is
//                             deliberately crude, and the constant's meaning survives the omission
//                             — skills/third-brain/engine/write.js names the command in full.)
//
// WHY THE DIRNAME LIVES HERE AND NOT ONLY IN PYTHON: `learning_bridge.py` holds the literal
// `.health-brain` in HEALTH_BRAIN_DIRNAME (its own module constant). Two languages, one spelling —
// and a drift between them would point the JS search leg at a directory the Python write leg never
// fills, which reads exactly like "the document was never ingested". The pin is a TEST
// (test/third-brain-dirname-cross-language-pin.test.js), not a comment (SP-17).
const HEALTH_BRAIN_DIRNAME = '.health-brain';
const BRAIN_LOG_PATH = '.health-brain/LOG.jsonl';
const BRAIN_TMP_DIR = '.health-brain/.ingest-tmp';
// The lock SCOPE dirname for `ha third-brain ingest` (fix round 1, QE F2) — handed to
// lock.withCaseLock(<workspace>/.health-brain, fn, {scopeDirname}) so the bridge's count→write→count
// verification belt is serialised per workspace. A sibling of `.ingest-tmp`, INSIDE the brain (covered
// by its self-ignoring `.gitignore`), and deliberately NOT the brain's own `.dz`: the resolved lock
// path is `.health-brain/.ingest-lock/.dz/store.lock`, so it can never contend with the store lock
// the store's own bulk-import primitive takes for the pattern store itself. (The primitive is not
// named here — same reason as the BRAIN_TMP_DIR note above: this file sits behind the layer-1 grep
// guard in test/layout-no-data-dir-code-reference.test.js, which hunts write verbs in the layout
// module; skills/third-brain/engine/write.js names the command in full.)
const BRAIN_LOCK_SCOPE = '.ingest-lock';

// ── the pairing gate's ONE exemption (C-2, §6.2) ─────────────────────────────────────────────────
//
// lib/check.js fails closed on any unpaired `.md` under the canonical dirs. An ingested archive may
// legitimately contain `.md` files that will never have a rendered `.html` sibling: they are RAW
// primary sources, not deliverables. The exemption is NAMED and TESTED IN BOTH DIRECTIONS
// (test/check-raw-excluded-pairing.test.js) rather than being a silent skip.
//
// HONEST LIMIT, stated not implied: exemption is decided on the path RELATIVE TO THE WORKSPACE ROOT
// check was pointed at. `ha check <ws>` exempts `<ws>/sources/raw/**`; `ha check <ws>/sources` does
// not, because from that root the same file is `raw/**` and the tool was told a different workspace.
const PAIRING_EXEMPT = Object.freeze(['sources/raw']);

// ── the legacy (rival) layout ────────────────────────────────────────────────────────────────────
//
// skills/health-trend-analyzer/data-sources.md documents these paths. MEASURED at design time:
// `data/**` has NO runtime reader in this package — so reconciliation is a declaration plus a loud
// warning, never a migration this feature performs on a patient's files.
const LEGACY_PRIMARY_PATHS = Object.freeze(['data/profile.json', 'data/medical_records']);

const LEGACY_WARNING_TAG = '[LEGACY-LAYOUT]';
const GIT_TRACKED_WARNING_TAG = '[GIT-TRACKED]';

function toPosix(rel) {
  return String(rel).split(path.sep).join('/');
}

/**
 * Is `relPath` (relative to the workspace root, either separator) inside the pairing-exempt raw zone?
 */
function isPairingExempt(relPath) {
  const rel = toPosix(relPath).replace(/^\.\//, '');
  return PAIRING_EXEMPT.some((ex) => rel === ex || rel.startsWith(`${ex}/`));
}

/**
 * detectLegacyLayout(workspaceDir) -> { present: boolean, paths: string[] }
 *
 * STAT ONLY — never `readFileSync`, never a parse, never a copy (AM-2). `lstat` rather than `stat`
 * so a dangling symlink still counts as "something is there", and so a legacy tree reached through a
 * link is not silently followed.
 */
function detectLegacyLayout(workspaceDir) {
  const root = path.resolve(workspaceDir);
  const found = [];
  for (const rel of LEGACY_PRIMARY_PATHS) {
    try {
      fs.lstatSync(path.join(root, ...rel.split('/')));
      found.push(rel);
    } catch {
      /* absent — the overwhelmingly common case, and it must stay SILENT (INV-11, both directions) */
    }
  }
  return { present: found.length > 0, paths: found };
}

/**
 * The warning text emitted by `intake-archive` (and by its `--verify` report) when a legacy tree is
 * present. ONE renderer, so the two surfaces cannot word it differently.
 *
 * `ha check` does NOT call this, ever: its exit contract is "1 if any unpaired .md, 0 otherwise,
 * 2 on usage error — there is NO --warn mode and NO warn-only outcome". Adding a warn path to a gate
 * is how a gate dies quietly, so the legacy warning belongs to the INTAKE direction only (P1-1).
 */
function renderLegacyWarning(detection) {
  return [
    `${LEGACY_WARNING_TAG} this workspace still carries the pre-1.7.0 health-trend-analyzer tree:`,
    ...detection.paths.map((p) => `  ${p}`),
    `${LEGACY_WARNING_TAG} the canonical primary-data layout is now sources/ (raw/ + manifest.json + LOG.jsonl).`,
    `${LEGACY_WARNING_TAG} nothing was read, moved or migrated — see skills/health-trend-analyzer/data-sources.md`,
    `${LEGACY_WARNING_TAG} for the mapping, including the rows that have no canonical home yet.`,
  ].join('\n');
}

module.exports = {
  CANONICAL_DIRS,
  RAW_ZONE,
  MANIFEST_PATH,
  LOG_PATH,
  INTAKE_TMP,
  INTAKE_STAGING,
  INTAKE_LOCK_SCOPE,
  HEALTH_BRAIN_DIRNAME,
  BRAIN_LOG_PATH,
  BRAIN_TMP_DIR,
  BRAIN_LOCK_SCOPE,
  PAIRING_EXEMPT,
  LEGACY_PRIMARY_PATHS,
  LEGACY_WARNING_TAG,
  GIT_TRACKED_WARNING_TAG,
  isPairingExempt,
  detectLegacyLayout,
  renderLegacyWarning,
};
