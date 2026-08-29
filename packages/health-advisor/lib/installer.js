'use strict';

const fs = require('fs');
const path = require('path');

// ── Base Skills (core Health Advisor system) ────────────────────
const BASE_SKILLS = [
  { name: 'health-advisor',          type: 'base', category: 'core',    desc: 'Main orchestrator — entry point for all modules' },
  { name: 'health-advisor-research', type: 'base', category: 'core',    desc: 'Research protocol with paranoid mode (PubMed verification)' },
  { name: 'module-00-intake',        type: 'base', category: 'module',  desc: 'Upload and recognize blood tests, documents' },
  { name: 'module-01-profile',       type: 'base', category: 'module',  desc: 'Profile analysis, syndromes, risks identification' },
  { name: 'module-02-medications',   type: 'base', category: 'module',  desc: 'Drug research, alternatives, availability' },
  { name: 'module-03-doctors',       type: 'base', category: 'module',  desc: 'Find doctors by specialty, city, ratings' },
  { name: 'module-04-appointment',   type: 'base', category: 'module',  desc: 'Appointment preparation, additional tests' },
  { name: 'module-05-exercise',      type: 'base', category: 'module',  desc: 'Personalized exercise program' },
  { name: 'module-06-nutrition',     type: 'base', category: 'module',  desc: 'Product-by-product nutrition analysis' },
  { name: 'module-07-special',       type: 'base', category: 'module',  desc: 'Special practices (fasting, supplements)' },
  { name: 'module-08-monitoring',    type: 'base', category: 'module',  desc: 'Monitoring plan and follow-up schedule' },
  { name: 'system-prompt',           type: 'base', category: 'prompt',  desc: 'Main system prompt for the advisor' },
  { name: 'researcher',              type: 'base', category: 'prompt',  desc: 'Research agent prompt (paranoid mode)' },
  { name: 'analyst-manual-full',     type: 'base', category: 'skill',   desc: 'Composite orchestrator with checkpoints (explore→research→solve)' },
  { name: 'explore',                 type: 'base', category: 'skill',   desc: 'Task clarification and brief generation' },
  { name: 'goap-research-ed25519',   type: 'base', category: 'skill',   desc: 'GOAP research with Ed25519 cryptographic verification' },
  { name: 'problem-solver-enhanced', type: 'base', category: 'skill',   desc: 'Structured problem solving with action plans' },
  { name: 'references',              type: 'base', category: 'reference', desc: 'Emergency thresholds, evidence levels, trusted issuers' },
  { name: 'assets',                  type: 'base', category: 'reference', desc: 'HTML renderer asset (md → html)' },
  { name: 'formats',                 type: 'base', category: 'reference', desc: 'Patient-facing output formats' },
];

// File mapping for base skills (name → actual file path relative to project root)
const BASE_FILES = {
  'health-advisor':          { src: 'skills/health-advisor.md' },
  'health-advisor-research': { src: 'skills/health-advisor-research.md' },
  'module-00-intake':        { src: 'modules/00-intake.md' },
  'module-01-profile':       { src: 'modules/01-profile.md' },
  'module-02-medications':   { src: 'modules/02-medications.md' },
  'module-03-doctors':       { src: 'modules/03-doctors.md' },
  'module-04-appointment':   { src: 'modules/04-appointment.md' },
  'module-05-exercise':      { src: 'modules/05-exercise.md' },
  'module-06-nutrition':     { src: 'modules/06-nutrition.md' },
  'module-07-special':       { src: 'modules/07-special.md' },
  'module-08-monitoring':    { src: 'modules/08-monitoring.md' },
  'system-prompt':           { src: 'prompts/system-prompt.md' },
  'researcher':              { src: 'prompts/researcher.md' },
  'analyst-manual-full':     { src: 'skills/base/analyst-manual-full/', dir: true },
  'explore':                 { src: 'skills/base/explore/', dir: true },
  'goap-research-ed25519':   { src: 'skills/base/goap-research-ed25519/', dir: true },
  'problem-solver-enhanced': { src: 'skills/base/problem-solver-enhanced/', dir: true },
  'references':              { src: 'skills/references/', dir: true },
  'assets':                  { src: 'assets/', dir: true },
  'formats':                 { src: 'formats/', dir: true },
};

// ── Extended-skill METADATA (from OpenClaw Medical Skills) ─────
// NOT the skill set: this is a lookup table keyed by directory name. The SET is `SKILLS`, read off
// the disk by discoverSkills(). Keeping a hand-written array as the set is exactly the defect this
// feature closes — two directories were shipped and neither installed, validated nor listed.
const EXTENDED_SKILL_META = [
  { name: 'emergency-card',                    tier: 3, score: 9.3, lang: 'RU', desc: 'Emergency medical card generator' },
  { name: 'clinpgx',                           tier: 3, score: 9.1, lang: 'EN', desc: 'Pharmacogenomics via ClinPGx API' },
  { name: 'clinicaltrials-database',           tier: 3, score: 9.0, lang: 'EN', desc: 'ClinicalTrials.gov API v2 query tool' },
  { name: 'clinical-diagnostic-reasoning',     tier: 3, score: 9.0, lang: 'EN', desc: 'Cognitive bias detection in diagnostics' },
  { name: 'tooluniverse-drug-research',        tier: 3, score: 8.8, lang: 'EN', desc: 'Comprehensive drug research reports' },
  { name: 'pubmed-search',                     tier: 2, score: 8.8, lang: 'EN', desc: 'PubMed scientific literature search' },
  { name: 'multi-search-engine',               tier: 2, score: 8.8, lang: 'EN', desc: 'Multi search engine (17 engines + medical DBs)' },
  { name: 'fitness-analyzer',                  tier: 2, score: 8.7, lang: 'RU', desc: 'Physical activity analysis and training recommendations' },
  { name: 'rehabilitation-analyzer',           tier: 2, score: 8.5, lang: 'RU', desc: 'Rehabilitation progress tracking and analysis' },
  { name: 'deep-research',                     tier: 2, score: 8.5, lang: 'EN', desc: 'Autonomous multi-step deep research' },
  { name: 'medical-entity-extractor',          tier: 2, score: 8.5, lang: 'EN', desc: 'Extract medical entities from patient messages' },
  { name: 'drug-interaction-checker',          tier: 2, score: 8.4, lang: 'EN', desc: 'Drug-drug interaction safety checker' },
  { name: 'weightloss-analyzer',               tier: 2, score: 8.4, lang: 'RU', desc: 'Weight loss tracking and metabolic calculations' },
  { name: 'clinical-decision-support',         tier: 2, score: 8.3, lang: 'EN', desc: 'Clinical decision support document generation' },
  { name: 'patiently-ai',                      tier: 2, score: 8.0, lang: 'EN', desc: 'Medical document simplification for patients' },
  { name: 'nutrition-analyzer',                tier: 2, score: 7.9, lang: 'RU', desc: 'Nutrition analysis and dietary recommendations' },
  { name: 'health-trend-analyzer',             tier: 2, score: 7.9, lang: 'RU', desc: 'Multi-dimensional health trend analysis' },
  { name: 'sleep-analyzer',                    tier: 2, score: 7.9, lang: 'RU', desc: 'Sleep quality analysis and recommendations' },
  { name: 'tooluniverse-drug-drug-interaction',tier: 2, score: 7.7, lang: 'EN', desc: 'Drug-drug interaction prediction and risk assessment' },
  { name: 'lab-results',                       tier: 2, score: 7.5, lang: 'EN', desc: 'Lab results analysis and interpretation' },
  { name: 'clinical-nlp-extractor',            tier: 2, score: 7.5, lang: 'EN', desc: 'Medical entity extraction from clinical text' },
  { name: 'clinical-targets',                  tier: 3, score: 9.0, lang: 'RU', desc: 'Клинические цели отдельно от лабораторных референсов' },
  // First-party, never BTO-scored — `score: 0.0` is a recorded placeholder, not an invented number.
  { name: 'preanalytical-guard',               tier: 3, score: 0.0, lang: 'EN', desc: 'Pre-analytical guard — checks what distorts a lab value before it is interpreted' },
  { name: 'case-state',                        tier: 3, score: 0.0, lang: 'RU', desc: 'Профиль как обязательный вход, реестр фактов с TTL и журнал открытых вопросов' },
  { name: 'critical-appraisal',                tier: 3, score: 9.0, lang: 'EN', desc: 'Deterministic transparency checks on a study (retraction, registration, registry record changes)' },
];

/**
 * The SET of skills is the DISK; the table above is metadata (ADR-001).
 *
 * It used to be the other way round, and the table drifted: MEASURED 2026-08-21 — 25 rows against 27
 * directories, missing `intake-archive` and `third-brain`. That one array was simultaneously the
 * install list, the validation list and the banner count, so those two skills were not installed by
 * `ha init`, answered "unknown skill" to `ha install`, were hidden by `ha list`, and — worst —
 * `validateSkills` iterates the same array, making the validator STRUCTURALLY incapable of ever
 * warning about them. The two newest, least-reviewed skills were the two the quality gate could not
 * see, and they are among the three missing their required sections.
 *
 * A row here without a directory is IGNORED: metadata must never resurrect a deleted skill. A
 * directory without a row still installs, with defaults — the disk is the contract.
 */
const SKILL_META = new Map(EXTENDED_SKILL_META.map(s => [s.name, s]));

/**
 * Skills that ship as documentation but CANNOT be installed standalone: their engine reaches outside
 * its own directory (`../../case-state/…`, `../../../lib/…`) and `installFlat` copies a skill
 * directory ALONE, so the copy would install a broken require and surface later as a mysterious bug.
 *
 * This map is a DECLARATION, and the declaration is not trusted: `test/install-parity.test.mjs`
 * installs everything and `require()`s every shipped module, asserting BOTH directions — every skill
 * named here really does break, and every skill NOT named here really does load. So the list cannot
 * rot in either direction, and it cannot be checked by grepping for `require('../../` either: the
 * one such string in case-state sits in a COMMENT, and a grep-based rule would exclude a healthy
 * skill (MEASURED — skills/case-state/engine/source-anchor.js:15).
 */
const NON_STANDALONE = new Map([
  ['third-brain', 'engine requires ../../../lib/source-anchor-store.js, not copied by installFlat'],
  ['intake-archive', 'engine requires ../../case-state/engine/lock.js and ../../../lib/, not copied'],
]);

function discoverSkills() {
  const order = new Map(EXTENDED_SKILL_META.map((s, i) => [s.name, i]));
  let entries;
  try {
    entries = fs.readdirSync(getSkillsDir(), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(e => e.isDirectory() && fs.existsSync(path.join(getSkillsDir(), e.name, 'SKILL.md')))
    .filter(e => !NON_STANDALONE.has(e.name))
    .map(e => SKILL_META.get(e.name) ?? { name: e.name, tier: 3, score: null, lang: null, desc: '' })
    // Preserve the CURATED order of the metadata table — `ha list` shows the skills in it, and an
    // alphabetical re-sort would silently reorder a published listing. A skill with no metadata row
    // has no curated position, so it goes after the curated ones, alphabetically among themselves.
    .sort((a, b) => {
      const ia = order.has(a.name) ? order.get(a.name) : Number.MAX_SAFE_INTEGER;
      const ib = order.has(b.name) ? order.get(b.name) : Number.MAX_SAFE_INTEGER;
      return ia !== ib ? ia - ib : a.name.localeCompare(b.name);
    });
}

// Combined for backward compat — now derived, so a skill added by dropping a directory just works.
const SKILLS = discoverSkills();

// ANSI color codes
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
};

function getSkillsList() {
  return SKILLS;
}

function getSkillsDir() {
  return path.join(__dirname, '..', 'skills');
}

function getBaseDir() {
  return path.join(__dirname, '..', 'base');
}

function getPackageVersion() {
  try {
    return require('../package.json').version;
  } catch {
    return '0.0.0';
  }
}

// ── Option B: flat prefixed bare skills ─────────────────────────────
// EMPIRICALLY VERIFIED (CC 2.1.218, live `claude -p` probe): Claude Code auto-registers ONLY bare
// skills at `.claude/skills/<name>/SKILL.md` one level deep. A `.claude/skills/<name>/.claude-plugin/
// plugin.json` "skills-directory plugin" does NOT register — plugins register solely via the
// marketplace (`~/.claude/plugins/installed_plugins.json`). So `init` emits bare, PREFIX-namespaced
// skills that register with no marketplace and on any CC version:
//
//   .claude/skills/health-advisor/SKILL.md              → /health-advisor           (master)
//   .claude/skills/health-advisor/{modules,prompts,base,references}/…   resources, 2+ levels deep,
//                                                                        NOT scanned → NOT registered
//   .claude/skills/health-advisor-<name>/SKILL.md       → /health-advisor-<name>    (each extended)
//
// The `health-advisor-` prefix namespaces the extended skills (collision-proof vs bare explore/
// deep-research/…); the master's base deps live UNDER its own dir so they never register.

const MASTER_SKILL_ID = 'health-advisor';
const EXT_PREFIX = 'health-advisor-';

// Master skill + its bundled resources, co-located INSIDE the master's own skill dir (masterDir)
// so the master's own relative refs resolve and none of these register (they sit 2+ levels deep).
// `src` is relative to getBaseDir(); `dest` is relative to masterDir.
const MASTER_RESOURCES = [
  { src: 'skills/health-advisor.md',            dest: 'SKILL.md',                        file: true },
  { src: 'skills/health-advisor-research.md',   dest: 'health-advisor-research.md',      file: true },
  { src: 'skills/base/analyst-manual-full',     dest: 'base/analyst-manual-full',        dir: true },
  { src: 'skills/base/explore',                 dest: 'base/explore',                    dir: true },
  { src: 'skills/base/goap-research-ed25519',   dest: 'base/goap-research-ed25519',      dir: true },
  { src: 'skills/base/problem-solver-enhanced', dest: 'base/problem-solver-enhanced',    dir: true },
  { src: 'skills/references',                   dest: 'references',                      dir: true },
  { src: 'modules',                             dest: 'modules',                         dir: true },
  { src: 'prompts',                             dest: 'prompts',                         dir: true },
  // AM-1 (§3.1 correction): MASTER_RESOURCES is the LOAD-BEARING list — installFlat/init copies
  // ONLY this. A BASE_SKILLS/BASE_FILES entry alone ships NOTHING (installBase is never called by
  // init). assets/ and formats/ land two levels deep → resources, never registered skills.
  { src: 'assets',                              dest: 'assets',                          dir: true },
  { src: 'formats',                             dest: 'formats',                         dir: true },
];

// Install flat, prefixed bare skills. `masterDir` is the master's skill dir
// (`.claude/skills/health-advisor`); extended skills install as its SIBLINGS
// (`.claude/skills/health-advisor-<name>`). `doBase`/`doExtended` mirror the `--base`/`--extended`
// flags. Returns { registered: [invocable names], failed: [], masterInstalled }.
function installFlat(masterDir, opts = {}) {
  const { doBase = true, doExtended = true } = opts;
  const baseDir = getBaseDir();
  const skillsRoot = path.dirname(masterDir); // .claude/skills
  const results = { registered: [], failed: [], masterInstalled: false };

  // 1) Master skill + co-located resources → masterDir/.
  if (doBase) {
    fs.mkdirSync(masterDir, { recursive: true });
    for (const r of MASTER_RESOURCES) {
      const srcPath = path.join(baseDir, r.src);
      const destPath = path.join(masterDir, r.dest);
      if (!fs.existsSync(srcPath)) {
        results.failed.push({ name: r.src, error: `Not found: ${r.src}` });
        continue;
      }
      try {
        if (r.dir) {
          copyDirRecursive(srcPath, destPath);
        } else {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(srcPath, destPath);
        }
      } catch (err) {
        results.failed.push({ name: r.src, error: err.message });
      }
    }
    if (fs.existsSync(path.join(masterDir, 'SKILL.md'))) {
      results.registered.push(MASTER_SKILL_ID);
      results.masterInstalled = true;
    } else {
      results.failed.push({ name: MASTER_SKILL_ID, error: 'master SKILL.md not written' });
    }
  }

  // 2) Extended skills → skillsRoot/health-advisor-<name>/ (bare, prefixed, one level deep).
  if (doExtended) {
    for (const skill of SKILLS) {
      const srcDir = path.join(getSkillsDir(), skill.name);
      const destDir = path.join(skillsRoot, EXT_PREFIX + skill.name);
      if (!fs.existsSync(path.join(srcDir, 'SKILL.md'))) {
        results.failed.push({ name: skill.name, error: `Skill SKILL.md not found: ${skill.name}` });
        continue;
      }
      try {
        copyDirRecursive(srcDir, destDir);
        results.registered.push(EXT_PREFIX + skill.name);
      } catch (err) {
        results.failed.push({ name: skill.name, error: err.message });
      }
    }
  }

  return results;
}

function installBase(targetDir) {
  const baseDir = getBaseDir();
  fs.mkdirSync(targetDir, { recursive: true });

  const results = { installed: [], failed: [] };
  for (const skill of BASE_SKILLS) {
    const mapping = BASE_FILES[skill.name];
    if (!mapping) continue;

    const srcPath = path.join(baseDir, mapping.src);
    if (!fs.existsSync(srcPath)) {
      results.failed.push({ name: skill.name, error: `Not found: ${mapping.src}` });
      continue;
    }

    try {
      if (mapping.dir) {
        // Copy entire directory (for base skills with references/scripts)
        const destPath = path.join(targetDir, mapping.src);
        copyDirRecursive(srcPath, destPath);
      } else {
        // Copy single file
        const destFile = path.join(targetDir, mapping.src);
        const destDir = path.dirname(destFile);
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(srcPath, destFile);
      }
      results.installed.push(skill.name);
    } catch (err) {
      results.failed.push({ name: skill.name, error: err.message });
    }
  }
  return results;
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory not found: ${src}`);
  }
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.name === '__pycache__') continue;

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Install ONE extended skill in the SAME flat, prefixed layout `installFlat` uses (Option B).
// `masterDir` is the master's skill dir (`.claude/skills/health-advisor`) — exactly the argument
// `installFlat`/`init` take — and the skill lands as its SIBLING at
// `.claude/skills/health-advisor-<name>/SKILL.md`, one level deep, so it actually REGISTERS.
//
// It previously wrote `<masterDir>/<name>/SKILL.md` — the dead 1.2.0 nested layout, two levels deep,
// which the loader never scans (MEASURED — reproducer: `install clinpgx` into a fresh dir then
// `dz skills-verify --dir . --static` → `0 registrable`, `[no-skill-md]` + `[buried-skill-md]`,
// exit 1, while the command itself exited 0 and printed success).
function installSkill(skillName, masterDir) {
  const skill = SKILLS.find(s => s.name === skillName);
  if (!skill) {
    return { success: false, error: `Unknown skill: ${skillName}` };
  }

  const srcDir = path.join(getSkillsDir(), skillName);
  if (!fs.existsSync(path.join(srcDir, 'SKILL.md'))) {
    return { success: false, error: `Skill SKILL.md not found: ${srcDir}` };
  }

  const skillsRoot = path.dirname(masterDir); // .claude/skills
  const registeredName = EXT_PREFIX + skillName;
  const destDir = path.join(skillsRoot, registeredName);
  try {
    copyDirRecursive(srcDir, destDir);
    return { success: true, skill, destDir, registeredName };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Install every extended skill flat + prefixed (no master). Same layout as `installFlat`'s
// `doExtended` half; kept for backward compat with the `{ installed, failed }` shape.
function installAll(masterDir) {
  fs.mkdirSync(path.dirname(masterDir), { recursive: true });

  const results = { installed: [], failed: [] };
  for (const skill of SKILLS) {
    const result = installSkill(skill.name, masterDir);
    if (result.success) {
      results.installed.push(result.registeredName);
    } else {
      results.failed.push({ name: skill.name, error: result.error });
    }
  }
  return results;
}

// What is ACTUALLY installed under a `.claude/skills` root, for the three install modes the CLI
// itself offers (`init`, `init --base`, `init --extended`) plus a single `install <skill>`.
// `validate` used to demand the master unconditionally and so failed after a legitimate
// `init --extended` (21 valid registrable skills, verdict "not installed here", exit 1).
/**
 * What is installed, in EITHER layout (ADR-002).
 *
 * `ha init` writes `health-advisor-<id>/`; `dz install` writes bare `<id>/`. This knew only the
 * prefixed shape, so a `dz`-installed tree read as NOT INSTALLED and `ha validate` advised an `init`
 * that lays a second copy beside the first — the model then sees both. Measured on a real project
 * 2026-08-21 and reported as the blocking defect.
 *
 * A skill found in BOTH shapes is a DUPLICATE, reported once and named: counting it twice would
 * inflate what the user believes they have.
 */
function detectInstall(skillsRoot) {
  const masterDir = path.join(skillsRoot, MASTER_SKILL_ID);
  const masterInstalled = fs.existsSync(path.join(masterDir, 'SKILL.md'));
  const hasSkill = (dir) => fs.existsSync(path.join(skillsRoot, dir, 'SKILL.md'));
  const layouts = new Map();
  for (const s of SKILLS) {
    const prefixed = hasSkill(EXT_PREFIX + s.name);
    // the bare directory must not be the master itself, or the master would be double-counted as a
    // worker on every prefixed installation
    const bare = s.name !== MASTER_SKILL_ID && hasSkill(s.name);
    if (prefixed || bare) layouts.set(s.name, prefixed && bare ? 'both' : prefixed ? 'prefixed' : 'bare');
  }
  const extendedInstalled = [...layouts.keys()];
  const duplicated = [...layouts.entries()].filter(([, v]) => v === 'both').map(([k]) => k);
  const bareOnly = [...layouts.entries()].filter(([, v]) => v === 'bare').map(([k]) => k);
  return {
    masterDir,
    masterInstalled,
    extendedInstalled,
    layouts,
    duplicated,
    bareOnly,
    // A worker-only tree is what `dz install` leaves: 27 workers and no orchestrator. Saying
    // "installed" for it would trade one silence for another, so the caller is told explicitly.
    masterMissing: !masterInstalled && extendedInstalled.length > 0,
    anythingInstalled: masterInstalled || extendedInstalled.length > 0,
    // A master WITH extended skills is a full `init` — a missing extended dir is then a real
    // breakage and stays a FAIL. Base-only / extended-only / single-skill installs must not be
    // failed for the skills the user never asked for.
    expectAllExtended: masterInstalled && extendedInstalled.length > 0,
  };
}

// Validate what is installed under `skillsRoot` (the `.claude/skills` root). The master registers at
// `<skillsRoot>/health-advisor/SKILL.md`, each extended as a bare prefixed sibling
// `<skillsRoot>/health-advisor-<name>/SKILL.md` (Option B).
// Returns `{ pass, warn, fail, skipped }`; `skipped` = extended skills that are simply not installed
// in this (base-only / partial) install and are reported informationally, never as a failure.
function validateSkills(skillsRoot) {
  const results = { pass: [], warn: [], fail: [], skipped: [] };
  const state = detectInstall(skillsRoot);

  // The master is a registrable skill too — it used to get no PASS/FAIL line at all, so a full
  // install reported "Total skills: 21" for 22 installed skills.
  const targets = [];
  if (state.masterInstalled) {
    targets.push({ name: MASTER_SKILL_ID, dir: state.masterDir, master: true });
  }
  for (const skill of SKILLS) {
    // Resolve through the layout detectInstall actually FOUND. Looking only under the prefixed name
    // made a bare install — what `dz install` writes — validate as 25 failures INCLUDING the skills
    // that were installed (MEASURED: master + one bare worker → pass 0 / fail 25).
    const layout = state.layouts?.get(skill.name);
    const prefixedDir = path.join(skillsRoot, EXT_PREFIX + skill.name);
    const dir = layout === 'bare' ? path.join(skillsRoot, skill.name) : prefixedDir;
    if (fs.existsSync(dir)) {
      targets.push({ name: skill.name, dir, master: false });
    } else if (state.expectAllExtended) {
      results.fail.push({ name: skill.name, reason: 'Directory not found' });
    } else {
      results.skipped.push({ name: skill.name, reason: 'Not installed' });
    }
  }

  for (const target of targets) {
    const dir = target.dir;
    const file = path.join(dir, 'SKILL.md');

    if (!fs.existsSync(file)) {
      results.fail.push({ name: target.name, reason: 'SKILL.md not found' });
      continue;
    }

    const content = fs.readFileSync(file, 'utf-8');
    const size = Buffer.byteLength(content, 'utf-8');
    const issues = [];

    // Check size
    if (size < 2000) {
      issues.push(`SKILL.md too small (${size} bytes, min 2000)`);
    }
    if (size > 51200) {
      issues.push(`SKILL.md too large (${size} bytes, max 50KB)`);
    }

    // Check required sections (English or Russian)
    if (!/^## (Overview|Обзор)/m.test(content)) {
      issues.push('Missing ## Overview / ## Обзор');
    }
    if (!/^## (Anti-Patterns|Анти-паттерны|Антипаттерны)/m.test(content)) {
      issues.push('Missing ## Anti-Patterns / ## Анти-паттерны');
    }
    if (!/^## (Dependencies|Зависимости)/m.test(content)) {
      issues.push('Missing ## Dependencies / ## Зависимости');
    }

    // Check balanced code blocks
    const fenceCount = (content.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) {
      issues.push(`Unbalanced code blocks (${fenceCount} fences)`);
    }

    // Check trailing whitespace
    const wsCount = content.split('\n').filter(line => /\s+$/.test(line)).length;
    if (wsCount > 0) {
      issues.push(`${wsCount} lines with trailing whitespace`);
    }

    // Check directory size. The MASTER is exempt: it deliberately co-locates modules, prompts,
    // references and base deps under its own dir (that co-location is what keeps them from
    // registering), so the 200KB per-skill budget does not apply to it.
    if (!target.master) {
      let dirSize = 0;
      try {
        dirSize = getDirSize(dir);
        if (dirSize > 204800) {
          issues.push(`Directory too large (${Math.round(dirSize / 1024)}KB, max 200KB)`);
        }
      } catch (e) {
        // ignore size check errors
      }
    }

    if (issues.length === 0) {
      results.pass.push({ name: target.name, size, master: target.master });
    } else {
      results.warn.push({ name: target.name, size, issues, master: target.master });
    }
  }

  return results;
}

function getDirSize(dirPath) {
  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(fullPath);
    } else {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}

function tierLabel(tier) {
  switch (tier) {
    case 3: return `${C.green}T3${C.reset}`;
    case 2: return `${C.yellow}T2${C.reset}`;
    case 1: return `${C.dim}T1${C.reset}`;
    default: return `T${tier}`;
  }
}

// Banner lines. Counts are COMPUTED from the lists so the banner can never contradict `list`
// (it hard-coded "17 Base" while `list` printed and enumerated 18) and the box is sized from the
// real string lengths so the border always closes (it was hard-coded and overflowed ~2 chars).
function bannerLines(version) {
  return [
    `Health Advisor v${version}`,
    `${BASE_SKILLS.length} Base + ${SKILLS.length} Extended Medical Skills`,
  ];
}

function bannerBox(version) {
  const lines = bannerLines(version);
  const pad = 5; // left gutter inside the box
  const inner = Math.max(...lines.map(l => l.length)) + pad * 2;
  const out = [`╔${'═'.repeat(inner)}╗`];
  for (const line of lines) {
    out.push(`║${' '.repeat(pad)}${line}${' '.repeat(inner - pad - line.length)}║`);
  }
  out.push(`╚${'═'.repeat(inner)}╝`);
  return out;
}

function printBanner(version) {
  console.log('');
  for (const line of bannerBox(version)) {
    console.log(`${C.cyan}${C.bold}  ${line}${C.reset}`);
  }
  console.log('');
}

module.exports = {
  SKILLS,
  BASE_SKILLS,
  // the historical export name — bound to the DERIVED set, never to the metadata table
  EXTENDED_SKILLS: SKILLS,
  NON_STANDALONE,
  discoverSkills,
  BASE_FILES,
  C,
  getSkillsList,
  getSkillsDir,
  getBaseDir,
  getPackageVersion,
  MASTER_SKILL_ID,
  EXT_PREFIX,
  MASTER_RESOURCES,
  installFlat,
  installSkill,
  installAll,
  installBase,
  detectInstall,
  validateSkills,
  tierLabel,
  bannerLines,
  bannerBox,
  printBanner,
};
