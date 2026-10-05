/** Pure evidence admission for a freshly installed release tarball (ADR-001). */
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, posix, relative, resolve } from 'node:path';
const obj = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const version = (v) => typeof v === 'string' && /^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(v);
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function requireEvidence(condition, reason) { if (!condition)
    throw new Error(reason); }
const severities = ['info', 'low', 'moderate', 'high', 'critical'];
function auditReport(input) {
    requireEvidence(obj(input) && integer(input.exitCode) && input.timedOut !== true, 'audit execution is missing, malformed or timed out');
    requireEvidence(typeof input.stdout === 'string' && input.stdout.trim() !== '', 'audit JSON is empty');
    let report;
    try {
        report = JSON.parse(input.stdout);
    }
    catch {
        throw new Error('audit JSON cannot be parsed');
    }
    requireEvidence(obj(report) && report.auditReportVersion === 2 && !('error' in report), 'unsupported audit schema or error envelope');
    requireEvidence(obj(report.metadata) && obj(report.metadata.vulnerabilities) && obj(report.vulnerabilities), 'audit vulnerability evidence is missing');
    const counts = report.metadata.vulnerabilities;
    requireEvidence([...severities, 'total'].every(k => integer(counts[k])), 'audit counts must be complete nonnegative integers');
    requireEvidence(severities.reduce((sum, k) => sum + counts[k], 0) === counts.total, 'audit severity total is inconsistent');
    const findings = Object.entries(report.vulnerabilities).map(([name, item]) => {
        requireEvidence(obj(item) && severities.includes(item.severity), 'unknown structured advisory severity');
        if (item.via !== undefined) {
            requireEvidence(Array.isArray(item.via), 'via advisory evidence must be an array');
            for (const advisory of item.via) {
                // npm10 emits strings for metavulnerability dependencies. Those are references,
                // not advisory objects; retain them without inventing a raw-advisory count.
                if (typeof advisory === 'string') {
                    requireEvidence(advisory.trim().length > 0, 'via dependency reference is empty');
                    continue;
                }
                requireEvidence(obj(advisory) && severities.includes(advisory.severity), 'via advisory severity is unknown or malformed');
                requireEvidence(integer(advisory.source) && ['name', 'dependency', 'title', 'url', 'range'].every(key => typeof advisory[key] === 'string'), 'via advisory object has unsupported field types');
                // Metadata counts aggregate vulnerability entries, not individual via advisories.
                // A lower advisory under a higher aggregate is valid; the reverse contradicts it.
                requireEvidence(severities.indexOf(advisory.severity) <= severities.indexOf(item.severity), 'via advisory severity exceeds the vulnerability entry severity');
            }
        }
        return { name, severity: item.severity };
    });
    requireEvidence(severities.every(s => findings.filter(f => f.severity === s).length === counts[s]), 'structured advisory severities contradict counts');
    const deps = report.metadata.dependencies;
    requireEvidence(obj(deps) && ['prod', 'dev', 'optional', 'peer', 'peerOptional', 'total'].every(k => integer(deps[k])), 'dependency count evidence is missing');
    // These categories overlap (npm includes the synthetic consumer in prod); never sum them.
    const high = counts.high + counts.critical > 0;
    requireEvidence(high || input.exitCode === 0, 'nonzero audit exit without valid high/critical findings');
    return { counts, findings, high, totalDependencies: deps.total };
}
/** pnpm's retained workspace JSON uses advisory IDs/counts per finding, not npm-v2 nodes. */
function workspaceReport(input) {
    requireEvidence(obj(input) && integer(input.exitCode) && input.timedOut !== true && typeof input.stdout === 'string', 'workspace execution unavailable');
    let data;
    try {
        data = JSON.parse(input.stdout);
    }
    catch {
        throw new Error('workspace JSON cannot be parsed');
    }
    if (obj(data) && data.auditReportVersion !== undefined)
        return auditReport(input);
    requireEvidence(obj(data) && !('error' in data) && Array.isArray(data.actions) && obj(data.advisories) && obj(data.metadata), 'unsupported workspace audit schema or error envelope');
    const values = data.metadata.vulnerabilities;
    requireEvidence(obj(values) && severities.every(k => integer(values[k])), 'workspace severity counts unavailable');
    const counts = Object.fromEntries(severities.map(k => [k, values[k]]));
    counts.total = severities.reduce((n, k) => n + counts[k], 0);
    const findings = Object.values(data.advisories).map(item => { requireEvidence(obj(item) && typeof item.module_name === 'string' && severities.includes(item.severity), 'unsupported workspace advisory'); return { name: item.module_name, severity: item.severity }; });
    // Legacy pnpm counters may count multiple findings for one advisory ID. Any structured
    // severity still needs a corresponding nonzero metadata count; never synthesize clean.
    requireEvidence(severities.every(k => counts[k] >= findings.filter(f => f.severity === k).length), 'workspace advisory severity contradicts metadata');
    requireEvidence(['dependencies', 'devDependencies', 'optionalDependencies', 'totalDependencies'].every(k => integer(data.metadata[k])), 'workspace dependency counters unavailable');
    const high = counts.high + counts.critical > 0;
    requireEvidence(high || input.exitCode === 0, 'workspace nonzero exit without threshold findings');
    return { counts, findings, high, totalDependencies: data.metadata.totalDependencies };
}
export function planReleasePackageAudit(pkg, timeoutMs = 120_000) {
    return { package: pkg.name, version: pkg.version, dir: pkg.dir, phases: ['pack', 'install', 'validate', 'audit'], timeoutMs };
}
function inside(path, parent) { const rel = relative(parent, path); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); }
function dependencyTables(manifest) {
    return ['dependencies', 'optionalDependencies', 'peerDependencies'].flatMap(key => {
        if (manifest[key] === undefined)
            return [];
        requireEvidence(obj(manifest[key]), `malformed ${key}`);
        requireEvidence(Object.values(manifest[key]).every(v => typeof v === 'string'), `malformed ${key} specs`);
        return [[key, manifest[key]]];
    });
}
function dependencyPath(parent, name, nodes) {
    requireEvidence(/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name), 'unsupported dependency name');
    let cursor = parent;
    while (cursor !== '.' && cursor !== '') {
        const candidate = `${cursor}/node_modules/${name}`;
        if (nodes[candidate] !== undefined)
            return candidate;
        cursor = posix.dirname(cursor);
    }
    const top = `node_modules/${name}`;
    return nodes[top] === undefined ? undefined : top;
}
function excludesHost(metadata, host) {
    if (!obj(metadata))
        return false;
    const excludes = (values, current) => {
        if (values === undefined)
            return false;
        requireEvidence(Array.isArray(values) && values.every(v => typeof v === 'string'), 'unsupported OS/CPU metadata');
        const positive = values.filter(v => !v.startsWith('!'));
        return values.includes(`!${current}`) || (positive.length > 0 && !positive.includes('any') && !positive.includes(current));
    };
    return excludes(metadata.os, host.os) || excludes(metadata.cpu, host.cpu);
}
function closure(roots, e, strictGraph = false) {
    requireEvidence(typeof e.consumerDir === 'string' && isAbsolute(e.consumerDir) && roots.every(root => !inside(e.consumerDir, root.dir) && !inside(e.consumerDir, dirname(dirname(dirname(root.dir))))), 'consumer must be outside the workspace');
    requireEvidence(roots.every(root => typeof root.tarball === 'string' && isAbsolute(root.tarball)), 'candidate tarball identity is missing');
    requireEvidence(obj(e.platform) && typeof e.platform.os === 'string' && typeof e.platform.cpu === 'string' && (!strictGraph || e.platform.os.length > 0 && e.platform.cpu.length > 0), 'host platform missing');
    requireEvidence(obj(e.lock) && [2, 3].includes(e.lock.lockfileVersion) && obj(e.lock.packages), 'unsupported consumer lock schema');
    const nodes = e.lock.packages;
    requireEvidence(obj(nodes['']) && version(nodes[''].version) && obj(nodes[''].dependencies), 'private versioned consumer root missing');
    const rootPaths = new Map(roots.map(root => ['node_modules/' + root.package, root]));
    requireEvidence(rootPaths.size === roots.length && Object.keys(nodes[''].dependencies).length === roots.length && roots.every(root => nodes[''].dependencies[root.package] === `file:${root.tarball}`), 'consumer root must contain only the selected tarball cohort');
    for (const [path, root] of rootPaths) {
        requireEvidence(obj(nodes[path]) && nodes[path].version === root.version && typeof nodes[path].resolved === 'string' && nodes[path].resolved.startsWith('file:') && resolve(e.consumerDir, nodes[path].resolved.slice(5)) === root.tarball, 'selected root lock identity missing');
        if (strictGraph)
            requireEvidence(typeof root.integrity === 'string' && /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(root.integrity) && nodes[path].integrity === root.integrity, 'selected root SRI contradicts supplied artifact');
    }
    requireEvidence(Array.isArray(e.installed), 'installed dependency inventory missing');
    const installed = new Map();
    for (const entry of e.installed) {
        requireEvidence(obj(entry) && typeof entry.path === 'string' && obj(entry.manifest) && entry.contained === true, 'installed node escapes consumer or has malformed identity');
        requireEvidence(!installed.has(entry.path), 'duplicate installed node');
        installed.set(entry.path, entry.manifest);
    }
    requireEvidence(roots.every(root => installed.get('node_modules/' + root.package)?.name === root.package && installed.get('node_modules/' + root.package)?.version === root.version), 'selected root not physically installed');
    const absences = [];
    const inventory = [];
    const graph = [];
    for (const [path, node] of Object.entries(nodes)) {
        if (path === '')
            continue;
        requireEvidence(obj(node) && path.startsWith('node_modules/') && !path.split('/').some(p => p === '..' || p === '.') && !path.includes('\\') && node.link !== true && version(node.version), 'unsupported linked/versionless lock node');
        if (!rootPaths.has(path) && node.resolved !== undefined)
            requireEvidence(typeof node.resolved === 'string' && /^https?:\/\//.test(node.resolved), 'dependency resolves outside registry policy');
        if (!rootPaths.has(path) && node.resolved === undefined)
            requireEvidence(node.inBundle === true, 'unresolved non-bundled dependency node');
        const manifest = installed.get(path);
        const name = path.split('node_modules/').pop();
        if (manifest !== undefined)
            requireEvidence(manifest.name === name && manifest.version === node.version, 'installed identity contradicts resolved lock');
        else
            requireEvidence(node.optional === true && excludesHost(node, e.platform), 'resolved dependency absent without supported platform exclusion');
        inventory.push({ path, name, version: node.version, installed: manifest !== undefined });
        const data = manifest ?? node;
        if (strictGraph) {
            requireEvidence(node.dev !== true && node.extraneous !== true, 'unselected development or extraneous node is outside production cohort');
            requireEvidence(/^(?:node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)(?:\/node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)*$/i.test(path), 'unsupported noncanonical lock path');
            requireEvidence(data.peerDependenciesMeta === undefined || obj(data.peerDependenciesMeta) && Object.values(data.peerDependenciesMeta).every(value => obj(value) && (value.optional === undefined || typeof value.optional === 'boolean')), 'malformed optional peer metadata');
            requireEvidence(!path.split('/').some(segment => segment === '') && (nodes[path].inBundle === true || rootPaths.has(path) || typeof node.integrity === 'string' && /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(node.integrity)), 'registry node SRI or canonical path missing');
            const equal = (a, b) => JSON.stringify(Object.entries((a ?? {})).sort()) === JSON.stringify(Object.entries((b ?? {})).sort());
            for (const table of ['dependencies', 'peerDependencies', 'optionalDependencies', 'peerDependenciesMeta'])
                requireEvidence(manifest === undefined || equal(manifest[table], node[table]), 'installed declarations contradict resolved lock');
            for (const field of ['os', 'cpu'])
                requireEvidence(manifest === undefined || JSON.stringify(manifest[field]) === JSON.stringify(node[field]), 'installed platform declaration contradicts lock');
        }
        const edges = [];
        for (const [table, declarations] of dependencyTables(data)) {
            for (const [dep, spec] of Object.entries(declarations)) {
                requireEvidence(!/^(?:workspace:|file:|link:|npm:)/.test(spec), 'unsupported local or alias dependency spec');
                const child = dependencyPath(path, dep, nodes);
                edges.push({ table, name: dep, spec: spec, target: child ?? null });
                if (child !== undefined) {
                    if (!installed.has(child) && table === 'optionalDependencies')
                        absences.push({ name: dep, kind: 'locked-not-installed', parent: path });
                    continue;
                }
                if (table === 'dependencies' && data.optionalDependencies?.[dep] !== undefined)
                    continue;
                if (table === 'peerDependencies' && data.peerDependenciesMeta?.[dep]?.optional === true) {
                    absences.push({ name: dep, kind: 'optional-peer', parent: path });
                    continue;
                }
                if (table === 'optionalDependencies' && excludesHost(e.optionalMetadata?.[`${path}:${dep}`], e.platform)) {
                    absences.push({ name: dep, kind: 'platform-excluded', parent: path });
                    continue;
                }
                throw new Error(`required dependency coverage missing: ${dep}`);
            }
        }
        graph.push({ path, name, version: node.version, selectedRoot: rootPaths.has(path), installed: manifest !== undefined, resolved: node.resolved ?? null, integrity: node.integrity ?? null, bundled: node.inBundle === true, optional: node.optional === true, ...(strictGraph ? { optionalWitnesses: Object.fromEntries(Object.keys(data.optionalDependencies ?? {}).filter(name => dependencyPath(path, name, nodes) === undefined).map(name => [name, e.optionalMetadata?.[path + ':' + name] ?? null])) } : {}), declarations: Object.fromEntries(dependencyTables(data)), peerDependenciesMeta: data.peerDependenciesMeta ?? {}, os: data.os ?? null, cpu: data.cpu ?? null, edges: edges.sort((a, b) => (a.table + ':' + a.name).localeCompare(b.table + ':' + b.name)) });
        const bundles = data.bundleDependencies ?? data.bundledDependencies;
        if (bundles !== undefined && bundles !== false) {
            requireEvidence(bundles === true || (Array.isArray(bundles) && bundles.every(n => typeof n === 'string')), 'unsupported bundle declaration');
            const names = bundles === true ? Object.keys(data.dependencies ?? {}) : bundles;
            for (const name of names) {
                const child = dependencyPath(path, name, nodes);
                requireEvidence(child !== undefined && nodes[child].inBundle === true && installed.has(child), 'bundled bytes absent from installed audited inventory');
            }
        }
    }
    requireEvidence([...installed.keys()].every(path => nodes[path] !== undefined), 'installed node absent from lock coverage');
    return { inventory, absences, graph: graph.sort((a, b) => a.path.localeCompare(b.path)) };
}
export function judgeReleasePackageAudit(plan, evidence, includeDev = false) {
    if (plan === undefined) {
        const base = { scope: 'workspace', nonBlocking: true, includeDev: includeDev || (obj(evidence) && evidence.includeDev === true) };
        if (evidence === undefined)
            return { ...base, status: 'not-run', reason: 'workspace audit was not executed' };
        try {
            const r = workspaceReport(evidence);
            return { ...base, status: r.counts.total > 0 ? 'findings' : 'clean', counts: r.counts, findings: r.findings };
        }
        catch (error) {
            return { ...base, status: 'error', reason: error instanceof Error ? error.message : 'workspace audit unavailable' };
        }
    }
    const base = { scope: 'package-consumer', package: plan.package, version: plan.version };
    let phases = [];
    try {
        requireEvidence(obj(evidence), 'package audit evidence missing');
        const e = evidence;
        requireEvidence(e.package === plan.package && e.version === plan.version, 'package audit identity mismatch');
        requireEvidence(Array.isArray(e.phases), 'package phase records missing');
        phases = e.phases.map((p) => { requireEvidence(obj(p) && typeof p.phase === 'string' && integer(p.exitCode), 'malformed phase record'); return { phase: p.phase, exitCode: p.exitCode, ...(p.timedOut === true ? { timedOut: true } : {}) }; });
        requireEvidence(plan.phases.join(',') === 'pack,install,validate,audit' && phases.map(p => p.phase).join(',') === plan.phases.join(','), 'required package phase missing, duplicated or reordered');
        requireEvidence(phases.every(p => p.timedOut !== true && (p.phase === 'audit' || p.exitCode === 0)), 'package phase failed or timed out');
        requireEvidence(e.sourceRestored === true && e.cleanup === true, 'source restoration or owned scratch cleanup not established');
        requireEvidence(hash(e.candidateSha256) && hash(e.lockSha256), 'candidate/lock digest missing');
        requireEvidence(typeof e.npmVersion === 'string' && /^10\.\d+\.\d+$/.test(e.npmVersion), 'unsupported or missing npm version');
        const c = closure([{ ...plan, tarball: e.tarball }], e);
        const r = auditReport(e.audit);
        requireEvidence(r.totalDependencies === c.inventory.length, 'audit dependency total does not cover the validated lock inventory');
        requireEvidence(phases[3].exitCode === e.audit.exitCode, 'audit phase and execution exits disagree');
        return { ...base, status: r.high ? 'findings' : 'clean', ...(r.high ? { failureClass: 'VULNS_HIGH', reason: `${r.counts.total} vulnerabilities found (high ${r.counts.high}, critical ${r.counts.critical})` } : {}), phases,
            candidateSha256: e.candidateSha256, lockSha256: e.lockSha256, npmVersion: e.npmVersion, platform: e.platform,
            resolvedCount: c.inventory.length, installedCount: e.installed.length, closure: c.inventory, optionalAbsences: c.absences, counts: r.counts, findings: r.findings };
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : 'package audit unavailable';
        const e = obj(evidence) ? evidence : {};
        return { ...base, status: 'error', failureClass: reason.includes('phase missing') || reason.includes('evidence missing') ? 'UNEXECUTED_STEP' : 'AUDIT_ERROR', reason, phases,
            ...(hash(e.candidateSha256) ? { candidateSha256: e.candidateSha256 } : {}), ...(hash(e.lockSha256) ? { lockSha256: e.lockSha256 } : {}),
            ...(version(e.npmVersion) ? { npmVersion: e.npmVersion } : {}),
            ...(obj(e.platform) && typeof e.platform.os === 'string' && typeof e.platform.cpu === 'string' ? { platform: { os: e.platform.os, cpu: e.platform.cpu } } : {}) };
    }
}
/** Additional five-root admission; the singleton judge uses the same closure/edge/audit validators. */
export function judgeReleaseCohortAudit(roots, evidence) {
    const base = { scope: 'package-cohort' };
    try {
        const expected = ['harness-core', 'harness-cli', 'skills-meta', 'keysarium', 'skills-feature-adr'].map(name => '@dzhechkov/' + name).sort();
        requireEvidence(Array.isArray(roots) && roots.length === 5 && JSON.stringify(roots.map(root => root.package).sort()) === JSON.stringify(expected), 'cohort must be the exact authorized five');
        requireEvidence(roots.every(root => version(root.version) && hash(root.sha256) && typeof root.dir === 'string' && isAbsolute(root.dir) && typeof root.tarball === 'string' && isAbsolute(root.tarball) && root.tarball === resolve(root.tarball)) && new Set(roots.map(root => root.tarball)).size === roots.length, 'cohort root artifact identity incomplete');
        requireEvidence(obj(evidence) && evidence.cleanup === true && evidence.sourceRestored === true && hash(evidence.lockSha256) && /^10\.\d+\.\d+$/.test(evidence.npmVersion), 'cohort execution, restoration or cleanup evidence incomplete');
        const e = evidence;
        requireEvidence(typeof e.lockBytes === 'string' && Buffer.byteLength(e.lockBytes) <= 16 * 1024 * 1024 && createHash('sha256').update(e.lockBytes).digest('hex') === e.lockSha256 && JSON.stringify(JSON.parse(e.lockBytes)) === JSON.stringify(e.lock), 'cohort raw lock/digest/object evidence disagree');
        requireEvidence(Array.isArray(e.phases) && e.phases.map((p) => p.phase).join(',') === 'pack,install,validate,audit' && e.phases.every((p) => integer(p.exitCode) && p.timedOut !== true && (p.phase === 'audit' || p.exitCode === 0)), 'cohort execution phases missing or failed');
        const c = closure(roots, e, true);
        const audit = auditReport(e.audit);
        requireEvidence(c.inventory.length <= 10000 && audit.totalDependencies === c.inventory.length && e.phases[3].exitCode === e.audit.exitCode, 'cohort audit does not cover the complete lock');
        if (audit.high)
            return { ...base, status: 'findings', reason: 'cohort has high/critical findings', counts: audit.counts };
        return { ...base, status: 'clean', graph: c.graph, optionalAbsences: c.absences, resolvedCount: c.inventory.length, counts: audit.counts };
    }
    catch (error) {
        return { ...base, status: 'error', reason: error instanceof Error ? error.message : 'cohort admission unavailable' };
    }
}
//# sourceMappingURL=release-package-audit.js.map