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
  function fmt(n) { return Number(n).toFixed(2).replace('.', ',') + ' €'; }

  var all = [], activeCat = 'Todos', term = '';
  var limit = parseInt(grid.getAttribute('data-limit'), 10) || 0;

  function isTyre(p) { return /pneu/i.test(p.category || ''); }
  // Só é vendável online com preço real e stock. Um preço em falta no
  // backoffice nunca pode transformar-se numa cobrança de 0 €.
  function sellable(p) { return p.available !== false && Number(p.price_eur) > 0 && Number(p.stock) > 0; }

  /* Etiqueta UE (Reg. 2020/740): pneus NOVOS mostram as três classes, sendo a
     de ruído uma CLASSE A/B/C acompanhada dos dB, mais os pictogramas de neve
     e gelo. Os SEMINOVOS estão excluídos do regulamento (art. 2.º n.º 2 al. h))
     — em vez de classes inventadas, declaram DOT, sulco medido e garantia. */
  function labelHtml(p) {
    if (!isTyre(p)) return '';
    var it = [];
    if (p.condition === 'Seminovo') {
      if (p.dot) it.push('<span title="Semana/ano de fabrico">DOT ' + esc(p.dot) + '</span>');
      if (Number(p.tread_mm) > 0) it.push('<span title="Profundidade de sulco medida">Sulco ' + esc(p.tread_mm) + ' mm</span>');
      if (Number(p.warranty_months) > 0) it.push('<span title="Garantia aplicada">Garantia ' + esc(p.warranty_months) + ' meses</span>');
      if (!it.length) return '';
      return '<div class="pcard__label pcard__label--used" aria-label="Informação do pneu seminovo">' + it.join('') + '</div>';
    }
    if (p.label_fuel) it.push('<span title="Eficiência energética">⛽ ' + esc(p.label_fuel) + '</span>');
    if (p.label_grip) it.push('<span title="Aderência em piso molhado">🌧 ' + esc(p.label_grip) + '</span>');
    if (p.label_noise_class || Number(p.label_noise_db) > 0) {
      // A classe A/B/C é a exigida pelo regulamento; enquanto não for
      // preenchida no backoffice mostram-se só os dB, sem inventar classe.
      var noise = [];
      if (p.label_noise_class) noise.push(esc(p.label_noise_class));
      if (Number(p.label_noise_db) > 0) noise.push(esc(p.label_noise_db) + ' dB');
      it.push('<span title="Ruído exterior de rolamento">🔊 ' + noise.join(' · ') + '</span>');
    }
    if (p.snow_3pmsf) it.push('<span title="Homologado para neve (3PMSF)">❄ 3PMSF</span>');
    if (p.ice_grip) it.push('<span title="Aderência em gelo">🧊 Gelo</span>');
    if (!it.length) return '';
    return '<div class="pcard__label" aria-label="Etiqueta UE do pneu">' + it.join('') +
      (p.eprel_id ? '<span class="pcard__eprel" title="Ficha de informação do produto">EPREL ' + esc(p.eprel_id) + '</span>' : '') +
      '</div>';
  }

  function card(p) {
    var img = p.image
      ? '<img src="' + esc(normImg(p.image)) + '" alt="' + esc(p.name) + '" loading="lazy" />'
      : '<div class="pcard__ph" aria-hidden="true"><img src="assets/img/logo-mark.png" alt="" /></div>';
    var flags = '';
    // Só aparece a quem abriu a loja com ?teste=1. Marcado para não haver
    // dúvida de que não é um artigo à venda a sério.
    if (p.hidden === true || p.sku.indexOf('zz-') === 0) flags += '<span class="pcard__flag pcard__flag--test">Teste</span>';
    else if (p.condition === 'Seminovo') flags += '<span class="pcard__flag pcard__flag--used">Seminovo</span>';
    else if (p.featured) flags += '<span class="pcard__flag">Destaque</span>';
    var ok = sellable(p);
    var hasPrice = Number(p.price_eur) > 0;
    return '' +
      '<article class="pcard' + (ok ? '' : ' is-out') + '" data-cat="' + esc(p.category) + '" data-search="' + esc((p.name + ' ' + (p.brand || '') + ' ' + (p.size || '') + ' ' + (p.season || '')).toLowerCase()) + '">' +
        '<div class="pcard__media">' + img + flags + '</div>' +
        '<div class="pcard__body">' +
          '<div class="pcard__meta">' + (p.brand ? '<span class="pcard__brand">' + esc(p.brand) + '</span>' : '') + (p.size ? '<span class="pcard__size">' + esc(p.size) + '</span>' : '') + '</div>' +
          '<h3 class="pcard__title">' + esc(p.name) + '</h3>' +
          labelHtml(p) +
          '<div class="pcard__foot">' +
            '<span class="pcard__price">' + (hasPrice ? fmt(p.price_eur) : 'Sob consulta') + '</span>' +
            (ok
              ? '<button class="btn btn--primary btn--sm pcard__add" data-add data-sku="' + esc(p.sku) + '" data-name="' + esc(p.name) + '" data-price="' + esc(p.price_eur) + '" data-image="' + esc(normImg(p.image)) + '" data-weight="' + esc(p.weight_kg || 0) + '" data-stock="' + esc(p.stock) + '" type="button">Adicionar</button>'
              : '<span class="pcard__out">' + (hasPrice ? 'Esgotado' : 'Sob consulta') + '</span>') +
          '</div>' +
          '<a class="pcard__ask" href="' + WA + encodeURIComponent('Olá! Tenho interesse em: ' + p.name + '. Está disponível?') + '" target="_blank" rel="noopener">Perguntar disponibilidade</a>' +
        '</div>' +
      '</article>';
  }

  // Link para a loja completa, mantendo a categoria ativa (se houver).
  function storeHref() {
    return 'loja.html' + (activeCat && activeCat !== 'Todos' ? '?cat=' + encodeURIComponent(activeCat) : '');
  }

  // Cartão "Ver mais na loja" no teaser da página inicial: sinaliza que há mais
  // resultados do que os mostrados e leva à loja completa.
  function moreCard(remaining) {
    var hint = remaining > 0 ? '<span class="pcard--more__hint">+' + remaining + (remaining === 1 ? ' produto' : ' produtos') + '</span>' : '';
    return '<a class="pcard pcard--more" href="' + storeHref() + '" aria-label="Ver mais produtos na loja">' +
      '<span class="pcard--more__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg></span>' +
      '<span class="pcard--more__label">Ver mais na loja</span>' +
      hint +
      '</a>';
  }

  function apply() {
    var list = all.filter(function (p) {
      var okCat = (activeCat === 'Todos') || (p.category === activeCat);
      var okTerm = !term || (p.name + ' ' + (p.brand || '') + ' ' + (p.size || '') + ' ' + (p.season || '')).toLowerCase().indexOf(term) >= 0;
      return okCat && okTerm;
    });
    // Teaser (data-limit): destaques primeiro. Se houver MAIS do que o limite
    // (8), mostra apenas limit-1 (7) e acrescenta o cartão "Ver mais na loja".
    var more = false, remaining = 0;
    if (limit) {
      list = list.slice().sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); });
      if (list.length > limit) { remaining = list.length - (limit - 1); list = list.slice(0, limit - 1); more = true; }
    }
    if (!list.length) {
      grid.innerHTML = '<p class="catalog__loading">Sem resultados. Tente outra medida/marca ou fale connosco.</p>';
      return;
    }
    grid.innerHTML = list.map(card).join('') + (more ? moreCard(remaining) : '');
  }

  function buildFilters() {
    if (!filters) return;
    var cats = ['Todos'];
    all.forEach(function (p) { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
    filters.innerHTML = cats.map(function (c) {
      return '<button class="chip" role="tab" aria-pressed="' + (c === activeCat ? 'true' : 'false') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
    filters.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      activeCat = b.getAttribute('data-cat');
      filters.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      apply();
    });
  }

  if (search) search.addEventListener('input', function () { term = (search.value || '').trim().toLowerCase(); apply(); });

  // Imagem em falta desaparece sem quebrar o cartão. Listener em vez de
  // onerror="" inline, para o site não depender de 'unsafe-inline' numa CSP.
  grid.addEventListener('error', function (e) {
    var img = e.target;
    if (img && img.tagName === 'IMG') img.style.display = 'none';
  }, true);

  fetch('data/products.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      // Produtos sem SKU são ignorados: sem chave estável não há forma segura
      // de o servidor revalidar o preço no pagamento.
      //
      // Produtos escondidos: o interruptor "Esconder da loja" do backoffice, e
      // a convenção antiga de SKU começado por "zz-". Ficam fora do catálogo
      // mas continuam válidos no servidor — é assim que se testa um pagamento
      // real em produção sem expor o artigo a quem está a navegar.
      //
      // Para os ver e comprar: ?teste=1 no endereço da loja. Tem de ser assim e
      // não pelo interruptor, senão testar obrigava a publicar duas vezes —
      // desligar, comprar, voltar a ligar.
      var verEscondidos = false;
      try { verEscondidos = new URLSearchParams(location.search).has('teste'); } catch (e) {}
      all = ((data && data.products) || []).filter(function (p) {
        if (!p || !p.sku) return false;
        return verEscondidos || !(p.hidden === true || p.sku.indexOf('zz-') === 0);
      });
      window.__products = all;
      // Categoria vinda do teaser da homepage (?cat=...) — pré-seleciona o filtro.
      var qcat = null; try { qcat = new URLSearchParams(location.search).get('cat'); } catch (e) {}
      if (qcat && all.some(function (p) { return p.category === qcat; })) activeCat = qcat;
      buildFilters(); apply();
    })
    .catch(function () { grid.innerHTML = '<p class="catalog__loading">Não foi possível carregar os produtos. Contacte-nos por WhatsApp.</p>'; });
})();
