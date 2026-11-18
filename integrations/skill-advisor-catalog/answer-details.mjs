import {ChoiceError} from './choice-error.mjs';
import {directlyPhysical} from './action-coverage.mjs';
import {stems} from '../../packages/harness-core/dist/stem.js';

const maxDetails = 6;
const maxPassages = 12;
const maxPassageLength = 240;
const meaningful = text => /\p{L}/u.test(text) && text.length >= 20;

/** Short literal passages. Keep small paragraphs (including lists) together. */
export function splitPassages(text) {
 const passages = [];
 for (const block of text.split(/\r?\n[ \t]*\r?\n/u)) {
  if (block.trim().length <= maxPassageLength) {
   if (meaningful(block.trim())) passages.push(block.trim());
   continue;
  }
  for (let line of block.split(/\r?\n/u).map(line=>line.trim())) {
   while (line.length > maxPassageLength) {
    const prefix = line.slice(0,maxPassageLength+1);
    const boundary = Math.max(prefix.lastIndexOf('. ')+1,prefix.lastIndexOf('; ')+1);
    const end = boundary >= 80 ? boundary : prefix.lastIndexOf(' ');
    const stop = end >= 20 && end <= maxPassageLength ? end : maxPassageLength;
    const passage = line.slice(0,stop).trimEnd();
    if (meaningful(passage)) passages.push(passage);
    line = line.slice(stop).trimStart();
   }
   if (meaningful(line)) passages.push(line);
  }
 }
 return [...new Set(passages)];
}

export const evidenceTerms = text => new Set(stems(text).filter(token=>token.length>=3));

/** All IDs are scoped to the exact candidate order and passages supplied for this request. */
export function answerPassages(retrieval, sourceContext) {
 const actions = (retrieval.actions ?? []).filter(action=>!directlyPhysical.test(action.text)).map(action=>action.text);
 const scope = actions.length ? actions.join('\n') : retrieval.query;
 const prompts = [scope,...actions,
  ...scope.split(/[,;\n]|\s+(?:and|а\s+также|затем)\s+/iu).filter(text=>text.trim().length>=12).slice(0,4)];
 return retrieval.candidates.map((candidate,index)=>{
  const {record} = candidate;
  const matchedWindows = candidate.sourceQuotes ?? [];
  const snippets = sourceContext?.rankPassages?.(candidate.id,prompts) ?? [];
  const windows = typeof sourceContext === 'function' ? sourceContext(candidate.id,scope,matchedWindows) : [];
  const reviewed = (record.evidence ?? []).flatMap(witness=>splitPassages(witness.quote));
  const selected = [...new Set([...snippets.slice(0,8),...reviewed.slice(0,2),
   ...windows.flatMap(witness=>splitPassages(witness.quote)),...snippets.slice(8)])].slice(0,maxPassages);
  return selected.map((text,position)=>({id:`c${index+1}p${position+1}`,text}));
 });
}

export function validateAnswerDetails(retrieval, choice, passages) {
 if (choice.details === undefined && !choice.scenarioIds.length) return [];
 if (!Array.isArray(choice.details) || choice.details.length > maxDetails) {
  throw new ChoiceError('detail-shape','Invalid answer details');
 }
 const actions = retrieval.actions ?? [];
 const seen = new Set();
 const selected = new Set(choice.scenarioIds);
 const details = choice.details.map(detail=>{
  const index = detail && retrieval.candidates.findIndex(hit=>hit.id===detail.scenarioId);
  if (typeof index !== 'number' || index < 0 || !selected.has(detail.scenarioId)) {
   throw new ChoiceError('detail-binding','Unknown answer detail scenario');
  }
  const action = actions.find(item=>item.id===detail.actionId);
  if (actions.length ? !(action && Array.isArray(choice.coverage) && choice.coverage.some(row=>
   row && row.actionId===action.id && row.scenarioId===detail.scenarioId)) : detail.actionId!==null) {
   throw new ChoiceError('detail-binding','Unbound answer detail action');
  }
  const task = detail.requirement;
  const passage = passages[index].find(item=>item.id===detail.passageId);
  if (!passage) throw new ChoiceError('detail-passage','Unknown answer passage');
  const key=JSON.stringify([detail.actionId,passage.id,task]);
  if (typeof task!=='string' || task!==task.trim() || task.length<3 || task.length>160 ||
      !(action?.text ?? retrieval.query).includes(task) || seen.has(key)) {
   throw new ChoiceError('detail-requirement','Invalid or repeated detail requirement');
  }
  seen.add(key);
  return {scenarioId:detail.scenarioId,actionId:detail.actionId,requirement:task,quote:passage.text};
 });
 if ([...selected].some(id=>!details.some(detail=>detail.scenarioId===id)) ||
     (choice.coverage ?? []).some(row=>row?.scenarioId && !details.some(detail=>detail.actionId===row.actionId))) {
  throw new ChoiceError('detail-requirement','Selected scope lacks a documented requirement');
 }
 return details;
}


/** Only a unique occurrence in the original task identifies an unambiguous conflict. */
export function validateDetailGaps(query,details,gaps) {
 for (const {requirement} of details) {
  for (const gap of gaps) {
   const overlap = requirement.includes(gap) ? gap : gap.includes(requirement) ? requirement : null;
   if (overlap && query.indexOf(overlap)===query.lastIndexOf(overlap)) {
    throw new ChoiceError('detail-requirement','Requirement also listed as missing');
   }
  }
 }
}
