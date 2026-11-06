/** Bounded, read-only input seam for the optional dz parity mods section. */
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseModRuntimeIntentJson, parseModRuntimeObservationJson, projectModActivation, } from '@dzhechkov/harness-core';
const MAX_BYTES = 64 * 1024;
export class ModParityInputError extends Error {
    input;
    code;
    constructor(input, code) {
        super(`mod parity ${input} ${code}`);
        this.input = input;
        this.code = code;
    }
}
function readBounded(path, cwd, input) {
    const absolute = resolve(cwd, path);
    let fd;
    try {
        if (!lstatSync(absolute).isFile())
            throw new ModParityInputError(input, 'not-regular');
        // O_NONBLOCK prevents a regular-file -> FIFO swap between lstat and open
        // from hanging the diagnostic before fstat can reject the replacement.
        fd = openSync(absolute, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
        if (!fstatSync(fd).isFile())
            throw new ModParityInputError(input, 'not-regular');
        const bytes = Buffer.alloc(MAX_BYTES + 1);
        let read = 0;
        while (read < bytes.length) {
            const n = readSync(fd, bytes, read, bytes.length - read, null);
            if (n === 0)
                break;
            read += n;
        }
        if (read > MAX_BYTES)
            throw new ModParityInputError(input, 'oversize');
        return bytes.subarray(0, read).toString('utf8');
    }
    catch (error) {
        if (error instanceof ModParityInputError)
            throw error;
        if (error.code === 'ENOENT')
            throw new ModParityInputError(input, 'missing');
        throw new ModParityInputError(input, 'not-regular');
    }
    finally {
        if (fd !== undefined)
            closeSync(fd);
    }
}
export function loadModActivation(intentPath, observationPath, cwd) {
    let intent;
    try {
        intent = parseModRuntimeIntentJson(readBounded(intentPath, cwd, 'intent'));
    }
    catch (error) {
        if (error instanceof ModParityInputError)
            throw error;
        throw new ModParityInputError('intent', 'invalid');
    }
    let observation;
    if (observationPath !== undefined) {
        try {
            observation = parseModRuntimeObservationJson(readBounded(observationPath, cwd, 'observation'));
        }
        catch (error) {
            if (error instanceof ModParityInputError)
                throw error;
            throw new ModParityInputError('observation', 'invalid');
        }
    }
    return projectModActivation(intent, observation);
}
//# sourceMappingURL=mods-parity.js.map