import puppeteer from '/var/lib/aicoding/package-advisor-mockup-20261108/node_modules/puppeteer/lib/puppeteer/puppeteer.js';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage(); let requests=[], fail=false;
 await page.setRequestInterception(true);
 page.on('request',req=>{if(req.url().endsWith('/api/answer')){requests.push(JSON.parse(req.postData()).query); req.respond({status:fail?500:200,contentType:'application/json',body:JSON.stringify(fail?{error:'Ошибка проверки'}:{lead:'Ответ',items:[],clarificationQuestion:'<b>Уточните</b>',missingParts:['<img src=x>']})});} else req.continue();});
 await page.setViewport({width:1280,height:900}); await page.goto('http://127.0.0.1:8893/',{waitUntil:'networkidle0'});
 const q=await page.$('#query'); await q.type('Произвольная задача для проверки'); await page.click('#submit'); await page.waitForSelector('.answer-turn');
 for(const value of ['Первое','Второе','Третье']) {await page.type('#followup',value);await page.click('#followup-form button');await page.waitForFunction(n=>document.querySelectorAll('.answer-turn').length===n,{},requests.length);}
 assert.match(requests[3],/Предыдущее уточнение 1: Первое/);assert.match(requests[3],/Предыдущее уточнение 2: Второе/);assert.match(requests[3],/Последнее уточнение.*Третье/);
 assert.equal(await page.$eval('.clarification-question',e=>e.textContent),'<b>Уточните</b>'); assert.equal(await page.$eval('.missing-parts li',e=>e.textContent),'<img src=x>'); assert.equal(await page.$$('.missing-parts img').then(x=>x.length),0);
 fail=true; await page.type('#followup','Сохранить при ошибке');await page.click('#followup-form button');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Ошибка проверки');assert.equal(await page.$eval('#followup',e=>e.value),'Сохранить при ошибке');assert.equal(await page.$$('.answer-turn').then(x=>x.length),4);
 fail=false;await page.$eval('#query',e=>e.value='Новая задача');await page.click('#submit');await page.waitForFunction(()=>document.querySelectorAll('.answer-turn').length===1);assert.equal(requests.at(-1),'Новая задача');
 await page.$eval('#query',e=>{e.value='Подготовить';e.focus();e.setSelectionRange(e.value.length,e.value.length);e.dispatchEvent(new Event('input',{bubbles:true}));});await page.keyboard.press('Escape');await page.click('#query');assert.equal(await page.$eval('#completion',e=>e.hidden),true);
 await page.$eval('#query',e=>{e.value='Подготовить план';e.setSelectionRange(0,0);e.dispatchEvent(new Event('input',{bubbles:true}));});await page.keyboard.press('Tab');assert.equal(await page.$eval('#query',e=>e.value),'Подготовить план');
 await page.$eval('#query',e=>{e.focus();e.setSelectionRange(e.value.length,e.value.length)});await page.keyboard.press('Tab');assert.notEqual(await page.$eval('#query',e=>e.value),'Подготовить план');
 await page.$eval('#query',e=>{e.value='Подготовить';e.focus();e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await page.$eval('#completion',e=>e.hidden),true);await page.$eval('#query',e=>e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
 await page.screenshot({path:'docs/proposals/skill-advisor-scenarios/preview-8h/desktop.png',fullPage:true});
 await page.emulate({viewport:{width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'});await page.reload({waitUntil:'networkidle0'});await page.$eval('#query',e=>{e.value='Мой текст';e.dispatchEvent(new Event('input',{bubbles:true}));});await page.tap('[data-example]');assert((await page.$eval('#query',e=>e.value)).startsWith('Мой текст\n'));await page.screenshot({path:'docs/proposals/skill-advisor-scenarios/preview-8h/mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);console.log('Browser fixture checks passed: dialogue, error, escaping, keyboard, IME events, mobile touch and width.');
} finally {await browser.close();}
