/* =============================================================
   ARMAZÉM DOS PNEUS — main.js
   Header dinâmico · menu mobile full-screen · scrollspy · reveals
   ============================================================= */
(function () {
  'use strict';
  var doc = document;

  /* ---------- Header: encolher no scroll ---------- */
  var header = doc.querySelector('[data-header]');
  if (header) {
    var scrolled = false, ticking = false;
    var onScroll = function () {
      var s = window.scrollY > 24;
      if (s !== scrolled) { scrolled = s; header.classList.toggle('is-scrolled', s); }
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(onScroll); ticking = true; }
    }, { passive: true });
    onScroll();

    /* Onde um salto para âncora tem de parar.
       O CSS tinha scroll-padding-top:78px fixo, que não corresponde a nenhum
       estado real do cabeçalho: mede 106/71 px no desktop, 86/65 até 920 px e
       78/67 até 420 px. Resultado, o título da secção ficava por baixo do
       cabeçalho em alguns tamanhos de ecrã e com um vão a mais noutros.
       Mede-se o estado "rolado" porque é nesse que qualquer salto acaba — a
       página só salta para longe, e a essa altura já há scroll. */
    var ajustarOffset = function () {
      var tinha = header.classList.contains('is-scrolled');
      // A classe é posta e tirada dentro do mesmo bloco síncrono, com as
      // transições desligadas: getBoundingClientRect força o cálculo do
      // layout, mas nada chega a ser pintado, logo não há tremura visível.
      header.classList.add('no-anim');
      header.classList.add('is-scrolled');
      var alt = Math.round(header.getBoundingClientRect().height);
      if (!tinha) header.classList.remove('is-scrolled');
      header.classList.remove('no-anim');
      if (alt > 0) doc.documentElement.style.scrollPaddingTop = (alt + 14) + 'px';
    };
    ajustarOffset();
    var tRedim;
    window.addEventListener('resize', function () {
      clearTimeout(tRedim); tRedim = setTimeout(ajustarOffset, 150);
    });
  }

  /* ---------- Menu mobile (ecrã inteiro) ---------- */
  var menu = doc.getElementById('mobile-menu');
  var openBtn = doc.querySelector('[data-menu-open]');
  var lastFocus = null;
  function focusables() { return menu ? menu.querySelectorAll('a[href],button:not([disabled])') : []; }
  function openMenu() {
    if (!menu) return;
    lastFocus = doc.activeElement;
    menu.classList.add('is-open'); menu.setAttribute('aria-hidden', 'false');
    openBtn && openBtn.setAttribute('aria-expanded', 'true');
    doc.body.classList.add('menu-open');
    var f = focusables(); if (f.length) setTimeout(function () { f[0].focus(); }, 60);
  }
  function closeMenu() {
    if (!menu) return;
    menu.classList.remove('is-open'); menu.setAttribute('aria-hidden', 'true');
    openBtn && openBtn.setAttribute('aria-expanded', 'false');
    doc.body.classList.remove('menu-open');
    if (lastFocus) lastFocus.focus();
  }
  if (openBtn) openBtn.addEventListener('click', openMenu);
  doc.querySelectorAll('[data-menu-close]').forEach(function (b) { b.addEventListener('click', closeMenu); });
  menu && menu.querySelectorAll('[data-menu-link]').forEach(function (a) { a.addEventListener('click', closeMenu); });
  doc.addEventListener('keydown', function (e) {
    if (!menu || !menu.classList.contains('is-open')) return;
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.key === 'Tab') {
      var f = focusables(); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  var mq = window.matchMedia('(min-width:921px)');
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () {
    if (menu && mq.matches && menu.classList.contains('is-open')) closeMenu();
  });

  /* ---------- Scrollspy ---------- */
  var navLinks = Array.prototype.slice.call(doc.querySelectorAll('.nav__links a'));
  var sections = navLinks.map(function (a) { var hr = a.getAttribute('href') || ''; return hr.charAt(0) === '#' ? doc.querySelector(hr) : null; }).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var id = en.target.id;
          navLinks.forEach(function (a) { a.classList.toggle('is-current', a.getAttribute('href') === '#' + id); });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------- Reveal on scroll (nunca esconde conteúdo) ---------- */
  var reveals = doc.querySelectorAll('[data-reveal]');
  function revealAll() { reveals.forEach(function (el) { el.classList.add('is-in'); }); }
  function inView(el) { var r = el.getBoundingClientRect(); return r.top < (window.innerHeight || 0) && r.bottom > 0; }
  if ('IntersectionObserver' in window && reveals.length) {
    var ro = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); obs.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { ro.observe(el); });
    var showInView = function () { reveals.forEach(function (el) { if (inView(el)) el.classList.add('is-in'); }); };
    showInView();
    window.addEventListener('load', function () { showInView(); setTimeout(revealAll, 4000); });
  } else { revealAll(); }

  /* ---------- Imagens editáveis (data/content.json) ---------- */
  (function () {
    var slots = doc.querySelectorAll('[data-img]'); if (!slots.length) return;
    function normImg(p) { if (!p) return ''; if (/^https?:\/\//.test(p)) return p; return p.replace(/^\/+/, ''); }
    var MAP = { 'hero': ['hero', 'image'], 'sobre': ['sobre', 'image'] };
    fetch('data/content.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (c) {
        slots.forEach(function (el) {
          var path = MAP[el.getAttribute('data-img')]; if (!path) return;
          var v = c && c[path[0]] && c[path[0]][path[1]];
          if (v) { var n = normImg(v); if (n && n !== el.getAttribute('src')) el.src = n; }
        });
      }).catch(function () {});
  })();

  /* ---------- Consentimento de cookies + Mapa (Google Maps) ---------- */
  (function () {
    var KEY = 'ap-consent';
    var banner = doc.getElementById('cookie-banner');
    function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
    function show() { if (banner) banner.hidden = false; }
    function hide() { if (banner) banner.hidden = true; }
    function loadMap() {
      var host = doc.getElementById('map-facade'); if (!host) return;
      var f = doc.createElement('iframe');
      f.src = host.getAttribute('data-map-embed'); f.title = host.getAttribute('data-map-title') || 'Mapa';
      f.loading = 'lazy'; f.setAttribute('referrerpolicy', 'no-referrer');
      f.style.cssText = 'display:block;width:100%;height:400px;border:0'; host.replaceWith(f);
    }
    var cur = get();
    if (cur === 'accepted') loadMap(); else if (cur !== 'rejected') show();
    if (banner) banner.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cookie]'); if (!b) return;
      if (b.getAttribute('data-cookie') === 'accept') { set('accepted'); hide(); loadMap(); } else { set('rejected'); hide(); }
    });
    var facade = doc.getElementById('map-facade');
    if (facade) facade.addEventListener('click', function () { if (get() === 'accepted') loadMap(); else show(); });
    doc.querySelectorAll('[data-cookie-manage]').forEach(function (el) { el.addEventListener('click', function (e) { e.preventDefault(); show(); }); });
  })();

  /* ---------- Formulário de orçamento → WhatsApp ---------- */
  (function () {
    var form = doc.getElementById('quote-form'); if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nome = (form.nome.value || '').trim();
      var servico = form.servico.value || '';
      var msg = (form.mensagem.value || '').trim();
      if (!nome) { form.nome.focus(); form.nome.setAttribute('aria-invalid', 'true'); return; }
      form.nome.removeAttribute('aria-invalid');
      var text = 'Olá! Sou ' + nome + '.' + (servico ? ' Preciso de: ' + servico + '.' : '') + (msg ? ' ' + msg : '') + ' Podem dar-me um orçamento?';
      window.open('https://wa.me/351935218857?text=' + encodeURIComponent(text), '_blank', 'noopener');
    });
  })();

  /* ---------- Ano no footer ---------- */
  var y = doc.querySelector('[data-year]'); if (y) y.textContent = new Date().getFullYear();
})();
