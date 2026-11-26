/* Каталог услуг: вкладки + синхронизация цен с Google Sheets.
   HTML — основа: все услуги и цены уже есть в разметке, без JS видно всё. */

/* ---------- Вкладки ----------
   Без JS это обычные ссылки на якоря, все разделы видны подряд.
   Аккордеоны — нативные <details>, скрипт им не нужен. */
(function () {
  'use strict';

  var list = document.querySelector('[data-tabs]');
  if (!list) return;

  var tabs = Array.prototype.slice.call(list.querySelectorAll('a.tab'));
  var ids = tabs.map(function (t) { return t.getAttribute('href').slice(1); });
  var panels = ids.map(function (id) { return document.getElementById(id); });
  var fallback = Math.max(0, ids.indexOf(list.getAttribute('data-tabs')));

  list.setAttribute('role', 'tablist');
  tabs.forEach(function (tab, i) {
    tab.setAttribute('role', 'tab');
    tab.id = 'tab-' + ids[i];
    tab.setAttribute('aria-controls', ids[i]);
    panels[i].setAttribute('role', 'tabpanel');
    panels[i].setAttribute('aria-labelledby', tab.id);
  });
  list.parentNode.classList.add('tabs-ready');

  function select(index) {
    tabs.forEach(function (tab, i) {
      var on = i === index;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
  }

  function choose(index) {
    select(index);
    try { history.replaceState(null, '', '#' + ids[index]); } catch (e) { /* без изменения адреса */ }
  }

  list.addEventListener('click', function (event) {
    var tab = event.target.closest('a.tab');
    if (!tab) return;
    event.preventDefault();
    choose(tabs.indexOf(tab));
  });

  list.addEventListener('keydown', function (event) {
    var i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    var next = null;
    if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else if (event.key === ' ') next = i;
    if (next === null) return;
    event.preventDefault();
    choose(next);
    tabs[next].focus();
  });

  // Якорь в адресе (например, cosmetology.html#injections) открывает нужную вкладку
  function fromHash(scroll) {
    var index = ids.indexOf(location.hash.slice(1));
    select(index < 0 ? fallback : index);
    if (index >= 0 && scroll) list.scrollIntoView();
  }

  window.addEventListener('hashchange', function () { fromHash(true); });
  fromHash(true);
  // Браузер может прокрутить к якорю уже после скрипта — выравниваем ещё раз
  window.addEventListener('load', function () {
    if (ids.indexOf(location.hash.slice(1)) >= 0) {
      setTimeout(function () { list.scrollIntoView(); }, 0);
    }
  });
})();

/* ---------- Синхронизация цен (заготовка) ----------
   Скрипт меняет только текст элементов с data-price-id.
   Пока SHEET_CSV_URL пуст, он ничего не делает.
   Колонки CSV: id, page, tab, subcategory, group, name, detail, duration, price, price_note */
(function () {
  'use strict';

  var SHEET_CSV_URL = '';
  var CACHE_KEY = 'catalog:v1';
  var CACHE_TTL = 6 * 60 * 60 * 1000;
  var NBSP = ' ';

  if (!SHEET_CSV_URL) return;

  // Разбор CSV с кавычками, запятыми и переносами строк внутри ячеек
  function parseCsv(text) {
    var rows = [], row = [], cell = '', quoted = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (quoted) throw new Error('CSV: unclosed quote');
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // Голое число приводим к виду «1 500 грн», готовую строку оставляем как есть
  function formatPrice(value) {
    if (/^\d+$/.test(value)) {
      return value.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + NBSP + 'грн';
    }
    return value;
  }

  function toPrices(text) {
    var rows = parseCsv(text.replace(/^﻿/, ''));
    var header = (rows.shift() || []).map(function (h) { return h.trim().toLowerCase(); });
    var idCol = header.indexOf('id');
    var priceCol = header.indexOf('price');
    if (idCol < 0 || priceCol < 0) throw new Error('CSV: no id/price columns');

    var prices = {};
    rows.forEach(function (r) {
      var id = (r[idCol] || '').trim();
      var price = (r[priceCol] || '').trim();
      if (id && price) prices[id] = formatPrice(price);
    });
    if (!Object.keys(prices).length) throw new Error('CSV: empty');
    return prices;
  }

  // Неизвестные id игнорируются: обходим только то, что уже есть на странице
  function apply(prices) {
    document.querySelectorAll('[data-price-id]').forEach(function (el) {
      var id = el.getAttribute('data-price-id');
      if (Object.prototype.hasOwnProperty.call(prices, id)) el.textContent = prices[id];
    });
  }

  function readCache() {
    try {
      var data = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (data && data.prices && Date.now() - data.time < CACHE_TTL) return data.prices;
    } catch (e) { /* хранилище недоступно или кэш повреждён */ }
    return null;
  }

  function writeCache(prices) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), prices: prices }));
    } catch (e) { /* работаем без кэша */ }
  }

  function init() {
    var cached = readCache();
    if (cached) { apply(cached); return; }

    fetch(SHEET_CSV_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var prices = toPrices(text);
        apply(prices);
        writeCache(prices);
      })
      .catch(function () { /* остаются цены из HTML */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
