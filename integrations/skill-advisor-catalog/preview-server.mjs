import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {currentCatalog} from './cli.mjs';
import {retrieve} from './search.mjs';
import {approvedPresentation,answerContract,renderAnswer} from './answer.mjs';
import {selectScenarios} from './selector.mjs';

const directory=fileURLToPath(new URL('./preview/',import.meta.url));
const data=fileURLToPath(new URL('../../docs/proposals/skill-advisor-scenarios/',import.meta.url));
const read=name=>JSON.parse(readFileSync(data+name));
export function createPreview({answer,fontsDirectory,requestBudget=30}){
 let active=false,attempts=0;
 if(!Number.isInteger(requestBudget)||requestBudget<1||requestBudget>100)throw Error('Invalid request budget');
 const server=createServer(async(req,res)=>{
  const send=(status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});res.end(type==='application/json'?JSON.stringify(body):body);};
  const host=`127.0.0.1:${server.address().port}`;
  if(req.headers.host!==host){send(403,{error:'Недопустимый адрес.'});return;}
  if(req.method==='GET'){
   const files={'/':['index.html','text/html; charset=utf-8'],'/style.css':['style.css','text/css'],'/app.js':['app.js','text/javascript']};
   if(files[req.url]){const [name,type]=files[req.url];send(200,readFileSync(directory+name),type);return;}
   if(/^\/fonts\/[A-Za-z0-9_.-]+\.woff2$/.test(req.url)&&fontsDirectory){
    try{send(200,readFileSync(resolve(fontsDirectory,req.url.slice(7))),'font/woff2');}catch{send(404,{error:'Шрифт не найден.'});}return;
   }
   send(404,{error:'Страница не найдена.'});return;
  }
  if(req.method!=='POST'||req.url!=='/api/answer'){send(405,{error:'Метод не поддерживается.'});return;}
  if(req.headers.origin!==`http://${host}`||req.headers['content-type']!=='application/json'){
   send(403,{error:'Откройте форму в тестовом интерфейсе.'});return;
  }
  if(active||attempts>=requestBudget){send(429,{error:active?'Подбор уже выполняется. Дождитесь ответа.':'Лимит тестовой сессии исчерпан.'});return;}
  active=true;
  try{
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>24000){send(413,{error:'Слишком длинный запрос.'});return;}chunks.push(chunk);}
   let parsed;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(400,{error:'Не удалось прочитать запрос.'});return;}
   if(typeof parsed.query!=='string'||!parsed.query.trim()||parsed.query.length>6000){send(400,{error:'Введите задачу: от 1 до 6000 символов.'});return;}
   attempts++;
   send(200,await answer(parsed.query));
  }catch{if(!res.headersSent)send(502,{error:'Не удалось получить ответ модели. Ваш текст остался в форме; попробуйте ещё раз.'});}
  finally{active=false;}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 return server;
}
export function liveAnswer(apiKey){
 const catalog=currentCatalog();if(catalog.excluded.length)throw Error('Catalog exclusions');
 const presentation=approvedPresentation(catalog,read('presentation.json'),read('presentation-reviews.json'));
 const contract=answerContract(presentation),courses=read('course-map.json');
 return async query=>{
  const result=await selectScenarios(retrieve(catalog,query),{model:'anthropic/claude-haiku-5.5',apiKey,contract});
  return renderAnswer(result.output,presentation,courses);
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.env.OPENROUTER_API_KEY)throw Error('OPENROUTER_API_KEY required in server environment');
 const port=Number(process.env.ADVISOR_PREVIEW_PORT||8893);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid preview port');
 createPreview({answer:liveAnswer(process.env.OPENROUTER_API_KEY),fontsDirectory:process.env.ADVISOR_FONTS_DIR})
 .listen(port,'127.0.0.1',()=>console.log(`Advisor preview: http://127.0.0.1:${port} (30 calls maximum; no prompt logs)`));
}
