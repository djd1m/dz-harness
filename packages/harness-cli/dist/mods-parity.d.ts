import { type ModActivationProjection } from '@dzhechkov/harness-core';
export declare class ModParityInputError extends Error {
    readonly input: 'intent' | 'observation';
    readonly code: 'missing' | 'not-regular' | 'oversize' | 'invalid';
    constructor(input: 'intent' | 'observation', code: 'missing' | 'not-regular' | 'oversize' | 'invalid');
}
export declare function loadModActivation(intentPath: string, observationPath: string | undefined, cwd: string): ModActivationProjection;
//# sourceMappingURL=mods-parity.d.ts.map