/**
 * Запись c402aaf3: наборы этого пакета оставляли временные каталоги в /tmp.
 *
 * ИЗМЕРЕНО 2026-09-19: один `npm test` оставлял 34 каталога `dz-demo-*`; за 30 часов повторных
 * обходов накопилось 210 каталогов `dz-demo-budget-*` по ~22 МБ (4,7 ГБ), /tmp занимал 12 ГБ
 * при 91% занятости диска. После уборки в фабрике — 0 за прогон.
 *
 * Сторож не проверяет ФОРМУ уборки, он МЕРЯЕТ результат: дочерний процесс запускается с
 * собственным TMPDIR, и после его выхода наблюдательный каталог обязан быть пуст. Такой тест
 * переживает любую смену реализации уборки.
 *
 * Различает он себя сам, без мутации: тот же набор с DZ_KEEP_TMP=1 обязан каталоги ОСТАВИТЬ.
 * Если бы уборки не было вовсе, обе половины оставляли бы мусор и первая покраснела бы.
 *
 * ОБЛАСТЬ: только каталоги ТЕСТОВЫХ ФИКСТУР. Два боевых скрипта тоже создают каталоги в /tmp,
 * и они НАМЕРЕННЫЕ — убирать их нельзя:
 *   • `publish-demo.mjs` возвращает `cloneDir` наружу, и тот же путь стоит в инструкции
 *     ОТКАТА неудачной публикации (`verify-live`: `rollback: git -C <cloneDir> revert …`).
 *     Уборка клона уничтожила бы единственный способ откатить уехавший коммит.
 *   • `smoke-test.mjs` кладёт во временный корень САМ РЕЗУЛЬТАТ дымового прогона
 *     (recording, cards, montage, site), когда `outRoot` не задан.
 * Поэтому сторож гоняет ОДИН модульный набор, а не весь пакет: набор инструментов
 * законно оставляет эти два каталога, и требовать от него нуля было бы ложной тревогой.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';

// Файл лежит в test/unit/, поэтому до корня пакета ДВА уровня вверх от каталога файла.
const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const observers = [];

function observer() {
  const dir = mkdtempSync(join(tmpdir(), 'dz-demo-observer-'));
  observers.push(dir);
  return dir;
}

after(() => {
  for (const dir of observers) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* уборка не роняет прогон */ }
  }
});

/** Прогнать один набор в ДОЧЕРНЕМ процессе с собственным TMPDIR и вернуть остатки. */
function leftoversAfterChildRun(keepTmp) {
  const obs = observer();
  const env = { ...process.env, TMPDIR: obs };
  delete env.NODE_TEST_CONTEXT;   // иначе дочерний node:test считает себя вложенным
  if (keepTmp) env.DZ_KEEP_TMP = '1'; else delete env.DZ_KEEP_TMP;
  const run = spawnSync(process.execPath, ['--test', 'test/unit/site-build.test.mjs'], {
    cwd: packageRoot, env, encoding: 'utf8',
  });
  assert.equal(run.status, 0, `дочерний прогон упал:\n${[run.stdout, run.stderr].filter(Boolean).join('\n').slice(-4000)}`);
  return readdirSync(obs).filter((name) => name.startsWith('dz-demo-'));
}

test('набор не оставляет временных каталогов после выхода процесса', () => {
  assert.deepEqual(leftoversAfterChildRun(false), [], 'в TMPDIR остались каталоги dz-demo-*');
});

test('DZ_KEEP_TMP=1 каталоги ОСТАВЛЯЕТ — иначе первая половина не различала бы', () => {
  const kept = leftoversAfterChildRun(true);
  assert.ok(kept.length > 0, 'с DZ_KEEP_TMP=1 каталоги обязаны остаться, иначе тест доказывает не уборку, а их отсутствие');
});
