/**
 * The marketplace-free install path (F4, ADR-003, plan T3.1).
 *
 * Writes exactly two files, one level under `.claude/skills/`:
 *
 *   <project>/.claude/skills/loop-designer-plan-author/SKILL.md
 *   <project>/.claude/skills/loop-designer-plan-author/references/loop-plan-1-schema.md
 *
 * Three decisions here are MEASURED, not stylistic:
 *
 * 1. **One level deep.** A `SKILL.md` at depth >= 2 does not register — that is the published
 *    health-advisor 1.2.0 defect this repo's `dz skills-verify` exists because of.
 * 2. **No `.claude-plugin/` anywhere under `.claude/skills/`.** That shape is the measured
 *    `plugin-manifest-trap`: it looks like an install and registers nothing.
 * 3. **Self-prefixed directory name, and NO frontmatter rewrite.** A plugin-loaded surface is
 *    namespaced by its host (`loop-designer:loop-plan-author`); a bare skill has no namespace, so
 *    it must carry its own. And the DIRECTORY name is what registers — measured on Claude Code
 *    2.1.233 with a fixture whose directory and frontmatter `name:` deliberately disagreed: the
 *    directory won (features/loop-designer-plugin/.fa-state/probe-frontmatter-name.md). So the
 *    installed body is byte-identical to the canon, with no derived transform to drift.
 */

import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The directory name a bare install registers under. It IS the registration mechanism. */
export const BARE_SKILL_DIR = 'loop-designer-plan-author';

const here = dirname(fileURLToPath(import.meta.url));

/** The package's own copy of the canon — itself a synced projection of `skills-meta`. */
export function packagedSkillDir() {
  return join(here, '..', 'skills', 'loop-plan-author');
}

/** Every file in the packaged skill, as paths relative to the skill dir. */
function skillFiles(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      const rel = prefix === '' ? entry : `${prefix}/${entry}`;
      // ОБХОД НЕ ПАДАЕТ НА БИТОЙ ССЫЛКЕ. `statSync` идёт ПО ссылке и бросает, если цели нет — а
      // именно битая ссылка в месте назначения и есть тот случай, ради которого этот обход теперь
      // делается. Запись о ней ОБЯЗАНА появиться в списке: иначе она не попадёт ни в конфликты, ни
      // в устаревшие, и установка пойдёт СКВОЗЬ неё.
      let isDir = false;
      try {
        isDir = lstatSync(full).isSymbolicLink() ? false : statSync(full).isDirectory();
      } catch {
        out.push(rel);   // не смогли рассмотреть — считаем файлом и НЕ теряем из виду
        continue;
      }
      if (isDir) walk(full, rel);
      else out.push(rel);
    }
  };
  walk(root, '');
  return out;
}

/**
 * Install the bare skill into `<projectDir>/.claude/skills/`.
 *
 * Refuses to overwrite without `force`, and a refusal MUTATES NOTHING — it reports what it would
 * have replaced and returns. (A "safe" installer that half-writes before noticing the conflict is
 * not safe.)
 *
 * Conflicts are computed over the UNION of the source tree and the existing destination tree
 * (QE fix round 1, MEDIUM/LOW-8): a file left behind by an older release that shipped a different
 * reference set is a STALE SURVIVOR — it is reported by name, and `--force` REMOVES it. Silently
 * keeping it would leave a directory the README calls byte-identical to the canon carrying bytes
 * the canon never had.
 *
 * @param {string} projectDir
 * @param {{ force?: boolean, sourceDir?: string }} [options]
 * @returns {{ ok: boolean, installDir: string, written: string[], conflicts: string[],
 *             stale: string[], removedStale: string[], reason?: string }}
 */
/** Цель ссылки, если путь — символическая ссылка (в том числе БИТАЯ); иначе null. */
function symlinkAt(p) {
  try {
    return lstatSync(p).isSymbolicLink() ? String(readlinkSyncSafe(p)) : null;
  } catch {
    return null;
  }
}

function readlinkSyncSafe(p) {
  try {
    // eslint-disable-next-line n/no-sync
    return readlinkSync(p);
  } catch {
    return '(цель не читается)';
  }
}

/** Существует ли путь ИЛИ является ссылкой (в том числе битой). */
function pathExistsOrIsLink(p) {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Удалить пустые каталоги под корнем. Возвращает удалённые пути; сам корень не трогается. */
function pruneEmptyDirs(dir, root) {
  const removed = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return removed;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const child = join(dir, e.name);
    removed.push(...pruneEmptyDirs(child, root));
    try {
      if (readdirSync(child).length === 0) {
        // `rmSync` без `recursive` на КАТАЛОГЕ бросает ERR_FS_EISDIR, и в try/catch это выглядело
        // как «удалили» — каталог оставался. Пустоту мы уже проверили строкой выше, поэтому
        // рекурсивное удаление здесь безопасно и делает то, что обещает.
        rmSync(child, { recursive: true, force: true });
        removed.push(child);
      }
    } catch { /* исчез сам — нечего удалять */ }
  }
  return removed;
}

export function installBareSkill(projectDir, options = {}) {
  const source = options.sourceDir ?? packagedSkillDir();
  const installDir = join(projectDir, '.claude', 'skills', BARE_SKILL_DIR);
  const files = skillFiles(source);

  // КАТАЛОГ УСТАНОВКИ САМ НЕ ДОЛЖЕН БЫТЬ ССЫЛКОЙ. Иначе весь набор уезжает туда, куда она
  // указывает, и «установлено в .claude/skills/…» становится ложью о месте.
  const installLink = symlinkAt(installDir);
  if (installLink) {
    return {
      ok: false, installDir, written: [], conflicts: [], stale: [], removedStale: [],
      reason: `${installDir} — символическая ссылка на ${installLink}; установка ушла бы за пределы каталога назначения, и ничего не написано`,
    };
  }

  const destFiles = existsSync(installDir) ? skillFiles(installDir) : [];
  const sourceSet = new Set(files);
  // СУЩЕСТВОВАНИЕ ПРОВЕРЯЕТСЯ lstat'ом, А НЕ existsSync. `existsSync` идёт ПО ссылке и отвечает
  // false для БИТОЙ ссылки — такая цель не попадала в конфликты, и запись шла СКВОЗЬ неё, создавая
  // файл за пределами каталога установки (подтверждено исполнением, Codex-ревью Q4).
  const conflicts = files.filter((rel) => pathExistsOrIsLink(join(installDir, rel)));
  const stale = destFiles.filter((rel) => !sourceSet.has(rel));

  if ((conflicts.length > 0 || stale.length > 0) && options.force !== true) {
    const parts = [];
    if (conflicts.length > 0) parts.push(`${conflicts.length} existing file(s)`);
    if (stale.length > 0) parts.push(`${stale.length} stale survivor(s) not in this release`);
    return {
      ok: false,
      installDir,
      written: [],
      conflicts,
      stale,
      removedStale: [],
      reason:
        `refusing to overwrite ${parts.join(' and ')} under ${installDir} — ` +
        `re-run with --force to replace/remove them (nothing was written)`,
    };
  }

  const removedStale = [];
  for (const rel of stale) {
    rmSync(join(installDir, rel), { force: true });
    removedStale.push(rel);
  }
  const written = [];
  for (const rel of files) {
    const target = join(installDir, rel);
    mkdirSync(dirname(target), { recursive: true });
    // ССЫЛКА В МЕСТЕ НАЗНАЧЕНИЯ СНИМАЕТСЯ ДО ЗАПИСИ. `copyFileSync` пишет СКВОЗЬ ссылку — байты
    // канона уехали бы наружу, а отчёт сказал бы, что всё легло на место.
    if (symlinkAt(target) !== null) rmSync(target, { force: true });
    copyFileSync(join(source, rel), target);
    written.push(target);
  }
  // ПУСТЫЕ КАТАЛОГИ ПРОШЛОГО СОСТАВА НЕ ПЕРЕЖИВАЮТ УСТАНОВКУ: каталог, чьи файлы объявлены
  // устаревшими и удалены, оставался на месте и выглядел частью набора.
  const removedDirs = pruneEmptyDirs(installDir, installDir);
  return { ok: true, installDir, written, conflicts, stale, removedStale, removedDirs };
}

/**
 * The verdict→exit mapping for `init --verify` (ADR-003 D-5).
 *
 * `inconclusive` is 2, never 0. The wording rule travels with the number: an unconfirmed
 * registration is reported as *"install written; registration NOT confirmed"* — never as success.
 */
export function registrationExitCode(verdict) {
  if (verdict === 'pass') return 0;
  if (verdict === 'fail') return 1;
  return 2;
}

export function verifyWording(verdict) {
  if (verdict === 'pass') return 'install written; registration CONFIRMED by a live session listing';
  if (verdict === 'fail') return 'install written; the skill did NOT register — the install is not usable';
  return 'install written; registration NOT confirmed (inconclusive is never a pass)';
}

/** Read the installed SKILL.md, for callers that want to prove byte-identity with the canon. */
export function readInstalled(projectDir, rel = 'SKILL.md') {
  return readFileSync(join(projectDir, '.claude', 'skills', BARE_SKILL_DIR, rel));
}
