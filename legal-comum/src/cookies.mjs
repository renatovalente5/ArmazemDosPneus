// Cookies e mapa (Lei n.º 41/2004, art. 5.º): nada se grava nem se lê no aparelho antes de uma escolha.
// A fachada só carrega o iframe do Google Maps ao clique, guarda a escolha no localStorage só nesse
// momento, e oferece sempre um controlo «Deixar de carregar o mapa» que apaga a chave e tira o iframe na
// hora. Expõe window.legalComum.mapa.retirar() para uma ligação «Definições de cookies» no rodapé.
import { esc } from './util.mjs';

const TEXTO_FACHADA =
  'O mapa é da Google e só é carregado dos servidores dela depois de carregar no botão. Nessa altura a Google (Google Ireland Ltd.) recebe o seu endereço IP e pode gravar cookies no seu aparelho. A sua escolha fica guardada neste aparelho até a retirar.';

/**
 * O CSS da fachada.
 * @param {{ classe?: string, altura?: number, id?: string }} [opcoes]
 * @returns {string}
 */
export function fachadaMapaCss({ classe = 'fachada-mapa', altura = 360, id } = {}) {
  const raiz = id ? `#${id}` : `.${classe}`;
  return [
    `${raiz}{display:block;max-width:100%}`,
    `${raiz} .${classe}__moldura{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;min-height:${Number(altura)}px;padding:1.25rem;border:1px solid rgba(0,0,0,.15);border-radius:.75rem;background:rgba(0,0,0,.04);text-align:center}`,
    `${raiz} .${classe}__texto{margin:0;max-width:40rem;font-size:.95rem;line-height:1.45}`,
    `${raiz} .${classe}__carregar,${raiz} .${classe}__retirar{min-height:44px;padding:.6em 1.2em;border:1px solid currentColor;border-radius:.5em;background:transparent;color:inherit;font:inherit;font-size:max(14px,.95rem);cursor:pointer}`,
    `${raiz} .${classe}__carregar{font-weight:600}`,
    `${raiz} .${classe}__retirar{margin-top:.5rem;font-size:max(14px,.85rem)}`,
    `${raiz} .${classe}__carregar:focus-visible,${raiz} .${classe}__retirar:focus-visible{outline:3px solid currentColor;outline-offset:3px}`,
    `${raiz} iframe{display:block;width:100%;height:${Number(altura)}px;border:0;border-radius:.75rem}`,
    `${raiz} [hidden]{display:none}`,
  ].join('\n');
}

/**
 * O JS da fachada (um IIFE, sem dependências). Serve todas as fachadas da página.
 * Só usa: querySelectorAll, querySelector, createElement, appendChild, setAttribute/getAttribute,
 * addEventListener, textContent, innerHTML (para limpar), hidden e localStorage.
 * @returns {string}
 */
export function fachadaMapaJs() {
  return `(function () {
  var SELECTOR = '[data-fachada-mapa]';
  function ler(chave) { try { return window.localStorage.getItem(chave); } catch (e) { return null; } }
  function gravar(chave) { try { window.localStorage.setItem(chave, 'sim'); } catch (e) {} }
  function apagar(chave) { try { window.localStorage.removeItem(chave); } catch (e) {} }
  function mostrarRetirar(el, sim) {
    var b = el.querySelector('[data-fachada-retirar]');
    if (b) b.hidden = !sim && !el.hasAttribute('data-retirar-sempre');
  }
  function carregar(el, gravarEscolha) {
    var moldura = el.querySelector('[data-fachada-moldura]');
    if (!moldura || moldura.querySelector('iframe')) return;
    if (gravarEscolha) gravar(el.getAttribute('data-chave'));
    var f = document.createElement('iframe');
    f.setAttribute('src', el.getAttribute('data-src'));
    f.setAttribute('title', el.getAttribute('data-titulo') || 'Mapa');
    f.setAttribute('loading', 'lazy');
    f.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    f.setAttribute('allowfullscreen', '');
    moldura.innerHTML = '';
    moldura.appendChild(f);
    el.setAttribute('data-estado', 'carregado');
    mostrarRetirar(el, true);
  }
  function construirInicial(el, moldura) {
    var classe = el.getAttribute('data-classe') || 'fachada-mapa';
    moldura.innerHTML = '';
    var p = document.createElement('p');
    p.className = classe + '__texto';
    p.textContent = el.getAttribute('data-texto') || '';
    var b = document.createElement('button');
    b.setAttribute('type', 'button');
    b.className = classe + '__carregar';
    b.setAttribute('data-fachada-carregar', '');
    b.textContent = el.getAttribute('data-texto-botao') || 'Carregar o mapa';
    b.addEventListener('click', function () { carregar(el, true); });
    moldura.appendChild(p);
    moldura.appendChild(b);
  }
  function retirar(el) {
    apagar(el.getAttribute('data-chave'));
    var moldura = el.querySelector('[data-fachada-moldura]');
    if (moldura) construirInicial(el, moldura);
    el.setAttribute('data-estado', 'por-carregar');
    mostrarRetirar(el, false);
  }
  function iniciar(el) {
    var botao = el.querySelector('[data-fachada-carregar]');
    if (botao) botao.addEventListener('click', function () { carregar(el, true); });
    var ret = el.querySelector('[data-fachada-retirar]');
    if (ret) ret.addEventListener('click', function () { retirar(el); });
    if (ler(el.getAttribute('data-chave')) === 'sim') carregar(el, false);
    else mostrarRetirar(el, false);
  }
  function todas() { return document.querySelectorAll(SELECTOR); }
  function arrancar() {
    var lista = todas();
    for (var i = 0; i < lista.length; i++) iniciar(lista[i]);
  }
  window.legalComum = window.legalComum || {};
  window.legalComum.mapa = {
    retirar: function () { var l = todas(); for (var i = 0; i < l.length; i++) retirar(l[i]); },
    carregar: function () { var l = todas(); for (var i = 0; i < l.length; i++) carregar(l[i], true); },
    autorizado: function (chave) { return ler(chave || 'mapa-autorizado') === 'sim'; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();`;
}

/**
 * A fachada do mapa: HTML + CSS + JS inline, sem dependências.
 * @param {object} opcoes
 * @param {string} opcoes.src o src do iframe do Google Maps (https)
 * @param {string} [opcoes.titulo='Mapa'] o title do iframe
 * @param {string} [opcoes.chave='mapa-autorizado'] a chave no localStorage
 * @param {string} [opcoes.textoBotao='Carregar o mapa']
 * @param {string} [opcoes.textoRetirar='Deixar de carregar o mapa']
 * @param {number} [opcoes.altura=360] em px
 * @param {string} [opcoes.texto] o texto da fachada (por omissão, explica o que a Google recebe)
 * @param {string} [opcoes.classe='fachada-mapa']
 * @param {string} [opcoes.id]
 * @param {boolean} [opcoes.retirarSempreVisivel=false] o controlo «Deixar de carregar» visível mesmo sem mapa carregado
 * @param {boolean} [opcoes.comCss=true]
 * @param {boolean} [opcoes.comJs=true]
 * @returns {string}
 */
export function fachadaMapa({
  src,
  titulo = 'Mapa',
  chave = 'mapa-autorizado',
  textoBotao = 'Carregar o mapa',
  textoRetirar = 'Deixar de carregar o mapa',
  altura = 360,
  texto = TEXTO_FACHADA,
  classe = 'fachada-mapa',
  id,
  retirarSempreVisivel = false,
  comCss = true,
  comJs = true,
} = {}) {
  if (typeof src !== 'string' || !/^https:\/\//.test(src)) throw new Error('fachadaMapa precisa de um src https:// (o do iframe do Google Maps)');
  if (!/^[a-zA-Z][\w-]*$/.test(chave)) throw new Error(`Chave inválida para o localStorage: ${chave}`);
  const html = [
    `<div class="${esc(classe)}"${id ? ` id="${esc(id)}"` : ''} data-fachada-mapa data-src="${esc(src)}" data-chave="${esc(chave)}" data-titulo="${esc(titulo)}" data-classe="${esc(classe)}" data-texto="${esc(texto)}" data-texto-botao="${esc(textoBotao)}" data-estado="por-carregar"${retirarSempreVisivel ? ' data-retirar-sempre' : ''} lang="pt">`,
    `<div class="${esc(classe)}__moldura" data-fachada-moldura>`,
    `<p class="${esc(classe)}__texto">${esc(texto)}</p>`,
    `<button type="button" class="${esc(classe)}__carregar" data-fachada-carregar>${esc(textoBotao)}</button>`,
    '</div>',
    `<button type="button" class="${esc(classe)}__retirar" data-fachada-retirar${retirarSempreVisivel ? '' : ' hidden'}>${esc(textoRetirar)}</button>`,
    '</div>',
  ];
  if (comCss) html.push(`<style>${fachadaMapaCss({ classe, altura, id })}</style>`);
  if (comJs) html.push(`<script>${fachadaMapaJs()}</script>`);
  return html.join('\n');
}

/**
 * A frase para a política quando o site não grava nada antes de uma escolha.
 * @param {{ comMapa?: boolean, textoBotao?: string, textoRetirar?: string }} [opcoes]
 * @returns {string}
 */
export function textoSemCookies({ comMapa = true, textoBotao = 'Carregar o mapa', textoRetirar = 'Deixar de carregar o mapa' } = {}) {
  const base = 'Este site não grava cookies nem lê nada do seu aparelho antes de uma escolha sua, e por isso não tem aviso de cookies.';
  if (!comMapa) return base;
  return `${base} A única excepção é o mapa: só é carregado dos servidores da Google depois de carregar em «${textoBotao}», e essa escolha fica guardada no seu aparelho (localStorage) até a retirar em «${textoRetirar}».`;
}

/**
 * O texto da secção «Definições de cookies».
 * @param {{ textoRetirar?: string }} [opcoes]
 * @returns {string}
 */
export function textoDefinicoesCookies({ textoRetirar = 'Deixar de carregar o mapa' } = {}) {
  return `Para retirar a autorização que deu ao mapa, carregue em «${textoRetirar}» junto ao mapa: a escolha é apagada do seu aparelho e o mapa deixa de ser carregado na hora. Pode voltar a autorizá-lo quando quiser, com um clique no mapa.`;
}
