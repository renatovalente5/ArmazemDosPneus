/* =============================================================
   Bateria da GARANTIA DOS PNEUS SEMINOVOS — corre dentro de test.mjs (mesma
   contagem).

   DL n.º 84/2021, art. 12.º: 3 anos de garantia; num bem usado pode descer
   até 18 meses, mas só por acordo. O Worker é conduzido inteiro (/checkout,
   webhooks assinados, emails apanhados à saída — test/palco.mjs) para provar:

   1. SEM SEMINOVOS DE GARANTIA REDUZIDA, NADA MUDA: um seminovo com 36 meses,
      ou uma aceitação forjada num carrinho sem seminovos, dão o mesmo que o
      Worker de antes (7683ab4), byte a byte.
   2. SEM A ACEITAÇÃO, 400: com um código próprio, a mensagem para o cliente,
      e o texto, a versão e os artigos deste Worker — sem sessão da Stripe nem
      escrita no KV. Os meses são os do products.json PUBLICADO, não os do
      browser.
   3. COM ELA, O RETRATO: versão, texto e, por artigo, sku, nome e meses; a
      frase na página da Stripe; e os emails (confirmação em texto E html, e o
      aviso ao dono) com a garantia de cada artigo — mesmo que o dono a mude
      depois do checkout.
   ============================================================= */
import worker from '../src/index.js';
import { normalizarTermos, garantiaUsadosValida } from '../src/termos.js';
import { GARANTIA_VERSAO, CODIGO_GARANTIA, textoDaGarantia } from '../src/garantia.js';
import { kvFalso, redeFalsa, palco, eventos, workerDeAntes, semAcaso } from './palco.mjs';
import { ENV_HOJE, PRODUTOS, SETTINGS_HOJE, PEDIDOS } from './dados.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_DO_SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REF_ANTES = '7683ab4';
const clone = (x) => JSON.parse(JSON.stringify(x));

/* Pneus seminovos de ensaio (os do catálogo, à venda e com os dados todos). */
const seminovo = (sku, meses, extra = {}) => ({
  name: `Pneu Seminovo ${sku}`, category: 'Pneus Seminovos', brand: 'Ensaio', size: '205/55 R16 91V', price_eur: 32.9, stock: 4, weight_kg: 9,
  description: 'Pneu seminovo inspecionado.', condition: 'Seminovo', season: 'Verão', available: true, featured: false, hidden: false,
  snow_3pmsf: false, ice_grip: false, dot: '3221', tread_mm: 6, warranty_months: meses, sku, ...extra,
});
const S18 = seminovo('semi-conti-18', 18, { name: 'Pneu Seminovo Continental 205/55 R16' });
const S24 = seminovo('semi-goodyear-24', 24, { name: 'Pneu Seminovo Goodyear 195/65 R15' });
const S36 = seminovo('semi-michelin-36', 36, { name: 'Pneu Seminovo Michelin 205/55 R16' });
const CATALOGO = { products: [...PRODUTOS.products, S18, S24, S36] };
const MAX_STRIPE = 1200;   // o tecto do custom_text da Stripe

/* O que o checkout.js manda com a caixa marcada. */
const aceita = (artigos, versao = GARANTIA_VERSAO) => ({ aceita: true, versao, artigos });
const pedido = (items, extra = {}) => ({ ...PEDIDOS.loja, montagem: false, montagem_imediata: false, matricula: '', notas: '', items, ...extra });

/** /checkout e (se passar) o pagamento por cartão: devolve tudo o que saiu. */
async function conduzir(corpo, { produtos = CATALOGO, settings = SETTINGS_HOJE, w = worker, antesDoWebhook } = {}) {
  const rede = redeFalsa({ 'products.json': produtos, 'settings.json': settings });
  const kv = kvFalso();
  const p = palco(w, { env: ENV_HOJE, kv, rede });
  const [log, error] = [console.log, console.error];
  const registo = [];
  console.log = (...a) => registo.push(a.join(' '));
  console.error = (...a) => registo.push(a.join(' '));
  try {
    const checkout = await p.checkout(corpo);
    const d = JSON.parse(checkout.corpo);
    let encomendaNoCheckout = null;
    if (checkout.status === 200) {
      encomendaNoCheckout = JSON.parse(kv.mapa.get(`order:${d.order_id}`));
      if (antesDoWebhook) antesDoWebhook({ rede, kv });
      await p.webhook(eventos.sessaoConcluida({ order_id: d.order_id, sessao: rede.stripe[0].id, total: d.total_cents, entrega: corpo.entrega }));
    }
    const chave = [...kv.mapa.keys()].find((k) => k.startsWith('order:'));
    return {
      checkout, d, rede, kv, registo, encomendaNoCheckout,
      encomenda: chave ? JSON.parse(kv.mapa.get(chave)) : null,
      stripe: rede.stripe.map((s) => s.corpo),
      mensagemStripe: rede.stripe.length ? new URLSearchParams(rede.stripe[0].corpo).get('custom_text[submit][message]') : null,
      emails: rede.resend,
      confirmacao: rede.resend.find((m) => /confirmada/.test(m.subject)),
      dono: rede.resend.find((m) => /^\[Loja\]/.test(m.subject)),
      escritas: kv.ops.filter((o) => o.startsWith('put ')),
    };
  } finally {
    [console.log, console.error] = [log, error];
  }
}

/** As linhas de um bloco do email em texto: da linha TÍTULO até à linha vazia. */
function blocoTexto(texto, titulo) {
  const ls = texto.split('\n');
  const i = ls.findIndex((l) => l.startsWith(titulo));
  if (i < 0) return null;
  const fim = ls.indexOf('', i);
  return ls.slice(i + 1, fim < 0 ? undefined : fim);
}
/** O html sem etiquetas e com as entidades lidas (para o comparar com o texto). */
const lerHtml = (h) => h.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
/* A garantia acordada num email (o bloco da confirmação ou o do aviso ao dono)
   ou na página da Stripe. «Seminovo» sozinho não chega: é o nome dos artigos. */
const ACORDADA = /reduzida por acordo|GARANTIA DOS PNEUS SEMINOVOS|garantia reduzida que aceitou/;
const falaDoAcordo = (emails) => emails.some((m) => ACORDADA.test(m.text + (m.html || '')));
/** Os parágrafos do html entre o <h2>Garantia</h2> e o <h2> seguinte. */
function garantiaDoHtml(html) {
  const m = html.match(/>Garantia<\/h2>(.*?)<h2/s);
  return m ? [...m[1].matchAll(/<p[^>]*>(.*?)<\/p>/gs)].map((x) => lerHtml(x[1])) : null;
}

export async function correr({ ok }) {
  const eq = (nome, a, b) => {
    const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
    if (x === y) return ok(nome, true);
    let i = 0;
    while (i < x.length && x[i] === y[i]) i++;
    return ok(nome, false, `\n     primeira diferença no carácter ${i}:\n     obtido:   …${x.slice(Math.max(0, i - 80), i + 80)}…\n     esperado: …${y.slice(Math.max(0, i - 80), i + 80)}…`);
  };

  /* ============================================================ 0 */
  console.log('\nGarantia dos seminovos — o texto que o cliente aceita');
  const um = (meses, qty = 1, nome = 'Pneu A') => ({ nome, meses, qty });
  eq('um pneu seminovo, 18 meses', textoDaGarantia([um(18)], false),
    'Aceito que a garantia de conformidade deste pneu seminovo, por ser um bem usado, é de 18 meses em vez de 3 anos (DL n.º 84/2021, art. 12.º).');
  eq('duas unidades do mesmo: o plural', textoDaGarantia([um(18, 2)], false),
    'Aceito que a garantia de conformidade destes pneus seminovos, por serem bens usados, é de 18 meses em vez de 3 anos (DL n.º 84/2021, art. 12.º).');
  eq('dois artigos com os mesmos meses: uma frase só', textoDaGarantia([um(24, 1, 'Pneu A'), um(24, 1, 'Pneu B')], false),
    'Aceito que a garantia de conformidade destes pneus seminovos, por serem bens usados, é de 24 meses em vez de 3 anos (DL n.º 84/2021, art. 12.º).');
  eq('meses diferentes: a garantia de cada artigo', textoDaGarantia([um(18, 1, 'Pneu A'), um(24, 1, 'Pneu B')], false),
    'Aceito que a garantia de conformidade destes pneus seminovos, por serem bens usados, é a indicada a seguir, em vez de 3 anos (DL n.º 84/2021, art. 12.º): Pneu A — 18 meses; Pneu B — 24 meses.');
  eq('com outro seminovo de 3 anos no carrinho: diz qual é o reduzido', textoDaGarantia([um(18, 1, 'Pneu A')], true),
    'Aceito que a garantia de conformidade deste pneu seminovo, por ser um bem usado, é a indicada a seguir, em vez de 3 anos (DL n.º 84/2021, art. 12.º): Pneu A — 18 meses.');
  ok(`a versão do texto é uma data (${GARANTIA_VERSAO})`, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(GARANTIA_VERSAO));

  /* ============================================================ 1 */
  console.log(`\nGarantia dos seminovos — sem garantia reduzida, nada muda (o Worker de ${REF_ANTES}, do git)`);
  let antes;
  try {
    antes = await workerDeAntes(REF_ANTES, RAIZ_DO_SITE);
  } catch (e) {
    ok(`ler o Worker de ${REF_ANTES} do git`, false, e.message);
    return;
  }
  try {
    const casos = [
      ['um pneu seminovo com 36 meses (a garantia inteira)', pedido([{ sku: S36.sku, qty: 1 }])],
      ['uma aceitação forjada num carrinho sem seminovos', pedido([{ sku: 'jante-ensaio-16', qty: 2 }], { garantia_usados: aceita([{ sku: 'jante-ensaio-16', meses: 18 }]) })],
      ['uma aceitação forjada, com o seminovo de 36 meses', pedido([{ sku: S36.sku, qty: 1 }], { garantia_usados: aceita([{ sku: S36.sku, meses: 18 }]) })],
    ];
    for (const [nome, corpo] of casos) {
      const A = await conduzir(corpo, { w: antes.worker });
      const N = await conduzir(corpo);
      ok(`${nome}: o de antes passou e mandou 2 emails — há o que comparar`, A.checkout.status === 200 && A.emails.length === 2, A.checkout);
      eq(`${nome}: /checkout, página da Stripe e emails iguais byte a byte`, semAcaso([N.checkout, N.stripe, N.emails]), semAcaso([A.checkout, A.stripe, A.emails]));
      ok(`${nome}: o retrato não ganha a garantia`, N.encomenda && !Object.hasOwn(N.encomenda.termos, 'garantia_usados'), N.encomenda && N.encomenda.termos);
      ok(`${nome}: nenhum email nem a página da Stripe falam de garantia acordada`, !falaDoAcordo(N.emails) && !ACORDADA.test(N.mensagemStripe));
    }
  } finally {
    antes.apagar();
  }

  /* ============================================================ 2 */
  console.log('\nGarantia dos seminovos — sem a aceitação, 400 (e nada gravado)');
  const umSemi = pedido([{ sku: S18.sku, qty: 1 }]);
  const textoUm = 'Aceito que a garantia de conformidade deste pneu seminovo, por ser um bem usado, é de 18 meses em vez de 3 anos (DL n.º 84/2021, art. 12.º).';
  {
    const R = await conduzir(umSemi);
    ok('sem a aceitação: 400, sem sessão da Stripe nem escrita no KV', R.checkout.status === 400 && R.rede.stripe.length === 0 && R.escritas.length === 0, R.checkout);
    eq('   com o código próprio', R.d.codigo, CODIGO_GARANTIA);
    eq('   com o texto, a versão e os artigos deste Worker (para a página os mostrar)', R.d.garantia_usados,
      { versao: GARANTIA_VERSAO, texto: textoUm, artigos: [{ sku: S18.sku, nome: S18.name, meses: 18 }] });
    eq('   e uma mensagem em português simples, que manda confirmar na caixa (ou recarregar)', R.d.error,
      'O pneu seminovo tem uma garantia de 18 meses, e não de 3 anos, por ser um bem usado — e isso só vale com o seu acordo. Confirme-o na caixa junto ao botão «Pagar agora» (se não a vir, recarregue a página).');
  }
  const recusas = [
    ['a caixa por marcar (aceita: false)', { aceita: false, versao: GARANTIA_VERSAO, artigos: [{ sku: S18.sku, meses: 18 }] }],
    ['aceita em texto («true»)', { aceita: 'true', versao: GARANTIA_VERSAO, artigos: [{ sku: S18.sku, meses: 18 }] }],
    ['outra versão do texto', aceita([{ sku: S18.sku, meses: 18 }], '2020-01-01')],
    ['sem versão', { aceita: true, artigos: [{ sku: S18.sku, meses: 18 }] }],
    ['outros meses (a página tinha 24)', aceita([{ sku: S18.sku, meses: 24 }])],
    ['os meses em texto («18»)', aceita([{ sku: S18.sku, meses: '18' }])],
    ['outro artigo', aceita([{ sku: S24.sku, meses: 24 }])],
    ['sem artigos', aceita([])],
    ['os artigos num objecto', { aceita: true, versao: GARANTIA_VERSAO, artigos: { sku: S18.sku, meses: 18 } }],
    ['um texto em vez do objecto', 'aceito'],
    ['__proto__ com a aceitação (JSON cru)', '__proto__'],
  ];
  for (const [nome, g] of recusas) {
    const corpo = g === '__proto__'
      ? JSON.parse(JSON.stringify(umSemi).replace(/}$/, `,"garantia_usados":{"__proto__":{"aceita":true,"versao":"${GARANTIA_VERSAO}","artigos":[{"sku":"${S18.sku}","meses":18}]}}}`))
      : { ...umSemi, garantia_usados: g };
    const R = await conduzir(corpo);
    ok(`${nome}: 400 com o código, sem sessão nem escrita`, R.checkout.status === 400 && R.d.codigo === CODIGO_GARANTIA && R.rede.stripe.length === 0 && R.escritas.length === 0, R.checkout);
  }
  {
    // Dois seminovos: a aceitação tem de trazer os dois.
    const dois = pedido([{ sku: S18.sku, qty: 1 }, { sku: S24.sku, qty: 2 }]);
    const R = await conduzir({ ...dois, garantia_usados: aceita([{ sku: S18.sku, meses: 18 }]) });
    ok('dois seminovos e a aceitação só de um: 400', R.checkout.status === 400 && R.d.codigo === CODIGO_GARANTIA, R.checkout);
    eq('   o texto diz a garantia de cada um (meses diferentes)', R.d.garantia_usados.texto,
      `Aceito que a garantia de conformidade destes pneus seminovos, por serem bens usados, é a indicada a seguir, em vez de 3 anos (DL n.º 84/2021, art. 12.º): ${S18.name} — 18 meses; ${S24.name} — 24 meses.`);
    ok('   e a mensagem não diz um número de meses que não é de todos', /garantia mais curta do que 3 anos, por serem bens usados/.test(R.d.error) && !/de 18 meses/.test(R.d.error), R.d.error);
  }
  {
    // Os meses são os do products.json PUBLICADO: o browser não os escolhe.
    const R = await conduzir({ ...umSemi, items: [{ sku: S18.sku, qty: 1, warranty_months: 36, meses: 36 }], garantia_usados: aceita([{ sku: S18.sku, meses: 36 }]) });
    ok('o browser diz 36 meses (nos artigos e na aceitação): 400 — vale o products.json publicado (18)', R.checkout.status === 400 && R.d.garantia_usados.artigos[0].meses === 18, R.checkout);
    const so = await conduzir(umSemi, { produtos: { products: [...PRODUTOS.products, { ...S18, warranty_months: 24 }] } });
    ok('   e com o products.json a dizer 24, o 400 traz 24', so.d.garantia_usados.artigos[0].meses === 24 && /de 24 meses/.test(so.d.garantia_usados.texto), so.d);
  }
  {
    // Uma página antiga em cache não manda nada: o 400 basta-lhe (mostra o error).
    const R = await conduzir(umSemi);
    ok('uma página antiga (sem a caixa) recebe a mensagem que manda recarregar', /recarregue a página/.test(R.d.error));
  }
  {
    // Os pagamentos desligados vêm antes (não se pede o acordo de uma compra que não se pode fazer).
    const R = await conduzir(umSemi, { settings: { ...SETTINGS_HOJE, payment: { mode: 'reserva' } } });
    eq('com os pagamentos desligados no painel: o 503 de sempre, e não o 400 da garantia', [R.checkout.status, R.d.codigo], [503, undefined]);
  }
  {
    // Valores da garantia que não são uma redução: a garantia legal, sem caixa.
    for (const [nome, meses] of [['sem garantia escrita', undefined], ['12 meses (abaixo do que a lei deixa)', 12], ['17 meses', 17], ['18,5 meses', 18.5], ['«18» em texto', '18'], ['48 meses', 48]]) {
      const p = { ...S18 };
      if (meses === undefined) delete p.warranty_months; else p.warranty_months = meses;
      const R = await conduzir(umSemi, { produtos: { products: [...PRODUTOS.products, p] } });
      ok(`seminovo com ${nome}: não é uma redução que se possa acordar — segue sem caixa, e o retrato não a tem`,
        R.checkout.status === 200 && !Object.hasOwn(R.encomenda.termos, 'garantia_usados') && !ACORDADA.test(R.mensagemStripe) && !falaDoAcordo(R.emails), R.checkout);
    }
    const jante = { ...PRODUTOS.products[0], sku: 'jante-usada', condition: 'Seminovo', warranty_months: 18 };
    const Rj = await conduzir(pedido([{ sku: 'jante-usada', qty: 1 }]), { produtos: { products: [...PRODUTOS.products, jante] } });
    ok('uma jante «Seminovo» com 18 meses: não é pneu, o site não lhe anuncia garantia — segue sem caixa (vale a legal)',
      Rj.checkout.status === 200 && !Object.hasOwn(Rj.encomenda.termos, 'garantia_usados'), Rj.checkout);
  }

  /* ============================================================ 3 */
  console.log('\nGarantia dos seminovos — com a aceitação: o retrato, a página da Stripe e os emails');
  const ok18 = { ...umSemi, garantia_usados: aceita([{ sku: S18.sku, meses: 18 }]) };
  const R = await conduzir(ok18);
  ok('com a aceitação: 200, a sessão da Stripe criada', R.checkout.status === 200 && R.rede.stripe.length === 1, R.checkout);
  eq('o retrato guarda o acordo: versão, texto e, por artigo, sku, nome e meses', R.encomendaNoCheckout.termos.garantia_usados,
    { versao: GARANTIA_VERSAO, texto: textoUm, artigos: [{ sku: S18.sku, nome: S18.name, meses: 18 }] });
  eq('   e é o último grupo do retrato (o resto fica como era)', Object.keys(R.encomendaNoCheckout.termos), ['versao', 'prazos', 'devolucao', 'contactos', 'empresa', 'garantia_usados']);
  eq('   normalizar o retrato outra vez dá o mesmo (é o que cada email faz)', normalizarTermos(R.encomendaNoCheckout.termos, ENV_HOJE).termos, R.encomendaNoCheckout.termos);
  eq('as escritas no KV são as de sempre (a encomenda e a sessão)', R.escritas.slice(0, 2).map((o) => o.split(':')[0]), ['put order', 'put session']);
  eq('a página da Stripe: a frase de sempre e, a seguir, a da garantia', R.mensagemStripe,
    `Ao concluir o pagamento celebra um contrato de compra e venda com obrigação de pagar. Levantamento em Travessa do Navega, 436 F, 3885-183 Arada, Ovar. Inclui um pneu seminovo (bem usado) com a garantia reduzida que aceitou: 18 meses.`);
  ok('   sem nada que o Markdown da Stripe leia, e dentro do tecto de 1200', !/[[\]<>*_`]/.test(R.mensagemStripe) && R.mensagemStripe.length <= MAX_STRIPE, R.mensagemStripe);
  eq('as linhas da Stripe são as de sempre (o seminovo com o preço do catálogo)',
    [...new URLSearchParams(R.stripe[0])].filter(([k]) => k.startsWith('line_items[0]')).map(([k, v]) => `${k}=${v}`),
    [`line_items[0][quantity]=1`, `line_items[0][price_data][currency]=eur`, `line_items[0][price_data][unit_amount]=3290`,
      `line_items[0][price_data][product_data][name]=${S18.name}`, 'line_items[0][price_data][product_data][description]=Seminovo · IVA e ecovalor incluídos',
      `line_items[0][price_data][product_data][metadata][sku]=${S18.sku}`]);

  const c = R.confirmacao;
  const gTexto = blocoTexto(c.text, 'GARANTIA');
  eq('confirmação, texto: o bloco GARANTIA com a garantia do artigo', gTexto, [
    '  Garantia legal de conformidade nos termos do DL 84/2021.',
    '  Pneus seminovos (bens usados), com a garantia reduzida por acordo que',
    '  aceitou antes de pagar (art. 12.º do DL 84/2021):',
    `    ${S18.name} — 18 meses`,
  ]);
  const gHtml = garantiaDoHtml(c.html);
  eq('confirmação, html: os mesmos parágrafos', gHtml, [
    'Garantia legal de conformidade nos termos do DL 84/2021.',
    `Pneus seminovos (bens usados), com a garantia reduzida por acordo que aceitou antes de pagar (art. 12.º do DL 84/2021):\n${S18.name} — 18 meses`,
  ]);
  const juntar = (ls) => ls.map((l) => l.trim()).join(' ');
  eq('   texto e html dizem o mesmo, palavra a palavra', juntar(gHtml.join('\n').split('\n')), juntar(gTexto));
  ok('confirmação, html: os meses a negrito, e nada por escapar', c.html.includes(`${S18.name} — <strong>18 meses</strong>`));
  const hora = `${R.encomenda.created_at.slice(0, 16).replace('T', ' ')} UTC`;
  eq('aviso ao dono: o bloco da garantia, a seguir aos artigos — e o texto aceite, com a hora do checkout e a versão (a prova que fica)',
    blocoTexto(R.dono.text, 'GARANTIA DOS PNEUS SEMINOVOS'), [`  ${S18.name} — 18 meses`, `  Texto aceite no checkout em ${hora} (versão ${GARANTIA_VERSAO}): «${textoUm}»`]);
  ok('   com o título que diz que o cliente a aceitou, depois do TOTAL e antes da ENTREGA',
    /\n {2}TOTAL: [^\n]+\n\nGARANTIA DOS PNEUS SEMINOVOS \(reduzida por acordo: o cliente aceitou-a antes de pagar\)\n[^]*?\n\nENTREGA\n/.test(R.dono.text));

  {
    // Dois seminovos com meses diferentes, e outro com a garantia inteira.
    const corpo = pedido([{ sku: S18.sku, qty: 1 }, { sku: S36.sku, qty: 1 }, { sku: S24.sku, qty: 2 }],
      { garantia_usados: aceita([{ sku: S18.sku, meses: 18 }, { sku: S24.sku, meses: 24 }]) });
    const M = await conduzir(corpo);
    ok('três seminovos (18, 36 e 24 meses), aceites os dois reduzidos: 200', M.checkout.status === 200, M.checkout);
    eq('   o retrato só tem os dois reduzidos, pela ordem do carrinho', M.encomenda.termos.garantia_usados.artigos,
      [{ sku: S18.sku, nome: S18.name, meses: 18 }, { sku: S24.sku, nome: S24.name, meses: 24 }]);
    eq('   o texto aceite nomeia-os (há um seminovo com os 3 anos)', M.encomenda.termos.garantia_usados.texto,
      `Aceito que a garantia de conformidade destes pneus seminovos, por serem bens usados, é a indicada a seguir, em vez de 3 anos (DL n.º 84/2021, art. 12.º): ${S18.name} — 18 meses; ${S24.name} — 24 meses.`);
    ok('   a Stripe diz «de 18 a 24 meses, conforme o pneu»', M.mensagemStripe.endsWith(' Inclui pneus seminovos (bens usados) com a garantia reduzida que aceitou: de 18 a 24 meses, conforme o pneu.'), M.mensagemStripe);
    eq('   a confirmação lista os dois, no texto', blocoTexto(M.confirmacao.text, 'GARANTIA').slice(3), [`    ${S18.name} — 18 meses`, `    ${S24.name} — 24 meses`]);
    ok('   e no html', garantiaDoHtml(M.confirmacao.html)[1].endsWith(`${S18.name} — 18 meses\n${S24.name} — 24 meses`), garantiaDoHtml(M.confirmacao.html));
    ok('   o de 36 meses não aparece na garantia acordada', !blocoTexto(M.confirmacao.text, 'GARANTIA').some((l) => l.includes(S36.name)) && !blocoTexto(M.dono.text, 'GARANTIA DOS PNEUS SEMINOVOS').some((l) => l.includes(S36.name)));
    const env = { ...corpo, entrega: 'ctt', morada: 'Rua do Ensaio, 10', cp: '1000-001', localidade: 'Lisboa' };
    const E = await conduzir(env);
    ok('   por envio CTT: a frase da garantia junta-se à da entrega', /para Portugal continental\. Inclui pneus seminovos/.test(E.mensagemStripe), E.mensagemStripe);
  }

  {
    // O retrato: o dono muda a garantia (e o nome) depois do checkout.
    const muda = ({ rede }) => { rede.dados['products.json'] = { products: [...PRODUTOS.products, { ...S18, warranty_months: 30, name: 'Outro nome' }] }; };
    const D = await conduzir(ok18, { antesDoWebhook: muda });
    ok('o dono muda a garantia para 30 meses depois do checkout: os emails dizem os 18 aceites',
      D.confirmacao.text.includes(`    ${S18.name} — 18 meses`) && D.confirmacao.html.includes(`${S18.name} — <strong>18 meses</strong>`) && !/30 meses|Outro nome/.test(D.confirmacao.text + D.confirmacao.html + D.dono.text));
  }

  {
    // Um nome com HTML e quebras de linha: escapado no html, numa linha no texto.
    const hostil = { ...S18, name: 'Pneu <b>Seminovo</b>\nPAGAMENTO ANULADO & Cia' };
    const H = await conduzir(ok18, { produtos: { products: [...PRODUTOS.products, hostil] } });
    const nome = 'Pneu <b>Seminovo</b> PAGAMENTO ANULADO & Cia';
    eq('nome com HTML e quebra de linha: no retrato numa linha', H.encomenda.termos.garantia_usados.artigos[0].nome, nome);
    ok('   escapado no html, e nenhuma linha injectada no texto',
      H.confirmacao.html.includes(`Pneu &lt;b&gt;Seminovo&lt;/b&gt; PAGAMENTO ANULADO &amp; Cia — <strong>18 meses</strong>`)
      && !H.confirmacao.html.includes('<b>Seminovo') && !blocoTexto(H.confirmacao.text, 'GARANTIA').some((l) => /^\s*PAGAMENTO/.test(l)));
  }

  {
    // Um retrato estragado no KV: a garantia cai (vale a legal) e fica registada como recusada.
    const estragos = [
      ['meses 12', (g) => { g.artigos[0].meses = 12; }],
      ['meses em texto', (g) => { g.artigos[0].meses = '18'; }],
      ['sku com espaço', (g) => { g.artigos[0].sku = 'a b'; }],
      ['sem texto', (g) => { delete g.texto; }],
      ['versão estranha', (g) => { g.versao = 'v1'; }],
      ['artigos vazios', (g) => { g.artigos = []; }],
      ['nome só de espaços', (g) => { g.artigos[0].nome = '   '; }],
    ];
    for (const [nome, estraga] of estragos) {
      const g = clone(R.encomendaNoCheckout.termos.garantia_usados);
      estraga(g);
      const { termos, invalidos } = normalizarTermos({ ...R.encomendaNoCheckout.termos, garantia_usados: g }, ENV_HOJE);
      ok(`retrato com a garantia estragada (${nome}): sai do retrato e fica em «recusados»`, !Object.hasOwn(termos, 'garantia_usados') && invalidos.includes('garantia_usados'), JSON.stringify(termos.garantia_usados));
    }
    const kvEstragado = ({ kv }) => {
      const k = [...kv.mapa.keys()].find((x) => x.startsWith('order:'));
      const o = JSON.parse(kv.mapa.get(k));
      o.termos.garantia_usados.artigos[0].meses = 6;
      kv.mapa.set(k, JSON.stringify(o));
    };
    const X = await conduzir(ok18, { antesDoWebhook: kvEstragado });
    ok('   e os emails, com o retrato estragado, ficam só com a garantia legal (a de 3 anos)', !falaDoAcordo(X.emails)
      && blocoTexto(X.confirmacao.text, 'GARANTIA').join('\n') === '  Garantia legal de conformidade nos termos do DL 84/2021.', blocoTexto(X.confirmacao.text, 'GARANTIA'));
    eq('normalizar um acordo bom: igual', garantiaUsadosValida(R.encomendaNoCheckout.termos.garantia_usados), R.encomendaNoCheckout.termos.garantia_usados);
  }

  {
    // Sem seminovos, os emails não mudam (o w-dados prova-o byte a byte contra o de antes); aqui, a guarda da guarda.
    const J = await conduzir(pedido([{ sku: 'jante-ensaio-16', qty: 2 }]));
    ok('uma encomenda sem seminovos: nenhum email fala de seminovos nem de garantia acordada', !/seminovo/i.test(J.emails.map((m) => m.text + (m.html || '')).join('')) && !falaDoAcordo(J.emails));
    ok('   e as duas verificações sabem dizer «sim» (a encomenda do seminovo fala do acordo nos dois emails)',
      falaDoAcordo([R.confirmacao]) && falaDoAcordo([R.dono]) && ACORDADA.test(R.mensagemStripe));
  }
}
