/** Application projection over the generic retrieval library; transport never owns source prose. */
import{createLexicalSearch}from'./search.mjs';
export const advisorDocuments=catalog=>catalog.records.map(r=>({id:r.id,text:[r.package.name,r.package.description??'',r.title,r.intent,...r.queries,...r.whenToUse,r.outcome].join(' ')}));
export function buildSourceProjection(catalog,context=null){
 const records=new Map(catalog.records.map(r=>[r.id,r]));
 if(records.size!==catalog.records.length)throw Error('Duplicate source owner');
 const documents=advisorDocuments(catalog),owners=new Map(documents.map(d=>[d.id,{ownerId:d.id}]));
 for(const entry of context?.indexEntries??[]){
  if(owners.has(entry.id)||!records.has(entry.ownerId))throw Error('Invalid or duplicate source projection owner');
  documents.push({id:entry.id,text:entry.text});owners.set(entry.id,entry);
 }
 if(documents.length>10000)throw Error('Source projection exceeds snapshot document limit');
 const lexicalSearch=createLexicalSearch(documents);
 return Object.freeze({documents:Object.freeze(documents.map(Object.freeze)),has:id=>owners.has(id),lexicalSearch,
  resolve(hit){const owner=owners.get(hit.id);if(!owner)throw Error('Unknown source projection hit');return{id:owner.ownerId,score:hit.score,record:records.get(owner.ownerId),...(owner.evidence?{sourceQuotes:[owner.evidence]}:{})};}});
}
