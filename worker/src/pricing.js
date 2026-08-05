/* =============================================================
   ARMAZÉM DOS PNEUS — cálculo autoritativo do valor a cobrar
   -------------------------------------------------------------
   O browser envia APENAS { sku, qty }. Todos os preços, pesos e portes são
   lidos aqui, do lado do servidor, a partir dos mesmos data/*.json que o
   cliente edita no backoffice. O carrinho nunca decide quanto se paga.

   Tudo em CÊNTIMOS INTEIROS: 0.1 + 0.2 !== 0.3 em ponto flutuante, e um
   erro de um cêntimo num total é uma discrepância contabilística real.
   ============================================================= */

export const MAX_LINES = 20;
export const MAX_QTY_PER_LINE = 8;

function eurToCents(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

async function loadJson(url) {
  // cacheTtl curto: o cliente muda preços no backoffice e o deploy do
  // GitHub Pages é quase imediato; 60 s evita martelar o Pages a cada compra.
  const res = await fetch(url, { cf: { cacheTtl: 60, cacheEverything: true } });
  if (!res.ok) throw new Error(`não foi possível ler ${url} (HTTP ${res.status})`);
  return res.json();
}

/** Escalão de portes por peso total, a partir de data/settings.json. */
export function shippingTierCents(weightKg, settings) {
  const tiers = ((settings && settings.shipping && settings.shipping.tiers) || [])
    .map((t) => ({ max_kg: Number(t.max_kg), cents: eurToCents(t.price) }))
    .filter((t) => Number.isFinite(t.max_kg))
    .sort((a, b) => a.max_kg - b.max_kg);
  if (!tiers.length) throw new Error('tabela de portes não configurada');
  for (const t of tiers) if (weightKg <= t.max_kg) return t.cents;
  return tiers[tiers.length - 1].cents;   // acima do último escalão: o mais caro
}

/**
 * Revalida o carrinho e devolve o que se vai cobrar.
 * Lança Error com mensagem apresentável ao cliente em caso de problema.
 */
export async function priceOrder(env, rawItems, delivery) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new Error('O carrinho está vazio.');
  if (rawItems.length > MAX_LINES) throw new Error('Demasiados artigos diferentes na encomenda.');

  const [catalog, settings] = await Promise.all([
    loadJson(env.PRODUCTS_URL),
    loadJson(env.SETTINGS_URL),
  ]);

  const bySku = new Map();
  for (const p of (catalog.products || [])) {
    if (p && p.sku) bySku.set(String(p.sku), p);
  }

  const lines = [];
  let subtotalCents = 0;
  let weightKg = 0;
  const seen = new Set();

  for (const raw of rawItems) {
    const sku = String((raw && raw.sku) || '').trim();
    if (!sku) throw new Error('Artigo sem identificação.');
    if (seen.has(sku)) throw new Error('Artigo repetido na encomenda.');
    seen.add(sku);

    const p = bySku.get(sku);
    // Mensagem deliberadamente vaga: não confirmamos a existência de SKUs a
    // quem esteja a sondar o catálogo.
    if (!p) throw new Error('Um dos artigos já não está disponível. Reveja o carrinho.');
    if (p.available === false) throw new Error(`"${p.name}" já não está disponível.`);

    const unitCents = eurToCents(p.price_eur);
    if (unitCents <= 0) throw new Error(`"${p.name}" está sob consulta. Fale connosco para encomendar.`);

    const stock = Number.isFinite(Number(p.stock)) ? Number(p.stock) : 0;
    if (stock <= 0) throw new Error(`"${p.name}" está esgotado.`);

    // Estritamente inteiro: uma quantidade fracionária só chega aqui por
    // payload manipulado ou bug no cliente. Arredondar em silêncio esconderia
    // o problema numa rota que move dinheiro.
    const qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1) throw new Error(`Quantidade inválida em "${p.name}".`);
    if (qty > MAX_QTY_PER_LINE) throw new Error(`Máximo de ${MAX_QTY_PER_LINE} unidades por artigo. Para mais, fale connosco.`);
    if (qty > stock) throw new Error(`Só temos ${stock} unidade(s) de "${p.name}" disponíveis online.`);

    subtotalCents += unitCents * qty;
    weightKg += (Number(p.weight_kg) || 0) * qty;

    lines.push({
      sku, name: p.name, qty, unit_cents: unitCents,
      weight_kg: Number(p.weight_kg) || 0,
      condition: p.condition || 'Novo',
    });
  }

  const shippingCents = delivery === 'ctt' ? shippingTierCents(weightKg, settings) : 0;

  return {
    lines,
    subtotal_cents: subtotalCents,
    shipping_cents: shippingCents,
    total_cents: subtotalCents + shippingCents,
    weight_kg: Math.round(weightKg * 100) / 100,
    settings,
  };
}
