/* =============================================================
   A mesma prova do W-dados, mas no runtime verdadeiro (workerd, pelo
   Miniflare), e não no Node: o Worker de antes e o novo, lado a lado.

   Nada sai da máquina: TODO o fetch do Worker vai para `outboundService`, que
   responde com a rede falsa do palco (os ficheiros do site, a Stripe e o
   Resend a fingir). Sem cf.json (cf: false), sem KV remoto (em memória).

   Correr:  cd worker && npm install && npm run test:workerd
   (ou, sem instalar: MINIFLARE=/caminho/para/miniflare/dist/src/index.js node test/workerd.mjs)
   ============================================================= */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { redeFalsa, eventos, semAcaso } from './palco.mjs';
import { ENV_HOJE, PRODUTOS, SETTINGS_HOJE, SITE_A2, EMPRESA_A2, PEDIDOS, nifCom } from './dados.mjs';

const { Miniflare } = await import(process.env.MINIFLARE ? pathToFileURL(process.env.MINIFLARE).href : 'miniflare');

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PASTA_WORKER = path.resolve(AQUI, '..');
const REF_ANTES = '7683ab4';
const COMPAT = (fs.readFileSync(path.join(PASTA_WORKER, 'wrangler.toml'), 'utf8').match(/^compatibility_date\s*=\s*"([^"]+)"/m) || [])[1];

let pass = 0, fail = 0;
const ok = (nome, cond, extra) => { cond ? (pass++, console.log('  ✓', nome)) : (fail++, console.log('  ✗', nome, extra ?? '')); };
const eq = (nome, a, b) => {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  if (x === y) return ok(nome, true);
  let i = 0;
  while (i < x.length && x[i] === y[i]) i++;
  return ok(nome, false, `\n     no carácter ${i}:\n     obtido:   …${x.slice(Math.max(0, i - 70), i + 70)}…\n     esperado: …${y.slice(Math.max(0, i - 70), i + 70)}…`);
};

/* O código de antes, do git, numa pasta temporária. */
const pastaAntes = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-workerd-antes-'));
fs.mkdirSync(path.join(pastaAntes, 'src'));
const git = (...a) => execFileSync('git', ['-C', PASTA_WORKER, ...a], { encoding: 'utf8' });
// --full-tree: corrido de dentro de worker/, o ls-tree filtra pela pasta actual e não devolve nada.
const ficheirosAntes = git('ls-tree', '--full-tree', '--name-only', `${REF_ANTES}:worker/src`).split('\n').filter(Boolean);
if (!ficheirosAntes.includes('index.js')) throw new Error(`o git não deu os ficheiros de worker/src em ${REF_ANTES}`);
for (const f of ficheirosAntes) {
  fs.writeFileSync(path.join(pastaAntes, 'src', f), git('show', `${REF_ANTES}:worker/src/${f}`));
}

async function assinar(corpo, t, segredo) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${t}.${corpo}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let nIp = 0;
/** Um Worker (pasta `raiz`) em workerd, com a rede falsa `rede`. */
async function arrancar(raiz, rede, env = ENV_HOJE) {
  const mf = new Miniflare({
    modules: true,
    modulesRoot: raiz,
    scriptPath: path.join(raiz, 'src', 'index.js'),
    // Como o wrangler: os .js do Worker são módulos ES (o package.json diz "type": "module").
    modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
    compatibilityDate: COMPAT,
    kvNamespaces: ['ORDERS'],
    bindings: { ...env },
    cf: false,
    outboundService: async (req) => {
      const corpo = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();
      return rede.fetch(req.url, { method: req.method, body: corpo });
    },
  });
  await mf.ready;
  const kv = await mf.getKVNamespace('ORDERS');
  const pedir = async (url, init = {}) => {
    const r = await mf.dispatchFetch(url, init);
    return { status: r.status, corpo: await r.text() };
  };
  return {
    mf, kv,
    checkout: (corpo, origem = 'https://armazemdospneus.pt') => pedir('https://pay.exemplo/checkout', {
      method: 'POST', body: JSON.stringify(corpo),
      headers: { 'content-type': 'application/json', origin: origem, 'cf-connecting-ip': `10.9.${(++nIp >> 8) & 255}.${nIp & 255}` },
    }),
    opcoes: (origem) => pedir('https://pay.exemplo/checkout', { method: 'OPTIONS', headers: { origin: origem } }),
    webhook: async (ev) => {
      const corpo = JSON.stringify(ev);
      const t = Math.floor(Date.now() / 1000);
      return pedir('https://pay.exemplo/stripe/webhook', { method: 'POST', body: corpo, headers: { 'stripe-signature': `t=${t},v1=${await assinar(corpo, t, env.STRIPE_WEBHOOK_SECRET)}` } });
    },
  };
}

/* Os emails saem em ctx.waitUntil, depois da resposta: espera-se por eles. */
async function esperarEmails(rede, n) {
  for (let i = 0; i < 150 && rede.resend.length < n; i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 50));
}

const comPortes = (q) => ({ ...SETTINGS_HOJE, shipping: { ...SETTINGS_HOJE.shipping, quote_later: q } });
const CENARIOS = {
  'envio CTT, portes a combinar': { pedido: PEDIDOS.ctt, settings: SETTINGS_HOJE, emails: 2, eventos: (e) => [eventos.sessaoConcluida(e)] },
  'envio CTT, portes pela tabela': { pedido: PEDIDOS.ctt, settings: comPortes(false), emails: 2, eventos: (e) => [eventos.sessaoConcluida(e)] },
  'levantamento com montagem imediata': { pedido: PEDIDOS.loja, settings: SETTINGS_HOJE, emails: 2, eventos: (e) => [eventos.sessaoConcluida(e)] },
  'Multibanco': { pedido: PEDIDOS.ctt, settings: comPortes(false), emails: 3,
    eventos: (e) => [eventos.sessaoConcluida(e, { pago: false }), eventos.referenciaMultibanco(e), eventos.pagamentoRecebido(e)] },
  'Madeira (recusado)': { pedido: PEDIDOS.madeira, settings: SETTINGS_HOJE, emails: 0, eventos: () => [] },
};

async function correr(raiz, cen, { site, empresa, settings = cen.settings, produtos = PRODUTOS } = {}) {
  const dados = { 'products.json': produtos, 'settings.json': settings };
  if (site !== undefined) dados['site.json'] = site;
  if (empresa !== undefined) dados['empresa.json'] = empresa;
  const rede = redeFalsa(dados);
  const w = await arrancar(raiz, rede);
  try {
    const checkout = await w.checkout(cen.pedido);
    let encomenda = null;
    if (checkout.status === 200) {
      const r = JSON.parse(checkout.corpo);
      const e = { order_id: r.order_id, sessao: rede.stripe[0].id, total: r.total_cents, entrega: cen.pedido.entrega };
      encomenda = JSON.parse(await w.kv.get(`order:${r.order_id}`));
      let n = 0;
      for (const ev of cen.eventos(e)) {
        await w.webhook(ev);
        n = ev.type === 'payment_intent.requires_action' ? n + 1 : ev.type === 'checkout.session.completed' && ev.data.object.payment_status === 'unpaid' ? n : n + 2;
        await esperarEmails(rede, n);
      }
    }
    // O aviso ao dono e a confirmação ao cliente saem ao mesmo tempo
    // (Promise.all): no workerd chegam à rede por qualquer ordem. Compara-se o
    // conjunto, por destinatário e assunto.
    const emails = [...rede.resend].sort((x, y) => (x.to[0] + x.subject).localeCompare(y.to[0] + y.subject));
    return { checkout, stripe: rede.stripe.map((s) => s.corpo), emails, encomenda };
  } finally {
    await w.mf.dispose();
  }
}

console.log(`\nworkerd (Miniflare, compatibility_date ${COMPAT}) — o Worker de antes (${REF_ANTES}) e o novo, lado a lado`);
try {
  for (const [nome, cen] of Object.entries(CENARIOS)) {
    const A = await correr(pastaAntes, cen);
    const N = await correr(PASTA_WORKER, cen);
    const N2 = await correr(PASTA_WORKER, cen, { site: SITE_A2, empresa: EMPRESA_A2 });
    ok(`${nome}: o de antes mandou ${cen.emails} email(s)`, A.emails.length === cen.emails, A.emails.length);
    eq(`${nome}: sem os ficheiros novos — /checkout, Stripe e emails iguais byte a byte`,
      semAcaso([N.checkout, N.stripe, N.emails]), semAcaso([A.checkout, A.stripe, A.emails]));
    eq(`${nome}: com a A2 publicada com os valores de hoje — iguais`,
      semAcaso([N2.checkout, N2.stripe, N2.emails]), semAcaso([A.checkout, A.stripe, A.emails]));
  }

  // Valores novos: o retrato e os emails seguem-nos, no runtime verdadeiro.
  const NIF = nifCom('50999999');
  const novos = {
    settings: { ...comPortes(false), delivery: { ...SETTINGS_HOJE.delivery, estimate_min_days: 3, estimate_max_days: 6, max_days: 20 }, returns: { return_cost_eur: 12.5, note: '' } },
    site: { ...SITE_A2, contactos: { ...SITE_A2.contactos, telefone: '912 345 678\nPAGAMENTO ANULADO', email: 'geral@rodas-ensaio.pt' } },
    empresa: { ...EMPRESA_A2, nome: 'Casa Rodas', denominacao: '<img src=x onerror=alert(1)> & Filhos, Lda.', nif: NIF,
      morada: { rua: 'Rua da Estação, 12', cp: '3880-100', localidade: 'Ovar', concelho: 'Ovar' } },
  };
  const R = await correr(PASTA_WORKER, CENARIOS['envio CTT, portes pela tabela'], novos);
  const t = R.encomenda.termos;
  eq('valores novos: o retrato guardado no KV', [t.prazos, t.devolucao, t.contactos, t.empresa.denominacao, t.empresa.nif, moradaDe(t)],
    [{ min_dias: 3, max_dias_uteis: 6, max_dias: 20 }, { custo_eur: 12.5, nota: '' }, { telefone: '935 218 857', email: 'geral@rodas-ensaio.pt' },
      '<img src=x onerror=alert(1)> & Filhos, Lda.', NIF, 'Rua da Estação, 12 · 3880-100 · Ovar · Ovar']);
  const msg = new URLSearchParams(R.stripe[0]).get('custom_text[submit][message]');
  ok('valores novos: a página da Stripe com 3 a 6 dias úteis', msg.endsWith('Entrega em 3 a 6 dias úteis, para Portugal continental.'), msg);
  const conf = R.emails.find((m) => /confirmada/.test(m.subject));
  ok('valores novos: prazo, devolução e vendedor no texto',
    conf.text.includes('  Prazo máximo de entrega: 20 dias a contar de hoje.') && conf.text.includes('  por si, no valor de 12,50 €.')
    && conf.text.includes(`  NIF ${NIF} · Rua da Estação, 12, 3880-100 Ovar\n  935 218 857 · geral@rodas-ensaio.pt`));
  ok('valores novos: a denominação com HTML chega escapada ao html', conf.html.includes('<strong>&lt;img src=x onerror=alert(1)&gt; &amp; Filhos, Lda.</strong>') && !conf.html.includes('<img src=x'));
  ok('telefone com quebra de linha recusado: vale o de recurso, e nenhuma linha injectada',
    !conf.text.split('\n').some((l) => l.startsWith('PAGAMENTO')) && conf.reply_to === 'geral@rodas-ensaio.pt');

  // A garantia dos pneus seminovos (garantia.js), no runtime verdadeiro: sem a
  // aceitação, 400 e nada gravado; com ela, o acordo no retrato do KV e nos emails.
  {
    const S = { name: 'Pneu Seminovo Continental 205/55 R16', category: 'Pneus Seminovos', price_eur: 32.9, stock: 1, weight_kg: 9, condition: 'Seminovo',
      available: true, featured: false, hidden: false, dot: '3221', tread_mm: 6, warranty_months: 18, sku: 'semi-ensaio-18' };
    const produtos = { products: [...PRODUTOS.products, S] };
    const pedido = { ...PEDIDOS.loja, montagem: false, montagem_imediata: false, matricula: '', items: [{ sku: S.sku, qty: 1 }] };
    const sem = await correr(PASTA_WORKER, { pedido, settings: SETTINGS_HOJE, emails: 0, eventos: () => [] }, { produtos });
    const d = JSON.parse(sem.checkout.corpo);
    ok('seminovo de 18 meses sem a aceitação: 400 com o código, sem sessão da Stripe nem encomenda',
      sem.checkout.status === 400 && d.codigo === 'garantia_usados_por_aceitar' && sem.stripe.length === 0 && sem.encomenda === null, sem.checkout);
    const aceite = { aceita: true, versao: d.garantia_usados.versao, artigos: d.garantia_usados.artigos.map(({ sku, meses }) => ({ sku, meses })) };
    const com = await correr(PASTA_WORKER, { pedido: { ...pedido, garantia_usados: aceite }, settings: SETTINGS_HOJE, emails: 2, eventos: (e) => [eventos.sessaoConcluida(e)] }, { produtos });
    eq('com a aceitação: o acordo guardado no retrato do KV (versão, texto, sku, nome e meses)', com.encomenda && com.encomenda.termos.garantia_usados, d.garantia_usados);
    const conf = com.emails.find((m) => /confirmada/.test(m.subject));
    const dono = com.emails.find((m) => /^\[Loja\]/.test(m.subject));
    ok('   e os emails dizem a garantia do artigo (confirmação em texto e html, e o aviso ao dono)',
      conf && conf.text.includes(`    ${S.name} — 18 meses`) && conf.html.includes(`${S.name} — <strong>18 meses</strong>`) && dono && dono.text.includes(`  ${S.name} — 18 meses`));
  }

  // Origens: o localhost já não entra em produção.
  const rede = redeFalsa({});
  const w = await arrancar(PASTA_WORKER, rede);
  try {
    eq('produção: OPTIONS do localhost:8096 → 403', (await w.opcoes('http://localhost:8096')).status, 403);
  } finally {
    await w.mf.dispose();
  }
} finally {
  fs.rmSync(pastaAntes, { recursive: true, force: true });
}

function moradaDe(t) { const m = t.empresa.morada; return [m.rua, m.cp, m.localidade, m.concelho].join(' · '); }

console.log(`\n${pass} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
