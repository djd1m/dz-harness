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
  'Create tests for a website', 'Напиши тесты для backend API', 'Реализуй тесты для backend API',
  'Не реализуй backend, только объясни варианты', 'Do not develop the backend, explain the options',
  'Develop tests for a backend API', 'Do not code the backend',
  'Хочу создать сайт. Не делай сайт, только объясни варианты',
  'Хочу создать сайт. Не разрабатывай сайт, только объясни варианты',
 ]) assert.equal(implementationQuery(query),null,query);
});
test('getting started refines the task and does not become a separate adviser requirement',()=>{
 const query='Надо написать тесты для нового обработчика. С чего начать?';
 const requirements=compactRequirements({query,candidates:[]});
 assert.deepEqual(requirements.map(r=>r.text),['Надо написать тесты для нового обработчика.']);
 assert.deepEqual(compactRequirements({query:'С чего начать?',candidates:[]}).map(r=>r.text),['С чего начать?']);
});

const flowerTask='Хочу сделать сайт для службы доставки цветов: каталог, оформление заказа и уведомления. Сами цветы доставляют курьеры.';
const backendFollowup='а если мне нужен бэкенд, а не только фронтенд?';
const marker='\nПоследнее уточнение (при противоречии считать актуальным): ';

test('backend requests retrieve a development workflow, not only a visual skill',async()=>{
 const retrieve=createHybridRetriever({catalog,projection,searchUrl:'http://127.0.0.1:1',
  embed:async()=>({vectors:[Array(1024).fill(0.01)]}),fetchImpl:async()=>Response.json({...identity,hits:[]})});
 for(const query of [flowerTask+marker+backendFollowup,
  flowerTask+'\nПредыдущее уточнение 1: '+backendFollowup+marker+'какой скилл мне использовать чтобы это все закодить?',
  'Нужно разработать backend API для приложения с базой данных.',
  'Build a full-stack app with a backend and API.',
 ]){
  const result=await retrieve(query);
  const pipeline=result.candidates.find(c=>c.record.skillIds?.includes('feature-adr'));
  assert.ok(pipeline,query);
  assert.equal(pipeline.record.package.name,'@dzhechkov/skills-feature-adr');
  const input=compactDialogueContract(new Map(),context).input(result);
  const card=input.cards.find(c=>c.package===pipeline.record.package.name && c.title===pipeline.record.title);
  assert.ok(card.passages.some(p=>/implementation|реализац|development pipeline/iu.test(p.text)),query);
 }
});

test('latest frontend-only clarification does not retain an old backend expansion',()=>{
 const query=flowerTask+'\nПредыдущее уточнение 1: '+backendFollowup+marker+'Теперь только фронтенд, без бэкенда.';
 assert.ok(implementationQuery(query));
 assert.doesNotMatch(implementationQuery(query),/backend|fullstack|development pipeline/iu);
});

test('coding meta-question refines existing task without an extra evidence obligation',()=>{
 const query=flowerTask+'\nПредыдущее уточнение 1: '+backendFollowup+marker+'какой скилл мне использовать чтобы это все закодить?';
 const requirements=compactRequirements({query,candidates:[]});
 assert.ok(requirements.some(r=>r.text.includes('бэкенд')));
 assert.ok(!requirements.some(r=>r.text.includes('какой скилл')));
 assert.ok(!requirements.some(r=>/^не только фронтенд/u.test(r.text)));
 assert.deepEqual(compactRequirements({query:'Какой скилл мне использовать?',candidates:[]}).map(r=>r.text),['Какой скилл мне использовать?']);
});

test('a newer implementation request can supersede earlier frontend-only or negative scope',()=>{
 for(const prior of ['Только фронтенд, без бэкенда.','Не реализуй backend, только объясни варианты.']) {
  const query=flowerTask+'\nПредыдущее уточнение 1: '+prior+marker+'Передумал: реализуй приложение целиком, с backend.';
  assert.match(implementationQuery(query),/development pipeline/u);
 }
});
