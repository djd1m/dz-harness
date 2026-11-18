/** Bounded literal primary-source evidence. Build once from an approved catalog, never fetch at request time. */
import{dirname}from'node:path';
import{fileURLToPath}from'node:url';
import{readCatalogSource,digest}from'./catalog.mjs';
import{stems}from'../../packages/harness-core/dist/stem.js';
const defaultRoot=fileURLToPath(new URL('../../',import.meta.url));
const terms=text=>new Set(stems(text).filter(term=>term.length>3));
export function buildSourceContext(catalog,{root=defaultRoot}={}){
 const documents=new Map(),byRecord=new Map(),indexEntries=[];
 for(const record of catalog.records){
  const prefix=dirname(record.package.manifest).replaceAll('\\','/')+'/';
  const own=record.sources.filter(source=>source.path.startsWith(prefix));
  const source=own.find(source=>source.path.endsWith('/SKILL.md'))??own.find(source=>source.path.endsWith('/README.md'));
  if(!source)throw Error('Missing primary source context');
  const key=source.path+'\0'+source.sha256;
  if(!documents.has(key)){
   const bytes=readCatalogSource(root,source.path);
   if(digest(bytes)!==source.sha256)throw Error('Stale source context');
   const text=bytes.toString('utf8'),chunks=[];
   for(let start=0;start<text.length;start+=700){
    const quote=text.slice(start,start+900);
    if(quote.trim().length>=20)chunks.push({start,quote,terms:terms(quote)});
   }
   documents.set(key,{source,chunks});
  }
  const document=documents.get(key);byRecord.set(record.id,document);
  for(const chunk of document.chunks)indexEntries.push(Object.freeze({id:'source-'+digest(record.id+'\0'+source.sha256+'\0'+chunk.start),ownerId:record.id,
   text:record.package.name+' '+record.title+'\n'+chunk.quote,
   evidence:Object.freeze({path:source.path,sha256:source.sha256,start:chunk.start,quote:chunk.quote})}));
 }
 const context=(id,query,preferred=[])=>{
  const document=byRecord.get(id);if(!document)throw Error('Unknown context scenario');
  const words=terms(query),chunks=document.chunks;
  const scores=chunks.map((chunk,index)=>({index,score:[...words].filter(w=>chunk.terms.has(w)).reduce((score,w)=>score+Math.log(1+chunks.length/(1+chunks.filter(c=>c.terms.has(w)).length)),0)})).sort((a,b)=>b.score-a.score||a.index-b.index);
  const selected=[];
  for(const evidence of preferred){
   const index=chunks.findIndex(chunk=>chunk.start===evidence.start&&chunk.quote===evidence.quote);
   if(evidence.path!==document.source.path||evidence.sha256!==document.source.sha256||index<0)throw Error('Invalid preferred source evidence');
   if(selected.length<2&&selected.every(i=>Math.abs(chunks[i].start-chunks[index].start)>=900))selected.push(index);
  }
  for(const item of scores){
   if(item.score<=0||selected.length===2)break;
   if(selected.every(i=>Math.abs(chunks[i].start-chunks[item.index].start)>=900))selected.push(item.index);
   if(selected.length===2)break;
  }
  // Source lead is already quoted by the card; for no lexical match expose separate middle/tail evidence.
  if(!selected.length&&chunks.length)selected.push(Math.floor((chunks.length-1)/2));
  if(selected.length<2&&chunks.length>1){const tail=chunks.length-1;if(selected.every(i=>Math.abs(chunks[i].start-chunks[tail].start)>=900))selected.push(tail);}
  return selected.map(i=>({path:document.source.path,sha256:document.source.sha256,start:chunks[i].start,quote:chunks[i].quote}));
 };
 Object.defineProperty(context,'indexEntries',{value:Object.freeze(indexEntries)});
 return Object.freeze(context);
}
