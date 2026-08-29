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
    // Repo metadata (defaults used if the API is unreachable)
    let stars = 0;
    let forks = 0;
    let lastCommit = '2026-06-16';
    let description = 'Curated community skill collection (forked from VisionClaw) — 100+ skills across code review, research, agentdb, design, dev tooling';
    let license;
    try {
        const repoRes = await fetch(AGENTBOX_API, { headers });
        if (repoRes.ok) {
            const repo = (await repoRes.json());
            stars = repo.stargazers_count;
            forks = repo.forks_count;
            lastCommit = repo.pushed_at;
            if (repo.description)
                description = repo.description;
            // only trust a real SPDX id; GitHub reports NOASSERTION / null when unlicensed
            const spdx = repo.license?.spdx_id;
            if (spdx && spdx !== 'NOASSERTION')
                license = spdx;
        }
    }
    catch {
        /* use defaults */
    }
    // Skill directories
    const skillNames = [];
    try {
        const skillsRes = await fetch(AGENTBOX_SKILLS_API, { headers });
        if (skillsRes.ok) {
            const entries = (await skillsRes.json());
            for (const e of entries) {
                if (e.type === 'dir')
                    skillNames.push(e.name);
                if (skillNames.length >= (options.limit ?? 100))
                    break;
            }
        }
    }
    catch {
        /* skill count will be 0 */
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