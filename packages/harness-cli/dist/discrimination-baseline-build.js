import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readFileSync, readSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
const MAX_PACKAGES = 32;
const MAX_INVENTORY = 10_000;
const MAX_METADATA = 4 * 1024 * 1024;
// Reserves final status/detail/counter growth so a refused receipt remains bounded.
const METADATA_FINAL_RESERVE = 32 * 1024;
const MAX_CAPTURE = 1024 * 1024;
const MAX_CONFIG = 256 * 1024;
const TSC_SHIM_SHA = '2cffde0b8c6760dfb0b5b0382bbb7e00ba6a8b2d981b9205b256a700a481d983';
const booleans = new Set(['strict', 'noUncheckedIndexedAccess', 'noImplicitOverride', 'noFallthroughCasesInSwitch', 'exactOptionalPropertyTypes', 'verbatimModuleSyntax', 'isolatedModules', 'forceConsistentCasingInFileNames', 'declaration', 'declarationMap', 'sourceMap', 'skipLibCheck']);
const inside = (root, path) => path === root || path.startsWith(root + sep);
const absent = (e) => e?.code === 'ENOENT';
/** This helper is private to discrimination-check; every refusal remains a nonmeasurement. */
export function prepareDiscriminationBaselineBuild(args) {
    const started = Date.now();
    const timeoutMs = Math.min(args.timeoutMs, 180_000);
    const requested = args.selection.length > 4096 ? [] : args.selection.split(',').map(s => s.trim());
    const baseSha = /^[a-f0-9]{40}$/.test(args.baseSha) ? args.baseSha : 'invalid-base-sha';
    const receipt = {
        requested, baseSha, status: 'refused',
        budget: { timeoutMs, maxPackages: MAX_PACKAGES, maxInventory: MAX_INVENTORY, maxMetadataBytes: MAX_METADATA, maxCaptureBytesPerStream: MAX_CAPTURE },
        capture: { stdoutBytes: 0, stderrBytes: 0, complete: true }, inventoryEntries: 0, metadataBytes: 0,
        dependencyPreparation: args.dependencyPreparation, inputs: [], runs: [],
    };
    const deadline = started + timeoutMs;
    const remaining = () => { const ms = deadline - Date.now(); if (ms <= 0)
        throw Error('baseline build phase deadline exhausted'); return ms; };
    const metadataSize = () => Buffer.byteLength(JSON.stringify({ ...receipt,
        runs: receipt.runs.map(({ stdout: _stdout, stderr: _stderr, ...rest }) => rest) }));
    const serializedBytes = (value) => Buffer.byteLength(JSON.stringify(value));
    let retainedMetadata = metadataSize();
    const retainMetadata = (addedBytes) => {
        remaining();
        if (retainedMetadata + addedBytes > MAX_METADATA - METADATA_FINAL_RESERVE)
            throw Error('baseline build metadata budget exhausted');
        retainedMetadata += addedBytes;
    };
    const inventory = () => { receipt.inventoryEntries++; if (receipt.inventoryEntries > MAX_INVENTORY)
        throw Error('baseline build inventory exceeds 10000 entries'); remaining(); };
    const hash = (path) => {
        const fd = openSync(path, 'r');
        const h = createHash('sha256');
        const chunk = Buffer.allocUnsafe(64 * 1024);
        try {
            for (;;) {
                remaining();
                const n = readSync(fd, chunk, 0, chunk.length, null);
                if (n === 0)
                    break;
                h.update(chunk.subarray(0, n));
            }
        }
        finally {
            closeSync(fd);
        }
        return { path: realpathSync(path), sha256: h.digest('hex') };
    };
    const ordinary = (path) => { const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink())
        throw Error(`tracked ordinary file required: ${path}`); };
    const clean = (root, path, mustExist = true) => {
        if (!inside(root, resolve(path)))
            throw Error(`path escapes baseline root: ${path}`);
        let cursor = root;
        for (const part of relative(root, path).split(sep).filter(Boolean)) {
            cursor = join(cursor, part);
            try {
                if (lstatSync(cursor).isSymbolicLink())
                    throw Error(`symlink ancestor/input: ${cursor}`);
            }
            catch (e) {
                if (!absent(e))
                    throw e;
                if (mustExist)
                    throw Error(`missing path: ${cursor}`);
            }
        }
    };
    const tracked = (path) => {
        const rel = relative(args.baselineRoot, path);
        try {
            execFileSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: args.baselineRoot, timeout: remaining(), stdio: 'pipe' });
        }
        catch {
            throw Error(`untracked baseline input: ${rel}`);
        }
    };
    try {
        if (baseSha === 'invalid-base-sha')
            throw Error('baseline build requires a resolved 40-character base SHA');
        if (retainedMetadata > MAX_METADATA - METADATA_FINAL_RESERVE) {
            receipt.dependencyPreparation = { omitted: 'baseline build metadata budget exhausted' };
            throw Error('baseline build metadata budget exhausted');
        }
        if (args.selection.length > 4096 || requested.some(x => x.length > 256))
            throw Error('baseline build selection exceeds 4096 bytes or 256 bytes per directory');
        if (requested.length < 1 || requested.length > MAX_PACKAGES || requested.some(x => !x))
            throw Error('baseline build needs 1..32 nonempty package directories');
        if (new Set(requested).size !== requested.length)
            throw Error('duplicate baseline build package');
        const source = realpathSync(args.sourceRoot), baseline = realpathSync(args.baselineRoot);
        if (source === baseline || inside(source, baseline) || inside(baseline, source))
            throw Error('baseline build roots must be separate');
        const runtime = { ...hash(process.execPath), version: process.version };
        const plans = [];
        // Whole-list preflight: no compiler starts until every selected package and tool passes.
        for (const packageDir of requested) {
            remaining();
            if (isAbsolute(packageDir) || packageDir === '.' || packageDir === '..' || packageDir.startsWith('../') || packageDir.includes('\\') || packageDir.split('/').some(x => !x || x === '.' || x === '..') || !/^[A-Za-z0-9@._/-]+$/.test(packageDir))
                throw Error(`unsafe baseline build selection: ${packageDir}`);
            const cwd = resolve(baseline, packageDir);
            clean(baseline, cwd);
            if (!lstatSync(cwd).isDirectory())
                throw Error(`not a package directory: ${packageDir}`);
            const manifestPath = join(cwd, 'package.json'), configPath = join(cwd, 'tsconfig.json');
            for (const path of [manifestPath, configPath]) {
                clean(baseline, path);
                tracked(path);
                ordinary(path);
                if (lstatSync(path).size > MAX_CONFIG)
                    throw Error(`manifest/config exceeds 256 KiB: ${path}`);
                inventory();
            }
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
            if (manifest.scripts?.build !== 'tsc -p tsconfig.json')
                throw Error(`${packageDir}: scripts.build must equal tsc -p tsconfig.json`);
            const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
            if (Object.keys(cfg).some(k => !['compilerOptions', 'include', 'exclude'].includes(k)))
                throw Error(`${packageDir}: unsupported tsconfig top-level key`);
            if (JSON.stringify(cfg.include) !== '["src/**/*"]')
                throw Error(`${packageDir}: include must equal ["src/**/*"]`);
            if (cfg.exclude !== undefined && (!Array.isArray(cfg.exclude) || cfg.exclude.some(x => typeof x !== 'string' || !['dist', 'node_modules', 'test'].includes(x)) || new Set(cfg.exclude).size !== cfg.exclude.length))
                throw Error(`${packageDir}: unsupported exclude`);
            if (!cfg.compilerOptions || typeof cfg.compilerOptions !== 'object' || Array.isArray(cfg.compilerOptions))
                throw Error(`${packageDir}: compilerOptions required`);
            const opts = cfg.compilerOptions;
            for (const [key, value] of Object.entries(opts)) {
                if (key === 'rootDir' && value === './src')
                    continue;
                if (key === 'outDir' && value === './dist')
                    continue;
                if (key === 'target' && value === 'ES2022')
                    continue;
                if (key === 'lib' && JSON.stringify(value) === '["ES2022"]')
                    continue;
                if ((key === 'module' || key === 'moduleResolution') && value === 'NodeNext')
                    continue;
                if (key === 'noEmitOnError' && value === true)
                    continue;
                if (booleans.has(key) && typeof value === 'boolean')
                    continue;
                throw Error(`${packageDir}: unsupported compiler option ${key}`);
            }
            if (opts.rootDir !== './src' || opts.outDir !== './dist')
                throw Error(`${packageDir}: rootDir ./src and outDir ./dist required`);
            const src = join(cwd, 'src'), dist = join(cwd, 'dist');
            clean(baseline, src);
            if (!lstatSync(src).isDirectory())
                throw Error(`${packageDir}: src directory required`);
            try {
                lstatSync(dist);
                throw Error(`${packageDir}: existing dist is unsupported`);
            }
            catch (e) {
                if (!absent(e))
                    throw e;
            }
            const inputFiles = String(execFileSync('git', ['ls-files', '-z', '--', `${packageDir}/src`], { cwd: baseline, encoding: 'utf8', timeout: remaining(), maxBuffer: MAX_METADATA })).split('\0').filter(Boolean);
            if (!inputFiles.length)
                throw Error(`${packageDir}: tracked src inputs required`);
            const input = { packageDir, files: [] };
            retainMetadata(serializedBytes(input) + (receipt.inputs.length ? 1 : 0));
            receipt.inputs.push(input);
            for (const rel of inputFiles) {
                const path = join(baseline, rel);
                clean(baseline, path);
                ordinary(path);
                inventory();
                const digest = hash(path);
                retainMetadata(serializedBytes(digest) + (input.files.length ? 1 : 0));
                input.files.push(digest);
            }
            // Even an untracked symlink inside src could redirect an import into another source tree.
            const inspect = (dir) => { for (const entry of readdirSync(dir)) {
                remaining();
                const p = join(dir, entry);
                const s = lstatSync(p);
                if (s.isSymbolicLink())
                    throw Error(`${packageDir}: symlink-reachable src input ${p}`);
                if (s.isDirectory())
                    inspect(p);
                else {
                    if (!s.isFile())
                        throw Error(`${packageDir}: unsupported src entry ${p}`);
                    tracked(p);
                }
            } };
            inspect(src);
            const tsRoot = realpathSync(join(cwd, 'node_modules/typescript'));
            if (inside(baseline, tsRoot) || !tsRoot.split(sep).includes('node_modules')
                || (inside(source, tsRoot) && !relative(source, tsRoot).split(sep).includes('node_modules'))) {
                throw Error(`${packageDir}: TypeScript must be an installed external package`);
            }
            const pkgPath = join(tsRoot, 'package.json'), launcherPath = join(tsRoot, 'lib/tsc.js'), implementationPath = join(tsRoot, 'lib/_tsc.js');
            for (const p of [pkgPath, launcherPath, implementationPath]) {
                ordinary(p);
                if (!inside(tsRoot, realpathSync(p)))
                    throw Error(`${packageDir}: compiler file escapes installed package`);
            }
            if (lstatSync(pkgPath).size > MAX_CONFIG)
                throw Error(`${packageDir}: TypeScript manifest too large`);
            const tsManifest = JSON.parse(readFileSync(pkgPath, 'utf8'));
            const typescriptPackage = { ...hash(pkgPath), ...(tsManifest.name !== undefined ? { name: tsManifest.name } : {}), ...(tsManifest.version !== undefined ? { version: tsManifest.version } : {}) };
            const entrypoint = hash(launcherPath), implementation = hash(implementationPath);
            if (tsManifest.name !== 'typescript' || tsManifest.version !== '5.9.3' || entrypoint.sha256 !== TSC_SHIM_SHA)
                throw Error(`${packageDir}: unsupported TypeScript version/shim; require installed 5.9.3 inspected shim`);
            const generatedExports = [];
            const gatherExports = (value) => {
                if (typeof value === 'string') {
                    if (value.includes('..') || value.includes('\\'))
                        throw Error(`${packageDir}: escaping package export ${value}`);
                    if (value.startsWith('./dist/')) {
                        generatedExports.push(value);
                        return;
                    }
                    if (value === './package.json')
                        return; // already tracked, parsed, bounded and hashed above
                    if (value.startsWith('./src/') && value.endsWith('.json')) {
                        const path = join(cwd, value);
                        clean(baseline, path);
                        tracked(path);
                        ordinary(path);
                        if (!inputFiles.includes(relative(baseline, path)))
                            throw Error(`${packageDir}: static JSON export is outside selected src inventory`);
                        if (lstatSync(path).size > MAX_CONFIG)
                            throw Error(`${packageDir}: static JSON export exceeds 256 KiB`);
                        try {
                            JSON.parse(readFileSync(path, 'utf8'));
                        }
                        catch {
                            throw Error(`${packageDir}: invalid static JSON export ${value}`);
                        }
                        return; // its digest and inventory entry were retained with tracked src inputs
                    }
                    throw Error(`${packageDir}: unsupported non-dist export ${value}`);
                }
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    for (const next of Object.values(value))
                        gatherExports(next);
                    return;
                }
                throw Error(`${packageDir}: unsupported package export shape`);
            };
            if (manifest.exports !== undefined)
                gatherExports(manifest.exports);
            plans.push({ packageDir, cwd, manifest: hash(manifestPath), config: hash(configPath), entrypoint, implementation, typescriptPackage, exports: generatedExports });
        }
        receipt.status = 'failed';
        for (const [order, plan] of plans.entries()) {
            const argv = [plan.entrypoint.path, '-p', join(plan.cwd, 'tsconfig.json'), '--noEmitOnError', 'true'];
            const outBudget = MAX_CAPTURE - receipt.capture.stdoutBytes, errBudget = MAX_CAPTURE - receipt.capture.stderrBytes;
            if (outBudget <= 0 || errBudget <= 0) {
                receipt.capture.complete = false;
                throw Error('aggregate preparation capture limit reached');
            }
            const runIdentity = { order, packageDir: plan.packageDir, baseSha, cwd: plan.cwd, argv,
                manifest: plan.manifest, config: plan.config, runtime, typescriptPackage: plan.typescriptPackage,
                entrypoint: plan.entrypoint, implementation: plan.implementation };
            const runComma = receipt.runs.length ? 1 : 0;
            const reservedRunBytes = serializedBytes({ ...runIdentity, exitCode: null, signal: null,
                captureComplete: false, captureError: null, outputs: [] }) + runComma + 8192;
            // Reserve the complete future run record before launch; a child that actually ran
            // is never dropped merely because metadata filled while it was executing.
            retainMetadata(reservedRunBytes);
            const child = spawnSync(process.execPath, argv, { cwd: plan.cwd, timeout: remaining(), maxBuffer: Math.max(outBudget, errBudget) + 1 });
            const rawOut = child.stdout ?? Buffer.alloc(0), rawErr = child.stderr ?? Buffer.alloc(0);
            const decode = (bytes, budget) => {
                const value = new StringDecoder('utf8').write(bytes.subarray(0, budget));
                const encoded = Buffer.from(value);
                return encoded.length <= budget ? value : new StringDecoder('utf8').write(encoded.subarray(0, budget));
            };
            const stdout = decode(rawOut, outBudget), stderr = decode(rawErr, errBudget);
            const stdoutBytes = Buffer.byteLength(stdout), stderrBytes = Buffer.byteLength(stderr);
            receipt.capture.stdoutBytes += stdoutBytes;
            receipt.capture.stderrBytes += stderrBytes;
            const captureComplete = !child.error && !child.signal && rawOut.length < outBudget && rawErr.length < errBudget
                && receipt.capture.stdoutBytes < MAX_CAPTURE && receipt.capture.stderrBytes < MAX_CAPTURE;
            if (!captureComplete)
                receipt.capture.complete = false;
            const run = { ...runIdentity, stdout, stderr, exitCode: child.status, signal: child.signal, captureComplete,
                captureError: child.error ? String(child.error).slice(0, 1024) : captureComplete ? null : 'aggregate preparation capture limit reached', outputs: [] };
            const { stdout: _stdout, stderr: _stderr, ...runMetadata } = run;
            const actualRunBytes = serializedBytes(runMetadata) + runComma;
            retainedMetadata -= reservedRunBytes - actualRunBytes;
            receipt.runs.push(run);
            if (!captureComplete || child.status !== 0 || child.signal)
                throw Error(`${plan.packageDir}: compiler ${child.error ? String(child.error) : `exit ${child.status}${child.signal ? ` signal ${child.signal}` : ''}`}`);
            const dist = join(plan.cwd, 'dist');
            clean(args.baselineRoot, dist);
            if (!lstatSync(dist).isDirectory())
                throw Error(`${plan.packageDir}: compiler did not emit dist`);
            const walk = (dir) => { for (const entry of readdirSync(dir).sort()) {
                remaining();
                const path = join(dir, entry);
                clean(args.baselineRoot, path);
                const stat = lstatSync(path);
                if (stat.isDirectory())
                    walk(path);
                else {
                    if (!stat.isFile())
                        throw Error(`${plan.packageDir}: unsupported output type`);
                    inventory();
                    const digest = hash(path);
                    retainMetadata(serializedBytes(digest) + (run.outputs.length ? 1 : 0));
                    run.outputs.push(digest);
                }
            } };
            walk(dist);
            if (!run.outputs.length)
                throw Error(`${plan.packageDir}: compiler emitted no dist files`);
            for (const item of plan.exports)
                if (!run.outputs.some(x => x.path === join(plan.cwd, item)))
                    throw Error(`${plan.packageDir}: required dist export missing ${item}`);
        }
        receipt.status = 'prepared';
        remaining();
    }
    catch (e) {
        receipt.status = receipt.runs.length ? 'failed' : 'refused';
        receipt.detail = (e instanceof Error ? e.message : String(e)).slice(0, 2048);
    }
    // One final serialization verifies the actual returned object, including the refusal
    // detail and metadataBytes itself. No per-file stringify of the growing receipt occurs.
    let measured = metadataSize();
    for (let i = 0; i < 4; i++) {
        receipt.metadataBytes = measured;
        const next = metadataSize();
        if (next === measured)
            break;
        measured = next;
    }
    if (receipt.metadataBytes > MAX_METADATA) {
        // This can only arise from an oversized initial mapping; do not drop actual run records.
        receipt.status = receipt.runs.length ? 'failed' : 'refused';
        receipt.detail = 'baseline build metadata budget exhausted';
        receipt.dependencyPreparation = { omitted: 'baseline build metadata budget exhausted' };
        let size = metadataSize();
        for (let i = 0; i < 4; i++) {
            receipt.metadataBytes = size;
            const next = metadataSize();
            if (next === size)
                break;
            size = next;
        }
    }
    return receipt;
}
//# sourceMappingURL=discrimination-baseline-build.js.map