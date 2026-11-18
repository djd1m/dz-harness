// Development-only, opt-in paid short-answer evaluation. Never overwrites evidence.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { currentCatalog } from './cli.mjs';
import { retrieve } from './search.mjs';
import { selectScenarios } from './selector.mjs';
import { approvedPresentation, answerContract, renderAnswer, answerInstructions } from './answer.mjs';
import { completeSelection } from './scoring.mjs';
import { digest } from './catalog.mjs';
const dir = fileURLToPath(new URL('../../docs/proposals/skill-advisor-scenarios/', import.meta.url));
if(process.argv[2] !== '--run' || !process.env.OPENROUTER_API_KEY) throw Error('Use --run with OPENROUTER_API_KEY');
const file=dir+'answer-results.json'; if(existsSync(file)) throw Error('Report exists');
const read=name=>JSON.parse(readFileSync(dir+name,'utf8'));
const catalog=currentCatalog(); if(catalog.excluded.length) throw Error('Catalog excluded records');
const presentation=approvedPresentation(catalog,read('presentation.json'),read('presentation-reviews.json'));
const contract=answerContract(presentation), courses=read('course-map.json');
const questions=[...read('answer-questions.json').cases,...read('answer-regression-questions.json').cases];
const rows=[];
for(let start=0;start<questions.length;start+=3){
 rows.push(...await Promise.all(questions.slice(start,start+3).map(async q=>{
  const begin=performance.now(),retrieval=retrieve(catalog,q.query);
  const row={id:q.id,query:q.query,expectedDecision:q.expectedDecision,retrievedIds:retrieval.candidates.map(c=>c.id)};
  try{
   const result=await selectScenarios(retrieval,{model:'anthropic/claude-haiku-5.5',apiKey:process.env.OPENROUTER_API_KEY,contract});
   row.usage=result.usage; row.actualModel=result.actualModel;
   row.choice={decision:result.output.decision,intent:result.output.intent,scenarioIds:result.output.records.map(r=>r.id),forcedPartial:result.output.forcedPartial};
   row.answer=renderAnswer(result.output,presentation,courses);row.valid=true;
   row.correct=row.choice.decision===q.expectedDecision &&
    (['partial','recommend'].includes(q.expectedDecision)?completeSelection(row.choice.scenarioIds,q.acceptableScenarioSets):!row.choice.scenarioIds.length);
  }catch(e){row.valid=false;row.correct=false;row.error='Answer failed';row.usage=e.usage;}
  row.responseMs=performance.now()-begin;return row;
 })));
}
const inputs=Object.fromEntries(['answer-questions.json','answer-regression-questions.json','presentation.json','presentation-reviews.json','course-map.json'].map(n=>[n,digest(readFileSync(dir+n))]));
const code=Object.fromEntries(['answer.mjs','selector.mjs','search.mjs','answer-evaluate.mjs','scoring.mjs','catalog.mjs','cli.mjs','../../packages/harness-core/dist/stem.js'].map(n=>[n,digest(readFileSync(new URL(n,import.meta.url)))]));
const report={scope:'Development cases; last two are previous regression questions; no native runtime or website rollout',inputs,code,promptSha256:digest(answerInstructions),catalogRevision:catalog.revision,rows};
writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({correct:rows.filter(r=>r.correct).length,total:rows.length,valid:rows.filter(r=>r.valid).length}));
