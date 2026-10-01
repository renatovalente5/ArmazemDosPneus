/* =============================================================
   ARMAZÉM DOS PNEUS — a garantia dos pneus seminovos, por acordo
   -------------------------------------------------------------
   A garantia legal de conformidade é de 3 anos. Num bem móvel usado pode ser
   reduzida até 18 meses, mas SÓ POR ACORDO das partes (DL n.º 84/2021, art.
   12.º). Decisão do dono (1 out 2026): cada pneu seminovo tem a garantia que o
   artigo indica (warranty_months, 18 a 36 meses), e o acordo existe de facto,
   antes do pagamento:

     · o checkout (assets/js/checkout.js) mostra uma caixa OBRIGATÓRIA com o
       texto de textoDaGarantia() quando o carrinho tem um pneu seminovo com
       menos de 36 meses, e manda a aceitação no pedido (`garantia_usados`:
       { aceita, versao, artigos: [{ sku, meses }] });
     · o /checkout confere-a AQUI, sobre o carrinho já preçado a partir do
       products.json publicado (pricing.js), e não sobre o que o browser diz.
       Sem ela, noutra versão, ou com outros meses, responde 400 com o
       `codigo` CODIGO_GARANTIA, a mensagem para o cliente, e o texto, a versão
       e os artigos deste Worker — a página mostra-os e o cliente aceita outra
       vez;
     · com ela, o retrato da encomenda (termos.garantia_usados) guarda a
       versão e o texto aceites e, por artigo, o sku, o nome e os meses — a
       prova do acordo —, os emails de confirmação dizem-no (mail.js), e a
       página da Stripe leva uma frase curta.

   Um carrinho sem pneus seminovos de garantia reduzida não passa por nada
   disto: o pedido, a encomenda, a página da Stripe e os emails ficam byte a
   byte como eram (provado em test/garantia.mjs e em test/w-dados.mjs).

   O TEXTO é o mesmo aqui e no checkout.js (a bateria do browser,
   .github/test-checkout.mjs, confere-o na página verdadeira). Mudá-lo é uma
   VERSÃO nova: muda-se GARANTIA_VERSAO aqui e no checkout.js, e este Worker
   publica-se primeiro (uma página com outra versão recebe o 400 com a versão e
   o texto deste, mostra-os, e à segunda passa).
   ============================================================= */
import { garantiaReduzida, nomeDeArtigo } from './termos.js';

export const GARANTIA_VERSAO = '2026-10-01';
export const CODIGO_GARANTIA = 'garantia_usados_por_aceitar';

const LEI = '(DL n.º 84/2021, art. 12.º)';
const eObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const proprio = (o, k) => (eObjeto(o) && Object.hasOwn(o, k) ? o[k] : undefined);
const unidades = (artigos) => artigos.reduce((n, a) => n + a.qty, 0);
const mesesDistintos = (artigos) => [...new Set(artigos.map((a) => a.meses))].sort((a, b) => a - b);

/**
 * O texto que o cliente aceita. `artigos` são os pneus seminovos com garantia
 * reduzida ([{ nome, meses, qty }], pela ordem do carrinho); `outros` diz se o
 * carrinho tem outros pneus seminovos, com a garantia inteira. Com os mesmos
 * meses em todos e sem outros, uma frase; senão, a garantia de cada um.
 */
export function textoDaGarantia(artigos, outros) {
  const sujeito = unidades(artigos) > 1
    ? 'destes pneus seminovos, por serem bens usados,'
    : 'deste pneu seminovo, por ser um bem usado,';
  const meses = mesesDistintos(artigos);
  if (meses.length === 1 && !outros) {
    return `Aceito que a garantia de conformidade ${sujeito} é de ${meses[0]} meses em vez de 3 anos ${LEI}.`;
  }
  const lista = artigos.map((a) => `${a.nome} — ${a.meses} meses`).join('; ');
  return `Aceito que a garantia de conformidade ${sujeito} é a indicada a seguir, em vez de 3 anos ${LEI}: ${lista}.`;
}

/**
 * O acordo que ESTE carrinho pede, a partir dos pneus seminovos que o
 * priceOrder encontrou no products.json publicado (calc.seminovos): null —
 * nenhum tem a garantia reduzida, nada muda — ou
 * { versao, texto, artigos: [{ sku, nome, meses, qty }], outros }.
 */
export function garantiaDoCarrinho(seminovos) {
  const lista = Array.isArray(seminovos) ? seminovos : [];
  const artigos = lista.filter((s) => garantiaReduzida(s.meses))
    .map((s) => ({ sku: s.sku, nome: nomeDeArtigo(s.nome) || s.sku, meses: s.meses, qty: s.qty }));
  if (!artigos.length) return null;
  const outros = lista.some((s) => !garantiaReduzida(s.meses));
  return { versao: GARANTIA_VERSAO, texto: textoDaGarantia(artigos, outros), artigos, outros };
}

/** O que fica no retrato da encomenda (e o que o 400 manda à página). */
export function registoDaGarantia(g) {
  return { versao: g.versao, texto: g.texto, artigos: g.artigos.map(({ sku, nome, meses }) => ({ sku, nome, meses })) };
}

/**
 * O pedido traz a aceitação DESTE acordo? A caixa marcada, a versão deste
 * Worker, e cada artigo com garantia reduzida com os mesmos meses. Outros
 * meses (o dono mudou-os com a página aberta) são outro acordo: pede-se outra
 * vez, e o que fica guardado é sempre o que o cliente viu.
 */
export function aceitacaoConfere(pedido, g) {
  const artigos = proprio(pedido, 'artigos');
  if (proprio(pedido, 'aceita') !== true || proprio(pedido, 'versao') !== g.versao || !Array.isArray(artigos)) return false;
  return g.artigos.every((a) => artigos.some((x) => proprio(x, 'sku') === a.sku && proprio(x, 'meses') === a.meses));
}

/** A mensagem do 400, para o cliente, em português simples. */
export function mensagemDaGarantia(g) {
  const plural = unidades(g.artigos) > 1;
  const meses = mesesDistintos(g.artigos);
  const porque = plural ? 'por serem bens usados' : 'por ser um bem usado';
  const inicio = meses.length === 1 && !g.outros
    ? `${plural ? 'Os pneus seminovos têm' : 'O pneu seminovo tem'} uma garantia de ${meses[0]} meses, e não de 3 anos, ${porque}`
    : `Esta encomenda tem ${plural ? 'pneus seminovos' : 'um pneu seminovo'} com uma garantia mais curta do que 3 anos, ${porque}`;
  return `${inicio} — e isso só vale com o seu acordo. Confirme-o na caixa junto ao botão «Pagar agora» (se não a vir, recarregue a página).`;
}

/**
 * A frase que se junta ao texto da página da Stripe (custom_text, que a Stripe
 * desenha em Markdown). Só texto fixo e números: nenhum nome de artigo, nada
 * que o Markdown possa ler como ligação ou ênfase.
 */
export function fraseDaGarantiaNaStripe(g) {
  const meses = mesesDistintos(g.artigos);
  const prazo = meses.length === 1 ? `${meses[0]} meses` : `de ${meses[0]} a ${meses[meses.length - 1]} meses, conforme o pneu`;
  return unidades(g.artigos) > 1
    ? `Inclui pneus seminovos (bens usados) com a garantia reduzida que aceitou: ${prazo}.`
    : `Inclui um pneu seminovo (bem usado) com a garantia reduzida que aceitou: ${prazo}.`;
}
