// A nota do custo da chamada junto de cada número de telefone (DL 59/2021, art. 3.º, n.º 3).
//
// A letra da lei: «Chamada para rede móvel nacional» (sem «a»), «Chamada para a rede fixa nacional» e
// «Chamada gratuita». Os sites do Renato usam hoje «Chamada para a rede móvel nacional» e ele decidiu
// manter (substância igual, risco quase nulo); por isso há a opção { frase: 'com-a' }. A forma por
// omissão é a da lei.
import { esc } from './util.mjs';

const FRASES = Object.freeze({
  lei: Object.freeze({
    movel: 'Chamada para rede móvel nacional',
    fixo: 'Chamada para a rede fixa nacional',
    gratuita: 'Chamada gratuita',
  }),
  'com-a': Object.freeze({
    movel: 'Chamada para a rede móvel nacional',
    fixo: 'Chamada para a rede fixa nacional',
    gratuita: 'Chamada gratuita',
  }),
});

/**
 * Reduz um número português aos 9 dígitos nacionais. Aceita espaços, pontos, hífenes, parênteses,
 * «+351», «00351» e «351».
 * @param {string|number} numero
 * @returns {string|null} os 9 dígitos, ou null quando não é um número nacional de 9 dígitos
 */
export function normalizarNumero(numero) {
  let d = String(numero ?? '').replace(/[\s().\-  ]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (/^00351\d{9}$/.test(d)) d = d.slice(5);
  else if (/^351\d{9}$/.test(d)) d = d.slice(3);
  return /^\d{9}$/.test(d) ? d : null;
}

/**
 * O tipo de linha, pelo início do número: 9 → móvel, 2 → fixo, 800 → gratuita.
 * @param {string|number} numero
 * @returns {'movel'|'fixo'|'gratuita'|'desconhecido'}
 */
export function tipoDeLinha(numero) {
  const d = normalizarNumero(numero);
  if (!d) return 'desconhecido';
  if (d.startsWith('800')) return 'gratuita';
  if (d.startsWith('9')) return 'movel';
  if (d.startsWith('2')) return 'fixo';
  return 'desconhecido';
}

/**
 * A frase legal do custo da chamada, exacta.
 * @param {string|number} numero
 * @param {{ frase?: 'lei'|'com-a' }} [opcoes] 'com-a' dá «Chamada para a rede móvel nacional»
 * @returns {string|null} null quando o tipo de linha é desconhecido
 */
export function notaChamada(numero, { frase = 'lei' } = {}) {
  const tabela = FRASES[frase];
  if (!tabela) throw new Error(`Forma desconhecida: ${frase} (usa 'lei' ou 'com-a')`);
  const tipo = tipoDeLinha(numero);
  return tipo === 'desconhecido' ? null : tabela[tipo];
}

/**
 * O número em grupos de três: «+351 912 345 678» ou «912 345 678».
 * @param {string|number} numero
 * @param {{ comIndicativo?: boolean }} [opcoes]
 * @returns {string}
 */
export function numeroLegivel(numero, { comIndicativo = true } = {}) {
  const d = normalizarNumero(numero);
  if (!d) throw new Error(`Número de telefone inválido: ${numero}`);
  const grupos = `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return comIndicativo ? `+351 ${grupos}` : grupos;
}

/**
 * O href de um botão «Ligar»: tel:+351912345678.
 * @param {string|number} numero
 * @returns {string}
 */
export function telefoneHref(numero) {
  const d = normalizarNumero(numero);
  if (!d) throw new Error(`Número de telefone inválido: ${numero}`);
  return `tel:+351${d}`;
}

/**
 * Um botão/ligação tel: com a nota legal dentro.
 * @param {string|number} numero
 * @param {object} [opcoes]
 * @param {string} [opcoes.texto] o texto visível (por omissão, o número legível); é escapado
 * @param {string} [opcoes.classe='telefone']
 * @param {string} [opcoes.classeNota='nota-chamada']
 * @param {boolean} [opcoes.comIndicativo=true]
 * @param {'lei'|'com-a'} [opcoes.frase='lei']
 * @returns {string} <a href="tel:+351…" class="telefone">texto <span class="nota-chamada">(Chamada …)</span></a>
 */
export function telefoneHtml(numero, { texto, classe = 'telefone', classeNota = 'nota-chamada', comIndicativo = true, frase = 'lei' } = {}) {
  const nota = notaChamada(numero, { frase });
  if (!nota) {
    throw new Error(`Sem nota legal para o número «${numero}»: só sei 2…, 9… e 800… (DL 59/2021, art. 3.º)`);
  }
  const visivel = texto ?? numeroLegivel(numero, { comIndicativo });
  return `<a href="${telefoneHref(numero)}" class="${esc(classe)}">${esc(visivel)} <span class="${esc(classeNota)}">(${nota})</span></a>`;
}

/**
 * O número com a nota, em texto simples, para emails e PDF: «+351 912 345 678 (Chamada para rede móvel nacional)».
 * @param {string|number} numero
 * @param {{ comIndicativo?: boolean, frase?: 'lei'|'com-a' }} [opcoes]
 * @returns {string}
 */
export function telefoneTexto(numero, { comIndicativo = true, frase = 'lei' } = {}) {
  const nota = notaChamada(numero, { frase });
  if (!nota) {
    throw new Error(`Sem nota legal para o número «${numero}»: só sei 2…, 9… e 800… (DL 59/2021, art. 3.º)`);
  }
  return `${numeroLegivel(numero, { comIndicativo })} (${nota})`;
}
