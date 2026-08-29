'use strict';
// ha-ca1 — ADR-009/AM-10: the no-outbound-publication scan over CA-1's OWN surface, implemented as
// a recursive directory WALK (a file nobody predicted is in scope by default) with TWO halves:
//   H1 (LOAD-BEARING, a SITE rule): within the walked surface, a network-capable module may be
//      required by EXACTLY ONE file (SOLE_NETWORK_SITE); any other importer is a violation, any
//      deny-set module outside NETWORK_CAPABLE_MODULES (child_process, dns, worker_threads, http2,
//      inspector) is a violation ANYWHERE — including at the sole site — and a bare fetch() call is
//      a violation anywhere (global fetch needs no import).
//   H2 (SECONDARY BELT, labelled as one): non-GET method-shape constructs (a POST-shaped call).
// The scanner is ROOT-PARAMETERISED: it never hardcodes __dirname, so a test can copy the surface
// into os.tmpdir(), plant an import, and prove H1 fires (AM-3's corrected confirmation).
//
// POLARITY NOTE (T-10/AM-12, CA-2's lesson): this is an ALLOW-list for a slice that legitimately
// fetches. CA-2's FORBIDDEN_NETWORK_MODULES is a DENY-list for a slice that must never fetch.
// Never copy either into the other — that inverts the guard's meaning while keeping its shape.

const fs = require('node:fs');
const path = require('node:path');

// CA-1 QE F2 — THE ROOTS ARE THE SCAN. A construct in a file the walk never opens is invisible, so
// a missing root is not a smaller scan, it is a silent one.
//
// CA-1 QE round 2, C-2 — the round-1 list enumerated lib FILES individually: an enumeration wearing
// an allowlist's clothes. MEASURED: a planted lib/script-only-helper.js with require('node:dns')
// returned violations: [] — never opened, invisible to the closure check (nothing requires a
// script-only helper), and the closure-subset test stayed GREEN. Every module added after the list
// was written was un-scanned BY DEFAULT.
//
// The surface is now a DIRECTORY rule: 'lib' is walked WHOLE (recursively), so a new file — in a
// new subdirectory nobody predicted included — is scanned by default. Skipping a file is now a
// deliberate, visible act: an entry in SURFACE_EXCLUSIONS with a written justification beside it.
// The layer-1 companion stays: `localRequireClosure()` below derives the transitive local require
// closure of the entry points, and the test suite asserts that closure is a SUBSET of this surface.
const APPRAISAL_SURFACE_ROOTS = Object.freeze([
  'lib',                          // the WHOLE directory, walked recursively — C-2
  'skills/critical-appraisal',    // walked recursively
  // ha-third-brain (ADR-001 D-10): the document-ingest engine opts IN to this scan rather than
  // getting a scanner of its own. It must reach zero network, and it must spawn exactly one
  // process — so it needs the same walk, with one extra SITE rule (SOLE_SPAWN_SITE below), not a
  // second scanner that would drift from this one. It is deliberately NOT under `lib/`: that would
  // have forced a SURFACE_EXCLUSIONS entry for the spawn, weakening a gate that fails closed today.
  'skills/third-brain',           // walked recursively
]);

// C-2 — the ONLY way a path under a walked root escapes the scan. Every entry needs a written
// justification on its own line, and the test suite asserts this list is EMPTY until one exists.
const SURFACE_EXCLUSIONS = Object.freeze([]);

function isExcluded(rel, exclusions) {
  return exclusions.some((ex) => rel === ex || rel.startsWith(`${ex}/`));
}

// The entry points whose local require closure must stay inside the walked surface (F2, layer 1).
const APPRAISAL_ENTRY_POINTS = Object.freeze([
  'lib/appraisal.js',
  'lib/appraisal-run.js',
  'lib/appraisal-bundle.js',
]);

// The modules the SOLE network site may import. Everything else DENY_SET_MODULES matches is a
// violation ANYWHERE — including at the sole site (QE GAP-3 closure: this branch used to be dead
// because the import regex and this list named the same set).
const NETWORK_CAPABLE_MODULES = Object.freeze([
  'node:https', 'https', 'node:http', 'http', 'node:net', 'net', 'node:tls', 'tls',
  'node:dgram', 'dgram',
]);

// CA-2's deny-set (test/helpers/ca2-scanners.js FORBIDDEN_NETWORK_MODULES + _EXTRA), adopted here so
// the load-bearing CA-1 scan is never weaker than the sibling it cites: child_process can shell out
// to curl, dns is an exfiltration channel, worker_threads/http2/inspector open indirect sockets.
const DENY_SET_SOURCE = 'https?|http2|net|tls|dgram|dns|child_process|worker_threads|inspector';

const SOLE_NETWORK_SITE = 'lib/appraisal-transport.js';

// ── the SECOND site rule, same doctrine, different capability (ADR-001 D-10) ─────────────────────
//
// `ha third-brain`'s write leg must start `python3 learning_bridge.py` — the ONE gate into the
// segregated store, which is Python and stays Python (a JS re-implementation would be a second copy
// of a nine-round-hardened invariant). So the deny set's process-spawning member is allowed at
// EXACTLY ONE file, and is a violation everywhere else on the surface, including at the sole NETWORK
// site: a transport that can shell out is a transport with an unbounded egress channel.
//
// A RULE, NOT AN EXCLUSION. An exclusion would stop scanning write.js entirely — so a `node:dns`
// added there later would be invisible. The rule keeps the file fully scanned and permits exactly
// one named module in it. (SURFACE_EXCLUSIONS therefore stays empty, and its test still asserts so.)
const SOLE_SPAWN_SITE = 'skills/third-brain/engine/write.js';

// Spelled as an array of specifiers rather than inline, for the same reason NETWORK_CAPABLE_MODULES
// is: the allowlist is checked against the BARE module name, so a subpath can never inherit an
// allowance the bare name does not have.
// Plain literals (fix round 1, QE F10): an earlier revision spelled the first member as
// `'node:' + 'child_process'`, and nothing in this file required the split — the scanner's regexes
// match `require(`/`import(`/`from` forms, never a bare array element (`DENY_SET_SOURCE` three lines
// up already carries the bare word). In a security-critical file, "why is this written oddly" must
// not be a research question.
const SPAWN_CAPABLE_MODULES = Object.freeze(['node:child_process', 'child_process']);

/**
 * CA-1 QE F2 — stripComments used to be two regexes, and a regex cannot tell a comment opener from
 * the same two characters INSIDE A STRING. MEASURED: `const open = '/*';` made the scanner delete
 * every line up to the next close-comment marker — DELETING LIVE CODE, so a require() on those
 * lines was invisible to a guard whose whole job is to see it. A comment stripper that removes code
 * is worse than none.
 *
 * CA-1 QE round 2, C-4 — the round-1 rewrite was string-aware but STILL NOT A LEXER: no regex-
 * literal state (`/\//` opened a comment; /`/ opened a phantom template), no stack for nested
 * templates (`${`//`}` flipped the lexer into code state), no code state inside `${...}` (a comment
 * there survived as text), and `\n` as the only line terminator (a comment ate past `\r`/U+2028/
 * U+2029). Six faces, one cause. This is now a real character tokenizer:
 *   - states: code · '/" string · template literal (with a NESTING STACK — `${}` re-enters code,
 *     and templates nest inside interpolations) · line comment · block comment · regex literal
 *     (character classes and escapes honoured);
 *   - regex-vs-division decided by the previous significant token (the standard heuristic: a regex
 *     may start after an operator/punctuator or a keyword like return/typeof/case; after an
 *     identifier, number, `)` or `]` a slash is division);
 *   - all four ECMAScript line terminators (\n \r U+2028 U+2029) end a line comment and an
 *     unterminated '/" string;
 *   - a LEADING hashbang line is a comment (isScannableFile admits extensionless executables, which
 *     is exactly where hashbangs live).
 * HONEST LIMITS (recorded, not implied): after `}` a slash is read as a regex start (block-vs-
 * object-literal ambiguity — chosen so a guard swallows a division expression at worst, and an
 * unterminated candidate falls back to division at the line end); and the contents of ORDINARY
 * string literals are still copied into the scanned output, so a spelled construct inside a plain
 * string remains visible to the scan (the conservative direction for a guard).
 */
const REGEX_ALLOWING_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'case', 'do', 'else', 'yield', 'await',
]);

// C3-7 (round 3): a `)` that closes one of these keywords' CONDITION admits a regex in statement
// position (`if (x) /\//.test(s)` is legal JS); after any OTHER `)` a slash stays division. Round 1
// and round 2 both read every `)` as "value", so the `//` inside the statement-position regex
// opened a phantom line comment that deleted the rest of the line — including a require().
const CONDITION_KEYWORDS = new Set(['if', 'for', 'while', 'with']);

function isLineTerminator(c) {
  return c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029';
}

function stripComments(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  // C-4: a leading hashbang is a comment, not code
  if (source[0] === '#' && source[1] === '!') {
    while (i < n && !isLineTerminator(source[i])) i += 1;
  }
  // template nesting: 'tpl' = inside a template literal's text; {braces} = inside its ${...} code
  const stack = [];
  // C3-7: one boolean per open `(` — true when it opens an if/for/while/with condition
  const condParens = [];
  const inTemplateText = () => stack.length > 0 && stack[stack.length - 1] === 'tpl';
  // previous significant token, for the regex-vs-division decision
  let lastSig = '';   // last significant (non-space, non-comment) character copied in code state
  let lastWord = '';  // the identifier/keyword that character ended, if any
  const noteValue = () => { lastSig = ')'; lastWord = ''; }; // a literal is a value: `/` after it divides
  const regexAllowed = () => {
    if (lastSig === '') return true; // start of input
    if (/[A-Za-z0-9_$]/.test(lastSig)) return REGEX_ALLOWING_KEYWORDS.has(lastWord);
    return lastSig !== ')' && lastSig !== ']';
  };

  while (i < n) {
    if (inTemplateText()) {
      const c = source[i];
      if (c === '\\') { out += source.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { out += c; i += 1; stack.pop(); noteValue(); continue; }
      if (c === '$' && source[i + 1] === '{') {
        out += '${';
        i += 2;
        stack.push({ braces: 0 }); // re-enter CODE state — comments in here are comments
        lastSig = '(';             // an interpolation head admits a regex
        lastWord = '';
        continue;
      }
      out += c;
      i += 1;
      continue;
    }

    // ── code state ──
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      while (i < n && !isLineTerminator(source[i])) i += 1; // the terminator is copied next round
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (isLineTerminator(source[i])) out += source[i]; // keep line count stable for locators
        i += 1;
      }
      i += 2;
      continue;
    }
    if (ch === '/' && regexAllowed()) {
      // candidate regex literal: copy verbatim, honouring \escapes and [character classes]
      let j = i + 1;
      let body = '/';
      let inClass = false;
      let closed = false;
      while (j < n) {
        const c = source[j];
        if (isLineTerminator(c)) break; // unterminated — this slash was division after all
        body += c;
        if (c === '\\' && j + 1 < n && !isLineTerminator(source[j + 1])) { body += source[j + 1]; j += 2; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { closed = true; j += 1; break; }
        j += 1;
      }
      if (closed) {
        while (j < n && /[a-z]/i.test(source[j])) { body += source[j]; j += 1; } // flags
        out += body;
        i = j;
        noteValue();
        continue;
      }
      // fall through: treat the slash as a division operator
      out += ch;
      i += 1;
      lastSig = '/';
      lastWord = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      // string literal: copy verbatim, honouring escapes, until the matching quote — and bail at a
      // line terminator so a stray apostrophe in prose does not swallow the rest of the file
      out += ch;
      i += 1;
      while (i < n) {
        const c = source[i];
        if (c === '\\') { out += source.slice(i, i + 2); i += 2; continue; }
        out += c;
        i += 1;
        // C3-2 (round 3): ONLY \n and \r may end an unterminated '/" string. ES2019 ("Subsume
        // JSON") permits raw U+2028/U+2029 INSIDE a string literal, so the round-2 reuse of
        // isLineTerminator here — a helper written for line COMMENTS, where those characters DO
        // terminate — exited the literal mid-string; a `/*` that was still string content then
        // opened a phantom block comment and deleted to end of file. Same helper, opposite
        // correctness at the two call sites: the fix is at this site, not in the helper.
        if (c === ch || c === '\n' || c === '\r') break;
      }
      noteValue();
      continue;
    }
    if (ch === '`') {
      out += ch;
      i += 1;
      stack.push('tpl');
      continue;
    }
    if (stack.length > 0 && typeof stack[stack.length - 1] === 'object') {
      // inside a template's ${...}: balance braces back to the owning template
      if (ch === '{') stack[stack.length - 1].braces += 1;
      else if (ch === '}') {
        if (stack[stack.length - 1].braces === 0) {
          stack.pop(); // back to the template's text state ('tpl' is now on top)
          out += ch;
          i += 1;
          continue;
        }
        stack[stack.length - 1].braces -= 1;
      }
    }
    out += ch;
    i += 1;
    if (!/\s/.test(ch)) {
      if (ch === '(') condParens.push(CONDITION_KEYWORDS.has(lastWord));
      if (ch === ')' && condParens.pop() === true) {
        // C3-7: a condition's closing `)` admits a regex, exactly like an operator would
        lastSig = '(';
        lastWord = '';
        continue;
      }
      lastSig = ch;
      lastWord = /[A-Za-z0-9_$]/.test(ch)
        ? (/[A-Za-z0-9_$]/.test(lastWord.slice(-1) || '') || lastWord === '' ? lastWord + ch : ch)
        : '';
    }
  }
  return out;
}

// CA-1 QE F2 — WHICH FILES ARE SOURCE. `.endsWith('.js')` skipped `.cjs`, `.mjs` and extensionless
// executables, all of which Node happily runs. A file's extension is not its executability.
//
// CA-1 QE round 3, C3-4 — the F2 fix was STILL an enumeration wearing an allowlist's clothes, one
// level down from C-2: SCANNED_EXTENSIONS named three lowercase source extensions, and everything
// else was skipped SILENTLY and BY DEFAULT. MEASURED (node v22): `Upper.JS`, `Upper2.CJS`,
// `Upper.MJS`, `mod.ts` (type-stripping is default-on), `mod.js.txt` and `d.JSON` each load via an
// exact-name require() — Node's fallback for an extension its loader table does not list is the JS
// loader — and each was invisible to the scan. The rule is INVERTED: every file under a walked
// root is scanned unless its EXACT extension appears below, matched CASE-SENSITIVELY because
// Node's loader table is case-sensitive too (require('./d.json') is parsed as data; './d.JSON' is
// EXECUTED as JS and is therefore scanned).
const INERT_EXTENSIONS = Object.freeze([
  // .json (exact case): Module._extensions['.json'] PARSES it as data — it never executes. Scanning
  // fixture data for require('node:https') would report strings as leaks, and a guard that cries
  // wolf gets switched off.
  '.json',
  // .md (exact case): the prose references on this surface (skills/critical-appraisal/references)
  // legitimately NAME the hunted constructs while documenting them. An .md only ever executes if
  // scanned code loads it by exact name from a SCANNED file, and the spelled loaders are flagged
  // at the loading site: a require() whose call carries a .md-ending string literal — including
  // the computed-concat spelling require('./doc' + <the extension>) — by INERT_REQUIRE_RE, and
  // module.createRequire (a second loader this lexical scan cannot follow, whose returned function
  // EXECUTES an .md — MEASURED) by CREATE_REQUIRE_SOURCE, both below. R4-2 HONEST LIMIT (recorded,
  // not implied, same class as the fetch-indirection limit): an ALIASED require (`const r =
  // require; r(...)`), eval, or any other fully indirected loader spelling remains invisible to a
  // lexical scan — the belt covers the spelled loaders, not every possible one.
  '.md',
]);

function isScannableFile(file) {
  // C3-4: inverted — scanned by default; being skipped requires an exact-case INERT_EXTENSIONS
  // entry with a written justification (extensionless files have ext '' and are always scanned)
  return !INERT_EXTENSIONS.includes(path.extname(path.basename(file)));
}

// C3-4 — the requiring-site belt for the inert skips: Node EXECUTES require('./x.md') (unknown
// extension -> JS loader), so the one path by which an unscanned inert file becomes code is a
// spelled require in a SCANNED file. Exact-case '.json' is excluded: Node parses it as data.
// R4-2 — the round-3 spelling demanded the .md literal be the FIRST token after the paren, so
// require('./doc' + '.md') walked past it while genuinely executing the .md (MEASURED). Widened:
// a .md-ending string literal ANYWHERE inside the call parens is the flagged ingredient — it is
// the one every measured computed spelling carries.
const INERT_REQUIRE_RE = /\brequire\s*\(([^)]*\.md)['"`]/g;

// R4-2 — the OTHER spelled loader: module.createRequire returns a require this scan cannot follow,
// and its result EXECUTES an .md by exact name (MEASURED). The appraisal surface has no legitimate
// use of it, so the IDENTIFIER is flagged wherever it is spelled. Assembled, never written out —
// this file is on its own surface (the BARE_FETCH_LABEL discipline).
const CREATE_REQUIRE_SOURCE = '\\bcreate' + 'Require\\b';
const CREATE_REQUIRE_LABEL = 'create' + 'Require';

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

// ── The local require closure (F2, layer 1 companion to the static root list) ──────────────────

const LOCAL_REQUIRE_RE = /\brequire\s*\(\s*['"`](\.[^'"`]+)['"`]/g;

/**
 * localRequireClosure(rootDir, entries) -> sorted rel paths of every LOCAL module transitively
 * required from `entries`. Lexical, like the rest of this scanner: it sees the spelled specifier,
 * not a computed one. Its job is to detect a module that JOINED the runtime and was forgotten in
 * APPRAISAL_SURFACE_ROOTS — the F2 defect — which is a spelled require in every real case.
 */
function localRequireClosure(rootDir, entries = APPRAISAL_ENTRY_POINTS) {
  const seen = new Set();
  const queue = entries.slice();
  while (queue.length > 0) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    const abs = path.join(rootDir, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    seen.add(rel);
    const src = stripComments(fs.readFileSync(abs, 'utf8'));
    let m;
    const re = new RegExp(LOCAL_REQUIRE_RE.source, 'g');
    while ((m = re.exec(src)) !== null) {
      let target = path.relative(rootDir, path.resolve(path.dirname(abs), m[1])).replace(/\\/g, '/');
      if (!/\.[cm]?js$/.test(target) && fs.existsSync(path.join(rootDir, `${target}.js`))) target += '.js';
      queue.push(target);
    }
  }
  return [...seen].sort();
}

// CA-1 QE F2 — the specifier grammar, widened at three measured escapes:
//   (a) SUBPATHS: a builtin reached as <name>/<subpath> is the same module through a different
//       door. The old pattern demanded a closing quote immediately after the bare name, so every
//       builtin subpath walked past it.
//   (b) EXTRA ARGUMENTS: a dynamic import with an import-attributes object after the specifier.
//       The old pattern demanded a closing paren right after the specifier, so the object hid it.
//   (c) A THIRD DOOR entirely: the getBuiltinModule accessor loads a builtin with no require and
//       no import statement at all.
// NOTE: this file is ITSELF on the walked surface, so no comment or literal here may SPELL a
// construct the scan hunts — every one below is assembled, never written out (the same discipline
// BARE_FETCH_LABEL has always used).
// The trailing `\s*\)` is deliberately GONE: nothing about a closing paren makes the import less
// real, and demanding it only teaches the next escape how to spell itself.
const SPECIFIER_TAIL = `(?:/[^'"\`]*)?`; // (a) — an optional subpath, captured with the name
const NETWORK_IMPORT_RE = new RegExp(
  `\\brequire\\s*\\(\\s*['"\`]((?:node:)?(?:${DENY_SET_SOURCE})${SPECIFIER_TAIL})['"\`]`
  + `|\\bimport\\s*\\(\\s*['"\`]((?:node:)?(?:${DENY_SET_SOURCE})${SPECIFIER_TAIL})['"\`]`
  + `|\\bfrom\\s+['"\`]((?:node:)?(?:${DENY_SET_SOURCE})${SPECIFIER_TAIL})['"\`]`
  + `|\\bgetBuiltinModule\\s*\\(\\s*['"\`]((?:node:)?(?:${DENY_SET_SOURCE})${SPECIFIER_TAIL})['"\`]`,
  'g');

/** The bare module name a matched specifier names, with any subpath stripped (`node:dns/promises`
 *  -> `node:dns`). The ALLOWLIST is checked against this, so a subpath can never be allowlisted by
 *  spelling that the bare name never had. */
function bareSpecifier(name) {
  const slash = name.indexOf('/', name.startsWith('node:') ? 5 : 0);
  return slash === -1 ? name : name.slice(0, slash);
}

// H1 also flags a BARE fetch() call anywhere on the surface (QE GAP-3 closure): global fetch needs
// no import, and a GET-shaped call is exactly the exfiltration shape (`fetch(url + data)`) the
// method-shape belt cannot see. The sole network site uses node:https, never fetch.
// HONEST LIMIT (recorded, not implied): this is a LEXICAL scan. An indirected call —
// globalThis['fe'+'tch'](…), eval, a renamed alias — escapes both halves; the scan catches the
// spelled construct, not every possible one.
// CA-1 QE F2 — `\bfetch\s*\(` sees ONE spelling of a call. These three reach the same function and
// were each MEASURED as missed: `fetch?.()` (optional call), `fetch.call()` / `.apply()` / `.bind()`
// (Function.prototype indirection). Widened to the call FORMS, not just the juxtaposition.
const BARE_FETCH_RE = /\bfetch\s*(?:\?\.)?\s*(?:\.\s*(?:call|apply|bind)\s*(?:\?\.)?\s*)?\(/g;
// Concatenated so this module — which is ON the walked surface — never spells the construct it
// hunts (the scan would otherwise report its own label string).
const BARE_FETCH_LABEL = 'fetch' + '(';

// CA-1 QE F2 — global network CONSTRUCTORS/senders that need no import at all. `new WebSocket(...)`
// opens a socket from a surface whose whole contract is bounded GETs; the others are the same hole.
const NETWORK_GLOBAL_RE = /\bnew\s+(?:WebSocket|EventSource|XMLHttpRequest|Request)\s*\(|\bsendBeacon\s*\(/g;

// H2 belt: method-shaped constructs a GET-only surface has no business containing.
// CA-1 QE F2: the key may be QUOTED and the value is case-insensitive in every HTTP client that
// matters (a lowercase verb) — both walked past the old pattern at the sole allowed transport site,
// which is precisely where a non-GET would be planted. Built with new RegExp rather than a literal:
// a regex LITERAL carrying raw quote characters confuses any string-aware comment stripper,
// including the one above.
const QUOTE_CLASS = "['\"`]";
const METHOD_SHAPE_RE = new RegExp(
  `${QUOTE_CLASS}?method${QUOTE_CLASS}?\\s*:\\s*${QUOTE_CLASS}(?:POST|PUT|PATCH|DELETE)${QUOTE_CLASS}`
  + `|\\bfetch\\s*\\([^)]*\\{[^}]*method`,
  'gis');

/**
 * scanAppraisalSurface(rootDir, roots?, exclusions?) -> { violations: [{file, half, construct}] }
 * `rootDir` is the package root the surface roots are resolved against; `roots` and `exclusions`
 * are overridable ONLY for tests (defaults: APPRAISAL_SURFACE_ROOTS / SURFACE_EXCLUSIONS).
 */
function scanAppraisalSurface(rootDir, roots = APPRAISAL_SURFACE_ROOTS, exclusions = SURFACE_EXCLUSIONS) {
  const violations = [];
  for (const rel of roots) {
    // C3-5 (round 3): a missing root is not a smaller scan, it is a SILENT one — walkFiles returns
    // [] for a path that does not exist, so renaming lib/ disarmed the load-bearing half of the
    // scan and reported green. A configured root that does not exist is a loud failure.
    if (!fs.existsSync(path.join(rootDir, rel))) {
      throw new Error(`appraisal egress scan: configured surface root does not exist: ${rel} (under ${rootDir}) — a missing root would be a silent scan, not a smaller one`);
    }
    for (const file of walkFiles(path.join(rootDir, rel))) {
      if (!isScannableFile(file)) continue;
      const relFile = path.relative(rootDir, file).replace(/\\/g, '/');
      if (isExcluded(relFile, exclusions)) continue; // C-2: a visible, justified act — never a default
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      let m;
      const importRe = new RegExp(NETWORK_IMPORT_RE.source, 'g');
      while ((m = importRe.exec(src)) !== null) {
        const name = m[1] || m[2] || m[3] || m[4];
        // the ALLOWLIST is checked against the BARE module name: `node:dns/promises` is `node:dns`,
        // and a subpath never inherits an allowance the bare name does not have
        const bare = bareSpecifier(name);
        const atSoleNetworkSite = NETWORK_CAPABLE_MODULES.includes(bare) && relFile === SOLE_NETWORK_SITE;
        // The two site rules are INDEPENDENT: neither site inherits the other's allowance, so a
        // network module at the spawn site and a spawn module at the network site are both caught.
        const atSoleSpawnSite = SPAWN_CAPABLE_MODULES.includes(bare) && relFile === SOLE_SPAWN_SITE;
        if (!atSoleNetworkSite && !atSoleSpawnSite) {
          violations.push({ file: relFile, half: 'H1', construct: name });
        }
      }
      const fetchRe = new RegExp(BARE_FETCH_RE.source, 'g');
      while ((m = fetchRe.exec(src)) !== null) {
        violations.push({ file: relFile, half: 'H1', construct: BARE_FETCH_LABEL });
      }
      const globalRe = new RegExp(NETWORK_GLOBAL_RE.source, 'g');
      while ((m = globalRe.exec(src)) !== null) {
        violations.push({ file: relFile, half: 'H1', construct: m[0].replace(/\s+/g, ' ').trim() });
      }
      // C3-4: the requiring-site belt — a spelled require of an inert-extension file is the ONE
      // path by which an unscanned prose file becomes code, and it lives in scanned code.
      const inertRe = new RegExp(INERT_REQUIRE_RE.source, 'g');
      while ((m = inertRe.exec(src)) !== null) {
        violations.push({ file: relFile, half: 'H1', construct: `require-of-inert-file:${m[1].replace(/['"`]/g, '')}` });
      }
      // R4-2 — the second spelled loader (see CREATE_REQUIRE_SOURCE above)
      const createReqRe = new RegExp(CREATE_REQUIRE_SOURCE, 'g');
      while ((m = createReqRe.exec(src)) !== null) {
        violations.push({ file: relFile, half: 'H1', construct: CREATE_REQUIRE_LABEL });
      }
      const beltRe = new RegExp(METHOD_SHAPE_RE.source, 'gis');
      let b;
      while ((b = beltRe.exec(src)) !== null) {
        violations.push({ file: relFile, half: 'H2', construct: b[0].slice(0, 60) });
      }
    }
  }
  return { violations };
}

module.exports = {
  APPRAISAL_SURFACE_ROOTS,
  SURFACE_EXCLUSIONS,
  APPRAISAL_ENTRY_POINTS,
  NETWORK_CAPABLE_MODULES,
  SOLE_NETWORK_SITE,
  SPAWN_CAPABLE_MODULES,
  SOLE_SPAWN_SITE,
  INERT_EXTENSIONS,
  scanAppraisalSurface,
  localRequireClosure,
  stripComments,
};
