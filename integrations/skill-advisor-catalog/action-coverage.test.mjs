import test from 'node:test';
import assert from 'node:assert/strict';
import {extractRequestedActions,retainActionCandidates} from './action-coverage.mjs';
import {currentCatalog} from './cli.mjs';
import {buildSourceProjection} from './source-projection.mjs';
import {createHybridRetriever,advisorIdentity} from './hybrid-advisor.mjs';
import {dialogueContract,renderDialogue} from './dialogue.mjs';
import {selectScenarios} from './selector.mjs';
import {recordHash} from './catalog.mjs';

const questionId = 'skills-academic-question-generator-346a6e99';
const assessmentId = 'skills-academic-answer-assessor-bf990c08';
const overviewId = 'skills-academic-overview-74144a5f';
const query = 'I need two methods: generate defense questions of different difficulty, then assess the completeness and depth of answers from a transcript.';
const catalog = currentCatalog();
const projection = buildSourceProjection(catalog);
const oldShortlist = [overviewId,'skills-academic-defense-evaluator-ad971909',assessmentId].map((id,index)=>projection.resolve({id,score:3-index}));
const raw = [...oldShortlist,projection.resolve({id:questionId,score:.2})];

test('explicit actions stay verbatim and exclude workflow connectors without separate objects, negation and quotes', () => {
 const result = extractRequestedActions(query);
 assert.deepEqual(result.actions.map(action=>action.text), ['generate defense questions of different difficulty','assess the completeness and depth of answers from a transcript']);
 for (const text of [
  'Design an API with pagination and error responses',
  'Исследуй и сформулируй проблему',
  'Generate a changelog, and do not write a release note',
  'Review this quoted example «создай отчет и составь план»',
  'Design a robot that can fold paper by hand',
 ]) assert.deepEqual(extractRequestedActions(text),{actions:[],overflow:false},text);
 const negative = extractRequestedActions('Create a release summary, then write release notes. Do not publish anything.');
 assert.deepEqual(negative.actions.map(action=>action.text),['Create a release summary','write release notes']);
});

test('independent slots recover the dropped academic sibling from approved source matches', () => {
 const grouped = retainActionCandidates(query,{candidates:oldShortlist,diagnostics:{}},raw,projection.clauseSearch);
 assert.equal(grouped.actions[0].candidateIds[0],questionId);
 assert.equal(grouped.actions[1].candidateIds[0],assessmentId);
 assert(grouped.candidates.some(hit=>hit.id===questionId));
 assert(grouped.actions.every(action=>!action.candidateIds.includes(overviewId)));
 assert(grouped.candidates.length<=15);
 assert(new Set(grouped.candidates.map(hit=>hit.record.package.name)).size<=5);
});

test('normal hybrid and local fallback bind coverage to eligible vetted action candidates', async () => {
 const identity = advisorIdentity(catalog);
 const options = {catalog,projection,searchUrl:'http://127.0.0.1',embed:async()=>({vectors:[Array(1024).fill(1)]})};
 const hybrid = createHybridRetriever({...options,fetchImpl:async()=>Response.json({...identity,hits:raw.map(({id,score})=>({id,score}))})});
 const fallback = createHybridRetriever({...options,embed:async()=>{throw Object.assign(Error('unavailable'),{code:'embedding-unavailable'});}});
 for (const search of [hybrid,fallback]) {
  const retrieval = await search(query);
  assert.equal(retrieval.actions[0].candidateIds[0],questionId);
  assert.equal(retrieval.actions[1].candidateIds[0],assessmentId);
  const approved = new Map(retrieval.candidates.map(({id,record})=>[id,{role:'analysis',recordHash:recordHash(record),summary:record.title,boundary:'Boundary',nextAction:'Next'}]));
  const contract = dialogueContract(approved);
  const full = {decision:'recommend',intent:'analyze',scenarioIds:[questionId,assessmentId],missingParts:[],clarification:null,
   coverage:[{actionId:'a1',scenarioId:questionId},{actionId:'a2',scenarioId:assessmentId}]};
  const rendered = renderDialogue(contract.materialize(retrieval,full),approved,{entries:[]});
  assert.equal(rendered.decision,'recommend');
  assert.equal(rendered.items[0].scenarios.length,2);
  assert.match(rendered.items[0].scenarios[0].summary,/question-generator/);
  assert.match(rendered.items[0].scenarios[1].summary,/answer-assessor/);
  assert.throws(()=>contract.materialize(retrieval,{...full,scenarioIds:[overviewId,assessmentId],coverage:[{actionId:'a1',scenarioId:overviewId},full.coverage[1]]}),/Unbound action coverage/);
  assert.throws(()=>contract.materialize(retrieval,{...full,coverage:full.coverage.slice(0,1)}),/Incomplete/);
  assert.throws(()=>contract.materialize(retrieval,{...full,coverage:[full.coverage[0],full.coverage[0]]}),/Duplicate/);
  assert.throws(()=>contract.materialize(retrieval,{...full,coverage:[{actionId:'a2',scenarioId:questionId},{actionId:'a1',scenarioId:assessmentId}]}),/Unbound/);
  const incomplete = contract.materialize(retrieval,{...full,scenarioIds:[assessmentId],coverage:[{actionId:'a1',scenarioId:null},full.coverage[1]]});
  assert.equal(incomplete.decision,'partial');
  assert.deepEqual(incomplete.missingParts,[retrieval.actions[0].text]);
 }
});

test('four explicit actions request a narrower scope before the selector can spend', async () => {
 const query = 'Compose a report; generate test scenarios; inspect the schema; publish the report';
 const grouped = retainActionCandidates(query,{candidates:[],diagnostics:{}},[],projection.clauseSearch);
 assert.equal(grouped.actionOverflow,true);
 const contract = dialogueContract(new Map());
 const result = await selectScenarios({query,...grouped},{contract,fetchImpl:()=>assert.fail('Provider called')});
 const rendered = renderDialogue(result.output,new Map(),{entries:[]});
 assert.equal(result.modelCalled,false);
 assert.equal(rendered.decision,'clarify');
 assert.match(rendered.clarificationQuestion,/Какие два или три/);
});

test('three explicit actions can retain three same-package skills within the candidate budget', () => {
 const candidates = Array.from({length:6},(_,index)=>({id:`skill${index}`,score:10-index,record:{id:`skill${index}`,kind:'skill',package:{name:'one'}},matches:['substantial']}));
 const text = 'Generate independent scenarios; assess transcripts; review architecture';
 const search = action => [candidates[action.includes('scenarios') ? 0 : action.includes('transcripts') ? 1 : 2],candidates[3]];
 const result = retainActionCandidates(text,{candidates,diagnostics:{}},candidates,search);
 assert.deepEqual(result.candidates.map(hit=>hit.id),['skill0','skill1','skill2']);
 assert(result.actions.every(action=>action.candidateIds.length===1));
});

test('ordered Russian and English requests reserve the specific stages and ignore the recommendation instruction', () => {
 const ru = 'Нужны два отдельных действия: сначала превратить PDF в разбитый на фрагменты корпус с привязкой к страницам; затем извлечь из этого корпуса проверенные единицы знаний. Посоветуйте пакет и точные скиллы. Не переносите знания в общий brain.';
 const baseline = {candidates:oldShortlist,diagnostics:{}};
 const grouped = retainActionCandidates(ru,baseline,raw,projection.clauseSearch);
 assert.equal(grouped.actions.length,2);
 assert.equal(grouped.actions[0].candidateIds[0],'skills-book-digitizer-book-ingest-e2428a74');
 assert.equal(grouped.actions[1].candidateIds[0],'skills-book-digitizer-book-knowledge-extract-4b67b2b1');
 const en = 'First, turn a transcript into a searchable website. Second, print 30 copies and physically distribute them. Recommend the catalog tools.';
 assert.deepEqual(extractRequestedActions(en).actions.map(action=>action.text),['turn a transcript into a searchable website','print 30 copies','physically distribute them']);
});

test('a declared list that cannot be fully recognized cannot fall through to a full answer', async () => {
 const query = 'I need two deliverables: generate practice questions and synthesize a scoring rubric.';
 const grouped = retainActionCandidates(query,{candidates:oldShortlist,diagnostics:{}},raw,projection.clauseSearch);
 assert.equal(grouped.actionListIncomplete,true);
 const contract = dialogueContract(new Map());
 const result = await selectScenarios({query,...grouped},{contract,fetchImpl:()=>assert.fail('Provider called')});
 const rendered = renderDialogue(result.output,new Map(),{entries:[]});
 assert.equal(result.modelCalled,false);
 assert.equal(rendered.decision,'clarify');
 assert.match(rendered.clarificationQuestion,/Перечислите нужные действия/);
});

test('the site clarification envelope lets newer actions replace an overflowing or incomplete request', () => {
 const baseline = {candidates:oldShortlist,diagnostics:{}};
 const initial = 'Compose a report; generate test scenarios; inspect the schema; publish the report';
 const marker = '\nПоследнее уточнение (при противоречии считать актуальным): ';
 assert.equal(retainActionCandidates(initial,baseline,raw,projection.clauseSearch).actionOverflow,true);
 const revised = initial + marker + 'Generate defense questions and assess answers from a transcript';
 const narrowed = retainActionCandidates(revised,baseline,raw,projection.clauseSearch);
 assert.equal(narrowed.actionOverflow,undefined);
 assert.deepEqual(narrowed.actions.map(action=>action.text),['Generate defense questions','assess answers from a transcript']);
 const refer = retainActionCandidates(initial + marker + 'Только второе и третье из списка',baseline,raw,projection.clauseSearch);
 assert.equal(refer.actionOverflow,undefined);
 const incomplete = 'I need two deliverables: generate practice questions and synthesize a scoring rubric.';
 assert.equal(retainActionCandidates(incomplete,baseline,raw,projection.clauseSearch).actionListIncomplete,true);
 const correction = retainActionCandidates(incomplete + marker + 'Generate practice questions and assess the rubric',baseline,raw,projection.clauseSearch);
 assert.equal(correction.actionListIncomplete,undefined);
 assert.equal(correction.actions.length,2);
});

test('cancelling a previously requested action removes it from required coverage', () => {
 const marker = '\nПоследнее уточнение (при противоречии считать актуальным): ';
 const baseline = {candidates:oldShortlist,diagnostics:{}};
 const narrowed = retainActionCandidates(query+marker+'Only generate defense questions; skip assessment.',baseline,raw,projection.clauseSearch);
 assert.deepEqual(narrowed.actions.map(action=>action.text),['generate defense questions']);
 assert.equal(narrowed.actions[0].candidateIds[0],questionId);
 const amended = retainActionCandidates(query+marker+'Отмени оценку ответов, она сейчас не нужна.',baseline,raw,projection.clauseSearch);
 assert.equal(amended.actions,undefined);
});

test('keeps a bilingual skill available when its registered name directly matches an action', () => {
 const id = 'skills-presentation-storyteller-presentation-storyteller-7ccca571';
 const candidate = projection.resolve({id,score:1});
 const task = 'First, create a persuasive presentation with source links and a slide-by-slide speaker script. Second, physically carry the stands from storage.';
 const result = retainActionCandidates(task,{candidates:[candidate],diagnostics:{}},[candidate],projection.clauseSearch);
 assert(result.actions[0].candidateIds.includes(id));
 assert.deepEqual(result.actions[1].candidateIds,[]);
 const approved = new Map([[id,{role:'artifact',recordHash:recordHash(candidate.record),summary:'Подготовит презентацию',boundary:'Не выполняет физическую работу',nextAction:'Укажите аудиторию'}]]);
 const contract = dialogueContract(approved);
 const choice = {decision:'partial',intent:'plan',scenarioIds:[id],missingParts:[],clarification:null,coverage:[
  {actionId:'a1',scenarioId:id},{actionId:'a2',scenarioId:null},
 ]};
 const answer = renderDialogue(contract.materialize({query:task,...result},choice),approved,{entries:[]});
 assert.match(answer.items[0].scenarios[0].summary,/presentation-storyteller/);
 assert.match(answer.lead,/физической работы/);
 assert.deepEqual(answer.missingParts,['physically carry the stands from storage']);
});

test('requesting visible method names does not invent another work item', () => {
 const text = 'First, assess the full written master’s thesis for methodology. Second, assess the oral presentation from its transcript. Recommend a package and identify the distinct method for each review.';
 assert.deepEqual(extractRequestedActions(text).actions.map(action=>action.text),[
  'assess the full written master’s thesis for methodology','assess the oral presentation from its transcript',
 ]);
});

test('a numbered digital task plus direct physical installation stays partial', () => {
 const text = 'Нужны два действия. 1. Превратить заметки в учебный сайт. 2. Физически прикрутить полку в комнате.';
 const grouped = retainActionCandidates(text,{candidates:oldShortlist,diagnostics:{}},raw,projection.clauseSearch);
 assert.equal(grouped.actions.length,2);
 assert.equal(grouped.actions[1].text,'Физически прикрутить полку в комнате');
 assert.deepEqual(grouped.actions[1].candidateIds,[]);
});

test('identifying a method for a new outcome stays a distinct action', () => {
 const text = 'Review our API latency, and identify the method for testing CSV exports.';
 assert.deepEqual(extractRequestedActions(text).actions.map(action=>action.text),['Review our API latency','identify the method for testing CSV exports']);
});
