'use strict';

// lib/render.js — trusted template resolution + the `render` CLI adapter (ADR-001 C2, ADR-004).
//
// SECURITY INVARIANT (ADR-004 / AM-6 — load-bearing, tested):
//   The template is not data — it is a module this tool `require()`s, i.e. EXECUTES. The resolver
//   therefore has EXACTLY TWO candidates and no others:
//     1. explicit — the value of --template <path>, resolved to an absolute path (operator-named,
//        on the command line, printed to stderr BEFORE it is loaded)
//     2. bundled  — path.join(packageRoot, 'base', 'assets', 'html-template.js')
//   There is NO ancestor-directory walk and NO environment-variable candidate. resolveTemplate takes
//   no `cwd` and no `env` parameter — there is no code path by which the working directory can
//   influence which module is loaded. cwd-independence is delivered by the BUNDLED candidate
//   (packageRoot is derived from __dirname by the caller), not by searching the user's tree.
//   Re-adding any implicit lookup requires a new ADR superseding ADR-004.

const fs = require('fs');
const path = require('path');

class TemplateNotFoundError extends Error {
  constructor(searched) {
    super(`template not found; searched:\n${searched.map((s) => `  ${s}`).join('\n')}`);
    this.name = 'TemplateNotFoundError';
    this.searched = searched;
  }
}

// resolveTemplate({ packageRoot, explicit }) -> { path, source }   source ∈ 'explicit' | 'bundled'
// Throws TemplateNotFoundError with .searched listing BOTH candidate slots (explicit first, then
// bundled) regardless of hit/miss, so a failure always names everything that was tried.
function resolveTemplate({ packageRoot, explicit } = {}) {
  const explicitAbs = explicit ? path.resolve(explicit) : null;
  const bundledAbs = path.join(packageRoot, 'base', 'assets', 'html-template.js');
  const searched = [
    `(explicit) ${explicitAbs || '--template not provided'}`,
    `(bundled)  ${bundledAbs}`,
  ];

  if (explicitAbs) {
    if (fs.existsSync(explicitAbs) && fs.statSync(explicitAbs).isFile()) {
      return { path: explicitAbs, source: 'explicit' };
    }
    // An explicitly named template that does not exist is an error, not a silent fallback:
    // falling back would render with a template the operator did not choose.
    throw new TemplateNotFoundError(searched);
  }

  if (fs.existsSync(bundledAbs) && fs.statSync(bundledAbs).isFile()) {
    return { path: bundledAbs, source: 'bundled' };
  }
  throw new TemplateNotFoundError(searched);
}

// CLI adapter for `render`. Returns the process exit code (the bin calls process.exit with it).
// argv contract (already validated by the bin's flag allow-list):
//   input     — positional <file.md> (the patient's OWN file — genuinely cwd-relative)
//   out       — --out <path> | null
//   template  — --template <path> | null
//   stdout    — --stdout boolean
function runRender({ input, out, template, stdout, packageRoot, cwd = process.cwd() }) {
  if (!input) {
    console.error('[ERROR] health-advisor render: no input file given. Usage: render <file.md> [--out <path>] [--template <path>] [--stdout]');
    return 2;
  }

  // 1. input resolution — cwd-relative BY DESIGN (it is the patient's argument, unlike the template)
  const inputAbs = path.resolve(cwd, input);
  if (!fs.existsSync(inputAbs) || !fs.statSync(inputAbs).isFile()) {
    console.error(`[ERROR] health-advisor render: input not found.\n  cwd:      ${cwd}\n  resolved: ${inputAbs}`);
    return 2;
  }
  if (path.extname(inputAbs).toLowerCase() !== '.md') {
    console.error(`[ERROR] health-advisor render: input is not a .md file.\n  cwd:      ${cwd}\n  resolved: ${inputAbs}`);
    return 2;
  }

  // 2. template resolution — NO cwd, NO env (ADR-004)
  let resolved;
  try {
    resolved = resolveTemplate({ packageRoot, explicit: template || null });
  } catch (err) {
    if (err instanceof TemplateNotFoundError) {
      console.error('[ERROR] health-advisor render: template not found; searched:');
      for (const s of err.searched) console.error(`  ${s}`);
      console.error('Fix: pass --template <path>, or reinstall the package (the bundled template is missing).');
      return 1;
    }
    throw err;
  }

  // 3. announce the winning template BEFORE loading it (ADR-004 decision 2). The printed absolute
  //    path is the same value that gets require()d below — they cannot diverge.
  if (resolved.source === 'explicit') {
    console.error(`using template: ${resolved.path}   (--template)`);
  } else {
    console.error(`template: bundled   ${resolved.path}`);
  }

  // 4. load + render
  let result;
  try {
    const templateModule = require(resolved.path);
    if (typeof templateModule.renderFile !== 'function') {
      console.error(`[ERROR] health-advisor render: template does not export renderFile(): ${resolved.path}`);
      return 1;
    }
    result = templateModule.renderFile(inputAbs, { out: out || undefined, stdout: !!stdout });
  } catch (err) {
    console.error(`[ERROR] health-advisor render: render failed: ${err.message}`);
    return 1;
  }

  // 5. output
  if (stdout) {
    process.stdout.write(result.html);
    return 0;
  }
  console.log(`rendered → ${result.outputPath}   (template: ${resolved.source})`);
  return 0;
}

module.exports = { resolveTemplate, runRender, TemplateNotFoundError };
