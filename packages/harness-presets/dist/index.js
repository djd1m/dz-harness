/**
 * `@dzhechkov/harness-presets` — named skill-set presets for `dz init`.
 *
 * @packageDocumentation
 */
import { createRequire } from 'node:module';
/** Package version. Kept in sync with `package.json`. */
export const HARNESS_PRESETS_VERSION = createRequire(import.meta.url)('../package.json').version;
export { getPreset, isPresetName, listPresets, PRESET_NAMES, PRESETS } from './presets.js';
//# sourceMappingURL=index.js.map