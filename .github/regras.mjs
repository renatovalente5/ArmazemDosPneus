/* AS REGRAS DOS DADOS DA LOJA, NUM SÓ SÍTIO.
 *
 * Três leitores, e os três têm de ouvir o mesmo:
 *   · o CI do site (.github/guardas.mjs), antes de publicar;
 *   · o painel, no browser (o erro aparece por baixo do campo, antes de gravar);
 *   · o Worker do painel, ao gravar (recusa os problemas NOVOS).
 * O painel usa uma CÓPIA BYTE A BYTE deste ficheiro (estatico/js/regras.js no
 * repositório do painel), com um teste que falha se divergirem. Por isso é um
 * ES module puro: nenhum import, nada de node:*, fs, process ou require. Corre
 * tal e qual no browser, num Worker e no Node.
 *
 * E UM QUARTO, QUE TEM REGRAS SUAS: o Worker dos pagamentos
 * (worker/src/termos.js) lê do site os prazos, o custo de devolução, o
 * telefone, o email e os dados da empresa, e repete-os na página de pagamento
 * da Stripe e nos emails das encomendas. Um valor que ele recusa não chega lá:
 * vale o anterior, e o site diria uma coisa e os emails outra. Por isso, nesses
 * campos, as regras daqui são IGUAIS OU MAIS APERTADAS do que as dele — o que o
 * painel deixa gravar chega aos emails. O .github/test-guardas.mjs prova-o caso
 * a caso, contra o termos.js verdadeiro.
 *
 * CADA PROBLEMA TEM UMA CLASSE:
 *   · bloqueia   — a publicação pára. Só o que não se consegue pôr num estado
 *                  seguro sem inventar um valor: JSON ilegível, a forma dos
 *                  ficheiros, o interruptor dos pagamentos, os portes, os prazos
 *                  e o custo de devolução (vão para os Termos), e os dados que a
 *                  lei obriga (contactos, empresa).
 *   · neutraliza — um produto. Na cópia PUBLICADA do products.json (a que o
 *                  catálogo, o carrinho, o checkout e o Worker dos pagamentos
 *                  lêem) esse produto sai de venda, perde a fotografia ou sai de
 *                  todo — ver neutralizar(). O ficheiro do repositório não muda.
 *                  Um problema de um produto NUNCA pára a publicação: o stock a 0
 *                  de uma peça vendida, uma correcção de preço e o interruptor
 *                  dos pagamentos têm de passar sempre.
 *   · avisa      — só aviso. No painel, os que não são «lembrete» são erro de
 *                  campo (tamanhos, valores fora da lista): o painel nunca os
 *                  deixa gravar, mas um texto comprido num commit à mão não é
 *                  razão para parar a loja.
 *
 * problema = {
 *   classe:   'bloqueia' | 'neutraliza' | 'avisa',
 *   chave:    estável, ex. 'produto:michelin-primacy-4:etiqueta'. O Worker
 *             compara as chaves do HEAD com as da gravação e recusa só as novas;
 *             por isso UMA CHAVE TEM SEMPRE A MESMA CLASSE: se o mesmo campo
 *             pode avisar ou parar (a tabela de portes partida avisa com os
 *             portes a combinar e pára sem eles), as duas têm chaves
 *             diferentes — senão um aviso antigo que passa a parar não contava
 *             como novo, o painel gravava e o CI parava (o
 *             .github/test-guardas.mjs confere-o num varrimento);
 *   ficheiro: 'data/products.json', …
 *   ecra:     o ecrã do painel onde se corrige («Produtos › Michelin Primacy 4+»);
 *   mensagem: para o dono, em português simples, sem caminhos de JSON;
 *   campo?:   o campo onde o painel mostra o erro (ex. 'price_eur', 'delivery.max_days');
 *   campos?:  quando são vários (a etiqueta UE);
 *   efeito?:  só nos «neutraliza»: 'fora_de_venda' | 'sem_imagem' | 'retirar';
 *   indice?, sku?: só nos problemas de um produto (posição na lista e referência);
 *   lembrete?: true nos avisos que não são erro de ninguém (o artigo de teste
 *             escondido, os pneus à espera da etiqueta, o tecto a chegar).
 * }
 *
 * «NÃO FOI DITO» E NULL SÃO O MESMO em todo o lado: o Pages CMS omite os campos
 * vazios ao gravar (return_cost_eur, mounting.price_eur…), e uma regra que
 * exigisse a chave partia à primeira gravação dele. E o vazio testa-se ANTES de
 * converter: Number(null) é 0, e 0 é uma escolha.
 */

export const FICHEIROS = {
  products: 'data/products.json',
  settings: 'data/settings.json',
  content: 'data/content.json',
  site: 'data/site.json',
  empresa: 'data/empresa.json',
};

/* Os ficheiros do A2 (site.json, empresa.json): a publicação escreve-os nas
   páginas (.github/injetar-conteudo.py), por isso faltarem pára a publicação
   — e o guardas.mjs exige as metas ap:* em todas as páginas menos a do Pages
   CMS. (Antes do A2 esta lista estava vazia: ausentes, não tinham regras.) */
export const OBRIGATORIOS = ['site', 'empresa'];

export const CATEGORIAS = ['Pneus Novos', 'Pneus Seminovos', 'Jantes', 'Baterias', 'Óleos', 'Acessórios'];
export const ESTADOS = ['Novo', 'Seminovo'];
export const ESTACOES = ['', 'Verão', 'Inverno', '4 Estações'];
export const MODOS_PAGAMENTO = ['online', 'reserva'];
export const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
export const ICONES_SERVICOS = ['montagem', 'alinhamento', 'furos', 'travoes', 'amortecedores', 'oleo', 'embraiagem', 'distribuicao', 'ac', 'generico'];

/* A ordem das chaves de um produto: a do ficheiro de hoje. Uma chave nova
   acrescenta-se por esta ordem; as que já lá estão ficam onde estão. */
export const ORDEM_CHAVES_PRODUTO = ['name', 'category', 'brand', 'size', 'price_eur', 'stock', 'weight_kg', 'image', 'description', 'condition', 'season', 'available', 'featured', 'hidden', 'tyre_class', 'label_fuel', 'label_grip', 'label_noise_class', 'label_noise_db', 'snow_3pmsf', 'ice_grip', 'eprel_id', 'dot', 'tread_mm', 'warranty_months', 'sku'];
/* Sempre escritos, com o valor explícito. Um produto novo nasce com todos a
   false — nunca à venda por acidente. */
export const BOOLEANOS_PRODUTO = ['available', 'featured', 'hidden', 'snow_3pmsf', 'ice_grip'];

/* Os tectos. Iguais no Worker (recusa acima) e aqui (avisa a partir de 80 %). */
export const TECTOS = {
  produtosBytes: 256 * 1024,
  produtos: 400,
  outrosBytes: 64 * 1024,
  aviso: 0.8,
};

/* Tamanhos máximos dos textos. No painel são erro de campo; no CI, aviso. */
export const TAMANHOS = {
  nomeMin: 2, nome: 120, marca: 40, medida: 40, descricao: 2000,
  notaPagamento: 300, textoLevantamento: 80, notaPortes: 200, notaMontagem: 300,
  titulo: 80, frase: 300, paragrafo: 1200, ponto: 80, destaque: 40,
  servicoTitulo: 60, servicoTexto: 300, notaHorario: 200, notaChamada: 80,
  nomeMarca: 40, textoEmpresa: 200,
  /* Os que o Worker dos pagamentos repete nos emails e na página da Stripe
     (os mesmos tectos do worker/src/termos.js; aqui são «bloqueia»). */
  nomeLoja: 80, denominacao: 160, rua: 120, localidade: 60, concelho: 60, enderecoLivro: 200, emailLoja: 160,
};

/* O custo de devolução mais alto que o Worker dos pagamentos aceita. */
export const CUSTO_DEVOLUCAO_MAX = 1000;

/* CAMPOS DAS DEFINIÇÕES QUE O PAINEL NÃO MUDA. O dono é autónomo: nada de
   CONTEÚDO fica aqui (os prazos e o custo de devolução são dele, e as páginas
   legais acompanham-nos na publicação). Ficam só dois campos que não são
   conteúdo de ninguém e que nenhum ecrã mostra:
     · store — o legado do Pages CMS: os contactos passaram para data/site.json;
       sai do ficheiro na fase G, por um commit à mão;
     · shipping.free_pickup — ninguém o lê (o levantamento é sempre grátis).
   O Worker do painel recusa (422 campo_bloqueado) uma gravação do
   settings.json que mude um destes caminhos em relação ao HEAD — ver
   mudancasBloqueadas(). Protege-os de um defeito do painel que os deitasse
   fora ao gravar. */
export const BLOQUEADOS = ['store', 'shipping.free_pickup'];

const RE_SKU = /^[a-z0-9][a-z0-9-]{0,79}$/;
/* As fotografias vivem em assets/uploads. O Pages CMS e o painel gravam com a
   barra à frente; até 13 ago o content.json tinha-as sem ela, escritas à mão —
   o normImg do catálogo e o injetar-imagens.py aceitam as duas. Maiúsculas
   aceitam-se: o Pages CMS, ainda em uso até à fase G, pode gravar o nome tal
   como veio do telemóvel. Espaços não (um nome com espaço deita fora o
   candidato inteiro de um srcset), nem «..». */
const RE_IMAGEM = /^\/?assets\/uploads\/[A-Za-z0-9_.\/-]+\.(?:jpe?g|png|webp)$/i;
const RE_DOT = /^[0-9]{4}$/;
const RE_EPREL = /^[0-9]{3,12}$/;
const RE_HORA = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const RE_CP = /^[0-9]{4}-[0-9]{3}$/;
/* O email da loja vai também para o reply-to dos emails das encomendas: a
   regra é a do Worker dos pagamentos (termos.js), sem acentos nem espaços. */
export const RE_EMAIL_LOJA = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const RE_WHATSAPP = /^[0-9]{9,15}$/;
const RE_TELEFONE = /^\+?[0-9][0-9 ]{7,18}[0-9]$/;
const RE_ID_SERVICO = /^[a-z0-9][a-z0-9-]{0,39}$/;
/* Caracteres de controlo. Escritos por escape, nunca literais no código. */
const RE_CONTROLO_LINHA = /[\u0000-\u001F\u007F]/;
const RE_CONTROLO_TEXTO = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/* ------------------------------------------------------------------ */
/* Ajudantes que o painel e o Worker também usam                      */
/* ------------------------------------------------------------------ */

export const ePneu = (p) => /pneu/i.test((p && p.category) || '');
/* = assets/js/catalog.js (sellable) e worker/src/pricing.js: available ausente
   conta como «à venda». É por isso que um available em falta é neutralizado. */
export const vendavel = (p) => Boolean(p) && p.available !== false && Number(p.price_eur) > 0 && Number(p.stock) > 0;

/* Duas casas decimais, sem cair no ponto flutuante: 76.9*100 dá
   7690.000000000001, e Number.isInteger diria que não. */
export const duasCasas = (x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x * 100 - Math.round(x * 100)) < 1e-6;

export const terminacaoDe = (texto) => (typeof texto === 'string' && texto.endsWith('\n') ? '\n' : '');
export function serializar(obj, terminacao = '') { return JSON.stringify(obj, null, 2) + (terminacao || ''); }

/* NIF português: 9 algarismos, o primeiro nunca é 0, e o de controlo (módulo
   11). Como o do Worker dos pagamentos: um 000000000 «de espera» aparecia no
   site e os emails ficavam com o NIF anterior. */
export function nifValido(nif) {
  const s = typeof nif === 'number' ? String(nif) : nif;
  if (typeof s !== 'string' || !/^[1-9][0-9]{8}$/.test(s)) return false;
  let soma = 0;
  for (let i = 0; i < 8; i++) soma += Number(s[i]) * (9 - i);
  const resto = soma % 11;
  return (resto < 2 ? 0 : 11 - resto) === Number(s[8]);
}

/* A referência de um produto: gerada UMA vez, ao criar, a partir do nome, e
   nunca mais muda (os carrinhos guardados nos telemóveis dos clientes procuram
   por ela). «zz-» esconde o produto na loja (catalog.js) e «teste-» é o artigo
   de teste: um nome que comece assim (ou que seja só isso) leva «p-» à frente. */
export function gerarSku(nome, existentes = []) {
  const ja = existentes instanceof Set ? existentes : new Set(existentes);
  let base = String(nome == null ? '' : nome).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 60).replace(/-+$/, '');
  if (!base) base = 'produto';
  if (/^(?:zz|teste)(?:-|$)/.test(base)) base = 'p-' + base;
  let sku = base;
  for (let n = 2; ja.has(sku); n++) sku = `${base}-${n}`;
  return sku;
}

/* ------------------------------------------------------------------ */
/* Pequenos ajustes internos                                          */
/* ------------------------------------------------------------------ */

const eObjecto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ausente = (v) => v === undefined || v === null;
const vazio = (v) => ausente(v) || (typeof v === 'string' && v.trim() === '');
const temTexto = (v) => typeof v === 'string' && v.trim() !== '';
const inteiroEntre = (v, a, b) => typeof v === 'number' && Number.isInteger(v) && v >= a && v <= b;
const bytesDe = (s) => new TextEncoder().encode(s).length;

/* Um endereço https. Sem invisíveis: o \s daqui deixa passar o U+001F e o
   U+0085, que o do injector recusa (e que no endereço não fazem nada de bom). */
function urlHttps(v) {
  if (typeof v !== 'string' || !/^https:\/\/[^\s"'<>\\]+$/.test(v) || TEM_INVISIVEL.test(v)) return false;
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
}

/* --- O que o Worker dos pagamentos aceita (worker/src/termos.js) --- */

/* Os caracteres que ele troca por espaço antes de medir um texto: os de
   controlo, os separadores de linha do Unicode, os de largura zero e os de
   direcção. Construída a partir dos números, e não escrita com escapes: um
   U+2028 literal dentro da expressão é um fim de linha e parte o ficheiro. */
const FAIXAS_INVISIVEIS = [
  [0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e],
  [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff],
];
const classeDe = (faixas) => `[${faixas.map(([a, b]) => `\\u${a.toString(16).padStart(4, '0')}-\\u${b.toString(16).padStart(4, '0')}`).join('')}]`;
const INVISIVEIS = new RegExp(classeDe(FAIXAS_INVISIVEIS), 'g');
/* O texto como ele o mede: invisíveis trocados, espaços juntos, sem pontas. */
const limpo = (v) => v.replace(INVISIVEIS, ' ').replace(/\s+/g, ' ').trim();

/* --- O que a publicação aceita (.github/injetar-conteudo.py) ---
   O injector escreve o site.json e o empresa.json nas páginas, e PÁRA a
   publicação inteira num valor que não percebe — e com ela tudo o que vier
   depois, o interruptor dos pagamentos incluído. Estas regras têm de ser iguais
   ou mais apertadas do que as dele (o .github/test-guardas.mjs prova-o campo a
   campo, contra o injector verdadeiro). Duas línguas, duas ideias de «espaço»:
   o trim() e o \s daqui não tiram o U+0085 nem o U+001C–U+001F, que o strip()
   e o \s do Python tiram; e tiram o U+FEFF, que o Python não tira. Por isso,
   nos textos que vão para as páginas, um invisível é sempre um problema: só
   invisíveis = vazio (pára); no meio do texto = aviso (o painel não grava). */
const TEM_INVISIVEL = new RegExp(classeDe(FAIXAS_INVISIVEIS));
/* O mesmo, sem a tabulação e as mudanças de linha (os textos de vários
   parágrafos podem tê-las). */
const TEM_INVISIVEL_NO_TEXTO = new RegExp(classeDe([[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], ...FAIXAS_INVISIVEIS.slice(1)]));
/* Um texto só de invisíveis e espaços: aqui não está vazio (o trim() não tira
   o U+200B), e na página não se vê nada. */
const soInvisiveis = (v) => typeof v === 'string' && v.trim() !== '' && limpo(v) === '';
/* Metades de um par de surrogates sozinhas (um texto cortado a meio de um
   emoji): o JSON lê-as, mas o Python não as consegue escrever em UTF-8 e a
   publicação parava. */
const RE_PARTIDO = /\p{Cs}/u;
/* Um texto de uma linha entre min e max caracteres, medido como ele mede. */
const tamanhoParaOsEmails = (v, min, max) => typeof v === 'string' && v.length <= max * 4 && limpo(v).length >= min && limpo(v).length <= max;

/* A morada vai para a página de pagamento da Stripe, que desenha Markdown:
   letras, algarismos, espaços e estes sinais, mais nenhum. */
const RE_MORADA = /^[\p{L}\p{M}\p{N} .,'’ºª°/&()-]+$/u;
export const SINAIS_DA_MORADA = ". , ' ’ º ª ° / & ( ) -";
export const parteDeMoradaValida = (v, min, max) => tamanhoParaOsEmails(v, min, max) && RE_MORADA.test(limpo(v));

export const emailDaLojaValido = (v) => typeof v === 'string' && v.length <= TAMANHOS.emailLoja && RE_EMAIL_LOJA.test(v.trim());

/* O endereço do Livro de Reclamações: https, sem utilizador nem palavra-passe,
   e até 200 caracteres DEPOIS de normalizado (uma aspa vira %22). */
function urlParaOsEmails(v) {
  if (!urlHttps(v) || !tamanhoParaOsEmails(v, 10, TAMANHOS.enderecoLivro)) return false;
  try {
    const u = new URL(limpo(v));
    return u.protocol === 'https:' && !u.username && !u.password && u.href.length <= TAMANHOS.enderecoLivro;
  } catch { return false; }
}

function caminhoDeImagem(c) {
  return typeof c === 'string' && RE_IMAGEM.test(c) && !/(?:^|\/)\.\.?(?:\/|$)/.test(c) && !c.includes('//');
}

/* As marcas **negrito** e *itálico* lidas como o injector as lê (com_marcas,
   em .github/injetar-conteudo.py): primeiro os pares de «**», depois os de «*»,
   sempre o par mais curto com pelo menos um carácter dentro — e um «*» que
   sobre pára a publicação. É uma simulação das mesmas duas expressões, e não
   uma contagem: «****» tem os asteriscos em número par e sobra um («**» sem
   nada dentro não é negrito). O «.» daqui não apanha o \r, o U+2028 nem o
   U+2029, que o do Python apanha: aqui fica mais apertado, nunca mais largo. */
function marcasEquilibradas(s) {
  return !s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').includes('*');
}

/* O caminho (ex.: 'servicos.0.titulo') do primeiro texto partido (RE_PARTIDO)
   dentro de um ficheiro, ou null. */
function caminhoPartido(o, pre = '') {
  const junta = (k) => (pre ? `${pre}.${k}` : String(k));
  if (typeof o === 'string') return RE_PARTIDO.test(o) ? pre : null;
  // Array.from e não map: uma lista com buracos (um objecto, não um JSON lido) não pode rebentar aqui.
  const filhos = Array.isArray(o) ? Array.from(o, (v, i) => [i, v]) : eObjecto(o) ? Object.entries(o) : [];
  for (const [k, v] of filhos) {
    const c = caminhoPartido(v, junta(k));
    if (c !== null) return c;
  }
  return null;
}

function valorEm(obj, caminho) {
  let v = obj;
  for (const k of caminho.split('.')) {
    if (!eObjecto(v)) return undefined;
    v = v[k];
  }
  return v;
}

/* Igualdade para comparar valores lidos de JSON, com null ≡ ausente e sem ligar
   à ordem das chaves. */
function mesmoValor(a, b) {
  if (ausente(a) && ausente(b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => mesmoValor(x, b[i]));
  }
  if (eObjecto(a) || eObjecto(b)) {
    if (!eObjecto(a) || !eObjecto(b)) return false;
    const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of chaves) if (!mesmoValor(a[k], b[k])) return false;
    return true;
  }
  return a === b;
}

/* O que mudou em BLOQUEADOS entre o HEAD e a gravação, mais as chaves de topo
   acrescentadas. [] = pode gravar. */
export function mudancasBloqueadas(antes, depois) {
  const a = eObjecto(antes) ? antes : {};
  const d = eObjecto(depois) ? depois : {};
  const out = [];
  for (const caminho of BLOQUEADOS) {
    if (!mesmoValor(valorEm(a, caminho), valorEm(d, caminho))) out.push({ caminho, motivo: 'mudou' });
  }
  for (const k of Object.keys(d)) if (!(Object.prototype.hasOwnProperty.call(a, k))) out.push({ caminho: k, motivo: 'chave_nova' });
  return out;
}

/* Lê um dos ficheiros. O valor pode ser o TEXTO do ficheiro (string), o objecto
   já lido, ou null/undefined quando o ficheiro não existe. */
function lerFicheiro(qual, valor, lista, ecra) {
  const ficheiro = FICHEIROS[qual];
  if (ausente(valor)) return { ausente: true };
  if (typeof valor !== 'string') return { obj: valor, texto: null };
  try {
    return { obj: JSON.parse(valor), texto: valor };
  } catch (e) {
    lista.push({
      classe: 'bloqueia', chave: `${qual}:ilegivel`, ficheiro, ecra,
      mensagem: `O ficheiro ${ficheiro} não se consegue ler (JSON inválido: ${String(e && e.message || e).slice(0, 120)}). Só o Renato o pode corrigir.`,
    });
    return { ilegivel: true, texto: valor };
  }
}

const NOMES_CAMPOS = {
  name: 'nome', price_eur: 'preço', stock: 'unidades em stock', weight_kg: 'peso',
  condition: 'estado (Novo ou Seminovo)', available: '«À venda online»', category: 'categoria',
  label_fuel: 'combustível (A a E)', label_grip: 'piso molhado (A a E)', label_noise_class: 'classe de ruído (A a C)',
  label_noise_db: 'ruído em dB (50 a 99)', eprel_id: 'n.º EPREL', dot: 'DOT (4 algarismos)',
  tread_mm: 'sulco (1,6 a 20 mm)', warranty_months: 'garantia (18 a 36 meses)',
  featured: '«Destaque na página inicial»', hidden: '«Escondido (artigo de teste)»',
  snow_3pmsf: '«Neve (3PMSF)»', ice_grip: '«Gelo»',
};

/* ------------------------------------------------------------------ */
/* Um produto                                                          */
/* ------------------------------------------------------------------ */

function idDoProduto(p, indice) {
  return eObjecto(p) && typeof p.sku === 'string' && p.sku.trim() ? p.sku : `#${indice + 1}`;
}
function ecraDoProduto(p, indice) {
  const nome = eObjecto(p) && temTexto(p.name) ? p.name.trim() : (eObjecto(p) && temTexto(p.sku) ? p.sku : `produto n.º ${indice + 1}`);
  return `Produtos › ${nome}`;
}

/* O que falta a um pneu novo para poder estar à venda (Reg. (UE) 2020/740). */
export function faltasDaEtiqueta(p) {
  const f = [];
  if (!['A', 'B', 'C', 'D', 'E'].includes(p.label_fuel)) f.push('label_fuel');
  if (!['A', 'B', 'C', 'D', 'E'].includes(p.label_grip)) f.push('label_grip');
  if (!['A', 'B', 'C'].includes(p.label_noise_class)) f.push('label_noise_class');
  if (!inteiroEntre(p.label_noise_db, 50, 99)) f.push('label_noise_db');
  const eprel = typeof p.eprel_id === 'number' && Number.isInteger(p.eprel_id) ? String(p.eprel_id) : p.eprel_id;
  if (!(typeof eprel === 'string' && RE_EPREL.test(eprel))) f.push('eprel_id');
  return f;
}
/* O que falta a um pneu seminovo para poder estar à venda (decisão de 5 ago).
   A garantia: o DL 84/2021 (art. 12.º, n.º 3) só deixa reduzir os 3 anos de
   um bem usado até 18 meses, e por acordo — os 12 meses eram do regime
   antigo (DL 67/2003). Abaixo de 18, o cartão anunciava ao cliente menos
   direitos do que a lei lhe dá. */
export const GARANTIA_MINIMA_USADOS = 18;
export function faltasDoSeminovo(p) {
  const f = [];
  if (!(typeof p.dot === 'string' && RE_DOT.test(p.dot))) f.push('dot');
  if (!(typeof p.tread_mm === 'number' && p.tread_mm >= 1.6 && p.tread_mm <= 20)) f.push('tread_mm');
  if (!inteiroEntre(p.warranty_months, GARANTIA_MINIMA_USADOS, 36)) f.push('warranty_months');
  return f;
}
const listaDeCampos = (campos) => campos.map((c) => NOMES_CAMPOS[c] || c).join(', ');

/* Os problemas de UM produto, sem os que dependem dos outros (SKU repetido).
   ctx = { indice, imagemExiste? }. O painel usa-o campo a campo. */
export function problemasDoProduto(p, ctx = {}) {
  const indice = Number.isInteger(ctx.indice) ? ctx.indice : 0;
  const imagemExiste = typeof ctx.imagemExiste === 'function' ? ctx.imagemExiste : null;
  const ficheiro = FICHEIROS.products;
  const out = [];
  const ecra = ecraDoProduto(p, indice);
  const id = idDoProduto(p, indice);
  const sku = eObjecto(p) && typeof p.sku === 'string' ? p.sku : undefined;
  const base = { ficheiro, ecra, indice, ...(sku !== undefined ? { sku } : {}) };
  const neutraliza = (regra, campo, efeito, mensagem, extra = {}) =>
    out.push({ classe: 'neutraliza', chave: `produto:${id}:${regra}`, campo, efeito, mensagem, ...base, ...extra });
  const avisa = (regra, campo, mensagem, extra = {}) =>
    out.push({ classe: 'avisa', chave: `produto:${id}:${regra}`, campo, mensagem, ...base, ...extra });

  if (!eObjecto(p)) return out;   // a forma do ficheiro é do problemas(): bloqueia

  // --- neutraliza -------------------------------------------------------
  if (!(typeof p.sku === 'string' && RE_SKU.test(p.sku))) {
    neutraliza('sku', 'sku', 'retirar', 'Não tem uma referência válida (só minúsculas, algarismos e hífens): não aparece na loja nem se pode comprar. Só o Renato a pode corrigir.');
  }
  if (typeof p.available !== 'boolean') {
    neutraliza('disponivel', 'available', 'fora_de_venda', '«À venda online» não está gravado (sim ou não): fica fora de venda até ser gravado.');
  }
  if (!(typeof p.price_eur === 'number' && Number.isFinite(p.price_eur) && p.price_eur >= 0 && duasCasas(p.price_eur))) {
    neutraliza('preco', 'price_eur', 'fora_de_venda', 'O preço está em falta ou não é válido (use um valor como 89,90; a zero fica «Sob consulta»): fica fora de venda.');
  }
  if (!inteiroEntre(p.stock, 0, 9999)) {
    neutraliza('stock', 'stock', 'fora_de_venda', 'As unidades em stock estão em falta ou não são um número inteiro de 0 a 9999: fica fora de venda.');
  }
  if (!(typeof p.weight_kg === 'number' && p.weight_kg > 0 && p.weight_kg <= 999 && duasCasas(p.weight_kg))) {
    neutraliza('peso', 'weight_kg', 'fora_de_venda', 'O peso está em falta ou não é válido (mais de 0 e até 999 kg, no máximo 2 casas decimais): fica fora de venda, porque os portes saem do peso.');
  }
  const nomeOk = typeof p.name === 'string' && p.name.trim().length >= TAMANHOS.nomeMin && p.name.trim().length <= TAMANHOS.nome;
  if (!nomeOk) {
    neutraliza('nome', 'name', 'fora_de_venda', `O nome está em falta ou tem mais de ${TAMANHOS.nome} caracteres: fica fora de venda (o nome vai para o pagamento e para a fatura).`);
  }
  if (!ESTADOS.includes(p.condition)) {
    neutraliza('estado', 'condition', 'fora_de_venda', 'O estado tem de ser «Novo» ou «Seminovo»: fica fora de venda.');
  }
  const pneu = ePneu(p);
  if (pneu && p.condition === 'Novo' && vendavel(p)) {
    const f = faltasDaEtiqueta(p);
    if (f.length) {
      neutraliza('etiqueta', f[0], 'fora_de_venda', `Pneu novo à venda sem a etiqueta UE completa (falta: ${listaDeCampos(f)}): fica fora de venda na loja até a etiqueta estar preenchida.`, { campos: f });
    }
  }
  if (pneu && p.condition === 'Seminovo' && vendavel(p)) {
    const f = faltasDoSeminovo(p);
    if (f.length) {
      neutraliza('seminovo', f[0], 'fora_de_venda', `Pneu seminovo à venda sem os dados obrigatórios (falta: ${listaDeCampos(f)}): fica fora de venda na loja até estarem preenchidos.`, { campos: f });
    }
  }
  if (!vazio(p.image)) {
    if (!caminhoDeImagem(p.image)) {
      neutraliza('imagem', 'image', 'sem_imagem', 'A fotografia não é um ficheiro da pasta das fotografias do site: na loja aparece o logótipo em vez dela. Escolha outra fotografia.');
    } else if (imagemExiste && !imagemExiste(p.image)) {
      neutraliza('imagem', 'image', 'sem_imagem', 'A fotografia foi apagada: na loja aparece o logótipo em vez dela. Escolha outra fotografia.');
    }
  }

  // --- avisa --------------------------------------------------------------
  for (const b of ['featured', 'hidden', 'snow_3pmsf', 'ice_grip']) {
    if (typeof p[b] !== 'boolean') avisa(`booleano-${b}`, b, `${NOMES_CAMPOS[b]} não está gravado (sim ou não): vale como «não».`);
  }
  if (!CATEGORIAS.includes(p.category)) avisa('categoria', 'category', `A categoria tem de ser uma destas: ${CATEGORIAS.join(', ')}.`);
  if (!ausente(p.season) && !ESTACOES.includes(p.season)) avisa('estacao', 'season', 'A estação tem de ser Verão, Inverno ou 4 Estações (ou nenhuma).');
  if (!ausente(p.tyre_class) && !['', 'C1', 'C2', 'C3'].includes(p.tyre_class)) avisa('classe', 'tyre_class', 'A classe do pneu tem de ser C1, C2 ou C3 (ou nenhuma).');
  const textos = [['brand', TAMANHOS.marca, 'marca'], ['size', TAMANHOS.medida, 'medida'], ['description', TAMANHOS.descricao, 'descrição']];
  for (const [campo, max, nome] of textos) {
    const v = p[campo];
    if (ausente(v)) continue;
    if (typeof v !== 'string') avisa(`texto-${campo}`, campo, `A ${nome} tem de ser texto.`);
    else if (v.length > max) avisa(`tamanho-${campo}`, campo, `A ${nome} tem mais de ${max} caracteres.`);
  }
  for (const campo of ['name', 'brand', 'size']) {
    if (typeof p[campo] === 'string' && RE_CONTROLO_LINHA.test(p[campo])) avisa(`controlo-${campo}`, campo, `O campo ${NOMES_CAMPOS[campo] || campo} tem caracteres invisíveis (ex.: uma mudança de linha). Escreva-o outra vez.`);
  }
  if (typeof p.description === 'string' && RE_CONTROLO_TEXTO.test(p.description)) avisa('controlo-description', 'description', 'A descrição tem caracteres invisíveis. Escreva-a outra vez.');
  if (p.hidden === true && vendavel(p)) {
    avisa('escondido-a-venda', 'hidden', 'Artigo escondido mas à venda: quem abrir a loja com ?teste=1 no endereço pode comprá-lo (é o artigo de teste?).', { lembrete: true });
  }
  if (pneu && p.available === false && typeof p.price_eur === 'number' && p.price_eur > 0) {
    const f = p.condition === 'Seminovo' ? faltasDoSeminovo(p) : p.condition === 'Novo' ? faltasDaEtiqueta(p) : [];
    if (f.length) {
      /* Um pneu novo sem a etiqueta UE completa aparece na loja SEM o preço
         («Sob consulta»): o Reg. (UE) 2020/740 obriga a etiqueta junto de
         qualquer preço anunciado (assets/js/catalog.js). */
      const mensagem = p.condition === 'Novo'
        ? `Pneu novo sem a etiqueta UE completa: na loja aparece sem preço («Sob consulta») e fora de venda. Para o pôr à venda falta ${listaDeCampos(f)}.`
        : `Pneu com preço à vista mas fora de venda: para o pôr à venda falta ${listaDeCampos(f)}.`;
      avisa('a-espera', f[0], mensagem, { campos: f, lembrete: true });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* products.json                                                       */
/* ------------------------------------------------------------------ */

function problemasDosProdutos(lido, lista, { imagemExiste }) {
  const ficheiro = FICHEIROS.products;
  const ecra = 'Produtos';
  if (lido.ilegivel) return;
  const doc = lido.obj;
  if (!eObjecto(doc) || !Array.isArray(doc.products)) {
    lista.push({ classe: 'bloqueia', chave: 'products:forma', ficheiro, ecra, mensagem: 'A lista de produtos não tem a forma certa (falta a lista «products»). Só o Renato a pode corrigir.' });
    return;
  }
  const produtos = doc.products;
  produtos.forEach((p, i) => {
    if (!eObjecto(p)) {
      lista.push({ classe: 'bloqueia', chave: `products:elemento:${i + 1}`, ficheiro, ecra, indice: i, mensagem: `O ${i + 1}.º elemento da lista de produtos não é um produto. Só o Renato o pode corrigir.` });
    }
  });
  if (lista.some((x) => x.classe === 'bloqueia' && x.ficheiro === ficheiro)) return;

  produtos.forEach((p, i) => lista.push(...problemasDoProduto(p, { indice: i, imagemExiste })));

  /* SKU repetido: o Worker dos pagamentos usa o último (pricing.js) e o carrinho
     não os distingue. Saem de venda TODOS os que o partilham. */
  const porSku = new Map();
  produtos.forEach((p, i) => {
    if (typeof p.sku === 'string' && RE_SKU.test(p.sku)) porSku.set(p.sku, [...(porSku.get(p.sku) || []), i]);
  });
  for (const [sku, indices] of porSku) {
    if (indices.length < 2) continue;
    for (const i of indices) {
      lista.push({
        classe: 'neutraliza', chave: `produto:${sku}:repetido`, ficheiro, ecra: ecraDoProduto(produtos[i], i), indice: i, sku,
        campo: 'sku', efeito: 'fora_de_venda',
        mensagem: `A referência «${sku}» está em ${indices.length} produtos: ficam todos fora de venda até só haver um. Só o Renato o pode corrigir.`,
      });
    }
  }

  // Tectos: acima deles o Worker do painel não grava; aqui só se avisa.
  const bytes = lido.texto !== null ? bytesDe(lido.texto) : bytesDe(serializar(doc));
  const pBytes = bytes / TECTOS.produtosBytes;
  const pN = produtos.length / TECTOS.produtos;
  if (pBytes > TECTOS.aviso || pN > TECTOS.aviso) {
    const acima = pBytes > 1 || pN > 1;
    lista.push({
      classe: 'avisa', chave: 'products:tecto', ficheiro, ecra, lembrete: true,
      mensagem: acima
        ? `A lista de produtos passou do limite do painel (${produtos.length} produtos, ${Math.round(bytes / 1024)} KB; o limite é ${TECTOS.produtos} produtos e ${TECTOS.produtosBytes / 1024} KB). Fale com o Renato.`
        : `A lista de produtos está a chegar ao limite do painel (${produtos.length} de ${TECTOS.produtos} produtos, ${Math.round(bytes / 1024)} de ${TECTOS.produtosBytes / 1024} KB). Fale com o Renato.`,
    });
  }
}

/* ------------------------------------------------------------------ */
/* settings.json                                                       */
/* ------------------------------------------------------------------ */

function problemasDasDefinicoes(lido, lista) {
  const ficheiro = FICHEIROS.settings;
  if (lido.ilegivel) return;
  const s = lido.obj;
  const bloqueia = (chave, ecra, campo, mensagem) => lista.push({ classe: 'bloqueia', chave: `settings:${chave}`, ficheiro, ecra, campo, mensagem });
  const avisa = (chave, ecra, campo, mensagem) => lista.push({ classe: 'avisa', chave: `settings:${chave}`, ficheiro, ecra, campo, mensagem });
  if (!eObjecto(s)) { bloqueia('forma', 'Loja online', undefined, 'As definições da loja não têm a forma certa. Só o Renato as pode corrigir.'); return; }

  // Pagamentos: o interruptor de emergência. Ausente seria «ligado» em silêncio.
  const E_PAG = 'Loja online › Pagamentos';
  const pag = s.payment;
  if (!eObjecto(pag) || !MODOS_PAGAMENTO.includes(pag.mode)) {
    bloqueia('payment.mode', E_PAG, 'payment.mode', 'O interruptor dos pagamentos online não está gravado (Ligados ou Desligados).');
  }
  if (eObjecto(pag) && !ausente(pag.note)) {
    if (typeof pag.note !== 'string') avisa('payment.note', E_PAG, 'payment.note', 'O texto do checkout sobre os pagamentos tem de ser texto.');
    else if (pag.note.length > TAMANHOS.notaPagamento) avisa('payment.note', E_PAG, 'payment.note', `O texto do checkout sobre os pagamentos tem mais de ${TAMANHOS.notaPagamento} caracteres.`);
  }

  // Portes: o que o Worker cobra.
  const E_PORTES = 'Loja online › Portes';
  const sh = s.shipping;
  if (!eObjecto(sh)) {
    bloqueia('shipping', E_PORTES, 'shipping', 'As definições dos portes não estão gravadas.');
  } else {
    let combinar = false;
    if (ausente(sh.quote_later)) {
      /* Antes de 7 ago o interruptor não existia; ausente vale «desligado» no
         checkout e no Worker (!!undefined), e aí a tabela tem de estar certa. */
      avisa('shipping.quote_later:em-falta', E_PORTES, 'shipping.quote_later', '«Portes combinados depois da encomenda» não está gravado: vale como desligado (os portes são cobrados pela tabela).');
    } else if (typeof sh.quote_later !== 'boolean') {
      bloqueia('shipping.quote_later', E_PORTES, 'shipping.quote_later', '«Portes combinados depois da encomenda» tem de ser sim ou não.');
    } else combinar = sh.quote_later;
    const t = sh.tiers;
    const erroTabela = (() => {
      if (!Array.isArray(t) || t.length < 1 || t.length > 10) return 'a tabela de portes tem de ter de 1 a 10 escalões';
      let anterior = 0;
      for (let i = 0; i < t.length; i++) {
        const e = t[i];
        if (!eObjecto(e)) return `o ${i + 1}.º escalão não está preenchido`;
        if (!(typeof e.max_kg === 'number' && Number.isFinite(e.max_kg) && e.max_kg > 0)) return `o ${i + 1}.º escalão não tem o peso máximo`;
        if (!(e.max_kg > anterior)) return `os pesos dos escalões têm de ir sempre a subir (o ${i + 1}.º não sobe)`;
        anterior = e.max_kg;
        if (!(typeof e.price === 'number' && e.price > 0 && duasCasas(e.price))) return `o preço do ${i + 1}.º escalão tem de ser maior que zero, com 2 casas decimais no máximo`;
      }
      return null;
    })();
    if (erroTabela) {
      if (combinar) avisa('shipping.tiers:a-combinar', E_PORTES, 'shipping.tiers', `Na tabela de portes, ${erroTabela}. Não conta enquanto os portes forem combinados depois, mas corrija antes de o desligar.`);
      else bloqueia('shipping.tiers', E_PORTES, 'shipping.tiers', `Na tabela de portes, ${erroTabela} (é por ela que os portes são cobrados).`);
    }
    for (const [campo, max, nome] of [['pickup_label', TAMANHOS.textoLevantamento, 'O texto do levantamento'], ['note', TAMANHOS.notaPortes, 'A nota dos portes']]) {
      const v = sh[campo];
      if (ausente(v)) continue;
      if (typeof v !== 'string') avisa(`shipping.${campo}`, campo === 'pickup_label' ? 'Loja online › Levantamento' : E_PORTES, `shipping.${campo}`, `${nome} tem de ser texto.`);
      else if (v.length > max) avisa(`shipping.${campo}`, campo === 'pickup_label' ? 'Loja online › Levantamento' : E_PORTES, `shipping.${campo}`, `${nome} tem mais de ${max} caracteres.`);
    }
  }

  /* Prazos: o dono muda-os, e vão para o checkout, para os Termos (na
     publicação) e para os emails e a página da Stripe (fase W). Uma promessa
     legal: em falta ou fora da regra, pára. */
  const E_PRAZOS = 'Loja online › Prazos e devoluções';
  const d = s.delivery;
  if (!eObjecto(d)) {
    bloqueia('delivery', E_PRAZOS, 'delivery', 'Os prazos de entrega não estão gravados.');
  } else {
    const min = d.estimate_min_days, max = d.estimate_max_days, lim = d.max_days;
    if (!inteiroEntre(min, 1, 30)) bloqueia('delivery.estimate_min_days', E_PRAZOS, 'delivery.estimate_min_days', 'A estimativa de entrega (mínimo, em dias úteis) tem de ser um número inteiro de 1 a 30.');
    if (!inteiroEntre(max, 1, 30)) bloqueia('delivery.estimate_max_days', E_PRAZOS, 'delivery.estimate_max_days', 'A estimativa de entrega (máximo, em dias úteis) tem de ser um número inteiro de 1 a 30.');
    if (!inteiroEntre(lim, 1, 30)) bloqueia('delivery.max_days', E_PRAZOS, 'delivery.max_days', 'O prazo máximo de entrega tem de ser um número inteiro de 1 a 30 dias (a lei não deixa passar dos 30 sem acordo com o cliente).');
    if (inteiroEntre(min, 1, 30) && inteiroEntre(max, 1, 30) && min > max) bloqueia('delivery.estimativa', E_PRAZOS, 'delivery.estimate_min_days', 'Na estimativa de entrega, o mínimo não pode ser maior do que o máximo.');
    if (inteiroEntre(max, 1, 30) && inteiroEntre(lim, 1, 30) && max > lim) bloqueia('delivery.limite', E_PRAZOS, 'delivery.max_days', 'O prazo máximo de entrega não pode ser mais curto do que a estimativa.');
  }
  /* Custo de devolução: vazio = a loja paga (DL 24/2014, art. 10.º n.º 2
     al. b)). Um número vai para o checkout e para os Termos. */
  const r = s.returns;
  if (!ausente(r) && !eObjecto(r)) {
    bloqueia('returns', E_PRAZOS, 'returns', 'As definições das devoluções não têm a forma certa.');
  } else if (eObjecto(r) && !ausente(r.return_cost_eur) && !(typeof r.return_cost_eur === 'number' && r.return_cost_eur >= 0 && r.return_cost_eur <= CUSTO_DEVOLUCAO_MAX && duasCasas(r.return_cost_eur))) {
    bloqueia('returns.return_cost_eur', E_PRAZOS, 'returns.return_cost_eur', `O custo de devolução tem de ser um valor em euros até ${CUSTO_DEVOLUCAO_MAX} € (ex.: 6,50), ou ficar vazio se for a loja a pagar.`);
  }

  // Montagem: só o checkout a mostra.
  const E_MONT = 'Loja online › Montagem';
  const m = s.mounting;
  if (!ausente(m) && !eObjecto(m)) avisa('mounting', E_MONT, 'mounting', 'As definições da montagem não têm a forma certa.');
  if (eObjecto(m)) {
    if (!ausente(m.price_eur) && !(typeof m.price_eur === 'number' && m.price_eur >= 0 && duasCasas(m.price_eur))) {
      avisa('mounting.price_eur', E_MONT, 'mounting.price_eur', 'O preço da montagem tem de ser um valor em euros (ex.: 10,00), ou ficar vazio.');
    }
    if (!ausente(m.note) && (typeof m.note !== 'string' || m.note.length > TAMANHOS.notaMontagem)) {
      avisa('mounting.note', E_MONT, 'mounting.note', `O texto da montagem tem de ser texto, com ${TAMANHOS.notaMontagem} caracteres no máximo.`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* content.json                                                        */
/* ------------------------------------------------------------------ */

function problemasDoConteudo(lido, lista, { imagemExiste }) {
  const ficheiro = FICHEIROS.content;
  const ecra = 'Fotografias do site';
  if (lido.ilegivel) return;
  const c = lido.obj;
  if (!eObjecto(c)) {
    lista.push({ classe: 'bloqueia', chave: 'content:forma', ficheiro, ecra, mensagem: 'As fotografias do site não têm a forma certa. Só o Renato as pode corrigir.' });
    return;
  }
  for (const [sec, nome] of [['hero', 'do topo'], ['sobre', 'da secção Sobre']]) {
    const img = eObjecto(c[sec]) ? c[sec].image : undefined;
    const campo = `${sec}.image`;
    if (vazio(img)) lista.push({ classe: 'bloqueia', chave: `content:${campo}`, ficheiro, ecra, campo, mensagem: `Falta a fotografia ${nome}.` });
    else if (!caminhoDeImagem(img)) lista.push({ classe: 'bloqueia', chave: `content:${campo}`, ficheiro, ecra, campo, mensagem: `A fotografia ${nome} não é um ficheiro da pasta das fotografias do site. Escolha outra.` });
    else if (imagemExiste && !imagemExiste(img)) lista.push({ classe: 'bloqueia', chave: `content:${campo}`, ficheiro, ecra, campo, mensagem: `A fotografia ${nome} foi apagada. Escolha outra.` });
  }
}

/* ------------------------------------------------------------------ */
/* site.json — contactos, horário, serviços, textos (fase A2)          */
/* ------------------------------------------------------------------ */

function problemasDoSite(lido, lista) {
  const ficheiro = FICHEIROS.site;
  if (lido.ilegivel) return;
  const s = lido.obj;
  const E_CONT = 'Contactos e horário', E_SERV = 'Serviços', E_TEXT = 'Textos da página inicial';
  const bloqueia = (chave, ecra, campo, mensagem) => lista.push({ classe: 'bloqueia', chave: `site:${chave}`, ficheiro, ecra, campo, mensagem });
  const avisa = (chave, ecra, campo, mensagem) => lista.push({ classe: 'avisa', chave: `site:${chave}`, ficheiro, ecra, campo, mensagem });
  if (!eObjecto(s)) { bloqueia('forma', E_CONT, undefined, 'Os contactos e textos do site não têm a forma certa. Só o Renato os pode corrigir.'); return; }
  const partido = caminhoPartido(s);
  if (partido !== null) {
    const ecraPartido = /^servicos(\.|$)/.test(partido) ? E_SERV : /^(textos|marcas)(\.|$)/.test(partido) ? E_TEXT : E_CONT;
    bloqueia('texto-partido', ecraPartido, partido, 'Um texto tem um carácter partido (metade de um emoji ou de um símbolo, de um copiar e colar). Apague-o e escreva outra vez.');
  }

  /* Um texto que o injector escreve no HTML: presente, sem < nem >, com as
     marcas de **negrito** e *itálico* fechadas. Devolve true se estiver bom. */
  const textoDoSite = (valor, chave, ecra, campo, nome, max, { obrigatorio = true, linha = true } = {}) => {
    if (vazio(valor)) {
      if (obrigatorio) { bloqueia(chave, ecra, campo, `${nome}: está vazio.`); return false; }
      return true;
    }
    if (typeof valor !== 'string') { bloqueia(chave, ecra, campo, `${nome}: tem de ser texto.`); return false; }
    if (soInvisiveis(valor)) { bloqueia(chave, ecra, campo, `${nome}: está vazio (só tem caracteres invisíveis). Escreva-o outra vez.`); return false; }
    if (/[<>]/.test(valor)) { bloqueia(chave, ecra, campo, `${nome}: não pode ter os sinais < nem >.`); return false; }
    if (!marcasEquilibradas(valor)) { bloqueia(chave, ecra, campo, `${nome}: há um * sem par (o **negrito** e o *itálico* abrem e fecham, cada um com texto dentro: «****» não é nada).`); return false; }
    if ((linha ? TEM_INVISIVEL : TEM_INVISIVEL_NO_TEXTO).test(valor)) avisa(`${chave}:controlo`, ecra, campo, `${nome}: tem caracteres invisíveis. Escreva-o outra vez.`);
    if (max && valor.length > max) avisa(`${chave}:tamanho`, ecra, campo, `${nome}: tem mais de ${max} caracteres.`);
    return true;
  };
  const listaDeTextos = (valor, chave, ecra, campo, nome, max, { min = 0, maxItens = 12 } = {}) => {
    if (!Array.isArray(valor)) { bloqueia(chave, ecra, campo, `${nome}: está em falta.`); return; }
    if (valor.length < min) bloqueia(chave, ecra, campo, `${nome}: tem de ter pelo menos ${min}.`);
    if (valor.length > maxItens) avisa(`${chave}:quantos`, ecra, campo, `${nome}: são mais de ${maxItens}.`);
    valor.forEach((v, i) => textoDoSite(v, `${chave}.${i + 1}`, ecra, `${campo}.${i}`, `${nome} (${i + 1}.º)`, max));
  };

  // --- contactos (DL 7/2004: um contacto directo e o email) ---------------
  /* O telefone e o WhatsApp são os dois obrigatórios: a lei pede um contacto
     directo, e as páginas precisam dos dois — o telefone está no cabeçalho, no
     rodapé e nas páginas legais, e os botões «Pedir orçamento» vão para o
     WhatsApp. Sem um deles a publicação não tinha o que lá escrever. */
  const c = s.contactos;
  if (!eObjecto(c)) {
    bloqueia('contactos', E_CONT, 'contactos', 'Os contactos da loja não estão gravados.');
  } else {
    if (vazio(c.email)) bloqueia('contactos.email', E_CONT, 'contactos.email', 'O email da loja está vazio (a lei obriga a mostrá-lo).');
    else if (!emailDaLojaValido(c.email)) bloqueia('contactos.email', E_CONT, 'contactos.email', 'O email da loja não está bem escrito (ex.: loja@exemplo.pt — sem acentos nem espaços).');
    if (vazio(c.telefone)) bloqueia('contactos.telefone', E_CONT, 'contactos.telefone', 'O telefone da loja está vazio (aparece em todas as páginas, e a lei obriga a um contacto directo).');
    if (vazio(c.whatsapp)) bloqueia('contactos.whatsapp', E_CONT, 'contactos.whatsapp', 'O WhatsApp da loja está vazio (os botões «Pedir orçamento» do site vão para ele).');
    for (const [campo, nome] of [['telefone', 'O telefone'], ['telefone2', 'O segundo telefone']]) {
      const v = c[campo];
      if (vazio(v)) continue;
      const digitos = typeof v === 'string' ? v.replace(/[^0-9]/g, '').length : 0;
      if (typeof v !== 'string' || !RE_TELEFONE.test(v.trim()) || digitos < 9 || digitos > 15) bloqueia(`contactos.${campo}`, E_CONT, `contactos.${campo}`, `${nome} não está bem escrito (só algarismos e espaços, ex.: 935 218 857).`);
    }
    if (!vazio(c.whatsapp) && !(typeof c.whatsapp === 'string' && RE_WHATSAPP.test(c.whatsapp))) {
      bloqueia('contactos.whatsapp', E_CONT, 'contactos.whatsapp', 'O WhatsApp não está bem escrito (só algarismos, com o indicativo, sem espaços nem +; ex.: 351935218857).');
    } else if (typeof c.whatsapp === 'string' && (c.whatsapp.length === 9 || c.whatsapp.startsWith('0'))) {
      /* O wa.me lê o número como internacional: «912345678» é a Índia (+91), e
         todos os botões «Pedir orçamento» iam para lá sem ninguém dar por isso
         (o telefone não tem o problema: a publicação junta-lhe o +351). Um
         número começado por 0 (00351…) também não é o formato do wa.me. */
      const pt = c.whatsapp.length === 9 && /^[29]/.test(c.whatsapp) ? ` Para um número português, escreva 351${c.whatsapp}.` : '';
      bloqueia('contactos.whatsapp', E_CONT, 'contactos.whatsapp', `O WhatsApp tem de levar o indicativo do país à frente, sem 00 nem +.${pt}`);
    }
    if (!vazio(c.facebook) && !urlHttps(c.facebook)) bloqueia('contactos.facebook', E_CONT, 'contactos.facebook', 'O endereço do Facebook tem de começar por https:// (e não pode ter espaços nem caracteres invisíveis).');
    /* DL 59/2021: um número de telefone publicado leva a indicação do preço da
       chamada («Chamada para a rede móvel nacional»). */
    if ((!vazio(c.telefone) || !vazio(c.telefone2)) && vazio(c.nota_chamada)) {
      bloqueia('contactos.nota_chamada', E_CONT, 'contactos.nota_chamada', 'Falta a nota do preço da chamada (ex.: «Chamada para a rede móvel nacional»), que a lei obriga junto do telefone.');
    } else if (!vazio(c.nota_chamada)) {
      textoDoSite(c.nota_chamada, 'contactos.nota_chamada', E_CONT, 'contactos.nota_chamada', 'A nota do preço da chamada', TAMANHOS.notaChamada);
    }
  }

  // --- horário -------------------------------------------------------------
  const h = s.horario;
  if (!eObjecto(h) || !eObjecto(h.dias)) {
    bloqueia('horario', E_CONT, 'horario', 'O horário não está gravado.');
  } else {
    const NOMES_DIAS = { seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado', dom: 'domingo' };
    for (const dia of DIAS) {
      const v = h.dias[dia];
      const campo = `horario.dias.${dia}`;
      const nome = `Horário de ${NOMES_DIAS[dia]}`;
      if (!Array.isArray(v)) { bloqueia(campo, E_CONT, campo, `${nome}: está em falta (um dia fechado fica sem horas, mas tem de estar lá).`); continue; }
      if (v.length > 2) { bloqueia(campo, E_CONT, campo, `${nome}: no máximo dois períodos por dia.`); continue; }
      const ok = v.every((iv) => eObjecto(iv) && RE_HORA.test(iv.abre) && RE_HORA.test(iv.fecha));
      if (!ok) { bloqueia(campo, E_CONT, campo, `${nome}: as horas escrevem-se HH:MM (ex.: 09:00).`); continue; }
      if (v.some((iv) => !(iv.abre < iv.fecha))) { bloqueia(campo, E_CONT, campo, `${nome}: a hora de abrir tem de ser antes da de fechar.`); continue; }
      const ord = [...v].sort((a, b) => (a.abre < b.abre ? -1 : 1));
      if (ord.length === 2 && ord[1].abre < ord[0].fecha) bloqueia(campo, E_CONT, campo, `${nome}: os dois períodos sobrepõem-se.`);
    }
    if (!ausente(h.nota)) textoDoSite(h.nota, 'horario.nota', E_CONT, 'horario.nota', 'A nota do horário', TAMANHOS.notaHorario, { obrigatorio: false });
  }

  // --- serviços ------------------------------------------------------------
  const sv = s.servicos;
  if (!Array.isArray(sv) || sv.length < 1 || sv.length > 12) {
    bloqueia('servicos', E_SERV, 'servicos', 'A lista de serviços tem de ter de 1 a 12 serviços.');
  }
  if (Array.isArray(sv)) {
    const vistos = new Set();
    sv.forEach((x, i) => {
      const n = `${i + 1}.º serviço`;
      if (!eObjecto(x)) { bloqueia(`servicos.${i + 1}`, E_SERV, `servicos.${i}`, `O ${n} não está preenchido.`); return; }
      const nome = temTexto(x.titulo) ? `Serviço «${x.titulo.trim()}»` : `O ${n}`;
      if (!(typeof x.id === 'string' && RE_ID_SERVICO.test(x.id))) bloqueia(`servicos.${i + 1}.id`, E_SERV, `servicos.${i}.id`, `${nome}: a referência interna não é válida. Só o Renato a pode corrigir.`);
      else if (vistos.has(x.id)) bloqueia(`servicos.${x.id}.repetido`, E_SERV, `servicos.${i}.id`, `${nome}: a referência «${x.id}» está repetida. Só o Renato a pode corrigir.`);
      else vistos.add(x.id);
      const id = typeof x.id === 'string' && x.id ? x.id : String(i + 1);
      textoDoSite(x.titulo, `servicos.${id}.titulo`, E_SERV, `servicos.${i}.titulo`, `O título do ${n}`, TAMANHOS.servicoTitulo);
      textoDoSite(x.texto, `servicos.${id}.texto`, E_SERV, `servicos.${i}.texto`, `${nome}: o texto`, TAMANHOS.servicoTexto);
      if (!ICONES_SERVICOS.includes(x.icone)) bloqueia(`servicos.${id}.icone`, E_SERV, `servicos.${i}.icone`, `${nome}: escolha um dos desenhos da lista.`);
    });
  }

  // --- textos da página inicial -------------------------------------------
  const t = s.textos;
  if (!eObjecto(t)) {
    bloqueia('textos', E_TEXT, 'textos', 'Os textos da página inicial não estão gravados.');
  } else {
    const sec = (k) => (eObjecto(t[k]) ? t[k] : null);
    const topo = sec('topo');
    if (!topo) bloqueia('textos.topo', E_TEXT, 'textos.topo', 'Faltam os textos do topo da página.');
    else {
      textoDoSite(topo.sobretitulo, 'textos.topo.sobretitulo', E_TEXT, 'textos.topo.sobretitulo', 'Topo › sobretítulo', TAMANHOS.titulo);
      for (const k of ['titulo1', 'titulo2', 'titulo3']) textoDoSite(topo[k], `textos.topo.${k}`, E_TEXT, `textos.topo.${k}`, `Topo › título (${k.slice(-1)}.ª linha)`, TAMANHOS.titulo);
      textoDoSite(topo.frase, 'textos.topo.frase', E_TEXT, 'textos.topo.frase', 'Topo › frase', TAMANHOS.frase, { linha: false });
      textoDoSite(topo.frase_destaque, 'textos.topo.frase_destaque', E_TEXT, 'textos.topo.frase_destaque', 'Topo › frase em destaque', TAMANHOS.frase);
      listaDeTextos(topo.destaques, 'textos.topo.destaques', E_TEXT, 'textos.topo.destaques', 'Topo › destaques', TAMANHOS.destaque, { maxItens: 6 });
    }
    for (const [k, nome] of [['servicos', 'Serviços › frase'], ['contactos', 'Contactos › frase'], ['rodape', 'Rodapé › frase']]) {
      const x = sec(k);
      if (!x) bloqueia(`textos.${k}`, E_TEXT, `textos.${k}`, `Falta o texto: ${nome}.`);
      else textoDoSite(x.frase, `textos.${k}.frase`, E_TEXT, `textos.${k}.frase`, nome, TAMANHOS.frase, { linha: false });
    }
    const sobre = sec('sobre');
    if (!sobre) bloqueia('textos.sobre', E_TEXT, 'textos.sobre', 'Faltam os textos da secção Sobre.');
    else {
      textoDoSite(sobre.titulo, 'textos.sobre.titulo', E_TEXT, 'textos.sobre.titulo', 'Sobre › título', TAMANHOS.titulo);
      listaDeTextos(sobre.paragrafos, 'textos.sobre.paragrafos', E_TEXT, 'textos.sobre.paragrafos', 'Sobre › parágrafos', TAMANHOS.paragrafo, { min: 1, maxItens: 6 });
      listaDeTextos(sobre.pontos, 'textos.sobre.pontos', E_TEXT, 'textos.sobre.pontos', 'Sobre › pontos', TAMANHOS.ponto, { maxItens: 8 });
    }
  }

  // --- marcas --------------------------------------------------------------
  if (!Array.isArray(s.marcas)) bloqueia('marcas', E_TEXT, 'marcas', 'Falta a lista das marcas.');
  else {
    if (s.marcas.length === 0) avisa('marcas:vazia', E_TEXT, 'marcas', 'A lista das marcas está vazia.');
    listaDeTextos(s.marcas, 'marcas', E_TEXT, 'marcas', 'Marcas', TAMANHOS.nomeMarca, { maxItens: 30 });
  }
}

/* ------------------------------------------------------------------ */
/* empresa.json — dados legais (fase A2). O dono edita-os no painel.   */
/* ------------------------------------------------------------------ */

function problemasDaEmpresa(lido, lista) {
  const ficheiro = FICHEIROS.empresa;
  const ecra = 'Dados da empresa';
  if (lido.ilegivel) return;
  const e = lido.obj;
  const bloqueia = (chave, campo, mensagem) => lista.push({ classe: 'bloqueia', chave: `empresa:${chave}`, ficheiro, ecra, campo, mensagem });
  const avisa = (chave, campo, mensagem) => lista.push({ classe: 'avisa', chave: `empresa:${chave}`, ficheiro, ecra, campo, mensagem });
  if (!eObjecto(e)) { bloqueia('forma', undefined, 'Os dados da empresa não têm a forma certa. Só o Renato os pode corrigir.'); return; }
  const partido = caminhoPartido(e);
  if (partido !== null) bloqueia('texto-partido', partido, 'Um texto tem um carácter partido (metade de um emoji ou de um símbolo, de um copiar e colar). Apague-o e escreva outra vez.');

  /* Os campos que a lei obriga (DL 7/2004 art. 10.º; DL 24/2014; Lei 144/2015
     para a RAL; DL 156/2005 para o Livro de Reclamações). Vale mais o site
     ficar na versão anterior do que ir para o ar sem eles. */
  /* `emails`: o campo vai também para os emails das encomendas e para a
     página de pagamento (o Worker dos pagamentos lê-o): o tamanho conta como
     ele o mede e, fora dele, pára — senão os emails ficavam com o anterior. */
  const obrigatorio = (v, chave, campo, nome, { emails = null } = {}) => {
    if (vazio(v)) { bloqueia(chave, campo, `${nome} está vazio (a lei obriga a mostrá-lo no site).`); return false; }
    if (typeof v !== 'string') { bloqueia(chave, campo, `${nome} tem de ser texto.`); return false; }
    if (soInvisiveis(v)) { bloqueia(chave, campo, `${nome} está vazio (só tem caracteres invisíveis). Escreva-o outra vez.`); return false; }
    if (TEM_INVISIVEL.test(v)) avisa(`${chave}:controlo`, campo, `${nome} tem caracteres invisíveis. Escreva-o outra vez.`);
    if (emails) {
      if (!tamanhoParaOsEmails(v, emails.min, emails.max)) { bloqueia(`${chave}:tamanho`, campo, `${nome} tem de ter entre ${emails.min} e ${emails.max} caracteres (vai também para os emails das encomendas).`); return false; }
    } else if (v.length > TAMANHOS.textoEmpresa) avisa(`${chave}:tamanho`, campo, `${nome} tem mais de ${TAMANHOS.textoEmpresa} caracteres.`);
    return true;
  };
  const sinaisDaMorada = (v, chave, campo, nome) => {
    if (!RE_MORADA.test(limpo(v))) bloqueia(`${chave}:sinais`, campo, `${nome} só pode ter letras, algarismos, espaços e ${SINAIS_DA_MORADA} (outros sinais não passam para a página de pagamento nem para os emails das encomendas).`);
  };
  obrigatorio(e.nome, 'nome', 'nome', 'O nome da loja', { emails: { min: 2, max: TAMANHOS.nomeLoja } });
  obrigatorio(e.denominacao, 'denominacao', 'denominacao', 'A denominação da empresa', { emails: { min: 2, max: TAMANHOS.denominacao } });
  if (vazio(e.nif)) bloqueia('nif', 'nif', 'O NIF está vazio (a lei obriga a mostrá-lo no site).');
  else if (typeof e.nif !== 'string') bloqueia('nif', 'nif', 'O NIF está gravado como número e não como texto. Só o Renato o pode corrigir.');
  else if (!nifValido(e.nif)) bloqueia('nif', 'nif', 'O NIF não é válido (9 algarismos, o primeiro não é 0, e o último tem de bater certo com os outros). Confira-o.');
  const m = e.morada;
  if (!eObjecto(m)) bloqueia('morada', 'morada', 'A morada da empresa está vazia (a lei obriga a mostrá-la no site).');
  else {
    if (obrigatorio(m.rua, 'morada.rua', 'morada.rua', 'A rua da morada', { emails: { min: 3, max: TAMANHOS.rua } })) sinaisDaMorada(m.rua, 'morada.rua', 'morada.rua', 'A rua da morada');
    if (vazio(m.cp)) bloqueia('morada.cp', 'morada.cp', 'O código postal está vazio (a lei obriga a mostrar a morada completa).');
    else if (!(typeof m.cp === 'string' && RE_CP.test(m.cp))) bloqueia('morada.cp', 'morada.cp', 'O código postal escreve-se 0000-000.');
    if (obrigatorio(m.localidade, 'morada.localidade', 'morada.localidade', 'A localidade da morada', { emails: { min: 2, max: TAMANHOS.localidade } })) sinaisDaMorada(m.localidade, 'morada.localidade', 'morada.localidade', 'A localidade da morada');
    /* O concelho pode faltar; se estiver, vai para a morada dos emails, e um
       concelho que o Worker recuse deita fora a morada INTEIRA (fica a
       anterior). O distrito ele não lê. */
    if (vazio(m.concelho)) avisa('morada.concelho:vazio', 'morada.concelho', 'O concelho está vazio.');
    else if (typeof m.concelho !== 'string') bloqueia('morada.concelho', 'morada.concelho', 'O concelho tem de ser texto.');
    else if (!tamanhoParaOsEmails(m.concelho, 2, TAMANHOS.concelho)) bloqueia('morada.concelho', 'morada.concelho', `O concelho tem de ter entre 2 e ${TAMANHOS.concelho} caracteres, ou ficar vazio.`);
    else sinaisDaMorada(m.concelho, 'morada.concelho', 'morada.concelho', 'O concelho');
    if (vazio(m.distrito)) avisa('morada.distrito', 'morada.distrito', 'O distrito está vazio.');
    else if (typeof m.distrito !== 'string') avisa('morada.distrito', 'morada.distrito', 'O distrito tem de ser texto.');
  }
  const ral = e.ral;
  if (!eObjecto(ral)) bloqueia('ral', 'ral', 'Falta a entidade de resolução alternativa de litígios (a lei obriga a indicá-la).');
  else {
    obrigatorio(ral.nome, 'ral.nome', 'ral.nome', 'O nome da entidade de resolução de litígios');
    if (vazio(ral.url)) bloqueia('ral.url', 'ral.url', 'Falta o endereço da entidade de resolução de litígios.');
    else if (!urlHttps(ral.url)) bloqueia('ral.url', 'ral.url', 'O endereço da entidade de resolução de litígios tem de começar por https:// (e não pode ter espaços nem caracteres invisíveis).');
  }
  if (vazio(e.livro_reclamacoes)) bloqueia('livro_reclamacoes', 'livro_reclamacoes', 'Falta o endereço do Livro de Reclamações (a lei obriga a mostrá-lo).');
  else if (!urlHttps(e.livro_reclamacoes)) bloqueia('livro_reclamacoes', 'livro_reclamacoes', 'O endereço do Livro de Reclamações tem de começar por https:// (e não pode ter espaços nem caracteres invisíveis).');
  else if (!urlParaOsEmails(e.livro_reclamacoes)) bloqueia('livro_reclamacoes', 'livro_reclamacoes', `O endereço do Livro de Reclamações tem de ter até ${TAMANHOS.enderecoLivro} caracteres e não pode levar nome de utilizador (vai também para os emails das encomendas).`);

  /* Capital social e conservatória (CSC art. 171.º): opcionais até o
     contabilista confirmar; se estiverem lá, vão para as páginas legais e têm
     de fazer sentido. */
  if (!ausente(e.capital_social) && !(typeof e.capital_social === 'number' && e.capital_social > 0 && duasCasas(e.capital_social))) {
    bloqueia('capital_social', 'capital_social', 'O capital social tem de ser um valor em euros (ex.: 5000), ou ficar vazio.');
  }
  if (!ausente(e.conservatoria) && (!temTexto(e.conservatoria) || soInvisiveis(e.conservatoria))) {
    bloqueia('conservatoria', 'conservatoria', 'A conservatória tem de ser texto, ou ficar vazia.');
  }
  /* O mapa e as coordenadas não são obrigatórios: se estiverem errados, a
     publicação deixa-os de fora (o injector só os usa quando estão bons). */
  if (!ausente(e.geo)) {
    const g = e.geo;
    const ok = eObjecto(g) && typeof g.lat === 'number' && typeof g.lng === 'number' && Math.abs(g.lat) <= 90 && Math.abs(g.lng) <= 180;
    if (!ok) avisa('geo', 'geo', 'As coordenadas da loja não estão bem escritas: ficam de fora do site.');
  }
  if (!vazio(e.mapa) && !urlHttps(e.mapa)) avisa('mapa', 'mapa', 'O endereço do mapa tem de começar por https://: fica de fora do site.');
}

/* ------------------------------------------------------------------ */
/* Todos                                                               */
/* ------------------------------------------------------------------ */

const ECRA_DO_FICHEIRO = { products: 'Produtos', settings: 'Loja online', content: 'Fotografias do site', site: 'Contactos e horário', empresa: 'Dados da empresa' };

/* problemas(dados, opcoes)
 *   dados:  { products, settings, content, site, empresa } — cada um é o TEXTO
 *           do ficheiro, o objecto já lido, ou null/undefined se não existir;
 *   opcoes: { imagemExiste?: (caminho) => boolean  — sem ele não se confere se
 *             as fotografias existem, só a forma do caminho;
 *             estrito?: boolean — os ficheiros têm de acabar em \n (depois da fase G);
 *             obrigatorios?: string[] — por omissão OBRIGATORIOS }
 *   → [problema], pela ordem dos ficheiros. */
export function problemas(dados = {}, opcoes = {}) {
  const imagemExiste = typeof opcoes.imagemExiste === 'function' ? opcoes.imagemExiste : null;
  const obrigatorios = Array.isArray(opcoes.obrigatorios) ? opcoes.obrigatorios : OBRIGATORIOS;
  const lista = [];
  const lidos = {};
  for (const qual of Object.keys(FICHEIROS)) {
    lidos[qual] = lerFicheiro(qual, dados[qual], lista, ECRA_DO_FICHEIRO[qual]);
    const sempre = qual === 'products' || qual === 'settings' || qual === 'content';
    if (lidos[qual].ausente && (sempre || obrigatorios.includes(qual))) {
      lista.push({ classe: 'bloqueia', chave: `${qual}:ausente`, ficheiro: FICHEIROS[qual], ecra: ECRA_DO_FICHEIRO[qual], mensagem: `Falta o ficheiro ${FICHEIROS[qual]}. Só o Renato o pode repor.` });
    }
    const l = lidos[qual];
    if (l.texto !== null && l.texto !== undefined && !l.ilegivel) {
      if (opcoes.estrito && !l.texto.endsWith('\n')) {
        lista.push({ classe: 'avisa', chave: `${qual}:terminacao`, ficheiro: FICHEIROS[qual], ecra: ECRA_DO_FICHEIRO[qual], mensagem: `O ficheiro ${FICHEIROS[qual]} não acaba numa mudança de linha.` });
      }
      if (qual !== 'products' && bytesDe(l.texto) > TECTOS.outrosBytes) {
        lista.push({ classe: 'avisa', chave: `${qual}:tecto`, ficheiro: FICHEIROS[qual], ecra: ECRA_DO_FICHEIRO[qual], lembrete: true, mensagem: `O ficheiro ${FICHEIROS[qual]} passou dos ${TECTOS.outrosBytes / 1024} KB que o painel aceita. Fale com o Renato.` });
      }
    }
  }
  if (!lidos.products.ausente) problemasDosProdutos(lidos.products, lista, { imagemExiste });
  if (!lidos.settings.ausente) problemasDasDefinicoes(lidos.settings, lista);
  if (!lidos.content.ausente) problemasDoConteudo(lidos.content, lista, { imagemExiste });
  if (!lidos.site.ausente) problemasDoSite(lidos.site, lista);
  if (!lidos.empresa.ausente) problemasDaEmpresa(lidos.empresa, lista);
  return lista;
}

/* neutralizar(dados, lista) → { products, efeitos, mudou }
 *   A cópia PUBLICADA do products.json: os problemas «neutraliza» aplicados.
 *     · retirar       — o produto sai da cópia;
 *     · fora_de_venda — available: false;
 *     · sem_imagem    — a chave image sai (o cartão mostra o logótipo).
 *   products: o documento inteiro ({ products: [...] }, com as outras chaves
 *             como estavam), ou null se o ficheiro não se lê;
 *   efeitos:  só o que MUDA alguma coisa — [{ indice, sku, nome, efeitos: [...], motivos: [...] }].
 *             Um produto já fora de venda não conta como tirado de venda;
 *   mudou:    false → a cópia publicada fica igual ao ficheiro, byte a byte
 *             (quem a escreve só a reescreve com mudou: true). */
export function neutralizar(dados = {}, lista = []) {
  const v = dados.products;
  let doc = null;
  try { doc = typeof v === 'string' ? JSON.parse(v) : v; } catch { doc = null; }
  if (!eObjecto(doc) || !Array.isArray(doc.products)) return { products: null, efeitos: [], mudou: false };
  const copia = JSON.parse(JSON.stringify(doc));
  const porIndice = new Map();
  for (const pr of lista) {
    if (pr.classe !== 'neutraliza' || pr.ficheiro !== FICHEIROS.products || !Number.isInteger(pr.indice)) continue;
    if (!porIndice.has(pr.indice)) porIndice.set(pr.indice, []);
    porIndice.get(pr.indice).push(pr);
  }
  const efeitos = [];
  const retirar = new Set();
  for (const [i, prs] of [...porIndice].sort((a, b) => a[0] - b[0])) {
    const p = copia.products[i];
    if (!eObjecto(p)) continue;
    const feitos = [];
    const motivos = [];
    for (const pr of prs) {
      if (pr.efeito === 'retirar') { if (!retirar.has(i)) { retirar.add(i); feitos.push('retirar'); } motivos.push(pr.mensagem); }
      else if (pr.efeito === 'fora_de_venda') {
        if (p.available !== false) { p.available = false; feitos.push('fora_de_venda'); motivos.push(pr.mensagem); }
        else if (feitos.includes('fora_de_venda')) motivos.push(pr.mensagem);
      } else if (pr.efeito === 'sem_imagem') {
        if (Object.prototype.hasOwnProperty.call(p, 'image')) { delete p.image; feitos.push('sem_imagem'); motivos.push(pr.mensagem); }
      }
    }
    if (feitos.length) {
      efeitos.push({ indice: i, sku: typeof doc.products[i].sku === 'string' ? doc.products[i].sku : null, nome: typeof doc.products[i].name === 'string' ? doc.products[i].name : null, efeitos: feitos, motivos });
    }
  }
  if (retirar.size) copia.products = copia.products.filter((_, i) => !retirar.has(i));
  return { products: copia, efeitos, mudou: efeitos.length > 0 };
}
