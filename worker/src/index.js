/* =============================================================
   ARMAZÉM DOS PNEUS — Cloudflare Worker (pagamentos Stripe)
   -------------------------------------------------------------
   Rotas
     POST /checkout        cria a Stripe Checkout Session e devolve o URL
     POST /stripe/webhook  recebe os eventos da Stripe (fonte da verdade)
     GET  /order           estado de uma encomenda, para a página obrigado.html
     GET  /health          diagnóstico

   Princípios
     · O browser envia APENAS { sku, qty } — nunca preços nem totais.
     · "Dinheiro recebido" é payment_status !== 'unpaid'. NUNCA se trata
       checkout.session.completed, por si só, como pagamento: com Multibanco
       ele chega com payment_status 'unpaid'.
     · O NIF, a matrícula e as notas ficam SÓ aqui e no email ao dono. Não
       viajam para a Stripe (que avisa para não guardar dados sensíveis em
       metadata, e não precisa deles para a transação).

   SEGREDOS (wrangler secret put — NUNCA no repositório)
     STRIPE_RESTRICTED_KEY   rk_live_… (chave restrita, não a sk_live)
     STRIPE_WEBHOOK_SECRET   whsec_… (test e live têm segredos diferentes)
     RESEND_API_KEY          re_…
   ============================================================= */

import { stripeFetch, verifyStripeSignature } from './stripe.js';
import { priceOrder } from './pricing.js';
import { avisoLoja, confirmacaoCliente, referenciaMultibanco } from './mail.js';

const MAX_BODY_BYTES = 8 * 1024;
const SESSION_TTL_SECONDS = 3600;        // 1 h para concluir o pagamento
const ORDER_TTL_SECONDS = 400 * 86400;   // > prazo de garantia/contestação
const EVENT_TTL_SECONDS = 7 * 86400;     // a Stripe reentrega até 3 dias
const RETRY_JANELA_SEGUNDOS = 3600;      // até quando vale pedir reentrega

/**
 * Chave que protege contra Events GÉMEOS — dois Event distintos que a Stripe
 * pode emitir para o mesmo facto. Devolve null quando a repetição é legítima e
 * não deve ser bloqueada.
 *
 * `charge.refunded` é o caso a ter em conta: dispara outra vez em cada reembolso
 * parcial da mesma cobrança. Se a chave fosse só tipo+cobrança, o segundo
 * reembolso era descartado e um reembolso total ficava registado como parcial.
 * O que identifica o facto é o total já reembolsado, não a cobrança.
 */
export function twinGuardKey(event) {
  const o = (event.data && event.data.object) || {};
  const id = o.id || 'sem-id';
  if (event.type === 'charge.refunded') return `seen:${event.type}:${id}:${o.amount_refunded}`;
  return `seen:${event.type}:${id}`;
}

/* ---------- utilitários HTTP ---------- */
function json(data, status, extra) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(extra || {}) },
  });
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || env.SITE_ORIGIN || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!origin || !allowedOrigins(env).includes(origin)) return null;   // origem desconhecida => 403
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/* ---------- rate limit best-effort, por isolate ----------
   Deliberadamente em memória e não em KV: o plano gratuito só dá 1.000
   escritas KV/dia e um atacante esgotaria essa quota (que é a mesma das
   encomendas) só a bater na rota. A Cloudflare já filtra volumetria à
   frente disto; aqui só travamos abuso trivial. */
const hits = new Map();
const RATE_MAX = 10, RATE_WINDOW_MS = 60_000;
function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > RATE_WINDOW_MS) { hits.set(ip, { start: now, n: 1 }); return false; }
  rec.n += 1;
  if (hits.size > 5000) hits.clear();   // trava de memória
  return rec.n > RATE_MAX;
}

/* ---------- KV ---------- */
const orderKey = (id) => `order:${id}`;
async function getOrder(env, id) {
  const raw = await env.ORDERS.get(orderKey(id));
  return raw ? JSON.parse(raw) : null;
}
async function putOrder(env, order) {
  order.updated_at = new Date().toISOString();
  await env.ORDERS.put(orderKey(order.order_id), JSON.stringify(order), {
    expirationTtl: ORDER_TTL_SECONDS,
    metadata: { status: order.status },
  });
  return order;
}

/* ---------- validação dos dados do cliente ---------- */
const NIF_RE = /^[0-9]{9}$/;
// Formato 0000-000 E continente. Os códigos postais portugueses começados por
// 9 são Madeira (9000-9399) e Açores (9500-9980), e o site e os Termos prometem
// entrega apenas em Portugal continental — mas nada o verificava: um pedido para
// o Funchal era aceite e cobrado ao preço do continente, que não cobre o envio.
const CP_RE = /^[1-8][0-9]{3}-[0-9]{3}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max || 200);
}

function validateCliente(body, delivery) {
  const c = {
    nome: cleanText(body.nome, 120),
    email: cleanText(body.email, 160).toLowerCase(),
    telefone: cleanText(body.telefone, 40),
    nif: cleanText(body.nif, 20).replace(/\s/g, ''),
    matricula: cleanText(body.matricula, 20).toUpperCase(),
    notas: cleanText(body.notas, 500),
    montagem: body.montagem === true,
    // Pedido EXPRESSO de montagem imediata (art. 15.º do DL 24/2014), que é o
    // único que faz o cliente perder a livre resolução quanto a esse serviço.
    // Distinto de "quero montagem", que é só um agendamento. Nunca inferir um
    // do outro: afirmar uma renúncia que não houve é falso e é acionável.
    montagem_imediata: body.montagem === true && body.montagem_imediata === true,
  };
  if (c.nome.length < 3) throw new Error('Indique o seu nome completo.');
  if (!EMAIL_RE.test(c.email)) throw new Error('Indique um email válido — é para lá que enviamos a confirmação e a fatura.');
  if (c.telefone.replace(/\D/g, '').length < 9) throw new Error('Indique um telemóvel válido.');
  if (c.nif && !NIF_RE.test(c.nif)) throw new Error('O NIF tem de ter 9 dígitos.');
  if (body.aceita_termos !== true) throw new Error('Tem de aceitar os Termos e Condições e a Política de Privacidade.');
  if (delivery === 'ctt') {
    c.morada = cleanText(body.morada, 200);
    c.cp = cleanText(body.cp, 12);
    c.localidade = cleanText(body.localidade, 100);
    if (c.morada.length < 5) throw new Error('Indique a morada de envio.');
    if (!/^[0-9]{4}-[0-9]{3}$/.test(c.cp)) throw new Error('O código postal deve ter o formato 0000-000.');
    if (!CP_RE.test(c.cp)) throw new Error('Só entregamos em Portugal continental. Para a Madeira ou os Açores, ligue-nos: 935 218 857.');
    if (c.localidade.length < 2) throw new Error('Indique a localidade.');
  }
  return c;
}

function newOrderId() {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `AP-${ymd}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

/* =============================================================
   POST /checkout
   ============================================================= */
async function handleCheckout(request, env, cors) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (rateLimited(ip)) return json({ error: 'Demasiadas tentativas. Aguarde um minuto.' }, 429, cors);

  const len = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (len > MAX_BODY_BYTES) return json({ error: 'Pedido demasiado grande.' }, 413, cors);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'Pedido demasiado grande.' }, 413, cors);

  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Pedido inválido.' }, 400, cors); }

  const delivery = body.entrega === 'ctt' ? 'ctt' : 'loja';

  let cliente, calc;
  try {
    cliente = validateCliente(body, delivery);
    calc = await priceOrder(env, body.items, delivery);
  } catch (e) {
    return json({ error: e.message }, 400, cors);
  }

  // Interruptor de emergência do backoffice. Imposto AQUI e não só no browser:
  // de outro modo bastava um pedido forjado para continuar a cobrar com a loja
  // supostamente desligada. O campo existia no backoffice desde o início mas
  // nenhum código o lia — dava ao dono a ilusão de poder desligar a cobrança.
  const modo = (calc.settings && calc.settings.payment && calc.settings.payment.mode) || 'online';
  if (modo !== 'online') {
    console.log('checkout recusado: payment.mode =', modo);
    return json({ error: 'O pagamento online está temporariamente indisponível. Ligue-nos para concluir a encomenda.' }, 503, cors);
  }

  const order_id = newOrderId();

  // Grava ANTES de falar com a Stripe: se a criação da sessão falhar a meio,
  // fica rasto da tentativa; se gravássemos depois, um pagamento podia existir
  // na Stripe sem nada do nosso lado.
  const order = await putOrder(env, {
    order_id,
    status: 'criada',
    entrega: delivery,
    lines: calc.lines,
    subtotal_cents: calc.subtotal_cents,
    shipping_cents: calc.shipping_cents,
    // Fica gravado na encomenda para os emails poderem dizer que os portes
    // ainda não foram cobrados — e para daqui a um ano se perceber porque é
    // que aquela encomenda foi paga sem portes.
    shipping_quote_later: calc.shipping_quote_later,
    total_cents: calc.total_cents,
    weight_kg: calc.weight_kg,
    cliente,
    created_at: new Date().toISOString(),
  });

  const params = {
    ui_mode: 'hosted_page',
    mode: 'payment',
    locale: 'pt',
    client_reference_id: order_id,
    customer_email: cliente.email,
    success_url: `${env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: env.CANCEL_URL,
    expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    line_items: calc.lines.map((l) => ({
      quantity: l.qty,
      price_data: {
        currency: 'eur',
        unit_amount: l.unit_cents,
        product_data: {
          name: l.name,
          description: `${l.condition} · IVA e ecovalor incluídos`,
          metadata: { sku: l.sku },
        },
      },
    })),
    metadata: { order_id, entrega: delivery },
    payment_intent_data: {
      description: `Encomenda ${order_id} — Armazém dos Pneus`,
      metadata: { order_id },
    },
    custom_text: {
      submit: {
        message: delivery === 'ctt'
          ? `Ao concluir o pagamento celebra um contrato de compra e venda com obrigação de pagar. Entrega em ${env.DELIVERY_MIN_DAYS || 2} a ${env.DELIVERY_MAX_BUSINESS_DAYS || 5} dias úteis, para Portugal continental.`
          : 'Ao concluir o pagamento celebra um contrato de compra e venda com obrigação de pagar. Levantamento em Travessa do Navega, 436 F, 3885-183 Arada, Ovar.',
      },
      after_submit: {
        message: 'Se escolher Referência Multibanco, a entidade e a referência aparecem no ecrã seguinte e também lhe são enviadas por email. Tem 7 dias para pagar; a encomenda só é preparada depois de recebermos o pagamento.',
      },
    },
  };

  // Só há linha de portes quando há portes a cobrar. Com "portes a combinar"
  // ligado no backoffice, calc.shipping_cents é 0 e uma linha de 0,00 € na
  // Stripe só confundia quem estava a pagar.
  if (delivery === 'ctt' && calc.shipping_cents > 0) {
    // A morada NÃO é recolhida pela Stripe de propósito. Era pedida no nosso
    // formulário e outra vez na página dela — o cliente escrevia-a duas vezes.
    // Fica do nosso lado por três razões: os portes calculam-se pelo PESO e não
    // pela morada; a encomenda é gravada em KV antes de falar com a Stripe, logo
    // não se faz depender do webhook a única informação necessária para
    // despachar; e é a única forma de garantir só continente, porque a Stripe
    // restringe por país e Madeira e Açores são Portugal.
    //
    // Consequência: os portes passam a ser uma linha de encomenda em vez de
    // shipping_options, que a Stripe não documenta como funcionando sem a
    // recolha de morada. O total cobrado é idêntico.
    params.line_items.push({
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: calc.shipping_cents,
        product_data: { name: `Envio CTT (${calc.weight_kg} kg)`, description: 'Portugal continental' },
      },
    });
  }

  // Depende de ter um URL de Termos configurado em Settings → Branding; se não
  // estiver, a Stripe rejeita a sessão. Fica opcional para o checkout nunca
  // ficar em baixo por causa de um campo do dashboard — a aceitação que conta
  // legalmente é a checkbox da nossa própria página.
  if (env.REQUIRE_TOS_CONSENT === 'true') {
    params.consent_collection = { terms_of_service: 'required' };
  }

  let session;
  try {
    session = await stripeFetch(env, '/checkout/sessions', { body: params, idempotencyKey: `chk_${order_id}` });
  } catch (e) {
    console.error('falha ao criar sessão', order_id, e.message, e.stripeCode);
    order.status = 'erro_stripe';
    order.error = e.message;
    await putOrder(env, order);
    return json({ error: 'Não foi possível iniciar o pagamento. Tente novamente ou fale connosco.' }, 502, cors);
  }

  order.status = 'aguarda_pagamento';
  order.session_id = session.id;
  await putOrder(env, order);
  await env.ORDERS.put(`session:${session.id}`, order_id, { expirationTtl: ORDER_TTL_SECONDS });

  return json({
    url: session.url,
    order_id,
    total_cents: calc.total_cents,
    shipping_cents: calc.shipping_cents,
    shipping_quote_later: calc.shipping_quote_later,
    subtotal_cents: calc.subtotal_cents,
    weight_kg: calc.weight_kg,
  }, 200, cors);
}

/* =============================================================
   POST /stripe/webhook
   Sem CORS, sem verificação de Origin, sem rate limit — a Stripe não é um
   browser e um 403/429 daqui provoca reentregas infinitas.
   ============================================================= */
async function handleWebhook(request, env, ctx) {
  if (request.method !== 'POST') return new Response('method', { status: 405 });

  // request.text() UMA só vez: a assinatura é sobre os bytes crus.
  const raw = await request.text();

  let event;
  try {
    event = await verifyStripeSignature(
      raw, request.headers.get('stripe-signature'),
      env.STRIPE_WEBHOOK_SECRET, Math.floor(Date.now() / 1000)
    );
  } catch (e) {
    console.error('webhook rejeitado:', e.message);
    return new Response('assinatura inválida', { status: 400 });
  }

  const evtKey = `evt:${event.id}`;
  const twinKey = twinGuardKey(event);

  // Dedup em duas chaves: retransmissões do mesmo Event, e Events gémeos
  // distintos que a Stripe pode emitir para o mesmo facto.
  for (const k of [evtKey, twinKey]) {
    if (k && await env.ORDERS.get(k)) return new Response('duplicado');
  }

  // O estado é gravado ANTES do 200: se isto corresse em waitUntil e falhasse,
  // a Stripe já teria recebido 2xx e nunca reentregaria — encomenda perdida.
  //
  // E as marcas de dedup são gravadas DEPOIS de aplicar, não antes. Se fossem
  // antes, o 500 abaixo seria inútil: a reentrega da Stripe encontraria a marca
  // e responderia "duplicado" sem aplicar nada, engolindo o evento de forma
  // permanente e silenciosa. Bastava uma falha transitória de escrita no KV
  // para uma encomenda paga nunca ser processada.
  let result = null;
  try {
    result = await applyEvent(event, env);
  } catch (e) {
    console.error('erro a aplicar evento', event.type, e.message);
    return new Response('erro interno', { status: 500 });   // provoca reentrega
  }

  // Conhecemos o número da encomenda mas o registo ainda não está legível: o KV
  // é eventualmente consistente e a Stripe entrega em segundos. Pedir reentrega
  // em vez de descartar — antes um evento repetido do que uma encomenda paga
  // sem dono avisado. Ao fim de RETRY_JANELA deixa de valer a pena insistir.
  if (result && result.retry) {
    const idade = Math.floor(Date.now() / 1000) - (event.created || 0);
    if (idade < RETRY_JANELA_SEGUNDOS) {
      console.log('encomenda ainda não visível, a pedir reentrega', result.id, event.type);
      return new Response('encomenda ainda não visível', { status: 409 });
    }
    console.error('ENCOMENDA NÃO ENCONTRADA após', idade, 's —', result.id, event.type, '(desisto)');
    result = null;
  }

  await Promise.all([
    env.ORDERS.put(evtKey, '1', { expirationTtl: EVENT_TTL_SECONDS }),
    twinKey ? env.ORDERS.put(twinKey, '1', { expirationTtl: EVENT_TTL_SECONDS }) : Promise.resolve(),
  ]);

  if (result && result.notify && result.notify.length) {
    ctx.waitUntil(enviarEMarcar(env, result.order.order_id, result.notify)
      .catch((e) => console.error('envio de emails falhou', e.message)));
  }
  return new Response('ok');
}

/**
 * Envia os emails e só depois marca a encomenda como notificada.
 *
 * Relê a encomenda imediatamente antes de enviar: se um evento gémeo já enviou,
 * não repete. A janela de corrida não fecha por completo — o KV é eventualmente
 * consistente e não tem escrita condicional; fechá-la exigiria Durable Objects
 * ou D1. Assumida com olhos abertos, porque as duas falhas não são simétricas:
 * um email repetido traz o mesmo número de encomenda e é evidente a quem o
 * recebe, enquanto um email que nunca sai é invisível.
 */
async function enviarEMarcar(env, orderId, notify) {
  for (const n of notify) {
    const antes = await getOrder(env, orderId);
    if (antes && antes[n.flag]) continue;    // um evento gémeo já tratou disto

    let ok = false;
    try {
      const r = await n.envia();
      const rs = Array.isArray(r) ? r : [r];
      // `skipped` conta como resolvido: falta a chave do Resend, ou o cliente
      // não deixou email. Insistir não muda nada.
      ok = rs.every((x) => x && (x.ok || x.skipped));
    } catch (e) {
      console.error('email lançou', n.flag, orderId, e.message);
    }

    if (!ok) {
      console.error('EMAIL NÃO ENVIADO —', n.flag, orderId, '— fica sem marca, o próximo evento volta a tentar');
      continue;
    }
    const atual = await getOrder(env, orderId);
    if (atual && !atual[n.flag]) { atual[n.flag] = true; await putOrder(env, atual); }
  }
}

/** Resolve a encomenda a partir do objeto do evento. */
async function resolveOrder(env, obj) {
  const md = obj.metadata || {};
  let id = md.order_id || obj.client_reference_id || null;
  if (!id && obj.id) {
    id = await env.ORDERS.get(`session:${obj.id}`) || await env.ORDERS.get(`pi:${obj.id}`);
  }
  if (!id && obj.payment_intent) id = await env.ORDERS.get(`pi:${obj.payment_intent}`);
  return id ? { id, order: await getOrder(env, id) } : { id: null, order: null };
}

/* Estados a partir dos quais o estado NÃO regride: o dinheiro entrou, ou houve
   reembolso ou contestação. A Stripe não garante a ordem de entrega dos
   eventos, por isso um evento atrasado não pode desfazer um facto posterior. */
const ESTADOS_FIRMES = ['paga', 'reembolsada', 'parcialmente_reembolsada', 'contestada'];
export function podeRegredir(order) { return !ESTADOS_FIRMES.includes(order.status); }

/**
 * Marca como paga e devolve os emails a enviar.
 *
 * NÃO marca `notified_paid` aqui: quem o faz é enviarEMarcar(), e só depois de
 * o envio ser aceite. Marcar antes significava que uma falha do Resend (429,
 * 5xx, chave da conta errada) deixava a encomenda registada como tratada sem
 * que o dono ou o cliente recebessem nada — e sem recuperação possível, porque
 * o webhook já respondeu 200 e um evento posterior veria o flag já posto.
 */
function markPaid(order, env) {
  const notify = [];
  if (order.status !== 'paga') {
    order.status = 'paga';
    order.paid_at = order.paid_at || new Date().toISOString();
  }
  if (!order.notified_paid) {
    notify.push({ flag: 'notified_paid', envia: () => Promise.all([avisoLoja(env, order), confirmacaoCliente(env, order)]) });
  }
  return notify;
}

async function applyEvent(event, env) {
  const obj = event.data.object;
  const { id, order } = await resolveOrder(env, obj);
  if (!order) {
    // Duas situações muito diferentes, que antes eram tratadas da mesma forma:
    if (id) {
      // Sabemos a que encomenda pertence, mas o registo ainda não está legível.
      // Descartar aqui era perder um pagamento — pedir reentrega.
      return { retry: true, id };
    }
    // Sem qualquer referência nossa: pagamento criado fora do site (ex.: link
    // manual no dashboard). Aceitar e ignorar.
    console.log('evento sem encomenda associada', event.type, obj.id);
    return null;
  }
  const notify = [];

  switch (event.type) {
    case 'checkout.session.completed': {
      // Guarda o que a Stripe recolheu, e decide pelo payment_status.
      const cd = obj.customer_details || {};
      order.cliente = { ...order.cliente, telefone: order.cliente.telefone || cd.phone || '' };
      if (obj.shipping_details) order.shipping_details = obj.shipping_details;
      if (obj.payment_intent) {
        order.payment_intent = obj.payment_intent;
        await env.ORDERS.put(`pi:${obj.payment_intent}`, id, { expirationTtl: ORDER_TTL_SECONDS });
      }
      if (typeof obj.amount_total === 'number' && obj.amount_total !== order.total_cents) {
        // Não bloqueia o fulfilment (o dinheiro é real), mas tem de ser visto.
        console.error('DIVERGÊNCIA DE VALOR', id, 'esperado', order.total_cents, 'cobrado', obj.amount_total);
        order.amount_mismatch = { esperado: order.total_cents, cobrado: obj.amount_total };
      }
      order.amount_total_cents = obj.amount_total;
      if (obj.payment_status && obj.payment_status !== 'unpaid') notify.push(...markPaid(order, env));
      else if (podeRegredir(order)) order.status = 'aguarda_pagamento';
      break;
    }

    case 'payment_intent.requires_action': {
      // Única via documentada para obtermos entidade/referência Multibanco.
      const mb = obj.next_action && obj.next_action.multibanco_display_details;
      if (mb) {
        // A referência guarda-se sempre (é informação, não estado).
        order.multibanco = {
          entity: mb.entity, reference: mb.reference,
          expires_at: mb.expires_at, hosted_voucher_url: mb.hosted_voucher_url,
        };
        // Mas o estado e o email "falta pagar" só se ainda não estiver pago. A
        // Stripe não garante a ordem de entrega dos eventos: este pode chegar
        // depois do pagamento, e mandar pagar a quem já pagou.
        if (podeRegredir(order)) {
          order.status = 'aguarda_multibanco';
          if (!order.notified_mb) {
            notify.push({ flag: 'notified_mb', envia: () => referenciaMultibanco(env, order) });
          }
        }
      }
      if (obj.id) await env.ORDERS.put(`pi:${obj.id}`, id, { expirationTtl: ORDER_TTL_SECONDS });
      break;
    }

    case 'checkout.session.async_payment_succeeded':
    case 'payment_intent.succeeded':
      order.payment_method = describeMethod(obj) || order.payment_method;
      notify.push(...markPaid(order, env));
      break;

    case 'payment_intent.processing':
      // Multibanco: o voucher EXPIROU e corre o buffer. NÃO é "pago".
      if (podeRegredir(order)) order.status = 'voucher_expirado_a_aguardar';
      break;

    case 'checkout.session.async_payment_failed':
    case 'payment_intent.payment_failed':
      if (podeRegredir(order)) order.status = 'falhou';
      break;

    case 'checkout.session.expired':
      // Sessão abandonada antes de submeter. Uma sessão que gerou referência
      // Multibanco fica 'complete' e nunca dispara isto.
      if (podeRegredir(order)) order.status = 'expirou';
      break;

    case 'charge.refunded':
      order.status = obj.amount_refunded === obj.amount ? 'reembolsada' : 'parcialmente_reembolsada';
      order.refunded_cents = obj.amount_refunded;
      break;

    case 'charge.dispute.created':
      order.status = 'contestada';
      order.dispute_id = obj.id;
      break;

    default:
      break;
  }

  await putOrder(env, order);
  return { order, notify };
}

function describeMethod(pi) {
  const t = pi.payment_method_types && pi.payment_method_types[0];
  return ({ card: 'Cartão', mb_way: 'MB WAY', multibanco: 'Multibanco' })[t] || t || null;
}

/* =============================================================
   GET /order?session_id=cs_…
   Devolve o mínimo para a página de obrigado — nunca PII completa.
   ============================================================= */
/* Estados anteriores à confirmação do pagamento. Só nestes é que a sessão da
   Stripe pode adiantar-se ao webhook — se o cliente aterra na página antes de o
   evento chegar, a sessão é a fonte mais fresca. */
const ANTES_DE_PAGAR = ['criada', 'aguarda_pagamento', 'aguarda_multibanco'];

/**
 * Decide o que reportar sobre uma encomenda, cruzando o nosso registo com a
 * sessão da Stripe.
 *
 * A sessão continua a dizer `payment_status: 'paid'` DEPOIS de um reembolso ou
 * de uma contestação — esses são objetos separados e não a alteram. Por isso a
 * sessão só pode PROMOVER uma encomenda que ainda não sabemos paga; nunca pode
 * sobrepor-se a um estado posterior, senão uma encomenda reembolsada é
 * reportada como paga.
 */
export function resolveOrderStatus(order, session) {
  const sessaoPaga = Boolean(session && session.payment_status && session.payment_status !== 'unpaid');
  const status = ANTES_DE_PAGAR.includes(order.status) && sessaoPaga ? 'paga' : order.status;
  // `paid` = o dinheiro chegou a entrar. Continua verdadeiro depois de um
  // reembolso, porque o pagamento existiu — quem quiser o estado atual lê
  // `status`.
  const paid = status === 'paga' || Boolean(order.paid_at);
  return { status, paid };
}

async function handleOrderStatus(url, env, cors) {
  const sid = url.searchParams.get('session_id') || '';
  if (!/^cs_[A-Za-z0-9_]{10,}$/.test(sid)) return json({ error: 'sessão inválida' }, 400, cors);

  // Só responde por sessões que este Worker criou — não serve de proxy à Stripe.
  const orderId = await env.ORDERS.get(`session:${sid}`);
  if (!orderId) return json({ error: 'não encontrada' }, 404, cors);
  const order = await getOrder(env, orderId);
  if (!order) return json({ error: 'não encontrada' }, 404, cors);

  let session = null;
  try {
    session = await stripeFetch(env, `/checkout/sessions/${sid}?expand[]=payment_intent`, { method: 'GET' });
  } catch (e) {
    console.error('retrieve falhou', sid, e.message);
  }

  // O webhook pode ainda não ter chegado quando o cliente aterra na página;
  // nesse caso a sessão é a fonte mais fresca.
  const { status, paid } = resolveOrderStatus(order, session);
  const pi = session && typeof session.payment_intent === 'object' ? session.payment_intent : null;
  const mbLive = pi && pi.next_action && pi.next_action.multibanco_display_details;

  return json({
    order_id: order.order_id,
    status,
    paid,
    payment_status: (session && session.payment_status) || null,
    entrega: order.entrega,
    total_cents: order.total_cents,
    subtotal_cents: order.subtotal_cents,
    shipping_cents: order.shipping_cents,
    lines: order.lines.map((l) => ({ name: l.name, qty: l.qty, unit_cents: l.unit_cents })),
    multibanco: mbLive
      ? { entity: mbLive.entity, reference: mbLive.reference, expires_at: mbLive.expires_at, hosted_voucher_url: mbLive.hosted_voucher_url }
      : (order.multibanco || null),
  }, 200, cors);
}

/* ============================= router ============================= */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // O webhook vem PRIMEIRO: nada pode tocar no corpo antes da verificação.
    if (url.pathname === '/stripe/webhook') return handleWebhook(request, env, ctx);

    if (url.pathname === '/health') {
      const out = {
        ok: true,
        api_version: env.STRIPE_API_VERSION,
        has_key: Boolean(env.STRIPE_RESTRICTED_KEY),
        has_webhook_secret: Boolean(env.STRIPE_WEBHOOK_SECRET),
        has_mail: Boolean(env.RESEND_API_KEY),
        origins: allowedOrigins(env),
      };
      // ?probe=1 confirma que a chave da Stripe autentica e tem o âmbito de
      // Checkout Sessions, sem criar nada nem cobrar nada. Serve para validar
      // uma chave nova (que é instalada pelo dono e nunca vista pelo dev) e
      // para diagnosticar mais tarde, se o checkout começar a falhar.
      if (url.searchParams.get('probe') === '1') {
        // A sonda faz chamadas externas e consome quotas da Stripe e do Resend,
        // por isso fica sujeita ao mesmo rate limit das outras rotas. Antes era
        // pública e sem limite: servia de oráculo para confirmar se uma chave
        // rk_live é válida, e de torneira para esgotar quotas do dono.
        const ipH = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (rateLimited(ipH)) return json({ ...out, probe: 'demasiados pedidos' }, 429);

        // Uma chave de TESTE autentica sem erro e cria sessões de brincar: o
        // cliente pagaria num checkout de sandbox e o dinheiro nunca chegava.
        // É a falha mais perigosa possível aqui, porque é silenciosa — daí ser
        // verificada explicitamente, e não só se a chave "funciona".
        const k = String(env.STRIPE_RESTRICTED_KEY || '');
        out.modo_chave = k.includes('_test_') ? 'TESTE — NÃO PÔR EM PRODUÇÃO' : k ? 'produção' : 'sem chave';
        // Prefixo e comprimento não revelam nada de secreto, mas dizem de
        // imediato se a chave é do tipo certo, se ficou cortada a meio, ou se
        // levou espaços colados — as três causas de um 401 "inexplicável".
        try {
          await stripeFetch(env, '/checkout/sessions?limit=1', { method: 'GET' });
          out.stripe_probe = 'ok';
        } catch (e) {
          out.stripe_probe = 'falhou';
          // Distingue "chave inválida" de "chave sem permissões" — são
          // problemas diferentes com correções diferentes.
          out.stripe_probe_reason = e.status === 401 ? 'chave inválida ou revogada'
            : e.status === 403 ? 'chave sem permissão de leitura em Checkout Sessions'
            : 'erro ' + (e.status || '?');
        }
        // A chave do Resend tem de pertencer à conta que é dona do domínio
        // verificado. Se o domínio for criado noutra conta, a chave antiga
        // continua válida mas recusa enviar — erro fácil de não notar.
        if (env.RESEND_API_KEY) {
          try {
            const r = await fetch('https://api.resend.com/domains', {
              headers: { Authorization: `Bearer ${String(env.RESEND_API_KEY).trim()}` },
            });
            if (!r.ok) {
              out.email_probe = 'falhou';
              // A mensagem do Resend distingue "chave inválida" de "chave só
              // de envio, sem permissão para listar domínios" — que não é um
              // problema, só impede este diagnóstico.
              const err = await r.text().catch(() => '');
              out.email_probe_reason = 'HTTP ' + r.status + ' — ' + err.slice(0, 180);
            } else {
              const d = await r.json();
              const doms = (d.data || []).map((x) => `${x.name} (${x.status})`);
              const from = String(env.MAIL_FROM || '').replace(/.*<|>.*/g, '');
              const dominioFrom = from.split('@')[1] || '';
              const ok = (d.data || []).some((x) => x.name === dominioFrom && x.status === 'verified');
              out.email_probe = dominioFrom.endsWith('resend.dev') ? 'remetente de teste do Resend'
                : ok ? 'ok' : 'remetente NÃO verificado nesta conta';
              out.email_dominios = doms.length ? doms : ['(nenhum nesta conta)'];
              out.email_from = from;
            }
          } catch (e) {
            out.email_probe = 'erro: ' + String(e.message || e);
          }
        }

        // O catálogo é lido do site público: se falhar, o checkout falha todo.
        try {
          const r = await fetch(env.PRODUCTS_URL, { cf: { cacheTtl: 0 } });
          const d = r.ok ? await r.json() : null;
          const ps = (d && d.products) || [];
          out.catalogo = r.ok
            ? { produtos: ps.length, com_sku: ps.filter((p) => p && p.sku).length, a_venda: ps.filter((p) => p && p.sku && p.available !== false && Number(p.price_eur) > 0 && Number(p.stock) > 0).length }
            : { erro: 'HTTP ' + r.status };
        } catch (e) {
          out.catalogo = { erro: String(e.message || e) };
        }
      }
      return json(out);
    }

    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') {
      return cors ? new Response(null, { status: 204, headers: cors }) : new Response('origem não autorizada', { status: 403 });
    }
    if (!cors) return json({ error: 'origem não autorizada' }, 403);

    if (url.pathname === '/checkout' && request.method === 'POST') return handleCheckout(request, env, cors);
    if (url.pathname === '/order' && request.method === 'GET') return handleOrderStatus(url, env, cors);

    return json({ error: 'rota desconhecida' }, 404, cors);
  },
};
