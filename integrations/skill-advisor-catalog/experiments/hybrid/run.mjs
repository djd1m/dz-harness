// Offline experiment; production has no dependency on this package.
import {readFileSync,writeFileSync,existsSync,mkdirSync,statSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {create,insertMultiple,search,save,load} from '@orama/orama';
import * as lance from '@lancedb/lancedb';
import {currentCatalog} from '../../cli.mjs';
import {retrieve} from '../../search.mjs';
import {stems} from '../../../../packages/harness-core/dist/stem.js';
import {selectScenarios} from '../../selector.mjs';
import {approvedPresentation} from '../../answer.mjs';
import {dialogueContract,renderDialogue} from '../../dialogue.mjs';
import {completeSelection} from '../../scoring.mjs';
const docs=new URL('../../../../docs/proposals/skill-advisor-scenarios/',import.meta.url);
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const questionsFile=new URL('hybrid-holdout-2026-11-10.json',docs);
const frozen='d19feacff3f5339ff3162ece6597bbf3d25971fd9f5d5844c379eeb3d40dfdec';
assert.equal(sha(readFileSync(questionsFile)),frozen,'Question set changed');
const questions=read(questionsFile).cases;
const catalog=currentCatalog();assert.equal(catalog.excluded.length,0);
const text=r=>[r.title,r.intent,...r.queries,...r.whenToUse,r.outcome].join(' ');
const documents=catalog.records.map(r=>({id:r.id,text:text(r)}));
const config={catalogRevision:catalog.revision,questionSha256:frozen,documentSha256:sha(JSON.stringify(documents)),model:'baai/bge-m3',dimension:1024};
const [mode,outputArg]=process.argv.slice(2);
if(!['embed','search','select'].includes(mode)||!outputArg)throw Error('Usage: run.mjs embed|search|select <output-directory>');
const out=resolve(outputArg);mkdirSync(out,{recursive:true});
const path=n=>resolve(out,n);
const write=(n,x)=>writeFileSync(path(n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const configCheck=cache=>assert.deepEqual(cache.config,config,'Embedding revision/model mismatch');
const pct=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.ceil(xs.length*p)-1)];
const rates={embed:0.00000001,input:0.0000001,output:0.0000005}; // API list 2026-11-10; estimates, not invoice
const dimensionCheck=v=>assert(v.length===1024&&v.every(Number.isFinite)&&v.some(n=>n!==0),'Invalid vector');

if(mode==='embed'){
 if(existsSync(path('embeddings.json')))throw Error('Embedding artifact exists');
 if(!process.env.OPENROUTER_API_KEY)throw Error('Credential required');
 const receipts=[];
 async function embed(texts,label){
  const start=performance.now();
  const res=await fetch('https://openrouter.ai/api/v1/embeddings',{
   method:'POST',signal:AbortSignal.timeout(60000),headers:{authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`,'content-type':'application/json'},
   body:JSON.stringify({model:config.model,input:texts,encoding_format:'float'})});
  if(!res.ok)throw Error(`Embedding HTTP ${res.status}`);
  const b=await res.json();assert.equal(b.data?.length,texts.length);
  const ordered=[...b.data].sort((a,b)=>a.index-b.index);
  ordered.forEach((d,i)=>{assert.equal(d.index,i);dimensionCheck(d.embedding);});
  assert(Number.isFinite(b.usage?.prompt_tokens),'Missing embedding usage');
  receipts.push({label,items:texts.length,ms:performance.now()-start,actualModel:b.model,usage:b.usage,estimatedUsd:b.usage.prompt_tokens*rates.embed});
  return ordered.map(d=>d.embedding);
 }
 const dv=await embed(documents.map(d=>d.text),'documents');
 const qv=[];for(let i=0;i<questions.length;i+=32)qv.push(...await embed(questions.slice(i,i+32).map(q=>q.query),`questions-${i}`));
 for(let i=0;i<5;i++)await embed([questions[i].query],`single-latency-${i}`);
 write('embeddings.json',{config,documents:dv,queries:qv,receipts});
 console.log(JSON.stringify({mode,calls:receipts.length,estimatedUsd:receipts.reduce((s,r)=>s+r.estimatedUsd,0),singleP95Ms:pct(receipts.filter(r=>r.label.startsWith('single-')).map(r=>r.ms),.95)}));
}

if(mode==='search'){
 const cache=read(path('embeddings.json'));configCheck(cache);
 assert.equal(cache.documents.length,documents.length);assert.equal(cache.queries.length,questions.length);
 [...cache.documents,...cache.queries].forEach(dimensionCheck);
 const start=performance.now();
 const makeOrama=()=>create({schema:{id:'string',text:'string',vector:'vector[1024]'},components:{tokenizer:{language:'russian',stemming:false}}});
 const orama=makeOrama();
 // Same positive fields and shared RU/EN stems; embeddings use original text.
 const records=documents.map((d,i)=>({...d,text:stems(d.text).join(' '),vector:cache.documents[i]}));
 insertMultiple(orama,records);const oramaBuildMs=performance.now()-start;
 write('orama-index.json',save(orama));
 const restored=makeOrama();load(restored,read(path('orama-index.json')));
 const lanceStart=performance.now(),db=await lance.connect(path('lance'));
 const table=await db.createTable('scenarios',records);
 await table.createIndex('text',{config:lance.Index.fts({baseTokenizer:'simple',stem:false,removeStopWords:false,lowercase:true})});
 const lanceBuildMs=performance.now()-lanceStart;
 const reopened=await(await lance.connect(path('lance'))).openTable('scenarios');
 const normalize=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
 const normDocs=cache.documents.map(normalize);
 const params=(q,i)=>({mode:'hybrid',term:stems(q.query).join(' '),properties:['text'],vector:{property:'vector',value:cache.queries[i]},similarity:0,limit:5});
 const methods={
  baseline:async q=>retrieve(catalog,q.query).candidates.map(c=>({id:c.id,score:c.score})),
  semantic:async(q,i)=>{const v=normalize(cache.queries[i]);return normDocs.map((d,j)=>({id:documents[j].id,score:d.reduce((s,x,k)=>s+x*v[k],0)})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,5);},
  'orama-fts':async q=>search(orama,{term:stems(q.query).join(' '),properties:['text'],limit:5}).hits.map(h=>({id:h.document.id,score:h.score})),
  'orama-hybrid':async(q,i)=>search(orama,params(q,i)).hits.map(h=>({id:h.document.id,score:h.score})),
  'lance-fts':async q=>(await table.query().fullTextSearch(stems(q.query).join(' '),{columns:['text']}).select(['id']).limit(5).toArray()).map(h=>({id:h.id,score:h._score})),
  'lance-hybrid':async(q,i)=>(await table.vectorSearch(cache.queries[i]).distanceType('cosine').fullTextSearch(stems(q.query).join(' '),{columns:['text']}).select(['id']).limit(5).toArray()).map(h=>({id:h.id,score:h._relevance_score})),
 };
 const rows=[];
 for(let i=0;i<questions.length;i++){
  const q=questions[i],row={...q,methods:{}};
  for(const [name,fn]of Object.entries(methods)){
   const cold=await fn(q,i),times=[];
   for(let j=0;j<5;j++){const t=performance.now(),result=await fn(q,i);times.push(performance.now()-t);assert.deepEqual(result,cold,'Nondeterministic ranking');}
   assert(cold.every(h=>documents.some(d=>d.id===h.id)&&Number.isFinite(h.score)));
   row.methods[name]={hits:cold,timingMs:times};
  }
  if(i===0){
   assert.deepEqual(search(restored,params(q,i)).hits.map(h=>h.document.id),row.methods['orama-hybrid'].hits.map(h=>h.id));
   assert.deepEqual((await reopened.vectorSearch(cache.queries[i]).distanceType('cosine').fullTextSearch(stems(q.query).join(' '),{columns:['text']}).select(['id']).limit(5).toArray()).map(h=>h.id),row.methods['lance-hybrid'].hits.map(h=>h.id));
  }
  rows.push(row);
 }
 const summary={};
 for(const name of Object.keys(methods)){
  summary[name]={};
  for(const kind of ['all-labelled','ru-paraphrase','en-paraphrase','exact-name','multi-intent','partial']){
   const subset=rows.filter(r=>r.acceptableScenarioSets.length&&(kind==='all-labelled'||r.kind===kind));
   const vals=subset.map(r=>{const ids=r.methods[name].hits.map(h=>h.id);return {recall:Math.max(...r.acceptableScenarioSets.map(s=>s.filter(id=>ids.includes(id)).length/s.length)),all:r.acceptableScenarioSets.some(s=>s.every(id=>ids.includes(id))),rr:1/(1+Math.min(...r.acceptableScenarioSets.flat().map(id=>ids.indexOf(id)<0?Infinity:ids.indexOf(id))))};});
   summary[name][kind]={n:subset.length,recallAt5:vals.reduce((s,v)=>s+v.recall,0)/vals.length,complete:vals.filter(v=>v.all).length,mrr:vals.reduce((s,v)=>s+v.rr,0)/vals.length};
  }
  const times=rows.flatMap(r=>r.methods[name].timingMs);summary[name].warmMs={p50:pct(times,.5),p95:pct(times,.95)};
 }
 const bytes=p=>statSync(p).isDirectory()?readdirSync(p).reduce((s,n)=>s+bytes(resolve(p,n)),0):statSync(p).size;
 const result={config,scope:'Frozen catalog-aware development holdout; negative candidates are not final recommendation errors',versions:{node:process.version,orama:'3.1.18',lancedb:'0.41.0'},settings:{topK:5,lexical:'shared RU/EN stems, library FTS no stopword removal',oramaHybrid:'equal normalized text/vector weights, similarity 0',lanceHybrid:'cosine flat scan + FTS, default RRF'},build:{oramaBuildMs,lanceBuildMs,oramaSerializedBytes:statSync(path('orama-index.json')).size,lanceBytes:bytes(path('lance')),processRssBytes:process.memoryUsage().rss},summary,rows};
 write('retrieval.json',result);console.log(JSON.stringify({summary,build:result.build}));
}

if(mode==='select'){
 const retrieval=read(path('retrieval.json'));configCheck(retrieval);
 if(readdirSync(out).some(n=>n.startsWith('choice-')||n==='selection.json'))throw Error('Selection artifacts exist; refusing paid rerun');
 if(!process.env.OPENROUTER_API_KEY)throw Error('Credential required');
 const hybrids=['orama-hybrid','lance-hybrid'];hybrids.sort((a,b)=>retrieval.summary[b]['all-labelled'].complete-retrieval.summary[a]['all-labelled'].complete||retrieval.summary[b]['all-labelled'].mrr-retrieval.summary[a]['all-labelled'].mrr);
 const winner=hybrids[0],methods=['baseline',winner];
 const presentation=approvedPresentation(catalog,read(new URL('presentation.json',docs)),read(new URL('presentation-reviews.json',docs)));
 const courses=read(new URL('course-map.json',docs)),contract=dialogueContract(presentation);
 let spent=0;const rows=[];
 for(let i=0;i<questions.length;i++){
  for(const name of methods){
   const hits=retrieval.rows[i].methods[name].hits;
   const r={query:questions[i].query,revision:catalog.revision,decision:hits.length?'candidates':'no-match',candidates:hits.map(h=>({...h,record:catalog.records.find(d=>d.id===h.id)}))};
   const projected=Buffer.byteLength(JSON.stringify(contract.input(r))+contract.instructions)*rates.input+1200*rates.output;
   if(spent+projected>.5)throw Error('Experiment budget projection exhausted');
   const t=performance.now();let row;
   try{
    const result=await selectScenarios(r,{model:'anthropic/claude-haiku-5.5',apiKey:process.env.OPENROUTER_API_KEY,contract}),choice=result.output;
    row={id:questions[i].id,kind:questions[i].kind,method:name,expectedDecision:questions[i].expectedDecision,decision:choice.decision,ids:choice.records.map(r=>r.id),missingParts:choice.missingParts,answer:renderDialogue(choice,presentation,courses),usage:result.usage,actualModel:result.actualModel,valid:true};
    row.correct=row.decision===row.expectedDecision&&(!questions[i].acceptableScenarioSets.length||completeSelection(row.ids,questions[i].acceptableScenarioSets));
   }catch(e){row={id:questions[i].id,kind:questions[i].kind,method:name,expectedDecision:questions[i].expectedDecision,valid:false,correct:false,error:e.code||'selection-failed',usage:e.usage};}
   if(!Number.isFinite(row.usage?.prompt_tokens)||!Number.isFinite(row.usage?.completion_tokens))throw Error('Missing usage: stop paid run');
   row.estimatedUsd=row.usage.prompt_tokens*rates.input+row.usage.completion_tokens*rates.output;
   row.ms=performance.now()-t;spent+=row.estimatedUsd;rows.push(row);write(`choice-${row.id}-${name}.json`,row);
  }
  if(i%8===0)console.log(JSON.stringify({completed:rows.length,estimatedUsd:spent}));
 }
 const summary=Object.fromEntries(methods.map(name=>{const xs=rows.filter(r=>r.method===name);return[name,{n:xs.length,valid:xs.filter(r=>r.valid).length,correct:xs.filter(r=>r.correct).length,falseFull:xs.filter(r=>r.decision==='recommend'&&(r.expectedDecision!=='recommend'||!r.correct)).map(r=>r.id),falseAbstentions:xs.filter(r=>r.expectedDecision==='recommend'&&['clarify','no-match'].includes(r.decision)).map(r=>r.id),estimatedUsd:xs.reduce((s,r)=>s+r.estimatedUsd,0),providerReportedUsd:xs.every(r=>Number.isFinite(r.usage?.cost))?xs.reduce((s,r)=>s+r.usage.cost,0):null,p50Ms:pct(xs.map(r=>r.ms),.5),p95Ms:pct(xs.map(r=>r.ms),.95)}];}));
 write('selection.json',{config,model:'anthropic/claude-haiku-5.5',winnerRule:'retrieval complete@5 then MRR, Orama on exact tie',winner,scope:'Decision/exact-ID correctness; missingParts semantics require independent review. One call per method/case, no retries.',rates,summary,rows});console.log(JSON.stringify({winner,summary}));
}
