/* Общие интерактивы: мобильное меню.
   Активная страница задаётся в HTML через aria-current="page". */
(function () {
  'use strict';

  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  }

  toggle.addEventListener('click', function () {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  nav.addEventListener('click', function (event) {
    if (event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });

  // При переходе на широкий экран сбрасываем состояние бургера
  var desktop = window.matchMedia('(min-width: 920px)');
  var reset = function (event) { if (event.matches) setOpen(false); };
  if (desktop.addEventListener) desktop.addEventListener('change', reset);
})();
