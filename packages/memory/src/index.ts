/**
 * `@dzhechkov/memory` — the harness memory layer.
 *
 * @packageDocumentation
 */

import { createRequire } from 'node:module';

/** Package version. Kept in sync with `package.json`. */
export const MEMORY_VERSION: string =
  (createRequire(import.meta.url)('../package.json') as { version: string }).version;

export type { MemoryBackend, MemoryQuery, MemoryRecord } from './backend.js';
export { JsonFileBackend } from './json-backend.js';
export type { JsonFileBackendOptions } from './json-backend.js';
export { selectBackend } from './cascade.js';
export type { BackendProbe, CascadeResult } from './cascade.js';
export { SqliteBackend } from './sqlite-backend.js';
export type { SqliteBackendOptions } from './sqlite-backend.js';
export { SqliteProbe } from './sqlite-probe.js';
export type { SqliteProbeOptions } from './sqlite-probe.js';
export { Reflexion } from './reflexion.js';
export type { ReflexionInput } from './reflexion.js';
export { importMemoryMarkdown, MemoryBridge } from './bridge.js';
export type { BridgeOptions } from './bridge.js';
export { harvestDreamPatterns, dreamPatternToRecord, isSystemWrapper, isNoiseInsight } from './dreaming.js';
export type { DreamPattern, DreamOptions } from './dreaming.js';
