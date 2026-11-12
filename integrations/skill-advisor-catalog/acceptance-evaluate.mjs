// Development-only, opt-in paid short-answer evaluation. Never overwrites evidence.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { currentCatalog } from './cli.mjs';
import { retrieve } from './search.mjs';
import { selectScenarios } from './selector.mjs';
import { approvedPresentation } from './answer.mjs';
import { dialogueContract, renderDialogue, dialogueInstructions } from './dialogue.mjs';
import { completeSelection } from './scoring.mjs';
import { digest } from './catalog.mjs';
const dir = fileURLToPath(new URL('../../docs/proposals/skill-advisor-scenarios/', import.meta.url));
if(process.argv[2] !== '--run' || !process.env.OPENROUTER_API_KEY) throw Error('Use --run with OPENROUTER_API_KEY');
const file=dir+'acceptance-8h-results.json'; if(existsSync(file)) throw Error('Report exists');
const read=name=>JSON.parse(readFileSync(dir+name,'utf8'));
const catalog=currentCatalog(); if(catalog.excluded.length) throw Error('Catalog excluded records');
const presentation=approvedPresentation(catalog,read('presentation.json'),read('presentation-reviews.json'));
const contract=dialogueContract(presentation), courses=read('course-map.json');
const questions=read('acceptance-8h-questions.json').cases;
if(digest(readFileSync(dir+'acceptance-8h-questions.json'))!=='949550ca28ed66aa2e567e35526f9a8a7a55feab6a50203b15ff2ba6cae65847')throw Error('Frozen questions changed');
const rows=[];
for(let start=0;start<questions.length;start+=3){
 rows.push(...await Promise.all(questions.slice(start,start+3).map(async q=>{
  const begin=performance.now(),retrieval=retrieve(catalog,q.query);
  const row={id:q.id,query:q.query,expectedDecision:q.expectedDecision,retrievedIds:retrieval.candidates.map(c=>c.id)};
  try{
   const result=await selectScenarios(retrieval,{model:'anthropic/claude-haiku-5.5',apiKey:process.env.OPENROUTER_API_KEY,contract});
   row.usage=result.usage; row.actualModel=result.actualModel;
   row.choice={decision:result.output.decision,intent:result.output.intent,scenarioIds:result.output.records.map(r=>r.id),forcedPartial:result.output.forcedPartial,missingParts:result.output.missingParts,clarification:result.output.clarification};
   row.answer=renderDialogue(result.output,presentation,courses);row.valid=true;
   row.correct=row.choice.decision===q.expectedDecision &&
    (['partial','recommend'].includes(q.expectedDecision)?completeSelection(row.choice.scenarioIds,q.acceptableScenarioSets):!row.choice.scenarioIds.length);
  }catch(e){row.valid=false;row.correct=false;row.error='Answer failed';row.usage=e.usage;}
  row.responseMs=performance.now()-begin;return row;
 })));
}
const inputs=Object.fromEntries(['acceptance-8h-questions.json','presentation.json','presentation-reviews.json','course-map.json'].map(n=>[n,digest(readFileSync(dir+n))]));
const code=Object.fromEntries(['answer.mjs','selector.mjs','search.mjs','acceptance-evaluate.mjs','dialogue.mjs','scoring.mjs','catalog.mjs','cli.mjs','../../packages/harness-core/dist/stem.js'].map(n=>[n,digest(readFileSync(new URL(n,import.meta.url)))]));
const report={scope:'24 frozen development cases including three dependent clarification pairs; missing-parts meaning needs independent semantic audit; no website rollout',inputs,code,promptSha256:digest(dialogueInstructions),catalogRevision:catalog.revision,rows};
writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({correct:rows.filter(r=>r.correct).length,total:rows.length,valid:rows.filter(r=>r.valid).length}));
