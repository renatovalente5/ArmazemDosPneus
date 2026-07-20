/* =============================================================
   ARMAZÉM DOS PNEUS — cart.js
   Carrinho persistente (localStorage) + drawer. API global window.Cart.
   ============================================================= */
(function () {
  'use strict';
  var KEY = 'ap-cart';
  var doc = document;
  var items = load();

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function parsePrice(s) { if (typeof s === 'number') return s; var m = String(s || '').replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'); var n = parseFloat(m); return isNaN(n) ? 0 : n; }
  function fmt(n) { return n.toFixed(2).replace('.', ',') + ' €'; }

  function count() { return items.reduce(function (a, it) { return a + it.qty; }, 0); }
  function subtotal() { return items.reduce(function (a, it) { return a + it.price * it.qty; }, 0); }
  function weight() { return items.reduce(function (a, it) { return a + (it.weight || 0) * it.qty; }, 0); }

  /* ---------- API ---------- */
  var Cart = {
    add: function (p, qty) {
      qty = qty || 1;
      var ex = items.filter(function (it) { return it.id === p.id; })[0];
      if (ex) ex.qty += qty;
      else items.push({ id: p.id, name: p.name, price: parsePrice(p.price), priceStr: p.price || fmt(parsePrice(p.price)), image: p.image || '', weight: parseFloat(p.weight) || 0, qty: qty });
      save(); render(); sync(); open(); flash();
    },
    setQty: function (id, q) { var it = items.filter(function (x) { return x.id === id; })[0]; if (!it) return; it.qty = Math.max(1, q); save(); render(); sync(); },
    remove: function (id) { items = items.filter(function (x) { return x.id !== id; }); save(); render(); sync(); },
    clear: function () { items = []; save(); render(); sync(); },
    get: function () { return items.slice(); },
    count: count, subtotal: subtotal, weight: weight,
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
    return '' +
      '<div class="citem" data-id="' + esc(it.id) + '">' +
        (it.image ? '<img class="citem__img" src="' + esc(it.image) + '" alt="" onerror="this.style.visibility=\'hidden\'" />' : '<span class="citem__img"></span>') +
        '<div class="citem__info">' +
          '<p class="citem__name">' + esc(it.name) + '</p>' +
          '<p class="citem__price">' + esc(it.priceStr) + '</p>' +
          '<div class="citem__qty">' +
            '<button type="button" data-dec aria-label="Diminuir">−</button>' +
            '<span>' + it.qty + '</span>' +
            '<button type="button" data-inc aria-label="Aumentar">+</button>' +
            '<button type="button" class="citem__rm" data-rm aria-label="Remover">Remover</button>' +
          '</div>' +
        '</div>' +
        '<span class="citem__line">' + fmt(it.price * it.qty) + '</span>' +
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
    if (e.target.closest('[data-add]')) { var b = e.target.closest('[data-add]'); Cart.add({ id: b.getAttribute('data-id'), name: b.getAttribute('data-name'), price: b.getAttribute('data-price'), image: b.getAttribute('data-image'), weight: b.getAttribute('data-weight') }); return; }
    if (e.target.closest('[data-cart-open]')) { e.preventDefault(); open(); return; }
    if (e.target.closest('[data-cart-close]')) { close(); return; }
    var citem = e.target.closest('.citem'); if (citem) {
      var id = citem.getAttribute('data-id');
      var it = items.filter(function (x) { return x.id === id; })[0]; if (!it) return;
      if (e.target.closest('[data-inc]')) Cart.setQty(id, it.qty + 1);
      else if (e.target.closest('[data-dec]')) Cart.setQty(id, it.qty - 1);
      else if (e.target.closest('[data-rm]')) Cart.remove(id);
    }
    if (e.target.closest('[data-clear]')) Cart.clear();
  });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer && drawer.classList.contains('is-open')) close(); });

  render(); sync();
})();
