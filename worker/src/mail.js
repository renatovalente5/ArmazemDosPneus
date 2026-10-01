/* =============================================================
   ARMAZÉM DOS PNEUS — emails transacionais (Resend)
   -------------------------------------------------------------
   Três emails:
     1. avisoLoja        — ao dono, com TUDO o que ele precisa para emitir a
                           fatura certificada no mesmo dia (inclui o NIF, que
                           deliberadamente nunca é enviado para a Stripe).
     2. confirmacaoCliente — exigido pelo art. 6.º do DL 24/2014 ("suporte
                           duradouro") e pelo art. 29.º do DL 7/2004 (aviso de
                           receção). O recibo automático da Stripe NÃO cumpre
                           isto: não tem prazo de entrega, direito de livre
                           resolução, formulário, nem identificação do vendedor.
     3. referenciaMultibanco — entidade/referência por email, para o cliente
                           não depender de ter deixado o separador aberto.

   Prazos, custo da devolução, contactos e dados da empresa vêm do RETRATO
   guardado na encomenda no momento do checkout (termos.js): o email repete o
   que se prometeu antes do pagamento. Uma encomenda antiga, sem retrato, usa
   os valores de sempre. Com pneus seminovos de garantia reduzida, o retrato
   traz também a garantia que o cliente aceitou, artigo a artigo, e a
   confirmação e o aviso ao dono dizem-na (garantia.js).

   Se RESEND_API_KEY não estiver definida, as funções não falham: registam e
   seguem (conta como enviado — insistir não muda nada). Um envio que o Resend
   recusa (429, 5xx) devolve { ok: false }, e o webhook responde 500 DE
   PROPÓSITO: a Stripe reentrega o evento (até 3 dias) e o envio repete-se.
   Com o 200 dado, a confirmação ao cliente nunca chegava a sair.
   ============================================================= */

import { documento, tabelaArtigos, caixaMultibanco, botao, separador, bloco, h2, p, link, esc } from './email-html.js';
import { termosDaEncomenda, moradaLinha, contactoLinha, custoDevolucaoCentimos, dominioDe } from './termos.js';

const RESEND = 'https://api.resend.com/emails';

/**
 * Constrói o HTML com rede de segurança: se o template lançar por qualquer
 * razão, o email sai só em texto em vez de não sair. Um email que falha nunca
 * pode impedir o webhook de responder 200 à Stripe.
 */
function seguro(fn, assunto) {
  try { return fn(); } catch (e) { console.error('HTML do email falhou, envio só texto:', assunto, e.message); return null; }
}

function eur(cents) { return (cents / 100).toFixed(2).replace('.', ',') + ' €'; }

/* MAIL_TO é para onde vai o aviso INTERNO de encomenda paga.
   O email PÚBLICO da loja (contactos.email do site.json, que o dono muda no
   painel; STORE_EMAIL de recurso) aparece no email ao cliente e é o reply-to
   das mensagens que ele recebe. São coisas diferentes — o aviso interno pode ir
   para quem gere as encomendas, mas o cliente tem de ver (e responder para) o
   email oficial da loja. */
async function send(env, { to, subject, text, html, replyTo }) {
  if (!env.RESEND_API_KEY) { console.log('email não enviado (sem RESEND_API_KEY):', subject); return { skipped: true }; }
  // O `text` NUNCA é omitido. Se só se enviasse `html`, o Resend geraria a
  // versão de texto por heurística a partir das tabelas — e num email que é
  // documento com valor legal a versão de texto tem de ser deliberada, não um
  // subproduto. Enviando os dois, o Resend usa ambos (multipart).
  const res = await fetch(RESEND, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html: html || undefined, reply_to: replyTo || undefined }),
  });
  if (!res.ok) {
    // Não relançamos: quem decide é o webhook (ver nota no topo).
    console.error('Resend falhou', res.status, await res.text().catch(() => ''));
    return { ok: false };
  }
  return { ok: true };
}

/** Cêntimos da montagem prometidos no checkout (o retrato), ou 0. */
function precoMontagemDe(order, env) {
  const m = termosDaEncomenda(order, env).montagem;
  return m && typeof m.preco_eur === 'number' ? Math.round(m.preco_eur * 100) : 0;
}

function linhas(order) {
  return order.lines.map((l) => `  ${l.qty}× ${l.name} — ${eur(l.unit_cents * l.qty)}`).join('\n');
}

/* A garantia acordada dos pneus seminovos (DL 84/2021, art. 12.º), do retrato:
   o que o cliente aceitou na caixa do checkout (garantia.js). Só nas
   encomendas que os têm — as outras ficam com os emails de sempre. Texto e
   html dizem o mesmo. */
const GARANTIA_ACORDADA = 'Pneus seminovos (bens usados), com a garantia reduzida por acordo que aceitou antes de pagar (art. 12.º do DL 84/2021):';
function garantiaTexto(g) {
  return [
    '  Pneus seminovos (bens usados), com a garantia reduzida por acordo que',
    '  aceitou antes de pagar (art. 12.º do DL 84/2021):',
    ...g.artigos.map((a) => `    ${a.nome} — ${a.meses} meses`),
  ];
}
function garantiaHtml(g) {
  return p(`${esc(GARANTIA_ACORDADA)}<br>${g.artigos.map((a) => `${esc(a.nome)} — <strong>${esc(a.meses)} meses</strong>`).join('<br>')}`);
}

function entregaTexto(order) {
  if (order.entrega !== 'ctt') return 'Levantar e montar na loja (grátis)';

  // A morada da Stripe (shipping_details) só existe se o evento
  // checkout.session.completed tiver sido aplicado. O email ao dono é muitas
  // vezes disparado por payment_intent.succeeded, que não a traz — e sem
  // recurso ao que o cliente escreveu no NOSSO formulário, o dono recebia uma
  // encomenda para enviar sem saber para onde.
  const c = order.cliente || {};
  const s = order.shipping_details || {};
  const a = s.address || {};
  const daStripe = [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const doFormulario = [c.morada, [c.cp, c.localidade].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  const nome = s.name || c.nome || '';
  const morada = daStripe || doFormulario;
  // Com "portes a combinar", o cliente pagou só os artigos. Tem de ficar dito
  // aqui, porque estes emails são o suporte duradouro da encomenda — é neles
  // que o cliente confirma o que pagou e o que ainda falta acordar.
  const linhas = [order.shipping_quote_later
    ? `Envio CTT (${order.weight_kg} kg) — portes AINDA NÃO COBRADOS, a combinar`
    : `Envio CTT (${order.weight_kg} kg) — ${eur(order.shipping_cents)}`];
  if (nome) linhas.push('  ' + nome);
  if (morada) linhas.push('  ' + morada);
  else linhas.push('  ⚠ SEM MORADA — contactar o cliente antes de despachar');
  // Se as duas existirem e não coincidirem, quem despacha tem de saber.
  if (daStripe && doFormulario && daStripe.replace(/\s+/g, '') !== doFormulario.replace(/\s+/g, '')) {
    linhas.push('  ⚠ a morada indicada na Stripe difere da do formulário:');
    linhas.push('    formulário: ' + doFormulario);
  }
  return linhas.join('\n');
}

/* ---------- 1. Aviso ao dono da loja ---------- */
export function avisoLoja(env, order) {
  const c = order.cliente || {};
  // Se o valor cobrado divergir do nosso, o dono TEM de saber antes de faturar
  // — este email é o gatilho da fatura, e faturar o valor errado é um problema
  // fiscal, não um detalhe. Vai a abrir, não enterrado no fim.
  const mm = order.amount_mismatch;
  // A garantia que o cliente aceitou nos pneus seminovos: o dono tem de a
  // conhecer (e este email fica-lhe como prova do acordo).
  const g = termosDaEncomenda(order, env).garantia_usados;
  const text = [
    mm ? '*** ATENÇÃO: O VALOR COBRADO NÃO É O ESPERADO ***' : null,
    mm ? `    Esperávamos ${eur(mm.esperado)} e foram cobrados ${eur(mm.cobrado)}.` : null,
    mm ? '    NÃO emita a fatura sem confirmar o valor no dashboard da Stripe.' : null,
    mm ? '' : null,
    `PAGAMENTO CONFIRMADO — ${order.order_id}`,
    `Total recebido: ${eur(mm ? mm.cobrado : order.total_cents)}`,
    '',
    'ARTIGOS',
    linhas(order),
    `  Subtotal: ${eur(order.subtotal_cents)}`,
    `  Portes: ${order.shipping_quote_later ? 'A COMBINAR — não cobrados' : (order.shipping_cents ? eur(order.shipping_cents) : 'grátis')}`,
    `  TOTAL: ${eur(order.total_cents)}`,
    ...(g ? ['', 'GARANTIA DOS PNEUS SEMINOVOS (reduzida por acordo: o cliente aceitou-a antes de pagar)',
      ...g.artigos.map((a) => `  ${a.nome} — ${a.meses} meses`)] : []),
    '',
    'ENTREGA',
    '  ' + entregaTexto(order),
    order.shipping_quote_later ? '' : null,
    order.shipping_quote_later ? '  ⚠ PORTES POR ACORDAR. Contacte o cliente com o valor do envio ANTES' : null,
    order.shipping_quote_later ? '    de despachar. Só pode cobrá-lo se ele aceitar — se não aceitar, fica' : null,
    order.shipping_quote_later ? '    o levantamento na loja ou o reembolso. Cobre-o à parte (link de' : null,
    order.shipping_quote_later ? '    pagamento da Stripe, MB WAY ou na loja) e facture-o à parte.' : null,
    '',
    'CLIENTE (para a fatura)',
    `  Nome: ${c.nome || '—'}`,
    `  NIF: ${c.nif || '(não indicado)'}`,
    `  Telemóvel: ${c.telefone || '—'}`,
    `  Email: ${c.email || '—'}`,
    c.matricula ? `  Matrícula (montagem): ${c.matricula}` : null,
    c.montagem ? `  QUER MONTAGEM na loja — combinar dia/hora por telefone${precoMontagemDe(order, env)
      ? ` (${eur(precoMontagemDe(order, env))}, a cobrar na oficina: o preço mostrado no checkout)` : ''}` : null,
    c.montagem_imediata ? '  Pediu montagem IMEDIATA: renunciou à livre resolução quanto ao serviço' : null,
    c.notas ? `  Notas: ${c.notas}` : null,
    '',
    'A FAZER HOJE',
    mm ? '  0. CONFIRMAR O VALOR REAL NA STRIPE ANTES DE FATURAR (ver aviso no topo).' : null,
    '  1. Emitir a fatura no programa certificado, com data de HOJE',
    '     (data do pagamento, não a da encomenda), na série ONLINE.',
    // Sem portes cobrados não há linha de portes para facturar. Mandar fazer
    // "linhas separadas: artigos, portes" numa encomenda sem portes só levava
    // a uma fatura errada.
    order.shipping_quote_later
      ? '  2. Linhas separadas: artigos (IVA 23%) e ecovalor. SEM linha de portes —'
      : '  2. Linhas separadas: artigos (IVA 23%), portes (IVA 23%), ecovalor.',
    order.shipping_quote_later
      ? '     ainda não foram cobrados. O envio é faturado depois, à parte.'
      : null,
    '  3. Enviar a fatura ao cliente.',
    '',
    `Método: ${order.payment_method || '—'} · Stripe: ${order.payment_intent || '—'}`,
  ].filter((l) => l !== null).join('\n');

  return send(env, {
    to: env.MAIL_TO,
    subject: mm
      // Prefixo [Loja] constante para o dono poder criar um filtro no Gmail;
      // a diferença a seguir é o que o faz olhar.
      ? `[Loja] VERIFICAR VALOR — ${order.order_id} cobrou ${eur(mm.cobrado)}, esperado ${eur(mm.esperado)}`
      : `[Loja] Pagamento confirmado ${order.order_id} — ${eur(order.total_cents)}`,
    text,
    replyTo: (order.cliente || {}).email,
  });
}

/* ---------- 2. Confirmação ao cliente (suporte duradouro) ---------- */
export function confirmacaoCliente(env, order) {
  const c = order.cliente || {};
  if (!c.email) return Promise.resolve({ skipped: true });
  // Ao cliente diz-se o que ele efetivamente pagou, não o que esperávamos
  // cobrar. Se divergir, o dono já foi alertado para conferir antes de faturar.
  const pago = order.amount_mismatch ? order.amount_mismatch.cobrado : order.total_cents;
  const t = termosDaEncomenda(order, env);
  // O custo da devolução segue o que o checkout mostrou (returns.return_cost_eur):
  // 0 = a loja paga, que era o que este email dizia sempre.
  const devolucao = custoDevolucaoCentimos(t);
  // O preço da montagem que o checkout mostrou, se o cliente a pediu.
  const montagemCents = c.montagem ? precoMontagemDe(order, env) : 0;
  const text = [
    `Olá${c.nome ? ' ' + String(c.nome).split(' ')[0] : ''},`,
    '',
    `Recebemos o seu pagamento. A sua encomenda ${order.order_id} está confirmada.`,
    '',
    'ARTIGOS',
    linhas(order),
    `  Subtotal: ${eur(order.subtotal_cents)}`,
    `  Portes: ${order.shipping_quote_later ? 'não incluídos — a combinar consigo' : (order.shipping_cents ? eur(order.shipping_cents) : 'grátis (levantamento na loja)')}`,
    `  TOTAL PAGO: ${eur(pago)} (IVA 23% incluído)`,
    '',
    'ENTREGA',
    '  ' + entregaTexto(order),
    montagemCents ? `  Montagem na loja: ${eur(montagemCents)} — paga na oficina, não incluída no total pago.` : null,
    `  Prazo máximo de entrega: ${t.prazos.max_dias} dias a contar de hoje.`,
    order.shipping_quote_later ? '' : null,
    order.shipping_quote_later ? '  PORTES AINDA NÃO COBRADOS' : null,
    order.shipping_quote_later ? '  O valor que pagou cobre apenas os artigos. Contactamo-lo com o custo do' : null,
    order.shipping_quote_later ? '  envio e só despachamos depois de o aceitar. Se não concordar com o valor,' : null,
    order.shipping_quote_later ? '  pode levantar a encomenda na loja sem pagar portes, ou cancelá-la e ser' : null,
    order.shipping_quote_later ? '  reembolsado na totalidade.' : null,
    '',
    'DIREITO DE LIVRE RESOLUÇÃO',
    '  Tem 14 dias, a contar da data em que recebe os bens, para resolver este',
    '  contrato sem indicar qualquer motivo. Para o exercer, basta comunicar-nos',
    '  a sua decisão — por email, telefone, ou usando o formulário em:',
    `  ${env.SITE_URL}/legal/livre-resolucao.html`,
    '  Reembolsamos em 14 dias, pelo mesmo meio de pagamento, incluindo os',
    '  portes de entrega standard.',
    devolucao ? '  Em caso de devolução, os custos de envio de retorno são suportados' : '  Os custos de devolução dos bens são suportados pela loja.',
    devolucao ? `  por si, no valor de ${eur(devolucao)}.` : null,
    // Só se ele pediu EXPRESSAMENTE a montagem imediata. Dizer isto a quem
    // apenas pediu montagem seria afirmar uma renúncia que não existiu.
    c.montagem_imediata
      ? '  Nota: pediu expressamente a montagem imediata. Uma vez prestado esse\n  serviço, perde o direito de livre resolução quanto a ele — mantendo-o\n  integralmente quanto aos bens.'
      : null,
    '',
    'GARANTIA',
    '  Garantia legal de conformidade nos termos do DL 84/2021.',
    ...(t.garantia_usados ? garantiaTexto(t.garantia_usados) : []),
    '',
    'VENDEDOR',
    `  ${t.empresa.denominacao} ("${t.empresa.nome}")`,
    `  NIF ${t.empresa.nif} · ${moradaLinha(t)}`,
    `  ${contactoLinha(t)}`,
    '',
    'RECLAMAÇÕES',
    `  Livro de Reclamações eletrónico: ${t.empresa.livro_reclamacoes}`,
    '  Em caso de litígio de consumo pode recorrer a uma entidade de resolução',
    `  alternativa de litígios. Ver ${env.SITE_URL}/legal/termos.html`,
    '',
    `Termos e Condições: ${env.SITE_URL}/legal/termos.html`,
    `Política de Privacidade: ${env.SITE_URL}/legal/privacidade.html`,
    '',
    'Obrigado pela sua preferência.',
    'Armazém dos Pneus',
  ].filter((l) => l !== null).join('\n');

  const assunto = `Encomenda ${order.order_id} confirmada — Armazém dos Pneus`;
  const site = (env.SITE_URL || 'https://armazemdospneus.pt').replace(/\/+$/, '');
  const contacto = contactoLinha(t);

  // O bloco legal vem ANTES do rodapé, de propósito: se o email for cortado por
  // tamanho, o que desaparece é a marca, nunca a informação obrigatória. E é
  // idêntico ao do texto simples — nenhuma informação obrigatória vive só aqui.
  const html = seguro(() => documento({
    assunto,
    preheader: `Encomenda ${order.order_id} confirmada — total ${(pago / 100).toFixed(2).replace('.', ',')} €. Prazo de entrega e direito de livre resolução em baixo.`,
    titulo: 'Encomenda confirmada',
    subtitulo: `N.º ${order.order_id} · recebemos o seu pagamento`,
    siteUrl: site,
    corpo: [
      tabelaArtigos(order),
      bloco([
        h2('Entrega'),
        p(esc(entregaTexto(order)).replace(/\n\s*/g, '<br>')),
        montagemCents ? p(`Montagem na loja: <strong>${esc(eur(montagemCents))}</strong> — paga na oficina, não incluída no total pago.`) : '',
        p(`Prazo máximo de entrega: <strong>${esc(t.prazos.max_dias)} dias</strong> a contar de hoje.`,
          order.shipping_quote_later ? '' : 'last'),
        order.shipping_quote_later
          ? p('<strong>Portes ainda não cobrados.</strong> O valor que pagou cobre apenas os artigos. '
            + 'Contactamo-lo com o custo do envio e só despachamos depois de o aceitar. Se não concordar '
            + 'com o valor, pode levantar a encomenda na loja sem pagar portes, ou cancelá-la e ser '
            + 'reembolsado na totalidade.', 'last')
          : '',
      ].join(''), '24px 40px 8px 40px'),
      botao(`${site}/obrigado.html`, 'Ver a minha encomenda'),
      separador(),
      bloco([
        h2('Direito de livre resolução'),
        p(`Tem <strong>14 dias</strong>, a contar da data em que recebe os bens, para resolver este contrato sem indicar qualquer motivo. Para o exercer, basta comunicar-nos a sua decisão — por email, telefone, ou usando o formulário em ${link(site + '/legal/livre-resolucao.html', 'armazemdospneus.pt/legal/livre-resolucao.html')}. Reembolsamos em 14 dias, pelo mesmo meio de pagamento, incluindo os portes de entrega standard${devolucao
          ? `. Em caso de devolução, <strong>os custos de envio de retorno são suportados por si, no valor de ${esc(eur(devolucao))}</strong>.`
          : ', e <strong>os custos de devolução dos bens são suportados pela loja</strong>.'}`),
        c.montagem_imediata
          ? p('Pediu expressamente a montagem imediata. Uma vez prestado esse serviço, perde o direito de livre resolução <strong>quanto a ele</strong> — mantendo-o integralmente quanto aos bens.')
          : '',
        h2('Garantia'),
        p('Garantia legal de conformidade nos termos do DL 84/2021.'),
        t.garantia_usados ? garantiaHtml(t.garantia_usados) : '',
        h2('Vendedor'),
        p(`<strong>${esc(t.empresa.denominacao)}</strong> ("${esc(t.empresa.nome)}")<br>NIF ${esc(t.empresa.nif)} · ${esc(moradaLinha(t))}<br>${esc(contacto)}`),
        h2('Reclamações'),
        p(`Livro de Reclamações eletrónico: ${link(t.empresa.livro_reclamacoes, dominioDe(t.empresa.livro_reclamacoes))}. Em caso de litígio de consumo pode recorrer a uma entidade de resolução alternativa de litígios — ver os ${link(site + '/legal/termos.html', 'Termos e Condições')}.`),
        p(`${link(site + '/legal/termos.html', 'Termos e Condições')} · ${link(site + '/legal/privacidade.html', 'Política de Privacidade')}`, 'last'),
      ].join(''), '24px 40px 32px 40px'),
    ].join('\n'),
  }), assunto);

  return send(env, { to: c.email, subject: assunto, text, html, replyTo: t.contactos.email });
}

/* ---------- 4. Pagamento que chegou depois do reembolso ou da contestação ---------- */
/**
 * Só ao dono. A Stripe confirmou o pagamento de uma encomenda que já estava
 * reembolsada ou contestada (os eventos chegam por qualquer ordem, e uma
 * avaria do Worker junta-os). O «confirmada» ao cliente e o «A FAZER HOJE:
 * emitir a fatura» levavam a faturar e despachar o que já foi devolvido.
 */
export function avisoPagamentoTardio(env, order) {
  const estado = ({ reembolsada: 'reembolsada', parcialmente_reembolsada: 'parcialmente reembolsada', contestada: 'contestada pelo cliente' })[order.status] || order.status;
  const text = [
    `*** ATENÇÃO: A ENCOMENDA ${order.order_id} JÁ ESTÁ ${String(estado).toUpperCase()} ***`,
    '',
    'A Stripe confirmou agora o pagamento desta encomenda, mas o aviso chegou',
    `depois do ${order.status === 'contestada' ? 'aviso da contestação' : 'reembolso'} (a Stripe entrega os avisos por qualquer ordem).`,
    '',
    'NÃO emita a fatura nem prepare a encomenda sem confirmar o estado real no',
    'dashboard da Stripe. O cliente NÃO recebeu a confirmação da encomenda.',
    '',
    `Total da encomenda: ${eur(order.total_cents)}`,
    typeof order.refunded_cents === 'number' && order.refunded_cents > 0 ? `Já reembolsado: ${eur(order.refunded_cents)}` : null,
    order.dispute_id ? `Contestação: ${order.dispute_id}` : null,
    `Stripe: ${order.payment_intent || '—'}`,
  ].filter((l) => l !== null).join('\n');
  return send(env, {
    to: env.MAIL_TO,
    subject: `[Loja] NÃO FATURAR — ${order.order_id} já está ${estado}`,
    text,
    replyTo: (order.cliente || {}).email,
  });
}

/* ---------- 5. Contestação sem encomenda ---------- */
/**
 * Só ao dono. Uma contestação (charge.dispute.created) de um pagamento que o
 * Worker não consegue ligar a uma encomenda — um pagamento feito fora do site,
 * ou cujo aviso se perdeu. Tem prazo de resposta (no MB WAY, 7 dias) e, se
 * ninguém responder, perde-se o valor e a comissão.
 */
export function avisoDisputaSemEncomenda(env, disputa) {
  const d = disputa || {};
  const valor = typeof d.amount === 'number' ? eur(d.amount) : '—';
  const text = [
    '*** UM CLIENTE CONTESTOU UM PAGAMENTO ***',
    '',
    'A Stripe abriu uma contestação de um pagamento que o site não consegue',
    'ligar a nenhuma encomenda (por isso não aparece no painel).',
    '',
    `Valor: ${valor}`,
    `Motivo indicado: ${d.reason || '—'}`,
    `Contestação: ${d.id || '—'}`,
    `Pagamento (Stripe): ${d.payment_intent || '—'} · Cobrança: ${d.charge || '—'}`,
    '',
    'Responda no dashboard da Stripe (Pagamentos → Contestações) ANTES do',
    'prazo que lá aparece. Sem resposta, a Stripe dá razão ao cliente.',
  ].join('\n');
  return send(env, { to: env.MAIL_TO, subject: `[Loja] CONTESTAÇÃO — ${valor}, sem encomenda associada`, text });
}

/* ---------- 3. Referência Multibanco ---------- */
export function referenciaMultibanco(env, order) {
  const c = order.cliente || {};
  const mb = order.multibanco || {};
  if (!c.email || !mb.reference) return Promise.resolve({ skipped: true });
  const validade = mb.expires_at ? new Date(mb.expires_at * 1000).toLocaleDateString('pt-PT') : null;
  const t = termosDaEncomenda(order, env);
  const text = [
    `Olá${c.nome ? ' ' + String(c.nome).split(' ')[0] : ''},`,
    '',
    `Guardámos a sua encomenda ${order.order_id}. Falta o pagamento.`,
    '',
    'PAGUE POR REFERÊNCIA MULTIBANCO',
    `  Entidade: ${mb.entity}`,
    `  Referência: ${mb.reference}`,
    `  Valor: ${eur(order.total_cents)}`,
    validade ? `  Válida até: ${validade}` : null,
    '',
    'Pode pagar no Multibanco, no homebanking ou na app do seu banco.',
    mb.hosted_voucher_url ? `Ver ou imprimir os dados: ${mb.hosted_voucher_url}` : null,
    '',
    'IMPORTANTE',
    '  A encomenda só é preparada depois de recebermos o pagamento, e não',
    '  reservamos stock até lá. Assim que o pagamento entrar, enviamos a',
    '  confirmação e a fatura.',
    '',
    '  Dúvidas? ' + t.contactos.telefone,
    '',
    'Armazém dos Pneus',
  ].filter((l) => l !== null).join('\n');

  const assunto = `Referência Multibanco para a encomenda ${order.order_id}`;
  const site = (env.SITE_URL || 'https://armazemdospneus.pt').replace(/\/+$/, '');

  // Este é o email onde o desenho tem retorno mais directo: o cliente vai
  // COPIAR a entidade e a referência, no telemóvel, provavelmente em dark mode.
  // Os números vão em texto vivo monoespaçado — nunca em imagem, que o Outlook
  // bloqueia por omissão e que não se consegue selecionar.
  const html = seguro(() => documento({
    assunto,
    preheader: `Entidade ${mb.entity}, referência ${mb.reference}, ${(order.total_cents / 100).toFixed(2).replace('.', ',')} €${validade ? ' — válida até ' + validade : ''}.`,
    titulo: 'Falta pagar a referência',
    subtitulo: `Guardámos a encomenda n.º ${order.order_id}`,
    siteUrl: site,
    corpo: [
      caixaMultibanco(mb, order.total_cents),
      bloco([
        p('Pode pagar no <strong>Multibanco</strong>, no <strong>homebanking</strong> ou na <strong>app do seu banco</strong>.'),
        h2('Importante'),
        p('A encomenda só é preparada depois de recebermos o pagamento, e <strong>não reservamos stock</strong> até lá. Assim que o pagamento entrar, enviamos a confirmação e a fatura.'),
        p(`Dúvidas? ${esc(t.contactos.telefone)}`, 'last'),
      ].join(''), '8px 40px 24px 40px'),
      // O link do voucher é COMPLEMENTO, nunca o único sítio onde a referência
      // existe: é alojado pela Stripe e pode expirar.
      mb.hosted_voucher_url ? botao(mb.hosted_voucher_url, 'Ver ou imprimir os dados') : '',
    ].join('\n'),
  }), assunto);

  return send(env, {
    to: c.email,
    subject: assunto,
    text,
    html,
    replyTo: t.contactos.email,
  });
}
