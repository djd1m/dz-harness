/** Isolated bounded subprocess runner used by integration registration probes. */

import { spawn, type ChildProcess } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const PROBE_REDACTION_MARKER = '[REDACTED]';
export const PROBE_TRUNCATION_MARKER = '[TRUNCATED]';
const WORKER_INPUT_MAX_BYTES = 64 * 1024;
const REDACTION_WORDS = ['bearer', 'token', 'secret', 'password', 'apikey', 'api_key', 'api-key'] as const;
const ASSIGNMENT_WORDS = new Set(REDACTION_WORDS.slice(1));

export interface ProbeWorkerRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly streamMaxBytes: number;
  readonly aggregateMaxBytes: number;
}

export interface ProbeWorkerResult {
  readonly status: number | null;
  readonly signal: string | null;
  readonly stdoutBase64: string;
  readonly stderrBase64: string;
  readonly errorCode?: string;
  readonly truncated: boolean;
}

type RedactionState = 'normal' | 'word' | 'passthrough-word' | 'bearer-space' | 'bearer-value' | 'key-space' | 'key-value-space' | 'key-value';

/** Stateful UTF-8 redactor: raw chunks are transformed immediately and are never retained. */
class StreamingProbeRedactor {
  readonly #decoder = new TextDecoder('utf-8', { fatal: true });
  readonly #sanitized: string[] = [];
  #state: RedactionState = 'normal';
  #word = '';
  #keyBuffer = '';
  #invalidUtf8 = false;
  #finished = false;

  write(chunk: Uint8Array): boolean {
    if (this.#finished || this.#invalidUtf8) return false;
    try {
      this.#consume(this.#decoder.decode(chunk, { stream: true }));
      return true;
    } catch {
      this.#invalidUtf8 = true;
      this.#sanitized.length = 0;
      return false;
    }
  }

  finish(): { bytes: Buffer; invalidUtf8: boolean } {
    if (!this.#finished && !this.#invalidUtf8) {
      try {
        this.#consume(this.#decoder.decode());
        if (this.#state === 'word') this.#emit(this.#word);
        else if (this.#state === 'key-space') this.#emit(this.#keyBuffer);
      } catch {
        this.#invalidUtf8 = true;
        this.#sanitized.length = 0;
      }
    }
    this.#finished = true;
    return {
      bytes: this.#invalidUtf8 ? Buffer.alloc(0) : Buffer.from(this.#sanitized.join(''), 'utf8'),
      invalidUtf8: this.#invalidUtf8,
    };
  }

  #emit(value: string): void { this.#sanitized.push(value); }
  #wordChar(value: string): boolean { return /^[A-Za-z0-9_-]$/.test(value); }
  #secretEnd(value: string, comma: boolean): boolean {
    return /\s/.test(value) || value === '"' || value === "'" || (comma && value === ',');
  }

  #consume(text: string): void {
    for (const value of text) this.#character(value);
  }

  #character(value: string): void {
    if (this.#state === 'normal') {
      if (this.#wordChar(value)) { this.#word = value; this.#state = 'word'; }
      else this.#emit(value);
      return;
    }
    if (this.#state === 'word') {
      if (this.#wordChar(value)) {
        this.#word += value;
        if (!REDACTION_WORDS.some((word) => word.startsWith(this.#word.toLowerCase()))) {
          this.#emit(this.#word); this.#word = ''; this.#state = 'passthrough-word';
        }
        return;
      }
      const word = this.#word;
      const lower = word.toLowerCase();
      this.#word = '';
      if (lower === 'bearer' && /\s/.test(value)) {
        this.#emit(word + value); this.#state = 'bearer-space'; return;
      }
      if (ASSIGNMENT_WORDS.has(lower as typeof REDACTION_WORDS[number]) && (/\s/.test(value) || value === ':' || value === '=')) {
        if (value === ':' || value === '=') { this.#emit(word + value); this.#state = 'key-value-space'; }
        else { this.#keyBuffer = word + value; this.#state = 'key-space'; }
        return;
      }
      this.#emit(word); this.#state = 'normal'; this.#character(value); return;
    }
    if (this.#state === 'passthrough-word') {
      if (this.#wordChar(value)) this.#emit(value);
      else { this.#state = 'normal'; this.#character(value); }
      return;
    }
    if (this.#state === 'bearer-space') {
      if (/\s/.test(value)) this.#emit(value);
      else if (this.#secretEnd(value, false)) { this.#state = 'normal'; this.#character(value); }
      else { this.#emit(PROBE_REDACTION_MARKER); this.#state = 'bearer-value'; }
      return;
    }
    if (this.#state === 'bearer-value') {
      if (this.#secretEnd(value, false)) { this.#state = 'normal'; this.#character(value); }
      return;
    }
    if (this.#state === 'key-space') {
      if (/\s/.test(value)) this.#keyBuffer += value;
      else if (value === ':' || value === '=') { this.#emit(this.#keyBuffer + value); this.#keyBuffer = ''; this.#state = 'key-value-space'; }
      else { this.#emit(this.#keyBuffer); this.#keyBuffer = ''; this.#state = 'normal'; this.#character(value); }
      return;
    }
    if (this.#state === 'key-value-space') {
      if (/\s/.test(value)) this.#emit(value);
      else if (this.#secretEnd(value, true)) { this.#state = 'normal'; this.#character(value); }
      else { this.#emit(PROBE_REDACTION_MARKER); this.#state = 'key-value'; }
      return;
    }
    if (this.#secretEnd(value, true)) { this.#state = 'normal'; this.#character(value); }
  }
}

export function redactProbeText(input: string): string {
  const redactor = new StreamingProbeRedactor();
  redactor.write(Buffer.from(input, 'utf8'));
  return redactor.finish().bytes.toString('utf8');
}

function killProcessTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {
      child.kill('SIGKILL');
      return;
    }
  }
  // Windows has no negative-PID process groups. taskkill /T is the native tree
  // primitive; the direct kill remains a fail-safe if taskkill itself is absent.
  const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  killer.once('error', () => child.kill('SIGKILL'));
}

function validateRequest(value: unknown): ProbeWorkerRequest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid worker request');
  const row = value as Record<string, unknown>;
  if (typeof row['command'] !== 'string' || typeof row['cwd'] !== 'string' ||
      !Array.isArray(row['args']) || !row['args'].every((arg) => typeof arg === 'string')) {
    throw new Error('invalid worker command');
  }
  for (const key of ['timeoutMs', 'streamMaxBytes', 'aggregateMaxBytes'] as const) {
    if (!Number.isSafeInteger(row[key]) || (row[key] as number) <= 0) throw new Error(`invalid worker ${key}`);
  }
  return {
    command: row['command'], cwd: row['cwd'], args: row['args'] as string[],
    timeoutMs: row['timeoutMs'] as number,
    streamMaxBytes: row['streamMaxBytes'] as number,
    aggregateMaxBytes: row['aggregateMaxBytes'] as number,
  };
}

function withTruncationMarker(bytes: Buffer, maxBytes: number): Buffer {
  const marker = Buffer.from(PROBE_TRUNCATION_MARKER, 'utf8');
  if (marker.length >= maxBytes) return marker.subarray(0, maxBytes);
  const keep = Math.min(bytes.length, maxBytes - marker.length);
  let prefix = bytes.subarray(0, keep);
  while (prefix.length > 0) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(prefix);
      break;
    } catch {
      prefix = prefix.subarray(0, prefix.length - 1);
    }
  }
  return Buffer.concat([prefix, marker]);
}

export function runProbeWorker(request: ProbeWorkerRequest): Promise<ProbeWorkerResult> {
  return new Promise((resolveResult) => {
    const stdout = new StreamingProbeRedactor();
    const stderr = new StreamingProbeRedactor();
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let truncatedStream: 'stdout' | 'stderr' | undefined;
    let timedOut = false;
    let settled = false;
    let invalidUtf8 = false;
    let spawnError: string | undefined;
    const child = spawn(request.command, [...request.args], {
      cwd: request.cwd,
      detached: process.platform !== 'win32',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const killOnce = (): void => {
      if (!child.killed) killProcessTree(child);
    };
    const capture = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
      if (settled || truncated) return;
      const ownBytes = stream === 'stdout' ? stdoutBytes : stderrBytes;
      const remaining = Math.max(0, Math.min(
        request.streamMaxBytes - ownBytes,
        request.aggregateMaxBytes - stdoutBytes - stderrBytes,
      ));
      const accepted = chunk.subarray(0, Math.min(chunk.length, remaining));
      if (accepted.length > 0 && !(stream === 'stdout' ? stdout : stderr).write(accepted)) {
        invalidUtf8 = true;
        killOnce();
        return;
      }
      if (stream === 'stdout') stdoutBytes += accepted.length;
      else stderrBytes += accepted.length;
      if (accepted.length < chunk.length) {
        truncated = true;
        truncatedStream = stream;
        killOnce();
      }
    };
    child.stdout?.on('data', (chunk: Buffer) => capture('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => capture('stderr', chunk));
    child.once('error', (error: NodeJS.ErrnoException) => {
      spawnError = error.code ?? 'PROCESS_ERROR';
    });
    const timer = setTimeout(() => {
      timedOut = true;
      killOnce();
    }, request.timeoutMs);
    timer.unref();
    child.once('close', (status, signal) => {
      settled = true;
      clearTimeout(timer);
      const cleanOut = stdout.finish();
      const cleanErr = stderr.finish();
      invalidUtf8 ||= cleanOut.invalidUtf8 || cleanErr.invalidUtf8;
      const stdoutLimit = Math.min(
        request.streamMaxBytes,
        Math.max(0, request.aggregateMaxBytes - cleanErr.bytes.length),
      );
      const stderrLimit = Math.min(
        request.streamMaxBytes,
        Math.max(0, request.aggregateMaxBytes - cleanOut.bytes.length),
      );
      const stdoutBytesOut = truncatedStream === 'stdout'
        ? withTruncationMarker(cleanOut.bytes, stdoutLimit)
        : cleanOut.bytes;
      const stderrBytesOut = truncatedStream === 'stderr'
        ? withTruncationMarker(cleanErr.bytes, stderrLimit)
        : cleanErr.bytes;
      resolveResult({
        status,
        signal,
        stdoutBase64: stdoutBytesOut.toString('base64'),
        stderrBase64: stderrBytesOut.toString('base64'),
        ...(timedOut ? { errorCode: 'ETIMEDOUT' }
          : truncated ? { errorCode: 'OUTPUT_TRUNCATED' }
            : invalidUtf8 ? { errorCode: 'INVALID_UTF8' }
              : spawnError !== undefined ? { errorCode: spawnError } : {}),
        truncated,
      });
    });
  });
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > WORKER_INPUT_MAX_BYTES) throw new Error('worker request too large');
    chunks.push(bytes);
  }
  const request = validateRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  process.stdout.write(`${JSON.stringify(await runProbeWorker(request))}\n`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && realpathSync(resolve(invokedPath)) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`integration probe worker failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
