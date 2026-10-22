/* =============================================================
   Bateria do GRUPO 1 DA AUDITORIA LEGAL (22 out 2026) — corre dentro de
   test.mjs (mesma contagem).

   O email de confirmação ganhou, da biblioteca legal-comum: a nota do custo
   da chamada junto de cada telefone (DL 59/2021), a garantia de 3 anos e a
   dos usados por acordo (DL 84/2021), a retoma do usado nos pneus novos e nas
   baterias (DL 152-D/2017), os centros RAL (Lei 144/2015), o formulário de
   livre resolução e as condições gerais no corpo (DL 24/2014, art. 6.º; DL
   7/2004, art. 31.º), e o botão «Ver a minha encomenda» com o session_id.

   1. comoAntes(): tira dos emails novos só estas peças, e devolve o email que
      o Worker de antes escrevia. É o que deixa a bateria W-dados continuar a
      provar «igual a antes, byte a byte» contra o mesmo commit: se mudasse
      mais alguma coisa, a comparação apanhava.
   2. Cada peça, no texto E no html (memória email-transaccional-texto-e-html),
      e as condições gerais guardadas no checkout (uma escrita por versão).
   ============================================================= */
import { GARANTIA_BENS, GARANTIA_USADOS_18, AVISO_RETOMA } from '../legal-comum/index.mjs';
import { link, separador } from '../src/email-html.js';
import { blocosDosTermos } from '../src/condicoes.js';
import worker from '../src/index.js';
import { kvFalso, redeFalsa, palco, eventos, SITE, TERMOS_DO_REPOSITORIO } from './palco.mjs';
import { ENV_HOJE, PRODUTOS, SETTINGS_HOJE, SITE_A2, EMPRESA_A2, PEDIDOS } from './dados.mjs';

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const GARANTIA_ANTIGA = 'Garantia legal de conformidade nos termos do DL 84/2021.';
const NOTA = / \(Chamada para a rede (?:móvel|fixa) nacional\)/g;
const ANEXOS_HTML = new RegExp(`\\n${escRe(separador())}\\n<tr><td class="p t2"[^>]*><h2[^>]*>Anexo 1 —[\\s\\S]*?</td></tr>`);

/** O email que o Worker de antes do grupo 1 escrevia, a partir do de agora. */
export function comoAntes(emails) {
  return emails.map((m) => {
    const o = { ...m };
    o.text = o.text
      .replace(NOTA, '')
      .replace('\n  (o modelo do formulário vai também no fim deste email, no Anexo 1).', '')
      .replace(`  ${GARANTIA_BENS}`, `  ${GARANTIA_ANTIGA}`)
      .replace(`\n  ${GARANTIA_USADOS_18}`, '')
      .replace(/\n\nRETOMA DO USADO\n {2}[^\n]*/, '')
      .replace(/\n\nRESOLUÇÃO ALTERNATIVA DE LITÍGIOS\n[\s\S]*?(?=\n\n)/,
        `\n  Em caso de litígio de consumo pode recorrer a uma entidade de resolução\n  alternativa de litígios. Ver ${SITE}/legal/termos.html`)
      .replace(/\n\n-{60}\nANEXO 1[\s\S]*$/, '');
    if (o.html) {
      o.html = o.html
        .replace(NOTA, '')
        .replace(' (o modelo vai também no fim deste email, no Anexo 1)', '')
        .replace(`<p style="margin:0 0 16px 0;">${escHtml(GARANTIA_BENS)}</p>`, `<p style="margin:0 0 16px 0;">${GARANTIA_ANTIGA}</p>`)
        .replace(`<p style="margin:0 0 16px 0;">${escHtml(GARANTIA_USADOS_18)}</p>`, '')
        .replace(/<h2[^>]*>Retoma do usado<\/h2><p[^>]*>[\s\S]*?<\/p>/, '')
        .replace(/\.<\/p><h2[^>]*>Resolução alternativa de litígios<\/h2>[\s\S]*?(?=<p style="margin:0 0 0 0;">)/,
          `. Em caso de litígio de consumo pode recorrer a uma entidade de resolução alternativa de litígios — ver os ${link(`${SITE}/legal/termos.html`, 'Termos e Condições')}.</p>`)
        .replace(/obrigado\.html\?session_id=cs_[A-Za-z0-9_]+/g, 'obrigado.html')
        .replace(ANEXOS_HTML, '');
    }
    return o;
  });
}

/** Uma encomenda inteira: /checkout e o pagamento (como o w-dados.mjs). */
async function conduzir({ pedido = PEDIDOS.ctt, termos, kv = kvFalso(), mb = false } = {}) {
  const dados = { 'products.json': PRODUTOS, 'settings.json': SETTINGS_HOJE, 'site.json': SITE_A2, 'empresa.json': EMPRESA_A2 };
  if (termos !== undefined) dados['legal/termos.html'] = termos;
  const rede = redeFalsa(dados);
  const p = palco(worker, { env: ENV_HOJE, kv, rede });
  const [log, error] = [console.log, console.error];
  const registo = [];
  console.log = (...a) => registo.push(a.join(' '));
  console.error = (...a) => registo.push(a.join(' '));
  try {
    const opsAntes = kv.ops.length;
    const checkout = await p.checkout(pedido);
    const escritasDoCheckout = kv.ops.slice(opsAntes).filter((o) => o.startsWith('put '));
    const r = JSON.parse(checkout.corpo);
    const e = { order_id: r.order_id, sessao: rede.stripe[0].id, total: r.total_cents, entrega: pedido.entrega };
    const encomenda = JSON.parse(kv.mapa.get(`order:${r.order_id}`));
    const evs = mb ? [eventos.sessaoConcluida(e, { pago: false }), eventos.referenciaMultibanco(e), eventos.pagamentoRecebido(e)] : [eventos.sessaoConcluida(e)];
    for (const ev of evs) await p.webhook(ev);
    return { checkout, encomenda, escritasDoCheckout, kv, rede, registo, e,
      confirmacao: rede.resend.find((m) => /confirmada/.test(m.subject)),
      referencia: rede.resend.find((m) => /Referência Multibanco/.test(m.subject)) };
  } finally {
    [console.log, console.error] = [log, error];
  }
}

function bloco(texto, titulo) {
  const ls = texto.split('\n');
  const i = ls.indexOf(titulo);
  if (i < 0) return null;
  const fim = ls.indexOf('', i);
  return ls.slice(i + 1, fim < 0 ? undefined : fim);
}

export async function correr({ ok }) {
  const eq = (nome, a, b) => ok(nome, JSON.stringify(a) === JSON.stringify(b), `\n     obtido:   ${JSON.stringify(a)}\n     esperado: ${JSON.stringify(b)}`);
  const SIGLAS = ['CICAP', 'CACCL', 'CIAB', 'TRIAVE', 'CACRC', 'CIMAAL', 'CACC RAM', 'CIMARA', 'CAUAL', 'CNIACC'];

  console.log('\nGrupo 1 — o email de confirmação: telefone, garantia, retoma, RAL, formulário e condições gerais');
  const R = await conduzir({ mb: true });
  const { text, html } = R.confirmacao;

  // Telefone com a nota (DL 59/2021), no Vendedor e no email do Multibanco.
  eq('texto: o Vendedor com a nota do custo da chamada', bloco(text, 'VENDEDOR')[2], '  935 218 857 (Chamada para a rede móvel nacional) · loja@exemplo.pt');
  ok('html: o Vendedor com a nota', html.includes('<br>935 218 857 (Chamada para a rede móvel nacional) · loja@exemplo.pt</p>'));
  ok('Multibanco: «Dúvidas?» com a nota, no texto e no html',
    R.referencia.text.includes('\n  Dúvidas? 935 218 857 (Chamada para a rede móvel nacional)\n') && R.referencia.html.includes('Dúvidas? 935 218 857 (Chamada para a rede móvel nacional)</p>'));
  ok('nenhum telefone da loja fica sem a nota (texto e html dos dois emails)',
    ![text, html, R.referencia.text, R.referencia.html].some((t) => /935 218 857(?! \(Chamada)/.test(t)));

  // Garantia (DL 84/2021): os 3 anos; sem seminovos, nada dos 18 meses.
  eq('texto: a garantia é a de 3 anos (GARANTIA_BENS)', bloco(text, 'GARANTIA'), [`  ${GARANTIA_BENS}`]);
  ok('html: a mesma frase', html.includes(escHtml(GARANTIA_BENS)));
  ok('sem seminovos, nada sobre os 18 meses', !text.includes(GARANTIA_USADOS_18) && !html.includes(escHtml(GARANTIA_USADOS_18)));

  // Retoma (DL 152-D/2017): a bateria do carrinho.
  const retoma = AVISO_RETOMA({ tipos: ['baterias'] });
  eq('texto: a retoma da bateria', bloco(text, 'RETOMA DO USADO'), [`  ${retoma}`]);
  ok('html: a mesma frase', html.includes(`>Retoma do usado</h2><p style="margin:0 0 16px 0;">${escHtml(retoma)}</p>`));
  eq('a linha da bateria leva a marca da retoma; a da jante não', R.encomenda.lines.map((l) => l.retoma ?? null), [null, 'baterias']);
  const L = await conduzir({ pedido: PEDIDOS.loja });
  ok('sem pneus novos nem baterias (só jantes), não há retoma', !/RETOMA DO USADO|Retoma do usado/.test(L.confirmacao.text + L.confirmacao.html));

  // RAL (Lei 144/2015): os 10 centros, sem «aderimos» nem a plataforma ODR.
  const ral = bloco(text, 'RESOLUÇÃO ALTERNATIVA DE LITÍGIOS');
  ok('texto: os 10 centros de competência genérica', ral && SIGLAS.every((s) => ral.some((l) => l.includes(`- ${s} — `))), ral);
  ok('html: os 10 centros, cada um com a ligação', SIGLAS.every((s) => html.includes(`<li style="margin:0 0 4px 0;">${s} — `)) && (html.match(/<li style="margin:0 0 4px 0;">/g) || []).length === 10);
  ok('nem «aderimos» nem a plataforma ODR', !/aderimos|ec\.europa\.eu\/consumers\/odr/i.test(text + html));

  // Formulário de livre resolução (DL 24/2014, Anexo, Parte B), com o vendedor.
  const para = '— Para Motivar & Lucrar, Unipessoal, Lda. («Armazém dos Pneus»), Travessa do Navega, 436 F, 3885-183 Arada, Ovar, loja@exemplo.pt:';
  ok('texto: o Anexo 1 é o formulário, com o vendedor preenchido', text.includes('ANEXO 1 — FORMULÁRIO DE LIVRE RESOLUÇÃO\n\nFormulário de livre resolução\n') && text.includes(para));
  ok('html: o mesmo formulário (escapado)', html.includes('>Anexo 1 — Formulário de livre resolução</h2>') && html.includes(escHtml(para)));

  // Condições gerais (DL 7/2004, art. 31.º): as do checkout, guardadas no KV.
  const hash = R.encomenda.condicoes_gerais;
  ok('a encomenda guarda o hash das condições gerais', /^[0-9a-f]{32}$/.test(hash), hash);
  const guardado = JSON.parse(R.kv.mapa.get(`termos:${hash}`) || 'null');
  ok('o KV tem o texto dessa versão (termos:<hash>)', guardado && guardado.v === 1 && Array.isArray(guardado.blocos) && guardado.blocos.length === 9, guardado);
  eq('o /checkout grava a encomenda, a sessão e, por ser a primeira vez, os Termos — por esta ordem',
    R.escritasDoCheckout.map((o) => o.split(':')[0]), ['put order', 'put session', 'put termos']);
  const R2 = await conduzir({ kv: R.kv });
  eq('um segundo /checkout com os mesmos Termos não os grava outra vez', R2.escritasDoCheckout.map((o) => o.split(':')[0]), ['put order', 'put session']);
  ok('texto: o Anexo 2 traz os Termos, com o título em maiúsculas e a ligação por extenso',
    text.includes('ANEXO 2 — CONDIÇÕES GERAIS') && text.includes('\n1. OBJETO\n') && text.includes('  - Carrega em «Pagar agora».')
    && text.includes('modelo de formulário (https://armazemdospneus.pt/legal/livre-resolucao.html) & o seu uso é facultativo.'));
  ok('html: o Anexo 2 com os mesmos blocos', html.includes('>Anexo 2 — Condições gerais</h2>') && html.includes('Como se faz a encomenda') && html.includes('• Escolhe os artigos.'));
  ok('nada dos marcadores, do SVG nem do texto só para leitores de ecrã', !/<!--|ap:atualizacao|abre numa nova janela|<path/.test(text) && !/ap:atualizacao|abre numa nova janela/.test(html));

  // O botão «Ver a minha encomenda» leva o session_id (sem ele, a página dizia que não conseguia confirmar).
  ok('o botão leva o session_id da encomenda', html.includes(`${SITE}/obrigado.html?session_id=${R.e.sessao}`) && !html.includes(`href="${SITE}/obrigado.html"`));

  // Os Termos não respondem no checkout: a venda segue, e o email leva a ligação.
  const F = await conduzir({ termos: () => new Response('erro', { status: 500 }) });
  ok('Termos em 500 no checkout: a venda segue (200), sem hash e sem escrita a mais',
    F.checkout.status === 200 && !Object.hasOwn(F.encomenda, 'condicoes_gerais') && F.escritasDoCheckout.length === 2, F.checkout);
  ok('   o email sai na mesma, com a ligação para os Termos', F.confirmacao && F.confirmacao.text.includes(`  As condições gerais em vigor estão em ${SITE}/legal/termos.html`));
  ok('   e fica registado', F.registo.some((l) => l.includes('condições gerais: os Termos não se leram no checkout')));
  const G = await conduzir({ termos: () => { throw new TypeError('fetch failed'); } });
  ok('Termos sem rede no checkout: a venda segue', G.checkout.status === 200 && !Object.hasOwn(G.encomenda, 'condicoes_gerais'));

  // comoAntes() sabe dizer «diferente» (memória afirmacao-vazia-nao-prova).
  const mexido = [{ ...R.confirmacao, text: R.confirmacao.text.replace('TOTAL PAGO', 'TOTAL') }];
  ok('comoAntes() não apaga uma mudança fora das peças do grupo 1', comoAntes(mexido)[0].text !== comoAntes([R.confirmacao])[0].text);
  ok('comoAntes() tira os anexos inteiros (texto e html)', !/ANEXO 1|Anexo 1/.test(comoAntes([R.confirmacao])[0].text + comoAntes([R.confirmacao])[0].html));

  // Os Termos do repositório lêem-se inteiros.
  const blocos = blocosDosTermos(TERMOS_DO_REPOSITORIO(), `${SITE}/legal/`);
  ok(`os Termos do repositório dão ${blocos.length} blocos, com «Como se faz a encomenda», a retoma e os centros RAL`,
    blocos.length > 40 && blocos.some((b) => b.tipo === 'titulo' && b.texto === 'Como se faz a encomenda')
    && blocos.some((b) => b.texto.startsWith('Ao comprar pneus novos')) && blocos.some((b) => b.tipo === 'item' && b.texto.startsWith('CNIACC')));
  ok('   sem restos de HTML', !blocos.some((b) => /[<>]|-->/.test(b.texto)), blocos.filter((b) => /[<>]/.test(b.texto)));
}
