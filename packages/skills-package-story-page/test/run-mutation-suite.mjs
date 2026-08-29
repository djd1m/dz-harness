import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATION_TARGET_SHA256 = Object.freeze({
  'package-story-page/scripts/verify-story-page.mjs': '92c0fd2271555853a66494e9cdd2e96842e7d8376258447340e27f652a34dd12',
  'package-story-page/scripts/verify-story-semantics.mjs': '13f703cd21051adf934b8be404f902a3ebba260c4ff6b26645016ef142989300',
  'package-story-page/scripts/verify-story-page-browser.mjs': '83ebb3f2fd9d3d195d7937dc3223db8bcaa3f74b6d8766e403e4b08c60c37bd4',
  'package-story-page/scripts/story-schema.mjs': 'dfd7dbfa0ee87fa56f5cbaad1c66434632046571e1fcb96678512f6ab9dd5074',
  'package-story-page/vendor/parse5.bundle.mjs': '67ad160b1d7dc6a36314459390148ad4699732f4c503e90790e6fced5c11c528',
  'package-story-page/scripts/extract-package-evidence.mjs': 'ee175aa24fde44dba2df4b42f6d91a6060b29f0f2934d136c5b090d22d1c8efa',
  'package-story-page/scripts/render-story-page.mjs': 'da9a444761650001175ef5a5cba4697f0eafacd28ce3fe74132e84aec8c54a8b',
});
const PREIMPORT_PATHS = [
  'scripts/verify-story-semantics.mjs',
  'vendor/parse5.bundle.mjs',
  'scripts/extract-package-evidence.mjs',
  'scripts/render-story-page.mjs',
  'scripts/story-schema.mjs',
];
const TEST_NAMES = [
  'forged provenance positive line-range bounds and package identity turn their named checks red',
  'closed DOM independently transforms every allowed element and attribute surface',
  'cross-nested disclosures fail page.controls',
  'hidden evidence markers do not satisfy item bindings',
  'orphan semantic markers cannot borrow aggregate source closure',
  'unexpected story-item owners fail reverse totality',
  'authored copy stays bound to each story item',
  'authored fields stay in exact DOM reading order',
  'authored copy cannot borrow renderer chrome',
  'renderer chrome multiset is cardinality-total for eyebrow package-name collisions',
  'status source and renderer chrome text stay in exact structural owners',
  'visual direction and kind stay in their exact parse5 section owner',
  'claim identifiers stay paired with exact story owners',
  'sections and story items stay in exact direct owners and brief order',
  'element inventory is exact and derived from brief cardinalities',
  'story order verdict is independent from unrelated subset failures',
  'class id category and initial disclosure state stay on exact owners',
  'load-bearing page mutations each turn a named verifier check red',
  'CSS policy predicates discriminate independently from exact style authority',
  'malformed array members fail closed without throwing',
  'input budgets fail before parser renderer or schema traversal',
  'head title and metadata remain semantically bound to the brief',
  'brief digest is stable across object key insertion order',
  'semantic link authority rejects active and non-HTTPS URI anchors',
  'external asset inventory covers HTML resource surfaces and changed stylesheet bytes',
  'parse5 repair is rejected by the emitted subset',
  'module parser environment is fail closed while caller NODE_OPTIONS is stripped',
  'style authority hashes exact parse5-located source bytes',
  'style raw text cannot mint element nodes',
  'semantic exceptions become stable named failures',
  'unexpected semantic authority exceptions become a named public verdict',
  'malformed semantic authority results become a named public verdict',
  'public verifier passes only the normalized brief and exact page to semantic authority',
  'defence-in-depth capability scanner recognises its bounded corpus',
  'static semantic import graph closes exact specifier inventory',
  'production semantic graph blocks renderer and package lookup before execution',
  'semantic integrity gate runs before every changed closure can execute',
  'semantic authority rejects a renderer regression even when page canonical is green',
  'browser disclosure failures participate in the pass fail decision',
  'browser second-origin receipt gates canonical measurement initialization',
];
const FIREFOX_TEST = 'headless Firefox measures zero horizontal overflow at the four contract widths and rejects the second-loopback-origin probe';
const rawRegistry = JSON.parse(readFileSync(join(root, 'test', 'mutation-registry.json'), 'utf8'));
const registryEntries = rawRegistry.entries;
const owningTests = rawRegistry.owningTests;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function runGit(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`mutation runner git ${args[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trimEnd();
}

function runGitExact(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`mutation runner git ${args[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function applyExactMutation(source, mutation) {
  const first = source.indexOf(mutation.find);
  if (first < 0 || first !== source.lastIndexOf(mutation.find)) return null;
  return `${source.slice(0, first)}${mutation.replace}${source.slice(first + mutation.find.length)}`;
}

function tapHasNamedResult(output, name, verdict) {
  // Registry owners are top-level node:test cases. An indented nested failure is evidence from a
  // different test and must not satisfy the declared owner's receipt.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${verdict} \\d+ - ${escaped}$`, 'm').test(output);
}

function tapExecutedWithoutSkip(output, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const subtest = new RegExp(`^# Subtest: ${escaped}$`, 'm').test(output);
  const result = new RegExp(`^(?:ok|not ok) \\d+ - ${escaped}$`, 'm').test(output);
  const skipped = new RegExp(`^(?:ok|not ok) \\d+ - ${escaped} .*# SKIP`, 'mi').test(output);
  return subtest && result && !skipped;
}

function tapExecutedNamedTests(output, names) {
  const expected = new Set(names);
  return output.split(/\r?\n/).flatMap((line) => {
    const result = /^(?:ok|not ok) \d+ - (.+)$/.exec(line);
    return result !== null && expected.has(result[1]) ? [result[1]] : [];
  });
}

const gitMarker = lstatSync(join(root, '.git'), { throwIfNoEntry: false });
if ((!gitMarker?.isDirectory() && !gitMarker?.isFile())
  || realpathSync(runGit(['rev-parse', '--show-toplevel'])) !== realpathSync(root)) {
  throw new Error('mutation runner refuses to write outside a gate-owned scratch repository');
}
const ignoredPaths = runGit(['ls-files', '--others', '--ignored', '--exclude-standard']);
if (ignoredPaths !== '') {
  throw new Error(`mutation runner refuses ignored scratch paths that an execution copy could include: ${ignoredPaths.split('\n').join(',')}`);
}
const statusBefore = runGit(['status', '--porcelain=v1', '--untracked-files=all']);
const changedBefore = statusBefore === '' ? [] : statusBefore.split('\n').map((line) => {
  const path = line.slice(3);
  if (path.includes(' -> ')) throw new Error(`mutation runner refuses a renamed scratch path: ${path}`);
  return path;
});
const mutatedPaths = Object.entries(MUTATION_TARGET_SHA256)
  .filter(([path, expected]) => sha256(readFileSync(join(root, path))) !== expected)
  .map(([path]) => path);
if (mutatedPaths.length > 1
  || changedBefore.length !== mutatedPaths.length
  || changedBefore.some((path) => !mutatedPaths.includes(path))) {
  throw new Error(`mutation runner requires a clean baseline or one known mutation; git=[${changedBefore.join(',')}], bytes=[${mutatedPaths.join(',')}]`);
}
if (!Array.isArray(registryEntries) || owningTests === null || typeof owningTests !== 'object' || Array.isArray(owningTests)) {
  throw new Error('mutation registry must bind every entry to one named owning test');
}
const registryIds = registryEntries.map((entry) => entry.id);
if (Object.keys(owningTests).length !== registryIds.length
  || registryIds.some((id) => typeof owningTests[id] !== 'string' || owningTests[id].trim() === '')
  || Object.keys(owningTests).some((id) => !registryIds.includes(id))) {
  throw new Error('mutation registry owningTests must be an exact total map over entry ids');
}
let activeMutation = null;
if (mutatedPaths.length === 1) {
  const mutatedPath = mutatedPaths[0];
  const current = readFileSync(join(root, mutatedPath), 'utf8');
  const baseline = runGitExact(['show', `HEAD:${mutatedPath}`]);
  const matches = registryEntries.filter((entry) => entry.file === mutatedPath
    && applyExactMutation(baseline, entry.mutation) === current);
  if (matches.length !== 1) {
    throw new Error(`mutation runner requires one registry identity for ${mutatedPath}; matched ${matches.length}`);
  }
  [activeMutation] = matches;
}

const executionParent = mkdtempSync(join(tmpdir(), 'dz-story-mutation-runner-'));
const executionRoot = join(executionParent, 'package');
let resultStatus = 1;
let executionError = null;
let executionAndFinalizationFailed = false;
let expectedLaneCount = 0;
let completedLaneCount = 0;
let completedNameCount = 0;
let stderrNeedsLineBoundary = false;
try {
  cpSync(root, executionRoot, {
    recursive: true,
    filter: (source) => {
      const sourceRelative = relative(root, source);
      return sourceRelative !== '.git' && !sourceRelative.startsWith(`.git${sep}`);
    },
  });
  for (const path of Object.keys(MUTATION_TARGET_SHA256)) {
    if (sha256(readFileSync(join(executionRoot, path))) !== sha256(readFileSync(join(root, path)))) {
      throw new Error(`ephemeral mutation copy differs before execution: ${path}`);
    }
  }

  const executionWrapperPath = join(executionRoot, 'package-story-page', 'scripts', 'verify-story-page.mjs');
  let wrapper = readFileSync(executionWrapperPath, 'utf8');
  const wrapperBeforeRebind = wrapper;
  const reboundPaths = [];
  for (const relativePath of PREIMPORT_PATHS) {
    const marker = `'${relativePath}': '`;
    const markerAt = wrapper.indexOf(marker);
    if (markerAt < 0 || markerAt !== wrapper.lastIndexOf(marker)) {
      throw new Error(`pre-import hash marker must occur exactly once: ${relativePath}`);
    }
    const hashAt = markerAt + marker.length;
    const current = wrapper.slice(hashAt, hashAt + 64);
    if (!/^[a-f0-9]{64}$/.test(current)) throw new Error(`pre-import hash marker is malformed: ${relativePath}`);
    const expected = sha256(readFileSync(join(executionRoot, 'package-story-page', relativePath)));
    if (current !== expected) reboundPaths.push(relativePath);
    wrapper = `${wrapper.slice(0, hashAt)}${expected}${wrapper.slice(hashAt + 64)}`;
    if (wrapper.slice(hashAt, hashAt + 64) !== expected) throw new Error(`pre-import hash rebind failed: ${relativePath}`);
  }
  const expectedReboundPaths = mutatedPaths
    .filter((path) => path.startsWith('package-story-page/'))
    .map((path) => path.slice('package-story-page/'.length))
    .filter((path) => PREIMPORT_PATHS.includes(path))
    .sort();
  if (JSON.stringify(reboundPaths.sort()) !== JSON.stringify(expectedReboundPaths)) {
    throw new Error(`pre-import hash rebind touched [${reboundPaths.join(',')}], expected [${expectedReboundPaths.join(',')}]`);
  }
  if (expectedReboundPaths.length === 0 && wrapper !== wrapperBeforeRebind) {
    throw new Error('a lane with no mutated pre-import input requires hash rebinding to be a byte no-op');
  }
  writeFileSync(executionWrapperPath, wrapper);

  const browserMutated = mutatedPaths.includes('package-story-page/scripts/verify-story-page-browser.mjs');
  const liveBrowserLanes = mutatedPaths.length === 0 ? [true, false] : [browserMutated];
  expectedLaneCount = liveBrowserLanes.length;
  for (const liveBrowser of liveBrowserLanes) {
    const childEnv = { ...process.env };
    const names = [...new Set([
      ...TEST_NAMES,
      ...Object.values(owningTests).filter((name) => name !== FIREFOX_TEST),
    ])];
    if (liveBrowser) {
      delete childEnv.PACKAGE_STORY_SKIP_BROWSER;
      names.push(FIREFOX_TEST);
    } else {
      childEnv.PACKAGE_STORY_SKIP_BROWSER = '1';
    }
    const testSource = readFileSync(join(executionRoot, 'test', 'story-page.test.mjs'), 'utf8');
    for (const name of names) {
      if (!testSource.includes(`test('${name}'`)) throw new Error(`mutation runner test name is not exact: ${name}`);
    }
    const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const testPattern = `^(?:${names.map(escapeRegExp).join('|')})$`;
    process.stderr.write(`mutation-suite: browser lane ${liveBrowser ? 'LIVE' : 'unit-only'}; mutations=[${mutatedPaths.join(',')}]\n`);
    const result = spawnSync(process.execPath, [
      '--test',
      `--test-name-pattern=${testPattern}`,
      'test/story-page.test.mjs',
    ], {
      cwd: executionRoot,
      env: childEnv,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    resultStatus = result.status ?? 1;
    const childStderr = result.stderr ?? '';
    const childTap = result.stdout ?? '';
    process.stdout.write(childTap);
    process.stderr.write(childStderr);
    const receiptNeedsLineBoundary = childStderr !== '' && !/[\r\n]$/.test(childStderr);
    stderrNeedsLineBoundary = receiptNeedsLineBoundary;
    const executedNames = tapExecutedNamedTests(childTap, names);
    const observedExecuted = executedNames.length;
    const executedExactlyOnce = observedExecuted === names.length
      && new Set(executedNames).size === names.length
      && names.every((name) => executedNames.includes(name));
    if (!executedExactlyOnce) {
      if (receiptNeedsLineBoundary) process.stderr.write('\n');
      process.stderr.write(`mutation-suite-receipt-error: lane-execution-count-mismatch expected=${names.length} observed=${observedExecuted}\n`);
      stderrNeedsLineBoundary = false;
      resultStatus = 1;
      break;
    }
    if (liveBrowser && !tapExecutedWithoutSkip(childTap, FIREFOX_TEST)) {
      if (receiptNeedsLineBoundary) process.stderr.write('\n');
      process.stderr.write(`mutation-suite-receipt-error: live-firefox-receipt-missing test=${FIREFOX_TEST}\n`);
      stderrNeedsLineBoundary = false;
      resultStatus = 1;
      break;
    }
    if (activeMutation !== null && resultStatus !== 0) {
      const owner = owningTests[activeMutation.id];
      if (!tapHasNamedResult(childTap, owner, 'not ok')) {
        if (receiptNeedsLineBoundary) process.stderr.write('\n');
        process.stderr.write(`mutation-suite-receipt-error: owner-receipt-mismatch id=${activeMutation.id} owner=${owner}\n`);
        stderrNeedsLineBoundary = false;
        resultStatus = 1;
        break;
      }
    }
    completedLaneCount += 1;
    completedNameCount += observedExecuted;
    if (resultStatus !== 0) break;
  }
} catch (error) {
  executionError = error;
} finally {
  const finalizationErrors = [];
  try {
    rmSync(executionParent, { recursive: true, force: true });
  } catch (error) {
    finalizationErrors.push(error);
  }
  try {
    const statusRestored = runGit(['status', '--porcelain=v1', '--untracked-files=all']);
    if (statusRestored !== statusBefore) {
      throw new Error(`mutation runner changed the gate scratch despite ephemeral execution: before=[${statusBefore}], after=[${statusRestored}]`);
    }
  } catch (error) {
    finalizationErrors.push(error);
  }
  if (finalizationErrors.length > 0) {
    executionAndFinalizationFailed = executionError !== null;
    executionError = executionError === null && finalizationErrors.length === 1
      ? finalizationErrors[0]
      : new AggregateError(
        executionError === null ? finalizationErrors : [executionError, ...finalizationErrors],
        'mutation runner execution and scratch finalization did not both complete cleanly',
      );
  }
}
if (executionError !== null) {
  if (stderrNeedsLineBoundary) process.stderr.write('\n');
  const rawMessage = executionError instanceof Error ? executionError.message : String(executionError);
  const singleLineMessage = rawMessage.replace(/[\r\n]+/g, ' ').trim() || 'unknown runner execution error';
  const detail = executionAndFinalizationFailed
    ? `execution and finalization both failed: ${singleLineMessage}`
    : singleLineMessage;
  process.stderr.write(`mutation-suite-receipt-error: runner-execution-error detail=${detail}\n`);
}
if (executionError !== null) throw executionError;
if (completedLaneCount === expectedLaneCount) {
  if (stderrNeedsLineBoundary) process.stderr.write('\n');
  process.stderr.write(`mutation-suite-receipt-ok: lanes=${completedLaneCount} names=${completedNameCount}\n`);
}
process.exitCode = resultStatus;
