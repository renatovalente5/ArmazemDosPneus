/* =============================================================
   ARMAZÉM DOS PNEUS — as condições gerais da encomenda
   -------------------------------------------------------------
   O email de confirmação leva no corpo os Termos e Condições de Venda (DL
   7/2004, art. 31.º: termos que o cliente possa guardar e reproduzir; DL
   24/2014, art. 6.º: a confirmação em suporte duradouro). Os Termos que valem
   são os que estavam publicados quando o cliente carregou em «Pagar agora» —
   não os de quando o email sai (com Multibanco, até 7 dias depois).

   Por isso lêem-se NO CHECKOUT, ao mesmo tempo que o catálogo e com a mesma
   cache de 60 s, e guardam-se no KV uma vez por versão (termos:<hash>, o
   texto já em blocos); a encomenda guarda só o hash (condicoes_gerais). O
   webhook não volta a ler o site: lê o KV.

   Nada disto pára uma venda: se a página não responder, ou o KV falhar, a
   encomenda segue sem o hash e o email leva a ligação para os Termos.
   ============================================================= */

import { CACHE_DADOS } from './pricing.js';

const TTL_SEGUNDOS = 400 * 86400;            // o mesmo das encomendas
const RENOVAR_MS = 300 * 86400 * 1000;       // uma versão antiga ganha mais 400 dias
const TECTO_HTML = 512 * 1024;
export const chaveDasCondicoes = (hash) => `termos:${hash}`;

/* ---------- do HTML da página aos blocos de texto ---------- */

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', laquo: '«', raquo: '»', hellip: '…' };
function decodificar(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    const k = e.toLowerCase();
    return Object.hasOwn(ENTIDADES, k) ? ENTIDADES[k] : m;
  });
}

/**
 * Os blocos de texto do <article> de uma página legal, pela ordem:
 * [{ tipo: 'titulo' | 'paragrafo' | 'item', texto }]. Os comentários (os
 * marcadores da publicação), os scripts e os SVG saem; as ligações ficam com o
 * endereço por extenso, porque o texto tem de valer sem o site.
 */
export function blocosDosTermos(html, base) {
  const m = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(String(html || ''));
  if (!m) return [];
  const corpo = m[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|svg|template)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<span class="lr-sr">[\s\S]*?<\/span>/gi, '');
  const out = [];
  for (const b of corpo.matchAll(/<(h1|h2|h3|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const interior = b[2].replace(/<a\b[^>]*?\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (x, href, txt) => {
      const texto = txt.replace(/<[^>]+>/g, '');
      const h = decodificar(href).trim();
      if (!h || h.startsWith('#') || /^(mailto|tel):/i.test(h)) return texto;
      let url;
      try { url = new URL(h, base).href; } catch { return texto; }
      if (!/^https?:/.test(url)) return texto;
      const simples = decodificar(texto).replace(/\s+/g, '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      return simples && url.includes(simples) ? url : `${texto} (${url})`;
    });
    const texto = decodificar(interior.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    const tag = b[1].toLowerCase();
    out.push({ tipo: tag === 'li' ? 'item' : tag === 'p' ? 'paragrafo' : 'titulo', texto });
  }
  return out;
}

async function sha256(texto) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/* ---------- no checkout ---------- */

/**
 * Lê os Termos publicados. Nunca lança: null quando a página não responde em
 * 3 s, não é HTML, ou não traz os Termos (menos de 5 blocos).
 * @returns {Promise<{ hash: string, url: string, blocos: object[] } | null>}
 */
export async function lerCondicoesGerais(env) {
  const site = String(env.SITE_URL || 'https://armazemdospneus.pt').replace(/\/+$/, '');
  const url = `${site}/legal/termos.html`;
  try {
    const r = await fetch(url, { ...CACHE_DADOS, signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    if (html.length > TECTO_HTML) throw new Error('página grande de mais');
    const blocos = blocosDosTermos(html, `${site}/legal/`);
    if (blocos.length < 5) throw new Error('a página não trouxe os Termos');
    return { hash: await sha256(JSON.stringify(blocos)), url, blocos };
  } catch (e) {
    console.error('condições gerais: os Termos não se leram no checkout (o email leva só a ligação):', e && e.message);
    return null;
  }
}

/**
 * Guarda esta versão dos Termos no KV, se ainda lá não estiver (uma leitura
 * por checkout; uma escrita só quando os Termos mudam, ou para renovar uma
 * versão com mais de 300 dias). Devolve o hash a pôr na encomenda, ou null se
 * o KV falhou (a encomenda segue sem ele).
 */
export async function guardarCondicoes(env, c) {
  if (!c) return null;
  const chave = chaveDasCondicoes(c.hash);
  try {
    const antes = await env.ORDERS.get(chave);
    let lidoEm = null;
    try { lidoEm = antes ? Date.parse(JSON.parse(antes).lido_em) : null; } catch { lidoEm = null; }
    if (!antes || !Number.isFinite(lidoEm) || Date.now() - lidoEm > RENOVAR_MS) {
      await env.ORDERS.put(chave, JSON.stringify({ v: 1, url: c.url, lido_em: new Date().toISOString(), blocos: c.blocos }), { expirationTtl: TTL_SEGUNDOS });
    }
    return c.hash;
  } catch (e) {
    console.error('condições gerais: não se gravaram no KV (o email leva só a ligação):', e && e.message);
    return null;
  }
}

/* ---------- no email ---------- */

const eBloco = (b) => b && typeof b === 'object' && ['titulo', 'paragrafo', 'item'].includes(b.tipo) && typeof b.texto === 'string';

/** Os blocos dos Termos desta encomenda, ou null (encomenda antiga, KV sem eles, valor estragado). */
export async function condicoesDaEncomenda(env, order) {
  const hash = order && order.condicoes_gerais;
  if (typeof hash !== 'string' || !/^[0-9a-f]{32}$/.test(hash)) return null;
  try {
    const v = JSON.parse(await env.ORDERS.get(chaveDasCondicoes(hash)) || 'null');
    const blocos = v && Array.isArray(v.blocos) ? v.blocos.filter(eBloco) : [];
    return blocos.length ? blocos : null;
  } catch (e) {
    console.error('condições gerais: não se leram do KV:', hash, e && e.message);
    return null;
  }
}
