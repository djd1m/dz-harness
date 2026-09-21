import { isAbsolute, relative, sep } from 'node:path';
/** Strip semver build metadata: `0.8.32+a1b2c3` and `0.8.32` are the same release. */
function withoutBuildMetadata(version) {
    const plus = version.indexOf('+');
    return plus < 0 ? version : version.slice(0, plus);
}
function isInsideRoot(candidate, root) {
    const fromRoot = relative(root, candidate);
    return fromRoot === '' || (!isAbsolute(fromRoot) && fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`));
}
/**
 * Decide whether the executable answering `dz doctor` is the workspace's current instrument.
 *
 * LIMITS NAMED BY INDEPENDENT REVIEW (Claude Sonnet, 2026-09-20), none of them hidden behind a
 * passing test:
 *  - Containment is a case-SENSITIVE path comparison. On a case-insensitive filesystem, or where the
 *    same location is reachable under two path forms, an in-tree binary can read as external. This
 *    repo runs on Linux; the cost of being wrong is one extra `warn` line and never an exit code.
 *  - The caller attributes a version by walking up from the binary to the NEAREST `package.json`.
 *    A shim in package A that loads package B's code is attributed to A, and a broken install with
 *    no own manifest is attributed to whatever ancestor has one. The detail always prints the
 *    resolved binary path so a reader can see which file was actually measured.
 */
export function checkInstrumentFreshness(input) {
    const binary = input.binPath ?? '(unresolved)';
    const binaryVersion = input.binVersion ?? 'unknown';
    const treeVersion = input.treeVersion ?? 'unknown';
    if (!input.isMonorepo) {
        return {
            freshness: 'unknown',
            level: 'ok',
            detail: `not applicable in a consumer project: no packages/@dzhechkov tree version to compare; resolved binary ${binary}; binary version ${binaryVersion}; tree version ${treeVersion}`,
        };
    }
    if (input.binPath !== null && input.projectRootRealpathed && isInsideRoot(input.binPath, input.projectRoot)) {
        return {
            freshness: 'same',
            level: 'ok',
            detail: `resolved binary ${input.binPath} is inside project root ${input.projectRoot}; binary version ${binaryVersion}; tree version ${treeVersion}; this binary is the tree instrument`,
        };
    }
    if (!input.projectRootRealpathed) {
        return {
            freshness: 'unknown',
            level: 'unknown',
            detail: `project root ${input.projectRoot} could not be resolved through its symlinks, so it cannot be told whether the answering binary is the tree's own; version could not be determined safely; resolved binary ${binary}; binary version ${binaryVersion}; tree version ${treeVersion}`,
        };
    }
    if (input.binPath === null || input.binVersion === null || input.treeVersion === null) {
        return {
            freshness: 'unknown',
            level: 'unknown',
            detail: `instrument version could not be determined; resolved binary ${binary}; binary version ${binaryVersion}; tree version ${treeVersion}`,
        };
    }
    // Semver says build metadata after `+` does not participate in equality, so a pipeline that
    // stamps a commit hash onto the version must not read as a stale instrument.
    if (withoutBuildMetadata(input.binVersion) === withoutBuildMetadata(input.treeVersion)) {
        return {
            freshness: 'same',
            level: 'ok',
            detail: `resolved binary ${input.binPath}; binary version ${input.binVersion}; tree version ${input.treeVersion}; versions match`,
        };
    }
    return {
        freshness: 'stale',
        level: 'warn',
        detail: `resolved binary ${input.binPath}; binary version ${input.binVersion}; tree version ${input.treeVersion}; the answering instrument is stale`,
    };
}
/** Decide whether enabled bandit re-ranking has the on-disk state needed to operate. */
export function checkRankingState(input) {
    const binary = input.binPath ?? '(unresolved)';
    if (!input.flagOn) {
        return {
            level: 'ok',
            detail: `bandit re-ranking feature is off; no state is expected at ${input.statePath}; answering binary ${binary}`,
        };
    }
    if (input.stateExists) {
        return {
            level: 'ok',
            detail: `bandit re-ranking is on and state is present at ${input.statePath}; answering binary ${binary}`,
        };
    }
    return {
        level: 'warn',
        detail: `bandit re-ranking is on but state is absent at ${input.statePath}; answering binary ${binary}`,
    };
}
//# sourceMappingURL=doctor-instrument.js.map