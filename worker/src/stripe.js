/* =============================================================
   ARMAZÉM DOS PNEUS — cliente Stripe mínimo para Cloudflare Workers
   -------------------------------------------------------------
   Fala com a REST API por fetch(), sem o SDK npm. Razões:
     · o site não tem package.json nem passo de build;
     · a verificação de assinatura de webhooks no SDK obriga a
       constructEventAsync com um SubtleCryptoProvider — aqui fazemos o
       HMAC diretamente com crypto.subtle, que é ~40 linhas.
   ============================================================= */

const API = 'https://api.stripe.com/v1';

/* ---------- Codificação form-urlencoded aninhada ----------
   A Stripe não aceita JSON. Espera chaves como
     line_items[0][price_data][product_data][name]=Michelin
     expand[]=payment_intent
   Arrays de escalares usam [] (expand); arrays de objetos usam índices. */
export function formEncode(obj, prefix, out) {
  out = out || [];
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val === undefined || val === null || val === '') continue;
    const path = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(val)) {
      val.forEach((v, i) => {
        if (v !== null && typeof v === 'object') formEncode(v, `${path}[${i}]`, out);
        else out.push(`${encodeURIComponent(path + '[]')}=${encodeURIComponent(v)}`);
      });
    } else if (typeof val === 'object') {
      formEncode(val, path, out);
    } else {
      out.push(`${encodeURIComponent(path)}=${encodeURIComponent(val)}`);
    }
  }
  return out.join('&');
}

/* ---------- Chamada à API ---------- */
export async function stripeFetch(env, path, { method = 'POST', body, idempotencyKey } = {}) {
  // trim() defensivo: um espaço ou newline colado com a chave produz um 401
  // indistinguível de "chave revogada", e é um erro fácil de cometer ao copiar.
  const headers = {
    Authorization: `Bearer ${String(env.STRIPE_RESTRICTED_KEY || '').trim()}`,
    'Stripe-Version': env.STRIPE_API_VERSION,
  };
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  // Só protege POSTs; num GET a Stripe ignora o header.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(`${API}${path}`, { method, headers, body: body ? formEncode(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.stripeCode = data && data.error && data.error.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- Verificação de assinatura de webhook ----------
   Header: Stripe-Signature: t=1699999999,v1=<hex>,v1=<hex>
   assinado = HMAC-SHA256(`${t}.${corpoCru}`, whsec)
   O corpo TEM de ser o texto cru, byte a byte. Se for reserializado a
   partir de JSON.parse a assinatura nunca bate. */
const TOLERANCE_SECONDS = 300;

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyStripeSignature(rawBody, sigHeader, secret, nowSeconds) {
  if (!sigHeader) throw new Error('assinatura ausente');

  let timestamp = null;
  const signatures = [];
  for (const part of sigHeader.split(',')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === 't') timestamp = v;
    else if (k === 'v1') signatures.push(v);
  }
  if (!timestamp || !signatures.length) throw new Error('assinatura malformada');

  // Rejeita eventos antigos (proteção contra replay).
  const age = Math.abs(nowSeconds - parseInt(timestamp, 10));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) throw new Error('timestamp fora da tolerância');

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));

  if (!signatures.some((s) => timingSafeEqual(s, mac))) throw new Error('assinatura inválida');
  return JSON.parse(rawBody);
}
