export const VOLUME_SHADOW_SCHEMA_VERSION = 'volume-shadow/v1' as const;

export const VOLUME_SHADOW_RULE_IDS = [
  'template-context-token-weight',
  'template-context-largest-file-share',
  'feature-artifact-diff-ratio',
  'feature-tier-artifact-set',
] as const;

export type VolumeShadowRuleId = typeof VOLUME_SHADOW_RULE_IDS[number];
export type FeatureTier = 'S' | 'M' | 'L' | 'XL';
export type VolumeObservationStatus = 'measured' | 'within-reference' | 'outside-reference' | 'unknown';

export const VOLUME_SCOPE = {
  included: [
    'templates/.claude/rules/*.md',
    'templates/.claude/commands/*.md',
    'templates/.claude/skills/**/SKILL.md',
    'features/<slug>/00-09*.md',
    'features/<slug>/03_adr/**',
    'features/<slug>/07_code_changes/**',
  ],
  excluded: [
    'comment-code-density',
    'comment-count',
    'code-line-count',
    'prose-classification',
    'src/**',
    'test/**',
  ],
} as const;

export interface VolumeReference {
  readonly kind: 'measured-starting-point' | 'pipeline-contract';
  readonly source: string;
  readonly measuredAt?: string;
  readonly sampleSize?: number;
  readonly low?: number;
  readonly high?: number;
  readonly numerator?: number;
  readonly denominator?: number;
  readonly expected?: readonly string[];
  readonly caveat?: string;
}

type ObservationOperand = number | string | null | readonly string[];

export interface GuardObservation {
  readonly schemaVersion: typeof VOLUME_SHADOW_SCHEMA_VERSION;
  readonly rule: VolumeShadowRuleId;
  readonly metric: string;
  readonly scope: string;
  readonly status: VolumeObservationStatus;
  readonly value: number | readonly string[] | null;
  readonly unit: 'estimated_tokens' | 'fraction_of_corpus' | 'byte_ratio' | 'artifact_set';
  readonly signal: boolean;
  readonly operands: Readonly<Record<string, ObservationOperand>>;
  readonly reference?: VolumeReference;
  readonly method: string;
  readonly detail: string;
}

export interface VolumeCollectionState {
  readonly complete: boolean;
  readonly reason?: string;
  readonly detail?: string;
}

export interface TemplateVolumeFileFact {
  readonly path: string;
  readonly kind: string;
  readonly bytes: number;
  readonly cyrillicUtf8Bytes: number;
}

export interface TemplateVolumeTargetFact {
  readonly target: string;
  readonly files: readonly TemplateVolumeFileFact[];
  readonly collection?: VolumeCollectionState;
}

export interface FeatureArtifactFact {
  readonly path: string;
  readonly bytes: number;
}

export interface FeatureDiffFact {
  readonly attributable: boolean;
  readonly bytes?: number;
  readonly base?: string;
  readonly head?: string;
  readonly method?: string;
  readonly excludedFeaturePath?: string;
  readonly reason?: string;
}

export interface FeatureVolumeFact {
  readonly slug: string;
  readonly tier?: FeatureTier;
  readonly activeSteps?: readonly (number | string)[];
  readonly namedConsumers?: readonly string[];
  readonly lifecycle?: { readonly phase: 'in-progress' | 'complete'; readonly completedThroughStep?: number };
  readonly artifacts: readonly FeatureArtifactFact[];
  readonly diff?: FeatureDiffFact;
  readonly collection?: VolumeCollectionState;
}

export interface VolumeShadowInput {
  readonly templates?: readonly TemplateVolumeTargetFact[];
  readonly features?: readonly FeatureVolumeFact[];
}

export interface VolumeShadowSignal {
  readonly rule: VolumeShadowRuleId;
  readonly detail: string;
}

export interface VolumeShadowResult {
  readonly observations: readonly GuardObservation[];
  readonly signals: readonly VolumeShadowSignal[];
  readonly notes: readonly string[];
}

export type TemplateTokenEstimate =
  | {
      readonly status: 'measured';
      readonly bytes: number;
      readonly cyrillicUtf8Bytes: number;
      readonly divisor: 2.5 | 4;
      readonly estimatedTokens: number;
      readonly method: 'utf8-bytes-divisor/v1';
    }
  | { readonly status: 'unknown'; readonly reason: string };

const MEASUREMENT_SOURCE = 'docs/research/volume-density-2026-08-30/01-measurement.md';
const MEASURED_TARGET = '@dzhechkov/p-replicator';
const TOKEN_WEIGHT_START = 80_755;
const LARGEST_NUMERATOR_START = 11_730;
const LARGEST_DENOMINATOR_START = 80_755;
const ARTIFACT_RATIO_LOW = 1.03;
const ARTIFACT_RATIO_HIGH = 2.06;
const EMPTY_RESULT: VolumeShadowResult = { observations: [], signals: [], notes: [] };

const TEMPLATE_REFERENCE: VolumeReference = {
  kind: 'measured-starting-point',
  source: MEASUREMENT_SOURCE,
  measuredAt: '2026-08-30',
  sampleSize: 28,
  high: TOKEN_WEIGHT_START,
  caveat: 'rules and commands are standing context; full skill bodies are conditional on invocation',
};

const LARGEST_REFERENCE: VolumeReference = {
  kind: 'measured-starting-point',
  source: MEASUREMENT_SOURCE,
  measuredAt: '2026-08-30',
  sampleSize: 28,
  numerator: LARGEST_NUMERATOR_START,
  denominator: LARGEST_DENOMINATOR_START,
  high: LARGEST_NUMERATOR_START / LARGEST_DENOMINATOR_START,
};

const RATIO_REFERENCE: VolumeReference = {
  kind: 'measured-starting-point',
  source: MEASUREMENT_SOURCE,
  measuredAt: '2026-08-30',
  sampleSize: 5,
  low: ARTIFACT_RATIO_LOW,
  high: ARTIFACT_RATIO_HIGH,
  caveat: 'denominator is attributable unified-diff bytes, a proxy rather than net source bytes',
};

const RULE_ORDER = new Map<string, number>(VOLUME_SHADOW_RULE_IDS.map((id, index) => [id, index]));

function boundedDetail(value: unknown): string {
  const text = typeof value === 'string' && value.trim() !== '' ? value.trim() : 'evidence unavailable';
  return text.replace(/\s+/g, ' ').slice(0, 240);
}

function safeRelativePath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '' || value.includes('\0')) return undefined;
  const path = value.replace(/\\/g, '/').replace(/^\.\//, '');
  if (path.startsWith('/') || /^[A-Za-z]:\//.test(path)) return undefined;
  const parts = path.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return undefined;
  return parts.join('/');
}

function validByteCount(value: unknown, allowZero = false): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && (allowZero ? value >= 0 : value > 0);
}

export function estimateTemplateTokens(bytes: unknown, cyrillicUtf8Bytes: unknown): TemplateTokenEstimate {
  if (!validByteCount(bytes) || !validByteCount(cyrillicUtf8Bytes, true) || cyrillicUtf8Bytes > bytes) {
    return { status: 'unknown', reason: 'invalid-byte-count' };
  }
  const divisor = cyrillicUtf8Bytes / bytes > 0.5 ? 2.5 : 4;
  return {
    status: 'measured',
    bytes,
    cyrillicUtf8Bytes,
    divisor,
    estimatedTokens: bytes / divisor,
    method: 'utf8-bytes-divisor/v1',
  };
}

function unknownObservation(
  rule: VolumeShadowRuleId,
  metric: string,
  scope: string,
  unit: GuardObservation['unit'],
  reason: string,
  detail?: string,
): GuardObservation {
  const why = detail === undefined ? boundedDetail(reason) : `${boundedDetail(reason)}: ${boundedDetail(detail)}`;
  return {
    schemaVersion: VOLUME_SHADOW_SCHEMA_VERSION,
    rule,
    metric,
    scope,
    status: 'unknown',
    value: null,
    unit,
    signal: false,
    operands: { reason },
    method: rule.startsWith('template-') ? 'utf8-bytes-divisor/v1' : 'feature-volume/v1',
    detail: `unknown: ${why}`,
  };
}

function unknownTemplateTarget(scope: string, reason: string, detail?: string): GuardObservation[] {
  return [
    unknownObservation(
      'template-context-token-weight',
      'replicated-context-estimated-tokens',
      scope,
      'estimated_tokens',
      reason,
      detail,
    ),
    unknownObservation(
      'template-context-largest-file-share',
      'largest-context-file-share',
      scope,
      'fraction_of_corpus',
      reason,
      detail,
    ),
  ];
}

function unknownFeature(scope: string, reason: string, detail?: string): GuardObservation[] {
  return [
    unknownObservation(
      'feature-artifact-diff-ratio',
      'feature-artifact-diff-ratio',
      scope,
      'byte_ratio',
      reason,
      detail,
    ),
    unknownObservation(
      'feature-tier-artifact-set',
      'feature-tier-artifacts',
      scope,
      'artifact_set',
      reason,
      detail,
    ),
  ];
}

export function unknownVolumeShadow(reason: string, detail?: string): VolumeShadowResult {
  const observations = [
    ...unknownTemplateTarget('volume-input', reason, detail),
    ...unknownFeature('volume-input', reason, detail),
  ];
  return {
    observations,
    signals: [],
    notes: observations.map((observation) => `${observation.rule} ${observation.scope}: ${observation.detail}`),
  };
}

type TemplateKind = 'rules' | 'commands' | 'skills';

function classifyTemplateFact(raw: unknown):
  | { readonly status: 'excluded' }
  | { readonly status: 'unknown'; readonly reason: string }
  | { readonly status: 'measured'; readonly path: string; readonly kind: TemplateKind; readonly estimate: Extract<TemplateTokenEstimate, { status: 'measured' }> } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { status: 'unknown', reason: 'malformed-file-fact' };
  const fact = raw as Partial<TemplateVolumeFileFact>;
  if (typeof fact.kind === 'string' && (VOLUME_SCOPE.excluded as readonly string[]).includes(fact.kind)) {
    return { status: 'excluded' };
  }
  const path = safeRelativePath(fact.path);
  if (path === undefined) return { status: 'unknown', reason: 'unsafe-file-path' };
  const kind = fact.kind === 'comment-code-density' ? 'rules' : fact.kind;
  if (kind !== 'rules' && kind !== 'commands' && kind !== 'skills') {
    return { status: 'unknown', reason: 'file-outside-closed-scope' };
  }
  const pathFits = kind === 'rules'
    ? fact.kind === 'comment-code-density' || /^templates\/\.claude\/rules\/[^/]+\.md$/.test(path)
    : kind === 'commands'
      ? /^templates\/\.claude\/commands\/[^/]+\.md$/.test(path)
      : /^templates\/\.claude\/skills\/.+\/SKILL\.md$/.test(path);
  if (!pathFits) return { status: 'unknown', reason: 'file-outside-closed-scope' };
  const estimate = estimateTemplateTokens(fact.bytes, fact.cyrillicUtf8Bytes);
  if (estimate.status === 'unknown') return estimate;
  return { status: 'measured', path, kind, estimate };
}

function evaluateTemplateTarget(raw: unknown): GuardObservation[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return unknownTemplateTarget('unknown-target', 'malformed-target-fact');
  }
  const target = raw as Partial<TemplateVolumeTargetFact>;
  const scope = typeof target.target === 'string' && target.target.trim() !== ''
    ? boundedDetail(target.target)
    : 'unknown-target';
  if (target.collection?.complete === false) {
    return unknownTemplateTarget(scope, boundedDetail(target.collection.reason ?? 'incomplete-template-scan'), target.collection.detail);
  }
  if (!Array.isArray(target.files)) return unknownTemplateTarget(scope, 'malformed-template-files');

  const rows: Extract<ReturnType<typeof classifyTemplateFact>, { status: 'measured' }>[] = [];
  const paths = new Set<string>();
  for (const candidate of target.files) {
    const row = classifyTemplateFact(candidate);
    if (row.status === 'excluded') continue;
    if (row.status === 'unknown') return unknownTemplateTarget(scope, row.reason);
    if (paths.has(row.path)) return unknownTemplateTarget(scope, 'duplicate-template-path', row.path);
    paths.add(row.path);
    rows.push(row);
  }
  rows.sort((a, b) => a.path.localeCompare(b.path));
  if (rows.length === 0) return unknownTemplateTarget(scope, 'empty-template-corpus');

  let bytes = 0;
  let total = 0;
  let rules = 0;
  let commands = 0;
  let skills = 0;
  let largest = rows[0]!;
  for (const row of rows) {
    bytes += row.estimate.bytes;
    total += row.estimate.estimatedTokens;
    if (row.kind === 'rules') rules += row.estimate.estimatedTokens;
    if (row.kind === 'commands') commands += row.estimate.estimatedTokens;
    if (row.kind === 'skills') skills += row.estimate.estimatedTokens;
    if (row.estimate.estimatedTokens > largest.estimate.estimatedTokens) largest = row;
  }
  const hasReference = scope === MEASURED_TARGET;
  const totalSignal = hasReference && total > TOKEN_WEIGHT_START;
  const largestFraction = largest.estimate.estimatedTokens / total;
  const largestSignal = hasReference && largestFraction > LARGEST_NUMERATOR_START / LARGEST_DENOMINATOR_START;
  const totalStatus: VolumeObservationStatus = hasReference
    ? totalSignal ? 'outside-reference' : 'within-reference'
    : 'measured';
  const largestStatus: VolumeObservationStatus = hasReference
    ? largestSignal ? 'outside-reference' : 'within-reference'
    : 'measured';

  return [
    {
      schemaVersion: VOLUME_SHADOW_SCHEMA_VERSION,
      rule: 'template-context-token-weight',
      metric: 'replicated-context-estimated-tokens',
      scope,
      status: totalStatus,
      value: total,
      unit: 'estimated_tokens',
      signal: totalSignal,
      operands: {
        bytes,
        fileCount: rows.length,
        rulesEstimatedTokens: rules,
        commandsEstimatedTokens: commands,
        conditionalSkillsEstimatedTokens: skills,
      },
      ...(hasReference ? { reference: TEMPLATE_REFERENCE } : {}),
      method: 'utf8-bytes-divisor/v1',
      detail: `${total} estimated_tokens across ${rows.length} files; rules/commands are standing context and skill bodies are conditional on invocation`,
    },
    {
      schemaVersion: VOLUME_SHADOW_SCHEMA_VERSION,
      rule: 'template-context-largest-file-share',
      metric: 'largest-context-file-share',
      scope,
      status: largestStatus,
      value: largestFraction,
      unit: 'fraction_of_corpus',
      signal: largestSignal,
      operands: {
        path: largest.path,
        numeratorEstimatedTokens: largest.estimate.estimatedTokens,
        denominatorEstimatedTokens: total,
      },
      ...(hasReference ? { reference: LARGEST_REFERENCE } : {}),
      method: 'utf8-bytes-divisor/v1',
      detail: `${largest.path} contributes ${largest.estimate.estimatedTokens}/${total} estimated_tokens (${largestFraction})`,
    },
  ];
}

const ARTIFACT_STEP = new Map<string, number>([
  ['00_complexity_assessment.md', 0],
  ['01_requirements.md', 1],
  ['02_research.md', 2],
  ['03_adr/', 3],
  ['03.5_ideation_report.md', 3.5],
  ['04_domain_model.md', 4],
  ['05_architecture.md', 5],
  ['06_implementation_plan.md', 6],
  ['07_code_changes/change_manifest.md', 7],
  ['08_qe_report.md', 8],
  ['09_fleet_qe_assessment.md', 9],
  ['README.md', 8],
]);

const STEP_ARTIFACT = new Map<string, string[]>([
  ['0', ['00_complexity_assessment.md']],
  ['1', ['01_requirements.md']],
  ['2', ['02_research.md']],
  ['3', ['03_adr/']],
  ['3.5', ['03.5_ideation_report.md']],
  ['4', ['04_domain_model.md']],
  ['5', ['05_architecture.md']],
  ['6', ['06_implementation_plan.md']],
  ['7', ['07_code_changes/change_manifest.md']],
  ['8', ['08_qe_report.md', 'README.md']],
  ['9', ['09_fleet_qe_assessment.md']],
]);

function normalizedStep(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && /^(?:[0-9]|10)(?:\.5)?$/.test(value.trim())) return value.trim();
  return undefined;
}

export function expectedFeatureArtifacts(tier: FeatureTier, activeSteps: readonly (number | string)[]): readonly string[] {
  const expected = new Set<string>([
    '00_complexity_assessment.md',
    '01_requirements.md',
    '06_implementation_plan.md',
    '07_code_changes/change_manifest.md',
    '08_qe_report.md',
    'README.md',
  ]);
  if (tier === 'M' || tier === 'L' || tier === 'XL') {
    expected.add('03_adr/');
    expected.add('03.5_ideation_report.md');
    expected.add('05_architecture.md');
  }
  if (tier === 'L' || tier === 'XL') {
    expected.add('02_research.md');
    expected.add('04_domain_model.md');
    expected.add('09_fleet_qe_assessment.md');
  }
  for (const raw of activeSteps) {
    const step = normalizedStep(raw);
    if (step === undefined) continue;
    for (const artifact of STEP_ARTIFACT.get(step) ?? []) expected.add(artifact);
  }
  return [...expected].sort();
}

function isArtifactContentPath(path: string): boolean {
  return /^(?:0[0-9](?:[_.-][^/]*)?\.md)$/.test(path)
    || /^03_adr\/.+$/.test(path)
    || /^07_code_changes\/.+$/.test(path);
}

function isExpectedPresent(expected: string, present: ReadonlySet<string>): boolean {
  if (expected.endsWith('/')) return [...present].some((path) => path.startsWith(expected));
  return present.has(expected);
}

function dueArtifacts(
  expected: readonly string[],
  lifecycle: FeatureVolumeFact['lifecycle'],
): readonly string[] | undefined {
  if (lifecycle === undefined || lifecycle === null || typeof lifecycle !== 'object') return undefined;
  if (lifecycle.phase === 'complete') return expected;
  const through = lifecycle.completedThroughStep;
  if (typeof through !== 'number' || !Number.isFinite(through) || through < 0 || through > 10) return undefined;
  return expected.filter((artifact) => (ARTIFACT_STEP.get(artifact) ?? Number.POSITIVE_INFINITY) <= through);
}

function validTier(value: unknown): value is FeatureTier {
  return value === 'S' || value === 'M' || value === 'L' || value === 'XL';
}

function evaluateFeature(raw: unknown): GuardObservation[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return unknownFeature('unknown-feature', 'malformed-feature-fact');
  }
  const feature = raw as Partial<FeatureVolumeFact>;
  const slugPath = safeRelativePath(feature.slug);
  const scope = slugPath !== undefined && !slugPath.includes('/') ? slugPath : 'unknown-feature';
  if (feature.collection?.complete === false) {
    return unknownFeature(scope, boundedDetail(feature.collection.reason ?? 'incomplete-feature-scan'), feature.collection.detail);
  }
  if (!Array.isArray(feature.artifacts)) return unknownFeature(scope, 'malformed-artifact-files');

  let artifactBytes = 0;
  const present = new Set<string>();
  for (const rawArtifact of feature.artifacts) {
    if (!rawArtifact || typeof rawArtifact !== 'object' || Array.isArray(rawArtifact)) {
      return unknownFeature(scope, 'malformed-artifact-fact');
    }
    const artifact = rawArtifact as Partial<FeatureArtifactFact>;
    const path = safeRelativePath(artifact.path);
    if (path === undefined) return unknownFeature(scope, 'unsafe-artifact-path');
    if (present.has(path)) return unknownFeature(scope, 'duplicate-artifact-path', path);
    present.add(path);
    if (!isArtifactContentPath(path)) continue;
    if (!validByteCount(artifact.bytes)) return unknownFeature(scope, 'invalid-artifact-byte-count', path);
    artifactBytes += artifact.bytes;
  }

  const ratioObservation = evaluateArtifactRatio(scope, artifactBytes, feature.diff);
  const artifactObservation = evaluateArtifactSet(feature, scope, present);
  return [ratioObservation, artifactObservation];
}

function evaluateArtifactRatio(
  scope: string,
  artifactBytes: number,
  diff: FeatureVolumeFact['diff'],
): GuardObservation {
  if (!validByteCount(artifactBytes)) {
    return unknownObservation(
      'feature-artifact-diff-ratio',
      'feature-artifact-diff-ratio',
      scope,
      'byte_ratio',
      'empty-artifact-scope',
    );
  }
  if (!diff || typeof diff !== 'object' || diff.attributable !== true) {
    return unknownObservation(
      'feature-artifact-diff-ratio',
      'feature-artifact-diff-ratio',
      scope,
      'byte_ratio',
      boundedDetail(diff?.reason ?? 'unattributable-diff'),
    );
  }
  if (!validByteCount(diff.bytes)) {
    return unknownObservation(
      'feature-artifact-diff-ratio',
      'feature-artifact-diff-ratio',
      scope,
      'byte_ratio',
      diff.bytes === 0 ? 'zero-diff-denominator' : 'invalid-diff-denominator',
    );
  }
  const ratio = artifactBytes / diff.bytes;
  const signal = ratio < ARTIFACT_RATIO_LOW || ratio > ARTIFACT_RATIO_HIGH;
  return {
    schemaVersion: VOLUME_SHADOW_SCHEMA_VERSION,
    rule: 'feature-artifact-diff-ratio',
    metric: 'feature-artifact-diff-ratio',
    scope,
    status: signal ? 'outside-reference' : 'within-reference',
    value: ratio,
    unit: 'byte_ratio',
    signal,
    operands: {
      artifactBytes,
      unifiedDiffBytes: diff.bytes,
      base: boundedDetail(diff.base ?? 'working-tree-base'),
      head: boundedDetail(diff.head ?? 'working-tree'),
      excludedFeaturePath: boundedDetail(diff.excludedFeaturePath ?? `features/${scope}/`),
    },
    reference: RATIO_REFERENCE,
    method: boundedDetail(diff.method ?? 'git-unified-diff-bytes/v1'),
    detail: `${artifactBytes}/${diff.bytes} artifact-to-unified-diff bytes = ${ratio}; unified-diff bytes are a proxy`,
  };
}

function evaluateArtifactSet(
  feature: Partial<FeatureVolumeFact>,
  scope: string,
  present: ReadonlySet<string>,
): GuardObservation {
  if (!validTier(feature.tier)) {
    return unknownObservation(
      'feature-tier-artifact-set',
      'feature-tier-artifacts',
      scope,
      'artifact_set',
      'tier-unavailable',
    );
  }
  if (!Array.isArray(feature.activeSteps)) {
    return unknownObservation(
      'feature-tier-artifact-set',
      'feature-tier-artifacts',
      scope,
      'artifact_set',
      'active-steps-unavailable',
    );
  }
  if (feature.activeSteps.some((step) => normalizedStep(step) === undefined)) {
    return unknownObservation(
      'feature-tier-artifact-set',
      'feature-tier-artifacts',
      scope,
      'artifact_set',
      'active-steps-malformed',
    );
  }
  const expected = new Set(expectedFeatureArtifacts(feature.tier, feature.activeSteps));
  if (feature.namedConsumers !== undefined) {
    if (!Array.isArray(feature.namedConsumers)) {
      return unknownObservation(
        'feature-tier-artifact-set',
        'feature-tier-artifacts',
        scope,
        'artifact_set',
        'consumer-artifacts-malformed',
      );
    }
    for (const raw of feature.namedConsumers) {
      const artifact = safeRelativePath(raw);
      if (artifact === undefined || !ARTIFACT_STEP.has(artifact)) {
        return unknownObservation(
          'feature-tier-artifact-set',
          'feature-tier-artifacts',
          scope,
          'artifact_set',
          'consumer-artifact-outside-contract',
        );
      }
      expected.add(artifact);
    }
  }
  const due = dueArtifacts([...expected].sort(), feature.lifecycle);
  if (due === undefined) {
    return unknownObservation(
      'feature-tier-artifact-set',
      'feature-tier-artifacts',
      scope,
      'artifact_set',
      'lifecycle-unavailable',
    );
  }
  const missing = due.filter((artifact) => !isExpectedPresent(artifact, present));
  const signal = missing.length > 0;
  return {
    schemaVersion: VOLUME_SHADOW_SCHEMA_VERSION,
    rule: 'feature-tier-artifact-set',
    metric: 'feature-tier-artifacts',
    scope,
    status: signal ? 'outside-reference' : 'within-reference',
    value: missing,
    unit: 'artifact_set',
    signal,
    operands: {
      tier: feature.tier,
      expectedDue: due,
      present: [...present].sort(),
      missing,
      lifecycle: feature.lifecycle?.phase ?? 'unknown',
    },
    reference: {
      kind: 'pipeline-contract',
      source: '.agents/skills/feature-adr/SKILL.md#Step-Activation-Matrix',
      expected: due,
    },
    method: 'feature-tier-active-steps/v1',
    detail: signal
      ? `${feature.tier} tier is missing ${missing.join(', ')} that are due in the recorded lifecycle`
      : `${feature.tier} tier has every artifact due in the recorded lifecycle`,
  };
}

function finalize(observations: GuardObservation[]): VolumeShadowResult {
  observations.sort((a, b) =>
    (RULE_ORDER.get(a.rule) ?? 99) - (RULE_ORDER.get(b.rule) ?? 99)
    || a.scope.localeCompare(b.scope)
    || a.metric.localeCompare(b.metric));
  const signals: VolumeShadowSignal[] = observations
    .filter((observation) => observation.signal)
    .map((observation) => ({
      rule: observation.rule,
      detail: `${observation.scope}: ${observation.detail}; SOFT shadow observation only`,
    }));
  const notes = observations
    .filter((observation) => observation.status === 'unknown')
    .map((observation) => `${observation.rule} ${observation.scope}: ${observation.detail}`);
  return { observations, signals, notes };
}

export function evaluateVolumeShadow(input: unknown): VolumeShadowResult {
  if (input === undefined) return EMPTY_RESULT;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return unknownVolumeShadow('malformed-volume-input');
  }
  const raw = input as Partial<VolumeShadowInput>;
  if (raw.templates !== undefined && !Array.isArray(raw.templates)) {
    return unknownVolumeShadow('malformed-template-targets');
  }
  if (raw.features !== undefined && !Array.isArray(raw.features)) {
    return unknownVolumeShadow('malformed-feature-targets');
  }

  const observations: GuardObservation[] = [];
  const templateCounts = new Map<string, number>();
  for (const target of raw.templates ?? []) {
    const name = target && typeof target === 'object' && typeof (target as { target?: unknown }).target === 'string'
      ? (target as { target: string }).target
      : 'unknown-target';
    templateCounts.set(name, (templateCounts.get(name) ?? 0) + 1);
  }
  const seenTemplates = new Set<string>();
  for (const target of raw.templates ?? []) {
    const name = target && typeof target === 'object' && typeof (target as { target?: unknown }).target === 'string'
      ? (target as { target: string }).target
      : 'unknown-target';
    if (seenTemplates.has(name)) continue;
    seenTemplates.add(name);
    observations.push(...((templateCounts.get(name) ?? 0) > 1
      ? unknownTemplateTarget(boundedDetail(name), 'duplicate-template-target')
      : evaluateTemplateTarget(target)));
  }

  const featureCounts = new Map<string, number>();
  for (const feature of raw.features ?? []) {
    const slug = feature && typeof feature === 'object' && typeof (feature as { slug?: unknown }).slug === 'string'
      ? (feature as { slug: string }).slug
      : 'unknown-feature';
    featureCounts.set(slug, (featureCounts.get(slug) ?? 0) + 1);
  }
  const seenFeatures = new Set<string>();
  for (const feature of raw.features ?? []) {
    const slug = feature && typeof feature === 'object' && typeof (feature as { slug?: unknown }).slug === 'string'
      ? (feature as { slug: string }).slug
      : 'unknown-feature';
    if (seenFeatures.has(slug)) continue;
    seenFeatures.add(slug);
    observations.push(...((featureCounts.get(slug) ?? 0) > 1
      ? unknownFeature(boundedDetail(slug), 'duplicate-feature-target')
      : evaluateFeature(feature)));
  }
  return finalize(observations);
}
