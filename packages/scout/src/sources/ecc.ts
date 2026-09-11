/**
 * ECC source scanner — fetches skills from github.com/affaan-m/ECC.
 *
 * Unlike other sources that discover repos, this targets a single known repo
 * (ECC, 210K+ stars) and returns its skills as RepoProfiles for comparison
 * against the harness inventory.
 *
 * @packageDocumentation
 */

import type { RepoProfile, SkillFormat, Recommendation } from '../types.js';
import { SourceRefusal, fetchJsonWithBudget, isSourceRefusal } from './source-outcome.js';

const ECC_API = 'https://api.github.com/repos/affaan-m/ECC';
const ECC_SKILLS_API = 'https://api.github.com/repos/affaan-m/ECC/contents/skills';

interface EccScanOptions {
  /** Maximum skill directories to fetch. Default 100 (GitHub API limit per page). */
  readonly limit?: number;
}

/**
 * `true` только для НАСТОЯЩЕГО списка строк.
 *
 * `Array.prototype.every` ПРОПУСКАЕТ дыры разрежённого массива, поэтому `Array(1)` проходил
 * проверку `every(t => typeof t === 'string')` и уезжал в профиль как измеренный список
 * (найдено кросс-семейным ревью 2026-09-04). Сверка длины с числом действительно строковых
 * элементов дыру ловит: у `Array(1)` длина 1, а отфильтрованных элементов 0.
 */
function isStringList(v: unknown): v is readonly string[] {
  return Array.isArray(v) && v.filter((t) => typeof t === 'string').length === v.length;
}

/**
 * Scan ECC for skill inventory. Returns a single RepoProfile representing the
 * ECC repo with skill count and novel skills list.
 */
export async function scanEcc(options: EccScanOptions = {}): Promise<RepoProfile[]> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'dz-scout',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // НЕИЗМЕРЕННОЕ ОТСУТСТВУЕТ, А НЕ ПОДСТАВЛЯЕТСЯ (ADR-001, scout-no-fabrication).
  //
  // Здесь стояли ЧЕТЫРЕ значения по умолчанию — 210000 звёзд, 32000 форков, дата и описание.
  // Они правдоподобны и ничем не помечены: отличить их от измеренных было нельзя ни на экране,
  // ни в данных. ВОСПРОИЗВЕДЕНО ПРОБОЙ 2026-09-03: при оборванном `fetch` источник возвращал
  // профиль со `stars: 210000`.
  //
  // И ГЛАВНОЕ — путь через `catch` был НЕ основным. Прежнее `if (repoRes.ok)` без ветки `else`
  // при ответе 403 (лимит запросов исчерпан — случается регулярно) или 404 исключения не бросает:
  // `catch` молчал, и все четыре дефолта уходили наружу как измеренные. То есть фабрикация
  // случалась на УСПЕШНОМ сетевом вызове, и это был её самый частый путь.
  //
  // Теперь: нет измерения — нет профиля, а причина НАЗВАНА с её формой. Честная граница: «источник
  // не ответил» и «источник ответил пусто» по-прежнему выглядят одинаково (ноль профилей) — их
  // разводит запись 2e6acd25, где появится типизированный исход источника.
  let stars: number;
  let forks: number;
  let lastCommit: string;
  let description: string;
  // ЧИТАЕМ ТО, ЧТО УЖЕ ПОЛУЧИЛИ (feature scout-reads-what-it-fetched).
  //
  // Эти два поля стояли КОНСТАНТАМИ рядом с ответом, который их опровергал. ИЗМЕРЕНО живым
  // вызовом 2026-09-04: из пяти утверждённых тем на репозитории существует ОДНА (`claude-code`);
  // `ai-skills`, `agentic`, `coding-agent`, `operator-system` не существуют вовсе, а настоящие
  // `anthropic`, `llm`, `mcp` не показывались. Лицензия «MIT» совпала — но случайно, потому что
  // её никто не спрашивал.
  //
  // Отсутствие выразимо типом и потому не требует подстановки: `license: string | null` несёт
  // измеренное «лицензии нет», `topics: readonly string[]` — измеренное «тем нет».
  let topics: readonly string[];
  let license: string | null;

  try {
    // ОТКАЗ ТЕПЕРЬ БРОСАЕТСЯ, А НЕ ВОЗВРАЩАЕТСЯ ПУСТОТОЙ (ADR-001 source-outcome-typed).
    // Вечером 2026-09-03 здесь стоял `return []` — он честно не выдумывал чисел, но аггрегатор
    // всё равно видел пустой массив и записывал `ok` с нулём. То есть молчание источника было
    // неотличимо от «ничего не нашлось» на уровень выше. `fetchWithBudget` бросает форму отказа,
    // и она доезжает до аггрегатора нетронутой.
    const repo = await fetchJsonWithBudget<Partial<{ stargazers_count: number; forks_count: number; pushed_at: string; description: string; topics: unknown; license: unknown }>>(ECC_API, { headers });
    if (typeof repo.stargazers_count !== 'number' || typeof repo.forks_count !== 'number' || typeof repo.pushed_at !== 'string') {
      throw new SourceRefusal('refused', `${ECC_API}: ответил 200, но без ожидаемых полей — измерения нет`);
    }
    stars = repo.stargazers_count;
    forks = repo.forks_count;
    lastCommit = repo.pushed_at;
    description = typeof repo.description === 'string' && repo.description !== '' ? repo.description : '';
    // ОТСУТСТВИЕ и НЕ ТА ФОРМА — разные вещи, и их нельзя сводить к одному пустому списку.
    // Нет поля `topics` — измеренное «тем не показано». Поле есть, но не список — ответ не той
    // формы, какой мы его считали: измерения нет, и это отказ, а не ноль.
    if (repo.topics === undefined) topics = [];
    else if (isStringList(repo.topics)) topics = repo.topics;
    else throw new SourceRefusal('refused', `${ECC_API}: поле topics не список строк — измерения нет`);
    // `license: null` (или поля нет) — ФАКТ о репозитории: лицензии нет. Это измерение, и оно
    // проходит как null. Объект с `spdx_id: string` — измеренная лицензия. ВСЁ ОСТАЛЬНОЕ — отказ.
    //
    // Первая редакция сводила любую неожиданную форму к `null`, и кросс-семейное ревью показало,
    // чем это плохо: `license: 'MIT'`, `42`, `[]`, `{ spdx_id: 7 }` тихо становились «лицензии
    // нет». То есть измеренное отсутствие и непонятый ответ сливались в одно значение — ровно
    // тот дефект, который выше уже разведён для `topics`. Асимметрия между двумя полями одного
    // ответа не была принципиальной, она была недосмотром; теперь правило у них одно.
    const lic = repo.license;
    if (lic === undefined || lic === null) license = null;
    else if (typeof lic === 'object' && typeof (lic as { spdx_id?: unknown }).spdx_id === 'string') {
      license = (lic as { spdx_id: string }).spdx_id;
    } else throw new SourceRefusal('refused', `${ECC_API}: поле license не той формы — измерения нет`);
  } catch (err) {
    // Перехватил — обработай по типу или пробрось. Наш отказ уходит наверх как есть: его форма
    // (refused/timeout/failed) и есть измерение. Чужое исключение оборачивается в `failed`.
    if (isSourceRefusal(err)) throw err;
    throw new SourceRefusal('failed', `${ECC_API}: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`);
  }

  // СПИСОК НАВЫКОВ — НЕ ПРИЛОЖЕНИЕ К ПРОФИЛЮ, А ЕГО СМЫСЛ (исправлено по кросс-семейному ревью
  // 2026-09-03). Прежде недоступность списка давала `console.error` и профиль со `skillCount: 0`.
  // Замысел был честный — «частичный успех не выдаётся за полный», — но ДАННЫЕ этой честности не
  // несли: в `RepoProfile` ноль неотличим от измеренного нуля, а предупреждение уходило в поток
  // ошибок, которого никто не читает. Ноль навыков у коллекции навыков читается как «коллекция
  // пуста» и прямо влияет на рекомендацию.
  const skillNames: string[] = [];
  try {
    const entries = await fetchJsonWithBudget<unknown>(ECC_SKILLS_API, { headers });
    if (!Array.isArray(entries)) {
      throw new SourceRefusal('refused', `${ECC_SKILLS_API}: ответил 200, но не списком — измерения нет`);
    }
    for (const e of entries as { name?: unknown; type?: unknown }[]) {
      if (e.type === 'dir' && typeof e.name === 'string') skillNames.push(e.name);
      if (skillNames.length >= (options.limit ?? 100)) break;
    }
  } catch (err) {
    if (isSourceRefusal(err)) throw err;
    throw new SourceRefusal('failed', `${ECC_SKILLS_API}: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`);
  }

  const profile: RepoProfile = {
    fullName: 'affaan-m/ECC',
    url: 'https://github.com/affaan-m/ECC',
    description,
    stars,
    forks,
    lastCommit,
    topics,
    license,
    skillFormats: ['agentskills-io', 'claude-skills'] as SkillFormat[],
    skillCount: skillNames.length,
    novelSkills: skillNames.slice(0, 20), // top 20 for display
    relevanceScore: 95, // high — massive, active, directly relevant
    recommendation: 'integrate' as Recommendation,
    firstSeen: '2026-03-15',
    lastSeen: new Date().toISOString().slice(0, 10),
  };

  return [profile];
}
