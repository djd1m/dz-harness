/** Optional case and authority ledger for contract-check. No filesystem access. */
import { DuplicateSafeJsonDecoder } from './contract-checklist.js';
export const ACCEPTANCE_OBLIGATIONS_SCHEMA = 'acceptance-obligations/1';
export const ACCEPTANCE_OBLIGATION_REPORT_SCHEMA = 'acceptance-obligations-verdict/1';
const CASES = ['positive', 'negative', 'malformed', 'lifecycle'];
const validCase = (value) => CASES.includes(value) || /^lifecycle:[a-z][a-z0-9-]*$/.test(value);
const AUTHORITIES = ['static', 'unit', 'integration', 'process'];
const rank = (value) => AUTHORITIES.indexOf(value);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && value.trim() !== '';
const positive = (value) => Number.isSafeInteger(value) && value > 0;
function exact(value, keys, where, errors) {
    if (!object(value)) {
        errors.push({ code: 'obligation-shape', message: `${where} must be an object` });
        return false;
    }
    for (const key of Object.keys(value))
        if (!keys.includes(key))
            errors.push({ code: 'obligation-unknown-field', message: `${where}.${key} is unsupported` });
    for (const key of keys)
        if (!Object.hasOwn(value, key))
            errors.push({ code: 'obligation-missing-field', message: `${where}.${key} is required` });
    return true;
}
function strings(value, where, errors) {
    if (!Array.isArray(value) || !value.every(nonempty)) {
        errors.push({ code: 'obligation-list', message: `${where} must be a string array` });
        return false;
    }
    if (new Set(value).size !== value.length)
        errors.push({ code: 'obligation-duplicate', message: `${where} repeats a value` });
    return true;
}
function authority(value, where, errors) {
    if (typeof value === 'string' && AUTHORITIES.includes(value))
        return true;
    errors.push({ code: 'obligation-authority', message: `${where} must be static, unit, integration, or process` });
    return false;
}
function citation(value, where, errors) {
    if (!exact(value, ['artifact', 'quote'], where, errors))
        return false;
    if (!nonempty(value.artifact) || !nonempty(value.quote)) {
        errors.push({ code: 'obligation-citation', message: `${where} needs artifact and quote` });
        return false;
    }
    return true;
}
function decode(text) {
    try {
        return { ok: true, value: new DuplicateSafeJsonDecoder(text).decode() };
    }
    catch (error) {
        return { ok: false, diagnostics: [{ code: 'obligation-json', message: String(error) }] };
    }
}
function finish(value, errors) {
    return errors.length === 0 ? { ok: true, value } : { ok: false, diagnostics: errors };
}
export function parseAcceptanceObligations(text) {
    const decoded = decode(text);
    if (!decoded.ok)
        return decoded;
    const errors = [];
    const root = decoded.value;
    if (!exact(root, ['schema', 'items'], 'declaration', errors))
        return { ok: false, diagnostics: errors };
    if (root.schema !== ACCEPTANCE_OBLIGATIONS_SCHEMA)
        errors.push({ code: 'obligation-schema', message: 'unsupported declaration schema' });
    if (!Array.isArray(root.items) || root.items.length === 0) {
        errors.push({ code: 'obligation-items', message: 'declaration needs at least one item' });
        return { ok: false, diagnostics: errors };
    }
    for (const [index, value] of root.items.entries()) {
        const where = `items[${index}]`;
        if (!exact(value, ['contractId', 'revision', 'requiredCases', 'originalAuthority', 'verifierAuthority'], where, errors))
            continue;
        if (typeof value.contractId !== 'string' || !/^CC-[1-9][0-9]*$/.test(value.contractId))
            errors.push({ code: 'obligation-contract-id', message: `${where}.contractId must be CC-n` });
        if (!positive(value.revision))
            errors.push({ code: 'obligation-revision', message: `${where}.revision must be a positive integer` });
        if (strings(value.requiredCases, `${where}.requiredCases`, errors)) {
            if (value.requiredCases.length === 0 || value.requiredCases.some((kind) => !validCase(kind)))
                errors.push({ code: 'obligation-cases', message: `${where}.requiredCases must name supported nonempty cases` });
        }
        authority(value.originalAuthority, `${where}.originalAuthority`, errors);
        authority(value.verifierAuthority, `${where}.verifierAuthority`, errors);
        if (typeof value.originalAuthority === 'string' && AUTHORITIES.includes(value.originalAuthority)
            && typeof value.verifierAuthority === 'string' && AUTHORITIES.includes(value.verifierAuthority)
            && rank(value.verifierAuthority) < rank(value.originalAuthority))
            errors.push({ code: 'obligation-declared-authority', message: `${where}.verifierAuthority is weaker than originalAuthority` });
    }
    const ids = root.items.filter(object).map((item) => item.contractId);
    if (new Set(ids).size !== ids.length)
        errors.push({ code: 'obligation-duplicate', message: 'declaration repeats a contractId' });
    return finish(root, errors);
}
export function parseAcceptanceObligationReport(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const headings = lines.flatMap((line, index) => line === '## Acceptance obligations' ? [index] : []);
    if (headings.length !== 1)
        return { ok: false, diagnostics: [{ code: 'obligation-section', message: `expected one Acceptance obligations section, found ${headings.length}` }] };
    const start = headings[0];
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index++)
        if (/^## (?!#)\S/.test(lines[index] ?? '')) {
            end = index;
            break;
        }
    const section = lines.slice(start + 1, end).join('\n').trim();
    const match = /^```json\n([\s\S]*)\n```$/.exec(section);
    if (!match)
        return { ok: false, diagnostics: [{ code: 'obligation-fence', message: 'section needs exactly one fenced json object' }] };
    const decoded = decode(match[1]);
    if (!decoded.ok)
        return decoded;
    const errors = [];
    const root = decoded.value;
    if (!exact(root, ['schema', 'items'], 'report', errors))
        return { ok: false, diagnostics: errors };
    if (root.schema !== ACCEPTANCE_OBLIGATION_REPORT_SCHEMA)
        errors.push({ code: 'obligation-schema', message: 'unsupported report schema' });
    if (!Array.isArray(root.items)) {
        errors.push({ code: 'obligation-items', message: 'report.items must be an array' });
        return { ok: false, diagnostics: errors };
    }
    for (const [index, value] of root.items.entries()) {
        const where = `items[${index}]`;
        if (!exact(value, ['contractId', 'revision', 'original', 'cases', 'verifier', 'unresolvedQuestions', 'contradictions'], where, errors))
            continue;
        if (typeof value.contractId !== 'string' || !/^CC-[1-9][0-9]*$/.test(value.contractId))
            errors.push({ code: 'obligation-contract-id', message: `${where}.contractId must be CC-n` });
        if (!positive(value.revision))
            errors.push({ code: 'obligation-revision', message: `${where}.revision must be a positive integer` });
        if (exact(value.original, ['authority', 'evidence'], `${where}.original`, errors)) {
            authority(value.original.authority, `${where}.original.authority`, errors);
            citation(value.original.evidence, `${where}.original.evidence`, errors);
        }
        if (!Array.isArray(value.cases))
            errors.push({ code: 'obligation-cases', message: `${where}.cases must be an array` });
        else
            for (const [caseIndex, row] of value.cases.entries()) {
                const place = `${where}.cases[${caseIndex}]`;
                if (!exact(row, ['kind', 'authority', 'passed', 'evidence'], place, errors))
                    continue;
                if (typeof row.kind !== 'string' || !validCase(row.kind))
                    errors.push({ code: 'obligation-case-kind', message: `${place}.kind is unsupported` });
                authority(row.authority, `${place}.authority`, errors);
                if (typeof row.passed !== 'boolean')
                    errors.push({ code: 'obligation-case-status', message: `${place}.passed must be boolean` });
                citation(row.evidence, `${place}.evidence`, errors);
            }
        if (exact(value.verifier, ['authority', 'passed', 'evidence'], `${where}.verifier`, errors)) {
            authority(value.verifier.authority, `${where}.verifier.authority`, errors);
            if (typeof value.verifier.passed !== 'boolean')
                errors.push({ code: 'obligation-verifier-status', message: `${where}.verifier.passed must be boolean` });
            citation(value.verifier.evidence, `${where}.verifier.evidence`, errors);
        }
        strings(value.unresolvedQuestions, `${where}.unresolvedQuestions`, errors);
        strings(value.contradictions, `${where}.contradictions`, errors);
    }
    const ids = root.items.filter(object).map((item) => item.contractId);
    if (new Set(ids).size !== ids.length)
        errors.push({ code: 'obligation-duplicate', message: 'report repeats a contractId' });
    return finish(root, errors);
}
function verifyCitation(value, reader, where, errors, contractId) {
    const path = value.artifact;
    if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(path)
        || path.includes('\\') || path.split('/').some((part) => part === '' || part === '.' || part === '..')) {
        errors.push({ code: 'obligation-evidence-path', message: `${where} uses an unsafe artifact path`, contractId });
        return;
    }
    if (path === reader.reportArtifact) {
        errors.push({ code: 'obligation-self-citation', message: `${where} cites the QE report`, contractId });
        return;
    }
    const found = reader.read(path);
    if (!found.ok) {
        errors.push({ code: 'obligation-evidence-read', message: `${where}: ${found.detail}`, contractId });
        return;
    }
    let occurrences = 0;
    for (let index = 0; index <= found.text.length - value.quote.length;) {
        const at = found.text.indexOf(value.quote, index);
        if (at < 0)
            break;
        occurrences++;
        index = at + 1;
    }
    if (occurrences !== 1)
        errors.push({ code: 'obligation-evidence-quote', message: `${where} quote occurs ${occurrences} times; expected one`, contractId });
}
export function verifyAcceptanceObligations(checklist, declaration, report, reader) {
    // This exported function is a runtime boundary, not just a typed parser consumer. Normalize
    // only validated payloads before any map can overwrite duplicate IDs or truthy strings can pass.
    try {
        const parsedDeclaration = parseAcceptanceObligations(JSON.stringify(declaration));
        const parsedReport = parseAcceptanceObligationReport(`## Acceptance obligations\n\n\`\`\`json\n${JSON.stringify(report)}\n\`\`\``);
        const invalid = [
            ...(parsedDeclaration.ok ? [] : parsedDeclaration.diagnostics),
            ...(parsedReport.ok ? [] : parsedReport.diagnostics),
        ];
        if (invalid.length > 0)
            return { outcome: 'fail', diagnostics: invalid, checked: 0 };
        if (!parsedDeclaration.ok || !parsedReport.ok)
            return { outcome: 'fail', diagnostics: invalid, checked: 0 };
        declaration = parsedDeclaration.value;
        report = parsedReport.value;
    }
    catch {
        return { outcome: 'fail', diagnostics: [{ code: 'obligation-runtime-shape', message: 'obligation payload cannot be validated' }], checked: 0 };
    }
    const errors = [];
    const known = new Set(checklist.items.map((item) => item.id));
    const reportById = new Map(report.items.map((item) => [item.contractId, item]));
    const declaredIds = new Set(declaration.items.map((item) => item.contractId));
    for (const result of report.items)
        if (!declaredIds.has(result.contractId))
            errors.push({ code: 'obligation-orphan-result', message: `${result.contractId} is not declared`, contractId: result.contractId });
    for (const item of declaration.items) {
        const id = item.contractId;
        if (!known.has(id))
            errors.push({ code: 'obligation-orphan-contract', message: `${id} is not in the current checklist`, contractId: id });
        const result = reportById.get(id);
        if (!result) {
            errors.push({ code: 'obligation-result-missing', message: `${id} has no result`, contractId: id });
            continue;
        }
        if (result.revision !== item.revision)
            errors.push({ code: 'obligation-revision-stale', message: `${id} result revision differs from declaration`, contractId: id });
        if (rank(result.original.authority) < rank(item.originalAuthority))
            errors.push({ code: 'obligation-original-authority', message: `${id} original authority is too weak`, contractId: id });
        if (rank(result.verifier.authority) < rank(item.verifierAuthority))
            errors.push({ code: 'obligation-verifier-authority', message: `${id} verifier authority is too weak`, contractId: id });
        if (rank(result.verifier.authority) < rank(result.original.authority))
            errors.push({ code: 'obligation-verifier-comparability', message: `${id} verifier authority is weaker than the original observation`, contractId: id });
        if (!result.verifier.passed)
            errors.push({ code: 'obligation-verifier-failed', message: `${id} verifier did not pass`, contractId: id });
        if (result.unresolvedQuestions.length > 0)
            errors.push({ code: 'obligation-unresolved', message: `${id} has unresolved questions`, contractId: id });
        if (result.contradictions.length > 0)
            errors.push({ code: 'obligation-contradiction', message: `${id} has contradictions`, contractId: id });
        const expected = new Set(item.requiredCases);
        const seen = new Set();
        const citations = new Set();
        const uniqueCitation = (value, role) => {
            const key = `${value.artifact}\0${value.quote}`;
            if (citations.has(key))
                errors.push({ code: 'obligation-evidence-reused', message: `${id} reuses the same citation for ${role}`, contractId: id });
            citations.add(key);
        };
        uniqueCitation(result.original.evidence, 'original observation');
        for (const row of result.cases) {
            if (seen.has(row.kind))
                errors.push({ code: 'obligation-case-duplicate', message: `${id} repeats ${row.kind}`, contractId: id });
            seen.add(row.kind);
            if (!expected.has(row.kind))
                errors.push({ code: 'obligation-case-extra', message: `${id} did not declare ${row.kind}`, contractId: id });
            if (rank(row.authority) < Math.max(rank(item.verifierAuthority), rank(result.original.authority)))
                errors.push({ code: 'obligation-case-authority', message: `${id} ${row.kind} authority is too weak`, contractId: id });
            if (!row.passed)
                errors.push({ code: 'obligation-case-failed', message: `${id} ${row.kind} did not pass`, contractId: id });
            uniqueCitation(row.evidence, row.kind);
            verifyCitation(row.evidence, reader, `${id}.${row.kind}`, errors, id);
        }
        for (const kind of expected)
            if (!seen.has(kind))
                errors.push({ code: 'obligation-case-missing', message: `${id} needs ${kind}`, contractId: id });
        verifyCitation(result.original.evidence, reader, `${id}.original`, errors, id);
        uniqueCitation(result.verifier.evidence, 'verifier');
        verifyCitation(result.verifier.evidence, reader, `${id}.verifier`, errors, id);
    }
    return { outcome: errors.length === 0 ? 'pass' : 'fail', diagnostics: errors, checked: declaration.items.length };
}
//# sourceMappingURL=acceptance-obligations.js.map