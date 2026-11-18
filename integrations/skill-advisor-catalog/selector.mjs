import {ChoiceError} from './choice-error.mjs';
import {readOpenRouterBudgetFailure} from '../hybrid-retrieval/openrouter.mjs';
import { pickerInput, pickerInstructions, materialize } from './search.mjs';

// The output budget also includes provider reasoning tokens; 400 truncated live JSON.
export const MAX_OUTPUT_TOKENS = 1800;
export class SelectorError extends Error {
  constructor(code, body, httpStatus) {
    super(code); this.code = code; this.usage = body?.usage; this.actualModel = body?.model; if(Number.isInteger(httpStatus))this.httpStatus=httpStatus;
  }
}

/** Empty search is not a semantic classification. Only blank input bypasses the model. */
export async function selectScenarios(retrieval, { model, apiKey, fetchImpl = fetch,
  contract = { instructions: pickerInstructions, input: pickerInput, materialize } }) {
  const preflight = contract.preflight?.(retrieval);
  if (preflight) return {output:preflight,modelCalled:false};
  if (!retrieval.query.trim()) {
    return { output: contract.materialize(retrieval, { decision: 'clarify', intent: 'learn', scenarioIds: [], missingParts: [], clarification: 'task-object' }), modelCalled: false };
  }
  if (!model || !apiKey) throw Error('Model and provider credential required');
  const input = contract.input(retrieval);
  const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: 'system', content: contract.instructions },
        { role: 'user', content: JSON.stringify(input) }] }),
  });
  if (!response.ok) { const spend=await readOpenRouterBudgetFailure(response); if(spend)throw new SelectorError(spend.code,undefined,spend.httpStatus);throw new SelectorError('provider-http-error',undefined,response.status); }
  const body = await response.json();
  if (body.choices?.[0]?.finish_reason !== 'stop') throw new SelectorError('incomplete-completion', body);
  const content = body.choices[0].message?.content;
  if (typeof content !== 'string') throw new SelectorError('invalid-json', body);
  let choice;
  try { choice = JSON.parse(content.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')); }
  catch { throw new SelectorError('invalid-json', body); }
  let output;
  try { output = contract.materialize(retrieval, choice, input); }
  catch (error) {
    if (!(error instanceof ChoiceError)) throw error;
    const rejection = new SelectorError('invalid-choice', body);
    rejection.choiceReason = error.reason;
    throw rejection;
  }
  return { output, modelCalled: true, usage: body.usage, actualModel: body.model };
}
