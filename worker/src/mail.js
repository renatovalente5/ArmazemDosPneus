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

   Se RESEND_API_KEY não estiver definida, as funções não falham: registam e
   seguem. Um email que não sai nunca pode impedir o webhook de responder 200
   (senão a Stripe reenvia o evento indefinidamente).
   ============================================================= */

import { documento, tabelaArtigos, caixaMultibanco, botao, separador, bloco, h2, p, link, esc } from './email-html.js';

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
   STORE_EMAIL é o contacto PÚBLICO da loja: aparece no email ao cliente e é o
   reply-to das mensagens que ele recebe. São coisas diferentes — o aviso
   interno pode ir para quem gere as encomendas, mas o cliente tem de ver (e
   responder para) o email oficial da loja. */
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
    // Não relançamos: ver nota no topo.
    console.error('Resend falhou', res.status, await res.text().catch(() => ''));
    return { ok: false };
  }
  return { ok: true };
}

function linhas(order) {
  return order.lines.map((l) => `  ${l.qty}× ${l.name} — ${eur(l.unit_cents * l.qty)}`).join('\n');
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
  const linhas = [`Envio CTT (${order.weight_kg} kg) — ${eur(order.shipping_cents)}`];
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
    `  Portes: ${order.shipping_cents ? eur(order.shipping_cents) : 'grátis'}`,
    `  TOTAL: ${eur(order.total_cents)}`,
    '',
    'ENTREGA',
    '  ' + entregaTexto(order),
    '',
    'CLIENTE (para a fatura)',
    `  Nome: ${c.nome || '—'}`,
    `  NIF: ${c.nif || '(não indicado)'}`,
    `  Telemóvel: ${c.telefone || '—'}`,
    `  Email: ${c.email || '—'}`,
    c.matricula ? `  Matrícula (montagem): ${c.matricula}` : null,
    c.montagem ? '  QUER MONTAGEM na loja — combinar dia/hora por telefone' : null,
    c.montagem_imediata ? '  Pediu montagem IMEDIATA: renunciou à livre resolução quanto ao serviço' : null,
    c.notas ? `  Notas: ${c.notas}` : null,
    '',
    'A FAZER HOJE',
    mm ? '  0. CONFIRMAR O VALOR REAL NA STRIPE ANTES DE FATURAR (ver aviso no topo).' : null,
    '  1. Emitir a fatura no programa certificado, com data de HOJE',
    '     (data do pagamento, não a da encomenda), na série ONLINE.',
    '  2. Linhas separadas: artigos (IVA 23%), portes (IVA 23%), ecovalor.',
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
  const text = [
    `Olá${c.nome ? ' ' + String(c.nome).split(' ')[0] : ''},`,
    '',
    `Recebemos o seu pagamento. A sua encomenda ${order.order_id} está confirmada.`,
    '',
    'ARTIGOS',
    linhas(order),
    `  Subtotal: ${eur(order.subtotal_cents)}`,
    `  Portes: ${order.shipping_cents ? eur(order.shipping_cents) : 'grátis (levantamento na loja)'}`,
    `  TOTAL PAGO: ${eur(pago)} (IVA 23% incluído)`,
    '',
    'ENTREGA',
    '  ' + entregaTexto(order),
    `  Prazo máximo de entrega: ${env.DELIVERY_MAX_DAYS || 30} dias a contar de hoje.`,
    '',
    'DIREITO DE LIVRE RESOLUÇÃO',
    '  Tem 14 dias, a contar da data em que recebe os bens, para resolver este',
    '  contrato sem indicar qualquer motivo. Para o exercer, basta comunicar-nos',
    '  a sua decisão — por email, telefone, ou usando o formulário em:',
    `  ${env.SITE_URL}/legal/livre-resolucao.html`,
    '  Reembolsamos em 14 dias, pelo mesmo meio de pagamento, incluindo os',
    '  portes de entrega standard.',
    // Só se ele pediu EXPRESSAMENTE a montagem imediata. Dizer isto a quem
    // apenas pediu montagem seria afirmar uma renúncia que não existiu.
    c.montagem_imediata
      ? '  Nota: pediu expressamente a montagem imediata. Uma vez prestado esse\n  serviço, perde o direito de livre resolução quanto a ele — mantendo-o\n  integralmente quanto aos bens.'
      : null,
    '',
    'GARANTIA',
    '  Garantia legal de conformidade nos termos do DL 84/2021.',
    '',
    'VENDEDOR',
    '  Motivar & Lucrar Unipessoal Lda ("Armazém dos Pneus")',
    '  NIF 516324950 · Travessa do Navega, 436 F, 3885-183 Arada, Ovar',
    `  ${env.STORE_PHONE || '935 218 857'} · ${env.STORE_EMAIL || env.MAIL_TO}`,
    '',
    'RECLAMAÇÕES',
    '  Livro de Reclamações eletrónico: https://www.livroreclamacoes.pt/inicio',
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
  const contacto = `${env.STORE_PHONE || '935 218 857'} · ${env.STORE_EMAIL || env.MAIL_TO}`;

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
        p(`Prazo máximo de entrega: <strong>${esc(env.DELIVERY_MAX_DAYS || 30)} dias</strong> a contar de hoje.`, 'last'),
      ].join(''), '24px 40px 8px 40px'),
      botao(`${site}/obrigado.html`, 'Ver a minha encomenda'),
      separador(),
      bloco([
        h2('Direito de livre resolução'),
        p(`Tem <strong>14 dias</strong>, a contar da data em que recebe os bens, para resolver este contrato sem indicar qualquer motivo. Para o exercer, basta comunicar-nos a sua decisão — por email, telefone, ou usando o formulário em ${link(site + '/legal/livre-resolucao.html', 'armazemdospneus.pt/legal/livre-resolucao.html')}. Reembolsamos em 14 dias, pelo mesmo meio de pagamento, incluindo os portes de entrega standard.`),
        c.montagem_imediata
          ? p('Pediu expressamente a montagem imediata. Uma vez prestado esse serviço, perde o direito de livre resolução <strong>quanto a ele</strong> — mantendo-o integralmente quanto aos bens.')
          : '',
        h2('Garantia'),
        p('Garantia legal de conformidade nos termos do DL 84/2021.'),
        h2('Vendedor'),
        p(`<strong>Motivar &amp; Lucrar Unipessoal Lda</strong> ("Armazém dos Pneus")<br>NIF 516324950 · Travessa do Navega, 436 F, 3885-183 Arada, Ovar<br>${esc(contacto)}`),
        h2('Reclamações'),
        p(`Livro de Reclamações eletrónico: ${link('https://www.livroreclamacoes.pt/inicio', 'livroreclamacoes.pt')}. Em caso de litígio de consumo pode recorrer a uma entidade de resolução alternativa de litígios — ver os ${link(site + '/legal/termos.html', 'Termos e Condições')}.`),
        p(`${link(site + '/legal/termos.html', 'Termos e Condições')} · ${link(site + '/legal/privacidade.html', 'Política de Privacidade')}`, 'last'),
      ].join(''), '24px 40px 32px 40px'),
    ].join('\n'),
  }), assunto);

  return send(env, { to: c.email, subject: assunto, text, html, replyTo: env.STORE_EMAIL || env.MAIL_TO });
}

/* ---------- 3. Referência Multibanco ---------- */
export function referenciaMultibanco(env, order) {
  const c = order.cliente || {};
  const mb = order.multibanco || {};
  if (!c.email || !mb.reference) return Promise.resolve({ skipped: true });
  const validade = mb.expires_at ? new Date(mb.expires_at * 1000).toLocaleDateString('pt-PT') : null;
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
    '  Dúvidas? ' + (env.STORE_PHONE || '935 218 857'),
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
        p(`Dúvidas? ${esc(env.STORE_PHONE || '935 218 857')}`, 'last'),
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
    replyTo: env.STORE_EMAIL || env.MAIL_TO,
  });
}
