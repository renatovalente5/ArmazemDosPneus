/* =============================================================
   ARMAZÉM DOS PNEUS — catalog.js
   Renderiza o catálogo (data/products.json) com filtros, pesquisa
   e "adicionar ao carrinho". Editável no backoffice.
   ============================================================= */
(function () {
  'use strict';
  var grid = document.getElementById('catalog-grid');
  var filters = document.getElementById('catalog-filters');
  var search = document.getElementById('catalog-search');
  if (!grid) return;

  var WA = 'https://wa.me/351935218857?text=';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function normImg(p) { if (!p) return ''; if (/^https?:\/\//.test(p)) return p; return p.replace(/^\/+/, ''); }
  function slug(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

  var all = [], activeCat = 'Todos', term = '';
  var limit = parseInt(grid.getAttribute('data-limit'), 10) || 0;

  function isTyre(p) { return /pneu/i.test(p.category || ''); }

  function labelHtml(p) {
    if (!p.label_fuel && !p.label_grip && !p.label_noise) return '';
    var it = [];
    if (p.label_fuel) it.push('<span title="Eficiência de combustível">⛽ ' + esc(p.label_fuel) + '</span>');
    if (p.label_grip) it.push('<span title="Aderência em piso molhado">🌧 ' + esc(p.label_grip) + '</span>');
    if (p.label_noise) it.push('<span title="Ruído exterior">🔊 ' + esc(p.label_noise) + '</span>');
    return '<div class="pcard__label" aria-label="Etiqueta UE do pneu">' + it.join('') + '</div>';
  }

  function card(p, i) {
    var id = p.id || ('p' + i);
    var img = p.image
      ? '<img src="' + esc(normImg(p.image)) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.onerror=null;this.style.display=\'none\';" />'
      : '<div class="pcard__ph" aria-hidden="true"><img src="assets/img/logo-mark.png" alt="" /></div>';
    var flags = '';
    if (p.condition === 'Seminovo') flags += '<span class="pcard__flag pcard__flag--used">Seminovo</span>';
    else if (p.featured) flags += '<span class="pcard__flag">Destaque</span>';
    var soldout = (p.available === false);
    return '' +
      '<article class="pcard' + (soldout ? ' is-out' : '') + '" data-cat="' + esc(p.category) + '" data-search="' + esc((p.name + ' ' + (p.brand || '') + ' ' + (p.size || '') + ' ' + (p.season || '')).toLowerCase()) + '">' +
        '<div class="pcard__media">' + img + flags + '</div>' +
        '<div class="pcard__body">' +
          '<div class="pcard__meta">' + (p.brand ? '<span class="pcard__brand">' + esc(p.brand) + '</span>' : '') + (p.size ? '<span class="pcard__size">' + esc(p.size) + '</span>' : '') + '</div>' +
          '<h3 class="pcard__title">' + esc(p.name) + '</h3>' +
          labelHtml(p) +
          '<div class="pcard__foot">' +
            '<span class="pcard__price">' + esc(p.price || 'Sob consulta') + '</span>' +
            (soldout
              ? '<span class="pcard__out">Esgotado</span>'
              : '<button class="btn btn--primary btn--sm pcard__add" data-add data-id="' + esc(id) + '" data-name="' + esc(p.name) + '" data-price="' + esc(p.price || '') + '" data-image="' + esc(normImg(p.image)) + '" data-weight="' + esc(p.weight_kg || 0) + '" type="button">Adicionar</button>') +
          '</div>' +
          '<a class="pcard__ask" href="' + WA + encodeURIComponent('Olá! Tenho interesse em: ' + p.name + '. Está disponível?') + '" target="_blank" rel="noopener">Perguntar disponibilidade</a>' +
        '</div>' +
      '</article>';
  }

  function apply() {
    var list = all.filter(function (p) {
      var okCat = (activeCat === 'Todos') || (p.category === activeCat);
      var okTerm = !term || (p.name + ' ' + (p.brand || '') + ' ' + (p.size || '') + ' ' + (p.season || '')).toLowerCase().indexOf(term) >= 0;
      return okCat && okTerm;
    });
    if (limit && activeCat === 'Todos' && !term) {
      list = list.slice().sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); }).slice(0, limit);
    }
    grid.innerHTML = list.length ? list.map(card).join('') : '<p class="catalog__loading">Sem resultados. Tente outra medida/marca ou fale connosco.</p>';
  }

  function buildFilters() {
    if (!filters) return;
    var cats = ['Todos'];
    all.forEach(function (p) { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
    filters.innerHTML = cats.map(function (c) {
      return '<button class="chip" role="tab" aria-pressed="' + (c === 'Todos' ? 'true' : 'false') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
    filters.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      activeCat = b.getAttribute('data-cat');
      filters.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      apply();
    });
  }

  if (search) search.addEventListener('input', function () { term = (search.value || '').trim().toLowerCase(); apply(); });

  fetch('data/products.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      all = ((data && data.products) || []).map(function (p, i) { p.id = p.id || slug((p.brand || '') + '-' + p.name + '-' + i); return p; });
      window.__products = all;
      buildFilters(); apply();
    })
    .catch(function () { grid.innerHTML = '<p class="catalog__loading">Não foi possível carregar os produtos. Contacte-nos por WhatsApp.</p>'; });
})();
