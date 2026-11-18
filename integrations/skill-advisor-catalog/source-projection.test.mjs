import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {digest} from './catalog.mjs';
import {buildSourceContext} from './source-context.mjs';
import {buildSourceProjection} from './source-projection.mjs';
import {advisorIdentity,advisorLexicalize,createHybridRetriever} from './hybrid-advisor.mjs';
import {dialogueContract} from './dialogue.mjs';
import {buildSnapshot} from '../hybrid-retrieval/index.mjs';
import {createSearchServer} from '../hybrid-retrieval/service.mjs';

function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'projection-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const records=['a','b'].map((id,i)=>{const path=`packages/${id}/README.md`,text=i===0?'introductory fixture '.repeat(55)+'quartzrecovery sourceonly capability '.repeat(50):'different source sentinel '.repeat(80);const full=join(root,path);mkdirSync(dirname(full),{recursive:true});writeFileSync(full,text);return {id,kind:'support',package:{name:id,manifest:`packages/${id}/package.json`},sources:[{path,sha256:digest(Buffer.from(text))}],title:'generic',intent:'generic',queries:['generic'],whenToUse:['generic'],whenNotToUse:[],prerequisites:[],limitations:[],steps:[],evidence:[],outcome:'generic'};});
 const catalog={revision:'fixture',records},context=buildSourceContext(catalog,{root}),projection=buildSourceProjection(catalog,context);
 return {root,catalog,context,projection};
}
const vector=Array(1024).fill(0);vector[0]=1;
const mockHits=(identity,hits)=>async()=>new Response(JSON.stringify({...identity,hits}),{status:200});

test('source entries bind trusted owners, full identity and preferred evidence',t=>{
 const {catalog,context,projection}=fixture(t),entry=context.indexEntries.find(x=>x.ownerId==='a'&&x.evidence.quote.includes('quartzrecovery'));assert.ok(entry);
 assert.ok(projection.has(entry.id));assert.equal(projection.resolve({id:entry.id,score:2}).record,catalog.records[0]);
 const original=advisorIdentity(catalog,projection.documents).revision;
 const modified=projection.documents.map((d,i)=>i?d:{...d,text:d.text+' changed'});assert.notEqual(advisorIdentity(catalog,modified).revision,original);
 assert.throws(()=>buildSourceProjection(catalog,{indexEntries:[entry,entry]}),/Invalid or duplicate/);
 assert.throws(()=>buildSourceProjection(catalog,{indexEntries:[{...entry,id:'unknown-owner',ownerId:'missing'}]}),/Invalid or duplicate/);
 assert.throws(()=>projection.resolve({id:'unknown',score:1}),/Unknown source projection/);
 assert.throws(()=>context('b','generic',[entry.evidence]),/Invalid preferred source evidence/);
});

test('valid blocks collapse to one owner and remote prose cannot replace trusted quote; all raw IDs validated',async t=>{
 const {catalog,context,projection}=fixture(t),entries=context.indexEntries.filter(e=>e.ownerId==='a');assert.ok(entries.length>=2);
 const identity=advisorIdentity(catalog,projection.documents),hits=entries.slice(0,2).map((e,i)=>({id:e.id,score:5-i,quote:'REMOTE FORGERY',text:'REMOTE FORGERY'}));
 const retriever=createHybridRetriever({catalog,projection,searchUrl:'http://127.0.0.1',embed:async()=>({vectors:[vector]}),fetchImpl:mockHits(identity,hits)});
 const result=await retriever('generic');assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].id,'a');
 const input=dialogueContract(new Map([['a',{role:'guide'}]]),context).input(result);assert.deepEqual(input.candidates[0].sourceContext[0].quote,entries[0].evidence.quote);assert.ok(!JSON.stringify(input).includes('REMOTE FORGERY'));
 const known=projection.documents.slice(0,6).map((d,i)=>({id:d.id,score:10-i}));assert.equal(known.length,6);
 for(const bad of [[...known,{id:'unknown-last',score:0}],[...hits,hits[0]]]){
  const invalid=createHybridRetriever({catalog,projection,searchUrl:'http://127.0.0.1',embed:async()=>({vectors:[vector]}),fetchImpl:mockHits(identity,bad)});
  await assert.rejects(()=>invalid('generic'),e=>e.code==='search-integrity');
 }
});

test('real Lance HTTP retrieval and lexical fallback retain source-only owner and quote',async t=>{
 const {root,catalog,context,projection}=fixture(t),identity=advisorIdentity(catalog,projection.documents),directory=join(root,'snapshot');
 const snapshot=await buildSnapshot({directory,...identity,lexicalize:advisorLexicalize,documents:projection.documents.map(d=>({...d,vector}))});
 t.after(()=>snapshot.close());const server=createSearchServer({snapshot});await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});t.after(()=>new Promise(ok=>server.close(ok)));
 const url=`http://127.0.0.1:${server.address().port}`,query='quartzrecovery',online=createHybridRetriever({catalog,projection,searchUrl:url,embed:async()=>({vectors:[vector]})});
 const real=await online(query);assert.equal(real.meta.mode,'hybrid');assert.ok(real.candidates.some(c=>c.id==='a'&&c.sourceQuotes.some(q=>q.quote.includes(query))));
 const offline=createHybridRetriever({catalog,projection,searchUrl:url,embed:async()=>{throw Object.assign(Error('offline'),{code:'embedding-unavailable'});}});
 const fallback=await offline(query);assert.equal(fallback.meta.mode,'lexical');assert.deepEqual(fallback.candidates.map(c=>c.id),['a']);assert.ok(fallback.candidates[0].sourceQuotes.some(q=>q.quote.includes(query)));
 const input=dialogueContract(new Map([['a',{role:'guide'}]]),context).input(fallback);assert.ok(input.candidates[0].sourceContext.some(q=>q.quote.includes(query)));
});
