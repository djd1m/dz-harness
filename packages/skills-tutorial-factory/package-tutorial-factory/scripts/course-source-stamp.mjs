#!/usr/bin/env node
// Add top-level course provenance without confusing it with section-level `source` strings.
// Package identity comes from an explicit factory input or the sibling README; version evidence
// comes only from `npm view`. A silent registry leaves version absent rather than guessed.

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const NPM_LINK = /https:\/\/www\.npmjs\.com\/package\/([^\s)]+)/;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function readCourseSource(courseObj) {
  return isRecord(courseObj) && isRecord(courseObj.source) ? courseObj.source : undefined;
}

export function buildCourseSource({ pkg, version, authoredTs, stampedBy } = {}) {
  if (typeof pkg !== 'string' || pkg.trim() === '') {
    throw new TypeError('buildCourseSource: pkg must be a non-empty npm package name');
  }
  if (version !== undefined && (typeof version !== 'string' || !SEMVER.test(version.trim()))) {
    throw new TypeError(`buildCourseSource: version is not valid semver: ${String(version)}`);
  }
  if (authoredTs !== undefined
    && (typeof authoredTs !== 'string' || Number.isNaN(Date.parse(authoredTs)))) {
    throw new TypeError(`buildCourseSource: authoredTs is not an ISO-8601 instant: ${String(authoredTs)}`);
  }

  return {
    package: pkg.trim(),
    ...(version === undefined ? {} : { version: version.trim() }),
    ...(authoredTs === undefined ? {} : { authoredTs }),
    ...(stampedBy === undefined ? {} : { stampedBy }),
  };
}

function packageFromReadme(coursePath) {
  const readmePath = join(dirname(resolve(coursePath)), 'README.md');
  if (!existsSync(readmePath)) return undefined;
  const match = readFileSync(readmePath, 'utf-8').match(NPM_LINK);
  return match?.[1];
}

function parseRegistryVersion(raw) {
  try {
    const parsed = JSON.parse(String(raw));
    return typeof parsed === 'string' && SEMVER.test(parsed.trim()) ? parsed.trim() : undefined;
  } catch {
    const plain = String(raw).trim();
    return SEMVER.test(plain) ? plain : undefined;
  }
}

function registryVersion(pkg) {
  try {
    const raw = execFileSync('npm', ['view', pkg, 'version', '--json'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    });
    return parseRegistryVersion(raw);
  } catch {
    return undefined;
  }
}

function indentationOf(raw) {
  return raw.match(/\n([ \t]+)"[^"\n]+"\s*:/)?.[1] ?? '  ';
}

function appendSource(raw, source) {
  const close = raw.lastIndexOf('}');
  if (close < 0) throw new SyntaxError('course.json has no closing object brace');
  const indent = indentationOf(raw);
  const before = raw.slice(0, close);
  const body = before.replace(/\s+$/, '');
  const trailing = raw.slice(close + 1);
  const sourceJson = JSON.stringify(source, null, indent)
    .split('\n')
    .map((line, index) => index === 0 ? line : indent + line)
    .join('\n');
  return `${body},\n${indent}"source": ${sourceJson}\n}${trailing}`;
}

function serializeWithSource(raw, course, source) {
  if (!hasOwn(course, 'source')) return appendSource(raw, source);
  const indent = indentationOf(raw);
  const trailingNewline = raw.endsWith('\r\n') ? '\r\n' : raw.endsWith('\n') ? '\n' : '';
  return JSON.stringify({ ...course, source }, null, indent) + trailingNewline;
}

function writeAtomic(coursePath, contents) {
  const absolute = resolve(coursePath);
  const tmp = join(dirname(absolute), `.${basename(absolute)}.source-stamp-${process.pid}.tmp`);
  try {
    writeFileSync(tmp, contents, { mode: statSync(absolute).mode });
    renameSync(tmp, absolute);
  } catch (error) {
    try { unlinkSync(tmp); } catch { /* no temporary file was left behind */ }
    throw error;
  }
}

export function stampSource(coursePath, opts = {}) {
  const absolute = resolve(coursePath);
  const raw = readFileSync(absolute, 'utf-8');
  const course = JSON.parse(raw);
  if (!isRecord(course)) throw new TypeError(`stampSource: ${absolute} is not a JSON object`);

  const previous = readCourseSource(course);
  if (opts.skipExisting === true && previous !== undefined) {
    if (!opts.quiet) console.log(`stamp → unchanged (${absolute})`);
    return { changed: false, source: previous };
  }

  const pkg = typeof opts.package === 'string' && opts.package.trim() !== ''
    ? opts.package.trim()
    : packageFromReadme(absolute);
  if (!pkg) {
    throw new Error(`stampSource: ${basename(dirname(absolute))} has no npm package link in README.md`);
  }

  const version = registryVersion(pkg);
  const samePair = previous?.package === pkg && previous?.version === version;
  const authoredTs = opts.omitAuthoredTs === true
    ? undefined
    : samePair && typeof previous.authoredTs === 'string'
      ? previous.authoredTs
      : new Date().toISOString();
  const source = {
    ...buildCourseSource({ pkg, version, authoredTs, stampedBy: opts.stampedBy }),
    ...(typeof previous?.mirrorReceipt === 'string' ? { mirrorReceipt: previous.mirrorReceipt } : {}),
  };
  const next = serializeWithSource(raw, course, source);
  const changed = next !== raw;
  if (changed && opts.dryRun !== true) writeAtomic(absolute, next);

  if (!opts.quiet) {
    if (version === undefined) {
      console.error(`stamp → ${pkg}, version: UNKNOWN (registry silent) — course is E2_UNSTAMPED`);
    } else {
      console.log(`stamp → ${pkg}@${version} (registry) — ${changed ? 'course.json updated' : 'unchanged'}`);
    }
  }
  return { changed, source, package: pkg, version };
}

function cli(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/course-source-stamp.mjs [--course course.json] [--package <npm-name>] [--dry-run]');
    return;
  }
  const opt = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  stampSource(resolve(opt('course', 'course.json')), {
    package: opt('package', undefined),
    dryRun: argv.includes('--dry-run'),
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
