// Opt-in paid development evaluation; historical reports are never overwritten.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { currentCatalog } from './cli.mjs';
import { retrieve, pickerInstructions } from './search.mjs';
import { selectScenarios, SelectorError } from './selector.mjs';
import { completeRetrieval, policyMatch, validateLabels, validateLabelBinding } from './scoring.mjs';
import { digest } from './catalog.mjs';

const dir = fileURLToPath(new URL('../../docs/proposals/skill-advisor-scenarios/', import.meta.url));
const options = { suite: 'regression' };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]?.slice(2);
  if (!['--suite', '--model', '--output'].includes(args[i]) || !args[i + 1] ||
      (key !== 'suite' && options[key])) throw Error('Usage: evaluate.mjs [--suite regression|fresh|fresh3] [--model provider/model] [--output new-name.json]');
  options[key] = args[i + 1];
}
const suites = {
  regression: ['evaluation-questions.json', 'coverage-regression-v2.json'],
  fresh: ['evaluation-questions-v2.json', 'coverage-v2.json'],
  fresh3: ['evaluation-questions-v3.json', 'coverage-v3.json'],
};
if (!Object.hasOwn(suites, options.suite)) throw Error('Unknown suite');
const model = options.model ?? null;
if (model && !process.env.OPENROUTER_API_KEY) throw Error('OPENROUTER_API_KEY required');
const output = options.output ?? `iteration-2-${options.suite}-${model ? 'picker' : 'retrieval'}.json`;
if (!/^[a-z0-9][a-z0-9-]*\.json$/u.test(output)) throw Error('Output must be a simple JSON filename');
const destination = dir + output;
if (existsSync(destination)) throw Error('Report already exists; choose a new output filename');
const [questionFile, coverageFile] = suites[options.suite];
const questionsBytes = readFileSync(dir + questionFile);
const coverageBytes = readFileSync(dir + coverageFile);
const questions = JSON.parse(questionsBytes).cases;
const coverageDocument = JSON.parse(coverageBytes);
validateLabelBinding(coverageDocument, questionFile, digest(questionsBytes));
const coverage = coverageDocument.cases;
validateLabels(questions, coverage);
const catalog = currentCatalog();
if (catalog.excluded.length) throw Error('Catalog has exclusions: review before evaluating');
const available = new Set(catalog.records.map(r => r.id));
if (coverage.some(c => c.relevantScenarioIds.some(id => !available.has(id)))) throw Error('Labels reference unavailable scenario');
const rows = [];
async function evaluate(question) {
  const ground = coverage.find(item => item.id === question.id);
  const started = performance.now();
  const retrieved = retrieve(catalog, question.query);
  const retrievedIds = retrieved.candidates.map(c => c.id);
  const row = { id: question.id, query: question.query, coverage: ground.coverage,
    relevantScenarioIds: ground.relevantScenarioIds, acceptableScenarioSets: ground.acceptableScenarioSets ?? [],
    retrievedIds, retrievalMs: performance.now() - started,
    retrievedRelevant: retrievedIds.some(id => ground.relevantScenarioIds.includes(id)),
    retrievedComplete: ground.coverage === 'full' && completeRetrieval(retrievedIds, ground.acceptableScenarioSets) };
  if (!model) return row;
  const callStarted = performance.now();
  row.modelAttempted = Boolean(question.query.trim());
  try {
    const result = await selectScenarios(retrieved, { model, apiKey: process.env.OPENROUTER_API_KEY });
    row.modelCalled = result.modelCalled; row.usage = result.usage; row.actualModel = result.actualModel;
    row.choice = { decision: result.output.decision, scenarioIds: result.output.records.map(r => r.id) };
    row.valid = true;
    row.correct = policyMatch(row.choice, ground);
    row.matchesRequestedDecision = row.choice.decision === question.expectedDecision;
  } catch (error) {
    // Failure remains distinct from a semantic no-match; retain no raw provider errors/secrets.
    row.valid = false; row.correct = false; row.error = 'Picker failed or returned invalid output';
    if (error instanceof SelectorError) {
      row.errorCode = error.code; row.usage = error.usage; row.actualModel = error.actualModel;
    }
  }
  row.responseMs = performance.now() - callStarted;
  return row;
}
for (let i = 0; i < questions.length; i += 4) rows.push(...await Promise.all(questions.slice(i, i + 4).map(evaluate)));
const sourceHashes = Object.fromEntries(['evaluate.mjs', 'search.mjs', 'selector.mjs', 'scoring.mjs', 'catalog.mjs', 'cli.mjs']
  .map(name => [name, digest(readFileSync(new URL(name, import.meta.url)))]));
const report = { scope: `${options.suite} development questions; documentation snapshot; no native runtime test`,
  suite: options.suite, createdAt: new Date().toISOString(), model,
  inputs: { questionFile, questionsSha256: digest(questionsBytes), coverageFile, coverageSha256: digest(coverageBytes),
    promptSha256: digest(pickerInstructions), sourceHashes },
  catalogRevision: catalog.revision, approvedRecords: catalog.records.length, excluded: catalog.excluded,
  rows, summary: { fullCoverage: rows.filter(r => r.coverage === 'full').length,
    fullCoverageRetrieved: rows.filter(r => r.coverage === 'full' && r.retrievedComplete).length,
    correct: model ? rows.filter(r => r.correct).length : null, total: rows.length,
    modelAttempts: rows.filter(r => r.modelAttempted).length } };
writeFileSync(destination, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report.summary));
