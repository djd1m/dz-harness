'use strict';

// egress-scan.js — the intake surface's OWN no-outbound-publication scan (ADR-004, INV-9).
//
// POLARITY NOTE (mandatory per ADR-004 §3, and the reason it is mandatory):
// this scanner is an ALLOW-list for a surface that legitimately fetches ONE caller-supplied URL —
// network-capable modules may be imported by exactly one SITE, and by no other file. Its sibling
// lib/appraisal-egress-scan.js is the same POLARITY over a different surface; test/helpers/ca2-scanners.js
// is the OPPOSITE polarity (a DENY-list for a surface that must never fetch at all). Never copy a
// constant between them — copy the RULE. Copying `SOLE_NETWORK_SITE` from CA-1 into this file would
// have pointed this scan at lib/appraisal-transport.js, a path that does not exist on this surface,
// and a scan whose sole site is absent admits a network import everywhere.
//
// WHY A SECOND SCANNER RATHER THAN A WIDER FIRST ONE. CA-1's scanner is load-bearing for the critical
// appraisal slice, and ADR-004 rejected the option of teaching it a second surface: a guard edited to
// accommodate an unrelated feature is a guard whose next edit is easier. So this is a mirror — same
// RULE, own roots, own sole site — and `test/intake-egress-rule-parity.test.js` pins the two rule sets
// against each other so they cannot drift silently, while DoD item 5 requires CA-1's file to show a
// ZERO-LINE diff.
//
// THIS FILE IS ITSELF ON THE SCANNED SURFACE. Every construct it hunts is therefore ASSEMBLED from
// fragments rather than spelled out — the discipline lib/appraisal-egress-scan.js's BARE_FETCH_LABEL
// established. A guard that reports itself as a violation gets switched off, and a guard that is
// switched off is worse than no guard because its green is trusted.
//
// THE MIRROR REUSES CA-1's LEXER, deliberately: `stripComments` there is a real character tokenizer
// that survived four review rounds (regex-literal state, nested templates, all four line terminators,
// hashbangs). Re-implementing it here would re-earn every one of those defects.

const fs = require('node:fs');
const path = require('node:path');

const {
  stripComments,
  NETWORK_CAPABLE_MODULES,
} = require('../../../lib/appraisal-egress-scan.js');

// THE SURFACE IS A DIRECTORY RULE, walked recursively — a file in a subdirectory nobody predicted is
// scanned BY DEFAULT (CA-1's C-2 lesson: an enumeration wearing an allowlist's clothes leaves every
// later file un-scanned by default).
const INTAKE_SURFACE_ROOTS = Object.freeze(['skills/intake-archive']);

// The ONLY way a path under a walked root escapes the scan. Every entry would need a written
// justification on its own line, and the isolation test asserts this list stays EMPTY.
const SURFACE_EXCLUSIONS = Object.freeze([]);

const SOLE_NETWORK_SITE = 'skills/intake-archive/engine/transport.js';

// Modules the SOLE site may import. IMPORTED from CA-1 rather than copied — the set means the same
// thing on both surfaces (this is the rule, not the polarity), so one definition is correct here.
const ALLOWED_AT_SOLE_SITE = NETWORK_CAPABLE_MODULES;

// Bare module names that are FORBIDDEN ANYWHERE ON THIS SURFACE — including at the sole site. Each is
// a channel the intake contract has no use for: a shell can pipe to curl, a resolver is an
// exfiltration channel in its own right, and worker_threads / http2 / inspector all open indirect
// sockets. Assembled from fragments so this file never spells a hunted specifier.
const DENY_ANYWHERE = Object.freeze([
  'child' + '_process',
  'd' + 'ns',
  'worker' + '_threads',
  'http' + '2',
  'inspect' + 'or',
]);

// The network-capable bare names, as a scan alternation. Built from ALLOWED_AT_SOLE_SITE so the scan
// and the allowance can never name different sets.
function bareNames() {
  const names = new Set();
  for (const spec of ALLOWED_AT_SOLE_SITE) names.add(spec.replace(/^node:/, ''));
  for (const spec of DENY_ANYWHERE) names.add(spec);
  return [...names];
}

const INERT_EXTENSIONS = Object.freeze(['.json', '.md']);

function isScannableFile(file) {
  // INVERTED, like CA-1's: scanned by default; being skipped requires an exact-case entry above.
  return !INERT_EXTENSIONS.includes(path.extname(path.basename(file)));
}

function walkFiles(p, out = []) {
  if (!fs.existsSync(p)) return out;
  const stat = fs.statSync(p);
  if (stat.isFile()) {
    out.push(p);
    return out;
  }
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    walkFiles(path.join(p, entry.name), out);
  }
  return out;
}

function isExcluded(rel, exclusions) {
  return exclusions.some((ex) => rel === ex || rel.startsWith(`${ex}/`));
}

/** The specifier grammar: require / dynamic import / from / getBuiltinModule, with optional subpaths. */
function buildImportRegex() {
  const alternation = bareNames().map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const quote = "['\"`]";
  const tail = "(?:/[^'\"`]*)?";
  const spec = `((?:node:)?(?:${alternation})${tail})`;
  const doors = [
    '\\b' + 're' + 'quire\\s*\\(\\s*' + quote + spec + quote,
    '\\b' + 'imp' + 'ort\\s*\\(\\s*' + quote + spec + quote,
    '\\bfrom\\s+' + quote + spec + quote,
    '\\b' + 'getBuiltin' + 'Module\\s*\\(\\s*' + quote + spec + quote,
  ];
  return new RegExp(doors.join('|'), 'g');
}

/**
 * The import-free network doors: a global that needs no specifier at all. Assembled, never spelled.
 * HONEST LIMIT (recorded, not implied): this is a LEXICAL scan. An indirected call —
 * globalThis['fe'+'tch'](…), an alias, eval — escapes it. It catches the spelled construct, not every
 * possible one.
 */
function buildGlobalRegex() {
  const F = 'fet' + 'ch';
  const forms = [
    // the bare call and its Function.prototype indirections
    `\\b${F}\\s*(?:\\?\\.)?\\s*(?:\\.\\s*(?:call|apply|bind)\\s*(?:\\?\\.)?\\s*)?\\(`,
    '\\bnew\\s+(?:Web' + 'Socket|Event' + 'Source|XMLHttp' + 'Request|Req' + 'uest)\\s*\\(',
    '\\bsend' + 'Beacon\\s*\\(',
    // the second spelled LOADER: it returns a require this lexical scan cannot follow
    '\\bcreate' + 'Require\\b',
  ];
  return new RegExp(forms.join('|'), 'g');
}

function bareSpecifier(name) {
  const slash = name.indexOf('/', name.startsWith('node:') ? 5 : 0);
  return slash === -1 ? name : name.slice(0, slash);
}

/**
 * scanIntakeSurface(rootDir, roots?, exclusions?) -> { violations: [{ file, half, construct }] }
 *
 * ROOT-PARAMETERISED on purpose: a test copies the surface into os.tmpdir(), plants a violation, and
 * proves the scan FIRES. A scanner that has never been observed to fire is a scanner nobody has
 * tested — only its silence has been.
 */
function scanIntakeSurface(rootDir, roots = INTAKE_SURFACE_ROOTS, exclusions = SURFACE_EXCLUSIONS) {
  const violations = [];
  const importRe = buildImportRegex();
  const globalRe = buildGlobalRegex();
  for (const rel of roots) {
    const abs = path.join(rootDir, rel);
    // A MISSING ROOT IS NOT A SMALLER SCAN, IT IS A SILENT ONE (CA-1's C3-5): walkFiles returns [] for
    // a path that does not exist, so a renamed directory would have disarmed the whole scan and
    // reported green.
    if (!fs.existsSync(abs)) {
      throw new Error(
        `intake egress scan: configured surface root does not exist: ${rel} (under ${rootDir}) — a missing ` +
        'root would be a silent scan, not a smaller one'
      );
    }
    for (const file of walkFiles(abs)) {
      if (!isScannableFile(file)) continue;
      const relFile = path.relative(rootDir, file).split(path.sep).join('/');
      if (isExcluded(relFile, exclusions)) continue;
      const src = stripComments(fs.readFileSync(file, 'utf8'));

      const importScan = new RegExp(importRe.source, 'g');
      let m;
      while ((m = importScan.exec(src)) !== null) {
        const name = m[1] || m[2] || m[3] || m[4];
        const bare = bareSpecifier(name).replace(/^node:/, '');
        const isDenied = DENY_ANYWHERE.includes(bare);
        const atSoleSite = relFile === SOLE_NETWORK_SITE;
        // Denied ANYWHERE — including at the sole site. Network-capable: sole site only.
        if (isDenied || !atSoleSite) {
          violations.push({ file: relFile, half: 'H1', construct: name });
        }
      }

      const globalScan = new RegExp(globalRe.source, 'g');
      while ((m = globalScan.exec(src)) !== null) {
        // NO EXCEPTION, not even at the sole site: the intake client is node:https by construction,
        // and every construct in this group needs no import, so allowing it anywhere would leave a
        // door the import rule cannot see.
        violations.push({ file: relFile, half: 'H1', construct: m[0].replace(/\s+/g, ' ').trim() });
      }
    }
  }
  return { violations };
}

module.exports = {
  INTAKE_SURFACE_ROOTS,
  SURFACE_EXCLUSIONS,
  SOLE_NETWORK_SITE,
  ALLOWED_AT_SOLE_SITE,
  DENY_ANYWHERE,
  INERT_EXTENSIONS,
  scanIntakeSurface,
  isScannableFile,
};
