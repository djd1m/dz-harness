/**
 * The backend cascade — probe optional backends, fall back gracefully.
 *
 * Heavier backends (a vector / embedding store, `agentdb`, `sql.js`) can be
 * registered as probes. If none initialises, a guaranteed fallback is used.
 * This keeps such backends *optional* — never a hard dependency.
 *
 * @packageDocumentation
 */

import type { MemoryBackend } from './backend.js';

/** A candidate backend the cascade may select. */
export interface BackendProbe {
  /** Probe name, for the `tried` log. */
  readonly name: string;
  /** Try to create the backend; resolve `undefined` (or throw) if unavailable. */
  create(): Promise<MemoryBackend | undefined>;
}

/** The outcome of {@link selectBackend}. */
export interface CascadeResult {
  /** The selected backend. */
  readonly backend: MemoryBackend;
  /** Name of the selected backend (probe name, or the fallback's name). */
  readonly selected: string;
  /** Probe names attempted, in order. */
  readonly tried: string[];
}

/**
 * Walk `probes` in order; return the first backend that initialises. If every
 * probe is unavailable (returns `undefined` or throws), return `fallback`.
 */
export async function selectBackend(
  probes: readonly BackendProbe[],
  fallback: MemoryBackend,
): Promise<CascadeResult> {
  const tried: string[] = [];
  for (const probe of probes) {
    tried.push(probe.name);
    try {
      const backend = await probe.create();
      if (backend !== undefined) {
        return { backend, selected: probe.name, tried };
      }
    } catch {
      // probe unavailable — fall through to the next
    }
  }
  return { backend: fallback, selected: fallback.name, tried };
}
