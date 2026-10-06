/**
 * Named skill-set presets.
 *
 * A {@link Preset} is a curated list of skill ids. `dz init --preset <name>`
 * uses it to narrow an install to just those skills.
 *
 * @packageDocumentation
 */
/** A named selection of skills. */
export interface Preset {
    /** Preset name, used as `--preset <name>`. */
    readonly name: string;
    /** One-line description. */
    readonly description: string;
    /** Skill ids this preset selects. */
    readonly skills: readonly string[];
    /** npm packages providing these skills; advisory remediation, not a runtime restriction. */
    readonly providers?: readonly string[];
    /** Companion toolkit's full installer (commands/hooks/assets beyond skill installation). */
    readonly toolkit?: string;
}
export declare const PRESETS: {
    readonly academic: Preset;
    readonly meta: Preset;
    readonly 'qe-engineer': Preset;
    readonly bto: Preset;
    readonly reasoning: Preset;
    readonly health: Preset;
    readonly keysarium: Preset;
    readonly 'p-replicator': Preset;
    readonly 'feature-adr': Preset;
    readonly devops: Preset;
    readonly web3: Preset;
    readonly mcp: Preset;
    readonly news: Preset;
    readonly pm: Preset;
};
/** A valid preset name. */
export type PresetName = keyof typeof PRESETS;
/** Every preset name. */
export declare const PRESET_NAMES: PresetName[];
/** Type guard: is `value` a known preset name? */
export declare function isPresetName(value: string): value is PresetName;
/** Look up a preset by name, or `undefined` if there is no such preset. */
export declare function getPreset(name: string): Preset | undefined;
/** Every preset. */
export declare function listPresets(): Preset[];
//# sourceMappingURL=presets.d.ts.map