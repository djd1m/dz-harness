'use strict';

// run.js — the IntakeRun orchestrator. It owns the ORDER, and the order IS the safety property.
//
//   input validation  →  [URL only] transport  →  digest  →  zip (plan)  →  extract (stage+commit)
//                     →  manifest (merge + write + log)  →  legacy-layout warning  →  git warning
//
// EVERY REFUSAL THAT CAN BE DECIDED WITHOUT TOUCHING THE WORLD IS DECIDED FIRST. A URL source with no
// `--expect-sha256` is refused HERE, at input validation, before a socket exists — which is why the
// transport is reached through an INJECTED PORT rather than a direct import binding: "zero network
// calls on refusal" is then provable with a spy instead of inferred from reading the code (INV-3).
//
// A FAILED INTAKE IS A NO-OP, AND "NO-OP" HAS AN EXACT DEFINITION HERE: `sources/` is byte-identical
// afterwards EXCEPT for exactly one appended `LOG.jsonl` line recording the refusal. The log line is
// not an exception to the property, it is the property's audit trail — a refusal that leaves no trace
// cannot be investigated. Pre-lock refusals (a bad flag, a refused workspace, a URL with no digest)
// write NOTHING at all, because at that point this code has not yet been given permission to write
// into the workspace it was pointed at.
//
// `--dry-run` IS INERT (P2b). It runs the whole input-validation phase — flags, workspace refusal,
// `--limits` schema, the URL⇒digest rule, the URL's scheme/credential/SSRF policy — then prints the
// plan and exits 0. NO network call. NO write of any kind: no staging directory, no LOG line, no
// manifest touch, and not even the lock (taking the lock would create `sources/.intake/.dz/`).
// An INVALID input under `--dry-run` still exits 1 or 2 exactly as a real run would, because a dry run
// that accepts what a real run refuses is worse than no dry run.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const layout = require('../../../lib/workspace-layout.js');
const { resolveLimits } = require('./limits.js');
const digest = require('./digest.js');
const zip = require('./zip.js');
const extract = require('./extract.js');
const manifest = require('./manifest.js');
const transport = require('./transport.js');
const { verifyWorkspace } = require('./verify.js');
const {
  IntakeUsageError,
  ExpectedDigestRequiredError,
  WorkspaceRefusedError,
  DigestMismatchError,
  RawZoneDriftError,
  LimitExceededError,
  isIntakeRefusal,
} = require('./errors.js');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..');

function nullIo() {
  return { log: () => {}, warn: () => {} };
}

// ── input validation ─────────────────────────────────────────────────────────────────────────────

/**
 * THE PRIVACY FENCE (NFR-1). The workspace must be a real directory, and it must NOT be inside the
 * health-advisor package tree. Compared on REALPATH, not on the spelling: a symlinked workspace
 * pointing into the package is the input a lexical `startsWith` accepts.
 *
 * Why refuse at all: the package tree is what gets published. A patient's documents landing inside it
 * is one `npm publish` away from being a permanent public record, and that is not a mistake a warning
 * is proportionate to.
 */
function resolveWorkspace(workspaceArg) {
  if (typeof workspaceArg !== 'string' || workspaceArg.trim() === '') {
    throw new IntakeUsageError('intake-archive requires --workspace <dir> (the patient workspace to ingest into).', { reason: 'workspace_missing' });
  }
  const abs = path.resolve(workspaceArg);
  let real;
  try {
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) {
      throw new WorkspaceRefusedError(
        `--workspace ${abs} is not a directory. Nothing was read, dialled or written.`,
        { reason: 'not_a_directory', workspace: abs }
      );
    }
    real = fs.realpathSync(abs);
  } catch (err) {
    if (err instanceof WorkspaceRefusedError) throw err;
    throw new WorkspaceRefusedError(
      `--workspace ${abs} cannot be used (${err.code || err.message}). Create the directory first; intake ` +
      'does not mint a patient workspace as a side effect of an ingest.',
      { reason: 'workspace_unusable', workspace: abs }
    );
  }
  const realPackage = fs.realpathSync(PACKAGE_ROOT);
  if (real === realPackage || real.startsWith(`${realPackage}${path.sep}`)) {
    throw new WorkspaceRefusedError(
      `--workspace ${real} is inside the health-advisor package tree (${realPackage}). Patient documents ` +
      'never land in the package: the package is what gets published, and a published patient file is not ' +
      'a mistake a warning is proportionate to. Point --workspace at the patient folder instead.',
      { reason: 'inside_package_tree', workspace: real }
    );
  }
  return real;
}

/**
 * gitTrackedWarning(workspace) -> string | null (AM-5)
 *
 * WARN, NOT BLOCK, AND NON-SUPPRESSIBLE — matching this package's existing banner posture. Blocking
 * would be wrong: a git-tracked workspace is a legitimate choice for a user who has arranged their own
 * `.gitignore`, and refusing it would push people to work outside the tool. Staying silent would be
 * worse: `git add -A` after an ingest is how a patient's lab reports reach a remote.
 *
 * PURE fs — the git state is read by looking for `.git` and reading `.gitignore` text. `child_process`
 * is forbidden ANYWHERE on this surface (egress-scan.js's deny set), so shelling out to `git
 * check-ignore` is not available, and that is the right trade: a shell-out here would be a second
 * process spawn on the patient-data path.
 *
 * HONEST LIMIT, stated: this understands the common `sources/`-shaped ignore lines, not git's full
 * pattern algebra with negations and nested ignore files. It errs toward WARNING — a false warning
 * costs a line of output; a false silence costs a publication.
 */
function gitTrackedWarning(workspace) {
  let dir = workspace;
  let gitRoot = null;
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) { gitRoot = dir; break; }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (gitRoot === null) return null;

  const relSources = path.relative(gitRoot, path.join(workspace, 'sources')).split(path.sep).join('/');
  const candidates = [];
  for (const file of [path.join(gitRoot, '.gitignore'), path.join(workspace, '.gitignore')]) {
    try { candidates.push(fs.readFileSync(file, 'utf8')); } catch { /* absent is the common case */ }
  }
  const patterns = candidates
    .join('\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
  const covered = patterns.some((p) => {
    const norm = p.replace(/^\//, '').replace(/\/$/, '');
    return norm === '*' || norm === 'sources' || norm === relSources || relSources.startsWith(`${norm}/`);
  });
  if (covered) return null;

  const tag = layout.GIT_TRACKED_WARNING_TAG;
  return [
    `${tag} ${workspace} is inside the git repository at ${gitRoot}, and no .gitignore line covers`,
    `${tag} ${relSources || 'sources'}. Ingested documents are PATIENT DATA — a later \`git add -A\``,
    `${tag} would commit them, and a push would publish them. Add "${relSources || 'sources'}/" to`,
    `${tag} .gitignore. This warning cannot be suppressed and the intake was NOT blocked.`,
  ].join('\n');
}

// ── the run ──────────────────────────────────────────────────────────────────────────────────────

/**
 * runIntake(options) -> Promise<result>
 *
 * options
 *   url | file        exactly one source (a URL to fetch, or a path already on this machine)
 *   expectSha256      MANDATORY for a URL source; optional for a local file
 *   workspace         the patient workspace (required)
 *   allowHost         string[] — hosts a cross-host redirect may reach (P2c)
 *   limitsFile        the ONE limits knob (P1-3)
 *   dryRun            validate + print the plan, touch nothing (P2b)
 *   verify            run --verify instead of an intake (INV-13)
 *   transportPort     INJECTED { download } — the seam that makes "zero network calls" provable
 *   io                { log, warn }
 *   now               () => Date — injected so `ingested_at` is deterministic under test
 *   beforeCommit      the extract kill-point seam (no-partial-corpus test)
 */
async function runIntake(options = {}) {
  const io = options.io || nullIo();
  const now = options.now || (() => new Date());
  const port = options.transportPort || transport;

  // 1 ── WORKSPACE FIRST. Nothing else is even parsed against a workspace we have refused.
  const workspace = resolveWorkspace(options.workspace);
  const sourcesDir = path.join(workspace, 'sources');

  // 2 ── --verify is a different verb sharing one entry point. It reads; it never writes.
  if (options.verify === true) {
    const result = verifyWorkspace(workspace);
    return { mode: 'verify', workspace, ...result };
  }

  // 3 ── exactly one source
  const hasUrl = typeof options.url === 'string' && options.url !== '';
  const hasFile = typeof options.file === 'string' && options.file !== '';
  if (hasUrl === hasFile) {
    throw new IntakeUsageError(
      'intake-archive takes exactly one source: --url <https://…> or --file <path>' +
      (hasUrl ? ' — not both.' : ' — one is required.'),
      { reason: hasUrl ? 'two_sources' : 'no_source' }
    );
  }

  // 4 ── limits: registry + the one override knob, fully validated BEFORE anything happens
  const limits = resolveLimits({ limitsFile: options.limitsFile || null });

  // 5 ── THE URL⇒DIGEST RULE, and it fires HERE (INV-3). digest.js cannot enforce this: it cannot
  //      observe whether a socket was opened, which is exactly what the property is about (P2d).
  const expected = digest.normaliseDigest(options.expectSha256);
  if (hasUrl && expected === null) {
    throw new ExpectedDigestRequiredError(
      'a URL source REQUIRES --expect-sha256 <64 hex>, supplied independently of the archive. Without it the ' +
      'only thing verifiable is that the bytes are the bytes the server chose to send — which is not integrity, ' +
      'it is trust in the network. No request was made.' +
      (options.expectSha256 ? ` (got ${JSON.stringify(String(options.expectSha256).slice(0, 80))})` : ''),
      { reason: options.expectSha256 ? 'malformed' : 'absent' }
    );
  }
  if (hasFile && options.expectSha256 !== undefined && options.expectSha256 !== null && options.expectSha256 !== '' && expected === null) {
    throw new IntakeUsageError(
      `--expect-sha256 must be 64 hex characters (optionally sha256:-prefixed), got ` +
      `${JSON.stringify(String(options.expectSha256).slice(0, 80))}.`,
      { reason: 'malformed_digest' }
    );
  }

  const allowHosts = Array.isArray(options.allowHost) ? options.allowHost : (options.allowHost ? [options.allowHost] : []);

  // 6 ── the URL's own policy — scheme, credentials, lexical SSRF — decided before any socket, so a
  //      --dry-run refuses exactly what a real run refuses.
  if (hasUrl) transport.assertUrlAcceptable(options.url, { allowHosts });

  let localFileHash = null;
  if (hasFile) {
    const abs = path.resolve(options.file);
    let stat;
    try { stat = fs.statSync(abs); } catch (err) {
      throw new IntakeUsageError(`--file ${abs}: cannot read (${err.code || err.message}).`, { reason: 'file_unreadable' });
    }
    if (!stat.isFile()) throw new IntakeUsageError(`--file ${abs} is not a regular file.`, { reason: 'file_not_regular' });
    // AM-10 — THE LOCAL LEG IS BOUNDED BY THE SAME CAP AS THE DOWNLOADED ONE, AND THE stat() FIRES
    // BEFORE ANY READ. `max_download_bytes` exists because zip.js parses the blob from ONE in-memory
    // buffer (P1-2) — a consequence of archive SIZE, not of which wire the archive arrived on. Checking
    // the stat here means an oversized clinic export is refused by NAME before a single byte is hashed,
    // copied or buffered — not crashed on at `readFileSync` past Node's 2 GiB ceiling (the unnamed
    // RangeError the QE report's F3 measured).
    if (stat.size > limits.max_download_bytes) {
      throw new LimitExceededError(
        `--file ${abs} is ${stat.size} bytes, over max_download_bytes=${limits.max_download_bytes}. The cap ` +
        'applies to LOCAL archives too: the zip reader buffers the whole blob in memory by design (P1-2), so ' +
        'the bound is about archive size, not about the network. Raise it (to at most 2 GiB) with a --limits ' +
        'file, or re-pack the archive smaller. Nothing was read, hashed or written.',
        { reason: 'max_download_bytes', limit: 'max_download_bytes', actual: stat.size, cap: limits.max_download_bytes }
      );
    }
    // The local file's digest is STREAMED once, here, and reused as the archive identity and (when the
    // caller supplied none) as `expectedDigest`. `digest_source` in the catalog records WHICH of those
    // two it was, so a reader can always tell an independently-vouched archive from a self-hashed one.
    localFileHash = digest.hashFile(abs).sha256hex;
  }

  // THE ARCHIVE IDENTITY IS WHAT THE CALLER VOUCHED FOR, when they vouched for anything (AM-4).
  // Using the file's ACTUAL hash as the identity whenever one was supplied would make a WRONG
  // `--expect-sha256` land the archive at its own true address and report success — the caller's claim
  // would have been collected and ignored. So the destination is addressed by `expected`, the
  // verification compares `expected` against the real bytes, and a disagreement is a refusal.
  const expectedDigest = expected !== null ? expected : localFileHash;
  const archiveId = expectedDigest;
  const destination = manifest.destinationFor(sourcesDir, archiveId);
  const sourceDescriptor = hasUrl
    ? {
      kind: 'url',
      url_redacted: transport.redactUrl(options.url),
      url_sha256: transport.urlSha256(options.url),
      local_path: null,
      digest_source: 'caller',
    }
    : {
      kind: 'local-file',
      url_redacted: null,
      url_sha256: null,
      // The local path is recorded as a BASENAME only: the absolute path of a patient's download folder
      // is itself identifying information, and the catalog does not need it to be useful.
      local_path: path.basename(path.resolve(options.file)),
      digest_source: expected !== null ? 'caller' : 'local-stream',
    };

  // 7 ── --dry-run: print and stop. Zero network, zero writes, not even the lock.
  if (options.dryRun === true) {
    const plan = {
      mode: 'dry-run',
      workspace,
      source: sourceDescriptor,
      expectedSha256: archiveId,
      destination: path.relative(workspace, destination).split(path.sep).join('/'),
      limits,
      allowHosts,
    };
    // The plan is RETURNED, not printed here: cli.js owns rendering, so `--json` emits one JSON document on
    // stdout rather than a human report followed by a JSON one (which is unparseable, and was MEASURED as such).
    return { mode: 'dry-run', ok: true, ...plan };
  }

  // 8 ── everything from here is inside the .intake lock: destination inspection, download, staging,
  //      the commit rename, the catalog cycle and the log append are ONE critical section (P2a).
  const result = await manifest.withIntakeLock(sourcesDir, async () => {
    const ingestedAt = now().toISOString();

    // 8a′ ── A LOCAL FILE WHOSE BYTES CONTRADICT THE CALLER'S CLAIM IS REFUSED BEFORE THE
    //        SHORT-CIRCUIT (AM-4). Its hash is already known (streamed once at validation time), so
    //        this costs nothing — and skipping it would let a wrong `--expect-sha256` that happens to
    //        name an already-ingested archive short-circuit to "success" for a file that is not it.
    if (hasFile && expected !== null && expected !== localFileHash) {
      const err = new DigestMismatchError(
        `digest mismatch for ${path.resolve(options.file)}: expected ${expected}, actual ${localFileHash}. ` +
        'The archive was NOT parsed and NOTHING was extracted.',
        { reason: 'sha256_mismatch', expected, actual: localFileHash, blobPath: path.resolve(options.file) }
      );
      logRefusal(sourcesDir, err, ingestedAt, sourceDescriptor, archiveId);
      throw err;
    }

    // 8a ── THE PRE-STAGING SHORT-CIRCUIT (P1-5). Content-addressed destination + a catalog that
    //       vouches for it ⇒ this exact archive is already here. No download, no staging, no rename.
    const existing = manifest.inspectDestination(sourcesDir, archiveId);
    if (existing.state === 'complete') {
      manifest.appendLog(sourcesDir, {
        event: 'already-ingested',
        at: ingestedAt,
        archive_id: `sha256:${archiveId}`,
        source: sourceDescriptor,
        entries: existing.rows.length,
      });
      return {
        mode: 'intake',
        ok: true,
        idempotent: true,
        archiveId,
        destination,
        added: [],
        skipped: existing.rows.map((r) => ({ path: r.path, sha256: r.sha256, entry_id: r.entry_id })),
        source: sourceDescriptor,
        downloadedBytes: 0,
      };
    }
    if (existing.state === 'drift') {
      const err = new RawZoneDriftError(
        `${existing.destination} already exists but the catalog cannot vouch for it (${existing.detail}). ` +
        'Run `intake-archive --verify --workspace ' + workspace + '` to see exactly which paths disagree. ' +
        'NOTHING was downloaded, staged or written.',
        { reason: 'destination_drift', destination: existing.destination, offending: existing.missing }
      );
      logRefusal(sourcesDir, err, ingestedAt, sourceDescriptor, archiveId);
      throw err;
    }

    const tmpDir = path.join(workspace, ...layout.INTAKE_TMP.split('/'));
    const stagingRoot = path.join(
      workspace,
      ...layout.INTAKE_STAGING.split('/'),
      crypto.randomBytes(8).toString('hex')
    );
    let blobPath = null;
    let ownsBlob = false;
    let downloadedBytes = 0;

    try {
      // 8b ── transport (URL only). A local-path source skips this stage ENTIRELY — no socket is even
      //       constructed, which is the whole point of offering --file.
      if (hasUrl) {
        const receipt = await port.download({
          url: options.url,
          destPath: path.join(tmpDir, `${crypto.randomBytes(8).toString('hex')}.blob`),
          limits,
          allowHosts,
          requestImpl: options.requestImpl,
        });
        blobPath = receipt.blobPath;
        ownsBlob = true;
        downloadedBytes = receipt.bytes;
      } else {
        // AM-11 — THE FILE LEG IS SNAPSHOTTED INTO THE PRIVATE .intake-tmp BEFORE verify() (INV-2's
        // fix at the harm point). A receipt whose `blobPath` is the CALLER'S LIVE PATH is
        // verify-then-REREAD, not verify-before-parse: between the hash and zip.js's re-read the
        // caller (or anything else holding that path) can swap the bytes, and the receipt then
        // vouches for bytes that were never parsed — the QE report's F1 reproducer did exactly that.
        // So the local file is copied ONCE into the same run-owned staging area the URL leg uses
        // (`sources/.intake-tmp/<rand>.blob`, 0600, removed in the finally below), and BOTH the
        // digest and the parse read only that copy. Nothing re-reads the caller's path after this
        // line; a swap of the original after the copy can no longer reach the corpus, and a swap
        // before it is caught by verify() as a digest mismatch on the staged bytes.
        const abs = path.resolve(options.file);
        const staged = path.join(tmpDir, `${crypto.randomBytes(8).toString('hex')}.blob`);
        blobPath = staged;
        ownsBlob = true;
        try {
          fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
          fs.copyFileSync(abs, staged);
          fs.chmodSync(staged, 0o600);
        } catch (err) {
          throw new IntakeUsageError(
            `--file ${abs}: cannot snapshot into the intake staging area (${err.code || err.message}). ` +
            'Nothing was parsed or written to the corpus.',
            { reason: 'file_unreadable' }
          );
        }
        // BELT for the AM-10 bound: the size was checked on the caller's path at validation time, but
        // that path is live — a swap between the stat and this copy could smuggle an oversized blob
        // past the pre-read check. The STAGED bytes are what will be buffered, so they are what the
        // cap must hold for.
        const stagedSize = fs.statSync(staged).size;
        if (stagedSize > limits.max_download_bytes) {
          throw new LimitExceededError(
            `--file ${abs} grew to ${stagedSize} bytes between validation and staging, over ` +
            `max_download_bytes=${limits.max_download_bytes}. Nothing was parsed.`,
            { reason: 'max_download_bytes', limit: 'max_download_bytes', actual: stagedSize, cap: limits.max_download_bytes }
          );
        }
      }

      // 8c ── digest, then parse. In this order, always, and the order is a TYPE (INV-2).
      const verified = digest.verify(blobPath, expectedDigest);
      const plan = zip.readArchive(verified, limits);

      // 8d ── stage, then ONE rename (INV-1)
      const applied = extract.applyPlan(plan, {
        receipt: verified,
        stagingRoot,
        destination,
        limits,
        inspectExisting: (dest) => manifest.inspectDestination(sourcesDir, path.basename(dest).replace(/^sha256-/, '')).state,
        beforeCommit: options.beforeCommit || null,
      });

      // 8e ── the catalog cycle, inside the same lock as the commit above
      const catalog = manifest.loadCatalog(sourcesDir);
      const merged = manifest.mergeEntries(catalog, applied.files, {
        archiveId: applied.archiveId,
        ingestedAt,
        source: sourceDescriptor,
      });
      if (merged.conflicts.length > 0) {
        // NOTHING IS WRITTEN, and that includes UNDOING the commit we just made: the rename landed
        // before the conflict was knowable, so the destination is removed again. A committed raw-zone
        // directory with no catalog row is exactly the drift `--verify` exists to flag, and leaving one
        // behind while reporting a refusal would make this command the source of its own drift.
        fs.rmSync(destination, { recursive: true, force: true });
        const err = manifest.conflictError(merged.conflicts, manifest.manifestPath(sourcesDir));
        logRefusal(sourcesDir, err, ingestedAt, sourceDescriptor, archiveId);
        throw err;
      }
      manifest.writeCatalogAtomically(sourcesDir, merged.catalog);
      manifest.appendLog(sourcesDir, {
        event: applied.idempotent ? 'already-ingested' : 'ingested',
        at: ingestedAt,
        archive_id: `sha256:${applied.archiveId}`,
        source: sourceDescriptor,
        entries: applied.files.length,
        added: merged.added.length,
        skipped: merged.skipped.length,
      });

      return {
        mode: 'intake',
        ok: true,
        idempotent: applied.idempotent,
        archiveId: applied.archiveId,
        destination,
        added: merged.added,
        skipped: merged.skipped,
        source: sourceDescriptor,
        downloadedBytes,
      };
    } catch (err) {
      // ONE appended LOG line per refusal — the audit trail of the no-op. Only for refusals reached
      // INSIDE the lock: at this point the workspace has been accepted and this run owns its scope.
      if (isIntakeRefusal(err) && !err.__logged) {
        logRefusal(sourcesDir, err, ingestedAt, sourceDescriptor, archiveId);
      }
      throw err;
    } finally {
      // The blob in .intake-tmp is OURS to remove — a temp blob is never part of the corpus. That is
      // now true for BOTH legs (the URL leg's download and the file leg's AM-11 snapshot). The
      // caller's original `--file` is never touched — and after the snapshot, never read either.
      if (ownsBlob && blobPath !== null) {
        try { fs.rmSync(blobPath, { force: true }); } catch { /* best effort, NFR-6 */ }
      }
    }
  });

  // 9 ── the two warnings, AFTER the write, so they never sit between a decision and its effect
  const legacy = layout.detectLegacyLayout(workspace);
  const warnings = [];
  if (legacy.present) warnings.push(layout.renderLegacyWarning(legacy));
  const gitWarning = gitTrackedWarning(workspace);
  if (gitWarning !== null) warnings.push(gitWarning);
  for (const w of warnings) io.warn(w);

  return { ...result, warnings, legacy };
}

function logRefusal(sourcesDir, err, at, source, archiveId) {
  try {
    manifest.appendLog(sourcesDir, {
      event: `refused:${err.reason || err.code}`,
      at,
      archive_id: archiveId ? `sha256:${archiveId}` : null,
      source,
      error: { name: err.name, code: err.code, phase: err.phase, reason: err.reason },
    });
    Object.defineProperty(err, '__logged', { value: true, enumerable: false });
  } catch {
    // A log that cannot be written must not replace the refusal the operator needs to see.
  }
}

function renderDryRun(plan) {
  const lines = [];
  lines.push('intake-archive --dry-run — NOTHING was downloaded and NOTHING was written.');
  lines.push(`  workspace:    ${plan.workspace}`);
  lines.push(`  source:       ${plan.source.kind === 'url' ? plan.source.url_redacted : plan.source.local_path}`);
  if (plan.source.kind === 'url') lines.push(`  url_sha256:   ${plan.source.url_sha256}`);
  lines.push(`  expect sha256:${plan.expectedSha256}  (digest_source: ${plan.source.digest_source})`);
  lines.push(`  destination:  ${plan.destination}`);
  if (plan.allowHosts.length > 0) lines.push(`  allow-host:   ${plan.allowHosts.join(', ')}`);
  lines.push('  effective limits:');
  for (const [k, v] of Object.entries(plan.limits)) lines.push(`    ${k} = ${v}`);
  return lines.join('\n');
}

module.exports = { runIntake, resolveWorkspace, gitTrackedWarning, renderDryRun, PACKAGE_ROOT };
