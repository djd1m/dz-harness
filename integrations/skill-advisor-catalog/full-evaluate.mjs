/** Explicit opt-in evaluation on a preregistered, outcome-blind labeled corpus.
 * INPUT SNAPSHOT NEW_OUTPUT KEY_FILE [--selector] [--prior-cost=NUMBER] [--budget=NUMBER]
 * Never changes catalog records, budgets, quotas or a running deployment.
 */
import{readFileSync,writeFileSync}from'node:fs';
import{resolve}from'node:path';
import{fileURLToPath}from'node:url';
import{currentCatalog}from'./cli.mjs';
import{digest}from'./catalog.mjs';
import{approvedPresentation}from'./answer.mjs';
import{dialogueContract,renderDialogue}from'./dialogue.mjs';
import{selectScenarios,MAX_OUTPUT_TOKENS}from'./selector.mjs';
import{buildSourceContext}from'./source-context.mjs';
import{buildSourceProjection}from'./source-projection.mjs';
import{evaluationAttemptCost,embedEvaluationBatch}from'./evaluation-budget.mjs';
import{coversPackages as covers,matchesSelection}from'./evaluation-matching.mjs';
import{advisorIdentity,advisorLexicalize,createHybridRetriever}from'./hybrid-advisor.mjs';
import{openSnapshot}from'../hybrid-retrieval/index.mjs';
import{createSearchServer}from'../hybrid-retrieval/service.mjs';
import{createEmbeddingClient}from'../hybrid-retrieval/openrouter.mjs';
const codeFiles=['evaluation-matching','source-projection','evaluation-budget','source-context','package-retrieval','catalog-inventory','full-evaluate','hybrid-advisor','catalog','cli','search','answer','dialogue','selector'];
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=path=>JSON.parse(readFileSync(path,'utf8'));

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const[input,snapshotPath,output,keyFile,...flags]=process.argv.slice(2);
 const selectorFlag=flags.includes('--selector'),priorFlag=flags.find(f=>f.startsWith('--prior-cost='));
 const priorCost=priorFlag?Number(priorFlag.split('=')[1]):0;
 const budgetFlag=flags.find(f=>f.startsWith('--budget=')),budgetLimit=budgetFlag?Number(budgetFlag.split('=')[1]):.5;
 if(!input||!snapshotPath||!output||!keyFile||!Number.isFinite(priorCost)||priorCost<0||!Number.isFinite(budgetLimit)||budgetLimit<=0||budgetLimit>.75||priorCost>=budgetLimit||flags.some(f=>f!=='--selector'&&!/^--(?:prior-cost|budget)=\d+(?:\.\d+)?$/u.test(f)))throw Error('INPUT SNAPSHOT NEW_OUTPUT KEY_FILE [--selector] [--prior-cost=NUMBER]');
 // Reserve output before any paid call. A failed run is evidence, never overwritten or silently retried.
 writeFileSync(output,JSON.stringify({status:'started'})+'\n',{flag:'wx',mode:0o600});
 const labels=read(input),catalog=currentCatalog(),sourceContext=buildSourceContext(catalog),projection=buildSourceProjection(catalog,sourceContext),identity=advisorIdentity(catalog,projection.documents);
 const all=[...labels.familiarRegressions,...labels.cases],byId=new Map(all.map(q=>[q.id,q]));
 const registered=labels.selectorPreregistration.caseIds;
 if(byId.size!==all.length||![60,74].includes(registered.length)||registered.length!==labels.selectorPreregistration.attempts||new Set(registered).size!==registered.length||registered.some(id=>!byId.has(id)))throw Error('Invalid preregistration');
 const report={schema:1,status:'incomplete',inputSha256:digest(readFileSync(input)),catalogRevision:catalog.revision,coverage:catalog.coverage,
  codeHashes:Object.fromEntries(codeFiles.map(name=>[name,digest(readFileSync(new URL(name+'.mjs',import.meta.url)))])),
  dataHashes:Object.fromEntries(['records','reviews','presentation','presentation-reviews','inventory'].map(name=>[name,digest(readFileSync(resolve(root,'docs/proposals/skill-advisor-scenarios/full-catalog',name+'.json')))])),
  identity,model:'anthropic/claude-haiku-5.5',selectorRequested:!!selectorFlag,registeredIds:registered,budgetLimit,searchDocuments:projection.documents.length,priorCost,cost:0,unknownCostReserve:0,rows:[]};
 const persist=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});persist();
 const metadataResponse=await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!metadataResponse.ok)throw Error('Cannot verify evaluation model pricing');
 const modelMetadata=(await metadataResponse.json()).data?.find(model=>model.id===report.model);
 const pricing=modelMetadata?.pricing;
 if(!pricing||![pricing.prompt,pricing.completion].every(price=>Number.isFinite(Number(price))&&Number(price)>0))throw Error('Invalid evaluation pricing');
 report.pricing={observedAt:new Date().toISOString(),prompt:pricing.prompt,completion:pricing.completion,overrides:pricing.overrides??[]};persist();
 const embeddingMetadataResponse=await fetch('https://openrouter.ai/api/v1/embeddings/models',{signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!embeddingMetadataResponse.ok)throw Error('Cannot verify embedding pricing');
 const embeddingPricing=(await embeddingMetadataResponse.json()).data?.find(model=>model.id===identity.model)?.pricing;
 if(!embeddingPricing)throw Error('Missing embedding model pricing');
 report.embeddingPricing={observedAt:new Date().toISOString(),...embeddingPricing};persist();
 const apiKey=readFileSync(keyFile,'utf8').trim();
 const client=createEmbeddingClient({apiKey,...identity,timeoutMs:60000,responseModelIds:['baai/bge-m3','parasail-bge-m3']});
 const vectors=new Map();
 for(let start=0;start<all.length;start+=16){const batch=all.slice(start,start+16),response=await embedEvaluationBatch({client,texts:batch.map(q=>q.query),pricing:embeddingPricing,report,priorCost,budgetLimit,persist});batch.forEach((q,i)=>vectors.set(q.query,response.vectors[i]));}
 const snapshot=await openSnapshot({directory:snapshotPath,...identity,lexicalize:advisorLexicalize});
 const server=createSearchServer({snapshot});await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
 try{
  const retriever=createHybridRetriever({catalog,projection,searchUrl:`http://127.0.0.1:${server.address().port}`,embed:async queries=>({vectors:queries.map(q=>vectors.get(q))})});
  const dir=resolve(root,'docs/proposals/skill-advisor-scenarios');
  const presentation=approvedPresentation(catalog,read(resolve(dir,'full-catalog/presentation.json')),read(resolve(dir,'full-catalog/presentation-reviews.json')));
  const contract=dialogueContract(presentation,sourceContext),courses=read(resolve(dir,'course-map.json'));
  const ordered=[...registered.map(id=>byId.get(id)),...all.filter(q=>!registered.includes(q.id))];
  for(const q of ordered){
   const row={id:q.id,query:q.query,familiar:q.familiar===true,positive:q.id.startsWith('H'),control:q.id.startsWith('N'),compound:q.id.startsWith('C'),registered:registered.includes(q.id)};
   report.rows.push(row);
   try{
    const retrieval=await retriever(q.query);row.retrievalTrace=retrieval.trace??null;row.mode=retrieval.meta.mode;row.retrievalDiagnostics=retrieval.meta;
    row.retrievedIds=retrieval.candidates.map(c=>c.id);row.retrievedPackages=[...new Set(retrieval.candidates.map(c=>c.record.package.name))];
    row.retrievalComplete=q.acceptablePackageSets.some(s=>s.length>0)&&covers(row.retrievedPackages,q.acceptablePackageSets);
    row.targetsFound=(q.allRequiredTargets??[]).filter(p=>row.retrievedPackages.includes(p)).length;row.targetsTotal=q.allRequiredTargets?.length??0;
    if(selectorFlag&&row.registered){
     const selectorInput=contract.input(retrieval);row.selectorInputHash=digest(JSON.stringify(selectorInput));
     row.sourceWitnesses=selectorInput.candidates.map(c=>({id:c.id,quotes:(c.sourceContext??[]).map(e=>({path:e.path,sha256:e.sha256,quoteSha256:digest(e.quote)}))}));
     const inputTokenUpper=Buffer.byteLength(JSON.stringify(selectorInput))+Buffer.byteLength(contract.instructions)+2048;
     const applicable=[pricing,...(pricing.overrides??[]).filter(tier=>inputTokenUpper>=tier.min_prompt_tokens)];
     const promptRate=Math.max(...applicable.map(tier=>Number(tier.prompt))),outputRate=Math.max(...applicable.map(tier=>Number(tier.completion)));
     if(!Number.isFinite(promptRate)||!Number.isFinite(outputRate))throw Error('Invalid pricing tier');
     row.requestCostCeiling=(inputTokenUpper*promptRate+MAX_OUTPUT_TOKENS*outputRate)*1.1+.001;
     if(report.cost+report.unknownCostReserve+priorCost+row.requestCostCeiling>budgetLimit){row.error='budget-stop';continue;}
     row.selectorAttempted=true;const start=performance.now();
     try{
      const result=await selectScenarios(retrieval,{model:report.model,apiKey,contract});
      row.usage=result.usage;row.actualModel=result.actualModel;
      row.choice={decision:result.output.decision,intent:result.output.intent,scenarioIds:result.output.records.map(r=>r.id),missingParts:result.output.missingParts};
      row.selectedPackages=[...new Set(result.output.records.map(r=>r.package.name))];
      row.answer=renderDialogue(result.output,presentation,courses);
      row.correct=matchesSelection(labels,q,row.choice.decision,row.selectedPackages);
      row.falseFull=(row.control||row.compound)&&row.choice.decision==='recommend'&&!row.correct;
      row.valid=true;
     }catch(error){row.error=error.code??'provider-or-contract-error';row.usage=error.usage;row.valid=false;row.correct=false;}
     row.responseMs=Math.round(performance.now()-start);const accounted=evaluationAttemptCost(row.usage,row.requestCostCeiling);row.costAccounting=accounted;report.cost+=accounted.observed;report.unknownCostReserve+=accounted.reserved;
    }
   }catch(error){row.error=error.code??'retrieval-error';row.correct=false;row.retrievalComplete=false;}
   persist();console.log(JSON.stringify({id:row.id,retrieval:row.retrievalComplete,selector:row.correct??null,error:row.error??null,cost:report.cost}));
   if(report.cost+report.unknownCostReserve+priorCost>budgetLimit)throw Error('Evaluation cost bound');
  }
  const positives=report.rows.filter(r=>r.positive),selected=report.rows.filter(r=>r.registered),controls=selected.filter(r=>r.control);
  report.metrics={positiveSelector:{correct:selected.filter(r=>r.positive&&r.correct).length,total:selected.filter(r=>r.positive).length},heldoutSelector:{correct:selected.filter(r=>!r.familiar&&r.correct).length,total:selected.filter(r=>!r.familiar).length},heldoutRetrieval:{correct:positives.filter(r=>r.retrievalComplete).length,total:positives.length},selector:{correct:selected.filter(r=>r.correct).length,total:registered.length,attempted:selected.filter(r=>r.selectorAttempted).length,errors:selected.filter(r=>r.error).length},controls:{correct:controls.filter(r=>r.correct).length,total:controls.length,falseFull:controls.filter(r=>r.falseFull).length},compound:report.rows.filter(r=>r.compound).map(r=>({id:r.id,allTargets:r.retrievalComplete,targetsFound:r.targetsFound,targetsTotal:r.targetsTotal,correct:r.correct})),regressions:report.rows.filter(r=>r.familiar).map(r=>({id:r.id,correct:r.correct,retrieval:r.retrievalComplete}))};
  report.status=selectorFlag&&report.metrics.selector.attempted!==registered.length?'incomplete':'completed';persist();console.log(JSON.stringify({status:report.status,metrics:report.metrics,cost:report.cost}));
 }finally{await new Promise(r=>server.close(r));snapshot.close();}
}
