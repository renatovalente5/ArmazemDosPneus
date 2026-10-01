/* =============================================================
   Dados de ensaio da bateria do Worker. Congelados de propósito: o dono muda
   o settings.json no painel quando quiser, e uma prova «igual a antes» não pode
   depender do que lá estiver nesse dia.

   Nenhum email verdadeiro de pessoas: o repositório do site é PÚBLICO. O email
   da loja é substituído por loja@exemplo.pt (nos dois lados da comparação).
   ============================================================= */

/** As [vars] do wrangler.toml de hoje (um teste confere que continuam iguais), e segredos de ensaio. */
export const ENV_HOJE = Object.freeze({
  ALLOWED_ORIGINS: 'https://armazemdospneus.pt,https://www.armazemdospneus.pt',
  SITE_URL: 'https://armazemdospneus.pt',
  PRODUCTS_URL: 'https://armazemdospneus.pt/data/products.json',
  SETTINGS_URL: 'https://armazemdospneus.pt/data/settings.json',
  SITE_DATA_URL: 'https://armazemdospneus.pt/data/site.json',
  EMPRESA_URL: 'https://armazemdospneus.pt/data/empresa.json',
  SUCCESS_URL: 'https://armazemdospneus.pt/obrigado.html',
  CANCEL_URL: 'https://armazemdospneus.pt/checkout.html?cancelado=1',
  MAIL_FROM: 'Armazém dos Pneus <encomendas@armazemdospneus.pt>',
  STORE_EMAIL: 'loja@exemplo.pt',
  STORE_PHONE: '935 218 857',
  STRIPE_API_VERSION: '2026-07-29.dahlia',
  DELIVERY_MIN_DAYS: '2',
  DELIVERY_MAX_BUSINESS_DAYS: '5',
  DELIVERY_MAX_DAYS: '30',
  REQUIRE_TOS_CONSENT: 'false',
  STRIPE_RESTRICTED_KEY: 'chave-de-ensaio',
  STRIPE_WEBHOOK_SECRET: 'segredo-de-ensaio',
  RESEND_API_KEY: 'chave-de-ensaio',
  MAIL_TO: 'dono@exemplo.pt',
});

export const PRODUTOS = {
  products: [
    { name: 'Jante Liga Leve 16" 5x112 ET45', category: 'Jantes', brand: 'Ensaio', price_eur: 124.9, stock: 8, weight_kg: 9.5, condition: 'Novo', available: true, featured: false, hidden: false, sku: 'jante-ensaio-16' },
    { name: 'Bateria 70Ah 640A', category: 'Baterias', brand: 'Ensaio', price_eur: 89.99, stock: 1, weight_kg: 18, condition: 'Novo', available: true, featured: false, hidden: false, sku: 'bateria-ensaio-70' },
  ],
};

/** O settings.json de 30 set 2026, tal e qual (menos o email da loja, que o Worker não lê). */
export const SETTINGS_HOJE = {
  store: { name: 'Armazém dos Pneus', phone: '935 218 857', whatsapp: '351935218857', email: 'loja@exemplo.pt', address: 'Travessa do Navega, 436 F, 3885-183 Arada, Ovar' },
  shipping: {
    free_pickup: true, quote_later: true, pickup_label: 'Levantar e montar na loja', note: 'Portes calculados pelo peso total da encomenda.',
    tiers: [{ max_kg: 5, price: 4.99 }, { max_kg: 20, price: 8.99 }, { max_kg: 40, price: 14.99 }, { max_kg: 80, price: 24.99 }, { max_kg: 100000, price: 39.99 }],
  },
  delivery: { estimate_min_days: 2, estimate_max_days: 5, max_days: 30, countries_note: 'Enviamos apenas para Portugal continental.' },
  returns: { return_cost_eur: null, note: '' },
  mounting: { price_eur: null, note: 'Montagem e equilibragem na loja. Combinamos o dia e a hora por telefone depois da encomenda.' },
  payment: { mode: 'online', note: 'Pagamento seguro por MB WAY, cartão ou referência Multibanco.' },
};

/** data/site.json na forma do §5.1 do plano, com os valores de hoje (o que a fase A2 vai publicar). */
export const SITE_A2 = {
  contactos: {
    telefone: '935 218 857',
    telefone2: '932 948 572',
    whatsapp: '351935218857',
    email: 'loja@exemplo.pt',
    facebook: 'https://www.facebook.com/armazem.dospeneus/',
    nota_chamada: '(Chamada para a rede móvel nacional)',
  },
  horario: {
    dias: {
      seg: [{ abre: '09:00', fecha: '19:00' }], ter: [{ abre: '09:00', fecha: '19:00' }], qua: [{ abre: '09:00', fecha: '19:00' }],
      qui: [{ abre: '09:00', fecha: '19:00' }], sex: [{ abre: '09:00', fecha: '19:00' }], sab: [{ abre: '09:00', fecha: '13:00' }], dom: [],
    },
    nota: '',
  },
  marcas: ['Michelin', 'Continental', 'Bridgestone', 'Goodyear', 'Hankook', 'Dunlop', 'Pirelli', 'Lassa'],
};

/** data/empresa.json na forma do §5.1 do plano, com os valores de hoje. */
export const EMPRESA_A2 = {
  nome: 'Armazém dos Pneus',
  denominacao: 'Motivar & Lucrar, Unipessoal, Lda.',
  nif: '516324950',
  morada: { rua: 'Travessa do Navega, 436 F', cp: '3885-183', localidade: 'Arada', concelho: 'Ovar', distrito: 'Aveiro' },
  capital_social: null,
  conservatoria: null,
  geo: { lat: 40.8992781, lng: -8.6205027 },
  mapa: 'https://maps.app.goo.gl/7zmkjQksjeACTZBy6',
  ral: { nome: 'CNIACC — Centro Nacional de Informação e Arbitragem de Conflitos de Consumo', url: 'https://www.cniacc.pt' },
  livro_reclamacoes: 'https://www.livroreclamacoes.pt/inicio',
};

/* ---------- pedidos de checkout ---------- */

const cliente = {
  nome: 'Maria Ensaio da Silva', email: 'cliente@exemplo.pt', telefone: '912 000 000', nif: '123456789', aceita_termos: true,
};

export const PEDIDOS = {
  ctt: {
    ...cliente, entrega: 'ctt', morada: 'Rua do Ensaio, 10, 2.º Esq.', cp: '1000-001', localidade: 'Lisboa',
    items: [{ sku: 'jante-ensaio-16', qty: 4 }, { sku: 'bateria-ensaio-70', qty: 1 }],
  },
  loja: {
    ...cliente, entrega: 'loja', montagem: true, montagem_imediata: true, matricula: '00-ab-00', notas: 'Ligar antes das 18h.',
    items: [{ sku: 'jante-ensaio-16', qty: 2 }],
  },
  madeira: {
    ...cliente, entrega: 'ctt', morada: 'Rua do Ensaio, 1', cp: '9000-001', localidade: 'Funchal',
    items: [{ sku: 'jante-ensaio-16', qty: 1 }],
  },
};

/** Um NIF com o algarismo de controlo certo, a partir dos 8 primeiros. */
export function nifCom(oito) {
  let soma = 0;
  for (let i = 0; i < 8; i++) soma += Number(oito[i]) * (9 - i);
  const resto = soma % 11;
  return oito + String(resto < 2 ? 0 : 11 - resto);
}
