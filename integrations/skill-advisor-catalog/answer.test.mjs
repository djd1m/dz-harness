import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedPresentation, answerContract, renderAnswer } from './answer.mjs';
import { recordHash } from './catalog.mjs';
const card = { id: 'migration', package: { name: 'pkg' }, outcome: 'Plan' };
const p = { id: card.id, recordHash: recordHash(card), role: 'plan', summary: 'План миграции', boundary: 'Не выполняет миграцию', nextAction: 'Подготовьте схему' };
const receipt = value => ({ id: value.id, presentationHash: recordHash(value), verdict: 'approved' });
const map = () => approvedPresentation({ records: [card] }, { records: [p] }, { reviews: [receipt(p)] });
const retrieval = { candidates: [{ id: card.id, record: card }] };
test('execution request cannot become complete recommendation from planning cards', () => {
 const c=answerContract(map());
 const out=c.materialize(retrieval,{decision:'recommend',intent:'execute',scenarioIds:['migration']});
 assert.equal(out.decision,'partial'); assert.equal(out.forcedPartial,true);
 assert.equal(c.materialize(retrieval,{decision:'recommend',intent:'plan',scenarioIds:['migration']}).decision,'recommend');
});
test('edited presentation or source record invalidates approval',()=>{
 assert.throws(()=>approvedPresentation({records:[card]},{records:[{...p,boundary:'Executes all'}]},{reviews:[receipt(p)]}),/stale/);
 assert.throws(()=>approvedPresentation({records:[{...card,outcome:'changed'}]},{records:[p]},{reviews:[receipt(p)]}),/stale/);
});
test('partial answers use reviewed text, no invented gaps or model course',()=>{
 const m=map(),c=answerContract(m);
 const out=c.materialize(retrieval,{decision:'partial',intent:'execute',scenarioIds:['migration'],gap:'invented'});
 const answer=renderAnswer(out,m,{entries:[]});
 assert.equal(answer.items[0].scenarios[0].boundary,p.boundary); assert.equal(answer.items[0].courseUrl,null);
 assert.equal(JSON.stringify(answer).includes('invented'),false);
 assert.throws(()=>c.materialize(retrieval,{decision:'partial',intent:'execute',scenarioIds:['foreign']}));
 assert.throws(()=>c.materialize(retrieval,{decision:'clarify',intent:'learn',scenarioIds:['migration']}));
});
test('only verified exact-package HTTPS courses are displayed',()=>{
 const m=map(),out=answerContract(m).materialize(retrieval,{decision:'recommend',intent:'plan',scenarioIds:['migration']});
 const course={package:'pkg',status:'verified',url:'https://djd1m.github.io/dz-harness/tutorials/skills-devops/'};
 assert.equal(renderAnswer(out,m,{entries:[course]}).items[0].courseUrl,course.url);
 assert.equal(renderAnswer(out,m,{entries:[{...course,package:'another'}]}).items[0].courseUrl,null);
 assert.throws(()=>renderAnswer(out,m,{entries:[{...course,url:'javascript:alert(1)'}]}));
 assert.throws(()=>renderAnswer(out,m,{entries:[{...course,url:'https://djd1m.github.io:8443/dz-harness/tutorials/x/'}]}));
});
test('mixed planning and analysis do not imply execution capability',()=>{
 const second={...card,id:'analysis'}, p2={...p,id:'analysis',recordHash:recordHash(second),role:'analysis'};
 const m=approvedPresentation({records:[card,second]},{records:[p,p2]},{reviews:[receipt(p),receipt(p2)]});
 const out=answerContract(m).materialize({candidates:[{id:card.id,record:card},{id:second.id,record:second}]},
  {decision:'recommend',intent:'execute',scenarioIds:['migration','analysis']});
 assert.equal(out.decision,'partial');
});
test('guide role alone does not forbid a supported read-only operation',()=>{
 const guide={...p,role:'guide'};
 const m=approvedPresentation({records:[card]},{records:[guide]},{reviews:[receipt(guide)]});
 assert.equal(answerContract(m).materialize(retrieval,{decision:'recommend',intent:'execute',scenarioIds:['migration']}).decision,'recommend');
});
