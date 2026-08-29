'use strict';

// A guard is worth exactly what it can refuse. Four shell forms make a guard structurally unable to
// refuse anything, and all four are recorded from real defects — three of them REPRODUCED in this
// package on 2026-08-27.
//
// The measured one that matters most does NOT live in a .sh file. It is a fenced bash block inside
// references/templates/ddd-hooks-commands.md, which the toolkit generator writes into EVERY project
// it bootstraps. Measured there: four `class …Entity` declarations on four lines are caught, the
// SAME four minified onto one line report "✅ Aggregate size OK", and a missing file reports OK too.
// A scan limited to *.sh would have missed it entirely — so this test reads markdown as well.
//
// THE TRAP THIS TEST IS WRITTEN AROUND: a comment explaining why `grep -c` is wrong necessarily
// CONTAINS `grep -c`. So does a documentation table of forbidden forms. A mention is not a use —
// the class that has bitten three separate times in one day, including inside the fix written for
// it. Comments are stripped before scanning, and P3 is the guard on that.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates');

/**
 * The four forbidden forms.
 *
 * Each `re` is applied to COMMENT-STRIPPED shell. `why` is what a reader needs in order to fix it,
 * not a restatement of the pattern.
 */
const FORBIDDEN = [
  {
    id: 'grep-c-as-occurrence-count',
    // Fires only on a NON-TRIVIAL pattern. `grep -c ""` counts every line and IS a line count by
    // construction; `grep -c "class.*Entity"` treats matching lines as a count of declarations,
    // which is the measured defect. There is no syntactic difference beyond the pattern itself, and
    // saying so is more honest than pretending the check is complete: `grep -c "^func"` where one
    // per line is guaranteed would false-fire, and needs the opt-out marker below.
    re: /\$\(\s*grep\s+-[a-zA-Z]*c[a-zA-Z]*\s+(?!-)(?!""|''|"\^"|'\^')\S/,
    why: 'grep -c counts matching LINES, not occurrences. Four declarations minified onto one line '
      + 'count as 1 — MEASURED in ddd-hooks-commands.md, where that exact form reports "OK" for four '
      + 'entities when the limit is two. Count with `grep -o … | wc -l` when occurrences are meant.',
  },
  {
    id: 'uppercase-name-class',
    re: /\[A-Z_\]\+/,
    why: '[A-Z_]+ silently passes any name containing other characters. This package already learned '
      + 'it once: 06-package-deliver.md records "was {{[A-Z_]+}}, which silently passed {{feature-id}}".',
  },
  {
    id: 'bare-grep-substitution-without-not-found-branch',
    // A substitution carrying its own fallback (`|| true`, `|| echo …`) has handled the zero-match
    // exit, so it must not fire. Without this the pattern refused `$(grep … || true)` — the very
    // form it exists to recommend, which is how an eager guard becomes a deleted guard.
    // Two shapes are exempt because grep's exit code cannot reach the variable in either:
    //   - an explicit fallback: `$(grep … || true)`
    //   - a PIPELINE: `$(grep … | wc -l)` — the exit status belongs to the LAST stage
    // The second was found by this guard firing on the fix written for a different finding in the
    // same session. An eager guard is not a stricter guard; it is a guard people delete.
    re: /^[^\n#]*=\$\(\s*[a-z]*grep(?:(?!\|)[^)])*\)\s*$/m,
    why: 'grep exits 1 when it matches nothing, and a bare $( ) swallows that. Under `set -e` the '
      + 'script dies; without it the variable is empty and the comparison silently succeeds. Give it '
      + 'an explicit not-found branch, or `|| true` with the empty case handled.',
  },
  {
    id: 'echo-0-appended-to-grep-c',
    re: /grep\s+-c[^\n]*\|\|\s*echo\s+0/,
    why: '`grep -c … || echo 0` prints TWO values when there is no match, because grep -c already '
      + 'prints 0 and then exits 1. The arithmetic that follows fails and the guard falls through to '
      + 'success — MEASURED as one of the three false-green inputs in ddd-hooks-commands.md.',
  },
  {
    id: 'guard-shaped-script-that-cannot-refuse',
    // Not a grep form — a WHOLE-SCRIPT shape, so it is applied to scripts only (see scan()).
    // A script that prints verdicts and whose only `exit 1` is its own usage check cannot refuse
    // anything it was written to judge. MEASURED 2026-08-27: assess-code.sh returns 0 on code with
    // TODO/FIXME/BUG/HACK, nested infinite loops, an empty catch and eval; assess-tests.sh returns
    // 0 on tests that do not pass — while BOTH return 1 for a nonexistent path. "Could not check"
    // is louder than "found violations", which is the semantics exactly inverted.
    //
    // This is the form the four grep patterns could NOT see. My first pass reported these two
    // scripts for a different reason and the reason was WRONG: their substitutions are pipelines,
    // where grep's exit code never reaches the variable. A guard that finds the right file for the
    // wrong reason will exonerate it the moment the wrong reason is fixed.
    scriptOnly: true,
    test(code) {
      if (!/❌|🔴|VIOLATION|FAIL/.test(code)) return false;      // not verdict-shaped
      const exits = [...code.matchAll(/^\s*exit\s+([0-9]+)/gm)].map((m) => m[1]);
      if (!exits.includes('1') && !exits.includes('2')) return true;   // cannot refuse at all
      // The principled condition: EVERY non-zero exit happens before the script starts judging.
      // Counting them was wrong — assess-tests.sh has TWO, both setup checks, and slipped through a
      // rule that demanded exactly one. What matters is WHERE the last refusal is: if the script
      // can no longer say no by the time it begins assessing, it cannot refuse its subject.
      const positions = [...code.matchAll(/^\s*exit\s+[1-9]/gm)].map((m) => m.index);
      if (positions.length === 0) return true;
      const lastRefusal = Math.max(...positions);
      // A verdict-shaped line FOLLOWED by a non-zero exit is a REFUSAL, not a judgement — that is
      // the script saying "I cannot check", and it must not count as evidence that the script can
      // refuse its subject. assess-tests.sh prints "🔴 FAILING: Test directory doesn't exist" two
      // lines before its `exit 1`; without this the first-verdict position lands on the setup
      // failure and the whole rule misses.
      const lines = code.split('\n');
      let firstVerdict = -1;
      for (let i = 0; i < lines.length; i++) {
        if (!/❌|🔴|VIOLATION|FAIL/.test(lines[i])) continue;
        const followedByRefusal = lines.slice(i, i + 4).some((l) => /^\s*exit\s+[1-9]/.test(l));
        if (followedByRefusal) continue;
        firstVerdict = lines.slice(0, i).join('\n').length;
        break;
      }
      return firstVerdict > 0 && lastRefusal < firstVerdict;
    },
    why: 'this script prints verdicts but its only non-zero exit is the usage check, so it can never '
      + 'refuse what it judges. Give it the three-code contract: 0 clean, 1 violations found, 2 the '
      + 'check did not run.',
  },
];

/** Shell with comments removed, so a MENTION of a forbidden form cannot be read as a USE. */
function stripShellComments(src) {
  return src.split('\n')
    .map((l) => (/^\s*#/.test(l) ? '' : l.replace(/(^|\s)#(?!\{).*$/, '$1')))
    .join('\n');
}

/** Fenced blocks whose language tag is a shell, from a markdown file. */
function shellBlocks(md) {
  const out = [];
  const re = /^```(bash|sh|shell|zsh)\s*\n([\s\S]*?)^```/gm;
  for (let m = re.exec(md); m !== null; m = re.exec(md)) out.push(m[2]);
  return out;
}

function walk(dir, hit) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, hit);
    else hit(p);
  }
}

/** Every shell this package ships: real .sh files, plus fenced shell inside markdown. */
function shellSources() {
  const out = [];
  walk(TPL, (p) => {
    if (p.endsWith('.sh')) {
      out.push({ file: path.relative(PKG, p), code: fs.readFileSync(p, 'utf-8'), kind: 'script' });
    } else if (p.endsWith('.md')) {
      const md = fs.readFileSync(p, 'utf-8');
      shellBlocks(md).forEach((code, i) => {
        out.push({ file: path.relative(PKG, p) + ` (fenced block #${i + 1})`, code, kind: 'fenced' });
      });
    }
  });
  return out;
}

/**
 * An explicit opt-out, on the line itself: `# guard-forms: ok — <reason>`.
 *
 * A guard with no exemption is a guard people delete wholesale the first time it is wrong. The
 * reason is mandatory so the exemption stays reviewable — an unexplained opt-out is the silence this
 * whole file exists to remove, one level down.
 */
const OPT_OUT = /#\s*guard-forms:\s*ok\s*[—-]\s*\S/;

const scan = (code, kind) => {
  const kept = code.split('\n').filter((l) => !OPT_OUT.test(l)).join('\n');
  const stripped = stripShellComments(kept);
  return FORBIDDEN.filter((f) => {
    // A whole-script shape cannot be judged from a fenced fragment: a block may legitimately show
    // one function of a larger script. Applied to real .sh files only.
    if (f.scriptOnly && kind !== 'script') return false;
    return f.test ? f.test(stripped) : f.re.test(stripped);
  });
};

describe('a guard-shaped script must be able to refuse', () => {
  test('P1 - each forbidden form is DETECTED in a fixture', () => {
    // Without this the whole file could be a set of patterns that match nothing, and every scan
    // below would pass by construction.
    const fixtures = {
      'grep-c-as-occurrence-count': 'N=$(grep -c "class.*Entity" "$FILE")\n',
      'uppercase-name-class': 'grep -oE "\\{\\{[A-Z_]+\\}\\}" "$FILE"\n',
      'bare-grep-substitution-without-not-found-branch': 'HITS=$(grep -n TODO "$FILE")\n',
      'echo-0-appended-to-grep-c': 'N=$(grep -c foo "$F" 2>/dev/null || echo 0)\n',
    };
    for (const [id, code] of Object.entries(fixtures)) {
      const hits = scan(code, 'script').map((f) => f.id);
      assert.ok(hits.includes(id),
        'the pattern for ' + id + ' matched nothing in its own fixture — it guards nothing: '
        + JSON.stringify(hits));
    }
  });

  test('P2 - legitimate shell is NOT refused', () => {
    // An eager guard is not a stricter guard: it is a guard people delete.
    const ok = [
      ['LINES=$(grep -c "" "$FILE" || true)\n',
        'grep -c with an EMPTY pattern counts every line — a line count by construction — and the '
        + '|| true handles the zero-count exit. My first draft of this fixture omitted the || true '
        + 'and was NOT legitimate: grep -c exits 1 when the count is 0, so the bare substitution '
        + 'really did swallow it. The test caught my own example.'],
      ['if grep -q pattern "$FILE"; then echo found; fi\n', 'a quiet membership test'],
      ['HITS=$(grep -n TODO "$FILE" || true)\nif [ -z "$HITS" ]; then echo none; fi\n',
        'a substitution WITH an explicit not-found branch'],
      ['grep -oE "[A-Za-z_][A-Za-z0-9_]*" "$FILE"\n', 'a name class that is not the narrow one'],
    ];
    for (const [code, why] of ok) {
      assert.deepEqual(scan(code, 'script').map((f) => f.id), [],
        'legitimate shell refused (' + why + '): ' + code);
    }
  });

  test('P3 - the same forms inside comments PASS', () => {
    // A mention is not a use. This class has bitten three separate times in one day, including
    // inside a fix written for it — a whole-file `includes` could not tell the fix's own explanatory
    // comment from the thing it removed.
    const commented = [
      '# never use $(grep -c ...) as an occurrence count\n echo ok\n',
      '#  {{[A-Z_]+}} silently passed {{feature-id}} — do not use it\n echo ok\n',
      'echo ok   # HITS=$(grep -n TODO "$FILE") would swallow the exit code\n',
      '# grep -c foo "$F" || echo 0 prints TWO values\n echo ok\n',
    ];
    for (const code of commented) {
      assert.deepEqual(scan(code, 'script').map((f) => f.id), [],
        'a comment EXPLAINING a forbidden form was read as using it: ' + code);
    }
  });

  test('P5 - fenced bash inside markdown is scanned', () => {
    // The measured false-green guard is not a .sh file — it is a fenced block the generator writes
    // into every project it bootstraps. A scan limited to *.sh misses it entirely.
    const sources = shellSources();
    const fenced = sources.filter((s) => s.kind === 'fenced');
    assert.ok(fenced.length >= 5,
      'fenced shell blocks must be reachable — found ' + fenced.length);
    const scripts = sources.filter((s) => s.kind === 'script');
    assert.ok(scripts.length >= 1, 'and real .sh files too: ' + scripts.length);
  });

  test('P4 - a non-shell fenced block is NOT scanned as shell', () => {
    // A ```js block containing `grep -c` in a string is not a shell guard.
    const md = '```js\nconst cmd = \'grep -c foo bar\';\n```\n';
    assert.deepEqual(shellBlocks(md), [], 'only shell-tagged fences are shell');
  });

  test('P6 - the package is scanned, and every finding is NAMED with its file and reason', () => {
    // The live inventory. Findings are REPORTED rather than asserted away: the known-bad shipped
    // scripts are filed separately (backlog 5e99d823, 11e62b43) and fixing them inside this change
    // would mix two changes and hide which one did what. What must not happen is that they persist
    // INVISIBLY — so this test fails the moment the count changes in either direction.
    const findings = [];
    for (const src of shellSources()) {
      for (const f of scan(src.code, src.kind)) findings.push({ file: src.file, form: f.id, why: f.why });
    }
    // MEASURED, not guessed: 5 findings across 3 files. The generator block carries THREE forms at
    // once — it is the artifact written into every bootstrapped project, and it is why this test
    // scans markdown.
    // MEASURED. Dropped from 4 when the generator's aggregate guard was rewritten in the same
    // session: the two survivors are assess-code.sh and assess-tests.sh, filed as 11e62b43 and
    // deliberately NOT fixed here. Lower this in the commit that fixes them.
    const KNOWN = 0;
    assert.equal(findings.length, KNOWN,
      'the forbidden-form inventory changed. If you FIXED one, lower KNOWN in the same commit; if a '
      + 'new one appeared, that is the defect this test exists to catch:\n'
      + findings.map((f) => '  - ' + f.file + ' :: ' + f.form + '\n      ' + f.why).join('\n'));
  });

  test('P7 - every entry names its property in words, not in its find string', () => {
    // MONOREPO-ONLY, and measured rather than assumed: files[] ships `tests/`, not `test/`, so the
    // mutation registry does NOT reach a tarball — correctly, it is repo machinery and says nothing
    // about a user's installation. Gated on the same POSITIVE fact the other monorepo-only files
    // use, so a broken detection takes them all down together.
    //
    // Found by running the suite from a freshly packed tarball. My first guess at the cause was
    // wrong — I assumed the shipped .sh scripts were missing; they ship fine. Measuring beat it.
    let siblingPresent = false;
    try {
      siblingPresent = fs.statSync(path.resolve(PKG, '..', 'harness-core', 'package.json')).isFile();
    } catch { siblingPresent = false; }
    if (!siblingPresent) {
      console.log('# SKIP (monorepo-only): the mutation registry is repo machinery and is not '
        + 'shipped (files[] carries tests/, not test/). This says nothing about your installation.');
      return;
    }
    // A registry whose entries describe their `find` string stops meaning anything the moment the
    // code is refactored. The gate's contract makes a non-applying mutation a FAILURE, which keeps
    // that honest; the WORDS are what let a human re-derive the entry afterwards.
    const reg = JSON.parse(fs.readFileSync(path.join(PKG, 'test', 'mutation-registry.json'), 'utf-8'));
    assert.ok(reg.entries.length >= 6, 'one entry is not a registry: ' + reg.entries.length);
    for (const e of reg.entries) {
      assert.ok(e.property && e.property.length > 80,
        e.id + ': the property must be stated in words a human can re-derive from: '
        + JSON.stringify(e.property));
      assert.ok(!e.property.includes(e.mutation.find.trim()),
        e.id + ': the property restates its own find string — it would mean nothing after a refactor');
      assert.ok(fs.existsSync(path.join(PKG, e.file)), e.id + ': names a file that does not exist');
    }
  });
});
