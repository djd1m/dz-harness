'use strict';

// write.js — THE ONE MODULE ALLOWED TO CAUSE A WRITE, and the SOLE_SPAWN_SITE of this whole engine
// (ADR-001 D-10). It builds the payload, starts the bridge, verifies the verdict and appends the LOG.
//
// TWO DOORS LIVE HERE, AND ONLY HERE:
//   • `ingest()`  — the write leg (payload → `learning_bridge.py ingest-documents` → verdict → LOG);
//   • `runDz()`   — the READ-ONLY process door `search.js` borrows for `dz recall`.
// `search.js` deliberately does NOT import a process module of its own: `lib/appraisal-egress-scan.js`
// permits the process-spawning module at EXACTLY this path, so a second import anywhere in the tree
// (mutation `third-brain-second-spawn-site`) is a red test rather than a review question. One door
// means one place where argv is assembled — and argv-array form, never a shell string, is what makes
// a query containing shell metacharacters harmless.
//
// THE BRIDGE PATH IS __dirname-ANCHORED AND ABSOLUTE (D-8a, P2-b). A bare relative
// `learning_bridge.py` resolves against the CALLER's cwd and breaks the moment `ha` is invoked from
// anywhere but the package root — which is the normal case for an installed CLI. Pinned by
// test/third-brain-bridge-spawn-cwd-independent.test.js, whose cwd is deliberately outside the package.
//
// THE PAYLOAD NEVER LEAVES THE WORKSPACE (D-8). It carries patient text, so it is written inside
// `<workspace>/.health-brain/.ingest-tmp/` at mode 0600 and unlinked in a `finally` — success or
// failure. `os.tmpdir()` is world-visible and outside the directory an operator isolates or deletes.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { chunk, docId, renderHeader } = require('./plan.js');
const {
  BRIDGE_TIMEOUT_MS, MAX_DOCUMENT_BYTES, MAX_ANCHORS_PER_DOCUMENT,
} = require('./limits.js');
const {
  ThirdBrainUsageError,
  ThirdBrainNotSegregatedError,
  ThirdBrainDocumentOutsideWorkspaceError,
  ThirdBrainAnchorUnresolvableError,
  ThirdBrainWriteUnverifiedError,
  ThirdBrainDzUnavailableError,
  ThirdBrainPayloadEscapeError,
  isThirdBrainRefusal,
  refusalFromReason,
} = require('./errors.js');
// THE SHIPPED RESOLVER, reused — never re-implemented (D-2, D-5, SP-3). `resolveAnchorSingleRead` is
// deliberately NOT exported by that module and must stay that way: a second exported entry point onto
// one verification is a second door onto one invariant.
const { stampFromManifest, resolveAnchor } = require('../../../lib/source-anchor-store.js');
const { HEALTH_BRAIN_DIRNAME, BRAIN_LOG_PATH, BRAIN_TMP_DIR, BRAIN_LOCK_SCOPE } = require('../../../lib/workspace-layout.js');
// THE ONE LOCK IMPLEMENTATION IN THIS PACKAGE (ADR-007's doctrine, reused — never re-implemented;
// fix round 1, QE F2). The bridge's count→teach→count verification belt reads a store-wide counter,
// so two overlapping ingests each see the OTHER's writes inside their own window: every participant
// refuses `third_brain_write_unverified` while every record lands, and the LOG then contradicts the
// store it monitors. Serialising the belt per workspace is exactly the lost-update class lock.js
// exists for, and intake-archive already crossed this bridge (`INTAKE_LOCK_SCOPE`).
const { withCaseLock, CaseLockUnavailableError, CaseLockEscapeError } = require('../../case-state/engine/lock.js');

const LOG_SCHEMA = 'ha-third-brain-log-1';

/** The domain label the export hold-out keys on. EXPLICIT on every record, never omitted: a record
 *  with no `domain` silently becomes `"general"` in `--from-json`, which strips the second line of
 *  defence while the first (the separate store) still holds and everything still looks fine. */
const RECORD_DOMAIN = 'health-research';

/** `PatternRecord['type']` is the closed union 'rule' | 'success-pattern' | 'lesson-learned'. The
 *  coarse type is the compromise ADR-001 names in its Consequences; the TRUE kind is `kind=` in the
 *  `ha-doc-1` header, which is why AM-2 forbids carrying metadata through `--type`. */
const RECORD_TYPE = 'lesson-learned';

const RECORD_REWARD = 0.8;

// engine/ -> third-brain/ -> skills/ -> <package root>
const PACKAGE_ROOT = path.join(__dirname, '..', '..', '..');
const BRIDGE_SCRIPT = path.join(
  PACKAGE_ROOT, 'base', 'skills', 'base', 'goap-research-ed25519', 'scripts', 'learning_bridge.py',
);

/** `realpath` where it exists; the lexical path where it does not — never a silent `null`. */
function realpathOrAbs(p) {
  try { return fs.realpathSync(p); } catch (err) { if (err.code !== 'ENOENT') throw err; return path.resolve(p); }
}

function isInside(child, parent) {
  return child === parent || child.startsWith(parent + path.sep);
}

/**
 * runDz(args, opts) -> { code, out, err, timedOut, spawnError }
 *
 * THE READ-ONLY process door (`dz recall …`), exported for `search.js`. ARGV ARRAY FORM, never a
 * shell string: a query is operator text and may legitimately contain `;`, `$(` or a backtick, and
 * the difference between "a weird query returns nothing" and "a weird query runs a command" is
 * exactly this call's shape.
 */
function runDz(args, opts = {}) {
  const timeout = Number.isFinite(opts.timeoutMs) && opts.timeoutMs >= 1 ? opts.timeoutMs : BRIDGE_TIMEOUT_MS;
  const res = spawnSync('dz', args, {
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGTERM',
    env: opts.env === undefined ? process.env : opts.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    code: res.status,
    out: res.stdout === null || res.stdout === undefined ? '' : res.stdout,
    err: res.stderr === null || res.stderr === undefined ? '' : res.stderr,
    timedOut: res.error !== undefined && res.error !== null && res.error.code === 'ETIMEDOUT',
    spawnError: res.error === undefined ? null : res.error,
  };
}

/** Passage-length monitoring, ADR-002's own row: min / median / max, reported by `--json` AND stored
 *  in the LOG, so the after-action review reads real data instead of re-deriving it. */
function lengthStats(passages) {
  if (passages.length === 0) return { min: 0, median: 0, max: 0 };
  const lens = passages.map((p) => p.text.length).sort((a, b) => a - b);
  const mid = Math.floor(lens.length / 2);
  return {
    min: lens[0],
    median: lens.length % 2 === 1 ? lens[mid] : Math.round((lens[mid - 1] + lens[mid]) / 2),
    max: lens[lens.length - 1],
  };
}

/**
 * appendLog(workspace, entry) — D-7. One line per ATTEMPT, refusals included, mode 0600 in a 0700
 * directory.
 *
 * NO DOCUMENT TEXT AND NO ANCHOR PAYLOAD BEYOND ENTRY IDS. The refusal `reason` is recorded as its
 * machine code, never its human message: a message can quote the input, and an audit trail that
 * reproduces the corpus is not an audit trail (SP-14 greps the LOG's RAW BYTES for a canary known to
 * be inside the ingested document and asserts absence — a claim the schema's field list cannot make).
 *
 * A FAILURE TO LOG NEVER MASKS THE OUTCOME IT WAS LOGGING. The append is best-effort by design: an
 * unwritable workspace is already the operator's problem, and swallowing the real refusal to raise a
 * logging error would replace an actionable answer with a confusing one.
 */
function appendLog(workspace, entry) {
  try {
    // THE LOG NEVER TRAVELS AN ALIAS (fix round 1, QE F4). A refusal line carries `doc_path` /
    // `doc_sha256` / `case` — and "even the PATH is a datum" is this feature's own segregation
    // argument. When `.health-brain` is a symlink (the very condition several refusals are ABOUT),
    // appending through it would plant that identity at the alias's TARGET: `<ws>/LOG.jsonl` for
    // `ln -s . .health-brain`, inside the shared `.dz` for `ln -s .dz .health-brain`. So the append
    // happens only when the LEXICAL brain path resolves to itself (or does not exist yet, in which
    // case a REAL directory is created). Skipping is safe by this function's own contract: the
    // append is best-effort and a failure to log never masks the outcome it was logging.
    const wsReal = realpathOrAbs(workspace);
    const brainDir = path.join(wsReal, HEALTH_BRAIN_DIRNAME);
    let brainReal = null;
    try { brainReal = fs.realpathSync(brainDir); } catch (err) { if (err.code !== 'ENOENT') return false; }
    if (brainReal !== null && brainReal !== brainDir) return false;
    fs.mkdirSync(brainDir, { recursive: true, mode: 0o700 });
    const logPath = path.join(wsReal, ...BRAIN_LOG_PATH.split('/'));
    fs.appendFileSync(logPath, `${JSON.stringify({ schema: LOG_SCHEMA, ...entry })}\n`, { mode: 0o600 });
    try { fs.chmodSync(logPath, 0o600); } catch { /* a pre-existing log keeps whatever mode it has */ }
    return true;
  } catch {
    return false;
  }
}

/**
 * resolveAnchors(entryIds, workspace) -> frozen anchor descriptors
 *
 * FAIL-CLOSED AS A SET (SP-2, AC-3): one malformed or drifted anchor aborts the WHOLE ingest. A
 * partial batch would file a document whose header claims fewer citations than the operator supplied,
 * which is the one failure mode a provenance feature must not have.
 *
 * The stamp/resolve pair is the shipped one, called in ADR-001 D-5's order. `caseDir: workspace` is a
 * structural tautology at this call site — `.health-brain` is per-workspace — and that narrowing is a
 * REGISTERED accepted degradation (architecture/degradations.md) with a stated exit condition, not an
 * unstated assumption.
 */
function resolveAnchors(entryIds, workspace) {
  const out = [];
  for (const entryId of entryIds) {
    let anchor;
    try {
      anchor = stampFromManifest({ workspace, entryId });
    } catch (err) {
      throw new ThirdBrainAnchorUnresolvableError(
        `REFUSED — anchor ${JSON.stringify(entryId)} could not be stamped from ${path.join(workspace, 'sources', 'manifest.json')}: ` +
        `${err.message} Nothing was written.`,
        { entry_id: entryId, cause_reason: err.reason === undefined ? null : err.reason, cause_code: err.code === undefined ? null : err.code }
      );
    }
    if (anchor === null) {
      throw new ThirdBrainAnchorUnresolvableError(
        `REFUSED — no catalog row in ${path.join(workspace, 'sources', 'manifest.json')} carries entry_id ` +
        `${JSON.stringify(entryId)}. An anchor is minted from a row that was READ, never synthesised from ` +
        'what the caller typed. Nothing was written.',
        { entry_id: entryId, cause_reason: 'anchor_not_in_manifest', cause_code: 'EANCHORNOTINMANIFEST' }
      );
    }
    let resolved;
    try {
      resolved = resolveAnchor(anchor, { workspace, caseDir: workspace });
    } catch (err) {
      throw new ThirdBrainAnchorUnresolvableError(
        `REFUSED — anchor ${JSON.stringify(entryId)} does not resolve: ${err.message} The whole ingest is ` +
        'abandoned; a partial batch would file a document claiming citations it does not have.',
        { entry_id: entryId, cause_reason: err.reason === undefined ? null : err.reason, cause_code: err.code === undefined ? null : err.code }
      );
    }
    if (resolved.verified !== true) {
      throw new ThirdBrainAnchorUnresolvableError(
        `REFUSED — anchor ${JSON.stringify(entryId)} resolved without verified:true. Nothing was written.`,
        { entry_id: entryId, cause_reason: 'anchor_unverified', cause_code: null }
      );
    }
    out.push(resolved);
  }
  return out;
}

/**
 * buildRecords({...}) -> { records, passages, docId, docSha256, docPathRel }
 *
 * PURE apart from the digest: every decision here (chunking, ids, header) comes from plan.js, and
 * nothing on this path touches the store. Split out so a dry run and a real run compute the SAME
 * plan — a dry run that plans differently from the real one is worse than no dry run.
 */
function buildRecords({ text, docSha256, docPathRel, caseSlug, kind, date, anchorIds, ts }) {
  const passages = chunk(text);
  if (passages.length === 0) {
    // ADR-002 step 5, folded into the USAGE exit (2), deliberately NOT an eighth refusal reason.
    throw new ThirdBrainUsageError(
      `the document ${docPathRel} contains no text to index (it is empty or entirely whitespace). ` +
      'Nothing was chunked, planned or written.',
      { reason: 'document_empty' }
    );
  }
  const id = docId(docSha256, docPathRel);
  const m = passages.length;
  const records = passages.map((p, i) => ({
    pattern: `${renderHeader({
      doc_id: id, case: caseSlug, kind, date, chunk: i + 1, m,
      doc_sha256: docSha256, doc_path: docPathRel, anchors: anchorIds,
    })}\n${p.text}`,
    type: RECORD_TYPE,
    reward: RECORD_REWARD,
    domain: RECORD_DOMAIN,
    ts,
  }));
  return { records, passages, docId: id, docSha256, docPathRel, m };
}

/** The verdict JSON the bridge printed — PARSED, never synthesised. Returns null when there is none. */
function parseVerdict(stdout) {
  const lines = String(stdout).split('\n').map((l) => l.trim()).filter((l) => l !== '');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].startsWith('{')) continue;
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed !== null && typeof parsed === 'object' && typeof parsed.ok === 'boolean') return parsed;
    } catch { /* not the verdict line — keep looking backwards */ }
  }
  return null;
}

/**
 * ingest(opts) -> Promise<result> | rejects
 *
 * opts: { documentPath, workspace, case, kind, date, anchors[], dryRun, ts, env, bridgeTimeoutMs }
 *
 * ASYNC SINCE FIX ROUND 1 (QE F2): the payload→bridge→verdict section runs under the per-workspace
 * ingest lock (`withCaseLock`, the package's one lock implementation), whose acquisition is async.
 * Everything before the lock — containment, budgets, anchors, the pure plan — is unchanged and
 * synchronous.
 *
 * ORDER IS THE SAFETY PROPERTY, not an implementation detail:
 *   1. the workspace and the document are located and CONTAINED;
 *   2. the BUDGETS are enforced — before chunking, before any payload exists on disk;
 *   3. anchors are stamped and resolved, fail-closed as a set;
 *   4. the records are planned (pure);
 *   5. only then is a payload written, and only then is a process started.
 * A budget checked after the payload was written would leave patient text on disk for a document the
 * tool then refused, which is the opposite of what the budget is for.
 */
async function ingest(opts = {}) {
  const started = typeof opts.ts === 'string' ? opts.ts : new Date().toISOString();
  const workspace = realpathOrAbs(path.resolve(String(opts.workspace === undefined ? '.' : opts.workspace)));
  if (!fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) {
    throw new ThirdBrainUsageError(`--workspace ${JSON.stringify(opts.workspace)} is not a directory.`, { reason: 'workspace_not_a_directory' });
  }
  for (const [flag, value] of [['--case', opts.case], ['--kind', opts.kind], ['--date', opts.date]]) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ThirdBrainUsageError(`${flag} is required for an ingest.`, { reason: 'missing_flag' });
    }
  }
  // WHITESPACE IS REFUSED AT THE BOUNDARY, AS THE OPERATOR'S MISTAKE (fix round 1, QE F5). The
  // one-line `ha-doc-1` header cannot carry a value with whitespace (ADR-001 D-4) — but these values
  // are OPERATOR-typed input, so reaching renderHeader's own guard turned an ordinary typo into
  // "INTERNAL ERROR … a bug in third-brain" with a stack trace. Same answer, honest label: exit 2.
  for (const [flag, value] of [['--case', opts.case], ['--kind', opts.kind]]) {
    if (/\s/.test(value)) {
      throw new ThirdBrainUsageError(
        `${flag} ${JSON.stringify(value)} contains whitespace, which the one-line record header cannot ` +
        'carry unambiguously. Use a whitespace-free slug (e.g. kebab-case).',
        { reason: 'value_has_whitespace' }
      );
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) {
    throw new ThirdBrainUsageError(`--date ${JSON.stringify(opts.date)} must be YYYY-MM-DD.`, { reason: 'bad_date' });
  }
  const anchorIds = Array.isArray(opts.anchors) ? opts.anchors.slice() : [];

  // THE LOG SKELETON EXISTS BEFORE THE FIRST REFUSAL CAN FIRE (D-7: "every ATTEMPT, success and
  // refusal alike"). The earliest refusals — a document outside the workspace, a budget breach —
  // happen before the document has been read, so `doc_sha256` and `doc_path` are honestly `null`
  // there rather than invented; the fields that ARE known (`case`, `kind`, the attempted anchor ids)
  // are recorded. An audit trail that starts only once the ingest is going well cannot answer the
  // question it exists for: what was tried, and what refused it.
  //
  // A USAGE ERROR IS DELIBERATELY NOT LOGGED, and that is a decision rather than an oversight: exit 2
  // means the COMMAND LINE was wrong (a malformed date, a missing flag, an empty document). It is not
  // an attempt to write, and logging it would fill a privacy-sensitive audit trail with typing noise.
  const logBase = {
    ts: started,
    verb: 'ingest',
    doc_id: null,
    doc_sha256: null,
    doc_path: null,
    kind: opts.kind,
    case: opts.case,
    chunks: null,
    anchors: anchorIds,
  };
  /**
   * Append the refusal line, then rethrow. One helper so no refusal path can forget the LOG.
   *
   * A DRY RUN records nothing, refusal included: `--dry-run` is the flag an operator reaches for
   * precisely because they are not ready for this workspace to change, and a LOG line is a change.
   */
  const refuse = (err, extra = {}) => {
    if (opts.dryRun !== true) {
      appendLog(workspace, { ...logBase, ...extra, outcome: 'refused', reason: err.reason });
    }
    throw err;
  };

  // ── 1. the document, CONTAINED ────────────────────────────────────────────────────────────────
  if (typeof opts.documentPath !== 'string' || opts.documentPath.trim() === '') {
    throw new ThirdBrainUsageError('ingest needs a document path.', { reason: 'missing_document' });
  }
  const docAbs = realpathOrAbs(path.resolve(workspace, opts.documentPath));
  if (!isInside(docAbs, workspace)) {
    refuse(new ThirdBrainDocumentOutsideWorkspaceError(
      `REFUSED — ${JSON.stringify(opts.documentPath)} resolves to ${JSON.stringify(docAbs)}, OUTSIDE the workspace ` +
      `${JSON.stringify(workspace)}. A document reached through '..' or a link out of the workspace would be ` +
      'indexed under a doc_path that means nothing to whoever reads the header later. Nothing was written.',
      { documentPath: opts.documentPath, resolved: docAbs, workspace }
    ));
  }
  let stat;
  try {
    stat = fs.statSync(docAbs);
  } catch (err) {
    throw new ThirdBrainUsageError(`cannot read ${opts.documentPath} (${err.code || err.message}).`, { reason: 'document_unreadable' });
  }
  if (!stat.isFile()) {
    throw new ThirdBrainUsageError(`${opts.documentPath} is not a regular file.`, { reason: 'document_not_a_file' });
  }

  // ── 2. THE BUDGETS, before chunking and before any payload exists (D-8a, LIM-2 / LIM-3) ───────
  const maxBytes = Number.isFinite(opts.maxDocumentBytes) ? opts.maxDocumentBytes : MAX_DOCUMENT_BYTES;
  if (stat.size > maxBytes) {
    refuse(new ThirdBrainPayloadEscapeError(
      `REFUSED — ${opts.documentPath} is ${stat.size} bytes, over MAX_DOCUMENT_BYTES=${maxBytes}. ` +
      'The chunker is in-memory by design. Nothing was read, chunked or written.',
      { limit: 'MAX_DOCUMENT_BYTES', limitValue: maxBytes, actual: stat.size }
    ));
  }
  const maxAnchors = Number.isFinite(opts.maxAnchors) ? opts.maxAnchors : MAX_ANCHORS_PER_DOCUMENT;
  if (anchorIds.length > maxAnchors) {
    refuse(new ThirdBrainPayloadEscapeError(
      `REFUSED — ${anchorIds.length} --anchor ids supplied, over MAX_ANCHORS_PER_DOCUMENT=${maxAnchors}. ` +
      'Every id is written into the header line of EVERY passage; nothing was resolved or written.',
      { limit: 'MAX_ANCHORS_PER_DOCUMENT', limitValue: maxAnchors, actual: anchorIds.length }
    ));
  }

  const bytes = fs.readFileSync(docAbs);
  const docSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const docPathRel = path.relative(workspace, docAbs).split(path.sep).join('/');
  // A FILESYSTEM-SUPPLIED value gets the same boundary treatment as the typed flags above (QE F5):
  // a filename with a space is an ordinary input, not a programming defect, and the answer the
  // operator can act on is "rename the file", not a stack trace.
  if (/\s/.test(docPathRel)) {
    throw new ThirdBrainUsageError(
      `the document path ${JSON.stringify(docPathRel)} contains whitespace, which the one-line record ` +
      'header cannot carry unambiguously. Rename the file (and any directory on its path) to a ' +
      'whitespace-free name, then ingest again. Nothing was written.',
      { reason: 'document_path_has_whitespace' }
    );
  }
  logBase.doc_sha256 = docSha256;
  logBase.doc_path = docPathRel;

  let plan;
  try {
    // ── 3. anchors, fail-closed as a set ────────────────────────────────────────────────────────
    const resolvedAnchors = resolveAnchors(anchorIds, workspace);
    // ── 4. the records (pure) ───────────────────────────────────────────────────────────────────
    plan = buildRecords({
      text: bytes.toString('utf8'),
      docSha256,
      docPathRel,
      caseSlug: opts.case,
      kind: opts.kind,
      date: opts.date,
      anchorIds: resolvedAnchors.map((a) => a.entry_id),
      ts: started,
    });
    plan.resolvedAnchors = resolvedAnchors;
  } catch (err) {
    // Through the SAME helper, so the dry-run rule and the LOG shape have exactly one definition.
    if (isThirdBrainRefusal(err)) refuse(err);
    throw err;
  }

  const stats = lengthStats(plan.passages);
  const hard = plan.passages.filter((p) => p.hard === true).length;
  const summary = {
    doc_id: plan.docId,
    doc_sha256: docSha256,
    doc_path: docPathRel,
    case: opts.case,
    kind: opts.kind,
    date: opts.date,
    chunks: plan.m,
    hard,
    passage_lengths: stats,
    anchors: plan.resolvedAnchors.map((a) => ({ entry_id: a.entry_id, path: a.path, sha256: a.sha256 })),
  };

  // A DRY RUN TOUCHES NOTHING — no payload, no spawn, and no LOG line either. `intake-archive`'s own
  // --dry-run makes the same promise ("zero network, zero writes"), and a LOG append would break it
  // for the one flag an operator reaches for precisely because they are not ready to write.
  if (opts.dryRun === true) {
    return Object.freeze({ ok: true, mode: 'dry-run', ...summary, written: 0, skipped: 0, brain: path.join(workspace, HEALTH_BRAIN_DIRNAME) });
  }

  // ── 5. the payload, then the process ──────────────────────────────────────────────────────────
  // THE ONE CONTAINMENT QUESTION THIS LAYER OWNS: does the staging tree resolve INSIDE the
  // workspace? It is asked BEFORE any directory is created, because a `.health-brain` pointing into
  // ANOTHER project would otherwise get an `.ingest-tmp` directory — and then the patient's text —
  // planted in that project's tree, and only afterwards be refused by the bridge's own distinctness
  // check. Patient text must not leave the workspace even for the instant a downstream gate takes to
  // say no.
  //
  // IT IS DELIBERATELY *ONLY* THAT QUESTION. Whether the brain ALIASES the shared store is the
  // bridge's job — nine review rounds of realpath/canary/count hardening live there, and D-2 forbids
  // forking them. So a brain that resolves to the workspace itself passes HERE and is refused THERE,
  // by name (`third_brain_not_segregated`), which is the better answer for the operator.
  const brainRoot = realpathOrAbs(path.join(workspace, HEALTH_BRAIN_DIRNAME));
  const escapeIfOutside = (resolved, label) => {
    if (isInside(resolved, workspace)) return;
    const escape = new ThirdBrainPayloadEscapeError(
      `REFUSED — ${label} resolves to ${JSON.stringify(resolved)}, OUTSIDE the workspace ` +
      `${JSON.stringify(workspace)}. The batch carries patient text and never leaves the workspace, not even ` +
      'for the moment a later gate would take to refuse it. Nothing was created or written.',
      { limit: 'payload_containment', resolved, workspace }
    );
    refuse(escape, { doc_id: plan.docId, chunks: plan.m });
  };
  escapeIfOutside(brainRoot, `the health brain ${JSON.stringify(path.join(workspace, HEALTH_BRAIN_DIRNAME))}`);

  // THE ONE EXCEPTION to "aliasing is the bridge's job", and it exists for the same reason the
  // containment question above does (fix round 1, QE F1): `ln -s .dz .health-brain` resolves INSIDE
  // the workspace, so `escapeIfOutside` passes — and the `mkdirSync` below would then plant
  // `.ingest-tmp`, and the patient's payload, INSIDE the shared `.dz` store before the bridge's
  // distinctness check (which now refuses this shape too) ever runs. Patient text must not touch the
  // shared store even for the instant a downstream gate takes to say no. The bridge remains the
  // authority on every OTHER alias shape; this mirrors exactly the one whose staging would land in
  // the protected directory.
  const sharedStoreRoot = realpathOrAbs(path.join(workspace, '.dz'));
  if (isInside(brainRoot, sharedStoreRoot)) {
    refuse(new ThirdBrainNotSegregatedError(
      `REFUSED — the health brain ${JSON.stringify(path.join(workspace, HEALTH_BRAIN_DIRNAME))} resolves to ` +
      `${JSON.stringify(brainRoot)}, INSIDE the shared \`.dz\` store ${JSON.stringify(sharedStoreRoot)}. ` +
      'Records staged or filed there would land in the shared store on the FIRST ingest. Remove or rename ' +
      'the link, then ingest again. Nothing was created or written.',
      { resolved: brainRoot, sharedStore: sharedStoreRoot }
    ));
  }

  const tmpDir = path.join(workspace, ...BRAIN_TMP_DIR.split('/'));
  fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
  // The belt, for a staging directory that was ALREADY a link out even though the brain was not.
  // The payload name is joined onto the RESOLVED directory, never onto the lexical one.
  const realTmp = realpathOrAbs(tmpDir);
  escapeIfOutside(realTmp, `the payload staging directory ${JSON.stringify(path.join(workspace, BRAIN_TMP_DIR))}`);
  const payloadPath = path.join(realTmp, `${process.pid}-${crypto.randomBytes(6).toString('hex')}.json`);

  let verdict = null;
  let refusal = null;
  // THE CRITICAL SECTION, NAMED (fix round 1, QE F2): payload → bridge → verdict, which contains the
  // bridge's count→teach→count verification belt. It runs under the per-workspace ingest lock taken
  // below, so two overlapping ingests can no longer read each other's writes into their own belts —
  // the failure that made every participant refuse `third_brain_write_unverified` while every record
  // landed, leaving a LOG that contradicts the store it monitors.
  //
  // The body is a plain closure over this function's locals and deliberately keeps its ORIGINAL
  // indentation: several mutation-registry entries pin these lines byte-exactly, and re-indenting a
  // critical section to please the eye would silently detach its named protections.
  const runBridgeUnderLock = () => {
  try {
    fs.writeFileSync(payloadPath, JSON.stringify(plan.records), { mode: 0o600 });
    fs.chmodSync(payloadPath, 0o600);

    const timeout = Number.isFinite(opts.bridgeTimeoutMs) && opts.bridgeTimeoutMs >= 1
      ? opts.bridgeTimeoutMs : BRIDGE_TIMEOUT_MS;
    const child = spawnSync(
      'python3',
      [BRIDGE_SCRIPT, 'ingest-documents', '--payload', payloadPath, '--project', workspace, '--json'],
      {
        encoding: 'utf8',
        timeout,
        killSignal: 'SIGTERM',
        env: opts.env === undefined ? process.env : opts.env,
        maxBuffer: 64 * 1024 * 1024,
      },
    );

    if (child.error !== undefined && child.error !== null && child.error.code === 'ETIMEDOUT') {
      // BOUNDED BY CONSTRUCTION (LIM-1). The child is killed; the CLI does not wait it out and does
      // not claim the document was filed.
      refusal = new ThirdBrainWriteUnverifiedError(
        `REFUSED — the bridge did not finish within BRIDGE_TIMEOUT_MS=${timeout} and was killed (bridge timeout). ` +
        'Whether anything landed is unknown, so this tool does not say it did.',
        { detail: 'bridge timeout', timeoutMs: timeout }
      );
    } else if (child.error !== undefined && child.error !== null) {
      // ENOENT here means `python3` itself is unreachable. The refusal reason is the same one an
      // absent `dz` gets: a MECHANISM THE WRITE DEPENDS ON is not on this machine, and the operator
      // who ran `ingest` believes the document was filed either way (D-5, R-P4).
      refusal = new ThirdBrainDzUnavailableError(
        `REFUSED — the bridge could not be started (${child.error.code || child.error.message}): ` +
        `${BRIDGE_SCRIPT} needs \`python3\` on PATH. Nothing was written.`,
        { detail: 'python3 unavailable', bridge: BRIDGE_SCRIPT }
      );
    } else {
      const parsed = parseVerdict(child.stdout);
      if (parsed === null) {
        // PARSE, NEVER SYNTHESISE. Empty, non-JSON or sentinel output is NOT a clean run.
        refusal = new ThirdBrainWriteUnverifiedError(
          `REFUSED — the bridge exited ${child.status} without a parseable verdict, so this tool cannot say what ` +
          `happened. stdout: ${JSON.stringify(String(child.stdout || '').slice(0, 400))}; ` +
          `stderr: ${JSON.stringify(String(child.stderr || '').slice(0, 400))}`,
          { detail: 'unparseable verdict', exitStatus: child.status }
        );
      } else if (parsed.ok !== true) {
        refusal = refusalFromReason(parsed.reason, parsed.message, { bridge: true });
      } else {
        verdict = parsed;
      }
    }
  } finally {
    // ALWAYS. The payload is the one place patient text lands outside the store, and it must not
    // survive either outcome (SP-13).
    try { fs.unlinkSync(payloadPath); } catch { /* already gone is the desired state */ }
  }
  };

  try {
    // The lock scope lives INSIDE the brain (`<workspace>/.health-brain/.ingest-lock`) — a sibling
    // of `.ingest-tmp`, covered by the brain's own self-ignoring `.gitignore`, and DISTINCT from the
    // brain's `.dz` so this lock never contends with the store lock `dz teach` takes for its own
    // pattern store (the collision lock.js's docstring warns about, avoided by construction).
    await withCaseLock(path.join(workspace, HEALTH_BRAIN_DIRNAME), async () => runBridgeUnderLock(),
      { scopeDirname: BRAIN_LOCK_SCOPE });
  } catch (err) {
    // EVERY lock outcome an operator can cause is a NAMED refusal, never a stack trace (the enum
    // stays closed at seven — each condition maps onto the member whose meaning it already has).
    if (err instanceof CaseLockEscapeError) {
      // A symlinked lock scope is the same class of alias the segregation refusals are about.
      refusal = new ThirdBrainNotSegregatedError(
        `REFUSED — the ingest lock scope is redirected: ${err.message} Nothing was written.`,
        { detail: 'lock_scope_escape' }
      );
    } else if (err instanceof CaseLockUnavailableError) {
      // A mechanism the write depends on is not on this machine — dz's and python3's own posture.
      refusal = new ThirdBrainDzUnavailableError(
        `REFUSED — the workspace ingest lock cannot be taken (its mechanism is unavailable), and an ` +
        `UNSERIALISED ingest cannot verify its own write: ${err.message}`,
        { detail: 'ingest lock unavailable' }
      );
    } else if (err !== null && typeof err === 'object' && typeof err.name === 'string' && err.name.startsWith('StoreLock')) {
      // Timeout: another ingest holds this workspace — nothing of THIS ingest ran. Compromised: the
      // section ran and may have raced. Both are honestly "this tool cannot say the write landed".
      refusal = new ThirdBrainWriteUnverifiedError(
        `REFUSED — the per-workspace ingest lock reported ${err.name}: ${err.message} ` +
        'Another ingest of this workspace is (or was) running; this ingest wrote nothing it can vouch for. ' +
        'Re-run when it finishes.',
        { detail: err.name }
      );
    } else {
      throw err;
    }
  }

  if (refusal !== null) {
    refuse(refusal, { doc_id: plan.docId, chunks: plan.m, hard, passage_lengths: stats });
  }

  appendLog(workspace, {
    ...logBase,
    doc_id: plan.docId,
    chunks: plan.m,
    hard,
    passage_lengths: stats,
    outcome: 'written',
    reason: null,
    written: verdict.written,
    skipped: verdict.skipped,
  });

  return Object.freeze({
    ok: true,
    mode: 'ingest',
    ...summary,
    written: verdict.written,
    skipped: verdict.skipped,
    brain: verdict.brain,
    before: verdict.before,
    after: verdict.after,
  });
}

module.exports = {
  ingest,
  runDz,
  buildRecords,
  resolveAnchors,
  appendLog,
  parseVerdict,
  lengthStats,
  BRIDGE_SCRIPT,
  PACKAGE_ROOT,
  LOG_SCHEMA,
  RECORD_DOMAIN,
  RECORD_TYPE,
};

// A guard against the one refactor that would silently break the cwd-independence property: if the
// bridge is not where __dirname says it is, say so at REQUIRE time rather than at spawn time, when
// the message would be buried inside a child process's stderr.
if (!fs.existsSync(BRIDGE_SCRIPT)) {
  // Not a throw: a consumer running `ha third-brain search` has no business failing because the
  // WRITE leg's dependency moved. The write leg itself refuses loudly (python3/bridge unavailable).
  process.emitWarning(
    `ha third-brain: the learning bridge is not at ${BRIDGE_SCRIPT} — ingest will refuse until it is.`,
    'ThirdBrainBridgeMissing',
  );
}
