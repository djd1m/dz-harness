/**
 * arXiv preprint scanner.
 *
 * API: GET http://export.arxiv.org/api/query?search_query=...
 * Free, no auth, 3s delay between calls. Atom/XML response.
 *
 * @packageDocumentation
 */

import type { RepoProfile } from '../types.js';
import { SourceRefusal, fetchTextWithBudget, isSourceRefusal, refuseIfNothingMeasured } from './source-outcome.js';

const ARXIV_API = 'http://export.arxiv.org/api/query';

const QUERIES = [
  'ti:"agent skills" AND cat:cs.AI',
  'ti:"tool use" AND ti:"LLM" AND cat:cs.AI',
  'ti:"agentic" AND ti:"workflow" AND cat:cs.SE',
];

/** Parse arXiv Atom XML response (minimal — extract entries). */
function parseAtom(xml: string): { id: string; title: string; summary: string; published: string; link: string }[] {
  const entries: { id: string; title: string; summary: string; published: string; link: string }[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1] ?? '';
    const id = entry.match(/<id>(.*?)<\/id>/)?.[1] ?? '';
    const title = (entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    const summary = (entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    const published = entry.match(/<published>(.*?)<\/published>/)?.[1] ?? '';
    const link = entry.match(/<link.*?href="(https:\/\/arxiv\.org\/abs\/[^"]*)".*?\/>/)?.[1] ?? id;
    // ЗАПИСЬ БЕЗ ТОЖДЕСТВА И НАЗВАНИЯ — НЕ НАХОДКА. Прежде такая запись уезжала как профиль с
    // именем `arxiv/` и пустой датой: тело ответа было не Atom'ом, а мы делали вид, что измерили.
    if (id === '' || title === '') continue;
    entries.push({ id, title, summary, published, link });
  }
  return entries;
}

/**
 * Пауза перед повтором при исчерпанном лимите: 5 с, затем 10 с.
 *
 * Вынесено ПАРАМЕТРОМ, а не спрятано в выражении, по одной причине: набор тестов, проверяющий
 * поведение при лимите, иначе ждал бы по-настоящему — и полминуты ожидания в наборе гарантированно
 * приводят к тому, что этот тест выключают.
 */
export const RATE_LIMIT_BACKOFF_MS = 5000;

/** Вежливая пауза между обращениями к arXiv — договор сервиса, не наша осторожность. */
const POLITE_DELAY_MS = 3100;

/** Похоже ли тело на Atom-ленту arXiv. Дешёвая проверка формы, не разбор. */
function looksLikeAtom(body: string): boolean {
  return /<feed[\s>]/i.test(body) || /<entry[\s>]/i.test(body);
}

/**
 * Обращение с повтором на исчерпанный лимит, с сохранением ФОРМЫ отказа.
 *
 * Прежде возвращался `null` на любой беде, а вызывающий писал `if (!resp) continue` — исчерпанный
 * лимит, обрыв связи и честный пустой ответ становились одним и тем же.
 *
 * ЛИМИТ У arXiv ВИДЕН НЕ КОДОМ: сервис отвечает 200 с текстом «Rate exceeded». Но искать эту
 * строку в ЛЮБОМ теле нельзя — статья, у которой она встречается в названии или аннотации, была бы
 * трижды повторена и отвергнута (нашло кросс-семейное ревью 2026-09-03). Поэтому признаком лимита
 * считается тело, которое НЕ является Atom-лентой И содержит эту строку; регистр не учитывается.
 */
async function fetchLimitAware(url: string, maxRetries = 2, backoffMs = RATE_LIMIT_BACKOFF_MS): Promise<string> {
  let last: SourceRefusal | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let rateLimited = false;
    try {
      const body = await fetchTextWithBudget(url, { headers: { 'User-Agent': 'dz-scout/0.6.0' } });
      if (looksLikeAtom(body)) return body;
      if (!/rate exceeded/i.test(body)) {
        // 200 и не лента, и не про лимит: измерения нет, но и ждать нечего.
        throw new SourceRefusal('refused', `${url}: ответил 200, но не Atom-лентой — измерения нет`);
      }
      rateLimited = true;
      // Код НЕ выдумывается: ответ был 200, и записывать сюда 429 значило бы соврать в поле,
      // которое по договору означает код ответа.
      last = new SourceRefusal('refused', `${url}: ответил 200 с сообщением об исчерпанном лимите`);
    } catch (err) {
      last = isSourceRefusal(err)
        ? err
        : new SourceRefusal('failed', `${url}: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`);
      rateLimited = last.status === 429;
    }
    // Повторяется ТОЛЬКО исчерпанный лимит: 404 и 500 от повтора не выздоравливают, а ждать на них
    // значит тратить бюджет прогона на заведомо тот же ответ.
    if (!rateLimited || attempt === maxRetries) throw last;
    await new Promise((r) => setTimeout(r, (attempt + 1) * backoffMs));
  }
  throw last ?? new SourceRefusal('failed', `${url}: повторы исчерпаны без ответа`);
}

/** Search arXiv for agent-skill-related preprints. */
export async function scanArxiv(options: { maxPerQuery?: number | undefined; backoffMs?: number | undefined } = {}): Promise<RepoProfile[]> {
  const max = options.maxPerQuery ?? 10;
  const seen = new Set<string>();
  const results: RepoProfile[] = [];
  const refusals: SourceRefusal[] = [];
  let measuredCalls = 0;

  for (const query of QUERIES) {
    try {
      const url = `${ARXIV_API}?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=${max}`;
      // Вежливая пауза стоит ПЕРЕД обращением, а не после: прежде она пропускалась после отказа
      // (то есть договор о задержке нарушался ровно там, где сервис и просил подождать) и зря
      // тратилась после последнего запроса.
      if (measuredCalls > 0 || refusals.length > 0) await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
      const xml = await fetchLimitAware(url, 2, options.backoffMs ?? RATE_LIMIT_BACKOFF_MS);
      measuredCalls += 1;   // тело есть И оно Atom — только теперь это измерение
      const entries = parseAtom(xml);

      for (const entry of entries) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);

        results.push({
          fullName: `arxiv/${entry.id.split('/').pop() ?? entry.id}`,
          url: entry.link,
          description: entry.title + (entry.summary ? ` — ${entry.summary.slice(0, 120)}` : ''),
          // Оговорка, пока источник не переведён на типизированную находку (d5eac068): у
          // препринта НЕТ звёзд и форков. Нули здесь — заполнители формы `RepoProfile`, а не
          // измерение «ноль звёзд».
          stars: 0,
          forks: 0,
          lastCommit: entry.published,
          topics: ['arxiv', 'academic-paper'],
          license: null,
          skillFormats: [],
          skillCount: 0,
          novelSkills: [],
          relevanceScore: 55, // base score for arXiv papers — ideas, not tools
          recommendation: 'monitor' as const,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        });
      }

    } catch (err) {
      refusals.push(isSourceRefusal(err)
        ? err
        : new SourceRefusal('failed', `scanArxiv: обращение не состоялось — ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  refuseIfNothingMeasured(measuredCalls, refusals, 'scanArxiv');
  return results;
}
