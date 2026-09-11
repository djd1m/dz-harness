'use strict';

/**
 * Текст, ссылающийся на несуществующий файл, обязан быть замечен машиной.
 *
 * ПОЧЕМУ ЭТО ЕСТЬ. Этот класс дефекта ловился вручную минимум четыре раза: список хуков называл
 * 4 из 8; таблица говорила «Rules 5» при шести; справка обещала 18 видов отказа при 17 в массиве;
 * путь вывода называл несуществующий каталог. `verify` его не ловит ПО ПОСТРОЕНИЮ: он идёт от
 * зарегистрированного объекта к его наличию, а этот дефект живёт в обратном направлении — от
 * текста к объекту, которого нет.
 *
 * ПОЧЕМУ БАЗА, А НЕ НОЛЬ. Измерено 2026-09-03: 58 висячих ссылок в 23 файлах, и они не появляются
 * после `init` (проверено на пустом проекте). Требовать ноль значило бы отказать каждому проекту в
 * первый же день, то есть выключить заставу. База закреплена и может только уменьшаться.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { spawnSync } = require('node:child_process');
const HOOK = path.join(__dirname, '..', '..', 'templates', '.claude', 'hooks', 'check-dangling-refs.cjs');
const { danglingRefs, BASELINE } = require('../../templates/.claude/hooks/check-dangling-refs.cjs');
const TEMPLATES = path.join(__dirname, '..', '..', 'templates');

describe('висячие ссылки не могут стать хуже базы', () => {
  test('текущее дерево не превышает закреплённую базу', () => {
    const found = danglingRefs(TEMPLATES);
    assert.notEqual(found, null, 'templates/.claude должен существовать');
    const unique = new Set(found.map((f) => `${f.from} → ${f.to}`));
    assert.ok(unique.size <= BASELINE,
      `висячих ссылок ${unique.size} при базе ${BASELINE} — новая ссылка на несуществующий файл`);
  });

  test('база не завышена: она равна измеренному, а не взята с запасом', () => {
    // Запас в базе — это тихое разрешение добавить ещё столько же. База обязана совпадать с
    // измерением, иначе она перестаёт быть границей и становится квотой.
    const found = danglingRefs(TEMPLATES);
    const unique = new Set(found.map((f) => `${f.from} → ${f.to}`));
    assert.equal(unique.size, BASELINE,
      `база ${BASELINE} разошлась с измеренным ${unique.size}: если починили — опустите базу, если добавили — верните ссылку`);
  });

  test('сторож видит внедрённую висячую ссылку', () => {
    // Дискриминация: застава, которая ничего не нашла, неотличима от заставы, которая ничего не
    // умеет. Подкладываем ровно ту форму, которую она обязана поймать.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangl-'));
    try {
      fs.mkdirSync(path.join(dir, '.claude', 'rules'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.claude', 'rules', 'a.md'),
        'Смотри `.claude/hooks/nonexistent-guard.cjs` — его нет.\n');
      const found = danglingRefs(dir);
      assert.equal(found.length, 1);
      assert.equal(found[0].to, '.claude/hooks/nonexistent-guard.cjs');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('существующая цель висячей не считается', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangl-ok-'));
    try {
      fs.mkdirSync(path.join(dir, '.claude', 'hooks'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.claude', 'hooks', 'real.cjs'), '// real\n');
      fs.writeFileSync(path.join(dir, '.claude', 'a.md'), 'Смотри `.claude/hooks/real.cjs`.\n');
      assert.deepEqual(danglingRefs(dir), []);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('честный вход: дерево без висячих ссылок даёт exits 0 и печатает измеренное', () => {
    // Требование каталога хуков: у каждого check-*.cjs должен быть тест ЧЕСТНОГО ВХОДА — прогон на
    // заведомо правильных данных. Без него застава, которая всегда красная, выглядела бы рабочей.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangl-honest-'));
    try {
      fs.mkdirSync(path.join(dir, '.claude', 'hooks'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.claude', 'hooks', 'real.cjs'), '// real\n');
      fs.writeFileSync(path.join(dir, '.claude', 'ok.md'), 'Ссылка на `.claude/hooks/real.cjs` — она есть.\n');
      const r = spawnSync(process.execPath, [HOOK, dir], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr || r.stdout);
      assert.match(r.stdout, /висячих ссылок 0/);
      assert.match(r.stdout, /Проверено файлов: 1/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('отсутствие .claude — это НЕ УСТАНОВЛЕНО, а не «чисто»', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangl-none-'));
    try {
      assert.equal(danglingRefs(dir), null, 'пустое дерево обязано дать null, а не пустой список');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
