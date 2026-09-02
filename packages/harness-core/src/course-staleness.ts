import { compareVersions } from './publish.js';

export type CourseStalenessState =
  | 'S0_SHIPPED'
  | 'S3_TUTORIAL_STALE'
  | 'S4_PACKAGE_BEHIND'
  | 'E2_UNSTAMPED'
  | 'E3_INVALID_VERSION'
  | 'E4_PACKAGE_MISMATCH'
  | 'E5_REGISTRY_UNKNOWN';

export interface CourseStalenessInput {
  readonly source: unknown;
  readonly expectedPackage?: string | null;
  readonly registryVersion?: string | null;
}

export interface CourseStalenessResult {
  readonly state: CourseStalenessState;
  readonly reason: string;
  readonly courseVersion?: string;
  readonly registryVersion?: string;
  readonly package?: string;
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Classify only the version evidence supplied by the caller. Obtaining a registry version is a
 * caller responsibility; this function performs no filesystem, network, clock, or environment I/O.
 */
export function classifyCourseStaleness(input: CourseStalenessInput): CourseStalenessResult {
  const candidate = isRecord(input) ? input : undefined;
  const source = candidate?.source;

  // Presence and shape come first. Unknown values must never reach an equality comparison where
  // two absences could be mistaken for parity.
  if (!isRecord(source)
    || typeof source.package !== 'string'
    || source.package.trim() === ''
    || typeof source.version !== 'string'
    || source.version.trim() === '') {
    return {
      state: 'E2_UNSTAMPED',
      reason: 'course.source.package and course.source.version must both be non-empty strings',
    };
  }

  const packageName = source.package.trim();
  const courseVersion = source.version.trim();
  if (!SEMVER.test(courseVersion)) {
    return {
      state: 'E3_INVALID_VERSION',
      reason: `course.source.version is not valid semver: ${courseVersion}`,
      courseVersion,
      package: packageName,
    };
  }

  const expectedPackage = typeof candidate?.expectedPackage === 'string'
    ? candidate.expectedPackage.trim()
    : candidate?.expectedPackage;
  if (!PACKAGE_NAME.test(packageName)
    || (expectedPackage !== null && expectedPackage !== undefined
      && (!PACKAGE_NAME.test(expectedPackage) || packageName !== expectedPackage))) {
    return {
      state: 'E4_PACKAGE_MISMATCH',
      reason: expectedPackage
        ? `course.source.package ${packageName} does not match expectedPackage ${expectedPackage}`
        : `course.source.package is not a valid npm package name: ${packageName}`,
      courseVersion,
      package: packageName,
    };
  }

  const registryVersion = candidate?.registryVersion;
  if (registryVersion === null || registryVersion === undefined) {
    return {
      state: 'E5_REGISTRY_UNKNOWN',
      reason: 'registryVersion is absent, so package parity is unknown',
      courseVersion,
      package: packageName,
    };
  }
  if (typeof registryVersion !== 'string' || !SEMVER.test(registryVersion.trim())) {
    return {
      state: 'E3_INVALID_VERSION',
      reason: `registryVersion is not valid semver: ${String(registryVersion)}`,
      courseVersion,
      package: packageName,
    };
  }

  const normalizedRegistryVersion = registryVersion.trim();
  const ordering = compareVersions(courseVersion, normalizedRegistryVersion);
  const common = {
    courseVersion,
    registryVersion: normalizedRegistryVersion,
    package: packageName,
  };
  if (ordering === 0) {
    return {
      state: 'S0_SHIPPED',
      reason: 'course.source.version equals registryVersion',
      ...common,
    };
  }
  if (ordering < 0) {
    return {
      state: 'S3_TUTORIAL_STALE',
      reason: 'course.source.version is below registryVersion',
      ...common,
    };
  }
  return {
    state: 'S4_PACKAGE_BEHIND',
    reason: 'course.source.version is above registryVersion',
    ...common,
  };
}
