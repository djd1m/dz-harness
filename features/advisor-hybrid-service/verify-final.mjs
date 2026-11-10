import {readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';
import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{currentCatalog}from'../../integrations/skill-advisor-catalog/cli.mjs';
import{advisorIdentity,advisorLexicalize,createHybridRetriever}from'../../integrations/skill-advisor-catalog/hybrid-advisor.mjs';
import{openSnapshot}from'../../integrations/hybrid-retrieval/index.mjs';
import{createSearchServer}from'../../integrations/hybrid-retrieval/service.mjs';
import{selectScenarios}from'../../integrations/skill-advisor-catalog/selector.mjs';
import{approvedPresentation}from'../../integrations/skill-advisor-catalog/answer.mjs';
import{dialogueContract,renderDialogue}from'../../integrations/skill-advisor-catalog/dialogue.mjs';
import{completeSelection}from'../../integrations/skill-advisor-catalog/scoring.mjs';
const base='/var/lib/aicoding/advisor-hybrid-service-20261110',out=base+'/final-verification';
if(process.argv[2]!=='--run'||!process.env.OPENROUTER_API_KEY||existsSync(out))throw Error('Fresh explicit opt-in paid run required');mkdirSync(out);
const read=p=>JSON.parse(readFileSync(p,'utf8')),write=(n,v)=>writeFileSync(out+'/'+n,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const d='docs/proposals/skill-advisor-scenarios/',old=read(d+'hybrid-holdout-2026-11-10.json').cases,fresh=read('features/advisor-hybrid-service/new-questions.json').cases;
const cache=read('/var/lib/aicoding/advisor-hybrid-20261110-v2/embeddings.json'),freshVectors=read(base+'/fresh-vector-response.json').data.sort((a,b)=>a.index-b.index).map(r=>r.embedding);
const catalog=currentCatalog(),identity=advisorIdentity(catalog),presentation=approvedPresentation(catalog,read(d+'presentation.json'),read(d+'presentation-reviews.json')),contract=dialogueContract(presentation),courses=read(d+'course-map.json');
const snapshot=await openSnapshot({directory:base+'/snapshot',...identity,lexicalize:advisorLexicalize});const server=createSearchServer({snapshot});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`,parity=[];
try{
 for(let i=0;i<old.length;i++){
  const result=await snapshot.search({query:old[i].query,vector:cache.queries[i],revision:catalog.revision,limit:5});
  const complete=old[i].acceptableScenarioSets.some(s=>s.every(id=>result.hits.some(h=>h.id===id)));
  parity.push({id:old[i].id,ids:result.hits.map(h=>h.id),complete});
 }
 const positives=parity.filter((r,i)=>old[i].acceptableScenarioSets.length);assert.equal(positives.filter(r=>r.complete).length,54,'Measured retrieval parity regressed');write('retrieval-parity.json',{identity,complete:54,labelled:54,rows:parity});
 const cases=[{...old[0],vector:cache.queries[0]},...fresh.map((q,i)=>({...q,vector:freshVectors[i]})),{...old[37],id:'x38-final',vector:cache.queries[37]}],rows=[];
 for(const q of cases){
  const retrieval=await createHybridRetriever({catalog,searchUrl:url,embed:async()=>({vectors:[q.vector]})})(q.query);
  const result=await selectScenarios(retrieval,{model:'anthropic/claude-haiku-5.5',apiKey:process.env.OPENROUTER_API_KEY,contract});const choice=result.output;
  const row={id:q.id,decision:choice.decision,ids:choice.records.map(r=>r.id),missingParts:choice.missingParts,usage:result.usage,answer:renderDialogue(choice,presentation,courses)};
  row.correct=row.decision===q.expectedDecision&&(!q.acceptableScenarioSets.length||completeSelection(row.ids,q.acceptableScenarioSets));write(q.id+'.json',row);rows.push(row);
 }
 const hashes=Object.fromEntries(['integrations/hybrid-retrieval/index.mjs','integrations/hybrid-retrieval/service.mjs','integrations/hybrid-retrieval/openrouter.mjs','integrations/skill-advisor-catalog/hybrid-advisor.mjs','integrations/skill-advisor-catalog/dialogue.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
 write('results.json',{identity,hashes,scope:'Final corrected native-window retrieval on64;14 targeted paid cases after prior90 retained',correct:rows.filter(r=>r.correct).length,total:rows.length,providerReportedUsd:rows.every(r=>Number.isFinite(r.usage?.cost))?rows.reduce((s,r)=>s+r.usage.cost,0):null,rows});console.log(JSON.stringify({retrieval:'54/54',correct:rows.filter(r=>r.correct).length,total:rows.length}));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));snapshot.close();}
