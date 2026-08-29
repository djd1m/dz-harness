/*
 * picker.js — механика выбора и экспорта решений (decision-mockups)
 * =================================================================
 *
 * Что делает: превращает развилки на странице в кликабельные радио-группы,
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
 *   data-topic="разбору ревью такого-то"
 *   data-date="13.08"
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
 *   Находка #2 — порядок слияния веток: Вариант A — рекомендуем
 *   Вопрос 1 — главная цифра витрины: Заменить процент на дельту статусов
 *   <пустая строка>
 *   Без ответа: Находка #9, Вопрос 4
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
