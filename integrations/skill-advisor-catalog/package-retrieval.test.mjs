import test from 'node:test';
import assert from 'node:assert/strict';
import {groupPackageCandidates,rawCandidateLimit} from './package-retrieval.mjs';
import {retrieve} from './search.mjs';
import {buildSourceProjection} from './source-projection.mjs';
import {createHybridRetriever,advisorIdentity} from './hybrid-advisor.mjs';

const record=(pkg,id,kind='skill')=>({id,kind,package:{name:pkg,description:'fixture'},title:'alpha',intent:'alpha',queries:['alpha'],whenToUse:['alpha'],outcome:'alpha'});
const hit=(record,score)=>({id:record.id,score,record});
const ids=result=>result.candidates.map(c=>c.id);

test('groups ranked hits into first five packages with overview and two best atomic records',()=>{
 const records=[],raw=[];
 for(let i=0;i<6;i++){
  const overview=record(`p${i}`,`o${i}`,'package-overview');
  const atomics=[0,1,2].map(j=>record(`p${i}`,`a${i}-${j}`)); records.push(overview,...atomics);
  raw.push(...atomics.map((r,j)=>hit(r,100-i*3-j)));
 }
 // A late overview hit is not duplicated; enrichment cannot introduce the sixth package.
 raw.push(hit(records[0],1));
 assert.equal(raw.length,19); assert.equal(rawCandidateLimit,100);
 const result=groupPackageCandidates({records},raw);
 assert.deepEqual(ids(result),Array.from({length:5},(_,i)=>[`o${i}`,`a${i}-0`,`a${i}-1`]).flat());
 assert.equal(result.candidates.length,15); assert.equal(result.diagnostics.packageCount,5);
 assert.strictEqual(result.candidates[0].record,records[0]);
 assert.strictEqual(result.candidates[1].record,records[1]);
 assert.equal(result.candidates[0].score,100);
});

test('twenty same-package hits report concentration without inventing package coverage',()=>{
 const overview=record('one','overview','package-overview'), unseen=record('unseen','unseen-overview','package-overview');
 const atomic=Array.from({length:100},(_,i)=>record('one',`atomic-${i}`));
 const result=groupPackageCandidates({records:[overview,unseen,...atomic]},atomic.map((r,i)=>hit(r,100-i)));
 assert.deepEqual(ids(result),['overview','atomic-0','atomic-1']);
 assert.deepEqual(result.diagnostics,{rawHitCount:100,packageCount:1,concentrated:true});
});

test('supporting records, overview-only hits, ties and empty input preserve ranked host references',()=>{
 const support=record('support','support-record','support'),overview=record('workflow','overview','package-overview'),a=record('workflow','a');
 const catalog={records:[support,overview,a]};
 const result=groupPackageCandidates(catalog,[hit(support,2),hit(overview,2),hit(a,2)]);
 assert.deepEqual(ids(result),['support-record','overview','a']);
 assert.strictEqual(result.candidates[0].record,support); assert.strictEqual(result.candidates[1].record,overview);
 assert.deepEqual(ids(groupPackageCandidates(catalog,[hit(overview,1)])),['overview']);
 assert.deepEqual(groupPackageCandidates(catalog,[]),{candidates:[],diagnostics:{rawHitCount:0,packageCount:0,concentrated:false}});
});

test('duplicate overviews fail closed',()=>{
 const records=[record('p','o1','package-overview'),record('p','o2','package-overview')];
 assert.throws(()=>groupPackageCandidates({records},[]),/Duplicate package overview/);
});

test('actual lexical fallback and hybrid path apply same grouping to the same ranked hits',async()=>{
 const records=[record('p','overview','package-overview'),record('p','a'),record('p','b'),record('p','c'),record('q','support','support')];
 const catalog={revision:'fixture',records}; const lexical=retrieve(catalog,'alpha',20);
 const expected=groupPackageCandidates(catalog,lexical.candidates);
 const unavailable=Object.assign(Error('offline'),{code:'embedding-unavailable'});
 const fallback=createHybridRetriever({catalog,searchUrl:'http://127.0.0.1',embed:async()=>{throw unavailable;}});
 const f=await fallback('alpha'); assert.equal(f.meta.mode,'lexical'); assert.deepEqual(ids(f),ids(expected));
 const identity=advisorIdentity(catalog);
 const hybrid=createHybridRetriever({catalog,searchUrl:'http://127.0.0.1',embed:async()=>({vectors:[Array(1024).fill(1)]}),fetchImpl:async()=>new Response(JSON.stringify({...identity,hits:lexical.candidates.map(({id,score})=>({id,score}))}),{status:200})});
 const h=await hybrid('alpha'); assert.equal(h.meta.mode,'hybrid'); assert.deepEqual(ids(h),ids(f));
 for(const candidate of h.candidates) assert.strictEqual(candidate.record,records.find(r=>r.id===candidate.id));
});

test('a distinct clause can retain a lower-ranked skill from the same package', () => {
 const primary = {...record('product','north-star'),title:'North Star metric',evidence:[{quote:'Choose a North Star metric'}]};
 const dashboard = {...record('product','dashboard'),title:'PM dashboard',evidence:[{quote:'Разместить метрики и пороги оповещений'}]};
 const cohorts = {...record('product','cohorts'),title:'Cohort analysis',evidence:[{quote:'Analyze cohort retention and churn'}]};
 const catalog = {records:[primary,dashboard,cohorts]};
 const ranked = [hit(primary,3),hit(dashboard,2),hit(cohorts,1)];
 assert.deepEqual(ids(groupPackageCandidates(catalog,ranked,'Разбери cohort retention и выбери North Star')),['north-star','cohorts']);
 assert.deepEqual(ids(groupPackageCandidates(catalog,ranked,'Выбери North Star')),['north-star','dashboard']);
 assert.deepEqual(ids(groupPackageCandidates(catalog,ranked,'Проверь North Star и гарантированно увеличь подписки')),['north-star','dashboard']);
});

test('generic Explore can help frame a scoped task while retaining four ranked packages', () => {
 const discovery = {...record('@dzhechkov/skills-meta','explore'),skillIds:['explore']};
 const specific = Array.from({length:5},(_,index)=>record(`p${index}`,`r${index}`));
 const catalog = {records:[...specific,discovery]};
 const ranked = specific.map((r,index)=>hit(r,5-index));
 const situation = 'Мы хотим улучшить поддержку, но не понимаем, какую часть автоматизировать';
 const result = groupPackageCandidates(catalog,ranked,situation);
 assert.deepEqual(ids(result),['r0','r1','r2','r3','explore']);
 assert.equal(result.candidates.at(-1).origin,'scoped-discovery');
 assert.equal(result.diagnostics.rawHitCount,5);
 for (const query of ['Не понимаю, почему Redis падает. Помоги диагностировать сбой.',`${situation}. Работай без уточнений.`,'Составь план по заданным требованиям']) {
  assert.deepEqual(ids(groupPackageCandidates(catalog,ranked,query)),specific.map(r=>r.id));
 }
 assert.deepEqual(ids(groupPackageCandidates({records:specific},ranked,situation)),specific.map(r=>r.id));
});

test('hybrid and lexical modes expose the same approved Explore when ranking returns no hits', async () => {
 const discovery = {...record('@dzhechkov/skills-meta','explore'),skillIds:['explore']};
 const catalog = {revision:'discovery-fixture',records:[discovery]};
 const searchUrl = 'http://127.0.0.1';
 const query = 'Планируем обучение, но не определили, чего не хватает';
 const identity = advisorIdentity(catalog);
 const hybrid = createHybridRetriever({catalog,searchUrl,embed:async()=>({vectors:[Array(1024).fill(1)]}),fetchImpl:async()=>Response.json({...identity,hits:[]})});
 const lexical = createHybridRetriever({catalog,searchUrl,embed:async()=>{throw Object.assign(Error('offline'),{code:'embedding-unavailable'});}});
 for (const retrieve of [hybrid,lexical]) {
  const result = await retrieve(query);
  assert.equal(result.decision,'candidates');
  assert.deepEqual(ids(result),['explore']);
  assert.strictEqual(result.candidates[0].record,discovery);
 }
});

test('strong clause evidence can recover a skill absent from every raw hit without widening the shortlist', () => {
 const primary = {...record('product','stakeholders'),title:'Stakeholder planning',evidence:[{quote:'Map stakeholder influence and interest'}]};
 const broad = {...record('product','launch'),title:'Product launch',evidence:[{quote:'Prepare a launch and coordinate the team'}]};
 const specific = {...record('product','outcomes'),title:'Outcome roadmap',evidence:[{quote:'Rewrite a feature roadmap into measurable customer outcomes'}]};
 const catalog = {revision:'clause-fixture',records:[primary,broad,specific]};
 const projection = buildSourceProjection(catalog);
 const result = groupPackageCandidates(catalog,[hit(primary,2),hit(broad,1)],'Map stakeholder influence and interest, then rewrite our feature roadmap into measurable customer outcomes',projection.clauseSearch);
 assert.deepEqual(ids(result),['stakeholders','outcomes']);
 assert.equal(result.candidates[1].origin,'clause-search');
 assert.equal(result.diagnostics.rawHitCount,2);
});

test('a higher match on background terms cannot replace the second skill covering a separate outcome', () => {
 const primary = {...record('product','stakeholders'),title:'Stakeholder map',evidence:[{quote:'Map stakeholder interest and influence'}]};
 const second = {...record('product','outcomes'),title:'Outcome roadmap',evidence:[{quote:'Rewrite a feature roadmap into measurable customer outcomes'}]};
 const distraction = {...record('product','launch'),title:'Community events product launch',evidence:[{quote:'Plan a community events product launch'}]};
 const catalog = {records:[primary,second,distraction]};
 const result = groupPackageCandidates(catalog,[hit(primary,3),hit(second,2),hit(distraction,1)],
  'For a community events product launch, map stakeholder interest and influence, and rewrite our feature roadmap into measurable customer outcomes');
 assert.deepEqual(ids(result),['stakeholders','outcomes']);
});
