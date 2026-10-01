#!/usr/bin/env node
/* A BATERIA DO CHECKOUT NO BROWSER (Chromium, pelo Playwright).
 *
 *     PYTHON=<python com Pillow> PLAYWRIGHT=<pasta do playwright> node .github/test-checkout.mjs
 *     (ex.: PLAYWRIGHT=~/Websites/carimbo/node_modules/playwright)
 *
 * Constrói a _site como o CI a constrói (.github/preparar-site.sh: a injecção
 * do conteúdo, as fotografias e a cópia neutralizada do products.json) a partir
 * de uma cópia da árvore de trabalho com os dois pneus seminovos à venda, serve-a
 * em http://localhost:8891 (ou na primeira porta livre acima de 8890), e conduz
 * a loja e o checkout num Chromium. O /checkout (http://localhost:8787) é
 * respondido pelo Worker VERDADEIRO (worker/src/index.js), com a rede a fingir
 * do worker/test/palco.mjs: os data/*.json são os da _site, e a Stripe e o
 * Resend são de faz-de-conta. Nada sai para a rede (qualquer outro pedido é
 * recusado e conta como falha).
 *
 * O que prova (decisões do dono de 1 out 2026):
 *   · sem pneus seminovos, a caixa da garantia não aparece e o pedido é o de
 *     sempre;
 *   · com um pneu seminovo de garantia reduzida, a caixa aparece com o texto do
 *     acordo (igual ao que o Worker guarda), é obrigatória — a mensagem aparece
 *     ao pé dela, com aria-invalid, aria-describedby e o foco —, e com ela
 *     marcada o pagamento segue, o acordo fica no retrato da encomenda e os
 *     emails dizem-no;
 *   · com meses diferentes, a garantia de cada artigo; e se o dono os mudar com
 *     a página aberta, o Worker recusa (400) e a página mostra os novos;
 *   · os pneus novos sem a etiqueta UE ficam «Sob consulta» (sem preço e sem
 *     «Adicionar») e o Worker recusa-os;
 *   · os Termos publicados: o §6 novo (18 meses, por acordo; montagem por
 *     terceiros) e o §9 sem foro. */
import { createRequire } from 'node:module';
import http from 'node:http';
import net from 'node:net';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import worker from '../worker/src/index.js';
import * as GW from '../worker/src/garantia.js';
import { kvFalso, redeFalsa, palco, eventos } from '../worker/test/palco.mjs';
import { ENV_HOJE } from '../worker/test/dados.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PY = process.env.PYTHON || 'python3';
if (!process.env.PLAYWRIGHT) {
  console.error('Preciso do Playwright: PLAYWRIGHT=<pasta do playwright> node .github/test-checkout.mjs (ex.: ~/Websites/carimbo/node_modules/playwright)');
  process.exit(2);
}
const pw = createRequire(import.meta.url)(resolve(process.env.PLAYWRIGHT.replace(/^~(?=\/)/, process.env.HOME)));

let passou = 0; let falhou = 0;
const certo = (c, d, extra = '') => {
  if (c) { passou++; console.log(`  ✓ ${d}`); } else { falhou++; console.log(`  ✗ ${d}${extra ? `  — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); }
};
const secao = (t) => console.log(`\n— ${t}`);

/* ---------------------------------------------------------------- a _site */
const TMP = mkdtempSync(join(tmpdir(), 'ap-checkout-'));
const REPO = join(TMP, 'repo');
const SITE = join(TMP, '_site');
const SEMI_CONTI = 'pneu-seminovo-continental-205-55-r16';
const SEMI_GOODYEAR = 'pneu-seminovo-goodyear-195-65-r15';
const MICHELIN = 'michelin-primacy-4';
const JANTE = 'jante-liga-leve-16-5x112-et45';

function construirSite() {
  // A árvore de trabalho (e não o último commit): o que se testa é o que lá está.
  const r = spawnSync('rsync', ['-a', '--exclude', '.git', '--exclude', 'node_modules', '--exclude', '_site', '--exclude', '_source',
    '--exclude', '.wrangler', '--exclude', '__pycache__', `${RAIZ}/`, `${REPO}/`], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`rsync: ${r.stderr}`);
  // Os dois pneus seminovos à venda, com os dados todos: 18 e 24 meses de garantia.
  const caminho = join(REPO, 'data', 'products.json');
  const texto = readFileSync(caminho, 'utf8');
  const doc = JSON.parse(texto);
  const p = (sku) => doc.products.find((x) => x.sku === sku);
  Object.assign(p(SEMI_CONTI), { available: true, dot: '3221', tread_mm: 6, warranty_months: 18 });
  Object.assign(p(SEMI_GOODYEAR), { available: true, dot: '0122', tread_mm: 5.5, warranty_months: 24 });
  writeFileSync(caminho, JSON.stringify(doc, null, 2) + (texto.endsWith('\n') ? '\n' : ''));
  const prep = spawnSync('bash', [join(REPO, '.github', 'preparar-site.sh'), SITE], { cwd: REPO, encoding: 'utf8', env: { ...process.env, PYTHON: PY } });
  if (prep.status !== 0) throw new Error(`preparar-site.sh parou:\n${(prep.stdout + prep.stderr).slice(-2000)}`);
  return prep.stdout;
}

/* ---------------------------------------------------------------- o servidor */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
async function portaLivre(desde = 8891) {
  for (let p = desde; p < 8990; p++) {
    const livre = await new Promise((ok) => { const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))).listen(p, '127.0.0.1'); });
    if (livre) return p;
  }
  throw new Error('nenhuma porta livre entre 8891 e 8989');
}
async function servir(raiz, porta) {
  const srv = http.createServer((q, r) => {
    let rel = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const f = join(raiz, rel);
    if (!f.startsWith(raiz + '/') || !existsSync(f) || !statSync(f).isFile()) {
      r.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return r.end(readFileSync(join(raiz, '404.html')));
    }
    r.writeHead(200, { 'content-type': TIPOS[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    r.end(readFileSync(f));
  });
  await new Promise((ok) => srv.listen(porta, '127.0.0.1', ok));
  return () => new Promise((ok) => { srv.closeAllConnections(); srv.close(ok); });
}

/* ---------------------------------------------------------------- o Worker */
/* Um Worker por cenário: a rede a fingir com os data/*.json da _site (ou o que
   o cenário lá puser), o KV em memória, a Stripe e o Resend de faz-de-conta. */
function novoWorker(origem) {
  const dados = {};
  for (const f of ['products.json', 'settings.json', 'site.json', 'empresa.json']) dados[f] = readFileSync(join(SITE, 'data', f), 'utf8');
  const rede = redeFalsa(dados);
  const kv = kvFalso();
  const env = { ...ENV_HOJE, ALLOWED_ORIGINS: `${ENV_HOJE.ALLOWED_ORIGINS},${origem}` };   // como o `npm run dev` (--var)
  const respostas = [];
  let nIp = 0;
  const responder = async (route) => {
    const q = route.request();
    const antes = globalThis.fetch;
    globalThis.fetch = rede.fetch;
    const [log, error] = [console.log, console.error];
    console.log = () => {}; console.error = () => {};
    try {
      const pendentes = [];
      const res = await worker.fetch(new Request(q.url(), {
        method: q.method(), headers: { ...q.headers(), 'cf-connecting-ip': `10.8.0.${++nIp}` }, body: q.method() === 'POST' ? q.postData() : undefined,
      }), { ...env, ORDERS: kv }, { waitUntil: (p) => pendentes.push(p), passThroughOnException() {} });
      await Promise.all(pendentes);
      const corpo = await res.text();
      respostas.push({ metodo: q.method(), status: res.status, pedido: q.method() === 'POST' ? JSON.parse(q.postData()) : null, corpo: corpo ? JSON.parse(corpo) : null });
      await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: corpo });
    } finally {
      globalThis.fetch = antes;
      [console.log, console.error] = [log, error];
    }
  };
  const encomenda = (id) => JSON.parse(kv.mapa.get(`order:${id}`) || 'null');
  // O pagamento por cartão: o webhook da Stripe, assinado, ao mesmo Worker.
  const pagar = async (r) => {
    const [log, error] = [console.log, console.error];
    console.log = () => {}; console.error = () => {};
    try {
      await palco(worker, { env, kv, rede }).webhook(eventos.sessaoConcluida({ order_id: r.corpo.order_id, sessao: rede.stripe[rede.stripe.length - 1].id, total: r.corpo.total_cents, entrega: r.pedido.entrega }));
    } finally { [console.log, console.error] = [log, error]; }
    return rede.resend;
  };
  return { rede, kv, respostas, responder, encomenda, pagar };
}

/* ---------------------------------------------------------------- o browser */
let browser;
async function novaPagina(base, w, { largura = 1280, altura = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: altura }, locale: 'pt-PT' });
  const fora = [];
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(base)) return route.continue();
    if (u.startsWith('http://localhost:8787/')) return w.responder(route);
    if (u.startsWith('https://checkout.stripe.com/')) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Stripe (ensaio)</title><h1>Página da Stripe (ensaio)</h1>' });
    fora.push(u);
    return route.abort();
  });
  // O aviso de cookies: recusado, como faria quem não quer cookies que não são precisos.
  await ctx.addInitScript(() => { try { localStorage.setItem('ap-consent', 'rejected'); } catch (e) { /* sem armazenamento */ } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  return { ctx, page, fora, erros };
}

/* O carrinho, como o cart.js o grava. */
const noCarrinho = (doc, ...linhas) => linhas.map(([sku, qty = 1]) => {
  const p = doc.products.find((x) => x.sku === sku);
  return { sku, name: p.name, price_cents: Math.round(p.price_eur * 100), image: '', weight: p.weight_kg, stock: p.stock, qty };
});
async function preencher(page) {
  await page.fill('#c-nome', 'Maria Ensaio da Silva');
  await page.fill('#c-tel', '912 000 000');
  await page.fill('#c-email', 'cliente@exemplo.pt');
  await page.check('#c-termos');
}
const sobre = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, visivel: !e.hidden && r.height > 0 }; }, sel);

let fecharServidor = null;
try {
  secao('a _site, construída como o CI a constrói (com os dois pneus seminovos à venda)');
  const saida = construirSite();
  const publicado = JSON.parse(readFileSync(join(SITE, 'data', 'products.json'), 'utf8'));
  const pub = (sku) => publicado.products.find((x) => x.sku === sku);
  certo(pub(SEMI_CONTI).available === true && pub(SEMI_CONTI).warranty_months === 18 && pub(SEMI_GOODYEAR).available === true && pub(SEMI_GOODYEAR).warranty_months === 24,
    'preparar-site.sh: os dois seminovos ficam à venda na cópia publicada (18 e 24 meses), sem nada a neutralizar', saida.slice(-400));
  certo(pub(MICHELIN).available === false, 'e o pneu novo sem a etiqueta UE continua fora de venda');
  const porta = await portaLivre();
  const BASE = `http://localhost:${porta}`;
  fecharServidor = await servir(SITE, porta);
  certo(porta > 8890, `servida em ${BASE}`);
  browser = await pw.chromium.launch();

  /* ============================================================ 1 */
  secao('sem pneus seminovos: tudo como antes');
  {
    const w = novoWorker(BASE);
    const { ctx, page, fora, erros } = await novaPagina(BASE, w);
    await page.goto(`${BASE}/loja.html`);
    await page.evaluate((c) => localStorage.setItem('ap-cart-v2', JSON.stringify(c)), noCarrinho(publicado, [JANTE, 1]));
    await page.goto(`${BASE}/checkout.html`);
    await page.waitForSelector('#co-form:not([hidden])');
    certo(await page.isHidden('#co-garantia'), 'uma jante: a caixa da garantia não aparece');
    await preencher(page);
    await Promise.all([page.waitForURL(/checkout\.stripe\.com/), page.click('#co-submit')]);
    const r = w.respostas.find((x) => x.metodo === 'POST');
    certo(r && r.status === 200 && !('garantia_usados' in r.pedido), 'paga: o pedido não leva garantia nenhuma, e o Worker responde 200', r && r.pedido);
    const o = w.encomenda(r.corpo.order_id);
    certo(o && !('garantia_usados' in o.termos) && !/seminovo/.test(new URLSearchParams(w.rede.stripe[0].corpo).get('custom_text[submit][message]')),
      '   a encomenda sem acordo de garantia, e a página da Stripe sem a frase dos seminovos');
    certo(fora.length === 0 && erros.length === 0, '   nenhum pedido para fora e nenhum erro na consola', [...fora, ...erros]);
    await ctx.close();
  }

  /* ============================================================ 2 */
  secao('um pneu seminovo (18 meses), posto no carrinho pela loja');
  {
    const w = novoWorker(BASE);
    const { ctx, page, fora, erros } = await novaPagina(BASE, w);
    await page.goto(`${BASE}/loja.html`);
    const cartao = page.locator('article.pcard', { hasText: pub(SEMI_CONTI).name });
    await cartao.locator('[data-add]').click();
    await page.goto(`${BASE}/checkout.html`);
    await page.waitForSelector('#co-form:not([hidden])');
    const caixa = page.getByRole('checkbox', { name: /^Aceito que a garantia de conformidade deste pneu seminovo/ });
    const texto = (await page.textContent('#c-garantia-texto')).trim();
    const esperado = GW.garantiaDoCarrinho([{ sku: SEMI_CONTI, nome: pub(SEMI_CONTI).name, meses: 18, qty: 1 }]).texto;
    certo(await page.isVisible('#co-garantia') && texto === esperado, 'a caixa aparece, com o texto do acordo', texto);
    certo(await caixa.count() === 1 && !(await caixa.isChecked()), '   é uma caixa com a etiqueta ligada (o nome dela é o texto), por marcar');
    await preencher(page);
    await page.click('#co-submit');
    await page.waitForSelector('#co-error:not([hidden])');
    const msg = (await page.textContent('#co-error')).trim();
    const at = await page.evaluate(() => { const c = document.getElementById('c-garantia'); return { invalid: c.getAttribute('aria-invalid'), desc: c.getAttribute('aria-describedby'), foco: document.activeElement && document.activeElement.id }; });
    certo(!w.respostas.some((x) => x.metodo === 'POST') && /confirme na caixa acima que aceita a garantia do pneu seminovo/.test(msg),
      'sem a caixa marcada, não paga (nada vai para o Worker) e diz porquê', msg);
    certo(at.invalid === 'true' && at.desc === 'co-error' && at.foco === 'c-garantia', '   aria-invalid, aria-describedby para a mensagem, e o foco na caixa', at);
    const [cx, er] = [await sobre(page, '#co-garantia'), await sobre(page, '#co-error')];
    certo(er.visivel && er.top >= cx.bottom && er.top - cx.bottom < 40, `   a mensagem aparece logo por baixo da caixa (${Math.round(er.top - cx.bottom)} px)`, { cx, er });
    await page.click('#c-garantia-texto');   // carregar no texto marca a caixa: a etiqueta está ligada
    certo(await caixa.isChecked(), '   carregar no texto marca a caixa');
    await Promise.all([page.waitForURL(/checkout\.stripe\.com/), page.click('#co-submit')]);
    const r = w.respostas.find((x) => x.metodo === 'POST');
    certo(r.status === 200 && JSON.stringify(r.pedido.garantia_usados) === JSON.stringify({ aceita: true, versao: GW.GARANTIA_VERSAO, artigos: [{ sku: SEMI_CONTI, meses: 18 }] }),
      'marcada: segue para a Stripe, e o pedido leva a aceitação', r.pedido.garantia_usados);
    const o = w.encomenda(r.corpo.order_id);
    certo(JSON.stringify(o.termos.garantia_usados) === JSON.stringify({ versao: GW.GARANTIA_VERSAO, texto, artigos: [{ sku: SEMI_CONTI, nome: pub(SEMI_CONTI).name, meses: 18 }] }),
      '   o retrato da encomenda guarda o acordo com o MESMO texto que a página mostrou', o.termos.garantia_usados);
    const msgStripe = new URLSearchParams(w.rede.stripe[0].corpo).get('custom_text[submit][message]');
    certo(msgStripe.endsWith(' Inclui um pneu seminovo (bem usado) com a garantia reduzida que aceitou: 18 meses.'), '   e a página da Stripe leva a frase da garantia', msgStripe);
    const emails = await w.pagar(r);
    const conf = emails.find((m) => /confirmada/.test(m.subject));
    const dono = emails.find((m) => /^\[Loja\]/.test(m.subject));
    const linha = `${pub(SEMI_CONTI).name} — 18 meses`;
    certo(conf && conf.text.includes(`    ${linha}`) && conf.html.includes(`${pub(SEMI_CONTI).name} — <strong>18 meses</strong>`) && dono && dono.text.includes(`  ${linha}`),
      'pago: a confirmação (texto e html) e o aviso ao dono dizem a garantia acordada do artigo');
    certo(fora.length === 0 && erros.length === 0, '   nenhum pedido para fora e nenhum erro na consola', [...fora, ...erros]);
    await ctx.close();
  }

  /* ============================================================ 3 */
  secao('dois pneus seminovos com meses diferentes (18 e 24), no telemóvel');
  {
    const w = novoWorker(BASE);
    const { ctx, page, fora, erros } = await novaPagina(BASE, w, { largura: 375, altura: 812 });
    await page.goto(`${BASE}/loja.html`);
    await page.evaluate((c) => localStorage.setItem('ap-cart-v2', JSON.stringify(c)), noCarrinho(publicado, [SEMI_CONTI, 1], [SEMI_GOODYEAR, 1], [JANTE, 1]));
    await page.goto(`${BASE}/checkout.html`);
    await page.waitForSelector('#co-form:not([hidden])');
    const texto = (await page.textContent('#c-garantia-texto')).trim();
    certo(texto === `Aceito que a garantia de conformidade destes pneus seminovos, por serem bens usados, é a indicada a seguir, em vez de 3 anos (DL n.º 84/2021, art. 12.º): ${pub(SEMI_CONTI).name} — 18 meses; ${pub(SEMI_GOODYEAR).name} — 24 meses.`,
      'a caixa diz a garantia de cada artigo', texto);
    await preencher(page);
    await page.click('#co-submit');
    await page.waitForSelector('#co-error:not([hidden])');
    certo(/garantia dos pneus seminovos/.test(await page.textContent('#co-error')) && await page.evaluate(() => document.activeElement.id) === 'c-garantia',
      '   sem a caixa marcada: a mensagem (no plural) e o foco na caixa');
    const largura = await page.evaluate(() => document.documentElement.scrollWidth);
    certo(largura <= 375, `   no telemóvel, sem deslocamento para o lado (${largura} px)`);
    await page.check('#c-garantia');
    await Promise.all([page.waitForURL(/checkout\.stripe\.com/), page.click('#co-submit')]);
    const r = w.respostas.find((x) => x.metodo === 'POST' && x.status === 200);
    const o = w.encomenda(r.corpo.order_id);
    certo(JSON.stringify(o.termos.garantia_usados.artigos) === JSON.stringify([{ sku: SEMI_CONTI, nome: pub(SEMI_CONTI).name, meses: 18 }, { sku: SEMI_GOODYEAR, nome: pub(SEMI_GOODYEAR).name, meses: 24 }]) && o.termos.garantia_usados.texto === texto,
      'paga: o retrato tem os dois artigos, cada um com os seus meses, e o texto que a página mostrou');
    certo(new URLSearchParams(w.rede.stripe[0].corpo).get('custom_text[submit][message]').endsWith('aceitou: de 18 a 24 meses, conforme o pneu.'), '   e a Stripe diz «de 18 a 24 meses»');
    certo(fora.length === 0 && erros.length === 0, '   nenhum pedido para fora e nenhum erro na consola', [...fora, ...erros]);
    await ctx.close();
  }

  /* ============================================================ 4 */
  secao('o dono muda a garantia com a página aberta: o Worker recusa (400) e a página mostra a nova');
  {
    const w = novoWorker(BASE);
    const { ctx, page, fora, erros } = await novaPagina(BASE, w);
    await page.goto(`${BASE}/loja.html`);
    await page.evaluate((c) => localStorage.setItem('ap-cart-v2', JSON.stringify(c)), noCarrinho(publicado, [SEMI_CONTI, 1]));
    await page.goto(`${BASE}/checkout.html`);
    await page.waitForSelector('#co-form:not([hidden])');
    // O products.json que o Worker lê passa a dizer 24 meses (a página leu 18).
    const mudado = JSON.parse(w.rede.dados['products.json']);
    mudado.products.find((x) => x.sku === SEMI_CONTI).warranty_months = 24;
    w.rede.dados['products.json'] = JSON.stringify(mudado);
    await preencher(page);
    await page.check('#c-garantia');
    await page.click('#co-submit');
    await page.waitForFunction(() => /24 meses/.test(document.getElementById('c-garantia-texto').textContent));
    const r1 = w.respostas.find((x) => x.metodo === 'POST');
    const texto = (await page.textContent('#c-garantia-texto')).trim();
    certo(r1.status === 400 && r1.corpo.codigo === GW.CODIGO_GARANTIA && texto === r1.corpo.garantia_usados.texto && /é de 24 meses/.test(texto),
      'o Worker responde 400 com o código, e a caixa passa a mostrar o texto dele (24 meses)', texto);
    certo(!(await page.isChecked('#c-garantia')) && (await page.textContent('#co-error')).includes('24 meses') && await page.evaluate(() => document.activeElement.id) === 'c-garantia' && !/stripe/.test(page.url()),
      '   por marcar, com a mensagem do Worker e o foco na caixa — e não foi para a Stripe');
    await page.check('#c-garantia');
    await Promise.all([page.waitForURL(/checkout\.stripe\.com/), page.click('#co-submit')]);
    const r2 = w.respostas.filter((x) => x.metodo === 'POST')[1];
    certo(r2.status === 200 && r2.pedido.garantia_usados.artigos[0].meses === 24 && w.encomenda(r2.corpo.order_id).termos.garantia_usados.texto === texto,
      '   marcada outra vez: paga, e fica guardado o acordo dos 24 meses, com o texto que a página mostrou');
    // O Chromium escreve na consola a resposta 400 — é a deste cenário, e só essa.
    const outros = erros.filter((e) => !/responded with a status of 400/.test(e));
    certo(fora.length === 0 && outros.length === 0 && erros.length === 1, '   nenhum pedido para fora, e na consola só o aviso do Chromium sobre o 400', [...fora, ...erros]);
    await ctx.close();
  }

  /* ============================================================ 5 */
  secao('os pneus novos sem a etiqueta UE: «Sob consulta» (decisão de 1 out 2026 — já era assim)');
  {
    const w = novoWorker(BASE);
    const { ctx, page, fora } = await novaPagina(BASE, w);
    await page.goto(`${BASE}/loja.html`);
    const cartao = page.locator('article.pcard', { hasText: pub(MICHELIN).name });
    await cartao.waitFor();
    const preco = (await cartao.locator('.pcard__price').textContent()).trim();
    certo(preco === 'Sob consulta' && await cartao.locator('[data-add]').count() === 0 && await cartao.locator('.pcard__label').count() === 0,
      `${pub(MICHELIN).name}: «Sob consulta», sem preço, sem «Adicionar» e sem letras soltas da etiqueta`, preco);
    const novos = await page.$$eval('article.pcard', (as) => as.filter((a) => a.getAttribute('data-cat') === 'Pneus Novos').map((a) => [a.querySelector('.pcard__price').textContent.trim(), !!a.querySelector('[data-add]')]));
    certo(novos.length === 11 && novos.every(([p, add]) => p === 'Sob consulta' && !add), `   os ${novos.length} pneus novos da loja estão todos assim`, novos);
    // Um carrinho forjado com o pneu: o Worker recusa-o (fora de venda na cópia publicada).
    await page.evaluate((c) => localStorage.setItem('ap-cart-v2', JSON.stringify(c)), noCarrinho(publicado, [MICHELIN, 1]));
    await page.goto(`${BASE}/checkout.html`);
    await page.waitForSelector('#co-removed:not([hidden])');
    certo(/deixou de estar disponível/.test(await page.textContent('#co-removed')), '   num carrinho, o checkout tira-o («deixou de estar disponível»)');
    const corpo = { items: [{ sku: MICHELIN, qty: 1 }], entrega: 'loja', nome: 'Maria Ensaio', email: 'cliente@exemplo.pt', telefone: '912000000', aceita_termos: true };
    const r = await page.evaluate(async (b) => { const x = await fetch('http://localhost:8787/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: x.status, d: await x.json() }; }, corpo);
    certo(r.status === 400 && /já não está disponível/.test(r.d.error), '   e um pedido forjado ao Worker é recusado (400)', r);
    certo(fora.length === 0, '   nenhum pedido para fora', fora);
    await ctx.close();
  }

  /* ============================================================ 6 */
  secao('os Termos publicados (§6 e §9)');
  {
    const w = novoWorker(BASE);
    const { ctx, page, fora, erros } = await novaPagina(BASE, w);
    await page.goto(`${BASE}/legal/termos.html`);
    const s6 = await page.locator('h2:has-text("6. Garantia") + p').textContent();
    const s9 = await page.locator('h2:has-text("9. Lei aplicável") + p').textContent();
    certo(/3 anos para os bens novos/.test(s6) && /nunca inferior a 18 meses/.test(s6) && /aceite expressamente pelo cliente antes de concluir a compra/.test(s6) && /art\. 12\.º do DL n\.º 84\/2021/.test(s6),
      '§6: 3 anos nos novos; nos seminovos o prazo de cada artigo, nunca menos de 18 meses, aceite antes da compra (art. 12.º)', s6);
    certo(/montagem indevida feita por terceiros/.test(s6) && !/segunda mão/.test(s6), '   e «montagem indevida feita por terceiros»', s6);
    certo(s9.trim() === 'Aos presentes termos aplica-se a lei portuguesa, sem prejuízo das normas imperativas de proteção do consumidor.', '§9: a lei portuguesa, sem foro', s9);
    const tudo = await page.textContent('body');
    certo(!/comarca|tribunais/i.test(tudo), '   e nenhuma «comarca» nem «tribunais» na página');
    certo(fora.length === 0 && erros.length === 0, '   nenhum pedido para fora e nenhum erro na consola', [...fora, ...erros]);
    await ctx.close();
  }
} catch (e) {
  certo(false, 'a bateria correu até ao fim', String(e && e.stack || e).slice(0, 1500));
} finally {
  if (browser) await browser.close();
  if (fecharServidor) await fecharServidor();
  rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou ? 1 : 0);
