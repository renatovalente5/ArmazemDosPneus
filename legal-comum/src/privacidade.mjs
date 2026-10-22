// Política de privacidade: os destinatários reais dos dados, gerados a partir dos fornecedores de cada site,
// e os blocos de texto que se repetem (RGPD, arts. 12.º a 14.º: responsável, finalidades, destinatários,
// transferências e a sua base, prazos, direitos, reclamação à CNPD).
//
// Estado da verificação (lista do Data Privacy Framework, dataprivacyframework.gov/list, consultada pela API
// pública a 2026-10-22, estado «Active» na certificação UE-EUA): GitHub; Cloudflare, Inc. (recertificação
// em análise, mas activa); Google LLC; Meta Platforms, Inc. (recertificação em análise); Microsoft
// Corporation; Resend (recertificação em análise); Stripe, LLC. Os fornecedores da UE (DNS.PT, Ifthenpay,
// SIBS, SAPO/MEO, Plausible) não transferem para fora da UE. A Hostinger não consta da lista: fica «verificar».
import { esc } from './util.mjs';

const DATA_VERIFICACAO = '2026-10-22';
const FONTE_DPF = (nome, estado = 'Active') =>
  `Lista do Data Privacy Framework, entrada «${nome}», certificação UE-EUA ${estado}, consultada a ${DATA_VERIFICACAO}`;

/**
 * O catálogo das entidades. `transferencia`: 'DPF' (consta da lista do Data Privacy Framework), 'SCC'
 * (cláusulas contratuais-tipo), 'UE' (sem transferência para fora da UE) ou 'verificar' (não confirmado).
 */
export const CATALOGO_DESTINATARIOS = Object.freeze({
  github: {
    nome: 'GitHub, Inc.',
    pais: 'EUA',
    transferencia: 'DPF',
    fonte: FONTE_DPF('GitHub'),
    verificado: DATA_VERIFICACAO,
  },
  cloudflare: {
    nome: 'Cloudflare, Inc.',
    pais: 'EUA',
    transferencia: 'DPF',
    fonte: FONTE_DPF('Cloudflare, Inc.', 'Active (recertificação em análise)'),
    verificado: DATA_VERIFICACAO,
  },
  hostinger: {
    nome: 'Hostinger International Ltd.',
    pais: 'Chipre (UE); o centro de dados depende do plano',
    transferencia: 'verificar',
    fonte: `Não consta da lista do Data Privacy Framework (${DATA_VERIFICACAO}); confirmar o centro de dados no hPanel e o acordo de tratamento de dados da Hostinger`,
    verificado: null,
  },
  'dns.pt': {
    nome: 'Associação DNS.PT',
    pais: 'Portugal',
    transferencia: 'UE',
    fonte: 'Registo nacional dos domínios .pt (entidade portuguesa; sem transferência)',
    verificado: DATA_VERIFICACAO,
  },
  microsoft: {
    nome: 'Microsoft Corporation (contraente na UE: Microsoft Ireland Operations Ltd.)',
    pais: 'EUA / Irlanda',
    transferencia: 'DPF',
    fonte: FONTE_DPF('Microsoft Corporation'),
    verificado: DATA_VERIFICACAO,
  },
  google: {
    nome: 'Google LLC (contraente na UE: Google Ireland Ltd.)',
    pais: 'EUA / Irlanda',
    transferencia: 'DPF',
    fonte: FONTE_DPF('Google LLC'),
    verificado: DATA_VERIFICACAO,
  },
  sapo: {
    nome: 'MEO – Serviços de Comunicações e Multimédia, S.A. (SAPO Mail)',
    pais: 'Portugal',
    transferencia: 'UE',
    fonte: 'Fornecedor nacional, sem transferência para fora da UE; a denominação social fica por confirmar na política do SAPO',
    verificado: null,
  },
  meta: {
    nome: 'Meta Platforms, Inc. (contraentes na UE: Meta Platforms Ireland Ltd. e WhatsApp Ireland Ltd.)',
    pais: 'EUA / Irlanda',
    transferencia: 'DPF',
    fonte: FONTE_DPF('Meta Platforms, Inc.', 'Active (recertificação em análise)'),
    verificado: DATA_VERIFICACAO,
  },
  resend: {
    nome: 'Resend',
    pais: 'EUA',
    transferencia: 'DPF',
    fonte: `${FONTE_DPF('Resend', 'Active (recertificação em análise)')}; o acordo de tratamento de dados da Resend inclui também as cláusulas contratuais-tipo (SCC)`,
    verificado: DATA_VERIFICACAO,
  },
  stripe: {
    nome: 'Stripe Payments Europe, Ltd. (Irlanda) e Stripe, LLC (EUA)',
    pais: 'Irlanda / EUA',
    transferencia: 'DPF',
    fonte: FONTE_DPF('Stripe, LLC'),
    verificado: DATA_VERIFICACAO,
  },
  ifthenpay: {
    nome: 'Ifthenpay, Lda.',
    pais: 'Portugal',
    transferencia: 'UE',
    fonte: 'Entidade de pagamento portuguesa, sem transferência para fora da UE',
    verificado: DATA_VERIFICACAO,
  },
  sibs: {
    nome: 'SIBS Forward Payment Solutions, S.A. (MB WAY)',
    pais: 'Portugal',
    transferencia: 'UE',
    fonte: 'Entidade portuguesa, sem transferência para fora da UE',
    verificado: DATA_VERIFICACAO,
  },
  plausible: {
    nome: 'Plausible Insights OÜ',
    pais: 'Estónia',
    transferencia: 'UE',
    fonte: 'Fornecedor na UE, sem cookies; sem transferência para fora da UE',
    verificado: DATA_VERIFICACAO,
  },
});

const FINALIDADES = {
  alojamento: {
    'github-pages': ['github', 'alojamento do site (GitHub Pages) e dos seus ficheiros; registos técnicos de acesso'],
    cloudflare: ['cloudflare', 'alojamento e entrega do site (Pages/Workers); registos técnicos de acesso'],
    hostinger: ['hostinger', 'alojamento do site; registos técnicos de acesso'],
  },
  dns: {
    'dns.pt': ['dns.pt', 'registo do domínio (dados do titular)'],
    cloudflare: ['cloudflare', 'DNS do domínio'],
  },
  email: {
    microsoft: ['microsoft', 'caixa de correio (Microsoft 365/Outlook): os emails que nos envia e as respostas'],
    google: ['google', 'caixa de correio (Gmail/Google Workspace): os emails que nos envia e as respostas'],
    sapo: ['sapo', 'caixa de correio (SAPO Mail): os emails que nos envia e as respostas'],
    hostinger: ['hostinger', 'caixa de correio (Hostinger Email): os emails que nos envia e as respostas'],
  },
  mapas: {
    google: ['google', 'mapa incorporado, carregado só depois do seu clique (endereço IP e cookies da Google)'],
  },
  envioEmails: {
    resend: ['resend', 'envio dos emails automáticos (confirmações e avisos)'],
  },
  pagamentos: {
    stripe: ['stripe', 'pagamentos por cartão (os dados do cartão vão directamente para a Stripe)'],
    ifthenpay: ['ifthenpay', 'referências Multibanco e pedidos MB WAY'],
    'mbway-manual': ['sibs', 'pagamento por MB WAY feito por si na sua app; recebemos só a confirmação'],
  },
  analytics: {
    ga4: ['google', 'estatísticas de utilização (Google Analytics), só com o seu consentimento'],
    plausible: ['plausible', 'estatísticas agregadas de utilização, sem cookies'],
    cloudflare: ['cloudflare', 'estatísticas agregadas de utilização (Web Analytics), sem cookies'],
  },
};

const META = {
  whatsapp: 'conversas pelo WhatsApp (o seu número e as mensagens)',
  instagram: 'perfil no Instagram e as suas estatísticas (co-responsabilidade «Page Insights»)',
  facebookPage: 'página no Facebook e as suas estatísticas (co-responsabilidade «Page Insights»)',
};

function entradaDesconhecida(chave, valor, finalidade) {
  return {
    chave: `${chave}:${valor}`,
    nome: `Fornecedor por indicar (${chave}: ${valor})`,
    finalidade,
    pais: 'por indicar',
    transferencia: 'verificar',
    fonte: 'Valor fora do catálogo — indicar o nome e confirmar a base da transferência',
    verificado: null,
  };
}

/**
 * Os destinatários dos dados, a partir dos fornecedores do site. Entidades repetidas (a Google no email e no
 * mapa, a Cloudflare no alojamento e no DNS) saem uma vez, com as finalidades juntas.
 * @param {object} config
 * @param {'github-pages'|'cloudflare'|'hostinger'} [config.alojamento]
 * @param {'dns.pt'|'cloudflare'} [config.dns]
 * @param {'microsoft'|'google'|'sapo'|'hostinger'|'outro'} [config.email]
 * @param {string} [config.emailNome] o nome do fornecedor quando email = 'outro'
 * @param {'google'|null} [config.mapas]
 * @param {boolean} [config.whatsapp]
 * @param {boolean} [config.instagram]
 * @param {boolean} [config.facebookPage]
 * @param {'resend'|null} [config.envioEmails]
 * @param {('stripe'|'ifthenpay'|'mbway-manual')[]|string|null} [config.pagamentos]
 * @param {'ga4'|'plausible'|'cloudflare'|null} [config.analytics]
 * @param {{ nome: string, papel?: string }} [config.manutencao] quem mantém o site (subcontratante)
 * @param {boolean} [config.videovigilancia] não é destinatário; serve a frasesPrivacidade()
 * @returns {{ chave: string, nome: string, finalidade: string, pais: string, transferencia: 'DPF'|'SCC'|'UE'|'verificar', fonte: string, verificado: string|null }[]}
 */
export function destinatarios(config = {}) {
  const lista = [];
  const juntar = (chave, finalidade) => {
    const base = CATALOGO_DESTINATARIOS[chave];
    const existente = lista.find((d) => d.chave === chave);
    if (existente) {
      if (!existente.finalidade.includes(finalidade)) existente.finalidade += `; ${finalidade}`;
      return;
    }
    lista.push({ chave, ...base, finalidade });
  };
  const porTabela = (campo, valor) => {
    if (valor === null || valor === undefined || valor === false) return;
    const tabela = FINALIDADES[campo];
    const entrada = tabela[valor];
    if (!entrada) {
      if (campo === 'email' && valor === 'outro') {
        lista.push({
          chave: 'email:outro',
          nome: config.emailNome || 'Fornecedor de email por indicar',
          finalidade: 'caixa de correio: os emails que nos envia e as respostas',
          pais: 'por indicar',
          transferencia: 'verificar',
          fonte: 'Fornecedor fora do catálogo — confirmar o país e a base da transferência',
          verificado: null,
        });
        return;
      }
      lista.push(entradaDesconhecida(campo, valor, `${campo}`));
      return;
    }
    juntar(entrada[0], entrada[1]);
  };
  porTabela('alojamento', config.alojamento);
  porTabela('dns', config.dns);
  porTabela('email', config.email);
  porTabela('mapas', config.mapas);
  porTabela('envioEmails', config.envioEmails);
  const pagamentos = Array.isArray(config.pagamentos) ? config.pagamentos : config.pagamentos ? [config.pagamentos] : [];
  for (const p of pagamentos) porTabela('pagamentos', p);
  porTabela('analytics', config.analytics);
  for (const [campo, finalidade] of Object.entries(META)) {
    if (config[campo]) juntar('meta', finalidade);
  }
  if (config.manutencao && config.manutencao.nome) {
    lista.push({
      chave: 'manutencao',
      nome: config.manutencao.nome,
      finalidade: `manutenção do site e dos painéis, como ${config.manutencao.papel || 'subcontratante'} (RGPD, art. 28.º)`,
      pais: 'Portugal',
      transferencia: 'UE',
      fonte: 'Contrato de subcontratação (RGPD, art. 28.º)',
      verificado: DATA_VERIFICACAO,
    });
  }
  return lista;
}

const TRANSFERENCIA_TEXTO = {
  DPF: 'EUA: consta da lista do Data Privacy Framework (decisão de adequação da Comissão Europeia)',
  SCC: 'Cláusulas contratuais-tipo aprovadas pela Comissão Europeia',
  UE: 'Sem transferência: os dados ficam na União Europeia',
  verificar: 'Por confirmar',
};

/**
 * A lista dos destinatários em HTML: tabela (por omissão) ou lista.
 * @param {Parameters<typeof destinatarios>[0]} config
 * @param {{ formato?: 'tabela'|'lista', classe?: string }} [opcoes]
 * @returns {string}
 */
export function destinatariosHtml(config = {}, { formato = 'tabela', classe = 'destinatarios' } = {}) {
  const lista = destinatarios(config);
  if (!lista.length) return `<p class="${esc(classe)}" lang="pt">Não comunicamos os seus dados a terceiros.</p>`;
  if (formato === 'lista') {
    const itens = lista.map(
      (d) => `<li><strong>${esc(d.nome)}</strong> (${esc(d.pais)}) — ${esc(d.finalidade)}. ${esc(TRANSFERENCIA_TEXTO[d.transferencia])}.</li>`,
    );
    return `<ul class="${esc(classe)}" lang="pt">\n${itens.join('\n')}\n</ul>`;
  }
  if (formato !== 'tabela') throw new Error(`Formato desconhecido: ${formato} (usa 'tabela' ou 'lista')`);
  const linhas = lista.map(
    (d) =>
      `<tr><td>${esc(d.nome)}</td><td>${esc(d.finalidade)}</td><td>${esc(d.pais)}</td><td>${esc(TRANSFERENCIA_TEXTO[d.transferencia])}</td></tr>`,
  );
  return [
    `<table class="${esc(classe)}" lang="pt">`,
    '<thead><tr><th scope="col">Quem</th><th scope="col">Para quê</th><th scope="col">Onde</th><th scope="col">Transferência para fora da UE</th></tr></thead>',
    '<tbody>',
    ...linhas,
    '</tbody>',
    '</table>',
  ].join('\n');
}

/** Para pôr junto de cada formulário (RGPD, art. 13.º). */
export const FRASE_FORMULARIO =
  'Os dados que enviar servem só para responder ao seu pedido e ficam guardados até 12 meses. Saiba mais na política de privacidade.';

/**
 * A mesma frase com a ligação à política.
 * @param {{ urlPolitica: string, meses?: number, finalidade?: string }} opcoes
 * @returns {string}
 */
export function fraseFormularioHtml({ urlPolitica, meses = 12, finalidade = 'responder ao seu pedido' }) {
  if (!urlPolitica) throw new Error('fraseFormularioHtml precisa de urlPolitica');
  return `<p class="privacidade-formulario" lang="pt">Os dados que enviar servem só para ${esc(finalidade)} e ficam guardados até ${meses} ${meses === 1 ? 'mês' : 'meses'}. Saiba mais na <a href="${esc(urlPolitica)}">política de privacidade</a>.</p>`;
}

export const FRASE_FOTOGRAFIAS =
  'Publicamos fotografias de clientes e dos seus pedidos só com autorização escrita, dada para este fim; pode retirá-la a qualquer momento por email.';

/** Página de Facebook ou perfil de Instagram: co-responsabilidade pelas estatísticas («Page Insights»). */
export const FRASE_PAGINA_META =
  'Temos página no Facebook e/ou perfil no Instagram. As estatísticas dessas páginas («Page Insights») são tratadas em co-responsabilidade com a Meta Platforms Ireland Ltd., nos termos da adenda de co-responsabilidade da Meta: a Meta é a principal responsável e é a ela que pode dirigir os pedidos sobre esses dados. O que publica ou nos envia nessas plataformas segue também a política de privacidade da Meta.';

/**
 * Quando o cliente tem câmaras (Lei n.º 34/2013, art. 31.º: gravações guardadas 30 dias; Lei n.º 58/2019,
 * art. 19.º).
 * @param {{ responsavel?: string, dias?: number }} [opcoes]
 * @returns {string}
 */
export function fraseVideovigilancia({ responsavel, dias = 30 } = {}) {
  return (
    `As nossas instalações têm videovigilância, sinalizada à entrada. As imagens servem só para a segurança de pessoas e bens, são guardadas ${dias} dias (salvo quando sejam prova num processo) e só são comunicadas às autoridades.` +
    (responsavel ? ` Responsável pelo tratamento: ${responsavel}.` : '') +
    ' Pode pedir acesso às imagens em que apareça.'
  );
}

export const FRASE_VIDEOVIGILANCIA = fraseVideovigilancia();

export const FRASE_REPOSITORIO_PUBLICO =
  'Os ficheiros deste site estão num repositório público (GitHub), e o histórico desse repositório guarda as versões anteriores das páginas. Por isso não publicamos dados pessoais de clientes nas páginas do site, e o que nos envia por formulário ou email nunca entra no repositório.';

/** Os direitos (RGPD, arts. 15.º a 22.º), o prazo de um mês (art. 12.º, n.º 3) e a reclamação à CNPD (art. 77.º). */
export const DIREITOS = Object.freeze([
  { nome: 'acesso', descricao: 'saber que dados seus temos e receber uma cópia' },
  { nome: 'rectificação', descricao: 'corrigir dados errados ou incompletos' },
  { nome: 'apagamento', descricao: 'pedir que apaguemos os dados, quando já não sejam precisos' },
  { nome: 'limitação', descricao: 'pedir que deixemos de os usar enquanto se esclarece um pedido' },
  { nome: 'portabilidade', descricao: 'receber os dados que nos deu num formato de uso corrente' },
  { nome: 'oposição', descricao: 'opor-se a um tratamento baseado no nosso interesse legítimo' },
  { nome: 'retirar o consentimento', descricao: 'a qualquer momento, sem afectar o que foi feito antes' },
]);

export const CNPD_URL = 'https://www.cnpd.pt/';

/**
 * O bloco dos direitos para a política.
 * @param {{ email: string, classe?: string }} opcoes
 * @returns {string}
 */
export function direitosHtml({ email, classe = 'direitos' }) {
  if (!email) throw new Error('direitosHtml precisa do email de contacto');
  const itens = DIREITOS.map((d) => `<li><strong>${esc(d.nome)}</strong>: ${esc(d.descricao)}</li>`);
  return [
    `<div class="${esc(classe)}" lang="pt">`,
    `<p>Pode exercer os seus direitos por email para <a href="mailto:${esc(email)}">${esc(email)}</a>. Respondemos no prazo de um mês (RGPD, art. 12.º, n.º 3).</p>`,
    '<ul>',
    ...itens,
    '</ul>',
    `<p>Se achar que o tratamento não cumpre a lei, pode reclamar à Comissão Nacional de Protecção de Dados: <a href="${CNPD_URL}" target="_blank" rel="noopener">cnpd.pt</a>.</p>`,
    '</div>',
  ].join('\n');
}

/** Prazos sugeridos, com a razão. */
export const prazos = Object.freeze({
  pedidosDeContacto: { meses: 12, texto: 'Pedidos de contacto e orçamentos: 12 meses depois da última troca de mensagens.' },
  encomendas: { anos: 10, texto: 'Encomendas e facturas: 10 anos, por obrigação fiscal (CIVA, art. 52.º).' },
  registosTecnicos: { dias: 90, texto: 'Registos técnicos de acesso ao site: 90 dias.' },
});

/**
 * As frases que se aplicam a uma configuração (para juntar à política).
 * @param {object} config a mesma de destinatarios(), mais { repositorioPublico?: boolean, responsavel?: string }
 * @returns {string[]}
 */
export function frasesPrivacidade(config = {}) {
  const frases = [];
  if (config.facebookPage || config.instagram) frases.push(FRASE_PAGINA_META);
  if (config.videovigilancia) frases.push(fraseVideovigilancia({ responsavel: config.responsavel }));
  if (config.repositorioPublico) frases.push(FRASE_REPOSITORIO_PUBLICO);
  if (config.fotografiasDeClientes) frases.push(FRASE_FOTOGRAFIAS);
  return frases;
}
