import test from 'node:test';
import assert from 'node:assert/strict';
import {groupPackageCandidates,rawCandidateLimit} from './package-retrieval.mjs';
import {retrieve} from './search.mjs';
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
