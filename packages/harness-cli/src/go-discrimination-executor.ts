/** Private, Linux-only executor for one exact named Go package test. */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { classifyDiscrimination, classifyGoTestExecutionEvidence, type ClassifyResultRow, type ExecutionEvidence } from '@dzhechkov/harness-core';

type Writer = (line: string) => void;
type Reaper = (token: string, scratch: string) => { readonly complete: boolean; readonly survivors: readonly number[] };
const CAP = 1_048_576;
const MAX_MS = 300_000;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*(?:^|\/)\-)[A-Za-z0-9_./-]+_test\.go$/;
const SAFE_REF = /^[A-Za-z0-9_][A-Za-z0-9_./~^@{}-]{0,199}$/;
const SAFE_NAME = /^Test[A-Z0-9][A-Za-z0-9_]*$/;

interface Capture { readonly command: string; readonly cwd: string; readonly stdout: string; readonly stderr: string; readonly exitCode: number | null; readonly signal: string | null; readonly captureComplete: boolean; readonly captureError: string | null }
const envFor = (token: string): NodeJS.ProcessEnv => ({ ...process.env, PATH: `/usr/local/go/bin:${process.env.PATH ?? ''}`, GOENV: 'off', GOWORK: 'off', GOTOOLCHAIN: 'local', GOFLAGS: '', GOPROXY: 'off', GONOPROXY: 'none', GOPRIVATE: '', GOSUMDB: 'off', DZ_MUTATION_GATE_RUN: token });

async function capture(command: string, argv: readonly string[], cwd: string, timeout: number, token: string): Promise<Capture> {
  return await new Promise(resolveResult => {
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), exitCode: number | null = null, signal: string | null = null;
    let error: string | null = null, done = false;
    const child = spawn(command, [...argv], { cwd, env: envFor(token), shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const commandText = `${command} ${argv.join(' ')}`;
    const killGroup = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ } } };
    let drain: NodeJS.Timeout | undefined;
    const finish = () => {
      if (done) return;
      done = true; clearTimeout(timer); if (drain) clearTimeout(drain);
      resolveResult({ command: commandText, cwd, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), exitCode, signal, captureComplete: error === null && signal === null && exitCode !== null, captureError: error });
    };
    const fail = (why: string) => { if (error === null) error = why; killGroup(); if (!drain) drain = setTimeout(finish, 2_000); };
    const timer = setTimeout(() => fail('ETIMEDOUT'), timeout);
    const take = (chunk: Buffer, side: 'stdout' | 'stderr') => {
      if (done || error !== null) return;
      if (side === 'stdout') stdout = Buffer.concat([stdout, chunk.subarray(0, Math.max(0, CAP - stdout.length))]);
      else stderr = Buffer.concat([stderr, chunk.subarray(0, Math.max(0, CAP - stderr.length))]);
      if ((side === 'stdout' ? stdout.length : stderr.length) >= CAP) fail(`output-cap: ${side} reached ${CAP} bytes`);
    };
    child.stdout?.on('data', chunk => take(chunk as Buffer, 'stdout'));
    child.stderr?.on('data', chunk => take(chunk as Buffer, 'stderr'));
    child.on('error', err => { error = `${(err as NodeJS.ErrnoException).code ?? 'spawn-error'}: ${err.message}`; finish(); });
    child.on('close', (code, sig) => { exitCode = code; signal = sig; finish(); });
  });
}

const AST_HELPER = `package main
import("encoding/json";"go/ast";"go/parser";"go/token";"os")
func main(){ f,e:=parser.ParseFile(token.NewFileSet(),os.Args[1],nil,0); if e!=nil {os.Exit(2)}; n:=0; for _,d:=range f.Decls { if x,ok:=d.(*ast.FuncDecl);ok && x.Recv==nil && x.Name.Name==os.Args[2] {n++} }; json.NewEncoder(os.Stdout).Encode(struct{Package string;Count int}{f.Name.Name,n}) }
`;

function noSymlinkAncestry(root: string, path: string): boolean {
  const rel = relative(root, path);
  if (rel.startsWith('..') || isAbsolute(rel)) return false;
  let cursor = root;
  try {
    if (lstatSync(cursor).isSymbolicLink()) return false;
    for (const part of rel.split(sep).filter(Boolean)) {
      cursor = join(cursor, part);
      try { if (lstatSync(cursor).isSymbolicLink()) return false; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false; }
    }
    return true;
  } catch { return false; }
}
function existsIncludingDangling(path: string): boolean { try { lstatSync(path); return true; } catch { return false; } }
function moduleDir(root: string, file: string): string | null {
  let dir = dirname(resolve(root, file));
  while (dir === root || dir.startsWith(root + sep)) {
    if (existsSync(join(dir, 'go.mod'))) return dir;
    if (dir === root) break;
    dir = dirname(dir);
  }
  return null;
}
function regularFile(path: string): boolean { try { return lstatSync(path).isFile(); } catch { return false; } }
function refuse(reason: string, file: string, name: string, write: Writer, json: boolean): number {
  const finding = { severity: 'high', verdict: 'CANNOT_ISOLATE', files: [file], title: 'Go discrimination request refused', detail: `${reason}: the instrument did not run a named Go package test.` };
  const report = { plan: { runnable: false, verdict: 'REFUSE', reason, measurementValid: false, primaryAction: 'fix-runner-invocation', runnerSelection: { kind: 'go-test', command: 'go test' }, targets: [{ file, name }] }, results: [], perTest: [{ file, name, verdict: 'CANNOT_ISOLATE', reason: 'no-execution-evidence' }], aggregate: 'CANNOT_ISOLATE', findings: [finding], measurementValid: false, primaryAction: 'fix-runner-invocation', finding, deprecated: { finding: 'use findings[0]; removed in 0.9.0' } };
  write(json ? JSON.stringify(report, null, 2) : `discrimination-check: REFUSED (${reason}) — CANNOT_ISOLATE`);
  return 0;
}

export async function runGoDiscriminationCheck(options: Map<string, string>, flags: Set<string>, cwd: string, write: Writer, reap: Reaper): Promise<number> {
  const json = flags.has('json');
  const rawFile = options.get('test') ?? '', name = options.get('name') ?? '';
  if (!SAFE_PATH.test(rawFile) || rawFile.includes('//') || !SAFE_NAME.test(name) || rawFile.includes(',') || options.has('runner')) return refuse('go-requires-one-safe-_test.go-and-exact-TestX-without-custom-runner', rawFile, name, write, json);
  const baseRef = options.get('base') ?? 'HEAD';
  if (!SAFE_REF.test(baseRef)) return refuse('unsafe-base-ref', rawFile, name, write, json);
  if (process.platform !== 'linux' || !existsSync('/proc/self/environ') || !existsSync('/proc/self/cwd') || !existsSync('/proc/self/stat')) return refuse('linux-proc-ownership-unavailable', rawFile, name, write, json);
  try { readFileSync('/proc/self/environ'); readFileSync('/proc/self/stat'); realpathSync('/proc/self/cwd'); } catch { return refuse('linux-proc-ownership-unreadable', rawFile, name, write, json); }
  const timeoutInput = Number(options.get('timeout') ?? MAX_MS);
  if (!Number.isFinite(timeoutInput) || timeoutInput <= 0) return refuse('invalid-go-timeout', rawFile, name, write, json);
  const timeout = Math.min(timeoutInput, MAX_MS);
  let root = resolve(cwd);
  let tipFile = resolve(root, rawFile);
  let tipModule: string | null = null;
  const scratch = mkdtempSync(join(tmpdir(), 'dz-go-disc-'));
  const token = randomBytes(16).toString('hex');
  const base = join(scratch, 'base'), helper = join(scratch, 'ast-helper');
  let preserve = false, diagnostics: string[] = [];
  const run = async (cmd: string, args: readonly string[], dir: string, ms = timeout): Promise<Capture> => {
    const observation = await capture(cmd, args, dir, ms, token);
    const cleanup = reap(token, realpathSync(scratch));
    if (!cleanup.complete || cleanup.survivors.length > 0) {
      preserve = true;
      throw Error(`owned process cleanup unconfirmed after ${cmd}: ${JSON.stringify(cleanup)}`);
    }
    return observation;
  };
  const go = existsSync('/usr/local/go/bin/go') ? '/usr/local/go/bin/go' : 'go';
  let row: ClassifyResultRow = { file: rawFile, name, outcome: 'error' };
  let baseSha = 'unknown', tipSha = 'unknown', dirtyFiles = -1;
  let baseRun: Capture | undefined, tipRun: Capture | undefined;
  try {
    const rootRun = await run('git', ['rev-parse', '--show-toplevel'], cwd, 30_000);
    if (rootRun.exitCode !== 0 || !rootRun.captureComplete) throw Error('repository root unavailable');
    root = realpathSync(rootRun.stdout.trim());
    tipFile = resolve(root, rawFile);
    tipModule = moduleDir(root, rawFile);
    if (!tipModule || !regularFile(tipFile) || !regularFile(join(tipModule, 'go.mod')) || !noSymlinkAncestry(root, tipFile) || !noSymlinkAncestry(root, join(tipModule, 'go.mod')) || (existsIncludingDangling(join(tipModule, 'go.sum')) && !noSymlinkAncestry(root, join(tipModule, 'go.sum')))) throw Error('Go test or module missing, nonregular, or symlinked');
    const tipShaRun = await run('git', ['rev-parse', 'HEAD'], root, 30_000);
    if (tipShaRun.exitCode !== 0 || !tipShaRun.captureComplete) throw Error('tip SHA unavailable');
    tipSha = tipShaRun.stdout.trim();
    const dirtyRun = await run('git', ['status', '--porcelain'], root, 30_000);
    if (dirtyRun.exitCode !== 0 || !dirtyRun.captureComplete) throw Error('tip dirty conditions unavailable');
    dirtyFiles = dirtyRun.stdout.split('\n').filter(Boolean).length;
    if (!options.has('base')) {
      const packageDirty = await run('git', ['status', '--porcelain', '--', relative(root, tipModule) || '.'], root, 30_000);
      if (packageDirty.exitCode !== 0 || !packageDirty.captureComplete || !packageDirty.stdout.trim()) throw Error('pre-feature base unavailable: target module has no uncommitted changes; pass --base');
    }
    const sha = await run('git', ['rev-parse', '--verify', `${baseRef}^{commit}`], root, 30_000);
    if (sha.exitCode !== 0 || !sha.captureComplete || !/^[0-9a-f]{40,64}$/.test(sha.stdout.trim())) throw Error('base ref unavailable');
    baseSha = sha.stdout.trim();
    const clone = await run('git', ['clone', '--quiet', '--no-hardlinks', '--no-checkout', '--no-tags', root, base], scratch, 60_000);
    if (clone.exitCode !== 0 || !clone.captureComplete) throw Error(`base clone unavailable: ${clone.captureError ?? clone.stderr}`);
    const checkout = await run('git', ['checkout', '--quiet', '--detach', baseSha], base, 60_000);
    if (checkout.exitCode !== 0 || !checkout.captureComplete) throw Error(`base checkout unavailable: ${checkout.captureError ?? checkout.stderr}`);
    const baseFile = join(base, rawFile), baseModule = moduleDir(base, rawFile);
    if (!baseModule || !regularFile(join(baseModule, 'go.mod')) || !noSymlinkAncestry(base, baseFile) || !noSymlinkAncestry(base, join(baseModule, 'go.mod')) || (existsIncludingDangling(join(baseModule, 'go.sum')) && !noSymlinkAncestry(base, join(baseModule, 'go.sum')))) throw Error('base module/path/config missing or symlinked');
    // A single test overlay is the only modification to the frozen checkout.
    mkdirSync(dirname(baseFile), { recursive: true });
    writeFileSync(baseFile, readFileSync(tipFile));
    writeFileSync(join(scratch, 'ast-helper.go'), AST_HELPER);
    const built = await run(go, ['build', '-mod=readonly', '-o', helper, join(scratch, 'ast-helper.go')], scratch, 60_000);
    if (built.exitCode !== 0 || !built.captureComplete) throw Error(`AST helper unavailable: ${built.captureError ?? built.stderr}`);
    const identity = async (tree: string, mod: string) => {
      const modEdit = await run(go, ['mod', 'edit', '-json'], mod, 30_000);
      if (modEdit.exitCode !== 0 || !modEdit.captureComplete) throw Error('go.mod parse unavailable');
      const edits = JSON.parse(modEdit.stdout) as { Replace?: { New?: { Path?: string } }[] };
      if (edits.Replace?.some(r => (r.New?.Path ?? '').startsWith('.') || isAbsolute(r.New?.Path ?? ''))) throw Error('local replace unsupported');
      const ast = await run(helper, [join(tree, rawFile), name], mod, 30_000);
      if (ast.exitCode !== 0 || !ast.captureComplete) throw Error('AST declaration unavailable');
      const declaration = JSON.parse(ast.stdout) as { Package: string; Count: number };
      if (declaration.Count !== 1) throw Error('named Go test declaration missing or ambiguous');
      const listing = await run(go, ['list', '-json', '-mod=readonly', '.'], dirname(join(tree, rawFile)), 60_000);
      if (listing.exitCode !== 0 || !listing.captureComplete) throw Error(`go list unavailable: ${listing.captureError ?? listing.stderr}`);
      const pkg = JSON.parse(listing.stdout) as { ImportPath?: string; Dir?: string; Name?: string; TestGoFiles?: string[]; XTestGoFiles?: string[]; Incomplete?: boolean; Error?: unknown };
      const field = declaration.Package === pkg.Name ? pkg.TestGoFiles : declaration.Package === `${pkg.Name}_test` ? pkg.XTestGoFiles : undefined;
      if (pkg.Incomplete || pkg.Error || !pkg.ImportPath || pkg.Dir !== dirname(join(tree, rawFile)) || !field?.includes(rawFile.split('/').at(-1)!)) throw Error('go list package/file membership mismatch');
      return pkg.ImportPath;
    };
    const basePackage = await identity(base, baseModule);
    const tipPackage = await identity(root, tipModule);
    if (basePackage !== tipPackage) throw Error('base/tip package identity mismatch');
    const args = ['test', '-json', '-mod=readonly', '-count=1', '-run', `^${name}$`, '.'];
    baseRun = await run(go, args, dirname(baseFile));
    tipRun = await run(go, args, dirname(tipFile));
    const baseEvidence = classifyGoTestExecutionEvidence(baseRun.stdout, baseRun.exitCode, { packagePath: basePackage, testName: name }, baseRun.captureComplete && baseRun.stderr.length === 0);
    const tipEvidence = classifyGoTestExecutionEvidence(tipRun.stdout, tipRun.exitCode, { packagePath: tipPackage, testName: name }, tipRun.captureComplete && tipRun.stderr.length === 0);
    const outcome = (ev: ExecutionEvidence): 'pass' | 'fail' | 'error' => ev.runner !== 'go-test' ? 'error' : ev.exitCode === 0 ? 'pass' : 'fail';
    row = { file: rawFile, name, outcome: outcome(baseEvidence), evidence: baseEvidence, tipOutcome: outcome(tipEvidence), tipEvidence, baseRun, tipRun };
  } catch (error) { diagnostics.push(String((error as Error).message).slice(0, 500)); }
  finally {
    try {
      const cleanup = reap(token, realpathSync(scratch));
      if (!cleanup.complete || cleanup.survivors.length > 0) { preserve = true; diagnostics.push(`owned process cleanup unconfirmed: ${JSON.stringify(cleanup)}`); }
    } catch (error) { preserve = true; diagnostics.push(`owned process cleanup failed: ${String(error)}`); }
    if (!preserve) { try { rmSync(scratch, { recursive: true, force: true }); } catch (error) { preserve = true; diagnostics.push(`scratch removal failed: ${String(error)}`); } }
  }
  if (preserve) {
    const { tipEvidence: _unsafeTipEvidence, ...safeRow } = row;
    row = { ...safeRow, outcome: 'error', tipOutcome: 'error' };
  }
  const result = classifyDiscrimination({ propertyTests: [{ file: rawFile, name }], results: [row] });
  const plan = { runnable: true, verdict: 'PENDING', measurementValid: false, primaryAction: 'none', baseRef, baseRefResolution: { requestedRef: baseRef, resolvedRef: baseSha, how: options.has('base') ? 'explicit-ref' : 'default-ref' }, runnerSelection: { kind: 'go-test', command: 'go test', how: 'go-module' }, packageDir: tipModule ? relative(root, tipModule) || '.' : '.', targets: [{ file: rawFile, name }], rejected: [], isolation: { materialization: 'full-revision-tree', revision: baseSha, overlays: [rawFile] } };
  const report = { plan, results: [row], tipTree: { headSha: tipSha, dirtyFiles }, scratchCleanup: { path: scratch, removed: !preserve }, ...(diagnostics.length ? { goDiagnostics: diagnostics } : {}), ...(preserve ? { preservedScratch: scratch } : {}), ...result, finding: result.findings[0] ?? null, deprecated: { finding: 'use findings[0]; removed in 0.9.0' } };
  if (json) write(JSON.stringify(report, null, 2));
  else {
    write(`discrimination-check @ ${baseSha} — verdict: ${result.aggregate}`);
    write(`  ${result.aggregate === 'DISCRIMINATES' ? '✓' : '✗'} ${rawFile} (${name}): ${result.perTest[0]?.verdict}${result.perTest[0]?.reason ? ` (reason: ${result.perTest[0].reason})` : ''} · testsRun: ${row.evidence?.testsRun ?? 'unknown'}`);
    write(`  measurementValid: ${String(result.measurementValid)} · primaryAction: ${result.primaryAction}`);
    for (const line of diagnostics) write(`  ${line}`);
    if (preserve) write(`  scratch preserved: ${scratch}`);
  }
  return 0;
}
