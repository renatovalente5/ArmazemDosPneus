/* =============================================================
   ARMAZÉM DOS PNEUS — o que se promete ao cliente («termos»)
   -------------------------------------------------------------
   Prazos de entrega, custo de devolução, contactos e dados da empresa deixaram
   de viver neste Worker: o dono muda-os no painel e eles chegam ao site em
     data/settings.json   delivery.*, returns.return_cost_eur, returns.note
     data/site.json       contactos.telefone, contactos.email
     data/empresa.json    nome, denominacao, nif, morada, livro_reclamacoes
   (a forma dos dois últimos é a do §5.1 do plano do painel; nascem na fase A2).

   RETRATO. No /checkout guarda-se na encomenda (order.termos) o que se disse ao
   cliente nesse momento. Os emails que saem depois — pelo webhook, às vezes
   dias depois, com Multibanco — repetem o retrato, e não o que o site disser
   entretanto: a confirmação do contrato (art. 6.º do DL 24/2014) tem de dizer o
   que foi prometido antes dele, não o que o dono mudou a seguir.

   RECURSO. Um grupo que não se consegue ler — ficheiro que não existe (404),
   que não responde, que não é JSON, ou valor fora da regra — usa os valores de
   sempre: DELIVERY_*, STORE_PHONE/STORE_EMAIL do wrangler.toml, e a empresa
   escrita abaixo. São os mesmos que o Worker usava antes deste módulo, por isso,
   enquanto site.json e empresa.json não existirem, os emails e a página da
   Stripe ficam iguais byte a byte (provado em test.mjs contra o código de
   antes). Encomendas antigas, sem retrato, usam o recurso inteiro: foi isso que
   o Worker de então lhes prometeu.

   Cada GRUPO cai inteiro — prazos; denominação + NIF; morada. Meia morada nova
   com meia morada antiga é uma morada que não existe, e uma denominação nova
   com o NIF antigo é outra empresa.

   As regras de cada campo estão escritas em cada função, e têm de ser iguais
   ou mais largas do que as do painel (regras.mjs): o que o painel deixa gravar
   tem de chegar aos emails, senão o checkout e a confirmação desencontram-se.
   ============================================================= */

import { CACHE_DADOS } from './pricing.js';

export const TERMOS_VERSAO = 1;

/* Os valores escritos à mão no Worker até à fase W-dados (index.js e mail.js).
   Não se mudam aqui: mudam-se no painel. */
const RECURSO_TELEFONE = '935 218 857';
const RECURSO_PRAZOS = { min_dias: 2, max_dias_uteis: 5, max_dias: 30 };
const RECURSO_EMPRESA = {
  nome: 'Armazém dos Pneus',
  denominacao: 'Motivar & Lucrar, Unipessoal, Lda.',
  nif: '516324950',
  morada: { rua: 'Travessa do Navega, 436 F', cp: '3885-183', localidade: 'Arada', concelho: 'Ovar' },
  livro_reclamacoes: 'https://www.livroreclamacoes.pt/inicio',
};

/* Tectos. O site.json e o empresa.json têm poucos KB; um ficheiro muito maior
   não é deles e não se lê (o JSON.parse gasta CPU, e o Worker tem 10 ms). */
const TECTO_JSON_BYTES = 64 * 1024;
const CUSTO_DEVOLUCAO_MAX_EUR = 1000;

/* ---------- ajudantes ---------- */

const eObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/* Só as chaves PRÓPRIAS: `x.constructor` num objecto vindo de JSON devolve a
   função do protótipo, e um `in` aceita-a (memória in-aceita-o-prototipo). */
const proprio = (o, k) => (eObjeto(o) && Object.hasOwn(o, k) ? o[k] : undefined);

/* «Não foi dito»: ausente, null ou texto vazio. Testa-se ANTES de converter —
   Number(null) é 0 (memória numero-zero-nao-e-nao-foi-dito). */
const naoDito = (v) => v === undefined || v === null || v === '';

/* Caracteres que não podem chegar a um email: os de controlo (um «\n» escrevia
   uma linha nova, falsa, no email em texto), os separadores de linha do
   Unicode, os de largura zero e os de direcção (U+202E vira o texto do avesso).
   Viram espaço, e os espaços seguidos juntam-se.
   Construída a partir dos números, e não escrita com escapes: um editor que
   descodifique os escapes deixa um U+2028 literal dentro da expressão, e isso
   é um fim de linha — o ficheiro deixa de compilar (aconteceu ao escrevê-la). */
const INVISIVEIS = new RegExp(`[${[
  [0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e],
  [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff],
].map(([a, b]) => `\\u${a.toString(16).padStart(4, '0')}-\\u${b.toString(16).padStart(4, '0')}`).join('')}]`, 'g');

/** Texto de uma linha, limpo, entre `min` e `max` caracteres — ou null. */
function texto(v, min, max) {
  if (typeof v !== 'string' || v.length > max * 4) return null;
  const t = v.replace(INVISIVEIS, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= min && t.length <= max ? t : null;
}

/* ---------- regras de cada campo ---------- */

/** Prazos: inteiros, 1 ≤ mínimo ≤ máximo estimado ≤ 30 dias úteis; prazo máximo legal 1–30 dias. */
function prazosValidos(p) {
  const min = proprio(p, 'min_dias'), uteis = proprio(p, 'max_dias_uteis'), max = proprio(p, 'max_dias');
  if (![min, uteis, max].every((n) => typeof n === 'number' && Number.isInteger(n))) return null;
  if (min < 1 || min > uteis || uteis > 30 || max < 1 || max > 30) return null;
  return { min_dias: min, max_dias_uteis: uteis, max_dias: max };
}

/**
 * Custo da devolução. null/ausente = a loja paga (o texto de sempre). Um
 * número ≥ 0 fica, arredondado ao cêntimo (zero DITO fica zero — e dá o mesmo
 * texto que null, como no checkout). Tudo o resto é inválido: devolve
 * `undefined`, e quem chama usa o recurso (null = a loja paga), que é o que a
 * lei dá ao cliente a quem não se disse quanto custava.
 */
function custoValido(v) {
  if (naoDito(v)) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > CUSTO_DEVOLUCAO_MAX_EUR) return undefined;
  return Math.round(v * 100) / 100;
}

/** Telefone público: algarismos, espaços e + ( ) . -, com 9 a 15 algarismos. */
function telefoneValido(v) {
  const t = texto(v, 9, 30);
  if (!t || !/^[+0-9 ().-]+$/.test(t)) return null;
  const n = t.replace(/[^0-9]/g, '').length;
  return n >= 9 && n <= 15 ? t : null;
}

/* Vai também para o reply_to do Resend: nada de espaços, vírgulas, < > nem
   quebras de linha (um «\r\nBcc:» não pode chegar a um cabeçalho). */
const EMAIL_LOJA = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
function emailValido(v) {
  if (typeof v !== 'string' || v.length > 160) return null;
  const t = v.trim();
  return EMAIL_LOJA.test(t) ? t : null;
}

/** NIF português: 9 algarismos, o primeiro não é 0, e o de controlo (módulo 11) bate. */
export function nifValido(v) {
  if (typeof v !== 'string' || !/^[1-9][0-9]{8}$/.test(v)) return false;
  let soma = 0;
  for (let i = 0; i < 8; i++) soma += Number(v[i]) * (9 - i);
  const resto = soma % 11;
  return (resto < 2 ? 0 : 11 - resto) === Number(v[8]);
}

function identidadeValida(e) {
  const denominacao = texto(proprio(e, 'denominacao'), 2, 160);
  const bruto = proprio(e, 'nif');
  const nif = typeof bruto === 'string' ? bruto.replace(/\s/g, '') : null;
  return denominacao && nifValido(nif) ? { denominacao, nif } : null;
}

/* A morada vai também para a página de pagamento da Stripe (custom_text), que
   desenha ligações em Markdown: sem [ ] : < > * _ não há ligação nem ênfase. */
const MORADA = /^[\p{L}\p{M}\p{N} .,'’ºª°/&()-]+$/u;
function parteDeMorada(v, min, max) {
  const t = texto(v, min, max);
  return t && MORADA.test(t) ? t : null;
}

function moradaValida(m) {
  const rua = parteDeMorada(proprio(m, 'rua'), 3, 120);
  const cpBruto = proprio(m, 'cp');
  const cp = typeof cpBruto === 'string' && /^[0-9]{4}-[0-9]{3}$/.test(cpBruto.trim()) ? cpBruto.trim() : null;
  const localidade = parteDeMorada(proprio(m, 'localidade'), 2, 60);
  const c = proprio(m, 'concelho');
  const concelho = naoDito(c) ? '' : parteDeMorada(c, 2, 60);
  if (!rua || !cp || !localidade || concelho === null) return null;
  return { rua, cp, localidade, concelho };
}

/** Só https, sem utilizador nem palavra-passe; devolve o URL já normalizado (aspas viram %22). */
function urlHttps(v) {
  const t = texto(v, 10, 200);
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

/* ---------- o retrato ---------- */

function prazosDoEnv(env) {
  // Os «|| 2», «|| 5» e «|| 30» do código de antes.
  const n = (v, omissao) => Number(v || omissao);
  return prazosValidos({
    min_dias: n(env.DELIVERY_MIN_DAYS, 2),
    max_dias_uteis: n(env.DELIVERY_MAX_BUSINESS_DAYS, 5),
    max_dias: n(env.DELIVERY_MAX_DAYS, 30),
  }) || { ...RECURSO_PRAZOS };
}

/** O retrato com os valores de sempre — o de uma encomenda antiga, sem retrato. */
export function termosDeRecurso(env) {
  return {
    versao: TERMOS_VERSAO,
    prazos: prazosDoEnv(env),
    devolucao: { custo_eur: null, nota: '' },
    contactos: {
      telefone: String(env.STORE_PHONE || RECURSO_TELEFONE),
      email: String(env.STORE_EMAIL || env.MAIL_TO || ''),
    },
    empresa: { ...RECURSO_EMPRESA, morada: { ...RECURSO_EMPRESA.morada } },
  };
}

/**
 * Passa um retrato (novo, montado a partir dos ficheiros do site, ou lido de
 * uma encomenda) pelas regras, grupo a grupo. Idempotente: normalizar o que já
 * foi normalizado dá o mesmo — é o que acontece a cada email.
 *
 * Devolve { termos, origem, invalidos }:
 *   origem[grupo]  'dados' ou 'recurso'
 *   invalidos      grupos que TINHAM valor e foram recusados (os que faltam
 *                  simplesmente não contam — o site.json ainda não existe)
 */
export function normalizarTermos(bruto, env) {
  const r = termosDeRecurso(env);
  const origem = {};
  const invalidos = [];
  const escolhe = (nome, presente, valido, recurso) => {
    if (valido !== null && valido !== undefined) { origem[nome] = 'dados'; return valido; }
    origem[nome] = 'recurso';
    if (presente) invalidos.push(nome);
    return recurso;
  };
  const algum = (o, ks) => ks.some((k) => !naoDito(proprio(o, k)));

  const p = proprio(bruto, 'prazos');
  const d = proprio(bruto, 'devolucao');
  const c = proprio(bruto, 'contactos');
  const e = proprio(bruto, 'empresa');

  const prazos = escolhe('prazos', algum(p, ['min_dias', 'max_dias_uteis', 'max_dias']), prazosValidos(p), r.prazos);

  // Aqui null é um valor (a loja paga), por isso não passa pelo `escolhe`.
  const custo = custoValido(proprio(d, 'custo_eur'));
  origem.custo_devolucao = custo === undefined ? 'recurso' : 'dados';
  if (custo === undefined) invalidos.push('custo_devolucao');
  const custo_eur = custo === undefined ? r.devolucao.custo_eur : custo;

  // A nota vazia é a de sempre. Guarda-se no retrato; os emails não a mostram,
  // porque nem o checkout nem os Termos a mostram (um email não pode trazer uma
  // condição que o cliente não viu antes de pagar).
  const notaBruta = proprio(d, 'nota');
  const nota = naoDito(notaBruta) ? '' : escolhe('nota_devolucao', true, texto(notaBruta, 1, 500), r.devolucao.nota);
  if (naoDito(notaBruta)) origem.nota_devolucao = 'dados';

  const telefone = escolhe('telefone', !naoDito(proprio(c, 'telefone')), telefoneValido(proprio(c, 'telefone')), r.contactos.telefone);
  const email = escolhe('email', !naoDito(proprio(c, 'email')), emailValido(proprio(c, 'email')), r.contactos.email);

  const nome = escolhe('nome', !naoDito(proprio(e, 'nome')), texto(proprio(e, 'nome'), 2, 80), r.empresa.nome);
  const identidade = escolhe('identidade', algum(e, ['denominacao', 'nif']), identidadeValida(e),
    { denominacao: r.empresa.denominacao, nif: r.empresa.nif });
  const morada = escolhe('morada', !naoDito(proprio(e, 'morada')), moradaValida(proprio(e, 'morada')), r.empresa.morada);
  const livro = escolhe('livro_reclamacoes', !naoDito(proprio(e, 'livro_reclamacoes')),
    urlHttps(proprio(e, 'livro_reclamacoes')), r.empresa.livro_reclamacoes);

  return {
    termos: {
      versao: TERMOS_VERSAO,
      prazos,
      devolucao: { custo_eur, nota },
      contactos: { telefone, email },
      empresa: { nome, denominacao: identidade.denominacao, nif: identidade.nif, morada, livro_reclamacoes: livro },
    },
    origem,
    invalidos,
  };
}

/**
 * O retrato a partir dos ficheiros do site. Qualquer um pode ser null (não
 * existe, ou não se leu): os grupos dele caem para o recurso.
 */
export function termosDasFontes({ settings, site, empresa } = {}, env) {
  const del = proprio(settings, 'delivery');
  const dev = proprio(settings, 'returns');
  const con = proprio(site, 'contactos');
  return normalizarTermos({
    prazos: {
      min_dias: proprio(del, 'estimate_min_days'),
      max_dias_uteis: proprio(del, 'estimate_max_days'),
      max_dias: proprio(del, 'max_days'),
    },
    devolucao: { custo_eur: proprio(dev, 'return_cost_eur'), nota: proprio(dev, 'note') },
    contactos: { telefone: proprio(con, 'telefone'), email: proprio(con, 'email') },
    empresa: {
      nome: proprio(empresa, 'nome'),
      denominacao: proprio(empresa, 'denominacao'),
      nif: proprio(empresa, 'nif'),
      morada: proprio(empresa, 'morada'),
      livro_reclamacoes: proprio(empresa, 'livro_reclamacoes'),
    },
  }, env);
}

/** O que os emails de uma encomenda usam: o retrato dela, ou o recurso se for antiga. */
export function termosDaEncomenda(order, env) {
  const t = proprio(order, 'termos');
  return eObjeto(t) ? normalizarTermos(t, env).termos : termosDeRecurso(env);
}

/* ---------- leitura dos ficheiros do site ---------- */

/**
 * Lê um JSON do site que PODE não existir. Nunca lança: devolve
 * { dados, estado }, com dados = null e o estado a dizer porquê.
 * Mesma cache de 60 s que o products.json e o settings.json (pricing.js);
 * `fresco` é só para o /health?probe=1.
 */
export async function lerJsonOpcional(url, { fresco = false } = {}) {
  if (!url) return { dados: null, estado: 'sem URL' };
  try {
    const res = await fetch(url, fresco ? { cf: { cacheTtl: 0 } } : CACHE_DADOS);
    if (!res.ok) return { dados: null, estado: `HTTP ${res.status}` };
    const n = Number(res.headers.get('content-length'));
    if (n > TECTO_JSON_BYTES) return { dados: null, estado: 'grande de mais' };
    const txt = await res.text();
    if (txt.length > TECTO_JSON_BYTES) return { dados: null, estado: 'grande de mais' };
    const dados = JSON.parse(txt);
    return eObjeto(dados) ? { dados, estado: 'ok' } : { dados: null, estado: 'não é um objecto' };
  } catch (e) {
    return { dados: null, estado: e instanceof SyntaxError ? 'JSON inválido' : `erro: ${String(e.message || e).slice(0, 120)}` };
  }
}

/** site.json e empresa.json, em paralelo. Nunca lança. */
export async function lerFontesDoSite(env, opcoes) {
  const [site, empresa] = await Promise.all([
    lerJsonOpcional(env.SITE_DATA_URL, opcoes),
    lerJsonOpcional(env.EMPRESA_URL, opcoes),
  ]);
  return { site: site.dados, empresa: empresa.dados, estado: { site: site.estado, empresa: empresa.estado } };
}

/* ---------- frases feitas a partir do retrato ---------- */

/** «Travessa do Navega, 436 F, 3885-183 Arada, Ovar» — o concelho só se não repetir a localidade. */
export function moradaLinha(t) {
  const m = t.empresa.morada;
  const concelho = m.concelho && m.concelho.toLowerCase() !== m.localidade.toLowerCase() ? `, ${m.concelho}` : '';
  return `${m.rua}, ${m.cp} ${m.localidade}${concelho}`;
}

/** «935 218 857 · loja@…» */
export function contactoLinha(t) {
  return [t.contactos.telefone, t.contactos.email].filter(Boolean).join(' · ');
}

/**
 * Cêntimos que o CLIENTE paga pela devolução; 0 = a loja paga. A mesma regra
 * do checkout (assets/js/checkout.js, applySettings): só um número > 0 conta.
 */
export function custoDevolucaoCentimos(t) {
  const v = t.devolucao.custo_eur;
  return typeof v === 'number' && v > 0 ? Math.round(v * 100) : 0;
}

/** Texto da ligação para o Livro de Reclamações: o domínio, sem «www.». */
export function dominioDe(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
