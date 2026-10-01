#!/usr/bin/env node
/* A BATERIA DA GUARDA DO CONTEÚDO E DO CI.
 *
 * Corre em local (não no CI: afirma coisas sobre os dados de HOJE, e um
 * produto partido pelo dono não pode parar a publicação por causa de um teste).
 *
 *     PYTHON=<python com Pillow> node .github/test-guardas.mjs
 *
 * O que prova:
 *   · regras.mjs é ES module puro (corre no browser e num Worker);
 *   · os dados de hoje passam sem nada neutralizado, e a cópia publicada é o
 *     ficheiro byte a byte; e a garantia dos seminovos passou de 12 a 18
 *     meses sem mais nada mudar no products.json;
 *   · o checkout (num vm): as condições mostradas, o peso, e a caixa da
 *     garantia dos pneus seminovos — o mesmo texto e a mesma versão do
 *     worker/src/garantia.js, obrigatória, e no pedido só quando aparece;
 *   · re-jogar os commits de data/ desde o e37161a: nenhum teria parado a
 *     publicação (os de antes listam-se, com a razão);
 *   · os ficheiros como o Pages CMS os gravava (sem as chaves vazias) passam:
 *     ele saiu na fase G, mas os dados antigos ficaram assim;
 *   · cada regra com um caso e a classe certa — um produto partido nunca dá
 *     exit 1, e sai de venda na cópia publicada sem mexer no ficheiro;
 *   · 30 problemas → 9 anotações + «e mais 21», e os 30 no resumo;
 *   · o Worker dos pagamentos (worker/src/termos.js) aceita tudo o que estas
 *     regras aceitam nos campos que repete aos clientes — caso a caso e ao
 *     acaso, contra o termos.js verdadeiro —, a guarda já não avisa de cópias
 *     do Worker (deixaram de existir), e o worker/src não volta a ter esses
 *     valores escritos à mão;
 *   · o varrimento: apagar cada chave, uma a uma (memória
 *     testar-o-caminho-do-cliente), mudar cada categoria, ligar e desligar
 *     cada produto;
 *   · o dono é autónomo: uma secção da Loja online que o settings.json perdeu
 *     volta pelo painel (L2-04), e as mensagens das regras só nomeiam o Renato
 *     nas avarias técnicas;
 *   · a fase G (saiu o Pages CMS): o /admin reencaminha para o painel e uma
 *     pasta admin/ na _site pára a publicação; um .pages.yml que volte também;
 *   · o pages.yml: os passos corridos TAL COMO ESTÃO ESCRITOS no YAML
 *     (extraídos, nunca reescritos — memória correr-a-guarda-verdadeira): as
 *     verificações de fuga, a config do wrangler contra o wrangler.jsonc, o
 *     job avisar com um gh de faz-de-conta, e a publicação de ponta a ponta
 *     com um produto partido. */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync, existsSync, symlinkSync, statSync, copyFileSync, cpSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import vm from 'node:vm';
import * as R from './regras.mjs';
import * as G from './guardas.mjs';
import * as T from '../worker/src/termos.js';
import * as GW from '../worker/src/garantia.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PY = process.env.PYTHON || 'python3';   // no Mac, o do venv com Pillow: o python3 do sistema é o do Xcode
const GUARDA = join(RAIZ, '.github', 'guardas.mjs');
const YAML = readFileSync(join(RAIZ, '.github', 'workflows', 'pages.yml'), 'utf8');
const TMP = mkdtempSync(join(tmpdir(), 'ap-guardas-'));

let passou = 0; let falhou = 0;
const certo = (c, d, extra = '') => {
  if (c) { passou++; console.log(`  ✓ ${d}`); } else { falhou++; console.log(`  ✗ ${d}${extra ? `  — ${extra}` : ''}`); }
};
const secao = (t) => console.log(`\n— ${t}`);
const clonar = (x) => JSON.parse(JSON.stringify(x));
const ler = (rel) => readFileSync(join(RAIZ, rel), 'utf8');
const correr = (cmd, args, opcoes = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opcoes, env: { ...process.env, GITHUB_STEP_SUMMARY: '', ...(opcoes.env || {}) } });
  return { status: r.status, out: r.stdout || '', err: r.stderr || '' };
};

const TEXTO = Object.fromEntries(Object.entries(R.FICHEIROS).map(([qual, rel]) => [qual, ler(rel)]));
const HOJE = Object.fromEntries(Object.entries(TEXTO).map(([qual, t]) => [qual, JSON.parse(t)]));
const UPLOADS = readdirSync(join(RAIZ, 'assets', 'uploads')).filter((f) => statSync(join(RAIZ, 'assets', 'uploads', f)).isFile());
const existeHoje = G.imagemExisteEm(RAIZ);

/* Um site.json e um empresa.json completos, pela forma do §5.1 do plano (os
   ficheiros chegam na fase A2). O email é de exemplo. */
const SITE_OK = {
  contactos: { telefone: '935 218 857', telefone2: '932 948 572', whatsapp: '351935218857', email: 'geral@exemplo.pt', facebook: 'https://www.facebook.com/armazem.dospeneus/', nota_chamada: '(Chamada para a rede móvel nacional)' },
  horario: {
    dias: {
      seg: [{ abre: '09:00', fecha: '19:00' }], ter: [{ abre: '09:00', fecha: '19:00' }], qua: [{ abre: '09:00', fecha: '19:00' }],
      qui: [{ abre: '09:00', fecha: '19:00' }], sex: [{ abre: '09:00', fecha: '12:30' }, { abre: '14:00', fecha: '19:00' }],
      sab: [{ abre: '09:00', fecha: '13:00' }], dom: [],
    },
    nota: '',
  },
  servicos: ['montagem', 'alinhamento', 'furos', 'travoes', 'amortecedores', 'oleo', 'embraiagem', 'distribuicao', 'ac'].map((id) => ({ id, titulo: `Serviço ${id}`, texto: `Texto do serviço ${id}, com **negrito**.`, icone: id })),
  textos: {
    topo: { sobretitulo: 'Novos · Seminovos · Preços de revenda', titulo1: 'Pneus e oficina', titulo2: 'ao melhor preço', titulo3: 'em Ovar', frase: 'Venda e montagem de pneus.', frase_destaque: 'Os nossos clientes são a nossa prioridade!', destaques: ['Montagem & equilibragem', 'Alinhamento de direção', 'Todas as marcas'] },
    servicos: { frase: 'Uma oficina completa para o seu carro.' },
    sobre: { titulo: 'O seu armazém de pneus em Ovar', paragrafos: ['No **Armazém dos Pneus** encontra pneus.', 'Somos também uma **oficina completa**, porque *os nossos clientes são a nossa prioridade!*'], pontos: ['Pneus de todas as marcas e medidas', 'Orçamentos sem compromisso'] },
    contactos: { frase: 'Estamos em Arada, Ovar.' },
    rodape: { frase: 'Venda e montagem de pneus novos e seminovos.' },
  },
  marcas: ['Michelin', 'Continental', 'Bridgestone', 'Goodyear', 'Hankook', 'Dunlop', 'Pirelli', 'Lassa'],
};
const EMPRESA_OK = {
  nome: 'Armazém dos Pneus',
  denominacao: 'Motivar & Lucrar, Unipessoal, Lda.',
  nif: '516324950',
  morada: { rua: 'Travessa do Navega, 436 F', cp: '3885-183', localidade: 'Arada', concelho: 'Ovar', distrito: 'Aveiro' },
  capital_social: null,
  conservatoria: null,
  geo: { lat: 40.8992781, lng: -8.6205027 },
  mapa: 'https://maps.app.goo.gl/7zmkjQksjeACTZBy6',
  ral: { nome: 'CNIACC — Centro Nacional de Informação e Arbitragem de Conflitos de Consumo', url: 'https://www.cniacc.pt' },
  livro_reclamacoes: 'https://www.livroreclamacoes.pt/inicio',
};

const dadosDeHoje = () => clonar(HOJE);
const tem = (lista, classe, chave) => lista.some((p) => p.classe === classe && (chave instanceof RegExp ? chave.test(p.chave) : p.chave === chave));
const deClasse = (lista, classe) => lista.filter((p) => p.classe === classe);
const indicePorSku = (sku) => HOJE.products.products.findIndex((p) => p.sku === sku);
const JANTE = indicePorSku('jante-liga-leve-16-5x112-et45');   // à venda hoje
const MICHELIN = indicePorSku('michelin-primacy-4');           // pneu novo, fora de venda
const SEMINOVO = indicePorSku('pneu-seminovo-continental-205-55-r16');
const TESTE = indicePorSku('teste-pagamento');

/* Um repositório de ensaio mínimo: data/ e as fotografias (vazias: a guarda só
   quer saber se existem). Sem o worker/: a guarda não o lê. */
function repoDeEnsaio(dados, { html = {} } = {}) {
  const dir = mkdtempSync(join(TMP, 'repo-'));
  mkdirSync(join(dir, 'data'));
  for (const [qual, rel] of Object.entries(R.FICHEIROS)) {
    const v = dados[qual];
    if (v === undefined || v === null) continue;
    writeFileSync(join(dir, rel), typeof v === 'string' ? v : R.serializar(v, qual === 'settings' ? '\n' : ''));
  }
  mkdirSync(join(dir, 'assets', 'uploads'), { recursive: true });
  for (const f of UPLOADS) writeFileSync(join(dir, 'assets', 'uploads', f), '');
  for (const [rel, texto] of Object.entries(html)) { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), texto); }
  return dir;
}
function guardaEm(dir, env = {}) {
  const rel = join(dir, 'relatorio.json');
  const r = correr('node', [GUARDA, '--raiz', dir, '--relatorio-em', rel], { env });
  return { ...r, relatorio: existsSync(rel) ? JSON.parse(readFileSync(rel, 'utf8')) : null };
}

/* O run: de um passo do pages.yml, tal e qual. */
function passoDoYaml(nome, yaml = YAML) {
  const linhas = yaml.split('\n');
  const ind = (l) => l.match(/^ */)[0].length;
  const i0 = linhas.findIndex((l) => l.trim() === `- name: ${nome}`);
  if (i0 < 0) throw new Error(`o pages.yml não tem o passo «${nome}»`);
  let fim = linhas.length;
  for (let i = i0 + 1; i < linhas.length; i++) if (linhas[i].trim() && ind(linhas[i]) <= ind(linhas[i0])) { fim = i; break; }
  const r = linhas.slice(i0, fim).findIndex((l) => /^\s*run:/.test(l));
  if (r < 0) throw new Error(`o passo «${nome}» não tem run:`);
  const m = linhas[i0 + r].match(/^\s*run:\s*(.*)$/);
  if (m[1] && m[1] !== '|') return m[1] + '\n';
  const corpo = linhas.slice(i0 + r + 1, fim);
  while (corpo.length && !corpo[corpo.length - 1].trim()) corpo.pop();
  const base = Math.min(...corpo.filter((l) => l.trim()).map(ind));
  return corpo.map((l) => l.slice(base)).join('\n') + '\n';
}
function jobDoYaml(nome) {
  const linhas = YAML.split('\n');
  const i0 = linhas.findIndex((l) => l === `  ${nome}:`);
  if (i0 < 0) throw new Error(`o pages.yml não tem o job «${nome}»`);
  let fim = linhas.length;
  for (let i = i0 + 1; i < linhas.length; i++) if (/^  [a-z]/.test(linhas[i]) || /^[a-z]/.test(linhas[i])) { fim = i; break; }
  return linhas.slice(i0, fim).join('\n');
}
function correrPasso(nome, cwd, env = {}) {
  const f = join(TMP, `passo-${Math.random().toString(36).slice(2)}.sh`);
  writeFileSync(f, passoDoYaml(nome));
  return correr('bash', ['-e', f], { cwd, env });
}

try {
  /* ================================================================== */
  secao('regras.mjs corre no browser e num Worker');
  const fonte = readFileSync(join(RAIZ, '.github', 'regras.mjs'), 'utf8');
  certo(!/^\s*import\s/m.test(fonte) && !/\bimport\s*\(/.test(fonte), 'não importa nada');
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  certo(codigo.length > 10000 && !/\brequire\s*\(|\bprocess\.|node:|\bfs\b|Buffer\b|__dirname/.test(codigo), 'nada de require, process, node:, fs ou Buffer (no código, fora dos comentários)');
  certo(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(fonte), 'sem caracteres de controlo literais no código');
  const soltinho = await import(`data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`);
  certo(typeof soltinho.problemas === 'function' && typeof soltinho.neutralizar === 'function', 'importa-se sozinho, sem a pasta à volta (como a cópia do painel)');
  const EDITAVEIS = ['payment', 'shipping.quote_later', 'shipping.tiers', 'shipping.pickup_label', 'shipping.note', 'mounting', 'delivery', 'returns', 'returns.return_cost_eur'];
  const tocam = R.BLOQUEADOS.filter((b) => EDITAVEIS.some((e) => b === e || b.startsWith(e + '.') || e.startsWith(b + '.')));
  certo(tocam.length === 0, 'BLOQUEADOS sem campos de conteúdo (os prazos e a devolução são do dono)', tocam.join(', '));
  certo(R.BLOQUEADOS.every((b) => ['store', 'shipping.free_pickup'].includes(b)), 'BLOQUEADOS = só o legado store e o free_pickup que ninguém lê', R.BLOQUEADOS.join(', '));
  certo(JSON.stringify(R.OBRIGATORIOS) === '["site","empresa"]', 'site.json e empresa.json obrigatórios (desde o A2)');

  /* ================================================================== */
  secao('os dados de hoje');
  const hoje = R.problemas(TEXTO, { imagemExiste: existeHoje });
  certo(deClasse(hoje, 'bloqueia').length === 0, 'nada que pare', deClasse(hoje, 'bloqueia').map((p) => p.chave).join(', '));
  certo(deClasse(hoje, 'neutraliza').length === 0, 'nenhum produto a neutralizar', deClasse(hoje, 'neutraliza').map((p) => p.chave).join(', '));
  const nHoje = R.neutralizar(TEXTO, hoje);
  certo(!nHoje.mudou && nHoje.efeitos.length === 0, 'neutralizar() não muda nada');
  certo(R.serializar(nHoje.products, R.terminacaoDe(TEXTO.products)) === TEXTO.products, 'e a cópia serializada é o ficheiro, byte a byte (sem \\n no fim, como o Pages CMS o deixou)');
  certo(R.serializar(HOJE.settings, R.terminacaoDe(TEXTO.settings)) === TEXTO.settings && R.serializar(HOJE.content, R.terminacaoDe(TEXTO.content)) === TEXTO.content, 'serializar() reproduz settings.json e content.json byte a byte');
  certo(hoje.filter((p) => p.lembrete && /:a-espera$/.test(p.chave)).length === 13, 'lembrete: 13 pneus com preço à vista à espera da etiqueta (11 novos, 2 seminovos)');
  certo(tem(hoje, 'avisa', 'produto:teste-pagamento:escondido-a-venda'), 'lembrete: o artigo de teste está escondido mas à venda');
  {
    /* Decisão do dono (1 out 2026): a garantia dos pneus seminovos passou de 12
       a 18 meses — o mínimo que o DL 84/2021 (art. 12.º) deixa acordar num bem
       usado. O commit que o fez mudou SÓ isso, e o ficheiro ficou serializado
       como estava (o serializar() das regras, com a terminação de antes). */
    const seminovos = (doc) => doc.products.filter((p) => R.ePneu(p) && p.condition === 'Seminovo');
    const git = (...a) => execFileSync('git', ['-C', RAIZ, ...a], { encoding: 'utf8' });
    const commit = git('log', '--reverse', '--format=%H', '-S', '"warranty_months": 18', '--', 'data/products.json').split('\n').filter(Boolean)[0];
    if (!commit) certo(false, 'o commit que pôs os pneus seminovos com 18 meses de garantia (git log -S)');
    else {
      const antes = git('show', `${commit}^:data/products.json`);
      const depois = git('show', `${commit}:data/products.json`);
      const doc = JSON.parse(antes);
      const eram = seminovos(doc).map((p) => p.warranty_months);
      seminovos(doc).forEach((p) => { p.warranty_months = 18; });
      certo(JSON.stringify(eram) === '[12,12]' && R.serializar(doc, R.terminacaoDe(antes)) === depois && !depois.endsWith('\n'),
        `${commit.slice(0, 7)}: o products.json é, byte a byte, o de antes com a garantia dos 2 pneus seminovos de 12 para 18 meses — e mais nada (sem \\n no fim, como estava)`, JSON.stringify(eram));
      const mutante = JSON.parse(antes);
      seminovos(mutante).forEach((p, i) => { p.warranty_months = i ? 18 : 24; });
      certo(R.serializar(mutante, R.terminacaoDe(antes)) !== depois && R.serializar(doc, '\n') !== depois, '   e a comparação sabe dizer «diferente» (24 meses num deles, ou um \\n no fim)');
    }
    const garantias = seminovos(HOJE.products).map((p) => p.warranty_months);
    certo(garantias.length >= 2 && garantias.every((m) => Number.isInteger(m) && m >= R.GARANTIA_MINIMA_USADOS && m <= 36), `hoje: os pneus seminovos têm de 18 a 36 meses de garantia (${garantias.join(', ')})`);
  }
  const real = correr('node', [GUARDA, '--relatorio-em', join(TMP, 'hoje.json')]);
  const relHoje = JSON.parse(readFileSync(join(TMP, 'hoje.json'), 'utf8'));
  certo(real.status === 0, 'a guarda verdadeira, sobre o repositório, sai com 0', real.err);
  certo(relHoje.bloqueia === 0 && relHoje.neutralizados.length === 0 && relHoje.problemas.length === relHoje.avisa && relHoje.avisa > 0, `o relatório diz 0 que param, 0 neutralizados e ${relHoje.avisa} avisos (e lê-se)`);
  certo(G.paginasHtml(RAIZ).length >= 9, `lê as páginas do site (${G.paginasHtml(RAIZ).length})`);
  const partidas = G.paginasHtml(RAIZ).flatMap((p) => G.problemasDoHtml(p, ler(p), { exigirMetas: true }));
  certo(partidas.length === 0, 'as páginas de hoje: nenhum marcador partido, e as duas metas em cada uma', partidas.map((x) => x.mensagem).join(' | '));
  certo(R.serializar(HOJE.site, '\n') === TEXTO.site && R.serializar(HOJE.empresa, '\n') === TEXTO.empresa, 'site.json e empresa.json estão como o painel os grava (2 espaços, \\n no fim)');
  {
    const t = T.termosDasFontes({ settings: HOJE.settings, site: HOJE.site, empresa: HOJE.empresa }, {});
    const deRecurso = Object.entries(t.origem).filter(([, o]) => o !== 'dados').map(([g]) => g);
    const m = HOJE.empresa.morada;
    certo(t.invalidos.length === 0 && deRecurso.length === 0, 'o Worker dos pagamentos lê os dados de hoje sem cair para o recurso em nenhum grupo', JSON.stringify(t.origem));
    certo(t.termos.prazos.min_dias === HOJE.settings.delivery.estimate_min_days && t.termos.prazos.max_dias_uteis === HOJE.settings.delivery.estimate_max_days
      && t.termos.prazos.max_dias === HOJE.settings.delivery.max_days && t.termos.contactos.telefone === HOJE.site.contactos.telefone
      && t.termos.contactos.email === HOJE.site.contactos.email && t.termos.empresa.nif === HOJE.empresa.nif && t.termos.empresa.denominacao === HOJE.empresa.denominacao
      && t.termos.empresa.morada.rua === m.rua && t.termos.empresa.morada.cp === m.cp && t.termos.empresa.morada.localidade === m.localidade
      && t.termos.empresa.livro_reclamacoes === HOJE.empresa.livro_reclamacoes,
    'e os emails dizem o que o site diz: prazos, telefone, email, NIF, denominação, morada e Livro de Reclamações', JSON.stringify(t.termos));
  }

  /* ================================================================== */
  secao('re-jogar os commits de data/');
  const git = (...a) => execFileSync('git', ['-C', RAIZ, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  certo(git('rev-parse', '--is-shallow-repository').trim() === 'false', 'o histórico está inteiro (um clone raso não prova nada)');
  const commits = git('log', '--format=%H %h', '--reverse', '--', 'data/').trim().split('\n').map((l) => l.split(' '));
  const desde = commits.findIndex(([, h]) => h === 'e37161a');
  certo(desde >= 0, 'o e37161a (7 ago, quando entrou o hidden) está no histórico de data/');
  /* Os commits de antes do A2 não tinham site.json nem empresa.json: entram os
     de hoje, para a pergunta ser a de sempre — «as gravações do Pages CMS
     teriam parado a publicação?» — e não «faltava um ficheiro que não
     existia». */
  const noCommit = (c) => {
    const dados = {};
    for (const [qual, rel] of Object.entries(R.FICHEIROS)) {
      try { dados[qual] = execFileSync('git', ['-C', RAIZ, 'show', `${c}:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { dados[qual] = R.OBRIGATORIOS.includes(qual) ? TEXTO[qual] : undefined; }
    }
    const arvore = new Set(git('ls-tree', '-r', '--name-only', c, '--', 'assets/uploads').trim().split('\n'));
    return R.problemas(dados, { imagemExiste: (x) => arvore.has(x.replace(/^\/+/, '')) });
  };
  let depois = 0; let antesComBloqueio = 0;
  for (const [i, [c, h]] of commits.entries()) {
    const lista = noCommit(c);
    const b = deClasse(lista, 'bloqueia');
    const msg = git('log', '-1', '--format=%ad %an: %s', '--date=short', c).trim();
    if (i >= desde) {
      depois++;
      certo(b.length === 0, `${h} ${msg} — publicava (${deClasse(lista, 'neutraliza').length} de produtos, ${deClasse(lista, 'avisa').length} avisos)`, b.map((p) => p.mensagem).join(' | '));
    } else {
      if (b.length) antesComBloqueio++;
      console.log(`    · ${h} ${msg} — antes do e37161a: ${b.length ? `teria parado: ${b.map((p) => p.mensagem).join(' | ')}` : 'publicava'}`);
    }
  }
  certo(depois >= 10, `${depois} commits re-jogados desde o e37161a`);
  certo(antesComBloqueio > 0, 'e a mesma máquina diz «pára» quando é caso disso (os commits antes da loja online não tinham prazos)');

  /* ================================================================== */
  secao('os ficheiros como o Pages CMS os gravava');
  /* O Pages CMS omitia os campos vazios ao gravar (memória pages-cms-apaga-chaves).
     Saiu na fase G, mas os ficheiros que gravou continuam sem essas chaves. */
  const semVazios = (v) => {
    if (Array.isArray(v)) return v.map(semVazios);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, x] of Object.entries(v)) if (!(x === null || x === '')) o[k] = semVazios(x);
      return o;
    }
    return v;
  };
  const settingsCms = semVazios(HOJE.settings);
  certo(!('return_cost_eur' in settingsCms.returns) && !('note' in settingsCms.returns) && !('price_eur' in settingsCms.mounting), 'o caso é o verdadeiro: sem return_cost_eur, returns.note nem mounting.price_eur');
  const cms = R.problemas({ ...TEXTO, settings: R.serializar(settingsCms, '\n') }, { imagemExiste: existeHoje });
  certo(cms.filter((p) => p.ficheiro === 'data/settings.json').length === 0, 'settings.json regravado pelo Pages CMS passa limpo');
  const semReturns = clonar(settingsCms); delete semReturns.returns;
  certo(R.problemas({ ...TEXTO, settings: semReturns }).filter((p) => p.ficheiro === 'data/settings.json').length === 0, 'e sem o bloco returns (a loja paga a devolução) também');
  const produtosCms = semVazios(HOJE.products);
  const pc = R.problemas({ ...TEXTO, products: produtosCms }, { imagemExiste: existeHoje });
  certo(deClasse(pc, 'bloqueia').length === 0 && deClasse(pc, 'neutraliza').length === 0, 'products.json regravado pelo Pages CMS também');
  const nulo = dadosDeHoje(); nulo.settings.returns.return_cost_eur = null; nulo.settings.mounting.price_eur = null;
  const ausente = dadosDeHoje(); delete ausente.settings.returns.return_cost_eur; delete ausente.settings.mounting.price_eur;
  certo(JSON.stringify(R.problemas(nulo).map((p) => p.chave)) === JSON.stringify(R.problemas(ausente).map((p) => p.chave)), 'null e ausente são o mesmo em return_cost_eur e mounting.price_eur');

  /* ================================================================== */
  secao('cada regra, com a classe certa');
  const prod = (i, mudar) => (d) => { mudar(d.products.products[i], d); };
  const CASOS = [
    // [descrição, mudar(dados), classe, chave (texto ou RegExp), efeito?]
    ['produto sem referência', prod(JANTE, (p) => { delete p.sku; }), 'neutraliza', /^produto:#\d+:sku$/, 'retirar'],
    ['referência com maiúsculas e espaços', prod(JANTE, (p) => { p.sku = 'Jante 16'; }), 'neutraliza', 'produto:Jante 16:sku', 'retirar'],
    ['referência repetida', (d) => { d.products.products[JANTE + 1].sku = d.products.products[JANTE].sku; }, 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:repetido', 'fora_de_venda'],
    ['«À venda» em falta', prod(JANTE, (p) => { delete p.available; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:disponivel', 'fora_de_venda'],
    ['«À venda» como texto', prod(JANTE, (p) => { p.available = 'true'; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:disponivel', 'fora_de_venda'],
    ['preço em falta', prod(JANTE, (p) => { delete p.price_eur; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:preco', 'fora_de_venda'],
    ['preço com 3 casas', prod(JANTE, (p) => { p.price_eur = 89.999; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:preco', 'fora_de_venda'],
    ['preço negativo', prod(JANTE, (p) => { p.price_eur = -1; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:preco', 'fora_de_venda'],
    ['preço como texto', prod(JANTE, (p) => { p.price_eur = '89.90'; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:preco', 'fora_de_venda'],
    ['stock partido', prod(JANTE, (p) => { p.stock = 2.5; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:stock', 'fora_de_venda'],
    ['stock acima de 9999', prod(JANTE, (p) => { p.stock = 10000; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:stock', 'fora_de_venda'],
    ['peso zero', prod(JANTE, (p) => { p.weight_kg = 0; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:peso', 'fora_de_venda'],
    ['peso com 3 casas', prod(JANTE, (p) => { p.weight_kg = 1.234; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:peso', 'fora_de_venda'],
    ['nome de uma letra', prod(JANTE, (p) => { p.name = 'J'; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:nome', 'fora_de_venda'],
    ['nome com 121 caracteres', prod(JANTE, (p) => { p.name = 'x'.repeat(121); }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:nome', 'fora_de_venda'],
    ['estado «Usado»', prod(JANTE, (p) => { p.condition = 'Usado'; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:estado', 'fora_de_venda'],
    ['pneu novo à venda sem a etiqueta', prod(MICHELIN, (p) => { p.available = true; }), 'neutraliza', 'produto:michelin-primacy-4:etiqueta', 'fora_de_venda'],
    ['pneu seminovo à venda sem DOT nem sulco', prod(SEMINOVO, (p) => { p.available = true; }), 'neutraliza', 'produto:pneu-seminovo-continental-205-55-r16:seminovo', 'fora_de_venda'],
    /* Achado L6-01: o DL 84/2021 (art. 12.º) só deixa reduzir a garantia de um
       bem usado até 18 meses; 12 era o regime antigo. */
    ['seminovo à venda com 12 meses de garantia', prod(SEMINOVO, (p) => { Object.assign(p, { available: true, dot: '3221', tread_mm: 6, warranty_months: 12 }); }), 'neutraliza', 'produto:pneu-seminovo-continental-205-55-r16:seminovo', 'fora_de_venda'],
    ['seminovo à venda com 17 meses de garantia', prod(SEMINOVO, (p) => { Object.assign(p, { available: true, dot: '3221', tread_mm: 6, warranty_months: 17 }); }), 'neutraliza', 'produto:pneu-seminovo-continental-205-55-r16:seminovo', 'fora_de_venda'],
    ['fotografia fora da pasta', prod(JANTE, (p) => { p.image = '/assets/img/hero.jpg'; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:imagem', 'sem_imagem'],
    ['fotografia com espaço no nome', prod(JANTE, (p) => { p.image = '/assets/uploads/a b.jpg'; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:imagem', 'sem_imagem'],
    ['fotografia com «..»', prod(JANTE, (p) => { p.image = '/assets/uploads/../../index.jpg'; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:imagem', 'sem_imagem'],
    ['fotografia de outro site', prod(JANTE, (p) => { p.image = 'https://exemplo.pt/a.jpg'; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:imagem', 'sem_imagem'],
    ['fotografia apagada', prod(JANTE, (p) => { p.image = '/assets/uploads/nao-existe.jpg'; }), 'neutraliza', 'produto:jante-liga-leve-16-5x112-et45:imagem', 'sem_imagem'],
    ['«Destaque» em falta', prod(JANTE, (p) => { delete p.featured; }), 'avisa', 'produto:jante-liga-leve-16-5x112-et45:booleano-featured'],
    ['categoria fora da lista', prod(JANTE, (p) => { p.category = 'Jante'; }), 'avisa', 'produto:jante-liga-leve-16-5x112-et45:categoria'],
    ['marca comprida', prod(JANTE, (p) => { p.brand = 'x'.repeat(41); }), 'avisa', 'produto:jante-liga-leve-16-5x112-et45:tamanho-brand'],
    ['mudança de linha no nome', prod(JANTE, (p) => { p.name = 'Jante\n16'; }), 'avisa', 'produto:jante-liga-leve-16-5x112-et45:controlo-name'],
    ['estação desconhecida', prod(JANTE, (p) => { p.season = 'Primavera'; }), 'avisa', 'produto:jante-liga-leve-16-5x112-et45:estacao'],
    ['400+ produtos', (d) => { const p = d.products.products[JANTE]; for (let i = 0; i < 390; i++) d.products.products.push({ ...p, sku: `x-${i}` }); }, 'avisa', 'products:tecto'],
    ['products.json ilegível', (d) => { d.products = '{"products": ['; }, 'bloqueia', 'products:ilegivel'],
    ['products.json sem a lista', (d) => { d.products = { produtos: [] }; }, 'bloqueia', 'products:forma'],
    ['um elemento que não é produto', (d) => { d.products.products.push('x'); }, 'bloqueia', /^products:elemento:21$/],
    ['products.json em falta', (d) => { d.products = undefined; }, 'bloqueia', 'products:ausente'],
    ['settings.json ilegível', (d) => { d.settings = '{'; }, 'bloqueia', 'settings:ilegivel'],
    ['interruptor dos pagamentos em falta', (d) => { delete d.settings.payment.mode; }, 'bloqueia', 'settings:payment.mode'],
    ['interruptor dos pagamentos «offline»', (d) => { d.settings.payment.mode = 'offline'; }, 'bloqueia', 'settings:payment.mode'],
    ['«portes combinados» em falta', (d) => { delete d.settings.shipping.quote_later; }, 'avisa', 'settings:shipping.quote_later:em-falta'],
    ['«portes combinados» como texto', (d) => { d.settings.shipping.quote_later = 'sim'; }, 'bloqueia', 'settings:shipping.quote_later'],
    ['portes cobrados e tabela vazia', (d) => { d.settings.shipping.quote_later = false; d.settings.shipping.tiers = []; }, 'bloqueia', 'settings:shipping.tiers'],
    ['portes cobrados e pesos a descer', (d) => { d.settings.shipping.quote_later = false; d.settings.shipping.tiers[1].max_kg = 3; }, 'bloqueia', 'settings:shipping.tiers'],
    ['portes cobrados e preço zero', (d) => { d.settings.shipping.quote_later = false; d.settings.shipping.tiers[0].price = 0; }, 'bloqueia', 'settings:shipping.tiers'],
    ['portes cobrados e preço com 3 casas', (d) => { d.settings.shipping.quote_later = false; d.settings.shipping.tiers[0].price = 4.999; }, 'bloqueia', 'settings:shipping.tiers'],
    ['portes cobrados e 11 escalões', (d) => { d.settings.shipping.quote_later = false; d.settings.shipping.tiers = Array.from({ length: 11 }, (_, i) => ({ max_kg: i + 1, price: 5 })); }, 'bloqueia', 'settings:shipping.tiers'],
    ['portes combinados e tabela partida', (d) => { d.settings.shipping.tiers[0].price = 0; }, 'avisa', 'settings:shipping.tiers:a-combinar'],
    ['prazos em falta', (d) => { delete d.settings.delivery; }, 'bloqueia', 'settings:delivery'],
    ['prazo máximo de 31 dias', (d) => { d.settings.delivery.max_days = 31; }, 'bloqueia', 'settings:delivery.max_days'],
    ['estimativa ao contrário', (d) => { d.settings.delivery.estimate_min_days = 6; }, 'bloqueia', 'settings:delivery.estimativa'],
    ['estimativa acima do prazo máximo', (d) => { d.settings.delivery.max_days = 4; }, 'bloqueia', 'settings:delivery.limite'],
    /* Achados L6-03 e L7-13: dias úteis contra dias de calendário. */
    ['10 a 30 dias úteis, nunca mais de 30 dias (30 úteis são ~42 de calendário)', (d) => { Object.assign(d.settings.delivery, { estimate_min_days: 10, estimate_max_days: 30, max_days: 30 }); }, 'bloqueia', 'settings:delivery.limite'],
    ['2 a 20 dias úteis, nunca mais de 20 dias', (d) => { Object.assign(d.settings.delivery, { estimate_min_days: 2, estimate_max_days: 20, max_days: 20 }); }, 'bloqueia', 'settings:delivery.limite'],
    ['2 a 5 dias úteis, nunca mais de 6 dias (uma semana com fim de semana são 7)', (d) => { Object.assign(d.settings.delivery, { estimate_min_days: 2, estimate_max_days: 5, max_days: 6 }); }, 'bloqueia', 'settings:delivery.limite'],
    ['prazo com casas decimais', (d) => { d.settings.delivery.estimate_min_days = 2.5; }, 'bloqueia', 'settings:delivery.estimate_min_days'],
    ['custo de devolução negativo', (d) => { d.settings.returns.return_cost_eur = -1; }, 'bloqueia', 'settings:returns.return_cost_eur'],
    ['custo de devolução como texto', (d) => { d.settings.returns.return_cost_eur = '5'; }, 'bloqueia', 'settings:returns.return_cost_eur'],
    ['custo de devolução acima de 1000 € (o Worker dos pagamentos recusa-o)', (d) => { d.settings.returns.return_cost_eur = 1000.01; }, 'bloqueia', 'settings:returns.return_cost_eur'],
    ['preço da montagem negativo', (d) => { d.settings.mounting.price_eur = -1; }, 'avisa', 'settings:mounting.price_eur'],
    ['texto dos pagamentos comprido', (d) => { d.settings.payment.note = 'x'.repeat(301); }, 'avisa', 'settings:payment.note'],
    ['fotografia do topo em falta', (d) => { delete d.content.hero.image; }, 'bloqueia', 'content:hero.image'],
    ['fotografia do Sobre apagada', (d) => { d.content.sobre.image = '/assets/uploads/nao-existe.jpg'; }, 'bloqueia', 'content:sobre.image'],
    ['fotografia do topo fora da pasta', (d) => { d.content.hero.image = '/index.html'; }, 'bloqueia', 'content:hero.image'],
  ];
  const SEM_PROBLEMA = [
    ['pneu novo à venda com a etiqueta completa', prod(MICHELIN, (p) => { Object.assign(p, { available: true, label_noise_class: 'B', eprel_id: '123456' }); })],
    ['pneu seminovo à venda com os dados todos (18 meses de garantia)', prod(SEMINOVO, (p) => { Object.assign(p, { available: true, dot: '3221', tread_mm: 6, warranty_months: 18 }); })],
    ['EPREL escrito como número', prod(MICHELIN, (p) => { Object.assign(p, { available: true, label_noise_class: 'B', eprel_id: 123456 }); })],
    ['fotografia que existe', prod(JANTE, (p) => { p.image = '/assets/uploads/prod-jante-17.jpg'; })],
    ['custo de devolução de 6,50 €', (d) => { d.settings.returns.return_cost_eur = 6.5; }],
    ['2 a 5 dias úteis, nunca mais de 7 dias', (d) => { Object.assign(d.settings.delivery, { estimate_min_days: 2, estimate_max_days: 5, max_days: 7 }); }],
    ['até 20 dias úteis, nunca mais de 28 dias', (d) => { Object.assign(d.settings.delivery, { estimate_min_days: 10, estimate_max_days: 20, max_days: 28 }); }],
    ['portes cobrados com a tabela de hoje', (d) => { d.settings.shipping.quote_later = false; }],
    ['preço 76,90 (76.9*100 não é inteiro em vírgula flutuante)', prod(JANTE, (p) => { p.price_eur = 76.9; })],
  ];
  for (const [desc, mudar, classe, chave, efeito] of CASOS) {
    const d = dadosDeHoje(); mudar(d);
    const lista = R.problemas(d, { imagemExiste: existeHoje });
    const achado = lista.find((p) => p.classe === classe && (chave instanceof RegExp ? chave.test(p.chave) : p.chave === chave));
    certo(Boolean(achado) && (!efeito || achado.efeito === efeito) && achado.ecra && achado.mensagem,
      `${desc} → ${classe}${efeito ? ` (${efeito})` : ''}`, achado ? JSON.stringify(achado) : lista.filter((p) => !hoje.some((h) => h.chave === p.chave)).map((p) => `${p.classe} ${p.chave}`).join(', ') || 'nenhum problema');
    if (classe === 'neutraliza') certo(deClasse(lista, 'bloqueia').length === 0, `   e não pára a publicação`);
  }
  for (const [desc, mudar] of SEM_PROBLEMA) {
    const d = dadosDeHoje(); mudar(d);
    const novos = R.problemas(d, { imagemExiste: existeHoje }).filter((p) => p.classe !== 'avisa' || !hoje.some((h) => h.chave === p.chave)).filter((p) => !(p.lembrete && /a-espera/.test(p.chave)));
    certo(novos.length === 0, `${desc} → sem problema (a regra também sabe dizer «sim»)`, novos.map((p) => `${p.classe} ${p.chave}`).join(', '));
  }
  // O caso da maiúscula tem de ter lá um ficheiro com maiúsculas para provar alguma coisa.
  certo(R.problemas({ ...TEXTO, products: { products: [{ ...HOJE.products.products[JANTE], image: '/assets/uploads/IMG_1234.JPG' }] } }, { imagemExiste: () => true }).every((p) => p.efeito !== 'sem_imagem'), 'IMG_1234.JPG aceita-se pela forma');

  // O CLI: cada produto partido sai com 0; cada «bloqueia» sai com 1.
  let cliProdutos = 0; let cliBloqueia = 0; const cliFalhas = [];
  for (const [desc, mudar, classe] of CASOS) {
    if (classe === 'avisa') continue;
    const d = dadosDeHoje(); mudar(d);
    const dir = repoDeEnsaio(d);
    const r = guardaEm(dir);
    const esperado = classe === 'bloqueia' ? 1 : 0;
    if (r.status !== esperado) cliFalhas.push(`${desc}: saiu ${r.status}`);
    else if (classe === 'bloqueia') cliBloqueia++; else cliProdutos++;
    rmSync(dir, { recursive: true, force: true });
  }
  certo(cliFalhas.length === 0 && cliProdutos > 20 && cliBloqueia > 20, `a guarda verdadeira: ${cliProdutos} produtos partidos saem com 0, ${cliBloqueia} problemas de estrutura saem com 1`, cliFalhas.join(' | '));

  /* ================================================================== */
  secao('site.json e empresa.json (fase A2)');
  const comA2 = (site, empresa) => R.problemas({ ...TEXTO, site, empresa }, { imagemExiste: existeHoje }).filter((p) => /site|empresa/.test(p.ficheiro));
  certo(comA2(SITE_OK, EMPRESA_OK).length === 0, 'os dois ficheiros completos passam limpos', comA2(SITE_OK, EMPRESA_OK).map((p) => p.chave).join(', '));
  certo(tem(comA2(undefined, undefined), 'bloqueia', 'site:ausente') && tem(comA2(undefined, undefined), 'bloqueia', 'empresa:ausente'), 'ausentes (obrigatórios desde o A2): param');
  certo(R.problemas({ ...TEXTO, site: undefined, empresa: undefined }, { obrigatorios: [] }).filter((p) => /site|empresa/.test(p.ficheiro)).length === 0, 'com a lista vazia (como antes do A2), ausentes não tinham regras');
  certo(comA2(TEXTO.site, TEXTO.empresa).length === 0, 'os site.json e empresa.json do repositório passam limpos', comA2(TEXTO.site, TEXTO.empresa).map((p) => p.chave).join(', '));
  certo(tem(R.problemas({ ...TEXTO, site: undefined, empresa: undefined }, { obrigatorios: ['site', 'empresa'] }), 'bloqueia', 'site:ausente') && tem(R.problemas({ ...TEXTO, site: undefined, empresa: undefined }, { obrigatorios: ['site', 'empresa'] }), 'bloqueia', 'empresa:ausente'), 'obrigatórios (A2) e ausentes: param');
  const CASOS_A2 = [
    ['site ilegível', (s) => '{', null, 'bloqueia', 'site:ilegivel'],
    ['sem email', (s) => { delete s.contactos.email; }, null, 'bloqueia', 'site:contactos.email'],
    ['email mal escrito', (s) => { s.contactos.email = 'loja@'; }, null, 'bloqueia', 'site:contactos.email'],
    ['email com acento (o reply-to dos emails das encomendas não o aceita)', (s) => { s.contactos.email = 'joão@exemplo.pt'; }, null, 'bloqueia', 'site:contactos.email'],
    ['sem telefone (as páginas têm-no em todo o lado)', (s) => { delete s.contactos.telefone; }, null, 'bloqueia', 'site:contactos.telefone'],
    ['sem WhatsApp (os botões «Pedir orçamento» vão para ele)', (s) => { s.contactos.whatsapp = ''; }, null, 'bloqueia', 'site:contactos.whatsapp'],
    ['telefone com 8 algarismos', (s) => { s.contactos.telefone = '93 521 885'; }, null, 'bloqueia', 'site:contactos.telefone'],
    ['WhatsApp com +', (s) => { s.contactos.whatsapp = '+351935218857'; }, null, 'bloqueia', 'site:contactos.whatsapp'],
    /* Achado L3-02: «912345678» passava em tudo e publicava wa.me/912345678,
       que o WhatsApp lê como +91 (Índia). */
    ['WhatsApp com 9 algarismos, sem o 351', (s) => { s.contactos.whatsapp = '912345678'; }, null, 'bloqueia', 'site:contactos.whatsapp'],
    ['WhatsApp com 00351 à frente', (s) => { s.contactos.whatsapp = '00351912345678'; }, null, 'bloqueia', 'site:contactos.whatsapp'],
    ['Facebook sem https', (s) => { s.contactos.facebook = 'http://facebook.com/x'; }, null, 'bloqueia', 'site:contactos.facebook'],
    ['telefone sem a nota do preço da chamada', (s) => { delete s.contactos.nota_chamada; }, null, 'bloqueia', 'site:contactos.nota_chamada'],
    ['um dia em falta no horário', (s) => { delete s.horario.dias.qua; }, null, 'bloqueia', 'site:horario.dias.qua'],
    ['três períodos num dia', (s) => { s.horario.dias.seg = [{ abre: '08:00', fecha: '09:00' }, { abre: '10:00', fecha: '11:00' }, { abre: '12:00', fecha: '13:00' }]; }, null, 'bloqueia', 'site:horario.dias.seg'],
    ['hora sem o zero (9:00)', (s) => { s.horario.dias.seg = [{ abre: '9:00', fecha: '19:00' }]; }, null, 'bloqueia', 'site:horario.dias.seg'],
    ['abre depois de fechar', (s) => { s.horario.dias.seg = [{ abre: '19:00', fecha: '09:00' }]; }, null, 'bloqueia', 'site:horario.dias.seg'],
    ['dois períodos sobrepostos', (s) => { s.horario.dias.sex = [{ abre: '09:00', fecha: '14:00' }, { abre: '13:00', fecha: '19:00' }]; }, null, 'bloqueia', 'site:horario.dias.sex'],
    ['nenhum serviço', (s) => { s.servicos = []; }, null, 'bloqueia', 'site:servicos'],
    ['13 serviços', (s) => { s.servicos = Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, titulo: 'T', texto: 'x', icone: 'generico' })); }, null, 'bloqueia', 'site:servicos'],
    ['serviço repetido', (s) => { s.servicos[1].id = s.servicos[0].id; }, null, 'bloqueia', 'site:servicos.montagem.repetido'],
    ['ícone desconhecido', (s) => { s.servicos[0].icone = 'foguete'; }, null, 'bloqueia', 'site:servicos.montagem.icone'],
    ['serviço sem título', (s) => { s.servicos[0].titulo = ''; }, null, 'bloqueia', 'site:servicos.montagem.titulo'],
    ['texto com <script>', (s) => { s.servicos[0].texto = '<script>alert(1)</script>'; }, null, 'bloqueia', 'site:servicos.montagem.texto'],
    ['negrito por fechar', (s) => { s.textos.sobre.paragrafos[0] = 'No **Armazém dos Pneus encontra'; }, null, 'bloqueia', 'site:textos.sobre.paragrafos.1'],
    ['itálico por fechar', (s) => { s.textos.rodape.frase = 'Venda *e montagem'; }, null, 'bloqueia', 'site:textos.rodape.frase'],
    ['sem os textos do topo', (s) => { delete s.textos.topo; }, null, 'bloqueia', 'site:textos.topo'],
    ['Sobre sem parágrafos', (s) => { s.textos.sobre.paragrafos = []; }, null, 'bloqueia', 'site:textos.sobre.paragrafos'],
    ['sem a lista das marcas', (s) => { delete s.marcas; }, null, 'bloqueia', 'site:marcas'],
    /* O que a publicação (injetar-conteudo.py) recusa, as regras recusam antes:
       senão o painel grava, o CI pára no injector e o interruptor dos
       pagamentos deixa de chegar ao site (achado L3-01). */
    ['«****» num título de serviço (sobra um * no injector)', (s) => { s.servicos[0].titulo = 'Montagem em Ovar ****'; }, null, 'bloqueia', 'site:servicos.montagem.titulo'],
    ['«a****b» na frase do rodapé', (s) => { s.textos.rodape.frase = 'a****b'; }, null, 'bloqueia', 'site:textos.rodape.frase'],
    ['«**» sem nada dentro, na nota do horário', (s) => { s.horario.nota = 'Fechado ** em agosto'; }, null, 'bloqueia', 'site:horario.nota'],
    ['texto de serviço que é só U+0085 (o «…» do Windows-1252 mal lido)', (s) => { s.servicos[0].texto = '\u0085'; }, null, 'bloqueia', 'site:servicos.montagem.texto'],
    ['título que é só um espaço de largura zero', (s) => { s.textos.topo.titulo1 = '\u200b'; }, null, 'bloqueia', 'site:textos.topo.titulo1'],
    ['Facebook com U+001F lá dentro', (s) => { s.contactos.facebook = 'https://www.facebook.com/a\u001fb'; }, null, 'bloqueia', 'site:contactos.facebook'],
    ['Facebook com U+0085 lá dentro', (s) => { s.contactos.facebook = 'https://www.facebook.com/a\u0085b'; }, null, 'bloqueia', 'site:contactos.facebook'],
    ['metade de um emoji na frase do topo', (s) => { s.textos.topo.frase = 'Pneus \ud83d baratos'; }, null, 'bloqueia', 'site:texto-partido'],
    ['U+0085 no meio de um texto', (s) => { s.textos.rodape.frase = 'Venda\u0085 de pneus'; }, null, 'avisa', 'site:textos.rodape.frase:controlo'],
    ['título de serviço comprido', (s) => { s.servicos[0].titulo = 'x'.repeat(61); }, null, 'avisa', 'site:servicos.montagem.titulo:tamanho'],
    ['lista das marcas vazia', (s) => { s.marcas = []; }, null, 'avisa', 'site:marcas:vazia'],
    ['empresa ilegível', null, () => '{', 'bloqueia', 'empresa:ilegivel'],
    ['NIF com o controlo errado', null, (e) => { e.nif = '516324951'; }, 'bloqueia', 'empresa:nif'],
    ['NIF com 8 algarismos', null, (e) => { e.nif = '51632495'; }, 'bloqueia', 'empresa:nif'],
    ['NIF vazio', null, (e) => { e.nif = ''; }, 'bloqueia', 'empresa:nif'],
    ['NIF 000000000 (nenhum NIF começa por 0)', null, (e) => { e.nif = '000000000'; }, 'bloqueia', 'empresa:nif'],
    ['NIF gravado como número', null, (e) => { e.nif = 516324950; }, 'bloqueia', 'empresa:nif'],
    ['nome da loja com 81 caracteres', null, (e) => { e.nome = 'x'.repeat(81); }, 'bloqueia', 'empresa:nome:tamanho'],
    ['denominação com uma letra', null, (e) => { e.denominacao = 'X'; }, 'bloqueia', 'empresa:denominacao:tamanho'],
    ['rua com ponto e vírgula', null, (e) => { e.morada.rua = 'Edifício Sol; Loja 2'; }, 'bloqueia', 'empresa:morada.rua:sinais'],
    ['rua com as aspas curvas do iPhone', null, (e) => { e.morada.rua = 'Rua \u201cAlto\u201d, 3'; }, 'bloqueia', 'empresa:morada.rua:sinais'],
    ['rua com 121 caracteres', null, (e) => { e.morada.rua = 'Rua ' + 'a'.repeat(117); }, 'bloqueia', 'empresa:morada.rua:tamanho'],
    ['localidade com #', null, (e) => { e.morada.localidade = 'Arada #2'; }, 'bloqueia', 'empresa:morada.localidade:sinais'],
    ['concelho com uma letra (o Worker recusava a morada inteira)', null, (e) => { e.morada.concelho = 'O'; }, 'bloqueia', 'empresa:morada.concelho'],
    ['concelho com :', null, (e) => { e.morada.concelho = 'Ovar: Aveiro'; }, 'bloqueia', 'empresa:morada.concelho:sinais'],
    ['Livro de Reclamações com utilizador', null, (e) => { e.livro_reclamacoes = 'https://eu:segredo@www.livroreclamacoes.pt/inicio'; }, 'bloqueia', 'empresa:livro_reclamacoes'],
    ['Livro de Reclamações com 201 caracteres', null, (e) => { e.livro_reclamacoes = 'https://www.livroreclamacoes.pt/' + 'a'.repeat(169); }, 'bloqueia', 'empresa:livro_reclamacoes'],
    ['denominação vazia', null, (e) => { e.denominacao = ' '; }, 'bloqueia', 'empresa:denominacao'],
    ['código postal sem hífen', null, (e) => { e.morada.cp = '3885183'; }, 'bloqueia', 'empresa:morada.cp'],
    ['sem rua', null, (e) => { delete e.morada.rua; }, 'bloqueia', 'empresa:morada.rua'],
    ['RAL sem https', null, (e) => { e.ral.url = 'http://www.cniacc.pt'; }, 'bloqueia', 'empresa:ral.url'],
    ['sem Livro de Reclamações', null, (e) => { delete e.livro_reclamacoes; }, 'bloqueia', 'empresa:livro_reclamacoes'],
    ['capital social como texto', null, (e) => { e.capital_social = '5000'; }, 'bloqueia', 'empresa:capital_social'],
    ['entidade de RAL que é só um espaço de largura zero', null, (e) => { e.ral.nome = '\u200b'; }, 'bloqueia', 'empresa:ral.nome'],
    /* Achado L6-16: guardas largas nos dados legais. */
    ['Livro de Reclamações de outro sítio (o texto da ligação diz livroreclamacoes.pt)', null, (e) => { e.livro_reclamacoes = 'https://exemplo.com/'; }, 'bloqueia', 'empresa:livro_reclamacoes'],
    ['Livro de Reclamações num domínio parecido', null, (e) => { e.livro_reclamacoes = 'https://www.livroreclamacoes.pt.exemplo.com/inicio'; }, 'bloqueia', 'empresa:livro_reclamacoes'],
    ['entidade de RAL com uma letra', null, (e) => { e.ral.nome = 'x'; }, 'bloqueia', 'empresa:ral.nome:curto'],
    ['endereço da RAL com U+001F', null, (e) => { e.ral.url = 'https://www.cniacc.pt/\u001f'; }, 'bloqueia', 'empresa:ral.url'],
    ['conservatória que é só invisíveis', null, (e) => { e.conservatoria = '\u2060\u200b'; }, 'bloqueia', 'empresa:conservatoria'],
    ['metade de um emoji na rua', null, (e) => { e.morada.rua = 'Rua \udc00, 3'; }, 'bloqueia', 'empresa:texto-partido'],
    ['coordenadas partidas', null, (e) => { e.geo = { lat: 'norte' }; }, 'avisa', 'empresa:geo'],
    ['mapa sem https', null, (e) => { e.mapa = 'maps.app.goo.gl/x'; }, 'avisa', 'empresa:mapa'],
    ['sem concelho', null, (e) => { delete e.morada.concelho; }, 'avisa', 'empresa:morada.concelho:vazio'],
  ];
  for (const [desc, mSite, mEmpresa, classe, chave] of CASOS_A2) {
    let s = clonar(SITE_OK); let e = clonar(EMPRESA_OK);
    if (mSite) { const r = mSite(s); if (typeof r === 'string') s = r; }
    if (mEmpresa) { const r = mEmpresa(e); if (typeof r === 'string') e = r; }
    const lista = comA2(s, e);
    certo(tem(lista, classe, chave), `${desc} → ${classe}`, lista.map((p) => `${p.classe} ${p.chave}`).join(', ') || 'nenhum');
  }
  const SEM_PROBLEMA_A2 = [
    ['sem o segundo telefone nem o Facebook', (s) => { delete s.contactos.telefone2; delete s.contactos.facebook; }, null],
    ['WhatsApp português com o 351', (s) => { s.contactos.whatsapp = '351912345678'; }, null],
    ['WhatsApp de outro país (Espanha), com o indicativo', (s) => { s.contactos.whatsapp = '34612345678'; }, null],
    ['domingo fechado e sexta com almoço', () => {}, null],
    ['capital social de 5000 € e conservatória', null, (e) => { e.capital_social = 5000; e.conservatoria = 'Conservatória do Registo Comercial de Ovar'; }],
    ['sem mapa nem coordenadas', null, (e) => { delete e.mapa; delete e.geo; }],
    ['Livro de Reclamações sem o www', null, (e) => { e.livro_reclamacoes = 'https://livroreclamacoes.pt/Pedido/Reclamacao'; }],
    ['entidade de RAL «CICAP»', null, (e) => { e.ral.nome = 'CICAP'; }],
    ['morada com º, ª, apóstrofo curvo, barra e parênteses', null, (e) => { e.morada.rua = 'Rua D\u2019Ávila, n.º 3 (1.ª cave) 2/B - Lote & Co.'; }],
    ['negrito e itálico seguidos', (s) => { s.textos.rodape.frase = '**Pneus** e *jantes*, **revisões**'; }, null],
    ['um emoji inteiro num título (não está partido)', (s) => { s.servicos[0].titulo = 'Montagem 🚗'; }, null],
  ];
  for (const [desc, mSite, mEmpresa] of SEM_PROBLEMA_A2) {
    const s = clonar(SITE_OK); const e = clonar(EMPRESA_OK);
    if (mSite) mSite(s); if (mEmpresa) mEmpresa(e);
    const lista = comA2(s, e);
    certo(lista.length === 0, `${desc} → sem problema`, lista.map((p) => `${p.classe} ${p.chave}`).join(', '));
  }
  {
    // O painel também passa objectos (os rascunhos), e um objecto pode ter uma
    // lista com buracos: as regras não podem rebentar com ela.
    const comBuraco = clonar(SITE_OK); delete comBuraco.servicos[0];
    let lancou = null; try { R.problemas({ ...TEXTO, site: comBuraco, empresa: EMPRESA_OK }); } catch (e) { lancou = e; }
    certo(lancou === null, 'uma lista com um buraco (objecto do painel) não faz rebentar as regras', String(lancou));
  }
  {
    const s = clonar(SITE_OK); s.contactos.whatsapp = '912345678';
    const p = comA2(s, EMPRESA_OK).find((x) => x.chave === 'site:contactos.whatsapp');
    certo(p && /escreva 351912345678/.test(p.mensagem), 'WhatsApp sem o 351: a mensagem dá o valor certo', p && p.mensagem);
  }
  certo(R.nifValido('516324950') && R.nifValido(516324950) && !R.nifValido('516324951') && !R.nifValido('abc') && !R.nifValido('000000000') && T.nifValido('516324950') && !T.nifValido('000000000'),
    'nifValido(): o NIF da loja passa, um algarismo trocado não, e o 000000000 também não (como no Worker dos pagamentos: os emails ficavam com o NIF anterior)');

  /* ================================================================== */
  secao('uma chave, uma classe (o Worker do painel e o problemasAgora comparam só a chave)');
  /* Achado L2-05: com os portes a combinar, a tabela partida era «avisa» com a
     chave settings:shipping.tiers; desligado o interruptor, a MESMA chave
     passava a «bloqueia». Já existia no HEAD, não contava como nova: o painel
     gravava, o Worker aceitava, e o CI parava a publicação. Varrimento: cada
     campo de cada ficheiro apagado ou trocado por valores de cada tipo, com os
     portes a combinar, cobrados e por gravar, e cada produto à venda e não. */
  {
    const VALS = ['', ' ', 'x', 'a****b', '\u200b', null, undefined, 5, -1, 0, 2.5, true, [], {}, 'x'.repeat(400), 'https://x.pt', 'Arada', '3885-183'];
    const caminhos = (o, pre = []) => Object.entries(o).flatMap(([k, v]) => (v !== null && typeof v === 'object' ? [[...pre, k], ...caminhos(v, [...pre, k])] : [[...pre, k]]));
    const classes = new Map();
    const registar = (d) => { for (const p of R.problemas(d, { imagemExiste: existeHoje })) { if (!classes.has(p.chave)) classes.set(p.chave, new Set()); classes.get(p.chave).add(p.classe); } };
    let n = 0;
    for (const qual of ['settings', 'site', 'empresa', 'content']) {
      for (const cam of caminhos(HOJE[qual])) {
        for (const v of VALS) {
          for (const combinar of [true, false, undefined]) {
            const d = dadosDeHoje();
            if (combinar === undefined) delete d.settings.shipping.quote_later; else d.settings.shipping.quote_later = combinar;
            let o = d[qual]; for (const k of cam.slice(0, -1)) o = o[k];
            if (v === undefined) delete o[cam.at(-1)]; else o[cam.at(-1)] = clonar(v);
            registar(d); n++;
          }
        }
      }
    }
    HOJE.products.products.forEach((p, i) => {
      for (const k of Object.keys(p)) {
        for (const v of VALS) {
          for (const avenda of [false, true]) {
            const d = dadosDeHoje(); const q = d.products.products[i];
            if (v === undefined) delete q[k]; else q[k] = clonar(v);
            if (avenda) q.available = true;
            registar(d); n++;
          }
        }
      }
    });
    const duplas = [...classes].filter(([, c]) => c.size > 1).map(([k, c]) => `${k} (${[...c].join(' e ')})`);
    certo(classes.size > 150 && duplas.length === 0, `${n} variações, ${classes.size} chaves: nenhuma aparece com duas classes`, duplas.join(' · '));
    // E o caso do achado, de ponta a ponta: o aviso antigo que passa a parar é NOVO.
    const head = dadosDeHoje(); head.settings.shipping.tiers[1].max_kg = 1;   // a tabela partida, com os portes a combinar
    const depois = clonar(head); depois.settings.shipping.quote_later = false;  // o dono desliga «Portes combinados depois»
    const jaHavia = new Set(R.problemas(head).map((p) => p.chave));
    const novos = R.problemas(depois).filter((p) => !jaHavia.has(p.chave));
    certo(novos.some((p) => p.classe === 'bloqueia' && p.chave === 'settings:shipping.tiers'),
      '   desligar «Portes combinados depois» com a tabela partida dá um «bloqueia» NOVO (o painel e o Worker recusam a gravação)', novos.map((p) => `${p.classe} ${p.chave}`).join(', '));
  }

  /* ================================================================== */
  secao('a cópia publicada, neutralizada');
  {
    const d = dadosDeHoje(); delete d.products.products[JANTE].weight_kg; delete d.products.products[TESTE].sku;
    const dir = repoDeEnsaio(d);
    const antes = readFileSync(join(dir, 'data', 'products.json'), 'utf8');
    const r = guardaEm(dir);
    certo(r.status === 0, 'dois produtos partidos: a guarda sai com 0');
    certo(r.relatorio && r.relatorio.neutralizados.length === 2 && r.relatorio.neutralizados.every((e) => e.descricao), 'o relatório diz que 2 mudam na loja, e como', r.relatorio && JSON.stringify(r.relatorio.neutralizados.map((e) => e.descricao)));
    const site = join(TMP, 'site-neutralizado'); cpSync(dir, site, { recursive: true });
    const n = correr('node', [GUARDA, '--neutralizar', site]);
    const copia = JSON.parse(readFileSync(join(site, 'data', 'products.json'), 'utf8'));
    const jante = copia.products.find((p) => p.sku === 'jante-liga-leve-16-5x112-et45');
    certo(n.status === 0 && jante && jante.available === false, 'na cópia, a jante sem peso está fora de venda', n.err);
    certo(copia.products.length === 19 && !copia.products.some((p) => p.name === 'Produto de teste'), 'e o produto sem referência saiu da cópia');
    certo(readFileSync(join(dir, 'data', 'products.json'), 'utf8') === antes, 'o ficheiro do repositório não mudou');
    const esperado = clonar(d.products); esperado.products[JANTE].available = false; esperado.products.splice(TESTE, 1);
    certo(readFileSync(join(site, 'data', 'products.json'), 'utf8') === R.serializar(esperado, ''), 'e a cópia difere do ficheiro SÓ nisso (mesma ordem de chaves, mesma terminação)');
    rmSync(site, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true });
  }
  {
    const dir = repoDeEnsaio(dadosDeHoje());
    writeFileSync(join(dir, 'data', 'products.json'), TEXTO.products);
    const t0 = statSync(join(dir, 'data', 'products.json')).mtimeMs;
    const n = correr('node', [GUARDA, '--neutralizar', dir]);
    certo(n.status === 0 && readFileSync(join(dir, 'data', 'products.json'), 'utf8') === TEXTO.products && statSync(join(dir, 'data', 'products.json')).mtimeMs === t0, 'sem nada a neutralizar, a cópia nem se toca');
    rmSync(dir, { recursive: true, force: true });
  }
  {
    const d = dadosDeHoje(); delete d.settings.payment;
    const dir = repoDeEnsaio(d);
    certo(correr('node', [GUARDA, '--neutralizar', dir]).status === 1, '--neutralizar também recusa uma cópia com um «bloqueia»');
    rmSync(dir, { recursive: true, force: true });
  }

  /* ================================================================== */
  secao('as anotações: 9 de cada, e «e mais N»');
  {
    const d = dadosDeHoje(); d.products = { products: Array.from({ length: 30 }, (_, i) => i) };
    const dir = repoDeEnsaio(d);
    const resumoF = join(TMP, 'resumo.md'); writeFileSync(resumoF, '');
    const r = guardaEm(dir, { GITHUB_STEP_SUMMARY: resumoF });
    const erros = r.out.split('\n').filter((l) => l.startsWith('::error'));
    const resumo = readFileSync(resumoF, 'utf8');
    certo(r.status === 1, '30 problemas que param: sai com 1');
    certo(erros.length === 10 && erros.slice(0, 9).every((l) => l.includes('title=')) && /e mais 21 problemas/.test(erros[9]), '9 ::error com o ecrã, e a 10.ª diz «e mais 21»', `${erros.length} linhas ::error`);
    certo((resumo.match(/^\| PÁRA \|/gm) || []).length === 30, 'o resumo da corrida tem os 30');
    certo(r.relatorio && r.relatorio.bloqueia === 30 && r.relatorio.problemas.length >= 30, 'e o relatório também');
    rmSync(dir, { recursive: true, force: true });
  }
  {
    const d = dadosDeHoje();
    d.products.products = Array.from({ length: 30 }, (_, i) => ({ ...HOJE.products.products[JANTE], sku: `peca-${i}`, weight_kg: 0 }));
    const dir = repoDeEnsaio(d);
    const r = guardaEm(dir);
    const avisos = r.out.split('\n').filter((l) => l.startsWith('::warning'));
    const total = r.relatorio.problemas.filter((p) => p.classe !== 'bloqueia').length;
    certo(r.status === 0, '30 produtos partidos: sai com 0');
    certo(avisos.length === 10 && new RegExp(`e mais ${total - 9} problemas`).test(avisos[9]), `9 ::warning e «e mais ${total - 9}»`, `${avisos.length} linhas`);
    certo(avisos.slice(0, 9).every((l) => l.includes('Tirado de venda na loja')), 'os primeiros são os produtos tirados de venda (os lembretes vão para o fim)');
    rmSync(dir, { recursive: true, force: true });
  }
  certo(G.anotacoes([{ classe: 'avisa', ficheiro: 'data/x.json', ecra: 'A, b: c', mensagem: '50% feito\nlinha 2' }])[0] === '::warning file=data/x.json,title=A%2C b%3A c::50%25 feito%0Alinha 2', 'as anotações escapam %, mudanças de linha, : e ,');

  /* ================================================================== */
  secao('varrimento: apagar cada chave, uma a uma');
  const ECRAS = /^(Produtos( › .+)?|Loja online( › (Pagamentos|Portes|Levantamento|Prazos e devoluções|Montagem))?|Fotografias do site|Contactos e horário|Serviços|Textos da página inicial|Dados da empresa|Publicação)$/;
  const CAMINHO_JSON = /\b(price_eur|weight_kg|label_[a-z_]+|eprel_id|tread_mm|warranty_months|return_cost_eur|max_days|estimate_[a-z_]+|quote_later|payment\.mode|[a-z]+\.[a-z]+\.[a-z]+)\b/;
  const bemDito = (p) => ECRAS.test(p.ecra) && p.mensagem && p.mensagem.length > 15 && !CAMINHO_JSON.test(p.mensagem);
  const OBRIG_PRODUTO = { sku: 'neutraliza', available: 'neutraliza', price_eur: 'neutraliza', stock: 'neutraliza', weight_kg: 'neutraliza', name: 'neutraliza', condition: 'neutraliza', featured: 'avisa', hidden: 'avisa', snow_3pmsf: 'avisa', ice_grip: 'avisa', category: 'avisa' };
  let execP = 0; const falhasP = [];
  HOJE.products.products.forEach((p0, i) => {
    const base = R.problemasDoProduto(p0, { indice: i, imagemExiste: existeHoje });
    for (const k of Object.keys(p0)) {
      const p = clonar(p0); delete p[k]; execP++;
      let lista;
      try { lista = R.problemasDoProduto(p, { indice: i, imagemExiste: existeHoje }); } catch (e) { falhasP.push(`${p0.sku} sem ${k}: rebentou (${e.message})`); continue; }
      const novos = lista.filter((x) => !base.some((b) => b.chave === x.chave && b.classe === x.classe));
      const esperada = OBRIG_PRODUTO[k];
      if (esperada && !novos.some((x) => x.classe === esperada && (x.campo === k || (x.campos || []).includes(k)))) falhasP.push(`${p0.sku} sem ${k}: esperava ${esperada}, veio ${novos.map((x) => x.chave).join(',') || 'nada'}`);
      if (!esperada && novos.some((x) => x.classe !== 'avisa')) falhasP.push(`${p0.sku} sem ${k} (opcional): ${novos.map((x) => x.chave).join(',')}`);
      for (const x of lista) if (!bemDito(x) || !x.ecra.startsWith('Produtos › ')) falhasP.push(`${p0.sku} sem ${k}: mensagem mal dita: ${x.ecra} / ${x.mensagem}`);
    }
  });
  certo(falhasP.length === 0, `produtos: ${execP} chaves apagadas; as obrigatórias dão o problema certo no campo certo, as opcionais passam, e cada mensagem nomeia o ecrã`, falhasP.slice(0, 5).join(' | '));

  const caminhos = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => {
    const c = pre ? `${pre}.${k}` : k;
    return v && typeof v === 'object' && !Array.isArray(v) ? [c, ...caminhos(v, c)] : Array.isArray(v) && v.length && typeof v[0] === 'object' ? [c, ...v.flatMap((x, i) => (x && typeof x === 'object' ? caminhos(x, `${c}.${i}`) : []))] : [c];
  });
  const apagar = (o, c) => { const partes = c.split('.'); const ult = partes.pop(); let x = o; for (const p of partes) x = x[p]; if (Array.isArray(x)) x.splice(Number(ult), 1); else delete x[ult]; };
  const varrer = (nome, obj, montar, esperar) => {
    let n = 0; const f = [];
    const base = R.problemas(montar(obj), { imagemExiste: existeHoje });
    for (const c of caminhos(obj)) {
      const o = clonar(obj); apagar(o, c); n++;
      let lista;
      try { lista = R.problemas(montar(o), { imagemExiste: existeHoje }); } catch (e) { f.push(`${c}: rebentou (${e.message})`); continue; }
      const novos = lista.filter((x) => !base.some((b) => b.chave === x.chave && b.classe === x.classe));
      const esp = esperar(c);
      if (esp === null && novos.length) f.push(`${c} (opcional): ${novos.map((x) => `${x.classe} ${x.chave}`).join(',')}`);
      if (esp && !novos.some((x) => x.classe === esp)) f.push(`${c}: esperava ${esp}, veio ${novos.map((x) => `${x.classe} ${x.chave}`).join(',') || 'nada'}`);
      for (const x of novos) if (!bemDito(x)) f.push(`${c}: mensagem mal dita: ${x.ecra} / ${x.mensagem}`);
    }
    certo(f.length === 0, `${nome}: ${n} caminhos apagados, cada um com o problema certo ou nenhum, e a mensagem nomeia o ecrã`, f.slice(0, 5).join(' | '));
  };
  varrer('settings.json', HOJE.settings, (s) => ({ ...TEXTO, settings: s }), (c) => {
    if (/^(store|shipping\.free_pickup|shipping\.pickup_label|shipping\.note|delivery\.countries_note|returns|mounting|payment\.note)(\.|$)/.test(c)) return null;
    if (c === 'shipping.quote_later') return 'avisa';
    if (/^shipping\.tiers/.test(c)) return 'avisa';        // hoje os portes são combinados: a tabela só avisa
    return 'bloqueia';
  });
  // O segundo telefone, o Facebook e a nota do horário são opcionais; o resto pára.
  const esperaSite = (c) => (/^(contactos\.(telefone2|facebook)|horario\.nota)$/.test(c) ? null : 'bloqueia');
  const esperaEmpresa = (c) => {
    if (/^(capital_social|conservatoria|geo|mapa)$/.test(c)) return null;
    if (/^(morada\.(concelho|distrito)|geo\.(lat|lng))$/.test(c)) return 'avisa';
    return 'bloqueia';
  };
  varrer('site.json (exemplo)', SITE_OK, (s) => ({ ...TEXTO, site: s, empresa: EMPRESA_OK }), esperaSite);
  varrer('empresa.json (exemplo)', EMPRESA_OK, (e) => ({ ...TEXTO, site: SITE_OK, empresa: e }), esperaEmpresa);
  // E o caminho do cliente: os ficheiros VERDADEIROS do repositório, chave a chave.
  varrer('site.json do repositório', HOJE.site, (s) => ({ ...TEXTO, site: s }), esperaSite);
  varrer('empresa.json do repositório', HOJE.empresa, (e) => ({ ...TEXTO, empresa: e }), esperaEmpresa);

  secao('varrimento: cada categoria, e ligar/desligar cada produto');
  let nCat = 0; const fCat = [];
  HOJE.products.products.forEach((p0, i) => {
    for (const cat of R.CATEGORIAS.filter((c) => c !== p0.category)) {
      const p = { ...clonar(p0), category: cat }; nCat++;
      const lista = R.problemasDoProduto(p, { indice: i, imagemExiste: existeHoje });
      if (lista.some((x) => x.efeito === 'retirar')) fCat.push(`${p0.sku} → ${cat}: retirado`);
      const devia = R.ePneu(p) && R.vendavel(p) && (p.condition === 'Novo' ? R.faltasDaEtiqueta(p) : R.faltasDoSeminovo(p)).length > 0;
      const veio = lista.some((x) => /:(etiqueta|seminovo)$/.test(x.chave) && x.classe === 'neutraliza');
      if (devia !== veio) fCat.push(`${p0.sku} → ${cat}: etiqueta ${veio ? 'a mais' : 'em falta'}`);
    }
  });
  certo(fCat.length === 0 && nCat === 100, `${nCat} mudanças de categoria: um pneu à venda sem etiqueta sai de venda, o resto não`, fCat.slice(0, 5).join(' | '));
  const pneus = HOJE.products.products.map((p, i) => [p, i]).filter(([p]) => R.ePneu(p));
  const ligados = pneus.filter(([p, i]) => R.problemasDoProduto({ ...p, available: true }, { indice: i, imagemExiste: existeHoje }).some((x) => x.classe === 'neutraliza' && /:(etiqueta|seminovo)$/.test(x.chave)));
  certo(pneus.length === 13 && ligados.length === 13, 'ligar «À venda» em cada um dos 13 pneus de hoje: todos saem de venda por causa da etiqueta ou dos dados de seminovo');
  const desligados = HOJE.products.products.filter((p, i) => R.problemasDoProduto({ ...p, available: false }, { indice: i, imagemExiste: existeHoje }).some((x) => x.classe !== 'avisa'));
  certo(desligados.length === 0, 'desligar cada produto: nenhum problema além dos lembretes');

  /* ================================================================== */
  secao('ajudantes');
  certo(R.gerarSku('Pneu Michelin Primacy 4+ 205/55 R16') === 'pneu-michelin-primacy-4-205-55-r16', 'gerarSku: minúsculas, hífens');
  certo(R.gerarSku('Óleo de Motor 5W-30 (5L)') === 'oleo-de-motor-5w-30-5l', 'gerarSku: sem acentos');
  certo(R.gerarSku('Teste de pagamento') === 'p-teste-de-pagamento' && R.gerarSku('ZZ top') === 'p-zz-top' && R.gerarSku('Teste') === 'p-teste' && R.gerarSku('Testemunho') === 'testemunho', 'gerarSku: «teste-» e «zz-» levam «p-» (não se escondem sozinhos)');
  certo(R.gerarSku('Jante 16', ['jante-16', 'jante-16-2']) === 'jante-16-3', 'gerarSku: -2, -3 se já existir');
  certo(R.gerarSku('x'.repeat(200)).length === 60 && R.gerarSku('!!!') === 'produto', 'gerarSku: corta a 60; sem letras, «produto»');
  certo(R.duasCasas(76.9) && R.duasCasas(0.1 + 0.2) && R.duasCasas(89.99) && !R.duasCasas(89.999) && !R.duasCasas(0.305) && !R.duasCasas('1'), 'duasCasas: 76,90 e 0.30000000000000004 sim (ruído da vírgula flutuante); 89,999 e 0,305 não');
  certo(JSON.stringify(R.mudancasBloqueadas(HOJE.settings, { ...clonar(HOJE.settings), delivery: { ...HOJE.settings.delivery, max_days: 20 }, returns: { return_cost_eur: 6.5, note: '' } })) === '[]', 'mudancasBloqueadas: os prazos e a devolução mudam-se (são do dono)');
  const mb = R.mudancasBloqueadas(HOJE.settings, { ...clonar(HOJE.settings), store: { ...HOJE.settings.store, phone: '1' }, extra: 1 });
  certo(mb.length === 2 && mb[0].caminho === 'store' && mb[1].motivo === 'chave_nova', 'mudancasBloqueadas: store e chaves novas de topo, não');
  certo(R.mudancasBloqueadas({ a: { b: null }, store: { x: 1 } }, { store: { x: 1 }, a: {} }).length === 0, 'mudancasBloqueadas: null ≡ ausente, e a ordem das chaves não conta');

  /* ================================================================== */
  /* REVISÃO DE 1 OUT, L2-04, e o ajuste do Renato (o dono é autónomo): um
     settings.json sem uma secção da Loja online (o Pages CMS omitia as vazias)
     travava no painel o custo de devolução — qualquer chave de topo nova era
     «bloqueada» — e mandava o dono falar com o Renato por conteúdo. */
  secao('o dono é autónomo: as secções da Loja online, e o Renato só nas avarias');
  {
    const semReturns = clonar(HOJE.settings); delete semReturns.returns;
    certo(JSON.stringify(R.mudancasBloqueadas(semReturns, { ...clonar(semReturns), returns: { return_cost_eur: 6.5 } })) === '[]',
      'mudancasBloqueadas: num settings.json sem «returns», o painel pode pôr o custo de devolução (L2-04)');
    /* A secção volta como o ecrã a escreve: sem os campos bloqueados lá
       dentro (o free_pickup dos portes nenhum ecrã o mostra). */
    const falham = R.SECCOES_DEFINICOES.filter((k) => {
      const s = clonar(HOJE.settings); const v = s[k] ?? {}; delete s[k];
      for (const b of R.BLOQUEADOS.filter((x) => x.startsWith(`${k}.`))) delete v[b.slice(k.length + 1)];
      return R.mudancasBloqueadas(s, { ...clonar(s), [k]: v }).length !== 0;
    });
    certo(falham.length === 0 && R.SECCOES_DEFINICOES.length === 5, `   e o mesmo com cada uma das ${R.SECCOES_DEFINICOES.length} secções da Loja online (${R.SECCOES_DEFINICOES.join(', ')})`, falham.join(', '));
    certo(Object.keys(HOJE.settings).every((k) => R.SECCOES_DEFINICOES.includes(k) || R.BLOQUEADOS.includes(k)),
      '   cada chave de topo do settings.json de hoje é uma secção da Loja online ou está bloqueada (uma chave nova no ficheiro tem de ser classificada aqui)', Object.keys(HOJE.settings).join(', '));
    certo(R.SECCOES_DEFINICOES.every((k) => !R.BLOQUEADOS.includes(k)), '   nenhuma secção da Loja online está bloqueada inteira (só o free_pickup, dentro dos portes)');
    const semStore = clonar(HOJE.settings); delete semStore.store;
    const st = R.mudancasBloqueadas(semStore, { ...clonar(semStore), store: { phone: '1' } });
    certo(st.length === 1 && st[0].caminho === 'store' && st[0].motivo === 'mudou', '   o legado «store» não volta a nascer (uma só recusa, «mudou»)', JSON.stringify(st));
    const fp = R.mudancasBloqueadas(HOJE.settings, { ...clonar(HOJE.settings), shipping: { ...HOJE.settings.shipping, free_pickup: false } });
    certo(fp.length === 1 && fp[0].caminho === 'shipping.free_pickup' && fp[0].motivo === 'mudou', '   e o «free_pickup» continua bloqueado', JSON.stringify(fp));
    const estranhas = JSON.parse(JSON.stringify(HOJE.settings).replace(/^\{/, '{"__proto__":{"x":1},"constructor":1,"novidade":{},'));
    const ch = R.mudancasBloqueadas(HOJE.settings, estranhas).filter((x) => x.motivo === 'chave_nova').map((x) => x.caminho).sort();
    certo(JSON.stringify(ch) === '["__proto__","constructor","novidade"]', '   uma chave de topo que não é secção da Loja online continua recusada (também «__proto__» e «constructor»)', JSON.stringify(ch));
    /* O conteúdo de uma secção que volta passa pelas regras de sempre. */
    const r1 = R.problemas({ ...TEXTO, settings: { ...clonar(semReturns), returns: { return_cost_eur: 5000 } } });
    certo(tem(r1, 'bloqueia', 'settings:returns.return_cost_eur'), '   e o que vai dentro dela passa pelas regras (5000 € de devolução: pára)');
  }
  {
    const casos = [['351935218857', true], ['34612345678', true], ['447700900123', true], ['351 935 218 857', false], ['+351935218857', false], ['912345678', false],
      ['00351935218857', false], ['0351935218857', false], ['3519352188570000', false], ['', false], [351935218857, false], [null, false], ['35193521885a', false]];
    const mal = casos.filter(([v, ok]) => R.whatsappValido(v) !== ok).map(([v]) => String(v));
    certo(mal.length === 0, 'whatsappValido(): 10 a 15 algarismos, com o indicativo, sem 0 à frente (o painel usa esta no campo)', mal.join(', '));
    const desacordo = casos.filter(([v]) => typeof v === 'string' && v !== '').filter(([v]) => {
      const s = clonar(SITE_OK); s.contactos.whatsapp = v;
      return R.whatsappValido(v) === comA2(s, EMPRESA_OK).some((p) => p.chave === 'site:contactos.whatsapp');
    }).map(([v]) => v);
    certo(desacordo.length === 0, '   e é a mesma regra que pára a publicação', desacordo.join(', '));
    const marcas = [['**Armazém** e *pneus*', true], ['sem marcas', true], ['****', false], ['a****b', false], ['**a*', false], ['*a', false], ['**', false], [5, false]];
    const malM = marcas.filter(([v, ok]) => R.marcasEquilibradas(v) !== ok).map(([v]) => String(v));
    certo(malM.length === 0, 'marcasEquilibradas(): exportada, a mesma do injector («****» não é nada; o painel usa esta nos textos)', malM.join(', '));
  }
  {
    /* As mensagens que o dono lê no painel: o que ele próprio resolve diz-lhe
       como, e não «fale com o Renato». */
    const muitos = dadosDeHoje(); const p0 = muitos.products.products[JANTE];
    for (let i = 0; i < 330; i++) muitos.products.products.push({ ...clonar(p0), sku: `x-${i}` });
    const quase = R.problemas(muitos).find((p) => p.chave === 'products:tecto');
    for (let i = 330; i < 400; i++) muitos.products.products.push({ ...clonar(p0), sku: `x-${i}` });
    const acima = R.problemas(muitos).find((p) => p.chave === 'products:tecto');
    certo(quase && /a chegar ao limite/.test(quase.mensagem) && /apague os produtos que já não vende/.test(quase.mensagem) && !/Renato/.test(quase.mensagem), 'a lista de produtos a chegar ao limite: «apague os que já não vende», sem o Renato', quase && quase.mensagem);
    certo(acima && /passou do limite/.test(acima.mensagem) && /Apague os produtos que já não vende/.test(acima.mensagem) && !/Renato/.test(acima.mensagem), '   e acima do limite também', acima && acima.mensagem);
    const sv = clonar(SITE_OK); sv.servicos[0].id = 'Montagem Já';
    const pId = comA2(sv, EMPRESA_OK).find((p) => p.chave === 'site:servicos.1.id');
    const sr = clonar(SITE_OK); sr.servicos[1].id = sr.servicos[0].id;
    const pRep = comA2(sr, EMPRESA_OK).find((p) => /repetido$/.test(p.chave));
    certo(pId && pRep && [pId, pRep].every((p) => /«\+ Novo serviço»/.test(p.mensagem) && !/Renato/.test(p.mensagem)), 'um serviço com a referência estragada ou repetida: «apague e crie outra vez com «+ Novo serviço»», sem o Renato', `${pId?.mensagem} | ${pRep?.mensagem}`);
    const en = clonar(EMPRESA_OK); en.nif = 516324950;
    const pNif = comA2(SITE_OK, en).find((p) => p.chave === 'empresa:nif');
    certo(pNif && /apague-o e escreva-o outra vez/.test(pNif.mensagem) && !/Renato/.test(pNif.mensagem), 'o NIF gravado como número: «apague-o e escreva-o outra vez», sem o Renato', pNif && pNif.mensagem);
    /* Na fonte: cada mensagem que ainda nomeia o Renato é de uma avaria
       técnica — um ficheiro que não se lê, que falta ou não tem a forma, ou
       a referência de um produto (que o painel não muda). */
    const AVARIAS = /não se consegue ler|Falta o ficheiro|forma certa|não é um produto|referência válida|está em \$\{indices\.length\} produtos|passou dos \$\{TECTOS\.outrosBytes/;
    const codigoR = readFileSync(join(RAIZ, '.github', 'regras.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const comRenato = codigoR.split('\n').filter((l) => /Renato/.test(l));
    const deConteudo = comRenato.filter((l) => !AVARIAS.test(l)).map((l) => l.trim().slice(0, 120));
    certo(comRenato.length >= 8 && deConteudo.length === 0, `as ${comRenato.length} mensagens das regras que nomeiam o Renato são todas de avarias técnicas`, deConteudo.join(' | '));
  }

  /* ================================================================== */
  secao('os marcadores das páginas (para o A2)');
  const H = (html, o) => G.problemasDoHtml('pagina.html', html, o);
  certo(H('<p><!--ap:telefone-->935 218 857<!--/ap:telefone--></p><!--ap:telefone-2-->x<!--/ap:telefone-2-->').length === 0, 'marcador aberto e fechado: bem');
  certo(H('<!--ap:portes se=a-combinar-->a<!--ap:portes senao-->b<!--/ap:portes-->').length === 0, 'a variante dos portes, com o «senão»: bem');
  certo(H('<!--ap:telefonee-->x<!--/ap:telefonee-->').some((p) => p.classe === 'bloqueia' && /não existe/.test(p.mensagem)), 'nome desconhecido: pára');
  certo(H('<!--ap:telefone-->x').some((p) => /não fecha/.test(p.mensagem)), 'aberto sem fecho: pára');
  certo(H('x<!--/ap:telefone-->').some((p) => /sem ter aberto/.test(p.mensagem)), 'fecho sem abertura: pára');
  certo(H('<!--ap:telefone senao-->').length > 0, '«senão» fora de uma variante: pára');
  certo(H('<a data-ap-href="whatsapp-orcamento" href="#">').length === 0 && H('<a data-ap-href="twitter" href="#">').length === 1, 'data-ap-href: nomes da lista fechada');
  certo(H('<iframe data-ap-attr="data-map-embed:mapa-embed">').length === 0 && H('<iframe data-ap-attr="mapa-embed">').length === 1, 'data-ap-attr: «atributo:nome»');
  certo(H('<head></head>', { exigirMetas: true }).length === 2 && H('<meta content="351935218857" name="ap:whatsapp"><meta name="ap:telefone" content="935 218 857">', { exigirMetas: true }).length === 0, 'metas: exigidas quando o site.json for obrigatório (em qualquer ordem de atributos)');
  certo(G.problemasDoHtml('admin/index.html', '<head></head>', { exigirMetas: true }).length === 2, 'metas: exigidas também em admin/ (a excepção era a página do Pages CMS, que saiu na fase G)');
  certo(H('<!--ap:portes se=outra-->a<!--/ap:portes-->').some((p) => /tem de ser «se=a-combinar»/.test(p.mensagem)), 'variante com a condição errada: pára');
  certo(H('<!--ap:portes-->a<!--/ap:portes-->').some((p) => /é uma variante/.test(p.mensagem)), 'variante sem condição: pára');
  certo(H('<!--ap:telefone se=existe-->a<!--/ap:telefone-->').some((p) => /não é uma variante/.test(p.mensagem)), 'condição num marcador que não é variante: pára');
  certo(H('<!--ap:morada-linha--><!--ap:nif-->1<!--/ap:nif--><!--/ap:morada-linha-->').some((p) => /trocado por inteiro/.test(p.mensagem)), 'marcador dentro de outro que é trocado por inteiro: pára');
  certo(H('<!--ap:devolucao se=loja-paga-->a<!--ap:devolucao senao-->b <!--ap:custo-devolucao-->1<!--/ap:custo-devolucao--><!--/ap:devolucao-->').length === 0, 'marcador dentro de um ramo de uma variante: bem');

  secao('o injector e a guarda falam a mesma língua');
  {
    const r = spawnSync(PY, [join(RAIZ, '.github', 'injetar-conteudo.py'), '--listas'], { encoding: 'utf8' });
    let L = null; try { L = JSON.parse(r.stdout); } catch { /* fica null */ }
    certo(r.status === 0 && L && Array.isArray(L.marcadores) && L.marcadores.length > 20, 'o injector diz as suas listas (--listas)', r.stderr);
    if (L) {
      certo(JSON.stringify(L.marcadores) === JSON.stringify(G.MARCADORES), 'marcadores: a mesma lista, pela mesma ordem', `injector ${L.marcadores.join(',')} / guarda ${G.MARCADORES.join(',')}`);
      certo(JSON.stringify(L.atributos) === JSON.stringify(G.ATRIBUTOS), 'atributos: a mesma lista');
      certo(JSON.stringify(L.metas) === JSON.stringify(G.METAS), 'metas: a mesma lista');
      certo(JSON.stringify(L.variantes) === JSON.stringify(G.VARIANTES), 'variantes: as mesmas condições');
      certo(JSON.stringify(L.icones) === JSON.stringify(R.ICONES_SERVICOS), 'os desenhos dos serviços do injector são os ICONES_SERVICOS das regras');
    }
    const prep = ler('.github/preparar-site.sh');
    const iConteudo = prep.indexOf('.github/injetar-conteudo.py'); const iImagens = prep.indexOf('.github/injetar-imagens.py');
    certo(iConteudo > 0 && iImagens > iConteudo, 'o preparar-site.sh injecta o conteúdo ANTES das fotografias');
  }

  /* ================================================================== */
  secao('o que as regras deixam passar, a publicação publica (diferencial contra o injector verdadeiro)');
  /* Achados L3-01 e L8-02: as regras (painel, Worker do painel, guarda) e o
     injector foram escritos à parte, em duas línguas. O painel gravava, a guarda
     passava, e o injector parava a publicação inteira — com ela, o interruptor
     dos pagamentos. Aqui cada campo do site.json e do empresa.json (e os do
     settings.json que vão para os Termos) recebe valores hostis; os que as
     regras deixam passar (nenhum «bloqueia») têm de publicar no injector
     verdadeiro (injetar-conteudo.py --casos: Dados + injetar_pagina, o mesmo
     código da publicação) sobre as páginas verdadeiras. E as marcas de
     negrito e itálico: todos os textos de até 5 caracteres feitos de «a»,
     «*», espaço e mudança de linha. */
  {
    const PAGINAS = G.paginasHtml(RAIZ);
    const folhas = (o, pre = []) => Object.entries(o).flatMap(([k, v]) => (v !== null && typeof v === 'object' ? folhas(v, [...pre, k]) : [[...pre, k]]));
    const HOSTIS = ['', ' ', '****', 'a****b', '***', '** **', '*a**b*', '**a*', '\u0085', 'x\u0085', '\u001f', 'x\u001fy', '\u001c', '\ufeff',
      '\ufeffx', '\u200b', '\u2028', 'a\u2028b', '\u00a0', '\u3000x\u3000', 'x\ny', 'x\r\ny', '\ud83d', 'x\udc00', 'Montagem 🚗',
      'https://www.facebook.com/a\u001fb', 'https://www.facebook.com/a\u0085b', 'https://www.Facebook.com/X', 'https://fb.me/x', 'https://ex\u2100mple.pt',
      'https://[::1]/', 'https://x.pt/"onmouseover="alert(1)', 'https://x.pt/</script>', 'javascript:alert(1)', 'a<!--b', 'a-->b', '<!--ap:telefone-->',
      'a&amp;b', 'Tom & Jerry', 'a"b\'c', '</script><script>alert(1)</script>', '912345678', '351912345678', '+351 935 218 857', '00351935218857',
      'loja@exemplo.pt', '3885-183', '516324950', 'a'.repeat(300)];
    const NAO_TEXTO = [null, 5, 2.5, true, [], {}];
    const definirEm = (o, cam, v) => { let x = o; for (const k of cam.slice(0, -1)) x = x[k]; x[cam.at(-1)] = v; };
    const casos = [];
    const juntar = (rotulo, mudar) => { const d = dadosDeHoje(); mudar(d); casos.push({ rotulo, d }); };
    for (const qual of ['site', 'empresa']) {
      for (const cam of folhas(HOJE[qual])) {
        for (const v of [...HOSTIS, ...NAO_TEXTO]) juntar(`${qual}.${cam.join('.')} = ${JSON.stringify(v)}`, (d) => definirEm(d[qual], cam, clonar(v)));
      }
    }
    for (const [cam, valores] of [
      [['delivery', 'estimate_min_days'], [0, 1, 2, 5, 6, 30, 31, 2.5, '2', null]],
      [['delivery', 'estimate_max_days'], [1, 2, 5, 21, 30, 31, 4.5, null]],
      [['delivery', 'max_days'], [1, 4, 5, 20, 30, 31, '30', null]],
      [['returns', 'return_cost_eur'], [null, 0, 6.5, 6.555, -1, '5', 1000, 1000.01, true]],
      [['returns'], [null, [], 'x', {}]],
      [['shipping', 'quote_later'], [true, false, null, 'sim', 1]],
    ]) for (const v of valores) juntar(`settings.${cam.join('.')} = ${JSON.stringify(v)}`, (d) => definirEm(d.settings, cam, clonar(v)));
    const textos = (alfabeto, max) => { const out = []; let nivel = ['']; for (let n = 1; n <= max; n++) { nivel = nivel.flatMap((t) => alfabeto.map((c) => t + c)); out.push(...nivel); } return out; };
    for (const t of textos(['a', '*', ' ', '\n'], 5)) juntar(`rodape.frase = ${JSON.stringify(t)}`, (d) => { d.site.textos.rodape.frase = t; });

    const diferencial = (regras) => {
      const aceites = casos.filter((c) => !regras.problemas(c.d, { imagemExiste: existeHoje }).some((p) => p.classe === 'bloqueia'));
      const f = join(TMP, `casos-${Math.random().toString(36).slice(2)}.json`);
      writeFileSync(f, JSON.stringify({ paginas: PAGINAS, casos: aceites.map((c) => ({ site: c.d.site, empresa: c.d.empresa, settings: c.d.settings })) }));
      const r = spawnSync(PY, [join(RAIZ, '.github', 'injetar-conteudo.py'), '--casos', RAIZ, f], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      let saida = null; try { saida = JSON.parse(r.stdout); } catch { /* fica null */ }
      if (!Array.isArray(saida) || saida.length !== aceites.length) return { erro: `o injector não respondeu (${r.status}): ${r.stderr.slice(-300)}`, aceites: aceites.length, furos: [] };
      return { aceites: aceites.length, furos: aceites.map((c, i) => [c.rotulo, saida[i]]).filter(([, e]) => e !== null) };
    };
    const t0 = Date.now();
    const agora = diferencial(R);
    certo(!agora.erro && agora.aceites > 1000, `${casos.length} casos; as regras deixam passar ${agora.aceites}, e o injector corre-os todos (${((Date.now() - t0) / 1000).toFixed(1)} s)`, agora.erro || '');
    certo(!agora.erro && agora.furos.length === 0, '   e publica-os todos: nada que o painel grave pára a publicação',
      agora.furos.slice(0, 6).map(([rot, e]) => `${rot.slice(0, 70)} → ${String(e).slice(0, 90)}`).join(' | '));
    /* A guarda da guarda: com as regras de antes deste acerto (80ba5c4) o mesmo
       diferencial encontra os casos do achado. */
    try {
      const antes = execFileSync('git', ['-C', RAIZ, 'show', '80ba5c4:.github/regras.mjs'], { encoding: 'utf8' });
      const RA = await import(`data:text/javascript;base64,${Buffer.from(antes).toString('base64')}`);
      const velho = diferencial(RA);
      const temEstrelas = velho.furos.some(([rot]) => /\*\*\*\*/.test(rot));
      certo(!velho.erro && velho.furos.length >= 20 && temEstrelas, `   guarda da guarda: com as regras de antes (80ba5c4), o diferencial encontra ${velho.furos.length} valores que o painel gravava e a publicação recusava («****» incluído)`, velho.erro || '');
    } catch (e) {
      certo(false, '   guarda da guarda: ler as regras de 80ba5c4 do git', String(e.message || e));
    }
  }

  /* ================================================================== */
  secao('o Worker dos pagamentos lê o que o dono grava (fase W-dados)');
  /* Desde a W-dados, o Worker lê os prazos, a devolução, o telefone, o email e
     a empresa dos mesmos JSON. Os avisos de antes («os emails ainda dizem…
     o Renato tem de actualizar o Worker») ficavam falsos — e mandavam o dono
     ao Renato por conteúdo. Saíram; no lugar deles, três provas. */
  {
    const d = dadosDeHoje();
    d.settings.delivery = { ...d.settings.delivery, estimate_min_days: 3, estimate_max_days: 7, max_days: 20 };
    d.settings.returns.return_cost_eur = 6.5;
    d.site.contactos.telefone = '912 345 678'; d.site.contactos.email = 'loja@exemplo.pt';
    d.empresa.nif = '500000000'; d.empresa.morada.rua = 'Rua Nova, 1'; d.empresa.morada.cp = '3880-001';
    const dir = repoDeEnsaio(d);
    const r = guardaEm(dir);
    const falsos = (r.relatorio?.problemas ?? []).filter((p) => /^worker:/.test(p.chave) || /Worker dos pagamentos|Renato tem de/.test(p.mensagem));
    certo(r.status === 0 && r.relatorio && falsos.length === 0 && !/Worker dos pagamentos/.test(r.out),
      '1. o dono muda prazos, devolução, telefone, email, NIF e morada: a guarda verdadeira sai com 0 e não diz que os emails estão atrasados (nem manda ninguém ao Worker)', falsos.map((p) => p.mensagem).join(' | ') || r.err);
    const t = T.termosDasFontes(d, {});
    certo(t.invalidos.length === 0 && t.termos.prazos.max_dias === 20 && t.termos.devolucao.custo_eur === 6.5 && t.termos.contactos.telefone === '912 345 678'
      && t.termos.empresa.nif === '500000000' && t.termos.empresa.morada.rua === 'Rua Nova, 1', '   e o Worker dos pagamentos lê esses valores novos (é por isso que os avisos saíram)', JSON.stringify(t));
    rmSync(dir, { recursive: true, force: true });
  }

  /* 2. O que estas regras deixam passar, o Worker aceita (o contrato do
     worker/README.md: «o painel tem de ser igual ou mais apertado»). Um valor
     que ele recusasse chegava ao site e não aos emails: lá ficava o anterior,
     escrito no termos.js. Caso a caso (os que já falharam) e ao acaso (com
     semente: a mesma corrida dá o mesmo resultado). «Aceita» = nenhum
     «bloqueia» — o mais largo dos três leitores (o CI); o painel e o Worker
     do painel recusam mais (também os avisos). A nota da devolução fica de
     fora: o painel não a edita e não sai em lado nenhum (nem checkout, nem
     Termos, nem emails). */
  {
    let semente = 20261001;
    const acaso = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
    const um = (lista) => lista[Math.floor(acaso() * lista.length)];
    const LETRAS = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789áéíóúâêôãõçÁÉÇ'];
    const SINAIS = [...' .,;:!?#@%&*_+=/\\|()[]{}<>"\'’‘“”«»–—-ºª°€$^~`'];
    const textoAoAcaso = (max) => Array.from({ length: Math.floor(acaso() * max) }, () => (acaso() < 0.75 ? um(LETRAS) : um(SINAIS))).join('');
    /* Quase sempre com os sinais que a morada aceita; de vez em quando um que
       não aceita. Assim há muitos valores aceites perto da fronteira. */
    const DA_MORADA = [...LETRAS, ...LETRAS, ' ', ' ', ' ', ...". , ' ’ º ª ° / & ( ) -".split(' ')];
    const moradaAoAcaso = (max) => Array.from({ length: Math.floor(acaso() * max) }, () => (acaso() < 0.985 ? um(DA_MORADA) : um(SINAIS))).join('');
    const nifAoAcaso = () => {
      const b = Array.from({ length: 8 }, () => Math.floor(acaso() * 10));
      const soma = b.reduce((a, x, i) => a + x * (9 - i), 0); const resto = soma % 11;
      return b.join('') + (acaso() < 0.85 ? (resto < 2 ? 0 : 11 - resto) : Math.floor(acaso() * 10));
    };
    const custoAoAcaso = () => um([Math.round(acaso() * 200000) / 100, Math.round(acaso() * 120000) / 100, Math.round(acaso() * 1000) / 1000, -acaso() * 10, 1000, 1000.01, 999.99, 0]);
    const de = (alfabeto, min, max, intruso = '', p = 0) => Array.from({ length: min + Math.floor(acaso() * (max - min + 1)) }, () => (intruso && acaso() < p ? um([...intruso]) : um([...alfabeto]))).join('');
    const emailAoAcaso = () => `${um(['', ' '])}${de('abcXYZ019._%+-', 1, 30, 'áç !#/,;<>"@', 0.02)}@${de('abcdefXYZ019-', 1, 20, '_áç.', 0.03)}${um(['', `.${de('abc019-', 1, 10)}`])}.${um(['pt', 'com', 'p', 'p1', 'PT', 'xn--p1ai', de('abcXYZ', 1, 4), de('abc1-', 1, 4)])}${acaso() < 0.05 ? 'a'.repeat(150) : ''}`;
    const telAoAcaso = () => `${um(['', '', '+351 ', '+', '00351 ', '(+351) '])}${de('0123456789  ', 7, 20, '-().+', 0.05)}`;
    const urlAoAcaso = () => `${um(['https://', 'https://', 'https://', 'http://', 'https://eu:pw@', 'https://eu@'])}${um(['www.livroreclamacoes.pt', 'x.pt', 'A.PT:443', 'x.pt:8443'])}/${de('abcxyz019/.-_~%?=&', 0, 200, '" \'<>', 0.01)}`;
    const definir = (o, caminho, v) => { const ks = caminho.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = x[k]; if (v === undefined) delete x[ks.at(-1)]; else x[ks.at(-1)] = v; };
    /* [ficheiro, caminho, grupo do termos.js, casos escolhidos, gerador ao acaso] */
    const CAMPOS = [
      ['settings', 'delivery.estimate_min_days', 'prazos', [0, 1, 2, 5, 6, 30, 31, 2.5, '2', null], () => um([Math.floor(acaso() * 35) - 2, acaso() * 30])],
      ['settings', 'delivery.estimate_max_days', 'prazos', [1, 5, 30, 31, 4.5], () => um([Math.floor(acaso() * 35) - 2, acaso() * 30])],
      ['settings', 'delivery.max_days', 'prazos', [1, 4, 5, 30, 31, 0, '30'], () => um([Math.floor(acaso() * 35) - 2, acaso() * 30])],
      ['settings', 'returns.return_cost_eur', 'custo_devolucao', [null, undefined, 0, 6.5, 999.99, 1000, 1000.01, 1500, -1, '6.5', 6.555], custoAoAcaso],
      ['site', 'contactos.telefone', 'telefone', ['935 218 857', '+351 935 218 857', '935218857', '93521885', '(+351) 935 218 857', '935-218-857', ' 935 218 857 ', '935  218  857', '1234567890123456'], telAoAcaso],
      ['site', 'contactos.email', 'email', ['loja@exemplo.pt', 'a@b.c', 'josé@exemplo.pt', 'loja@exem_plo.pt', 'loja@armazém.pt', 'loja@exemplo.p1', 'loja!@x.pt', 'a/b@x.pt', 'loja@x..pt', ' loja@exemplo.pt', `${'a'.repeat(150)}@exemplo.pt`, "o'neil@x.pt", 'Loja+tag@Exemplo.PT'], emailAoAcaso],
      ['empresa', 'nif', 'identidade', ['516324950', '000000000', '123456789', '516 324 950', 516324950, '0516324950', '999999990'], nifAoAcaso],
      ['empresa', 'denominacao', 'identidade', ['X', 'XY', 'a'.repeat(160), 'a'.repeat(161), 'Motivar & Lucrar <Lda>', ' \u200b X \u200b '], () => textoAoAcaso(200)],
      ['empresa', 'nome', 'nome', ['X', 'XY', 'a'.repeat(80), 'a'.repeat(81), '\u2028Armazém\u2028'], () => textoAoAcaso(120)],
      ['empresa', 'morada.rua', 'morada', ['Travessa do Navega, 436 F', 'R1', 'Rua 1', 'Rua do Sol #3', 'Edifício X; Loja 2', 'Rua: X', 'Rua “Alto”, 3', 'Rua [A]', 'Rua *A*', 'Rua_A', 'Lugar + 3', 'Rua 25 de Abril, 3 – 1.º Esq.', 'Rua D’Ávila, n.º 3', `Rua ${'a'.repeat(116)}`, `Rua ${'a'.repeat(117)}`, `Rua${' '.repeat(400)}a`], () => moradaAoAcaso(140)],
      ['empresa', 'morada.localidade', 'morada', ['Arada', 'A', 'São João da Madeira', 'Arada (Ovar)', 'Arada; Ovar', 'a'.repeat(61)], () => moradaAoAcaso(70)],
      ['empresa', 'morada.concelho', 'morada', ['Ovar', '', null, undefined, 'O', 'Ovar; Aveiro', 'a'.repeat(61), 5], () => moradaAoAcaso(70)],
      ['empresa', 'morada.cp', 'morada', ['3885-183', ' 3885-183', '3885183', '3885-1830'], () => `${Math.floor(acaso() * 10000)}-${Math.floor(acaso() * 1000)}`],
      ['empresa', 'livro_reclamacoes', 'livro_reclamacoes', ['https://www.livroreclamacoes.pt/inicio', 'http://x.pt', 'https://user:pw@x.pt', `https://x.pt/${'a'.repeat(187)}`, `https://x.pt/${'a'.repeat(188)}`, 'https://x.pt/"a"', 'https://x.pt/ a', 'https://A.PT:443/../b'], urlAoAcaso],
    ];
    const ACASO = 400;
    const prova = (regras) => CAMPOS.map(([qual, caminho, grupo, casos, gerar]) => {
      const valores = [...casos, ...Array.from({ length: ACASO }, gerar)];
      let aceites = 0; let recusados = 0; const furos = [];
      for (const v of valores) {
        const d = dadosDeHoje(); definir(d[qual], caminho, v);
        if (regras.problemas(d).some((p) => p.classe === 'bloqueia')) { recusados++; continue; }
        aceites++;
        if (T.termosDasFontes(d, {}).invalidos.includes(grupo)) furos.push(v);
      }
      return { qual, caminho, aceites, recusados, furos };
    });
    let total = 0;
    for (const x of prova(R)) {
      total += x.aceites + x.recusados;
      certo(x.furos.length === 0 && x.aceites > 0 && x.recusados > 0,
        `2. ${x.qual}.${x.caminho}: dos ${x.aceites + x.recusados} valores, os ${x.aceites} que as regras deixam passar o Worker aceita (${x.recusados} recusados pelas regras)`,
        x.furos.slice(0, 4).map((v) => JSON.stringify(v).slice(0, 60)).join(' · '));
    }
    console.log(`    (${total} valores, ${ACASO} ao acaso por campo)`);
    /* A guarda da guarda: as regras do A2 (81982ae), de antes deste acerto,
       tinham furos — esta prova tem de os encontrar. */
    try {
      const antes = execFileSync('git', ['-C', RAIZ, 'show', '81982ae:.github/regras.mjs'], { encoding: 'utf8' });
      const RA = await import(`data:text/javascript;base64,${Buffer.from(antes).toString('base64')}`);
      const furos = prova(RA).filter((x) => x.furos.length);
      certo(furos.length >= 5, `   guarda da guarda: com as regras do A2 (81982ae) a mesma prova encontra furos em ${furos.length} campos`, furos.map((x) => x.caminho).join(', '));
    } catch (e) {
      certo(false, '   guarda da guarda: ler as regras do A2 (81982ae) do git', String(e.message || e));
    }
  }

  /* 3. O worker/src não volta a ter os valores escritos à mão. Só o
     src/termos.js os tem, no RECURSO (o que vale enquanto um ficheiro não se
     lê, e o que se prometeu às encomendas de antes), e só ele lê DELIVERY_* e
     STORE_* do wrangler.toml. */
  {
    const LITERAIS = [/935[ .]?218[ .]?857/, /516[ .]?324[ .]?950/, /3885-183/, /Navega/, /Motivar/, /livroreclamacoes\.pt/];
    const fontes = Object.fromEntries(readdirSync(join(RAIZ, 'worker', 'src')).filter((f) => f.endsWith('.js')).map((f) => [f, ler(`worker/src/${f}`)]));
    const escritosAMao = (fs) => Object.entries(fs).flatMap(([f, texto]) => {
      let t = texto;
      if (f === 'termos.js') {
        const i = t.indexOf('const RECURSO_TELEFONE'); const j = t.indexOf('};', t.indexOf('const RECURSO_EMPRESA'));
        if (i < 0 || j < 0) return [`${f}: o bloco do RECURSO não está onde se esperava`];
        t = t.slice(0, i) + t.slice(j + 2);
        t = t.replace(/^\s*\/\*\*[^\n]*\*\/\s*$/gm, '');   // o exemplo da moradaLinha()
      }
      const achados = LITERAIS.filter((re) => re.test(t)).map((re) => `${f}: ${re.source}`);
      if (f !== 'termos.js' && /\benv\.(DELIVERY_|STORE_(PHONE|EMAIL))/.test(t)) achados.push(`${f}: lê DELIVERY_*/STORE_* do wrangler.toml`);
      return achados;
    });
    certo(Object.keys(fontes).length >= 4 && 'termos.js' in fontes, `3. li o worker/src (${Object.keys(fontes).join(', ')})`);
    certo(escritosAMao(fontes).length === 0, '   nenhum telefone, NIF, código postal, rua, denominação ou Livro de Reclamações escrito à mão fora do RECURSO do termos.js, e só ele lê DELIVERY_*/STORE_*', escritosAMao(fontes).join(' | '));
    const mexido = { ...fontes, 'mail.js': fontes['mail.js'] + "\nconst TEL = '935 218 857';\n", 'index.js': fontes['index.js'] + '\nconst x = env.DELIVERY_MAX_DAYS;\n' };
    certo(escritosAMao(mexido).length === 2, '   guarda da guarda: um telefone escrito no mail.js e um DELIVERY_* lido no index.js são apanhados', escritosAMao(mexido).join(' | '));
  }

  /* ================================================================== */
  secao('o catálogo (assets/js/catalog.js): o que o cartão anuncia');
  /* O catalog.js verdadeiro, num vm, com um document e um fetch de
     faz-de-conta: devolve o HTML dos cartões. */
  const cartoes = async (produtos) => {
    const els = {};
    const el = (id) => (els[id] ||= { id, innerHTML: '', value: '', getAttribute: () => null, addEventListener() {}, querySelectorAll: () => [] });
    const ctx = {
      document: { getElementById: (id) => (['catalog-grid', 'catalog-filters', 'catalog-search'].includes(id) ? el(id) : null), querySelector: () => null },
      window: { addEventListener() {} }, location: { search: '', hash: '' }, URLSearchParams,
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ products: produtos }) }),
    };
    vm.runInNewContext(ler('assets/js/catalog.js'), ctx);
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    return els['catalog-grid'].innerHTML;
  };
  {
    const p = clonar(HOJE.products.products[SEMINOVO]);
    const doze = await cartoes([{ ...p, warranty_months: 12 }]);
    const vinte = await cartoes([{ ...p, warranty_months: 24 }]);
    certo(/pcard__title/.test(doze) && !/Garantia 12 meses/.test(doze) && /Garantia 24 meses/.test(vinte),
      'seminovo: «Garantia 12 meses» já não se anuncia (o DL 84/2021 só deixa reduzir até 18); 24 meses sim (achado L6-01)', doze.slice(0, 200));
  }

  {
    /* Achado L6-02: os pneus novos sem a etiqueta UE apareciam com o preço
       («155,00 € Esgotado») e com letras soltas que não são a etiqueta. O
       Reg. (UE) 2020/740 (art. 6.º n.ºs 2 e 7) obriga a etiqueta junto de
       qualquer preço anunciado de um tipo de pneu. */
    const m = clonar(HOJE.products.products[MICHELIN]);
    const sem = await cartoes([m]);
    certo(/pcard__title/.test(sem) && !/155,00/.test(sem) && /Sob consulta/.test(sem) && !/pcard__label/.test(sem) && !/data-add/.test(sem),
      'pneu novo sem a etiqueta completa: sem preço («Sob consulta»), sem letras soltas e sem «Adicionar»', sem.slice(0, 300));
    const completa = { ...m, available: true, stock: 4, label_noise_class: 'B', eprel_id: '123456' };
    const com = await cartoes([completa]);
    certo(/155,00 €/.test(com) && /data-add/.test(com) && /href="https:\/\/eprel\.ec\.europa\.eu\/screen\/product\/tyres\/123456"/.test(com) && /Etiqueta e ficha de informação/.test(com),
      '   com a etiqueta completa: preço, «Adicionar» e a ligação para a etiqueta e a ficha no EPREL', com.slice(0, 300));
    const semi = clonar(HOJE.products.products[SEMINOVO]);
    certo(/32,90 €/.test(await cartoes([semi])), '   um seminovo (fora do regulamento) continua com o preço à vista');
    const lembrete = R.problemas(TEXTO).find((p) => p.chave === `produto:${m.sku}:a-espera`);
    certo(lembrete && /sem preço/.test(lembrete.mensagem), '   e o lembrete do painel diz ao dono que o pneu aparece sem preço', lembrete && lembrete.mensagem);
  }

  /* ================================================================== */
  secao('o checkout (assets/js/checkout.js): o que a página mostra e o que manda');
  /* O checkout.js verdadeiro, num vm: um DOM de faz-de-conta com os elementos
     que ele usa, o carrinho no localStorage, o settings.json e o
     products.json pelo fetch, e o /checkout do Worker a responder o que o
     teste mandar. Devolve os elementos (textContent, hidden…), o corpo que
     seguiu para o Worker e um submeter(). */
  const checkoutNaPagina = async ({ settings = HOJE.settings, produtos = HOJE.products, carrinho, entrega = 'pickup', respostas = [], textos = {} } = {}) => {
    const els = {};
    const foco = [];   // os ids que receberam o foco, por ordem
    const el = (id) => (els[id] ||= {
      id, textContent: '', innerHTML: '', hidden: true, disabled: false, value: '', checked: false,
      attrs: {}, handlers: {}, classList: { toggle() {} },
      setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      focus() { foco.push(this.id); }, scrollIntoView() {},
      addEventListener(t, f) { this.handlers[t] = f; }, querySelector: () => null,
    });
    for (const [id, t] of Object.entries(textos)) el(id).textContent = t;   // o que a publicação escreveu na página
    const form = el('co-form');
    Object.assign(form, {
      nome: { value: 'Maria Ensaio' }, email: { value: 'cliente@exemplo.pt' }, tel: { value: '912 000 000' }, nif: { value: '' }, notas: { value: '' },
      montagem: { checked: false }, montagem_imediata: { checked: false }, matricula: { value: '' }, termos: { checked: true },
      morada: { value: 'Rua do Ensaio, 10' }, cp: { value: '1000-001' }, localidade: { value: 'Lisboa' },
    });
    const pedidos = [];
    const ctx = {
      document: {
        getElementById: (id) => el(id),
        querySelector: (q) => (q === 'input[name="entrega"]:checked' ? { value: entrega } : null),
        querySelectorAll: () => ({ forEach() {} }),
      },
      location: { hostname: 'armazemdospneus.pt', search: '' }, URLSearchParams,
      localStorage: { getItem: () => JSON.stringify(carrinho), setItem() {} },
      window: { location: {} },
      fetch: async (u, init) => {
        if (/settings\.json/.test(u)) { if (settings instanceof Error) throw settings; return { ok: true, json: async () => clonar(settings) }; }
        if (/products\.json/.test(u)) return { ok: true, json: async () => clonar(produtos) };
        pedidos.push(JSON.parse(init.body));
        const r = respostas.shift() || { status: 200, corpo: { url: 'https://checkout.stripe.com/x', total_cents: 0 } };
        return { ok: r.status === 200, status: r.status, json: async () => r.corpo };
      },
    };
    vm.runInNewContext(ler('assets/js/checkout.js'), ctx);
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    const submeter = async () => { form.handlers.submit && form.handlers.submit({ preventDefault() {} }); for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };
    return { els, pedidos, submeter, janela: ctx.window, foco };
  };
  {
    /* Achado L7-11: o peso somava-se em vírgula flutuante. */
    const produtos = { products: [
      { name: 'Óleo A', category: 'Óleos', price_eur: 10, stock: 8, weight_kg: 1.6, condition: 'Novo', available: true, sku: 'oleo-a' },
      { name: 'Filtro B', category: 'Acessórios', price_eur: 5, stock: 8, weight_kg: 0.2, condition: 'Novo', available: true, sku: 'filtro-b' },
    ] };
    const settings = clonar(HOJE.settings); settings.shipping.quote_later = false;
    settings.shipping.tiers = [{ max_kg: 5, price: 4.99 }, { max_kg: 20, price: 8.99 }];
    const carrinho = [{ sku: 'oleo-a', name: 'Óleo A', qty: 3, price_cents: 1000, weight: 1.6 }, { sku: 'filtro-b', name: 'Filtro B', qty: 1, price_cents: 500, weight: 0.2 }];
    const p = await checkoutNaPagina({ settings, produtos, carrinho, entrega: 'envio' });
    certo(p.els['co-ship'].textContent === '4,99 €' && p.els['co-ship-label'].textContent === 'Portes (5 kg)',
      'checkout: 3 × 1,6 kg + 1 × 0,2 kg são 5 kg e 4,99 € de portes (o escalão certo, como o Worker)', `${p.els['co-ship-label'].textContent} ${p.els['co-ship'].textContent}`);
  }

  {
    /* Achado L5-11: com «de 3 até 3», o checkout dizia «3 a 3 dias úteis». */
    const carrinho = [{ sku: 'jante-liga-leve-16-5x112-et45', name: 'Jante', qty: 1, price_cents: 8990, weight: 9 }];
    const textos = [];
    for (const [a, b] of [[3, 3], [1, 1], [2, 5]]) {
      const settings = clonar(HOJE.settings); Object.assign(settings.delivery, { estimate_min_days: a, estimate_max_days: b });
      textos.push((await checkoutNaPagina({ settings, carrinho })).els['recap-prazo'].textContent);
    }
    certo(JSON.stringify(textos) === JSON.stringify(['3 dias úteis', '1 dia útil', '2 a 5 dias úteis']), 'checkout: «3 dias úteis» e «1 dia útil» com o mínimo igual ao máximo (como os Termos e a Stripe)', textos.join(' | '));
  }

  {
    /* Achados L6-06 e L7-02: o pedido não levava as condições mostradas, e com
       o settings.json a falhar no browser o checkout seguia com valores de
       reserva que podiam não ser os publicados. */
    const carrinho = [{ sku: 'jante-liga-leve-16-5x112-et45', name: 'Jante', qty: 1, price_cents: 8990, weight: 9 }];
    const comCusto = clonar(HOJE.settings); comCusto.returns.return_cost_eur = 6.5;
    const a = await checkoutNaPagina({ settings: comCusto, carrinho });
    await a.submeter();
    certo(JSON.stringify(a.pedidos[0] && a.pedidos[0].condicoes) === JSON.stringify({ prazo_min: 2, prazo_max: 5, prazo_maximo: 30, custo_devolucao_cents: 650 }),
      'checkout: o pedido leva as condições que a página mostrou (prazos e custo da devolução)', JSON.stringify(a.pedidos[0]));
    const publicados = { 'recap-prazo': '3 a 7 dias úteis', 'recap-max': '20 dias', 'recap-devolucao': 'os custos de devolução são suportados pela loja.' };
    const b = await checkoutNaPagina({ settings: new Error('Failed to fetch'), carrinho, textos: publicados });
    await b.submeter();
    certo(b.pedidos.length === 0 && /Recarregue a página/.test(b.els['co-error'].textContent) && b.els['recap-prazo'].textContent === '3 a 7 dias úteis' && b.els['recap-max'].textContent === '20 dias',
      'checkout: sem o settings.json, não deixa pagar, e o resumo fica com o texto publicado (e não com valores de reserva)', `${b.pedidos.length} ${b.els['co-error'].textContent} ${b.els['recap-prazo'].textContent}`);
    const novas = { prazo_min: 5, prazo_max: 10, prazo_maximo: 30, custo_devolucao_cents: 1500 };
    const c = await checkoutNaPagina({ settings: HOJE.settings, carrinho, respostas: [{ status: 409, corpo: { error: 'As condições mudaram entretanto: …', condicoes: novas } }] });
    await c.submeter();
    certo(c.els['recap-prazo'].textContent === '5 a 10 dias úteis' && /15,00 €/.test(c.els['recap-devolucao'].textContent) && /As condições mudaram/.test(c.els['co-error'].textContent) && !c.janela.location.href,
      'checkout: o Worker diz que as condições mudaram (409): o resumo mostra as novas, diz porquê, e não segue para a Stripe', `${c.els['recap-prazo'].textContent} | ${c.els['recap-devolucao'].textContent}`);
    await c.submeter();
    certo(c.pedidos.length === 2 && JSON.stringify(c.pedidos[1].condicoes) === JSON.stringify(novas), '   e a segunda vez manda as condições novas, que o cliente já viu', JSON.stringify(c.pedidos[1] && c.pedidos[1].condicoes));
  }

  /* ================================================================== */
  secao('o checkout: a garantia dos pneus seminovos (DL 84/2021, art. 12.º), contra o worker/src/garantia.js');
  /* Decisão do dono (1 out 2026): 18 meses nos seminovos, POR ACORDO. Com um
     pneu seminovo de garantia reduzida no carrinho, a caixa aparece com o
     texto do Worker, é obrigatória, e vai no pedido; sem ele, nada muda. A
     bateria do browser (.github/test-checkout.mjs) conduz o mesmo na página
     verdadeira, com o Worker verdadeiro. */
  {
    const semi = (sku, meses, extra = {}) => ({ ...clonar(HOJE.products.products[SEMINOVO]), available: true, stock: 4, dot: '3221', tread_mm: 6, warranty_months: meses, sku, name: `Pneu Seminovo ${sku}`, ...extra });
    const jante = clonar(HOJE.products.products[JANTE]);
    const S18 = semi('semi-a', 18, { name: 'Pneu Seminovo Continental 205/55 R16' });
    const S24 = semi('semi-b', 24);
    const S36 = semi('semi-c', 36);
    const produtos = { products: [jante, S18, S24, S36] };
    const item = (p, qty = 1) => ({ sku: p.sku, name: p.name, qty, price_cents: Math.round(p.price_eur * 100), weight: p.weight_kg });
    // O que o Worker pede para o mesmo carrinho (o priceOrder junta os seminovos pela ordem do carrinho).
    const doWorker = (prods, carrinho) => GW.garantiaDoCarrinho(carrinho.map((it) => prods.products.find((p) => p.sku === it.sku))
      .map((p, i) => (/pneu/i.test(p.category || '') && p.condition === 'Seminovo' ? { sku: p.sku, nome: p.name, meses: p.warranty_months, qty: carrinho[i].qty } : null)).filter(Boolean));

    const sem = await checkoutNaPagina({ produtos, carrinho: [item(jante)] });
    await sem.submeter();
    certo(sem.els['co-garantia'].hidden === true && sem.pedidos.length === 1 && !('garantia_usados' in sem.pedidos[0]),
      'sem seminovos: a caixa fica escondida e o pedido não leva garantia nenhuma', JSON.stringify(sem.pedidos[0]));
    certo(JSON.stringify(Object.keys(sem.pedidos[0])) === JSON.stringify(['condicoes', 'items', 'entrega', 'nome', 'email', 'telefone', 'nif', 'notas', 'montagem', 'montagem_imediata', 'matricula', 'aceita_termos']),
      '   o pedido tem os campos de sempre, nem mais um', Object.keys(sem.pedidos[0]).join(','));
    const s36 = await checkoutNaPagina({ produtos, carrinho: [item(S36)] });
    await s36.submeter();
    certo(s36.els['co-garantia'].hidden === true && s36.pedidos.length === 1 && !('garantia_usados' in s36.pedidos[0]), '   e um seminovo com 36 meses (a garantia inteira) também não pede acordo');

    const um = await checkoutNaPagina({ produtos, carrinho: [item(S18)] });
    certo(um.els['co-garantia'].hidden === false && um.els['c-garantia'].checked === false
      && um.els['c-garantia-texto'].textContent === 'Aceito que a garantia de conformidade deste pneu seminovo, por ser um bem usado, é de 18 meses em vez de 3 anos (DL n.º 84/2021, art. 12.º).',
      'um seminovo de 18 meses: a caixa aparece, por marcar, com o texto do acordo', um.els['c-garantia-texto'].textContent);
    certo(um.els['c-garantia-texto'].textContent === doWorker(produtos, [item(S18)]).texto, '   o texto é o do Worker, letra a letra');
    await um.submeter();
    certo(um.pedidos.length === 0 && um.els['co-error'].hidden === false && /confirme na caixa acima que aceita a garantia do pneu seminovo/.test(um.els['co-error'].textContent),
      '   sem a caixa marcada, não paga: a mensagem aparece por baixo dela', um.els['co-error'].textContent);
    certo(um.els['c-garantia'].attrs['aria-invalid'] === 'true' && um.els['c-garantia'].attrs['aria-describedby'] === 'co-error' && um.foco[um.foco.length - 1] === 'c-garantia',
      '   com aria-invalid, aria-describedby para a mensagem, e o foco na caixa', JSON.stringify([um.els['c-garantia'].attrs, um.foco]));
    um.els['c-garantia'].checked = true;
    await um.submeter();
    certo(um.pedidos.length === 1 && JSON.stringify(um.pedidos[0].garantia_usados) === JSON.stringify({ aceita: true, versao: GW.GARANTIA_VERSAO, artigos: [{ sku: S18.sku, meses: 18 }] }),
      '   marcada: o pedido leva a aceitação (a versão do texto e os meses de cada artigo)', JSON.stringify(um.pedidos[0] && um.pedidos[0].garantia_usados));

    const varios = [item(S18), item(S36), item(S24, 2)];
    const v = await checkoutNaPagina({ produtos, carrinho: varios });
    certo(v.els['c-garantia-texto'].textContent === doWorker(produtos, varios).texto && v.els['c-garantia-texto'].textContent.endsWith(': Pneu Seminovo Continental 205/55 R16 — 18 meses; Pneu Seminovo semi-b — 24 meses.'),
      'três seminovos (18, 36 e 24 meses): a garantia de cada um dos reduzidos, igual ao Worker', v.els['c-garantia-texto'].textContent);
    v.els['c-garantia'].checked = true;
    await v.submeter();
    certo(JSON.stringify(v.pedidos[0].garantia_usados.artigos) === JSON.stringify([{ sku: S18.sku, meses: 18 }, { sku: S24.sku, meses: 24 }]), '   e o pedido leva os dois reduzidos, e não o de 36');

    // O Worker diz outros meses (o dono mudou-os com a página aberta): 400.
    const g24 = GW.registoDaGarantia(doWorker({ products: [{ ...S18, warranty_months: 24 }] }, [item(S18)]));
    const r = await checkoutNaPagina({ produtos, carrinho: [item(S18)], respostas: [{ status: 400, corpo: { error: 'O pneu seminovo tem uma garantia de 24 meses, e não de 3 anos…', codigo: GW.CODIGO_GARANTIA, garantia_usados: g24 } }] });
    r.els['c-garantia'].checked = true;
    await r.submeter();
    certo(r.els['c-garantia-texto'].textContent === g24.texto && /de 24 meses/.test(g24.texto) && r.els['c-garantia'].checked === false && /24 meses/.test(r.els['co-error'].textContent)
      && r.els['c-garantia'].attrs['aria-invalid'] === 'true' && r.foco[r.foco.length - 1] === 'c-garantia' && !r.janela.location.href,
      'o Worker responde 400 (outros meses): a caixa mostra o texto dele, por marcar, com a mensagem e o foco, e não segue para a Stripe', r.els['c-garantia-texto'].textContent);
    await r.submeter();
    certo(r.pedidos.length === 1, '   sem a marcar outra vez, não manda nada');
    r.els['c-garantia'].checked = true;
    await r.submeter();
    certo(r.pedidos.length === 2 && JSON.stringify(r.pedidos[1].garantia_usados) === JSON.stringify({ aceita: true, versao: g24.versao, artigos: [{ sku: S18.sku, meses: 24 }] }),
      '   marcada outra vez: manda os meses e a versão do Worker', JSON.stringify(r.pedidos[1] && r.pedidos[1].garantia_usados));

    // Sem o products.json (a página não sabe que é seminovo): a caixa só aparece quando o Worker a pede.
    const cego = await checkoutNaPagina({ produtos: {}, carrinho: [item(S18)], respostas: [{ status: 400, corpo: { error: 'O pneu seminovo tem uma garantia de 18 meses…', codigo: GW.CODIGO_GARANTIA, garantia_usados: GW.registoDaGarantia(doWorker(produtos, [item(S18)])) } }] });
    certo(cego.els['co-garantia'].hidden === true, 'sem o products.json, a página não mostra a caixa…');
    await cego.submeter();
    certo(cego.pedidos.length === 1 && !('garantia_usados' in cego.pedidos[0]) && cego.els['co-garantia'].hidden === false && cego.els['c-garantia-texto'].textContent === doWorker(produtos, [item(S18)]).texto,
      '   …e o Worker recusa (400): a caixa aparece com o texto dele', cego.els['c-garantia-texto'].textContent);

    // Ao acaso (semente fixa): o texto da página é sempre o do Worker.
    let semente = 20261001;
    const acaso = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
    const MESES = [18, 19, 24, 30, 35, 36, 12, 17, 18.5, '18', undefined, 48];
    const NOMES = ['Pneu Seminovo Goodyear 195/65 R15', 'Pneu «Aro» 16" — 205/55', `Pneu${String.fromCharCode(0x2028)}com separador`, '  muitos   espaços  ', 'a'.repeat(250), 'Pneu & Cia <b>', ''];
    const falhas = [];
    let comCaixa = 0;
    for (let n = 0; n < 150; n++) {
      const prods = Array.from({ length: 1 + Math.floor(acaso() * 4) }, (_, i) => semi(`semi-${n}-${i}`, MESES[Math.floor(acaso() * MESES.length)], { name: NOMES[Math.floor(acaso() * NOMES.length)] || `Pneu ${i}` }));
      if (acaso() < 0.3) prods.push(jante);
      const carrinho = prods.map((p) => item(p, 1 + Math.floor(acaso() * 3)));
      const pg = await checkoutNaPagina({ produtos: { products: prods }, carrinho });
      const w = doWorker({ products: prods }, carrinho);
      if (w) comCaixa++;
      const igual = w ? pg.els['co-garantia'].hidden === false && pg.els['c-garantia-texto'].textContent === w.texto : pg.els['co-garantia'].hidden === true;
      if (!igual) falhas.push(`${JSON.stringify(carrinho.map((x) => x.sku))}: página «${pg.els['c-garantia-texto'].textContent}» / Worker «${w && w.texto}»`);
    }
    certo(falhas.length === 0 && comCaixa > 30 && comCaixa < 150, `150 carrinhos ao acaso: a página mostra a caixa quando o Worker a pede (${comCaixa}), com o mesmo texto, e esconde-a quando não`, falhas.slice(0, 2).join(' | '));

    const fonteCheckout = ler('assets/js/checkout.js');
    const versaoNaPagina = (fonteCheckout.match(/var GARANTIA_VERSAO = '([^']+)';/) || [])[1];
    certo(versaoNaPagina === GW.GARANTIA_VERSAO && fonteCheckout.includes(`'${GW.CODIGO_GARANTIA}'`),
      `a versão do texto (${versaoNaPagina}) e o código do 400 são os mesmos no checkout.js e no Worker`);
    const html = ler('checkout.html');
    certo(/<label class="co__check co__check--legal" id="co-garantia" hidden>\s*<input type="checkbox" id="c-garantia" name="garantia_usados" required \/>/.test(html)
      && html.indexOf('id="co-garantia"') > html.indexOf('id="c-termos"') && html.indexOf('id="co-garantia"') < html.indexOf('id="co-error"') && html.indexOf('id="co-error"') < html.indexOf('id="co-submit"'),
      'checkout.html: a caixa (escondida, com a etiqueta à volta) vem a seguir aos Termos e antes da mensagem de erro e do «Pagar agora»');
  }

  /* ================================================================== */
  secao('o pages.yml: quem tem o quê');
  const construir = jobDoYaml('construir'); const publicar = jobDoYaml('publicar'); const avisar = jobDoYaml('avisar');
  /* Achado L8-07: as actions iam por etiquetas móveis (v3, v4) — a do job
     publicar corre com o token da Cloudflare. */
  {
    const usos = [...YAML.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm)].map((m) => [m[1], m[2]]);
    const soltas = usos.filter(([u, resto]) => !/@[0-9a-f]{40}$/.test(u) || !/#\s*v\d/.test(resto)).map(([u]) => u);
    certo(usos.length >= 8 && soltas.length === 0, `as ${usos.length} actions do pages.yml estão fixadas pelo commit (SHA de 40), com a etiqueta em comentário`, soltas.join(', '));
  }
  /* Achado L8-01: o comentário dizia «nenhuma App tem a permissão Workflows»,
     e a do Pages CMS tem-na (e Administration, e Actions). A promessa errada
     levava a manter a App instalada até à fase G, com a barreira aberta. Na
     fase G saiu o .pages.yml, mas isso não tira o acesso à App: o comentário
     continua a dizer que este repositório tem de sair da instalação dela. */
  certo(!/nenhuma App a tem/.test(YAML) && /Pages CMS[^]{0,200}workflows: write/.test(YAML) && /este repositório tem de sair da instalação dela/.test(YAML),
    'o pages.yml não promete que nenhuma App tem «workflows», e diz que a do Pages CMS tem e que este repositório tem de sair do acesso dela (sair o .pages.yml não chega)');
  certo(!/secrets\./.test(construir) && /persist-credentials: false/.test(construir), 'construir: sem segredos, e o checkout não deixa credenciais');
  certo(/fetch-depth: 0/.test(construir), 'construir: o checkout traz o histórico todo (a «Última atualização» das páginas legais sai dele — achado L6-11)');
  certo(!/actions\/checkout/.test(publicar) && !/\.github\//.test(publicar.replace(/^\s*#.*$/gm, '')), 'publicar: sem checkout, e não corre nenhum script do repositório');
  certo((YAML.match(/secrets\.CLOUDFLARE_API_TOKEN/g) || []).length === 1 && /secrets\.CLOUDFLARE_API_TOKEN/.test(publicar), 'o token só aparece no publicar');
  certo(!/actions\/checkout/.test(avisar) && /issues: write/.test(avisar) && !/secrets\./.test(avisar), 'avisar: sem checkout, só issues');
  const runs = ['Abrir e conferir o que vai ser publicado', 'Abrir, comentar ou fechar a issue «Publicação parada»'].map((n) => passoDoYaml(n));
  certo(runs.every((r) => !r.includes('${{')), 'nenhum ${{ }} dentro de um run: do publicar e do avisar (os valores entram por env:)');
  certo(/node \.github\/guardas\.mjs --relatorio-em/.test(passoDoYaml('Conferir o conteúdo')) && construir.indexOf('Conferir o conteúdo') < construir.indexOf('Preparar o que vai ser publicado'), 'a guarda corre antes de preparar a _site');
  certo(/guardas\.mjs --neutralizar/.test(ler('.github/preparar-site.sh')), 'e o preparar-site.sh neutraliza a cópia');

  secao('o pages.yml: o passo «Abrir e conferir o que vai ser publicado», tal como está escrito');
  const WJ = JSON.parse(ler('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
  const embrulhar = (montar, { comTar } = {}) => {
    const d = mkdtempSync(join(TMP, 'pub-'));
    const s = mkdtempSync(join(TMP, 'fonte-'));   // fora da pasta do job: lá só pode estar o site.tgz
    writeFileSync(join(s, 'index.html'), '<!doctype html>'); writeFileSync(join(s, '.assetsignore'), 'CNAME\n');
    mkdirSync(join(s, 'assets')); writeFileSync(join(s, 'assets', 'a.css'), 'a{}');
    if (montar) montar(s);
    if (comTar) comTar(d, s); else execFileSync('tar', ['-czf', join(d, 'site.tgz'), '-C', s, '.'], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, COPYFILE_DISABLE: '1' } });
    return d;
  };
  const abrir = (d, env = {}) => correrPasso('Abrir e conferir o que vai ser publicado', d, { ZONA_ID: '', ...env });
  {
    const d = embrulhar();
    const r = abrir(d);
    const w = r.status === 0 ? JSON.parse(readFileSync(join(d, 'wrangler.json'), 'utf8')) : null;
    certo(r.status === 0 && existsSync(join(d, '_site', '.assetsignore')), 'uma _site limpa passa, e o .assetsignore chega', r.out + r.err);
    const semZona = (x) => ({ ...x, routes: x.routes.map((ro) => ({ pattern: ro.pattern })) });
    certo(w && JSON.stringify(semZona(w)) === JSON.stringify(semZona(WJ)) && w.routes[0].zone_name === WJ.routes[0].zone_name, 'a config escrita no YAML diz o mesmo que o wrangler.jsonc (sem a variável, a zona vai pelo nome)');
    rmSync(d, { recursive: true, force: true });
    const d2 = embrulhar();
    const r2 = abrir(d2, { ZONA_ID: '0123456789abcdef0123456789abcdef' });
    certo(r2.status === 0 && JSON.parse(readFileSync(join(d2, 'wrangler.json'), 'utf8')).routes[0].zone_id === '0123456789abcdef0123456789abcdef', 'com CLOUDFLARE_ZONE_ID, a zona vai pelo id');
    rmSync(d2, { recursive: true, force: true });
    const d3 = embrulhar();
    certo(abrir(d3, { ZONA_ID: 'x", "main": "evil.js' }).status !== 0, 'um CLOUDFLARE_ZONE_ID que não é um id: recusa (não se injecta nada na config)');
    rmSync(d3, { recursive: true, force: true });
  }
  const pyTar = (membros) => (d, s) => {
    execFileSync(PY, ['-c', `
import tarfile, io, sys
t = tarfile.open(sys.argv[1], 'w:gz')
t.add(sys.argv[2], arcname='.')
for nome in sys.argv[3:]:
    i = tarfile.TarInfo(nome); dados = b'x'; i.size = len(dados); t.addfile(i, io.BytesIO(dados))
t.close()`, join(d, 'site.tgz'), s, ...membros]);
  };
  const RECUSAS = [
    ['uma ligação simbólica (ex.: para /proc/self/environ)', (s) => symlinkSync('/proc/self/environ', join(s, 'env.txt'))],
    ['uma ligação simbólica para uma pasta', (s) => symlinkSync('/etc', join(s, 'etc'))],
    ['um FIFO', (s) => execFileSync('mkfifo', [join(s, 'fifo')])],
    ['a pasta worker/', (s) => { mkdirSync(join(s, 'worker')); writeFileSync(join(s, 'worker', 'wrangler.toml'), ''); }],
    ['a pasta .github/', (s) => { mkdirSync(join(s, '.github')); writeFileSync(join(s, '.github', 'x'), ''); }],
    ['um .md', (s) => writeFileSync(join(s, 'assets', 'NOTAS.md'), '')],
    ['o .pages.yml', (s) => writeFileSync(join(s, '.pages.yml'), '')],
    ['o wrangler.jsonc', (s) => writeFileSync(join(s, 'wrangler.jsonc'), '{}')],
    ['a pasta scripts/', (s) => { mkdirSync(join(s, 'scripts')); writeFileSync(join(s, 'scripts', 'x'), ''); }],
    ['um .dev.vars', (s) => writeFileSync(join(s, '.dev.vars'), 'SEGREDO=1')],
    ['sem index.html', (s) => rmSync(join(s, 'index.html'))],
  ];
  for (const [desc, montar] of RECUSAS) {
    const d = embrulhar(montar);
    const r = abrir(d);
    certo(r.status !== 0 && !existsSync(join(d, 'wrangler.json')), `recusa ${desc}`, `saiu ${r.status}`);
    rmSync(d, { recursive: true, force: true });
  }
  {
    const d = embrulhar();
    writeFileSync(join(d, '.npmrc'), 'registry=https://mal.example/\n');
    const r = abrir(d);
    certo(r.status !== 0 && !existsSync(join(d, '_site')) && /mais do que o site\.tgz/.test(r.out + r.err), 'recusa um artefacto que traga mais do que o site.tgz (um .npmrc ao lado mudava o que o wrangler-action instala)', r.out + r.err);
    rmSync(d, { recursive: true, force: true });
  }
  for (const [desc, membros] of [['um membro «../fora.txt» no embrulho', ['../fora.txt']], ['um membro com caminho absoluto', ['/tmp/ap-guardas-absoluto.txt']], ['um membro «a/../../fora.txt»', ['a/../../fora.txt']]]) {
    const d = embrulhar(null, { comTar: pyTar(membros) });
    const r = abrir(d);
    certo(r.status !== 0 && /caminhos proibidos/.test(r.out + r.err) && !existsSync(join(d, '_site')) && !existsSync(join(d, '..', 'fora.txt')), `recusa ${desc}, antes de abrir`, r.out + r.err);
    rmSync(d, { recursive: true, force: true });
  }

  /* ================================================================== */
  secao('o pages.yml: o job «avisar», com um gh de faz-de-conta');
  const avisarEm = ({ construir: c = 'success', publicar: p = 'success', ensaio = '', abertas = [], relatorio = null, preparar = null, falha = '' }) => {
    const d = mkdtempSync(join(TMP, 'avisar-'));
    mkdirSync(join(d, 'bin'));
    writeFileSync(join(d, 'bin', 'gh'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${d}/gh.log"
if [ -n "$FALSO_FALHA" ] && [ "$1 $2" = "$FALSO_FALHA" ]; then echo "HTTP 502: Bad Gateway" >&2; exit 1; fi
case "$1 $2" in
  "issue list") printf '%s' "$FALSO_ABERTAS" ;;
  "issue create") echo "https://github.com/renatovalente5/ArmazemDosPneus/issues/42" ;;
esac
`, { mode: 0o755 });
    if (relatorio) { mkdirSync(join(d, 'relatorio')); writeFileSync(join(d, 'relatorio', 'relatorio.json'), JSON.stringify(relatorio)); }
    if (preparar !== null) { mkdirSync(join(d, 'preparar')); writeFileSync(join(d, 'preparar', 'preparar.txt'), preparar); }
    const r = correrPasso('Abrir, comentar ou fechar a issue «Publicação parada»', d, {
      PATH: `${join(d, 'bin')}:${process.env.PATH}`, GH_TOKEN: 'x', GH_REPO: 'renatovalente5/ArmazemDosPneus',
      CONSTRUIR: c, PUBLICAR: p, ENSAIO: ensaio, CORRIDA: 'https://github.com/renatovalente5/ArmazemDosPneus/actions/runs/1',
      COMMIT: 'abc123', QUEM: 'armazem-dos-pneus-painel[bot]', FALSO_ABERTAS: JSON.stringify(abertas), FALSO_FALHA: falha,
    });
    const log = existsSync(join(d, 'gh.log')) ? readFileSync(join(d, 'gh.log'), 'utf8').trim().split('\n') : [];
    const aviso = existsSync(join(d, 'aviso.md')) ? readFileSync(join(d, 'aviso.md'), 'utf8') : '';
    rmSync(d, { recursive: true, force: true });
    return { ...r, log, aviso, accoes: log.filter((l) => !l.startsWith('issue list')) };
  };
  const BOT = { login: 'app/github-actions', is_bot: true };
  const OUTRA = { number: 3, title: 'Publicação parada — ensaio do aviso', author: BOT };
  {
    const a = avisarEm({});
    certo(a.status === 0 && a.accoes.length === 0, 'tudo verde e nenhuma issue aberta: não faz nada', a.err + a.log.join('|'));
    const b = avisarEm({ construir: 'failure', publicar: 'skipped' });
    certo(b.status === 0 && b.accoes.length === 2 && /^issue create --title Publicação parada --body-file aviso\.md$/.test(b.accoes[0]) && /parou/.test(b.aviso) && /actions\/runs\/1/.test(b.aviso), 'a construção falhou: abre a issue, com a ligação para a corrida', b.err + b.accoes.join('|'));
    certo(b.accoes[1] === 'issue lock 42', '   e tranca-a: só quem tem acesso ao repositório comenta (achado L8-05)', b.accoes.join('|'));
    const c = avisarEm({ publicar: 'failure', abertas: [OUTRA, { number: 7, title: 'Publicação parada', author: BOT }] });
    certo(c.accoes.length === 1 && c.accoes[0] === 'issue comment 7 --body-file aviso.md', 'já há uma aberta (com o título exacto): comenta-a, e não confunde com a do ensaio', c.accoes.join('|'));
    const e = avisarEm({ abertas: [{ number: 7, title: 'Publicação parada', author: BOT }] });
    certo(e.accoes.length === 1 && /^issue close 7 --comment Voltou a publicar sem problemas \(commit abc123\)/.test(e.accoes[0]), 'voltou a publicar limpo: fecha-a', e.accoes.join('|'));
    const hostil = { versao: 1, problemas: [], neutralizados: [{ indice: 0, sku: 'x', nome: 'Jante ~~~~\n@renatovalente5 [clique](https://mal.example)', descricao: 'fora de venda', efeitos: ['fora_de_venda'], motivos: ['O peso está em falta.'] }] };
    const f = avisarEm({ relatorio: hostil });
    const linhas = f.aviso.split('\n');
    const dentro = linhas.slice(linhas.indexOf('~~~~') + 1, linhas.lastIndexOf('~~~~'));
    certo(f.accoes.length === 2 && /^issue create/.test(f.accoes[0]) && /1 produto\(s\) mudaram na loja/.test(f.aviso), 'publicou mas tirou um produto de venda: abre a issue', f.accoes.join('|'));
    certo(linhas.filter((l) => l.startsWith('~~~')).length === 2 && dentro.length === 1 && dentro[0].startsWith('- NA LOJA · Jante ~~~~ @renatovalente5'), 'um nome hostil fica dentro do bloco ~~~~, numa linha só (não fecha o bloco nem vira menção)', JSON.stringify(dentro));
    const g = avisarEm({ construir: 'failure', publicar: 'skipped', relatorio: { problemas: [{ classe: 'bloqueia', ecra: 'Loja online › Pagamentos', mensagem: 'O interruptor dos pagamentos online não está gravado.' }, { classe: 'avisa', ecra: 'X', mensagem: 'só aviso' }], neutralizados: [] } });
    certo(/- PÁRA · Loja online › Pagamentos — O interruptor/.test(g.aviso) && !/só aviso/.test(g.aviso), 'a guarda parou: a issue diz o quê e onde se corrige');
    /* Achado L8-03: a guarda passou e o injector parou depois. A issue dizia
       «O que a guarda encontrou» com o bloco vazio; agora diz o que parou. */
    const so = { versao: 1, bloqueia: 0, neutraliza: 0, avisa: 1, problemas: [{ classe: 'avisa', lembrete: true, ecra: 'Produtos › Michelin', mensagem: 'Pneu à espera da etiqueta.' }], neutralizados: [] };
    const prep = '--- contactos, textos e dados da empresa ---\n::error title=Serviços::Um texto tem um * sem par.\nERRO: Um texto tem um * sem par (o **negrito** e o *itálico* abrem e fecham). Corrige-se no painel, em «Serviços».\n';
    const i = avisarEm({ construir: 'failure', publicar: 'skipped', relatorio: so, preparar: prep });
    const li = i.aviso.split('\n');
    certo(i.status === 0 && /O que parou a publicação/.test(i.aviso) && li.includes('- ERRO: Um texto tem um * sem par (o **negrito** e o *itálico* abrem e fecham). Corrige-se no painel, em «Serviços».')
      && !/O que a guarda encontrou/.test(i.aviso) && !i.aviso.includes('~~~~\n~~~~'),
    'a guarda passou e o injector parou: a issue diz o ERRO (e o ecrã), sem o bloco vazio da guarda', i.aviso);
    const j = avisarEm({ relatorio: so, preparar: prep });
    certo(j.accoes.length === 0, '   numa corrida verde, a saída do «Preparar…» não abre issue nenhuma', j.accoes.join('|'));
    /* Achado L8-05: uma issue de um estranho com o mesmo título, num
       repositório público, era a que o bot comentava ou fechava. */
    const estranho = { number: 9, title: 'Publicação parada', author: { login: 'alguem-de-fora', is_bot: false } };
    const k = avisarEm({ abertas: [estranho] });
    certo(k.accoes.length === 0, 'uma issue «Publicação parada» aberta por outra pessoa: numa corrida verde, não a fecha', k.accoes.join('|'));
    const l = avisarEm({ construir: 'failure', publicar: 'skipped', abertas: [estranho] });
    certo(l.accoes.length === 2 && /^issue create/.test(l.accoes[0]) && !l.accoes.some((x) => /^issue comment 9/.test(x)), '   e numa falhada não a comenta: abre a do bot', l.accoes.join('|'));
    /* Achado L8-04: um 502 do gh marcava como falhada uma corrida que tinha
       publicado — e o painel dizia «a última publicação falhou». */
    const m = avisarEm({ abertas: [{ number: 7, title: 'Publicação parada', author: BOT }], falha: 'issue close' });
    certo(m.status === 0 && /^::warning title=Aviso da publicação::Não consegui fechar a issue/m.test(m.out), 'o gh falha ao fechar a issue (502): o passo sai com 0 e deixa um aviso na corrida', `${m.status} ${m.out.slice(-200)}`);
    const n2 = avisarEm({ construir: 'failure', publicar: 'skipped', falha: 'issue create' });
    certo(n2.status === 0 && /Não consegui abrir a issue/.test(n2.out), '   e ao abrir: idem', `${n2.status} ${n2.out.slice(-200)}`);
    certo(/name: Abrir, comentar ou fechar a issue «Publicação parada»\n\s+continue-on-error: true/.test(YAML), '   e o passo tem continue-on-error (um erro que escape não marca a corrida como falhada)');
    const h = avisarEm({ ensaio: 'true' });
    certo(h.accoes.length === 2 && /^issue create --title Publicação parada — ensaio do aviso --body-file ensaio\.md$/.test(h.accoes[0]) && /^issue close 42 --comment Ensaio terminado/.test(h.accoes[1]), 'ensaiar_aviso: abre e fecha uma issue de ensaio, à parte', h.accoes.join('|'));
  }

  /* ================================================================== */
  /* Fase G (out 2026): o Pages CMS saiu e o /admin, que era a página dele,
     reencaminha para o painel novo. Quem guardou o endereço antigo (ou tem
     uma página em cache com a «Gestão» antiga) vai lá parar. */
  secao('o /admin passa para o painel (fase G): o _redirects do .github/preparar-cloudflare.sh');
  {
    const PAINEL = 'https://backoffice.armazemdospneus.pt/';
    const cloudflare = (montar) => {
      const s = mkdtempSync(join(TMP, 'cf-'));
      for (const f of ['index.html', '404.html', 'loja.html']) writeFileSync(join(s, f), '<!doctype html>');
      for (const d of ['legal', 'pasta', 'assets/uploads/opt', 'assets/fonts']) mkdirSync(join(s, d), { recursive: true });
      writeFileSync(join(s, 'legal', 'termos.html'), '<!doctype html>'); writeFileSync(join(s, 'pasta', 'index.html'), '<!doctype html>');
      // As pastas que o _headers percorre existem sempre na _site verdadeira.
      writeFileSync(join(s, 'assets', 'uploads', 'opt', 'hero-0123456789ab.jpg'), 'x'); writeFileSync(join(s, 'assets', 'fonts', 'f.woff2'), 'x');
      if (montar) montar(s);
      const r = correr('bash', [join(RAIZ, '.github', 'preparar-cloudflare.sh'), s]);
      const ficheiro = join(s, '_redirects');
      const regras = existsSync(ficheiro) ? readFileSync(ficheiro, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')) : null;
      rmSync(s, { recursive: true, force: true });
      return { ...r, regras };
    };
    const a = cloudflare();
    const doAdmin = (a.regras || []).filter((l) => /^\/admin(\/|\s|$)/.test(l));
    certo(a.status === 0 && JSON.stringify(doAdmin) === JSON.stringify([`/admin ${PAINEL} 301`, `/admin/* ${PAINEL} 301`]),
      'o /admin e o /admin/* reencaminham (301) para o painel, e não há outra regra do /admin (nada de /admin/ → admin/index.html)', a.err + JSON.stringify(a.regras));
    certo(a.regras && a.regras.indexOf(`/admin ${PAINEL} 301`) === 2 && a.regras.indexOf(`/admin/* ${PAINEL} 301`) === 3,
      '   logo a seguir à raiz, antes das regras geradas das páginas', JSON.stringify(a.regras));
    certo(a.regras && a.regras.includes('/pasta/ /pasta/index.html 200') && a.regras.includes('/loja /loja.html 301') && a.regras.includes('/legal/termos /legal/termos.html 301'),
      '   e as regras geradas a partir das páginas continuam lá', JSON.stringify(a.regras));
    for (const [desc, montar] of [['uma pasta admin/', (s) => { mkdirSync(join(s, 'admin')); writeFileSync(join(s, 'admin', 'index.html'), '<!doctype html>'); }], ['uma admin.html', (s) => writeFileSync(join(s, 'admin.html'), '<!doctype html>')]]) {
      const r = cloudflare(montar);
      certo(r.status !== 0 && /nada lá seria servido/.test(r.err) && r.regras === null, `${desc} na _site: pára com a razão (nunca seria servida), antes de escrever o _redirects`, `saiu ${r.status}: ${r.err}`);
    }
  }

  /* ================================================================== */
  /* Dois editores sobre os mesmos ficheiros atropelam-se: o Pages CMS
     reescreve o JSON inteiro e apaga as chaves que não conhece. */
  secao('o Pages CMS saiu (fase G): o .pages.yml não volta');
  {
    certo(!existsSync(join(RAIZ, '.pages.yml')), 'o .pages.yml já não está no repositório');
    const t = mkdtempSync(join(TMP, 'pagescms-'));
    mkdirSync(join(t, '.github'));
    copyFileSync(join(RAIZ, '.github', 'preparar-site.sh'), join(t, '.github', 'preparar-site.sh'));
    writeFileSync(join(t, '.pages.yml'), 'content: []\n');
    const r = correr('bash', [join(t, '.github', 'preparar-site.sh'), join(t, '_site')]);
    certo(r.status !== 0 && /^ERRO: o \.pages\.yml voltou ao repositório/m.test(r.err) && !existsSync(join(t, '_site')),
      'um .pages.yml que volte: o preparar-site.sh pára logo, com a razão numa linha «ERRO:» (vai para a issue), sem criar a _site', `saiu ${r.status}: ${r.err}`);
    rmSync(t, { recursive: true, force: true });
  }

  /* ================================================================== */
  secao('de ponta a ponta: os passos do YAML sobre uma cópia do repositório, com um produto partido');
  {
    const py = PY;
    const temPillow = spawnSync(py, ['-c', 'import PIL'], { encoding: 'utf8' }).status === 0;
    certo(temPillow, `há um python com Pillow (${py}) — no Mac: PYTHON=<venv com Pillow> node .github/test-guardas.mjs`);
    if (temPillow) {
      const copia = join(TMP, 'repo-inteiro'); mkdirSync(copia);
      const ficheiros = execFileSync('git', ['-C', RAIZ, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
      for (const f of ficheiros) { mkdirSync(dirname(join(copia, f)), { recursive: true }); copyFileSync(join(RAIZ, f), join(copia, f)); }
      for (const f of ['.github/preparar-site.sh', '.github/preparar-cloudflare.sh']) execFileSync('chmod', ['+x', join(copia, f)]);
      const partido = clonar(HOJE.products); delete partido.products[JANTE].price_eur;
      writeFileSync(join(copia, 'data', 'products.json'), R.serializar(partido, ''));
      const rt = join(TMP, 'runner-temp'); mkdirSync(rt);
      const bin = join(TMP, 'bin'); mkdirSync(bin);
      writeFileSync(join(bin, 'python3'), `#!/bin/sh\nexec "${py}" "$@"\n`, { mode: 0o755 });
      const env = { RUNNER_TEMP: rt, PATH: `${bin}:${process.env.PATH}` };
      const passos = ['Conferir o conteúdo', 'Preparar o que vai ser publicado', 'Preparar para a Cloudflare', 'Embrulhar'];
      const saidas = passos.map((n) => [n, correrPasso(n, copia, env)]);
      const falhados = saidas.filter(([, r]) => r.status !== 0);
      certo(falhados.length === 0, 'os quatro passos do construir correm, e passam com um produto partido', falhados.map(([n, r]) => `${n}: ${r.err.slice(-300)}`).join(' | '));
      const pub = join(TMP, 'publicar'); mkdirSync(pub); copyFileSync(join(rt, 'site.tgz'), join(pub, 'site.tgz'));
      const ab = abrir(pub);
      certo(ab.status === 0, 'e o publicar aceita o embrulho', ab.out.slice(-300) + ab.err);
      if (ab.status === 0) {
        const publicado = JSON.parse(readFileSync(join(pub, '_site', 'data', 'products.json'), 'utf8'));
        const esperado = clonar(partido); esperado.products[JANTE].available = false;
        certo(readFileSync(join(pub, '_site', 'data', 'products.json'), 'utf8') === R.serializar(esperado, ''), 'o products.json publicado tem a jante sem preço fora de venda, e o resto tal e qual');
        certo(publicado.products.filter((p) => p.available).length === 6, 'as outras 6 peças continuam à venda');
        certo(readFileSync(join(copia, 'data', 'products.json'), 'utf8') === R.serializar(partido, ''), 'o ficheiro do repositório ficou como estava');
        const rel = JSON.parse(readFileSync(join(rt, 'relatorio.json'), 'utf8'));
        certo(rel.neutralizados.length === 1 && rel.neutralizados[0].sku === 'jante-liga-leve-16-5x112-et45', 'o relatório (que vai para a issue) diz qual');
        certo(!existsSync(join(pub, '_site', 'relatorio.json')) && !existsSync(join(pub, '_site', '.github')), 'o relatório não foi publicado');
        const redirects = readFileSync(join(pub, '_site', '_redirects'), 'utf8').split('\n');
        certo(!existsSync(join(pub, '_site', 'admin')) && redirects.includes('/admin https://backoffice.armazemdospneus.pt/ 301') && redirects.includes('/admin/* https://backoffice.armazemdospneus.pt/ 301'),
          'a _site publicada não tem a página do Pages CMS (admin/), e o /admin reencaminha para o painel');
      }

      /* Achado L8-03: a guarda passa e a publicação pára depois (aqui, a
         fotografia do topo existe mas não se abre). A mensagem tem de chegar
         ao painel (::error) e à issue (o ficheiro que o job «avisar» lê). */
      const copia2 = join(TMP, 'repo-foto'); mkdirSync(copia2);
      for (const f of ficheiros) { mkdirSync(dirname(join(copia2, f)), { recursive: true }); copyFileSync(join(RAIZ, f), join(copia2, f)); }
      for (const f of ['.github/preparar-site.sh', '.github/preparar-cloudflare.sh']) execFileSync('chmod', ['+x', join(copia2, f)]);
      writeFileSync(join(copia2, HOJE.content.hero.image.replace(/^\/+/, '')), 'isto não é uma fotografia');
      const rt2 = join(TMP, 'runner-temp-2'); mkdirSync(rt2);
      const env2 = { RUNNER_TEMP: rt2, PATH: `${bin}:${process.env.PATH}` };
      const conf = correrPasso('Conferir o conteúdo', copia2, env2);
      const prepara = correrPasso('Preparar o que vai ser publicado', copia2, env2);
      const ficheiroPrep = join(rt2, 'preparar.txt');
      const textoPrep = existsSync(ficheiroPrep) ? readFileSync(ficheiroPrep, 'utf8') : '';
      certo(conf.status === 0 && prepara.status !== 0, 'uma fotografia estragada: a guarda passa e o «Preparar…» pára (o pipe não esconde a falha)', `${conf.status}/${prepara.status}`);
      certo(/^::error title=Fotografias do site::A fotografia do topo .* não se consegue abrir/m.test(prepara.out) && /^ERRO: A fotografia do topo/m.test(textoPrep),
        '   a mensagem sai como ::error (para o painel) e fica no ficheiro que vai para a issue', prepara.out.slice(-400));
    }
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
