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

const RESEND = 'https://api.resend.com/emails';

function eur(cents) { return (cents / 100).toFixed(2).replace('.', ',') + ' €'; }

/* MAIL_TO é para onde vai o aviso INTERNO de encomenda paga.
   STORE_EMAIL é o contacto PÚBLICO da loja: aparece no email ao cliente e é o
   reply-to das mensagens que ele recebe. São coisas diferentes — o aviso
   interno pode ir para quem gere as encomendas, mas o cliente tem de ver (e
   responder para) o email oficial da loja. */
async function send(env, { to, subject, text, replyTo }) {
  if (!env.RESEND_API_KEY) { console.log('email não enviado (sem RESEND_API_KEY):', subject); return { skipped: true }; }
  const res = await fetch(RESEND, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, reply_to: replyTo || undefined }),
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
  const s = order.shipping_details || {};
  const a = s.address || {};
  const morada = [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return `Envio CTT (${order.weight_kg} kg) — ${eur(order.shipping_cents)}\n  ${s.name || ''}${morada ? '\n  ' + morada : ''}`;
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
    c.montagem ? '  PEDIU MONTAGEM IMEDIATA — combinar dia/hora por telefone' : null,
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
      ? `VERIFICAR VALOR — ${order.order_id} cobrou ${eur(mm.cobrado)}, esperado ${eur(mm.esperado)}`
      : `PAGAMENTO CONFIRMADO ${order.order_id} — ${eur(order.total_cents)}`,
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
    c.montagem
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

  return send(env, {
    to: c.email,
    subject: `Encomenda ${order.order_id} confirmada — Armazém dos Pneus`,
    text,
    replyTo: env.STORE_EMAIL || env.MAIL_TO,
  });
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

  return send(env, {
    to: c.email,
    subject: `Referência Multibanco para a encomenda ${order.order_id}`,
    text,
    replyTo: env.STORE_EMAIL || env.MAIL_TO,
  });
}
