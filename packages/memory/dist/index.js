/**
 * `@dzhechkov/memory` — the harness memory layer.
 *
 * @packageDocumentation
 */
import { createRequire } from 'node:module';
/** Package version. Kept in sync with `package.json`. */
export const MEMORY_VERSION = createRequire(import.meta.url)('../package.json').version;
export { JsonFileBackend } from './json-backend.js';
export { selectBackend } from './cascade.js';
export { SqliteBackend } from './sqlite-backend.js';
export { SqliteProbe } from './sqlite-probe.js';
export { Reflexion } from './reflexion.js';
export { importMemoryMarkdown, MemoryBridge } from './bridge.js';
export { harvestDreamPatterns, dreamPatternToRecord, isSystemWrapper, isNoiseInsight } from './dreaming.js';
//# sourceMappingURL=index.js.map