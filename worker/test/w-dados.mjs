/* =============================================================
   Bateria da fase W-dados — corre dentro de test.mjs (mesma contagem).

   O Worker é conduzido inteiro, como a Cloudflare o conduz: POST /checkout,
   depois os webhooks da Stripe (assinados), e os emails apanhados à saída
   para o Resend. Três perguntas:

   1. IGUAL A ANTES. Enquanto o site.json e o empresa.json não existirem (ou
      falharem), a página da Stripe e os emails têm de sair iguais byte a byte
      aos do Worker de antes — o código do commit 7683ab4, tirado do git, e
      conduzido da mesma maneira. Também para uma encomenda criada ANTES do
      deploy e paga depois (sem retrato).
   2. CADA CAMPO SEGUE O PAINEL. Com valores novos nos três ficheiros, cada um
      aparece no sítio certo (texto E html), e trocando-os de volta pelos
      antigos o resultado é outra vez o de antes — não mudou mais nada.
   3. RETRATO E JSON HOSTIL. Os emails repetem o que se prometeu no checkout,
      mesmo que o site mude a seguir; e nenhum valor partido, gigante ou com
      HTML chega ao cliente por escapar.
   ============================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/index.js';
import { CACHE_DADOS } from '../src/pricing.js';
import { normalizarTermos, termosDeRecurso, termosDaEncomenda, nifValido, moradaLinha, contactoLinha } from '../src/termos.js';
import { esc } from '../src/email-html.js';
import { kvFalso, redeFalsa, palco, eventos, workerDeAntes, semAcaso, varsDoToml } from './palco.mjs';
import { ENV_HOJE, PRODUTOS, SETTINGS_HOJE, SITE_A2, EMPRESA_A2, PEDIDOS, nifCom } from './dados.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PASTA_WORKER = path.resolve(AQUI, '..');
const RAIZ_DO_SITE = path.resolve(PASTA_WORKER, '..');

/* O main do site antes da fase W-dados. Se um dia os emails mudarem de
   propósito (outro texto), a prova «igual a antes» deixa de fazer sentido e
   este commit passa a ser o dessa mudança — nunca se apaga a comparação. */
const REF_ANTES = '7683ab4';

const clone = (x) => JSON.parse(JSON.stringify(x));
const pega = (o, caminho) => caminho.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

/* ---------- cenários ---------- */

const comPortes = (quote_later) => ({ ...SETTINGS_HOJE, shipping: { ...SETTINGS_HOJE.shipping, quote_later } });

const CENARIOS = [
  { nome: 'envio CTT, portes a combinar, pago por cartão', pedido: PEDIDOS.ctt, settings: SETTINGS_HOJE, emails: 2,
    eventos: (e) => [eventos.sessaoConcluida(e)] },
  { nome: 'envio CTT, portes pela tabela', pedido: PEDIDOS.ctt, settings: comPortes(false), emails: 2,
    eventos: (e) => [eventos.sessaoConcluida(e)] },
  { nome: 'levantamento na loja com montagem imediata', pedido: PEDIDOS.loja, settings: SETTINGS_HOJE, emails: 2,
    eventos: (e) => [eventos.sessaoConcluida(e)] },
  { nome: 'Multibanco: referência, e o pagamento dias depois', pedido: PEDIDOS.ctt, settings: comPortes(false), emails: 3,
    eventos: (e) => [eventos.sessaoConcluida(e, { pago: false }), eventos.referenciaMultibanco(e), eventos.pagamentoRecebido(e)] },
  { nome: 'valor cobrado diferente do esperado', pedido: PEDIDOS.loja, settings: SETTINGS_HOJE, emails: 2,
    eventos: (e) => [eventos.sessaoConcluida(e, { cobrado: e.total + 100 })] },
  { nome: 'código postal da Madeira (recusado)', pedido: PEDIDOS.madeira, settings: SETTINGS_HOJE, emails: 0, eventos: () => [] },
  { nome: 'pagamentos desligados no painel (503)', pedido: PEDIDOS.ctt, settings: { ...SETTINGS_HOJE, payment: { mode: 'reserva' } }, emails: 0, eventos: () => [] },
];
const CEN = Object.fromEntries(CENARIOS.map((c, i) => [['ctt', 'tabela', 'loja', 'mb', 'divergente', 'madeira', 'reserva'][i], c]));

/**
 * Corre um cenário: o /checkout num Worker, os webhooks noutro (o mesmo, ou o
 * novo a receber uma encomenda do de antes). `antesDoWebhook` muda o mundo
 * entre os dois — é assim que se prova o retrato.
 */
async function correrCenario(ws, cen, { settings = cen.settings, site, empresa, antesDoWebhook } = {}) {
  const dados = { 'products.json': PRODUTOS, 'settings.json': settings };
  if (site !== undefined) dados['site.json'] = site;
  if (empresa !== undefined) dados['empresa.json'] = empresa;
  const rede = redeFalsa(dados);
  const kv = kvFalso();
  const pc = palco(ws.checkout, { env: ENV_HOJE, kv, rede });
  const pw = palco(ws.webhook, { env: ENV_HOJE, kv, rede });

  // O que o Worker escreve na consola fica guardado (e não enche a saída da
  // bateria); os erros do /checkout dizem que grupos foram recusados.
  const erros = [];
  const registo = [];
  const [log, error] = [console.log, console.error];
  console.log = (...a) => { registo.push(a.join(' ')); };
  console.error = (...a) => { registo.push(a.join(' ')); erros.push(a.join(' ')); };
  let checkout, nCheckout;
  const webhooks = [];
  let encomendaNoCheckout = null;
  try {
    checkout = await pc.checkout(cen.pedido);
    nCheckout = rede.chamadas.length;
    console.error = (...a) => { registo.push(a.join(' ')); };
    if (checkout.status === 200) {
      const r = JSON.parse(checkout.corpo);
      const e = { order_id: r.order_id, sessao: rede.stripe[0].id, total: r.total_cents, entrega: cen.pedido.entrega };
      encomendaNoCheckout = JSON.parse(kv.mapa.get(`order:${r.order_id}`));
      if (antesDoWebhook) antesDoWebhook({ rede, kv, e });
      for (const ev of cen.eventos(e)) webhooks.push(await pw.webhook(ev));
    }
  } finally {
    [console.log, console.error] = [log, error];
  }
  const chave = [...kv.mapa.keys()].find((k) => k.startsWith('order:'));
  return {
    checkout, webhooks, erros,
    stripe: rede.stripe.map((s) => s.corpo),
    mensagemStripe: rede.stripe.length ? new URLSearchParams(rede.stripe[0].corpo).get('custom_text[submit][message]') : null,
    emails: rede.resend,
    encomendaNoCheckout,
    encomenda: chave ? JSON.parse(kv.mapa.get(chave)) : null,
    kvOps: kv.ops,
    chamadas: rede.chamadas,
    chamadasNoWebhook: rede.chamadas.slice(nCheckout),
  };
}

/* Os emails pelo nome: 0 = aviso ao dono, os outros ao cliente. */
const confirmacao = (R) => R.emails.find((m) => /confirmada/.test(m.subject));
const referencia = (R) => R.emails.find((m) => /Referência Multibanco/.test(m.subject));
const avisoDono = (R) => R.emails.find((m) => /^\[Loja\]/.test(m.subject));

/** As linhas de um bloco do email em texto: da linha TÍTULO até à linha vazia. */
function blocoTexto(texto, titulo) {
  const ls = texto.split('\n');
  const i = ls.indexOf(titulo);
  if (i < 0) return null;
  const fim = ls.indexOf('', i);
  return ls.slice(i + 1, fim < 0 ? undefined : fim);
}
/** O parágrafo do html a seguir a um <h2>. */
function paragrafoHtml(html, h2) {
  const m = html.match(new RegExp(`>${h2}</h2><p[^>]*>(.*?)</p>`));
  return m ? m[1] : null;
}

/** Troca, em cada email, valores novos pelos antigos: no texto e no reply_to tal e qual; no html tal e qual e escapados. */
function trocarDeVolta(emails, pares) {
  return emails.map((m) => {
    const o = { ...m };
    for (const [novo, antigo] of pares) {
      o.text = o.text.split(novo).join(antigo);
      if (o.html) o.html = o.html.split(novo).join(antigo).split(esc(novo)).join(esc(antigo));
      if (o.reply_to) o.reply_to = o.reply_to.split(novo).join(antigo);
    }
    return o;
  });
}

export async function correr({ ok }) {
  // Uma falha mostra só a primeira diferença, com contexto: um email inteiro
  // em JSON (dezenas de KB) escondia-a.
  const eq = (nome, a, b) => {
    const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
    if (x === y) return ok(nome, true);
    let i = 0;
    while (i < x.length && x[i] === y[i]) i++;
    const perto = (s) => `…${s.slice(Math.max(0, i - 70), i + 70)}…`;
    return ok(nome, false, `\n     primeira diferença no carácter ${i}:\n     obtido:   ${perto(x)}\n     esperado: ${perto(y)}`);
  };
  const NOVO = { checkout: worker, webhook: worker };

  /* =========================================================== 0 */
  console.log(`\nW-dados — o Worker de antes (${REF_ANTES}), tirado do git`);
  let antes;
  try {
    antes = await workerDeAntes(REF_ANTES, RAIZ_DO_SITE);
  } catch (e) {
    ok(`ler o Worker de ${REF_ANTES} do git (clone raso? git fetch --unshallow)`, false, e.message);
    return;
  }
  const ANTIGO = { checkout: antes.worker, webhook: antes.worker };
  const MISTO = { checkout: antes.worker, webhook: worker };
  // A guarda da guarda: se isto não for mesmo o código de antes, a comparação
  // «igual a antes» compara o novo consigo mesmo e passa sempre.
  ok('é mesmo o código de antes (não conhece termos.js)', !antes.ficheiros.includes('termos.js') && typeof antes.worker.fetch === 'function');

  try {
    await igualAAntes();
    await cadaCampo();
    await retrato();
    await hostil();
    await origensECusto();
  } finally {
    antes.apagar();
  }

  /* =========================================================== 1 */
  async function igualAAntes() {
    console.log('\nW-dados — sem site.json nem empresa.json: tudo igual ao Worker de antes, byte a byte');
    const base = {};
    for (const [chave, cen] of Object.entries(CEN)) {
      const A = await correrCenario(ANTIGO, cen);
      const N = await correrCenario(NOVO, cen);
      base[chave] = A;
      ok(`${cen.nome}: ${cen.emails ? `o de antes mandou ${cen.emails} email(s) — há o que comparar` : 'o de antes não mandou emails, como devia'}`, A.emails.length === cen.emails, A.emails.length);
      eq(`${cen.nome}: resposta do /checkout`, semAcaso(N.checkout), semAcaso(A.checkout));
      eq(`${cen.nome}: página da Stripe`, semAcaso(N.stripe), semAcaso(A.stripe));
      eq(`${cen.nome}: emails (assunto, texto, html, reply_to)`, semAcaso(N.emails), semAcaso(A.emails));
      eq(`${cen.nome}: respostas aos webhooks`, semAcaso(N.webhooks), semAcaso(A.webhooks));
      eq(`${cen.nome}: as mesmas leituras e escritas no KV`, semAcaso(N.kvOps), semAcaso(A.kvOps));
      const pedidos = (R) => R.chamadas.map((c) => `${c.method} ${c.url}`);
      const novos = pedidos(N).filter((u) => /\/data\/(site|empresa)\.json$/.test(u));
      eq(`${cen.nome}: os mesmos pedidos à rede, mais os dos dois ficheiros novos`,
        pedidos(N).filter((u) => !/\/data\/(site|empresa)\.json$/.test(u)), pedidos(A));
      eq(`${cen.nome}: site.json/empresa.json lidos só no /checkout`, novos,
        chave === 'madeira' ? [`GET ${ENV_HOJE.SITE_DATA_URL}`] : [`GET ${ENV_HOJE.SITE_DATA_URL}`, `GET ${ENV_HOJE.EMPRESA_URL}`]);
      if (cen.emails) {
        const X = await correrCenario(MISTO, cen);
        ok(`${cen.nome}: encomenda criada antes do deploy não tem retrato`, X.encomenda && !Object.hasOwn(X.encomenda, 'termos'));
        eq(`${cen.nome}: paga depois do deploy, o Worker novo manda os emails de antes`, semAcaso(X.emails), semAcaso(A.emails));
      }
    }

    // Ficheiros que existem mas não se lêem: nada muda.
    const FALHAS = {
      'erro 500': () => new Response('erro', { status: 500 }),
      'página HTML com 200': () => new Response('<!doctype html><p>olá</p>', { status: 200, headers: { 'content-type': 'text/html' } }),
      'falha de rede': () => { throw new TypeError('fetch failed'); },
      'JSON partido': '{"contactos": {"telefone": "912',
      'JSON null': 'null',
      'uma lista': '[]',
      'um texto': '"olá"',
      // Válido, mas grande de mais para ser dele: não se lê (o JSON.parse gasta CPU).
      'ficheiro de 200 KB': () => new Response(JSON.stringify({ contactos: { telefone: '912 345 678' }, lixo: 'x'.repeat(200_000) }), { status: 200 }),
    };
    for (const [nome, resposta] of Object.entries(FALHAS)) {
      for (const chave of ['ctt', 'loja']) {
        const N = await correrCenario(NOVO, CEN[chave], { site: resposta, empresa: resposta });
        eq(`${nome} (${chave}): o checkout continua a funcionar`, N.checkout.status, 200);
        eq(`${nome} (${chave}): página da Stripe e emails iguais aos de antes`,
          semAcaso([N.stripe, N.emails]), semAcaso([base[chave].stripe, base[chave].emails]));
      }
    }

    // O dia em que a fase A2 publicar os dois ficheiros com os valores de hoje
    // (os do §5.1 do plano): o cliente não pode notar nada.
    for (const [chave, cen] of Object.entries(CEN)) {
      const N = await correrCenario(NOVO, cen, { site: SITE_A2, empresa: EMPRESA_A2 });
      eq(`A2 publicado com os valores de hoje — ${cen.nome}: tudo igual`,
        semAcaso([N.checkout, N.stripe, N.emails]), semAcaso([base[chave].checkout, base[chave].stripe, base[chave].emails]));
    }

    // E a comparação sabe dizer «diferente» (memória afirmacao-vazia-nao-prova).
    const outro = await correrCenario(NOVO, CEN.ctt, { site: { contactos: { ...SITE_A2.contactos, telefone: '912 345 678' } } });
    ok('a comparação apanha uma diferença (outro telefone)', JSON.stringify(semAcaso(outro.emails)) !== JSON.stringify(semAcaso(base.ctt.emails)));
  }

  /* =========================================================== 2 */
  async function cadaCampo() {
    console.log('\nW-dados — cada campo segue o que o dono gravou no painel');
    const NIF_NOVO = nifCom('50999999');
    ok(`o NIF de ensaio (${NIF_NOVO}) é válido, e um com o controlo trocado não é`,
      nifValido(NIF_NOVO) && !nifValido(NIF_NOVO.slice(0, 8) + String((Number(NIF_NOVO[8]) + 1) % 10)));
    const settings = { ...comPortes(false), delivery: { ...SETTINGS_HOJE.delivery, estimate_min_days: 3, estimate_max_days: 6, max_days: 20 },
      returns: { return_cost_eur: 12.5, note: 'Devolução na loja ou por CTT.' } };
    const site = { ...SITE_A2, contactos: { ...SITE_A2.contactos, telefone: '912 345 678', email: 'geral@rodas-ensaio.pt' } };
    const empresa = { ...EMPRESA_A2, nome: 'Casa Rodas', denominacao: 'Rodas & Filhos, Unipessoal, Lda.', nif: NIF_NOVO,
      morada: { rua: 'Rua da Estação, 12', cp: '3880-100', localidade: 'Ovar', concelho: 'Ovar', distrito: 'Aveiro' },
      livro_reclamacoes: 'https://www.livroreclamacoes.pt/Pedido/Reclamacao' };
    const fontes = { settings, site, empresa };

    const MORADA_NOVA = 'Rua da Estação, 12, 3880-100 Ovar';   // o concelho igual à localidade não se repete
    const MORADA_ANTIGA = 'Travessa do Navega, 436 F, 3885-183 Arada, Ovar';

    const ctt = await correrCenario(NOVO, CEN.tabela, fontes);
    const loja = await correrCenario(NOVO, CEN.loja, fontes);
    const mb = await correrCenario(NOVO, CEN.mb, fontes);
    const madeira = await correrCenario(NOVO, CEN.madeira, fontes);
    ok('as três encomendas passaram e mandaram emails', ctt.emails.length === 2 && loja.emails.length === 2 && mb.emails.length === 3);

    // Página da Stripe.
    eq('Stripe, envio: os prazos do painel', ctt.mensagemStripe,
      'Ao concluir o pagamento celebra um contrato de compra e venda com obrigação de pagar. Entrega em 3 a 6 dias úteis, para Portugal continental.');
    eq('Stripe, levantamento: a morada do painel', loja.mensagemStripe,
      `Ao concluir o pagamento celebra um contrato de compra e venda com obrigação de pagar. Levantamento em ${MORADA_NOVA}.`);
    eq('/checkout da Madeira: o telefone do painel na mensagem',
      JSON.parse(madeira.checkout.corpo).error, 'Só entregamos em Portugal continental. Para a Madeira ou os Açores, ligue-nos: 912 345 678.');

    const c = confirmacao(ctt);
    const txt = c.text, html = c.html;
    // Prazo máximo (texto e html dizem o mesmo — memória email-transaccional-texto-e-html).
    ok('email, texto: prazo máximo de 20 dias', blocoTexto(txt, 'ENTREGA').includes('  Prazo máximo de entrega: 20 dias a contar de hoje.'));
    ok('email, html: prazo máximo de 20 dias', html.includes('Prazo máximo de entrega: <strong>20 dias</strong> a contar de hoje.'));
    ok('email: o prazo antigo (30) já não aparece', !/Prazo máximo de entrega: (<strong>)?30 dias/.test(txt + html));
    // Devolução.
    const livre = blocoTexto(txt, 'DIREITO DE LIVRE RESOLUÇÃO');
    ok('email, texto: a devolução é paga pelo cliente, 12,50 €',
      livre.includes('  Em caso de devolução, os custos de envio de retorno são suportados') && livre.includes('  por si, no valor de 12,50 €.'));
    ok('email, html: a devolução é paga pelo cliente, 12,50 €',
      paragrafoHtml(html, 'Direito de livre resolução').includes('<strong>os custos de envio de retorno são suportados por si, no valor de 12,50 €</strong>.'));
    ok('email: já não diz que a loja paga a devolução', !/suportados pela loja/.test(txt + html));
    // Vendedor.
    eq('email, texto: o bloco VENDEDOR', blocoTexto(txt, 'VENDEDOR'), [
      '  Rodas & Filhos, Unipessoal, Lda. ("Casa Rodas")',
      `  NIF ${NIF_NOVO} · ${MORADA_NOVA}`,
      '  912 345 678 · geral@rodas-ensaio.pt',
    ]);
    eq('email, html: o parágrafo Vendedor (com o & escapado)', paragrafoHtml(html, 'Vendedor'),
      `<strong>Rodas &amp; Filhos, Unipessoal, Lda.</strong> ("Casa Rodas")<br>NIF ${NIF_NOVO} · ${esc(MORADA_NOVA)}<br>912 345 678 · geral@rodas-ensaio.pt`);
    // Livro de Reclamações.
    ok('email, texto: o Livro de Reclamações do painel',
      blocoTexto(txt, 'RECLAMAÇÕES')[0] === '  Livro de Reclamações eletrónico: https://www.livroreclamacoes.pt/Pedido/Reclamacao');
    ok('email, html: a ligação do Livro de Reclamações do painel',
      paragrafoHtml(html, 'Reclamações').startsWith('Livro de Reclamações eletrónico: <a href="https://www.livroreclamacoes.pt/Pedido/Reclamacao" style="color:#8a6d00;text-decoration:underline;">livroreclamacoes.pt</a>.'));
    // Contactos: reply_to e o email do Multibanco.
    eq('email: responder vai para o email do painel', c.reply_to, 'geral@rodas-ensaio.pt');
    const r = referencia(mb);
    ok('referência Multibanco: o telefone do painel, no texto e no html',
      r.text.includes('\n  Dúvidas? 912 345 678\n') && r.html.includes('Dúvidas? 912 345 678</p>'));
    eq('referência Multibanco: responder vai para o email do painel', r.reply_to, 'geral@rodas-ensaio.pt');
    eq('o aviso ao dono não depende destes campos (igual com e sem eles)',
      semAcaso(avisoDono(ctt)), semAcaso(avisoDono(await correrCenario(NOVO, CEN.tabela))));

    // Trocando os valores novos pelos antigos, tem de sair o email de antes:
    // prova que não mudou mais nada.
    const base = { tabela: await correrCenario(ANTIGO, CEN.tabela), loja: await correrCenario(ANTIGO, CEN.loja), mb: await correrCenario(ANTIGO, CEN.mb) };
    const pares = [
      ['  Prazo máximo de entrega: 20 dias', '  Prazo máximo de entrega: 30 dias'],
      ['Prazo máximo de entrega: <strong>20 dias', 'Prazo máximo de entrega: <strong>30 dias'],
      ['  Em caso de devolução, os custos de envio de retorno são suportados\n  por si, no valor de 12,50 €.', '  Os custos de devolução dos bens são suportados pela loja.'],
      ['Rodas & Filhos, Unipessoal, Lda.', 'Motivar & Lucrar, Unipessoal, Lda.'],
      ['("Casa Rodas")', '("Armazém dos Pneus")'],
      [NIF_NOVO, '516324950'],
      [MORADA_NOVA, MORADA_ANTIGA],
      ['912 345 678', '935 218 857'],
      ['geral@rodas-ensaio.pt', 'loja@exemplo.pt'],
      ['https://www.livroreclamacoes.pt/Pedido/Reclamacao', 'https://www.livroreclamacoes.pt/inicio'],
      // e as duas frases do html, que levam etiquetas
      ['. Em caso de devolução, <strong>os custos de envio de retorno são suportados por si, no valor de 12,50 €</strong>.',
        ', e <strong>os custos de devolução dos bens são suportados pela loja</strong>.'],
    ];
    const deVolta = (R) => trocarDeVolta(R.emails, pares);
    for (const [nome, R] of [['tabela', ctt], ['loja', loja], ['mb', mb]]) {
      eq(`${CEN[nome].nome}: com os valores antigos de volta, os emails são os de antes`, semAcaso(deVolta(R)), semAcaso(base[nome].emails));
    }
    eq('levantamento: com a morada antiga de volta, a página da Stripe é a de antes',
      semAcaso(loja.stripe.map((s) => s.split(encodeURIComponent(MORADA_NOVA)).join(encodeURIComponent(MORADA_ANTIGA)))), semAcaso(base.loja.stripe));

    // A devolução em cada forma que o painel (ou uma mão) pode gravar.
    // A regra é a do checkout (assets/js/checkout.js): só um número > 0 põe o
    // cliente a pagar.
    const DEVOLUCAO = [
      ['null (a loja paga)', { return_cost_eur: null, note: '' }, null, null],
      ['chave apagada (o Pages CMS apaga as vazias)', { note: '' }, null, null],
      ['returns inteiro ausente', undefined, null, null],
      ['0 dito (a loja paga)', { return_cost_eur: 0 }, 0, null],
      ['12.5', { return_cost_eur: 12.5 }, 12.5, '12,50 €'],
      ['7.999 arredonda ao cêntimo', { return_cost_eur: 7.999 }, 8, '8,00 €'],
      ['1000 (o tecto)', { return_cost_eur: 1000 }, 1000, '1000,00 €'],
      ['1000.01 (acima do tecto)', { return_cost_eur: 1000.01 }, null, null],
      ['"12.5" em texto', { return_cost_eur: '12.5' }, null, null],
      ['negativo', { return_cost_eur: -3 }, null, null],
      ['true', { return_cost_eur: true }, null, null],
      ['um objecto', { return_cost_eur: {} }, null, null],
      ['1e21', { return_cost_eur: 1e21 }, null, null],
    ];
    for (const [nome, returns, guardado, valor] of DEVOLUCAO) {
      const s = clone(SETTINGS_HOJE);
      if (returns === undefined) delete s.returns; else s.returns = returns;
      const R = await correrCenario(NOVO, CEN.loja, { settings: s });
      eq(`devolução ${nome}: guardado no retrato`, R.encomenda.termos.devolucao.custo_eur, guardado);
      const t = confirmacao(R).text, h = confirmacao(R).html;
      if (valor) {
        ok(`devolução ${nome}: texto e html dizem ${valor} pagos pelo cliente`,
          t.includes(`  por si, no valor de ${valor}.`) && h.includes(`no valor de ${valor}</strong>`) && !/suportados pela loja/.test(t + h));
      } else {
        ok(`devolução ${nome}: texto e html dizem que a loja paga`,
          t.includes('  Os custos de devolução dos bens são suportados pela loja.') && h.includes('<strong>os custos de devolução dos bens são suportados pela loja</strong>') && !/por si, no valor/.test(t + h));
      }
    }
  }

  /* =========================================================== 3 */
  async function retrato() {
    console.log('\nW-dados — o retrato: os emails repetem o que se prometeu no checkout');
    const settings = { ...comPortes(false), delivery: { ...SETTINGS_HOJE.delivery, estimate_min_days: 3, estimate_max_days: 6, max_days: 20 },
      returns: { return_cost_eur: 12.5, note: 'Devolução na loja ou por CTT.' } };
    const site = { ...SITE_A2, contactos: { ...SITE_A2.contactos, telefone: '912 345 678', email: 'geral@rodas-ensaio.pt' } };
    const NIF = nifCom('50999999');
    const empresa = { ...EMPRESA_A2, nome: 'Casa Rodas', denominacao: 'Rodas & Filhos, Unipessoal, Lda.', nif: NIF,
      morada: { rua: 'Rua da Estação, 12', cp: '3880-100', localidade: 'Ovar', concelho: 'Ovar', distrito: 'Aveiro' } };

    const N = await correrCenario(NOVO, CEN.mb, { settings, site, empresa });
    eq('o /checkout guarda o retrato inteiro na encomenda', N.encomendaNoCheckout.termos, {
      versao: 1,
      prazos: { min_dias: 3, max_dias_uteis: 6, max_dias: 20 },
      devolucao: { custo_eur: 12.5, nota: 'Devolução na loja ou por CTT.' },
      contactos: { telefone: '912 345 678', email: 'geral@rodas-ensaio.pt' },
      empresa: { nome: 'Casa Rodas', denominacao: 'Rodas & Filhos, Unipessoal, Lda.', nif: NIF,
        morada: { rua: 'Rua da Estação, 12', cp: '3880-100', localidade: 'Ovar', concelho: 'Ovar' },
        livro_reclamacoes: 'https://www.livroreclamacoes.pt/inicio' },
    });
    const semFicheiros = await correrCenario(NOVO, CEN.ctt);
    eq('sem site.json nem empresa.json, o retrato é o de sempre (prazos do settings.json)', semFicheiros.encomendaNoCheckout.termos, {
      versao: 1,
      prazos: { min_dias: 2, max_dias_uteis: 5, max_dias: 30 },
      devolucao: { custo_eur: null, nota: '' },
      contactos: { telefone: '935 218 857', email: 'loja@exemplo.pt' },
      empresa: { nome: 'Armazém dos Pneus', denominacao: 'Motivar & Lucrar, Unipessoal, Lda.', nif: '516324950',
        morada: { rua: 'Travessa do Navega, 436 F', cp: '3885-183', localidade: 'Arada', concelho: 'Ovar' },
        livro_reclamacoes: 'https://www.livroreclamacoes.pt/inicio' },
    });
    eq('o retrato sem ficheiros é o recurso (termosDeRecurso)', semFicheiros.encomendaNoCheckout.termos, termosDeRecurso(ENV_HOJE));

    // O dono muda TUDO entre o checkout e o pagamento (Multibanco: dias).
    const mudaTudo = ({ rede }) => {
      rede.dados['settings.json'] = { ...settings, delivery: { ...settings.delivery, estimate_min_days: 1, estimate_max_days: 2, max_days: 10 }, returns: { return_cost_eur: null } };
      rede.dados['site.json'] = { contactos: { telefone: '961 111 111', email: 'outro@exemplo.pt' } };
      rede.dados['empresa.json'] = { ...empresa, denominacao: 'Outra Firma, Lda.', nif: nifCom('51000000'), morada: { rua: 'Rua Outra, 1', cp: '1000-001', localidade: 'Lisboa' } };
    };
    const M = await correrCenario(NOVO, CEN.mb, { settings, site, empresa, antesDoWebhook: mudaTudo });
    eq('mudar o site depois do checkout não muda os emails (a referência e a confirmação)', semAcaso(M.emails), semAcaso(N.emails));
    ok('nenhum dos 3 emails diz os valores de depois',
      !M.emails.some((m) => /961 111 111|outro@exemplo\.pt|Outra Firma|Rua Outra|10 dias/.test(m.text + m.html + m.reply_to)));
    eq('o webhook não lê ficheiros do site (só fala com o Resend)',
      [...new Set(M.chamadasNoWebhook.map((c) => c.url))], ['https://api.resend.com/emails']);

    // Encomenda antiga (sem retrato) paga já com os ficheiros novos no ar: o
    // que se lhe prometeu foi o de antes, não o de agora.
    const A = await correrCenario(ANTIGO, CEN.ctt);
    const X = await correrCenario(MISTO, CEN.ctt, { site, empresa, settings: { ...SETTINGS_HOJE, delivery: settings.delivery, returns: settings.returns } });
    eq('encomenda antiga paga com o site já mudado: os emails de antes, não os valores novos', semAcaso(X.emails), semAcaso(A.emails));

    // Um retrato estragado no KV (à mão, ou por um bug): cada grupo estragado
    // cai para o recurso; nada chega ao email por escapar.
    const estraga = ({ kv, e }) => {
      const k = `order:${e.order_id}`;
      const o = JSON.parse(kv.mapa.get(k));
      o.termos.contactos.email = 'x@y.pt\r\nBcc: z@w.pt';
      o.termos.contactos.telefone = '<script>alert(1)</script>';
      o.termos.empresa.morada.rua = '[Clique aqui](https://mal.pt)';
      o.termos.prazos.max_dias = '20<b>';
      o.termos.devolucao.custo_eur = '9';
      kv.mapa.set(k, JSON.stringify(o));
    };
    const E = await correrCenario(NOVO, CEN.ctt, { settings, site, empresa, antesDoWebhook: estraga });
    const ce = confirmacao(E);
    eq('retrato estragado: responder vai para o email de recurso', ce.reply_to, 'loja@exemplo.pt');
    ok('retrato estragado: telefone, morada e prazos de recurso; nada de <script> nem de [Clique]',
      blocoTexto(ce.text, 'VENDEDOR')[2] === '  935 218 857 · loja@exemplo.pt'
      && blocoTexto(ce.text, 'VENDEDOR')[1].endsWith('Travessa do Navega, 436 F, 3885-183 Arada, Ovar')
      && ce.text.includes('  Prazo máximo de entrega: 30 dias a contar de hoje.')
      && !/<script|\[Clique/.test(ce.text + ce.html));
    ok('retrato estragado: os grupos bons continuam (a denominação do checkout)', blocoTexto(ce.text, 'VENDEDOR')[0] === '  Rodas & Filhos, Unipessoal, Lda. ("Casa Rodas")');
    ok('retrato estragado: o custo em texto cai para «a loja paga»', ce.text.includes('  Os custos de devolução dos bens são suportados pela loja.'));

    // Normalizar é idempotente (é o que acontece a cada email) — memória
    // normalizar-tem-de-ser-idempotente.
    const brutos = [N.encomendaNoCheckout.termos, semFicheiros.encomendaNoCheckout.termos, {}, null, 'x', [],
      { prazos: { min_dias: '2' } }, { contactos: { telefone: 912345678, email: ['a@b.pt'] } },
      { empresa: { denominacao: ' Rodas \n Lda. ', nif: '516 324 950', morada: { rua: 'Rua  A,  1', cp: ' 1000-001 ', localidade: 'Lisboa' } } }];
    for (const b of brutos) {
      const uma = normalizarTermos(b, ENV_HOJE).termos;
      eq(`normalizar duas vezes = uma (${JSON.stringify(b).slice(0, 50)})`, normalizarTermos(uma, ENV_HOJE).termos, uma);
    }
    eq('encomenda sem retrato → o recurso', termosDaEncomenda({ order_id: 'x' }, ENV_HOJE), termosDeRecurso(ENV_HOJE));
    eq('o recurso não guarda referências partilhadas (mudar um não muda o seguinte)',
      (() => { const a = termosDeRecurso(ENV_HOJE); a.empresa.morada.rua = 'mudada'; return termosDeRecurso(ENV_HOJE).empresa.morada.rua; })(),
      'Travessa do Navega, 436 F');
  }

  /* =========================================================== 4 */
  async function hostil() {
    console.log('\nW-dados — JSON hostil: tipos errados, textos gigantes, HTML, quebras de linha');
    const R = termosDeRecurso(ENV_HOJE);
    const NIF = nifCom('50999999');
    const S = (delivery) => ({ settings: { ...SETTINGS_HOJE, delivery } });
    const C = (contactos) => ({ site: { ...SITE_A2, contactos } });
    const E = (mudanca) => ({ empresa: { ...EMPRESA_A2, ...mudanca } });
    const M = (morada) => E({ morada });
    const CASOS = [
      // prazos (settings.json › delivery)
      ['prazos em texto', S({ estimate_min_days: '3', estimate_max_days: '6', max_days: '20' }), { prazos: R.prazos }, 'prazos'],
      ['mínimo maior do que o máximo', S({ estimate_min_days: 7, estimate_max_days: 3, max_days: 30 }), { prazos: R.prazos }, 'prazos'],
      ['prazo máximo 31', S({ estimate_min_days: 2, estimate_max_days: 5, max_days: 31 }), { prazos: R.prazos }, 'prazos'],
      ['prazo zero', S({ estimate_min_days: 0, estimate_max_days: 5, max_days: 30 }), { prazos: R.prazos }, 'prazos'],
      ['prazo com casas decimais', S({ estimate_min_days: 2.5, estimate_max_days: 5, max_days: 30 }), { prazos: R.prazos }, 'prazos'],
      ['prazos true e null', S({ estimate_min_days: true, estimate_max_days: null, max_days: 30 }), { prazos: R.prazos }, 'prazos'],
      ['delivery é uma lista', S([]), { prazos: R.prazos }, null],
      ['delivery ausente', { settings: (() => { const s = clone(SETTINGS_HOJE); delete s.delivery; return s; })() }, { prazos: R.prazos }, null],
      ['prazos no limite (1 a 30, 30)', S({ estimate_min_days: 1, estimate_max_days: 30, max_days: 30 }), { prazos: { min_dias: 1, max_dias_uteis: 30, max_dias: 30 } }, null],
      // nota da devolução
      ['nota gigante', { settings: { ...SETTINGS_HOJE, returns: { return_cost_eur: null, note: 'x'.repeat(600) } } }, { 'devolucao.nota': '' }, 'nota_devolucao'],
      ['nota número', { settings: { ...SETTINGS_HOJE, returns: { return_cost_eur: null, note: 42 } } }, { 'devolucao.nota': '' }, 'nota_devolucao'],
      // site.json
      ['site.json é um texto', { site: '"olá"' }, { contactos: R.contactos }, null],
      ['contactos é um texto', { site: { contactos: '935 218 857' } }, { contactos: R.contactos }, null],
      ['telefone em número', C({ telefone: 912345678, email: 'geral@rodas-ensaio.pt' }), { 'contactos.telefone': R.contactos.telefone, 'contactos.email': 'geral@rodas-ensaio.pt' }, 'telefone'],
      // 30 000 e não mais: acima de 64 KiB o ficheiro inteiro nem se lê (ver «ficheiro de 200 KB»).
      ['telefone de 30 000 algarismos', C({ telefone: '9'.repeat(30000) }), { 'contactos.telefone': R.contactos.telefone }, 'telefone'],
      ['telefone com quebra de linha e texto', C({ telefone: '912 345 678\nPAGAMENTO ANULADO' }), { 'contactos.telefone': R.contactos.telefone }, 'telefone'],
      ['telefone com HTML', C({ telefone: '<b>912 345 678</b>' }), { 'contactos.telefone': R.contactos.telefone }, 'telefone'],
      ['telefone curto', C({ telefone: '12 34' }), { 'contactos.telefone': R.contactos.telefone }, 'telefone'],
      ['telefone internacional (aceite)', C({ telefone: '+351 912 345 678' }), { 'contactos.telefone': '+351 912 345 678' }, null],
      ['email com cabeçalho injectado', C({ email: 'x@y.pt\r\nBcc: z@w.pt' }), { 'contactos.email': R.contactos.email }, 'email'],
      ['email com nome e < >', C({ email: 'Loja <loja@x.pt>' }), { 'contactos.email': R.contactos.email }, 'email'],
      ['email numa lista', C({ email: ['a@b.pt'] }), { 'contactos.email': R.contactos.email }, 'email'],
      ['email gigante', C({ email: 'a'.repeat(200) + '@x.pt' }), { 'contactos.email': R.contactos.email }, 'email'],
      // Escritos em texto cru: um objecto JS com __proto__ mudava o protótipo em vez de criar a chave.
      ['__proto__ dentro dos contactos', { site: '{"contactos": {"__proto__": {"telefone": "912 345 678", "email": "p@p.pt"}}}' }, { contactos: R.contactos }, null],
      ['__proto__ na raiz do site.json', { site: '{"__proto__": {"contactos": {"telefone": "912 345 678"}}}' }, { contactos: R.contactos }, null],
      // empresa.json
      ['denominação com HTML (aceite, escapada)', E({ denominacao: '<img src=x onerror=alert(1)> & Filhos, Lda.', nif: NIF }),
        { 'empresa.denominacao': '<img src=x onerror=alert(1)> & Filhos, Lda.', 'empresa.nif': NIF }, null],
      ['denominação com quebras de linha (uma linha só)', E({ denominacao: 'Rodas, Lda.\n\nPAGAMENTO ANULADO', nif: NIF }),
        { 'empresa.denominacao': 'Rodas, Lda. PAGAMENTO ANULADO' }, null],
      ['NIF com o controlo errado (a denominação nova também cai)', E({ denominacao: 'Outra, Lda.', nif: '516324951' }),
        { 'empresa.denominacao': R.empresa.denominacao, 'empresa.nif': R.empresa.nif }, 'identidade'],
      ['NIF em número', E({ nif: 516324950 }), { 'empresa.nif': R.empresa.nif }, 'identidade'],
      ['NIF 000000000', E({ nif: '000000000' }), { 'empresa.nif': R.empresa.nif }, 'identidade'],
      ['NIF com espaços (aceite)', E({ denominacao: 'Rodas, Lda.', nif: NIF.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') }), { 'empresa.nif': NIF, 'empresa.denominacao': 'Rodas, Lda.' }, null],
      ['denominação de 5000 caracteres', E({ denominacao: 'x'.repeat(5000) }), { 'empresa.denominacao': R.empresa.denominacao }, 'identidade'],
      ['nome em número', E({ nome: 5 }), { 'empresa.nome': R.empresa.nome }, 'nome'],
      ['rua com ligação Markdown (para a Stripe)', M({ rua: '[Clique aqui](https://mal.pt)', cp: '3885-183', localidade: 'Arada' }), { 'empresa.morada': R.empresa.morada }, 'morada'],
      ['código postal sem hífen', M({ rua: 'Rua A, 1', cp: '3885183', localidade: 'Arada' }), { 'empresa.morada': R.empresa.morada }, 'morada'],
      ['localidade com <script>', M({ rua: 'Rua A, 1', cp: '3885-183', localidade: '<script>alert(1)</script>' }), { 'empresa.morada': R.empresa.morada }, 'morada'],
      ['morada é um texto', E({ morada: 'Rua A, 1, 3885-183 Arada' }), { 'empresa.morada': R.empresa.morada }, 'morada'],
      ['morada sem concelho (aceite)', M({ rua: 'Rua A, 1', cp: '3885-183', localidade: 'Arada' }), { 'empresa.morada': { rua: 'Rua A, 1', cp: '3885-183', localidade: 'Arada', concelho: '' } }, null],
      ['Livro de Reclamações javascript:', E({ livro_reclamacoes: 'javascript:alert(1)' }), { 'empresa.livro_reclamacoes': R.empresa.livro_reclamacoes }, 'livro_reclamacoes'],
      ['Livro de Reclamações em http', E({ livro_reclamacoes: 'http://www.livroreclamacoes.pt/inicio' }), { 'empresa.livro_reclamacoes': R.empresa.livro_reclamacoes }, 'livro_reclamacoes'],
      ['Livro de Reclamações com utilizador', E({ livro_reclamacoes: 'https://eu:senha@exemplo.pt/' }), { 'empresa.livro_reclamacoes': R.empresa.livro_reclamacoes }, 'livro_reclamacoes'],
      ['Livro de Reclamações com aspas e tags (aceite, normalizado)', E({ livro_reclamacoes: 'https://exemplo.pt/"><script>alert(1)</script>' }),
        { 'empresa.livro_reclamacoes': 'https://exemplo.pt/%22%3E%3Cscript%3Ealert(1)%3C/script%3E' }, null],
      // 190 caracteres de aspas: passa o tecto à entrada, e passava de 200 depois de normalizado.
      ['Livro de Reclamações que cresce ao normalizar', E({ livro_reclamacoes: 'https://exemplo.pt/' + '"'.repeat(171) }),
        { 'empresa.livro_reclamacoes': R.empresa.livro_reclamacoes }, 'livro_reclamacoes'],
      ['empresa.json é uma lista', { empresa: '[]' }, { empresa: R.empresa }, null],
    ];

    for (const [nome, fontes, espera, recusa] of CASOS) {
      const cen = CEN.loja;
      const Rr = await correrCenario(NOVO, cen, fontes);
      const t = Rr.encomenda && Rr.encomenda.termos;
      const passou = Rr.checkout.status === 200 && Rr.emails.length === 2 && t;
      if (!passou) { ok(`${nome}: o checkout e os emails continuam`, false, Rr.checkout.corpo); continue; }
      eq(`${nome}: o retrato`, Object.fromEntries(Object.keys(espera).map((k) => [k, pega(t, k)])), espera);
      if (recusa) ok(`${nome}: fica registado que «${recusa}» foi recusado`, Rr.erros.some((l) => l.includes('termos:') && l.includes(recusa)), Rr.erros);
      eq(`${nome}: normalizar o retrato outra vez dá o mesmo`, normalizarTermos(t, ENV_HOJE).termos, t);
      // O que nunca pode acontecer, venha o que vier:
      const problemas = [];
      for (const m of Rr.emails) {
        if (/<script|<img src=x|<b>9/i.test(m.html || '')) problemas.push('HTML por escapar');
        if (m.text.split('\n').some((l) => /^\s*(PAGAMENTO ANULADO|Bcc:)/.test(l))) problemas.push('linha injectada no texto');
        if (m.reply_to && !/^[^\s<>,]+@[^\s<>,]+$/.test(m.reply_to)) problemas.push(`reply_to ${JSON.stringify(m.reply_to)}`);
        if (JSON.stringify(m).length > 60_000) problemas.push('email gigante');
      }
      if (/[[\]<>]/.test(Rr.mensagemStripe) || Rr.mensagemStripe.length > 1200) problemas.push('mensagem da Stripe');
      eq(`${nome}: nada por escapar, nada injectado, nada gigante`, problemas, []);
    }

    // A denominação com HTML chega ESCAPADA ao html e tal e qual ao texto.
    const Rh = await correrCenario(NOVO, CEN.loja, E({ denominacao: '<img src=x onerror=alert(1)> & Filhos, Lda.', nif: NIF }));
    ok('denominação com HTML: escapada no html do email',
      paragrafoHtml(confirmacao(Rh).html, 'Vendedor').startsWith('<strong>&lt;img src=x onerror=alert(1)&gt; &amp; Filhos, Lda.</strong>'));
    ok('denominação com HTML: tal e qual no texto (o texto não se desenha)',
      blocoTexto(confirmacao(Rh).text, 'VENDEDOR')[0] === '  <img src=x onerror=alert(1)> & Filhos, Lda. ("Armazém dos Pneus")');
    // O URL com aspas chega normalizado ao href: não fecha o atributo.
    const Ru = await correrCenario(NOVO, CEN.loja, E({ livro_reclamacoes: 'https://exemplo.pt/"><script>alert(1)</script>' }));
    ok('Livro de Reclamações com aspas: o href não fecha o atributo',
      confirmacao(Ru).html.includes('<a href="https://exemplo.pt/%22%3E%3Cscript%3Ealert(1)%3C/script%3E" style=') && !confirmacao(Ru).html.includes('"><script>'));
    // Mil retratos ao acaso (semente fixa): normalizar nunca lança, é
    // idempotente, e nenhuma linha que vai para o email leva caracteres de
    // controlo, separadores de linha ou de direcção.
    let semente = 20260930;
    const acaso = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
    const PEDACOS = ['9', ' ', '+', '(', '-', '.', 'a', 'Á', '@', '<', '>', '"', '&', '[', ']', ':', '*', '_', '/', ',', 'º', '\n', '\r', '\t',
      String.fromCharCode(0x2028), String.fromCharCode(0x202e), String.fromCharCode(0x200b), String.fromCharCode(0), 'https://', 'x.pt', '3885-183', '516324950'];
    const texto = () => Array.from({ length: Math.floor(acaso() * 40) }, () => PEDACOS[Math.floor(acaso() * PEDACOS.length)]).join('');
    const valor = () => { const r = acaso(); return r < 0.5 ? texto() : r < 0.6 ? Math.floor(acaso() * 60) - 5 : r < 0.7 ? acaso() * 2000 : r < 0.8 ? null : r < 0.9 ? [texto()] : { x: texto() }; };
    // Metade das vezes um valor bom, às vezes com um pedaço metido no meio; a
    // outra metade, lixo. Só lixo quase nunca passava, e só provava o recurso.
    const perto = (bom) => {
      const r = acaso();
      if (r < 0.35) return bom;
      if (r < 0.7 && typeof bom === 'string') { const i = Math.floor(acaso() * (bom.length + 1)); return bom.slice(0, i) + PEDACOS[Math.floor(acaso() * PEDACOS.length)] + bom.slice(i); }
      return valor();
    };
    const PROIBIDOS = new RegExp(`[${[[0, 0x1f], [0x7f, 0x9f], [0x2028, 0x202e], [0x200b, 0x200f]].map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('')}]`);
    const falhas = [];
    const aceites = {};
    for (let i = 0; i < 1000; i++) {
      const bruto = {
        prazos: { min_dias: perto(2), max_dias_uteis: perto(5), max_dias: perto(30) },
        devolucao: { custo_eur: perto(12.5), nota: perto('Na loja ou por CTT.') },
        contactos: { telefone: perto('912 345 678'), email: perto('geral@loja.pt') },
        empresa: { nome: perto('Casa Rodas'), denominacao: perto('Rodas & Filhos, Lda.'), nif: perto('516324950'),
          livro_reclamacoes: perto('https://www.livroreclamacoes.pt/inicio'),
          morada: acaso() < 0.8 ? { rua: perto('Rua da Estação, 12'), cp: perto('3880-100'), localidade: perto('Ovar'), concelho: perto('Ovar') } : valor() },
      };
      try {
        const { termos: uma, origem } = normalizarTermos(bruto, ENV_HOJE);
        for (const [g, o] of Object.entries(origem)) if (o === 'dados') aceites[g] = (aceites[g] || 0) + 1;
        if (JSON.stringify(normalizarTermos(uma, ENV_HOJE).termos) !== JSON.stringify(uma)) falhas.push(['não idempotente', bruto]);
        const linhas = [moradaLinha(uma), contactoLinha(uma), uma.empresa.denominacao, uma.empresa.nome, uma.empresa.nif, uma.empresa.livro_reclamacoes];
        if (linhas.some((l) => typeof l !== 'string' || PROIBIDOS.test(l))) falhas.push(['carácter proibido', linhas]);
      } catch (e) {
        falhas.push(['lançou', e.message]);
      }
    }
    eq('mil retratos ao acaso: nunca lança, idempotente, sem caracteres de controlo', falhas.slice(0, 3), []);
    // A guarda da guarda: o acaso também produz valores ACEITES (senão só
    // provava o recurso), e a verificação de caracteres sabe dizer «sim».
    ok(`o acaso produz valores aceites em todos os grupos ${JSON.stringify(aceites)}`,
      ['prazos', 'custo_devolucao', 'nota_devolucao', 'telefone', 'email', 'nome', 'identidade', 'morada', 'livro_reclamacoes'].every((g) => aceites[g] > 0));
    ok('a verificação de caracteres apanha um \\n e um U+2028', PROIBIDOS.test('a\nb') && PROIBIDOS.test('a' + String.fromCharCode(0x2028)) && !PROIBIDOS.test('Rua A, 1'));

    // Um valor bom não é recusado: nenhum registo de «recusado» com os ficheiros de A2.
    const Rb = await correrCenario(NOVO, CEN.loja, { site: SITE_A2, empresa: EMPRESA_A2 });
    eq('com os ficheiros bons, nada é recusado (a guarda também sabe dizer «não»)', Rb.erros.filter((l) => l.includes('termos:')), []);
  }

  /* =========================================================== 5 */
  async function origensECusto() {
    console.log('\nW-dados — origens autorizadas, e o custo por pedido');
    const toml = varsDoToml(fs.readFileSync(path.join(PASTA_WORKER, 'wrangler.toml'), 'utf8'));
    const origens = toml.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    ok('wrangler.toml: o localhost saiu das origens de produção', !origens.some((o) => /localhost|127\.0\.0\.1/.test(o)), origens);
    ok('wrangler.toml: só origens https', origens.length > 0 && origens.every((o) => o.startsWith('https://')), origens);
    eq('wrangler.toml: site.json e empresa.json do site publicado',
      [toml.SITE_DATA_URL, toml.EMPRESA_URL], ['https://armazemdospneus.pt/data/site.json', 'https://armazemdospneus.pt/data/empresa.json']);
    // Os dados de ensaio são o wrangler.toml de hoje (menos o email da loja,
    // que no ensaio é loja@exemplo.pt): senão a prova «igual a antes» provava
    // outra configuração.
    for (const k of Object.keys(toml).filter((k) => k !== 'STORE_EMAIL')) {
      eq(`os dados de ensaio têm o ${k} do wrangler.toml`, ENV_HOJE[k], toml[k]);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(PASTA_WORKER, 'package.json'), 'utf8'));
    const m = pkg.scripts.dev.match(/--var (\S+)/);
    // O wrangler parte o --var no PRIMEIRO «:» (collectKeyValues): o resto é o valor.
    const [nomeVar, ...resto] = m ? m[1].split(':') : [];
    eq('npm run dev junta o localhost do ensaio por --var', [nomeVar, resto.join(':')], ['ALLOWED_ORIGINS', 'http://localhost:8096']);

    const rede = redeFalsa({ 'products.json': PRODUTOS, 'settings.json': SETTINGS_HOJE });
    const prod = palco(worker, { env: ENV_HOJE, kv: kvFalso(), rede });
    eq('produção: o localhost recebe 403', (await prod.opcoes('http://localhost:8096')).status, 403);
    eq('produção: o site recebe 204', (await prod.opcoes('https://armazemdospneus.pt')).status, 204);
    const dev = palco(worker, { env: { ...ENV_HOJE, [nomeVar]: resto.join(':') }, kv: kvFalso(), rede });
    eq('em local (com o --var): o localhost recebe 204', (await dev.opcoes('http://localhost:8096')).status, 204);

    // Custo: os dois ficheiros novos lêem-se com a MESMA cache de 60 s, uma vez
    // por checkout; o webhook não lê nada novo; nenhuma chamada nova à Stripe.
    const N = await correrCenario(NOVO, CEN.mb, { site: SITE_A2, empresa: EMPRESA_A2 });
    const init = (fim) => N.chamadas.filter((c) => c.url.endsWith(fim)).map((c) => c.init);
    ok('site.json e empresa.json com a mesma cache do products.json e do settings.json (60 s)',
      [...init('/site.json'), ...init('/empresa.json'), ...init('/products.json'), ...init('/settings.json')].every((i) => i === CACHE_DADOS)
      && CACHE_DADOS.cf.cacheTtl === 60 && CACHE_DADOS.cf.cacheEverything === true && init('/site.json').length === 1 && init('/empresa.json').length === 1);
    eq('uma só chamada à Stripe (criar a sessão), como antes',
      N.chamadas.filter((c) => c.url.includes('api.stripe.com')).map((c) => `${c.method} ${c.url}`), ['POST https://api.stripe.com/v1/checkout/sessions']);

    // /health?probe=1 diz de onde vem cada coisa.
    const sonda = async (dados) => {
      const r = redeFalsa({ 'products.json': PRODUTOS, 'settings.json': SETTINGS_HOJE, ...dados });
      return JSON.parse((await palco(worker, { env: ENV_HOJE, kv: kvFalso(), rede: r }).sonda()).corpo).termos;
    };
    const hoje = await sonda({});
    eq('sonda, hoje: site.json e empresa.json ainda não existem', hoje.ficheiros, { settings: 'ok', site: 'HTTP 404', empresa: 'HTTP 404' });
    eq('sonda, hoje: prazos e devolução dos dados, contactos e empresa do recurso', hoje.origem, {
      prazos: 'dados', custo_devolucao: 'dados', nota_devolucao: 'dados', telefone: 'recurso', email: 'recurso',
      nome: 'recurso', identidade: 'recurso', morada: 'recurso', livro_reclamacoes: 'recurso',
    });
    const a2 = await sonda({ 'site.json': SITE_A2, 'empresa.json': EMPRESA_A2 });
    ok('sonda, depois da A2: tudo dos dados, nada recusado',
      Object.values(a2.origem).every((o) => o === 'dados') && a2.recusados.length === 0 && a2.ficheiros.site === 'ok', a2);
    const mau = await sonda({ 'site.json': { contactos: { telefone: 'liguem-nos' } }, 'empresa.json': EMPRESA_A2 });
    eq('sonda: um telefone recusado aparece em «recusados»', mau.recusados, ['telefone']);
  }
}
