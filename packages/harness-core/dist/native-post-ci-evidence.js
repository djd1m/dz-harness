/** Finite local post-CI evidence contract. No network, filesystem or authentication claims. */
import { createHash } from 'node:crypto';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (s) => { throw Error('native-post-ci-' + s); };
const obj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const shape = (x, keys) => obj(x) && same(Object.keys(x), keys);
const hash = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const git = (s) => typeof s === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(s);
const text = (s) => typeof s === 'string' && s.trim().length > 0 && Buffer.byteLength(s) <= 2048;
const path = (s) => text(s) && !s.startsWith('/') && !/[\\\x00-\x1f]/.test(s) && !s.split('/').some((p) => !p || p === '.' || p === '..');
function rows(a, limit, key = 'path', nonempty = false) {
    if (!Array.isArray(a) || a.length > limit || nonempty && !a.length)
        fail('rows-invalid');
    const ids = a.map((r) => r?.[key]);
    if (!ids.every(text) || new Set(ids).size !== ids.length || !same(ids, [...ids].sort()))
        fail('rows-order-or-duplicate');
}
const state = (s, allowTombstone = true) => shape(s, ['kind']) && (s.kind === 'absent' || allowTombstone && s.kind === 'tombstone') || shape(s, ['kind', 'digest']) && s.kind === 'bytes' && hash(s.digest);
const at = (m, p) => !m.has(p) ? { kind: 'absent' } : m.get(p) === null ? { kind: 'tombstone' } : { kind: 'bytes', digest: m.get(p) };
function witness(mode, colored, samples) {
    if (!shape(mode, ['command', 'exitCode', 'log', 'caseCount', 'skippedCount', 'environment', 'witness']) || !text(mode.command) || mode.exitCode !== 0 || !Number.isInteger(mode.caseCount) || mode.caseCount <= 0 || mode.skippedCount !== 0)
        fail('qualification-mode-invalid');
    const env = { CI: colored ? 'true' : null, FORCE_COLOR: colored ? '1' : null, NO_COLOR: null, NODE_DISABLE_COLORS: null };
    if (!same(mode.environment, env))
        fail('effective-color-environment-invalid');
    const w = mode.witness;
    if (!shape(w, ['offset', 'length', 'projectName', 'testPath']) || !Number.isSafeInteger(w.offset) || w.offset < 0 || !Number.isSafeInteger(w.length) || w.length <= 0 || w.length > 65536 || !text(w.projectName) || w.projectName === 'unit' || !path(w.testPath))
        fail('mode-witness-invalid');
    if (!samples)
        return;
    const sample = samples.get(mode.log.path);
    if (!sample || sample.length !== w.length)
        fail('mode-witness-missing-or-short');
    let line, parsed;
    try {
        line = new TextDecoder('utf8', { fatal: true }).decode(sample);
        if (!line.startsWith('fixture observation ') || !line.endsWith('\n') || line.slice(0, -1).includes('\n'))
            fail('mode-record-invalid');
        parsed = JSON.parse(line.slice('fixture observation '.length));
    }
    catch {
        return fail('mode-record-invalid');
    }
    const stderr = parsed?.json?.results?.[0]?.baseRun?.stderr;
    if (typeof stderr !== 'string')
        fail('mode-record-stderr-missing');
    const sgr = /\x1b\[[0-9;]*m/g;
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const label = colored ? w.projectName : '|' + w.projectName + '|';
    const expected = new RegExp('^\\s*FAIL\\s+' + escape(label) + '\\s+' + escape(w.testPath) + '(?:\\s|$)');
    const header = stderr.split(/\r?\n/).slice(0, -1).find((line) => expected.test(line.replace(sgr, '')));
    if (!header)
        fail('mode-header-missing');
    const clean = header.replace(sgr, '');
    if (colored ? !/\x1b\[[0-9;]*m/.test(header) || clean.includes('|' + w.projectName + '|') : /\x1b\[[0-9;]*m/.test(header) || !clean.includes('|' + w.projectName + '|'))
        fail('mode-header-color-invalid');
}
/** Validate canonical descriptor structure and total scope algebra against measured manifests. */
export function validateNativePostCiEvidence(e, c) {
    if (!shape(e, ['schema', 'failure', 'scope', 'qualification', 'excludedEvidence']) || !['native-qe-post-ci-evidence-1', 'native-qe-post-ci-evidence-2'].includes(e.schema) || Buffer.byteLength(JSON.stringify(e) + '\n') > 128 * 1024 || !path(c.featurePath))
        fail('descriptor-invalid');
    const imported = e.schema === 'native-qe-post-ci-evidence-2';
    const before = new Map(c.previous.map(p => [p.path, p.digest])), after = new Map(c.current.map(p => [p.path, p.digest]));
    if (before.size !== c.previous.length || after.size !== c.current.length || new Set([...before.keys(), ...after.keys()]).size > 256)
        fail('manifest-limit-or-duplicate');
    const qa = c.featurePath + '/qa/post-ci-correction/';
    const proof = (p) => shape(p, ['path', 'digest']) && path(p.path) && p.path.startsWith(qa) && hash(p.digest);
    const f = e.failure, q = e.qualification, s = e.scope;
    if (!shape(f, ['repository', 'runId', 'jobId', 'headCommit', 'conclusion', 'closedRevision', 'log', 'cases']) || ![f.repository, f.runId, f.jobId].every(text) || !git(f.headCommit) || !['failure', 'cancelled-with-observed-failures'].includes(f.conclusion) || f.closedRevision !== sha(JSON.stringify(c.previous)) || !proof(f.log))
        fail('failure-binding-invalid');
    if (!Array.isArray(f.cases) || !f.cases.length || f.cases.length > 16 || !f.cases.every((r) => shape(r, ['path', 'title']) && path(r.path) && text(r.title)))
        fail('failure-cases-invalid');
    const cases = f.cases.map((r) => JSON.stringify([r.path, r.title]));
    if (new Set(cases).size !== cases.length || !same(cases, [...cases].sort()))
        fail('failure-cases-duplicate-or-order');
    if (!shape(q, ['sourceCommit', 'payloadRevision', 'color', 'neutral', 'ci']) || !git(q.sourceCommit) || q.payloadRevision !== sha(JSON.stringify(c.current)))
        fail('qualification-target-invalid');
    witness(q.color, true, c.witnesses);
    witness(q.neutral, false, c.witnesses);
    if (q.color.caseCount !== q.neutral.caseCount || q.color.log.path === q.neutral.log.path || q.color.witness.projectName !== q.neutral.witness.projectName || q.color.witness.testPath !== q.neutral.witness.testPath)
        fail('qualification-modes-mismatch');
    const ci = q.ci;
    if (!shape(ci, ['repository', 'runId', 'headCommit', 'targetRef', 'event', 'conclusion', 'policy', 'policyDigest', 'checks', 'log']) || ci.repository !== f.repository || !text(ci.runId) || ci.headCommit !== q.sourceCommit || !text(ci.targetRef) || !['pull_request', 'push'].includes(ci.event) || ci.conclusion !== 'success')
        fail('ci-binding-invalid');
    const p = ci.policy;
    if (!shape(p, ['schema', 'repository', 'targetRef', 'event', 'sourceCommit', 'payloadRevision', 'workflows', 'requiredChecks', 'operator', 'evidenceSource']) || p.schema !== 'native-qe-ci-policy-1' || p.repository !== ci.repository || p.targetRef !== ci.targetRef || p.event !== ci.event || p.sourceCommit !== q.sourceCommit || p.payloadRevision !== q.payloadRevision || !text(p.operator) || !text(p.evidenceSource) || ci.policyDigest !== sha(JSON.stringify(p) + '\n'))
        fail('ci-policy-invalid');
    rows(p.workflows, 16, 'path', true);
    if (!p.workflows.every((w) => shape(w, ['path', 'digest']) && /^\.github\/workflows\/[^/]+\.ya?ml$/.test(w.path) && hash(w.digest) && after.get(w.path) === w.digest))
        fail('ci-workflow-binding-invalid');
    const id = (r) => JSON.stringify([r.workflowPath, r.checkName, r.appId]);
    if (!Array.isArray(p.requiredChecks) || !p.requiredChecks.length || p.requiredChecks.length > 16 || !p.requiredChecks.every((r) => shape(r, ['workflowPath', 'checkName', 'appId']) && [r.workflowPath, r.checkName, r.appId].every(text) && p.workflows.some((w) => w.path === r.workflowPath)))
        fail('ci-required-checks-invalid');
    const required = p.requiredChecks.map(id);
    if (new Set(required).size !== required.length || !same(required, [...required].sort()))
        fail('ci-required-checks-duplicate-or-order');
    if (!Array.isArray(ci.checks) || ci.checks.length !== required.length || !ci.checks.every((r) => shape(r, ['workflowPath', 'checkName', 'appId', 'runId', 'jobId', 'headCommit', 'conclusion']) && [r.runId, r.jobId].every(text) && r.headCommit === q.sourceCommit && r.conclusion === 'success') || !same(ci.checks.map(id), required) || new Set(ci.checks.map((r) => JSON.stringify([r.runId, r.jobId]))).size !== required.length)
        fail('ci-complete-required-set-mismatch');
    const logs = [f.log, q.color.log, q.neutral.log, ci.log];
    if (!logs.every(proof) || logs.some((l, i) => logs.some((n, j) => i !== j && l.path === n.path && l.digest !== n.digest)))
        fail('logs-invalid');
    const distinctLogs = [...new Map(logs.map(l => [l.path, l])).values()];
    if (distinctLogs.length > 4)
        fail('log-count-limit');
    if (c.elapsedMs !== undefined && (!Number.isFinite(c.elapsedMs) || c.elapsedMs < 0 || c.elapsedMs > 2000))
        fail('observation-deadline-exceeded');
    if (c.logObservations) {
        const measured = c.logObservations;
        if (measured.length !== distinctLogs.length || new Set(measured.map(l => l.path)).size !== measured.length || measured.reduce((n, l) => n + l.bytesRead, 0) > 64 * 1024 * 1024 || measured.some(l => !Number.isSafeInteger(l.size) || l.size < 0 || l.size > 16 * 1024 * 1024 || l.bytesRead !== l.size || !l.identityStable || !logs.some(p => p.path === l.path && p.digest === l.digest)))
            fail('complete-log-observation-invalid');
    }
    if (!shape(s, ['fixture', 'upstream', 'reviewArtifacts', 'protectedPaths', 'workflowDependencies'].concat(imported ? ['importedArtifacts'] : [])))
        fail('scope-invalid');
    const fixture = s.fixture, u = s.upstream;
    if (!shape(fixture, ['path', 'before', 'after', 'patch']) || !/^packages\/.+\/test\/.+\.test\.ts$/.test(fixture.path) || !proof(fixture.patch) || !state(fixture.before) || fixture.before.kind !== 'bytes' || !state(fixture.after) || fixture.after.kind !== 'bytes' || same(fixture.before, fixture.after) || !f.cases.some((r) => r.path === fixture.path))
        fail('fixture-invalid');
    if (!shape(u, ['baseCommit', 'acceptedCommit', 'acceptanceEvidence', 'integrationCommit', 'integrationTree', 'rows']) || ![u.baseCommit, u.acceptedCommit, u.integrationCommit, u.integrationTree].every(git) || !proof(u.acceptanceEvidence))
        fail('upstream-invalid');
    rows(u.rows, 256);
    rows(s.reviewArtifacts, 2);
    rows(s.protectedPaths, 256);
    rows(s.workflowDependencies, 16);
    const partition = new Map();
    const enroll = (r, b, a) => {
        if (!path(r.path) || partition.has(r.path) || !state(b) || !state(a) || !same(b, at(before, r.path)) || !same(a, at(after, r.path)) || same(b, a))
            fail('scope-partition-invalid');
        partition.set(r.path, r);
    };
    enroll(fixture, fixture.before, fixture.after);
    for (const r of u.rows) {
        if (!shape(r, ['path', 'before', 'upstream', 'integrated']) || !state(r.upstream, false) || r.upstream.kind !== 'bytes' || !state(r.integrated, false) || r.integrated.kind !== 'bytes')
            fail('import-state-invalid');
        enroll(r, r.before, r.integrated);
    }
    for (const r of s.reviewArtifacts) {
        if (!shape(r, ['path', 'before', 'after']) || ![c.featurePath + '/06_implementation_plan.md', c.featurePath + '/03.5_ideation_report.md'].includes(r.path) || r.before?.kind !== 'bytes' || r.after?.kind !== 'bytes')
            fail('review-artifact-invalid');
        enroll(r, r.before, r.after);
    }
    for (const r of s.workflowDependencies) {
        if (!shape(r, ['path', 'before', 'after', 'preimport', 'accepted', 'integrated', 'qualified', 'current']) || !same(r.before, { kind: 'absent' }) || !state(r.after) || r.after.kind !== 'bytes' || !['preimport', 'accepted', 'integrated', 'qualified', 'current'].every(k => same(r[k], r.after)) || !p.workflows.some((w) => w.path === r.path && w.digest === r.after.digest) || !p.requiredChecks.some((w) => w.workflowPath === r.path))
            fail('workflow-enrollment-invalid');
        enroll(r, r.before, r.after);
    }
    for (const r of s.protectedPaths)
        if (!shape(r, ['path', 'digest']) || !path(r.path) || !hash(r.digest) || before.get(r.path) !== r.digest || after.get(r.path) !== r.digest || partition.has(r.path))
            fail('protected-path-changed');
    for (const name of new Set([...before.keys(), ...after.keys()])) {
        const b = at(before, name), a = at(after, name);
        if (b.kind !== 'absent' && a.kind === 'absent' || b.kind === 'bytes' && a.kind !== 'bytes' || a.kind === 'tombstone' && b.kind !== 'tombstone' || !same(b, a) !== partition.has(name))
            fail('scope-unaccounted-or-deleted');
    }
    rows(e.excludedEvidence, 256);
    if (!e.excludedEvidence.every((r) => proof(r) && /\.(?:json|jsonl|log|txt|md|patch)$/.test(r.path) && !before.has(r.path) && !after.has(r.path)))
        fail('excluded-evidence-invalid');
    const proofPaths = [...distinctLogs, fixture.patch, u.acceptanceEvidence, ...e.excludedEvidence].map(x => x.path);
    if (new Set(proofPaths).size !== proofPaths.length)
        fail('proof-overlap');
    if (imported) {
        rows(s.importedArtifacts, 256, 'path', true);
        const forbidden = new Set([...before.keys(), ...after.keys(), fixture.path, ...u.rows.map((r) => r.path), ...s.reviewArtifacts.map((r) => r.path), ...s.protectedPaths.map((r) => r.path), ...s.workflowDependencies.map((r) => r.path), ...proofPaths]);
        const paths = s.importedArtifacts.map((r) => r.path), directories = new Set();
        for (const r of s.importedArtifacts) {
            if (!shape(r, ['path', 'before', 'digest', 'size']) || !path(r.path) || !/^features\/[a-z0-9][a-z0-9-]*\/.+/.test(r.path) || !same(r.before, { kind: 'absent' }) || !hash(r.digest) || !Number.isSafeInteger(r.size) || r.size < 0 || r.size > 2097152)
                fail('imported-artifact-invalid');
            const parts = r.path.split('/'), root = parts.slice(0, 2).join('/');
            if (root === c.featurePath || parts.some((p) => ['.fa-state', '.git', '.dz', '.agentic-qe'].includes(p)) || [...forbidden].some(p => p === root || p.startsWith(root + '/') || r.path === p || r.path.startsWith(p + '/') || p.startsWith(r.path + '/')))
                fail('imported-artifact-overlap-or-authority');
            for (let i = 2; i < parts.length; i++)
                directories.add(parts.slice(0, i).join('/'));
        }
        if (paths.some(p => directories.has(p)))
            fail('imported-file-directory-overlap');
        for (const p of proofPaths)
            for (let i = c.featurePath.split('/').length + 2; i < p.split('/').length; i++)
                directories.add(p.split('/').slice(0, i).join('/'));
        if (proofPaths.length + 1 + paths.length > 256 || directories.size > 256)
            fail('immutable-inventory-limit');
    }
    return e;
}
/** One observation's cross-class identity map; same canonical path may be rechecked. */
export function nativePostCiIdentityRegistry() {
    const files = new Map(), directories = new Map();
    return (path, stat, directory = false) => {
        const registry = directory ? directories : files, id = stat.dev + ':' + stat.ino, prior = registry.get(id);
        if (prior !== undefined && prior !== path)
            fail('imported-identity-alias');
        registry.set(id, path);
    };
}
//# sourceMappingURL=native-post-ci-evidence.js.map