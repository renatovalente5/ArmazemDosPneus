// Textos reutilizáveis para fechar uma encomenda à distância.
//
// Fontes: DL 7/2004, arts. 27.º (informação prévia: passos, arquivo do contrato, línguas, correcção de
// erros), 28.º (termos contratuais), 29.º (aviso de recepção) e 31.º (termos armazenáveis); DL 24/2014,
// art. 5.º, n.º 4 (botão «com obrigação de pagar»), art. 6.º (confirmação em suporte duradouro),
// arts. 10.º a 13.º (livre resolução de 14 dias), art. 17.º, n.º 1 (excepções) e Anexo, Parte B (formulário);
// DL 152-D/2017, art. 13.º (retoma do usado).
import { esc, formatarEuros } from './util.mjs';
import { GARANTIA_BENS } from './garantia.mjs';
import { LIVRO_URL } from './livro.mjs';
import { ralTexto } from './ral.mjs';
import { telefoneTexto, tipoDeLinha } from './telefone.mjs';

/** O texto do botão que fecha a encomenda (DL 24/2014, art. 5.º, n.º 4). */
export const BOTAO_ENCOMENDA = 'Encomendar com obrigação de pagar';

/**
 * «Como se faz a encomenda»: os passos técnicos, a correcção de erros, o aviso de recepção, o arquivo do
 * contrato, a língua e os termos armazenáveis (DL 7/2004, arts. 27.º a 31.º).
 * @param {object} [opcoes]
 * @param {'site'|'whatsapp'|'email'} [opcoes.canal='site']
 * @param {string[]} [opcoes.pagamentos] ex.: ['MB WAY', 'transferência bancária']
 * @param {string[]} [opcoes.linguas=['português']]
 * @param {string} [opcoes.urlTermos] ligação às condições gerais (armazenáveis)
 * @param {string} [opcoes.prazoConfirmacao='5 dias']
 * @param {string} [opcoes.arquivo='10 anos'] quanto tempo o contrato fica arquivado (obrigação fiscal)
 * @param {string} [opcoes.classe='como-encomendar']
 * @returns {string} HTML (uma lista ordenada)
 */
export function COMO_SE_FAZ_A_ENCOMENDA({
  canal = 'site',
  pagamentos = [],
  linguas = ['português'],
  urlTermos,
  prazoConfirmacao = '5 dias',
  arquivo = '10 anos',
  classe = 'como-encomendar',
} = {}) {
  if (!['site', 'whatsapp', 'email'].includes(canal)) throw new Error(`Canal desconhecido: ${canal} (usa 'site', 'whatsapp' ou 'email')`);
  const passo1 = {
    site: 'Escolhe os artigos e junta-os ao carrinho.',
    whatsapp: 'Diz-nos pelo WhatsApp os artigos que quer (nome, quantidade e, se houver, as opções).',
    email: 'Diz-nos por email os artigos que quer (nome, quantidade e, se houver, as opções).',
  }[canal];
  const passo3 = {
    site: `A encomenda fica feita quando carrega em «${BOTAO_ENCOMENDA}».`,
    whatsapp: 'A encomenda fica feita quando responde «Confirmo a encomenda com obrigação de pagar X €» ao resumo que lhe enviamos.',
    email: 'A encomenda fica feita quando responde «Confirmo a encomenda com obrigação de pagar X €» ao resumo que lhe enviamos.',
  }[canal];
  const pag = pagamentos.length ? ` Pode pagar por ${pagamentos.map(esc).join(', ')}.` : '';
  const passos = [
    passo1,
    'Antes de confirmar, vê o resumo com os artigos, as quantidades, o preço total com IVA e os portes, e pode corrigir qualquer erro.',
    passo3 + pag,
    `Recebe logo um aviso de recepção por email e, até ${esc(prazoConfirmacao)} e sempre antes da entrega, a confirmação da encomenda com as condições inteiras em anexo.`,
    `O contrato é feito em ${linguas.map(esc).join(' ou ')}. Guardamos a encomenda e a confirmação durante ${esc(arquivo)} e pode pedir-nos uma cópia a qualquer momento.`,
    urlTermos
      ? `As condições gerais podem ser guardadas e impressas: <a href="${esc(urlTermos)}">condições gerais</a>.`
      : 'As condições gerais podem ser guardadas e impressas.',
  ];
  return `<ol class="${esc(classe)}" lang="pt">\n${passos.map((p) => `<li>${p}</li>`).join('\n')}\n</ol>`;
}

const RETOMA = {
  eee: 'Ao comprar um equipamento eléctrico ou electrónico novo, pode entregar-nos gratuitamente um equipamento usado equivalente (do mesmo tipo e com as mesmas funções); diga-nos ao encomendar.',
  pilhas: 'Pode entregar-nos gratuitamente pilhas e acumuladores portáteis usados, sem obrigação de comprar; diga-nos ao encomendar.',
  pneus: 'Ao comprar pneus novos, pode entregar-nos gratuitamente os pneus usados equivalentes; diga-nos ao encomendar.',
  baterias: 'Ao comprar uma bateria nova, pode entregar-nos gratuitamente a bateria usada equivalente; diga-nos ao encomendar.',
};

/**
 * O aviso de retoma gratuita do usado (DL 152-D/2017, art. 13.º).
 * @param {{ tipos: ('eee'|'pilhas'|'pneus'|'baterias')[] }} opcoes
 * @returns {string} texto simples; uma frase por tipo, com a fonte no fim
 */
export function AVISO_RETOMA({ tipos = [] } = {}) {
  if (!Array.isArray(tipos) || !tipos.length) throw new Error('AVISO_RETOMA precisa de tipos: ["eee", "pilhas", "pneus", "baterias"]');
  const frases = tipos.map((t) => {
    if (!RETOMA[t]) throw new Error(`Tipo de retoma desconhecido: ${t} (usa ${Object.keys(RETOMA).join(', ')})`);
    return RETOMA[t];
  });
  return `${frases.join(' ')} (Decreto-Lei n.º 152-D/2017, art. 13.º)`;
}

export const LIVRE_RESOLUCAO =
  'Tem 14 dias para desistir da compra sem dar justificação, a contar do dia em que recebe o bem (ou, nos serviços, do dia do contrato). Basta dizer-nos por email ou enviar o formulário de livre resolução; devolve o bem em 14 dias e nós reembolsamos tudo, incluindo os portes normais de envio, em 14 dias e pelo mesmo meio de pagamento (Decreto-Lei n.º 24/2014, arts. 10.º a 13.º).';

/** Só estas excepções se aplicam aos sites típicos; escolher cor, tamanho ou modelo do catálogo não é uma delas. */
export const LIVRE_RESOLUCAO_EXCEPCOES = Object.freeze([
  'bens feitos segundo as especificações do cliente ou claramente personalizados: com o seu nome, um texto, uma fotografia, um desenho ou medidas suas',
  'serviços de lazer com data ou período de execução marcado (por exemplo, um piquenique ou um evento numa data certa)',
]);

export const SEM_LIVRE_RESOLUCAO_PERSONALIZADO =
  'Não há livre resolução nos artigos feitos segundo as suas especificações ou claramente personalizados — com o seu nome, um texto, uma fotografia, um desenho ou medidas suas (Decreto-Lei n.º 24/2014, art. 17.º, n.º 1). Escolher uma cor, um tamanho ou um modelo do catálogo não é personalização: nesses casos tem os 14 dias.';

export const SEM_LIVRE_RESOLUCAO_LAZER =
  'Não há livre resolução neste serviço, porque é um serviço de lazer com data marcada (Decreto-Lei n.º 24/2014, art. 17.º, n.º 1). Se formos nós a cancelar, devolvemos tudo ou marcamos outra data à sua escolha.';

/** O modelo do Anexo (Parte B) do DL 24/2014, em texto. */
export const FORMULARIO_LIVRE_RESOLUCAO = `Formulário de livre resolução
(Só deve preencher e devolver o presente formulário se quiser resolver o contrato)

— Para [nome, endereço geográfico e endereço de correio electrónico do profissional]:
— Pela presente comunico/comunicamos (*) que resolvo/resolvemos (*) o meu/nosso (*) contrato de compra e venda relativo ao seguinte bem/para a prestação do seguinte serviço (*):
— Solicitado em (*)/recebido em (*):
— Nome do(s) consumidor(es):
— Endereço do(s) consumidor(es):
— Assinatura do(s) consumidor(es) (só no caso de o presente formulário ser notificado em papel):
— Data:

(*) Riscar o que não interessa.`;

/**
 * O formulário já com o vendedor preenchido.
 * @param {{ nome: string, morada: string, email: string }} vendedor
 * @returns {string}
 */
export function formularioLivreResolucao({ nome, morada, email }) {
  if (!nome || !morada || !email) throw new Error('formularioLivreResolucao precisa de nome, morada e email do vendedor');
  return FORMULARIO_LIVRE_RESOLUCAO.replace('[nome, endereço geográfico e endereço de correio electrónico do profissional]', `${nome}, ${morada}, ${email}`);
}

function linhasArtigos(artigos) {
  return artigos.map((a) => {
    const q = Number(a.quantidade ?? 1);
    const preco = Number(a.preco);
    if (!a.nome || !(q > 0) || !(preco >= 0)) throw new Error(`Artigo incompleto na encomenda: ${JSON.stringify(a)}`);
    const ref = a.referencia ? ` (ref. ${a.referencia})` : '';
    return `- ${q} × ${a.nome}${ref} — ${formatarEuros(preco)} cada — ${formatarEuros(q * preco)}`;
  });
}

function totais(encomenda) {
  const artigos = Array.isArray(encomenda.artigos) ? encomenda.artigos : [];
  const subtotal = artigos.reduce((s, a) => s + Number(a.quantidade ?? 1) * Number(a.preco), 0);
  const portes = Number(encomenda.portes ?? 0);
  const total = encomenda.total !== undefined ? Number(encomenda.total) : subtotal + portes;
  return { artigos, subtotal, portes, total };
}

/**
 * O texto pré-preenchido para o WhatsApp, com a frase que vincula.
 * @param {object} encomenda
 * @param {{ nome: string, quantidade?: number, preco: number, referencia?: string }[]} encomenda.artigos
 * @param {number} [encomenda.portes=0]
 * @param {number} [encomenda.total] calculado se faltar
 * @param {string} [encomenda.nome] nome do cliente
 * @param {string} [encomenda.morada] morada de entrega
 * @param {string} [encomenda.notas]
 * @returns {string}
 */
export function TEXTO_ENCOMENDA_WHATSAPP(encomenda = {}) {
  const { artigos, portes, total } = totais(encomenda);
  if (!artigos.length) throw new Error('A encomenda não tem artigos');
  const linhas = [`Olá! Confirmo a encomenda com obrigação de pagar ${formatarEuros(total)}.`, 'Artigos:', ...linhasArtigos(artigos)];
  if (portes > 0) linhas.push(`Portes: ${formatarEuros(portes)}`);
  linhas.push(`Total com IVA: ${formatarEuros(total)}`);
  if (encomenda.nome) linhas.push(`Nome: ${encomenda.nome}`);
  if (encomenda.morada) linhas.push(`Entrega: ${encomenda.morada}`);
  if (encomenda.notas) linhas.push(`Notas: ${encomenda.notas}`);
  return linhas.join('\n');
}

/**
 * O conteúdo mínimo de uma confirmação em suporte duradouro (DL 24/2014, art. 6.º): identidade, artigos,
 * total com portes, prazo, pagamento, livre resolução ou a sua ausência, garantia, Livro, RAL e os anexos.
 * @param {object} encomenda
 * @param {{ nome: string, nif: string, morada: string, email: string, telefone?: string }} encomenda.vendedor
 * @param {string} [encomenda.numero]
 * @param {string} [encomenda.data] AAAA-MM-DD
 * @param {{ nome: string, quantidade?: number, preco: number, referencia?: string, livreResolucao?: boolean, motivoSemLivreResolucao?: string }[]} encomenda.artigos
 * @param {number} [encomenda.portes=0]
 * @param {number} [encomenda.total]
 * @param {string} [encomenda.prazoEntrega='até 30 dias']
 * @param {string} [encomenda.pagamento]
 * @param {string} [encomenda.garantia=GARANTIA_BENS]
 * @param {object} [encomenda.ral] as opções de ralTexto() (por omissão, âmbito nacional)
 * @param {string[]} [encomenda.anexos] por omissão, as condições gerais e o formulário de livre resolução
 * @returns {string} texto simples
 */
export function CONFIRMACAO_MODELO(encomenda = {}) {
  const v = encomenda.vendedor || {};
  for (const campo of ['nome', 'nif', 'morada', 'email']) {
    if (!v[campo]) throw new Error(`A confirmação precisa do ${campo} do vendedor`);
  }
  const { artigos, portes, total } = totais(encomenda);
  if (!artigos.length) throw new Error('A encomenda não tem artigos');
  const telefone = v.telefone && tipoDeLinha(v.telefone) !== 'desconhecido' ? ` · ${telefoneTexto(v.telefone)}` : '';
  const semResolucao = artigos.filter((a) => a.livreResolucao === false);
  const comResolucao = artigos.filter((a) => a.livreResolucao !== false);
  const resolucao = [];
  if (comResolucao.length) resolucao.push(LIVRE_RESOLUCAO);
  for (const a of semResolucao) {
    resolucao.push(`Sem livre resolução: ${a.nome} — ${a.motivoSemLivreResolucao || 'feito segundo as suas especificações (Decreto-Lei n.º 24/2014, art. 17.º, n.º 1)'}.`);
  }
  const anexos = encomenda.anexos || ['as condições gerais inteiras', 'o formulário de livre resolução'];
  const linhas = [
    `Confirmação da encomenda${encomenda.numero ? ` n.º ${encomenda.numero}` : ''}${encomenda.data ? ` — ${encomenda.data}` : ''}`,
    '',
    `Vendedor: ${v.nome} · NIF ${v.nif} · ${v.morada} · ${v.email}${telefone}`,
    '',
    'Artigos:',
    ...linhasArtigos(artigos),
    `Portes: ${formatarEuros(portes)}`,
    `Total com IVA: ${formatarEuros(total)}`,
    `Prazo de entrega: ${encomenda.prazoEntrega || 'até 30 dias'}`,
    `Pagamento: ${encomenda.pagamento || 'conforme combinado'}`,
    '',
    `Livre resolução: ${resolucao.join(' ')}`,
    '',
    `Garantia: ${encomenda.garantia || GARANTIA_BENS}`,
    '',
    `Reclamações: Livro de Reclamações Electrónico — ${LIVRO_URL}`,
    '',
    `Resolução de litígios: ${ralTexto(encomenda.ral || {})}`,
    '',
    `Em anexo: ${anexos.join(' e ')}.`,
  ];
  return linhas.join('\n');
}

/**
 * A mesma confirmação em HTML simples (para email), com o texto escapado.
 * @param {Parameters<typeof CONFIRMACAO_MODELO>[0]} encomenda
 * @returns {string}
 */
export function confirmacaoHtml(encomenda) {
  const texto = CONFIRMACAO_MODELO(encomenda);
  // Cada bloco vira parágrafos; as linhas seguidas que começam por «- » viram uma lista.
  const blocos = texto.split('\n\n').map((bloco) => {
    const saida = [];
    let paragrafo = [];
    let lista = [];
    const fecharParagrafo = () => {
      if (paragrafo.length) saida.push(`<p>${paragrafo.map(esc).join('<br>\n')}</p>`);
      paragrafo = [];
    };
    const fecharLista = () => {
      if (lista.length) saida.push(`<ul>\n${lista.map((l) => `<li>${esc(l)}</li>`).join('\n')}\n</ul>`);
      lista = [];
    };
    for (const linha of bloco.split('\n')) {
      if (linha.startsWith('- ')) {
        fecharParagrafo();
        lista.push(linha.slice(2));
      } else {
        fecharLista();
        paragrafo.push(linha);
      }
    }
    fecharParagrafo();
    fecharLista();
    return saida.join('\n');
  });
  return `<div class="confirmacao" lang="pt">\n${blocos.join('\n')}\n</div>`;
}
