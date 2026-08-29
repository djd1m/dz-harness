/**
 * Pure contract-checklist policy for feature-ADR artifacts.
 *
 * Markdown/JSON text and injected evidence reads go in; typed decisions come out. Filesystem
 * discovery, realpath confinement, rendering to a terminal, and process exits belong to the CLI.
 */

export const CONTRACT_CHECKLIST_SCHEMA = 'contract-checklist/1' as const;
export const CONTRACT_VERDICT_SCHEMA = 'contract-checklist-verdict/1' as const;

export type ContractSourceKind = 'acceptance-criterion' | 'adr-confirmation';
export type ContractVerdict = 'met' | 'unmet' | 'not-testable';
export type ContractObservedOutcome = 'pass' | 'fail' | 'not-testable';
export type ContractGrade = 'A' | 'B' | 'C' | 'D';

export interface ContractSourceArtifact {
  readonly path: string;
  readonly text: string;
}

export interface ContractChecklistSource {
  readonly requirements: ContractSourceArtifact;
  readonly adrs: readonly ContractSourceArtifact[];
}

export interface ContractItem {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceKind: ContractSourceKind;
  readonly statement: string;
  readonly sourcePath: string;
  readonly sourceLine: number;
  readonly requiredAutomatedCheck?: string;
}

export interface ContractChecklist {
  readonly schema: typeof CONTRACT_CHECKLIST_SCHEMA;
  readonly items: readonly ContractItem[];
}

export interface ContractDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly artifact?: string;
  readonly section?: string;
  readonly sourceId?: string;
  readonly contractId?: string;
  readonly observed?: string | number | readonly string[];
}

export type ContractChecklistResult =
  | { readonly ok: true; readonly checklist: ContractChecklist; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly ContractDiagnostic[] };

export interface ContractVerdictEvidence {
  readonly artifact: string;
  readonly quote: string;
  readonly observedOutcome: ContractObservedOutcome;
}

export interface ContractVerdictItem {
  readonly id: string;
  readonly verdict: ContractVerdict;
  readonly evidence: ContractVerdictEvidence;
  readonly reason?: string;
}

export interface ContractVerdictReport {
  readonly schema: typeof CONTRACT_VERDICT_SCHEMA;
  readonly overallGrade: ContractGrade;
  readonly items: readonly ContractVerdictItem[];
}

export type ContractVerdictParseResult =
  | {
      readonly ok: true;
      readonly report: ContractVerdictReport;
      readonly humanGrade: ContractGrade;
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      /** False only when no canonical verdict section exists at all. */
      readonly established: boolean;
      readonly diagnostics: readonly ContractDiagnostic[];
    };

export type ContractEvidenceReadResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: string; readonly detail: string };

export interface ContractEvidenceReader {
  /** Repository-relative QE report path, used to reject self-citation before reading. */
  readonly reportArtifact?: string;
  read(artifact: string): ContractEvidenceReadResult;
}

export interface ContractItemVerification {
  readonly id: string;
  readonly verdict: ContractVerdict | null;
  readonly evidence: 'valid' | 'invalid' | 'not-checked';
  readonly reason?: string;
  readonly diagnostics: readonly ContractDiagnostic[];
}

export interface ContractVerificationCounts {
  readonly contractItems: number;
  readonly verdictItems: number;
  readonly met: number;
  readonly unmet: number;
  readonly notTestable: number;
  readonly missing: number;
  readonly duplicate: number;
  readonly orphan: number;
  readonly invalidEvidence: number;
  readonly gradeConflicts: number;
}

export interface ContractVerification {
  readonly outcome: 'pass' | 'fail';
  readonly exitCode: 0 | 1;
  /** Null only when an untyped runtime caller bypasses the parser with an invalid report object. */
  readonly overallGrade: ContractGrade | null;
  readonly items: readonly ContractItemVerification[];
  readonly counts: ContractVerificationCounts;
  readonly diagnostics: readonly ContractDiagnostic[];
}

const REQUIREMENTS_HEADING = '## Acceptance criteria';
const CONFIRMATION_HEADING = '## Confirmation';
const VERDICT_HEADING = '## Contract checklist';
const REQUIREMENTS_FORMAT_LINE = 'Format: Every acceptance criterion below is exactly one physical line matching `^AC-([1-9][0-9]*): (\\S.*)$`; identifiers are contiguous from `AC-1`, and only the literal H2 `## Acceptance criteria` establishes this source section.';
const ADR_BASENAME = /^([0-9]{3})-[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.md$/;
const ACCEPTANCE_ROW = /^AC-([1-9][0-9]*): (\S.*)$/;
const LOAD_PROPERTY = /^- Load-bearing property:(?: (.*))?$/;
const REQUIRED_CHECK = /^- Required automated check:(?: (.*))?$/;

function linesOf(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

function h2Indexes(lines: readonly string[], heading: string): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (lines[index] === heading) indexes.push(index);
  }
  return indexes;
}

function h2End(lines: readonly string[], start: number): number {
  for (let index = start + 1; index < lines.length; index++) {
    if (/^## (?!#)\S/.test(lines[index] ?? '')) return index;
  }
  return lines.length;
}

function diagnostic(
  code: string,
  message: string,
  fields: Omit<ContractDiagnostic, 'code' | 'message'> = {},
): ContractDiagnostic {
  return { code, message, ...fields };
}

interface PendingContractItem {
  readonly sourceId: string;
  readonly sourceKind: ContractSourceKind;
  readonly statement: string;
  readonly sourcePath: string;
  readonly sourceLine: number;
  readonly requiredAutomatedCheck?: string;
}

function acceptanceItems(
  artifact: ContractSourceArtifact,
  diagnostics: ContractDiagnostic[],
): PendingContractItem[] {
  const lines = linesOf(artifact.text);
  const headings = h2Indexes(lines, REQUIREMENTS_HEADING);
  if (headings.length !== 1) {
    diagnostics.push(diagnostic(
      headings.length === 0 ? 'requirements-section-missing' : 'requirements-section-duplicate',
      `expected exactly one ${REQUIREMENTS_HEADING} section; found ${headings.length}`,
      { artifact: artifact.path, section: REQUIREMENTS_HEADING, observed: headings.length },
    ));
    return [];
  }

  const start = headings[0] as number;
  const end = h2End(lines, start);
  const out: PendingContractItem[] = [];
  for (let index = start + 1; index < end; index++) {
    const line = lines[index] ?? '';
    if (line.trim() === '' || line === REQUIREMENTS_FORMAT_LINE) continue;
    const match = ACCEPTANCE_ROW.exec(line);
    if (!match) {
      diagnostics.push(diagnostic(
        'acceptance-row-malformed',
        `non-canonical acceptance content at line ${index + 1}`,
        { artifact: artifact.path, section: REQUIREMENTS_HEADING, observed: line },
      ));
      continue;
    }
    const number = Number(match[1]);
    out.push({
      sourceId: `AC-${number}`,
      sourceKind: 'acceptance-criterion',
      statement: match[2] as string,
      sourcePath: artifact.path,
      sourceLine: index + 1,
    });
  }
  return out;
}

function validateAcceptanceIds(
  items: readonly PendingContractItem[],
  artifact: ContractSourceArtifact,
  diagnostics: ContractDiagnostic[],
): void {
  if (items.length === 0) {
    diagnostics.push(diagnostic(
      'acceptance-items-empty',
      'the Acceptance criteria section contains zero canonical rows',
      { artifact: artifact.path, section: REQUIREMENTS_HEADING, observed: 0 },
    ));
    return;
  }
  const seen = new Set<string>();
  for (let index = 0; index < items.length; index++) {
    const item = items[index] as PendingContractItem;
    if (seen.has(item.sourceId)) {
      diagnostics.push(diagnostic(
        'acceptance-id-duplicate',
        `duplicate acceptance identity ${item.sourceId}`,
        { artifact: artifact.path, section: REQUIREMENTS_HEADING, sourceId: item.sourceId },
      ));
    }
    seen.add(item.sourceId);
    const expected = `AC-${index + 1}`;
    if (item.sourceId !== expected) {
      diagnostics.push(diagnostic(
        'acceptance-id-noncontiguous',
        `expected ${expected} at contract position ${index + 1}; found ${item.sourceId}`,
        { artifact: artifact.path, section: REQUIREMENTS_HEADING, sourceId: item.sourceId, observed: expected },
      ));
    }
  }
}

function fieldContinuation(
  lines: readonly string[],
  fieldIndex: number,
  end: number,
): { line: number; text: string } | null {
  const nextIndex = fieldIndex + 1;
  if (nextIndex >= end) return null;
  const next = lines[nextIndex] ?? '';
  if (next.trim() === '' || /^- \S/.test(next)) return null;
  return { line: nextIndex + 1, text: next };
}

function confirmationItem(
  artifact: ContractSourceArtifact,
  diagnostics: ContractDiagnostic[],
): PendingContractItem | null {
  const basename = artifact.path.replace(/\\/g, '/').split('/').at(-1) ?? '';
  const filename = ADR_BASENAME.exec(basename);
  if (!filename) {
    diagnostics.push(diagnostic(
      'adr-filename-noncanonical',
      `direct ADR Markdown file ${basename} is not a canonical NNN-lowercase-kebab filename`,
      { artifact: artifact.path, observed: basename },
    ));
    return null;
  }
  const lines = linesOf(artifact.text);
  const headings = h2Indexes(lines, CONFIRMATION_HEADING);
  if (headings.length !== 1) {
    diagnostics.push(diagnostic(
      headings.length === 0 ? 'confirmation-section-missing' : 'confirmation-section-duplicate',
      `expected exactly one ${CONFIRMATION_HEADING} section; found ${headings.length}`,
      { artifact: artifact.path, section: CONFIRMATION_HEADING, observed: headings.length },
    ));
    return null;
  }
  const start = headings[0] as number;
  const end = h2End(lines, start);
  const properties: { index: number; value: string }[] = [];
  const checks: { index: number; value: string }[] = [];
  for (let index = start + 1; index < end; index++) {
    const line = lines[index] ?? '';
    const property = LOAD_PROPERTY.exec(line);
    const check = REQUIRED_CHECK.exec(line);
    if (line.startsWith('- Load-bearing property:')) properties.push({ index, value: property?.[1] ?? '' });
    if (line.startsWith('- Required automated check:')) checks.push({ index, value: check?.[1] ?? '' });
  }
  const propertyValid = properties.length === 1 && /^\S.*$/.test(properties[0]?.value ?? '');
  const checkValid = checks.length === 1 && /^\S.*$/.test(checks[0]?.value ?? '');
  if (!propertyValid) {
    const observed = properties.length === 1 ? 0 : properties.length;
    diagnostics.push(diagnostic(
      'confirmation-property-count',
      `expected one non-empty Load-bearing property field; found ${observed}`,
      { artifact: artifact.path, section: CONFIRMATION_HEADING, observed },
    ));
  }
  if (!checkValid) {
    const observed = checks.length === 1 ? 0 : checks.length;
    diagnostics.push(diagnostic(
      'confirmation-check-count',
      `expected one non-empty Required automated check field; found ${observed}`,
      { artifact: artifact.path, section: CONFIRMATION_HEADING, observed },
    ));
  }
  if (!propertyValid || !checkValid) return null;
  const property = properties[0] as { index: number; value: string };
  const check = checks[0] as { index: number; value: string };
  let wrapped = false;
  for (const [label, field] of [['Load-bearing property', property], ['Required automated check', check]] as const) {
    const continuation = fieldContinuation(lines, field.index, end);
    if (continuation !== null) {
      wrapped = true;
      diagnostics.push(diagnostic(
        'confirmation-field-wrapped',
        `${label} must occupy one physical line; continuation found at line ${continuation.line}`,
        {
          artifact: artifact.path,
          section: CONFIRMATION_HEADING,
          sourceId: `ADR-${filename[1]}-CONFIRMATION`,
          observed: continuation.text,
        },
      ));
    }
  }
  if (wrapped) return null;
  return {
    sourceId: `ADR-${filename[1]}-CONFIRMATION`,
    sourceKind: 'adr-confirmation',
    statement: property.value,
    requiredAutomatedCheck: check.value,
    sourcePath: artifact.path,
    sourceLine: property.index + 1,
  };
}

export function extractContractChecklist(input: ContractChecklistSource): ContractChecklistResult {
  const diagnostics: ContractDiagnostic[] = [];
  const requirements = acceptanceItems(input.requirements, diagnostics);
  validateAcceptanceIds(requirements, input.requirements, diagnostics);

  if (input.adrs.length === 0) {
    diagnostics.push(diagnostic(
      'adr-input-empty',
      'at least one direct canonical ADR Markdown file is required',
      { section: CONFIRMATION_HEADING, observed: 0 },
    ));
  }
  const adrBasename = (path: string): string => path.replace(/\\/g, '/').split('/').at(-1) ?? '';
  const sortedAdrs = [...input.adrs].sort((a, b) => {
    const aName = adrBasename(a.path);
    const bName = adrBasename(b.path);
    if (aName !== bName) return aName < bName ? -1 : 1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
  const confirmations: PendingContractItem[] = [];
  for (const artifact of sortedAdrs) {
    const item = confirmationItem(artifact, diagnostics);
    if (item !== null) confirmations.push(item);
  }

  const pending = [...requirements, ...confirmations];
  const seen = new Set<string>();
  for (const item of pending) {
    if (seen.has(item.sourceId)) {
      diagnostics.push(diagnostic(
        'contract-source-id-duplicate',
        `duplicate emitted source identity ${item.sourceId}`,
        { artifact: item.sourcePath, sourceId: item.sourceId },
      ));
    }
    seen.add(item.sourceId);
  }
  if (pending.length === 0) {
    diagnostics.push(diagnostic('contract-empty', 'the combined contract contains zero items', { observed: 0 }));
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const items: ContractItem[] = pending.map((item, index) => ({ id: `CC-${index + 1}`, ...item }));
  return {
    ok: true,
    checklist: { schema: CONTRACT_CHECKLIST_SCHEMA, items },
    diagnostics: [],
  };
}

export function renderContractChecklist(checklist: ContractChecklist): string {
  return `\`\`\`contract-checklist\n${JSON.stringify(checklist, null, 2)}\n\`\`\``;
}

class JsonDecodeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** Strict JSON decoder whose object parser sees duplicate members before a value can overwrite one. */
class DuplicateSafeJsonDecoder {
  private index = 0;

  constructor(private readonly text: string) {}

  decode(): unknown {
    const value = this.value();
    this.space();
    if (this.index !== this.text.length) throw new JsonDecodeError('json-trailing-content', `unexpected content at byte ${this.index}`);
    return value;
  }

  private space(): void {
    while (/[\t\n\r ]/.test(this.text[this.index] ?? '')) this.index++;
  }

  private value(): unknown {
    this.space();
    const char = this.text[this.index];
    if (char === '{') return this.object();
    if (char === '[') return this.array();
    if (char === '"') return this.string();
    if (char === '-' || (char !== undefined && /[0-9]/.test(char))) return this.number();
    for (const [token, value] of [['true', true], ['false', false], ['null', null]] as const) {
      if (this.text.startsWith(token, this.index)) {
        this.index += token.length;
        return value;
      }
    }
    throw new JsonDecodeError('json-invalid', `expected a JSON value at byte ${this.index}`);
  }

  private object(): Record<string, unknown> {
    this.index++;
    // A null prototype makes decoded member names inert data. Assigning `__proto__` into `{}`
    // invokes the legacy prototype setter and would hide that member from Object.keys/closed-schema
    // validation instead of reporting it as unknown.
    const value = Object.create(null) as Record<string, unknown>;
    const keys = new Set<string>();
    this.space();
    if (this.text[this.index] === '}') {
      this.index++;
      return value;
    }
    while (true) {
      this.space();
      if (this.text[this.index] !== '"') throw new JsonDecodeError('json-invalid', `expected an object key at byte ${this.index}`);
      const key = this.string();
      if (keys.has(key)) throw new JsonDecodeError('json-duplicate-member', `duplicate JSON member ${JSON.stringify(key)}`);
      keys.add(key);
      this.space();
      if (this.text[this.index] !== ':') throw new JsonDecodeError('json-invalid', `expected ':' after ${JSON.stringify(key)}`);
      this.index++;
      value[key] = this.value();
      this.space();
      const delimiter = this.text[this.index];
      if (delimiter === '}') {
        this.index++;
        return value;
      }
      if (delimiter !== ',') throw new JsonDecodeError('json-invalid', `expected ',' or '}' at byte ${this.index}`);
      this.index++;
    }
  }

  private array(): unknown[] {
    this.index++;
    const value: unknown[] = [];
    this.space();
    if (this.text[this.index] === ']') {
      this.index++;
      return value;
    }
    while (true) {
      value.push(this.value());
      this.space();
      const delimiter = this.text[this.index];
      if (delimiter === ']') {
        this.index++;
        return value;
      }
      if (delimiter !== ',') throw new JsonDecodeError('json-invalid', `expected ',' or ']' at byte ${this.index}`);
      this.index++;
    }
  }

  private string(): string {
    const start = this.index;
    this.index++;
    let escaped = false;
    while (this.index < this.text.length) {
      const char = this.text[this.index] as string;
      if (!escaped && char === '"') {
        this.index++;
        try {
          return JSON.parse(this.text.slice(start, this.index)) as string;
        } catch {
          throw new JsonDecodeError('json-invalid-string', `invalid JSON string at byte ${start}`);
        }
      }
      if (!escaped && char.charCodeAt(0) < 0x20) throw new JsonDecodeError('json-invalid-string', `control character at byte ${this.index}`);
      if (!escaped && char === '\\') escaped = true;
      else escaped = false;
      this.index++;
    }
    throw new JsonDecodeError('json-invalid-string', `unterminated JSON string at byte ${start}`);
  }

  private number(): number {
    const match = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(this.text.slice(this.index));
    if (!match || match.index !== 0) throw new JsonDecodeError('json-invalid-number', `invalid number at byte ${this.index}`);
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw new JsonDecodeError('json-invalid-number', `non-finite number at byte ${this.index}`);
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  location: string,
  diagnostics: ContractDiagnostic[],
  fields: Omit<ContractDiagnostic, 'code' | 'message' | 'observed'> = {},
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) diagnostics.push(diagnostic('verdict-unknown-member', `${location} contains unknown member ${key}`, { ...fields, observed: key }));
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      diagnostics.push(diagnostic('verdict-member-missing', `${location} is missing required member ${key}`, { ...fields, observed: key }));
    }
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function validateEvidence(
  value: unknown,
  location: string,
  diagnostics: ContractDiagnostic[],
  contractId?: string,
): ContractVerdictEvidence | null {
  const fields = contractId === undefined ? {} : { contractId };
  if (!isRecord(value)) {
    diagnostics.push(diagnostic('verdict-evidence-type', `${location}.evidence must be an object`, fields));
    return null;
  }
  exactKeys(value, ['artifact', 'quote', 'observedOutcome'], ['artifact', 'quote', 'observedOutcome'], `${location}.evidence`, diagnostics, fields);
  if (!nonEmptyString(value['artifact'])) diagnostics.push(diagnostic('verdict-artifact-type', `${location}.evidence.artifact must be a non-empty string`, fields));
  if (!nonEmptyString(value['quote'])) diagnostics.push(diagnostic('verdict-quote-type', `${location}.evidence.quote must be a non-empty string`, fields));
  const observed = value['observedOutcome'];
  if (observed !== 'pass' && observed !== 'fail' && observed !== 'not-testable') {
    diagnostics.push(diagnostic('verdict-observed-outcome', `${location}.evidence.observedOutcome is not canonical`, { ...fields, observed: String(observed) }));
  }
  if (!nonEmptyString(value['artifact']) || !nonEmptyString(value['quote'])
    || (observed !== 'pass' && observed !== 'fail' && observed !== 'not-testable')) return null;
  return { artifact: value['artifact'], quote: value['quote'], observedOutcome: observed };
}

function validateVerdictItem(
  value: unknown,
  index: number,
  diagnostics: ContractDiagnostic[],
): ContractVerdictItem | null {
  const location = `items[${index}]`;
  if (!isRecord(value)) {
    diagnostics.push(diagnostic('verdict-row-type', `${location} must be an object`, { observed: Array.isArray(value) ? 'array' : typeof value }));
    return null;
  }
  const contractId = typeof value['id'] === 'string' ? value['id'] : undefined;
  const fields = contractId === undefined ? {} : { contractId };
  exactKeys(value, ['id', 'verdict', 'evidence', 'reason'], ['id', 'verdict', 'evidence'], location, diagnostics, fields);
  if (!nonEmptyString(value['id'])) diagnostics.push(diagnostic('verdict-id-type', `${location}.id must be a non-empty string`, fields));
  const verdict = value['verdict'];
  if (verdict !== 'met' && verdict !== 'unmet' && verdict !== 'not-testable') {
    diagnostics.push(diagnostic('verdict-status-invalid', `${location}.verdict is not canonical`, { ...fields, observed: String(verdict) }));
  }
  const evidence = validateEvidence(value['evidence'], location, diagnostics, contractId);
  const reason = value['reason'];
  if ((verdict === 'unmet' || verdict === 'not-testable') && !nonEmptyString(reason)) {
    diagnostics.push(diagnostic(
      'verdict-reason-required',
      `${location}.reason must be non-empty for ${verdict}`,
      fields,
    ));
  }
  if (reason !== undefined && !nonEmptyString(reason)) {
    diagnostics.push(diagnostic('verdict-reason-type', `${location}.reason must be a non-empty string when present`, fields));
  }
  if (!nonEmptyString(value['id']) || (verdict !== 'met' && verdict !== 'unmet' && verdict !== 'not-testable') || evidence === null) return null;
  if ((verdict === 'unmet' || verdict === 'not-testable') && !nonEmptyString(reason)) return null;
  return {
    id: value['id'],
    verdict,
    evidence,
    ...(nonEmptyString(reason) ? { reason } : {}),
  };
}

function validateVerdictPayload(value: unknown):
  | { ok: true; report: ContractVerdictReport }
  | { ok: false; diagnostics: ContractDiagnostic[] } {
  const diagnostics: ContractDiagnostic[] = [];
  if (!isRecord(value)) {
    return { ok: false, diagnostics: [diagnostic('verdict-payload-type', 'the verdict payload must be a JSON object')] };
  }
  exactKeys(value, ['schema', 'overallGrade', 'items'], ['schema', 'overallGrade', 'items'], 'payload', diagnostics);
  if (value['schema'] !== CONTRACT_VERDICT_SCHEMA) {
    diagnostics.push(diagnostic('verdict-schema-unsupported', `unsupported verdict schema ${String(value['schema'])}`, { observed: String(value['schema']) }));
  }
  const grade = value['overallGrade'];
  if (grade !== 'A' && grade !== 'B' && grade !== 'C' && grade !== 'D') {
    diagnostics.push(diagnostic('verdict-grade-invalid', 'overallGrade must be A, B, C, or D', { observed: String(grade) }));
  }
  const rawItems = value['items'];
  if (!Array.isArray(rawItems)) {
    diagnostics.push(diagnostic('verdict-items-type', 'payload.items must be an array'));
  }
  const items: ContractVerdictItem[] = [];
  if (Array.isArray(rawItems)) {
    for (let index = 0; index < rawItems.length; index++) {
      const item = validateVerdictItem(rawItems[index], index, diagnostics);
      if (item !== null) items.push(item);
    }
  }
  if (diagnostics.length > 0 || value['schema'] !== CONTRACT_VERDICT_SCHEMA
    || (grade !== 'A' && grade !== 'B' && grade !== 'C' && grade !== 'D') || !Array.isArray(rawItems)) {
    return { ok: false, diagnostics };
  }
  return { ok: true, report: { schema: CONTRACT_VERDICT_SCHEMA, overallGrade: grade, items } };
}

function parseHumanGrade(text: string):
  | { ok: true; grade: ContractGrade }
  | { ok: false; diagnostic: ContractDiagnostic } {
  const lines = linesOf(text);
  const grades: ContractGrade[] = [];
  for (let index = 0; index < lines.length; index++) {
    const heading = /^## Grade: \*\*([A-D])\*\*$/.exec(lines[index] ?? '');
    if (heading) grades.push(heading[1] as ContractGrade);
    if (lines[index] === '## Grade') {
      const end = h2End(lines, index);
      for (let cursor = index + 1; cursor < end; cursor++) {
        const field = /^\*\*Grade: ([A-D])\*\*$/.exec(lines[cursor] ?? '');
        if (field) grades.push(field[1] as ContractGrade);
      }
    }
  }
  if (grades.length !== 1) {
    return {
      ok: false,
      diagnostic: diagnostic(
        'report-grade-ambiguous',
        `expected exactly one human Grade A-D value; found ${grades.length}`,
        { section: '## Grade', observed: grades },
      ),
    };
  }
  return { ok: true, grade: grades[0] as ContractGrade };
}

export function parseContractVerdictReport(text: string): ContractVerdictParseResult {
  const lines = linesOf(text);
  const headings = h2Indexes(lines, VERDICT_HEADING);
  if (headings.length === 0) {
    return {
      ok: false,
      established: false,
      diagnostics: [diagnostic('verdict-section-missing', `missing canonical ${VERDICT_HEADING} section`, { section: VERDICT_HEADING })],
    };
  }
  if (headings.length !== 1) {
    return {
      ok: false,
      established: true,
      diagnostics: [diagnostic(
        'verdict-section-duplicate',
        `expected exactly one ${VERDICT_HEADING} section; found ${headings.length}`,
        { section: VERDICT_HEADING, observed: headings.length },
      )],
    };
  }
  const start = headings[0] as number;
  const section = lines.slice(start + 1, h2End(lines, start)).join('\n').trim();
  const fence = /^```json\n([\s\S]*)\n```$/.exec(section);
  if (!fence) {
    return {
      ok: false,
      established: true,
      diagnostics: [diagnostic(
        'verdict-fence-invalid',
        'the Contract checklist section must contain exactly one fenced json object and no other content',
        { section: VERDICT_HEADING },
      )],
    };
  }
  let decoded: unknown;
  try {
    decoded = new DuplicateSafeJsonDecoder(fence[1] as string).decode();
  } catch (error) {
    const jsonError = error instanceof JsonDecodeError ? error : new JsonDecodeError('json-invalid', String(error));
    return {
      ok: false,
      established: true,
      diagnostics: [diagnostic(jsonError.code, jsonError.message, { section: VERDICT_HEADING })],
    };
  }
  const payload = validateVerdictPayload(decoded);
  if (!payload.ok) {
    return {
      ok: false,
      established: true,
      diagnostics: payload.diagnostics.map((entry) => ({ ...entry, section: entry.section ?? VERDICT_HEADING })),
    };
  }
  const human = parseHumanGrade(text);
  if (!human.ok) return { ok: false, established: true, diagnostics: [human.diagnostic] };
  if (human.grade !== payload.report.overallGrade) {
    return {
      ok: false,
      established: true,
      diagnostics: [diagnostic(
        'report-grade-mismatch',
        `human Grade ${human.grade} disagrees with payload overallGrade ${payload.report.overallGrade}`,
        { section: '## Grade', observed: [human.grade, payload.report.overallGrade] },
      )],
    };
  }
  return { ok: true, report: payload.report, humanGrade: human.grade, diagnostics: [] };
}

function contractIdNumber(id: string): number | null {
  const match = /^CC-([1-9][0-9]*)$/.exec(id);
  return match ? Number(match[1]) : null;
}

function quoteOccurrences(text: string, quote: string): number {
  let count = 0;
  let index = 0;
  while (index <= text.length - quote.length) {
    const found = text.indexOf(quote, index);
    if (found < 0) break;
    count++;
    index = found + 1;
  }
  return count;
}

function safeEvidenceArtifact(artifact: string): string | null {
  if (artifact.startsWith('/') || artifact.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(artifact)) return 'absolute paths are forbidden';
  if (artifact.includes('\\')) return 'backslash path separators are forbidden';
  const parts = artifact.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return 'empty, dot, and traversal path segments are forbidden';
  return null;
}

function baseCounts(checklist: ContractChecklist, report: unknown): ContractVerificationCounts {
  // `verifyContractVerdicts` is a public runtime boundary even though TypeScript callers receive a
  // typed signature. Count defensively before the closed-schema validator reports malformed rows.
  const rows: readonly unknown[] = isRecord(report) && Array.isArray(report['items']) ? report['items'] : [];
  const hasVerdict = (value: unknown, verdict: ContractVerdict): boolean => isRecord(value) && value['verdict'] === verdict;
  return {
    contractItems: checklist.items.length,
    verdictItems: rows.length,
    met: rows.filter((item) => hasVerdict(item, 'met')).length,
    unmet: rows.filter((item) => hasVerdict(item, 'unmet')).length,
    notTestable: rows.filter((item) => hasVerdict(item, 'not-testable')).length,
    missing: 0,
    duplicate: 0,
    orphan: 0,
    invalidEvidence: 0,
    gradeConflicts: 0,
  };
}

function failedVerification(
  checklist: ContractChecklist,
  report: unknown,
  diagnostics: readonly ContractDiagnostic[],
  counts: ContractVerificationCounts,
  items?: readonly ContractItemVerification[],
): ContractVerification {
  return {
    outcome: 'fail',
    exitCode: 1,
    overallGrade: isRecord(report)
      && (report['overallGrade'] === 'A' || report['overallGrade'] === 'B'
        || report['overallGrade'] === 'C' || report['overallGrade'] === 'D')
      ? report['overallGrade']
      : null,
    items: items ?? checklist.items.map((item) => ({
      id: item.id,
      verdict: null,
      evidence: 'not-checked',
      diagnostics: diagnostics.filter((entry) => entry.contractId === item.id),
    })),
    counts,
    diagnostics,
  };
}

export function verifyContractVerdicts(
  checklist: ContractChecklist,
  report: ContractVerdictReport,
  evidence: ContractEvidenceReader,
): ContractVerification {
  const runtime = validateVerdictPayload(report);
  let counts = baseCounts(checklist, report);
  if (!runtime.ok) return failedVerification(checklist, report, runtime.diagnostics, counts);
  report = runtime.report;
  counts = baseCounts(checklist, report);

  const diagnostics: ContractDiagnostic[] = [];
  if (checklist.schema !== CONTRACT_CHECKLIST_SCHEMA || checklist.items.length === 0) {
    diagnostics.push(diagnostic(
      checklist.schema !== CONTRACT_CHECKLIST_SCHEMA ? 'contract-schema-unsupported' : 'contract-empty',
      checklist.schema !== CONTRACT_CHECKLIST_SCHEMA ? `unsupported contract schema ${String(checklist.schema)}` : 'the contract contains zero items',
    ));
    return failedVerification(checklist, report, diagnostics, counts);
  }

  const expectedIds = checklist.items.map((item) => item.id);
  const reportedIds = report.items.map((item) => item.id);
  const frequencies = new Map<string, number>();
  for (const id of reportedIds) frequencies.set(id, (frequencies.get(id) ?? 0) + 1);

  let duplicate = 0;
  for (const [id, frequency] of frequencies) {
    if (frequency > 1) {
      duplicate += frequency - 1;
      diagnostics.push(diagnostic(
        'verdict-id-duplicate',
        `verdict id ${id} occurs ${frequency} times`,
        { contractId: id, observed: frequency },
      ));
    }
  }
  const reportedSet = new Set(reportedIds);
  const expectedSet = new Set(expectedIds);
  const missing = expectedIds.filter((id) => !reportedSet.has(id));
  const orphan = [...reportedSet].filter((id) => !expectedSet.has(id));
  for (const id of missing) diagnostics.push(diagnostic('verdict-id-missing', `contract id ${id} has no verdict`, { contractId: id }));
  for (const id of orphan) diagnostics.push(diagnostic(
    contractIdNumber(id) === null ? 'verdict-id-malformed' : 'verdict-id-orphan',
    `reported verdict id ${id} is not an expected contract id`,
    { contractId: id },
  ));
  if (missing.length === 0 && orphan.length === 0 && duplicate === 0
    && expectedIds.some((id, index) => reportedIds[index] !== id)) {
    diagnostics.push(diagnostic(
      'verdict-id-order',
      'verdict ids contain the expected set but not in contract order',
      { observed: reportedIds },
    ));
  }
  counts = { ...counts, missing: missing.length, duplicate, orphan: orphan.length };
  if (diagnostics.length > 0) return failedVerification(checklist, report, diagnostics, counts);

  const itemResults: ContractItemVerification[] = [];
  let invalidEvidence = 0;
  for (let index = 0; index < checklist.items.length; index++) {
    const contract = checklist.items[index] as ContractItem;
    const verdict = report.items[index] as ContractVerdictItem;
    const itemDiagnostics: ContractDiagnostic[] = [];
    const pathProblem = safeEvidenceArtifact(verdict.evidence.artifact);
    if (pathProblem !== null) {
      itemDiagnostics.push(diagnostic(
        'evidence-path-unsafe',
        `${verdict.evidence.artifact}: ${pathProblem}`,
        { artifact: verdict.evidence.artifact, contractId: contract.id },
      ));
    } else if (evidence.reportArtifact !== undefined && verdict.evidence.artifact === evidence.reportArtifact) {
      itemDiagnostics.push(diagnostic(
        'evidence-self-citation',
        `${contract.id} cites the QE verdict payload itself`,
        { artifact: verdict.evidence.artifact, contractId: contract.id },
      ));
    } else {
      const read = evidence.read(verdict.evidence.artifact);
      if (!read.ok) {
        itemDiagnostics.push(diagnostic(
          read.code,
          read.detail,
          { artifact: verdict.evidence.artifact, contractId: contract.id },
        ));
      } else {
        const matches = quoteOccurrences(read.text, verdict.evidence.quote);
        if (matches !== 1) {
          itemDiagnostics.push(diagnostic(
            'evidence-quote-count',
            `${contract.id} evidence quote occurs ${matches} times; expected exactly once`,
            { artifact: verdict.evidence.artifact, contractId: contract.id, observed: matches },
          ));
        }
      }
    }
    const expectedOutcome: Record<ContractVerdict, ContractObservedOutcome> = {
      met: 'pass',
      unmet: 'fail',
      'not-testable': 'not-testable',
    };
    if (verdict.evidence.observedOutcome !== expectedOutcome[verdict.verdict]) {
      itemDiagnostics.push(diagnostic(
        'evidence-outcome-polarity',
        `${contract.id} verdict ${verdict.verdict} requires observedOutcome ${expectedOutcome[verdict.verdict]}`,
        {
          artifact: verdict.evidence.artifact,
          contractId: contract.id,
          observed: verdict.evidence.observedOutcome,
        },
      ));
    }
    if (verdict.verdict === 'unmet') {
      itemDiagnostics.push(diagnostic(
        'contract-item-unmet',
        `${contract.id} is unmet: ${verdict.reason ?? 'no reason recorded'}`,
        { contractId: contract.id },
      ));
    } else if (verdict.verdict === 'not-testable') {
      itemDiagnostics.push(diagnostic(
        'contract-item-not-testable',
        `${contract.id} is not-testable: ${verdict.reason ?? 'no reason recorded'}`,
        { contractId: contract.id },
      ));
    }
    const evidenceErrors = itemDiagnostics.filter((entry) => entry.code.startsWith('evidence-')).length;
    if (evidenceErrors > 0) invalidEvidence++;
    diagnostics.push(...itemDiagnostics);
    itemResults.push({
      id: contract.id,
      verdict: verdict.verdict,
      evidence: evidenceErrors > 0 ? 'invalid' : 'valid',
      ...(verdict.reason !== undefined ? { reason: verdict.reason } : {}),
      diagnostics: itemDiagnostics,
    });
  }

  const conflicts = report.items.filter((item) => item.verdict === 'unmet').map((item) => item.id);
  const gradeConflicts = (report.overallGrade === 'A' || report.overallGrade === 'B') ? conflicts : [];
  if (gradeConflicts.length > 0) {
    diagnostics.push(diagnostic(
      'grade-unmet-conflict',
      `overall grade ${report.overallGrade} cannot coexist with unmet items: ${gradeConflicts.join(', ')}`,
      { observed: gradeConflicts },
    ));
  }
  counts = { ...counts, invalidEvidence, gradeConflicts: gradeConflicts.length };
  if (diagnostics.length > 0) return failedVerification(checklist, report, diagnostics, counts, itemResults);
  return {
    outcome: 'pass',
    exitCode: 0,
    overallGrade: report.overallGrade,
    items: itemResults,
    counts,
    diagnostics: [],
  };
}
