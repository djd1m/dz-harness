import test from 'node:test';
import assert from 'node:assert/strict';
import {currentCatalog} from './cli.mjs';
import {recordHash} from './catalog.mjs';
import {compactDialogueContract,compactRequirements} from './compact-dialogue.mjs';
import {renderDialogue} from './dialogue.mjs';
import {buildSourceContext} from './source-context.mjs';

const catalog=currentCatalog(),context=buildSourceContext(catalog);
const get=skill=>catalog.records.find(r=>r.package.name==='@dzhechkov/skills-devops' && r.skillIds?.includes(skill));
const compose=get('docker-compose'),review=get('pr-review'),ci=get('ci-fix');
const presentation=new Map([compose,review,ci].map(row=>[row.id,{recordHash:recordHash(row),role:'guide',summary:row.title,boundary:'Границы навыка',nextAction:'Проверьте документацию'}]));
const contract=compactDialogueContract(presentation,context);
const candidates=(...records)=>records.map(record=>({id:record.id,record}));
const composeQuery='Нужен Docker Compose для web и PostgreSQL: база должна сохраняться в именованном томе, а web ждать успешного healthcheck базы. Какой навык выбрать?';

test('compact Compose slots get distinct source passages for named volume and readiness',()=>{
 const retrieval={query:composeQuery,candidates:candidates(compose)};
 const input=contract.input(retrieval);
 assert.equal(input.requirements.length,3);
 const passages=input.cards[0].passages;
 const volume=passages.find(p=>/named volume/i.test(p.text));
 const health=passages.find(p=>/service_healthy/i.test(p.text));
 assert.ok(volume,JSON.stringify(passages));
 assert.ok(health,JSON.stringify(passages));
 assert.notEqual(volume.id,health.id);
 const answer=renderDialogue(contract.materialize(retrieval,{i:'plan',m:[['r1',volume.id],['r2',volume.id],['r3',health.id]]},input),presentation,{entries:[]});
 const details=answer.items[0].scenarios[0].details;
 assert.match(details.find(d=>d.action.includes('именованном')).quote,/named volume/i);
 assert.match(details.find(d=>d.action.includes('healthcheck')).quote,/service_healthy/i);
});

test('compact references resolve to both distinct CI skills; null is a visible scope gap',()=>{
 const query='Подготовь ревью PR; исправь ошибку красного CI';
 const retrieval={query,candidates:candidates(review,ci),actions:[
  {id:'a1',text:'Подготовь ревью PR',candidateIds:[review.id]},
  {id:'a2',text:'исправь ошибку красного CI',candidateIds:[ci.id]},
 ]};
 const input=contract.input(retrieval);
 const references=input.cards.map(card=>card.passages[0].id);
 const result=contract.materialize(retrieval,{i:'plan',m:[['r1',references[0]],['r2',references[1]]]},input);
 assert.deepEqual(result.records.map(r=>r.id),[review.id,ci.id]);
 const partial=contract.materialize(retrieval,{i:'plan',m:[['r1',references[0]],['r2',null]]},input);
 assert.equal(partial.decision,'partial');
 assert.deepEqual(partial.missingParts,['исправь ошибку красного CI']);
 assert.throws(()=>contract.materialize(retrieval,{i:'plan',m:[['r1',references[0]],['r1',references[1]]]},input),/Invalid compact requirement/);
 assert.throws(()=>contract.materialize(retrieval,{i:'plan',m:[['r1',references[0]],['r2','unissued']]},input),/Invalid compact passage/);
});

test('recognized physical work cannot be selected and request overflow asks priority',()=>{
 const query='Write a deployment plan; physically carry the machine downstairs';
 const retrieval={query,candidates:candidates(compose),actions:[
  {id:'a1',text:'Write a deployment plan',candidateIds:[compose.id]},
  {id:'a2',text:'physically carry the machine downstairs',candidateIds:[]},
 ]};
 const input=contract.input(retrieval),reference=input.cards[0].passages[0].id;
 assert.equal(input.requirements[1].manual,true);
 assert.throws(()=>contract.materialize(retrieval,{i:'plan',m:[['r1',reference],['r2',reference]]},input),/Invalid compact passage/);
 assert.equal(contract.materialize(retrieval,{i:'plan',m:[['r1',reference],['r2',null]]},input).limitReason,'physical-action');
 const long={query:'First condition; Second condition; Third condition; Fourth condition; Fifth condition; Sixth condition; Seventh condition',candidates:[]};
 assert.equal(contract.preflight(long).clarification,'many-requirements');
 const latest={query:'Напиши код.\nПоследнее уточнение (при противоречии считать актуальным): Только составь план.',candidates:[]};
 assert.deepEqual(compactRequirements(latest).map(r=>r.text),['Только составь план.']);
});

test('a single inferred clause can reference complementary cards and disclose an exact narrower gap',()=>{
 const query='Review the PR and fix CI and physically deliver the printout';
 const retrieval={query,candidates:candidates(review,ci)};
 const input=contract.input(retrieval);
 assert.equal(input.requirements.length,1);
 const result=contract.materialize(retrieval,{i:'plan',m:[['r1',...input.cards.map(card=>card.passages[0].id)]],
  x:['physically deliver the printout']},input);
 assert.equal(result.decision,'partial');
 assert.deepEqual(result.records.map(r=>r.id),[review.id,ci.id]);
 assert.deepEqual(result.missingParts,['physically deliver the printout']);
 assert.ok(result.details.every(detail=>!detail.requirement.includes('physically deliver')));
 const shown=renderDialogue(result,presentation,{entries:[]});
 assert.equal(shown.items[0].scenarios.length,2);
 for(const scenario of shown.items[0].scenarios) {
  assert.equal(scenario.details[0].joint,true);
  assert.equal(scenario.details[0].action,'Review the PR and fix CI');
 }
});

test('non-narrowing clarifications preserve original requirements',()=>{
 const query='Настроить Compose с именованным томом.\nПоследнее уточнение (при противоречии считать актуальным): PostgreSQL 16';
 assert.deepEqual(compactRequirements({query,candidates:[]}).map(r=>r.text),
  ['Настроить Compose с именованным томом.','PostgreSQL 16']);
});
