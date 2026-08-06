/* =============================================================
   Testes das partes puras do Worker — sem Stripe, sem Cloudflare, sem rede
   para fora. Cobrem o que, se estiver errado, cobra o valor errado a um
   cliente: a codificação que a Stripe exige, a verificação de assinatura dos
   webhooks, os escalões de portes e a recusa de carrinhos manipulados.

   Correr:  cd worker && npm test
   Precisa do dev server do site a servir os data/*.json:
            python3 _source/dev-server.py 8096
   ============================================================= */
import { formEncode, verifyStripeSignature } from './src/stripe.js';
import { priceOrder, shippingTierCents } from './src/pricing.js';
import { resolveOrderStatus, twinGuardKey, podeRegredir } from './src/index.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? (pass++, console.log('  ✓', name)) : (fail++, console.log('  ✗', name, extra ?? '')); };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `\n     obtido:  ${JSON.stringify(a)}\n     esperado: ${JSON.stringify(b)}`);

console.log('\nformEncode — a Stripe não aceita JSON, tem de sair aninhado');
eq('escalar', formEncode({ mode: 'payment' }), 'mode=payment');
eq('objeto aninhado', formEncode({ a: { b: { c: 1 } } }), 'a%5Bb%5D%5Bc%5D=1');
eq('array de objetos usa índices',
  formEncode({ line_items: [{ quantity: 2, price_data: { currency: 'eur', unit_amount: 12490 } }] }),
  'line_items%5B0%5D%5Bquantity%5D=2&line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=eur&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=12490');
eq('array de escalares usa []', formEncode({ allowed_countries: ['PT'] }), 'allowed_countries%5B%5D=PT');
eq('ignora null/undefined/vazio', formEncode({ a: 1, b: null, c: undefined, d: '' }), 'a=1');
ok('escapa caracteres especiais', formEncode({ n: 'Jante 16" 5x112 & ET45' }).includes('%22') === true);

console.log('\nverifyStripeSignature — HMAC sobre o corpo cru');
const secret = 'whsec_teste_1234567890';
const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } });
const now = 1_800_000_000;

async function sign(payload, ts, key = secret) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${ts}.${payload}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const rejects = async (name, fn) => { try { await fn(); ok(name, false, '(devia ter rejeitado)'); } catch { ok(name, true); } };

const good = `t=${now},v1=${await sign(body, now)}`;
const ev = await verifyStripeSignature(body, good, secret, now);
ok('aceita assinatura válida', ev.id === 'evt_1');
ok('tolera desvio dentro de 300 s', !!(await verifyStripeSignature(body, good, secret, now + 299)));
await rejects('rejeita fora da tolerância', () => verifyStripeSignature(body, good, secret, now + 301));
await rejects('rejeita corpo adulterado', () => verifyStripeSignature(body.replace('cs_1', 'cs_2'), good, secret, now));
await rejects('rejeita segredo errado', async () => verifyStripeSignature(body, `t=${now},v1=${await sign(body, now, 'whsec_outro')}`, secret, now));
await rejects('rejeita header ausente', () => verifyStripeSignature(body, null, secret, now));
await rejects('rejeita header malformado', () => verifyStripeSignature(body, 'lixo', secret, now));
ok('aceita múltiplas v1 (rotação de segredo)',
  !!(await verifyStripeSignature(body, `t=${now},v1=${await sign(body, now, 'whsec_velho')},v1=${await sign(body, now)}`, secret, now)));

console.log('\nshippingTierCents — escalões de peso');
const settings = { shipping: { tiers: [{ max_kg: 5, price: 4.99 }, { max_kg: 20, price: 8.99 }, { max_kg: 40, price: 14.99 }, { max_kg: 80, price: 24.99 }, { max_kg: 100000, price: 39.99 }] } };
for (const [kg, cents] of [[0, 499], [5, 499], [5.1, 899], [20, 899], [20.1, 1499], [40, 1499], [40.1, 2499], [80, 2499], [80.1, 3999], [5000, 3999]]) {
  eq(`${kg} kg`, shippingTierCents(kg, settings), cents);
}
ok('escalões desordenados são ordenados', shippingTierCents(6, { shipping: { tiers: [{ max_kg: 80, price: 24.99 }, { max_kg: 5, price: 4.99 }, { max_kg: 20, price: 8.99 }] } }) === 899);

/* Um escalão mal preenchido no backoffice dava portes GRÁTIS em silêncio (preço
   em branco -> 0 cêntimos) e um max_kg em branco valia 0 kg, ficava primeiro na
   ordenação e deslocava os escalões reais. */
const semPreco = { shipping: { tiers: [{ max_kg: 5, price: '' }, { max_kg: 20, price: 8.99 }] } };
eq('escalão sem preço é ignorado, não vira portes grátis', shippingTierCents(3, semPreco), 899);
const semPeso = { shipping: { tiers: [{ max_kg: '', price: 4.99 }, { max_kg: 20, price: 8.99 }] } };
eq('escalão sem peso é ignorado', shippingTierCents(3, semPeso), 899);
const zero = { shipping: { tiers: [{ max_kg: 5, price: 0 }] } };
try { shippingTierCents(3, zero); ok('tabela só com escalões inválidos falha', false, '(devia ter falhado)'); }
catch (e) { ok('tabela só com escalões inválidos falha em vez de cobrar 0 €', /não configurada/.test(e.message)); }

/* A sessão da Stripe continua a dizer "paid" depois de um reembolso ou de uma
   contestação. Um teste real (1 € por MB WAY, reembolsado) mostrou que o
   endpoint /order reportava "paga" uma encomenda que no armazenamento estava
   "reembolsada" — a sessão sobrepunha-se ao estado posterior. */
/* Auditoria adversarial (2026-08-06): a chave de dedup por tipo+objeto
   descartava o segundo charge.refunded da mesma cobrança, e um reembolso total
   feito em duas parcelas ficava registado como parcial. */
console.log('\ntwinGuardKey — repetições legítimas não são bloqueadas');
const evento = (type, object) => ({ type, data: { object } });
ok('eventos diferentes dão chaves diferentes',
  twinGuardKey(evento('payment_intent.succeeded', { id: 'pi_1' })) !== twinGuardKey(evento('charge.refunded', { id: 'pi_1', amount_refunded: 1 })));
eq('mesmo objeto e mesmo tipo dá a mesma chave',
  twinGuardKey(evento('checkout.session.completed', { id: 'cs_1' })),
  twinGuardKey(evento('checkout.session.completed', { id: 'cs_1' })));
ok('dois reembolsos parciais da MESMA cobrança dão chaves DIFERENTES',
  twinGuardKey(evento('charge.refunded', { id: 'ch_1', amount_refunded: 500 })) !==
  twinGuardKey(evento('charge.refunded', { id: 'ch_1', amount_refunded: 1000 })));
eq('o mesmo reembolso reentregue dá a mesma chave',
  twinGuardKey(evento('charge.refunded', { id: 'ch_1', amount_refunded: 500 })),
  twinGuardKey(evento('charge.refunded', { id: 'ch_1', amount_refunded: 500 })));
ok('objeto sem id não rebenta', typeof twinGuardKey(evento('x', {})) === 'string');

/* A Stripe não garante a ordem de entrega: um requires_action atrasado mandava
   "falta pagar" a quem já tinha pago, e um evento de falha sobrepunha-se a um
   reembolso já registado. */
console.log('\npodeRegredir — factos firmes não são desfeitos por eventos atrasados');
for (const s of ['criada', 'aguarda_pagamento', 'aguarda_multibanco', 'voucher_expirado_a_aguardar', 'falhou', 'expirou']) {
  ok(`${s} ainda pode mudar`, podeRegredir({ status: s }) === true);
}
for (const s of ['paga', 'reembolsada', 'parcialmente_reembolsada', 'contestada']) {
  ok(`${s} é firme`, podeRegredir({ status: s }) === false);
}

console.log('\nresolveOrderStatus — a sessão promove, nunca sobrepõe');
const PAGA = { payment_status: 'paid' };
const NAO_PAGA = { payment_status: 'unpaid' };

eq('sessão paga promove quem aguardava',
  resolveOrderStatus({ status: 'aguarda_pagamento' }, PAGA), { status: 'paga', paid: true });
eq('sessão paga promove quem esperava referência',
  resolveOrderStatus({ status: 'aguarda_multibanco' }, PAGA), { status: 'paga', paid: true });
eq('sessão não paga não promove nada',
  resolveOrderStatus({ status: 'aguarda_multibanco' }, NAO_PAGA), { status: 'aguarda_multibanco', paid: false });
eq('sem sessão, vale o nosso registo',
  resolveOrderStatus({ status: 'paga', paid_at: 'x' }, null), { status: 'paga', paid: true });

eq('REEMBOLSADA não é sobreposta por uma sessão que diz paid',
  resolveOrderStatus({ status: 'reembolsada', paid_at: 'x' }, PAGA), { status: 'reembolsada', paid: true });
eq('parcialmente reembolsada também não',
  resolveOrderStatus({ status: 'parcialmente_reembolsada', paid_at: 'x' }, PAGA), { status: 'parcialmente_reembolsada', paid: true });
eq('contestada também não',
  resolveOrderStatus({ status: 'contestada', paid_at: 'x' }, PAGA), { status: 'contestada', paid: true });
eq('voucher expirado não é promovido por engano',
  resolveOrderStatus({ status: 'voucher_expirado_a_aguardar' }, NAO_PAGA), { status: 'voucher_expirado_a_aguardar', paid: false });
eq('falhou continua falhou',
  resolveOrderStatus({ status: 'falhou' }, NAO_PAGA), { status: 'falhou', paid: false });

console.log('\npriceOrder — o servidor decide o valor (catálogo de :8096)');
const env = {
  PRODUCTS_URL: 'http://localhost:8096/data/products.json',
  SETTINGS_URL: 'http://localhost:8096/data/settings.json',
};
const rejectsWith = async (name, items, delivery, frag) => {
  try { await priceOrder(env, items, delivery); ok(name, false, '(devia ter rejeitado)'); }
  catch (e) { ok(name + ` → "${e.message}"`, frag ? e.message.includes(frag) : true, e.message); }
};

// Os valores esperados são derivados do próprio catálogo: o cliente muda
// preços no backoffice a qualquer momento e um teste que fixe 124,90 € passa
// a falhar por motivo errado. O que se testa é a ARITMÉTICA, não o preço.
const catalogo = await (await fetch(env.PRODUCTS_URL)).json();
const settingsLive = await (await fetch(env.SETTINGS_URL)).json();
const prod = (sku) => catalogo.products.find((p) => p.sku === sku);
const centsOf = (sku) => Math.round(prod(sku).price_eur * 100);

// As cobaias são escolhidas do catálogo, não fixadas por nome: o cliente
// altera preços e disponibilidade no backoffice, e um teste preso a um SKU
// concreto rebenta por motivo errado quando esse produto sai de venda.
const vendavel = (p) => p.sku && p.available !== false && Number(p.price_eur) > 0 && Number(p.stock) > 0;
const MULTI = (catalogo.products.find((p) => vendavel(p) && Number(p.stock) >= 4) || {}).sku;
const UNICO = (catalogo.products.find((p) => vendavel(p) && Number(p.stock) === 1) || {}).sku;
if (!MULTI || !UNICO) {
  console.log('  ✗ o catálogo não tem produtos à venda suficientes para testar (precisa de um com stock>=4 e um com stock=1)');
  process.exit(1);
}
console.log(`  (cobaias: ${MULTI} stock=${prod(MULTI).stock}, ${UNICO} stock=1)`);

// Os portes têm dois modos e o teste não pode depender de como a loja está
// configurada hoje: troca-se o settings.json à socapa e confirma-se que o
// interruptor manda mesmo. Sem isto, ligar "portes a combinar" no backoffice
// fazia falhar testes que estavam certos.
const fetchReal = globalThis.fetch;
async function comQuoteLater(valor, fn) {
  globalThis.fetch = async (url, opts) => {
    if (String(url) === env.SETTINGS_URL) {
      const s = JSON.parse(JSON.stringify(settingsLive));
      s.shipping = s.shipping || {};
      s.shipping.quote_later = valor;
      return new Response(JSON.stringify(s), { headers: { 'content-type': 'application/json' } });
    }
    return fetchReal(url, opts);
  };
  try { return await fn(); } finally { globalThis.fetch = fetchReal; }
}

const r = await priceOrder(env, [{ sku: MULTI, qty: 4 }, { sku: UNICO, qty: 1 }], 'ctt');
const pesoEsperado = prod(MULTI).weight_kg * 4 + prod(UNICO).weight_kg;
eq('subtotal em cêntimos', r.subtotal_cents, centsOf(MULTI) * 4 + centsOf(UNICO));
eq('peso somado', r.weight_kg, pesoEsperado);

const comTabela = await comQuoteLater(false, () =>
  priceOrder(env, [{ sku: MULTI, qty: 4 }, { sku: UNICO, qty: 1 }], 'ctt'));
eq('com tabela: portes = escalão do peso real', comTabela.shipping_cents, shippingTierCents(pesoEsperado, settingsLive));
eq('com tabela: sem bandeira de "a combinar"', comTabela.shipping_quote_later, false);

const aCombinar = await comQuoteLater(true, () =>
  priceOrder(env, [{ sku: MULTI, qty: 4 }, { sku: UNICO, qty: 1 }], 'ctt'));
eq('a combinar: não se cobram portes', aCombinar.shipping_cents, 0);
eq('a combinar: total é só o dos artigos', aCombinar.total_cents, aCombinar.subtotal_cents);
eq('a combinar: bandeira ligada (para o site e os emails avisarem)', aCombinar.shipping_quote_later, true);
eq('a combinar não afeta o levantamento na loja',
  (await comQuoteLater(true, () => priceOrder(env, [{ sku: MULTI, qty: 1 }], 'loja'))).shipping_quote_later, false);

eq('total = subtotal + portes', r.total_cents, r.subtotal_cents + r.shipping_cents);
ok('subtotal é inteiro (sem cêntimos fracionários)', Number.isInteger(r.subtotal_cents));
eq('levantamento na loja não tem portes', (await priceOrder(env, [{ sku: MULTI, qty: 1 }], 'loja')).shipping_cents, 0);

// Regra de negócio nova (2026-08-05): os pneus estão fora da venda online até
// os dados da etiqueta UE existirem. Tem de ser recusado no SERVIDOR, não só
// escondido no catálogo.
const indisponivel = catalogo.products.find((p) => p.sku && p.available === false);
if (indisponivel) {
  await rejectsWith(`produto marcado indisponível (${indisponivel.sku})`, [{ sku: indisponivel.sku, qty: 1 }], 'loja', 'já não está disponível');
} else {
  console.log('  (nenhum produto indisponível no catálogo — teste saltado)');
}

console.log('\npriceOrder — tentativas de manipulação');
const forged = await priceOrder(env, [{ sku: MULTI, qty: 1, price: 1, price_eur: 1, unit_cents: 1 }], 'loja');
eq('preço enviado pelo cliente é IGNORADO', forged.total_cents, centsOf(MULTI));
// O `shipping` que o corpo do pedido trouxesse nunca é lido: os portes saem
// sempre da tabela do servidor, pelo peso real.
const forgedShip = await priceOrder(env, [{ sku: MULTI, qty: 1, shipping: 0, shipping_cents: 0 }], 'ctt');
// Testado com a tabela ligada, que é o modo em que há um valor para forjar.
const forgedShipTabela = await comQuoteLater(false, () =>
  priceOrder(env, [{ sku: MULTI, qty: 1, shipping: 0, shipping_cents: 0 }], 'ctt'));
eq('portes enviados pelo cliente são IGNORADOS', forgedShipTabela.shipping_cents, shippingTierCents(prod(MULTI).weight_kg, settingsLive));
// No modo "a combinar" o cliente também não consegue impor um valor de portes:
// mande o que mandar, o servidor devolve 0 e marca a encomenda como pendente.
const forgedShipCombinar = await comQuoteLater(true, () =>
  priceOrder(env, [{ sku: MULTI, qty: 1, shipping: 999, shipping_cents: 999 }], 'ctt'));
eq('a combinar: portes forjados pelo cliente são IGNORADOS', forgedShipCombinar.shipping_cents, 0);
await rejectsWith('sku inexistente', [{ sku: 'nao-existe', qty: 1 }], 'loja', 'já não está disponível');
await rejectsWith('quantidade acima do stock', [{ sku: UNICO, qty: 2 }], 'loja', 'Só temos 1');
await rejectsWith('quantidade acima do máximo por linha', [{ sku: MULTI, qty: 9 }], 'loja', 'Máximo de 8');
await rejectsWith('quantidade zero', [{ sku: MULTI, qty: 0 }], 'loja', 'inválida');
await rejectsWith('quantidade negativa', [{ sku: MULTI, qty: -5 }], 'loja', 'inválida');
await rejectsWith('quantidade fracionária', [{ sku: MULTI, qty: 1.5 }], 'loja', 'inválida');
// "3" coage para 3 sem ambiguidade e nunca cobra a mais — aceitar é robustez.
eq('quantidade como texto numérico é aceite',
  (await priceOrder(env, [{ sku: MULTI, qty: '3' }], 'loja')).total_cents, centsOf(MULTI) * 3);
await rejectsWith('quantidade NaN', [{ sku: MULTI, qty: 'abc' }], 'loja', 'inválida');
await rejectsWith('quantidade Infinity', [{ sku: MULTI, qty: Infinity }], 'loja', 'inválida');
await rejectsWith('items não é array', { sku: 'x' }, 'loja', 'vazio');
await rejectsWith('sku repetido', [{ sku: MULTI, qty: 1 }, { sku: MULTI, qty: 1 }], 'loja', 'repetido');
await rejectsWith('carrinho vazio', [], 'loja', 'vazio');
await rejectsWith('demasiadas linhas', Array.from({ length: 21 }, (_, i) => ({ sku: 's' + i, qty: 1 })), 'loja', 'Demasiados');
await rejectsWith('sku ausente', [{ qty: 1 }], 'loja', 'sem identificação');

console.log(`\n${pass} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
