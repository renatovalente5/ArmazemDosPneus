/* =============================================================
   ARMAZÉM DOS PNEUS — cart.js
   Carrinho persistente (localStorage) + drawer. API global window.Cart.

   O item guarda o SKU (chave estável, validada no servidor) e o preço em
   CÊNTIMOS INTEIROS. O preço guardado aqui é só para mostrar: quem manda no
   valor cobrado é o Worker, que o recalcula a partir de data/products.json.
   ============================================================= */
(function () {
  'use strict';
  var KEY = 'ap-cart-v2';   // v2: itens passaram a ter sku + price_cents
  var MAX_QTY = 8;          // por linha; o stock real pode baixar este limite
  var doc = document;
  var items = load();

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY)) || [];
      // Descarta o que não tem sku (formato antigo ou dados corrompidos).
      return raw.filter(function (it) { return it && it.sku && it.price_cents > 0; });
    } catch (e) { return []; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cents(v) { return Math.round(parseFloat(String(v).replace(',', '.')) * 100) || 0; }
  function fmt(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }

  function count() { return items.reduce(function (a, it) { return a + it.qty; }, 0); }
  function subtotal() { return items.reduce(function (a, it) { return a + it.price_cents * it.qty; }, 0); }
  function weight() { return items.reduce(function (a, it) { return a + (it.weight || 0) * it.qty; }, 0); }
  function capOf(it) { return Math.max(1, Math.min(MAX_QTY, it.stock || MAX_QTY)); }
  function find(sku) { return items.filter(function (x) { return x.sku === sku; })[0]; }

  /* ---------- API ---------- */
  var Cart = {
    add: function (p, qty) {
      var c = cents(p.price);
      if (!p.sku || c <= 0) return;   // nunca deixar entrar um produto sem preço
      qty = qty || 1;
      var ex = find(p.sku);
      if (ex) ex.qty = Math.min(capOf(ex), ex.qty + qty);
      else items.push({
        sku: p.sku, name: p.name, price_cents: c, image: p.image || '',
        weight: parseFloat(p.weight) || 0, stock: parseInt(p.stock, 10) || MAX_QTY,
        qty: Math.min(parseInt(p.stock, 10) || MAX_QTY, Math.min(MAX_QTY, qty))
      });
      save(); render(); sync(); open(); flash();
    },
    setQty: function (sku, q) {
      var it = find(sku); if (!it) return;
      it.qty = Math.max(1, Math.min(capOf(it), q));
      save(); render(); sync();
    },
    remove: function (sku) { items = items.filter(function (x) { return x.sku !== sku; }); save(); render(); sync(); },
    clear: function () { items = []; save(); render(); sync(); },
    get: function () { return items.slice(); },
    /* O que vai para o servidor: apenas sku + quantidade. Nunca preços. */
    payload: function () { return items.map(function (it) { return { sku: it.sku, qty: it.qty }; }); },
    count: count, subtotal: subtotal, weight: weight, fmt: fmt,
    open: open, close: close
  };
  window.Cart = Cart;

  /* ---------- Drawer ---------- */
  var drawer = doc.getElementById('cart');
  var body = doc.getElementById('cart-body');
  var foot = doc.getElementById('cart-foot');
  var lastFocus = null;

  function open() { if (!drawer) return; lastFocus = doc.activeElement; drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false'); doc.body.classList.add('cart-open'); var c = drawer.querySelector('.cart__close'); if (c) setTimeout(function () { c.focus(); }, 50); }
  function close() { if (!drawer) return; drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true'); doc.body.classList.remove('cart-open'); if (lastFocus) lastFocus.focus(); }

  function itemHtml(it) {
    var atCap = it.qty >= capOf(it);
    return '' +
      '<div class="citem" data-sku="' + esc(it.sku) + '">' +
        (it.image ? '<img class="citem__img" src="' + esc(it.image) + '" alt="" />' : '<span class="citem__img"></span>') +
        '<div class="citem__info">' +
          '<p class="citem__name">' + esc(it.name) + '</p>' +
          '<p class="citem__price">' + fmt(it.price_cents) + '</p>' +
          '<div class="citem__qty">' +
            '<button type="button" data-dec aria-label="Diminuir">−</button>' +
            '<span>' + it.qty + '</span>' +
            '<button type="button" data-inc aria-label="Aumentar"' + (atCap ? ' disabled' : '') + '>+</button>' +
            '<button type="button" class="citem__rm" data-rm aria-label="Remover">Remover</button>' +
          '</div>' +
          (atCap && it.stock <= MAX_QTY ? '<p class="citem__cap">Máximo disponível: ' + it.stock + '</p>' : '') +
        '</div>' +
        '<span class="citem__line">' + fmt(it.price_cents * it.qty) + '</span>' +
      '</div>';
  }

  function render() {
    if (!body) return;
    if (!items.length) {
      body.innerHTML = '<div class="cart__empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.4 12.2a2 2 0 002 1.6h8.7a2 2 0 002-1.6L22 8H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><p>O seu carrinho está vazio.</p><a class="btn btn--primary" href="#loja" data-cart-close>Ver pneus</a></div>';
      if (foot) { foot.hidden = true; foot.innerHTML = ''; }
      return;
    }
    body.innerHTML = items.map(itemHtml).join('');
    if (foot) {
      foot.hidden = false;
      foot.innerHTML = '' +
        '<div class="cart__row"><span>Subtotal</span><strong>' + fmt(subtotal()) + '</strong></div>' +
        '<p class="cart__note">Portes calculados no passo seguinte — <strong>levantamento na loja é grátis</strong>.</p>' +
        '<a class="btn btn--primary btn--lg cart__checkout" href="checkout.html">Finalizar encomenda</a>' +
        '<button class="cart__clear" type="button" data-clear>Esvaziar carrinho</button>';
    }
  }

  /* nav badge + external sync */
  function sync() {
    var n = count();
    doc.querySelectorAll('[data-cart-count]').forEach(function (el) { el.textContent = n; el.hidden = n === 0; });
    try { window.dispatchEvent(new CustomEvent('cart:updated', { detail: { count: n } })); } catch (e) {}
  }
  function flash() { var b = doc.querySelector('.nav__cart'); if (b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); } }

  /* ---------- Eventos ---------- */
  doc.addEventListener('click', function (e) {
    if (e.target.closest('[data-add]')) {
      var b = e.target.closest('[data-add]');
      Cart.add({
        sku: b.getAttribute('data-sku'), name: b.getAttribute('data-name'),
        price: b.getAttribute('data-price'), image: b.getAttribute('data-image'),
        weight: b.getAttribute('data-weight'), stock: b.getAttribute('data-stock')
      });
      return;
    }
    if (e.target.closest('[data-cart-open]')) { e.preventDefault(); open(); return; }
    if (e.target.closest('[data-cart-close]')) { close(); return; }
    var citem = e.target.closest('.citem'); if (citem) {
      var sku = citem.getAttribute('data-sku');
      var it = find(sku); if (!it) return;
      if (e.target.closest('[data-inc]')) Cart.setQty(sku, it.qty + 1);
      else if (e.target.closest('[data-dec]')) Cart.setQty(sku, it.qty - 1);
      else if (e.target.closest('[data-rm]')) Cart.remove(sku);
    }
    if (e.target.closest('[data-clear]')) Cart.clear();
  });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer && drawer.classList.contains('is-open')) close(); });

  // Imagem em falta no carrinho não deve deixar um quadrado partido.
  if (body) body.addEventListener('error', function (e) { if (e.target && e.target.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);

  /* ---------- Sincronização com o catálogo ----------
     O carrinho vive no localStorage e pode ter semanas. Sem isto, mostrava
     preços que já não existem — e o cliente só descobriria a diferença ao
     pagar. Aqui os preços, nomes e stock são realinhados com o catálogo, e
     o que desapareceu ou esgotou sai do carrinho. */
  function resync(products) {
    var bySku = {};
    products.forEach(function (p) { if (p && p.sku) bySku[p.sku] = p; });
    var changed = false, removed = [];

    items = items.filter(function (it) {
      var p = bySku[it.sku];
      var price = p ? Math.round(Number(p.price_eur) * 100) : 0;
      var stock = p ? parseInt(p.stock, 10) || 0 : 0;
      if (!p || p.available === false || price <= 0 || stock <= 0) {
        removed.push(it.name); changed = true; return false;
      }
      if (it.price_cents !== price) { it.price_cents = price; changed = true; }
      if (it.stock !== stock) { it.stock = stock; changed = true; }
      if (it.name !== p.name) { it.name = p.name; changed = true; }
      var w = Number(p.weight_kg) || 0;
      if (it.weight !== w) { it.weight = w; changed = true; }
      if (it.qty > stock) { it.qty = stock; changed = true; }
      return true;
    });

    if (changed) { save(); render(); sync(); }
    if (removed.length) {
      try {
        window.dispatchEvent(new CustomEvent('cart:removed', { detail: { names: removed } }));
      } catch (e) {}
    }
  }

  // Reaproveita o catálogo se a página já o carregou (loja/homepage).
  if (window.__products && window.__products.length) resync(window.__products);
  else {
    fetch('data/products.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.products) resync(d.products); })
      .catch(function () {});   // offline: fica com os valores guardados
  }

  render(); sync();
})();
