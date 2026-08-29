#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { EVIDENCE_SCHEMA, assertValid, validateEvidence } from './story-schema.mjs';

const slash = (value) => value.split('\\').join('/');
const sha = (text) => createHash('sha256').update(text).digest('hex');
const sourceId = (path) => `src-${path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
const SOURCE_LIMIT = 80;
const EXAMPLE_LIMIT = 12;
const EXAMPLE_CHAR_LIMIT = 3000;
export const PACKAGE_JSON_BYTE_LIMIT = 262_144;
export const SOURCE_BYTE_LIMIT = 1_048_576;
export const SOURCE_AGGREGATE_BYTE_LIMIT = 8_388_608;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export function countSourceLines(body) {
  if (body === '') return 0;
  const newlines = (body.match(/\n/g) ?? []).length;
  return newlines + (body.endsWith('\n') ? 0 : 1);
}

function args(argv) {
  const value = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
  return { packageRoot: value('pkg'), json: value('json') };
}

function walk(root, current = root, out = []) {
  for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['node_modules', '.git', 'dist', 'coverage'].includes(entry.name)) continue;
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) walk(root, absolute, out);
    else if (entry.isFile()) {
      const rel = slash(relative(root, absolute));
      if (/^(?:README(?:\.[^.]+)?|package\.json|[^/]*SKILL\.md|(?:examples?|test|tests)\/.*\.(?:md|json|mjs|js|ts))$/i.test(rel)
        || /\/SKILL\.md$/i.test(rel)) out.push(rel);
    }
  }
  return out;
}

export function noFollowReadFlags(values = constants) {
  if (!Number.isInteger(values.O_RDONLY) || !Number.isInteger(values.O_NOFOLLOW)) {
    throw new Error('O_NOFOLLOW is unavailable; refusing a path-based source read');
  }
  return values.O_RDONLY | values.O_NOFOLLOW;
}

export function readDescriptorBounded(path, individualLimit, aggregateRemaining = individualLimit, io = {}) {
  const open = io.openSync ?? openSync;
  const fstat = io.fstatSync ?? fstatSync;
  const read = io.readFileSync ?? readFileSync;
  const close = io.closeSync ?? closeSync;
  const descriptor = open(path, noFollowReadFlags(io.constants ?? constants));
  try {
    const before = fstat(descriptor);
    if (!before.isFile()) throw new Error(`source is not a regular file: ${path}`);
    if (before.size > individualLimit) return { kind: 'oversized', bytes: before.size };
    if (before.size > aggregateRemaining) return { kind: 'aggregate', bytes: before.size };
    const raw = read(descriptor);
    const after = fstat(descriptor);
    if (!Buffer.isBuffer(raw)) throw new Error(`bounded descriptor read did not return bytes: ${path}`);
    const actual = raw.byteLength;
    if (after.size !== before.size || actual !== before.size || actual > individualLimit || actual > aggregateRemaining) {
      throw new Error(`source changed during bounded descriptor read: ${path}`);
    }
    let body;
    try { body = UTF8_DECODER.decode(raw); }
    catch { throw new Error(`source is not valid UTF-8: ${path}`); }
    return { kind: 'read', bytes: actual, body };
  } finally {
    close(descriptor);
  }
}

function fencedExamples(readme, source) {
  if (!readme) return { items: [], found: 0, dropped: 0, truncatedContent: 0 };
  const examples = [];
  const pattern = /```([^\n]*)\n([\s\S]*?)```/g;
  for (const match of readme.matchAll(pattern)) {
    const before = readme.slice(0, match.index);
    const startLine = before.split('\n').length;
    const rawContent = match[2].trim();
    examples.push({
      language: match[1].trim() || 'text',
      content: rawContent.slice(0, EXAMPLE_CHAR_LIMIT),
      contentTruncated: rawContent.length > EXAMPLE_CHAR_LIMIT,
      sourceId: source.id,
      lines: [startLine, startLine + match[0].split('\n').length - 1],
    });
  }
  const items = examples.slice(0, EXAMPLE_LIMIT);
  return {
    items,
    found: examples.length,
    dropped: Math.max(0, examples.length - items.length),
    truncatedContent: items.filter((example) => example.contentTruncated).length,
  };
}

export function extractPackageEvidence(packageRoot) {
  const root = resolve(packageRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`package root not found: ${root}`);
  const packagePath = join(root, 'package.json');
  if (!existsSync(packagePath)) throw new Error(`package.json not found: ${packagePath}`);
  const packageRead = readDescriptorBounded(packagePath, PACKAGE_JSON_BYTE_LIMIT);
  if (packageRead.kind !== 'read') throw new Error(`package.json exceeds ${PACKAGE_JSON_BYTE_LIMIT} bytes before read`);
  const pkg = JSON.parse(packageRead.body);
  const candidates = walk(root);
  const paths = ['package.json', ...candidates.filter((path) => path !== 'package.json')].slice(0, SOURCE_LIMIT);
  const sources = [];
  const oversized = [];
  const aggregateSkipped = [];
  const sourceBodies = new Map();
  let aggregateBytes = 0;
  for (const path of paths) {
    const bounded = path === 'package.json' ? packageRead
      : readDescriptorBounded(join(root, path), SOURCE_BYTE_LIMIT, SOURCE_AGGREGATE_BYTE_LIMIT - aggregateBytes);
    if (bounded.kind === 'oversized') { oversized.push({ path, bytes: bounded.bytes }); continue; }
    if (bounded.kind === 'aggregate') { aggregateSkipped.push({ path, bytes: bounded.bytes }); continue; }
    aggregateBytes += bounded.bytes;
    sourceBodies.set(path, bounded.body);
    sources.push({ id: sourceId(path), path, sha256: sha(bounded.body), lines: countSourceLines(bounded.body) });
  }
  const readmePath = sources.find((source) => /^README/i.test(source.path))?.path;
  const packageSource = sources.find((source) => source.path === 'package.json');
  if (!packageSource) throw new Error('package.json was not included in the bounded source inventory');
  const readmeSource = sources.find((source) => source.path === readmePath);
  const readme = readmePath ? sourceBodies.get(readmePath) ?? '' : '';
  const examples = fencedExamples(readme, readmeSource ?? packageSource);
  const commands = [
    ...Object.entries(pkg.scripts ?? {}).map(([name, command]) => ({ kind: 'script', name, command })),
    ...Object.entries(typeof pkg.bin === 'string' ? { [pkg.name ?? 'bin']: pkg.bin } : (pkg.bin ?? {}))
      .map(([name, command]) => ({ kind: 'bin', name, command })),
  ];
  const claims = [
    { id: 'package-name', text: String(pkg.name ?? '(unnamed)'), sourceIds: [packageSource.id] },
    { id: 'package-version', text: String(pkg.version ?? 'unknown'), sourceIds: [packageSource.id] },
  ];
  if (pkg.description) claims.push({ id: 'package-description', text: String(pkg.description), sourceIds: [packageSource.id] });
  const truncation = {
    sourceFiles: {
      found: candidates.length, included: sources.length, limit: SOURCE_LIMIT,
      oversizedSkipped: oversized.length, aggregateSkipped: aggregateSkipped.length,
      aggregateBytes, individualByteLimit: SOURCE_BYTE_LIMIT, aggregateByteLimit: SOURCE_AGGREGATE_BYTE_LIMIT,
    },
    readmeExamples: {
      found: examples.found,
      included: examples.items.length,
      dropped: examples.dropped,
      limit: EXAMPLE_LIMIT,
      contentLimit: EXAMPLE_CHAR_LIMIT,
      truncatedContent: examples.truncatedContent,
    },
  };
  const unknowns = ['adoption', 'pricing', 'external compatibility', 'current third-party facts'];
  if (candidates.length > sources.length) unknowns.push(`source inventory truncated: ${sources.length}/${candidates.length}`);
  for (const item of oversized) unknowns.push(`oversized source skipped before read: ${item.path} (${item.bytes} bytes)`);
  for (const item of aggregateSkipped) unknowns.push(`aggregate source budget skipped before read: ${item.path} (${item.bytes} bytes)`);
  if (examples.found > examples.items.length) unknowns.push(`README examples truncated: ${examples.items.length}/${examples.found}`);
  if (examples.truncatedContent > 0) unknowns.push(`README example content truncated: ${examples.truncatedContent}`);
  const result = {
    schema: EVIDENCE_SCHEMA,
    generatedFrom: slash(root),
    package: { name: String(pkg.name ?? '(unnamed)'), version: String(pkg.version ?? 'unknown'), description: String(pkg.description ?? '') },
    sources,
    commands,
    readmeExamples: examples.items,
    claims,
    unknowns,
    truncation,
  };
  assertValid(validateEvidence(result), 'invalid extracted evidence');
  return result;
}

export function main(argv = process.argv.slice(2)) {
  const options = args(argv);
  if (!options.packageRoot || !options.json) throw new Error('usage: extract-package-evidence --pkg <dir> --json <file>');
  const result = extractPackageEvidence(options.packageRoot);
  writeFileSync(resolve(options.json), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`evidence: ${result.sources.length} source(s), ${result.readmeExamples.length} README example(s)\n`);
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try { main(); } catch (error) { console.error(`extract-package-evidence: ${error.message}`); process.exit(1); }
}
