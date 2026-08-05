/* =============================================================
   ARMAZÉM DOS PNEUS — obrigado.js
   Lê ?session_id= e pergunta ao Worker o estado da encomenda.

   Três desfechos, e o do meio é o mais importante de acertar: com
   referência Multibanco o cliente chega aqui SEM ter pago, e isso é o
   percurso normal — não pode parecer um erro.
   ============================================================= */
(function () {
  'use strict';
  var doc = document;
  var KEY = 'ap-cart-v2';

  var WORKER_PROD = 'https://armazem-dos-pneus-pay.renato-lima-valente-dcb.workers.dev';
  var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var WORKER = isLocal ? 'http://localhost:8787' : WORKER_PROD;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }
  function show(id) {
    ['ob-loading', 'ob-paid', 'ob-pending', 'ob-unknown'].forEach(function (x) {
      var el = doc.getElementById(x); if (el) el.hidden = (x !== id);
    });
  }
  function clearCart() { try { localStorage.removeItem(KEY); } catch (e) {} }

  function receipt(d) {
    var linhas = (d.lines || []).map(function (l) {
      return '<div class="co-item"><span class="co-item__q">' + l.qty + '×</span><span class="co-item__n">' + esc(l.name) + '</span><span class="co-item__p">' + fmt(l.unit_cents * l.qty) + '</span></div>';
    }).join('');
    var portes = d.shipping_cents
      ? '<div class="co__line"><span>Portes</span><strong>' + fmt(d.shipping_cents) + '</strong></div>'
      : '<div class="co__line"><span>Entrega</span><strong>Levantamento na loja</strong></div>';
    return linhas +
      '<div class="co__line"><span>Subtotal</span><strong>' + fmt(d.subtotal_cents) + '</strong></div>' +
      portes +
      '<div class="co__line co__line--total"><span>Total pago</span><strong>' + fmt(d.total_cents) + '</strong></div>' +
      '<p class="co__vat">IVA 23% e ecovalor incluídos.</p>';
  }

  function stepsFor(d) {
    var s = [];
    s.push('Recebe a <strong>fatura</strong> por email, emitida hoje.');
    if (d.entrega === 'ctt') {
      s.push('Preparamos e expedimos a encomenda pelos CTT.');
      s.push('Recebe em casa. Se precisar de ajuda, ligue 935 218 857.');
    } else {
      s.push('Contactamos para combinar o <strong>levantamento e a montagem</strong>.');
      s.push('Leve o número da encomenda quando vier à loja.');
    }
    s.push('Tem <strong>14 dias</strong> para mudar de ideias — <a href="legal/livre-resolucao.html">formulário de livre resolução</a>.');
    return s.map(function (x) { return '<li>' + x + '</li>'; }).join('');
  }

  function renderPaid(d) {
    doc.getElementById('paid-order').textContent = d.order_id;
    doc.getElementById('paid-receipt').innerHTML = receipt(d);
    doc.getElementById('paid-steps').innerHTML = stepsFor(d);
    show('ob-paid');
    clearCart();   // só aqui: quem cancelou tem de encontrar o carrinho intacto
  }

  function renderPending(d) {
    doc.getElementById('pend-order').textContent = d.order_id;
    var mb = d.multibanco;
    // O título só fala em "referência" quando existe mesmo uma. Sem ela
    // (ex.: MB WAY ainda a processar) seria confuso e parecia erro.
    if (mb && mb.reference) {
      doc.getElementById('pend-title').textContent = 'Falta pagar a referência';
      doc.getElementById('pend-lead').innerHTML = 'Guardámos a sua encomenda <strong>' + esc(d.order_id) + '</strong>. Pague a referência abaixo e tratamos do resto.';
      doc.getElementById('pend-tip-pagar').hidden = false;
      doc.getElementById('pend-tip-email').textContent = 'Enviámos também a referência para o seu email.';

      doc.getElementById('mb-entity').textContent = mb.entity;
      doc.getElementById('mb-ref').textContent = mb.reference;
      doc.getElementById('mb-amount').textContent = fmt(d.total_cents);
      var expRow = doc.getElementById('mb-exp-row');
      if (mb.expires_at) {
        doc.getElementById('mb-exp').textContent = new Date(mb.expires_at * 1000).toLocaleDateString('pt-PT');
      } else if (expRow) { expRow.hidden = true; }
      if (mb.hosted_voucher_url) {
        var v = doc.getElementById('mb-voucher');
        v.href = mb.hosted_voucher_url; v.hidden = false;
      }
      doc.getElementById('pend-mb').hidden = false;
    } else {
      // Pagamento ainda a processar sem referência visível (ex.: MB WAY lento).
      doc.getElementById('pend-generic').hidden = false;
    }
    show('ob-pending');
    clearCart();   // a encomenda existe no servidor; o carrinho já não serve
  }

  var sid = null;
  try { sid = new URLSearchParams(location.search).get('session_id'); } catch (e) {}

  if (!sid || !/^cs_[A-Za-z0-9_]{10,}$/.test(sid)) { show('ob-unknown'); return; }

  fetch(WORKER + '/order?session_id=' + encodeURIComponent(sid), { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (d) {
      if (d.paid) renderPaid(d);
      else renderPending(d);
    })
    .catch(function () { show('ob-unknown'); });
})();
