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

// cacheTtl curto: o cliente muda preços no backoffice e o deploy do
// GitHub Pages é quase imediato; 60 s evita martelar o Pages a cada compra.
// Exportado: o site.json e o empresa.json (termos.js) lêem-se com a MESMA cache.
export const CACHE_DADOS = Object.freeze({ cf: Object.freeze({ cacheTtl: 60, cacheEverything: true }) });

async function loadJson(url) {
  const res = await fetch(url, CACHE_DADOS);
  if (!res.ok) throw new Error(`não foi possível ler ${url} (HTTP ${res.status})`);
  return res.json();
}

/* O peso também em inteiros: CENTÉSIMOS DE KG. Somado em vírgula flutuante,
   3 × 1,6 kg + 0,2 kg dá 5,000000000000001, e uma encomenda de exactamente
   5 kg era cobrada pelo escalão seguinte (8,99 € em vez de 4,99 €), com a
   Stripe a dizer «Envio CTT (5 kg)» (achado L7-11). O checkout.js faz o mesmo. */
const centesimosDeKg = (kg) => Math.round((Number(kg) || 0) * 100);

/* Um pneu seminovo (um bem usado): a regra do ePneu do .github/regras.mjs e do
   assets/js/catalog.js. A garantia dele — e o acordo que ela pede — é do
   garantia.js. */
const ePneuSeminovo = (p) => /pneu/i.test(p.category || '') && p.condition === 'Seminovo';

/** Escalão de portes por peso total, a partir de data/settings.json. */
export function shippingTierCents(weightKg, settings) {
  return escalaoDePortes(centesimosDeKg(weightKg), settings);
}

function escalaoDePortes(pesoCg, settings) {
  // Um escalão mal preenchido no backoffice não pode virar portes grátis: um
  // preço em branco dava 0 cêntimos e a loja pagava o envio sem ninguém notar.
  // E um max_kg em branco valia 0 kg, ficava em primeiro na ordenação e
  // deslocava os escalões reais. Ambos são descartados e, se não sobrar nenhum
  // escalão válido, falha — é preferível recusar a encomenda a cobrar mal.
  const brutos = (settings && settings.shipping && settings.shipping.tiers) || [];
  const tiers = brutos
    .map((t) => ({ max_kg: Number(t.max_kg), cents: eurToCents(t.price) }))
    .filter((t) => Number.isFinite(t.max_kg) && t.max_kg > 0 && t.cents > 0)
    .map((t) => ({ ...t, max_cg: centesimosDeKg(t.max_kg) }))
    .sort((a, b) => a.max_cg - b.max_cg);
  if (tiers.length !== brutos.length) {
    console.error('escalões de portes inválidos ignorados:', brutos.length - tiers.length, 'de', brutos.length);
  }
  if (!tiers.length) throw new Error('tabela de portes não configurada');
  for (const t of tiers) if (pesoCg <= t.max_cg) return t.cents;
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
  // Os pneus seminovos do carrinho, com a garantia que o products.json
  // PUBLICADO lhes dá (e não a que o browser diz). Não entram nas linhas: a
  // encomenda sem seminovos fica byte a byte como era.
  const seminovos = [];
  let subtotalCents = 0;
  let pesoCg = 0;
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
    pesoCg += centesimosDeKg(p.weight_kg) * qty;

    lines.push({
      sku, name: p.name, qty, unit_cents: unitCents,
      weight_kg: Number(p.weight_kg) || 0,
      condition: p.condition || 'Novo',
    });
    if (ePneuSeminovo(p)) seminovos.push({ sku, nome: p.name, meses: p.warranty_months, qty });
  }

  // Portes a combinar: enquanto a loja não souber quanto custa cada envio, não
  // se cobra nada de portes neste pagamento e o valor é acordado depois com o
  // cliente. Isto só é legítimo porque o site o diz ANTES da compra — o art.
  // 4.º n.º 1 al. f) do DL 24/2014 admite anunciar que "podem ser devidos
  // encargos suplementares de transporte" quando não podem ser razoavelmente
  // calculados de antemão. O n.º 4 do mesmo artigo é o reverso: o que não for
  // dito ao consumidor antes, ele "fica desobrigado" de pagar. Daí a informação
  // aparecer no checkout, no botão e nos dois emails.
  const combinar = !!(settings && settings.shipping && settings.shipping.quote_later);
  const shippingCents = (delivery === 'ctt' && !combinar) ? escalaoDePortes(pesoCg, settings) : 0;

  return {
    lines,
    subtotal_cents: subtotalCents,
    shipping_cents: shippingCents,
    shipping_quote_later: combinar && delivery === 'ctt',
    total_cents: subtotalCents + shippingCents,
    weight_kg: pesoCg / 100,
    settings,
    seminovos,
  };
}
