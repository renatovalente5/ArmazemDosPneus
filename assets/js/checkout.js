/* =============================================================
   ARMAZÉM DOS PNEUS — checkout.js
   Lê o carrinho (localStorage), calcula portes por peso e envia
   a encomenda por WhatsApp (modo reserva). Pagamento online: ver worker/.
   ============================================================= */
(function () {
  'use strict';
  var doc = document;
  var KEY = 'ap-cart';
  var items = load();
  var settings = { shipping: { free_pickup: true, tiers: [{ max_kg: 100000, price: 39.99 }], note: '' }, payment: {}, store: { whatsapp: '351935218857' } };

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return n.toFixed(2).replace('.', ',') + ' €'; }
  function subtotal() { return items.reduce(function (a, it) { return a + it.price * it.qty; }, 0); }
  function weight() { return items.reduce(function (a, it) { return a + (it.weight || 0) * it.qty; }, 0); }
  function shipCost() {
    if (delivery() === 'pickup') return 0;
    var w = weight(), tiers = settings.shipping.tiers || [];
    for (var i = 0; i < tiers.length; i++) if (w <= tiers[i].max_kg) return tiers[i].price;
    return tiers.length ? tiers[tiers.length - 1].price : 0;
  }
  function delivery() { var r = doc.querySelector('input[name="entrega"]:checked'); return r ? r.value : 'pickup'; }

  var elEmpty = doc.getElementById('co-empty');
  var elForm = doc.getElementById('co-form');
  var elDone = doc.getElementById('co-done');

  function renderItems() {
    doc.getElementById('co-items').innerHTML = items.map(function (it) {
      return '<div class="co-item"><span class="co-item__q">' + it.qty + '×</span><span class="co-item__n">' + esc(it.name) + '</span><span class="co-item__p">' + fmt(it.price * it.qty) + '</span></div>';
    }).join('');
  }
  function renderTotals() {
    var s = subtotal(), sh = shipCost();
    doc.getElementById('co-subtotal').textContent = fmt(s);
    doc.getElementById('co-ship-label').textContent = delivery() === 'pickup' ? 'Levantamento na loja' : 'Portes (' + weight().toFixed(0) + ' kg)';
    doc.getElementById('co-ship').textContent = delivery() === 'pickup' ? 'Grátis' : fmt(sh);
    doc.getElementById('co-total').textContent = fmt(s + sh);
  }

  function init() {
    if (!items.length) { if (elEmpty) elEmpty.hidden = false; return; }
    if (elForm) elForm.hidden = false;
    renderItems(); renderTotals();
    var payNote = doc.getElementById('co-pay-note');
    if (payNote && settings.payment && settings.payment.note) payNote.textContent = settings.payment.note;
    if (settings.shipping.pickup_label) { var pl = doc.getElementById('pickup-label'); if (pl) pl.textContent = settings.shipping.pickup_label; }
    if (settings.shipping.note) { var en = doc.getElementById('envio-note'); if (en) en.textContent = settings.shipping.note; }

    doc.querySelectorAll('input[name="entrega"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var addr = doc.getElementById('ship-addr'); if (addr) addr.hidden = (delivery() !== 'envio');
        renderTotals();
      });
    });

    elForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = elForm;
      var req = ['nome', 'tel']; var ok = true;
      if (delivery() === 'envio') req = req.concat(['morada', 'cp', 'localidade']);
      req.forEach(function (n) { var el = f[n]; if (el && !(el.value || '').trim()) { el.setAttribute('aria-invalid', 'true'); ok = false; } else if (el) el.removeAttribute('aria-invalid'); });
      if (!ok) { var bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }

      var L = [];
      L.push('*NOVA ENCOMENDA — Armazém dos Pneus*'); L.push('');
      items.forEach(function (it) { L.push('• ' + it.qty + '× ' + it.name + '  —  ' + fmt(it.price * it.qty)); });
      L.push('');
      L.push('Subtotal: ' + fmt(subtotal()));
      L.push((delivery() === 'pickup' ? 'Entrega: Levantar/montar na loja (grátis)' : 'Portes (' + weight().toFixed(0) + ' kg): ' + fmt(shipCost())));
      L.push('*Total: ' + fmt(subtotal() + shipCost()) + '*');
      L.push('');
      L.push('*Cliente:* ' + f.nome.value.trim());
      L.push('Telemóvel: ' + f.tel.value.trim());
      if (f.email.value.trim()) L.push('Email: ' + f.email.value.trim());
      if (f.nif.value.trim()) L.push('NIF: ' + f.nif.value.trim());
      if (delivery() === 'envio') L.push('Morada: ' + f.morada.value.trim() + ', ' + f.cp.value.trim() + ' ' + f.localidade.value.trim());
      if (f.notas.value.trim()) L.push('Notas: ' + f.notas.value.trim());

      var wa = (settings.store && settings.store.whatsapp) || '351935218857';
      window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(L.join('\n')), '_blank', 'noopener');

      try { localStorage.removeItem(KEY); } catch (e2) {}
      if (elForm) elForm.hidden = true;
      if (elDone) elDone.hidden = false;
      window.scrollTo(0, 0);
    });
  }

  fetch('data/settings.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (s) { if (s) { settings = Object.assign(settings, s); if (s.shipping) settings.shipping = Object.assign({ tiers: [] }, s.shipping); } })
    .catch(function () {})
    .then(init);
})();
