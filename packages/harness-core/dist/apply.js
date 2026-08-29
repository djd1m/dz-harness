/**
 * The additive disk writer — the only part of the harness that writes files.
 *
 * @packageDocumentation
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
/**
 * Write an adapter {@link EmitResult} to disk under `targetRoot`.
 *
 * **Additive (ADR-001):** creates files and parent directories, never deletes,
 * and never overwrites an existing file unless `force` is `true`. A file that
 * already exists (without `force`) is reported in `skipped`, not `written`.
 *
 * @throws if an emit path is absolute or contains a `..` segment.
 */
export function applyEmitResult(emit, options) {
    const written = [];
    const skipped = [];
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
//# sourceMappingURL=apply.js.map