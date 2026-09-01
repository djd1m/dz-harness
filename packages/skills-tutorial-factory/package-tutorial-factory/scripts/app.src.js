'use strict';
// app.src.js — the course SPA runtime, inlined verbatim into site/index.html by render-site.mjs.
// Kept as a standalone file so `node --check app.src.js` is a real syntax gate (a template-literal
// escape bug is invisible until the browser runs it, which is exactly how this file came to exist).
// No imports, no external requests: it reads the course object embedded in the page.
// Fully course-agnostic: every visible string is either structural UI or course data
// (optional fields: introNote, introHeading, outro.{pass,next}, exercise.successFeedback,
// per-section notebook). Canonical home: skills-tutorial-factory/package-tutorial-factory/scripts/ (origin:
// features/harness-cli-course/, frozen).

var COURSE = JSON.parse(document.getElementById('course-data').textContent);
// UI chrome strings. EN defaults live here; a localized table (chosen by course.language) is
// embedded by render-site.mjs as #ui-strings and MERGES over the defaults — one source, no drift.
var UI_EN = {
  achievement: 'Achievement — ', locked: 'Locked: ',
  flashHint: 'Click the card to flip it. See every card to clear this section.',
  sideFront: 'front', sideBack: 'back', seen: 'seen',
  prev: '\u2190 Prev', next: 'Next \u2192',
  matchHint: 'Click an item on the left, then its match on the right.', matched: 'matched',
  moveUp: 'Move up', moveDown: 'Move down',
  orderRight: 'Exactly right \u2014 that is the order it happens in.',
  orderPartial: '{n} of {len} in the right place. Green rows are correct; move the others.',
  checkOrder: 'Check the order',
  builderEmpty: 'click the parts below to build the command\u2026',
  builderCorrect: 'Correct \u2014 that is the exact command.', builderNot: 'Not yet \u2014 you built: ', nothing: '(nothing)',
  checkCommand: 'Check the command', clear: 'Clear',
  scenarioDone: 'Scenario complete \u2014 {p} of {n} calls were the strongest available option.',
  step: 'Step {i} of {n}', seeResult: 'See the result \u2192', nextStep: 'Next step \u2192',
  quiz: 'Quiz', quizComplete: '{label} complete \u2014 {r} / {n} correct ({p}%).', tryAgain: 'Try again',
  question: 'Question {i} of {n}', nextQuestion: 'Next question \u2192',
  brandTag: 'a Head First\u2013style course \u00b7 {n} sections', sectionsOf: '{c} / {n} sections',
  startHere: 'Start here', finalTest: 'Final test', faqNav: 'FAQ',
  achievements: 'Achievements \u2014 ', settings: 'Settings',
  light: '\u2600\ufe0f Light', dark: '\ud83c\udf19 Dark', resetConfirm: 'Reset all progress?', reset: '\u21ba Reset',
  sectionOf: 'Section {o} of {n}',
  patternTitle: 'the Head First pattern this section serves (method-KB id)',
  completed: 'completed \u00b7 ',
  notebookOf: "{name}'s notebook", notebook: 'Notebook',
  quartet: 'The reflective quartet', strengths: 'Strengths', weaknesses: 'Weaknesses', rating: 'Rating', wrapup: 'Wrap-up',
  doSomething: 'Do something \u2014 ', checkYourself: 'Check yourself', check: 'Check',
  types: {},
  meet: 'Meet ', whatYouLearn: 'What you will learn', startSection1: 'Start section 1 \u2192',
  finalH1: 'One question per section',
  finalLede: 'Pass mark is {p}%. {n} questions, one drawn from each section you just worked through.',
  fromSection: 'From section {o} \u2014 {t}.',
  passed: 'Passed \u2014 ', courseComplete: 'course complete.',
  notYet: 'Not yet \u2014 pass mark is {p}%.',
  revisit: 'Revisit any section from the sidebar whenever you need it.',
  reread: 'Re-read the sections behind the questions you missed, then try again.',
  lastSection: '\u2190 Last section',
  faqEyebrow: 'Sidebars are core', faqH1: 'Questions you are about to have',
  faqLede: 'These are not decoration. Each one is a real trap someone already fell into.'
};
var T = UI_EN;
try {
  var uiEl = document.getElementById('ui-strings');
  var uiOver = uiEl ? JSON.parse(uiEl.textContent) : null;
  if (uiOver) T = Object.assign({}, UI_EN, uiOver);
} catch (e) { /* keep EN */ }
function fmt(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
  });
}
function typeLabel(t) { return (T.types && T.types[t]) || t; }
var SECTIONS = COURSE.sections.slice().sort(function (a, b) { return a.order - b.order; });
var KEY = 'dz-course:' + (COURSE.courseTitle || 'course');
var PASS = COURSE.finalTestPassThreshold || 70;

// fresh() returns a NEW object each call — a shared `blank` template gets its nested objects
// mutated through the live state, which silently turns Reset into a no-op (Codex QE #6).
function fresh() { return { completed: {}, scores: {}, unlocked: [], finalScore: null, dark: false }; }
var S = load();
function load() {
  try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch (e) { return fresh(); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }

function $(s, r) { return (r || document).querySelector(s); }
function el(tag, attrs, kids) {
  var n = document.createElement(tag);
  attrs = attrs || {};
  for (var k in attrs) {
    if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
    var v = attrs[k];
    if (v === null || v === undefined) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  var list = [].concat(kids || []);
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (c === null || c === undefined || c === false) continue;
    n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return n;
}
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- markdown-lite: fenced code, inline code, **bold**, ordered lists, paragraphs --------------
var FENCE = '```';
function md(src) {
  var out = [];
  var blocks = String(src).split(/\n\n+/);
  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b];
    if (block.indexOf(FENCE) === 0) {
      var body = block
        .replace(new RegExp('^' + FENCE + '[a-z]*\\n?'), '')
        .replace(new RegExp('\\n?' + FENCE + '$'), '');
      out.push('<pre><code>' + escHtml(body) + '</code></pre>');
      continue;
    }
    var lines = block.split('\n');
    var allNumbered = lines.length > 0 && lines.every(function (l) { return /^\s*\d+\.\s/.test(l); });
    if (allNumbered) {
      out.push('<ol>' + lines.map(function (l) {
        return '<li>' + inline(l.replace(/^\s*\d+\.\s/, '')) + '</li>';
      }).join('') + '</ol>');
      continue;
    }
    var allBullets = lines.length > 0 && lines.every(function (l) { return /^\s*[-\u2022]\s/.test(l); });
    if (allBullets) {
      out.push('<ul>' + lines.map(function (l) {
        return '<li>' + inline(l.replace(/^\s*[-\u2022]\s/, '')) + '</li>';
      }).join('') + '</ul>');
      continue;
    }
    out.push('<p>' + inline(block).replace(/\n/g, '<br>') + '</p>');
  }
  return out.join('');
}
function inline(s) {
  return escHtml(s)
    .replace(/`([^`]+)`/g, function (m, c) { return '<code>' + c + '</code>'; })
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

// --- achievements ------------------------------------------------------------------------------
function completedCount() {
  return SECTIONS.filter(function (s) { return S.completed[s.id]; }).length;
}
function evalCondition(cr) {
  if (!cr) return false;
  switch (cr.type) {
    case 'sections-completed': return completedCount() >= cr.n;
    case 'all-sections': return completedCount() >= SECTIONS.length;
    case 'perfect-section': return Object.keys(S.scores).some(function (k) { return S.scores[k] >= 100; });
    case 'final-test-pass': return S.finalScore !== null && S.finalScore >= cr.min;
    case 'section-group': return cr.ids.every(function (id) { return !!S.completed[id]; });
    default: return false;
  }
}
var toastTimer = null;
function toast(a) {
  var old = $('.toast');
  if (old) old.remove();
  var t = el('div', { class: 'toast', role: 'status' }, [
    el('span', { class: 'ic' }, a.icon || '🏆'),
    el('div', {}, [el('b', {}, T.achievement + a.title), el('small', {}, a.description)])
  ]);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.remove(); }, 5200);
}
function syncAchievements() {
  for (var i = 0; i < COURSE.achievements.length; i++) {
    var a = COURSE.achievements[i];
    if (S.unlocked.indexOf(a.id) === -1 && evalCondition(a.conditionRef)) {
      S.unlocked.push(a.id);
      save();
      toast(a);
    }
  }
}
function setScore(id, pct) {
  var prev = S.scores[id];
  S.scores[id] = (prev === undefined) ? pct : Math.max(prev, pct);
  S.completed[id] = true;
  save();
  syncAchievements();
  renderAside();
}

// --- the 6 edu-site interactive types -----------------------------------------------------------
function exFlashcards(sec, done) {
  var cards = sec.exercise.cards;
  var i = 0, back = false;
  var seen = {};
  var wrap = el('div', {});
  var face = el('div', { class: 'flash-inner', role: 'button', tabindex: '0' });
  var counter = el('span', { class: 'score-pill' });
  function draw() {
    seen[i] = true;
    var n = Object.keys(seen).length;
    face.innerHTML = '<span class="side">' + (back ? T.sideBack : T.sideFront) + '</span>' + md(back ? cards[i].back : cards[i].front);
    counter.textContent = (i + 1) + ' / ' + cards.length + ' · ' + n + ' ' + T.seen;
    if (n === cards.length) done(100);
  }
  face.addEventListener('click', function () { back = !back; draw(); });
  face.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); back = !back; draw(); }
  });
  wrap.appendChild(el('p', { class: 'hint' }, T.flashHint));
  wrap.appendChild(el('div', { class: 'flash' }, [face]));
  wrap.appendChild(el('div', { class: 'row' }, [
    el('button', { class: 'btn ghost', onclick: function () { i = (i - 1 + cards.length) % cards.length; back = false; draw(); } }, T.prev),
    el('button', { class: 'btn', onclick: function () { i = (i + 1) % cards.length; back = false; draw(); } }, T.next),
    el('span', { class: 'spacer', style: 'flex:1' }),
    counter
  ]));
  draw();
  return wrap;
}

function exMatching(sec, done) {
  var pairs = sec.exercise.pairs;
  var order = pairs.map(function (p, i) { return i; });
  // deterministic, non-identity shuffle of the right column
  var rights = order.slice().sort(function (a, b) {
    return (pairs[a].right.length % 7) - (pairs[b].right.length % 7) || b - a;
  });
  var sel = null;
  var solved = {};
  var solvedCount = 0;
  var wrap = el('div', {});
  var status = el('span', { class: 'score-pill' });
  var L = el('div', {});
  var R = el('div', {});
  function refresh() {
    status.textContent = solvedCount + ' / ' + pairs.length + ' ' + T.matched;
    if (solvedCount === pairs.length) done(100);
  }
  order.forEach(function (i) {
    var b = el('button', { class: 'chip' }, pairs[i].left);
    b.setAttribute('data-i', String(i));
    b.addEventListener('click', function () {
      if (solved[i]) return;
      var kids = L.children;
      for (var q = 0; q < kids.length; q++) kids[q].classList.remove('sel');
      b.classList.add('sel');
      sel = i;
    });
    L.appendChild(b);
  });
  rights.forEach(function (i) {
    var b = el('button', { class: 'chip' }, pairs[i].right);
    b.setAttribute('data-i', String(i));
    b.addEventListener('click', function () {
      if (solved[i] || sel === null) return;
      if (sel === i) {
        solved[i] = true;
        solvedCount++;
        b.classList.add('done');
        b.classList.remove('sel');
        var lb = L.querySelector('[data-i="' + i + '"]');
        if (lb) { lb.classList.add('done'); lb.classList.remove('sel'); }
        sel = null;
        refresh();
      } else {
        b.classList.add('miss');
        setTimeout(function () { b.classList.remove('miss'); }, 320);
      }
    });
    R.appendChild(b);
  });
  wrap.appendChild(el('p', { class: 'hint' }, T.matchHint));
  wrap.appendChild(el('div', { class: 'match-grid' }, [L, R]));
  wrap.appendChild(el('div', { class: 'row' }, [el('span', { class: 'spacer', style: 'flex:1' }), status]));
  refresh();
  return wrap;
}

function exDragOrder(sec, done) {
  var ex = sec.exercise;
  var byId = {};
  ex.items.forEach(function (it) { byId[it.id] = it; });
  var cur = ex.items.map(function (it) { return it.id; }).slice().reverse();
  var wrap = el('div', {});
  var list = el('div', {});
  var status = el('div', {});
  function move(k, d) {
    var j = cur.indexOf(k), t = j + d;
    if (t < 0 || t >= cur.length) return;
    cur.splice(j, 1);
    cur.splice(t, 0, k);
    draw(false);
  }
  function draw(checked) {
    list.innerHTML = '';
    cur.forEach(function (id, n) {
      var right = checked ? (ex.correctOrder[n] === id) : null;
      list.appendChild(el('div', { class: 'order-item' + (right === true ? ' ok' : right === false ? ' no' : '') }, [
        el('span', { class: 'idx' }, (n + 1) + '.'),
        el('span', { class: 'grab' }, '⣿'),
        el('span', { style: 'flex:1' }, byId[id].label),
        el('button', { class: 'mini', title: T.moveUp, onclick: function () { move(id, -1); } }, '↑'),
        el('button', { class: 'mini', title: T.moveDown, onclick: function () { move(id, 1); } }, '↓')
      ]));
    });
  }
  wrap.appendChild(el('p', { class: 'hint' }, ex.instruction));
  wrap.appendChild(list);
  draw(false);
  wrap.appendChild(el('div', { class: 'row', style: 'margin-top:12px' }, [
    el('button', { class: 'btn', onclick: function () {
      draw(true);
      var n = cur.filter(function (id, k) { return ex.correctOrder[k] === id; }).length;
      var pct = Math.round(100 * n / cur.length);
      status.innerHTML = '';
      status.appendChild(el('div', { class: 'explain ' + (pct === 100 ? 'good' : 'mid') },
        pct === 100
          ? T.orderRight
          : fmt(T.orderPartial, { n: n, len: cur.length })));
      if (pct === 100) done(100);
    } }, T.checkOrder)
  ]));
  wrap.appendChild(status);
  return wrap;
}

function exBuilder(sec, done) {
  var ex = sec.exercise;
  var built = [];
  var hintsShown = 0;
  var wrap = el('div', {});
  var line = el('div', { class: 'build-line' });
  var parts = el('div', { class: 'row', style: 'margin-top:12px' });
  var status = el('div', {});
  function drawLine() {
    line.innerHTML = '';
    if (!built.length) {
      line.appendChild(el('span', { style: 'color:var(--muted)' }, T.builderEmpty));
    }
    built.forEach(function (p, i) {
      line.appendChild(el('span', { class: 'tok', title: 'remove', onclick: function () { built.splice(i, 1); drawLine(); drawParts(); } }, p));
    });
  }
  function drawParts() {
    parts.innerHTML = '';
    ex.parts.forEach(function (p) {
      var budget = ex.parts.filter(function (x) { return x === p; }).length;
      var used = built.filter(function (x) { return x === p; }).length >= budget;
      parts.appendChild(el('button', {
        class: 'part',
        disabled: used ? 'disabled' : null,
        onclick: function () { built.push(p); drawLine(); drawParts(); }
      }, p));
    });
  }
  wrap.appendChild(el('p', { class: 'hint' }, ex.instruction));
  wrap.appendChild(line);
  wrap.appendChild(parts);
  wrap.appendChild(el('div', { class: 'row', style: 'margin-top:12px' }, [
    el('button', { class: 'btn', onclick: function () {
      var got = built.join(' ').replace(/\s+/g, ' ').trim();
      var want = ex.correctCommand.replace(/\s+/g, ' ').trim();
      status.innerHTML = '';
      if (got === want) {
        status.appendChild(el('div', { class: 'explain good' },
          ex.successFeedback || T.builderCorrect));
        done(100);
      } else {
        status.appendChild(el('div', { class: 'explain bad' }, T.builderNot + (got || T.nothing)));
        var h = ex.hints && ex.hints[Math.min(hintsShown, ex.hints.length - 1)];
        hintsShown++;
        if (h) status.appendChild(el('p', { class: 'hint' }, h));
      }
    } }, T.checkCommand),
    el('button', { class: 'btn ghost', onclick: function () { built = []; drawLine(); drawParts(); status.innerHTML = ''; } }, T.clear)
  ]));
  wrap.appendChild(status);
  drawLine();
  drawParts();
  return wrap;
}

function exScenario(sec, done) {
  var ex = sec.exercise;
  var step = 0, points = 0;
  var wrap = el('div', {});
  var body = el('div', {});
  wrap.appendChild(el('h3', { style: 'margin:0 0 6px;font-size:17px' }, ex.title));
  wrap.appendChild(el('div', { class: 'lede', style: 'margin-bottom:4px', html: md(ex.scenario) }));
  function draw() {
    body.innerHTML = '';
    if (step >= ex.steps.length) {
      var pct = Math.round(100 * points / ex.steps.length);
      body.appendChild(el('div', { class: 'explain ' + (pct >= 67 ? 'good' : 'mid') },
        fmt(T.scenarioDone, { p: points, n: ex.steps.length })));
      done(Math.max(pct, 60));
      return;
    }
    var st = ex.steps[step];
    body.appendChild(el('div', { class: 'score-pill', style: 'display:inline-block;margin-bottom:8px' },
      fmt(T.step, { i: step + 1, n: ex.steps.length })));
    body.appendChild(el('p', { style: 'font-weight:600;margin:.2em 0 .6em', html: inline(st.description) }));
    st.options.forEach(function (o) {
      var btn = el('button', { class: 'opt' }, o.text);
      btn.addEventListener('click', function () {
        var opts = body.querySelectorAll('.opt');
        for (var q = 0; q < opts.length; q++) opts[q].disabled = true;
        btn.classList.add('chosen');
        if (o.result === 'positive') { btn.classList.add('correct'); points++; }
        else if (o.result === 'negative') { btn.classList.add('wrong'); }
        body.appendChild(el('div', { class: 'explain ' + (o.result === 'positive' ? 'good' : o.result === 'negative' ? 'bad' : 'mid') }, o.feedback));
        body.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, [
          el('button', { class: 'btn', onclick: function () { step++; draw(); } },
            (step + 1 >= ex.steps.length) ? T.seeResult : T.nextStep)
        ]));
      });
      body.appendChild(btn);
    });
  }
  wrap.appendChild(body);
  draw();
  return wrap;
}

function exQuiz(sec, done, questions, label) {
  var qs = questions || (sec && sec.quiz) || [];
  var i = 0, right = 0;
  var wrap = el('div', {});
  var body = el('div', {});
  function draw() {
    body.innerHTML = '';
    if (i >= qs.length) {
      var pct = Math.round(100 * right / qs.length);
      body.appendChild(el('div', { class: 'explain ' + (pct >= 70 ? 'good' : 'mid') },
        fmt(T.quizComplete, { label: label || T.quiz, r: right, n: qs.length, p: pct })));
      body.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, [
        el('button', { class: 'btn ghost', onclick: function () { i = 0; right = 0; draw(); } }, T.tryAgain)
      ]));
      done(pct);
      return;
    }
    var q = qs[i];
    body.appendChild(el('div', { class: 'score-pill', style: 'display:inline-block;margin-bottom:8px' },
      fmt(T.question, { i: i + 1, n: qs.length })));
    body.appendChild(el('p', { style: 'font-weight:600;margin:.2em 0 .6em', html: inline(q.question) }));
    q.options.forEach(function (o, k) {
      var btn = el('button', { class: 'opt' }, o);
      btn.addEventListener('click', function () {
        var opts = body.querySelectorAll('.opt');
        for (var n = 0; n < opts.length; n++) {
          opts[n].disabled = true;
          if (n === q.correctAnswer) opts[n].classList.add('correct');
        }
        btn.classList.add('chosen');
        if (k === q.correctAnswer) right++; else btn.classList.add('wrong');
        if (q.explanation) {
          body.appendChild(el('div', { class: 'explain ' + (k === q.correctAnswer ? 'good' : 'bad') }, q.explanation));
        }
        body.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, [
          el('button', { class: 'btn', onclick: function () { i++; draw(); } },
            (i + 1 >= qs.length) ? T.seeResult : T.nextQuestion)
        ]));
      });
      body.appendChild(btn);
    });
  }
  wrap.appendChild(body);
  draw();
  return wrap;
}

var RENDERERS = {
  flashcards: exFlashcards,
  matching: exMatching,
  'drag-and-drop': exDragOrder,
  ordering: exDragOrder,
  builder: exBuilder,
  scenario: exScenario,
  simulation: exScenario,
  quiz: exQuiz
};

// --- views ---------------------------------------------------------------------------------------
var view = { kind: 'intro', i: 0 };

function renderAside() {
  var a = $('#aside');
  a.innerHTML = '';
  a.appendChild(el('div', { class: 'brand' }, [
    COURSE.courseTitle,
    el('small', {}, fmt(T.brandTag, { n: SECTIONS.length }))
  ]));
  var pct = Math.round(100 * completedCount() / SECTIONS.length);
  a.appendChild(el('div', { class: 'progress-wrap' }, [
    el('div', { class: 'bar' }, [el('i', { style: 'width:' + pct + '%' })]),
    el('div', { class: 'progress-label' }, [
      el('span', {}, fmt(T.sectionsOf, { c: completedCount(), n: SECTIONS.length })),
      el('span', {}, pct + '%')
    ])
  ]));
  var ul = el('ul', {});
  ul.appendChild(el('li', {}, [el('button', {
    'aria-current': view.kind === 'intro' ? 'true' : 'false',
    onclick: function () { go({ kind: 'intro' }); }
  }, [el('span', { class: 'tick' }, ''), '🧭 ' + T.startHere])]));
  SECTIONS.forEach(function (s, k) {
    ul.appendChild(el('li', {}, [el('button', {
      'aria-current': (view.kind === 'section' && view.i === k) ? 'true' : 'false',
      onclick: function () { go({ kind: 'section', i: k }); }
    }, [
      el('span', { class: 'tick' }, S.completed[s.id] ? '✓' : ''),
      s.icon + ' ' + s.order + '. ' + s.shortTitle
    ])]));
  });
  ul.appendChild(el('li', {}, [el('button', {
    'aria-current': view.kind === 'final' ? 'true' : 'false',
    onclick: function () { go({ kind: 'final' }); }
  }, [el('span', { class: 'tick' }, (S.finalScore !== null && S.finalScore >= PASS) ? '✓' : ''), '🎯 ' + T.finalTest])]));
  ul.appendChild(el('li', {}, [el('button', {
    'aria-current': view.kind === 'faq' ? 'true' : 'false',
    onclick: function () { go({ kind: 'faq' }); }
  }, [el('span', { class: 'tick' }, ''), '❓ ' + T.faqNav])]));
  a.appendChild(el('nav', {}, [ul]));

  a.appendChild(el('div', { class: 'navhead' }, T.achievements + S.unlocked.length + ' / ' + COURSE.achievements.length));
  var grid = el('div', { class: 'ach-grid' });
  COURSE.achievements.forEach(function (ac) {
    var on = S.unlocked.indexOf(ac.id) !== -1;
    grid.appendChild(el('div', {
      class: 'ach' + (on ? ' on' : ''),
      title: on ? (ac.title + ' — ' + ac.description) : (T.locked + ac.description)
    }, ac.icon));
  });
  a.appendChild(grid);

  a.appendChild(el('div', { class: 'navhead' }, T.settings));
  a.appendChild(el('div', { class: 'row' }, [
    el('button', { class: 'btn ghost', onclick: function () { S.dark = !S.dark; save(); applyTheme(); } },
      S.dark ? T.light : T.dark),
    el('button', { class: 'btn ghost', onclick: function () {
      if (window.confirm(T.resetConfirm)) { S = Object.assign(fresh(), { dark: S.dark }); save(); go(view); }
    } }, T.reset)
  ]));
}

// --- diagram: a flow drawn from DATA, never from author markup ------------------------------------
// Every label goes in through textContent, so a `<script>` in a label is shown as those letters and
// nothing else — the injection seam simply does not exist rather than being filtered.
function renderDiagram(d) {
  if (!d || !Array.isArray(d.nodes) || d.nodes.length < 2) return null;
  var kinds = { flow: dgFlow, compare: dgCompare, scale: dgScale, parts: dgParts };
  var draw = kinds[d.kind];
  if (!draw) return null;
  var fig = el('figure', { class: 'diagram dg-' + d.kind });
  fig.appendChild(draw(d));
  if (d.title) fig.appendChild(el('figcaption', {}, String(d.title)));
  return fig;
}

// flow — a sequence: each step leads to the next, optionally closing the circle.
function dgFlow(d) {
  var track = el('div', { class: 'dg-track' });
  d.nodes.forEach(function (n, i) {
    if (i > 0) track.appendChild(el('span', { class: 'dg-arrow', 'aria-hidden': 'true' }, '→'));
    track.appendChild(dgBox(n));
  });
  if (d.cycle === true) track.appendChild(el('span', { class: 'dg-cycle' }, '↻ и снова'));
  return track;
}

// compare — options side by side: the reader is choosing, not walking a path.
function dgCompare(d) {
  var grid = el('div', { class: 'dg-grid' });
  d.nodes.forEach(function (n) {
    var col = el('div', { class: 'dg-col' + (n.accent === true ? ' dg-accent' : '') }, [el('b', {}, String(n.label == null ? '' : n.label))]);
    if (n.note) col.appendChild(el('small', {}, String(n.note)));
    if (Array.isArray(n.items)) {
      var ul = el('ul', { class: 'dg-items' });
      n.items.forEach(function (it) { ul.appendChild(el('li', {}, String(it))); });
      col.appendChild(ul);
    }
    grid.appendChild(col);
  });
  return grid;
}

// scale — rungs where POSITION carries meaning: higher is cheaper/louder, lower is weaker/silent.
function dgScale(d) {
  var wrap = el('div', { class: 'dg-scale-wrap' });
  if (d.topLabel) wrap.appendChild(el('div', { class: 'dg-edge' }, String(d.topLabel)));
  d.nodes.forEach(function (n, i) {
    var rung = el('div', { class: 'dg-rung' + (n.accent === true ? ' dg-accent' : '') }, [
      el('span', { class: 'dg-rung-n' }, String(i + 1)),
      el('b', {}, String(n.label == null ? '' : n.label)),
    ]);
    if (n.note) rung.appendChild(el('small', {}, String(n.note)));
    wrap.appendChild(rung);
  });
  if (d.bottomLabel) wrap.appendChild(el('div', { class: 'dg-edge' }, String(d.bottomLabel)));
  return wrap;
}

// parts — a whole and its required parts: removing one breaks the whole, order is irrelevant.
function dgParts(d) {
  var wrap = el('div', { class: 'dg-parts-wrap' });
  if (d.whole) wrap.appendChild(el('div', { class: 'dg-whole' }, String(d.whole)));
  var row = el('div', { class: 'dg-track' });
  d.nodes.forEach(function (n, i) {
    if (i > 0) row.appendChild(el('span', { class: 'dg-plus', 'aria-hidden': 'true' }, '+'));
    row.appendChild(dgBox(n));
  });
  wrap.appendChild(row);
  return wrap;
}

function dgBox(n) {
  var box = el('div', { class: 'dg-node' + (n.accent === true ? ' dg-accent' : '') }, [el('b', {}, String(n.label == null ? '' : n.label))]);
  if (n.note) box.appendChild(el('small', {}, String(n.note)));
  return box;
}

function sectionView(k) {
  var s = SECTIONS[k];
  var m = $('#main');
  m.innerHTML = '';
  m.appendChild(el('div', { class: 'meta-row' }, [
    el('span', { class: 'eyebrow' }, fmt(T.sectionOf, { o: s.order, n: SECTIONS.length })),
    el('span', { class: 'pattern-chip', title: (T.patternNames && T.patternNames[s.methodPattern]) || T.patternTitle }, 'Head First ' + s.methodPattern),
    S.completed[s.id] ? el('span', { class: 'score-pill good' }, T.completed + (S.scores[s.id] || 0) + '%') : null
  ]));
  m.appendChild(el('h1', {}, s.icon + '  ' + s.title));
  m.appendChild(el('p', { class: 'lede' }, s.description));
  m.appendChild(el('div', { class: 'card theory', html: md(s.theory) }));
  var dg = renderDiagram(s.diagram);
  if (dg !== null) m.appendChild(dg);

  // The persona's notebook — the second recurring visual device. One hand-written margin note per
  // section, in the persona's own voice, stamped with when it was written: the reader watches the
  // character grow across the course instead of being told that she did.
  if (s.notebook && s.notebook.note) {
    m.appendChild(el('div', { class: 'notebook' }, [
      el('h3', {}, [
        ((COURSE.persona && COURSE.persona.name) ? fmt(T.notebookOf, { name: COURSE.persona.name }) : T.notebook),
        s.notebook.when ? el('span', { class: 'when' }, s.notebook.when) : null
      ]),
      el('p', { html: inline(s.notebook.note) })
    ]));
  }

  var r = s.reflection;
  m.appendChild(el('div', { class: 'reflect' }, [
    el('h3', {}, T.quartet),
    el('dl', {}, [
      el('dt', {}, T.strengths), el('dd', {}, r.strengths),
      el('dt', {}, T.weaknesses), el('dd', {}, r.weaknesses),
      el('dt', {}, T.rating), el('dd', {}, String(r.rating)),
      el('dt', {}, T.wrapup), el('dd', {}, r.wrapup)
    ])
  ]));

  m.appendChild(el('h2', {}, T.doSomething + typeLabel(s.interactiveType)));
  var exCard = el('div', { class: 'card' });
  var rend = RENDERERS[s.interactiveType] || exQuiz;
  exCard.appendChild(rend(s, function (pct) { setScore(s.id, pct); }));
  m.appendChild(exCard);

  if (s.interactiveType !== 'quiz' && s.quiz && s.quiz.length) {
    m.appendChild(el('h2', {}, T.checkYourself));
    var qc = el('div', { class: 'card' });
    qc.appendChild(exQuiz(s, function (pct) { setScore(s.id, Math.max(pct, S.scores[s.id] || 0)); }, s.quiz, T.check));
    m.appendChild(qc);
  }

  m.appendChild(el('div', { class: 'footer-nav' }, [
    k > 0
      ? el('button', { class: 'btn ghost', onclick: function () { go({ kind: 'section', i: k - 1 }); } }, '← ' + SECTIONS[k - 1].shortTitle)
      : el('button', { class: 'btn ghost', onclick: function () { go({ kind: 'intro' }); } }, '\u2190 ' + T.startHere),
    el('span', { class: 'spacer', style: 'flex:1' }),
    el('button', { class: 'btn', onclick: function () {
      // Partial credit BY DESIGN: skimming to the next section grants 60%, never 100% — the
      // perfect-section achievement and a full score still require doing the exercise.
      if (!S.completed[s.id]) setScore(s.id, S.scores[s.id] || 60);
      go(k + 1 < SECTIONS.length ? { kind: 'section', i: k + 1 } : { kind: 'final' });
    } }, k + 1 < SECTIONS.length ? (SECTIONS[k + 1].shortTitle + ' →') : T.finalTest + ' \u2192')
  ]));
}

function introView() {
  var m = $('#main');
  m.innerHTML = '';
  m.appendChild(el('span', { class: 'eyebrow' }, T.startHere));
  m.appendChild(el('h1', {}, COURSE.courseTitle));
  m.appendChild(el('p', { class: 'lede' }, COURSE.courseDescription));
  m.appendChild(el('div', { class: 'card' }, [
    el('h2', { style: 'margin-top:0' }, T.meet + COURSE.persona.name),
    el('p', {}, COURSE.persona.description),
    // Optional course-authored honesty/context note (introNote). No fabricated default: if the
    // author wrote nothing, nothing is shown.
    COURSE.introNote ? el('p', { style: 'color:var(--muted);font-size:14.5px' }, COURSE.introNote) : null
  ]));
  m.appendChild(el('h2', {}, COURSE.introHeading || T.whatYouLearn));
  SECTIONS.forEach(function (s, k) {
    m.appendChild(el('div', {
      class: 'card', style: 'margin:10px 0;padding:16px 20px;cursor:pointer',
      onclick: function () { go({ kind: 'section', i: k }); }
    }, [
      el('div', { class: 'meta-row' }, [
        el('strong', { style: 'font-size:16px' }, s.icon + '  ' + s.title),
        el('span', { class: 'pattern-chip' }, s.methodPattern),
        S.completed[s.id] ? el('span', { class: 'score-pill good' }, '✓') : null
      ]),
      el('div', { style: 'color:var(--muted);font-size:14.5px' }, s.description)
    ]));
  });
  m.appendChild(el('div', { class: 'footer-nav' }, [
    el('span', { class: 'spacer', style: 'flex:1' }),
    el('button', { class: 'btn', onclick: function () { go({ kind: 'section', i: 0 }); } }, T.startSection1)
  ]));
}

function finalView() {
  var m = $('#main');
  m.innerHTML = '';
  m.appendChild(el('span', { class: 'eyebrow' }, T.finalTest));
  m.appendChild(el('h1', {}, '🎯 ' + T.finalH1));
  m.appendChild(el('p', { class: 'lede' },
    fmt(T.finalLede, { p: PASS, n: SECTIONS.length })));
  var qs = SECTIONS.map(function (s) {
    return {
      id: s.finalTest.id,
      question: s.finalTest.question,
      options: s.finalTest.options,
      correctAnswer: s.finalTest.correctAnswer,
      explanation: fmt(T.fromSection, { o: s.order, t: s.shortTitle })
    };
  });
  var result = el('div', {});
  var card = el('div', { class: 'card' });
  card.appendChild(exQuiz(null, function (pct) {
    S.finalScore = Math.max(S.finalScore === null ? 0 : S.finalScore, pct);
    save();
    syncAchievements();
    renderAside();
    result.innerHTML = '';
    result.appendChild(el('div', { class: 'card', style: 'text-align:center' }, [
      el('div', { class: 'big-score', style: 'color:' + (pct >= PASS ? 'var(--ok)' : 'var(--bad)') }, pct + '%'),
      // 'Passed' is STRUCTURAL (verify-site keys on it); the flavour after the dash is course data.
      el('p', { style: 'font-weight:600;margin:.5em 0 .2em' },
        pct >= PASS ? T.passed + ((COURSE.outro && COURSE.outro.pass) || T.courseComplete) : fmt(T.notYet, { p: PASS })),
      el('p', { style: 'color:var(--muted);font-size:14.5px' },
        pct >= PASS
          ? ((COURSE.outro && COURSE.outro.next) || T.revisit)
          : T.reread)
    ]));
  }, qs, T.finalTest));
  m.appendChild(card);
  m.appendChild(result);
  m.appendChild(el('div', { class: 'footer-nav' }, [
    el('button', { class: 'btn ghost', onclick: function () { go({ kind: 'section', i: SECTIONS.length - 1 }); } }, T.lastSection),
    el('span', { class: 'spacer', style: 'flex:1' }),
    el('button', { class: 'btn ghost', onclick: function () { go({ kind: 'faq' }); } }, T.faqNav + ' \u2192')
  ]));
}

function faqView() {
  var m = $('#main');
  m.innerHTML = '';
  m.appendChild(el('span', { class: 'eyebrow' }, T.faqEyebrow));
  m.appendChild(el('h1', {}, '❓ ' + T.faqH1));
  m.appendChild(el('p', { class: 'lede' }, T.faqLede));
  var box = el('div', { class: 'faq' });
  COURSE.faqData.forEach(function (f) {
    box.appendChild(el('details', {}, [
      el('summary', {}, f.question),
      el('div', { class: 'a', html: md(f.answer) })
    ]));
  });
  m.appendChild(box);
  m.appendChild(el('div', { class: 'footer-nav' }, [
    el('button', { class: 'btn ghost', onclick: function () { go({ kind: 'intro' }); } }, '\u2190 ' + T.startHere),
    el('span', { class: 'spacer', style: 'flex:1' })
  ]));
}

function applyTheme() {
  document.documentElement.classList.toggle('dark', !!S.dark);
  renderAside();
}

function go(v) {
  view = v;
  if (v.kind === 'section') sectionView(v.i);
  else if (v.kind === 'final') finalView();
  else if (v.kind === 'faq') faqView();
  else introView();
  renderAside();
  window.scrollTo(0, 0);
}

document.title = COURSE.courseTitle;
applyTheme();
syncAchievements();
go({ kind: 'intro' });
