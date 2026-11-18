import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmbeddingClient,readOpenRouterBudgetFailure} from '../hybrid-retrieval/openrouter.mjs';
import {selectScenarios} from './selector.mjs';
import {createHybridRetriever} from './hybrid-advisor.mjs';
const response=(status,source)=>new Response(JSON.stringify({error:{message:'fixture-sensitive-text',metadata:{limit_source:source}}}),{status});
test('both adapters preserve402and recognized403without leaking body or promising a reset',async()=>{
 for(const [status,source] of [[402,undefined],[403,'openrouter_key_limit'],[403,'openrouter_guardrail_budget'],[403,'openrouter_workspace_budget']]){
  const embed=createEmbeddingClient({apiKey:'fixture',model:'fixture',dimensions:2,fetchImpl:async()=>response(status,source)});
  await assert.rejects(embed.embed(['query']),error=>error.code==='provider-spend-denied'&&error.httpStatus===status&&!error.message.includes('sensitive'));
  await assert.rejects(selectScenarios({query:'query',candidates:[]},{model:'fixture',apiKey:'fixture',fetchImpl:async()=>response(status,source),contract:{instructions:'fixture',input:()=>({}),materialize:()=>({})}}),error=>error.code==='provider-spend-denied'&&error.httpStatus===status);
 }
});
test('unknown403does not become a monetary declaration; malformed402stays typed unavailable spend',async()=>{
 assert.equal(await readOpenRouterBudgetFailure(response(403,'auth_permission')),null);
 assert.deepEqual(await readOpenRouterBudgetFailure(new Response('not-json',{status:402})),{code:'provider-spend-denied',httpStatus:402});
 assert.equal(await readOpenRouterBudgetFailure(new Response('x'.repeat(8193),{status:403})),null);
});
test('typed embedding spend denial cannot enter lexical fallback or call search',async()=>{
 let searched=0,fallback=0;
 const embed=createEmbeddingClient({apiKey:'fixture',fetchImpl:async()=>response(403,'openrouter_key_limit')});
 const retrieve=createHybridRetriever({catalog:{revision:'r',records:[]},searchUrl:'http://search:8081',embed:embed.embed,fetchImpl:async()=>{searched++;throw Error('must not search')},onEvent:event=>{if(event.event==='advisor.retrieval_fallback')fallback++}});
 await assert.rejects(retrieve('query'),error=>error.code==='provider-spend-denied');
 assert.equal(searched,0);assert.equal(fallback,0);
});
