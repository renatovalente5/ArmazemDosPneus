// Utilitários partilhados pelos módulos. Sem dependências.

/**
 * Escapa texto para o pôr dentro de HTML (conteúdo ou atributo entre aspas).
 * @param {unknown} valor
 * @returns {string}
 */
export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Normaliza um texto para comparações: minúsculas, sem acentos, espaços simples.
 * @param {unknown} texto
 * @returns {string}
 */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formata um valor em euros à portuguesa: «1 234,56 €».
 * @param {number|string} valor
 * @returns {string}
 */
export function formatarEuros(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new Error(`Valor em euros inválido: ${valor}`);
  const [inteiro, decimais] = Math.abs(n).toFixed(2).split('.');
  const comEspacos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '-' : ''}${comEspacos},${decimais} €`;
}

/**
 * Converte um valor para número (aceita «12,50» e «12.50»); NaN quando não dá.
 * @param {unknown} valor
 * @returns {number}
 */
export function paraNumero(valor) {
  if (typeof valor === 'number') return valor;
  if (valor === null || valor === undefined || valor === '') return NaN;
  const s = String(valor).trim().replace(/\s/g, '').replace(/€/g, '');
  // «1.234,56» → 1234.56; «12,5» → 12.5; «12.5» → 12.5
  const semMilhares = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.');
  return Number(semMilhares);
}
