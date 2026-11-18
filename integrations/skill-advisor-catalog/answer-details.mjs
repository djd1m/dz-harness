import {ChoiceError} from './choice-error.mjs';
const maxDetails = 3;
const minQuoteLength = 20;
const maxQuoteLength = 220;

/** Validate short, verbatim excerpts against the reviewed material supplied for the chosen card. */
export function validateAnswerDetails(retrieval, choice, sourceContext) {
 if (choice.details === undefined) return [];
 if (!Array.isArray(choice.details) || choice.details.length > maxDetails) throw new ChoiceError('detail-shape','Invalid answer details');
 const actions = retrieval.actions ?? [];
 const seen = new Set();
 return choice.details.map(detail => {
  const candidate = detail && retrieval.candidates.find(hit => hit.id === detail.scenarioId);
  if (!candidate || !choice.scenarioIds.includes(candidate.id)) throw new ChoiceError('detail-binding','Unknown answer detail scenario');
  if (actions.length ? !(Array.isArray(choice.coverage) && choice.coverage.some(row =>
   row && row.actionId === detail.actionId && row.scenarioId === candidate.id) &&
   actions.some(action => action.id === detail.actionId)) : detail.actionId !== null) {
   throw new ChoiceError('detail-binding','Unbound answer detail action');
  }
  const key = detail.actionId ?? candidate.id;
  if (seen.has(key)) throw new ChoiceError('detail-binding','Duplicate answer detail');
  seen.add(key);
  const quote = detail.quote;
  if (typeof quote !== 'string' || quote !== quote.trim() || quote.length < minQuoteLength ||
      quote.length > maxQuoteLength || !/\p{L}/u.test(quote)) {
   throw new ChoiceError('detail-quote','Invalid answer detail quote');
  }
  const witnesses = [...(candidate.record.evidence ?? []),
   ...(sourceContext ? sourceContext(candidate.id,retrieval.query,candidate.sourceQuotes ?? []) : [])];
  if (!witnesses.some(witness => witness.quote.includes(quote))) throw new ChoiceError('detail-quote','Unbound answer detail quote');
  return {scenarioId:candidate.id,actionId:detail.actionId,quote};
 });
}
