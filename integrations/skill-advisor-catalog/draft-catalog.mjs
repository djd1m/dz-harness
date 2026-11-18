/** Build source-bound drafts; this command NEVER creates approval receipts. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {recordHash,digest} from './catalog.mjs';
import {scanPackageInventory,verifyCatalogCoverage} from './catalog-inventory.mjs';

export async function writeCatalogDrafts({root,publication,drafts,output}){
 const inventory=await scanPackageInventory(root,publication),byName=new Map(inventory.packages.map(p=>[p.name,p]));
 const records=[],presentations=[],paths=new Set(),roles=new Set(['plan','guide','analysis','artifact']);
 for(const draft of drafts.flatMap(part=>part.records).sort((a,b)=>a.sourcePath.localeCompare(b.sourcePath))){
  const pkg=byName.get(draft.package);
  if(!pkg||paths.has(draft.sourcePath))throw Error('Unknown package or duplicate draft path');paths.add(draft.sourcePath);
  if(!roles.has(draft.role)||typeof draft.title!=='string'||!draft.title.trim()||draft.title.length>90||
    ['summary','boundary','nextAction'].some(k=>typeof draft[k]!=='string'||!draft[k].trim()||draft[k].length>220)||
    !Array.isArray(draft.queries)||draft.queries.length<2||draft.queries.some(q=>typeof q!=='string'||!q.trim()))throw Error('Invalid editorial draft');
  const skill=pkg.skills.find(s=>s.path===draft.sourcePath);
  if(draft.skillId?(skill?.id!==draft.skillId||!skill.shipped):pkg.skills.some(s=>s.shipped)||draft.sourcePath!==pkg.readme?.path)throw Error('Draft is not backed by shipped source');
  const source=skill??pkg.readme;
  const raw=readFileSync(resolve(root,source.path),'utf8'),manifest=JSON.parse(readFileSync(resolve(root,pkg.manifest.path),'utf8'));
  // Only metadata is a witness: examples in the body may contain unrelated description keys.
  const metadata=raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/u)?.[1];
  const quote=(metadata?.match(/^description:[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*/mu)?.[0]??'').slice(0,500);
  if(!draft.evidence&&quote.trim().length<16)throw Error('Missing literal source witness');
  const id=pkg.name.split('/').at(-1)+'-'+(draft.skillId??'package')+'-'+digest(draft.sourcePath).slice(0,8);
  const sources=[pkg.manifest,source,...(pkg.readme&&pkg.readme.path!==source.path?[pkg.readme]:[])];
  const record={id,kind:draft.skillId?'skill':'package',title:draft.title,intent:draft.summary,outcome:draft.summary,
   package:{name:pkg.name,version:pkg.version,manifest:pkg.manifest.path,type:pkg.type,description:manifest.description??''},
   skillIds:draft.skillId?[draft.skillId]:[],queries:draft.queries,whenToUse:[draft.summary],whenNotToUse:[draft.boundary],
   prerequisites:[],steps:[draft.nextAction],limitations:[draft.boundary],courseUrl:null,sources,evidence:draft.evidence??[{path:source.path,quote}]};
  records.push(record);presentations.push({id,recordHash:recordHash(record),role:draft.role,summary:draft.summary,boundary:draft.boundary,nextAction:draft.nextAction});
 }
 const coverage=verifyCatalogCoverage(inventory,records);
 mkdirSync(output,{recursive:true});
 for(const [name,data] of Object.entries({'inventory.json':inventory,'publication.json':publication,'records.json':{schema:1,records},'presentation.json':{schema:1,records:presentations},'coverage-draft.json':coverage}))writeFileSync(resolve(output,name),JSON.stringify(data,null,2)+'\n');
 return {inventory,records,presentations,coverage};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [publicationPath,output,...draftPaths]=process.argv.slice(2);
 if(!publicationPath||!output||!draftPaths.length)throw Error('Usage: node draft-catalog.mjs PUBLICATION OUTPUT DRAFT...');
 const read=path=>JSON.parse(readFileSync(path,'utf8'));
 const result=await writeCatalogDrafts({root:resolve(dirname(fileURLToPath(import.meta.url)),'../..'),publication:read(publicationPath),output:resolve(output),drafts:draftPaths.map(read)});
 console.log(JSON.stringify(result.coverage));
}
