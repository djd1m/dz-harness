import { readFileSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';

/** Private preview only: one process owns the ledger; no prompt or credential storage. */
export function createRequestLedger(path, limit) {
 if(!isAbsolute(path)||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid ledger configuration');
 const lock=path+'.lock';const fd=openSync(lock,'wx',0o600);let closed=false;
 const close=()=>{if(!closed){closed=true;closeSync(fd);unlinkSync(lock);}};
 const write=value=>{
  const temp=path+'.'+randomUUID()+'.tmp';
  try{writeFileSync(temp,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});renameSync(temp,path);}
  finally{if(existsSync(temp))unlinkSync(temp);}
 };
 let count;
 try{
  if(!existsSync(path))write({version:1,limit,attempts:0});
  const state=JSON.parse(readFileSync(path,'utf8'));
  if(state.version!==1||state.limit!==limit||!Number.isInteger(state.attempts)||state.attempts<0||state.attempts>limit)throw Error('Invalid or mismatched ledger');
  count=state.attempts;
 }catch(error){close();throw error;}
 return {close,reserve(){
  if(closed)throw Error('Ledger closed');
  if(count>=limit)return false;
  write({version:1,limit,attempts:count+1});count++;return true;
 }};
}
