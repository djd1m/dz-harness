const $ = id => document.getElementById(id);
let initialTask = '', clarifications = [], pending = false, composing = false, dismissedValue = null, suggestion = null;
const text = (tag, value, cls) => { const e = document.createElement(tag); e.textContent = value; if (cls) e.className = cls; return e; };

async function run(initial, clarification = '') {
 if (pending) return;
 const earlier = clarifications.map((value, i) => `Предыдущее уточнение ${i + 1}: ${value}`).join('\n');
 const query = clarification ? [initial, earlier, 'Последнее уточнение (при противоречии считать актуальным): ' + clarification].filter(Boolean).join('\n') : initial;
 if (!initial.trim() || query.length > 6000) { $('status').textContent = 'Опишите задачу и уточнение не длиннее 6000 символов вместе.'; return; }
 pending = true;
 document.querySelectorAll('button').forEach(button => { button.disabled = true; });
 $('status').textContent = 'Подбираем сценарии и проверяем ограничения…';
 try {
  const response = await fetch('/api/answer', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({query}) });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Подбор недоступен. Попробуйте ещё раз.');
  const section = text('section', '', 'answer-turn');
  section.append(text('h3', clarification ? 'Уточнение' : 'Ваша задача', 'turn-label'), text('p', clarification || initial, 'turn-query'));
  section.append(text('h3', data.lead, 'answer-lead'));
  if (typeof data.clarificationQuestion === 'string' && data.clarificationQuestion.trim()) section.append(text('p', data.clarificationQuestion, 'clarification-question'));
  if (Array.isArray(data.missingParts) && data.missingParts.length) {
   const list = document.createElement('ul'); list.className = 'missing-parts';
   for (const part of data.missingParts) if (typeof part === 'string' && part.trim()) list.append(text('li', part));
   if (list.childElementCount) { section.append(text('p', 'Не покрыто подобранными сценариями:', 'missing-label'), list); }
  }
  for (const item of data.items) {
   const article = text('article', '', 'result-item'); article.append(text('h3', item.package));
   for (const scenario of item.scenarios) article.append(text('p', scenario.summary), text('p', 'Ограничение: ' + scenario.boundary, 'boundary'), text('p', 'Следующий шаг: ' + scenario.nextAction));
   if (item.courseUrl) { const a = text('a', 'Посмотреть курс', 'course-link'); a.href = item.courseUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; article.append(a); }
   section.append(article);
  }
  if (!clarification) { initialTask = initial; clarifications = []; $('answers').replaceChildren(); $('followup').value = ''; }
  else clarifications.push(clarification);
  $('answers').append(section); $('empty').hidden = true; $('followup-form').hidden = false;
  if (clarification) $('followup').value = '';
  $('status').textContent = 'Рекомендация по документации пакетов. Навыки не запускались.';
  section.tabIndex = -1; section.focus();
 } catch (error) { $('status').textContent = error.message || 'Не удалось получить ответ. Попробуйте ещё раз.'; }
 finally { pending = false; document.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
}
$('task-form').addEventListener('submit', e => { e.preventDefault(); run($('query').value); });
$('followup-form').addEventListener('submit', e => { e.preventDefault(); const clarification = $('followup').value.trim(); if (clarification) run(initialTask, clarification); else $('followup').focus(); });

const examples = [
 'Подготовить план миграции базы без остановки сервиса',
 'Подготовить проект наблюдаемости: метрики, трассировка и дашборд',
 'Создать учебный курс по нашему CLI с упражнениями и итоговым тестом',
 'Найти актуальную документацию библиотеки и примеры API',
 'Собрать обзор новостей ИИ за неделю со ссылками на источники',
 'Проверить результаты A/B-теста и решить, продолжать ли эксперимент',
 'Зафиксировать принятое архитектурное решение и его последствия',
 'Спланировать спринт и распределить задачи команды',
];
function hideSuggestion() { suggestion = null; $('completion').hidden = true; }
function suggest() {
 const q = $('query'), value = q.value;
 if (composing || value === dismissedValue || value.trim().length < 3) { hideSuggestion(); return; }
 const normalized = value.trim().toLocaleLowerCase('ru');
 const prefix = value === value.trimStart() && examples.find(example => example.toLocaleLowerCase('ru').startsWith(value.toLocaleLowerCase('ru')) && example.length > value.length);
 const words = normalized.split(/[^\p{L}\p{N}]+/u).filter(word => word.length >= 3);
 const related = words.length && examples.find(example => words.some(word => example.toLocaleLowerCase('ru').includes(word)) && example.toLocaleLowerCase('ru') !== normalized);
 const found = prefix || related;
 if (!found) { hideSuggestion(); return; }
 suggestion = {value, example: found, prefix: Boolean(prefix)};
 $('completion-text').textContent = (prefix ? 'Возможное продолжение: ' : 'Похожая задача: ') + found;
 $('accept-completion').textContent = prefix ? 'Дополнить · Tab' : 'Добавить пример';
 $('completion').hidden = false;
}
function acceptSuggestion() {
 const q = $('query');
 if (!suggestion || q.value !== suggestion.value || composing) return;
 const {example, prefix} = suggestion;
 q.value = prefix ? q.value + example.slice(q.value.length) : q.value + '\n' + example;
 dismissedValue = q.value; hideSuggestion(); q.focus(); q.setSelectionRange(q.value.length, q.value.length);
}
$('query').addEventListener('input', () => { if ($('query').value !== dismissedValue) dismissedValue = null; suggest(); });
$('query').addEventListener('compositionstart', () => { composing = true; hideSuggestion(); });
$('query').addEventListener('compositionend', () => { composing = false; suggest(); });
$('query').addEventListener('click', suggest);
$('query').addEventListener('keydown', e => {
 const q = $('query');
 if (e.key === 'Tab' && !e.shiftKey && !e.isComposing && !composing && suggestion?.prefix && q.selectionStart === q.value.length && q.selectionEnd === q.value.length) { e.preventDefault(); acceptSuggestion(); }
 if (e.key === 'Escape' && !e.isComposing && !composing && suggestion) { dismissedValue = q.value; hideSuggestion(); }
});
$('accept-completion').addEventListener('click', acceptSuggestion);
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
 const q = $('query'), example = button.dataset.example;
 q.value = q.value.trim() ? q.value + '\n' + example : example;
 dismissedValue = q.value; hideSuggestion(); q.focus(); q.setSelectionRange(q.value.length, q.value.length);
}));
