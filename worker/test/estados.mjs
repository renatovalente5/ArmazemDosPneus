/* =============================================================
   Bateria dos ESTADOS da encomenda e do que o webhook faz com eles — corre
   dentro de test.mjs (mesma contagem).

   A Stripe entrega os eventos por qualquer ordem, e reentrega-os quando o
   Worker responde 4xx/5xx (um deploy partido, a quota do KV esgotada). Cada
   caso daqui é um dos achados da revisão de 1 out 2026, conduzido no Worker
   inteiro (/checkout e webhooks assinados, com o KV, a Stripe e o Resend a
   fingir — test/palco.mjs).
   ============================================================= */
import worker from '../src/index.js';
import { kvFalso, redeFalsa, palco } from './palco.mjs';
import { ENV_HOJE, PRODUTOS, SETTINGS_HOJE, PEDIDOS } from './dados.mjs';

let nEvento = 0;
const evento = (type, object) => ({ id: `evt_estados${++nEvento}`, object: 'event', type, created: Math.floor(Date.now() / 1000), data: { object } });

/* Os eventos, com o que a Stripe lá põe (a metadata do PaymentIntent é
   copiada para o Charge quando ele nasce; a Dispute não tem metadata nossa). */
export const EV = {
  sessao: (e, { pago = true, pi = 'pi_estados1' } = {}) => evento('checkout.session.completed', {
    id: e.sessao, object: 'checkout.session', client_reference_id: e.order_id, metadata: { order_id: e.order_id, entrega: e.entrega },
    payment_status: pago ? 'paid' : 'unpaid', payment_intent: pi, amount_total: e.total, customer_details: {},
  }),
  sessaoPagaDepois: (e, { pi = 'pi_estados1' } = {}) => evento('checkout.session.async_payment_succeeded', {
    id: e.sessao, object: 'checkout.session', client_reference_id: e.order_id, metadata: { order_id: e.order_id, entrega: e.entrega },
    payment_status: 'paid', payment_intent: pi, amount_total: e.total,
  }),
  pago: (e, { pi = 'pi_estados1', tipo = 'card' } = {}) => evento('payment_intent.succeeded', {
    id: pi, object: 'payment_intent', metadata: { order_id: e.order_id }, payment_method_types: [tipo],
  }),
  falhou: (e, { pi = 'pi_estados1' } = {}) => evento('payment_intent.payment_failed', { id: pi, object: 'payment_intent', metadata: { order_id: e.order_id } }),
  multibanco: (e, { pi = 'pi_estados1' } = {}) => evento('payment_intent.requires_action', {
    id: pi, object: 'payment_intent', metadata: { order_id: e.order_id }, payment_method_types: ['multibanco'],
    next_action: { multibanco_display_details: { entity: '12345', reference: '123 456 789', expires_at: 1791000000, hosted_voucher_url: 'https://payments.stripe.com/multibanco/voucher/ensaio' } },
  }),
  expirou: (e) => evento('checkout.session.expired', { id: e.sessao, object: 'checkout.session', client_reference_id: e.order_id, metadata: { order_id: e.order_id } }),
  reembolso: (e, { reembolsado, pi = 'pi_estados1', ch = 'ch_estados1' } = {}) => evento('charge.refunded', {
    id: ch, object: 'charge', payment_intent: pi, metadata: { order_id: e.order_id }, amount: e.total, amount_refunded: reembolsado ?? e.total,
  }),
  disputa: (e, { pi = 'pi_estados1', du = 'du_estados1' } = {}) => evento('charge.dispute.created', {
    id: du, object: 'dispute', payment_intent: pi, charge: 'ch_estados1', amount: e.total, reason: 'fraudulent',
  }),
};

/**
 * Uma encomenda criada pelo /checkout verdadeiro, e o que é preciso para lhe
 * mandar eventos. `rede.resend` são os emails que saíram; `kv.ops` as
 * operações no KV.
 */
export async function montar({ settings = SETTINGS_HOJE, pedido = PEDIDOS.loja, env = ENV_HOJE, rede: dadosRede, kv = kvFalso() } = {}) {
  const rede = redeFalsa(dadosRede || { 'products.json': PRODUTOS, 'settings.json': settings });
  const p = palco(worker, { env, kv, rede });
  const c = await calado(() => p.checkout(pedido));
  const r = JSON.parse(c.corpo);
  const e = { order_id: r.order_id, sessao: rede.stripe.length ? rede.stripe[0].id : null, total: r.total_cents, entrega: pedido.entrega };
  return {
    rede, kv, p, e, checkout: c,
    encomenda: () => JSON.parse(kv.mapa.get(`order:${e.order_id}`) || 'null'),
    webhook: (x) => calado(() => p.webhook(x)),
    emails: () => rede.resend.map((m) => m.subject),
  };
}

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

/* Um webhook assinado, como a Stripe o manda. */
async function pedidoAssinado(ev, segredo = ENV_HOJE.STRIPE_WEBHOOK_SECRET) {
  const corpo = JSON.stringify(ev);
  const t = Math.floor(Date.now() / 1000);
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${t}.${corpo}`));
  const sig = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://pay.exemplo/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: corpo });
}

/**
 * Eventos AO MESMO TEMPO, com latência no KV (como na Cloudflare). O fetch
 * global fica fixo durante a corrida: o palco troca-o a cada pedido e
 * devolve o original quando o primeiro acaba, o que em paralelo mandava os
 * outros para a rede de verdade.
 */
async function emParalelo(m, eventosComAtraso, { getMs = 10, putMs = 30 } = {}) {
  const { kv } = m;
  const [g, p] = [kv.get, kv.put];
  kv.get = async (k) => { await dorme(getMs); return g.call(kv, k); };
  kv.put = async (k, v, o) => { await dorme(putMs); return p.call(kv, k, v, o); };
  const antes = globalThis.fetch;
  globalThis.fetch = m.rede.fetch;
  try {
    return await calado(() => Promise.all(eventosComAtraso.map(async ([ev, atraso]) => {
      await dorme(atraso);
      const pendentes = [];
      const r = await worker.fetch(await pedidoAssinado(ev), { ...ENV_HOJE, ORDERS: kv }, { waitUntil: (x) => pendentes.push(x), passThroughOnException() {} });
      await Promise.all(pendentes);
      return r.status;
    })));
  } finally {
    globalThis.fetch = antes;
    [kv.get, kv.put] = [g, p];
  }
}

/* O Worker escreve na consola o que faz; aqui não interessa (e enche a saída). */
export async function calado(fn) {
  const [log, error, warn] = [console.log, console.error, console.warn];
  console.log = () => {}; console.error = () => {}; console.warn = () => {};
  try { return await fn(); } finally { [console.log, console.error, console.warn] = [log, error, warn]; }
}

export async function correr({ ok }) {
  const eq = (nome, a, b) => ok(nome, JSON.stringify(a) === JSON.stringify(b), `\n     obtido:   ${JSON.stringify(a)}\n     esperado: ${JSON.stringify(b)}`);
  const escritas = (kv, desde = 0) => kv.ops.slice(desde).filter((o) => o.startsWith('put '));

  /* ---------------------------------------------------- L4-07 / L7-04 */
  console.log('\nEstados — a quota de 1 000 escritas/dia da conta: menos escritas, e o travão da Cloudflare (L4-07, L7-04)');
  {
    const m = await montar();
    eq('um /checkout aceite grava 2 vezes (a encomenda e a sessão), e não 3', escritas(m.kv).map((o) => o.replace(/AP-\S+|cs_\S+/, 'x')), ['put order:x', 'put session:x']);
    let n = m.kv.ops.length;
    await m.webhook(EV.expirou(m.e));
    eq('   a sessão expira (o destino de um /checkout forjado): 1 escrita, sem as marcas evt:/seen:', escritas(m.kv, n).map((o) => o.split(':')[0]), ['put order']);
    eq('   e a encomenda fica «expirou»', m.encomenda().status, 'expirou');
    n = m.kv.ops.length;
    await m.webhook(EV.expirou(m.e));
    eq('   a mesma sessão expirada reentregue: nenhuma escrita', escritas(m.kv, n), []);
  }
  {
    const m = await montar();
    await m.webhook(EV.sessao(m.e));
    const n = m.kv.ops.length;
    await m.webhook(EV.sessao(m.e));
    eq('um pagamento já tratado e reentregue: nenhuma escrita (nem marcas, nem a encomenda igual)', escritas(m.kv, n), []);
  }
  {
    const rede = redeFalsa({ 'products.json': PRODUTOS, 'settings.json': SETTINGS_HOJE });
    const real = rede.fetch;
    rede.fetch = async (u, init = {}) => (String(u) === 'https://api.stripe.com/v1/checkout/sessions' ? new Response('{"error":{"message":"falhou"}}', { status: 500 }) : real(u, init));
    const kv = kvFalso();
    const r = await calado(() => palco(worker, { env: ENV_HOJE, kv, rede }).checkout(PEDIDOS.loja));
    eq('a Stripe falha ao criar a sessão: 502, e nada gravado no KV', [r.status, escritas(kv)], [502, []]);
  }
  {
    const kv = kvFalso();
    kv.put = async () => { throw new Error('KV PUT failed: 429 Too Many Requests'); };
    const rede = redeFalsa({ 'products.json': PRODUTOS, 'settings.json': SETTINGS_HOJE });
    const r = await calado(() => palco(worker, { env: ENV_HOJE, kv, rede }).checkout(PEDIDOS.loja));
    ok('a quota do KV esgotada: 503 com uma mensagem (e não um 500 sem CORS), e o endereço da Stripe não sai',
      r.status === 503 && /registar a encomenda/.test(JSON.parse(r.corpo).error) && !/checkout\.stripe\.com/.test(r.corpo), r);
  }
  {
    const chaves = [];
    const travao = (sucesso) => ({ limit: async ({ key }) => { chaves.push(key); return { success: sucesso }; } });
    const rede = redeFalsa({ 'products.json': PRODUTOS, 'settings.json': SETTINGS_HOJE });
    const kv = kvFalso();
    const r = await calado(() => palco(worker, { env: { ...ENV_HOJE, TRAVAO_CHECKOUT: travao(false) }, kv, rede }).checkout(PEDIDOS.loja));
    ok('o travão da Cloudflare (binding TRAVAO_CHECKOUT) diz que não: 429, sem ler o catálogo, sem Stripe e sem KV',
      r.status === 429 && rede.chamadas.length === 0 && kv.ops.length === 0 && /^checkout:10\./.test(chaves[0]), [r.status, rede.chamadas.length, kv.ops, chaves]);
    const r2 = await calado(() => palco(worker, { env: { ...ENV_HOJE, TRAVAO_CHECKOUT: travao(true) }, kv: kvFalso(), rede }).checkout(PEDIDOS.loja));
    eq('   e diz que sim: o checkout segue', r2.status, 200);
    const toml = (await import('node:fs')).readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
    ok('   o wrangler.toml declara o binding (TRAVAO_CHECKOUT, 5 por minuto, um namespace que não é o do carimbo)',
      /\[\[ratelimits\]\]\s*\nname = "TRAVAO_CHECKOUT"\s*\nnamespace_id = "1101"\s*\nsimple = \{ limit = 5, period = 60 \}/.test(toml));
  }

  /* ---------------------------------------------------------- L7-08 */
  console.log('\nEstados — dois eventos do mesmo pagamento ao mesmo tempo (L7-08)');
  /* O KV não tem escrita condicional: dois eventos que leem e gravam no
     mesmo instante ainda podem perder um campo um do outro (fechar isso de
     vez é um Durable Object ou o D1, decisão do Renato). O que se garante:
     a junção não perde o que já está no KV, o estado nunca recua, e a marca
     grava-se com o que o evento mudou outra vez por cima. */
  {
    const J0 = (await import('../src/index.js')).juntarEncomenda;
    ok('o index.js exporta juntarEncomenda', typeof J0 === 'function');
    const J = typeof J0 === 'function' ? J0 : (l, m) => m;
    const pago = J({ status: 'aguarda_pagamento' }, { status: 'paga', paid_at: 'T1' }, { status: 'aguarda_pagamento', payment_intent: 'pi_1', amount_total_cents: 100 });
    eq('juntar: o succeeded que leu antes da sessão não apaga o payment_intent nem o valor que ela gravou', [pago.status, pago.paid_at, pago.payment_intent, pago.amount_total_cents], ['paga', 'T1', 'pi_1', 100]);
    const falhou = J({ status: 'aguarda_pagamento' }, { status: 'falhou' }, { status: 'paga', paid_at: 'T1', notified_paid: true });
    eq('juntar: um payment_failed que leu antes do pagamento não o desfaz', [falhou.status, falhou.paid_at, falhou.notified_paid], ['paga', 'T1', true]);
    const mb = J({ status: 'criada' }, { status: 'aguarda_pagamento' }, { status: 'aguarda_multibanco', multibanco: { reference: '1' } });
    eq('juntar: a sessão não paga não tira a encomenda de «aguarda_multibanco»', [mb.status, mb.multibanco.reference], ['aguarda_multibanco', '1']);
    const ree = J({ status: 'paga' }, { status: 'parcialmente_reembolsada', refunded_cents: 1000 }, { status: 'reembolsada', refunded_cents: 5000 });
    eq('juntar: o reembolsado só cresce, e o estado mais firme fica', [ree.status, ree.refunded_cents], ['reembolsada', 5000]);
  }
  {
    const mal = [];
    for (const atraso of [0, 5, 15, 30, 50, 80]) {
      const m = await montar();
      await emParalelo(m, [[EV.sessao(m.e), 0], [EV.pago(m.e), atraso]]);
      const o = m.encomenda();
      if (!(o.status === 'paga' && o.paid_at && o.notified_paid)) mal.push(`${atraso} ms: ${JSON.stringify({ status: o.status, paid_at: o.paid_at, notified: o.notified_paid })}`);
    }
    ok('checkout.session.completed e payment_intent.succeeded juntos (0 a 80 ms): fica paga, com a hora do pagamento e a marca dos emails', mal.length === 0, mal.join(' | '));
  }
  {
    const falhas = [];
    for (const atraso of [0, 5, 15, 30, 50]) {
      const m = await montar();
      await emParalelo(m, [[EV.pago(m.e), 0], [EV.falhou(m.e), atraso]]);
      const o = m.encomenda();
      if (!(o.status === 'paga' && o.paid_at)) falhas.push(`${atraso} ms: ${o.status}`);
    }
    ok('um payment_failed atrasado ao mesmo tempo que o succeeded: a encomenda paga não fica «falhou»', falhas.length === 0, falhas.join(' | '));
  }
  {
    const m = await montar({ pedido: PEDIDOS.ctt });
    await emParalelo(m, [[EV.multibanco(m.e), 0], [EV.sessao(m.e, { pago: false }), 0]]);
    eq('a referência Multibanco e a sessão (não paga) ao mesmo tempo: fica à espera da referência', m.encomenda().status, 'aguarda_multibanco');
  }

  /* ---------------------------------------------------------- L7-06 */
  console.log('\nEstados — se o Resend falhar, a Stripe volta a tentar (L7-06)');
  {
    const m = await montar();
    const real = m.rede.fetch;
    let resendEmBaixo = true;
    m.rede.fetch = async (u, init = {}) => (String(u) === 'https://api.resend.com/emails' && resendEmBaixo ? new Response('{"message":"rate limited"}', { status: 429 }) : real(u, init));
    const ev = EV.sessao(m.e);
    const r1 = await m.webhook(ev);
    const r2 = await m.webhook(EV.pago(m.e));
    const o = m.encomenda();
    ok('o Resend em baixo nos dois eventos do pagamento: a encomenda fica paga, sem a marca, e a Stripe recebe 500 (vai reentregar)',
      r1.status === 500 && r2.status === 500 && o.status === 'paga' && !o.notified_paid && m.rede.resend.length === 0, [r1.status, r2.status, o.status, o.notified_paid]);
    ok('   e nenhuma marca evt:/seen: ficou (a reentrega não é tomada por «duplicado»)', ![...m.kv.mapa.keys()].some((k) => /^(evt|seen):/.test(k)), [...m.kv.mapa.keys()]);
    resendEmBaixo = false;
    const r3 = await m.webhook(ev);   // a Stripe reentrega o MESMO evento
    ok('   a reentrega, com o Resend de volta: 200, saem a confirmação e o aviso, e fica a marca',
      r3.status === 200 && m.encomenda().notified_paid === true && m.emails().some((s) => /confirmada/.test(s)) && m.emails().some((s) => /^\[Loja\] Pagamento confirmado/.test(s)), [r3.status, m.emails()]);
    const r4 = await m.webhook(ev);
    ok('   e outra reentrega já não manda nada (duplicado)', r4.status === 200 && m.emails().length === 2, [r4, m.emails()]);
  }

  /* ---------------------------------------------------------- L7-05 */
  console.log('\nEstados — os reembolsos só somam, e não apagam uma contestação (L7-05)');
  {
    const m = await montar();
    await m.webhook(EV.sessao(m.e));
    await m.webhook(EV.reembolso(m.e, { reembolsado: m.e.total }));                  // o resto, total
    await m.webhook(EV.reembolso(m.e, { reembolsado: 1000 }));                       // o parcial ANTERIOR, entregue tarde
    const o = m.encomenda();
    eq('reembolso total e depois o parcial anterior (fora de ordem): continua reembolsada pelo total', [o.status, o.refunded_cents], ['reembolsada', m.e.total]);
  }
  {
    const m = await montar();
    await m.webhook(EV.sessao(m.e));
    await m.webhook(EV.disputa(m.e));
    await m.webhook(EV.reembolso(m.e, { reembolsado: 1000 }));
    const o = m.encomenda();
    eq('contestação e depois um reembolso parcial atrasado: continua contestada, com o reembolso registado', [o.status, o.refunded_cents, o.dispute_id], ['contestada', 1000, 'du_estados1']);
  }
  {
    const m = await montar();
    await m.webhook(EV.sessao(m.e));
    await m.webhook(EV.reembolso(m.e, { reembolsado: 1000 }));
    eq('um reembolso parcial: parcialmente_reembolsada', [m.encomenda().status, m.encomenda().refunded_cents], ['parcialmente_reembolsada', 1000]);
    await m.webhook(EV.reembolso(m.e, { reembolsado: m.e.total }));
    eq('   e o resto: reembolsada pelo total', [m.encomenda().status, m.encomenda().refunded_cents], ['reembolsada', m.e.total]);
  }

  /* ---------------------------------------------------------- L7-01 */
  console.log('\nEstados — um pagamento que chega atrasado não desfaz um reembolso nem uma contestação (L7-01)');
  {
    const m = await montar();
    eq('reembolso primeiro (o pagamento ficou retido numa avaria): reembolsada', [(await m.webhook(EV.reembolso(m.e))).status, m.encomenda().status], [200, 'reembolsada']);
    await m.webhook(EV.pago(m.e));
    await m.webhook(EV.sessao(m.e));
    const o = m.encomenda();
    eq('   depois o payment_intent.succeeded e o checkout.session.completed: continua reembolsada', o.status, 'reembolsada');
    ok('   e fica gravado quando o dinheiro entrou (paid_at)', Boolean(o.paid_at));
    const assuntos = m.emails();
    ok('   não sai o «confirmada» ao cliente nem o «A FAZER HOJE» ao dono', !assuntos.some((s) => /confirmada|Pagamento confirmado/.test(s)), assuntos);
    ok('   sai um só aviso ao dono, com o estado real', assuntos.length === 1 && /NÃO FATURAR .* já está reembolsada/.test(assuntos[0])
      && m.rede.resend[0].to[0] === ENV_HOJE.MAIL_TO && /NÃO emita a fatura/.test(m.rede.resend[0].text), assuntos);
  }
  {
    const m = await montar();
    await m.webhook(EV.sessao(m.e));
    await m.webhook(EV.disputa(m.e));
    eq('pagamento por cartão e depois uma contestação: contestada', m.encomenda().status, 'contestada');
    await m.webhook(EV.pago(m.e));
    eq('   o payment_intent.succeeded atrasado não a põe outra vez «paga»', m.encomenda().status, 'contestada');
    eq('   e não manda mais emails (os dois do pagamento saíram antes da contestação)', m.emails().length, 2);
  }
  {
    const m = await montar();
    await m.webhook(EV.sessao(m.e));
    const o = m.encomenda();
    ok('o caminho de sempre continua: paga, e saem os dois emails (dono e cliente)', o.status === 'paga'
      && m.emails().some((s) => /^\[Loja\] Pagamento confirmado/.test(s)) && m.emails().some((s) => /confirmada/.test(s)), m.emails());
  }
}
