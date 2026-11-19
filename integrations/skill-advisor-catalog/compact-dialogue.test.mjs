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

test('structured rows preserve provenance, gaps and legacy tuple results',()=>{
 const retrieval={query:'Проверь pull request',candidates:candidates(review)};
 const input=contract.input(retrieval),passage=input.cards[0].passages[0].id;
 const structured={i:'analyze',m:[{r:'r1',p:[passage]}],x:[],ask:null};
 const result=contract.materialize(retrieval,structured,input);
 assert.deepEqual(result,contract.materialize(retrieval,{i:'analyze',m:[['r1',passage]]},input));
 const unavailable=contract.materialize(retrieval,{...structured,m:[{r:'r1',p:[null]}]},input);
 assert.equal(unavailable.decision,'no-match');
 const unissued=contract.materialize(retrieval,{...structured,m:[{r:'r1',p:['c1p99']}]},input);
 assert.deepEqual(unissued.recoveries,['passage-unissued']);
 assert.deepEqual(unissued.records,[]);
 const malformed=contract.materialize(retrieval,{...structured,m:[{r:'r1',p:[[passage]]}]},input);
 assert.deepEqual(malformed.recoveries,['passage-format']);
 assert.throws(()=>contract.materialize(retrieval,{...structured,m:[{r:'r9',p:[passage]}]},input),/Invalid compact requirement/);
 assert.throws(()=>contract.materialize(retrieval,{...structured,m:[{r:'r1',p:[passage],url:'https://example.invalid'}]},input),/Invalid compact requirement row/);
});

test('compact provider requests enforce request-scoped schema and supported endpoint routing',async()=>{
 const {selectScenarios}=await import('./selector.mjs');
 const retrieval={query:'Проверь pull request',candidates:candidates(review)};
 const input=contract.input(retrieval),passage=input.cards[0].passages[0].id;
 let sent;
 const result=await selectScenarios(retrieval,{
  model:'test-model',apiKey:'test-key',contract,
  fetchImpl:async(url,options)=>{
   sent=JSON.parse(options.body);
   return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({
    i:'analyze',m:[{r:'r1',p:[passage]}],x:[],ask:null,
   })}}],usage:{cost:0},model:'test-model'});
  },
 });
 assert.equal(sent.response_format.type,'json_schema');
 assert.equal(sent.response_format.json_schema.strict,true);
 assert.deepEqual(sent.provider,{require_parameters:true});
 assert.equal(sent.temperature,undefined);
 const schema=sent.response_format.json_schema.schema;
 assert.equal(schema.additionalProperties,false);
 assert.deepEqual(schema.properties.m.items.properties.r.enum,['r1']);
 assert.deepEqual(schema.properties.m.items.properties.p.items.anyOf[0].enum,
  ['ctx',...input.cards.flatMap(card=>card.passages.map(p=>p.id))]);
 assert.deepEqual(result.output.records.map(r=>r.id),[review.id]);
});

test('four issued passages for one requirement fit the existing six-detail answer budget',()=>{
 const retrieval={query:'Хочу выяснить проблемы клиентов перед запуском сервиса',candidates:candidates(review)};
 const input=contract.input(retrieval);
 assert.ok(input.cards[0].passages.length>=4);
 const references=input.cards[0].passages.slice(0,4).map(p=>p.id);
 const answer=contract.materialize(retrieval,{i:'analyze',m:[{r:'r1',p:references}],x:[],ask:null},input);
 assert.equal(answer.decision,'recommend');
 assert.equal(answer.details.length,4);
 assert.deepEqual(answer.recoveries,[]);
 const tooMany=contract.materialize(retrieval,{i:'analyze',m:[{r:'r1',p:Array(7).fill(references[0])}],x:[],ask:null},input);
 assert.deepEqual(tooMany.recoveries,['passage-format']);
 const unknown=contract.materialize(retrieval,{i:'analyze',m:[{r:'r1',p:[...references,'c1p99']}],x:[],ask:null},input);
 assert.deepEqual(unknown.recoveries,['passage-unissued']);
});

test('ordinary length and supplied photos reach the selector as documented parameters',()=>{
 const cases=[
  ['Хочу короткий обзор новостей про электромобили за прошлую неделю, со ссылками.',
   'skills-news','news-digest',/QUICK|short|summary|roundup/iu],
  ['Хочу красивый сайт-портфолио для своих фотографий, чтобы не выглядел как шаблон.',
   'skills-taste','design-taste-frontend',/photography|photo|brand assets/iu],
 ];
 for(const [query,pkg,skill,expected] of cases){
  const record=catalog.records.find(r=>r.package.name==='@dzhechkov/'+pkg && r.skillIds?.includes(skill));
  assert.ok(record);
  const input=contract.input({query,candidates:candidates(record)});
  assert.ok(input.cards[0].passages.some(p=>expected.test(p.text)),JSON.stringify(input.cards[0].passages));
 }
});
