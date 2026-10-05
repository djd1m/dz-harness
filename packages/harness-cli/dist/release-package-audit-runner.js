/** Bounded npm/filesystem execution for ADR-001's singleton tarball consumer. */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { judgeReleasePackageAudit, judgeReleaseCohortAudit, packArtifact, readWorkspaceVersions, detectSiblingDrift, hashPackBytes, isSafeManifestPath, verifyManifest, planReadmeVersionSync, rewriteWorkspaceSpecs } from '@dzhechkov/harness-core';
const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const policy = ['--omit=dev', '--include=prod', '--include=optional', '--include=peer', '--workspaces=false', '--global=false', '--legacy-peer-deps=false', '--strict-peer-deps=true', '--force=false', '--dry-run=false', '--offline=false', '--package-lock=true', '--package-lock-only=false', '--ignore-scripts=true', '--fetch-retries=0', '--fetch-timeout=30000'];
const within = (child, root) => { const r = relative(root, child); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
function captureInstalledConsumer(consumer, cache, checked) {
    const e = { optionalMetadata: {} };
    let metadataProbes = 0;
    const bytes = readFileSync(join(consumer, 'package-lock.json'));
    if (bytes.length > 16 * 1024 * 1024)
        throw new Error('consumer lock exceeds evidence bound');
    e.lockSha256 = digest(bytes);
    e.lockBytes = bytes.toString('utf8');
    e.lock = JSON.parse(e.lockBytes);
    e.installed = [];
    // Read the installed directories independently of the lock list, so extraneous bundled
    // bytes absent from a lock cannot silently disappear from validation/audit coverage.
    const scan = (modules) => {
        if (!existsSync(modules))
            return;
        if (!lstatSync(modules).isDirectory() || !within(realpathSync(modules), realpathSync(consumer)))
            throw new Error('consumer inventory directory escapes containment');
        const packageDirs = [];
        for (const entry of readdirSync(modules, { withFileTypes: true })) {
            if (entry.name.startsWith('.'))
                continue;
            const path = join(modules, entry.name);
            if (entry.name.startsWith('@') && entry.isDirectory())
                for (const scoped of readdirSync(path))
                    packageDirs.push(join(path, scoped));
            else
                packageDirs.push(path);
        }
        for (const path of packageDirs) {
            const info = lstatSync(path);
            const contained = !info.isSymbolicLink() && info.isDirectory() && within(realpathSync(path), realpathSync(consumer));
            if (!contained)
                throw new Error('consumer installed node escapes containment');
            const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
            const rel = relative(consumer, path).split('\\').join('/');
            if (e.installed.length >= 10_000)
                throw new Error('consumer inventory exceeds evidence bound');
            e.installed.push({ path: rel, manifest, contained });
            if (contained)
                scan(join(path, 'node_modules'));
        }
    };
    scan(join(consumer, 'node_modules'));
    // npm may omit an optional dependency entirely while returning install exit0. A registry
    // metadata lookup is only absence evidence when its declared OS/CPU excludes this host.
    for (const entry of e.installed) {
        for (const [name, spec] of Object.entries(entry.manifest.optionalDependencies ?? {})) {
            const represented = Object.keys(e.lock.packages ?? {}).some(path => path.endsWith(`node_modules/${name}`));
            if (!represented) {
                if (++metadataProbes > 32)
                    throw new Error('optional metadata probe bound exceeded');
                const meta = checked(['npm', 'view', `${name}@${spec}`, '--json', '--offline=false', '--fetch-retries=0', '--fetch-timeout=30000', `--cache=${cache}`], consumer);
                e.optionalMetadata[`${entry.path}:${name}`] = JSON.parse(meta.stdout);
            }
        }
    }
    return e;
}
export function runReleasePackageAudit(plan, options) {
    let scratch;
    const phases = [];
    const e = { package: plan.package, version: plan.version, phases, platform: { os: process.platform, cpu: process.arch }, optionalMetadata: {}, cleanup: false, sourceRestored: false };
    const manifestPath = join(plan.dir, 'package.json');
    let original;
    let phase = 'pack';
    const deadline = Date.now() + plan.timeoutMs * 4;
    try {
        original = readFileSync(manifestPath);
        const root = realpathSync(options.scratchRoot ?? (existsSync('/var/tmp') ? '/var/tmp' : tmpdir()));
        if (within(root, realpathSync(options.monorepoRoot)))
            throw new Error('scratch root must be outside the workspace');
        scratch = mkdtempSync(join(root, 'dz-release-audit-'));
        const packDir = join(scratch, 'pack');
        const consumer = join(scratch, 'consumer');
        const cache = join(scratch, 'cache');
        mkdirSync(packDir);
        mkdirSync(consumer);
        mkdirSync(cache);
        e.consumerDir = consumer;
        // Child config is scoped; normal inherited registry/auth still works. Never log environment.
        const env = { ...process.env, npm_config_cache: cache, npm_config_offline: 'false', npm_config_ignore_scripts: 'true', npm_config_omit: 'dev', npm_config_include: 'prod optional peer', npm_config_legacy_peer_deps: 'false', npm_config_strict_peer_deps: 'true', npm_config_global: 'false', npm_config_workspaces: 'false', npm_config_force: 'false', npm_config_dry_run: 'false', npm_config_package_lock: 'true', npm_config_package_lock_only: 'false', npm_config_audit: 'true' };
        const packEnv = { ...process.env, npm_config_cache: cache };
        const run = (argv, cwd, childEnv = env) => {
            const timeoutMs = Math.min(plan.timeoutMs, deadline - Date.now());
            if (timeoutMs <= 0)
                throw new Error('package audit deadline exceeded');
            return options.run(argv.map((s, i) => i === 0 ? s : quote(s)).join(' '), { cwd, timeoutMs, argv, env: childEnv });
        };
        const checked = (argv, cwd, childEnv = env) => {
            const r = run(argv, cwd, childEnv);
            if (r.exitCode !== 0 || r.timedOut === true)
                throw new Error(`${argv[0]} ${argv[1]} failed${r.timedOut === true ? ' (timeout)' : ''}`);
            return r;
        };
        const artifact = packArtifact({ pkgDir: plan.dir, destDir: packDir, pinVersions: readWorkspaceVersions(options.monorepoRoot), exec: (command, opts) => {
                // AM-1: accept only the shared packer's two closed templates. JSON paths are DATA,
                // decoded without eval and passed as argv; double-quoted shell interpolation is forbidden.
                let argv;
                const pack = /^npm pack \. --pack-destination ("(?:[^"\\]|\\.)*")$/.exec(command);
                const tar = /^tar -tzf ("(?:[^"\\]|\\.)*")$/.exec(command);
                if (pack !== null)
                    argv = ['npm', 'pack', '.', '--pack-destination', JSON.parse(pack[1])];
                else if (tar !== null)
                    argv = ['tar', '-tzf', JSON.parse(tar[1])];
                else
                    throw new Error('unsupported shared pack command template');
                return checked(argv, opts.cwd, packEnv).stdout;
            } });
        e.tarball = artifact.tgzPath;
        e.candidateSha256 = artifact.sha256;
        e.sourceRestored = readFileSync(manifestPath).equals(original);
        if (!e.sourceRestored)
            throw new Error('shared packer did not restore source manifest');
        phases.push({ phase, exitCode: 0 });
        const npmVersion = checked(['npm', '--version'], consumer);
        e.npmVersion = npmVersion.stdout.trim();
        if (!/^10\.\d+\.\d+$/.test(e.npmVersion))
            throw new Error('unsupported npm version');
        writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'dz-audit-consumer', version: '1.0.0', private: true, dependencies: { [plan.package]: `file:${artifact.tgzPath}` } }, null, 2) + '\n');
        phase = 'install';
        const install = run(['npm', 'install', '--audit=false', '--fund=false', ...policy, `--cache=${cache}`], consumer);
        phases.push({ phase, exitCode: install.exitCode, ...(install.timedOut === true ? { timedOut: true } : {}) });
        if (install.exitCode !== 0 || install.timedOut === true)
            throw new Error('isolated consumer install failed');
        phase = 'validate';
        Object.assign(e, captureInstalledConsumer(consumer, cache, checked));
        phases.push({ phase, exitCode: 0 });
        phase = 'audit';
        e.audit = run(['npm', 'audit', '--json', '--audit-level=high', '--audit=true', ...policy, `--cache=${cache}`], consumer);
        phases.push({ phase, exitCode: e.audit.exitCode, ...(e.audit.timedOut === true ? { timedOut: true } : {}) });
    }
    catch (error) {
        e.executionError = `package ${phase} execution failed`; // avoid echoing credential-bearing subprocess/config errors
        if (phases[phases.length - 1]?.phase !== phase)
            phases.push({ phase, exitCode: 1 });
    }
    finally {
        if (original !== undefined) {
            try {
                e.sourceRestored = readFileSync(manifestPath).equals(original);
            }
            catch {
                e.sourceRestored = false;
            }
        }
        if (scratch !== undefined) {
            try {
                rmSync(scratch, { recursive: true, force: true });
                e.cleanup = !existsSync(scratch);
            }
            catch {
                e.cleanup = false;
            }
        }
        else
            e.cleanup = true;
    }
    const result = judgeReleasePackageAudit(plan, e);
    if (result.status === 'error' && typeof e.executionError === 'string')
        return { result: { ...result, reason: `${result.reason}; ${e.executionError}` }, evidence: e };
    return { result, evidence: e };
}
function captureCohortAudit(roots, options) {
    let scratch;
    let phase = 'pack';
    const phases = [];
    const e = { phases, platform: { os: process.platform, cpu: process.arch }, cleanup: false, sourceRestored: false };
    const timeoutMs = options.timeoutMs ?? 120000;
    const deadline = Date.now() + timeoutMs * 4;
    try {
        const root = realpathSync(options.scratchRoot ?? (existsSync('/var/tmp') ? '/var/tmp' : tmpdir()));
        if (within(root, realpathSync(options.monorepoRoot)))
            throw new Error('cohort scratch must be outside workspace');
        scratch = mkdtempSync(join(root, 'dz-retained-cohort-'));
        const consumer = join(scratch, 'consumer');
        const cache = join(scratch, 'cache');
        mkdirSync(consumer);
        mkdirSync(cache);
        e.consumerDir = consumer;
        const env = { ...process.env, npm_config_cache: cache, npm_config_offline: 'false', npm_config_ignore_scripts: 'true', npm_config_omit: 'dev', npm_config_include: 'prod optional peer', npm_config_legacy_peer_deps: 'false', npm_config_strict_peer_deps: 'true', npm_config_global: 'false', npm_config_workspaces: 'false', npm_config_force: 'false', npm_config_dry_run: 'false', npm_config_package_lock: 'true', npm_config_package_lock_only: 'false', npm_config_audit: 'true' };
        const run = (argv, cwd) => { const remaining = Math.min(timeoutMs, deadline - Date.now()); if (remaining <= 0)
            throw new Error('cohort deadline exceeded'); return options.run(argv.map((s, i) => i === 0 ? s : quote(s)).join(' '), { cwd, timeoutMs: remaining, argv, env }); };
        const checked = (argv, cwd) => { const result = run(argv, cwd); if (result.exitCode !== 0 || result.timedOut)
            throw new Error('cohort subprocess failed'); return result; };
        for (const artifact of roots) {
            const bytes = readFileSync(artifact.tarball);
            if (digest(bytes) !== artifact.sha256 || 'sha512-' + createHash('sha512').update(bytes).digest('base64') !== artifact.integrity)
                throw new Error('cohort artifact changed');
        }
        phases.push({ phase, exitCode: 0 });
        e.sourceRestored = true;
        e.npmVersion = checked(['npm', '--version'], consumer).stdout.trim();
        writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'dz-retained-cohort', version: '1.0.0', private: true, dependencies: Object.fromEntries(roots.map(root => [root.package, 'file:' + root.tarball])) }, null, 2) + '\n');
        phase = 'install';
        const install = run(['npm', 'install', '--audit=false', '--fund=false', ...policy, '--cache=' + cache], consumer);
        phases.push({ phase, exitCode: install.exitCode, ...(install.timedOut ? { timedOut: true } : {}) });
        if (install.exitCode !== 0 || install.timedOut)
            throw new Error('cohort install failed');
        phase = 'validate';
        Object.assign(e, captureInstalledConsumer(consumer, cache, checked));
        phases.push({ phase, exitCode: 0 });
        phase = 'audit';
        e.audit = run(['npm', 'audit', '--json', '--audit-level=high', '--audit=true', ...policy, '--cache=' + cache], consumer);
        phases.push({ phase, exitCode: e.audit.exitCode, ...(e.audit.timedOut ? { timedOut: true } : {}) });
        for (const artifact of roots)
            if (digest(readFileSync(artifact.tarball)) !== artifact.sha256)
                throw new Error('cohort artifact mutated during capture');
    }
    catch {
        e.executionError = 'cohort ' + phase + ' execution failed';
        if (phases.at(-1)?.phase !== phase)
            phases.push({ phase, exitCode: 1 });
    }
    finally {
        if (scratch) {
            try {
                rmSync(scratch, { recursive: true, force: true });
                e.cleanup = !existsSync(scratch);
            }
            catch {
                e.cleanup = false;
            }
        }
    }
    return { result: judgeReleaseCohortAudit(roots, e), evidence: e };
}
// Execution authority and continuity state never come from caller-created/copyable objects.
const completedCaptures = new WeakMap();
const freezeEvidence = (value) => { if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value))
        freezeEvidence(child);
    Object.freeze(value);
} return value; };
const retainedRoots = ['harness-core', 'harness-cli', 'skills-meta', 'keysarium', 'skills-feature-adr'].map(n => '@dzhechkov/' + n).sort();
const retainedAdapters = ['adapter-agents-md', 'adapter-claude', 'adapter-codex', 'adapter-cursor', 'adapter-gemini', 'adapter-hermes', 'adapter-copilot', 'adapter-opencode', 'adapter-windsurf', 'adapter-openclaude'].map(n => '@dzhechkov/' + n).sort();
const canonicalProof = (v) => Array.isArray(v) ? '[' + v.map(canonicalProof).join(',') + ']' : v !== null && typeof v === 'object' ? '{' + Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => JSON.stringify(k) + ':' + canonicalProof(value)).join(',') + '}' : JSON.stringify(v);
/** Actual scoped capture; its referential completion capability is deliberately not serializable. */
export function buildRetainedBindingProof(options) {
    let scratch;
    let completed;
    let state;
    let reason = 'retained proof capture incomplete';
    let stage = 'admission';
    const invocationOwner = options.invocation, phaseOwner = options.phaseIdentity;
    const authorize = (subject, invocation, phase) => completed !== undefined && subject === completed && invocation === invocationOwner && phase === phaseOwner;
    const deadline = Date.now() + 480000;
    try {
        const previousOwned = options.previous ? completedCaptures.get(options.previous) : undefined;
        if (options.phase === 'final' && (!previousOwned || previousOwned.invocation !== options.invocation || previousOwned.phase === options.phaseIdentity || previousOwned.proof.phase !== 'preview' || !options.previous.authorize(previousOwned.proof, options.invocation, previousOwned.phase)))
            throw new Error('exact previous invocation completion absent');
        const previousState = previousOwned?.state;
        if (JSON.stringify(options.roots.map(r => r.name).sort()) !== JSON.stringify(retainedRoots) || !options.trustedPublicKeyPem || options.phase === 'final' && (!options.previous?.ok || !previousState || !options.artifacts || options.artifacts.length !== 5))
            throw new Error('exact five/root/phase admission absent');
        const root = realpathSync(options.monorepoRoot), outside = realpathSync(options.scratchRoot ?? (existsSync('/var/tmp') ? '/var/tmp' : tmpdir()));
        if (within(outside, root))
            throw new Error('scratch must be external');
        scratch = mkdtempSync(join(outside, 'dz-retained-proof-'));
        const cache = join(scratch, 'cache');
        mkdirSync(cache);
        const env = { ...process.env, npm_config_cache: cache, npm_config_offline: 'false', npm_config_ignore_scripts: 'true', npm_config_workspaces: 'false', npm_config_global: 'false', npm_config_force: 'false' };
        // Source packing retains the workspace context, as in the singleton audit runner.
        const packEnv = { ...process.env, npm_config_cache: cache };
        const checked = (argv, cwd = root, childEnv = env) => { const timeoutMs = Math.min(120000, deadline - Date.now()); if (timeoutMs <= 0)
            throw new Error('capture deadline exceeded'); const r = options.run(argv.map((s, i) => i === 0 ? s : quote(s)).join(' '), { argv, cwd, timeoutMs, env: childEnv }); if (r.exitCode !== 0 || r.timedOut || Buffer.byteLength(r.stdout) > 16 * 1024 * 1024)
            throw new Error('subprocess unavailable'); return r.stdout; };
        if (previousOwned && (previousOwned.root !== root || previousOwned.trustedKey !== options.trustedPublicKeyPem))
            throw new Error('exact previous source/trust authority differs');
        const sourceDir = (name) => join(root, 'packages', name);
        if (options.roots.some(r => realpathSync(r.dir) !== realpathSync(sourceDir(r.name)) || !within(realpathSync(r.dir), root)))
            throw new Error('exact root source path differs');
        if (options.phase === 'final' && JSON.stringify(options.artifacts.map(a => a.name).sort()) !== JSON.stringify(retainedRoots))
            throw new Error('final artifact cohort differs');
        const snapshotRefs = () => { const head = checked(['git', 'rev-parse', 'HEAD']).trim(); if (!/^[a-f0-9]{40,64}$/.test(head) || checked(['git', 'rev-parse', '--is-shallow-repository']).trim() !== 'false')
            throw new Error('unborn/shallow history'); const refs = checked(['git', 'for-each-ref', '--format=%(refname) %(objectname)']).trim().split('\n').filter(Boolean).map(line => { const [ref, oid] = line.split(' '); if (!ref || !oid || !/^[a-f0-9]{40,64}$/.test(oid))
            throw new Error('invalid ref snapshot'); return { ref, oid }; }).sort((a, b) => a.ref.localeCompare(b.ref)); return { head, refs }; };
        stage = 'history';
        const frozen = snapshotRefs();
        const tips = [...new Set([frozen.head, ...frozen.refs.map(r => r.oid)])];
        const workspace = readWorkspaceVersions(root);
        const histories = {};
        const creations = {};
        let historyBytes = 0;
        const merges = checked(['git', 'rev-list', '--min-parents=2', ...tips]).trim().split('\n').filter(Boolean);
        for (const name of retainedAdapters) {
            const path = relative(root, join(sourceDir(name), 'package.json')).split('\\').join('/');
            checked(['git', 'ls-files', '--error-unmatch', '--', path]);
            const current = readFileSync(join(root, path));
            hashPackBytes('package.json', current);
            if (JSON.parse(current.toString()).dependencies?.['@dzhechkov/core'] !== 'workspace:*')
                throw new Error('current protocol changed');
            const additions = checked(['git', 'log', '--full-history', '--diff-filter=A', '--format=%H', ...tips, '--', path]).trim().split('\n').filter(Boolean);
            if (new Set(additions).size !== 1)
                throw new Error('ambiguous current-path creation boundary');
            const creation = additions[0];
            creations[name] = creation;
            const revisions = new Set(checked(['git', 'rev-list', '--full-history', ...tips, '--', path]).trim().split('\n').filter(Boolean));
            for (const merge of merges) {
                revisions.add(merge);
                for (const parent of checked(['git', 'show', '-s', '--format=%P', merge]).trim().split(' ').filter(Boolean))
                    revisions.add(parent);
            }
            if (revisions.size === 0 || revisions.size > 2048)
                throw new Error('history bound exceeded');
            const rows = [];
            for (const oid of [...revisions].sort()) {
                if (!/^[a-f0-9]{40,64}$/.test(oid))
                    throw new Error('bad history object');
                const listing = checked(['git', 'ls-tree', '-z', oid, '--', path]);
                if (!listing) {
                    const ancestry = options.run('git merge-base --is-ancestor', { argv: ['git', 'merge-base', '--is-ancestor', creation, oid], cwd: root, timeoutMs: 120000, env });
                    if (ancestry.exitCode !== 1 || ancestry.timedOut)
                        throw new Error('path deletion or unreadable history');
                    rows.push({ oid, blob: null, literal: null, boundary: true });
                    continue;
                }
                const match = /^(100644|100755) blob ([a-f0-9]{40,64})\t([^\0]+)\0$/.exec(listing);
                if (!match || match[3] !== path)
                    throw new Error('unsupported manifest tree entry');
                const bytes = Buffer.from(checked(['git', 'show', oid + ':' + path]));
                historyBytes += bytes.length;
                if (historyBytes > 16 * 1024 * 1024)
                    throw new Error('history byte bound exceeded');
                hashPackBytes('package.json', bytes);
                const manifest = JSON.parse(bytes.toString());
                if (manifest.dependencies?.['@dzhechkov/core'] !== 'workspace:*')
                    throw new Error('reachable declaration changed');
                rows.push({ oid, blob: match[2], literal: 'workspace:*', boundary: false });
            }
            histories[name] = rows;
        }
        const trackedSnapshot = () => { const paths = checked(['git', 'ls-files', '-z', '--', ...[...retainedRoots, ...retainedAdapters].map(n => 'packages/' + n)]).split('\0').filter(Boolean); return Object.fromEntries(paths.map(path => { const physical = join(root, path); if (path.length > 4096 || /[\x00-\x1f\\]/.test(path) || path.split('/').some(segment => ['', '.', '..'].includes(segment)) || !lstatSync(physical).isFile() || !within(realpathSync(physical), root))
            throw new Error('selected or unselected source containment unavailable'); return [path, digest(readFileSync(physical))]; })); };
        const tracked = trackedSnapshot();
        const selectedSources = Object.fromEntries(retainedRoots.map(name => [name, readFileSync(join(sourceDir(name), 'package.json'), 'utf8')]));
        if (previousState) {
            if (canonicalProof(frozen) !== canonicalProof({ head: previousOwned.proof.head, refs: previousOwned.proof.refs }))
                throw new Error('source/refs changed since preview');
            if (JSON.stringify(Object.keys(tracked).sort()) !== JSON.stringify(Object.keys(previousState.tracked).sort()))
                throw new Error('selected or unselected tracked file set changed');
            const expectedVersions = new Map(previousOwned.proof.workspaceVersions);
            for (const artifact of options.artifacts)
                expectedVersions.set(artifact.name, artifact.newVersion);
            if (canonicalProof([...workspace].sort()) !== canonicalProof([...expectedVersions].sort()))
                throw new Error('selected or unselected workspace version changed');
            for (const name of retainedRoots) {
                const original = JSON.parse(previousState.selectedSources[name]);
                const current = JSON.parse(selectedSources[name]);
                original.version = options.artifacts.find(a => a.name === name).newVersion;
                if (canonicalProof(original) !== canonicalProof(current))
                    throw new Error('selected source declaration changed since preview');
            }
        }
        if (previousState)
            for (const [path, hash] of Object.entries(previousState.tracked)) {
                if (retainedAdapters.some(n => path.startsWith('packages/' + n + '/')) && tracked[path] !== hash)
                    throw new Error('unselected source changed since preview');
                if (retainedRoots.some(n => path.startsWith('packages/' + n + '/')) && !['package.json', 'README.md', '.dz-manifest.json', 'sbom.json'].some(leaf => path === 'packages/' + path.split('/').slice(1, 3).join('/') + '/' + leaf) && tracked[path] !== hash)
                    throw new Error('selected source changed since preview');
            }
        stage = 'artifacts';
        const bytesSri = (bytes) => 'sha512-' + createHash('sha512').update(bytes).digest('base64');
        const unpack = (tarball, dir) => {
            mkdirSync(dir, { recursive: true });
            const names = checked(['tar', '-tzf', tarball]).trim().split('\n').filter(Boolean);
            const verbose = checked(['tar', '-tvzf', tarball]).trim().split('\n').filter(Boolean);
            if (names.length !== verbose.length || names.length > 10000)
                throw new Error('tar inventory unavailable');
            const seen = new Set();
            for (let i = 0; i < names.length; i++) {
                const path = names[i].replace(/\/$/, '');
                if (!(path === 'package' || path.startsWith('package/')) || !isSafeManifestPath(path) || seen.has(path.toLowerCase()) || !/^[-d]/.test(verbose[i]))
                    throw new Error('unsafe tar entry');
                seen.add(path.toLowerCase());
            }
            checked(['tar', '-xzf', tarball, '--no-same-owner', '--no-same-permissions', '-C', dir]);
            return join(dir, 'package');
        };
        const tree = (dir) => { const records = {}; const scan = (base) => { for (const entry of readdirSync(base)) {
            const path = join(base, entry), info = lstatSync(path), rel = relative(dir, path).split('\\').join('/');
            if (!isSafeManifestPath(rel))
                throw new Error('bad physical path');
            if (info.isDirectory())
                scan(path);
            else if (info.isFile())
                records[rel] = readFileSync(path).toString('base64');
            else
                throw new Error('unsupported packed entry');
        } }; scan(dir); return records; };
        const treeDigest = (data) => digest(Buffer.from(canonicalProof(Object.keys(data).sort().map(path => [path, digest(Buffer.from(data[path], 'base64'))]))));
        const verifySelected = (dir, name, expectedVersion) => {
            const signedBytes = readFileSync(join(dir, '.dz-manifest.json'), 'utf8');
            const signed = JSON.parse(signedBytes);
            if (![JSON.stringify(signed), JSON.stringify(signed, null, 2)].some(text => signedBytes === text || signedBytes === text + '\n') || typeof signed.signature !== 'string' || Buffer.from(signed.signature, 'base64').toString('base64') !== signed.signature || !verifyManifest(dir, signed, options.trustedPublicKeyPem).ok)
                throw new Error('selected original signature or inventory invalid');
            const physical = Object.keys(tree(dir)).filter(path => !['.dz-manifest.json', 'sbom.json'].includes(path)).sort();
            const signedPaths = signed.manifest.files.map((entry) => entry.path).sort();
            if (canonicalProof(physical) !== canonicalProof(signedPaths) || signedPaths.some((path) => !isSafeManifestPath(path) || ['.dz-manifest.json', 'sbom.json'].includes(path)))
                throw new Error('selected physical signed coverage incomplete');
            const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
            if (pkg.name !== name || pkg.version !== expectedVersion)
                throw new Error('selected original identity differs');
        };
        const metadata = (name, version) => { const m = JSON.parse(checked(['npm', 'view', version ? name + '@' + version : name, '--json', '--offline=false', '--fetch-retries=0', '--fetch-timeout=30000', '--cache=' + cache])); if (m.name !== name || typeof m.version !== 'string' || version !== undefined && m.version !== version || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(m.dist?.integrity ?? '') || !/^[a-f0-9]{40}$/.test(m.dist?.shasum ?? '') || !/^https?:\/\//.test(m.dist?.tarball ?? ''))
            throw new Error('registry metadata missing'); return m; };
        const registryArtifact = (name, version, index) => { const m = metadata(name, version); const dir = join(scratch, index); mkdirSync(dir); const list = JSON.parse(checked(['npm', 'pack', name + '@' + version, '--json', '--pack-destination', dir, '--ignore-scripts=true', '--offline=false', '--fetch-retries=0', '--fetch-timeout=30000', '--cache=' + cache], dir)); if (!Array.isArray(list) || list.length !== 1 || typeof list[0].filename !== 'string' || !isSafeManifestPath(list[0].filename) || list[0].filename.includes('/'))
            throw new Error('registry pack identity missing'); const tarball = join(dir, list[0].filename); const bytes = readFileSync(tarball); if (bytesSri(bytes) !== m.dist.integrity || createHash('sha1').update(bytes).digest('hex') !== m.dist.shasum)
            throw new Error('registry SRI mismatch'); return { metadata: m, tarball, dir: unpack(tarball, join(dir, 'unpacked')), sha256: digest(bytes), integrity: bytesSri(bytes) }; };
        const sourcePack = (name, index) => { const dir = sourceDir(name); const before = readFileSync(join(dir, 'package.json')); const dest = join(scratch, index); mkdirSync(dest); const artifact = packArtifact({ pkgDir: dir, destDir: dest, pinVersions: workspace, exec: (command, opts) => { const pack = /^npm pack \. --pack-destination ("(?:[^"\\]|\\.)*")$/.exec(command), tar = /^tar -tzf ("(?:[^"\\]|\\.)*")$/.exec(command); if (pack)
                return checked(['npm', 'pack', '.', '--pack-destination', JSON.parse(pack[1])], opts.cwd, packEnv); if (tar)
                return checked(['tar', '-tzf', JSON.parse(tar[1])], opts.cwd, packEnv); throw new Error('pack template unsupported'); } }); if (!readFileSync(join(dir, 'package.json')).equals(before))
            throw new Error('source restoration failed'); return { tarball: artifact.tgzPath, dir: unpack(artifact.tgzPath, join(dest, 'unpacked')), sha256: artifact.sha256, integrity: bytesSri(readFileSync(artifact.tgzPath)) }; };
        const baselineVersions = previousState?.baselineVersions ?? Object.fromEntries(retainedRoots.map(name => [name, metadata(name).version]));
        const baselineRoots = [];
        const candidateRoots = [];
        const selectedTrees = {};
        const selectedVersions = {};
        for (const [index, name] of retainedRoots.entries()) {
            const baseline = registryArtifact(name, baselineVersions[name], 'baseline-' + index);
            verifySelected(baseline.dir, name, baseline.metadata.version);
            if (previousOwned) {
                const original = previousOwned.proof.baseline.roots.find(r => r.package === name);
                if (baseline.sha256 !== original.sha256 || baseline.integrity !== original.integrity)
                    throw new Error('baseline SRI changed since preview');
            }
            baselineRoots.push({ package: name, version: baseline.metadata.version, dir: sourceDir(name), tarball: baseline.tarball, sha256: baseline.sha256, integrity: baseline.integrity });
            let candidate;
            if (options.phase === 'final') {
                const final = options.artifacts.find(a => a.name === name);
                if (!final || digest(readFileSync(final.tgzPath)) !== final.sha256)
                    throw new Error('final artifact missing or changed');
                candidate = { tarball: final.tgzPath, dir: unpack(final.tgzPath, join(scratch, 'final-' + index)), sha256: final.sha256, integrity: bytesSri(readFileSync(final.tgzPath)) };
            }
            else
                candidate = sourcePack(name, 'candidate-' + index);
            const expectedVersion = options.phase === 'final' ? options.artifacts.find(a => a.name === name).newVersion : workspace.get(name);
            verifySelected(candidate.dir, name, expectedVersion);
            const parsed = JSON.parse(readFileSync(join(candidate.dir, 'package.json'), 'utf8'));
            const current = tree(candidate.dir);
            selectedTrees[name] = current;
            selectedVersions[name] = parsed.version;
            candidateRoots.push({ package: name, version: parsed.version, dir: sourceDir(name), tarball: candidate.tarball, sha256: candidate.sha256, integrity: candidate.integrity });
            if (previousState) {
                const old = previousState.selectedTrees[name];
                if (JSON.stringify(Object.keys(old).sort()) !== JSON.stringify(Object.keys(current).sort()))
                    throw new Error('final selected file set changed');
                const beforePkg = JSON.parse(Buffer.from(old['package.json'], 'base64').toString());
                const expectedPkg = JSON.parse(JSON.stringify(beforePkg));
                expectedPkg.version = parsed.version;
                for (const table of ['dependencies', 'peerDependencies', 'optionalDependencies'])
                    for (const dep of retainedRoots)
                        if (expectedPkg[table]?.[dep] !== undefined) {
                            const original = JSON.parse(readFileSync(join(sourceDir(name), 'package.json'), 'utf8'))[table]?.[dep];
                            if (!/^workspace:[*^~]$/.test(original ?? '')) {
                                if (parsed[table]?.[dep] !== expectedPkg[table][dep])
                                    throw new Error('selected exact/range dependency edited');
                            }
                            else
                                expectedPkg[table][dep] = JSON.parse(rewriteWorkspaceSpecs(readFileSync(join(sourceDir(name), 'package.json'), 'utf8'), workspace))[table][dep];
                        }
                if (hashPackBytes('package.json', Buffer.from(JSON.stringify(expectedPkg))) !== hashPackBytes('package.json', Buffer.from(current['package.json'], 'base64')))
                    throw new Error('final selected dependency/metadata changed');
                const oldSigned = JSON.parse(Buffer.from(old['.dz-manifest.json'], 'base64').toString()), newSigned = JSON.parse(Buffer.from(current['.dz-manifest.json'], 'base64').toString());
                const projectSigned = (signed) => ({ ...signed, signature: '<verified-original>', manifest: { ...signed.manifest, files: [...signed.manifest.files].sort((a, b) => a.path.localeCompare(b.path)).map((entry) => ({ ...entry, sha256: ['package.json', 'README.md'].includes(entry.path) ? '<authorized-version-digest>' : entry.sha256 })) } });
                if (canonicalProof(projectSigned(oldSigned)) !== canonicalProof(projectSigned(newSigned)))
                    throw new Error('final selected signed metadata changed');
                const projectSbom = (data, signed) => { const sbom = JSON.parse(Buffer.from(data, 'base64').toString()); for (const component of sbom.components)
                    if (['package.json', 'README.md'].includes(component.name)) {
                        const hash = signed.manifest.files.find((entry) => entry.path === component.name)?.sha256;
                        for (const item of component.hashes ?? [])
                            if (item.alg === 'SHA-256' && item.content === hash)
                                item.content = '<authorized-version-digest>';
                        for (const item of component.properties ?? [])
                            if (['dz:canonical-json-sha256-v1', 'dz:canonical-json-sha256-v2'].includes(item.name) && item.value === hash)
                                item.value = '<authorized-version-digest>';
                    } return sbom; };
                if (canonicalProof(projectSbom(old['sbom.json'], oldSigned)) !== canonicalProof(projectSbom(current['sbom.json'], newSigned)))
                    throw new Error('final selected SBOM metadata changed');
                for (const [path, bytes] of Object.entries(current)) {
                    if (['package.json', '.dz-manifest.json', 'sbom.json'].includes(path))
                        continue;
                    const previousBytes = Buffer.from(old[path], 'base64');
                    const expected = path === 'README.md' ? Buffer.from(planReadmeVersionSync(previousBytes.toString('utf8'), previousState.selectedVersions[name], parsed.version).text) : previousBytes;
                    if (!Buffer.from(bytes, 'base64').equals(expected))
                        throw new Error('final selected payload changed');
                }
            }
        }
        const adapterFacts = {};
        const adapterDirs = {};
        for (const [index, name] of retainedAdapters.entries()) {
            const version = workspace.get(name);
            if (!version)
                throw new Error('adapter workspace identity missing');
            const registry = registryArtifact(name, version, 'adapter-registry-' + index);
            const local = sourcePack(name, 'adapter-local-' + index);
            const localPkg = JSON.parse(readFileSync(join(local.dir, 'package.json'), 'utf8')), regPkg = JSON.parse(readFileSync(join(registry.dir, 'package.json'), 'utf8'));
            adapterFacts[name] = { sourceSha256: digest(readFileSync(join(sourceDir(name), 'package.json'))), localTreeSha256: treeDigest(tree(local.dir)), registryTreeSha256: treeDigest(tree(registry.dir)), registryIntegrity: registry.integrity, version, localFloor: localPkg.dependencies?.['@dzhechkov/core'], registeredFloor: regPkg.dependencies?.['@dzhechkov/core'], creation: creations[name], history: histories[name] };
            adapterDirs[name] = { local: local.dir, registry: registry.dir };
        }
        if (previousOwned && canonicalProof(adapterFacts) !== canonicalProof(previousOwned.proof.adapters))
            throw new Error('adapter registry/source binding changed since preview');
        stage = 'cohorts';
        const baseline = captureCohortAudit(baselineRoots, { monorepoRoot: root, run: options.run, ...(options.scratchRoot ? { scratchRoot: options.scratchRoot } : {}) });
        const candidate = captureCohortAudit(candidateRoots, { monorepoRoot: root, run: options.run, ...(options.scratchRoot ? { scratchRoot: options.scratchRoot } : {}) });
        if (baseline.result.status !== 'clean' || candidate.result.status !== 'clean')
            throw new Error('complete clean cohort capture failed: baseline=' + (baseline.result.reason ?? baseline.result.status) + '; candidate=' + (candidate.result.reason ?? candidate.result.status));
        // Each registry-origin graph node is independently bound to fresh metadata, not just lock counts.
        for (const capture of [baseline, candidate])
            for (const node of capture.result.graph ?? [])
                if (!node.selectedRoot) {
                    const meta = metadata(node.name, node.version);
                    if (meta.dist.integrity !== node.integrity || meta.dist.tarball !== node.resolved || ['dependencies', 'peerDependencies', 'optionalDependencies'].some(table => canonicalProof(meta[table] ?? {}) !== canonicalProof(node.declarations[table] ?? {})) || canonicalProof(meta.peerDependenciesMeta ?? {}) !== canonicalProof(node.peerDependenciesMeta) || ['os', 'cpu'].some(field => canonicalProof(meta[field] ?? null) !== canonicalProof(node[field])))
                        throw new Error('unselected registry binding changed');
                }
        const payload = { version: 1, phase: options.phase, batch: retainedRoots, head: frozen.head, refs: frozen.refs, workspaceVersions: [...workspace].sort(), adapters: adapterFacts, baseline: { roots: baselineRoots, evidence: baseline.evidence }, candidate: { roots: candidateRoots, evidence: candidate.evidence } };
        const proof = { ...payload, digest: digest(Buffer.from(canonicalProof(payload))) };
        const decisions = detectSiblingDrift({ dependencies: Object.fromEntries(retainedAdapters.map(name => [name, 'workspace:*'])), workspaceVersions: workspace, workspaceDirs: new Map(retainedAdapters.map(name => [name, sourceDir(name)])), batch: new Set(retainedRoots), fetchPublished: name => ({ dir: adapterDirs[name].registry }), localInventorySource: 'pack-artifact', localInventory: dir => ({ packedDir: adapterDirs[JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name].local }), trustedPublicKeyPem: options.trustedPublicKeyPem, retainedBindingProof: proof });
        if (decisions.length !== 10 || decisions.some(d => d.classification !== 'retained-registered-binding'))
            throw new Error('adapter original/source/materialization validation failed');
        stage = 'freshness';
        if (canonicalProof(snapshotRefs()) !== canonicalProof(frozen) || canonicalProof(trackedSnapshot()) !== canonicalProof(tracked))
            throw new Error('source/refs changed during capture');
        for (const rootArtifact of [...baselineRoots, ...candidateRoots])
            if (digest(readFileSync(rootArtifact.tarball)) !== rootArtifact.sha256)
                throw new Error('root artifact changed');
        for (const name of retainedAdapters)
            if (metadata(name, adapterFacts[name].version).dist.integrity !== adapterFacts[name].registryIntegrity)
                throw new Error('adapter SRI changed');
        for (const rootArtifact of baselineRoots)
            if (metadata(rootArtifact.package, rootArtifact.version).dist.integrity !== rootArtifact.integrity)
                throw new Error('baseline SRI changed');
        state = freezeEvidence({ baselineVersions, tracked, selectedTrees, selectedVersions, selectedSources });
        completed = freezeEvidence(proof);
    }
    catch (error) {
        const detail = error instanceof Error && /^(exact |scratch |capture |unborn|invalid ref|current protocol|ambiguous current|history |bad history|path deletion|unsupported manifest|reachable declaration|unselected |selected |final selected|final artifact|tar inventory|unsafe tar|bad physical|unsupported packed|registry |source restoration|pack template|adapter |complete clean|root artifact|baseline SRI|source\/refs)/.test(error.message) ? error.message : 'execution or schema unavailable';
        reason = 'retained binding ' + stage + ' capture unavailable: ' + detail;
    }
    finally {
        if (scratch) {
            try {
                rmSync(scratch, { recursive: true, force: true });
                if (existsSync(scratch)) {
                    completed = undefined;
                    reason = 'retained binding owned-scratch cleanup failed';
                }
            }
            catch {
                completed = undefined;
                reason = 'retained binding owned-scratch cleanup failed';
            }
        }
    }
    if (!completed)
        return { ok: false, reason, authorize };
    const capture = Object.freeze({ ok: true, proof: completed, state: state, authorize });
    completedCaptures.set(capture, { invocation: invocationOwner, phase: phaseOwner, root: realpathSync(options.monorepoRoot), trustedKey: options.trustedPublicKeyPem, proof: completed, state: state });
    return capture;
}
//# sourceMappingURL=release-package-audit-runner.js.map