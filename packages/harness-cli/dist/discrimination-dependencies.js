import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const inside = (root, path) => path === root || path.startsWith(root + sep);
const absent = (error) => error.code === 'ENOENT';
/** Local installed dependencies only. All mutations belong to the detached checker worktree. */
export function materializeDiscriminationDependencies(sourceRoot, baselineRoot) {
    const source = realpathSync(sourceRoot), baseline = realpathSync(baselineRoot);
    if (source === baseline || inside(source, baseline) || inside(baseline, source))
        throw Error('dependency roots must be separate');
    const preparation = { externalReused: [], workspaceMapped: [], diagnostics: [] };
    const note = (path, detail, relevant = null) => { preparation.diagnostics.push({ path, detail, relevant }); };
    function cleanPath(root, path) {
        if (!inside(root, resolve(path)))
            throw Error(`path escapes owned root: ${path}`);
        let cursor = root;
        for (const part of relative(root, path).split(sep).filter(Boolean)) {
            cursor = join(cursor, part);
            try {
                if (lstatSync(cursor).isSymbolicLink())
                    throw Error(`symlink ancestor/input: ${cursor}`);
            }
            catch (error) {
                if (!absent(error))
                    throw error;
            }
        }
    }
    function trackedPackages(root) {
        const listed = String(execFileSync('git', ['ls-files', '-z', '--', 'package.json', '**/package.json'], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
        if (Buffer.byteLength(listed) > 4 * 1024 * 1024)
            throw Error('manifest inventory exceeds bound');
        const packages = [];
        for (const file of listed.split('\0').filter(Boolean)) {
            // Fixture/vendor data is not workspace source. Ordinary roots and nested packages are retained.
            if (file.split('/').some(part => ['node_modules', 'test', 'tests', 'fixtures', 'features', '.agents', '.claude'].includes(part)))
                continue;
            try {
                cleanPath(root, join(root, file));
                const manifestPath = join(root, file);
                if (statSync(manifestPath).size > 256 * 1024)
                    throw Error('manifest exceeds bounded input size');
                const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
                if (typeof manifest.name !== 'string' || !manifest.name)
                    continue;
                packages.push({ path: dirname(file), name: manifest.name, manifest });
            }
            catch (error) {
                note(join(root, file), `manifest unavailable: ${String(error)}`);
            }
        }
        return packages;
    }
    const basePackages = trackedPackages(baseline), tipPackages = trackedPackages(source);
    const baseByName = new Map(), tipByName = new Map();
    const duplicateNames = new Set();
    for (const [items, map] of [[basePackages, baseByName], [tipPackages, tipByName]]) {
        for (const pkg of items) {
            if (map.has(pkg.name)) {
                duplicateNames.add(pkg.name);
                note(join(source, pkg.path), `duplicate workspace identity ${pkg.name}`);
            }
            else
                map.set(pkg.name, pkg);
        }
    }
    const tipRoots = tipPackages.filter(pkg => pkg.path !== '.').map(pkg => resolve(source, pkg.path));
    const workspaceTarget = (path) => tipRoots.find(root => inside(root, path) && !relative(root, path).split(sep).includes('node_modules'));
    function ownedDirectory(path) {
        cleanPath(baseline, path);
        mkdirSync(path, { recursive: true });
        if (!statSync(path).isDirectory())
            throw Error(`destination is not an owned directory: ${path}`);
    }
    function entryLink(path, destination, workspace) {
        cleanPath(baseline, dirname(path));
        // Never replace existing tracked files, directories or dangling links.
        try {
            lstatSync(path);
            throw Error(`destination already exists: ${path}`);
        }
        catch (error) {
            if (!absent(error))
                throw error;
        }
        ownedDirectory(dirname(path));
        symlinkSync(destination, path, 'dir');
        (workspace ? preparation.workspaceMapped : preparation.externalReused).push({ path, target: destination });
    }
    const contaminationCache = new Map();
    function knownWorkspaceEdges(directory) {
        if (contaminationCache.has(directory))
            return contaminationCache.get(directory);
        let contaminated = false;
        if (existsSync(directory)) {
            const previousDiagnostics = preparation.diagnostics.length;
            const entries = dependencyEntries(directory);
            if (preparation.diagnostics.length !== previousDiagnostics)
                contaminated = true;
            for (const entry of entries) {
                try {
                    const target = realpathSync(entry.path);
                    if (workspaceTarget(target)) {
                        contaminated = true;
                        note(entry.path, `external installation exposes live workspace edge: ${target}`);
                    }
                }
                catch (error) {
                    note(entry.path, `external dependency input unavailable: ${String(error)}`);
                    contaminated = true;
                }
            }
        }
        contaminationCache.set(directory, contaminated);
        return contaminated;
    }
    function dependencyEntries(directory) {
        const entries = [];
        let names;
        try {
            names = readdirSync(directory);
        }
        catch (error) {
            if (!absent(error))
                note(directory, `dependency inventory unavailable: ${String(error)}`);
            return entries;
        }
        if (names.length > 10_000) {
            note(directory, 'direct dependency inventory exceeds bound');
            return entries;
        }
        for (const name of names) {
            if (name.startsWith('.'))
                continue;
            const path = join(directory, name);
            if (name.startsWith('@')) {
                try {
                    if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory())
                        throw Error('unsupported scoped directory');
                    for (const child of readdirSync(path))
                        entries.push({ name: `${name}/${child}`, path: join(path, child) });
                }
                catch (error) {
                    note(path, `scoped dependency inventory unavailable: ${String(error)}`);
                }
            }
            else
                entries.push({ name, path });
        }
        return entries;
    }
    function mapEntries(from, to) {
        ownedDirectory(to);
        for (const entry of dependencyEntries(from)) {
            const destination = join(to, entry.name);
            try {
                const actual = realpathSync(entry.path);
                const tipPkg = tipByName.get(entry.name), basePkg = baseByName.get(entry.name);
                if (tipPkg || workspaceTarget(actual)) {
                    if (!tipPkg || !basePkg || duplicateNames.has(entry.name) || actual !== resolve(source, tipPkg.path) || basePkg.path !== tipPkg.path) {
                        throw Error(`workspace identity cannot be mapped safely: ${entry.name}`);
                    }
                    cleanPath(baseline, resolve(baseline, basePkg.path));
                    entryLink(destination, resolve(baseline, basePkg.path), true);
                }
                else {
                    if (inside(source, actual) && !relative(source, actual).split(sep).includes('node_modules'))
                        throw Error(`unmapped live source target: ${actual}`);
                    const ownModules = join(actual, 'node_modules');
                    const adjacentModules = dirname(actual).endsWith(`${sep}node_modules`) ? dirname(actual) : null;
                    if (knownWorkspaceEdges(ownModules) || (adjacentModules !== null && knownWorkspaceEdges(adjacentModules)))
                        throw Error('external dependency has known live workspace edges');
                    entryLink(destination, actual, false);
                }
            }
            catch (error) {
                note(destination, `dependency ${entry.name} unavailable: ${String(error)}`);
            }
        }
    }
    function tools(from, to) {
        if (!existsSync(from))
            return;
        ownedDirectory(to);
        for (const name of readdirSync(from)) {
            const original = join(from, name), destination = join(to, name);
            try {
                const actual = realpathSync(original);
                if (!statSync(actual).isFile())
                    throw Error('unsupported executable entry');
                if (workspaceTarget(actual))
                    throw Error('executable points into live workspace code');
                if (lstatSync(original).isSymbolicLink()) {
                    // Preserve external executable realpath semantics (e.g. a JS entry imports ./dist).
                    cleanPath(baseline, dirname(destination));
                    try {
                        lstatSync(destination);
                        throw Error('tracked/existing executable destination');
                    }
                    catch (error) {
                        if (!absent(error))
                            throw error;
                    }
                    if (knownWorkspaceEdges(join(dirname(actual), 'node_modules')))
                        throw Error('executable exposes live workspace dependency');
                    symlinkSync(actual, destination, 'file');
                    preparation.externalReused.push({ path: destination, target: actual });
                    continue;
                }
                const bytes = readFileSync(actual);
                if (bytes.length > 1024 * 1024 || bytes.includes(0))
                    throw Error('unsupported executable wrapper');
                cleanPath(baseline, destination);
                try {
                    lstatSync(destination);
                    throw Error('tracked/existing executable destination');
                }
                catch (error) {
                    if (!absent(error))
                        throw error;
                }
                // Installed tool wrappers are reused; rebase only checkout paths, never source/exports.
                const text = bytes.toString('utf8').split(source).join(baseline);
                writeFileSync(destination, text, { flag: 'wx' });
                chmodSync(destination, statSync(actual).mode & 0o777);
                preparation.externalReused.push({ path: destination, target: actual });
            }
            catch (error) {
                note(destination, `executable preparation unavailable: ${String(error)}`);
            }
        }
    }
    function store(from, to) {
        if (!existsSync(from))
            return;
        ownedDirectory(to);
        const entries = readdirSync(from);
        if (entries.length > 10_000) {
            note(from, 'direct pnpm store inventory exceeds bound');
            return;
        }
        for (const name of entries) {
            try {
                if (name === 'node_modules') {
                    mapEntries(join(from, name), join(to, name));
                    continue;
                }
                const original = join(from, name), actual = realpathSync(original);
                if (lstatSync(original).isSymbolicLink() || workspaceTarget(actual))
                    throw Error('unsupported pnpm store source');
                if (statSync(original).isDirectory()) {
                    if (knownWorkspaceEdges(join(original, 'node_modules')))
                        throw Error('pnpm entry exposes live workspace code');
                    entryLink(join(to, name), actual, false);
                }
                // Non-directory store metadata is not needed for an already-installed executable.
            }
            catch (error) {
                note(join(to, name), `pnpm store entry unavailable: ${String(error)}`);
            }
        }
    }
    const ownedModuleRoots = new Set();
    for (const pkg of basePackages) {
        const from = resolve(source, pkg.path, 'node_modules'), to = resolve(baseline, pkg.path, 'node_modules');
        try {
            cleanPath(source, resolve(source, pkg.path));
            cleanPath(baseline, resolve(baseline, pkg.path));
            // A fresh detached checkout contains only tracked inputs. Existing dependency
            // directories/entries are not checker-owned and must not survive a refused mapping
            // as an alternative route into live workspace code.
            try {
                lstatSync(to);
                throw Error('tracked baseline dependency directory is not checker-owned');
            }
            catch (error) {
                if (!absent(error))
                    throw error;
            }
            ownedModuleRoots.add(to);
            for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
                const declarations = pkg.manifest[section];
                if (declarations && typeof declarations === 'object') {
                    for (const name of Object.keys(declarations)) {
                        if (!/^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/.test(name)) {
                            note(from, 'unsupported dependency specifier in baseline manifest');
                            continue;
                        }
                        try {
                            lstatSync(join(from, name));
                        }
                        catch (error) {
                            note(join(to, name), `declared baseline dependency ${name} has no readable package-local entry: ${String(error)}`);
                        }
                    }
                }
            }
            mapEntries(from, to);
            store(join(from, '.pnpm'), join(to, '.pnpm'));
            tools(join(from, '.bin'), join(to, '.bin'));
        }
        catch (error) {
            note(to, `dependency directory preparation unavailable: ${String(error)}`);
        }
    }
    function preflight(file) {
        const target = resolve(baseline, file);
        const owner = basePackages.filter(pkg => inside(resolve(baseline, pkg.path), target))
            .sort((a, b) => b.path.length - a.path.length)[0];
        const pending = owner ? [owner] : [];
        const visited = new Set();
        const directories = new Set([join(baseline, 'node_modules')]);
        while (pending.length) {
            const pkg = pending.pop();
            if (visited.has(pkg.path))
                continue;
            visited.add(pkg.path);
            // Include ancestor lookup directories as well as declared transitive workspace roots.
            let directory = resolve(baseline, pkg.path);
            while (inside(baseline, directory)) {
                directories.add(join(directory, 'node_modules'));
                if (directory === baseline)
                    break;
                directory = dirname(directory);
            }
            for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
                const declarations = pkg.manifest[section];
                if (declarations && typeof declarations === 'object') {
                    for (const name of Object.keys(declarations)) {
                        const dependency = baseByName.get(name);
                        if (dependency)
                            pending.push(dependency);
                    }
                }
            }
        }
        for (const path of directories) {
            try {
                cleanPath(baseline, path);
                try {
                    lstatSync(path);
                    if (!ownedModuleRoots.has(path))
                        throw Error(`tracked baseline dependency directory is not checker-owned: ${path}`);
                }
                catch (error) {
                    if (!absent(error))
                        throw error;
                }
            }
            catch (error) {
                const detail = `Relevant baseline dependency lookup is unsafe: ${String(error)}. Remove the tracked dependency-directory symlink or prepare genuine baseline dependencies separately; do not borrow live workspace code. Then rerun discrimination-check.`;
                note(path, detail, true);
                return { kind: 'unavailable', specifier: null, path, detail };
            }
        }
        return null;
    }
    function diagnose(output, runner, runningTest) {
        let text = output.replace(/\x1b\[[0-9;]*m/g, '');
        // Reporter diagnostics, not logged text or summary arrows, attribute resolution failure.
        // These textual shapes are supported-runner heuristics, not output authenticity proof.
        if (runner === 'vitest') {
            const records = [];
            const lines = text.split('\n');
            let failedSection = false;
            for (let i = 0; i < lines.length; i++) {
                if (/Failed (?:Tests|Suites)\s+\d+/.test(lines[i]))
                    failedSection = true;
                if (!failedSection || !/^\s*FAIL\s+\S/.test(lines[i]) || !/\s(?:>|\[)/.test(lines[i]))
                    continue;
                let start = i + 1;
                while (start < lines.length && lines[start].trim() === '')
                    start++;
                if (!/^\s*(?!AssertionError\b)[\w.]*Error(?:\s+\[[^\]]+\])?:/.test(lines[start] ?? ''))
                    continue;
                let end = start + 1;
                // Preserve a Node require stack / Vite importer; exclude code frames and later records.
                while (end < lines.length && lines[end].trim() !== '' && !/^\s*(?:❯|at\s|FAIL\s|⎯)/.test(lines[end]))
                    end++;
                records.push(lines.slice(start, end).join('\n'));
            }
            text = records.join('\n');
        }
        else if (runner === 'node-test') {
            const records = [];
            const lines = text.split('\n');
            let fileFailed = false;
            for (let i = 0; i < lines.length; i++) {
                const point = /^(\s*)not ok \d+ - /.exec(lines[i]);
                if (!point)
                    continue;
                const indent = point[1] + '  ';
                if (lines[i + 1] !== indent + '---')
                    continue;
                let end = i + 2;
                while (end < lines.length && lines[end] !== indent + '...')
                    end++;
                const block = lines.slice(i + 2, end);
                if (block.some(line => line.startsWith(indent + 'exitCode:')))
                    fileFailed = true;
                // Top-level diagnostic codes distinguish resolution exceptions from quoted ERR_ASSERTION.
                if (!block.some(line => new RegExp(`^${indent}code: ['"]?(?:MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND)['"]?\\s*$`).test(line)))
                    continue;
                const start = block.findIndex(line => line.startsWith(indent + 'error:'));
                if (start < 0)
                    continue;
                let stop = start + 1;
                while (stop < block.length && block[stop].startsWith(indent + ' '))
                    stop++;
                records.push(block.slice(start, stop).join('\n'));
            }
            if (!runningTest && fileFailed) {
                // Node prints uncaught file-load diagnostics outside the ERR_TEST_FAILURE YAML.
                // Require the native resolution code, not merely a phrase in a TAP comment/log.
                for (let i = 0; i < lines.length; i++) {
                    if (!/^# Error(?: \[(?:MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND)\])?: Cannot find (?:module|package) /.test(lines[i]))
                        continue;
                    let end = i + 1;
                    while (end < lines.length && lines[end].startsWith('# ') && !lines[end].startsWith('# Subtest:'))
                        end++;
                    if (!lines.slice(i, end).some(line => /^#\s+code: ['"](?:MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND)['"]/.test(line)))
                        continue;
                    records.push(lines[i].slice(2));
                }
            }
            text = records.join('\n');
        }
        else if (runningTest)
            return null;
        const resolution = /cannot find (?:module|package)|failed to load url|failed to resolve (?:import|entry)|ERR_MODULE_NOT_FOUND|module not found/i;
        if (!resolution.test(text))
            return null;
        const unavailable = (specifier, path, detail) => ({
            kind: 'unavailable', specifier, path,
            detail: `${detail} Restore the required installed dependency or prepare genuine baseline build artifacts separately; do not borrow tip dist. Then rerun discrimination-check.`,
        });
        // Only messages with an explicit resolution path/importer establish local attribution.
        const matches = [];
        const load = /Failed to load url\s+([^\s]+)\s+\(resolved id:\s*[^)]+\)\s+in\s+([^\n]+?)(?:\. Does the file exist\?|\n|$)/g;
        for (const match of text.matchAll(load))
            matches.push({ specifier: match[1], importer: match[2].trim() });
        const node = /Cannot find (?:module|package)\s+['"]([^'"]+)['"](?:\s+imported from\s+([^\n]+))?/g;
        for (const match of text.matchAll(node))
            matches.push({ specifier: match[1], importer: match[2]?.trim().replace(/^['"]|['"]$/g, '') ?? null });
        const unique = [...new Map(matches.map(match => [`${match.specifier}|${match.importer}`, match])).values()];
        if (unique.length !== 1)
            return unavailable(null, null, 'Baseline missing resolution is ambiguous or lacks a positively attributable local path.');
        const match = unique[0];
        // A resolver exception inside a running test is setup failure, not an assertion proof.
        // Keep feature-module inference limited to the existing actual file-load path.
        if (runningTest)
            return unavailable(match.specifier, null, 'The runner reported a dependency resolution exception inside the executed test, rather than a behavioral assertion.');
        let candidate = null;
        try {
            if (match.specifier.startsWith('file:'))
                candidate = fileURLToPath(match.specifier);
            else if (isAbsolute(match.specifier))
                candidate = resolve(match.specifier);
            else if (/^\.{1,2}\//.test(match.specifier) && match.importer !== null) {
                const importer = match.importer.startsWith('file:') ? fileURLToPath(match.importer) : match.importer;
                if (isAbsolute(importer) && inside(baseline, importer))
                    candidate = resolve(dirname(importer), match.specifier);
            }
            if (candidate === null || !inside(baseline, candidate))
                return unavailable(match.specifier, candidate, 'Baseline dependency resolution is bare, outside the baseline, or unbound to a contained importer.');
            const rel = relative(baseline, candidate);
            if (rel.split(sep).some(part => ['node_modules', 'dist', 'build'].includes(part)))
                return unavailable(match.specifier, candidate, 'Baseline dependency or build entrypoint is unavailable.');
            cleanPath(baseline, candidate);
            const tipFile = resolve(source, rel);
            cleanPath(source, tipFile);
            let baseAbsent = false;
            try {
                lstatSync(candidate);
            }
            catch (error) {
                if (absent(error))
                    baseAbsent = true;
                else
                    throw error;
            }
            if (!baseAbsent || !statSync(tipFile).isFile())
                return unavailable(match.specifier, candidate, 'Local module absence at base and presence at tip were not established.');
            // An ignored generated artifact is not positively identified feature-local implementation.
            try {
                execFileSync('git', ['check-ignore', '-q', '--', rel], { cwd: source });
                return unavailable(match.specifier, candidate, 'Missing baseline module is an ignored build artifact.');
            }
            catch (error) {
                if (error.status !== 1)
                    throw error;
            }
            return { kind: 'feature-module-absent', specifier: match.specifier, path: candidate, detail: `Same-run resolution identifies ${rel}; absent at baseline and present at tip. Only an evidenced tip pass can support limited inference, never assertion proof.` };
        }
        catch (error) {
            return unavailable(match.specifier, candidate, `Baseline resolution attribution unavailable: ${String(error)}`);
        }
    }
    return { preparation, diagnose, preflight };
}
//# sourceMappingURL=discrimination-dependencies.js.map