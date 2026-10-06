/*
 * picker.js — механика выбора и экспорта решений (decision-mockups)
 * =================================================================
 *
 * Что делает: превращает развилки на странице в группы кнопок с одним активным выбором,
 * запоминает выбор в localStorage, показывает липкую полосу «Выбрано N из M»
 * и отдаёт по кнопке текст, который можно вставить в свежий чат.
 *
 * КАК ПОДКЛЮЧИТЬ
 * --------------
 * CSP артефактов режет любой внешний хост, поэтому файл вставляется ИНЛАЙНОМ:
 * скопируйте содержимое (без этого комментария, если жалко места) внутрь
 * <script> в конце страницы. Никаких src= — не загрузится.
 *
 * ЧТО ДОЛЖНО БЫТЬ В РАЗМЕТКЕ
 * --------------------------
 * 1) Каждая развилка — контейнер с двумя атрибутами:
 *      data-group="ID-РАЗВИЛКИ"              — уникальный id развилки
 *      data-label="ПОДПИСЬ — о чём вопрос"   — человеческая подпись
 *    Подпись уходит в экспорт как есть, поэтому пишите её так, чтобы она была
 *    понятна тому, кто откроет чат без этой страницы.
 *
 * 2) Каждый вариант внутри контейнера — и вариантов ОБЯЗАТЕЛЬНО не меньше двух
 *    (развилка с одним вариантом — это не выбор, а решение с пририсованной кнопкой;
 *    ворота G9 в references/check_page.py заваливают такую страницу):
 *      role="button" tabindex="0" data-val="ОТВЕТ А — рекомендуем"
 *      role="button" tabindex="0" data-val="ОТВЕТ Б"
 *    data-val — КОРОТКИЙ текст ответа, который попадёт в экспорт.
 *    Класс .suggest на варианте = рекомендация (пунктирная рамка до выбора).
 *
 * 3) Липкая полоса где-то в конце страницы:
 *      <div class="pickbar" id="pickbar" hidden>
 *        <div class="pickbar-in">
 *          <span class="pb-count">Выбрано <b id="pb-n">0</b> из <span id="pb-total">0</span></span>
 *          <span class="pb-actions">
 *            <button type="button" class="pb-btn ghost" id="pb-reset">Сбросить</button>
 *            <button type="button" class="pb-btn" id="pb-copy">Скопировать ответы</button>
 *          </span>
 *        </div>
 *      </div>
 *    #pb-total заполняется ИЗ DOM. Никогда не проставляйте это число руками:
 *    посчитанное на глаз, оно расходится с разметкой на первой же правке.
 *
 * НАСТРОЙКА
 * ---------
 * Вариант «ничего не писать»: положите на #pickbar атрибуты
 *   data-key="my-topic-picks"
 *   data-topic="записи на занятия"
 *   data-date="04.05.2032"
 * Вариант «явно»: DecisionPicker.init({ key: '...', topic: '...', date: '...' }).
 * Ключ localStorage ОБЯЗАН быть своим на каждой странице: общий ключ означает, что
 * вторая страница решений, открытая тем же человеком в том же браузере, прочитает
 * выбор первой — и экспорт увезёт ответы на вопросы, которых на этой странице нет.
 * Поэтому дефолт намеренно сломан заглушкой `ЗАМЕНИТЬ-picks`: ворота G13
 * в references/check_page.py заваливают страницу, где заглушку не заменили.
 *
 * ФОРМАТ ЭКСПОРТА (самодостаточный при вставке в свежий чат)
 * ----------------------------------------------------------
 *   Решения по <тема> (<дата>):
 *   <пустая строка>
 *   Выбор 1 — день занятия: Показывать дату в каждой строке
 *   Выбор 3 — начало записи: Открыть общую запись
 *   <пустая строка>
 *   Без ответа: Выбор 2
 * В строке «Без ответа» от подписи берётся только часть ДО « — »: список
 * должен читаться одной строкой, а не расползаться на абзац.
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    key: 'ЗАМЕНИТЬ-picks',                 // ключ localStorage — СВОЙ на каждой странице (ловится G13)
    topic: 'ЗАМЕНИТЬ — тема',              // подставляется в «Решения по <тема> (<дата>):»
    date: new Date().toLocaleDateString('ru-RU'),
    header: null,                          // полный ручной override первой строки (обычно не нужен)
    barId: 'pickbar',                      // id липкой полосы
    countId: 'pb-n',                       // где показываем «сколько выбрано»
    totalId: 'pb-total',                   // где показываем «сколько всего» (считается из DOM)
    copyId: 'pb-copy',
    resetId: 'pb-reset',
    groupSelector: '[data-group]',         // контейнер развилки
    optionSelector: '[data-val]',          // вариант внутри развилки
    pickedClass: 'picked',
    barOffset: '64px',                     // отступ снизу, чтобы полоса не накрыла подвал
    copiedLabel: 'Скопировано ✓',
    copyFailLabel: 'Не вышло — скопируйте вручную',
    missingLabel: 'Без ответа: '
  };

  function assign(base, extra) {
    var out = {}, k;
    for (k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k]; }
    for (k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k) && extra[k] != null) out[k] = extra[k]; }
    return out;
  }

  // JSON.parse alone loses duplicate keys. Preflight every object, including nested data.
  function strictJSON(raw) {
    var at = 0;
    function space() { while (/\s/.test(raw.charAt(at)) && at < raw.length) at++; }
    function string() {
      var start = at++;
      while (at < raw.length) {
        var ch = raw.charAt(at++);
        if (ch === '\\') { at++; continue; }
        if (ch === '"') { return JSON.parse(raw.slice(start, at)); }
      }
      throw new Error('Unterminated JSON string');
    }
    function value() {
      space(); var ch = raw.charAt(at), keys, key;
      if (ch === '{') {
        at++; space(); keys = new Set();
        if (raw.charAt(at) === '}') { at++; return; }
        while (true) {
          space(); if (raw.charAt(at) !== '"') throw new Error('Expected JSON key');
          key = string(); if (keys.has(key)) throw new Error('Duplicate JSON key'); keys.add(key);
          space(); if (raw.charAt(at++) !== ':') throw new Error('Expected colon');
          value(); space(); ch = raw.charAt(at++);
          if (ch === '}') return;
          if (ch !== ',') throw new Error('Expected comma');
        }
      }
      if (ch === '[') {
        at++; space(); if (raw.charAt(at) === ']') { at++; return; }
        while (true) { value(); space(); ch = raw.charAt(at++); if (ch === ']') return; if (ch !== ',') throw new Error('Expected comma'); }
      }
      if (ch === '"') { string(); return; }
      var token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(at));
      if (!token) throw new Error('Invalid JSON value');
      at += token[0].length;
    }
    value(); space(); if (at !== raw.length) throw new Error('Trailing JSON content');
    var parsed = JSON.parse(raw);
    function finite(item) {
      if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Nonfinite JSON number');
      if (typeof item === 'string' && /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(item)) throw new Error('Unpaired surrogate');
      if (item && typeof item === 'object') Object.keys(item).forEach(function (key) { finite(key); finite(item[key]); });
    }
    finite(parsed); return parsed;
  }

  function check(condition, message) { if (!condition) throw new Error(message); }
  var V2_SPACE = /[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g;
  function materialText(value) { return value.replace(V2_SPACE, ' ').replace(/^ | $/g, ''); }
  function text(value) { check(typeof value === 'string' && materialText(value).length > 0, 'Expected nonempty text'); }
  function object(value, required, optional) {
    check(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected object');
    required.forEach(function (key) { check(Object.prototype.hasOwnProperty.call(value, key), 'Missing ' + key); });
    Object.keys(value).forEach(function (key) { check(required.indexOf(key) >= 0 || (optional || []).indexOf(key) >= 0, 'Unknown field ' + key); });
  }
  function array(value, minimum) { check(Array.isArray(value) && value.length >= (minimum || 0), 'Expected array'); }
  function texts(value) { array(value); value.forEach(text); }
  function version(value) { check(typeof value === 'number' && Number.isFinite(value) && value === 2, 'Expected numeric schemaVersion 2'); }
  function revision(value) { check(typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value), 'Invalid revision'); }
  function unique(items) { var ids = new Set(); items.forEach(function (item) { check(!ids.has(item.id), 'Duplicate ID'); ids.add(item.id); }); }
  function manifestShape(m) {
    object(m, ['schemaVersion', 'pageId', 'revision', 'topic', 'date', 'context', 'grounds', 'decisions'], ['components']);
    version(m.schemaVersion); revision(m.revision); ['pageId', 'topic', 'date'].forEach(function (key) { text(m[key]); });
    object(m.context, ['task', 'done', 'remaining', 'whyNow', 'constraints', 'risks', 'unknowns', 'requestedAnswer']);
    ['task', 'whyNow', 'requestedAnswer'].forEach(function (key) { text(m.context[key]); });
    ['done', 'remaining', 'constraints', 'risks', 'unknowns'].forEach(function (key) { texts(m.context[key]); });
    array(m.grounds); m.grounds.forEach(function (g) {
      object(g, ['id', 'kind', 'claim', 'source'], ['basis', 'observedAt', 'commit']); Object.keys(g).forEach(function (key) { text(g[key]); });
      check(['fact', 'estimate', 'assumption', 'unknown'].indexOf(g.kind) >= 0, 'Invalid evidence kind');
      check(g.kind !== 'estimate' || Object.prototype.hasOwnProperty.call(g, 'basis'), 'Estimate requires basis');
    }); unique(m.grounds);
    array(m.decisions, 1); m.decisions.forEach(function (d) {
      object(d, ['id', 'label', 'rationale', 'recommendedOptionId', 'options'], ['excludedAlternatives']);
      ['id', 'label', 'rationale'].forEach(function (key) { text(d[key]); });
      array(d.options, 2); d.options.forEach(function (o) { object(o, ['id', 'label', 'cost', 'whenUseful']); Object.keys(o).forEach(function (key) { text(o[key]); }); }); unique(d.options);
      check(d.recommendedOptionId === null || d.options.some(function (o) { return o.id === d.recommendedOptionId; }), 'Unknown recommendation');
      if (Object.prototype.hasOwnProperty.call(d, 'excludedAlternatives')) { array(d.excludedAlternatives); d.excludedAlternatives.forEach(function (e) { object(e, ['label', 'reason', 'assumptions']); text(e.label); text(e.reason); texts(e.assumptions); }); }
    }); unique(m.decisions);
    if (Object.prototype.hasOwnProperty.call(m, 'components')) { array(m.components); m.components.forEach(function (c) { object(c, ['id', 'label']); text(c.id); text(c.label); }); unique(m.components); }
    m.schemaVersion = 2; return m;
  }
  function answerShape(m, a) {
    object(a, ['schemaVersion', 'pageId', 'revision', 'answers']); version(a.schemaVersion); text(a.pageId); revision(a.revision);
    check(a.pageId === m.pageId, 'Wrong page'); check(a.revision === m.revision, 'Revision mismatch'); array(a.answers);
    var rows = new Map();
    a.answers.forEach(function (row) {
      object(row, ['decisionId', 'status'], ['optionId', 'note']); text(row.decisionId);
      var decision = m.decisions.find(function (d) { return d.id === row.decisionId; });
      check(decision && !rows.has(row.decisionId), 'Unknown or duplicate decision');
      check(['selected', 'deferred', 'needs-data', 'unanswered'].indexOf(row.status) >= 0, 'Invalid status');
      if (row.status === 'selected') { text(row.optionId); check(decision.options.some(function (o) { return o.id === row.optionId; }), 'Unknown option'); }
      else check(!Object.prototype.hasOwnProperty.call(row, 'optionId'), 'Non-selected optionId');
      if (Object.prototype.hasOwnProperty.call(row, 'note')) { check(row.status === 'deferred' || row.status === 'needs-data', 'Invalid note state'); text(row.note); }
      rows.set(row.decisionId, row);
    }); return rows;
  }

  function initV2(cfg, bar, markers) {
    var notice = document.getElementById('decision-notice');
    if (!notice) { notice = document.createElement('p'); notice.id = 'decision-notice'; bar.parentNode.insertBefore(notice, bar); }
    notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
    function warn(message) { notice.textContent = message; }
    var copyBtn = document.getElementById(cfg.copyId), resetBtn = document.getElementById(cfg.resetId);
    var jsonField = document.getElementById('decision-answer-json');
    function invalid(error) {
      warn('Контекст страницы некорректен. Ответы недоступны: ' + error.message);
      if (copyBtn) copyBtn.disabled = true;
      if (jsonField) jsonField.value = '';
      bar.hidden = true; return { valid: false, error: error.message };
    }
    var m, groups, bindings = [];
    function nodes(root, selector) { return [].slice.call(root.querySelectorAll(selector)); }
    function visible(node) {
      for (var item = node; item; item = item.parentElement) {
        if (item.hidden || item.getAttribute('aria-hidden') === 'true' || ['SCRIPT', 'STYLE', 'DETAILS'].indexOf(item.tagName) >= 0) return false;
        var style = window.getComputedStyle(item);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.contentVisibility === 'hidden' || style.opacity === '0') return false;
      }
      return true;
    }
    function visibleText(node) {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType !== 1 || !visible(node)) return '';
      return [].slice.call(node.childNodes).map(visibleText).join('');
    }
    function labelText(node) { check(node.querySelectorAll('script,style').length === 0 && visible(node), 'Hidden label content'); return materialText(visibleText(node)); }
    function material() {
      var order = nodes(document, '[data-context],[data-ground-id],[data-option-id],[data-answer-state]');
      var firstControl = order.findIndex(function (node) { return node.hasAttribute('data-option-id') || node.hasAttribute('data-answer-state'); });
      var contexts = nodes(document, '[data-context]');
      check(contexts.length === Object.keys(m.context).length, 'Context parity');
      Object.keys(m.context).forEach(function (key) {
        var matches = contexts.filter(function (node) { return node.getAttribute('data-context') === key; }), value = m.context[key];
        check(matches.length === 1 && visible(matches[0]) && order.indexOf(matches[0]) < firstControl, 'Missing or hidden context: ' + key);
        var node = matches[0];
        if (Array.isArray(value)) {
          var rows = [].slice.call(node.children).filter(function (item) { return item.tagName === 'LI'; });
          check(JSON.stringify(rows.map(function (row) { return materialText(visibleText(row)); })) === JSON.stringify(value.map(materialText)) && (value.length || materialText(visibleText(node))), 'Context list mismatch: ' + key);
        } else check(materialText(visibleText(node)) === materialText(value), 'Context text mismatch: ' + key);
      });
      var grounds = nodes(document, '[data-ground-id]'), groundIds = new Set();
      check(grounds.length === m.grounds.length, 'Evidence parity');
      grounds.forEach(function (node) {
        var id = node.getAttribute('data-ground-id'), ground = m.grounds.find(function (item) { return item.id === id; });
        check(ground && !groundIds.has(id), 'Unknown or duplicate ground'); groundIds.add(id);
        check(visible(node) && order.indexOf(node) < firstControl && node.getAttribute('data-evidence-kind') === ground.kind && node.getAttribute('data-source') === ground.source, 'Evidence visibility/kind/source mismatch');
        var shown = materialText(visibleText(node));
        check(shown.indexOf(materialText(ground.claim)) >= 0 && shown.indexOf(materialText(ground.source)) >= 0 && (!ground.basis || shown.indexOf(materialText(ground.basis)) >= 0), 'Material evidence text missing');
      });
      bindings.forEach(function (b) {
        var labels = nodes(b.group, '[data-decision-label]'), rationale = nodes(b.group, '[data-rationale]');
        check(labels.length === 1 && labelText(labels[0]) === materialText(b.decision.label) && b.group.getAttribute('data-label') === b.decision.label, 'Decision label mismatch');
        check(rationale.length === 1 && visible(rationale[0]) && materialText(visibleText(rationale[0])) === materialText(b.decision.rationale), 'Rationale mismatch');
        b.options.forEach(function (node, index) {
          var option = b.decision.options.find(function (item) { return item.id === node.getAttribute('data-option-id'); }), labels = nodes(node, '[data-option-label]');
          check(option && visible(node) && node.getAttribute('data-val') === option.label && labels.length === 1 && labelText(labels[0]) === materialText(option.label), 'Option label mismatch');
          ['cost', 'whenUseful'].forEach(function (field) {
            var values = nodes(node, '[data-' + field.toLowerCase() + ']');
            check(values.length === 1 && visible(values[0]) && materialText(visibleText(values[0])) === materialText(option[field]), 'Option consequence mismatch: ' + field);
          });
        });
        b.states.forEach(function (node) { check(visible(node) && materialText(visibleText(node)), 'Hidden state control'); });
      });
    }
    function nearest(node) { for (var p = node.parentElement; p; p = p.parentElement) if (p.hasAttribute('data-group')) return p; return null; }
    try {
      check(markers.length === 1, 'Duplicate manifest'); var marker = markers[0];
      check(marker.tagName === 'SCRIPT' && marker.getAttribute('type') === 'application/json' && !marker.hasAttribute('src'), 'Manifest must be inert application/json');
      check(document.querySelectorAll('template,svg,math').length === 0, 'Unsupported fragment');
      m = manifestShape(strictJSON(marker.textContent)); groups = nodes(document, '[data-group]');
      check(groups.length === m.decisions.length, 'Decision parity'); var seen = new Set();
      groups.forEach(function (g) {
        var id = g.getAttribute('data-group'), d = m.decisions.find(function (item) { return item.id === id; });
        check(d && !seen.has(id) && nearest(g) === null, 'Unknown, duplicate or nested group'); seen.add(id);
        var labels = nodes(g, '[data-decision-label]');
        check(labels.length === 1 && labelText(labels[0]) === materialText(d.label) && g.getAttribute('data-label') === d.label, 'Decision label mismatch');
        var opts = nodes(g, '[data-option-id]'), ids = new Set(); check(opts.length === d.options.length, 'Option parity');
        opts.forEach(function (o) {
          var oid = o.getAttribute('data-option-id'), item = d.options.find(function (candidate) { return candidate.id === oid; }), labels = nodes(o, '[data-option-label]');
          check(nearest(o) === g && item && !ids.has(oid) && !o.hasAttribute('data-answer-state'), 'Option ownership');
          check(o.querySelectorAll('[data-option-id]').length === 0 && o.querySelectorAll('[data-answer-state]').length === 0, 'Nested control'); ids.add(oid);
          check(o.getAttribute('data-val') === item.label && labels.length === 1 && labelText(labels[0]) === materialText(item.label), 'Option label mismatch');
        });
        var states = nodes(g, '[data-answer-state]'), statuses = new Set();
        states.forEach(function (s) { var status = s.getAttribute('data-answer-state'); check(!s.querySelectorAll('[data-option-id]').length && !s.querySelectorAll('[data-answer-state]').length, 'Nested state control'); check(nearest(s) === g && ['deferred', 'needs-data', 'unanswered'].indexOf(status) >= 0 && !statuses.has(status) && !s.hasAttribute('data-val'), 'State ownership'); statuses.add(status); });
        check(statuses.size === 3, 'Three non-consent controls required');
        opts.concat(states).forEach(function (node) { check(visible(node) && ((node.tagName === 'BUTTON' && node.getAttribute('type') === 'button') || (node.getAttribute('role') === 'button' && node.getAttribute('tabindex') === '0')), 'Keyboard control required'); });
        g.setAttribute('role', 'group'); g.setAttribute('aria-label', d.label);
        bindings.push({ group: g, decision: d, options: opts, states: states });
      });
      ['[data-val]', '[data-option-id]', '[data-answer-state]'].forEach(function (selector) { nodes(document, selector).forEach(function (node) { check(bindings.some(function (b) { return b.options.indexOf(node) >= 0 || b.states.indexOf(node) >= 0; }), 'Orphan control'); }); });
      material();
    } catch (error) { return invalid(error); }
    var state = new Map(), key = 'decision-mockups:v2:' + m.pageId;
    try {
      var stored = localStorage.getItem(key);
      if (stored !== null) {
        var candidate = strictJSON(stored);
        try { state = answerShape(m, candidate); }
        catch (error) { warn(error.message === 'Revision mismatch' ? 'Контекст изменился. Подтвердите ответы заново для всей страницы.' : 'Сохранённые ответы некорректны. Ответьте заново для всей страницы.'); }
      }
    } catch (error) { warn('Сохранённые ответы недоступны или некорректны. Ответьте заново; текущий выбор доступен.'); }
    function envelope() { return { schemaVersion: 2, pageId: m.pageId, revision: m.revision, answers: m.decisions.map(function (d) { return state.get(d.id) || { decisionId: d.id, status: 'unanswered' }; }) }; }
    var api, blocked = false;
    function guard() {
      if (blocked) return false;
      try { material(); return true; }
      catch (error) {
        blocked = true; state = new Map();
        bindings.forEach(function (b) { b.options.concat(b.states).forEach(function (node) { node.classList.toggle(cfg.pickedClass, false); node.setAttribute('aria-pressed', 'false'); }); });
        invalid(error); if (api) { api.valid = false; api.error = error.message; }
        return false;
      }
    }
    function exportJSON() { return guard() ? JSON.stringify(envelope(), null, 2) : ''; }
    var nEl = document.getElementById(cfg.countId), totalEl = document.getElementById(cfg.totalId);
    if (totalEl) totalEl.textContent = String(groups.length);
    if (!jsonField) {
      var label = document.createElement('label'); label.textContent = 'JSON ответов — полный документ для проверки';
      jsonField = document.createElement('textarea'); jsonField.id = 'decision-answer-json'; jsonField.readOnly = true; label.appendChild(jsonField); bar.parentNode.insertBefore(label, bar);
    }
    jsonField.setAttribute('aria-label', 'JSON ответов — полный документ для проверки');
    function render(announce) {
      if (!guard()) return;
      var selected = 0, responded = 0;
      bindings.forEach(function (b) {
        var row = state.get(b.decision.id) || { status: 'unanswered' };
        if (row.status === 'selected') selected++; if (row.status !== 'unanswered') responded++;
        b.options.concat(b.states).forEach(function (node) {
          var on = node.hasAttribute('data-option-id') ? row.status === 'selected' && row.optionId === node.getAttribute('data-option-id') : row.status === node.getAttribute('data-answer-state');
          node.classList.toggle(cfg.pickedClass, on); node.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      });
      if (nEl) nEl.textContent = String(selected); bar.hidden = responded === 0;
      document.body.style.paddingBottom = responded ? ((bar.offsetHeight || 64) + 12) + 'px' : '';
      jsonField.value = exportJSON();
      if (announce) warn('Выбрано: ' + selected + '. Отвечено: ' + responded + ' из ' + groups.length + '. Выбор не означает выполнение.');
    }
    function save() { try { localStorage.setItem(key, exportJSON()); } catch (error) {} }
    function bind(node, action) {
      node.__dmPick = action;
      if (node.__dmBound) return; node.__dmBound = true;
      node.addEventListener('click', function () { node.__dmPick(); });
      // Native buttons already synthesize one click for Enter/Space.
      if (node.tagName !== 'BUTTON') node.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') { event.preventDefault(); node.__dmPick(); } });
    }
    bindings.forEach(function (b) {
      b.options.forEach(function (node) { bind(node, function () { if (!guard()) return; var old = state.get(b.decision.id), oid = node.getAttribute('data-option-id'); state.set(b.decision.id, old && old.status === 'selected' && old.optionId === oid ? { decisionId: b.decision.id, status: 'unanswered' } : { decisionId: b.decision.id, status: 'selected', optionId: oid }); save(); render(true); }); });
      b.states.forEach(function (node) { bind(node, function () { if (!guard()) return; state.set(b.decision.id, { decisionId: b.decision.id, status: node.getAttribute('data-answer-state') }); save(); render(true); }); });
    });
    function exportText() {
      if (!guard()) return '';
      var lines = ['Решения по ' + m.topic + ' (' + m.date + '):', 'Выбор не означает выполнение.', 'Проверка версии ожидает текущий контекст получателя.', 'Страница: ' + m.pageId, 'Версия: ' + m.revision, 'Задача: ' + m.context.task];
      [['done', 'Сделано'], ['remaining', 'Осталось'], ['constraints', 'Ограничения'], ['risks', 'Риски'], ['unknowns', 'Неизвестное']].forEach(function (pair) { lines.push(pair[1] + ': ' + (m.context[pair[0]].length ? m.context[pair[0]].join('; ') : 'не указано')); });
      lines.push('Почему сейчас: ' + m.context.whyNow, 'Нужный ответ: ' + m.context.requestedAnswer);
      m.grounds.forEach(function (g) { lines.push('Основание [' + g.kind + ']: ' + g.claim + ' — источник: ' + g.source + (g.basis ? '; база оценки: ' + g.basis : '') + (g.observedAt ? '; наблюдение: ' + g.observedAt : '') + (g.commit ? '; изменение: ' + g.commit : '')); });
      (m.components || []).forEach(function (c) { lines.push('Компонент: ' + c.label); });
      m.decisions.forEach(function (d) {
        var row = state.get(d.id) || { status: 'unanswered' }, labels = { selected: 'Выбрано', deferred: 'Отложить', 'needs-data': 'Нужны данные', unanswered: 'Нет ответа' };
        lines.push('', d.label + ': ' + labels[row.status] + (row.status === 'selected' ? ' — ' + d.options.find(function (o) { return o.id === row.optionId; }).label : '') + (row.note ? '; ' + row.note : ''), 'Обоснование: ' + d.rationale);
        if (d.recommendedOptionId !== null) lines.push('Рекомендация: ' + d.options.find(function (o) { return o.id === d.recommendedOptionId; }).label);
        d.options.forEach(function (o) { lines.push('Вариант: ' + o.label + '; цена: ' + o.cost + '; когда полезен: ' + o.whenUseful); });
        (d.excludedAlternatives || []).forEach(function (e) { lines.push('Исключено: ' + e.label + '; причина: ' + e.reason + '; допущения: ' + e.assumptions.join('; ')); });
      }); return lines.join('\n');
    }
    function copy() {
      var value = exportText(); if (!value) return;
      function fallback() { var field = document.createElement('textarea'); field.value = value; document.body.appendChild(field); field.select(); try { document.execCommand('copy'); } catch (error) {} document.body.removeChild(field); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function () { warn('Текст скопирован. JSON ответов доступен отдельно.'); }, fallback); else fallback();
    }
    if (copyBtn) { copyBtn.disabled = false; copyBtn.onclick = copy; }
    if (resetBtn) resetBtn.onclick = function () { if (!guard()) return; state = new Map(); save(); render(true); if (bindings[0].options[0]) bindings[0].options[0].focus(); };
    api = { valid: true, exportText: exportText, exportJSON: exportJSON, render: render, copy: copy, config: cfg, groups: groups.length }; render(false); return api;
  }

  function init(options) {
    var cfg = assign(DEFAULTS, options || {});

    var bar = document.getElementById(cfg.barId);
    if (!bar) { return null; }   // полосы нет — молча выходим, страница остаётся читаемой

    // Настройка через data-атрибуты полосы имеет приоритет над дефолтами,
    // но уступает явному init({...}) — чтобы разметку можно было править без кода.
    ['key', 'topic', 'date', 'header'].forEach(function (k) {
      var v = bar.getAttribute('data-' + k);
      if (v && !(options && options[k])) { cfg[k] = v; }
    });

    var markers = [].slice.call(document.querySelectorAll('[id]')).filter(function (node) { return node.getAttribute('id') === 'decision-manifest'; });
    if (markers.length || document.querySelectorAll('[data-option-id]').length || document.querySelectorAll('[data-answer-state]').length) return initV2(cfg, bar, markers);

    var groups = [].slice.call(document.querySelectorAll(cfg.groupSelector));
    var nEl = document.getElementById(cfg.countId);
    var totalEl = document.getElementById(cfg.totalId);
    var copyBtn = document.getElementById(cfg.copyId);
    var resetBtn = document.getElementById(cfg.resetId);

    // ВСЕГО развилок берём из DOM. Ручной подсчёт всегда рано или поздно врёт.
    if (totalEl) { totalEl.textContent = String(groups.length); }

    var state = {};
    try { state = JSON.parse(localStorage.getItem(cfg.key) || '{}') || {}; } catch (e) { state = {}; }

    function optionsOf(g) { return [].slice.call(g.querySelectorAll(cfg.optionSelector)); }

    function render() {
      var n = 0;
      groups.forEach(function (g) {
        var id = g.getAttribute('data-group');
        var chosen = state[id];
        if (chosen) { n++; }
        optionsOf(g).forEach(function (o) {
          var on = o.getAttribute('data-val') === chosen;
          o.classList.toggle(cfg.pickedClass, on);
          o.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      });
      if (nEl) { nEl.textContent = String(n); }
      bar.hidden = n === 0;
      // Отступ снизу меряется по фактической высоте полосы: на узком экране она
      // переносится в две строки и фиксированные 64px её больше не покрывают —
      // полоса накрывает подвал, ради которого отступ и делался.
      document.body.style.paddingBottom =
        n === 0 ? '' : ((bar.offsetHeight ? bar.offsetHeight + 12 : parseInt(cfg.barOffset, 10) || 64) + 'px');
    }

    function save() {
      try { localStorage.setItem(cfg.key, JSON.stringify(state)); } catch (e) {}   // приватный режим — не падаем
    }

    // Семантика радио внутри группы + повторный клик по выбранному снимает выбор.
    function pick(g, o) {
      var id = g.getAttribute('data-group');
      var val = o.getAttribute('data-val');
      state[id] = state[id] === val ? null : val;
      if (!state[id]) { delete state[id]; }
      save();
      render();
    }

    groups.forEach(function (g) {
      optionsOf(g).forEach(function (o) {
        // Обработчик вешается РОВНО ОДИН раз, а работу делает ссылка, которую
        // переписывает последний init(). Иначе автостарт + свой DecisionPicker.init({...})
        // дают два обработчика и два состояния под двумя ключами localStorage:
        // выбор начинает зависеть от порядка отрисовки, а перезагрузка молча его теряет.
        o.__dmPick = function () { pick(g, o); };
        if (o.__dmBound) { return; }
        o.__dmBound = true;
        o.addEventListener('click', function () { o.__dmPick(); });
        o.addEventListener('keydown', function (e) {
          // role="button" обязан отвечать на Enter и пробел — иначе клавиатурой не выбрать
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); o.__dmPick(); }
        });
      });
    });

    function exportText() {
      // Первая строка ОБЯЗАНА назвать тему и дату: вставленный в свежий чат список
      // без неё ни о чём не говорит. Форма собирается из частей, а не пишется
      // руками, — так её нельзя забыть (check_page.py, гейт G11b).
      var lines = ['Решения по ' + cfg.topic + ' (' + cfg.date + '):', ''];
      if (cfg.header) { lines[0] = cfg.header; }
      var missing = [];
      groups.forEach(function (g) {
        var id = g.getAttribute('data-group');
        var label = g.getAttribute('data-label') || id;
        if (state[id]) { lines.push(label + ': ' + state[id]); }
        else { missing.push(label.split(' — ')[0]); }   // только первый сегмент подписи
      });
      if (missing.length) { lines.push(''); lines.push(cfg.missingLabel + missing.join(', ')); }
      return lines.join('\n');
    }

    // Исходная подпись снимается ОДИН раз при старте. Если читать её в момент клика,
    // второй клик за две секунды запомнит «Скопировано ✓» как «исходное» — и кнопка
    // останется с этой подписью навсегда. Предыдущий таймер тоже гасим.
    var idleLabel = copyBtn ? copyBtn.textContent : '';
    var flashTimer = null;
    function flash(msg) {
      if (!copyBtn) { return; }
      if (flashTimer) { clearTimeout(flashTimer); }
      copyBtn.textContent = msg;
      flashTimer = setTimeout(function () { copyBtn.textContent = idleLabel; flashTimer = null; }, 2000);
    }

    function copy() {
      var text = exportText();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { flash(cfg.copiedLabel); }, fallback);
      } else { fallback(); }
      // В iframe артефакта clipboard API бывает недоступен — тогда старый добрый textarea.
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); flash(cfg.copiedLabel); }
        catch (e) { flash(cfg.copyFailLabel); }
        document.body.removeChild(ta);
      }
    }

    if (copyBtn) { copyBtn.addEventListener('click', copy); }
    if (resetBtn) { resetBtn.addEventListener('click', function () { state = {}; save(); render(); }); }

    render();

    // Наружу — чтобы можно было дёрнуть из консоли при отладке страницы.
    return { exportText: exportText, copy: copy, render: render, config: cfg, groups: groups.length };
  }

  var api = { init: init, defaults: DEFAULTS };
  global.DecisionPicker = api;

  // Автостарт с дефолтами/data-атрибутами. Нужен свой конфиг — вызовите
  // DecisionPicker.init({...}) сами; удалять этот блок больше не обязательно:
  // повторная инициализация защищена и здесь, и внутри init().
  function autostart() { if (!api.instance) { api.instance = init(); } }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autostart);
  } else {
    autostart();
  }
})(typeof window !== 'undefined' ? window : this);
