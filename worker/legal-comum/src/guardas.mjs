// Guardas de publicação: identificação do vendedor, promoções e fichas de produto.
// Devolvem { problemas: [{ campo, mensagem, ecra, nivel }], ok }; `ok` é falso quando há um problema de
// nível 'erro'. Em modo 'bloquear', lançam um Error com todos os problemas.
//
// Fontes: DL 7/2004, art. 10.º (identificação: nome, morada geográfica, email, NIF); CSC, art. 171.º
// (menções das sociedades); DL 70/2007, art. 5.º (data de início e duração; preço anterior = o mais baixo
// dos 30 dias anteriores) e art. 5.º-A, n.º 1, al. b) (conjuntos); DL 138/90 e Lei 24/96, art. 8.º (preço
// total com IVA); Regulamento (UE) 2023/988, art. 19.º (fabricante, referência, avisos na venda à
// distância); DL 43/2011 (brinquedos: avisos com «Atenção», idade, marcação CE); Regulamento (UE) 1007/2011
// (composição têxtil em %); Regulamento (CE) 1272/2008 — CLP (misturas); DL 152-D/2017, art. 13.º (retoma).
import { paraNumero } from './util.mjs';
import { tipoDeLinha } from './telefone.mjs';

/**
 * Valida um NIF português: 9 dígitos, dígito de controlo certo, e não um dos números de teste.
 * @param {string|number} nif
 * @returns {boolean}
 */
export function validarNif(nif) {
  const d = String(nif ?? '').replace(/\s/g, '');
  if (!/^\d{9}$/.test(d)) return false;
  if (d === '000000000' || d === '123456789') return false;
  if (d[0] === '0' || (d[0] === '4' && d[1] !== '5')) return false;
  const soma = d
    .slice(0, 8)
    .split('')
    .reduce((acc, c, i) => acc + Number(c) * (9 - i), 0);
  const resto = soma % 11;
  const controlo = resto < 2 ? 0 : 11 - resto;
  return controlo === Number(d[8]);
}

const VAZIO = /^\s*$|por indicar|a indicar|^\s*[—–-]+\s*$|^\s*n\/?a\s*$|exemplo|example|lorem/i;
const MORADA_PROIBIDA = /\bapartado\b|caixa postal|ao cuidado|\ba\/c\b/i;
const CODIGO_POSTAL = /\b\d{4}-\d{3}\b/;
const FORMAS = ['eni', 'lda', 'unipessoal', 'sa', 'sem-actividade'];
const SOCIEDADES = ['lda', 'unipessoal', 'sa'];

function ecraDe(ecra, campo) {
  if (!ecra) return undefined;
  if (typeof ecra === 'string') return ecra;
  return ecra[campo] || ecra['*'];
}

function fazerProblema(ecra) {
  return (campo, mensagem, nivel = 'erro') => {
    const onde = ecraDe(ecra, campo);
    return { campo, mensagem: onde ? `${mensagem} (corrige em «${onde}»)` : mensagem, ecra: onde, nivel };
  };
}

function concluir(problemas, modo, titulo) {
  const ok = !problemas.some((p) => p.nivel === 'erro');
  if (modo === 'bloquear' && !ok) {
    const err = new Error(`${titulo}:\n${problemas.map((p) => `- ${p.campo}: ${p.mensagem}`).join('\n')}`);
    err.problemas = problemas;
    throw err;
  }
  if (modo !== 'bloquear' && modo !== 'avisar') throw new Error(`Modo desconhecido: ${modo} (usa 'avisar' ou 'bloquear')`);
  return { problemas, ok };
}

function verificarMorada(morada, problema) {
  if (!morada || (typeof morada === 'string' && VAZIO.test(morada))) {
    return [problema('morada', 'Morada por preencher: rua, número, código postal e localidade (DL 7/2004, art. 10.º)')];
  }
  const problemas = [];
  const texto = typeof morada === 'string' ? morada : Object.values(morada).filter(Boolean).join(' ');
  if (MORADA_PROIBIDA.test(texto)) {
    problemas.push(problema('morada', 'A morada tem de ser geográfica: sem apartado, caixa postal nem «ao cuidado» (DL 7/2004, art. 10.º)'));
  }
  if (typeof morada === 'string') {
    if (!CODIGO_POSTAL.test(morada)) problemas.push(problema('morada', 'Morada sem código postal no formato 0000-000'));
    if (!/\d/.test(morada.replace(CODIGO_POSTAL, ''))) problemas.push(problema('morada', 'Morada sem número de porta ou lote'));
    if (!/[a-zà-ú]{3,}/i.test(morada.replace(CODIGO_POSTAL, ''))) problemas.push(problema('morada', 'Morada sem rua'));
    return problemas;
  }
  const { rua, numero, codigoPostal, localidade } = morada;
  if (!rua || VAZIO.test(rua)) problemas.push(problema('morada.rua', 'Morada sem rua'));
  const n = String(numero ?? '').trim();
  if (!n || !(/\d/.test(n) || /\b(lote|lt\.?|km)\b/i.test(n))) problemas.push(problema('morada.numero', 'Morada sem número de porta ou lote'));
  if (!/^\d{4}-\d{3}$/.test(String(codigoPostal ?? '').trim())) problemas.push(problema('morada.codigoPostal', 'Código postal fora do formato 0000-000'));
  if (!localidade || VAZIO.test(localidade)) problemas.push(problema('morada.localidade', 'Morada sem localidade'));
  return problemas;
}

/**
 * Verifica a identificação do vendedor antes de publicar.
 * @param {object} dados
 * @param {string} dados.nome nome civil ou firma
 * @param {'eni'|'lda'|'unipessoal'|'sa'|'sem-actividade'} dados.formaJuridica
 * @param {string|number} dados.nif
 * @param {{ rua: string, numero: string|number, codigoPostal: string, localidade: string }|string} dados.morada
 * @param {string} dados.email em texto, não só mailto:
 * @param {string} [dados.telefone]
 * @param {{ sede?: string, conservatoria?: string, matricula?: string, capital?: string|number }} [dados.sociedade] nas sociedades
 * @param {{ modo?: 'avisar'|'bloquear', ecra?: string|Record<string,string> }} [opcoes] `ecra`: o ecrã do painel onde se corrige (um só, ou por campo, com '*' como omissão)
 * @returns {{ problemas: { campo: string, mensagem: string, ecra?: string, nivel: 'erro'|'aviso' }[], ok: boolean }}
 */
export function verificarIdentificacao(dados = {}, { modo = 'avisar', ecra } = {}) {
  const problema = fazerProblema(ecra);
  const problemas = [];
  const { nome, formaJuridica, nif, morada, email, telefone, sociedade } = dados;

  if (!nome || VAZIO.test(String(nome))) problemas.push(problema('nome', 'Nome ou firma por preencher (DL 7/2004, art. 10.º)'));

  if (!FORMAS.includes(formaJuridica)) {
    problemas.push(problema('formaJuridica', `Forma jurídica por indicar: ${FORMAS.join(', ')}`));
  } else if (formaJuridica === 'sem-actividade') {
    problemas.push(problema('formaJuridica', 'Actividade por abrir nas Finanças: o site não deve fechar vendas até lá (sem factura: RGIT, art. 123.º)', 'aviso'));
  }

  if (!validarNif(nif)) problemas.push(problema('nif', 'NIF inválido ou de teste (9 dígitos com dígito de controlo certo)'));

  problemas.push(...verificarMorada(morada, problema));

  const e = String(email ?? '').trim();
  if (!e || /^mailto:/i.test(e) || !/^[^\s@:]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || /exemplo|example/i.test(e)) {
    problemas.push(problema('email', 'Email em falta ou inválido: tem de estar em texto na página, não só num mailto: (DL 7/2004, art. 10.º)'));
  }

  if (telefone !== undefined && telefone !== null && String(telefone).trim() !== '' && tipoDeLinha(telefone) === 'desconhecido') {
    problemas.push(problema('telefone', 'Telefone fora dos formatos nacionais (2…, 9… ou 800…): sem nota legal do custo da chamada', 'aviso'));
  }

  if (SOCIEDADES.includes(formaJuridica)) {
    const s = sociedade || {};
    const falta = (campo) => !s[campo] || VAZIO.test(String(s[campo]));
    if (falta('sede')) problemas.push(problema('sociedade.sede', 'Sociedade sem a sede indicada (CSC, art. 171.º)'));
    if (falta('conservatoria')) problemas.push(problema('sociedade.conservatoria', 'Sociedade sem a conservatória do registo comercial (CSC, art. 171.º)'));
    if (falta('matricula')) problemas.push(problema('sociedade.matricula', 'Sociedade sem o número de matrícula/NIPC (CSC, art. 171.º)'));
    const capital = paraNumero(s.capital);
    if (!(capital > 0)) problemas.push(problema('sociedade.capital', 'Sociedade sem o capital social (CSC, art. 171.º)'));
  }

  return concluir(problemas, modo, 'Identificação incompleta');
}

function paraData(valor) {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(valor)) return null;
  const d = new Date(`${valor.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Verifica uma promoção (redução de preço) antes de a publicar.
 * Saldos e liquidações não passam por aqui: têm regras próprias (declaração prévia no ePortugal,
 * DL 70/2007, arts. 10.º e 13.º) e os seus prazos são os da declaração.
 * @param {object} promocao
 * @param {number|string} promocao.precoAntes o preço anterior anunciado (riscado)
 * @param {number|string} promocao.precoAgora
 * @param {string|Date} [promocao.inicio] AAAA-MM-DD
 * @param {string|Date} [promocao.fim] AAAA-MM-DD
 * @param {{ data: string|Date, preco: number|string }[]} [promocao.historico] os preços praticados
 * @param {'artigo'|'conjunto'} [promocao.tipo='artigo']
 * @param {(number|string)[]} [promocao.precosUnitarios] num conjunto, os preços dos artigos à unidade
 * @param {{ modo?: 'avisar'|'bloquear', ecra?: string|Record<string,string> }} [opcoes]
 * @returns {{ problemas: object[], ok: boolean, precoMaisBaixo30Dias: number|null, percentagem: number|null }}
 */
export function verificarPromocao(promocao = {}, { modo = 'avisar', ecra } = {}) {
  const problema = fazerProblema(ecra);
  const problemas = [];
  const precoAntes = paraNumero(promocao.precoAntes);
  const precoAgora = paraNumero(promocao.precoAgora);
  const inicio = paraData(promocao.inicio);
  const fim = paraData(promocao.fim);
  const historico = Array.isArray(promocao.historico) ? promocao.historico : [];
  const tipo = promocao.tipo || 'artigo';

  if (!(precoAntes > 0)) problemas.push(problema('precoAntes', 'Preço anterior em falta ou inválido'));
  if (!(precoAgora > 0)) problemas.push(problema('precoAgora', 'Preço actual em falta ou inválido'));
  if (precoAntes > 0 && precoAgora > 0 && precoAgora >= precoAntes) {
    problemas.push(problema('precoAgora', 'O preço actual não é inferior ao preço anterior: não há redução'));
  }
  if (!inicio) problemas.push(problema('inicio', 'Promoção sem data de início (DL 70/2007, art. 5.º)'));
  if (!fim) {
    problemas.push(problema('fim', 'Promoção sem data de fim: a lei pede a data de início e a duração (DL 70/2007, art. 5.º); só saldos e liquidações declarados têm prazos próprios'));
  } else if (inicio && fim < inicio) {
    problemas.push(problema('fim', 'A data de fim é anterior à de início'));
  }

  let precoMaisBaixo30Dias = null;
  if (!historico.length) {
    problemas.push(problema('historico', 'Sem prova do preço anterior: o histórico de preços está vazio (guarda os preços praticados — DL 70/2007, art. 5.º)', 'aviso'));
  } else if (!inicio) {
    problemas.push(problema('historico', 'Sem data de início não se pode conferir o preço mais baixo dos 30 dias anteriores', 'aviso'));
  } else {
    const limite = new Date(inicio.getTime() - 30 * 24 * 60 * 60 * 1000);
    const janela = historico
      .map((h) => ({ data: paraData(h.data), preco: paraNumero(h.preco) }))
      .filter((h) => h.data && h.preco > 0 && h.data >= limite && h.data < inicio);
    if (!janela.length) {
      problemas.push(problema('historico', 'Sem preços registados nos 30 dias anteriores ao início: não há prova do preço anterior', 'aviso'));
    } else {
      precoMaisBaixo30Dias = Math.min(...janela.map((h) => h.preco));
      if (precoAntes > precoMaisBaixo30Dias + 0.004) {
        problemas.push(
          problema(
            'precoAntes',
            `Preço anterior (${precoAntes.toFixed(2)} €) acima do preço mais baixo dos 30 dias anteriores ao início (${precoMaisBaixo30Dias.toFixed(2)} €) — DL 70/2007, art. 5.º`,
          ),
        );
      }
    }
  }

  if (tipo === 'conjunto') {
    const unitarios = Array.isArray(promocao.precosUnitarios) ? promocao.precosUnitarios.map(paraNumero) : [];
    if (!unitarios.length || unitarios.some((u) => !(u > 0))) {
      problemas.push(problema('precosUnitarios', 'Conjunto sem os preços unitários dos artigos: não se pode verificar o preço anterior', 'aviso'));
    } else {
      const soma = unitarios.reduce((a, b) => a + b, 0);
      if (Math.abs(soma - precoAntes) < 0.005) {
        problemas.push(problema('precoAntes', 'Conjunto com o preço anterior igual à soma dos preços unitários: proibido (DL 70/2007, art. 5.º-A, n.º 1, al. b))'));
      }
    }
  } else if (tipo !== 'artigo') {
    problemas.push(problema('tipo', `Tipo desconhecido: ${tipo} (usa 'artigo' ou 'conjunto')`));
  }

  const base = precoMaisBaixo30Dias ?? (precoAntes > 0 ? precoAntes : null);
  const percentagem = base && precoAgora > 0 && precoAgora < base ? Math.round(((base - precoAgora) / base) * 100) : null;
  return { ...concluir(problemas, modo, 'Promoção irregular'), precoMaisBaixo30Dias, percentagem };
}

const CATEGORIAS = ['geral', 'brinquedo', 'textil', 'mistura-clp', 'eee', 'pilhas', 'pneus', 'baterias'];

/**
 * Verifica a ficha de um produto antes de o pôr à venda.
 * @param {object} produto
 * @param {string} [produto.nome]
 * @param {boolean} [produto.aVenda=true]
 * @param {number|string} [produto.preco] o preço final, com IVA
 * @param {boolean} [produto.comIva=true] falso quando o preço guardado é sem IVA
 * @param {{ nome?: string, morada?: string, email?: string }} [produto.fabricante]
 * @param {string} [produto.referencia]
 * @param {string[]} [produto.avisos] avisos de segurança, visíveis sem abrir nada
 * @param {number|string} [produto.idadeMinima] brinquedos
 * @param {boolean} [produto.marcacaoCE] brinquedos
 * @param {{ material: string, percentagem: number|string }[]|string} [produto.composicao] têxteis
 * @param {string[]} [produto.perigos] misturas CLP: os tipos de perigo
 * @param {boolean} [produto.retoma] EEE, pilhas, pneus e baterias: a ficha mostra o aviso de retoma
 * @param {{ categoria?: string, modo?: 'avisar'|'bloquear', ecra?: string|Record<string,string> }} [opcoes]
 * @returns {{ problemas: object[], ok: boolean }}
 */
export function verificarProduto(produto = {}, { categoria, modo = 'avisar', ecra } = {}) {
  const problema = fazerProblema(ecra);
  const problemas = [];
  const cat = categoria || produto.categoria || 'geral';
  if (!CATEGORIAS.includes(cat)) throw new Error(`Categoria desconhecida: ${cat} (usa ${CATEGORIAS.join(', ')})`);
  const aVenda = produto.aVenda !== false;
  const preco = paraNumero(produto.preco);

  if (aVenda && !(preco > 0)) problemas.push(problema('preco', 'não vendável: sem preço (o preço mostrado tem de ser o total com IVA — DL 138/90; Lei 24/96, art. 8.º)'));
  if (aVenda && produto.comIva === false) problemas.push(problema('preco', 'Preço sem IVA: o preço mostrado tem de ser o total com IVA (DL 138/90; Lei 24/96, art. 8.º)'));

  const f = produto.fabricante || {};
  const vazio = (v) => !v || VAZIO.test(String(v));
  for (const campo of ['nome', 'morada', 'email']) {
    if (vazio(f[campo])) problemas.push(problema(`fabricante.${campo}`, `Fabricante sem ${campo} (Regulamento (UE) 2023/988, art. 19.º)`));
  }
  if (vazio(produto.referencia)) problemas.push(problema('referencia', 'Sem referência do produto (Regulamento (UE) 2023/988, art. 19.º)'));

  const avisos = Array.isArray(produto.avisos) ? produto.avisos.filter((a) => !vazio(a)) : [];

  if (cat === 'brinquedo') {
    const idade = paraNumero(produto.idadeMinima);
    if (!(idade >= 0)) problemas.push(problema('idadeMinima', 'Brinquedo sem a idade mínima (DL 43/2011)'));
    if (!avisos.some((a) => /^\s*atenção/i.test(a))) problemas.push(problema('avisos', 'Brinquedo sem aviso a começar por «Atenção» (DL 43/2011)'));
    if (produto.marcacaoCE !== true) problemas.push(problema('marcacaoCE', 'Brinquedo sem marcação CE confirmada: não pode ser anunciado (DL 43/2011)'));
  }

  if (cat === 'textil') {
    const comp = produto.composicao;
    let valida = false;
    if (Array.isArray(comp) && comp.length) {
      const partes = comp.map((c) => ({ material: c.material, pct: paraNumero(c.percentagem) }));
      const soma = partes.reduce((a, p) => a + (p.pct > 0 ? p.pct : 0), 0);
      valida = partes.every((p) => !vazio(p.material) && p.pct > 0) && Math.abs(soma - 100) < 0.5;
    } else if (typeof comp === 'string') {
      valida = /\d+\s*%/.test(comp);
    }
    if (!valida) problemas.push(problema('composicao', 'Têxtil sem composição com percentagens que somem 100 % (Regulamento (UE) 1007/2011)'));
  }

  if (cat === 'mistura-clp') {
    const perigos = Array.isArray(produto.perigos) ? produto.perigos.filter((p) => !vazio(p)) : [];
    if (!perigos.length) problemas.push(problema('perigos', 'Mistura sem os tipos de perigo (Regulamento (CE) 1272/2008 — CLP)'));
    if (!avisos.length) problemas.push(problema('avisos', 'Mistura sem avisos de segurança visíveis (Regulamento (CE) 1272/2008 — CLP)'));
  }

  if (['eee', 'pilhas', 'pneus', 'baterias'].includes(cat) && produto.retoma !== true) {
    problemas.push(problema('retoma', 'Sem aviso de retoma gratuita do usado (DL 152-D/2017, art. 13.º) — usa AVISO_RETOMA de encomenda.mjs'));
  }

  return concluir(problemas, modo, `Ficha incompleta${produto.nome ? ` (${produto.nome})` : ''}`);
}

/**
 * Pode ser mostrado como «à venda»? Falso quando não está marcado à venda ou quando a ficha tem erros.
 * @param {object} produto
 * @param {{ categoria?: string }} [opcoes]
 * @returns {boolean}
 */
export function vendavel(produto = {}, opcoes = {}) {
  if (produto.aVenda === false) return false;
  return verificarProduto(produto, { ...opcoes, modo: 'avisar' }).ok;
}
