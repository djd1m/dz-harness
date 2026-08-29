/**
 * The additive disk writer — the only part of the harness that writes files.
 *
 * @packageDocumentation
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { EmitResult } from '@dzhechkov/core';

/** Options for {@link applyEmitResult}. */
export interface ApplyOptions {
  /** Root directory the emit's relative paths are written under. */
  readonly targetRoot: string;
  /** Overwrite files that already exist. Default `false` — purely additive. */
  readonly force?: boolean;
}

/** The outcome of {@link applyEmitResult}. */
export interface ApplyReport {
  /** Files written (created, or overwritten under `force`). */
  readonly written: string[];
  /** Files left untouched because they already existed and `force` was off. */
  readonly skipped: string[];
}

/**
 * Write an adapter {@link EmitResult} to disk under `targetRoot`.
 *
 * **Additive (ADR-001):** creates files and parent directories, never deletes,
 * and never overwrites an existing file unless `force` is `true`. A file that
 * already exists (without `force`) is reported in `skipped`, not `written`.
 *
 * @throws if an emit path is absolute or contains a `..` segment.
 */
export function applyEmitResult(emit: EmitResult, options: ApplyOptions): ApplyReport {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of emit.files) {
    if (file.path.startsWith('/') || file.path.split('/').includes('..')) {
      throw new Error(`apply: refusing unsafe emit path ${JSON.stringify(file.path)}`);
    }
    const absolutePath = join(options.targetRoot, file.path);
    if (existsSync(absolutePath) && options.force !== true) {
      skipped.push(file.path);
      continue;
    }
    mkdirSync(dirname(absolutePath), { recursive: true });
    const data = file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content;
    writeFileSync(absolutePath, data);
    written.push(file.path);
  }

  return { written, skipped };
}
