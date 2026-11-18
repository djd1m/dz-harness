// Explicit opt-in paid candidate evaluation. No production ledgers are reset or used.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {currentCatalog} from '../../integrations/skill-advisor-catalog/cli.mjs';
import {advisorDocuments,advisorIdentity,advisorLexicalize,createHybridRetriever} from '../../integrations/skill-advisor-catalog/hybrid-advisor.mjs';
import {createEmbeddingClient} from '../../integrations/hybrid-retrieval/openrouter.mjs';
import {openSnapshot} from '../../integrations/hybrid-retrieval/index.mjs';
import {createSearchServer} from '../../integrations/hybrid-retrieval/service.mjs';
import {selectScenarios} from '../../integrations/skill-advisor-catalog/selector.mjs';
import {approvedPresentation} from '../../integrations/skill-advisor-catalog/answer.mjs';
import {dialogueContract,renderDialogue,dialogueInstructions} from '../../integrations/skill-advisor-catalog/dialogue.mjs';
import {completeSelection} from '../../integrations/skill-advisor-catalog/scoring.mjs';
const root=new URL('../../',import.meta.url), read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const out='/var/lib/aicoding/advisor-hybrid-service-20261110/evaluation-v2';
if(process.argv[2]!=='--run'||!process.env.OPENROUTER_API_KEY)throw Error('Explicit --run + credential required');
if(existsSync(out))throw Error('Evaluation exists; refusing paid rerun');mkdirSync(out);
const sha=x=>createHash('sha256').update(x).digest('hex');
const write=(n,x)=>writeFileSync(out+'/'+n,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const catalog=currentCatalog(),identity=advisorIdentity(catalog),docs=advisorDocuments(catalog);
const cache=JSON.parse(readFileSync('/var/lib/aicoding/advisor-hybrid-20261110-v2/embeddings.json'));
assert.equal(sha(JSON.stringify(docs)),cache.config.documentSha256);
const previous=read('docs/proposals/skill-advisor-scenarios/hybrid-holdout-2026-11-10.json').cases;
const fresh=read('features/advisor-hybrid-service/new-questions.json').cases;
const presentation=approvedPresentation(catalog,read('docs/proposals/skill-advisor-scenarios/presentation.json'),read('docs/proposals/skill-advisor-scenarios/presentation-reviews.json'));
const courses=read('docs/proposals/skill-advisor-scenarios/course-map.json'),contract=dialogueContract(presentation);
const context={identity,model:'anthropic/claude-haiku-5.5',promptSha256:sha(dialogueInstructions),questionsSha256:sha(readFileSync(new URL('features/advisor-hybrid-service/new-questions.json',root))),source:'Historical64 regression + frozen12 new development phrases; two extra known x38 repeats; no independent population claim',rates:{input:1e-7,output:5e-7},code:Object.fromEntries(['hybrid-advisor.mjs','dialogue.mjs','selector.mjs','preview-server.mjs'].map(n=>[n,sha(readFileSync(new URL('integrations/skill-advisor-catalog/'+n,root)))]))};write('context.json',context);
const embedClient=createEmbeddingClient({apiKey:process.env.OPENROUTER_API_KEY,...identity});
// Explicit reuse of diagnostic response: fixed requested BGE-M3 endpoint, verified Parasail model alias. No repeated embedding charge.
const diagnostic=JSON.parse(readFileSync('/var/lib/aicoding/advisor-hybrid-service-20261110/fresh-vector-response.json'));assert.equal(diagnostic.model,'parasail-bge-m3');assert.equal(diagnostic.data.length,fresh.length);
const freshEmbedding={vectors:diagnostic.data.sort((a,b)=>a.index-b.index).map(r=>r.embedding),usage:diagnostic.usage,actualModel:diagnostic.model};write('embedding.json',{usage:freshEmbedding.usage,actualModel:freshEmbedding.actualModel,questions:context.questionsSha256});
const snapshot=await openSnapshot({directory:'/var/lib/aicoding/advisor-hybrid-service-20261110/snapshot',...identity,lexicalize:advisorLexicalize});
const server=createSearchServer({snapshot});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const rows=[],searchRows=[];let estimated=0;
try{
 const cases=[...previous.map((q,i)=>({...q,vector:cache.queries[i],group:'historical'})),...fresh.map((q,i)=>({...q,vector:freshEmbedding.vectors[i],group:'fresh'})),...Array.from({length:2},(_,i)=>({...previous[37],id:'x38-repeat-'+(i+1),vector:cache.queries[37],group:'known-repeat'}))];
 for(const q of cases){
  const retrieve=createHybridRetriever({catalog,searchUrl:url,embed:async()=>({vectors:[q.vector]})});
  const hybrid=await retrieve(q.query);assert.equal(hybrid.meta.mode,'hybrid');
  searchRows.push({id:q.id,group:q.group,hits:hybrid.candidates.map(c=>({id:c.id,score:c.score})),complete:q.acceptableScenarioSets.some(s=>s.every(id=>hybrid.candidates.some(c=>c.id===id)))});
  const norm=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
  const v=norm(q.vector);
  const semantic={query:q.query,revision:catalog.revision,candidates:cache.documents.map((d,i)=>({id:docs[i].id,score:norm(d).reduce((s,x,k)=>s+x*v[k],0),record:catalog.records.find(r=>r.id===docs[i].id)})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,5)};
  for(const [method,retrieval]of q.group==='fresh'?[['hybrid',hybrid],['semantic',semantic]]:[['hybrid',hybrid]]){
   const projected=Buffer.byteLength(JSON.stringify(contract.input(retrieval))+contract.instructions)*1e-7+1200*5e-7;
   if(estimated+projected>.3)throw Error('Projected evaluation budget exhausted');
   const start=performance.now();let row;
   try{
    const result=await selectScenarios(retrieval,{model:context.model,apiKey:process.env.OPENROUTER_API_KEY,contract});
    row={id:q.id,group:q.group,method,expected:q.expectedDecision,decision:result.output.decision,ids:result.output.records.map(r=>r.id),missingParts:result.output.missingParts,usage:result.usage,actualModel:result.actualModel,answer:renderDialogue(result.output,presentation,courses),valid:true};
    row.correct=row.decision===q.expectedDecision&&(!q.acceptableScenarioSets.length||completeSelection(row.ids,q.acceptableScenarioSets));
   }catch(e){row={id:q.id,group:q.group,method,valid:false,correct:false,code:e.code||'selection-failed',usage:e.usage};}
   if(!Number.isFinite(row.usage?.prompt_tokens)||!Number.isFinite(row.usage?.completion_tokens))throw Error('Missing paid usage; stop');
   row.ms=performance.now()-start;row.estimatedUsd=row.usage.prompt_tokens*1e-7+row.usage.completion_tokens*5e-7;estimated+=row.estimatedUsd;rows.push(row);write(`${q.id}-${method}.json`,row);
  }
  if(rows.length%10===0)console.log(JSON.stringify({completed:rows.length,estimatedUsd:estimated}));
 }
 write('results.json',{context,searchRows,rows,summary:{valid:rows.filter(r=>r.valid).length,total:rows.length,strictCorrect:rows.filter(r=>r.correct).length,estimatedUsd:estimated,providerReportedUsd:rows.every(r=>Number.isFinite(r.usage.cost))?rows.reduce((s,r)=>s+r.usage.cost,0)+(freshEmbedding.usage.cost??0):null}});
 console.log(JSON.stringify({total:rows.length,strictCorrect:rows.filter(r=>r.correct).length,mismatches:rows.filter(r=>!r.correct).map(r=>({id:r.id,method:r.method,decision:r.decision,ids:r.ids,missingParts:r.missingParts}))}));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));snapshot.close();}
