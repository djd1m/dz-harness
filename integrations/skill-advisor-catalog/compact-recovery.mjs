import {ChoiceError} from './choice-error.mjs';
import {supportsActionCard} from './action-coverage.mjs';

const aliasPattern=/^c[1-9][0-9]?p[1-9][0-9]?$/u;
export const recoveryReasons=Object.freeze([
 'passage-format','passage-unissued','passage-duplicate','manual-scope','card-eligibility','scope-conflict',
]);

function uncoveredScope(text,gaps) {
 return gaps.reduce((parts,gap)=>parts.flatMap(part=>part.split(gap)),[text])
  .map(part=>part.trim()).sort((a,b)=>b.length-a.length)[0];
}

/** Recover only a uniquely identified requirement row. Other rows must validate independently. */
export function bindCompactRows(retrieval, requirements, mappings, extra, input) {
 const expected=new Map(requirements.map(slot=>[slot.id,slot]));
 const relevantGaps=extra.filter(gap=>retrieval.query.indexOf(gap)===retrieval.query.lastIndexOf(gap));
 const passages=new Map(input.cards.flatMap((card,index)=>card.passages.map(p=>[p.id,retrieval.candidates[index]])));
 const details=[], gaps=[...extra], coverage=[], recoveries=[];
 for(const mapping of mappings) {
  if (!Array.isArray(mapping) || !expected.has(mapping[0])) {
   throw new ChoiceError('detail-requirement','Invalid compact requirement');
  }
  const slot=expected.get(mapping[0]);
  expected.delete(slot.id);
  const [, ...aliases]=mapping;
  if (aliases.length===1 && aliases[0]==='ctx' && !slot.actionId && !slot.manual) continue;
  const omitted=aliases.length===1 && aliases[0]===null;
  const action=retrieval.actions?.find(item=>item.id===slot.actionId);
  const requirement=uncoveredScope(slot.text,relevantGaps);
  let recovery=null;
  if (!omitted) {
   if (slot.manual) recovery='manual-scope';
   else if (aliases.length<1 || aliases.length>3 || aliases.some(alias=>typeof alias!=='string'||!aliasPattern.test(alias))) recovery='passage-format';
   else if (new Set(aliases).size!==aliases.length) recovery='passage-duplicate';
   else if (aliases.some(alias=>!passages.has(alias))) recovery='passage-unissued';
   else if (action && aliases.some(alias=>!supportsActionCard(action,passages.get(alias),true))) recovery='card-eligibility';
   else if (requirement.length<3) recovery='scope-conflict';
  }

  if (omitted || recovery) {
   gaps.push(slot.text);
   if (slot.actionId) coverage.push({actionId:slot.actionId,scenarioId:null});
   if (recovery) recoveries.push(recovery);
   continue;
  }

  const cardIds=new Set();
  for (const passageId of aliases) {
   const {id:scenarioId}=passages.get(passageId);
   details.push({scenarioId,actionId:slot.actionId,requirement,passageId});
   cardIds.add(scenarioId);
  }
  if (slot.actionId) coverage.push({actionId:slot.actionId,scenarioIds:[...cardIds]});
 }
 const missingParts=[...new Set(gaps)].filter(gap=>!gaps.some(other=>other!==gap&&other.includes(gap)));
 return {details,missingParts,coverage,recoveries};
}
