import {ChoiceError} from './choice-error.mjs';
import {stems} from '../../packages/harness-core/dist/stem.js';

/** A bounded, host-owned coverage check for explicitly coordinated actions. */
const actionLimit = 3;
const heads = [
 'analy[sz]e','assess','build','carry','check','choose','classify','collect','compare','compose','convert','create','deliver',
 'deploy','design','distribute','draft','evaluate','explain','extract','fold','generate','identify','implement','import','index',
 'inspect','map','migrate','package','plan','prepare','print','prioriti[sz]e','publish','rank','read','review',
 'rewrite','run','select','set up','test','transform','turn','validate','verify','write',
 'анализируй','выбери','выбрать','выдели','выделить','доставь','доставить','заставь','заставить',
 'извлеки','извлечь','импортируй','импортировать','настрой','настроить','напиши','написать','объясни','объяснить',
 'определи','определить','оцени','оценить','перепиши','переписать','подбери','подобрать','подготовь','подготовить','прикрути','прикрутить',
 'проверь','проверить','преврати','превратить','преобразуй','преобразовать','проанализируй','проанализировать','разбери','разобрать','развёрни','разверни','развернуть',
 'сгенерируй','сгенерировать','сделай','сделать','собери','собрать','создай','создать','составь','составить',
 'спланируй','спланировать','спроектируй','спроектировать','сравни','сравнить','уточни','уточнить',
].join('|');
const modifiers = '(?:(?:separately|physically|then|please|first|second|third|fourth|also|затем|сначала|отдельно|также|пожалуйста|гарантированно|вручную|физически)(?:,\\s+|\\s+)){0,3}';
const leadingModifiers = new RegExp(`^${modifiers}`, 'iu');
const actionStart = new RegExp(`^${modifiers}(?:${heads})(?![\\p{L}\\p{N}_-])`, 'iu');
const connector = '(?:and(?:\\s+then)?|then|и(?:\\s+(?:затем|потом))?|а\\s+(?:затем|потом|также|ещё|отдельно)|затем|потом)';
const separators = new RegExp(`[;:\\n]|[.!?](?=\\s|$)|,?\\s+${connector}\\s+(?=${modifiers}(?:${heads})(?![\\p{L}\\p{N}_-]))|,\\s*(?=${modifiers}(?:${heads})(?![\\p{L}\\p{N}_-]))`, 'giu');
const answerFormat = /^(?:(?:identify|name|list|indicate|state)\s+(?:(?:the|a|specific|separate|distinct|exact|which|relevant)\s+){0,4}(?:skills?|methods?|packages?|tools?|scenarios?)\b(?=\s*(?:[.!?]?$|for\s+(?:each\b|both\b|the supported work\b)))|(?:назови\p{L}*|укажи\p{L}*|перечисли\p{L}*)\s+(?:(?:точн\p{L}*|отдельн\p{L}*|конкретн\p{L}*)\s+){0,3}(?:скилл\p{L}*|навык\p{L}*|пакет\p{L}*|метод\p{L}*)(?=\s*(?:[.!?]?$|для\s+(?:кажд\p{L}*|обоих|обеих)(?!\p{L}))))/iu;
const politeLead = /^(?:(?:please\s+)?(?:i\s+(?:need|want)\s+(?:you\s+)?to|help\s+me(?:\s+to)?|можешь|надо|нужно|помоги|помогите|хочу)\s+)/iu;
const explicitList = /(?:\b(?:i|we)\s+(?:need|want)\s+(two|three|four|[2-4])\s+(?:(?:distinct|separate|independent)\s+)?(?:methods|actions|deliverables|tasks)\s*:|(?:нужны|требуются)\s+(два|две|три|четыре|[2-4])\s+(?:(?:отдельных|самостоятельных)\s+)?(?:действия|задачи|метода|результата)\s*:)/iu;
const explicitCount = new Map([['two',2],['два',2],['две',2],['three',3],['три',3],['four',4],['четыре',4]]);
export const directlyPhysical = /^(?:physically\s+(?:carry|deliver|distribute|move|lift|fold|tune)\b|(?:физически|вручную)\s+(?:перенес\p{L}*|достав\p{L}*|перемест\p{L}*|прикрут\p{L}*|слож\p{L}*))/iu;
const negatedAction = /^(?:do not\b|don['’]t\b|never\b|skip\b|omit\b|не(?!\p{L}))/iu;
const numberedMarker = /(?:^|(?<=[\s:;]))\(([1-9]\d*)\)\s+/gu;
const skillNames = text => new Set(text.toLowerCase().match(/[a-z0-9]+(?:[-_][a-z0-9]+)+/g) ?? []);
const searchWords = /[\p{L}\p{N}]+/gu;
const weakTerms = new Set('the and from what which who when where with into for are was has have this that their our your after before then also including separately please generate create assess make choose how what как кого чего какой этом этот затем потом после перед чтобы можно помоги нужн способ'.split(' '));

export function extractRequestedActions(query,{allowSingle=false}={}) {
 // Keep positions stable while preventing quoted examples from defining an action boundary.
 const masked = query.replace(/"[^"\n]*"|“[^”\n]*”|«[^»\n]*»|`[^`\n]*`/gu, part => '·'.repeat(part.length));
 const declared = masked.match(explicitList);
 const count = declared ? (declared[1] ?? declared[2]).toLowerCase() : null;
 const expected = count ? explicitCount.get(count) ?? Number(count) : 0;
 const numbered = [...masked.matchAll(numberedMarker)];
 // A sequential inline list after a heading carries its own action boundaries.
 if (numbered.length >= 2 && /^[\s\S]*[:\n]\s*$|^\s*$/u.test(masked.slice(0, numbered[0].index)) &&
     numbered.every((marker, index) => Number(marker[1]) === index + 1)) {
  const actions = numbered.map((marker,index) => {
   const start = marker.index + marker[0].length;
   const end = numbered[index+1]?.index ?? query.length;
   return query.slice(start,end).trim().replace(/[;\s]+$/u,'');
  });
  if (actions.some(text=>!text) || expected > actions.length) return {actions:[],overflow:false,incomplete:true};
  const requested = actions.filter(text=>{
   const normalized = text.replace(politeLead,'').replace(leadingModifiers,'');
   return !negatedAction.test(normalized) && !answerFormat.test(normalized);
  });
  if (requested.length > actionLimit) return {actions:[],overflow:true};
  return {actions:requested.length >= (allowSingle ? 1 : 2)
   ? requested.map((text,index)=>({id:`a${index+1}`,text})) : [],overflow:false};
 }
 if (expected > actionLimit) return {actions:[],overflow:true};
 const actions = [];
 let start = 0;
 for (const separator of [...masked.matchAll(separators), {index:query.length, 0:''}]) {
  const segment = masked.slice(start, separator.index);
  const leftSpace = segment.length - segment.trimStart().length;
  const lead = segment.trimStart().match(politeLead)?.[0] ?? '';
  const content = segment.slice(leftSpace + lead.length);
  const head = content.match(actionStart)?.[0];
  if (head && !answerFormat.test(content) && /[\p{L}\p{N}·]/u.test(content.slice(head.length))) {
   const text = query.slice(start + leftSpace + lead.length, separator.index).trim();
   if (text) actions.push({id:`a${actions.length + 1}`,text});
   if (actions.length > actionLimit) return {actions:[],overflow:true};
  }
  start = separator.index + separator[0].length;
 }
 if (expected > actions.length) return {actions:[],overflow:false,incomplete:true};
 return {actions:actions.length >= (allowSingle ? 1 : 2) ? actions : [],overflow:false};
}

// The existing site joins conversation turns with this marker and retains the original query.
const clarificationMarker = '\nПоследнее уточнение (при противоречии считать актуальным): ';
const onlyAction = /^(?:only|just|только|лишь)\s+/iu;
const scopeChange = /(?:\b(?:instead|skip|omit|exclude|cancel|no longer|no need|don['’]t|do not)\b|(?:вместо|отмени\p{L}*|исключи\p{L}*|не\s+(?:нужн\p{L}*|надо)|оставь\s+только))/iu;

function currentRequestedActions(query) {
 const marker = query.lastIndexOf(clarificationMarker);
 if (marker < 0) return extractRequestedActions(query);
 const clarification = query.slice(marker + clarificationMarker.length).trimStart();
 const only = clarification.match(onlyAction)?.[0] ?? '';
 const current = extractRequestedActions(clarification.slice(only.length),{allowSingle:Boolean(only)});
 if (current.actions.length || current.overflow || current.incomplete || only || scopeChange.test(clarification)) return current;
 const previous = extractRequestedActions(query.slice(0,marker));
 // After asking to narrow the scope, the newest turn can answer by referring to earlier items.
 // Retain the full conversation for the selector, but do not repeat the earlier host question.
 return previous.overflow || previous.incomplete ? current : previous;
}

export function retainActionCandidates(query, baseline, raw, clauseSearch) {
 const {actions,overflow,incomplete} = currentRequestedActions(query);
 if (overflow || incomplete) return {...baseline,...(overflow ? {actionOverflow:true} : {actionListIncomplete:true})};
 if (!actions.length || !clauseSearch) return baseline;
 const validatedRaw = new Map();
 for (const hit of raw) if (!validatedRaw.has(hit.id)) validatedRaw.set(hit.id,hit);
 const ranked = actions.map(action => {
  if (directlyPhysical.test(action.text)) return {...action,hits:[]};
  const terms = (action.text.toLowerCase().match(searchWords) ?? []).filter(word=>word.length>2&&!weakTerms.has(word));
  const stemsByAction = new Set(stems(terms.join(' ')));
  const lexical = clauseSearch(terms.join(' ')).filter(hit=>hit.matches.some(term=>term.length>3&&!weakTerms.has(term)));
  // Exact registered names can recover a skill that package grouping already dropped.
  const names = skillNames(action.text);
  const exact = [...validatedRaw.values(),...lexical].filter(({record})=>
   record.skillIds?.some(id=>names.has(id.toLowerCase())));
  const bySkillName = baseline.candidates.find(({record})=>stems((record.skillIds??[]).join(' '))
   .some(term=>term.length>3&&!weakTerms.has(term)&&stemsByAction.has(term)));
  const candidates = [...exact,...lexical.slice(0,1),...(bySkillName ? [bySkillName] : []),...lexical.slice(1)];
  return {...action,hits:[...new Map(candidates.map(hit=>[hit.id,hit])).values()].slice(0,2)};
 });
 const retained = new Map();
 const packages = new Set();
 const skillCounts = new Map();
 function retain(hit) {
  const name = hit.record.package.name;
  if (retained.has(hit.id)) return;
  if (retained.size >= 15 || (!packages.has(name) && packages.size >= 5)) return;
  const overview = hit.record.kind === 'package-overview';
  const count = skillCounts.get(name) ?? 0;
  if (!overview && count >= Math.max(2,actions.length)) return;
  retained.set(hit.id,hit);
  packages.add(name);
  if (!overview) skillCounts.set(name,count+1);
 }
 // Reserve one candidate per action before admitting alternatives or full-query cards.
 for (let rank = 0; rank < 2; rank++) {
  for (const {hits} of ranked) {
   const hit = hits[rank];
   if (hit) retain({...validatedRaw.get(hit.id),...hit,origin:'requested-action'});
  }
 }
 for (const hit of baseline.candidates) retain(hit);
 return {
  ...baseline,
  candidates:[...retained.values()],
  actions:ranked.map(({hits,...action})=>({...action,candidateIds:hits.filter(hit=>retained.has(hit.id)).map(hit=>hit.id)})),
  diagnostics:{...baseline.diagnostics,packageCount:packages.size,requestedActionCount:actions.length},
 };
}

export function actionScenarioIds(row) {
 if (Array.isArray(row?.scenarioIds)) return row.scenarioIds;
 return typeof row?.scenarioId==='string' ? [row.scenarioId] : [];
}

export function supportsActionCard(action,candidate,documented) {
 return Boolean(candidate && !directlyPhysical.test(action.text) &&
  (action.candidateIds.includes(candidate.id) ||
   (documented && candidate.record.kind && candidate.record.kind!=='package-overview')));
}

export function applyActionCoverage(retrieval, choice, details = []) {
 const actions = retrieval.actions ?? [];
 if (!actions.length) return {...choice,coveredActions:[]};
 if (!Array.isArray(choice.coverage) || choice.coverage.length !== actions.length) throw new ChoiceError('action-coverage','Incomplete action coverage');
 const coverage = new Map();
 for (const row of choice.coverage) {
  if (!row || coverage.has(row.actionId)) throw new ChoiceError('action-coverage','Duplicate or invalid action coverage');
  const action = actions.find(candidate => candidate.id === row.actionId);
  if (!action) throw new ChoiceError('action-eligibility','Unbound action coverage');
  const ids = actionScenarioIds(row);
  const multi = Object.hasOwn(row,'scenarioIds');
  if (multi ? (row.scenarioId!==undefined || !ids.length || ids.length>3 || new Set(ids).size!==ids.length)
    : (row.scenarioId!==null && !ids.length)) {
   throw new ChoiceError('action-coverage','Invalid action scenario IDs');
  }
  for (const id of ids) {
   const candidate = retrieval.candidates.find(hit=>hit.id===id);
   const documented = details.some(detail=>detail.actionId===row.actionId && detail.scenarioId===id);
   if (!supportsActionCard(action,candidate,documented) || (multi && !documented)) {
    throw new ChoiceError('action-eligibility','Unbound action coverage');
   }
  }
  coverage.set(row.actionId,ids);
 }
 const coveredActions = actions.flatMap(action=>{
  const ids=coverage.get(action.id);
  return (ids.length?ids:[null]).map(scenarioId=>({id:action.id,text:action.text,scenarioId}));
 });
 const scenarioIds = [...new Set(coveredActions.flatMap(action=>action.scenarioId===null ? [] : [action.scenarioId]))];
 if (choice.scenarioIds.length !== scenarioIds.length || choice.scenarioIds.some(id => !scenarioIds.includes(id))) throw new ChoiceError('action-selection','Unbound action selection');
 const gaps = coveredActions.filter(action=>action.scenarioId===null).map(action=>action.text.slice(0,160).trimEnd());
 const combined = [...new Set([...gaps,...choice.missingParts])];
 const missingParts = combined.filter(quote=>!combined.some(other=>other!==quote&&other.includes(quote)));
 if (missingParts.length > actionLimit) throw new ChoiceError('missing-parts','Too many stated gaps');
 if (scenarioIds.length && ['no-match','clarify'].includes(choice.decision)) throw new ChoiceError('action-decision','Unexpected coverage decision');
 if (choice.decision==='partial' && scenarioIds.length && !missingParts.length) throw new ChoiceError('missing-parts','Missing scope for partial coverage');
 const decision = scenarioIds.length ? (missingParts.length ? 'partial' : 'recommend') : (choice.decision==='clarify' ? 'clarify' : 'no-match');
 return {...choice,decision,scenarioIds,coveredActions,missingParts:decision==='clarify' ? [] : missingParts};
}
