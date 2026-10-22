/* =============================================================
   ARMAZÉM DOS PNEUS — mapa.js
   A fachada do mapa do Google: nada é pedido à Google antes de o visitante
   carregar em «Carregar o mapa»; a escolha fica no localStorage
   (mapa-autorizado) só nesse clique, e «Deixar de carregar o mapa» apaga-a e
   tira o iframe na hora. É o fachadaMapaJs() da biblioteca legal-comum, copiado
   tal e qual entre os marcadores (Lei n.º 41/2004, art. 5.º): substituiu o
   banner de cookies, porque o mapa era o único terceiro do site.
   ============================================================= */
/* legal-comum:cookies-js v1.1.0 */
(function () {
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
})();
/* /legal-comum:cookies-js */
