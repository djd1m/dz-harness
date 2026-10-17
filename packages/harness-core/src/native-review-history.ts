/** Native QE is surviving local evidence, not reviewer authentication or an atomic repo snapshot. */
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, opendirSync, realpathSync, renameSync, writeSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { withDirLockSync } from './named-lock.js';
import { validateNativePostCiEvidence, nativePostCiIdentityRegistry } from './native-post-ci-evidence.js';

export const NATIVE_QE_HISTORY_API_VERSION = 1;
export const NATIVE_QE_CONTINUATION_API_VERSION = 1;
export const NATIVE_QE_POST_CI_CORRECTION_API_VERSION = 2;
const ceiling = 3;
const sha = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 65536;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const shape = (v: unknown, keys: string[]): boolean => record(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const fail = (reason: string): never => { throw Error(reason); };
function present(path: string): boolean { try { lstatSync(path); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; } }

type Artifact = { path: string; digest: string | null };
type Snapshot = { nonce: string; revision: string; manifest: Artifact[] };
type Origin = { reviewer: string; family: string };
type Proposal = { host: unknown; snapshot: Snapshot; origins: Origin[]; receiptDigest: string | null; reason: string | null; observationDigest: string; result: Record<string, unknown>; admission: boolean; ownerApproval?: unknown; correctionEvidence?: { evidencePath: string; evidence: any } };
type Identity = { journalId: string; projectRoot: string; featurePath: string; ceiling: number };
type Host = { schema: string; phase: string; reviewers: { id: string; family: string }[]; snapshot: Snapshot; conditions: unknown[]; reviewSeen: boolean; rework: boolean; changedPaths: string[] };
type Approval = { schema: string; approvalId: string; owner: string; decision: string; evidenceSource: string; projectRoot: string; featurePath: string; journalId: string; sequence: number; eventDigest: string; cycleId: string; revision: string; targetRevision: string };
type Correction = { approval: Approval & { evidenceDigest: string }; evidencePath: string; evidence: any; predecessorHost: Host };
type Event = Identity & { postCiCorrection?: Correction; continuation?: { approval: Approval; predecessorHost: Host }; schema: string; sequence: number; eventId: string; cycleId: string; previousDigest: string | null; kind: string; timestamp: string; nonce: string; revision: string; snapshot: Snapshot; hostProjectionDigest: string; origins: Origin[]; receiptDigest: string | null; reason: string | null; observationDigest: string; result: Record<string, unknown> };
type Head = Identity & { schema: string; sequence: number; eventDigest: string; activeCycle: string; hostProjectionDigest: string };
type State = { head: Head; events: Event[]; active: Event; witnessed: boolean; rounds: number; host: Host; continuation: Event | undefined; correction: Event | undefined; anchor: Event | undefined; closed: Set<string> };
type Fault = (cut: string) => void;

function snapshotValid(v: unknown): v is Snapshot {
  if (!shape(v, ['nonce', 'revision', 'manifest']) || !record(v) || !text(v.nonce) || !hash(v.revision) || !Array.isArray(v.manifest) || v.manifest.length > 256) return false;
  const paths = new Set<string>();
  for (const p of v.manifest) {
    if (!shape(p, ['path', 'digest']) || !record(p) || !text(p.path) || p.path.startsWith('/') || /[\\\x00-\x1f]/.test(p.path) || p.path.split('/').some(s => !s || s === '.' || s === '..') || paths.has(p.path) || !(p.digest === null || hash(p.digest))) return false;
    paths.add(p.path);
  }
  return sha(JSON.stringify(v.manifest)) === v.revision;
}

function resultValid(v: unknown, snapshot: Snapshot): boolean {
  const required = ['schema', 'phase', 'verdict', 'revision', 'unresolved', 'reasons'];
  const allowed = required.concat(['nonce', 'manifest', 'reviewers', 'conditions', 'checkpointDigest', 'checkpointClosure', 'postCiEvidenceClosure']);
  if (!record(v) || !required.every(k => Object.hasOwn(v, k)) || Object.keys(v).some(k => !allowed.includes(k)) || v.schema !== 'fa-review-convergence-1' || v.phase !== 'qe' || !['prepared', 'closed', 'unresolved', 'not-established'].includes(String(v.verdict)) || v.revision !== snapshot.revision) return false;
  if (![v.unresolved, v.reasons].every(a => Array.isArray(a) && a.length <= 512 && a.every(text))) return false;
  if (v.verdict === 'prepared') return Object.keys(v).length === required.length + 5 && v.nonce === snapshot.nonce && same(v.manifest, snapshot.manifest) && Array.isArray(v.reviewers) && v.reviewers.length > 0 && v.reviewers.length <= 16 && v.reviewers.every(r => shape(r, ['id', 'family']) && text(r.id) && ['codex', 'claude', 'owner-exception'].includes(r.family)) && new Set(v.reviewers.map(r => r.id)).size === v.reviewers.length && Array.isArray(v.conditions) && v.conditions.length <= 512 && (v.checkpointDigest === null || hash(v.checkpointDigest));
  const extra = Object.hasOwn(v, 'postCiEvidenceClosure') ? 1 : 0;
  if (extra && v.verdict !== 'closed') return false;
  if (Object.hasOwn(v, 'checkpointClosure')) { const c = v.checkpointClosure; return v.verdict === 'closed' && Object.keys(v).length === required.length + 1 + extra && shape(c, ['checkpointDigest', 'checkpoint', 'revision']) && record(c) && hash(c.checkpointDigest) && record(c.checkpoint) && c.revision === snapshot.revision; }
  return Object.keys(v).length === required.length + extra;
}
function hostValid(v: unknown, snapshot: Snapshot): boolean {
  return shape(v, ['schema', 'phase', 'reviewers', 'snapshot', 'conditions', 'reviewSeen', 'rework', 'changedPaths']) && record(v) && v.schema === 'fa-review-convergence-1' && v.phase === 'qe' && same(v.snapshot, snapshot) && Array.isArray(v.reviewers) && v.reviewers.length > 0 && v.reviewers.length <= 16 && v.reviewers.every(r => shape(r, ['id', 'family']) && text(r.id) && ['codex', 'claude', 'owner-exception'].includes(r.family)) && new Set(v.reviewers.map(r => r.id)).size === v.reviewers.length && Array.isArray(v.conditions) && v.conditions.length <= 512 && typeof v.reviewSeen === 'boolean' && typeof v.rework === 'boolean' && Array.isArray(v.changedPaths) && v.changedPaths.length <= 256 && v.changedPaths.every(text);
}

const hostBytes = (host: unknown): Buffer => Buffer.from(JSON.stringify(host, null, 2) + '\n');
function approvalValid(value: unknown, post = false): value is Approval {
  return shape(value, ['schema', 'approvalId', 'owner', 'decision', 'evidenceSource', 'projectRoot', 'featurePath', 'journalId', 'sequence', 'eventDigest', 'cycleId', 'revision', 'targetRevision'].concat(post ? ['evidenceDigest'] : [])) && record(value) && Buffer.byteLength(JSON.stringify(value)) <= 16 * 1024 && value.schema === (post ? 'native-qe-post-ci-owner-approval-1' : 'native-qe-owner-approval-1') && (!post || hash(value.evidenceDigest)) && uuid(value.approvalId) && [['owner', 256], ['decision', 2048], ['evidenceSource', 4096]].every(([key, limit]) => text(value[String(key)]) && (value[String(key)] as string).trim().length > 0 && (value[String(key)] as string).length <= Number(limit)) && text(value.projectRoot) && text(value.featurePath) && uuid(value.journalId) && Number.isInteger(value.sequence) && Number(value.sequence) > 0 && hash(value.eventDigest) && uuid(value.cycleId) && hash(value.revision) && hash(value.targetRevision) && value.revision !== value.targetRevision;
}
function approvalBound(a: Approval, previous: Event, previousDigest: string, target: Snapshot): boolean {
  return a.projectRoot === previous.projectRoot && a.featurePath === previous.featurePath && a.journalId === previous.journalId && a.sequence === previous.sequence && a.eventDigest === previousDigest && a.cycleId === previous.cycleId && a.revision === previous.revision && a.targetRevision === target.revision;
}
function continuedHost(prior: Host, snapshot: Snapshot): Host {
  const old = new Map(prior.snapshot.manifest.map(p => [p.path, p.digest])), next = new Map(snapshot.manifest.map(p => [p.path, p.digest]));
  const delta = [...new Set([...old.keys(), ...next.keys()])].filter(p => old.get(p) !== next.get(p));
  return { ...prior, snapshot, reviewSeen: true, rework: true, changedPaths: [...new Set([...prior.changedPaths, ...delta])].sort() };
}
function preservedHost(prior: Host, next: Host): boolean {
  return same(prior.reviewers, next.reviewers) && prior.conditions.every(c => next.conditions.some(n => same(c, n))) && (!prior.reviewSeen || next.reviewSeen) && (!prior.rework || next.rework);
}

function checkpointProtected(result: Record<string, unknown>, required: unknown): boolean {
  if (result.verdict === 'prepared') return result.checkpointDigest === required;
  if (result.verdict !== 'closed' || required === null) return true;
  const closure = result.checkpointClosure;
  return record(closure) && closure.checkpointDigest === required && record(closure.checkpoint) && sha(JSON.stringify(closure.checkpoint)) === required;
}

const eventDigest = (e: Event) => sha(JSON.stringify(e));
function correctionClosure(result: Record<string, unknown>, snapshot: Snapshot, admission: Event, anchor: Event, roster: Host['reviewers'], origins: Origin[]): boolean {
  if (result.verdict !== 'closed') return !Object.hasOwn(result, 'postCiEvidenceClosure');
  const c = result.postCiEvidenceClosure as any;
  const digest = admission.postCiCorrection!.approval.evidenceDigest;
  if (!shape(c, ['evidenceDigest', 'revision', 'nonce', 'anchorSequence', 'anchorEventDigest', 'origins']) || c.evidenceDigest !== digest || c.revision !== snapshot.revision || c.nonce !== snapshot.nonce || c.anchorSequence !== anchor.sequence || c.anchorEventDigest !== eventDigest(anchor) || !Array.isArray(c.origins) || !same(origins, roster.map(r => ({ reviewer: r.id, family: r.family }))) || c.origins.length !== roster.length) return false;
  return c.origins.every((o: any, i: number) => {
    const v = o.verification;
    return shape(o, ['reviewer', 'family', 'verification']) && o.reviewer === roster[i]!.id && o.family === roster[i]!.family && shape(v, ['schema', 'evidenceDigest', 'revision', 'nonce', 'anchorSequence', 'anchorEventDigest', 'supported', 'evidence']) && v.schema === 'native-qe-post-ci-verification-1' && v.evidenceDigest === digest && v.revision === snapshot.revision && v.nonce === snapshot.nonce && v.anchorSequence === anchor.sequence && v.anchorEventDigest === eventDigest(anchor) && v.supported === true && text(v.evidence);
  });
}

// Bounded descriptor reads also reject FIFOs, symlinks and replacement during open.
function readBounded(file: string, limit: number): Buffer | null {
  if (!present(file)) return null;
  const st = lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink()) return fail('unsafe-native-file:' + file);
  if (st.size > limit) return fail('native-file-limit:' + file);
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.ino !== st.ino || opened.dev !== st.dev) return fail('native-file-changed:' + file);
    const data = Buffer.alloc(limit + 1);
    let n = 0;
    while (n <= limit) { const got = readSync(fd, data, n, data.length - n, null); if (!got) break; n += got; }
    if (n > limit) return fail('native-file-limit:' + file);
    return data.subarray(0, n);
  } finally { closeSync(fd); }
}
function names(dir: string): string[] {
  if (!present(dir)) return [];
  if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) return fail('unsafe-native-directory:' + dir);
  const items: string[] = [], fd = opendirSync(dir);
  try { let entry; while ((entry = fd.readSync())) { items.push(entry.name); if (items.length > 256) return fail('native-directory-candidate-limit:' + dir); } }
  finally { fd.closeSync(); }
  return items.sort();
}
function syncDir(dir: string): void {
  const fd = openSync(dir, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function writeAll(fd: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) { const n = writeSync(fd, bytes, offset, bytes.length - offset); if (!n) fail('native-short-write'); offset += n; }
}
function publish(file: string, bytes: Buffer, fault: Fault, label: string): void {
  const tmp = file + '.' + randomUUID() + '.tmp';
  fault(label + '-open');
  const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { fault(label + '-write'); writeAll(fd, bytes); fault(label + '-fsync'); fsyncSync(fd); } finally { closeSync(fd); }
  fault(label + '-rename'); renameSync(tmp, file);
  fault(label + '-directory-fsync'); syncDir(join(file, '..'));
}

/** A versioned capability supplied to the CLI-owned installed helper. No generic counter writes. */
export function createNativeQeHistoryApi(options: { projectRoot: string; featurePath: string; fault?: Fault; now?: () => number }) {
  if (!record(options) || Object.keys(options).some(k => !['projectRoot', 'featurePath', 'fault', 'now'].includes(k))) fail('native-factory-options-invalid');
  const projectRoot = realpathSync(options.projectRoot);
  const featurePath = realpathSync(options.featurePath);
  const rel = relative(projectRoot, featurePath);
  if (!rel || rel.startsWith('..') || rel.startsWith('/')) fail('native-feature-binding-invalid');
  const stateDir = join(featurePath, '.fa-state');
  const journal = join(stateDir, 'native-qe-history.jsonl');
  const headPath = join(stateDir, 'native-qe-head.json');
  const hostPath = join(stateDir, 'review-convergence-qe-host.json');
  const bridge = join(stateDir, 'qe-bridge');
  const now = options.now ?? (() => performance.now());
  const fault: Fault = options.fault ?? (() => {});
  const locations = { journal, head: headPath, host: hostPath, bridge };
  const collision = (): void => {
    const candidates = names(bridge).filter(n => /^(signoff-|failed-).*\.json$/.test(n));
    if (candidates.length && (present(journal) || present(headPath))) fail('native-bridge-source-collision:' + journal + ':' + bridge);
  };
  const proofPath = (p: string): boolean => typeof p === 'string' && p.startsWith(rel + '/qa/post-ci-correction/') && !p.startsWith('/') && !/[\\\x00-\x1f]/.test(p) && !p.split('/').some(v => !v || v === '.' || v === '..');
  const safeRelative = (p: string): string => {
    let file = projectRoot;
    for (const part of p.split('/')) { file = join(file, part); if (lstatSync(file).isSymbolicLink()) fail('native-post-ci-proof-symlink'); }
    return file;
  };
  const safeProof = (p: string): string => { if (!proofPath(p) && p !== rel + '/qa/post-ci-correction') return fail('native-post-ci-proof-path-invalid'); return safeRelative(p); };
  const checkpointAvailable = (required: unknown): boolean => {
    if (required === null) return true;
    try { const bytes = readBounded(join(stateDir, 'checkpoints.jsonl'), 2 * 1024 * 1024); if (!bytes || bytes.at(-1) !== 10) return false; const entries = bytes.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line)); return sha(JSON.stringify(entries.filter(e => e.stage === 'qe').at(-1)?.result)) === required; } catch { return false; }
  };
  const proofInventory = (paths: string[], deadline: () => void, imported: any[] = [], identity?: ReturnType<typeof nativePostCiIdentityRegistry>): unknown => {
    const root = rel + '/qa/post-ci-correction', files = new Set(paths), directories = new Map<string, Set<string>>([[root, new Set()]]);
    if (files.size !== paths.length || paths.some(p => !proofPath(p))) fail('native-post-ci-proof-overlap-or-path');
    for (const r of imported) { files.add(r.path); const foreign = r.path.split('/').slice(0, 2).join('/'); if (!directories.has(foreign)) directories.set(foreign, new Set()); }
    for (const path of files) {
      const start = path.startsWith(root + '/') ? root : path.split('/').slice(0, 2).join('/');
      const parts = path.slice(start.length + 1).split('/'); let dir = start;
      for (let i = 0; i < parts.length; i++) { directories.get(dir)!.add(parts[i]!); if (i < parts.length - 1) { dir += '/' + parts[i]; if (!directories.has(dir)) directories.set(dir, new Set()); } }
    }
    if ([...directories.keys()].some(p => files.has(p))) fail('native-post-ci-proof-file-directory-overlap');
    if (identity && (files.size > 256 || directories.size > 256)) fail('native-post-ci-immutable-inventory-limit');
    const result = [];
    for (const [dir, expected] of directories) {
      deadline(); const directory = safeRelative(dir), st = lstatSync(directory); if (!st.isDirectory()) fail('native-post-ci-inventory-directory-type');
      const entries = names(directory); if (entries.length !== expected.size || entries.some(n => !expected.has(n))) fail('native-post-ci-inventory-unlisted-or-missing');
      for (const path of [dir, ...entries.map(n => dir + '/' + n)]) { deadline(); const entry = lstatSync(safeRelative(path)); identity?.(path, entry, !files.has(path)); if (path === dir && (entry.ino !== st.ino || entry.dev !== st.dev) || (files.has(path) ? !entry.isFile() : !entry.isDirectory())) fail('native-post-ci-inventory-entry-type-or-identity'); result.push([path, entry.dev, entry.ino, entry.size, entry.mtimeMs]); }
    }
    return result;
  };
  const observeImported = (rows: any[], target: Snapshot, deadline: () => void, identity: ReturnType<typeof nativePostCiIdentityRegistry>): unknown => {
    let total = 0; const sources: unknown[] = [], support: unknown[] = [], buffer = Buffer.alloc(65536);
    for (const r of target.manifest) {
      deadline(); const file = join(projectRoot, r.path);
      if (r.digest === null) { if (present(file)) fail('native-post-ci-source-absence-changed'); continue; }
      const st = lstatSync(safeRelative(r.path)); identity(r.path, st);
      if (!st.isFile() || st.size > 2097152) fail('native-post-ci-source-type-or-limit');
      total += st.size; if (total > 16777216) fail('native-post-ci-source-support-aggregate-limit');
      sources.push([r.path, st.dev, st.ino, st.size, st.mtimeMs, st.nlink]);
    }
    for (const r of rows) {
      deadline(); const file = safeRelative(r.path), st = lstatSync(file); identity(r.path, st);
      if (!st.isFile() || st.nlink !== 1 || st.size !== r.size || st.size > 2097152) fail('native-post-ci-imported-file-type-size-or-link');
      total += st.size; if (total > 16777216) fail('native-post-ci-source-support-aggregate-limit');
      const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW), h = createHash('sha256'); let count = 0;
      try {
        const first = fstatSync(fd); if (!first.isFile() || first.dev !== st.dev || first.ino !== st.ino || first.size !== st.size || first.nlink !== 1) fail('native-post-ci-imported-identity-changed');
        while (true) { deadline(); const n = readSync(fd, buffer, 0, Math.min(buffer.length, r.size - count + 1), null); if (!n) break; count += n; if (count > r.size) fail('native-post-ci-imported-size-changed'); h.update(buffer.subarray(0, n)); }
        const end = fstatSync(fd), current = lstatSync(safeRelative(r.path));
        if (count !== r.size || h.digest('hex') !== r.digest || !current.isFile() || current.nlink !== 1 || end.nlink !== 1 || end.size !== st.size || current.size !== st.size || end.dev !== st.dev || end.ino !== st.ino || current.dev !== st.dev || current.ino !== st.ino || end.mtimeMs !== st.mtimeMs || current.mtimeMs !== st.mtimeMs) fail('native-post-ci-imported-short-changed-or-digest');
        support.push([r.path, st.dev, st.ino, st.size, st.mtimeMs]);
      } finally { closeSync(fd); }
    }
    return [sources, support];
  };
  const observeProof = (c: Correction, previous: Snapshot, target: Snapshot, deadline: () => void): void => {
    const bytes = readBounded(safeProof(c.evidencePath), 128 * 1024);
    if (c.evidence.excludedEvidence?.some((p: any) => p.path === c.evidencePath) || !bytes || sha(bytes) !== c.approval.evidenceDigest || !bytes.equals(Buffer.from(JSON.stringify(c.evidence) + '\n'))) fail('native-post-ci-descriptor-unavailable-or-changed');
    const e = validateNativePostCiEvidence(c.evidence, { featurePath: rel, previous: previous.manifest, current: target.manifest });
    const proofPaths = [c.evidencePath, ...new Set([e.failure.log, e.qualification.color.log, e.qualification.neutral.log, e.qualification.ci.log].map(p => p.path)), e.scope.fixture.patch.path, e.scope.upstream.acceptanceEvidence.path, ...e.excludedEvidence.map((p: any) => p.path)];
    const imported = e.schema === 'native-qe-post-ci-evidence-2' ? e.scope.importedArtifacts : [], identity = imported.length ? nativePostCiIdentityRegistry() : undefined;
    const supported = identity ? observeImported(imported, target, deadline, identity) : null;
    const membership = proofInventory(proofPaths, deadline, imported, identity);
    const small = [e.scope.fixture.patch, e.scope.upstream.acceptanceEvidence, ...e.excludedEvidence];
    for (const p of small) { deadline(); const b = readBounded(safeProof(p.path), p === e.scope.fixture.patch ? 64 * 1024 : 128 * 1024); if (!b || sha(b) !== p.digest) fail('native-post-ci-proof-unavailable-or-changed'); }
    const samples = new Map<string, Buffer>(); let aggregate = 0;
    const logs = [...new Map([e.failure.log, e.qualification.color.log, e.qualification.neutral.log, e.qualification.ci.log].map(p => [p.path, p])).values()];
    if (logs.length > 4) fail('native-post-ci-log-count-limit');
    const buffer = Buffer.alloc(65536);
    for (const p of logs) {
      deadline(); const file = safeProof(p.path), st = lstatSync(file);
      if (!st.isFile() || st.size > 16 * 1024 * 1024) fail('native-post-ci-log-limit-or-type');
      const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW), h = createHash('sha256');
      const control = [e.qualification.color, e.qualification.neutral].find(m => m.log.path === p.path);
      const slice = control ? Buffer.alloc(control.witness.length) : null; let count = 0, copied = 0;
      try {
        const opened = fstatSync(fd); if (!opened.isFile() || opened.ino !== st.ino || opened.dev !== st.dev || opened.size !== st.size) fail('native-post-ci-log-identity-changed');
        while (true) {
          deadline(); const n = readSync(fd, buffer, 0, buffer.length, null); if (!n) break;
          if (count + n > 16 * 1024 * 1024 || aggregate + n > 64 * 1024 * 1024) fail('native-post-ci-log-capacity-exceeded');
          h.update(buffer.subarray(0, n));
          if (control && slice) { const start = Math.max(count, control.witness.offset), end = Math.min(count + n, control.witness.offset + slice.length); if (end > start) { buffer.copy(slice, start - control.witness.offset, start - count, end - count); copied += end - start; } }
          count += n; aggregate += n;
        }
        const end = fstatSync(fd), current = lstatSync(file);
        if (count !== st.size || end.size !== st.size || end.ino !== current.ino || end.dev !== current.dev || current.isSymbolicLink() || !current.isFile() || h.digest('hex') !== p.digest || slice && copied !== slice.length) fail('native-post-ci-log-short-changed-or-digest');
        if (slice) samples.set(p.path, slice);
      } finally { closeSync(fd); }
    }
    validateNativePostCiEvidence(e, { featurePath: rel, previous: previous.manifest, current: target.manifest, witnesses: samples });
    if (identity && !same(supported, observeImported(imported, target, deadline, identity))) fail('native-post-ci-imported-observation-changed');
    if (!same(membership, proofInventory(proofPaths, deadline, imported, identity))) fail('native-post-ci-inventory-observation-changed'); deadline();
  };
  const replay = (): State | null => {
    collision();
    const fragments = names(stateDir).filter(n => /^native-qe-(history\.jsonl|head\.json)\..*\.tmp$/.test(n));
    if (fragments.length) fail('native-temporary-fragment:' + fragments.join(','));
    const jb = readBounded(journal, 8 * 1024 * 1024), hb = readBounded(headPath, 256 * 1024);
    if (!jb && !hb) return null;
    if (!jb || !hb) return fail('native-authority-missing:' + journal + ':' + headPath);
    if (!jb.length || jb[jb.length - 1] !== 10) return fail('native-journal-torn');
    let journalText: string;
    try { journalText = new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(jb); } catch { return fail('native-journal-invalid-utf8'); }
    const lines = journalText.split('\n'); lines.pop();
    if (lines.length > 1024) return fail('native-journal-event-limit');
    let head: Head;
    try { head = JSON.parse(new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(hb)) as Head; } catch { return fail('native-head-malformed'); }
    if (!shape(head, ['schema', 'journalId', 'projectRoot', 'featurePath', 'ceiling', 'sequence', 'eventDigest', 'activeCycle', 'hostProjectionDigest']) || head.schema !== 'native-qe-head-1' || !uuid(head.journalId) || head.projectRoot !== projectRoot || head.featurePath !== featurePath || head.ceiling !== ceiling || !Number.isInteger(head.sequence) || !hash(head.eventDigest) || !uuid(head.activeCycle) || !hash(head.hostProjectionDigest)) return fail('native-head-identity-invalid');
    const events: Event[] = [], witnessed = new Set<string>(), eventIds = new Set<string>(), cycles = new Set<string>(), closed = new Set<string>();
    let continuation: Event | undefined, correction: Event | undefined, anchor: Event | undefined;
    let roster: { id: string; family: string }[] = [];
    let previous: Event | undefined, previousDigest: string | null = null;
    for (const line of lines) {
      let e: Event;
      try { e = JSON.parse(line) as Event; } catch { return fail('native-journal-malformed'); }
      const extended = record(e) && e.schema === 'native-qe-continuation-1';
      const post = record(e) && e.schema === 'native-qe-post-ci-correction-1';
      if (!shape(e, ['schema', 'journalId', 'projectRoot', 'featurePath', 'ceiling', 'sequence', 'eventId', 'cycleId', 'previousDigest', 'kind', 'timestamp', 'nonce', 'revision', 'snapshot', 'hostProjectionDigest', 'origins', 'receiptDigest', 'reason', 'observationDigest', 'result'].concat(extended ? ['continuation'] : post ? ['postCiCorrection'] : [])) || !(extended || post || e.schema === 'native-qe-history-1') || e.journalId !== head.journalId || e.projectRoot !== projectRoot || e.featurePath !== featurePath || e.ceiling !== ceiling || e.sequence !== events.length + 1 || !uuid(e.eventId) || eventIds.has(e.eventId) || !uuid(e.cycleId) || e.previousDigest !== previousDigest || !['prepare', 'evaluate', 'begin-repair', 'begin-continuation', 'begin-post-ci-correction'].includes(e.kind) || !text(e.timestamp) || new Date(e.timestamp).toISOString() !== e.timestamp || !snapshotValid(e.snapshot) || e.nonce !== e.snapshot.nonce || e.revision !== e.snapshot.revision || !hash(e.hostProjectionDigest) || !Array.isArray(e.origins) || e.origins.length > 16 || !e.origins.every(o => shape(o, ['reviewer', 'family']) && text(o.reviewer) && ['codex', 'claude', 'owner-exception'].includes(o.family)) || new Set(e.origins.map(o => o.reviewer)).size !== e.origins.length || !(e.receiptDigest === null || hash(e.receiptDigest)) || !(e.reason === null || text(e.reason)) || !hash(e.observationDigest) || !resultValid(e.result, e.snapshot)) return fail('native-event-invalid');
      if (post !== (e.kind === 'begin-post-ci-correction')) return fail('native-post-ci-schema-invalid');
      if (extended !== (e.kind === 'begin-continuation')) return fail('native-continuation-schema-invalid');
      if (extended) {
        if (continuation || !previous || witnessed.size !== ceiling || !witnessed.has(previous.cycleId) || closed.has(previous.cycleId)) return fail('native-continuation-eligibility-invalid');
        const c = e.continuation;
        if (!shape(c, ['approval', 'predecessorHost']) || !c || !approvalValid(c.approval) || !approvalBound(c.approval, previous, previousDigest!, e.snapshot)) return fail('native-continuation-approval-invalid');
        if (!hostValid(c.predecessorHost, previous.snapshot) || sha(hostBytes(c.predecessorHost)) !== previous.hostProjectionDigest) return fail('native-continuation-predecessor-host-invalid');
        const expected = continuedHost(c.predecessorHost, e.snapshot);
        if (e.nonce === previous.nonce || events.some(p => p.nonce === e.nonce) || !same(e.result.reviewers, expected.reviewers) || !same(e.result.conditions, expected.conditions) || e.result.checkpointDigest !== [...events].reverse().find(p => p.result.verdict === 'prepared')?.result.checkpointDigest || sha(hostBytes(expected)) !== e.hostProjectionDigest || e.reason !== null || e.receiptDigest !== null) return fail('native-continuation-obligations-invalid');
        continuation = e;
      } else if (post) {
        if (correction || !continuation || !previous || witnessed.size !== 4 || !witnessed.has(previous.cycleId) || previous.cycleId !== continuation.cycleId || previous.kind !== 'evaluate' || previous.result.verdict !== 'closed') fail('native-post-ci-eligibility-invalid');
        const c = e.postCiCorrection!;
        if (!shape(c, ['approval', 'evidencePath', 'evidence', 'predecessorHost']) || !approvalValid(c.approval, true) || !approvalBound(c.approval, previous!, previousDigest!, e.snapshot) || c.approval.evidenceDigest !== sha(JSON.stringify(c.evidence) + '\n')) fail('native-post-ci-approval-invalid');
        if (!hostValid(c.predecessorHost, previous!.snapshot) || sha(hostBytes(c.predecessorHost)) !== previous!.hostProjectionDigest) fail('native-post-ci-predecessor-host-invalid');
        validateNativePostCiEvidence(c.evidence, { featurePath: rel, previous: previous!.snapshot.manifest, current: e.snapshot.manifest });
        if (!proofPath(c.evidencePath) || !same(e.result.reviewers, c.predecessorHost.reviewers) || !same(e.result.conditions, c.predecessorHost.conditions) || e.result.checkpointDigest !== continuation!.result.checkpointDigest || sha(hostBytes(continuedHost(c.predecessorHost, e.snapshot))) !== e.hostProjectionDigest || events.some(p => p.nonce === e.nonce) || e.receiptDigest !== null || e.reason !== null) fail('native-post-ci-obligations-invalid');
        correction = e; anchor = e;
      } else if ((correction || continuation) && (e.cycleId !== (correction || continuation)!.cycleId || e.revision !== (correction || continuation)!.revision || !same(e.snapshot, (correction || continuation)!.snapshot))) return fail('native-continuation-target-pinned');
      if (correction) {
        if (!post && e.kind === 'evaluate' && e.reason === 'native-post-ci-proof-unavailable') { if (e.result.verdict !== 'not-established' || e.origins.length || Object.hasOwn(e.result, 'postCiEvidenceClosure')) fail('native-post-ci-unavailable-invalid'); anchor = e; }
        if (!correctionClosure(e.result, e.snapshot, correction, anchor!, roster, e.origins)) fail('native-post-ci-closure-invalid');
      } else if (Object.hasOwn(e.result, 'postCiEvidenceClosure')) fail('native-post-ci-unexpected-closure');
      if (continuation && !checkpointProtected(e.result, continuation.result.checkpointDigest)) return fail('native-continuation-checkpoint-obligation-invalid');
      if (continuation && e.result.verdict === 'prepared' && (!same(e.result.reviewers, continuation.result.reviewers) || !(continuation.result.conditions as unknown[]).every(c => (e.result.conditions as unknown[]).some(n => same(c, n))))) return fail('native-continuation-obligations-invalid');
      if ((e.kind === 'evaluate') === (e.result.verdict === 'prepared')) return fail('native-replayed-action-result-invalid');
      if (e.kind !== 'evaluate') roster = e.result.reviewers as { id: string; family: string }[];
      if (e.origins.some(o => !roster.some(r => r.id === o.reviewer && r.family === o.family))) return fail('native-replayed-origin-roster-unbound');
      if (e.origins.length && (e.kind !== 'evaluate' || !e.receiptDigest || e.reason !== null)) return fail('native-origin-invalid');
      if (!previous) {
        if (e.kind !== 'prepare' || e.origins.length) return fail('native-initial-transition-invalid');
        cycles.add(e.cycleId);
      } else if (e.cycleId !== previous.cycleId) {
        if (!['begin-repair', 'begin-continuation', 'begin-post-ci-correction'].includes(e.kind) || !witnessed.has(previous.cycleId) || cycles.has(e.cycleId) || (e.kind === 'begin-repair' && witnessed.size >= ceiling) || e.revision === previous.revision || e.origins.length) return fail('native-repair-transition-invalid');
        cycles.add(e.cycleId);
      } else {
        if (['begin-repair', 'begin-continuation', 'begin-post-ci-correction'].includes(e.kind) || (e.revision !== previous.revision && (e.kind !== 'prepare' || witnessed.has(e.cycleId))) || (e.revision === previous.revision && !same(e.snapshot, previous.snapshot))) return fail('native-cycle-transition-invalid');
      }
      if (e.origins.length) witnessed.add(e.cycleId);
      if (e.result.verdict === 'closed') closed.add(e.cycleId);
      eventIds.add(e.eventId); events.push(e); previous = e; previousDigest = sha(line);
    }
    if (!previous || head.sequence !== events.length || head.eventDigest !== previousDigest || head.activeCycle !== previous.cycleId || head.hostProjectionDigest !== previous.hostProjectionDigest) return fail('native-head-journal-gap');
    const host = readBounded(hostPath, 256 * 1024);
    if (!host || sha(host) !== head.hostProjectionDigest) return fail('native-host-projection-mismatch');
    let parsedHost: unknown;
    try { parsedHost = JSON.parse(new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(host)); } catch { return fail('native-host-projection-malformed'); }
    if (!hostValid(parsedHost, previous.snapshot)) return fail('native-host-projection-invalid');
    if (continuation && (!preservedHost(continuedHost(correction ? correction.postCiCorrection!.predecessorHost : continuation.continuation!.predecessorHost, (correction || continuation).snapshot), parsedHost as Host) || previous.result.verdict !== 'closed' && !continuedHost(correction ? correction.postCiCorrection!.predecessorHost : continuation.continuation!.predecessorHost, (correction || continuation).snapshot).changedPaths.every(path => (parsedHost as Host).changedPaths.includes(path)))) return fail('native-continuation-obligations-invalid');
    return { head, events, active: previous, witnessed: witnessed.has(previous.cycleId), rounds: witnessed.size, host: parsedHost as Host, continuation, correction, anchor, closed };
  };
  const summary = (s: State) => ({ source: 'native', history: 'complete', status: s.rounds >= ceiling ? 'at-or-over-ceiling' : 'under-ceiling', ceiling, rounds: s.rounds, failedAttempts: s.events.filter(e => e.reason !== null).map(e => ({ eventId: e.eventId, cycleId: e.cycleId, reason: e.reason })), journalId: s.head.journalId, cycleId: s.head.activeCycle, nonce: s.active.nonce, revision: s.active.revision, sequence: s.head.sequence, eventDigest: s.head.eventDigest, snapshot: s.active.snapshot, postCiCorrection: { capacity: 1, used: Boolean(s.correction), targetRevision: s.correction?.revision ?? null, evidence: s.correction?.postCiCorrection ?? null, anchorSequence: s.anchor?.sequence ?? null, anchorEventDigest: s.anchor ? eventDigest(s.anchor) : null }, checkpointDigest: s.continuation ? s.continuation.result.checkpointDigest : [...s.events].reverse().find(e => e.result.verdict === 'prepared')?.result.checkpointDigest ?? null, continuation: { capacity: s.continuation ? 1 : 0, used: Boolean(s.continuation), targetRevision: s.continuation?.revision ?? null }, stopReason: s.rounds >= ceiling ? 'native-fixed-ceiling-reached' : null, locations });
  const refusal = (reason: string, partialCommit = false) => ({ source: 'native', history: 'incomplete', status: 'not-established', verdict: 'not-established', ceiling, reasons: [reason], notEstablishedReason: reason, partialCommit, locations });
  return {
    version: NATIVE_QE_HISTORY_API_VERSION, continuationVersion: NATIVE_QE_CONTINUATION_API_VERSION, postCiCorrectionVersion: NATIVE_QE_POST_CI_CORRECTION_API_VERSION, validateEvidence: validateNativePostCiEvidence, projectRoot, featurePath,
    read() {
      try { const s = replay(); if (!s) return refusal('native-history-absent-not-zero'); if (s.correction) { const start = now(); try { observeProof(s.correction.postCiCorrection!, s.correction.postCiCorrection!.predecessorHost.snapshot, s.correction.snapshot, () => { if (now() - start > 2000) fail('native-commit-budget-exceeded'); }); if (!checkpointAvailable(s.continuation!.result.checkpointDigest)) return { ...summary(s), ...refusal('native-post-ci-proof-unavailable') }; } catch { return { ...summary(s), ...refusal('native-post-ci-proof-unavailable') }; } } return summary(s); }
      catch (error) { return refusal((error as Error).message); }
    },
    transact(action: string, observe: (state: null | { snapshot: Snapshot; witnessed: boolean; rounds: number; cycleId: string; continuation: boolean; checkpointDigest: string | null; postCiCorrection?: any; deadline?: () => void }) => Proposal) {
      if (!['prepare', 'evaluate', 'begin-repair', 'begin-continuation', 'begin-post-ci-correction'].includes(action)) return refusal('native-action-invalid');
      let partialCommit = false;
      try {
        if (process.platform === 'win32' || constants.O_NOFOLLOW === undefined) return refusal('native-durability-unsupported');
        if (present(stateDir) && (lstatSync(stateDir).isSymbolicLink() || !lstatSync(stateDir).isDirectory())) return refusal('unsafe-native-state-directory');
        mkdirSync(stateDir, { recursive: true });
        // Prove directory fsync support before publishing any authority.
        try { syncDir(stateDir); } catch (e) { return refusal('native-durability-unsupported:' + String((e as NodeJS.ErrnoException).code ?? 'fsync')); }
        const output = withDirLockSync(stateDir, 'native-qe-history', () => {
          const started = now();
          const s = replay();
          const deadline = () => { if (now() - started > 2000) fail('native-commit-budget-exceeded'); };
          let unavailable = false;
          const p = observe(s ? { snapshot: structuredClone(s.active.snapshot), witnessed: s.witnessed, rounds: s.rounds, cycleId: s.active.cycleId, continuation: Boolean(s.continuation), checkpointDigest: (s.continuation ? s.continuation.result.checkpointDigest : [...s.events].reverse().find(e => e.result.verdict === 'prepared')?.result.checkpointDigest ?? null) as string | null, postCiCorrection: summary(s).postCiCorrection, deadline } : null);
          if (s?.correction) { try { observeProof(s.correction.postCiCorrection!, s.correction.postCiCorrection!.predecessorHost.snapshot, s.correction.snapshot, deadline); unavailable = !checkpointAvailable(s.continuation!.result.checkpointDigest); } catch { unavailable = true; } if (unavailable && action !== 'evaluate') fail('native-post-ci-proof-unavailable'); }
          if (unavailable) { p.origins = []; p.receiptDigest = null; p.reason = 'native-post-ci-proof-unavailable'; p.result = { schema: 'fa-review-convergence-1', phase: 'qe', verdict: 'not-established', revision: s!.active.revision, unresolved: [], reasons: [p.reason] }; p.host = s!.host; p.snapshot = s!.active.snapshot; }
          if (!hash(p.observationDigest) || !snapshotValid(p.snapshot) || !hostValid(p.host, p.snapshot) || !resultValid(p.result, p.snapshot) || !Array.isArray(p.origins) || p.origins.length > 16 || !p.origins.every(o => shape(o, ['reviewer', 'family']) && text(o.reviewer) && ['codex', 'claude', 'owner-exception'].includes(o.family)) || new Set(p.origins.map(o => o.reviewer)).size !== p.origins.length || !(p.receiptDigest === null || hash(p.receiptDigest)) || !(p.reason === null || text(p.reason)) || p.origins.length && (!p.receiptDigest || p.reason !== null || action !== 'evaluate')) fail('native-observation-invalid');
          if ((action === 'evaluate') === (p.result.verdict === 'prepared')) fail('native-action-result-invalid');
          if (p.origins.some(o => !(p.host as { reviewers: { id: string; family: string }[] }).reviewers.some(r => r.id === o.reviewer && r.family === o.family))) fail('native-origin-roster-unbound');
          if (!s && (action !== 'prepare' || !p.admission)) fail('native-initial-admission-refused');
          if (s && p.admission) fail('native-existing-authority-cannot-bootstrap');
          if (!['begin-continuation', 'begin-post-ci-correction'].includes(action) && p.ownerApproval !== undefined) fail('native-owner-approval-action-invalid');
          if (action !== 'begin-post-ci-correction' && p.correctionEvidence !== undefined) fail('native-post-ci-evidence-action-invalid');
          const post = action === 'begin-post-ci-correction';
          if (post && s?.correction) { const c = s.correction.postCiCorrection!; if (!same(c.approval, p.ownerApproval) || !same(p.correctionEvidence, { evidencePath: c.evidencePath, evidence: c.evidence }) || !same(p.snapshot, s.correction.snapshot)) fail('native-post-ci-already-used'); return { ...s.correction.result, ...summary(s), replayed: true }; }
          const changed = s && !same(p.snapshot.manifest, s.active.snapshot.manifest);
          let cycleId = s?.active.cycleId ?? randomUUID();
          if (s?.continuation && action === 'begin-continuation') {
            if (same(p.ownerApproval, s.continuation.continuation!.approval) && same(p.snapshot, s.continuation.snapshot)) return { ...s.continuation.result, ...summary(s), cycleId: s.continuation.cycleId, replayed: true };
            fail('native-continuation-already-used');
          }
          if (s?.continuation && !checkpointProtected(p.result, s.continuation.result.checkpointDigest)) fail('native-continuation-checkpoint-obligation-invalid');
          if (s?.continuation && changed && !post) fail('native-continuation-target-pinned');
          if (s?.continuation && (!preservedHost(s.host, p.host as Host) || p.result.verdict !== 'closed' && !s.host.changedPaths.every(path => (p.host as Host).changedPaths.includes(path)) || p.result.verdict === 'prepared' && (!same(p.result.conditions, (p.host as Host).conditions) || !same(p.result.reviewers, (p.host as Host).reviewers)))) fail('native-continuation-obligations-invalid');
          if (post) {
            if (!s?.continuation || s.rounds !== 4 || !s.witnessed || s!.active.cycleId !== s.continuation.cycleId || s!.active.kind !== 'evaluate' || s!.active.result.verdict !== 'closed') fail('native-post-ci-eligibility-invalid');
            if (!approvalValid(p.ownerApproval, true) || !approvalBound(p.ownerApproval, s!.active, s!.head.eventDigest, p.snapshot)) fail('native-post-ci-approval-invalid');
            if (!changed || s.events.some(e => e.nonce === p.snapshot.nonce)) fail('native-post-ci-target-delta-invalid');
            if (!p.correctionEvidence || !shape(p.correctionEvidence, ['evidencePath', 'evidence'])) fail('native-post-ci-evidence-invalid');
            const c = { approval: p.ownerApproval, ...p.correctionEvidence, predecessorHost: s!.host } as Correction;
            observeProof(c, s!.active.snapshot, p.snapshot, deadline);
            if (!checkpointAvailable(s!.continuation!.result.checkpointDigest) || !same(p.host, continuedHost(s!.host, p.snapshot)) || !same(p.result.reviewers, s!.host.reviewers) || !same(p.result.conditions, s!.host.conditions) || p.result.checkpointDigest !== s!.continuation!.result.checkpointDigest || p.receiptDigest !== null || p.reason !== null) fail('native-post-ci-obligations-invalid');
            cycleId = randomUUID();
          }
          if (action === 'begin-continuation') {
            if (!s) return fail('native-continuation-eligibility-invalid');
            if (s.rounds !== ceiling || !s.witnessed) fail('native-continuation-eligibility-invalid');
            if (s.closed.has(s.active.cycleId)) fail('native-continuation-predecessor-closed');
            if (!approvalValid(p.ownerApproval) || !approvalBound(p.ownerApproval, s.active, s.head.eventDigest, p.snapshot)) fail('native-continuation-approval-invalid');
            if (!changed || s.events.some(e => e.nonce === p.snapshot.nonce)) fail('native-continuation-target-delta-invalid');
            if (!same(p.host, continuedHost(s.host, p.snapshot)) || !same(p.result.reviewers, s.host.reviewers) || !same(p.result.conditions, s.host.conditions) || p.result.checkpointDigest !== [...s.events].reverse().find(e => e.result.verdict === 'prepared')?.result.checkpointDigest || p.receiptDigest !== null || p.reason !== null) fail('native-continuation-obligations-invalid');
            cycleId = randomUUID();
          }

          if (s && action === 'begin-repair') {
            if (!s.witnessed && !changed) return { ...s.active.result, ...summary(s), verdict: 'prepared', replayed: true };
            if (!s.witnessed) fail('native-repair-predecessor-unwitnessed');
            if (!changed) fail('native-repair-delta-missing');
            if (s.rounds >= ceiling) fail('native-fourth-cycle-refused');
            cycleId = randomUUID();
          } else if (!['begin-continuation', 'begin-post-ci-correction'].includes(action) && s && changed && (s.witnessed || action !== 'prepare')) fail('native-repair-required');
          if (s && !changed && !same(p.snapshot, s.active.snapshot)) fail('native-admitted-snapshot-changed');
          if (s?.correction) {
            if (!correctionClosure(p.result, p.snapshot, s.correction, s.anchor!, s.host.reviewers, p.origins)) fail('native-post-ci-closure-invalid');
            if (p.result.verdict === 'closed') { const rb = readBounded(join(stateDir, 'review-convergence-qe-review.json'), 256 * 1024); if (!rb || sha(rb) !== p.receiptDigest) fail('native-post-ci-origin-receipt-missing'); const receipt = JSON.parse(rb!.toString('utf8')); if (receipt.nonce !== p.snapshot.nonce || receipt.revision !== p.snapshot.revision || !same((p.result.postCiEvidenceClosure as any).origins, s.host.reviewers.map(r => ({ reviewer: r.id, family: r.family, verification: receipt.reviews?.find((v: any) => v.reviewer === r.id && v.family === r.family)?.postCiEvidenceVerification })))) fail('native-post-ci-origin-receipt-unbound'); }
          } else if (Object.hasOwn(p.result, 'postCiEvidenceClosure')) fail('native-post-ci-unexpected-closure');
          const nextHostBytes = hostBytes(p.host);
          if (nextHostBytes.length > 256 * 1024) fail('native-host-limit');
          const projection = sha(nextHostBytes);
          const priorEvaluation = s && action === 'evaluate' ? [...s.events].reverse().find(e => e.kind === 'evaluate' && e.cycleId === cycleId && e.observationDigest === p.observationDigest && e.receiptDigest === p.receiptDigest && same(e.snapshot, p.snapshot) && (!s.correction || same(e.result, p.result) && e.reason === p.reason && same(e.origins, p.origins))) : null;
          if (s && priorEvaluation && projection === s.head.hostProjectionDigest) return { ...priorEvaluation.result, ...summary(s), replayed: true };
          if (s && action === s.active.kind && same(p.snapshot, s.active.snapshot) && p.receiptDigest === s.active.receiptDigest && projection === s.active.hostProjectionDigest && same(p.origins, s.active.origins) && p.reason === s.active.reason && p.observationDigest === s.active.observationDigest && same(p.result, s.active.result)) return { ...s.active.result, ...summary(s), replayed: true };
          const identity = s ? { journalId: s.head.journalId, projectRoot, featurePath, ceiling } : { journalId: randomUUID(), projectRoot, featurePath, ceiling };
          const e: Event = { ...identity, schema: post ? 'native-qe-post-ci-correction-1' : action === 'begin-continuation' ? 'native-qe-continuation-1' : 'native-qe-history-1', sequence: (s?.head.sequence ?? 0) + 1, eventId: randomUUID(), cycleId, previousDigest: s?.head.eventDigest ?? null, kind: action, timestamp: new Date().toISOString(), nonce: p.snapshot.nonce, revision: p.snapshot.revision, snapshot: p.snapshot, hostProjectionDigest: projection, origins: p.origins, receiptDigest: p.receiptDigest, reason: p.reason, observationDigest: p.observationDigest, result: p.result };
          if (action === 'begin-continuation') e.continuation = { approval: p.ownerApproval as Approval, predecessorHost: s!.host };
          if (post) e.postCiCorrection = { approval: p.ownerApproval as Correction['approval'], evidencePath: p.correctionEvidence!.evidencePath, evidence: p.correctionEvidence!.evidence, predecessorHost: s!.host };
          const line = JSON.stringify(e), bytes = Buffer.from(line + '\n');
          if (e.sequence > 1024 || (readBounded(journal, 8 * 1024 * 1024)?.length ?? 0) + bytes.length > 8 * 1024 * 1024) fail('native-journal-limit');
          const head: Head = { ...identity, schema: 'native-qe-head-1', sequence: e.sequence, eventDigest: sha(line), activeCycle: cycleId, hostProjectionDigest: projection };
          const headBytes = Buffer.from(JSON.stringify(head, null, 2) + '\n');
          collision();
          if (!s && names(bridge).some(n => /^(signoff-|failed-).*\.json$/.test(n))) fail('native-bridge-source-collision:' + journal + ':' + bridge);
          fault('before-first-write');
          if (now() - started > 2000) fail('native-commit-budget-exceeded-before-first-write');
          // After this fence no expensive observation runs. Failure is conservatively possibly partial.
          fault('journal-open');
          partialCommit = true;
          const fd = openSync(journal, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
          try { fault('journal-write'); writeAll(fd, bytes); fault('journal-fsync'); fsyncSync(fd); } finally { closeSync(fd); }
          publish(headPath, headBytes, fault, 'head');
          publish(hostPath, nextHostBytes, fault, 'host');
          const complete = replay();
          if (!complete) return fail('native-commit-authority-missing');
          fault('before-lock-release');
          return { ...p.result, ...summary(complete), replayed: false };
        }, { staleMs: 30000, timeoutMs: 5000 });
        return output;
      } catch (error) {
        const code = (error as { code?: string }).code;
        return refusal(code === 'ECOMPROMISED' ? 'native-lock-compromised-possible-partial-commit' : (error as Error).message, partialCommit);
      }
    },
  };
}
