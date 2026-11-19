import test from 'node:test';
import assert from 'node:assert/strict';
import {unavailableQueryReason,unavailableMessages} from './unavailable-query.mjs';
import {dialogueContract,renderDialogue} from './dialogue.mjs';

const examples=[
 ['Нужен мастер, который завтра приедет ко мне домой и починит протекающий кран.','physical-service'],
 ['Вызови электрика на дом','physical-service'],
 ['Send a plumber to repair my tap','physical-service'],
 ['Скажи точные выигрышные числа следующего тиража лотереи, чтобы я наверняка выиграл.','chance-guarantee'],
 ['Give me guaranteed winning lottery numbers','chance-guarantee'],
];
test('unavailable services and chance guarantees receive a host-owned explanation',()=>{
 const contract=dialogueContract(new Map());
 for(const [query,reason] of examples){
  assert.equal(unavailableQueryReason(query),reason);
  const choice={decision:'no-match',intent:'execute',scenarioIds:[],missingParts:[query],clarification:null};
  const output=contract.materialize({query,candidates:[]},choice);
  const answer=renderDialogue(output,new Map(),{entries:[]});
  assert.equal(answer.lead,unavailableMessages[reason]);
  assert.deepEqual(answer.items,[]);
  assert.deepEqual(answer.missingParts,[query]);
 }
});
test('advice, software, negations and latest clarification retain normal recommendation scope',()=>{
 for(const query of [
  'Как вызвать сантехника и что ему сообщить?',
  'Напиши сайт вызова сантехника на дом',
  'Нужен мастер-класс: как починить протекающий кран',
  'Покажи точные выигрышные числа прошлого тиража лотереи',
  'What were the winning lottery numbers last week?',
  'Не нужен мастер, который приедет на дом',
  'Объясни, почему нельзя гарантировать выигрыш в лотерее',
  'Как устроен случайный тираж и почему точные выигрышные числа нельзя предсказать?',
  'Do not send a plumber to repair my tap',
  'Не гарантируй выигрыш в лотерее',
  'Write a simulation of lottery winning numbers',
  'Нужен мастер, который приедет домой.\nПоследнее уточнение (при противоречии считать актуальным): Только напиши инструкцию для выбора мастера',
 ]) assert.equal(unavailableQueryReason(query),null,query);
});
test('invalid provider response is not presented as a confirmed unavailable capability',()=>{
 const answer=renderDialogue({decision:'no-match',records:[],details:[],missingParts:['мастер'],
  recoveries:['passage-format'],noMatchReason:'physical-service'},new Map(),{entries:[]});
 assert.match(answer.lead,/Не удалось подтвердить/);
});
