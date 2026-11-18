import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createRequestLedger} from './request-ledger.mjs';
function path(t){const d=mkdtempSync(join(tmpdir(),'advisor-ledger-'));t.after(()=>rmSync(d,{recursive:true,force:true}));return join(d,'calls.json');}
test('provider attempts remain consumed across restarts including failed attempts',t=>{
 const p=path(t);let l=createRequestLedger(p,2);assert.equal(l.reserve(),true);l.close();
 l=createRequestLedger(p,2);assert.equal(l.reserve(),true);assert.equal(l.reserve(),false);l.close();
 assert.deepEqual(JSON.parse(readFileSync(p)),{version:1,limit:2,attempts:2});
});
test('concurrent owner and corrupt state fail closed instead of resetting budget',t=>{
 const p=path(t),l=createRequestLedger(p,2);assert.throws(()=>createRequestLedger(p,2));l.close();
 writeFileSync(p,'invalid');assert.throws(()=>createRequestLedger(p,2));assert.equal(readFileSync(p,'utf8'),'invalid');
});
test('changing limit requires an explicit new session file',t=>{
 const p=path(t),l=createRequestLedger(p,1);l.reserve();l.close();assert.throws(()=>createRequestLedger(p,2));
});
