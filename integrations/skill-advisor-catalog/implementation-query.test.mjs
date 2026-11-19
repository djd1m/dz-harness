import test from 'node:test';
import assert from 'node:assert/strict';
import {implementationQuery} from './implementation-query.mjs';
import {currentCatalog} from './cli.mjs';
import {buildSourceContext} from './source-context.mjs';
import {buildSourceProjection} from './source-projection.mjs';
import {advisorIdentity,createHybridRetriever} from './hybrid-advisor.mjs';
import {compactDialogueContract,compactRequirements} from './compact-dialogue.mjs';
const catalog=currentCatalog(),context=buildSourceContext(catalog);
const projection=buildSourceProjection(catalog,context);
const identity=advisorIdentity(catalog,projection.documents);

test('web implementation survives business topics that have no literal source match',async()=>{
 const retrieve=createHybridRetriever({catalog,projection,searchUrl:'http://127.0.0.1:1',
  embed:async()=>({vectors:[Array(1024).fill(0.01)]}),
  fetchImpl:async()=>Response.json({...identity,hits:[]}),
 });
 for(const query of [
  'Сделай сайт-визитку для сантехника, который выезжает на дом и чинит краны.',
  'Хочу сделать простой симулятор лотереи в браузере: нажимаешь кнопку и выпадают случайные числа.',
 ]){
  const result=await retrieve(query);
  assert.equal(result.query,query);
  const candidate=result.candidates.find(c=>c.record.skillIds?.includes('frontend-design'));
  assert.ok(candidate,query);
  assert.equal(candidate.origin,'implementation-vocabulary');
  const input=compactDialogueContract(new Map(),context).input(result);
  const card=input.cards.find(card=>card.package===candidate.record.package.name && card.scope==='skill');
  assert.ok(card.passages.some(p=>/web|functional|frontend|application|interface/iu.test(p.text)),query);
 }
});
test('review, backup, tests, negated creation and physical delivery do not trigger web creation',()=>{
 for(const query of [
  'Проверь сайт на ошибки','Создай резервную копию сайта','Создай тесты для веб приложения',
  'Нужен сантехник на дом','Не создавай сайт, только объясни варианты',
  'Create tests for a website',
 ]) assert.equal(implementationQuery(query),null,query);
});
test('getting started refines the task and does not become a separate adviser requirement',()=>{
 const query='Надо написать тесты для нового обработчика. С чего начать?';
 const requirements=compactRequirements({query,candidates:[]});
 assert.deepEqual(requirements.map(r=>r.text),['Надо написать тесты для нового обработчика.']);
 assert.deepEqual(compactRequirements({query:'С чего начать?',candidates:[]}).map(r=>r.text),['С чего начать?']);
});
