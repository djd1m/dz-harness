/** Optional provider adapter: core snapshot module never needs a credential. */
export class EmbeddingError extends Error {
 constructor(code,receipt={}){super(code);this.code=code;this.usage=receipt.usage;this.actualModel=receipt.actualModel;if(Number.isInteger(receipt.httpStatus))this.httpStatus=receipt.httpStatus;}
}
/** Read only bounded spend-denial metadata. A402is not itself a weekly-exhaustion proof. */
export async function readOpenRouterBudgetFailure(response){
 if(![402,403].includes(response.status))return null;
 let body;
 try{const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>8192)throw Error('limit');chunks.push(Buffer.from(chunk));}body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{}
 const source=body?.error?.metadata?.limit_source;
 if(response.status===403&&!['openrouter_key_limit','openrouter_guardrail_budget','openrouter_workspace_budget'].includes(source))return null;
 return {code:'provider-spend-denied',httpStatus:response.status};
}
const sanitizeUsage=usage=>usage&&typeof usage==='object'?{prompt_tokens:Number.isSafeInteger(usage.prompt_tokens)&&usage.prompt_tokens>=0?usage.prompt_tokens:null,total_tokens:Number.isSafeInteger(usage.total_tokens)&&usage.total_tokens>=0?usage.total_tokens:null,cost:Number.isFinite(usage.cost)&&usage.cost>=0?usage.cost:null}:null;
export function createEmbeddingClient({apiKey,model='baai/bge-m3',dimensions=1024,fetchImpl=fetch,timeoutMs=5000,responseModelIds=[model]}){
 if(typeof apiKey!=='string'||!apiKey||typeof model!=='string'||!model||!Number.isInteger(dimensions)||dimensions<1||dimensions>8192||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new EmbeddingError('embedding-config');
 if(!Array.isArray(responseModelIds)||!responseModelIds.length||responseModelIds.some(id=>typeof id!=='string'||!id||id.length>256))throw new EmbeddingError('embedding-config');
 const accepted=new Set(responseModelIds.map(id=>id.toLowerCase()));
 return {model,dimensions,async embed(texts,{signal}={}){
  if(!Array.isArray(texts)||texts.length<1||texts.length>32||texts.some(t=>typeof t!=='string'||!t.trim()||t.length>16000))throw new EmbeddingError('embedding-input');
  const deadline=AbortSignal.timeout(timeoutMs),combined=signal?AbortSignal.any([signal,deadline]):deadline;
  let response;
  try{response=await fetchImpl('https://openrouter.ai/api/v1/embeddings',{
   method:'POST',signal:combined,redirect:'error',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},
   body:JSON.stringify({model,input:texts,encoding_format:'float'}),
  });}catch(e){if(signal?.aborted)throw e;throw new EmbeddingError(deadline.aborted?'embedding-timeout':'embedding-unavailable');}
  if(!response.ok){const spend=await readOpenRouterBudgetFailure(response);if(spend)throw new EmbeddingError(spend.code,{httpStatus:spend.httpStatus});throw new EmbeddingError(response.status===429||response.status>=500?'embedding-unavailable':'embedding-rejected',{httpStatus:response.status});}
  let body;
  try{
   const chunks=[];let size=0;const maximum=texts.length*dimensions*32+32768;
   for await(const chunk of response.body){size+=chunk.length;if(size>maximum)throw new EmbeddingError('embedding-response');chunks.push(Buffer.from(chunk));}
   body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch(e){if(signal?.aborted)throw e;if(e instanceof EmbeddingError)throw e;throw new EmbeddingError(deadline.aborted?'embedding-timeout':'embedding-response');}
  if(!body||!Array.isArray(body.data)||body.data.length!==texts.length||body.data.some(d=>!d||!Number.isSafeInteger(d.index)))throw new EmbeddingError('embedding-response');
  const ordered=[...body.data].sort((a,b)=>a.index-b.index);
  for(let i=0;i<ordered.length;i++){
   const r=ordered[i];if(!r||r.index!==i||!Array.isArray(r.embedding)||r.embedding.length!==dimensions||r.embedding.some(x=>!Number.isFinite(x))||!r.embedding.some(x=>x!==0))throw new EmbeddingError('embedding-response');
  }
  const usage=body.usage;
  if(typeof body.model!=='string'||!accepted.has(body.model.toLowerCase()))throw new EmbeddingError('embedding-model',{actualModel:typeof body.model==='string'&&body.model.length<=256?body.model:null,usage:sanitizeUsage(usage)});
  return {vectors:ordered.map(r=>r.embedding),actualModel:body.model,usage:sanitizeUsage(usage)};
 }};
}
