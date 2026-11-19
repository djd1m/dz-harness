import {maxDetails} from './answer-details.mjs';

/** Request-scoped vocabulary. The host still validates provenance and semantic coverage. */
export function compactResponseSchema(input) {
 const references=['ctx',...input.cards.flatMap(card=>card.passages.map(passage=>passage.id))];
 return {
  type:'object',additionalProperties:false,required:['i','m','x','ask'],
  properties:{
   i:{type:'string',enum:['plan','execute','learn','analyze']},
   m:{type:'array',maxItems:6,items:{
    type:'object',additionalProperties:false,required:['r','p'],
    properties:{
     r:{type:'string',enum:input.requirements.map(requirement=>requirement.id)},
     p:{type:'array',minItems:1,maxItems:maxDetails,items:{anyOf:[
      {type:'string',enum:references},{type:'null'},
     ]}},
    },
   }},
   x:{type:'array',maxItems:3,items:{type:'string'}},
   ask:{anyOf:[{type:'string',enum:['task-object','desired-result','constraints']},{type:'null'}]},
  },
 };
}
