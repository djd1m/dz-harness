/** Journaled, ownership-aware project carrier transaction. */

import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { canonicalIntegrationJson, parseStrictJson, type CarrierFragment, type IntegrationReasonCode } from '@dzhechkov/core';

import { withNamedLockSync } from './named-lock.js';

const MAX_CARRIER_BYTES = 1024 * 1024;
const JOURNAL_REL = '.dz/integrations-ownership.json';

type JournalState = 'pending' | 'committed';

interface JournalEntry {
  readonly state: JournalState;
  readonly carrierPath: string;
  readonly entryId: string;
  readonly previousCarrierDigest: string;
  readonly desiredCarrierDigest: string;
  readonly desiredContentHash: string;
}

interface JournalV1 {
  readonly version: 1;
  readonly entries: Record<string, JournalEntry>;
}

export type IntegrationApplyFault = 'after-pending' | 'after-carrier' | 'after-committed';

export interface ApplyIntegrationOptions {
  readonly projectRoot: string;
  readonly fragments: readonly CarrierFragment[];
  /** Test-only fault seam; production callers omit it. */
  readonly injectFault?: IntegrationApplyFault;
}

export interface IntegrationApplyReport {
  readonly written: readonly string[];
  readonly alreadyCurrent: readonly string[];
  readonly journalPath: string;
}

export class IntegrationApplyError extends Error {
  constructor(
    readonly reasonCode: IntegrationReasonCode,
    message: string,
    /** Carrier bytes may already be durable while ownership remains unverified. */
    readonly applied = false,
  ) {
    super(message);
    this.name = 'IntegrationApplyError';
  }
}

function sha(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function absentOrDigest(bytes: string | undefined): string {
  return bytes === undefined ? 'sha256:absent' : sha(bytes);
}

function assertPlainObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new IntegrationApplyError('CONFIG_MALFORMED', `${label} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

function readBoundedJson(path: string, label: string): { bytes: string; value: Record<string, unknown> } | undefined {
  if (!existsSync(path)) return undefined;
  const st = lstatSync(path);
  if (st.isSymbolicLink() || !st.isFile()) throw new IntegrationApplyError('UNSAFE_PATH', `${label} must be a regular non-symlink file`);
  if (st.size > MAX_CARRIER_BYTES) throw new IntegrationApplyError('CONFIG_MALFORMED', `${label} exceeds ${MAX_CARRIER_BYTES} bytes`);
  const bytes = readFileSync(path, 'utf8');
  try {
    return { bytes, value: assertPlainObject(parseStrictJson(bytes, { label, maxBytes: MAX_CARRIER_BYTES }), label) };
  } catch (error) {
    if (error instanceof IntegrationApplyError) throw error;
    throw new IntegrationApplyError('CONFIG_MALFORMED', error instanceof Error ? error.message : String(error));
  }
}

function journalFrom(value: Record<string, unknown>): JournalV1 {
  if (value['version'] !== 1) throw new IntegrationApplyError('CONFIG_MALFORMED', 'integration journal version must be 1');
  const rawEntries = assertPlainObject(value['entries'], 'integration journal entries');
  const entries = Object.create(null) as Record<string, JournalEntry>;
  for (const [key, raw] of Object.entries(rawEntries)) {
    const row = assertPlainObject(raw, `integration journal entry ${key}`);
    const state = row['state'];
    if (state !== 'pending' && state !== 'committed') throw new IntegrationApplyError('CONFIG_MALFORMED', `integration journal entry ${key} has invalid state`);
    for (const field of ['carrierPath', 'entryId', 'previousCarrierDigest', 'desiredCarrierDigest', 'desiredContentHash'] as const) {
      if (typeof row[field] !== 'string') throw new IntegrationApplyError('CONFIG_MALFORMED', `integration journal entry ${key} lacks ${field}`);
    }
    entries[key] = {
      state,
      carrierPath: row['carrierPath'] as string,
      entryId: row['entryId'] as string,
      previousCarrierDigest: row['previousCarrierDigest'] as string,
      desiredCarrierDigest: row['desiredCarrierDigest'] as string,
      desiredContentHash: row['desiredContentHash'] as string,
    };
  }
  return { version: 1, entries };
}

function ensureSafeProjectRoot(projectRoot: string): string {
  mkdirSync(projectRoot, { recursive: true });
  const lexical = resolve(projectRoot);
  const actual = realpathSync(projectRoot);
  if (lexical !== actual || lstatSync(projectRoot).isSymbolicLink()) {
    throw new IntegrationApplyError('UNSAFE_PATH', 'project root must be a real non-symlink directory');
  }
  const dz = join(actual, '.dz');
  if (!existsSync(dz)) mkdirSync(dz, { mode: 0o700 });
  const dzStat = lstatSync(dz);
  if (dzStat.isSymbolicLink() || !dzStat.isDirectory() || realpathSync(dz) !== dz) {
    throw new IntegrationApplyError('UNSAFE_PATH', '.dz must be a real non-symlink directory');
  }
  return actual;
}

function confinedPath(root: string, relativePath: string): string {
  if (relativePath.startsWith('/') || relativePath.split('/').includes('..')) {
    throw new IntegrationApplyError('UNSAFE_PATH', `unsafe carrier path ${JSON.stringify(relativePath)}`);
  }
  const absolute = resolve(root, ...relativePath.split('/'));
  const rel = relative(root, absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(root, rel) !== absolute) {
    throw new IntegrationApplyError('UNSAFE_PATH', `carrier escapes project root: ${relativePath}`);
  }
  const parent = dirname(absolute);
  if (parent !== root) {
    mkdirSync(parent, { recursive: true });
    let walk = root;
    for (const part of relative(root, parent).split(sep).filter(Boolean)) {
      walk = join(walk, part);
      const st = lstatSync(walk);
      if (st.isSymbolicLink() || !st.isDirectory()) throw new IntegrationApplyError('UNSAFE_PATH', `carrier parent is not a real directory: ${relativePath}`);
    }
  }
  if (existsSync(absolute) && lstatSync(absolute).isSymbolicLink()) {
    throw new IntegrationApplyError('UNSAFE_PATH', `carrier must not be a symlink: ${relativePath}`);
  }
  return absolute;
}

function fsyncDirectory(path: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY);
    fsyncSync(fd);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM'].includes(code ?? '')) throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function durableReplace(path: string, bytes: string): void {
  const parent = dirname(path);
  const temp = join(parent, `.${relative(parent, path)}.dz-${process.pid}-${randomBytes(8).toString('hex')}.tmp`);
  let fd: number | undefined;
  try {
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
    fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow, 0o600);
    writeFileSync(fd, bytes, 'utf8');
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    renameSync(temp, path);
    const reread = readFileSync(path, 'utf8');
    if (reread !== bytes) throw new IntegrationApplyError('APPLY_FAILED', `durable reread mismatch for ${path}`);
    fsyncDirectory(parent);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temp)) unlinkSync(temp);
  }
}

function entryHash(value: unknown): string {
  return sha(canonicalIntegrationJson(value));
}

function isKnownAgentDbLegacy(id: string, value: unknown, root: string): boolean {
  if (id !== 'mcpServers.agentdb' || value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (!Object.keys(row).every((key) => ['command', 'args', 'env'].includes(key))) return false;
  if (row['command'] !== 'npx' || !Array.isArray(row['args'])) return false;
  const args = row['args'];
  if (args.length !== 3 || typeof args[0] !== 'string' || !/^agentdb@(?:latest|[^\s/]+)$/.test(args[0]) || args[1] !== 'mcp' || args[2] !== 'start') return false;
  if (row['env'] === undefined) return true;
  const env = row['env'];
  if (env === null || typeof env !== 'object' || Array.isArray(env) || Object.keys(env).length !== 1) return false;
  const path = (env as Record<string, unknown>)['AGENTDB_PATH'];
  return path === join(root, '.dz', 'agentdb.db') || path === join(root, '.dz', 'agentdb-mcp.db');
}

/** Apply all project JSON fragments under one short project-journal lock. */
export function applyIntegrationFragments(options: ApplyIntegrationOptions): IntegrationApplyReport {
  const root = ensureSafeProjectRoot(options.projectRoot);
  const journalPath = confinedPath(root, JOURNAL_REL);
  if (options.fragments.some((fragment) => fragment.scope !== 'project' || fragment.format !== 'json')) {
    throw new IntegrationApplyError('INTENT_NOT_EXPRESSIBLE', 'initial transaction supports project JSON carriers only');
  }
  const groups = new Map<string, CarrierFragment[]>();
  for (const fragment of options.fragments) {
    const rows = groups.get(fragment.carrierPath) ?? [];
    rows.push(fragment); groups.set(fragment.carrierPath, rows);
  }
  if (groups.size === 0) return { written: [], alreadyCurrent: [], journalPath: JOURNAL_REL };

  return withNamedLockSync(root, 'integrations', () => {
    const rootBefore = statSync(root);
    const dzBefore = statSync(join(root, '.dz'));
    const journalRead = readBoundedJson(journalPath, JOURNAL_REL);
    const journal: JournalV1 = journalRead === undefined ? { version: 1, entries: Object.create(null) } : journalFrom(journalRead.value);
    const candidates: { rel: string; abs: string; before: string | undefined; bytes: string; tuples: string[] }[] = [];
    const pendingEntries: Record<string, JournalEntry> = { ...journal.entries };

    for (const [carrierRel, fragments] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const carrierAbs = confinedPath(root, carrierRel);
      const existing = readBoundedJson(carrierAbs, carrierRel);
      const rootObject = existing?.value ?? Object.create(null) as Record<string, unknown>;
      const candidate = { ...rootObject } as Record<string, unknown>;
      const tuples: string[] = [];
      for (const fragment of fragments) {
        const rootValue = candidate[fragment.rootKey];
        const bucket = rootValue === undefined ? Object.create(null) as Record<string, unknown> : assertPlainObject(rootValue, `${carrierRel}.${fragment.rootKey}`);
        const nextBucket = { ...bucket };
        for (const [id, desired] of Object.entries(fragment.entries)) {
          const tuple = `${carrierRel}::${fragment.rootKey}.${id}`;
          const current = bucket[id];
          const ledger = journal.entries[tuple];
          const desiredHash = entryHash(desired);
          if (current !== undefined) {
            const currentHash = entryHash(current);
            const recoverablePending = ledger?.state === 'pending' &&
              currentHash === ledger.desiredContentHash &&
              desiredHash === ledger.desiredContentHash;
            const committedCurrent = ledger?.state === 'committed' && currentHash === ledger.desiredContentHash;
            const legacy = isKnownAgentDbLegacy(`${fragment.rootKey}.${id}`, current, root);
            if (!recoverablePending && !committedCurrent && !legacy) {
              throw new IntegrationApplyError('OWNERSHIP_AMBIGUOUS', `${tuple} already exists without matching dz ownership; original bytes preserved`);
            }
          } else if (ledger?.state === 'pending') {
            // Explicitly recoverable: pending publication may have stopped before carrier rename.
          } else if (ledger?.state === 'committed') {
            throw new IntegrationApplyError('OWNERSHIP_AMBIGUOUS', `${tuple} is absent but journal is committed; refuse implicit recreation`);
          }
          nextBucket[id] = desired;
          tuples.push(tuple);
          pendingEntries[tuple] = {
            state: 'pending',
            carrierPath: carrierRel,
            entryId: `${fragment.rootKey}.${id}`,
            previousCarrierDigest: absentOrDigest(existing?.bytes),
            desiredCarrierDigest: '',
            desiredContentHash: desiredHash,
          };
        }
        candidate[fragment.rootKey] = nextBucket;
      }
      const bytes = `${JSON.stringify(candidate, null, 2)}\n`;
      const desiredCarrierDigest = sha(bytes);
      for (const tuple of tuples) pendingEntries[tuple] = { ...pendingEntries[tuple]!, desiredCarrierDigest };
      candidates.push({ rel: carrierRel, abs: carrierAbs, before: existing?.bytes, bytes, tuples });
    }

    if (statSync(root).dev !== rootBefore.dev || statSync(root).ino !== rootBefore.ino ||
        statSync(join(root, '.dz')).dev !== dzBefore.dev || statSync(join(root, '.dz')).ino !== dzBefore.ino) {
      throw new IntegrationApplyError('CONCURRENT_MODIFICATION', 'project root or .dz inode changed during planning');
    }

    const pendingBytes = `${JSON.stringify({ version: 1, entries: pendingEntries }, null, 2)}\n`;
    durableReplace(journalPath, pendingBytes);
    if (options.injectFault === 'after-pending') throw new IntegrationApplyError('APPLY_FAILED', 'injected fault after pending journal publication');

    const written: string[] = [];
    const alreadyCurrent: string[] = [];
    let carrierPublished = false;
    try {
      for (const candidate of candidates) {
        const current = readBoundedJson(candidate.abs, candidate.rel)?.bytes;
        if (current !== candidate.before) throw new IntegrationApplyError('CONCURRENT_MODIFICATION', `${candidate.rel} changed after planning`);
        if (current === candidate.bytes) alreadyCurrent.push(candidate.rel);
        else {
          durableReplace(candidate.abs, candidate.bytes);
          written.push(candidate.rel);
          carrierPublished = true;
        }
      }
      if (options.injectFault === 'after-carrier') {
        throw new IntegrationApplyError('APPLY_FAILED', 'carrier was written but committed ownership journal was not verified', true);
      }

      const committedEntries: Record<string, JournalEntry> = { ...pendingEntries };
      for (const candidate of candidates) {
        for (const tuple of candidate.tuples) committedEntries[tuple] = { ...committedEntries[tuple]!, state: 'committed' };
      }
      durableReplace(journalPath, `${JSON.stringify({ version: 1, entries: committedEntries }, null, 2)}\n`);
      if (options.injectFault === 'after-committed') throw new IntegrationApplyError('APPLY_FAILED', 'injected fault after committed journal publication', true);
      return { written, alreadyCurrent, journalPath: JOURNAL_REL };
    } catch (error) {
      if (error instanceof IntegrationApplyError && error.applied) throw error;
      if (carrierPublished) {
        throw new IntegrationApplyError(
          'APPLY_FAILED',
          `carrier was written but committed ownership journal was not verified: ${error instanceof Error ? error.message : String(error)}`,
          true,
        );
      }
      throw error;
    }
  });
}
