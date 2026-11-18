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

test('a selected adapter shows the exact source-backed authored-text guarantee', () => {
 const quote = 'Everything **outside** the fence is preserved byte-for-byte. The merge is idempotent.';
 const retrieval = {query:'Сохранить авторский текст вокруг блока AGENTS.md',candidates:[candidate(adapter,quote)]};
 const choice = {decision:'recommend',intent:'learn',scenarioIds:[adapter.id],missingParts:[],clarification:null,
  details:[{scenarioId:adapter.id,actionId:null,quote}]};
 assert(contract.input(retrieval).candidates[0].sourceContext.some(witness=>witness.quote.includes(quote)));
 const rendered=renderDialogue(contract.materialize(retrieval,choice),docs,courses);
 assert.deepEqual(rendered.items[0].scenarios[0].details,[{action:null,quote}]);
 const oldChoice = {...choice}; delete oldChoice.details;
 assert.equal(renderDialogue(contract.materialize(retrieval,oldChoice),docs,courses).items[0].scenarios[0].details,undefined);
});

test('a scoped cited skill can cover an action outside the lexical hints; a physical gap stays visible', () => {
 const text = 'настрой выразительность, плотность и интенсивность движения';
 const gap = 'physically carry the disconnected machine';
 const matchingLine = '1 = Static, 10 = Cinematic / Physics';
 const retrieval = {query:`${text}; ${gap}`,candidates:[candidate(design,matchingLine)],actions:[
  {id:'a1',text,candidateIds:[]},{id:'a2',text:gap,candidateIds:[]},
 ]};
 const choice = {decision:'recommend',intent:'plan',scenarioIds:[design.id],missingParts:[],clarification:null,
  coverage:[{actionId:'a1',scenarioId:design.id},{actionId:'a2',scenarioId:null}],
  details:[{scenarioId:design.id,actionId:'a1',quote:matchingLine}]};
 const answer = renderDialogue(contract.materialize(retrieval,choice),docs,courses);
 assert.equal(answer.decision,'partial');
 assert.deepEqual(answer.missingParts,[gap]);
 assert.deepEqual(answer.items[0].scenarios[0].details,[{action:text,quote:matchingLine}]);
 assert.throws(()=>contract.materialize(retrieval,{...choice,details:[]}),/Unbound action coverage/);
 const physical = {...choice,coverage:[choice.coverage[0],{actionId:'a2',scenarioId:design.id}],
  details:[...choice.details,{scenarioId:design.id,actionId:'a2',quote:matchingLine}]};
 assert.throws(()=>contract.materialize(retrieval,physical),/Unbound action coverage/);
});

test('details reject fabricated, cross-card, duplicate and unbound excerpts with safe rejection reason', async () => {
 const quote = 'Everything **outside** the fence is preserved byte-for-byte. The merge is idempotent.';
 const retrieval = {query:'Сохранить разделы AGENTS.md',candidates:[candidate(adapter,quote),{id:design.id,record:design}]};
 const detail = {scenarioId:adapter.id,actionId:null,quote};
 const choice={decision:'recommend',intent:'learn',missingParts:[],clarification:null,scenarioIds:[adapter.id],details:[detail]};
 assert.throws(()=>contract.materialize(retrieval,{...choice,details:[detail,detail]}),/Duplicate/);
 assert.throws(()=>contract.materialize(retrieval,{...choice,details:[{...detail,scenarioId:design.id}]}),/Unknown/);
 assert.throws(()=>contract.materialize(retrieval,{...choice,details:[{...detail,actionId:'a1'}]}),/Unbound answer detail action/);
 const response = {...choice,details:[{...detail,quote:'This text was invented by the model.'}]};
 await assert.rejects(()=>selectScenarios(retrieval,{contract,model:'fixture',apiKey:'fixture',
  fetchImpl:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]})}),
 error=>error.code==='invalid-choice'&&error.choiceReason==='detail-quote'&&!error.message.includes('invented'));
});
