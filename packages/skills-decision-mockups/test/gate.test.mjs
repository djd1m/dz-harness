// Run the shipped gate and picker against the documented synthetic fragments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const skill = join(here, '..', 'decision-mockups');
const gate = join(skill, 'references', 'check_page.py');
const skeleton = join(skill, 'templates', 'page-skeleton.html');
const template = readFileSync(skeleton, 'utf8');
const examples = readFileSync(join(skill, 'examples', 'README.md'), 'utf8');
const fragments = [...examples.matchAll(/```html\n([\s\S]*?)\n```/g)].map(m => m[1]);
const outputs = [...examples.matchAll(/```text\n([\s\S]*?)\n```/g)].map(m => m[1]);
const forkIds = ['lesson-date', 'lesson-reminder', 'lesson-launch'];
const run = (...args) => spawnSync('python3', [gate, ...args], { encoding: 'utf8' });

function assemble(parts) {
  const start = template.indexOf('<div class="wrap">');
  const end = template.indexOf('<!-- Липкая полоса.');
  assert.ok(start > 0 && end > start, 'real template boundaries exist');
  return (template.slice(0, start) + '<div class="wrap">\n' + parts.join('\n') + '\n</div>\n' + template.slice(end))
    .replace(/ЗАМЕНИТЬ — тема/g, 'записи на занятия')
    .replace(/ЗАМЕНИТЬ — дата/g, '04.05.2032')
    .replace(/ЗАМЕНИТЬ-picks/g, 'lesson-picks')
    .replace(/ЗАМЕНИТЬ/g, 'Учебные занятия')
    .replace(/<тема>/g, 'записи на занятия').replace(/<дата>/g, '04.05.2032');
}

// Focused DOM adapter: parse real assembled markup, expose only picker-used methods.
// This verifies JavaScript behavior, not browser rendering or accessibility.
function domOf(html) {
  const nodes = [], stack = [];
  function node(attrs) {
    const classes = new Set((attrs.class || '').split(/\s+/));
    return {
      attrs, children: [], events: {}, textContent: '', hidden: 'hidden' in attrs, style: {}, offsetHeight: 58,
      getAttribute(name) { return this.attrs[name] ?? null; },
      setAttribute(name, value) { this.attrs[name] = value; },
      classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); }, contains: name => classes.has(name) },
      addEventListener(name, fn) { (this.events[name] ||= []).push(fn); },
      fire(name, event = {}) { for (const fn of this.events[name] || []) fn(event); },
      querySelectorAll(selector) {
        const attr = selector.match(/^\[([^\]]+)\]$/)?.[1], found = [];
        assert.ok(attr, 'adapter supports the actual picker selector');
        function visit(n) { for (const child of n.children) { if (attr in child.attrs) found.push(child); visit(child); } }
        visit(this); return found;
      }
    };
  }
  const source = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>|<!--[\s\S]*?-->/g, '');
  for (const token of source.matchAll(/<\/?([\w-]+)\b([^>]*?)>|([^<]+)/g)) {
    if (token[3]) { if (stack.length) stack.at(-1).textContent += token[3].trim(); continue; }
    if (token[0].startsWith('</')) { stack.pop(); continue; }
    const attrs = {};
    for (const attr of token[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[attr[1]] = attr[2] ?? '';
    const n = node(attrs); nodes.push(n);
    if (stack.length) stack.at(-1).children.push(n);
    if (!['br', 'hr', 'input', 'meta'].includes(token[1]) && !token[0].endsWith('/>')) stack.push(n);
  }
  return {
    readyState: 'complete', body: { style: {} },
    getElementById(id) { return nodes.find(n => n.attrs.id === id) || null; },
    querySelectorAll(selector) {
      const attr = selector.match(/^\[([^\]]+)\]$/)?.[1]; assert.ok(attr);
      return nodes.filter(n => attr in n.attrs);
    }
  };
}

function pickerOf(html, mode, storage = new Map()) {
  const document = domOf(html), copied = [];
  const context = {
    document, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    navigator: { clipboard: { writeText: value => { copied.push(value); return Promise.resolve(); } } },
    setTimeout: () => 1, clearTimeout: () => {}
  };
  context.window = context;
  const source = mode === 'module' ? readFileSync(join(skill, 'templates', 'picker.js'), 'utf8') : html.match(/<script>([\s\S]*?)<\/script>/)[1];
  if (mode === 'module') {
    const bar = document.getElementById('pickbar');
    bar.setAttribute('data-key', 'lesson-picks');
    bar.setAttribute('data-topic', 'записи на занятия');
    bar.setAttribute('data-date', '04.05.2032');
  }
  runInNewContext(source, context);
  const groups = document.querySelectorAll('[data-group]');
  return {
    document, groups, storage,
    pick(index, option = 0, key) {
      const item = groups[index].querySelectorAll('[data-val]')[option];
      if (key) item.fire('keydown', { key, preventDefault() {} }); else item.fire('click');
      return item;
    },
    exportText() { document.getElementById('pb-copy').fire('click'); return copied.at(-1); }
  };
}

test('unfilled skeleton fails specifically for placeholders', () => {
  const r = run(skeleton); assert.equal(r.status, 1); assert.match(r.stdout, /G13/);
});
test('missing argument is a call error (2)', () => assert.equal(run().status, 2));
test('nonexistent path is a call error (2)', () => assert.equal(run(join(here, 'no-such-page.html')).status, 2));
test('gate uses only its declared Python stdlib dependencies', () => {
  assert.deepEqual(readFileSync(gate, 'utf8').match(/^(?:import|from) .+$/gm), ['import re, sys, os, collections']);
});

test('every documented fragment and the combined page pass the actual checker', () => {
  assert.equal(fragments.length, 3, 'never pass an empty or incomplete extraction');
  assert.equal(outputs.length, 2, 'both documented export contracts exist');
  const dir = mkdtempSync(join(tmpdir(), 'synthetic-decisions-'));
  try {
    for (const [i, parts] of [...fragments.map(f => [f]), fragments].entries()) {
      const html = assemble(parts), path = join(dir, `page-${i}.html`);
      assert.deepEqual(domOf(html).querySelectorAll('[data-group]').map(n => n.getAttribute('data-group')), i < 3 ? [forkIds[i]] : forkIds);
      writeFileSync(path, html);
      const r = run(path); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /RESULT: GREEN/);
    }
  } finally { rmSync(dir, { recursive: true }); }
});

for (const mode of ['module', 'inline']) {
  test(`${mode} picker exports actual partial and complete answers as documented`, () => {
    assert.equal(fragments.length, 3); assert.equal(outputs.length, 2);
    const html = assemble(fragments), picker = pickerOf(html, mode);
    assert.deepEqual(picker.groups.map(n => n.getAttribute('data-group')), forkIds);
    assert.equal(picker.document.getElementById('pb-total').textContent, '3');
    assert.equal(picker.document.getElementById('pickbar').hidden, true);
    const first = picker.pick(0); picker.pick(2, 0, 'Enter');
    assert.equal(first.getAttribute('aria-pressed'), 'true'); assert.equal(first.classList.contains('picked'), true);
    assert.equal(picker.document.getElementById('pb-n').textContent, '2');
    assert.equal(picker.exportText(), outputs[0]);
    picker.pick(1, 0, ' '); assert.equal(picker.exportText(), outputs[1]);
    assert.equal(pickerOf(html, mode, picker.storage).exportText(), outputs[1], 'fresh instance restores stored answers');
    picker.pick(0); assert.equal(first.getAttribute('aria-pressed'), 'false');
    assert.match(picker.exportText(), /Без ответа: Выбор 1$/);
    picker.pick(0, 1); assert.equal(first.getAttribute('aria-pressed'), 'false', 'only one option is active');
    picker.document.getElementById('pb-reset').fire('click');
    assert.equal(picker.document.getElementById('pb-n').textContent, '0');
    assert.equal(picker.document.getElementById('pickbar').hidden, true);
    assert.match(picker.exportText(), /Без ответа: Выбор 1, Выбор 2, Выбор 3$/);
  });
}
