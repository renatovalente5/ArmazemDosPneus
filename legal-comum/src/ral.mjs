// Resolução alternativa de litígios de consumo (RAL).
//
// Lei: Lei n.º 144/2015, art. 18.º — o fornecedor informa o consumidor das entidades RAL a que está
// vinculado, «de forma clara, compreensível e facilmente acessível», no sítio na Internet e nos contratos.
// Lei n.º 24/96, art. 14.º, n.º 2 — nos litígios até 5 000 €, a arbitragem ou a mediação é obrigatória para
// o fornecedor se o consumidor a escolher. Competência: domicílio do consumidor ou local da contratação
// (Regulamento Harmonizado dos centros, art. 6.º, em vigor desde 1 jan 2026).
// Nunca: a palavra «aderimos» (a vinculação vem da lei, não de uma adesão) nem a plataforma ODR europeia
// (revogada a 20 jul 2025 pelo Regulamento (UE) 2024/3228).
//
// Fonte da lista: Portal do Consumidor (DGC), «Lista de contactos», actualizada a 2026-10-16 e conferida a
// 2026-10-22. As áreas (concelhos) vêm dos sítios dos próprios centros, conferidos a 2026-10-22; onde a
// fonte não enumera concelhos, a entrada diz de onde vem a área.
import { esc, normalizar } from './util.mjs';

export const LISTA_DGC_URL =
  'https://www.consumidor.gov.pt/resolucaoalternativalitigiosdeconsumo/centros-de-arbitragem2/encontrar-a-entidade-competente/lista-de-contactos';

export const CEC_URL =
  'https://commission.europa.eu/live-work-travel-eu/consumer-rights-and-complaints/resolve-your-consumer-complaint/european-consumer-centres-network-ecc-net_pt';

/** A frase de enquadramento, com as fontes. */
export const FRASE_RAL =
  'Em caso de litígio de consumo, o consumidor pode recorrer a uma entidade de resolução alternativa de litígios de consumo. O centro competente é o do domicílio do consumidor ou do local da contratação; nos litígios de valor até 5 000 €, a arbitragem ou a mediação é obrigatória para o fornecedor se o consumidor a escolher (Lei n.º 24/96, art. 14.º, n.º 2; Lei n.º 144/2015, art. 18.º).';

const AML = [
  'Alcochete', 'Almada', 'Amadora', 'Barreiro', 'Cascais', 'Lisboa', 'Loures', 'Mafra', 'Moita', 'Montijo', 'Odivelas',
  'Oeiras', 'Palmela', 'Seixal', 'Sesimbra', 'Setúbal', 'Sintra', 'Vila Franca de Xira',
];

/**
 * Os 10 centros de competência genérica. Campos: sigla, nome, sitio (o da lista da DGC), area (texto para
 * mostrar), supletivo, concelhos (os que a fonte enumera), fonte e verificado (data em que se conferiu).
 */
export const CENTROS = Object.freeze([
  {
    sigla: 'CICAP',
    nome: 'Centro de Informação de Consumo e Arbitragem do Porto',
    sitio: 'https://cicap.pt/',
    area: 'Área Metropolitana do Porto',
    supletivo: false,
    concelhos: [
      'Arouca', 'Espinho', 'Gondomar', 'Maia', 'Matosinhos', 'Oliveira de Azeméis', 'Paredes', 'Porto', 'Póvoa de Varzim',
      'Santa Maria da Feira', 'Santo Tirso', 'São João da Madeira', 'Trofa', 'Vale de Cambra', 'Valongo', 'Vila do Conde',
      'Vila Nova de Gaia',
    ],
    fonte: 'cicap.pt (página inicial, «competências do CICAP»), conferido a 2026-10-22',
    verificado: '2026-10-22',
  },
  {
    sigla: 'CNIACC',
    nome: 'Centro Nacional de Informação e Arbitragem de Conflitos de Consumo',
    sitio: 'https://www.cniacc.pt/',
    area: 'Supletivo nacional: onde não houver centro com competência territorial',
    supletivo: true,
    // Só concelhos que não estão na área de nenhum centro regional (lista mínima e documentada; os outros dão null).
    concelhos: [
      'Aveiro', 'Ovar', 'Águeda', 'Ílhavo', 'Estarreja', 'Murtosa', 'Albergaria-a-Velha',
      'Leiria', 'Marinha Grande', 'Pombal', 'Caldas da Rainha', 'Alcobaça', 'Nazaré',
      'Castelo Branco', 'Covilhã', 'Fundão',
      'Santarém', 'Ourém', 'Tomar', 'Abrantes', 'Torres Vedras',
      'Évora', 'Beja', 'Portalegre', 'Guarda', 'Viseu', 'Vila Real', 'Bragança',
      'Grândola', 'Alcácer do Sal', 'Santiago do Cacém', 'Sines',
    ],
    fonte: 'Lista da DGC (CNIACC com delegações em Braga e Viseu); supletivo por natureza — os concelhos listados são os que ficam fora das áreas dos centros regionais, conferidas a 2026-10-22',
    verificado: '2026-10-22',
  },
  {
    sigla: 'CACCL',
    nome: 'Centro de Arbitragem de Conflitos de Consumo de Lisboa',
    sitio: 'https://www.centroarbitragemlisboa.pt/',
    area: 'Área Metropolitana de Lisboa',
    supletivo: false,
    concelhos: AML,
    fonte: 'centroarbitragemlisboa.pt («contrato celebrado e executado na Área Metropolitana de Lisboa»), conferido a 2026-10-22; os 18 concelhos são os da Lei n.º 75/2013',
    verificado: '2026-10-22',
  },
  {
    sigla: 'CIAB',
    nome: 'Centro de Informação, Mediação e Arbitragem de Consumo (Tribunal Arbitral de Consumo)',
    sitio: 'https://ciab.pt/',
    area: 'Distritos de Braga e Viana do Castelo e Alto Tâmega e Barroso',
    supletivo: false,
    concelhos: [
      'Amares', 'Arcos de Valdevez', 'Barcelos', 'Boticas', 'Braga', 'Caminha', 'Chaves', 'Esposende', 'Melgaço', 'Monção',
      'Montalegre', 'Paredes de Coura', 'Ponte da Barca', 'Ponte de Lima', 'Póvoa de Lanhoso', 'Ribeira de Pena',
      'Terras de Bouro', 'Valença', 'Valpaços', 'Viana do Castelo', 'Vieira do Minho', 'Vila Nova de Cerveira',
      'Vila Pouca de Aguiar', 'Vila Verde',
    ],
    fonte: 'ciab.pt/abrangencia-territorial/ («Municípios Associados»), conferido a 2026-10-22',
    verificado: '2026-10-22',
  },
  {
    sigla: 'TRIAVE',
    nome: 'Centro de Arbitragem de Conflitos de Consumo do Ave, Tâmega e Sousa',
    sitio: 'https://www.triave.pt/',
    area: 'Vale do Ave, Tâmega e Sousa',
    supletivo: false,
    concelhos: [
      'Amarante', 'Baião', 'Cabeceiras de Basto', 'Castelo de Paiva', 'Celorico de Basto', 'Cinfães', 'Fafe', 'Felgueiras',
      'Guimarães', 'Lousada', 'Marco de Canaveses', 'Mondim de Basto', 'Paços de Ferreira', 'Penafiel', 'Póvoa de Lanhoso',
      'Póvoa de Varzim', 'Resende', 'Santo Tirso', 'Trofa', 'Vieira do Minho', 'Vila do Conde', 'Vila Nova de Famalicão',
      'Vizela',
    ],
    fonte: 'triave.pt/ambito-territorial/ («Municípios»), conferido a 2026-10-22',
    verificado: '2026-10-22',
  },
  {
    sigla: 'CACRC',
    nome: 'Centro de Arbitragem de Conflitos de Consumo da Região de Coimbra',
    sitio: 'https://cacrc.pt/',
    area: 'Distrito de Coimbra',
    supletivo: false,
    concelhos: [
      'Arganil', 'Cantanhede', 'Coimbra', 'Condeixa-a-Nova', 'Figueira da Foz', 'Góis', 'Lousã', 'Mira', 'Miranda do Corvo',
      'Montemor-o-Velho', 'Oliveira do Hospital', 'Penacova', 'Penela', 'Soure', 'Tábua', 'Vila Nova de Poiares',
    ],
    fonte: 'cacrc.pt («Distrito de Coimbra»), conferido a 2026-10-22; Pampilhosa da Serra fica de fora até se confirmar a ampliação pedida em 2024',
    verificado: '2026-10-22',
  },
  {
    sigla: 'CIMAAL',
    nome: 'Centro de Informação, Mediação e Arbitragem do Algarve',
    sitio: 'https://consumoalgarve.pt/',
    area: 'Algarve',
    supletivo: false,
    concelhos: [
      'Albufeira', 'Alcoutim', 'Aljezur', 'Castro Marim', 'Faro', 'Lagoa (Algarve)', 'Lagos', 'Loulé', 'Monchique', 'Olhão',
      'Portimão', 'São Brás de Alportel', 'Silves', 'Tavira', 'Vila do Bispo', 'Vila Real de Santo António',
    ],
    fonte: 'Lista da DGC e consumoalgarve.pt (o centro é «do Algarve»); os 16 concelhos são os do distrito de Faro',
    verificado: '2026-10-22',
  },
  {
    sigla: 'CACC RAM',
    nome: 'Centro de Arbitragem de Conflitos de Consumo da Região Autónoma da Madeira',
    sitio: 'https://www.madeira.gov.pt/cacc/',
    area: 'Região Autónoma da Madeira',
    supletivo: false,
    concelhos: [
      'Calheta (Madeira)', 'Câmara de Lobos', 'Funchal', 'Machico', 'Ponta do Sol', 'Porto Moniz', 'Porto Santo', 'Ribeira Brava',
      'Santa Cruz', 'Santana', 'São Vicente',
    ],
    fonte: 'Lista da DGC; os 11 concelhos são os da Região Autónoma',
    verificado: '2026-10-22',
  },
  {
    sigla: 'CIMARA',
    nome: 'Centro de Informação, Mediação e Arbitragem de Consumo da Região Açores',
    sitio: 'https://ocimara.pt/',
    area: 'Região Autónoma dos Açores',
    supletivo: false,
    concelhos: [
      'Angra do Heroísmo', 'Calheta (Açores)', 'Corvo', 'Horta', 'Lagoa (Açores)', 'Lajes das Flores', 'Lajes do Pico', 'Madalena',
      'Nordeste', 'Ponta Delgada', 'Povoação', 'Praia da Vitória', 'Ribeira Grande', 'Santa Cruz da Graciosa',
      'Santa Cruz das Flores', 'São Roque do Pico', 'Velas', 'Vila do Porto', 'Vila Franca do Campo',
    ],
    fonte: 'Lista da DGC; os 19 concelhos são os da Região Autónoma. O sítio ocimara.pt não respondia a 8 out nem a 22 out 2026',
    verificado: '2026-10-22 (lista); sítio por confirmar',
  },
  {
    sigla: 'CAUAL',
    nome: 'Centro de Arbitragem da Universidade Autónoma de Lisboa',
    sitio: 'https://arbitragem.grupoautonoma.pt/',
    area: 'Lisboa (Universidade Autónoma)',
    supletivo: false,
    concelhos: [],
    fonte: 'Lista da DGC (arbitragem.autonoma.pt redirecciona para arbitragem.grupoautonoma.pt); área territorial por confirmar — não entra no mapa dos concelhos',
    verificado: '2026-10-22 (lista); área por confirmar',
  },
]);

/** Os centros sectoriais, opcionais: seguros e viagens. */
export const CENTROS_SECTORIAIS = Object.freeze([
  {
    sigla: 'CIMPAS',
    nome: 'Centro de Informação, Mediação e Arbitragem de Seguros',
    sitio: 'https://www.cimpas.pt/',
    area: 'Seguros (sectorial)',
    sector: 'seguros',
    fonte: 'Lista da DGC, conferida a 2026-10-22',
    verificado: '2026-10-22',
  },
  {
    sigla: 'APAVT',
    nome: 'Provedor do Cliente das Agências de Viagens e Turismo (Provedor da APAVT)',
    sitio: 'https://provedor.apavtnet.pt/',
    area: 'Viagens e turismo (sectorial)',
    sector: 'viagens',
    fonte: 'Lista da DGC, conferida a 2026-10-22',
    verificado: '2026-10-22',
  },
]);

// Outras grafias correntes dos mesmos concelhos.
const ALIAS = {
  'famalicao': 'Vila Nova de Famalicão',
  'v. n. de famalicao': 'Vila Nova de Famalicão',
  'vn famalicao': 'Vila Nova de Famalicão',
  'povoa do varzim': 'Póvoa de Varzim',
  'gaia': 'Vila Nova de Gaia',
  'v. n. de gaia': 'Vila Nova de Gaia',
  'vn gaia': 'Vila Nova de Gaia',
  's. joao da madeira': 'São João da Madeira',
  'sao joao da madeira': 'São João da Madeira',
  'vila real de sto. antonio': 'Vila Real de Santo António',
};

// Nomes que existem em mais de uma região: só com a região entre parênteses.
const AMBIGUOS = {
  'calheta': ['Calheta (Madeira)', 'Calheta (Açores)'],
  'lagoa': ['Lagoa (Algarve)', 'Lagoa (Açores)'],
};

const INDICE = (() => {
  const mapa = new Map();
  for (const centro of CENTROS) {
    for (const concelho of centro.concelhos) {
      const chave = normalizar(concelho);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(centro);
    }
  }
  return mapa;
})();

/**
 * Todos os centros com competência num concelho (há concelhos em duas áreas: Santo Tirso e Trofa estão no
 * CICAP e no TRIAVE; Póvoa de Lanhoso e Vieira do Minho no CIAB e no TRIAVE).
 * @param {string} concelho
 * @returns {object[]} vazio quando não se sabe (nunca adivinha)
 */
export function centrosPorConcelho(concelho) {
  const chave = normalizar(concelho);
  if (!chave) return [];
  if (AMBIGUOS[chave]) return [];
  const nome = ALIAS[chave] ? normalizar(ALIAS[chave]) : chave;
  return [...(INDICE.get(nome) || [])];
}

/**
 * O centro de um concelho (o primeiro, quando há dois), ou null quando não se sabe.
 * «Calheta» e «Lagoa» sem a região entre parênteses dão null, porque existem na Madeira/Açores e no
 * Algarve/Açores.
 * @param {string} concelho
 * @returns {object|null}
 */
export function centroPorConcelho(concelho) {
  return centrosPorConcelho(concelho)[0] || null;
}

/** Os concelhos que o mapa conhece. */
export function concelhosConhecidos() {
  return CENTROS.flatMap((c) => c.concelhos).sort((a, b) => a.localeCompare(b, 'pt'));
}

const TEXTOS_PT = {
  enquadramento: FRASE_RAL,
  supletivoNacional: 'para quem resida fora das áreas dos outros centros',
  supletivoLocal: 'para quem resida fora da área do centro acima',
  lista: 'A lista actualizada das entidades está no',
  portal: 'Portal do Consumidor',
  cec: 'Se vive noutro país da União Europeia, o Centro Europeu do Consumidor do seu país ajuda gratuitamente nos litígios com empresas de outros países:',
  cecLigacao: 'Rede de Centros Europeus do Consumidor',
};

function porSigla(sigla, lista) {
  return lista.find((c) => normalizar(c.sigla) === normalizar(sigla));
}

function escolherCentros({ ambito, concelhos, centros }) {
  const supletivo = CENTROS.find((c) => c.supletivo);
  const regionais = CENTROS.filter((c) => !c.supletivo);
  if (ambito === 'nacional') return regionais.concat([supletivo]).map((c) => ({ centro: c, nota: c.supletivo ? 'nacional' : null }));
  const escolhidos = [];
  const juntar = (c) => {
    if (!escolhidos.some((e) => e.centro.sigla === c.sigla)) escolhidos.push({ centro: c, nota: null });
  };
  if (Array.isArray(centros) && centros.length) {
    for (const sigla of centros) {
      const c = porSigla(sigla, CENTROS);
      if (!c) throw new Error(`Centro desconhecido: ${sigla}`);
      juntar(c);
    }
  } else {
    if (!Array.isArray(concelhos) || !concelhos.length) throw new Error('No âmbito local indica concelhos: [...] ou centros: [...]');
    for (const concelho of concelhos) {
      const lista = centrosPorConcelho(concelho);
      if (!lista.length) {
        throw new Error(`Concelho desconhecido para o mapa dos centros: «${concelho}» — passa centros: ['SIGLA'] ou usa ambito: 'nacional'`);
      }
      lista.forEach(juntar);
    }
  }
  const semSupletivo = escolhidos.filter((e) => !e.centro.supletivo);
  return semSupletivo.concat([{ centro: supletivo, nota: 'local' }]);
}

function sitioLegivel(sitio) {
  return sitio.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

/**
 * O bloco de HTML para a página de litígios, o rodapé ou os termos.
 * @param {object} [opcoes]
 * @param {'nacional'|'local'} [opcoes.ambito='nacional'] nacional: os 10 centros; local: o(s) da zona + o CNIACC
 * @param {string[]} [opcoes.concelhos] no âmbito local, os concelhos do negócio (lança erro se um for desconhecido)
 * @param {string[]} [opcoes.centros] no âmbito local, as siglas directamente (em vez dos concelhos)
 * @param {string[]} [opcoes.extra] sectoriais a juntar: 'CIMPAS', 'APAVT'
 * @param {string} [opcoes.lingua='pt'] o atributo lang; os textos são em português salvo se passares `textos`
 * @param {boolean} [opcoes.comCec=false] junta a nota do Centro Europeu do Consumidor (clientes de fora)
 * @param {Partial<typeof TEXTOS_PT>} [opcoes.textos] para traduzir os textos de enquadramento
 * @param {string} [opcoes.classe='ral']
 * @returns {string}
 */
export function ralHtml({ ambito = 'nacional', concelhos = [], centros, extra = [], lingua = 'pt', comCec = false, textos = {}, classe = 'ral' } = {}) {
  if (ambito !== 'nacional' && ambito !== 'local') throw new Error(`Âmbito desconhecido: ${ambito} (usa 'nacional' ou 'local')`);
  const t = { ...TEXTOS_PT, ...textos };
  const escolhidos = escolherCentros({ ambito, concelhos, centros });
  const sectoriais = extra.map((sigla) => {
    const c = porSigla(sigla, CENTROS_SECTORIAIS);
    if (!c) throw new Error(`Centro sectorial desconhecido: ${sigla} (usa CIMPAS ou APAVT)`);
    return c;
  });
  const itens = escolhidos.map(({ centro, nota }) => {
    const area = nota === 'nacional' ? t.supletivoNacional : nota === 'local' ? t.supletivoLocal : centro.area;
    return `<li><strong>${esc(centro.sigla)}</strong> — ${esc(centro.nome)} (${esc(area)}): <a href="${esc(centro.sitio)}" target="_blank" rel="noopener">${esc(sitioLegivel(centro.sitio))}</a></li>`;
  });
  for (const c of sectoriais) {
    itens.push(`<li><strong>${esc(c.sigla)}</strong> — ${esc(c.nome)} (${esc(c.area)}): <a href="${esc(c.sitio)}" target="_blank" rel="noopener">${esc(sitioLegivel(c.sitio))}</a></li>`);
  }
  const partes = [
    `<div class="${esc(classe)}" lang="${esc(lingua)}">`,
    `<p>${esc(t.enquadramento)}</p>`,
    `<ul class="${esc(classe)}__lista">`,
    ...itens,
    '</ul>',
    `<p>${esc(t.lista)} <a href="${LISTA_DGC_URL}" target="_blank" rel="noopener">${esc(t.portal)}</a>.</p>`,
  ];
  if (comCec) partes.push(`<p>${esc(t.cec)} <a href="${CEC_URL}" target="_blank" rel="noopener">${esc(t.cecLigacao)}</a>.</p>`);
  partes.push('</div>');
  return partes.join('\n');
}

/**
 * O mesmo em texto simples, para emails e PDF.
 * @param {Parameters<typeof ralHtml>[0]} [opcoes]
 * @returns {string}
 */
export function ralTexto({ ambito = 'nacional', concelhos = [], centros, extra = [], textos = {} } = {}) {
  const t = { ...TEXTOS_PT, ...textos };
  const escolhidos = escolherCentros({ ambito, concelhos, centros });
  const linhas = [t.enquadramento];
  for (const { centro, nota } of escolhidos) {
    const area = nota === 'nacional' ? t.supletivoNacional : nota === 'local' ? t.supletivoLocal : centro.area;
    linhas.push(`- ${centro.sigla} — ${centro.nome} (${area}): ${centro.sitio}`);
  }
  for (const sigla of extra) {
    const c = porSigla(sigla, CENTROS_SECTORIAIS);
    if (!c) throw new Error(`Centro sectorial desconhecido: ${sigla} (usa CIMPAS ou APAVT)`);
    linhas.push(`- ${c.sigla} — ${c.nome} (${c.area}): ${c.sitio}`);
  }
  linhas.push(`${t.lista} ${t.portal}: ${LISTA_DGC_URL}`);
  return linhas.join('\n');
}
