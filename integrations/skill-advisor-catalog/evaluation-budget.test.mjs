import test from 'node:test';import assert from 'node:assert/strict';
import{evaluationAttemptCost}from'./evaluation-budget.mjs';
test('receipt-less and malformed-cost calls retain their entire reservation',()=>{
 for(const usage of[undefined,null,{}, {cost:null},{cost:'0'},{cost:NaN},{cost:Infinity},{cost:-1}])assert.deepEqual(evaluationAttemptCost(usage,.02),{observed:0,reserved:.02});
 assert.deepEqual(evaluationAttemptCost({cost:.001},.02),{observed:.001,reserved:0});
 assert.deepEqual(evaluationAttemptCost({cost:0},.02),{observed:0,reserved:0});
 assert.throws(()=>evaluationAttemptCost({},-1));
});
test('several unknown failures consume admission headroom instead of freeing it',()=>{
 const costs=[evaluationAttemptCost(undefined,.08),evaluationAttemptCost(undefined,.08),evaluationAttemptCost({cost:.01},.08)];
 const committed=.18+costs.reduce((sum,c)=>sum+c.observed+c.reserved,0);
 assert.ok(committed+.16>.5); // next attempt must not be admitted by the trial driver
});

import{embedEvaluationBatch}from'./evaluation-budget.mjs';
test('embedding admission rejects before provider invocation near the limit',async()=>{
 let calls=0;const report={cost:.7495,unknownCostReserve:0};
 await assert.rejects(embedEvaluationBatch({client:{embed(){calls++;}},texts:['x'],pricing:{prompt:.00000001},report,priorCost:0,budgetLimit:.75,persist(){}}),/admission refused/);assert.equal(calls,0);
});
test('embedding known overrun is durably recorded before budget refusal',async()=>{
 let durable;const report={cost:0,unknownCostReserve:0};
 await assert.rejects(embedEvaluationBatch({client:{async embed(){return{usage:{cost:.8}};}},texts:['x'],pricing:{prompt:.00000001},report,priorCost:0,budgetLimit:.75,persist(){durable={...report};}}),/cost bound/);assert.equal(durable.cost,.8);assert.equal(durable.unknownCostReserve,0);
});
test('embedding failure retains the pre-call reservation and known usage settles it',async()=>{
 for(const usage of [undefined,{cost:.00001}]){let durable;const report={cost:0,unknownCostReserve:0};
 await assert.rejects(embedEvaluationBatch({client:{async embed(){assert(durable.unknownCostReserve>0);throw Object.assign(Error('failed'),{usage});}},texts:['x'],pricing:{prompt:.00000001},report,priorCost:0,budgetLimit:.75,persist(){durable={...report};}}),/failed/);
 assert.equal(durable.cost,usage?.cost??0);assert.equal(durable.unknownCostReserve>0,!usage);}
});
