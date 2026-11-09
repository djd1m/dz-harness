const $=id=>document.getElementById(id);
let task='',pending=false;
const text=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
async function run(query){
 if(pending)return;
 if(!query.trim()||query.length>6000){$('status').textContent='Опишите задачу короче: не более 6000 символов.';return;}
 pending=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
 $('status').textContent='Подбираем сценарии и проверяем ограничения…';$('empty').hidden=true;
 $('result-title').textContent='Подбор пакетов';
 try{
  const response=await fetch('/api/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Подбор недоступен. Попробуйте ещё раз.');
  task=query;$('answers').replaceChildren();$('result-title').textContent=data.lead;
  for(const item of data.items){const article=text('article','', 'result-item');article.append(text('h3',item.package));
   for(const scenario of item.scenarios){article.append(text('p',scenario.summary),text('p','Ограничение: '+scenario.boundary,'boundary'),text('p','Следующий шаг: '+scenario.nextAction));}
   if(item.courseUrl){const a=text('a','Посмотреть курс','course-link');a.href=item.courseUrl;a.target='_blank';a.rel='noopener noreferrer';article.append(a);} $('answers').append(article);
  }
  $('status').textContent='Рекомендация по документации пакетов. Навыки не запускались.';
  $('followup-form').hidden=false;$('followup').value='';$('result-title').focus();
 }catch(error){$('status').textContent=error.message;}
 finally{pending=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
$('task-form').addEventListener('submit',e=>{e.preventDefault();run($('query').value);});
$('followup-form').addEventListener('submit',e=>{e.preventDefault();if($('followup').value.trim())run(task+'\nУточнение: '+$('followup').value);else $('followup').focus();});
document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{$('query').value=button.dataset.example;$('query').focus();}));

const examples=[
 'Подготовить план миграции базы без остановки сервиса',
 'Подготовить проект наблюдаемости: метрики, трассировка и дашборд',
 'Создать учебный курс по нашему CLI с упражнениями и итоговым тестом',
 'Найти актуальную документацию библиотеки и примеры API',
 'Собрать обзор новостей ИИ за неделю со ссылками на источники',
 'Проверить результаты A/B-теста и решить, продолжать ли эксперимент',
 'Зафиксировать принятое архитектурное решение и его последствия',
 'Спланировать спринт и распределить задачи команды',
];
let completion='';
function suggest(){
 const q=$('query'),value=q.value;
 const found=value.trim().length>=3&&q.selectionStart===value.length&&q.selectionEnd===value.length
  ?examples.find(e=>e.toLocaleLowerCase('ru').startsWith(value.toLocaleLowerCase('ru'))&&e.length>value.length):null;
 completion=found||'';$('completion').hidden=!completion;
 $('completion-text').textContent=completion?'Продолжение: '+completion.slice(value.length):'';
}
function acceptCompletion(){if(!completion)return;const q=$('query');q.value=completion;completion='';$('completion').hidden=true;q.focus();q.setSelectionRange(q.value.length,q.value.length);}
$('query').addEventListener('input',suggest);
$('query').addEventListener('click',suggest);
$('query').addEventListener('keydown',e=>{
 if(e.key==='Tab'&&!e.shiftKey&&completion&&!e.isComposing&&$('query').selectionStart===$('query').value.length&&$('query').selectionEnd===$('query').value.length){e.preventDefault();acceptCompletion();}
 if(e.key==='Escape'&&completion){completion='';$('completion').hidden=true;}
});
$('accept-completion').addEventListener('click',acceptCompletion);
document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{completion='';$('completion').hidden=true;}));
