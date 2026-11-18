/** Explicit opt-in evaluation on a preregistered, outcome-blind labeled corpus.
 * INPUT SNAPSHOT NEW_OUTPUT KEY_FILE [--selector]
 * Never changes catalog records, budgets, quotas or a running deployment.
 */
import{readFileSync,writeFileSync}from'node:fs';
import{resolve}from'node:path';
import{fileURLToPath}from'node:url';
import{currentCatalog}from'./cli.mjs';
import{digest}from'./catalog.mjs';
import{approvedPresentation}from'./answer.mjs';
import{dialogueContract,renderDialogue}from'./dialogue.mjs';
import{selectScenarios}from'./selector.mjs';
import{advisorIdentity,advisorLexicalize,createHybridRetriever}from'./hybrid-advisor.mjs';
import{openSnapshot}from'../hybrid-retrieval/index.mjs';
import{createSearchServer}from'../hybrid-retrieval/service.mjs';
import{createEmbeddingClient}from'../hybrid-retrieval/openrouter.mjs';
const codeFiles=['full-evaluate','hybrid-advisor','catalog','cli','search','answer','dialogue','selector'];
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const covers=(packages,sets,exact=false)=>sets.some(set=>set.every(p=>packages.includes(p))&&(!exact||set.length===packages.length));

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const[input,snapshotPath,output,keyFile,selectorFlag]=process.argv.slice(2);
 if(!input||!snapshotPath||!output||!keyFile||selectorFlag&&selectorFlag!=='--selector')throw Error('INPUT SNAPSHOT NEW_OUTPUT KEY_FILE [--selector]');
 // Reserve output before any paid call. A failed run is evidence, never overwritten or silently retried.
 writeFileSync(output,JSON.stringify({status:'started'})+'\n',{flag:'wx',mode:0o600});
 const labels=read(input),catalog=currentCatalog(),identity=advisorIdentity(catalog);
 const all=[...labels.familiarRegressions,...labels.cases],byId=new Map(all.map(q=>[q.id,q]));
 const registered=labels.selectorPreregistration.caseIds;
 if(byId.size!==all.length||registered.length!==60||new Set(registered).size!==60||registered.some(id=>!byId.has(id)))throw Error('Invalid preregistration');
 const report={schema:1,status:'incomplete',inputSha256:digest(readFileSync(input)),catalogRevision:catalog.revision,coverage:catalog.coverage,
  codeHashes:Object.fromEntries(codeFiles.map(name=>[name,digest(readFileSync(new URL(name+'.mjs',import.meta.url)))])),
  dataHashes:Object.fromEntries(['records','reviews','presentation','presentation-reviews','inventory'].map(name=>[name,digest(readFileSync(resolve(root,'docs/proposals/skill-advisor-scenarios/full-catalog',name+'.json')))])),
  identity,model:'anthropic/claude-haiku-5.5',selectorRequested:!!selectorFlag,registeredIds:registered,cost:0,rows:[]};
 const persist=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});persist();
 const apiKey=readFileSync(keyFile,'utf8').trim();
 const client=createEmbeddingClient({apiKey,...identity,timeoutMs:60000,responseModelIds:['baai/bge-m3','parasail-bge-m3']});
 const vectors=new Map();
 for(let start=0;start<all.length;start+=16){const batch=all.slice(start,start+16),response=await client.embed(batch.map(q=>q.query));report.cost+=response.usage?.cost??0;batch.forEach((q,i)=>vectors.set(q.query,response.vectors[i]));if(report.cost>.5)throw Error('Evaluation cost bound');persist();}
 const snapshot=await openSnapshot({directory:snapshotPath,...identity,lexicalize:advisorLexicalize});
 const server=createSearchServer({snapshot});await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
 try{
  const retriever=createHybridRetriever({catalog,searchUrl:`http://127.0.0.1:${server.address().port}`,embed:async queries=>({vectors:queries.map(q=>vectors.get(q))})});
  const dir=resolve(root,'docs/proposals/skill-advisor-scenarios');
  const presentation=approvedPresentation(catalog,read(resolve(dir,'full-catalog/presentation.json')),read(resolve(dir,'full-catalog/presentation-reviews.json')));
  const contract=dialogueContract(presentation),courses=read(resolve(dir,'course-map.json'));
  const ordered=[...registered.map(id=>byId.get(id)),...all.filter(q=>!registered.includes(q.id))];
  for(const q of ordered){
   const row={id:q.id,query:q.query,familiar:q.familiar===true,positive:q.id.startsWith('H'),control:q.id.startsWith('N'),compound:q.id.startsWith('C'),registered:registered.includes(q.id)};
   report.rows.push(row);
   try{
    const retrieval=await retriever(q.query);row.mode=retrieval.meta.mode;
    row.retrievedIds=retrieval.candidates.map(c=>c.id);row.retrievedPackages=[...new Set(retrieval.candidates.map(c=>c.record.package.name))];
    row.retrievalComplete=q.acceptablePackageSets.some(s=>s.length>0)&&covers(row.retrievedPackages,q.acceptablePackageSets);
    row.targetsFound=(q.allRequiredTargets??[]).filter(p=>row.retrievedPackages.includes(p)).length;row.targetsTotal=q.allRequiredTargets?.length??0;
    if(selectorFlag&&row.registered){
     if(report.cost>=.45){row.error='budget-stop';continue;}
     row.selectorAttempted=true;const start=performance.now();
     try{
      const result=await selectScenarios(retrieval,{model:report.model,apiKey,contract});
      row.usage=result.usage;row.actualModel=result.actualModel;
      row.choice={decision:result.output.decision,intent:result.output.intent,scenarioIds:result.output.records.map(r=>r.id),missingParts:result.output.missingParts};
      row.selectedPackages=[...new Set(result.output.records.map(r=>r.package.name))];
      row.answer=renderDialogue(result.output,presentation,courses);
      row.correct=q.acceptableDecisions.includes(row.choice.decision)&&covers(row.selectedPackages,q.acceptablePackageSets,true);
      row.falseFull=(row.control||row.compound)&&row.choice.decision==='recommend'&&!q.acceptableDecisions.includes('recommend');
      row.valid=true;
     }catch(error){row.error=error.code??'provider-or-contract-error';row.usage=error.usage;row.valid=false;row.correct=false;}
     row.responseMs=Math.round(performance.now()-start);report.cost+=row.usage?.cost??0;
    }
   }catch(error){row.error=error.code??'retrieval-error';row.correct=false;row.retrievalComplete=false;}
   persist();console.log(JSON.stringify({id:row.id,retrieval:row.retrievalComplete,selector:row.correct??null,error:row.error??null,cost:report.cost}));
   if(report.cost>.5)throw Error('Evaluation cost bound');
  }
  const positives=report.rows.filter(r=>r.positive),selected=report.rows.filter(r=>r.registered),controls=selected.filter(r=>r.control);
  report.metrics={heldoutSelector:{correct:selected.filter(r=>!r.familiar&&r.correct).length,total:selected.filter(r=>!r.familiar).length},heldoutRetrieval:{correct:positives.filter(r=>r.retrievalComplete).length,total:positives.length},selector:{correct:selected.filter(r=>r.correct).length,total:registered.length,attempted:selected.filter(r=>r.selectorAttempted).length,errors:selected.filter(r=>r.error).length},controls:{correct:controls.filter(r=>r.correct).length,total:controls.length,falseFull:controls.filter(r=>r.falseFull).length},compound:report.rows.filter(r=>r.compound).map(r=>({id:r.id,allTargets:r.retrievalComplete,targetsFound:r.targetsFound,targetsTotal:r.targetsTotal,correct:r.correct})),regressions:report.rows.filter(r=>r.familiar).map(r=>({id:r.id,correct:r.correct,retrieval:r.retrievalComplete}))};
  report.status=selectorFlag&&report.metrics.selector.attempted!==60?'incomplete':'completed';persist();console.log(JSON.stringify({status:report.status,metrics:report.metrics,cost:report.cost}));
 }finally{await new Promise(r=>server.close(r));snapshot.close();}
}
