/* =============================================================
   ARMAZÉM DOS PNEUS — Cloudflare Worker (pagamentos ifthenpay)
   -------------------------------------------------------------
   Cria pagamentos MB WAY / Multibanco e recebe o callback do ifthenpay.
   Os preços são SEMPRE revalidados no servidor a partir de products.json
   (o cliente nunca decide o valor a pagar).

   SEGREDOS (definir no Cloudflare, NUNCA no repositório):
     IFT_MBWAY_KEY        — chave MB WAY do ifthenpay
     IFT_MB_KEY           — chave Multibanco do ifthenpay
     IFT_ANTIPHISHING     — chave anti-phishing (valida o callback)
   VARIÁVEIS (wrangler.toml):
     SITE_ORIGIN          — ex.: https://renatovalente5.github.io
     PRODUCTS_URL         — ex.: https://renatovalente5.github.io/ArmazemDosPneus/data/products.json
   ============================================================= */

const IFT = {
  mbway: 'https://api.ifthenpay.com/spg/payment/mbway',
  multibanco: 'https://api.ifthenpay.com/multibanco/reference/init',
};

function cors(origin, allow) {
  const o = (allow && origin === allow) ? origin : (allow || '*');
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) });
}
function parsePrice(s) {
  const m = String(s || '').replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
  const n = parseFloat(m); return isNaN(n) ? 0 : n;
}

// Revalida o carrinho contra products.json (fonte da verdade) e devolve o total.
async function authoritativeTotal(env, cartItems) {
  const res = await fetch(env.PRODUCTS_URL, { cf: { cacheTtl: 60 } });
  if (!res.ok) throw new Error('products fetch failed');
  const data = await res.json();
  const byName = {};
  (data.products || []).forEach((p) => { byName[p.name.trim().toLowerCase()] = { price: parsePrice(p.price), available: p.available !== false }; });
  let total = 0; const lines = [];
  for (const it of cartItems) {
    const ref = byName[String(it.name || '').trim().toLowerCase()];
    if (!ref) throw new Error('produto inválido: ' + it.name);
    if (!ref.available) throw new Error('produto indisponível: ' + it.name);
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    total += ref.price * qty;
    lines.push({ name: it.name, qty, price: ref.price });
  }
  return { total: Math.round(total * 100) / 100, lines };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const ch = cors(origin, env.SITE_ORIGIN);

    if (request.method === 'OPTIONS') return new Response(null, { headers: ch });

    // ---- Callback do ifthenpay (confirmação de pagamento) ----
    if (url.pathname === '/callback') {
      if (url.searchParams.get('key') !== env.IFT_ANTIPHISHING) return new Response('forbidden', { status: 403 });
      // Aqui pode registar/encaminhar a confirmação (ex.: enviar email/webhook para a loja).
      // O pagamento fica também visível no backoffice do ifthenpay.
      console.log('ifthenpay callback', Object.fromEntries(url.searchParams));
      return new Response('OK'); // o ifthenpay espera "OK"
    }

    if (request.method !== 'POST') return json({ error: 'method' }, 405, ch);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'json' }, 400, ch); }
    const items = Array.isArray(body.items) ? body.items : [];
    const shipping = Math.max(0, parseFloat(body.shipping) || 0);
    if (!items.length) return json({ error: 'carrinho vazio' }, 400, ch);

    let calc;
    try { calc = await authoritativeTotal(env, items); }
    catch (e) { return json({ error: String(e.message || e) }, 400, ch); }
    const amount = (calc.total + shipping).toFixed(2);
    const orderId = 'AP' + Date.now();

    // ---- MB WAY ----
    if (url.pathname === '/create-mbway') {
      const phone = String(body.phone || '').replace(/\s/g, '');
      const r = await fetch(IFT.mbway, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mbWayKey: env.IFT_MBWAY_KEY, orderId, amount, mobileNumber: '351#' + phone, email: body.email || '', description: 'Armazém dos Pneus ' + orderId }),
      });
      const data = await r.json().catch(() => ({}));
      return json({ orderId, amount, provider: 'mbway', result: data }, 200, ch);
    }

    // ---- Multibanco (referência) ----
    if (url.pathname === '/create-multibanco') {
      const r = await fetch(IFT.multibanco, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mbKey: env.IFT_MB_KEY, orderId, amount, description: 'Armazém dos Pneus ' + orderId }),
      });
      const data = await r.json().catch(() => ({}));
      return json({ orderId, amount, provider: 'multibanco', result: data }, 200, ch);
    }

    return json({ error: 'rota desconhecida' }, 404, ch);
  },
};
