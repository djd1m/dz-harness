import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { compliantCourse } from './_fixtures.mjs';
const root = fileURLToPath(new URL('../package-tutorial-factory/', import.meta.url));
export const FONT_HASHES = [
'a9cb1cd82332b23a47e3a1239d25d13c86d16c4220695e34b243effa999f45f2',
'086c48dfbea9ddaff1320f7e09399b8e2924e88ce67453721255db3bdbb5a353',
'c503cc5ec5f8b2c7666b7ecda1adf44bd45f2e6579b2eba0fc292150416588a2',
'268f03691b3d06e57abcf20f9277e314ea8784298983aab5b40c1b91965027e1',
'68e5e01d6265bd68967746d4f5a9d18d0e6cbb5d15583c7082d6384ab1229b27',
'14e7d3079b75860e2ab50efc6c318c398fdb46ede9b56e625f12ae70a3c5d9a4',
'052df74533250c2e0ca0c4bdd32de594e107d99c1648e63820ef9c6142067828'];
export function assertFonts(html) {
 const bytes = [...html.matchAll(/url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g)].map(m=>Buffer.from(m[1], 'base64'));
 assert.equal(bytes.length,7,'exactly seven original font resources');
 assert.deepEqual(bytes.map(b=>createHash('sha256').update(b).digest('hex')).sort(),FONT_HASHES.slice().sort());
 assert.ok(bytes.every(b=>b.subarray(0,4).toString()==='wOF2'));
 assert.doesNotMatch(html, /@import|url\(\s*["']?https?:/i);
}
export function assertSeams(html, course) {
 assert.match(html, /<html lang="[^"]*" data-course-theme="phosphor-v1">/);
 assert.match(html, /<body>\n<div class="layout">/);
 assert.ok(html.includes('<main id="main"></main>\n</div>\n<footer id="site-footer">'));
 assert.match(html, /<\/script>\n<\/body>\n<\/html>\n$/);
 assert.equal((html.match(/<\/script>/g)||[]).length,3);
 assert.deepEqual(JSON.parse(html.match(/id="course-data">([\s\S]*?)<\/script>/)[1]),course);
 assert.match(html, /var KEY = 'dz-course:' \+ \(COURSE.courseTitle \|\| 'course'\)/);
 assert.match(html, /function fresh\(\) \{ return \{ completed: \{\}, scores: \{\}, unlocked: \[\], finalScore: null, dark: false \}; \}/);
}
function render() {
 const dir=mkdtempSync(join(tmpdir(),'tf-theme-'));
 try {
  const course=compliantCourse(), file=join(dir,'course.json'), out=join(dir,'index.html');
  const input=JSON.stringify(course,null,2); writeFileSync(file,input);
  const result=spawnSync(process.execPath,[join(root,'scripts/render-site.mjs'),'--course',file,'--out',out],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr); assert.equal(readFileSync(file,'utf8'),input);
  const html=readFileSync(out,'utf8');
  const again=spawnSync(process.execPath,[join(root,'scripts/render-site.mjs'),'--course',file,'--out',out],{encoding:'utf8'});
  assert.equal(again.status,0,again.stderr); assert.equal(readFileSync(out,'utf8'),html);
  return {html,course};
 } finally {rmSync(dir,{recursive:true,force:true});}
}
test('factory theme preserves deterministic data and consumer seams',()=>{const {html,course}=render();assertSeams(html,course);
 assert.throws(()=>assertSeams(html.replace('data-course-theme="phosphor-v1"',''),course));
 assert.throws(()=>assertSeams(html.replace("var KEY = 'dz-course:'", "var KEY = 'wrong:'"),course));
});
test('seven pinned offline fonts and complete redistribution notices',()=>{const {html}=render();assertFonts(html);
 for(const name of ['Onest-OFL.txt','JetBrainsMono-OFL.txt']) {
  const notice=readFileSync(join(root,'references',name),'utf8');
  const escaped=notice.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const assertNotice=content=>assert.ok(content.includes(escaped),name+' must accompany standalone HTML');
  assertNotice(html);assert.throws(()=>assertNotice(html.replace(escaped,'')),name+' omission must fail');
 }
 assert.throws(()=>assertFonts(html.replace(/url\(data:font\/woff2;base64,[^)]+\)/,'url(data:font/woff2;base64,AAAA)')));
 assert.throws(()=>assertFonts(html.replace(/url\(data:font\/woff2;base64,[^)]+\)/,'url(https://example.test/font.woff2)')));
});

test('production verifier admits embedded fonts while rejecting load-bearing mutants',()=>{
 const dir=mkdtempSync(join(tmpdir(),'tf-font-guard-'));
 try {
  const {html}=render(),site=join(dir,'index.html');
  const verify=content=>{writeFileSync(site,content);return spawnSync(process.execPath,[join(root,'scripts/verify-site.mjs'),'--site',site],{encoding:'utf8'});};
  assert.equal(verify(html).status,0);
  const admitted=/url\(data:font\/woff2;base64,[^)]+\)/;
  for(const value of ['url(https://example.test/font.woff2)','url(../font.woff2)','url(data:image/png;base64,AAAA)','url(data:font/woff2;base64,AAAA)','url(data:font/woff2;base64,d09GMg==)','url(data:font/woff2;base64,%%%bad)']) {
   const mutant=html.replace(admitted,value);assert.notEqual(mutant,html);
   const result=verify(mutant);assert.notEqual(result.status,0,value);
   assert.match(result.stdout,/FAIL\s+site.self-contained/,value+' must fail the actual load guard');
  }
  const payload=Buffer.alloc(48);payload.write('wOF2');const noncanonical=payload.toString('base64')+'=';
  const result=verify(html.replace(admitted,'url(data:font/woff2;base64,'+noncanonical+')'));
  assert.notEqual(result.status,0,'noncanonical base64');assert.match(result.stdout,/FAIL\s+site.self-contained/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
