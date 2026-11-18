// Local-only integration fixture; requires existing caddy:2.10-alpine Docker image.
import {createServer} from 'node:http';
import {request} from 'node:https';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'advisor-gateway-test-'));
const name=`advisor-gateway-fixture-${process.pid}`;
const hash='$2a$14$VorER06wqqjpC7v3o.MXC.mem433cpBPHmShMfQyEK/yl1J9Nm1Ci';
const origin='https://127.0.0.1:18443';
let calls=0;
const stub=createServer((req,res)=>{calls++;res.setHeader('content-type','application/json');if(!['GET','POST'].includes(req.method)){res.writeHead(405);res.end('{}');return;}res.end(JSON.stringify({method:req.method,host:req.headers.host,origin:req.headers.origin??null,authorization: Boolean(req.headers.authorization)}));});
const ask=(method,path,auth=false,siteOrigin)=>new Promise((resolve,reject)=>{const headers={};if(auth)headers.Authorization='Basic '+Buffer.from('fixture:fixture-only-password').toString('base64');if(siteOrigin)headers.Origin=siteOrigin;const req=request(origin+path,{method,headers,rejectUnauthorized:false},res=>{let body='';res.on('data',v=>body+=v);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));});req.on('error',reject);req.end();});
try{
 await new Promise((r,j)=>stub.once('error',j).listen(18893,'127.0.0.1',r));
 const source=readFileSync(new URL('./Caddyfile',import.meta.url),'utf8');
 const config='{ auto_https disable_redirects\n admin off\n}\n'+source.replace('{$ADVISOR_PREVIEW_HOST} {','https://127.0.0.1:18443 {\n    tls internal').replaceAll('{$ADVISOR_PREVIEW_HOST}','127.0.0.1:18443').replaceAll('{$ADVISOR_PREVIEW_USER}','fixture').replaceAll('{$ADVISOR_PREVIEW_PASSWORD_HASH}',hash).replaceAll('127.0.0.1:8893','127.0.0.1:18893');
 writeFileSync(join(dir,'Caddyfile'),config);
 const child=spawn('docker',['run','--rm','--name',name,'--network','host','-v',`${dir}/Caddyfile:/etc/caddy/Caddyfile:ro`,'caddy:2.10-alpine','caddy','run','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'],{stdio:'ignore'});
 let ready=false;for(let i=0;i<60;i++){try{await ask('GET','/');ready=true;break;}catch{await delay(100);}}
 assert.ok(ready,'Caddy failed to start');
 for(const path of ['/','/api/answer'])assert.equal((await ask('GET',path)).status,401);
 let before=calls;assert.equal((await ask('POST','/api/answer',true,'https://evil.example')).status,403);assert.equal((await ask('POST','/api/answer',true)).status,403);assert.equal(calls,before);
 assert.equal((await ask('GET','/',true)).status,200);
 const response=await ask('POST','/api/answer',true,origin);assert.equal(response.status,200);assert.deepEqual(JSON.parse(response.body),{method:'POST',host:'127.0.0.1:18893',origin:'http://127.0.0.1:18893',authorization:false});
 const options=await ask('OPTIONS','/api/answer',true,'https://evil.example');assert.equal(options.status,405);assert.equal(options.headers['access-control-allow-origin'],undefined);
 console.log('PASS: authentication, origin rejection, proxy rewrite, credential stripping, OPTIONS');
}finally{spawnSync('docker',['rm','-f',name],{stdio:'ignore'});await new Promise(r=>stub.close(r));rmSync(dir,{recursive:true,force:true});}
