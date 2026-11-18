import test from 'node:test';
import assert from 'node:assert/strict';
import {currentCatalog} from './cli.mjs';
import {recordHash} from './catalog.mjs';
import {compactDialogueContract,compactRequirements} from './compact-dialogue.mjs';
import {renderDialogue} from './dialogue.mjs';
import {buildSourceContext} from './source-context.mjs';
import {liveAnswer} from './preview-server.mjs';

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
 const recovered=contract.materialize(retrieval,{i:'plan',m:[['r1',references[0]],['r2','c2p99']]},input);
 assert.equal(recovered.decision,'partial');
 assert.deepEqual(recovered.records.map(r=>r.id),[review.id]);
 assert.deepEqual(recovered.recoveries,['passage-unissued']);
 assert.deepEqual(recovered.missingParts,['исправь ошибку красного CI']);
 assert.match(renderDialogue(recovered,presentation,{entries:[]}).lead,/без подтверждения/);
});

test('recognized physical work cannot be selected and request overflow asks priority',()=>{
 const query='Write a deployment plan; physically carry the machine downstairs';
 const retrieval={query,candidates:candidates(compose),actions:[
  {id:'a1',text:'Write a deployment plan',candidateIds:[compose.id]},
  {id:'a2',text:'physically carry the machine downstairs',candidateIds:[]},
 ]};
 const input=contract.input(retrieval),reference=input.cards[0].passages[0].id;
 assert.equal(input.requirements[1].manual,true);
 const skipped=contract.materialize(retrieval,{i:'plan',m:[['r1',reference],['r2',reference]]},input);
 assert.deepEqual(skipped.recoveries,['manual-scope']);
 assert.equal(skipped.details.length,1);
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

test('an identified bad row stays a gap, even with a valid alias mixed into the row',()=>{
 const request={query:'Подготовь ревью PR; исправь ошибку красного CI',candidates:candidates(review,ci),actions:[
  {id:'a1',text:'Подготовь ревью PR',candidateIds:[review.id]},
  {id:'a2',text:'исправь ошибку красного CI',candidateIds:[ci.id]},
 ]};
 const input=contract.input(request),[first,second]=input.cards.map(card=>card.passages[0].id);
 for(const [bad,reason] of [[['c2p99'],'passage-unissued'],[[false],'passage-format'],[[second,second],'passage-duplicate']]){
  const result=contract.materialize(request,{i:'plan',m:[['r1',first],['r2',...bad]]},input);
  assert.equal(result.decision,'partial');
  assert.deepEqual(result.records.map(row=>row.id),[review.id]);
  assert.deepEqual(result.recoveries,[reason]);
 }
 const mixed=contract.materialize(request,{i:'plan',m:[['r1',first],['r2',second,'c2p99']]},input);
 assert.equal(mixed.details.length,1);
 assert.deepEqual(mixed.missingParts,['исправь ошибку красного CI']);
 assert.throws(()=>contract.materialize(request,{i:'plan',m:[['r1',first],['r9',second]]},input),/Invalid compact requirement/);
 const all=contract.materialize(request,{i:'plan',m:[['r1','c1p99'],['r2','c2p99']]},input);
 const shown=renderDialogue(all,presentation,{entries:[]});
 assert.equal(shown.decision,'no-match');
 assert.deepEqual(shown.items,[]);
 assert.match(shown.lead,/Не удалось подтвердить/);
 assert.ok(!JSON.stringify(shown).includes('c2p99'));
});

test('one recognized action can have independently documented complementary cards',()=>{
 const query='Подготовь ревью PR и устрани причину сбоя CI';
 const retrieval={query,candidates:candidates(review,ci),actions:[
  {id:'a1',text:query,candidateIds:[review.id,ci.id]},
 ]};
 const input=contract.input(retrieval);
 const output=contract.materialize(retrieval,{i:'plan',m:[['r1',...input.cards.map(card=>card.passages[0].id)]]},input);
 assert.equal(output.decision,'recommend');
 assert.deepEqual(output.records.map(row=>row.id),[review.id,ci.id]);
 assert.deepEqual(output.coveredActions.map(row=>row.scenarioId),[review.id,ci.id]);
 assert.ok(renderDialogue(output,presentation,{entries:[]}).items[0].scenarios.every(s=>s.details[0].joint));
});

test('the live adapter returns the checked subset and emits only a fixed recovery code',async t=>{
 const query='Подготовь ревью PR; исправь ошибку красного CI';
 const retrieval={query,candidates:candidates(review,ci),actions:[
  {id:'a1',text:'Подготовь ревью PR',candidateIds:[review.id]},
  {id:'a2',text:'исправь ошибку красного CI',candidateIds:[ci.id]},
 ]};
 const events=[];
 t.mock.method(globalThis,'fetch',async (_url,request)=>{
  const input=JSON.parse(JSON.parse(request.body).messages[1].content);
  const choice={i:'plan',m:[['r1',input.cards[0].passages[0].id],['r2','c2p99']]};
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(choice)}}]});
 });
 const answer=await liveAnswer('fixture',{catalog,sourceContext:context,retriever:async()=>retrieval,onEvent:event=>events.push(event)})(query);
 assert.equal(answer.decision,'partial');
 assert.match(answer.items[0].scenarios[0].summary,/pr-review/);
 assert.deepEqual(answer.missingParts,['исправь ошибку красного CI']);
 assert.deepEqual(events,[{event:'advisor.partial_recovery',reason:'passage-unissued'}]);
 assert.ok(!JSON.stringify(answer).includes('c2p99'));
});
