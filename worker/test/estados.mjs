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

/* O Worker escreve na consola o que faz; aqui não interessa (e enche a saída). */
export async function calado(fn) {
  const [log, error, warn] = [console.log, console.error, console.warn];
  console.log = () => {}; console.error = () => {}; console.warn = () => {};
  try { return await fn(); } finally { [console.log, console.error, console.warn] = [log, error, warn]; }
}

export async function correr({ ok }) {
  const eq = (nome, a, b) => ok(nome, JSON.stringify(a) === JSON.stringify(b), `\n     obtido:   ${JSON.stringify(a)}\n     esperado: ${JSON.stringify(b)}`);

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
