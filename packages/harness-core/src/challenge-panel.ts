/**
 * Adversarial plan-gate — the challenge panel (feature challenge-panel-plan-gate, ADR-001).
 *
 * feature-adr's cross-model Codex QE (Step 8) bites AFTER the code is written. The most expensive mistakes
 * (overengineering, silent decisions, cemented degradations, test-theater, unrealistic scope) cement at the
 * PLAN stage. This module is the deterministic "cartridge": it assembles a WIDE context pack and emits a
 * fixed C1-C8 "break it, don't confirm it" brief + a verdict schema. The LLM "shot" — a FRESH adversary that
 * did NOT write the plan, plus a mandatory cross-validator — is fired by the `challenge-panel` SKILL.
 *
 * The set/brief/select/render functions are PURE + deterministic (sorted, no clock/random) so the same
 * context yields a byte-identical brief; the assemble helper does disk I/O with TOP-LEVEL node:fs imports
 * (harness-core is ESM — a lazy require() is undefined at runtime; the R1 footgun).
 *
 * SAFETY PROPERTIES (load-bearing, both named by the ADR and pinned by a test):
 *   1. (ADR §1) `pickAdversaryModel` returns a family DIFFERENT from the plan author — the panel is never
 *      the plan's own author (author bias). The врезка/skill honor this; the helper makes it testable.
 *   2. (ADR §2) `buildChallengeBrief` inlines the WIDE context (vision + testing + map + degradations +
 *      code hints when supplied) — narrow context = shallow findings (the archive's core lesson).
 *   3. (ADR §3) C1 is degradation-registry-aware: deviating from a REGISTERED accepted degradation is NOT a
 *      finding; and the gate is ADVISE — `confirmedVerdict` drops non-cross-validated P0/P1 (FP/theory),
 *      nothing here auto-aborts.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

/** Blob version stamp read by scripts/gen-loop-blobs.mjs (feature loop-designer, ADR-004) — the
 * ONLY loop-designer change to this canonical file; bump when any blob-exported semantic changes. */
export const CHALLENGE_PANEL_BLOB_VERSION = '1.0.0';

export type CId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8';
export type ChallengeSeverity = 'P0' | 'P1' | 'P2';
const SEV_RANK: Record<ChallengeSeverity, number> = { P0: 3, P1: 2, P2: 1 };
const VALID_CID = new Set<string>(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']);
const isValidSeverity = (s: unknown): s is ChallengeSeverity => s === 'P0' || s === 'P1' || s === 'P2';

export interface ChallengeQuestion {
  readonly id: CId;
  readonly title: string;
  readonly prompt: string;
}

/**
 * The fixed, DEPERSONALIZED owner-question set (FR-2). Frozen + generic — no product/vendor/section-number
 * hardcode. Each is phrased in "break it, don't confirm it" mode. C1 is degradation-registry-aware.
 */
export const CHALLENGE_QUESTIONS: readonly ChallengeQuestion[] = Object.freeze([
  Object.freeze({
    id: 'C1',
    title: 'Architecture anti-cement',
    prompt:
      'Does this plan cement a NEW bad pattern, a wrong boundary, or a shortcut that later work will be ' +
      'forced to copy? Check it against the product map + vision. IMPORTANT: deviating from a pattern that ' +
      'is REGISTERED in the accepted-degradations registry is NOT a finding — that debt is already owned. ' +
      'A genuinely new degradation the plan introduces → name it and propose it for the registry.',
  }),
  Object.freeze({
    id: 'C2',
    title: 'Production-ready',
    prompt:
      'Where would this fall over in production? Missing error handling, unhandled failure modes, ' +
      'resource leaks, missing observability, config/secret handling, migration/rollback. Name the ' +
      'concrete input or condition that breaks it, not a general worry.',
  }),
  Object.freeze({
    id: 'C3',
    title: 'Test sufficiency + honesty (both ways)',
    prompt:
      'Attack the test plan from BOTH sides. Under-testing: which claim — especially a safety property the ' +
      'ADR NAMES ("never X") — has no falsifying test? A test that cannot fail (a wrapper, a tautology, ' +
      'asserting the mock) is not coverage. Over-testing: which tests are theater — restating the ' +
      'implementation, testing the framework, brittle snapshots that verify nothing a user cares about?',
  }),
  Object.freeze({
    id: 'C4',
    title: 'Overengineering sweep',
    prompt:
      'What in this plan is built for a requirement nobody stated? Speculative generality, an abstraction ' +
      'with one caller, a config knob no one asked for, a plugin seam for a single case. For each: what is ' +
      'the simpler thing that meets the ACTUAL requirement?',
  }),
  Object.freeze({
    id: 'C5',
    title: 'Silent decisions',
    prompt:
      'Which load-bearing decisions did the plan make WITHOUT surfacing them as a decision? A default that ' +
      'is really a policy, a chosen tradeoff presented as the only option, a dependency added in passing. ' +
      'Each silent decision the owner did not get to refuse is a finding.',
  }),
  Object.freeze({
    id: 'C6',
    title: 'Runtime consistency',
    prompt:
      'Will this behave consistently with how the rest of the system already works — same error shape, ' +
      'same config source, same module/ESM conventions, same logging, same naming? Point to the specific ' +
      'existing convention the plan contradicts.',
  }),
  Object.freeze({
    id: 'C7',
    title: 'Scope',
    prompt:
      'Is the plan more than ~1.5× the size the request actually needs? If so, what is the concrete cut ' +
      'list — which files/steps/abstractions to drop to hit the real requirement — and what is genuinely ' +
      'load-bearing and must stay?',
  }),
  Object.freeze({
    id: 'C8',
    title: 'Executability',
    prompt:
      'Could an executor who is NOT the plan author complete every step without coming back to ask what was ' +
      'meant? Find the steps that are under-specified, assume unstated context, or hide a research task ' +
      'behind an imperative verb ("integrate X", "wire up Y") with no concrete how.',
  }),
]);

export interface ChallengeContext {
  readonly plan: string;
  readonly planPath: string;
  readonly vision?: string;
  readonly testing?: string;
  readonly map?: string;
  readonly degradations?: string;
  readonly codeHints?: string;
}

/** JSON Schema for the panel's verdict — the skill forces the adversary to emit exactly this shape. */
export const CHALLENGE_VERDICT_SCHEMA: object = Object.freeze({
  type: 'object',
  required: ['findings', 'summary'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['c', 'severity', 'title', 'why'],
        properties: {
          c: { type: 'string', enum: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'] },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2'] },
          title: { type: 'string' },
          why: { type: 'string', description: 'concrete failing input/condition, not a general worry' },
          where: { type: 'string', description: 'plan section / file:line if locatable' },
        },
      },
    },
    summary: { type: 'string' },
  },
});

export interface ChallengeFinding {
  readonly c: CId;
  readonly severity: ChallengeSeverity;
  readonly title: string;
  readonly why: string;
  readonly where?: string;
  readonly crossValidated?: boolean;
}

export interface Verdict {
  readonly findings: readonly ChallengeFinding[];
  readonly summary: string;
}

// Where architecture-layer calibration docs live (committed intent layer; inherits R1/R5 paths).
// Module-local — the canonical exported constants live in feature-adr-setup.ts / architecture.ts.
const CP_VISION = 'architecture/vision.md';
const CP_TESTING = 'architecture/testing.md';
const CP_MAP = 'architecture/map.json';
const CP_DEGRADATIONS = 'architecture/degradations.md';

const readIf = (p: string): string | undefined => {
  try {
    if (!existsSync(p)) return undefined;
    const t = readFileSync(p, 'utf8');
    return t.trim() === '' ? undefined : t;
  } catch {
    return undefined; // unreadable ⇒ run with less calibration, never error (FR-6)
  }
};

/**
 * Assemble the WIDE context pack (FR-1). Impure I/O; NEVER throws — a missing plan yields an empty `plan`
 * (the caller/CLI reports it), a missing calibration doc simply drops that field.
 */
export function assembleChallengeContext(repoRoot: string, planPath: string): ChallengeContext {
  // Path containment (QE #12): `--plan ../../etc/passwd` must NOT read outside the repo. Resolve and require
  // the plan to stay under repoRoot; an escaping path yields an empty plan (the caller reports "not found").
  const rootAbs = resolve(repoRoot);
  const absPlan = resolve(rootAbs, planPath);
  const plan = containedRead(rootAbs, absPlan) ?? '';
  return withCalibration({ plan, planPath }, repoRoot);
}

/**
 * Read a file ONLY if it stays under repoRoot both lexically AND after resolving symlinks (QE #12): a `..`
 * escape is blocked lexically, and a symlink inside the repo pointing OUT (e.g. `plan.md -> /etc/passwd`) is
 * blocked by re-checking the realpath of both the file and the root. Returns undefined on any escape/error.
 */
function containedRead(rootAbs: string, absPath: string): string | undefined {
  if (absPath !== rootAbs && !absPath.startsWith(rootAbs + sep)) return undefined; // lexical `..` escape
  if (!existsSync(absPath)) return undefined;
  let realFile: string;
  let realRoot: string;
  try {
    realFile = realpathSync(absPath);
    realRoot = realpathSync(rootAbs);
  } catch {
    return undefined; // broken/dangling symlink
  }
  if (realFile !== realRoot && !realFile.startsWith(realRoot + sep)) return undefined; // symlink escape
  return readIf(realFile);
}

// exactOptionalPropertyTypes: build the optional fields by conditional spread (never assign `undefined`).
// The calibration docs are containment-checked too (a symlinked `architecture/vision.md -> /etc/passwd` must
// not leak either) — same realpath guard as the plan.
function withCalibration(base: ChallengeContext, repoRoot: string): ChallengeContext {
  const rootAbs = resolve(repoRoot);
  const readDoc = (rel: string): string | undefined => containedRead(rootAbs, resolve(rootAbs, rel));
  const vision = readDoc(CP_VISION);
  const testing = readDoc(CP_TESTING);
  const map = readDoc(CP_MAP);
  const degradations = readDoc(CP_DEGRADATIONS);
  return {
    plan: base.plan,
    planPath: base.planPath,
    ...(vision === undefined ? {} : { vision }),
    ...(testing === undefined ? {} : { testing }),
    ...(map === undefined ? {} : { map }),
    ...(degradations === undefined ? {} : { degradations }),
    ...(base.codeHints === undefined ? {} : { codeHints: base.codeHints }),
  };
}

const HR = '─'.repeat(72);
const section = (title: string, body: string | undefined): string =>
  body === undefined ? `## ${title}\n(not provided — panel runs with less calibration)\n` : `## ${title}\n${body}\n`;

/**
 * PURE (FR-1/NFR-1): same context → byte-identical brief. Inlines the WIDE context (vision + testing + map +
 * degradations + code hints when present) so the adversary reasons over the whole product, not a slice
 * (ADR §2), and states the hard invariant + the "break it" mandate + the degradation-registry rule.
 */
export function buildChallengeBrief(ctx: ChallengeContext): string {
  const lines: string[] = [];
  lines.push('# CHALLENGE PANEL — adversarial plan-gate');
  lines.push('');
  lines.push(
    'You are a FRESH adversarial reviewer. You did NOT write this plan. Your job is to BREAK it, not to ' +
      'confirm it — find the concrete way each answer fails, or state plainly that you could not. A finding ' +
      'is a specific failing input/condition/omission, never a general worry. Every P0/P1 you raise will be ' +
      'independently cross-validated, so do not pad — theory that cannot be reproduced will be dropped.',
  );
  lines.push('');
  lines.push(HR);
  lines.push(section('PLAN UNDER REVIEW (' + ctx.planPath + ')', ctx.plan === '' ? undefined : ctx.plan));
  lines.push(section('PRODUCT VISION (boundaries + principles)', ctx.vision));
  lines.push(section('TESTING POLICY (what "done" + honest tests mean here)', ctx.testing));
  lines.push(section('PRODUCT MAP (subsystems + existing conventions)', ctx.map));
  lines.push(section('ACCEPTED-DEGRADATIONS REGISTRY (deviating from THESE is NOT a finding)', ctx.degradations));
  lines.push(section('CODE HINTS', ctx.codeHints));
  lines.push(HR);
  lines.push('');
  lines.push('## Ask each question in "break it, don\'t confirm it" mode');
  for (const q of CHALLENGE_QUESTIONS) {
    lines.push('');
    lines.push(`### ${q.id} — ${q.title}`);
    lines.push(q.prompt);
  }
  lines.push('');
  lines.push(HR);
  lines.push('## Output');
  lines.push(
    'Return findings tagged by C-number with severity P0 (would ship a serious defect / cements bad ' +
      'architecture), P1 (real gap, fix before code), or P2 (worth noting). For each: a concrete `why` ' +
      '(the failing input/condition) and `where` if locatable. Then a one-paragraph `summary`. This gate ' +
      'ADVISES — it does not block; the owner decides.',
  );
  lines.push('');
  lines.push('Verdict JSON schema: ' + JSON.stringify(CHALLENGE_VERDICT_SCHEMA));
  return lines.join('\n');
}

/**
 * Sanitize ONE raw finding (QE #10): reject anything whose `c`/`severity` is not a known enum value or
 * whose required strings are missing — an out-of-enum finding NEVER survives to render/gate. Returns null
 * for a bad finding so the caller drops it.
 */
export function sanitizeFinding(raw: unknown): ChallengeFinding | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.c !== 'string' || !VALID_CID.has(r.c)) return null; // typeof-guard: a hostile {toString:null} must NOT throw
  if (!isValidSeverity(r.severity)) return null;
  if (typeof r.title !== 'string' || r.title === '') return null;
  if (typeof r.why !== 'string' || r.why === '') return null;
  const out: ChallengeFinding = { c: r.c as CId, severity: r.severity, title: r.title, why: r.why };
  return typeof r.where === 'string' && r.where !== '' ? { ...out, where: r.where } : out;
}

/**
 * Validate a raw adversary payload into a Verdict (QE #7): a value without a `findings` ARRAY is NOT a
 * verdict (returns null → the caller falls back LOUDLY, never a fake-clean empty verdict). Bad individual
 * findings are dropped via sanitizeFinding; `summary` defaults to '' but the shape must be right.
 */
export function sanitizeVerdict(raw: unknown): Verdict | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.findings)) return null;
  const findings = r.findings.map(sanitizeFinding).filter((f): f is ChallengeFinding => f !== null);
  return { findings, summary: typeof r.summary === 'string' ? r.summary : '' };
}

/** The P0/P1 findings that MUST be cross-validated before reaching the owner (FR-5). Sorted, deterministic. */
export function findingsNeedingCrossValidation(v: Verdict): ChallengeFinding[] {
  return [...v.findings]
    .filter((f) => f.severity === 'P0' || f.severity === 'P1')
    .sort(cmpFinding);
}

function cmpFinding(a: ChallengeFinding, b: ChallengeFinding): number {
  const s = SEV_RANK[b.severity] - SEV_RANK[a.severity];
  if (s !== 0) return s;
  if (a.c !== b.c) return a.c < b.c ? -1 : 1;
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
}

/**
 * Drop non-cross-validated P0/P1 (FP/theory) — the anti-noise / advise-not-block property (ADR §3, FR-5).
 * POSITIONAL, collision-free (QE #5/#6): `realFlags[i]` aligns to `findingsNeedingCrossValidation(v)[i]` —
 * matching by INDEX, never by title, so two findings sharing a title can never cross-contaminate. A P0/P1
 * survives ONLY when its flag is explicitly `true` (a missing/`false`/`undefined` flag ⇒ dropped — the
 * anti-noise default: not-validated is treated as refuted). P2 pass through untouched. Deterministic sort.
 */
export function confirmedVerdict(v: Verdict, realFlags: readonly boolean[]): Verdict {
  const need = findingsNeedingCrossValidation(v);
  const kept: ChallengeFinding[] = v.findings.filter((f) => f.severity === 'P2');
  need.forEach((f, i) => {
    if (realFlags[i] === true) kept.push({ ...f, crossValidated: true });
  });
  kept.sort(cmpFinding);
  return { findings: kept, summary: v.summary };
}

/** Human surface, grouped by severity (FR-3). ADVISE — never an abort. PURE. */
export function renderVerdict(v: Verdict): string {
  if (v.findings.length === 0) {
    return `Challenge panel: no cross-validated findings. ${v.summary}`.trim();
  }
  const byId = (s: ChallengeSeverity): ChallengeFinding[] => v.findings.filter((f) => f.severity === s).sort(cmpFinding);
  const out: string[] = ['Challenge panel verdict (advisory — you decide):', ''];
  for (const sev of ['P0', 'P1', 'P2'] as const) {
    const group = byId(sev);
    if (group.length === 0) continue;
    out.push(`### ${sev} (${group.length})`);
    for (const f of group) {
      const cv = f.crossValidated ? ' ✓cross-validated' : '';
      const where = f.where ? ` [${f.where}]` : '';
      out.push(`- ${f.c} ${f.title}${where}${cv}`);
      out.push(`  why: ${f.why}`);
    }
    out.push('');
  }
  out.push(v.summary);
  return out.join('\n').trim();
}

/**
 * HARD INVARIANT (ADR §1, FR-4): pick an adversary model family DIFFERENT from the plan author's, so the
 * panel is never the plan's own author (author bias). Claude author → Codex adversary; Codex author →
 * a fresh Claude adversary. PURE — the врезка/skill call this and dispatch accordingly.
 */
export function pickAdversaryModel(plannerModel: string): { model: string; note: string } {
  const fam = classifyModelFamily(plannerModel);
  if (fam === 'claude') return { model: 'codex', note: `plan authored on ${plannerModel} (Claude) → Codex adversary (cross-family)` };
  if (fam === 'openai') return { model: 'claude', note: `plan authored on ${plannerModel} (OpenAI/Codex) → fresh Claude adversary (cross-family)` };
  // Unknown author family: default to a Claude adversary but say so — verify it is genuinely NOT the author's family.
  return { model: 'claude', note: `plan author family UNKNOWN (${plannerModel}) → Claude adversary by default; verify it is cross-family before trusting the verdict` };
}

/** Normalize a model id to a coarse family for the panel-≠-author invariant. */
export function classifyModelFamily(model: string): 'claude' | 'openai' | 'unknown' {
  const m = String(model).toLowerCase();
  if (/claude|opus|sonnet|haiku|fable/.test(m)) return 'claude';
  if (/codex|gpt|openai|\bo[1-9]\b/.test(m)) return 'openai';
  return 'unknown';
}
