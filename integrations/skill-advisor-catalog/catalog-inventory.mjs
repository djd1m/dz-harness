/** Build-time inventory uses the canonical registry plus an independent file walk. */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,existsSync,realpathSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const file=(root,path)=>{
 const full=resolve(root,path);
 if(!realpathSync(full).startsWith(root+sep)||!lstatSync(full).isFile()||lstatSync(full).isSymbolicLink())throw Error('Unsafe source file');
 return {path,sha256:hash(readFileSync(full))};
};
const local=(root,path)=>relative(root,path).split(sep).join('/');
function skillFiles(directory){
 const files=[];
 for(const item of readdirSync(directory,{withFileTypes:true})){
  if(['node_modules','.git','dist'].includes(item.name)||item.isSymbolicLink())continue;
  const path=resolve(directory,item.name);
  if(item.isDirectory())files.push(...skillFiles(path));
  else if(item.isFile()&&item.name==='SKILL.md')files.push(path);
 }
 return files.sort();
}
export function sourceFileIsShipped(path,publication){
 return typeof path==='string'&&Array.isArray(publication?.files)&&publication.files.includes(path);
}
export async function scanPackageInventory(sourceRoot,publication){
 const root=realpathSync(sourceRoot),packagesRoot=resolve(root,'packages');
 if(!Array.isArray(publication?.packages))throw Error('Published file inventory required');
 const published=new Map(publication.packages.map(p=>[p.name,p]));
 if(published.size!==publication.packages.length)throw Error('Duplicate publication identity');
 const packages=[],names=new Set();
 for(const item of readdirSync(packagesRoot,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(!item.isDirectory())continue;
  const directory=resolve(packagesRoot,item.name),manifestPath=resolve(directory,'package.json');
  if(!existsSync(manifestPath))continue;
  if(!lstatSync(manifestPath).isFile())throw Error('Non-file package manifest');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  if(typeof manifest.name!=='string'||typeof manifest.version!=='string'||names.has(manifest.name))throw Error('Invalid or duplicate package identity');
  names.add(manifest.name);
  const npm=published.get(manifest.name);
  if(!npm||npm.version!==manifest.version||!Array.isArray(npm.files)||!Array.isArray(npm.skills)||!/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(npm.integrity??''))throw Error('Missing or stale publication evidence');
  const skills=skillFiles(directory).map(path=>{
   const sourcePath=local(root,path),packagePath=local(directory,path),bytes=readFileSync(path);
   const id=bytes.toString('utf8').match(/^name:\s*["']?([a-z0-9-]+)["']?\s*$/mu)?.[1];
   if(!id)throw Error(`Missing declared skill identity: ${sourcePath}`);
   const shipped=sourceFileIsShipped(packagePath,npm),publishedSkill=npm.skills.find(s=>s.path===packagePath);
   if(shipped&&(!publishedSkill||publishedSkill.sha256!==hash(bytes)))throw Error(`Published skill/source mismatch: ${sourcePath}`);
   return {id,...file(root,sourcePath),shipped};
  });
  const shippedPaths=new Set(skills.filter(s=>s.shipped).map(s=>s.path.slice(local(root,directory).length+1)));
  if(npm.skills.some(skill=>!shippedPaths.has(skill.path)))throw Error(`Published skill missing from source: ${manifest.name}`);
  const readmePath=resolve(directory,'README.md');
  packages.push({name:manifest.name,version:manifest.version,directory:local(root,directory),private:manifest.private===true,publication:{version:npm.version,integrity:npm.integrity},
   type:skills.length?'skill-pack':item.name.startsWith('adapter-')?'adapter':manifest.bin?'tool':'library',
   manifest:file(root,local(root,manifestPath)),readme:existsSync(readmePath)?file(root,local(root,readmePath)):null,skills});
 }
 if(packages.length!==published.size)throw Error('Package/publication inventory sets differ');
 const {buildScopedCatalogInventory}=await import(pathToFileURL(resolve(root,'packages/harness-core/dist/scoped-catalog-inventory.js')));
 const carriers=packages.map(p=>({name:p.name,version:p.version,dir:resolve(root,p.directory)}));
 const canonical=buildScopedCatalogInventory({cwd:root,packages:carriers,carriers});
 const observed=new Set(packages.flatMap(p=>p.skills.map(s=>s.path)));
 for(const pkg of canonical.packages)for(const occurrence of pkg.occurrences){
  const path=`${pkg.dir}/${occurrence.path}/SKILL.md`;
  if(!observed.has(path))throw Error(`Registry/file-walk mismatch: ${path}`);
 }
 const document={schema:'dz-advisor-source-inventory/1',packages,canonical:{packages:canonical.totalPackages,uniqueSkills:canonical.totalSkills,occurrences:canonical.packages.reduce((n,p)=>n+p.occurrences.length,0)}};
 return {...document,digest:hash(JSON.stringify(document))};
}
export function verifyCatalogCoverage(inventory,records){
 if(inventory?.schema!=='dz-advisor-source-inventory/1'||!Array.isArray(inventory.packages)||!Array.isArray(records))throw Error('Invalid coverage inputs');
 const packages=new Map(inventory.packages.map(p=>[p.name,p]));
 if(packages.size!==inventory.packages.length)throw Error('Duplicate inventory identity');
 const expected=new Set(inventory.packages.flatMap(p=>p.skills.filter(s=>s.shipped).map(s=>`${p.name}\0${s.path}`)));
 const covered=new Set(),packageCoverage=new Set();
 for(const record of records){
  const pkg=packages.get(record.package?.name);
  if(!pkg||pkg.version!==record.package.version)throw Error('Unknown or stale scenario package');
  packageCoverage.add(pkg.name);
  for(const id of record.skillIds){
   const paths=pkg.skills.filter(s=>s.shipped&&s.id===id&&record.sources.some(source=>source.path===s.path));
   if(!paths.length)throw Error(`Unknown or unsupported skill: ${id}`);
   for(const skill of paths)covered.add(`${pkg.name}\0${skill.path}`);
  }
  if(record.kind==='package'&&(pkg.skills.some(s=>s.shipped)||record.skillIds.length))throw Error('Supporting package must not forge a skill');
 }
 const missingPackages=[...packages.keys()].filter(p=>!packageCoverage.has(p));
 const missingSkills=[...expected].filter(p=>!covered.has(p));
 if(missingPackages.length||missingSkills.length)throw Error(`Incomplete catalog coverage: ${missingPackages.length} packages, ${missingSkills.length} skill paths`);
 return {packages:packages.size,skillPaths:expected.size,scenarios:records.length,missingPackages,missingSkills};
}
