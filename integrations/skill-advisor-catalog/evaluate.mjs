// Opt-in paid development evaluation. No provider call without --model.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { currentCatalog } from './cli.mjs';
import { retrieve, pickerInput, pickerInstructions, materialize } from './search.mjs';

const dir = fileURLToPath(new URL('../../docs/proposals/skill-advisor-scenarios/', import.meta.url));
const questions = JSON.parse(readFileSync(dir + 'evaluation-questions.json', 'utf8')).cases;
const coverage = JSON.parse(readFileSync(dir + 'coverage.json', 'utf8')).cases;
const model = process.argv[2] === '--model' ? process.argv[3] : null;
if (process.argv.length > 2 && !model) throw Error('Usage: node evaluate.mjs [--model <provider/model>]');
if (model && !process.env.OPENROUTER_API_KEY) throw Error('OPENROUTER_API_KEY required');
const catalog = currentCatalog();
const rows = [];
async function evaluate(question) {
  const ground = coverage.find(item => item.id === question.id);
  if (!ground) throw Error('Missing independent coverage adjudication');
  const started = performance.now();
  const retrieved = retrieve(catalog, question.query);
  const row = { id: question.id, query: question.query, coverage: ground.coverage,
    relevantScenarioIds: ground.relevantScenarioIds,
    retrievedIds: retrieved.candidates.map(c => c.id), retrievalMs: performance.now() - started,
    retrievedRelevant: retrieved.candidates.some(c => ground.relevantScenarioIds.includes(c.id)) };
  if (!model) return row;
  const callStarted = performance.now();
  try {
    let choice;
    if (!retrieved.candidates.length) choice = { decision: retrieved.decision, scenarioIds: [] };
    else {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(60000),
        headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, temperature: 0, max_tokens: 400,
          messages: [{ role: 'system', content: pickerInstructions }, { role: 'user', content: JSON.stringify(pickerInput(retrieved)) }] }),
      });
      if (!response.ok) throw Error(`Provider HTTP ${response.status}`);
      const body = await response.json();
      row.usage = body.usage; row.actualModel = body.model;
      if (body.choices?.[0]?.finish_reason !== 'stop') throw Error('Incomplete completion');
      const content = body.choices[0].message.content;
      choice = JSON.parse(content.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, ''));
    }
    const output = materialize(retrieved, choice);
    row.choice = { decision: output.decision, scenarioIds: output.records.map(r => r.id) };
    row.valid = true;
    row.correct = ground.coverage === 'full'
      ? output.decision === 'recommend' && output.records.every(r => ground.relevantScenarioIds.includes(r.id))
      : ground.coverage === 'clarify' ? output.decision === 'clarify'
        : ground.coverage === 'no-match' ? output.decision === 'no-match'
          : ['clarify', 'no-match'].includes(output.decision);
  } catch (error) {
    // Do not retain raw provider output or exception contents that could include secrets.
    row.valid = false; row.correct = false; row.error = 'Picker failed or returned invalid output';
  }
  row.responseMs = performance.now() - callStarted;
  return row;
}
for (let i = 0; i < questions.length; i += 4) rows.push(...await Promise.all(questions.slice(i, i + 4).map(evaluate)));
const report = { scope: 'Developer-heldout questions; historical local package snapshot; no native runtime test',
  model, catalogRevision: catalog.revision, approvedRecords: catalog.records.length, excluded: catalog.excluded,
  rows, summary: { fullCoverage: rows.filter(r => r.coverage === 'full').length,
    fullCoverageRetrieved: rows.filter(r => r.coverage === 'full' && r.retrievedRelevant).length,
    correct: model ? rows.filter(r => r.correct).length : null, total: rows.length } };
writeFileSync(dir + (model ? 'cheap-picker-results.json' : 'retrieval-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
