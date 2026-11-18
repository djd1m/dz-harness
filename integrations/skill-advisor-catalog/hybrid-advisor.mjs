import {createEmbeddingClient} from '../hybrid-retrieval/openrouter.mjs';
import {currentCatalog} from './cli.mjs';
import {buildSourceProjection,advisorDocuments} from './source-projection.mjs';
import {buildSourceContext} from './source-context.mjs';
export {advisorDocuments};
import {groupPackageCandidates,rawCandidateLimit} from './package-retrieval.mjs';
import {retainActionCandidates} from './action-coverage.mjs';
import {liveAnswer} from './preview-server.mjs';
import {recordHash} from './catalog.mjs';
import {stems} from '../../packages/harness-core/dist/stem.js';

export const advisorLexicalizerId='dz-ru-en-stems-v1';
export const advisorLexicalize=text=>stems(text).join(' ');

export function advisorIdentity(catalog,documents=advisorDocuments(catalog)){return {revision:recordHash({catalog:catalog.revision,documents}),model:'baai/bge-m3',dimensions:1024,lexicalizerId:advisorLexicalizerId};}
const integrity=()=>Object.assign(Error('search-integrity'),{code:'search-integrity'});
function assertIdentity(actual,expected){if(Object.entries(expected).some(([k,v])=>actual?.[k]!==v))throw integrity();}
async function readSearchBody(response,maximum){const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>maximum)throw integrity();chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks).toString('utf8');}
const unavailable=code=>Object.assign(Error(code),{code});
const fallbackCodes=new Set(['embedding-timeout','embedding-unavailable','search-timeout','search-unavailable']);

/** Host alone attaches approved records; remote search never supplies prose/courses. */
export function createHybridRetriever({catalog,searchUrl,embed,fetchImpl=fetch,onEvent=()=>{},searchTimeoutMs=2000,projection=buildSourceProjection(catalog)}){
 const url=new URL(searchUrl);if(url.protocol!=='http:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error('Private search HTTP base URL required');
 if(!Number.isInteger(searchTimeoutMs)||searchTimeoutMs<1||searchTimeoutMs>10000)throw Error('Invalid search timeout');
 const identity=advisorIdentity(catalog,projection.documents);
 const group = (query, hits) => {
  const raw = hits.map(hit=>projection.resolve(hit));
  return retainActionCandidates(query,groupPackageCandidates(catalog,raw,query,projection.clauseSearch),raw,projection.clauseSearch);
 };
 return async query=>{
  if(typeof query!=='string'||!query.trim()||query.length>6000)throw Error('Invalid query');
  try{
   const encoded=await embed([query]);
   const vector=encoded.vectors?.[0];
   if(!Array.isArray(vector)||vector.length!==identity.dimensions||vector.some(x=>!Number.isFinite(x))||!vector.some(x=>x!==0))throw integrity();
   onEvent({event:'advisor.embedding',usage:encoded.usage??null});
   const deadline=AbortSignal.timeout(searchTimeoutMs);let response;
   try{response=await fetchImpl(new URL('/search',url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,vector,...identity,limit:rawCandidateLimit}),signal:deadline,redirect:'error'});}
   catch{throw unavailable(deadline.aborted?'search-timeout':'search-unavailable');}
   if(!response.ok){
    // A detected integrity failure cannot become availability fallback even behind a faulty proxy status.
    let code;try{code=JSON.parse(await readSearchBody(response,4096)).error;}catch(e){if(e.code==='search-integrity')throw e;}
    if(['SNAPSHOT_CORRUPT','IDENTITY_MISMATCH','INVALID_VECTOR','INVALID_QUERY'].includes(code))throw integrity();
    if(response.status>=500||response.status===429)throw unavailable('search-unavailable');throw integrity();
   }
   let result;
   try{
    result=JSON.parse(await readSearchBody(response,64000));
   }catch{if(deadline.aborted)throw unavailable('search-timeout');throw integrity();}
   assertIdentity(result,identity);
   if(!Array.isArray(result.hits)||result.hits.length>rawCandidateLimit||result.hits.some(h=>!h||typeof h.id!=='string')||new Set(result.hits.map(h=>h.id)).size!==result.hits.length||result.hits.some(h=>!projection.has(h.id)||!Number.isFinite(h.score)))throw integrity();
   const grouped=group(query,result.hits);
   return {query,revision:catalog.revision,decision:grouped.candidates.length?'candidates':'no-match',candidates:grouped.candidates,actions:grouped.actions,actionOverflow:grouped.actionOverflow,actionListIncomplete:grouped.actionListIncomplete,meta:{mode:'hybrid',...identity,...grouped.diagnostics},trace:result.hits.map((hit,index)=>({rawRank:index+1,documentId:hit.id,ownerId:projection.resolve(hit).id,package:projection.resolve(hit).record.package.name,score:hit.score}))};
  }catch(e){
   if(!fallbackCodes.has(e.code))throw e;
   onEvent({event:'advisor.retrieval_fallback',code:e.code});
   const lexical=projection.lexicalSearch(query,rawCandidateLimit),grouped=group(query,lexical.hits);
   return {query,decision:grouped.candidates.length?'candidates':lexical.decision,revision:catalog.revision,candidates:grouped.candidates,actions:grouped.actions,actionOverflow:grouped.actionOverflow,actionListIncomplete:grouped.actionListIncomplete,meta:{mode:'lexical',revision:catalog.revision,reason:e.code,...grouped.diagnostics}};
  }
 };
}
export async function createHybridAnswer({apiKey,searchUrl,onEvent=()=>{}}){
 const catalog=currentCatalog();if(catalog.excluded.length)throw Error('Catalog exclusions');
 const context=buildSourceContext(catalog),projection=buildSourceProjection(catalog,context);
 const client=createEmbeddingClient({apiKey,...advisorIdentity(catalog,projection.documents),responseModelIds:['baai/bge-m3','parasail-bge-m3']});
 const retriever=createHybridRetriever({catalog,searchUrl,embed:client.embed,onEvent,projection});
 return liveAnswer(apiKey,{catalog,retriever,sourceContext:context});
}
