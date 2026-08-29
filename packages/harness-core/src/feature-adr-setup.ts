/**
 * Guided feature-adr onboarding (feature guided-feature-adr-setup, ADR-001).
 *
 * The `configure-feature-adr` SKILL runs a short interview and fills a `SetupSpec`; `dz feature-adr-setup`
 * scaffolds the project-awareness files from that spec — so a user configures feature-adr WITHOUT knowing
 * any manifest schema ("complex inside, simple outside"). The plan/render/scaffold builders are PURE +
 * deterministic (sorted, no clock/random); the scan helper does disk I/O with TOP-LEVEL node:fs (ESM).
 *
 * SAFETY PROPERTY (ADR-001 §2, load-bearing): `scaffoldFromSpec` NEVER emits a full overwrite of an existing
 * file. A structured file (manifest / project-skills) is UNION-merged (existing content preserved); a prose
 * doc (vision.md / testing.md) that already exists is left untouched (`unchanged`), never clobbered.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Subsystem, SubsystemManifest } from './architecture.js';
import { scanWorkspacePackages } from './architecture.js';
import type { ProjectSkillManifest, ExtraSkill, CoreRole } from './project-skills.js';
import { findReviewArtifacts } from './rake-analyzer.js';
import type { TargetName } from './targets.js';
import { PLANE_SPECS } from './delivery-check.js';
import { buildParityMatrix, GATE_FEATURE_IDS } from './parity.js';
import { HANDOFF_CRITERION_LABELS } from './delivery-check.js';

export interface VisionSpec { readonly core: string; readonly direction?: string; readonly boundaries?: readonly string[]; readonly principles?: readonly string[] }
export interface TestingSpec { readonly commands?: readonly string[]; readonly doneDefinition?: string; readonly gates?: readonly string[] }
export type SubsystemSpec = Subsystem;

export interface SetupSpec {
  readonly vision?: VisionSpec;
  readonly subsystems?: readonly SubsystemSpec[];
  readonly testing?: TestingSpec;
  /** critic: 'auto' ⇒ a generated project-critic skill; a path ⇒ that file. brand/impl-bar: a path. */
  readonly roles?: Partial<Record<'critic' | 'brand' | 'impl-bar', string>>;
  readonly extra?: readonly ExtraSkill[];
  /** scaffold a starter `architecture/degradations.md` — the accepted-degradations registry the R6
   *  challenge panel (C1) reads so it does not re-flag debt you already own. Create-if-absent. */
  readonly degradations?: boolean;
  /** P3 (fa-improvements): scaffold DETERMINISTIC guard tests into the project — a declarative
   *  `guards.config.json` + a zero-dependency Node runner `check.mjs` (LOC cap, secret scan, frozen-file
   *  sha256 pins, each with an explicit waiver mechanism). `true` for defaults, or `{ locCap }` to tune.
   *  Moves rules a reviewer "might notice" down to layer 1 of the cost-of-detection ladder. Create-if-absent. */
  readonly guards?: boolean | { readonly locCap?: number };
  /** portable-gates (direction b): scaffold a zero-config `architecture/gates/delivery-check.md` — the
   *  portable Step-10 Delivery Gate protocol for AGENTS.md-class targets that read repo docs rather than
   *  invoking dz interactively. The "runnable here" gate list is COMPUTED from `buildParityMatrix()` for
   *  the target being scaffolded (AM-12), never hand-typed. Opt-in, create-if-absent. */
  readonly gates?: boolean;
}

export interface SetupScan {
  readonly visionExists: boolean;
  readonly manifestExists: boolean;
  readonly projectSkillsExists: boolean;
  readonly testingExists: boolean;
  readonly packages: readonly string[];
  readonly reviewCorpus: boolean;
}

export interface SetupPlan {
  readonly exists: { readonly vision: boolean; readonly manifest: boolean; readonly projectSkills: boolean; readonly testing: boolean };
  readonly discoveredPackages: readonly string[];
  readonly hasReviewCorpus: boolean;
  readonly missing: readonly string[];
  readonly suggestions: readonly string[];
}

export interface ScaffoldFile { readonly path: string; readonly action: 'create' | 'augment' | 'unchanged'; readonly content: string; readonly note?: string }
export interface ScaffoldResult { readonly files: readonly ScaffoldFile[] }

/** One existing on-disk file: `exists` distinguishes ABSENT from EXISTS-BUT-UNREADABLE (never clobber either). */
export interface ExistingFile { readonly exists: boolean; readonly content?: string }
/** The existing files the scaffold compares against. */
export interface ExistingScaffoldFiles { readonly vision: ExistingFile; readonly manifest: ExistingFile; readonly projectSkills: ExistingFile; readonly testing: ExistingFile; readonly degradations?: ExistingFile; readonly guardsConfig?: ExistingFile; readonly guardsRunner?: ExistingFile; readonly gatesDoc?: ExistingFile }

// Canonical committed paths (ADR: everything under architecture/).
export const P_VISION = 'architecture/vision.md';
export const P_TESTING = 'architecture/testing.md';
export const P_MANIFEST = 'architecture/subsystems.manifest.json';
export const P_PROJECT_SKILLS = 'architecture/project-skills.json';
export const P_CRITIC = 'architecture/project-critic/SKILL.md';
export const P_DEGRADATIONS = 'architecture/degradations.md';
export const P_GUARDS_CONFIG = 'architecture/guards/guards.config.json';
export const P_GUARDS_RUNNER = 'architecture/guards/check.mjs';
export const P_GATES_DOC = 'architecture/gates/delivery-check.md';

const byStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const uniqSorted = (xs: readonly string[]): string[] => [...new Set(xs)].sort(byStr);

/** What exists, what is discoverable, what is still missing — the read-only "which docs, and where?" answer (FR-2). PURE. */
export function buildSetupPlan(scan: SetupScan): SetupPlan {
  const missing: string[] = [];
  if (!scan.visionExists) missing.push(P_VISION);
  if (!scan.manifestExists) missing.push(P_MANIFEST);
  if (!scan.testingExists) missing.push(P_TESTING);
  if (!scan.projectSkillsExists) missing.push(P_PROJECT_SKILLS);

  const suggestions: string[] = [];
  if (!scan.manifestExists && scan.packages.length > 0) suggestions.push(`auto-scaffold ${P_MANIFEST} from ${scan.packages.length} discovered package(s) — you refine the grouping`);
  if (!scan.visionExists) suggestions.push(`author ${P_VISION} from a short interview (seeded from the README)`);
  if (!scan.testingExists) suggestions.push(`author ${P_TESTING} from a short interview (test commands, definition of done, gates)`);
  if (scan.reviewCorpus) suggestions.push('generate the `critic` role from your review history: `dz mr-rakes --gen-critic`');

  return {
    exists: { vision: scan.visionExists, manifest: scan.manifestExists, projectSkills: scan.projectSkillsExists, testing: scan.testingExists },
    discoveredPackages: uniqSorted(scan.packages),
    hasReviewCorpus: scan.reviewCorpus,
    missing: missing.sort(byStr),
    suggestions,
  };
}

/** Suggest a starter subsystem grouping from discovered packages (deterministic heuristic — user refines). PURE. */
export function suggestSubsystems(packages: readonly string[]): SubsystemSpec[] {
  const pkgs = uniqSorted(packages);
  const foundation: string[] = [];
  const arsenal: string[] = [];
  const other: string[] = [];
  for (const p of pkgs) {
    if (p.startsWith('skills-')) arsenal.push(p);
    else if (/^(core|.*-core|.*-cli|.*-presets|adapter-)/.test(p)) foundation.push(p);
    else other.push(p);
  }
  const subs: SubsystemSpec[] = [];
  if (foundation.length) subs.push({ id: 'foundation', label: 'Foundation', job: null, desc: 'Core, CLI, presets, adapters — the substrate.', packages: foundation.filter((p) => !p.startsWith('adapter-')), packagePatterns: foundation.some((p) => p.startsWith('adapter-')) ? ['adapter-*'] : [], commands: [] });
  if (arsenal.length) subs.push({ id: 'arsenal', label: 'Arsenal', job: null, desc: 'The skills themselves.', packages: [], packagePatterns: ['skills-*'], commands: [] });
  if (other.length) subs.push({ id: 'app', label: 'Application', job: null, desc: 'Product-specific packages (rename/split to your real subsystems).', packages: other, packagePatterns: [], commands: [] });
  return subs;
}

/** architecture/vision.md from the spec. Deterministic. */
export function renderVisionDoc(v: VisionSpec): string {
  const lines = ['# Product Vision', '', '> Curated compass. feature-adr Step 0 reads this and checks new features against it. Edit when intent changes.', '', '## What it is', v.core.trim()];
  if (v.direction) { lines.push('', '## Where it is going', v.direction.trim()); }
  if (v.boundaries && v.boundaries.length) { lines.push('', '## What it consciously does NOT do'); for (const b of v.boundaries) lines.push(`- ${b}`); }
  if (v.principles && v.principles.length) { lines.push('', '## Principles that must not be broken'); v.principles.forEach((p, i) => lines.push(`${i + 1}. ${p}`)); }
  return lines.join('\n') + '\n';
}

/** architecture/testing.md from the spec — the project's verification procedure (feeds Step 8 QE). Deterministic. */
export function renderTestingDoc(t: TestingSpec): string {
  const lines = ['# Testing & verification (this project)', '', '> feature-adr folds this into Step 8 (QE) as the `testing` role. What it means to be verified HERE.', ''];
  if (t.commands && t.commands.length) { lines.push('## Verification commands'); for (const c of t.commands) lines.push('- `' + c + '`'); lines.push(''); }
  if (t.doneDefinition) { lines.push('## Definition of "done"', t.doneDefinition.trim(), ''); }
  if (t.gates && t.gates.length) { lines.push('## Required gates'); for (const g of t.gates) lines.push(`- ${g}`); lines.push(''); }
  return lines.join('\n');
}

/** Starter accepted-degradations registry (R6 challenge panel C1 reads this). PURE. */
export function renderDegradationsDoc(): string {
  return [
    '# Accepted degradations registry',
    '',
    '> The R6 challenge panel (question C1) reads this. A plan that deviates from a pattern REGISTERED here',
    '> is NOT flagged — the debt is already owned and consciously accepted. List patterns you KNOW are',
    '> imperfect but keep on purpose, so the adversarial plan-gate does not re-raise them every time.',
    '',
    '## Format',
    '',
    'One entry per accepted degradation:',
    '',
    '### <short-title>',
    '- **What:** the pattern / shortcut / boundary compromise.',
    '- **Why accepted:** the reason it stays (cost, risk, timeline, external constraint).',
    '- **Exit condition:** what would make it worth fixing (or "permanent").',
    '',
    '<!-- Add your accepted degradations below. An empty registry means the panel flags every deviation. -->',
    '',
  ].join('\n');
}

/** Build a subsystem manifest from the spec's subsystems. PURE. */
export function buildManifestFromSpec(subs: readonly SubsystemSpec[]): SubsystemManifest {
  return { version: 1, subsystems: [...subs].sort((a, b) => byStr(a.id, b.id)) };
}

/** Wire the project-skills manifest from the spec: product-vision + testing point at the scaffolded docs;
 *  critic/brand/impl-bar are added when the spec supplies them; extra is carried through. PURE. */
export function buildProjectSkillsFromSpec(spec: SetupSpec): ProjectSkillManifest {
  const roles: Partial<Record<CoreRole, string>> = { 'product-vision': P_VISION };
  if (spec.testing) roles['testing'] = P_TESTING;
  const r = spec.roles ?? {};
  if (r.critic) roles['critic'] = r.critic === 'auto' ? P_CRITIC : r.critic;
  if (r.brand) roles['brand'] = r.brand;
  if (r['impl-bar']) roles['impl-bar'] = r['impl-bar'];
  return { version: 1, roles, ...(spec.extra && spec.extra.length ? { extra: [...spec.extra] } : {}) };
}

// ── Union-merge helpers (augment; preserve existing byte-for-byte incl. unknown keys, order, duplicates) ──

const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * Merge new subsystems into an EXISTING parsed manifest object. Returns null when the existing shape is not
 * safely mergeable (so the caller leaves the file untouched). Preserves ALL existing top-level keys (owner,
 * etc.), the existing subsystem array VERBATIM (order + duplicates), and only APPENDS subsystems whose id is
 * not already present. Cross-model QE: never drop/reorder/dedupe the user's content.
 */
function mergeManifest(existingObj: unknown, nextSubs: readonly Subsystem[]): { content: string; added: string[] } | null {
  if (!isObj(existingObj) || !Array.isArray(existingObj.subsystems)) return null;   // malformed shape → don't touch
  const ids = new Set<string>();
  for (const s of existingObj.subsystems) if (isObj(s) && typeof s.id === 'string') ids.add(s.id);
  const appended = nextSubs.filter((s) => !ids.has(s.id));
  const merged = { ...existingObj, subsystems: [...existingObj.subsystems, ...appended] };
  return { content: JSON.stringify(merged, null, 2) + '\n', added: appended.map((s) => s.id) };
}

/** Merge new roles/extra into an EXISTING parsed project-skills object. Null when unsafe. Preserves unknown
 *  keys (metadata, etc.) + existing roles/extra; appends only new ones. Guards non-object/array shapes. */
function mergeProjectSkills(existingObj: unknown, nextRoles: Record<string, string>, nextExtra: readonly ExtraSkill[]): { content: string; added: string[] } | null {
  if (!isObj(existingObj)) return null;
  const existingRoles = existingObj.roles;
  if (existingRoles !== undefined && !isObj(existingRoles)) return null;            // roles present but not an object → don't touch
  const roles: Record<string, unknown> = { ...(isObj(existingRoles) ? existingRoles : {}) };
  const added: string[] = [];
  for (const [k, v] of Object.entries(nextRoles)) if (!(k in roles) && typeof v === 'string') { roles[k] = v; added.push(`roles.${k}`); }

  const existingExtra = existingObj.extra;
  if (existingExtra !== undefined && !Array.isArray(existingExtra)) return null;    // extra present but not an array → don't touch
  const extra: unknown[] = Array.isArray(existingExtra) ? [...existingExtra] : [];
  const seen = new Set(extra.filter(isObj).map((e) => `${String((e as Record<string, unknown>).skill)}|${String((e as Record<string, unknown>).phase)}`));
  for (const e of nextExtra) { const key = `${e.skill}|${e.phase}`; if (!seen.has(key)) { extra.push(e); seen.add(key); added.push(`extra:${e.skill}`); } }

  const merged: Record<string, unknown> = { ...existingObj, roles, ...(extra.length ? { extra } : {}) };
  return { content: JSON.stringify(merged, null, 2) + '\n', added };
}

const tryParse = (s: string): unknown | typeof PARSE_FAIL => { try { return JSON.parse(s); } catch { return PARSE_FAIL; } };
const PARSE_FAIL = Symbol('parse-fail');

/** A prose (create-if-absent-else-leave) scaffold decision — never merges prose. */
function proseFile(path: string, existing: ExistingFile, render: () => string): ScaffoldFile {
  if (!existing.exists) return { path, action: 'create', content: render() };
  return { path, action: 'unchanged', content: existing.content ?? '', note: 'exists — left as-is (edit by hand; never overwritten)' };
}

/** A structured (union-merge) scaffold decision. Presence gates overwrite: an existing file is NEVER
 *  replaced — unreadable/unparseable/unmergeable → `unchanged`; parseable → append-only merge. */
function structuredFile(path: string, existing: ExistingFile, render: () => string, merge: (parsed: unknown) => { content: string; added: string[] } | null): ScaffoldFile {
  if (!existing.exists) return { path, action: 'create', content: render() };
  if (existing.content === undefined) return { path, action: 'unchanged', content: '', note: 'exists but unreadable — left as-is (never overwritten)' };
  const parsed = tryParse(existing.content);
  if (parsed === PARSE_FAIL) return { path, action: 'unchanged', content: existing.content, note: 'exists but not valid JSON — left as-is; fix by hand' };
  const m = merge(parsed);
  if (m === null) return { path, action: 'unchanged', content: existing.content, note: 'exists with a non-standard shape — left as-is; merge by hand' };
  return { path, action: m.added.length ? 'augment' : 'unchanged', content: m.content, note: m.added.length ? `adds ${m.added.join(', ')}` : 'no new items' };
}

/**
 * Build the scaffold plan from the spec + what already exists. PURE + deterministic. AUGMENT-NEVER-CLOBBER
 * (ADR-001 §2, load-bearing): a file that EXISTS is never replaced — prose is left as-is; structured files
 * are append-only merged (existing content, order, and unknown keys preserved). A file only gets `create`
 * when it is genuinely ABSENT. Malformed existing content never crashes and never clobbers.
 */
/** Default LOC (lines of code) cap for the scaffolded guard — the classic god-object threshold. */
export const DEFAULT_GUARD_LOC_CAP = 700;

/** Render the declarative guard config. Data, not behavior — the owner edits caps/waivers here. */
export function renderGuardsConfig(opts: { locCap?: number } = {}): string {
  const cap = typeof opts.locCap === 'number' && Number.isFinite(opts.locCap) && opts.locCap > 0 ? Math.floor(opts.locCap) : DEFAULT_GUARD_LOC_CAP;
  return JSON.stringify({
    $doc: 'Deterministic project guards (fa-improvements P3). Enforced by architecture/guards/check.mjs — wire `node architecture/guards/check.mjs` into your test/CI command. Every waiver REQUIRES a reason: a conscious exception is recorded, not silently allowed. The project-critic role must NOT re-flag rules enforced here — only waivers without a reason.',
    locCap: {
      limit: cap,
      include: ['src/**', 'lib/**', 'app/**', 'test/**', 'tests/**'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.go', '.rs', '.java'],
      waivers: [{ path: 'example/generated-file.ts', reason: 'generated code — delete this sample waiver' }],
    },
    secretScan: {
      include: ['src/**', 'lib/**', 'app/**', 'test/**', 'tests/**', 'docs/**'],
      waivers: [],
    },
    frozenFiles: [] as { path: string; sha256: string; reason: string }[],
  }, null, 2) + '\n';
}

/**
 * Render the ZERO-DEPENDENCY guard runner (plain Node ≥18, no framework, no install): LOC cap + high-signal
 * secret scan + frozen-file sha256 pins, waivers with required reasons, `--json`, exit 1 on violation.
 * Deliberately a portable .mjs, not a vitest/pytest file — it runs in ANY stack's CI with just Node.
 */
export function renderGuardsRunner(): string {
  return [
    '#!/usr/bin/env node',
    "// architecture/guards/check.mjs — deterministic project guards (generated by dz feature-adr-setup --guards).",
    '// Zero dependencies: plain Node >=18. Wire into CI/test: `node architecture/guards/check.mjs` (exit 1 = violation).',
    '// Rules and waivers live in guards.config.json — a waiver without a reason is itself a violation.',
    "import { readFileSync, readdirSync, statSync } from 'node:fs';",
    "import { join, extname, sep } from 'node:path';",
    "import { createHash } from 'node:crypto';",
    '',
    "const ROOT = process.cwd();",
    "const CFG = JSON.parse(readFileSync(join(ROOT, 'architecture/guards/guards.config.json'), 'utf8'));",
    "const JSON_MODE = process.argv.includes('--json');",
    'const violations = [];',
    '',
    "const SECRETS = [",
    "  { name: 'private-key-pem', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----/ },",
    "  { name: 'openai-key', re: /\\bsk-[A-Za-z0-9_-]{20,}\\b/ },",
    "  { name: 'stripe-key', re: /\\bsk_(?:live|test)_[A-Za-z0-9]{16,}\\b/ },",
    "  { name: 'github-token', re: /\\bgh[pousr]_[A-Za-z0-9]{36,}\\b/ },",
    "  { name: 'aws-access-key', re: /\\bAKIA[0-9A-Z]{16}\\b/ },",
    "  { name: 'slack-token', re: /\\bxox[baprs]-[A-Za-z0-9-]{10,}\\b/ },",
    "  { name: 'google-api-key', re: /\\bAIza[0-9A-Za-z_-]{35}\\b/ },",
    '];',
    "const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', 'coverage', '.next', 'vendor', '__pycache__']);",
    '',
    '// include patterns are simple dir prefixes (the part before /**). Deterministic, no glob dependency.',
    "const prefixes = (pats) => (pats || []).map((p) => String(p).split('/**')[0]).filter(Boolean);",
    'function walk(dir, out) {',
    '  let entries = [];',
    '  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }',
    '  for (const e of entries) {',
    '    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out); }',
    '    else if (e.isFile()) out.push(join(dir, e.name));',
    '  }',
    '  return out;',
    '}',
    "const rel = (p) => p.slice(ROOT.length + 1).split(sep).join('/');",
    'function filesUnder(pats) {',
    '  const out = [];',
    '  for (const pre of prefixes(pats)) walk(join(ROOT, pre), out);',
    '  return out;',
    '}',
    'function waiverFor(list, relPath) {',
    "  for (const w of list || []) { if (w && w.path === relPath) return w; }",
    '  return null;',
    '}',
    'function applyWaiver(rule, relPath, list, detail) {',
    '  const w = waiverFor(list, relPath);',
    "  if (!w) { violations.push({ rule, path: relPath, detail }); return; }",
    "  if (!w.reason || !String(w.reason).trim()) violations.push({ rule: rule + '-waiver', path: relPath, detail: 'waived WITHOUT a reason — a silent exception is a violation' });",
    '}',
    '',
    '// 1) LOC cap (the god-object guard: deterministic wc -l, not reviewer judgment)',
    'if (CFG.locCap && CFG.locCap.limit > 0) {',
    '  const exts = new Set(CFG.locCap.extensions || []);',
    '  for (const f of filesUnder(CFG.locCap.include)) {',
    '    if (exts.size && !exts.has(extname(f))) continue;',
    "    let n = 0; try { n = readFileSync(f, 'utf8').split('\\n').length; } catch { continue; }",
    '    if (n > CFG.locCap.limit) applyWaiver(\'loc-cap\', rel(f), CFG.locCap.waivers, n + \' lines > cap \' + CFG.locCap.limit);',
    '  }',
    '}',
    '',
    '// 2) secret scan (high-signal shapes only — ordinary prose and hashes do not trip it)',
    'if (CFG.secretScan) {',
    '  for (const f of filesUnder(CFG.secretScan.include)) {',
    "    let text = ''; try { text = readFileSync(f, 'utf8'); } catch { continue; }",
    '    for (const s of SECRETS) { if (s.re.test(text)) applyWaiver(\'secret-scan\', rel(f), CFG.secretScan.waivers, \'looks like a \' + s.name); }',
    '  }',
    '}',
    '',
    '// 3) frozen-file sha256 pins (tamper/drift evidence for files that must not change silently)',
    'for (const fz of CFG.frozenFiles || []) {',
    '  if (!fz || !fz.path || !fz.sha256) continue;',
    '  let actual = null;',
    "  try { actual = createHash('sha256').update(readFileSync(join(ROOT, fz.path))).digest('hex'); } catch { /* missing counts as changed */ }",
    "  if (actual !== fz.sha256) violations.push({ rule: 'frozen-file', path: fz.path, detail: actual ? 'sha256 changed (pinned ' + fz.sha256.slice(0, 12) + '…, actual ' + actual.slice(0, 12) + '…)' : 'file missing/unreadable' });",
    '}',
    '',
    'if (JSON_MODE) { console.log(JSON.stringify({ ok: violations.length === 0, violations })); }',
    'else {',
    "  if (violations.length === 0) console.log('guards: ✓ all deterministic guards pass');",
    "  else { console.log('guards: ✗ ' + violations.length + ' violation(s)'); for (const v of violations) console.log('  [' + v.rule + '] ' + v.path + ' — ' + v.detail); }",
    '}',
    'process.exit(violations.length === 0 ? 0 : 1);',
    '',
  ].join('\n');
}

/**
 * Render the ZERO-CONFIG portable Delivery Gate doc for `target` (portable-gates, direction b). Unlike the
 * workflow script, `feature-adr-setup.ts` is an ordinary ESM module, so it does a REAL `import` of
 * {@link PLANE_SPECS} (FR-9 "computed, not hand-typed"). Per AM-12 it TAKES the target and COMPUTES the
 * "gates runnable here" list from `buildParityMatrix()` for that target's declared capabilities (full/manual
 * cells with their `via`) — never a hand-typed static list. Deterministic; no clock/random.
 */
export function renderGatesDoc(target: TargetName): string {
  const matrix = buildParityMatrix(); // computed ONCE (delivery finding: was called twice)
  const row = matrix.find((r) => r.feature.id === 'delivery-gate');
  const cell = row?.cells[target];
  const lines: string[] = [
    '# Portable delivery gate (this project)',
    '',
    '> Generated by `dz feature-adr-setup --gates`. The portable form of the feature-adr Step-10 Delivery',
    '> Gate: a one-command hand-off protocol that travels to every `shell` target. On Claude-Code the',
    '> ultracode workflow can run it as the OPT-IN Step-10 (`args.deliveryGate: true` — off by default);',
    '> everywhere (including Claude-Code without that opt-in) you drive it by hand with `dz delivery-check`.',
    '',
    '## How to run it (one command, no config)',
    '',
    '1. **Dispatch the review** — `dz delivery-check --slug <feature-slug>` prints the artifact-probe status',
    '   and the four-plane review brief. Have this target\'s own agent runtime execute the four planes against',
    '   the changed files (per `features/<slug>/07_code_changes/change_manifest.md`).',
    '2. **Cross-validate** — independently re-verify every BLOCKER/HIGH finding, mark each `crossValidated: true`',
    '   only when confirmed (default `false` when uncertain), and assemble a `findings.json` (a positional array',
    '   of four plane results, each `{ "findings": [ ... ] }`).',
    '3. **Get the verdict** — `dz delivery-check --slug <feature-slug> --findings findings.json` writes',
    '   `features/<slug>/10_delivery_review.md` and prints `ready` / `blocked`. Add `--strict` to make a',
    '   `blocked` hand-off exit non-zero (CI gate); add `--json` for a machine-readable result.',
    '',
    '## The four planes',
    '',
  ];
  for (const p of PLANE_SPECS) lines.push(`- ${p.focus}`);
  lines.push('');
  lines.push('## Hand-off criterion (fail-closed)', '');
  lines.push('`ready` **only** when ALL of these pass — every other case is `blocked`:', '');
  // Labels come from the ENGINE's exported HANDOFF_CRITERION_LABELS (single source — hand-typed
  // criterion prose here was a drift channel into every target repo; delivery finding). A label
  // the tails map does not know still renders (bare) rather than silently disappearing.
  const criterionTails: Record<string, string> = {
    '0 BLOCKER': 'zero confirmed (cross-validated) BLOCKER findings',
    '0 HIGH': 'zero confirmed (cross-validated) HIGH findings',
    'planes complete': 'all four planes returned a usable, positionally-complete result',
    'BLOCKER/HIGH cross-validated': 'no un-cross-validated BLOCKER/HIGH (else `cross-validation-incomplete`)',
    'required artifacts present': 'the change manifest + `07_code_changes/` directory exist',
  };
  for (const label of HANDOFF_CRITERION_LABELS) {
    const tail = criterionTails[label];
    lines.push(tail !== undefined ? `- \`${label}\` — ${tail}` : `- \`${label}\``);
  }
  lines.push('');
  lines.push(`## Gates runnable here — computed for \`${target}\``, '');
  lines.push('> Computed from the target-parity model (`dz parity --target ' + target + '`), not hand-typed.', '');
  // GATE-class features only (delivery finding: the full parity dump listed "Skill packs — full"
  // under a gates heading — mildly different from what the section title describes).
  for (const r of matrix.filter((x) => GATE_FEATURE_IDS.includes(x.feature.id))) {
    const c = r.cells[target];
    const mark = c.level === 'full' ? '✓ full' : c.level === 'manual' ? '◐ manual' : '— none';
    lines.push(`- **${r.feature.title}** — ${mark}${c.level !== 'none' && c.via ? ` (via ${c.via})` : ''}`);
  }
  lines.push('');
  const deliveryVia = cell && cell.level !== 'none' ? `${cell.level}${cell.via ? ` (via ${cell.via})` : ''}` : 'none';
  lines.push(`This target's Step-10 Delivery Gate form: **${deliveryVia}**.`, '');
  return lines.join('\n');
}

export function scaffoldFromSpec(spec: SetupSpec, existing: ExistingScaffoldFiles, target: TargetName = 'agents-md'): ScaffoldResult {
  const files: ScaffoldFile[] = [];
  if (spec.vision) files.push(proseFile(P_VISION, existing.vision, () => renderVisionDoc(spec.vision!)));
  if (spec.testing) files.push(proseFile(P_TESTING, existing.testing, () => renderTestingDoc(spec.testing!)));
  if (spec.subsystems && spec.subsystems.length) {
    const nextSubs = spec.subsystems;
    files.push(structuredFile(P_MANIFEST, existing.manifest, () => JSON.stringify(buildManifestFromSpec(nextSubs), null, 2) + '\n', (parsed) => mergeManifest(parsed, [...nextSubs].sort((a, b) => byStr(a.id, b.id)))));
  }
  const nextPS = buildProjectSkillsFromSpec(spec);
  files.push(structuredFile(P_PROJECT_SKILLS, existing.projectSkills, () => JSON.stringify(nextPS, null, 2) + '\n', (parsed) => mergeProjectSkills(parsed, (nextPS.roles ?? {}) as Record<string, string>, nextPS.extra ?? [])));
  if (spec.degradations) files.push(proseFile(P_DEGRADATIONS, existing.degradations ?? { exists: false }, renderDegradationsDoc));
  if (spec.guards) {
    const gOpts = typeof spec.guards === 'object' ? spec.guards : {};
    // Both create-if-absent: the config is the owner's to edit after scaffolding; the runner is regenerable
    // but never clobbered (a project may have patched it — treat like any owned file).
    files.push(proseFile(P_GUARDS_CONFIG, existing.guardsConfig ?? { exists: false }, () => renderGuardsConfig(gOpts)));
    files.push(proseFile(P_GUARDS_RUNNER, existing.guardsRunner ?? { exists: false }, renderGuardsRunner));
  }
  if (spec.gates) files.push(proseFile(P_GATES_DOC, existing.gatesDoc ?? { exists: false }, () => renderGatesDoc(target)));
  return { files: [...files].sort((a, b) => byStr(a.path, b.path)) };
}

/** Human preview of the scaffold plan. Deterministic. */
export function renderScaffoldPreview(result: ScaffoldResult): string {
  const icon = (a: ScaffoldFile['action']): string => (a === 'create' ? '✚ create' : a === 'augment' ? '✎ augment' : '· unchanged');
  const lines = ['feature-adr-setup — planned files (pass --apply to write; existing files are never clobbered):', ''];
  for (const f of result.files) lines.push(`  ${icon(f.action)}  ${f.path}${f.note ? `  — ${f.note}` : ''}`);
  return lines.join('\n');
}

// ── Thin I/O (top-level fs; never throws) ─────────────────────────────────────────────────────────────

/** Read one file as an ExistingFile — distinguishes ABSENT from EXISTS-BUT-UNREADABLE (cross-model QE). */
function readExistingFile(p: string): ExistingFile {
  let exists = false;
  try { exists = existsSync(p); } catch { return { exists: false }; }
  if (!exists) return { exists: false };
  try { return { exists: true, content: readFileSync(p, 'utf8') }; } catch { return { exists: true }; }
}

/** Scan the repo for the setup plan: what exists + discovered packages + a review corpus. Impure; never throws. */
export function scanForSetup(repoRoot: string): SetupScan {
  const has = (rel: string): boolean => { try { return existsSync(join(repoRoot, rel)); } catch { return false; } };
  let packages: string[] = [];
  let reviewCorpus = false;
  try { packages = scanWorkspacePackages(repoRoot).map((p) => p.name); } catch { /* none */ }
  try { reviewCorpus = findReviewArtifacts(repoRoot).length > 0; } catch { /* none */ }
  return {
    visionExists: has(P_VISION),
    manifestExists: has(P_MANIFEST),
    projectSkillsExists: has(P_PROJECT_SKILLS),
    testingExists: has(P_TESTING),
    packages,
    reviewCorpus,
  };
}

/** Read the existing files the scaffold needs to compare against. Impure; never throws. */
export function readExistingForScaffold(repoRoot: string): ExistingScaffoldFiles {
  return {
    vision: readExistingFile(join(repoRoot, P_VISION)),
    manifest: readExistingFile(join(repoRoot, P_MANIFEST)),
    projectSkills: readExistingFile(join(repoRoot, P_PROJECT_SKILLS)),
    testing: readExistingFile(join(repoRoot, P_TESTING)),
    degradations: readExistingFile(join(repoRoot, P_DEGRADATIONS)),
    guardsConfig: readExistingFile(join(repoRoot, P_GUARDS_CONFIG)),
    guardsRunner: readExistingFile(join(repoRoot, P_GUARDS_RUNNER)),
    gatesDoc: readExistingFile(join(repoRoot, P_GATES_DOC)),
  };
}
