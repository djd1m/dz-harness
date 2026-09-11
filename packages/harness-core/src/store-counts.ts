/** Fast, readonly row counts for the two learning-store tiers. */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface ReadonlyCountDb {
  pragma: (s: string) => void;
  prepare: (q: string) => { get: (...a: unknown[]) => unknown };
  close: () => void;
}

export type StoreRowCount = number | 'unreadable' | 'busy';

export interface StoreCountOptions {
  readonly busyTimeoutMs?: number;
  readonly attempts?: number;
}

type DatabaseRequire = (id: string) => unknown;

function isBusy(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (error as { code?: unknown }).code === 'SQLITE_BUSY';
}

function isInitializing(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (error as { code?: unknown }).code === 'SQLITE_ERROR'
    && typeof (error as { message?: unknown }).message === 'string'
    && (error as { message: string }).message.includes('no such table');
}

const INITIALIZATION_RETRY_WAIT = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

function waitForInitializationRetry(busyTimeoutMs: number): void {
  Atomics.wait(INITIALIZATION_RETRY_WAIT, 0, 0, busyTimeoutMs);
}

function normalizedOptions(options: StoreCountOptions): { busyTimeoutMs: number; attempts: number } {
  return {
    busyTimeoutMs: options.busyTimeoutMs ?? 100,
    attempts: options.attempts ?? 1,
  };
}

export interface LearningStoreRowCounts {
  readonly lexicalRows: StoreRowCount;
  /** Exact active quarantine labels in the selected lexical SQLite tier; absent for fallback/error paths. */
  readonly lexicalQuarantinedRows?: number;
  /** Physical lexical population counted; jsonl and SQLite maxima are not comparable. */
  readonly lexicalSource: 'jsonl' | 'sqlite';
  /** Exact selected physical source. SQLite wins when both stores coexist, matching runtime reads. */
  readonly lexicalSourcePath: string;
  /** Coexisting JSONL is deliberately excluded from the selected SQLite population. */
  readonly lexicalIgnoredRows?: number | 'unreadable';
  readonly lexicalIgnoredSourcePath?: string;
  /**
   * ВСЕ строки зеркала, включая идеи бэклога и книжные единицы. Смысл поля НЕ сужен намеренно:
   * его читает страж стора как признак целостности (отметка высшей точки `vectorMax`), и сужение
   * до уроков уронило бы наблюдение с 1774 до 631 — страж прочитал бы это как обвал стора.
   * Для показателя зеркала в панели есть отдельное поле `vectorLessonRows`.
   */
  readonly vectorRows: StoreRowCount;
  /**
   * Только зеркальные УРОКИ (task_type dz-teach/dz-learning) — величина, сравнимая с `lexicalRows`.
   * Отсутствует, когда зеркала нет или разложить его по родам не удалось: тогда показатель обязан
   * сказать «не читается», а не молчать, будто величины сошлись.
   */
  readonly vectorLessonRows?: number;
  /** Exact active quarantine labels on mirrored lesson rows; absent when the vector tier is missing/unreadable. */
  readonly vectorQuarantinedRows?: number;
  /** Present when the vector store file exists, including when its count is unreadable. */
  readonly vectorSourcePath?: string;
}

function countJsonlRowsReadonly(path: string): number | 'unreadable' {
  if (!existsSync(path)) return 0;
  try {
    return readFileSync(path, 'utf-8').split('\n').filter((line) => line.trim() !== '').length;
  } catch {
    return 'unreadable';
  }
}

/** Best-effort readonly SQLite count with a short busy timeout. */
export function countSqliteRowsReadonly(
  sqlitePath: string,
  table: 'memory_records' | 'reasoning_patterns',
): number | undefined;
export function countSqliteRowsReadonly(
  sqlitePath: string,
  table: 'memory_records' | 'reasoning_patterns',
  options: StoreCountOptions,
  requireModule?: DatabaseRequire,
): StoreRowCount;
export function countSqliteRowsReadonly(
  sqlitePath: string,
  table: 'memory_records' | 'reasoning_patterns',
  options?: StoreCountOptions,
  requireModule: DatabaseRequire = createRequire(import.meta.url),
): number | undefined | StoreRowCount {
  const legacyUndefined = options === undefined;
  const { busyTimeoutMs, attempts } = normalizedOptions(options ?? {});
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const Database = requireModule('better-sqlite3') as new (p: string, o?: object) => ReadonlyCountDb;
      const db = new Database(sqlitePath, { readonly: true });
      try {
        db.pragma(`busy_timeout = ${busyTimeoutMs}`);
        const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt?: unknown };
        return typeof row?.cnt === 'number' ? row.cnt : (legacyUndefined ? undefined : 'unreadable');
      } finally {
        db.close();
      }
    } catch (error) {
      if (isBusy(error)) {
        if (attempt + 1 < attempts) continue;
        return legacyUndefined ? undefined : 'busy';
      }
      if (isInitializing(error)) {
        if (attempt + 1 < attempts) {
          waitForInitializationRetry(busyTimeoutMs);
          continue;
        }
        return legacyUndefined ? undefined : 'unreadable';
      }
      return legacyUndefined ? undefined : 'unreadable';
    }
  }
  return legacyUndefined ? undefined : 'busy';
}

interface SqliteRowsWithQuarantine {
  readonly rows: number;
  readonly quarantinedRows?: number;
  /** Только для зеркала: подсчёт уроков внутри общего объёма. */
  readonly lessonRows?: number;
}

/** One aggregate query on the healthy path; an unsupported metadata shape falls back to total-only. */
function countSqliteRowsWithQuarantineReadonly(
  sqlitePath: string,
  table: 'memory_records' | 'reasoning_patterns',
  options: StoreCountOptions,
  requireModule: DatabaseRequire,
): SqliteRowsWithQuarantine | 'unreadable' | 'busy' {
  const { busyTimeoutMs, attempts } = normalizedOptions(options);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const Database = requireModule('better-sqlite3') as new (p: string, o?: object) => ReadonlyCountDb;
      const db = new Database(sqlitePath, { readonly: true });
      try {
        db.pragma(`busy_timeout = ${busyTimeoutMs}`);
        try {
          const sql = table === 'memory_records'
            ? `SELECT COALESCE(SUM(n), 0) AS cnt,
              COALESCE(SUM(CASE WHEN q_status = 'quarantined' THEN n ELSE 0 END), 0) AS quarantined
            FROM (
              SELECT CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.qStatus') END AS q_status,
                COUNT(*) AS n
              FROM memory_records GROUP BY 1
            )`
            : `SELECT COUNT(*) AS cnt,
              COALESCE(SUM(CASE WHEN task_type IN ('dz-teach', 'dz-learning') THEN 1 ELSE 0 END), 0) AS lessons,
              COALESCE(SUM(CASE WHEN task_type IN ('dz-teach', 'dz-learning')
                AND json_valid(metadata)
                AND json_extract(metadata, '$.qStatus') = 'quarantined' THEN 1 ELSE 0 END), 0) AS quarantined
            FROM reasoning_patterns`;
          const row = db.prepare(sql).get() as { cnt?: unknown; quarantined?: unknown; lessons?: unknown };
          if (typeof row?.cnt !== 'number' || typeof row.quarantined !== 'number') return 'unreadable';
          return {
            rows: row.cnt,
            quarantinedRows: row.quarantined,
            ...(typeof row.lessons === 'number' ? { lessonRows: row.lessons } : {}),
          };
        } catch (error) {
          if (isBusy(error) || isInitializing(error)) throw error;
          // Запасной путь: общий объём берём всегда, а разложение по родам пробуем ОТДЕЛЬНО —
          // схема без `metadata`, но с `task_type` уроки различает, и терять это не за что.
          // Если не различает и её — lessonRows остаётся неизвестным, и показатель обязан сказать
          // «не читается» вместо мнимого совпадения.
          const row = db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as { cnt?: unknown };
          if (typeof row?.cnt !== 'number') return 'unreadable';
          if (table !== 'reasoning_patterns') return { rows: row.cnt };
          try {
            const lesson = db.prepare(
              `SELECT COUNT(*) AS cnt FROM reasoning_patterns
              WHERE task_type IN ('dz-teach', 'dz-learning')`,
            ).get() as { cnt?: unknown };
            return typeof lesson?.cnt === 'number'
              ? { rows: row.cnt, lessonRows: lesson.cnt }
              : { rows: row.cnt };
          } catch (lessonError) {
            if (isBusy(lessonError) || isInitializing(lessonError)) throw lessonError;
            return { rows: row.cnt };
          }
        }
      } finally {
        db.close();
      }
    } catch (error) {
      if (isBusy(error)) {
        if (attempt + 1 < attempts) continue;
        return 'busy';
      }
      if (isInitializing(error)) {
        if (attempt + 1 < attempts) {
          waitForInitializationRetry(busyTimeoutMs);
          continue;
        }
        return 'unreadable';
      }
      return 'unreadable';
    }
  }
  return 'busy';
}

/**
 * Count both protected store populations without opening either store writable.
 * Missing tiers count as zero; an existing tier that cannot be counted is
 * explicitly `unreadable`.
 */
export function countLearningStoreRowsReadonly(
  projectRoot: string,
  options: StoreCountOptions = {},
  requireModule: DatabaseRequire = createRequire(import.meta.url),
): LearningStoreRowCounts {
  const root = resolve(projectRoot);
  const lexicalPath = join(root, '.dz', 'memory', 'patterns.sqlite');
  const jsonlPath = join(root, '.dz', 'patterns.jsonl');
  const vectorPath = join(root, '.dz', 'agentdb.db');
  const vectorExists = existsSync(vectorPath);
  const lexicalSource = existsSync(lexicalPath) ? 'sqlite' : 'jsonl';
  const lexicalSqlite = lexicalSource === 'sqlite'
    ? countSqliteRowsWithQuarantineReadonly(lexicalPath, 'memory_records', options, requireModule)
    : undefined;
  let lexicalRows: StoreRowCount;
  if (lexicalSource === 'sqlite') {
    lexicalRows = typeof lexicalSqlite === 'object' ? lexicalSqlite.rows : lexicalSqlite ?? 'unreadable';
  } else {
    lexicalRows = countJsonlRowsReadonly(jsonlPath);
  }
  const vectorSqlite = vectorExists
    ? countSqliteRowsWithQuarantineReadonly(vectorPath, 'reasoning_patterns', options, requireModule)
    : undefined;
  const ignoredJsonl = lexicalSource === 'sqlite' && existsSync(jsonlPath)
    ? countJsonlRowsReadonly(jsonlPath)
    : undefined;
  return {
    lexicalRows,
    ...(typeof lexicalSqlite !== 'object' || lexicalSqlite.quarantinedRows === undefined ? {} : {
      lexicalQuarantinedRows: lexicalSqlite.quarantinedRows,
    }),
    lexicalSource,
    lexicalSourcePath: lexicalSource === 'sqlite' ? lexicalPath : jsonlPath,
    ...(ignoredJsonl === undefined ? {} : {
      lexicalIgnoredRows: ignoredJsonl,
      lexicalIgnoredSourcePath: jsonlPath,
    }),
    vectorRows: vectorExists
      ? (typeof vectorSqlite === 'object' ? vectorSqlite.rows : vectorSqlite ?? 'unreadable')
      : 0,
    ...(typeof vectorSqlite !== 'object' || vectorSqlite.lessonRows === undefined
      ? {} : { vectorLessonRows: vectorSqlite.lessonRows }),
    ...(typeof vectorSqlite !== 'object' || vectorSqlite.quarantinedRows === undefined ? {} : {
      vectorQuarantinedRows: vectorSqlite.quarantinedRows,
    }),
    ...(vectorExists ? { vectorSourcePath: vectorPath } : {}),
  };
}
