import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createEmbeddingClient} from '../hybrid-retrieval/openrouter.mjs';
import {currentCatalog} from './cli.mjs';
import {createHybridRetriever,advisorIdentity} from './hybrid-advisor.mjs';
const catalog=currentCatalog(),identity=advisorIdentity(catalog);
const vector=Array.from({length:1024},(_,i)=>i===0?1:0);
const embed=async()=>({vectors:[vector],usage:{cost:0}});
const make=options=>createHybridRetriever({catalog,searchUrl:'http://search:8081',embed,...options});
const good=extra=>new Response(JSON.stringify({...identity,hits:[{id:'meta-capture-adr',score:.8}],...extra}));
test('remote hits receive host-owned records; arbitrary remote prose ignored',async()=>{
 const retrieve=make({fetchImpl:async()=>good({text:'invented course',record:{outcome:'transfer money'}})});
 const result=await retrieve('Запиши принятое решение');
 assert.equal(result.candidates[0].record,catalog.records.find(r=>r.id==='meta-capture-adr'));
 assert.equal(result.meta.mode,'hybrid');assert.equal(result.candidates[0].record.outcome.includes('перевод'),false);
});
test('unknown IDs, duplicates and stale identity reject instead of availability fallback',async()=>{
 for(const payload of [{revision:'stale'},{hits:[{id:'foreign',score:1}]},{hits:[{id:'meta-capture-adr',score:1},{id:'meta-capture-adr',score:.8}]}]){
  let fallback=false;const retrieve=make({fetchImpl:async()=>good(payload),onEvent:e=>{if(e.event==='advisor.retrieval_fallback')fallback=true;}});
  await assert.rejects(()=>retrieve('Архитектурное решение'),{code:'search-integrity'});assert.equal(fallback,false);
 }
});
test('availability failures explicitly fall back to current lexical revision without logging query',async()=>{
 for(const code of ['embedding-timeout','embedding-unavailable','search-unavailable']){
  const events=[];const retrieve=make({embed:code.startsWith('embedding')?async()=>{throw Object.assign(Error('do not expose credential'),{code});}:embed,fetchImpl:async()=>new Response('',{status:503}),onEvent:e=>events.push(e)});
  const result=await retrieve('Запиши принятое решение в ADR');
  assert.equal(result.meta.mode,'lexical');assert.equal(result.revision,catalog.revision);
  assert(events.some(e=>e.event==='advisor.retrieval_fallback'));assert(!JSON.stringify(events).includes('Запиши'));assert(!JSON.stringify(events).includes('credential'));
 }
});
test('provider rejection and malformed vectors do not masquerade as availability',async()=>{
 const rejected=make({embed:async()=>{throw Object.assign(Error('private'),{code:'embedding-rejected'});}});
 await assert.rejects(()=>rejected('Решение'),{code:'embedding-rejected'});
 await assert.rejects(()=>make({embed:async()=>({vectors:[[1,2]]})})('Решение'),{code:'search-integrity'});
});
test('search body deadline also covers stalled response stream',async()=>{
 const server=createServer((req,res)=>{req.resume();res.writeHead(200,{'Content-Type':'application/json'});res.write('{');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const retrieve=make({searchUrl:`http://127.0.0.1:${server.address().port}`,searchTimeoutMs:40});
  const r=await retrieve('Зафиксируй архитектурное решение');assert.equal(r.meta.reason,'search-timeout');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('embedding client reorders indexed vectors and checks actual model/dimensions',async()=>{
 const client=createEmbeddingClient({apiKey:'test-only',model:'baai/bge-m3',dimensions:2,fetchImpl:async()=>new Response(JSON.stringify({model:'BAAI/bge-m3',data:[{index:1,embedding:[0,1]},{index:0,embedding:[1,0]}],usage:{prompt_tokens:3,total_tokens:3,cost:.001}}))});
 assert.deepEqual((await client.embed(['one','two'])).vectors,[[1,0],[0,1]]);
 for(const data of [{model:'different',data:[{index:0,embedding:[1,0]}]},{model:'BAAI/bge-m3',data:[{index:0,embedding:[1]}]}]){
  const bad=createEmbeddingClient({apiKey:'test',dimensions:2,fetchImpl:async()=>new Response(JSON.stringify(data))});await assert.rejects(()=>bad.embed(['one']),e=>e.code.startsWith('embedding-'));
 }
});
test('embedding transport timeout and HTTP errors stay nonsecret typed errors',async()=>{
 const server=createServer(req=>req.resume());await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const client=createEmbeddingClient({apiKey:'hidden',timeoutMs:30,fetchImpl:(_url,init)=>fetch(`http://127.0.0.1:${server.address().port}`,init)});
  await assert.rejects(()=>client.embed(['hello']),{code:'embedding-timeout'});
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 const denied=createEmbeddingClient({apiKey:'hidden',fetchImpl:async()=>new Response('secret body',{status:401})});
 await assert.rejects(()=>denied.embed(['hello']),e=>e.code==='embedding-rejected'&&!e.message.includes('secret'));
});
test('response model aliases are explicit and unknown models remain rejected with usage',async()=>{
 const payload=model=>new Response(JSON.stringify({model,data:[{index:0,embedding:[1,0]}],usage:{prompt_tokens:4,total_tokens:4,cost:.0001}}));
 const options={apiKey:'test',dimensions:2,responseModelIds:['baai/bge-m3','parasail-bge-m3']};
 const client=createEmbeddingClient({...options,fetchImpl:async()=>payload('parasail-bge-m3')});assert.equal((await client.embed(['hello'])).actualModel,'parasail-bge-m3');
 const bad=createEmbeddingClient({...options,fetchImpl:async()=>payload('another-model')});await assert.rejects(()=>bad.embed(['hello']),e=>e.code==='embedding-model'&&e.usage.prompt_tokens===4);
});
test('detected snapshot corruption cannot be hidden by a 503 proxy status',async()=>{
 const retrieve=make({fetchImpl:async()=>new Response(JSON.stringify({error:'SNAPSHOT_CORRUPT'}),{status:503})});
 await assert.rejects(()=>retrieve('Запиши решение'),{code:'search-integrity'});
});
