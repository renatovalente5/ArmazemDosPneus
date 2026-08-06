/* =============================================================
   ARMAZÉM DOS PNEUS — checkout.js
   Recolhe os dados, mostra o resumo e encaminha para a página segura de
   pagamento da Stripe.

   O que vai para o servidor: apenas { sku, qty } + dados do cliente.
   NUNCA preços, pesos ou totais — quem os calcula é o Worker, a partir de
   data/products.json. Os valores mostrados aqui são um espelho para o
   cliente ver; se divergirem do servidor, o cliente é avisado antes de pagar.
   ============================================================= */
(function () {
  'use strict';
  var doc = document;
  var KEY = 'ap-cart-v2';

  /* URL do Worker de pagamentos (publicado a 2026-08-05). Se um dia o domínio
     passar a estar na Cloudflare, isto pode virar pay.armazemdospneus.pt. */
  var WORKER_PROD = 'https://armazem-dos-pneus-pay.renato-lima-valente-dcb.workers.dev';
  var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var WORKER = isLocal ? 'http://localhost:8787' : WORKER_PROD;

  var items = load();
  var settings = {
    shipping: { pickup_label: 'Levantar e montar na loja', note: '', tiers: [] },
    delivery: { estimate_min_days: 2, estimate_max_days: 5, max_days: 30 },
    returns: { return_cost_eur: null },
    payment: {}
  };

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY)) || [];
      return raw.filter(function (it) { return it && it.sku && it.price_cents > 0; });
    } catch (e) { return []; }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }
  function subtotal() { return items.reduce(function (a, it) { return a + it.price_cents * it.qty; }, 0); }
  function weight() { return items.reduce(function (a, it) { return a + (it.weight || 0) * it.qty; }, 0); }
  function delivery() { var r = doc.querySelector('input[name="entrega"]:checked'); return r ? r.value : 'pickup'; }

  /* Portes por acordar: a loja ainda não tem tabela, por isso não se cobra nada
     de portes e o valor é combinado depois. O servidor faz o mesmo — isto aqui
     é só o espelho. */
  function portesACombinar() {
    return !!(settings.shipping && settings.shipping.quote_later) && delivery() !== 'pickup';
  }

  /* Espelho da tabela de portes. O valor cobrado é sempre o do servidor. */
  function shipCost() {
    if (delivery() === 'pickup' || portesACombinar()) return 0;
    var w = weight(), tiers = settings.shipping.tiers || [];
    for (var i = 0; i < tiers.length; i++) if (w <= tiers[i].max_kg) return Math.round(tiers[i].price * 100);
    return tiers.length ? Math.round(tiers[tiers.length - 1].price * 100) : 0;
  }

  var elEmpty = doc.getElementById('co-empty');
  var elForm = doc.getElementById('co-form');
  var elErr = doc.getElementById('co-error');
  var elSubmit = doc.getElementById('co-submit');

  function renderItems() {
    doc.getElementById('co-items').innerHTML = items.map(function (it) {
      return '<div class="co-item"><span class="co-item__q">' + it.qty + '×</span><span class="co-item__n">' + esc(it.name) + '</span><span class="co-item__p">' + fmt(it.price_cents * it.qty) + '</span></div>';
    }).join('');
  }
  function renderTotals() {
    var s = subtotal(), sh = shipCost();
    doc.getElementById('co-subtotal').textContent = fmt(s);
    var combinar = portesACombinar();
    doc.getElementById('co-ship-label').textContent = delivery() === 'pickup'
      ? 'Levantamento na loja'
      : (combinar ? 'Portes' : 'Portes (' + weight().toFixed(0) + ' kg)');
    doc.getElementById('co-ship').textContent = delivery() === 'pickup'
      ? 'Grátis'
      : (combinar ? 'A combinar' : fmt(sh));
    doc.getElementById('co-total').textContent = fmt(s + sh);
    // O aviso só aparece com o envio escolhido — no levantamento não há portes
    // e mostrá-lo lá só assustava quem não vai pagar nada.
    var aviso = doc.getElementById('envio-combinar');
    if (aviso) aviso.hidden = !combinar;
  }

  function showError(msg) {
    if (!elErr) return;
    elErr.textContent = msg;
    elErr.hidden = false;
    elErr.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function clearError() { if (elErr) { elErr.hidden = true; elErr.textContent = ''; } }
  function busy(on) {
    if (!elSubmit) return;
    elSubmit.disabled = on;
    elSubmit.classList.toggle('is-busy', on);
    var l = elSubmit.querySelector('.co__submit-label');
    if (l) l.textContent = on ? 'A preparar o pagamento…' : 'Pagar agora';
  }

  function invalid(el, msg) {
    el.setAttribute('aria-invalid', 'true');
    el.focus();
    showError(msg);
    return false;
  }

  function validate(f) {
    doc.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    clearError();
    if ((f.nome.value || '').trim().length < 3) return invalid(f.nome, 'Indique o seu nome completo.');
    if ((f.tel.value || '').replace(/\D/g, '').length < 9) return invalid(f.tel, 'Indique um telemóvel válido.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((f.email.value || '').trim())) return invalid(f.email, 'Indique um email válido — é para lá que enviamos a confirmação e a fatura.');
    var nif = (f.nif.value || '').replace(/\s/g, '');
    if (nif && !/^[0-9]{9}$/.test(nif)) return invalid(f.nif, 'O NIF tem de ter 9 dígitos.');
    if (delivery() === 'envio') {
      if ((f.morada.value || '').trim().length < 5) return invalid(f.morada, 'Indique a morada de envio.');
      var cp = (f.cp.value || '').trim();
      if (!/^[0-9]{4}-[0-9]{3}$/.test(cp)) return invalid(f.cp, 'O código postal deve ter o formato 0000-000.');
      // Códigos começados por 9 são Madeira e Açores. O site promete só
      // continente; quem valida a sério é o servidor, isto é para o cliente
      // saber antes de chegar ao pagamento.
      if (!/^[1-8]/.test(cp)) return invalid(f.cp, 'Só entregamos em Portugal continental. Para a Madeira ou os Açores, ligue-nos: 935 218 857.');
      if ((f.localidade.value || '').trim().length < 2) return invalid(f.localidade, 'Indique a localidade.');
    }
    if (!f.termos.checked) return invalid(f.termos, 'Tem de aceitar os Termos e Condições e a Política de Privacidade.');
    return true;
  }

  function payload(f) {
    var body = {
      items: items.map(function (it) { return { sku: it.sku, qty: it.qty }; }),
      entrega: delivery() === 'envio' ? 'ctt' : 'loja',
      nome: f.nome.value.trim(),
      email: f.email.value.trim(),
      telefone: f.tel.value.trim(),
      nif: (f.nif.value || '').replace(/\s/g, ''),
      notas: (f.notas.value || '').trim(),
      montagem: !!f.montagem.checked,
      // Duas coisas DIFERENTES, e a lei distingue-as: "quero montagem" é um
      // pedido a agendar; "montagem imediata" é o pedido expresso do art. 15.º
      // do DL 24/2014 que faz o cliente perder a livre resolução quanto a esse
      // serviço. Só a segunda pode ser afirmada num email.
      montagem_imediata: !!(f.montagem.checked && f.montagem_imediata && f.montagem_imediata.checked),
      matricula: f.montagem.checked ? (f.matricula.value || '').trim() : '',
      aceita_termos: !!f.termos.checked
    };
    if (body.entrega === 'ctt') {
      body.morada = f.morada.value.trim();
      body.cp = f.cp.value.trim();
      body.localidade = f.localidade.value.trim();
    }
    return body;
  }

  var confirmedTotal = null;   // total do servidor já aceite pelo cliente

  function submit(e) {
    e.preventDefault();
    var f = elForm;
    if (!validate(f)) return;
    // Rede de segurança: se o endereço do Worker for editado para algo
    // inválido, é melhor mandar o cliente ligar do que tentar cobrar.
    if (!isLocal && !/^https:\/\/[a-z0-9.-]+\.(workers\.dev|armazemdospneus\.pt)(\/|$)/.test(WORKER)) {
      return showError('O pagamento online ainda não está configurado. Ligue-nos para concluir a encomenda.');
    }

    busy(true);
    fetch(WORKER + '/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(f))
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d && res.d.error ? res.d.error : 'Não foi possível iniciar o pagamento.');

        // O preço mostrado tem de ser o preço cobrado. Se o catálogo mudou
        // enquanto o carrinho estava aberto, o cliente confirma o novo total
        // antes de ser encaminhado — nunca é surpreendido na Stripe.
        var mine = subtotal() + shipCost();
        if (res.d.total_cents !== mine && confirmedTotal !== res.d.total_cents) {
          confirmedTotal = res.d.total_cents;
          busy(false);
          doc.getElementById('co-subtotal').textContent = fmt(res.d.subtotal_cents);
          doc.getElementById('co-ship').textContent = res.d.shipping_quote_later
            ? 'A combinar'
            : (res.d.shipping_cents ? fmt(res.d.shipping_cents) : 'Grátis');
          doc.getElementById('co-total').textContent = fmt(res.d.total_cents);
          return showError('Os preços foram atualizados entretanto. O total é agora ' + fmt(res.d.total_cents) + '. Carregue outra vez para continuar.');
        }
        // O carrinho NÃO é limpo aqui: quem cancela tem de o encontrar intacto.
        window.location.href = res.d.url;
      })
      .catch(function (err) {
        busy(false);
        showError(err.message || 'Não foi possível iniciar o pagamento. Tente novamente ou fale connosco.');
      });
  }

  function applySettings() {
    var d = settings.delivery || {}, r = settings.returns || {};
    var prazo = doc.getElementById('recap-prazo');
    if (prazo && d.estimate_min_days && d.estimate_max_days) prazo.textContent = d.estimate_min_days + ' a ' + d.estimate_max_days + ' dias úteis';
    var max = doc.getElementById('recap-max');
    if (max && d.max_days) max.textContent = d.max_days;

    // DL 24/2014 art. 10.º n.º 2 al. b): o consumidor só suporta o custo da
    // devolução se tiver sido previamente informado de que o tem de pagar
    // (e art. 4.º n.º 4, que o desobriga de encargos não comunicados).
    // Enquanto o valor real não estiver preenchido, o texto diz a verdade
    // legal — a loja é que os suporta.
    var dev = doc.getElementById('recap-devolucao');
    if (dev) {
      dev.textContent = (typeof r.return_cost_eur === 'number' && r.return_cost_eur > 0)
        ? 'em caso de devolução, os custos de envio de retorno são suportados por si, no valor de ' + fmt(Math.round(r.return_cost_eur * 100)) + '.'
        : 'os custos de devolução são suportados pela loja.';
    }

    var payNote = doc.getElementById('co-pay-note');
    if (payNote && settings.payment && settings.payment.note) payNote.textContent = settings.payment.note;
    if (settings.shipping.pickup_label) { var pl = doc.getElementById('pickup-label'); if (pl) pl.textContent = settings.shipping.pickup_label; }
    // Com os portes por acordar, o texto da opção é fixo. A nota escrita no
    // backoffice descreve a tabela de escalões e, nesse modo, contradizia o
    // "A combinar" que aparece nos totais — dois sítios da mesma página a
    // dizer coisas diferentes sobre o que o cliente vai pagar.
    var en = doc.getElementById('envio-note');
    if (en) {
      if (settings.shipping && settings.shipping.quote_later) {
        en.textContent = 'Combinamos o valor do envio consigo depois da encomenda';
      } else if (settings.shipping.note) {
        en.textContent = settings.shipping.note;
      }
    }

    // Montagem. O preço tem de estar publicado para poder ser cobrado, mas não
    // é cobrado aqui: o Worker só factura artigos e portes, e quem paga a
    // montagem paga-a na oficina. Por isso diz-se as duas coisas na mesma
    // frase. Em branco no backoffice não se mostra preço nenhum — mais vale
    // não dizer nada do que inventar um valor.
    var mt = settings.mounting || {};
    var mp = doc.getElementById('mount-price');
    if (mp && typeof mt.price_eur === 'number' && mt.price_eur > 0) {
      mp.textContent = ' ' + fmt(Math.round(mt.price_eur * 100)) + ' — pago na oficina, não entra neste pagamento.';
    }
    var mn = doc.getElementById('mount-note');
    if (mn && mt.note) { mn.textContent = mt.note; mn.hidden = false; }
  }

  function init() {
    try {
      if (new URLSearchParams(location.search).get('cancelado')) {
        var c = doc.getElementById('co-cancelado'); if (c) c.hidden = false;
      }
    } catch (e) {}

    if (!items.length) { if (elEmpty) elEmpty.hidden = false; return; }

    // Interruptor de emergência: com payment.mode diferente de "online" no
    // backoffice, a loja deixa de aceitar pagamentos e encaminha para telefone.
    // Serve para o dono desligar a cobrança sozinho — numa avaria da Stripe,
    // num problema de chaves — sem precisar de um developer. O Worker recusa
    // igualmente do lado do servidor: isto aqui é só a parte visível.
    if (settings.payment && settings.payment.mode && settings.payment.mode !== 'online') {
      var off = doc.getElementById('co-offline');
      if (off) {
        var tel = (settings.store && settings.store.phone) || '935 218 857';
        var wa = (settings.store && settings.store.whatsapp) || '351935218857';
        off.innerHTML = '<h2>Pagamento online temporariamente indisponível</h2>' +
          '<p>Estamos a resolver um problema técnico. A sua encomenda pode ser feita por telefone ou WhatsApp — ' +
          'guardamos os artigos e combinamos o pagamento e a entrega consigo.</p>' +
          '<p><a class="btn btn--primary btn--lg" href="tel:+351' + esc(tel.replace(/\s/g, '')) + '">Ligar ' + esc(tel) + '</a> ' +
          '<a class="btn btn--ghost btn--lg" href="https://wa.me/' + esc(wa) + '" target="_blank" rel="noopener">Falar por WhatsApp</a></p>';
        off.hidden = false;
      }
      return;
    }

    if (elForm) elForm.hidden = false;
    renderItems(); renderTotals(); applySettings();

    doc.querySelectorAll('input[name="entrega"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var addr = doc.getElementById('ship-addr'); if (addr) addr.hidden = (delivery() !== 'envio');
        confirmedTotal = null;
        renderTotals();
      });
    });

    var mont = doc.getElementById('c-montagem');
    if (mont) mont.addEventListener('change', function () {
      var ex = doc.getElementById('mount-extra'); if (ex) ex.hidden = !mont.checked;
    });

    elForm.addEventListener('submit', submit);
  }

  /* Realinha o carrinho com o catálogo antes de mostrar seja o que for.
     Esta página não carrega o cart.js, por isso faz a sua própria
     sincronização. É só cosmético — quem decide o valor cobrado continua a
     ser o Worker —, mas evita mostrar ao cliente um preço que já não existe. */
  function resync(products) {
    var bySku = {};
    products.forEach(function (p) { if (p && p.sku) bySku[p.sku] = p; });
    var removidos = [];
    items = items.filter(function (it) {
      var p = bySku[it.sku];
      var price = p ? Math.round(Number(p.price_eur) * 100) : 0;
      var stock = p ? parseInt(p.stock, 10) || 0 : 0;
      if (!p || p.available === false || price <= 0 || stock <= 0) { removidos.push(it.name); return false; }
      it.price_cents = price;
      it.name = p.name;
      it.weight = Number(p.weight_kg) || 0;
      it.stock = stock;
      if (it.qty > stock) it.qty = stock;
      return true;
    });
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
    if (removidos.length) {
      var a = doc.getElementById('co-removed');
      if (a) {
        a.textContent = removidos.length === 1
          ? '“' + removidos[0] + '” deixou de estar disponível e foi retirado do carrinho.'
          : removidos.length + ' artigos deixaram de estar disponíveis e foram retirados do carrinho.';
        a.hidden = false;
      }
    }
  }

  Promise.all([
    fetch('data/settings.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch('data/products.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ]).then(function (out) {
    var s = out[0], cat = out[1];
    if (s) {
      settings.payment = s.payment || {};
      settings.delivery = Object.assign(settings.delivery, s.delivery || {});
      settings.returns = Object.assign(settings.returns, s.returns || {});
      if (s.shipping) settings.shipping = Object.assign(settings.shipping, s.shipping);
      // store e mounting não estavam a ser copiados. O código mais abaixo já
      // lia settings.store.phone para o aviso de pagamentos desligados, mas
      // como nunca era preenchido caía sempre no número escrito à mão — mudar
      // o telefone no backoffice não mudava nada.
      settings.store = s.store || {};
      settings.mounting = s.mounting || {};
    }
    if (cat && cat.products) resync(cat.products);
  }).then(init);
})();
