import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXIT = Object.freeze({
  OK: 0,
  ERROR: 1,
  USAGE_OR_SCHEMA: 2,
  SIZE_REFUSED: 3,
  PREFLIGHT_MISSING: 4,
  SITE_INVALID: 5,
  CLEANROOM_VIOLATION: 6,
  CONFIDENTIAL_REFUSED: 7,
  PUBLISH_NOT_LIVE: 8,
  INCONCLUSIVE: 9,
});

export class CliError extends Error {
  constructor(message, exitCode = EXIT.ERROR) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

export function parseArgs(argv, spec) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new CliError(`неизвестный аргумент: ${token}`, EXIT.USAGE_OR_SCHEMA);
    const key = token.slice(2);
    if (!(key in spec)) throw new CliError(`неизвестный флаг: --${key}`, EXIT.USAGE_OR_SCHEMA);
    if (spec[key] === 'boolean') result[key] = true;
    else {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        throw new CliError(`--${key} требует значение`, EXIT.USAGE_OR_SCHEMA);
      }
      result[key] = argv[++i];
    }
  }
  for (const [key, type] of Object.entries(spec)) {
    if (type === 'required' && !(key in result)) throw new CliError(`--${key} обязателен`, EXIT.USAGE_OR_SCHEMA);
  }
  return result;
}

export const readJson = (path) => {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new CliError(`${path}: JSON не прочитан — ${error.message}`, EXIT.USAGE_OR_SCHEMA); }
};

export function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  renameSync(temp, path);
}

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const sha256File = (path) => sha256(readFileSync(path));
export const sortedDir = (path, options) => readdirSync(path, options).sort((a, b) => {
  const left = typeof a === 'string' ? a : a.name;
  const right = typeof b === 'string' ? b : b.name;
  return left.localeCompare(right);
});
export const formatBytes = (bytes) => new Intl.NumberFormat('ru-RU').format(bytes) + ' B';
export const receipt = (name, detail) => console.log(`✓ ${name} — ${detail}`);
export const refusal = (name, detail, exitCode) => new CliError(`✗ ${name} — ${detail}`, exitCode);

export function mediaDigest(entries) {
  return sha256(entries.slice().sort((a, b) => a.rel.localeCompare(b.rel))
    .map((entry) => `${entry.rel} ${entry.sha256}`).join('\n') + '\n');
}

export function isLoopback(value) {
  try { return ['127.0.0.1', 'localhost', '::1'].includes(new URL(value).hostname); }
  catch { return false; }
}

export function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, { encoding: 'utf8', ...options });
  if (result.status === 0) return result.stdout || '';
  const error = result.error || new Error(`${commandName} завершился с кодом ${result.status}: ${(result.stderr || '').trim()}`);
  error.status = result.status;
  error.stdout = result.stdout;
  error.stderr = result.stderr;
  throw error;
}

export function runCli(main, metaUrl) {
  if (process.argv[1] && fileURLToPath(metaUrl) === process.argv[1]) {
    Promise.resolve(main()).catch((error) => {
      console.error(error instanceof CliError ? error.message : `✗ ошибка — ${error.stack || error}`);
      process.exit(error instanceof CliError ? error.exitCode : EXIT.ERROR);
    });
  }
}

export function fileRecord(root, rel) {
  const path = join(root, rel);
  return { rel, bytes: statSync(path).size, sha256: sha256File(path) };
}
