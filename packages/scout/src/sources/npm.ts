/**
 * npm Registry scanner — searches for agent-skill packages.
 *
 * API: GET /-/v1/search?text=keywords:<kw>&size=N (no auth, free)
 *
 * @packageDocumentation
 */

import type { RepoProfile } from '../types.js';
import { SourceRefusal, fetchWithBudget, isSourceRefusal, refuseIfNothingMeasured } from './source-outcome.js';

const NPM_API = 'https://registry.npmjs.org/-/v1/search';
const KEYWORDS = ['mcp-server', 'claude-code', 'agent-skills', 'agentskills-io', 'claude-plugin', 'claude-code-plugin'];

interface NpmPackage {
  readonly name: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly links: { readonly npm: string; readonly repository?: string };
  readonly publisher: { readonly username: string };
  readonly version: string;
}

interface NpmSearchResult {
  readonly package: NpmPackage;
  readonly score: { readonly final: number };
}

/** Search npm for agent-skill packages. Returns deduplicated RepoProfiles. */
export async function scanNpm(options: { maxPerKeyword?: number } = {}): Promise<RepoProfile[]> {
  const max = options.maxPerKeyword ?? 20;
  const seen = new Set<string>();
  const results: RepoProfile[] = [];
  const refusals: SourceRefusal[] = [];
  let measuredCalls = 0;

  for (const kw of KEYWORDS) {
    try {
      const url = `${NPM_API}?text=keywords:${encodeURIComponent(kw)}&size=${max}`;
      // ПРЕЖДЕ ЗДЕСЬ БЫЛО `if (!resp.ok) continue` и `catch {}` — реестр, ответивший 429 или 503,
      // проходил как «ничего не нашлось по этому слову». Теперь форма отказа сохраняется и решает
      // судьбу источника ниже, по общему правилу частичного успеха.
      const resp = await fetchWithBudget(url, { headers: { 'User-Agent': 'dz-scout/0.3.0' } });
      const data = (await resp.json()) as { objects: NpmSearchResult[] };
      measuredCalls += 1;   // ответ получен; ноль пакетов в нём — измеренный ноль

      for (const obj of data.objects) {
        const pkg = obj.package;
        if (seen.has(pkg.name)) continue;
        seen.add(pkg.name);

        results.push({
          fullName: pkg.name,
          url: pkg.links.npm,
          description: pkg.description ?? '',
          // ЧЕСТНАЯ ОГОВОРКА, пока источник не переведён на типизированную находку (бэклог
          // d5eac068): у пакета npm НЕТ ни звёзд, ни форков, ни даты последнего коммита. В поле
          // `stars` лежит поисковый БАЛЛ реестра, `forks: 0` и дата — заполнители формы
          // `RepoProfile`, а не измерения. Сравнивать их со звёздами репозитория нельзя.
          stars: Math.round(obj.score.final * 100),
          forks: 0,
          lastCommit: new Date().toISOString(),
          topics: [...pkg.keywords],
          license: null,
          skillFormats: pkg.keywords.some((k) => k === 'mcp-server') ? ['mcp-server']
            : pkg.keywords.some((k) => k === 'claude-plugin' || k === 'claude-code-plugin') ? ['claude-plugin']
            : ['agentskills-io'],
          skillCount: 1,
          novelSkills: [],
          relevanceScore: Math.round(obj.score.final * 100),
          recommendation: obj.score.final >= 0.7 ? 'integrate' : obj.score.final >= 0.4 ? 'monitor' : 'skip',
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        });
      }
    } catch (err) {
      refusals.push(isSourceRefusal(err)
        ? err
        : new SourceRefusal('failed', `npm «${kw}»: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  // Ни одного ответа при хотя бы одном отказе — источник отказал, и наверх уходит форма отказа.
  refuseIfNothingMeasured(measuredCalls, refusals, 'scanNpm');
  return results;
}
