// Garantia legal (DL 84/2021): frases únicas, em português de Portugal, que nunca apresentam um direito
// legal como vantagem (isso é prática comercial enganosa: DL 57/2008, art. 8.º).
//
// Fontes: DL 84/2021 — art. 12.º (3 anos nos bens móveis), art. 13.º (presunção de 2 anos; 1 ano nos
// usados com prazo reduzido); o prazo de 18 meses por acordo prévio nos bens em segunda mão, os 6 meses
// por reparação e a regra de que a garantia comercial acresce à legal estão no mesmo diploma (os números
// dos artigos ficam por confirmar no README; o texto não os cita).
import { normalizar } from './util.mjs';

export const GARANTIA_BENS =
  'Os bens têm garantia legal de 3 anos a contar da entrega (Decreto-Lei n.º 84/2021). Nos primeiros 2 anos presume-se que o defeito já existia. Cada reparação acrescenta 6 meses à garantia do bem reparado.';

export const GARANTIA_USADOS_18 =
  'Nos bens em segunda mão, o prazo pode ser reduzido para 18 meses por acordo entre as partes, antes da venda; nesse caso a presunção é de 1 ano.';

export const GARANTIA_SERVICOS =
  'Os materiais aplicados num serviço têm a garantia legal de 3 anos a contar da entrega (Decreto-Lei n.º 84/2021).';

export const GARANTIA_COMERCIAL_NOTA =
  'Uma garantia comercial, quando existe, acresce à garantia legal e nunca a reduz nem a substitui.';

export const VARIACOES_DO_FEITO_A_MAO =
  'As variações naturais do material e do trabalho à mão descrevem-se na ficha de cada peça. Isto não afecta a garantia legal.';

/**
 * Frases que contrariam a lei ou vendem um direito legal como vantagem. A procura ignora acentos e
 * maiúsculas.
 */
export const frasesProibidas = Object.freeze([
  'garantia incluída no preço',
  'oferecemos garantia',
  'garantia de 1 ano',
  'não aceitamos devoluções',
  'fotografias meramente ilustrativas',
  'imagens meramente ilustrativas',
  'não são falta de conformidade',
  'alterar sem aviso prévio',
  'dados carecem de confirmação',
]);

/**
 * Procura as frases proibidas num texto.
 * @param {string} texto
 * @param {{ frases?: readonly string[] }} [opcoes] outra lista de frases
 * @returns {{ frase: string, indice: number, contexto: string }[]} uma entrada por ocorrência, por ordem
 */
export function procurarFrasesProibidas(texto, { frases = frasesProibidas } = {}) {
  const original = String(texto ?? '');
  // Normaliza carácter a carácter, guardando o índice original de cada carácter produzido.
  let norm = '';
  const indices = [];
  for (let i = 0; i < original.length; i++) {
    const parte = normalizar(original[i]) || (/\s/.test(original[i]) ? ' ' : '');
    for (const c of parte) {
      norm += c;
      indices.push(i);
    }
  }
  const ocorrencias = [];
  for (const frase of frases) {
    const alvo = normalizar(frase);
    if (!alvo) continue;
    let pos = norm.indexOf(alvo);
    while (pos !== -1) {
      const inicio = indices[pos];
      const fim = indices[pos + alvo.length - 1] + 1;
      ocorrencias.push({
        frase,
        indice: inicio,
        contexto: original.slice(Math.max(0, inicio - 30), Math.min(original.length, fim + 30)).replace(/\s+/g, ' ').trim(),
      });
      pos = norm.indexOf(alvo, pos + 1);
    }
  }
  return ocorrencias.sort((a, b) => a.indice - b.indice);
}

/**
 * O texto da garantia para uma página, juntando só o que se aplica.
 * @param {{ usados?: boolean, servicos?: boolean, feitoAMao?: boolean, comercial?: boolean }} [opcoes]
 * @returns {string} parágrafos separados por uma linha em branco
 */
export function textoGarantia({ usados = false, servicos = false, feitoAMao = false, comercial = false } = {}) {
  const partes = [servicos ? GARANTIA_SERVICOS : GARANTIA_BENS];
  if (usados) partes.push(GARANTIA_USADOS_18);
  if (feitoAMao) partes.push(VARIACOES_DO_FEITO_A_MAO);
  if (comercial) partes.push(GARANTIA_COMERCIAL_NOTA);
  return partes.join('\n\n');
}
