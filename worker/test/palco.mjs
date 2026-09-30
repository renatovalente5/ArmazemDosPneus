/* =============================================================
   Palco da bateria do Worker: a rede, o KV e a Stripe a fingir, e o Worker de
   ANTES da fase W-dados (lido do git) para comparar byte a byte.

   Nada sai da máquina. Um pedido a um endereço que o palco não conhece rebenta
   o teste em vez de ir à rede — e o palco conhece apenas os ficheiros do site
   (servidos daqui), a criação de sessões da Stripe e o envio do Resend.
   ============================================================= */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Os ficheiros do site, servidos numa porta livre (a que o sistema der). */
export async function servirPasta(raiz) {
  const srv = http.createServer((q, r) => {
    const p = path.join(raiz, decodeURIComponent(new URL(q.url, 'http://x').pathname));
    if (!p.startsWith(raiz + path.sep) || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
      r.writeHead(404, { 'content-type': 'text/html' });
      return r.end('<h1>404</h1>');
    }
    r.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    fs.createReadStream(p).pipe(r);
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  return {
    base: `http://127.0.0.1:${srv.address().port}`,
    fechar: () => new Promise((ok) => { srv.closeAllConnections(); srv.close(ok); }),
  };
}

/** KV em memória. O `mapa` pode ser partilhado por dois Workers (o de antes cria, o novo recebe o webhook). */
export function kvFalso(mapa = new Map()) {
  const ops = [];
  return {
    mapa,
    ops,
    async get(k) { ops.push(`get ${k}`); return mapa.has(k) ? mapa.get(k) : null; },
    async put(k, v) { ops.push(`put ${k}`); mapa.set(k, String(v)); },
    async delete(k) { ops.push(`delete ${k}`); mapa.delete(k); },
  };
}

export const SITE = 'https://armazemdospneus.pt';

/**
 * A rede a fingir. `dados` é { 'products.json': objecto | texto | função }:
 * ausente = 404 com a página de erro do site; função = a resposta à medida
 * (um 500, um HTML com 200, uma falha de rede).
 */
export function redeFalsa(dados) {
  const m = { dados: { ...dados }, stripe: [], resend: [], chamadas: [] };
  let n = 0;
  m.fetch = async (input, init = {}) => {
    const url = String(input && input.url ? input.url : input);
    const method = (init.method || 'GET').toUpperCase();
    m.chamadas.push({ url, method, init });
    if (url.startsWith(`${SITE}/data/`)) {
      const v = m.dados[url.slice(`${SITE}/data/`.length)];
      if (v === undefined) {
        return new Response('<!doctype html><title>Página não encontrada</title>', { status: 404, headers: { 'content-type': 'text/html' } });
      }
      if (typeof v === 'function') return v();
      return new Response(typeof v === 'string' ? v : JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url === 'https://api.stripe.com/v1/checkout/sessions' && method === 'POST') {
      const id = `cs_test_ensaio${++n}`;
      m.stripe.push({ id, corpo: init.body });
      return new Response(JSON.stringify({ id, object: 'checkout.session', url: `https://checkout.stripe.com/c/pay/${id}` }), { status: 200 });
    }
    if (url.startsWith('https://api.stripe.com/v1/checkout/sessions?') && method === 'GET') {
      return new Response('{"object":"list","data":[]}', { status: 200 });
    }
    if (url === 'https://api.resend.com/emails' && method === 'POST') {
      m.resend.push(JSON.parse(init.body));
      return new Response('{"id":"re_ensaio"}', { status: 200 });
    }
    if (url === 'https://api.resend.com/domains' && method === 'GET') {
      return new Response('{"data":[{"name":"armazemdospneus.pt","status":"verified"}]}', { status: 200 });
    }
    throw new Error(`o palco não conhece ${method} ${url} — nenhum pedido sai para a rede`);
  };
  return m;
}

async function assinar(corpo, t, segredo) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${t}.${corpo}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Conduz um Worker como a Cloudflare o conduziria: `fetch(request, env, ctx)`,
 * com a rede falsa no lugar do fetch global, e à espera do que ficou em
 * ctx.waitUntil (os emails) antes de devolver.
 */
/* Um IP diferente por pedido, em TODOS os palcos: o Worker trava 10 pedidos
   por minuto por IP (em memória, por módulo), e a bateria faz centenas. */
let nIp = 0;
const ipNovo = () => { nIp += 1; return `10.${(nIp >> 16) & 255}.${(nIp >> 8) & 255}.${nIp & 255}`; };

export function palco(worker, { env, kv, rede }) {
  const pendentes = [];
  const ctx = { waitUntil: (p) => pendentes.push(p), passThroughOnException() {} };
  const chamar = async (req) => {
    const antes = globalThis.fetch;
    globalThis.fetch = rede.fetch;
    try {
      const res = await worker.fetch(req, { ...env, ORDERS: kv }, ctx);
      await Promise.all(pendentes.splice(0));
      return { status: res.status, corpo: await res.text() };
    } finally {
      globalThis.fetch = antes;
    }
  };
  return {
    checkout: (corpo, origem = SITE) => chamar(new Request('https://pay.exemplo/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: origem, 'cf-connecting-ip': ipNovo() },
      body: JSON.stringify(corpo),
    })),
    opcoes: (origem) => chamar(new Request('https://pay.exemplo/checkout', { method: 'OPTIONS', headers: { origin: origem } })),
    sonda: () => chamar(new Request('https://pay.exemplo/health?probe=1', { headers: { 'cf-connecting-ip': ipNovo() } })),
    webhook: async (evento) => {
      const corpo = JSON.stringify(evento);
      const t = Math.floor(Date.now() / 1000);
      const sig = await assinar(corpo, t, env.STRIPE_WEBHOOK_SECRET);
      return chamar(new Request('https://pay.exemplo/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: corpo }));
    },
  };
}

/* ---------- eventos da Stripe ---------- */
let nEvento = 0;
const agora = () => Math.floor(Date.now() / 1000);
const evento = (type, object) => ({ id: `evt_ensaio${++nEvento}`, object: 'event', type, created: agora(), data: { object } });

export const eventos = {
  sessaoConcluida: ({ order_id, sessao, total, entrega }, { pago = true, pi = 'pi_ensaio1', cobrado } = {}) =>
    evento('checkout.session.completed', {
      id: sessao, object: 'checkout.session', client_reference_id: order_id,
      metadata: { order_id, entrega }, payment_status: pago ? 'paid' : 'unpaid',
      payment_intent: pi, amount_total: cobrado ?? total, customer_details: {},
    }),
  referenciaMultibanco: ({ order_id }, { pi = 'pi_ensaio1' } = {}) =>
    evento('payment_intent.requires_action', {
      id: pi, object: 'payment_intent', metadata: { order_id }, payment_method_types: ['multibanco'],
      next_action: { multibanco_display_details: { entity: '12345', reference: '123 456 789', expires_at: 1791000000, hosted_voucher_url: 'https://payments.stripe.com/multibanco/voucher/ensaio' } },
    }),
  pagamentoRecebido: ({ order_id }, { pi = 'pi_ensaio1' } = {}) =>
    evento('payment_intent.succeeded', { id: pi, object: 'payment_intent', metadata: { order_id }, payment_method_types: ['multibanco'] }),
};

/* ---------- o Worker de antes ---------- */

/**
 * Tira do git os ficheiros de worker/src tal como estavam em `ref` para uma
 * pasta temporária, e importa-os. É contra ESTE código — e não contra uma
 * cópia do que ele escrevia — que o novo se compara (memória
 * verificar-contra-a-fonte-certa).
 */
export async function workerDeAntes(ref, pastaRepo) {
  const git = (...a) => execFileSync('git', ['-C', pastaRepo, ...a], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  // --full-tree: corrido de dentro de worker/, o ls-tree filtra pela pasta actual e não devolve nada.
  const ficheiros = git('ls-tree', '--full-tree', '--name-only', `${ref}:worker/src`).split('\n').filter(Boolean);
  if (!ficheiros.includes('index.js')) throw new Error(`o git não deu os ficheiros de worker/src em ${ref}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-worker-antes-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
  for (const f of ficheiros) fs.writeFileSync(path.join(dir, 'src', f), git('show', `${ref}:worker/src/${f}`));
  const mod = await import(pathToFileURL(path.join(dir, 'src', 'index.js')).href);
  return { worker: mod.default, ficheiros, apagar: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/* O número da encomenda e o fim da sessão mudam de corrida para corrida; o
   resto tem de ser igual byte a byte. */
export function semAcaso(x) {
  return JSON.parse(JSON.stringify(x)
    .replace(/AP-\d{8}-[0-9a-f]{8}/g, 'AP-AAAAMMDD-xxxxxxxx')
    .replace(/expires_at=\d+/g, 'expires_at=N')
    .replace(/cs_test_ensaio\d+/g, 'cs_test_ensaioN')
    .replace(/evt_ensaio\d+/g, 'evt_ensaioN'));
}

/** [wrangler.toml] → { NOME: 'valor' } da secção [vars]. */
export function varsDoToml(texto) {
  const out = {};
  let naVars = false;
  for (const linha of texto.split('\n')) {
    const l = linha.trim();
    if (/^\[.*\]$/.test(l)) { naVars = l === '[vars]'; continue; }
    const m = naVars && l.match(/^([A-Z0-9_]+)\s*=\s*"(.*)"\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
