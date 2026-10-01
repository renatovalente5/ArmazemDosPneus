/* =============================================================
   ARMAZÉM DOS PNEUS — checkout.js
   Recolhe os dados, mostra o resumo e encaminha para a página segura de
   pagamento da Stripe.

   O que vai para o servidor: apenas { sku, qty } + dados do cliente (e, com
   pneus seminovos, a aceitação da garantia reduzida, com os meses que a página
   mostrou — o Worker confere-os com os dele).
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
  /* O settings.json chegou? Sem ele, o resumo fica com o texto que a
     publicação escreveu na página (os marcadores do checkout.html, os valores
     publicados) e o pagamento não segue: o Worker lê as condições do mesmo
     ficheiro, e os valores de reserva daqui podiam não ser os de lá. */
  var settingsLido = false;
  var settings = {
    shipping: { pickup_label: 'Levantar e montar na loja', note: '', tiers: [] },
    delivery: { estimate_min_days: 2, estimate_max_days: 5, max_days: 30 },
    returns: { return_cost_eur: null },
    payment: {}
  };

  /* A GARANTIA DOS PNEUS SEMINOVOS (DL n.º 84/2021, art. 12.º). A garantia
     legal é de 3 anos; num bem usado pode descer até 18 meses, mas só POR
     ACORDO — e o acordo tem de existir antes do pagamento. Com um pneu
     seminovo de garantia reduzida (18 a 35 meses) no carrinho, a caixa
     #co-garantia aparece e é obrigatória; o Worker confere-a outra vez, sobre
     o products.json publicado, e guarda-a na encomenda (worker/src/garantia.js).
     O texto daqui é o do Worker, letra a letra (a bateria do browser confere-o):
     mudá-lo é uma versão nova, nos dois sítios, e o Worker publica-se primeiro. */
  var GARANTIA_VERSAO = '2026-10-01';
  var LEI_GARANTIA = '(DL n.º 84/2021, art. 12.º)';
  var catalogo = {};      // sku → { seminovo, meses, nome }, do products.json (resync)
  var garantia = null;    // o acordo que a caixa mostra: { versao, texto, artigos: [{ sku, nome, meses, qty }] }

  /* Os caracteres que o Worker troca por espaço num nome (termos.js), feitos a
     partir dos números: um separador de linha escrito à letra parte o ficheiro. */
  var INVISIVEIS = new RegExp('[' + [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff]]
    .map(function (f) { return '\\u' + ('000' + f[0].toString(16)).slice(-4) + '-\\u' + ('000' + f[1].toString(16)).slice(-4); }).join('') + ']', 'g');

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY)) || [];
      return raw.filter(function (it) { return it && it.sku && it.price_cents > 0; });
    } catch (e) { return []; }
  }
  /* Os contactos da loja vêm das metas ap:telefone e ap:whatsapp, que a
     publicação escreve a partir do painel (.github/injetar-conteudo.py). Os de
     hoje ficam como recurso, se a meta faltar ou vier estragada. */
  function meta(nome, valida, recurso) {
    var m = doc.querySelector('meta[name="' + nome + '"]');
    return m && valida.test(m.content) ? m.content : recurso;
  }
  var TELEFONE = meta('ap:telefone', /^\+?[0-9][0-9 ]{7,18}[0-9]$/, '935 218 857');
  var WHATSAPP = meta('ap:whatsapp', /^[0-9]{9,15}$/, '351935218857');
  /* «935 218 857» → «+351935218857»; um número com + ou 00 fica com o dele. */
  function telInternacional(t) {
    var d = t.replace(/\D/g, '');
    if (/^\s*\+/.test(t)) return '+' + d;
    if (/^00/.test(d)) return '+' + d.slice(2);
    return d.length === 9 ? '+351' + d : '+' + d;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }
  function subtotal() { return items.reduce(function (a, it) { return a + it.price_cents * it.qty; }, 0); }
  /* O peso em CENTÉSIMOS DE KG inteiros, como o Worker (pricing.js): somado
     em vírgula flutuante, 3 × 1,6 + 0,2 dava 5,000000000000001 kg e caía no
     escalão de portes seguinte. */
  function centesimos(kg) { return Math.round((Number(kg) || 0) * 100); }
  function weightCg() { return items.reduce(function (a, it) { return a + centesimos(it.weight) * it.qty; }, 0); }
  function weight() { return weightCg() / 100; }
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
    var cg = weightCg(), tiers = settings.shipping.tiers || [];
    for (var i = 0; i < tiers.length; i++) if (cg <= centesimos(tiers[i].max_kg)) return Math.round(tiers[i].price * 100);
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

  /* O erro aparece na caixa #co-error (role="alert"), logo acima do botão, e o
     campo aponta para ela (aria-describedby): quem lá chega pelo foco ouve a
     mensagem. */
  function invalid(el, msg) {
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', 'co-error');
    el.focus();
    showError(msg);
    return false;
  }

  /* ---------- a garantia dos pneus seminovos ---------- */

  function mesesReduzidos(m) { return typeof m === 'number' && isFinite(m) && m % 1 === 0 && m >= 18 && m < 36; }
  function nomeDoArtigo(nome, sku) {
    if (typeof nome !== 'string' || nome.length > 800) return sku;
    var t = nome.replace(INVISIVEIS, ' ').replace(/\s+/g, ' ').trim();
    return t.length >= 1 && t.length <= 200 ? t : sku;
  }
  /* O texto que o cliente aceita — o textoDaGarantia do Worker. Com os mesmos
     meses em todos e sem outros seminovos (de 3 anos) no carrinho, uma frase;
     senão, a garantia de cada artigo. */
  function textoDaGarantia(artigos, outros) {
    var unidades = 0, meses = [];
    artigos.forEach(function (a) { unidades += a.qty; if (meses.indexOf(a.meses) < 0) meses.push(a.meses); });
    var sujeito = unidades > 1 ? 'destes pneus seminovos, por serem bens usados,' : 'deste pneu seminovo, por ser um bem usado,';
    if (meses.length === 1 && !outros) return 'Aceito que a garantia de conformidade ' + sujeito + ' é de ' + meses[0] + ' meses em vez de 3 anos ' + LEI_GARANTIA + '.';
    return 'Aceito que a garantia de conformidade ' + sujeito + ' é a indicada a seguir, em vez de 3 anos ' + LEI_GARANTIA + ': ' +
      artigos.map(function (a) { return a.nome + ' — ' + a.meses + ' meses'; }).join('; ') + '.';
  }
  /* O acordo que este carrinho pede (do products.json que a página leu), ou null. */
  function garantiaDoCarrinho() {
    var artigos = [], outros = false;
    items.forEach(function (it) {
      var c = catalogo[it.sku];
      if (!c || !c.seminovo) return;
      if (mesesReduzidos(c.meses)) artigos.push({ sku: it.sku, nome: nomeDoArtigo(c.nome, it.sku), meses: c.meses, qty: it.qty });
      else outros = true;
    });
    return artigos.length ? { versao: GARANTIA_VERSAO, texto: textoDaGarantia(artigos, outros), artigos: artigos } : null;
  }
  /* O acordo que o Worker mandou no 400 (o texto e a versão dele), ou null. */
  function garantiaDoServidor(g) {
    if (!g || typeof g.versao !== 'string' || typeof g.texto !== 'string' || !Array.isArray(g.artigos) || !g.artigos.length) return null;
    return { versao: g.versao, texto: g.texto, artigos: g.artigos.map(function (a) { return { sku: a.sku, nome: a.nome, meses: a.meses, qty: 1 }; }) };
  }
  /* Mostra (ou esconde) a caixa, sempre por marcar: um acordo novo pede uma
     aceitação nova. */
  function mostrarGarantia(g) {
    garantia = g;
    var caixa = doc.getElementById('co-garantia'), cb = doc.getElementById('c-garantia'), txt = doc.getElementById('c-garantia-texto');
    if (!caixa || !cb || !txt) return;
    if (g) txt.textContent = g.texto;
    cb.checked = false;
    caixa.hidden = !g;
  }
  function mensagemGarantiaPorMarcar() {
    var unidades = 0;
    garantia.artigos.forEach(function (a) { unidades += a.qty; });
    return unidades > 1
      ? 'Para continuar, confirme na caixa acima que aceita a garantia dos pneus seminovos: por serem bens usados, é mais curta do que 3 anos e só vale com o seu acordo.'
      : 'Para continuar, confirme na caixa acima que aceita a garantia do pneu seminovo: por ser um bem usado, é mais curta do que 3 anos e só vale com o seu acordo.';
  }

  function validate(f) {
    doc.querySelectorAll('[aria-invalid]').forEach(function (el) {
      el.removeAttribute('aria-invalid');
      if (el.getAttribute('aria-describedby') === 'co-error') el.removeAttribute('aria-describedby');
    });
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
      if (!/^[1-8]/.test(cp)) return invalid(f.cp, 'Só entregamos em Portugal continental. Para a Madeira ou os Açores, ligue-nos: ' + TELEFONE + '.');
      if ((f.localidade.value || '').trim().length < 2) return invalid(f.localidade, 'Indique a localidade.');
    }
    if (!f.termos.checked) return invalid(f.termos, 'Tem de aceitar os Termos e Condições e a Política de Privacidade.');
    var cg = doc.getElementById('c-garantia');
    if (garantia && cg && !cg.checked) return invalid(cg, mensagemGarantiaPorMarcar());
    return true;
  }

  /* As condições que a página MOSTROU: o Worker compara-as com as que vai
     prometer no email e, se forem piores para o cliente, responde 409 com as
     novas (como faz com o preço). */
  function condicoesMostradas() {
    var d = settings.delivery || {}, r = settings.returns || {};
    return {
      prazo_min: d.estimate_min_days, prazo_max: d.estimate_max_days, prazo_maximo: d.max_days,
      custo_devolucao_cents: (typeof r.return_cost_eur === 'number' && r.return_cost_eur > 0) ? Math.round(r.return_cost_eur * 100) : 0
    };
  }

  function payload(f) {
    var body = {
      condicoes: condicoesMostradas(),
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
    // O acordo da garantia dos pneus seminovos, só quando a caixa se mostrou: a
    // versão do texto e os meses de cada artigo, como a página os mostrou. O
    // Worker confere-os com o products.json publicado e guarda-os na encomenda.
    if (garantia) {
      var cg = doc.getElementById('c-garantia');
      body.garantia_usados = {
        aceita: !!(cg && cg.checked),
        versao: garantia.versao,
        artigos: garantia.artigos.map(function (a) { return { sku: a.sku, meses: a.meses }; })
      };
    }
    return body;
  }

  var confirmedTotal = null;   // total do servidor já aceite pelo cliente

  function submit(e) {
    e.preventDefault();
    var f = elForm;
    if (!validate(f)) return;
    if (!settingsLido) {
      return showError('Não foi possível carregar as condições da loja (prazos de entrega e devoluções). Recarregue a página para continuar.');
    }
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
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
      .then(function (res) {
        // As condições (prazos, devolução) mudaram entretanto para pior: o
        // resumo passa a mostrar as do Worker, e o cliente confirma outra vez.
        if (res.status === 409 && res.d && res.d.condicoes) {
          var c = res.d.condicoes;
          settings.delivery = Object.assign(settings.delivery || {}, { estimate_min_days: c.prazo_min, estimate_max_days: c.prazo_max, max_days: c.prazo_maximo });
          settings.returns = Object.assign(settings.returns || {}, { return_cost_eur: c.custo_devolucao_cents > 0 ? c.custo_devolucao_cents / 100 : null });
          applySettings();
          busy(false);
          return showError(res.d.error);
        }
        // A garantia dos pneus seminovos: o Worker não recebeu a aceitação do
        // acordo que ESTE carrinho pede (a caixa não estava na página, os
        // meses mudaram entretanto, ou outra versão do texto). A caixa passa a
        // mostrar o texto e os artigos do Worker, por marcar, e o cliente
        // confirma outra vez.
        if (res.status === 400 && res.d && res.d.codigo === 'garantia_usados_por_aceitar') {
          var g = garantiaDoServidor(res.d.garantia_usados);
          if (g) mostrarGarantia(g);
          busy(false);
          var cg = doc.getElementById('c-garantia');
          return g && cg ? invalid(cg, res.d.error) : showError(res.d.error);
        }
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
    // Com o mínimo igual ao máximo, «3 dias úteis» (e não «3 a 3») — a regra dos Termos e da página da Stripe.
    if (prazo && d.estimate_min_days && d.estimate_max_days) {
      prazo.textContent = d.estimate_min_days === d.estimate_max_days
        ? (d.estimate_min_days === 1 ? '1 dia útil' : d.estimate_min_days + ' dias úteis')
        : d.estimate_min_days + ' a ' + d.estimate_max_days + ' dias úteis';
    }
    var max = doc.getElementById('recap-max');
    if (max && d.max_days) max.textContent = d.max_days === 1 ? '1 dia' : d.max_days + ' dias';

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
        // Os contactos são os do painel (metas), e não o settings.store — esse
        // é o legado do Pages CMS e deixou de se mudar lá.
        var tel = TELEFONE;
        var wa = WHATSAPP;
        off.innerHTML = '<h2>Pagamento online temporariamente indisponível</h2>' +
          '<p>Estamos a resolver um problema técnico. A sua encomenda pode ser feita por telefone ou WhatsApp — ' +
          'guardamos os artigos e combinamos o pagamento e a entrega consigo.</p>' +
          '<p><a class="btn btn--primary btn--lg" href="tel:' + esc(telInternacional(tel)) + '">Ligar ' + esc(tel) + '</a> ' +
          '<a class="btn btn--ghost btn--lg" href="https://wa.me/' + esc(wa) + '" target="_blank" rel="noopener">Falar por WhatsApp</a></p>';
        off.hidden = false;
      }
      return;
    }

    if (elForm) elForm.hidden = false;
    renderItems(); renderTotals();
    mostrarGarantia(garantiaDoCarrinho());
    if (settingsLido) applySettings();

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
      // Para a caixa da garantia: o estado e a garantia do artigo (a regra do
      // ePneu do .github/regras.mjs e do catalog.js).
      catalogo[it.sku] = { seminovo: /pneu/i.test(p.category || '') && p.condition === 'Seminovo', meses: p.warranty_months, nome: p.name };
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
      settingsLido = true;
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
