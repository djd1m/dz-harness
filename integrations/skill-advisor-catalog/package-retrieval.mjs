import {createLexicalSearch} from './search.mjs';

// Require an explicit uncertainty about which outcome, problem, or scope to choose.
const discoveryCue = /(?:не\s+(?:зна\p{L}*|понима\p{L}*|определ\p{L}*|реш\p{L}*)|непонятно|не\s*ясно)\s*[,—:-]?\s*(?:что|чего|кому|как\s+выбрать|как\s+понять|как\s+определить|како[йею]|какая|какую|какие|с\s+чего)(?!\p{L})|(?:not\s+sure|don['’]t\s+know|haven['’]t\s+decided|unclear)\s*[,—:-]?\s+(?:what|which|where\s+to\s+start|how\s+to\s+choose)\b/iu;
const discoveryOptOut = /(?:не\s+(?:надо|нужно|хочу)\s+уточнять|без\s+(?:уточнений|прояснения)|(?:skip|no)\s+(?:discovery|clarification))/iu;
const clauseSeparator = /[;!?\n]+|[.,](?=\s)|\s+(?:и(?:\s+(?:затем|потом))?|а\s+(?:затем|также)|затем|потом|and(?:\s+then)?|then)\s+/iu;
const actionLead = /^(?:разбери|проанализируй|выбери|подбери|оцени|проверь|определи|настрой|подготовь|analyze|analyse|choose|select|review|evaluate|check|identify|configure|prepare)\s+/iu;

function taskClauses(query) {
 const parts = query.split(clauseSeparator).map(part => part.trim()
  .replace(/^(?:(?:затем|потом|поможет|then)\s+)+/iu, '').replace(actionLead, ''))
  .filter(part => part.length >= 8 && /\p{L}/u.test(part));
 if (parts.length <= 5) return parts;
 return [...parts.slice(0, 2), ...parts.slice(-3)];
}

function secondarySkill(atomic, clauses) {
 if (atomic.length < 3 || clauses.length < 2) return atomic.slice(0, 2);
 const [primary, second] = atomic;
 const documents = atomic.map(({record}) => ({id:record.id, text:[record.title, record.intent,
  ...record.queries, ...(record.evidence ?? []).map(witness => witness.quote)].join(' ')}));
 const search = createLexicalSearch(documents);
 const rawRanks = new Map(atomic.map((hit, index) => [hit.id, index]));
 let replacement = second;
 let bestGain = 0;
 for (const clause of clauses) {
  const hits = search(clause, documents.length).hits;
  const existing = Math.max(...hits.filter(hit => hit.id === primary.id || hit.id === second.id).map(hit => hit.score), 0);
  // A single overlapping word is weak unless a current skill also matches the clause.
  for (const hit of hits) {
   if (hit.id === primary.id || hit.id === second.id || (existing === 0 && hit.matches.length < 2)) continue;
   const gain = hit.score - existing;
   if (gain > bestGain || (gain > 0 && gain === bestGain && rawRanks.get(hit.id) < rawRanks.get(replacement.id))) {
    replacement = atomic[rawRanks.get(hit.id)];
    bestGain = gain;
   }
  }
 }
 return [primary, replacement];
}

/** Host-owned package context, shared by hybrid search and lexical availability fallback. */
export const rawCandidateLimit=100;
export function groupPackageCandidates(catalog,rawCandidates,query='',clauseSearch=null){
 const byPackage=new Map(),overviews=new Map();
 for(const record of catalog.records){
  if(record.kind!=='package-overview')continue;
  if(overviews.has(record.package.name))throw Error('Duplicate package overview');
  overviews.set(record.package.name,record);
 }
 // First occurrence in the real ranking owns package order. The separate discovery path has its own provenance.
 const collapsed=new Map();
 for(const hit of rawCandidates){
  if(!collapsed.has(hit.id))collapsed.set(hit.id,{...hit,sourceQuotes:[]});
  const owner=collapsed.get(hit.id);
  for(const quote of hit.sourceQuotes??[])if(!owner.sourceQuotes.some(q=>q.path===quote.path&&q.sha256===quote.sha256&&q.start===quote.start))owner.sourceQuotes.push(quote);
 }
 for(const hit of collapsed.values()){
  const name=hit.record.package.name;
  if(!byPackage.has(name)&&byPackage.size<5)byPackage.set(name,[]);
  const group=byPackage.get(name);if(group)group.push(hit);
 }
 const discovery = discoveryCue.test(query) && !discoveryOptOut.test(query)
  ? catalog.records.find(record => record.package.name === '@dzhechkov/skills-meta' && record.skillIds?.includes('explore'))
  : undefined;
 if (discovery && !byPackage.has(discovery.package.name)) {
  if (byPackage.size === 5) byPackage.delete([...byPackage.keys()].at(-1));
  byPackage.set(discovery.package.name, []);
 }
 const clauses = taskClauses(query);
 // A clause can expose an approved atomic skill missing from the broad ranking. Keep this lane bounded.
 let addedPackage = false;
 if (clauseSearch && clauses.length >= 2) {
  for (const clause of clauses) {
   const matches = clauseSearch(clause);
   const best = matches.find(hit => hit.matches.length >= (discovery ? 2 : 3));
   if (!best) continue;
   const packageName = best.record.package.name;
   if (!byPackage.has(packageName)) {
    const equivalent = matches.some(candidate => candidate.score >= best.score &&
     byPackage.get(candidate.record.package.name)?.some(hit => hit.id === candidate.id));
    if (!discovery || addedPackage || equivalent) continue;
    if (byPackage.size === 5) {
     const lastRanked = [...byPackage.keys()].findLast(name => name !== discovery.package.name);
     byPackage.delete(lastRanked);
    }
    byPackage.set(packageName, []);
    addedPackage = true;
   }
   const group = byPackage.get(packageName);
   if (!group.some(hit => hit.id === best.id)) group.push(collapsed.get(best.id) ?? best);
  }
 }
 const candidates=[];
 for(const [name,hits]of byPackage){
  const overview=overviews.get(name);
  if (overview && hits.length) candidates.push({id:overview.id,score:hits[0].score,record:overview,sourceQuotes:collapsed.get(overview.id)?.sourceQuotes??[]});
  const atomic = hits.filter(hit => hit.record.kind !== 'package-overview');
  const selected = secondarySkill(atomic, clauses);
  if (discovery?.package.name === name && !selected.some(hit => hit.id === discovery.id)) {
   if (selected.length === 2) selected.pop();
   selected.push({...collapsed.get(discovery.id), id:discovery.id, score:collapsed.get(discovery.id)?.score ?? 0, record:discovery, origin:'scoped-discovery'});
  }
  candidates.push(...selected);
 }
 return{candidates,diagnostics:{rawHitCount:rawCandidates.length,packageCount:byPackage.size,...(discovery?{discoveryCandidate:discovery.id}:{}),
  concentrated:rawCandidates.length===rawCandidateLimit&&byPackage.size<5}};
}
