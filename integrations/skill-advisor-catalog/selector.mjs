import { pickerInput, pickerInstructions, materialize } from './search.mjs';

// The output budget also includes provider reasoning tokens; 400 truncated live JSON.
export const MAX_OUTPUT_TOKENS = 1200;
export class SelectorError extends Error {
  constructor(code, body) {
    super(code); this.code = code; this.usage = body?.usage; this.actualModel = body?.model;
  }
}

/** Empty search is not a semantic classification. Only blank input bypasses the model. */
export async function selectScenarios(retrieval, { model, apiKey, fetchImpl = fetch,
  contract = { instructions: pickerInstructions, input: pickerInput, materialize } }) {
  if (!retrieval.query.trim()) {
    return { output: contract.materialize(retrieval, { decision: 'clarify', intent: 'learn', scenarioIds: [] }), modelCalled: false };
  }
  if (!model || !apiKey) throw Error('Model and provider credential required');
  const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: 'system', content: contract.instructions },
        { role: 'user', content: JSON.stringify(contract.input(retrieval)) }] }),
  });
  if (!response.ok) throw new SelectorError('provider-http-error');
  const body = await response.json();
  if (body.choices?.[0]?.finish_reason !== 'stop') throw new SelectorError('incomplete-completion', body);
  const content = body.choices[0].message?.content;
  if (typeof content !== 'string') throw new SelectorError('invalid-json', body);
  let choice;
  try { choice = JSON.parse(content.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')); }
  catch { throw new SelectorError('invalid-json', body); }
  let output;
  try { output = contract.materialize(retrieval, choice); }
  catch { throw new SelectorError('invalid-choice', body); }
  return { output, modelCalled: true, usage: body.usage, actualModel: body.model };
}
