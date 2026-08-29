import { createHash } from 'node:crypto';

export const EVIDENCE_SCHEMA = 'package-evidence/1';
export const BRIEF_SCHEMA = 'package-story-brief/1';
export const MAX_LOCAL_RANGE_LINES = 40;

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const list = (value) => Array.isArray(value);
const status = (value) => ['evidenced', 'external', 'unknown'].includes(value);
const visualKind = (value) => ['artifact', 'flow', 'comparison', 'timeline', 'decision-card'].includes(value);
const placeholder = /\b(?:TODO|TBD|LOREM IPSUM|FIXME)\b/i; // no-stubs: this guard rejects literal authoring placeholders
const safeId = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const numberTokens = (value) => String(value).match(/\p{N}+(?:[.,]\p{N}+)*(?:\s*[%$€₽£])?/gu) ?? [];
const normalizedNumber = (value) => String(value).replace(/\s+/g, '');
const relativePath = (value) => text(value)
  && !value.split(/[\\/]/).includes('..')
  && !/^(?:[A-Za-z]:[\\/]|[\\/])/.test(value);
const boundedRange = (value) => list(value)
  && value.length === 2
  && value.every((line) => Number.isInteger(line) && line > 0)
  && value[1] >= value[0]
  && value[1] - value[0] + 1 <= MAX_LOCAL_RANGE_LINES;

function recordMember(failures, owner, value, index) {
  if (object(value)) return value;
  failures.push(`${owner}[${index}] must be an object`);
  return null;
}

export function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalJsonText(value) {
  const active = new WeakSet();
  const encode = (item) => {
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return JSON.stringify(item);
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('canonical JSON requires finite numbers');
      return JSON.stringify(item);
    }
    if (typeof item !== 'object') throw new TypeError('canonical JSON requires JSON values');
    if (active.has(item)) throw new TypeError('canonical JSON cannot contain cycles');
    active.add(item);
    const encoded = Array.isArray(item)
      ? `[${item.map(encode).join(',')}]`
      : `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${encode(item[key])}`).join(',')}}`;
    active.delete(item);
    return encoded;
  };
  return encode(value);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function validateEvidence(value) {
  const failures = [];
  const sources = list(value?.sources) ? value.sources : [];
  const readmeExamples = list(value?.readmeExamples) ? value.readmeExamples : [];
  if (!object(value) || value.schema !== EVIDENCE_SCHEMA) failures.push('schema must be package-evidence/1');
  if (!object(value?.package) || !text(value.package.name) || !text(value.package.version)) failures.push('package.name/version required');
  if (!text(value?.generatedFrom)) failures.push('generatedFrom required');
  if (!list(value?.sources) || value.sources.length === 0) failures.push('sources must be non-empty');
  const ids = new Set();
  for (const [index, rawSource] of sources.entries()) {
    const source = recordMember(failures, 'evidence.sources', rawSource, index);
    if (!source) continue;
    if (!safeId(source.id)) failures.push('every source needs a safe id');
    if (safeId(source.id) && ids.has(source.id)) failures.push(`duplicate source id: ${source.id}`);
    if (safeId(source.id)) ids.add(source.id);
    const local = relativePath(source?.path)
      && /^[a-f0-9]{64}$/.test(source?.sha256 ?? '')
      && Number.isInteger(source?.lines)
      && source.lines >= 0
      && source.url === undefined
      && source.receiptPath === undefined;
    const external = /^https:\/\//.test(source?.url ?? '')
      && /^\d{4}-\d{2}-\d{2}$/.test(source?.checkedAt ?? '')
      && relativePath(source?.receiptPath)
      && /^[a-f0-9]{64}$/.test(source?.sha256 ?? '')
      && Number.isInteger(source?.lines)
      && source.lines >= 0
      && source.path === undefined;
    if (local === external) failures.push(`source ${source?.id ?? '?'} must be one local record or one supplied dated HTTPS record`);
  }
  const sourceFiles = value?.truncation?.sourceFiles;
  const examples = value?.truncation?.readmeExamples;
  const localSourceCount = sources.filter((source) => relativePath(source?.path)).length;
  if (!object(sourceFiles)
    || ![sourceFiles.found, sourceFiles.included, sourceFiles.limit].every(Number.isInteger)
    || sourceFiles.found < sourceFiles.included
    || sourceFiles.included > sourceFiles.limit
    || sourceFiles.included !== localSourceCount) {
    failures.push('truncation.sourceFiles must report coherent found/included/limit counts');
  }
  if (!object(examples)
    || ![examples.found, examples.included, examples.dropped, examples.limit, examples.contentLimit, examples.truncatedContent].every(Number.isInteger)
    || examples.found !== examples.included + examples.dropped
    || examples.included > examples.limit
    || examples.truncatedContent > examples.included
    || examples.contentLimit < 1) {
    failures.push('truncation.readmeExamples must report coherent found/included/dropped/content counts');
  }
  let readmeExampleMembersValid = true;
  for (const [index, rawExample] of readmeExamples.entries()) {
    const example = recordMember(failures, 'evidence.readmeExamples', rawExample, index);
    if (!example) {
      readmeExampleMembersValid = false;
      continue;
    }
    if (typeof example.contentTruncated !== 'boolean'
      || typeof example.content !== 'string'
      || example.content.length > (examples?.contentLimit ?? -1)) readmeExampleMembersValid = false;
  }
  if (!list(value?.readmeExamples) || readmeExamples.length !== examples?.included
    || !readmeExampleMembersValid) {
    failures.push('readmeExamples must match the bounded truncation receipt');
  }
  return { pass: failures.length === 0, failures };
}

function sourceRefs(failures, label, sourceIds, known, allowUnknown = false, status = 'evidenced') {
  if (!list(sourceIds)) {
    failures.push(`${label}.sourceIds must be an array`);
    return;
  }
  if (sourceIds.length === 0 && !(allowUnknown && status === 'unknown')) {
    failures.push(`${label} must cite evidence or be explicit unknown`);
  }
  for (const id of sourceIds) if (!known.has(id)) failures.push(`${label} references missing source ${id}`);
}

export function validateBrief(value) {
  const failures = [];
  const sources = list(value?.sources) ? value.sources : [];
  const claims = list(value?.claims) ? value.claims : [];
  const exampleProcess = list(value?.example?.process) ? value.example.process : [];
  const mechanism = list(value?.mechanism) ? value.mechanism : [];
  const install = list(value?.install) ? value.install : [];
  const reuse = list(value?.reuse) ? value.reuse : [];
  const limits = list(value?.limits) ? value.limits : [];
  if (!object(value) || value.schema !== BRIEF_SCHEMA) failures.push('schema must be package-story-brief/1');
  if (!object(value?.package) || !text(value.package.name) || !text(value.package.version)) failures.push('package.name/version required');
  if (!['ru', 'en'].includes(value?.language)) failures.push('language must be ru or en');
  if (!text(value?.audience)) failures.push('audience required');
  if (!object(value?.hero) || !text(value.hero.title) || !text(value.hero.subtitle) || !text(value.hero.cta)) {
    failures.push('hero title/subtitle/cta required');
  }
  if (object(value?.hero) && Object.prototype.hasOwnProperty.call(value.hero, 'eyebrow') && !text(value.hero.eyebrow)) {
    failures.push('hero.eyebrow must be non-blank when supplied');
  }
  if (!list(value?.sources) || value.sources.length === 0) failures.push('sources must be non-empty');
  const known = new Set();
  for (const [index, rawSource] of sources.entries()) {
    const source = recordMember(failures, 'brief.sources', rawSource, index);
    if (!source) continue;
    if (!safeId(source.id)) failures.push('brief source needs a safe id');
    if (safeId(source.id) && known.has(source.id)) failures.push(`duplicate brief source id: ${source.id}`);
    if (safeId(source.id)) known.add(source.id);
    const local = relativePath(source?.path)
      && boundedRange(source?.lineRange)
      && /^[a-f0-9]{64}$/.test(source?.sha256 ?? '')
      && source.url === undefined
      && source.receiptPath === undefined;
    const external = /^https:\/\//.test(source?.url ?? '')
      && /^\d{4}-\d{2}-\d{2}$/.test(source?.checkedAt ?? '')
      && relativePath(source?.receiptPath)
      && /^[a-f0-9]{64}$/.test(source?.sha256 ?? '')
      && boundedRange(source?.lineRange)
      && source.path === undefined;
    if (local === external) failures.push(`source ${source?.id ?? '?'} must be one local file/line range or one dated HTTPS source`);
  }
  if (!list(value?.claims) || value.claims.length === 0) failures.push('claims must be non-empty');
  const claimIds = new Set();
  for (const [index, rawClaim] of claims.entries()) {
    const claim = recordMember(failures, 'brief.claims', rawClaim, index);
    if (!claim) continue;
    const claimSourceIds = list(claim?.sourceIds) ? claim.sourceIds : [];
    if (!safeId(claim?.id) || !text(claim?.text)) failures.push('claim safe id/text required');
    if (!status(claim?.status)) failures.push(`claim ${claim?.id ?? '?'} status must be evidenced, external, or unknown`);
    if (safeId(claim.id) && claimIds.has(claim.id)) failures.push(`duplicate claim id: ${claim.id}`);
    if (safeId(claim.id)) claimIds.add(claim.id);
    sourceRefs(failures, `claim ${claim?.id ?? '?'}`, claim?.sourceIds, known, true, claim?.status);
    const tokens = numberTokens(claim?.text ?? '').map(normalizedNumber);
    if (tokens.length > 0) {
      if (claim?.status !== 'evidenced') failures.push(`numeric claim ${claim?.id ?? '?'} requires current local evidence`);
      if (!list(claim?.numericEvidence) || claim.numericEvidence.length !== tokens.length) {
        failures.push(`numeric claim ${claim?.id ?? '?'} requires one token/context proof per numeric token`);
      } else {
        const proofs = claim.numericEvidence.map((proof) => normalizedNumber(proof?.token ?? ''));
        if (proofs.some((token, index) => token !== tokens[index])) failures.push(`numeric claim ${claim?.id ?? '?'} proof tokens must follow claim order exactly`);
        for (const [proofIndex, rawProof] of claim.numericEvidence.entries()) {
          const proof = recordMember(failures, `brief.claims[${index}].numericEvidence`, rawProof, proofIndex);
          if (!proof) continue;
          if (!text(proof?.context) || !/^(?=.{3,80}$)\p{L}[\p{L}_. -]*$/u.test(proof.context)
            || numberTokens(proof.context).length > 0
            || !known.has(proof?.sourceId)
            || !claimSourceIds.includes(proof.sourceId)) failures.push(`numeric claim ${claim?.id ?? '?'} has invalid token context proof`);
        }
      }
    } else if (claim?.numericEvidence !== undefined && (!list(claim.numericEvidence) || claim.numericEvidence.length > 0)) {
      failures.push(`nonnumeric claim ${claim?.id ?? '?'} must not declare numericEvidence`);
    }
  }
  const example = value?.example;
  if (!object(example) || !text(example.title) || !text(example.input) || !list(example.process)
    || exampleProcess.length < 2 || exampleProcess.length > 5 || !exampleProcess.every(text) || !object(example.output)
    || !text(example.output.format) || !text(example.output.preview) || example.synthetic !== true) {
    failures.push('example needs title/input/2+ process steps/output and synthetic=true');
  }
  sourceRefs(failures, 'example', example?.sourceIds, known);
  if (!object(value?.why) || !text(value.why.title) || !text(value.why.body)) failures.push('why required');
  sourceRefs(failures, 'why', value?.why?.sourceIds, known);
  if (!list(value?.mechanism) || value.mechanism.length < 3 || value.mechanism.length > 6) {
    failures.push('mechanism must have 3-6 stages');
  }
  const mechanismIds = new Set();
  for (const [index, rawStep] of mechanism.entries()) {
    const step = recordMember(failures, 'brief.mechanism', rawStep, index);
    if (!step) continue;
    if (!safeId(step?.id) || !text(step?.label) || !text(step?.explanation) || !text(step?.guardrail)) {
      failures.push(`mechanism[${index}] incomplete`);
    }
    if (safeId(step.id) && mechanismIds.has(step.id)) failures.push(`duplicate mechanism id: ${step.id}`);
    if (safeId(step.id)) mechanismIds.add(step.id);
    sourceRefs(failures, `mechanism[${index}]`, step?.sourceIds, known);
  }
  if (!list(value?.install) || value.install.length === 0) failures.push('install commands required');
  for (const [index, rawItem] of install.entries()) {
    const item = recordMember(failures, 'brief.install', rawItem, index);
    if (!item) continue;
    if (!text(item?.label) || !text(item?.command)) failures.push(`install[${index}] incomplete`);
    sourceRefs(failures, `install[${index}]`, item?.sourceIds, known);
  }
  if (!list(value?.reuse) || value.reuse.length === 0) failures.push('reuse required');
  for (const [index, rawItem] of reuse.entries()) {
    const item = recordMember(failures, 'brief.reuse', rawItem, index);
    if (!item) continue;
    if (!text(item?.host) || !status(item?.status) || !text(item?.note)) {
      failures.push(`reuse[${index}] incomplete`);
    }
    sourceRefs(failures, `reuse[${index}]`, item?.sourceIds, known, true, item?.status);
  }
  if (!list(value?.limits)) failures.push('limits must be an array');
  const limitCategories = new Set(limits.map((item) => item?.category));
  for (const category of ['safety', 'cost', 'freshness']) {
    if (!limitCategories.has(category)) failures.push(`limits missing ${category}`);
    if (limits.filter((item) => item?.category === category).length !== 1) failures.push(`limits must contain exactly one ${category}`);
  }
  for (const [index, rawItem] of limits.entries()) {
    const item = recordMember(failures, 'brief.limits', rawItem, index);
    if (!item) continue;
    if (!text(item?.category) || !text(item?.title) || !text(item?.text) || !status(item?.status)) failures.push(`limits[${index}] incomplete`);
    if (!['safety', 'cost', 'freshness'].includes(item?.category)) failures.push(`limits[${index}] has unsupported category`);
    sourceRefs(failures, `limits[${index}]`, item?.sourceIds, known, true, item?.status);
  }
  if (!object(value?.cta) || !text(value.cta.title) || !text(value.cta.body) || !text(value.cta.label)) {
    failures.push('cta title/body/label required');
  }
  const visualSections = ['example', 'why', 'mechanism', 'install', 'reuse', 'limits'];
  if (!object(value?.visuals)) failures.push('visuals object required');
  for (const section of visualSections) {
    const visual = value?.visuals?.[section];
    if (!object(visual) || !visualKind(visual.kind) || !text(visual.direction)) {
      failures.push(`visuals.${section} needs a supported kind and direction`);
    }
  }
  if (object(value?.visuals) && Object.keys(value.visuals).some((section) => !visualSections.includes(section))) {
    failures.push('visuals contains an unsupported section');
  }
  const nonClaimProse = [
    value?.audience,
    value?.hero?.eyebrow, value?.hero?.title, value?.hero?.subtitle, value?.hero?.cta,
    value?.example?.title, ...exampleProcess, value?.example?.output?.format, value?.example?.output?.preview,
    value?.why?.title, value?.why?.body,
    ...mechanism.flatMap((item) => [item?.label, item?.explanation, item?.guardrail]),
    ...install.map((item) => item?.label),
    ...reuse.flatMap((item) => [item?.host, item?.note]),
    ...limits.flatMap((item) => [item?.title, item?.text]),
    ...Object.values(value?.visuals ?? {}).map((item) => item?.direction),
    value?.cta?.title, value?.cta?.body, value?.cta?.label,
  ].filter((item) => typeof item === 'string');
  if (nonClaimProse.some((item) => numberTokens(item).length > 0)) {
    failures.push('numeric factual prose must be expressed as an evidenced claim with numericEvidence');
  }
  const authoredCopy = [
    value?.audience,
    value?.hero?.eyebrow, value?.hero?.title, value?.hero?.subtitle, value?.hero?.cta,
    value?.example?.title, value?.example?.input, ...exampleProcess,
    value?.example?.output?.format, value?.example?.output?.preview,
    value?.why?.title, value?.why?.body,
    ...claims.map((item) => item?.text),
    ...mechanism.flatMap((item) => [item?.label, item?.explanation, item?.guardrail]),
    ...install.flatMap((item) => [item?.label, item?.command]),
    ...reuse.flatMap((item) => [item?.host, item?.note]),
    ...limits.flatMap((item) => [item?.title, item?.text]),
    ...Object.values(value?.visuals ?? {}).map((item) => item?.direction),
    value?.cta?.title, value?.cta?.body, value?.cta?.label,
  ].filter((item) => typeof item === 'string');
  if (authoredCopy.some((item) => placeholder.test(item))) failures.push('authored story copy contains a placeholder token');
  return { pass: failures.length === 0, failures };
}

export function assertValid(result, label) {
  if (!result.pass) throw new Error(`${label}: ${result.failures.join('; ')}`);
}
