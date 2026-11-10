// Reopen actual disk indexes in a fresh process, then exercise invalid-input controls.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {create,load,search} from '@orama/orama';
import * as lance from '@lancedb/lancedb';
import {stems} from '../../../../packages/harness-core/dist/stem.js';
const dir=resolve(process.argv[2]);
const read=n=>JSON.parse(readFileSync(resolve(dir,n),'utf8'));
const evidence=read('retrieval.json'),cache=read('embeddings.json');
assert.deepEqual(evidence.config,cache.config);
const orama=create({schema:{id:'string',text:'string',vector:'vector[1024]'},components:{tokenizer:{language:'russian',stemming:false}}});
load(orama,read('orama-index.json'));
const db=await lance.connect(resolve(dir,'lance')),table=await db.openTable('scenarios');
for(let i=0;i<evidence.rows.length;i++){
 const q=evidence.rows[i],term=stems(q.query).join(' '),v=cache.queries[i];
 const actual=search(orama,{mode:'hybrid',term,properties:['text'],vector:{property:'vector',value:v},similarity:0,limit:5}).hits.map(h=>h.document.id);
 assert.deepEqual(actual,q.methods['orama-hybrid'].hits.map(h=>h.id));
 const rows=await table.vectorSearch(v).distanceType('cosine').fullTextSearch(term,{columns:['text']}).select(['id']).limit(5).toArray();
 assert.deepEqual(rows.map(r=>r.id),q.methods['lance-hybrid'].hits.map(h=>h.id));
}
const temp=mkdtempSync(resolve(tmpdir(),'dz-advisor-hybrid-controls-'));
for(const [name,mutate,error]of[
 ['stale-revision',c=>{c.config.catalogRevision='stale';},'Embedding revision/model mismatch'],
 ['bad-dimension',c=>{c.queries[0]=[1,2];},'Invalid vector']
]){
 const p=resolve(temp,name);mkdirSync(p);const c=structuredClone(cache);mutate(c);writeFileSync(resolve(p,'embeddings.json'),JSON.stringify(c));
 const r=spawnSync(process.execPath,[new URL('run.mjs',import.meta.url).pathname,'search',p],{encoding:'utf8',env:{PATH:process.env.PATH}});
 assert.notEqual(r.status,0);assert(r.stderr.includes(error));
}
const r=spawnSync(process.execPath,[new URL('run.mjs',import.meta.url).pathname,'select',dir],{encoding:'utf8',env:{PATH:process.env.PATH}});
assert.notEqual(r.status,0);assert(r.stderr.includes('Selection artifacts exist; refusing paid rerun'));
console.log(JSON.stringify({freshProcessRoundtrips:evidence.rows.length*2,negativeControls:['stale-revision','bad-dimension','paid-rerun'],searchEvidenceSha256:createHash('sha256').update(readFileSync(resolve(dir,'retrieval.json'))).digest('hex'),dependencyProfile:'linux-x64-gnu, omit optional with explicit native addon'}));
