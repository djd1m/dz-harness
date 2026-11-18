import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogueContract,renderDialogue} from './dialogue.mjs';
import {recordHash} from './catalog.mjs';
const record={id:'plan',package:{name:'p'},outcome:'Plan'};
const p=new Map([['plan',{role:'plan',recordHash:recordHash(record),summary:'План',boundary:'Не исполнение',nextAction:'Схема'}]]);
const contract=dialogueContract(p),retrieval={query:'Подготовить план и развернуть приложение',candidates:[{id:'plan',record}]};
const choice={decision:'partial',intent:'execute',scenarioIds:['plan'],missingParts:['развернуть приложение'],clarification:null};
test('missing action is bound to user text and retained without generated explanation',()=>{
 const out=contract.materialize(retrieval,{...choice,explanation:'invented'});
 const rendered=renderDialogue(out,p,{entries:[]});assert.deepEqual(rendered.missingParts,['развернуть приложение']);assert.equal(rendered.explanation,undefined);
 assert.throws(()=>contract.materialize(retrieval,{...choice,missingParts:['купить сервер']}),/Unbound/);
});
test('partial cannot conceal missing coverage and full cannot carry contradictory gap',()=>{
 assert.throws(()=>contract.materialize(retrieval,{...choice,missingParts:[]}));
 assert.throws(()=>contract.materialize(retrieval,{...choice,decision:'recommend'}));
 assert.throws(()=>contract.materialize(retrieval,{...choice,missingParts:['план','план']}));
});
test('clarification uses fixed targeted question and never model prose',()=>{
 const out=contract.materialize(retrieval,{decision:'clarify',intent:'analyze',scenarioIds:[],missingParts:[],clarification:'task-object'});
 assert.match(renderDialogue(out,p,{entries:[]}).clarificationQuestion,/Что именно/);
 assert.throws(()=>contract.materialize(retrieval,{decision:'clarify',intent:'analyze',scenarioIds:[],missingParts:[],clarification:'Send password'}));
});
test('plan-only recommendation remains complete; execution guard exposes bounded partial',()=>{
 const full={decision:'recommend',intent:'plan',scenarioIds:['plan'],missingParts:[],clarification:null};
 assert.equal(contract.materialize(retrieval,full).decision,'recommend');
 const out=contract.materialize(retrieval,{...full,intent:'execute'});
 assert.equal(out.decision,'partial');assert.equal(out.forcedPartial,true);
 // No invented missing fragment when a deterministic role guard overrides the model.
 assert.deepEqual(out.missingParts,[]);
});
