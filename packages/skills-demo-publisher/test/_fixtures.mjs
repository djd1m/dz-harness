import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const skillRoot = join(packageRoot, 'demo-site-publisher');
export const fixturePath = (...parts) => join(packageRoot, 'test', 'fixtures', ...parts);
/**
 * Каталоги, созданные этим набором за прогон. Уборка живёт ЗДЕСЬ, а не в каждом тесте:
 * шестнадцать наборов зовут `makeTemp` и ни один не убирал за собой, потому что убирать было
 * нечем — фабрика не возвращала ручку и ничего не помнила.
 *
 * ИЗМЕРЕНО 2026-09-19: один `npm test` этого пакета оставлял в /tmp 34 каталога; за 30 часов
 * повторных обходов накопилось 210 каталогов `dz-demo-budget-*` по ~22 МБ (4,7 ГБ), а всего
 * /tmp занимал 12 ГБ при 91% занятости диска. Разовая уборка не лечит: каталоги возвращаются
 * с каждым прогоном.
 *
 * Уборка на `exit` — синхронная по необходимости: асинхронный обработчик на этом событии не
 * успевает выполниться. Отказ удаления ГЛОТАЕТСЯ намеренно: уборка не должна превращать
 * зелёный прогон в красный.
 */
const tempDirs = [];
let sweepArmed = false;

/** Оставить каталоги на диске для разбора: DZ_KEEP_TMP=1 npm test */
const keepTemp = () => process.env.DZ_KEEP_TMP === '1';

export const makeTemp = (name) => {
  const dir = mkdtempSync(join(tmpdir(), `dz-demo-${name}-`));
  tempDirs.push(dir);
  if (!sweepArmed) {
    sweepArmed = true;
    process.on('exit', () => {
      if (keepTemp()) return;
      for (const d of tempDirs.splice(0)) {
        try { rmSync(d, { recursive: true, force: true }); } catch { /* уборка не роняет прогон */ }
      }
    });
  }
  return dir;
};
export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  return path;
}
