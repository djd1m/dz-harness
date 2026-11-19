import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryQuery} from './discovery-query.mjs';
import {currentCatalog} from './cli.mjs';
import {buildSourceContext} from './source-context.mjs';
import {buildSourceProjection} from './source-projection.mjs';
import {compactDialogueContract} from './compact-dialogue.mjs';
import {createHybridRetriever, advisorIdentity} from './hybrid-advisor.mjs';

const catalog=currentCatalog(), context=buildSourceContext(catalog);
const projection=buildSourceProjection(catalog,context);
const identity=advisorIdentity(catalog,projection.documents);
const queries=[
 'Есть аудитория, пока не знаем, что ей предложить.',
 'У меня подписчики, но не понимаю, какой продукт им нужен',
 'Хочу выяснить проблемы клиентов перед запуском сервиса',
 'Нужно понять, за что люди готовы платить',
 'We have an audience but do not know what product to offer',
];

test('product discovery vocabulary preserves original tasks and supplies interview evidence', async()=>{
 const retrieve=createHybridRetriever({catalog,projection,searchUrl:'http://127.0.0.1:1',
  embed:async()=>({vectors:[Array(1024).fill(0.01)]}),
  fetchImpl:async()=>Response.json({...identity,hits:[]}),
 });
 const contract=compactDialogueContract(new Map(),context);
 for(const query of queries){
  assert.ok(discoveryQuery(query));
  const retrieval=await retrieve(query);
  assert.equal(retrieval.query,query);
  const input=contract.input(retrieval);
  assert.equal(input.task,query);
  const card=input.cards.find(card=>card.title==='От пользовательской проблемы к проверенному прототипу');
  assert.ok(card,query);
  assert.ok(card.passages.some(p=>/generate an interview guide/i.test(p.text)),query);
  const record=retrieval.candidates.find(c=>c.record.title===card.title).record;
  const source=record.sources.find(s=>s.path.endsWith('/design-thinking/SKILL.md'));
  assert.ok(source);
  assert.ok(retrieval.candidates.some(c=>c.origin==='discovery-vocabulary'));
 }
});

test('ordinary technical tasks and clear audience tasks do not activate discovery expansion',()=>{
 for(const query of [
  'Напиши тесты для обработчика',
  'Есть книга хочу по ней сделать навык',
  'Сделай презентацию для аудитории курса',
  'Клиент HTTP: не понимаю, почему сервис падает',
  'Сколько стоит готовый продукт для клиентов?',
  'The product needs user authentication',
 ]) assert.equal(discoveryQuery(query),null,query);
});

test('promoting a discovery skill retains original retrieved source evidence',async()=>{
 const entry=context.indexEntries.find(e=>e.ownerId==='design-thinking-design-thinking-cbb2e523');
 const retrieve=createHybridRetriever({catalog,projection,searchUrl:'http://127.0.0.1:1',
  embed:async()=>({vectors:[Array(1024).fill(0.01)]}),
  fetchImpl:async()=>Response.json({...identity,hits:[{id:entry.id,score:1}]}),
 });
 const retrieval=await retrieve(queries[0]);
 const promoted=retrieval.candidates.find(c=>c.id===entry.ownerId);
 assert.equal(promoted.origin,'discovery-vocabulary');
 assert.deepEqual(promoted.sourceQuotes,[entry.evidence]);
});
