// Livro de Reclamações Electrónico: a ligação destacada que a lei manda pôr na página de entrada.
//
// O que é lei: DL 156/2005, art. 5.º-B, n.º 2 (introduzido pelo DL 74/2017) — divulgar no sítio na Internet,
// «em local visível e de forma destacada», o acesso à plataforma; Portaria 201-A/2017, art. 11.º. A lei não
// impõe nem o ícone nem o rodapé.
// O que é só a forma segura: o «Manual de utilização do ícone» da DGC (entendimento, não norma) pede
// «preferencialmente» o ícone, nas cores vermelho, azul, branco ou preto, com contraste face ao fundo, na
// página inicial (cabeçalho ou rodapé), e, como boa prática, também na página de apoio ao cliente, sempre
// ligado a https://www.livroreclamacoes.pt/inicio.
// O ícone deste módulo é um símbolo genérico de livro, desenhado aqui: o manual da DGC descreve o ícone
// oficial mas não o inclui (remete para um «anexo 1» que não vem no PDF publicado).
import { esc } from './util.mjs';

/** A ligação que o manual da DGC manda usar. */
export const LIVRO_URL = 'https://www.livroreclamacoes.pt/inicio';

/**
 * As quatro cores do manual da DGC, já com um par letra/fundo que passa o contraste de 4,5:1 (WCAG AA).
 * «azul» é mais escuro do que o Pantone 2925 do manual (≈ #009ade), porque esse só dá 3,2:1 com branco.
 */
export const CORES_LIVRO = Object.freeze({
  vermelho: { fundo: '#af272f', cor: '#ffffff' },
  azul: { fundo: '#005a9c', cor: '#ffffff' },
  preto: { fundo: '#111111', cor: '#ffffff' },
  branco: { fundo: '#ffffff', cor: '#111111' },
});

function hexParaRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminancia([r, g, b]) {
  const canal = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/**
 * Rácio de contraste WCAG entre duas cores em hexadecimal (#rgb ou #rrggbb).
 * @param {string} a
 * @param {string} b
 * @returns {number|null} o rácio (ex.: 6.66), ou null se alguma cor não for hexadecimal
 */
export function contraste(a, b) {
  const ra = hexParaRgb(a);
  const rb = hexParaRgb(b);
  if (!ra || !rb) return null;
  const la = luminancia(ra);
  const lb = luminancia(rb);
  const [claro, escuro] = la >= lb ? [la, lb] : [lb, la];
  return Math.round(((claro + 0.05) / (escuro + 0.05)) * 100) / 100;
}

/**
 * O ícone: um livro genérico, numa só cor (currentColor), decorativo (aria-hidden).
 * @param {{ classe?: string }} [opcoes]
 * @returns {string} SVG inline
 */
export function iconeLivro({ classe = 'lr-icone' } = {}) {
  return (
    `<svg class="${esc(classe)}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="currentColor">` +
    '<path fill-rule="evenodd" d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm1 0v20h1.2V2H7Zm3.8 5.2h5.4a.8.8 0 0 1 0 1.6h-5.4a.8.8 0 0 1 0-1.6Zm0 4h5.4a.8.8 0 0 1 0 1.6h-5.4a.8.8 0 0 1 0-1.6Zm0 4h3.4a.8.8 0 0 1 0 1.6h-3.4a.8.8 0 0 1 0-1.6Z"/>' +
    '</svg>'
  );
}

/**
 * A ligação ao Livro de Reclamações Electrónico.
 * @param {object} [opcoes]
 * @param {'discreto'|'botao'|'texto'} [opcoes.variante='discreto'] «discreto» (por omissão): ícone + texto com a
 *   letra e a cor das outras ligações do rodapé, sem caixa — o ícone é o destaque; «botao»: caixa colorida;
 *   «texto»: ligação simples em negrito
 * @param {string} [opcoes.texto='Livro de Reclamações']
 * @param {string} [opcoes.classe] 'lr-botao' no botão, 'lr-texto' na ligação simples
 * @param {string} [opcoes.href=LIVRO_URL]
 * @param {'vermelho'|'azul'|'preto'|'branco'} [opcoes.cor] acrescenta a classe modificadora «<classe>--<cor>»
 *   (o CSS de livroCss traz as quatro); para outras cores, passa-as a livroCss
 * @param {boolean} [opcoes.icone] com o ícone (sim no botão, não no texto)
 * @param {string} [opcoes.lingua='pt'] valor do atributo lang
 * @returns {string} HTML de um <a> com target="_blank" e rel="noopener"
 */
export function livroReclamacoes({
  variante = 'discreto',
  texto = 'Livro de Reclamações',
  classe,
  href = LIVRO_URL,
  cor,
  icone,
  lingua = 'pt',
} = {}) {
  if (!['discreto', 'botao', 'texto'].includes(variante)) {
    throw new Error(`Variante desconhecida: ${variante} (usa 'discreto', 'botao' ou 'texto')`);
  }
  if (cor !== undefined && !CORES_LIVRO[cor]) {
    throw new Error(`Cor desconhecida: ${cor} (usa ${Object.keys(CORES_LIVRO).join(', ')}, ou passa a cor a livroCss)`);
  }
  const base = classe || { discreto: 'lr-discreto', botao: 'lr-botao', texto: 'lr-texto' }[variante];
  const classes = cor ? `${base} ${base}--${cor}` : base;
  const comIcone = icone ?? variante !== 'texto';
  const novaJanela = '<span class="lr-sr"> (abre numa nova janela)</span>';
  const atributos = `class="${esc(classes)}" href="${esc(href)}" target="_blank" rel="noopener" lang="${esc(lingua)}"`;
  if (variante === 'discreto') {
    return `<a ${atributos}>${comIcone ? iconeLivro() : ''}<span>${esc(texto)}</span>${novaJanela}</a>`;
  }
  if (variante === 'texto') {
    return `<a ${atributos}>${comIcone ? iconeLivro() : ''}<strong>${esc(texto)}</strong>${novaJanela}</a>`;
  }
  return `<a ${atributos}>${comIcone ? iconeLivro() : ''}<span class="${esc(base)}__texto">${esc(texto)}</span>${novaJanela}</a>`;
}

/**
 * O CSS do botão: toque ≥ 44 px, letra ≥ 14 px, contraste ≥ 4,5:1 (verificado; lança erro se o par falhar),
 * e as quatro classes modificadoras das cores do manual. Inclui também a ligação simples (.lr-texto) e a
 * classe .lr-sr (texto só para leitores de ecrã). Não usa estilos inline, para passar numa CSP apertada.
 * @param {string} [classe='lr-botao']
 * @param {{ cor?: string, fundo?: string, contorno?: string }} [opcoes] cores por omissão do botão
 * @returns {string} CSS
 */
export function livroCss(classe = 'lr-botao', { cor = CORES_LIVRO.vermelho.cor, fundo = CORES_LIVRO.vermelho.fundo, contorno } = {}) {
  const racio = contraste(cor, fundo);
  if (racio !== null && racio < 4.5) {
    throw new Error(`Contraste insuficiente entre ${cor} e ${fundo}: ${racio}:1 (mínimo 4,5:1)`);
  }
  const c = `.${classe}`;
  const borda = contorno || (racio !== null && contraste(fundo, '#ffffff') < 1.5 ? cor : 'transparent');
  const modificadores = Object.entries(CORES_LIVRO)
    .map(([nome, par]) => {
      const bordaPreset = nome === 'branco' ? par.cor : 'transparent';
      return `${c}--${nome}{background:${par.fundo};color:${par.cor};border-color:${bordaPreset}}`;
    })
    .join('\n');
  return [
    `${c}{display:inline-flex;align-items:center;gap:.5em;min-height:44px;min-width:44px;padding:.5em 1em;border:1px solid ${borda};border-radius:.5em;background:${fundo};color:${cor};font-family:inherit;font-size:max(14px,.95rem);font-weight:600;line-height:1.2;text-decoration:none;white-space:nowrap;cursor:pointer}`,
    `${c}:hover,${c}:focus-visible{text-decoration:underline;text-underline-offset:.15em}`,
    `${c}:focus-visible{outline:3px solid currentColor;outline-offset:3px}`,
    `${c} svg{width:1.5em;height:1.5em;flex:none}`,
    modificadores,
    // Discreto: mesma letra e cor das outras ligações do rodapé (nunca mais pequena nem esbatida); o ícone destaca-o.
    '.lr-discreto{display:inline-flex;align-items:center;gap:.4em;min-height:24px;color:inherit;font:inherit;text-decoration:none;white-space:nowrap}',
    '.lr-discreto:hover,.lr-discreto:focus-visible{text-decoration:underline;text-underline-offset:.15em}',
    '.lr-discreto:focus-visible{outline:2px solid currentColor;outline-offset:2px}',
    '.lr-discreto svg{width:1.15em;height:1.15em;flex:none}',
    '.lr-texto{font-weight:700;color:inherit;text-decoration:underline;text-underline-offset:.15em}',
    '.lr-texto svg{width:1.2em;height:1.2em;vertical-align:-.2em;margin-right:.3em}',
    '.lr-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
  ].join('\n');
}
