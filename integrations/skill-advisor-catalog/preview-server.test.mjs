import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreview} from './preview-server.mjs';
async function fixture(t,answer,requestBudget=30){const server=createPreview({answer,requestBudget});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));const origin=`http://127.0.0.1:${server.address().port}`;return{origin,post:(body,headers={})=>fetch(origin+'/api/answer',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)})};}
test('free-form query reaches adapter intact; never expose raw errors',async t=>{
 let seen;const f=await fixture(t,async query=>{seen=query;throw Error('secret-provider-detail');});
 const response=await f.post({query:'Моя произвольная задача — исследовать API и сделать курс'});
 assert.equal(response.status,502);assert.equal(seen,'Моя произвольная задача — исследовать API и сделать курс');assert.equal((await response.text()).includes('secret-provider'),false);
});
test('origin, body and session budget enforced before paid adapter',async t=>{
 let calls=0;const f=await fixture(t,async()=>{calls++;return{decision:'clarify',lead:'Уточните',items:[]};},1);
 assert.equal((await f.post({query:'hello'},{origin:'https://evil.example'})).status,403);
 assert.equal((await f.post({query:''})).status,400);
 assert.equal((await f.post({query:'a'.repeat(25000)})).status,413);
 assert.equal((await f.post({query:'task'})).status,200);
 assert.equal((await f.post({query:'again'})).status,429);assert.equal(calls,1);
});
test('static allowlist cannot expose source or credentials',async t=>{
 const f=await fixture(t,async()=>({}));
 assert.equal((await fetch(f.origin+'/selector.mjs')).status,404);
 const page=await fetch(f.origin+'/');assert.equal(page.status,200);assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow');
 assert.match(await page.text(),/textarea id="query"/);
});
test('split UTF-8 characters survive request streaming',async t=>{
 const {request}=await import('node:http');let seen;
 const f=await fixture(t,async query=>{seen=query;return{items:[]};});
 const bytes=Buffer.from(JSON.stringify({query:'Привет'}));const split=bytes.indexOf(Buffer.from('П'))+1;
 await new Promise((resolve,reject)=>{const req=request(f.origin+'/api/answer',{method:'POST',headers:{origin:f.origin,'content-type':'application/json'}},res=>{res.resume();res.on('end',resolve);});req.on('error',reject);req.write(bytes.subarray(0,split));setTimeout(()=>req.end(bytes.subarray(split)),5);});
 assert.equal(seen,'Привет');
});
test('HTTP provider failure consumes persistent budget across server restart',async t=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {createRequestLedger}=await import('./request-ledger.mjs');
 const dir=mkdtempSync(join(tmpdir(),'advisor-http-ledger-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'calls.json');
 let calls=0;
 for(let round=0;round<2;round++){
  const server=createPreview({requestBudget:1,requestLedger:createRequestLedger(path,1),answer:async()=>{calls++;throw Error('upstream down');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  try{const response=await fetch(origin+'/api/answer',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({query:'task'})});
   assert.equal(response.status,round===0?502:429);
  }finally{await new Promise(r=>{server.closeAllConnections();server.close(r);});}
 }
 assert.equal(calls,1);
});
