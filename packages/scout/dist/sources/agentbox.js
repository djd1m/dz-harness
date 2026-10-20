/**
 * AgentBox source scanner — fetches skills from github.com/DreamLab-AI/agentbox.
 *
 * Like {@link scanEcc}, this targets a single curated community repo (a 100+ skill
 * collection forked from VisionClaw — agentdb, deep-research, codebase-memory,
 * design-audit, github-code-review, …) and returns it as a RepoProfile for
 * comparison against the harness inventory.
 *
 * NOTE: the repo currently ships **no visible LICENSE**, so its `recommendation`
 * is `monitor`, not `integrate` — skills here must NOT be canonicalized/published
 * verbatim until the license is clarified (adapt the methodology clean-room, or
 * confirm the license first).
 *
 * @packageDocumentation
 */
import { SourceRefusal, fetchJsonWithBudget, isSourceRefusal } from './source-outcome.js';
const AGENTBOX_API = 'https://api.github.com/repos/DreamLab-AI/agentbox';
const AGENTBOX_SKILLS_API = 'https://api.github.com/repos/DreamLab-AI/agentbox/contents/skills';
/**
 * Scan AgentBox for its skill inventory. Returns a single RepoProfile representing
 * the repo with skill count and a sample of skill names.
 */
export async function scanAgentbox(options = {}) {
    const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'dz-scout',
    };
    const token = process.env.GITHUB_TOKEN;
    if (token)
        headers['Authorization'] = `Bearer ${token}`;
    // НЕИЗМЕРЕННОЕ ОТСУТСТВУЕТ, А НЕ ПОДСТАВЛЯЕТСЯ (тот же класс, что чинили в источнике ECC
    // 2026-09-03, и здесь он был ЦЕЛИКОМ). Ниже стояли четыре значения по умолчанию — ноль звёзд,
    // ноль форков, дата `2026-06-16` и целое описание репозитория. Они правдоподобны и ничем не
    // помечены: отличить их от измеренных было нельзя ни на экране, ни в данных.
    //
    // И как в ECC, путь через `catch` был НЕ основным: `if (repoRes.ok)` без ветки `else` при
    // ответе 403 (исчерпан лимит запросов — бывает регулярно) или 404 исключения не бросает.
    // Значит, фабрикация случалась на УСПЕШНОМ сетевом вызове, и это был её самый частый путь.
    //
    // Ноль звёзд здесь был особенно вреден: он читается как «репозиторий никому не нужен», то есть
    // прямо влияет на рекомендацию.
    let stars;
    let forks;
    let lastCommit;
    let description;
    let license;
    try {
        const repo = await fetchJsonWithBudget(AGENTBOX_API, { headers });
        if (typeof repo.stargazers_count !== 'number' || typeof repo.forks_count !== 'number'
            || typeof repo.pushed_at !== 'string') {
            throw new SourceRefusal('refused', `${AGENTBOX_API}: ответил 200, но без ожидаемых полей — измерения нет`);
        }
        stars = repo.stargazers_count;
        forks = repo.forks_count;
        lastCommit = repo.pushed_at;
        description = typeof repo.description === 'string' && repo.description !== '' ? repo.description : '';
        // Доверять только настоящему SPDX: GitHub отвечает NOASSERTION или null, когда лицензии нет.
        const spdx = repo.license?.spdx_id;
        if (spdx && spdx !== 'NOASSERTION')
            license = spdx;
    }
    catch (err) {
        // Перехватил — обработай по типу или пробрось. Наш отказ уходит наверх нетронутым.
        if (isSourceRefusal(err))
            throw err;
        throw new SourceRefusal('failed', `${AGENTBOX_API}: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`);
    }
    // СПИСОК НАВЫКОВ — НЕ ПРИЛОЖЕНИЕ К ПРОФИЛЮ, А ЕГО СМЫСЛ, и потому его недоступность теперь
    // ОТКАЗ, а не ноль (исправлено по кросс-семейному ревью 2026-09-03).
    //
    // Прежде здесь стоял `console.error` и профиль уезжал со `skillCount: 0`. Замысел был честный —
    // «частичный успех не выдаётся за полный» — но данные этой честности не несли: в `RepoProfile`
    // ноль неотличим от измеренного нуля, а предупреждение уходило в поток ошибок, которого никто
    // не читает. Ноль навыков у коллекции навыков — это утверждение «коллекция пуста», и оно
    // прямо влияет на рекомендацию.
    //
    // Метаданные при этом уже измерены, и их не жаль: источник, чей смысл не получен, лучше
    // объявить отказавшим — форма отказа доедет до витрины, а профиль-полуправда нет.
    const skillNames = [];
    try {
        const entries = await fetchJsonWithBudget(AGENTBOX_SKILLS_API, { headers });
        if (!Array.isArray(entries)) {
            throw new SourceRefusal('refused', `${AGENTBOX_SKILLS_API}: ответил 200, но не списком — измерения нет`);
        }
        for (const e of entries) {
            if (e.type === 'dir' && typeof e.name === 'string')
                skillNames.push(e.name);
            if (skillNames.length >= (options.limit ?? 100))
                break;
        }
    }
    catch (err) {
        if (isSourceRefusal(err))
            throw err;
        throw new SourceRefusal('failed', `${AGENTBOX_SKILLS_API}: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`);
    }
    // License-gated recommendation: a valuable, active repo, but unlicensed → monitor,
    // never auto-integrate. Becomes `integrate` only once a real SPDX license appears.
    const recommendation = license ? 'integrate' : 'monitor';
    const profile = {
        fullName: 'DreamLab-AI/agentbox',
        url: 'https://github.com/DreamLab-AI/agentbox',
        description,
        stars,
        forks,
        lastCommit,
        topics: ['claude-code', 'ai-skills', 'agentic', 'skill-collection', 'agentdb', 'deep-research'],
        license: license ?? 'UNKNOWN',
        skillFormats: ['claude-skills'],
        skillCount: skillNames.length,
        novelSkills: skillNames.slice(0, 20),
        relevanceScore: license ? 85 : 70, // valuable + active, but license gates integration
        recommendation,
        firstSeen: '2026-06-23',
        lastSeen: new Date().toISOString().slice(0, 10),
    };
    return [profile];
}
//# sourceMappingURL=agentbox.js.map