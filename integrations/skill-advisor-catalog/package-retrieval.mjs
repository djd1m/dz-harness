/** Host-owned package context, shared by hybrid search and lexical availability fallback. */
export const rawCandidateLimit=100;
export function groupPackageCandidates(catalog,rawCandidates){
 const byPackage=new Map(),overviews=new Map();
 for(const record of catalog.records){
  if(record.kind!=='package-overview')continue;
  if(overviews.has(record.package.name))throw Error('Duplicate package overview');
  overviews.set(record.package.name,record);
 }
 // First occurrence in the real ranking owns package order; enrichment never invents a package hit.
 const collapsed=new Map();
 for(const hit of rawCandidates){
  if(!collapsed.has(hit.id))collapsed.set(hit.id,{...hit,sourceQuotes:[]});
  const owner=collapsed.get(hit.id);
  for(const quote of hit.sourceQuotes??[])if(!owner.sourceQuotes.some(q=>q.path===quote.path&&q.sha256===quote.sha256&&q.start===quote.start))owner.sourceQuotes.push(quote);
 }
 for(const hit of collapsed.values()){
  const name=hit.record.package.name;
  if(!byPackage.has(name)&&byPackage.size<5)byPackage.set(name,[]);
  const group=byPackage.get(name);if(group)group.push(hit);
 }
 const candidates=[];
 for(const [name,hits]of byPackage){
  const overview=overviews.get(name);
  if(overview)candidates.push({id:overview.id,score:hits[0].score,record:overview,sourceQuotes:collapsed.get(overview.id)?.sourceQuotes??[]});
  const atomic=hits.filter(h=>h.record.kind!=='package-overview').slice(0,2);
  candidates.push(...atomic);
 }
 return{candidates,diagnostics:{rawHitCount:rawCandidates.length,packageCount:byPackage.size,
  concentrated:rawCandidates.length===rawCandidateLimit&&byPackage.size<5}};
}
