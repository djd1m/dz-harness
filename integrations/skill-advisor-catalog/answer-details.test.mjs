import test from 'node:test';
import assert from 'node:assert/strict';
import {currentCatalog} from './cli.mjs';
import {recordHash} from './catalog.mjs';
import {dialogueContract,renderDialogue} from './dialogue.mjs';
import {selectScenarios} from './selector.mjs';
import {buildSourceContext} from './source-context.mjs';

const catalog = currentCatalog();
const context = buildSourceContext(catalog);
const adapter = catalog.records.find(record=>record.package.name==='@dzhechkov/adapter-agents-md');
const design = catalog.records.find(record=>record.skillIds?.includes('design-taste-frontend') && record.package.name==='@dzhechkov/skills-taste');
const docs = new Map([adapter,design].map(record=>[record.id,{
 recordHash:recordHash(record),role:'guide',summary:'Описание',boundary:'Ограничение',nextAction:'Следующий шаг',
}]));
const contract = dialogueContract(docs,context);
const courses = {entries:[]};
const candidate = (record, phrase) => {
 const evidence = context.indexEntries.find(entry=>entry.ownerId===record.id&&entry.evidence.quote.includes(phrase)).evidence;
 return {id:record.id,record,sourceQuotes:[evidence]};
};
const findPassage = (retrieval, owner, phrase) => {
 const card = contract.input(retrieval).candidates.find(card=>card.id===owner);
 const passage = card.passages.find(row=>row.text.includes(phrase));
 assert.ok(passage,phrase);
 return passage;
};

test('a selected adapter shows two independently requested details from source IDs', () => {
 const preserve = 'preserved byte-for-byte';
 const merge = 'The merge is idempotent.';
 const retrieval = {query:'Сохранить авторский текст вокруг блока AGENTS.md, повторный merge должен быть идемпотентным',candidates:[candidate(adapter,preserve)]};
 const details=[
  {scenarioId:adapter.id,actionId:null,requirement:'Сохранить авторский текст',passageId:findPassage(retrieval,adapter.id,preserve).id},
  {scenarioId:adapter.id,actionId:null,requirement:'повторный merge должен быть идемпотентным',passageId:findPassage(retrieval,adapter.id,merge).id},
 ];
 const choice = {decision:'recommend',intent:'learn',scenarioIds:[adapter.id],missingParts:[],clarification:null,details};
 const rendered=renderDialogue(contract.materialize(retrieval,choice),docs,courses);
 assert.deepEqual(rendered.items[0].scenarios[0].details.map(detail=>detail.action),details.map(detail=>detail.requirement));
 assert.ok(rendered.items[0].scenarios[0].details.every(detail=>detail.quote.includes(preserve)));
 const missing = {...choice,decision:'partial',details:details.slice(0,1),missingParts:[details[1].requirement]};
 assert.deepEqual(renderDialogue(contract.materialize(retrieval,missing),docs,courses).missingParts,[details[1].requirement]);
 assert.throws(()=>contract.materialize(retrieval,{...missing,details}),/also listed as missing/);
 assert.throws(()=>contract.materialize(retrieval,{...choice,details:[]}),/lacks a documented requirement/);
});

test('a documented card outside lexical hints can cover an action; a physical gap stays visible', () => {
 const text = 'настрой выразительность, плотность и интенсивность движения';
 const gap = 'physically carry the disconnected machine';
 const phrase = '1 = Static, 10 = Cinematic / Physics';
 const retrieval = {query:`${text}; ${gap}`,candidates:[candidate(design,phrase)],actions:[
  {id:'a1',text,candidateIds:[]},{id:'a2',text:gap,candidateIds:[]},
 ]};
 const passage = findPassage(retrieval,design.id,phrase);
 const choice = {decision:'recommend',intent:'plan',scenarioIds:[design.id],missingParts:[],clarification:null,
  coverage:[{actionId:'a1',scenarioId:design.id},{actionId:'a2',scenarioId:null}],
  details:[{scenarioId:design.id,actionId:'a1',requirement:text,passageId:passage.id}]};
 const answer = renderDialogue(contract.materialize(retrieval,choice),docs,courses);
 assert.equal(answer.decision,'partial');
 assert.deepEqual(answer.missingParts,[gap]);
 assert.deepEqual(answer.items[0].scenarios[0].details,[{action:text,quote:passage.text}]);
 const physical = {...choice,coverage:[choice.coverage[0],{actionId:'a2',scenarioId:design.id}],
  details:[...choice.details,{scenarioId:design.id,actionId:'a2',requirement:gap,passageId:passage.id}]};
 assert.throws(()=>contract.materialize(retrieval,physical),/Unbound action coverage/);
});

test('cross-card, fabricated and duplicated selections reject with a bounded diagnostic', async () => {
 const phrase = 'preserved byte-for-byte';
 const retrieval = {query:'Сохранить разделы AGENTS.md',candidates:[candidate(adapter,phrase),{id:design.id,record:design}]};
 const detail = {scenarioId:adapter.id,actionId:null,requirement:retrieval.query,passageId:findPassage(retrieval,adapter.id,phrase).id};
 const choice={decision:'recommend',intent:'learn',missingParts:[],clarification:null,scenarioIds:[adapter.id],details:[detail]};
 assert.throws(()=>contract.materialize(retrieval,{...choice,details:[detail,detail]}),/repeated/);
 assert.throws(()=>contract.materialize(retrieval,{...choice,details:[{...detail,scenarioId:design.id}]}),/Unknown/);
 assert.throws(()=>contract.materialize(retrieval,{...choice,details:[{...detail,passageId:contract.input(retrieval).candidates[1].passages[0].id}]}),/Unknown answer passage/);
 assert.throws(()=>contract.materialize(retrieval,{...choice,details:[{...detail,actionId:'a1'}]}),/Unbound answer detail action/);
 const response = {...choice,details:[{...detail,passageId:'not-supplied-9'}]};
 await assert.rejects(()=>selectScenarios(retrieval,{contract,model:'fixture',apiKey:'fixture',
  fetchImpl:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]})}),
 error=>error.code==='invalid-choice'&&error.choiceReason==='detail-passage'&&!error.message.includes('not-supplied'));
});

test('coverage conflicts use final gaps without conflating repeated words in separate tasks', () => {
 const first = 'prepare a report and preserve the authored text';
 const second = 'physically carry the report to the office';
 const phrase = 'preserved byte-for-byte';
 const retrieval = {query:first+'; '+second,candidates:[candidate(adapter,phrase)],actions:[
  {id:'a1',text:first,candidateIds:[adapter.id]},{id:'a2',text:second,candidateIds:[]},
 ]};
 const passage = findPassage(retrieval,adapter.id,phrase);
 const choice = {decision:'partial',intent:'plan',scenarioIds:[adapter.id],missingParts:[],clarification:null,coverage:[
  {actionId:'a1',scenarioId:adapter.id},{actionId:'a2',scenarioId:null},
 ],details:[{scenarioId:adapter.id,actionId:'a1',requirement:'report',passageId:passage.id}]};
 const answer = renderDialogue(contract.materialize(retrieval,choice),docs,courses);
 assert.equal(answer.decision,'partial');
 assert.deepEqual(answer.missingParts,[second]);
 assert.throws(()=>contract.materialize(retrieval,{...choice,missingParts:['preserve the authored text'],
  details:[{...choice.details[0],requirement:'authored text'}]}),/also listed as missing/);
});
