/** One private snapshot per owned process. Reads are explicitly recorded local telemetry. */
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCodexRecallAlias } from './codex-recall-frame.js';
import { codexRecallObject, CODEX_RECALL_OBSERVER_MAX_RECORDS, type CodexRecallAccountedInput, type CodexRecallObserverSnapshot } from './codex-recall-observer.js';

export const CODEX_RECALL_SNAPSHOT_MAX_BYTES = 65_536;
export const CODEX_RECALL_SNAPSHOT_TTL_MS = 86_400_000;
function directory(path: string, privateMode = false): void {
  const s = lstatSync(path);
  if (!s.isDirectory() || s.isSymbolicLink() || realpathSync(path) !== path || (privateMode && (s.mode & 0o077) !== 0)) throw Error('unsafe-storage');
}
function storage(projectRoot: string, create: boolean): string {
  const root = realpathSync(projectRoot);
  const store = join(root, '.dz'); directory(store);
  const dir = join(store, 'recall-host-observations');
  if (create) { try { mkdirSync(dir, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; } }
  directory(dir, true); return dir;
}
function privateFile(fd: number): void {
  const s = fstatSync(fd);
  if (!s.isFile() || (s.mode & 0o077) !== 0 || s.nlink !== 1 || s.size > CODEX_RECALL_SNAPSHOT_MAX_BYTES) throw Error('unsafe-storage');
}

/** Allocate exclusively; collisions never overwrite another observer. No .dz creation. */
export function createCodexRecallSnapshotWriter(projectRoot: string, observerId: string): (snapshot: CodexRecallObserverSnapshot) => void {
  if (!isCodexRecallAlias(observerId)) throw Error('invalid-observer');
  const dir = storage(projectRoot, true);
  const target = join(dir, `${observerId}.json`);
  const fd = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  closeSync(fd);
  return snapshot => {
    const text = JSON.stringify(snapshot) + '\n';
    if (snapshot.observerId !== observerId || Buffer.byteLength(text) > CODEX_RECALL_SNAPSHOT_MAX_BYTES) throw Error('snapshot-limit');
    if (storage(projectRoot, false) !== dir) throw Error('unsafe-storage');
    const old = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try { privateFile(old); } finally { closeSync(old); }
    const temp = join(dir, `${observerId}.tmp`);
    const next = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { writeFileSync(next, text); } finally { closeSync(next); }
    try { if (storage(projectRoot, false) !== dir) throw Error('unsafe-storage'); renameSync(temp, target); }
    catch (e) { try { unlinkSync(temp); } catch { /* fail closed */ } throw e; }
  };
}

function record(v: unknown): CodexRecallAccountedInput | undefined {
  if (!codexRecallObject(v) || !Number.isSafeInteger(v.epoch) || (v.epoch as number) < 0
    || !['threadAlias', 'turnAlias', 'itemAlias', 'responseAlias', 'eventId'].every(k => isCodexRecallAlias(v[k]))
    || typeof v.contextDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(v.contextDigest)
    || typeof v.contextItemInputTokens !== 'number' || !Number.isSafeInteger(v.contextItemInputTokens) || v.contextItemInputTokens <= 0
    || !['full', 'partial'].includes(String(v.coverage)) || !Number.isSafeInteger(v.unaddressableCount) || (v.unaddressableCount as number) < 0 || (v.unaddressableCount as number) > 16) return undefined;
  for (const k of ['completeLessonIds', 'unknownLessonIds']) {
    const ids = v[k]; if (!Array.isArray(ids) || ids.length > 16 || ids.some(id => typeof id !== 'string' || !/^teach:[a-f0-9]{16}$/u.test(id))) return undefined;
  }
  return { epoch: v.epoch as number, threadAlias: v.threadAlias as string, turnAlias: v.turnAlias as string, itemAlias: v.itemAlias as string,
    responseAlias: v.responseAlias as string, eventId: v.eventId as string, contextDigest: v.contextDigest, contextItemInputTokens: v.contextItemInputTokens,
    coverage: v.coverage as 'full' | 'partial', completeLessonIds: [...v.completeLessonIds as string[]], unknownLessonIds: [...v.unknownLessonIds as string[]], unaddressableCount: v.unaddressableCount as number };
}
export type CodexRecallRecordedStatus = { readonly state: 'unknown'; readonly reason: 'invalid-selector' | 'unavailable' | 'unsafe-or-corrupt' | 'stale' }
  | { readonly state: 'recorded'; readonly observation: CodexRecallObserverSnapshot };

/** Bounded no-follow read; reconstruct the allowlist, never expose arbitrary stored keys. */
export function readCodexRecallObserverSnapshot(projectRoot: string, observerId: unknown, now = Date.now()): CodexRecallRecordedStatus {
  if (!isCodexRecallAlias(observerId)) return { state: 'unknown', reason: 'invalid-selector' };
  let fd: number | undefined;
  try {
    const dir = storage(projectRoot, false);
    fd = openSync(join(dir, `${observerId}.json`), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)); privateFile(fd);
    const buf = Buffer.alloc(CODEX_RECALL_SNAPSHOT_MAX_BYTES + 1);
    let size = 0, count = 0;
    do { count = readSync(fd, buf, size, buf.length - size, null); size += count; } while (count > 0 && size < buf.length);
    if (size > CODEX_RECALL_SNAPSHOT_MAX_BYTES) throw Error('oversize');
    const v: unknown = JSON.parse(buf.subarray(0, size).toString('utf8'));
    if (!codexRecallObject(v) || v.schema !== 'codex-recall-observer/1' || v.observerId !== observerId || v.label !== 'recorded-local-experimental'
      || !['connected', 'disconnected'].includes(String(v.connection)) || !Number.isSafeInteger(v.epoch) || (v.epoch as number) < 0
      || !Number.isSafeInteger(v.updatedAt) || (v.updatedAt as number) < 0 || (v.updatedAt as number) > now + 30_000
      || !Array.isArray(v.historical) || v.historical.length > CODEX_RECALL_OBSERVER_MAX_RECORDS || !codexRecallObject(v.current)
      || !['unknown', 'hook-completed', 'context-recorded', 'accounted-input'].includes(String(v.currentStage))
      || (v.runtime !== null && (typeof v.runtime !== 'string' || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/u.test(v.runtime)))) throw Error('corrupt');
    if (now - (v.updatedAt as number) > CODEX_RECALL_SNAPSHOT_TTL_MS) return { state: 'unknown', reason: 'stale' };
    const history = v.historical.map(record);
    if (history.some(r => r === undefined)) throw Error('corrupt');
    const reasons = ['pending', 'unsupported-runtime', 'hook-unverified', 'context-unavailable', 'attribution-unavailable', 'scope-invalidated', 'disconnected', 'stream-invalid', 'limit-exceeded', 'ambiguous-context'];
    const currentRecord = v.current.state === 'accounted-input' ? record(v.current.record) : undefined;
    if ((currentRecord !== undefined) !== (v.currentStage === 'accounted-input')) throw Error('corrupt');
    if (currentRecord === undefined && (v.current.state !== 'unknown' || !reasons.includes(String(v.current.reason)))) throw Error('corrupt');
    const current: CodexRecallObserverSnapshot['current'] = currentRecord === undefined
      ? { state: 'unknown', reason: v.current.reason as 'pending' } : { state: 'accounted-input', record: currentRecord };
    return { state: 'recorded', observation: { schema: 'codex-recall-observer/1', observerId, label: 'recorded-local-experimental',
      runtime: v.runtime as string | null, connection: v.connection as 'connected' | 'disconnected', epoch: v.epoch as number, updatedAt: v.updatedAt as number,
      currentStage: v.currentStage as CodexRecallObserverSnapshot['currentStage'],
      current, historical: history as CodexRecallAccountedInput[] } };
  } catch (e) { return { state: 'unknown', reason: (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'unavailable' : 'unsafe-or-corrupt' }; }
  finally { if (fd !== undefined) closeSync(fd); }
}
