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
 *     ficheiro byte a byte;
 *   · re-jogar os commits de data/ desde o e37161a: nenhum teria parado a
 *     publicação (os de antes listam-se, com a razão);
 *   · o settings.json regravado pelo Pages CMS (sem as chaves vazias) passa;
 *   · cada regra com um caso e a classe certa — um produto partido nunca dá
 *     exit 1, e sai de venda na cópia publicada sem mexer no ficheiro;
 *   · 30 problemas → 9 anotações + «e mais 21», e os 30 no resumo;
 *   · o varrimento: apagar cada chave, uma a uma (memória
 *     testar-o-caminho-do-cliente), mudar cada categoria, ligar e desligar
 *     cada produto;
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
import * as R from './regras.mjs';
import * as G from './guardas.mjs';

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

const TEXTO = { products: ler('data/products.json'), settings: ler('data/settings.json'), content: ler('data/content.json') };
const HOJE = { products: JSON.parse(TEXTO.products), settings: JSON.parse(TEXTO.settings), content: JSON.parse(TEXTO.content) };
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

const dadosDeHoje = () => ({ products: clonar(HOJE.products), settings: clonar(HOJE.settings), content: clonar(HOJE.content) });
const tem = (lista, classe, chave) => lista.some((p) => p.classe === classe && (chave instanceof RegExp ? chave.test(p.chave) : p.chave === chave));
const deClasse = (lista, classe) => lista.filter((p) => p.classe === classe);
const indicePorSku = (sku) => HOJE.products.products.findIndex((p) => p.sku === sku);
const JANTE = indicePorSku('jante-liga-leve-16-5x112-et45');   // à venda hoje
const MICHELIN = indicePorSku('michelin-primacy-4');           // pneu novo, fora de venda
const SEMINOVO = indicePorSku('pneu-seminovo-continental-205-55-r16');
const TESTE = indicePorSku('teste-pagamento');

/* Um repositório de ensaio mínimo: data/, as fotografias (vazias: a guarda só
   quer saber se existem) e o worker/ (para os avisos). */
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
  mkdirSync(join(dir, 'worker', 'src'), { recursive: true });
  copyFileSync(join(RAIZ, 'worker', 'wrangler.toml'), join(dir, 'worker', 'wrangler.toml'));
  for (const f of readdirSync(join(RAIZ, 'worker', 'src'))) copyFileSync(join(RAIZ, 'worker', 'src', f), join(dir, 'worker', 'src', f));
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
  certo(R.OBRIGATORIOS.length === 0, 'site.json e empresa.json ainda opcionais (o A2 passa-os a obrigatórios)');

  /* ================================================================== */
  secao('os dados de hoje');
  const hoje = R.problemas(TEXTO, { imagemExiste: existeHoje });
  certo(deClasse(hoje, 'bloqueia').length === 0, 'nada que pare', deClasse(hoje, 'bloqueia').map((p) => p.chave).join(', '));
  certo(deClasse(hoje, 'neutraliza').length === 0, 'nenhum produto a neutralizar', deClasse(hoje, 'neutraliza').map((p) => p.chave).join(', '));
  const nHoje = R.neutralizar(TEXTO, hoje);
  certo(!nHoje.mudou && nHoje.efeitos.length === 0, 'neutralizar() não muda nada');
  certo(R.serializar(nHoje.products, R.terminacaoDe(TEXTO.products)) === TEXTO.products, 'e a cópia serializada é o ficheiro, byte a byte (sem \\n no fim, como o Pages CMS grava)');
  certo(R.serializar(HOJE.settings, R.terminacaoDe(TEXTO.settings)) === TEXTO.settings && R.serializar(HOJE.content, R.terminacaoDe(TEXTO.content)) === TEXTO.content, 'serializar() reproduz settings.json e content.json byte a byte');
  certo(hoje.filter((p) => p.lembrete && /:a-espera$/.test(p.chave)).length === 13, 'lembrete: 13 pneus com preço à vista à espera da etiqueta (11 novos, 2 seminovos)');
  certo(tem(hoje, 'avisa', 'produto:teste-pagamento:escondido-a-venda'), 'lembrete: o artigo de teste está escondido mas à venda');
  const real = correr('node', [GUARDA, '--relatorio-em', join(TMP, 'hoje.json')]);
  const relHoje = JSON.parse(readFileSync(join(TMP, 'hoje.json'), 'utf8'));
  certo(real.status === 0, 'a guarda verdadeira, sobre o repositório, sai com 0', real.err);
  certo(relHoje.bloqueia === 0 && relHoje.neutralizados.length === 0 && relHoje.problemas.length === relHoje.avisa && relHoje.avisa > 0, `o relatório diz 0 que param, 0 neutralizados e ${relHoje.avisa} avisos (e lê-se)`);
  certo(G.paginasHtml(RAIZ).length >= 9, `lê as páginas do site (${G.paginasHtml(RAIZ).length})`);
  certo(G.paginasHtml(RAIZ).every((p) => G.problemasDoHtml(p, ler(p), { exigirMetas: false }).length === 0), 'as páginas de hoje não têm marcadores partidos');
  certo(G.avisosDoWorker(TEXTO, { wranglerToml: ler('worker/wrangler.toml'), fontes: '' }).length === 0, 'os prazos de hoje batem com os DELIVERY_* do Worker dos pagamentos');

  /* ================================================================== */
  secao('re-jogar os commits de data/');
  const git = (...a) => execFileSync('git', ['-C', RAIZ, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  certo(git('rev-parse', '--is-shallow-repository').trim() === 'false', 'o histórico está inteiro (um clone raso não prova nada)');
  const commits = git('log', '--format=%H %h', '--reverse', '--', 'data/').trim().split('\n').map((l) => l.split(' '));
  const desde = commits.findIndex(([, h]) => h === 'e37161a');
  certo(desde >= 0, 'o e37161a (7 ago, quando entrou o hidden) está no histórico de data/');
  const noCommit = (c) => {
    const dados = {};
    for (const [qual, rel] of Object.entries(R.FICHEIROS)) {
      try { dados[qual] = execFileSync('git', ['-C', RAIZ, 'show', `${c}:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { dados[qual] = undefined; }
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
  secao('o Pages CMS a regravar os ficheiros');
  /* O Pages CMS omite os campos vazios ao gravar (memória pages-cms-apaga-chaves). */
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
    ['«portes combinados» em falta', (d) => { delete d.settings.shipping.quote_later; }, 'avisa', 'settings:shipping.quote_later'],
    ['«portes combinados» como texto', (d) => { d.settings.shipping.quote_later = 'sim'; }, 'bloqueia', 'settings:shipping.quote_later'],
    ['portes cobrados e tabela vazia', (d) => { d.settings.shipping.quote_later = false; d.settings.shipping.tiers = []; }, 'bloqueia', 'settings:shipping.tiers'],
    ['portes cobrados e pesos a descer', (d) => { d.settings.shipping.quote_later = false; d.settings.shipping.tiers[1].max_kg = 3; }, 'bloqueia', 'settings:shipping.tiers'],
    ['portes cobrados e preço zero', (d) => { d.settings.shipping.quote_later = false; d.settings.shipping.tiers[0].price = 0; }, 'bloqueia', 'settings:shipping.tiers'],
    ['portes cobrados e preço com 3 casas', (d) => { d.settings.shipping.quote_later = false; d.settings.shipping.tiers[0].price = 4.999; }, 'bloqueia', 'settings:shipping.tiers'],
    ['portes cobrados e 11 escalões', (d) => { d.settings.shipping.quote_later = false; d.settings.shipping.tiers = Array.from({ length: 11 }, (_, i) => ({ max_kg: i + 1, price: 5 })); }, 'bloqueia', 'settings:shipping.tiers'],
    ['portes combinados e tabela partida', (d) => { d.settings.shipping.tiers[0].price = 0; }, 'avisa', 'settings:shipping.tiers'],
    ['prazos em falta', (d) => { delete d.settings.delivery; }, 'bloqueia', 'settings:delivery'],
    ['prazo máximo de 31 dias', (d) => { d.settings.delivery.max_days = 31; }, 'bloqueia', 'settings:delivery.max_days'],
    ['estimativa ao contrário', (d) => { d.settings.delivery.estimate_min_days = 6; }, 'bloqueia', 'settings:delivery.estimativa'],
    ['estimativa acima do prazo máximo', (d) => { d.settings.delivery.max_days = 4; }, 'bloqueia', 'settings:delivery.limite'],
    ['prazo com casas decimais', (d) => { d.settings.delivery.estimate_min_days = 2.5; }, 'bloqueia', 'settings:delivery.estimate_min_days'],
    ['custo de devolução negativo', (d) => { d.settings.returns.return_cost_eur = -1; }, 'bloqueia', 'settings:returns.return_cost_eur'],
    ['custo de devolução como texto', (d) => { d.settings.returns.return_cost_eur = '5'; }, 'bloqueia', 'settings:returns.return_cost_eur'],
    ['preço da montagem negativo', (d) => { d.settings.mounting.price_eur = -1; }, 'avisa', 'settings:mounting.price_eur'],
    ['texto dos pagamentos comprido', (d) => { d.settings.payment.note = 'x'.repeat(301); }, 'avisa', 'settings:payment.note'],
    ['fotografia do topo em falta', (d) => { delete d.content.hero.image; }, 'bloqueia', 'content:hero.image'],
    ['fotografia do Sobre apagada', (d) => { d.content.sobre.image = '/assets/uploads/nao-existe.jpg'; }, 'bloqueia', 'content:sobre.image'],
    ['fotografia do topo fora da pasta', (d) => { d.content.hero.image = '/index.html'; }, 'bloqueia', 'content:hero.image'],
  ];
  const SEM_PROBLEMA = [
    ['pneu novo à venda com a etiqueta completa', prod(MICHELIN, (p) => { Object.assign(p, { available: true, label_noise_class: 'B', eprel_id: '123456' }); })],
    ['pneu seminovo à venda com os dados todos', prod(SEMINOVO, (p) => { Object.assign(p, { available: true, dot: '3221', tread_mm: 6, warranty_months: 12 }); })],
    ['EPREL escrito como número', prod(MICHELIN, (p) => { Object.assign(p, { available: true, label_noise_class: 'B', eprel_id: 123456 }); })],
    ['fotografia que existe', prod(JANTE, (p) => { p.image = '/assets/uploads/prod-jante-17.jpg'; })],
    ['custo de devolução de 6,50 €', (d) => { d.settings.returns.return_cost_eur = 6.5; }],
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
  certo(comA2(undefined, undefined).length === 0, 'ausentes, e ainda opcionais: sem regras');
  certo(tem(R.problemas({ ...TEXTO }, { obrigatorios: ['site', 'empresa'] }), 'bloqueia', 'site:ausente') && tem(R.problemas({ ...TEXTO }, { obrigatorios: ['site', 'empresa'] }), 'bloqueia', 'empresa:ausente'), 'obrigatórios (A2) e ausentes: param');
  const CASOS_A2 = [
    ['site ilegível', (s) => '{', null, 'bloqueia', 'site:ilegivel'],
    ['sem email', (s) => { delete s.contactos.email; }, null, 'bloqueia', 'site:contactos.email'],
    ['email mal escrito', (s) => { s.contactos.email = 'loja@'; }, null, 'bloqueia', 'site:contactos.email'],
    ['sem telefone nem WhatsApp', (s) => { delete s.contactos.telefone; delete s.contactos.telefone2; delete s.contactos.whatsapp; }, null, 'bloqueia', 'site:contactos.telefone'],
    ['telefone com 8 algarismos', (s) => { s.contactos.telefone = '93 521 885'; }, null, 'bloqueia', 'site:contactos.telefone'],
    ['WhatsApp com +', (s) => { s.contactos.whatsapp = '+351935218857'; }, null, 'bloqueia', 'site:contactos.whatsapp'],
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
    ['título de serviço comprido', (s) => { s.servicos[0].titulo = 'x'.repeat(61); }, null, 'avisa', 'site:servicos.montagem.titulo:tamanho'],
    ['lista das marcas vazia', (s) => { s.marcas = []; }, null, 'avisa', 'site:marcas:vazia'],
    ['empresa ilegível', null, () => '{', 'bloqueia', 'empresa:ilegivel'],
    ['NIF com o controlo errado', null, (e) => { e.nif = '516324951'; }, 'bloqueia', 'empresa:nif'],
    ['NIF com 8 algarismos', null, (e) => { e.nif = '51632495'; }, 'bloqueia', 'empresa:nif'],
    ['NIF vazio', null, (e) => { e.nif = ''; }, 'bloqueia', 'empresa:nif'],
    ['denominação vazia', null, (e) => { e.denominacao = ' '; }, 'bloqueia', 'empresa:denominacao'],
    ['código postal sem hífen', null, (e) => { e.morada.cp = '3885183'; }, 'bloqueia', 'empresa:morada.cp'],
    ['sem rua', null, (e) => { delete e.morada.rua; }, 'bloqueia', 'empresa:morada.rua'],
    ['RAL sem https', null, (e) => { e.ral.url = 'http://www.cniacc.pt'; }, 'bloqueia', 'empresa:ral.url'],
    ['sem Livro de Reclamações', null, (e) => { delete e.livro_reclamacoes; }, 'bloqueia', 'empresa:livro_reclamacoes'],
    ['capital social como texto', null, (e) => { e.capital_social = '5000'; }, 'bloqueia', 'empresa:capital_social'],
    ['coordenadas partidas', null, (e) => { e.geo = { lat: 'norte' }; }, 'avisa', 'empresa:geo'],
    ['mapa sem https', null, (e) => { e.mapa = 'maps.app.goo.gl/x'; }, 'avisa', 'empresa:mapa'],
    ['sem concelho', null, (e) => { delete e.morada.concelho; }, 'avisa', 'empresa:morada.concelho'],
  ];
  for (const [desc, mSite, mEmpresa, classe, chave] of CASOS_A2) {
    let s = clonar(SITE_OK); let e = clonar(EMPRESA_OK);
    if (mSite) { const r = mSite(s); if (typeof r === 'string') s = r; }
    if (mEmpresa) { const r = mEmpresa(e); if (typeof r === 'string') e = r; }
    const lista = comA2(s, e);
    certo(tem(lista, classe, chave), `${desc} → ${classe}`, lista.map((p) => `${p.classe} ${p.chave}`).join(', ') || 'nenhum');
  }
  const SEM_PROBLEMA_A2 = [
    ['só WhatsApp (sem telefone, sem nota da chamada)', (s) => { delete s.contactos.telefone; delete s.contactos.telefone2; delete s.contactos.nota_chamada; }, null],
    ['domingo fechado e sexta com almoço', () => {}, null],
    ['capital social de 5000 € e conservatória', null, (e) => { e.capital_social = 5000; e.conservatoria = 'Conservatória do Registo Comercial de Ovar'; }],
    ['sem mapa nem coordenadas', null, (e) => { delete e.mapa; delete e.geo; }],
  ];
  for (const [desc, mSite, mEmpresa] of SEM_PROBLEMA_A2) {
    const s = clonar(SITE_OK); const e = clonar(EMPRESA_OK);
    if (mSite) mSite(s); if (mEmpresa) mEmpresa(e);
    const lista = comA2(s, e);
    certo(lista.length === 0, `${desc} → sem problema`, lista.map((p) => `${p.classe} ${p.chave}`).join(', '));
  }
  certo(R.nifValido('516324950') && R.nifValido(516324950) && !R.nifValido('516324951') && !R.nifValido('abc') && R.nifValido('000000000'), 'nifValido(): o NIF da loja passa, um algarismo trocado não (e o 000000000 de espera passa: presença, não verdade)');

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
  varrer('site.json', SITE_OK, (s) => ({ ...TEXTO, site: s, empresa: EMPRESA_OK }), (c) => {
    // Um telefone sem o outro, ou só o WhatsApp, continua a ser um contacto directo.
    if (/^(contactos\.(telefone2|facebook|telefone|whatsapp)|horario\.nota)$/.test(c)) return null;
    return 'bloqueia';
  });
  varrer('empresa.json', EMPRESA_OK, (e) => ({ ...TEXTO, site: SITE_OK, empresa: e }), (c) => {
    if (/^(capital_social|conservatoria|geo|mapa)$/.test(c)) return null;
    if (/^(morada\.(concelho|distrito)|geo\.(lat|lng))$/.test(c)) return 'avisa';
    return 'bloqueia';
  });

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
  certo(G.problemasDoHtml('admin/index.html', '<head></head>', { exigirMetas: true }).length === 0, 'a página do Pages CMS não precisa de metas');

  secao('o que o Worker dos pagamentos ainda tem escrito');
  const toml = ler('worker/wrangler.toml');
  const fontesW = readdirSync(join(RAIZ, 'worker', 'src')).map((f) => readFileSync(join(RAIZ, 'worker', 'src', f), 'utf8')).join('\n');
  const aw = (dados, t = toml, f = fontesW) => G.avisosDoWorker(dados, { wranglerToml: t, fontes: f });
  const prazos = dadosDeHoje(); prazos.settings.delivery.max_days = 20;
  certo(aw(prazos).length === 1 && aw(prazos)[0].classe === 'avisa' && /30 dias/.test(aw(prazos)[0].mensagem), 'prazo mudado no painel: AVISA (não pára) e diz o que os emails ainda dizem');
  certo(aw(prazos, toml.replace(/^DELIVERY_.*$/gm, '')).length === 0, 'sem DELIVERY_* no wrangler.toml (fase W publicada): nada a comparar');
  const dev = dadosDeHoje(); dev.settings.returns.return_cost_eur = 6.5;
  certo(aw(dev).some((p) => p.chave === 'worker:devolucao'), 'devolução a cargo do cliente e os emails a dizer que a loja paga: avisa');
  certo(aw({ ...TEXTO, site: SITE_OK, empresa: EMPRESA_OK }).length === 1 && aw({ ...TEXTO, site: SITE_OK, empresa: EMPRESA_OK })[0].chave === 'worker:email', 'site.json e empresa.json de hoje: só o email de exemplo difere do STORE_EMAIL');
  const outro = clonar(SITE_OK); outro.contactos.telefone = '912 345 678';
  certo(aw({ ...TEXTO, site: outro }).some((p) => p.chave === 'worker:telefone' && /935 218 857/.test(p.mensagem)), 'telefone mudado: avisa com o número antigo');
  const outraE = clonar(EMPRESA_OK); outraE.morada.rua = 'Rua Nova, 1'; outraE.nif = '500000000';
  certo(aw({ ...TEXTO, empresa: outraE }).map((p) => p.chave).sort().join() === 'worker:morada,worker:nif', 'NIF e morada mudados: avisa');
  {
    const dir = repoDeEnsaio(prazos);
    const r = guardaEm(dir);
    certo(r.status === 0 && r.relatorio.problemas.some((p) => p.chave === 'worker:delivery') && /::warning[^\n]*Prazos/.test(r.out), 'a guarda verdadeira avisa e sai com 0 (e o aviso não fica tapado pelos lembretes)');
    rmSync(dir, { recursive: true, force: true });
  }

  /* ================================================================== */
  secao('o pages.yml: quem tem o quê');
  const construir = jobDoYaml('construir'); const publicar = jobDoYaml('publicar'); const avisar = jobDoYaml('avisar');
  certo(!/secrets\./.test(construir) && /persist-credentials: false/.test(construir), 'construir: sem segredos, e o checkout não deixa credenciais');
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
  const avisarEm = ({ construir: c = 'success', publicar: p = 'success', ensaio = '', abertas = [], relatorio = null }) => {
    const d = mkdtempSync(join(TMP, 'avisar-'));
    mkdirSync(join(d, 'bin'));
    writeFileSync(join(d, 'bin', 'gh'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${d}/gh.log"
case "$1 $2" in
  "issue list") printf '%s' "$FALSO_ABERTAS" ;;
  "issue create") echo "https://github.com/renatovalente5/ArmazemDosPneus/issues/42" ;;
esac
`, { mode: 0o755 });
    if (relatorio) { mkdirSync(join(d, 'relatorio')); writeFileSync(join(d, 'relatorio', 'relatorio.json'), JSON.stringify(relatorio)); }
    const r = correrPasso('Abrir, comentar ou fechar a issue «Publicação parada»', d, {
      PATH: `${join(d, 'bin')}:${process.env.PATH}`, GH_TOKEN: 'x', GH_REPO: 'renatovalente5/ArmazemDosPneus',
      CONSTRUIR: c, PUBLICAR: p, ENSAIO: ensaio, CORRIDA: 'https://github.com/renatovalente5/ArmazemDosPneus/actions/runs/1',
      COMMIT: 'abc123', QUEM: 'pages-cms[bot]', FALSO_ABERTAS: JSON.stringify(abertas),
    });
    const log = existsSync(join(d, 'gh.log')) ? readFileSync(join(d, 'gh.log'), 'utf8').trim().split('\n') : [];
    const aviso = existsSync(join(d, 'aviso.md')) ? readFileSync(join(d, 'aviso.md'), 'utf8') : '';
    rmSync(d, { recursive: true, force: true });
    return { ...r, log, aviso, accoes: log.filter((l) => !l.startsWith('issue list')) };
  };
  const OUTRA = { number: 3, title: 'Publicação parada — ensaio do aviso' };
  {
    const a = avisarEm({});
    certo(a.status === 0 && a.accoes.length === 0, 'tudo verde e nenhuma issue aberta: não faz nada', a.err + a.log.join('|'));
    const b = avisarEm({ construir: 'failure', publicar: 'skipped' });
    certo(b.status === 0 && b.accoes.length === 1 && /^issue create --title Publicação parada --body-file aviso\.md$/.test(b.accoes[0]) && /parou/.test(b.aviso) && /actions\/runs\/1/.test(b.aviso), 'a construção falhou: abre a issue, com a ligação para a corrida', b.err + b.accoes.join('|'));
    const c = avisarEm({ publicar: 'failure', abertas: [OUTRA, { number: 7, title: 'Publicação parada' }] });
    certo(c.accoes.length === 1 && c.accoes[0] === 'issue comment 7 --body-file aviso.md', 'já há uma aberta (com o título exacto): comenta-a, e não confunde com a do ensaio', c.accoes.join('|'));
    const e = avisarEm({ abertas: [{ number: 7, title: 'Publicação parada' }] });
    certo(e.accoes.length === 1 && /^issue close 7 --comment Voltou a publicar sem problemas \(commit abc123\)/.test(e.accoes[0]), 'voltou a publicar limpo: fecha-a', e.accoes.join('|'));
    const hostil = { versao: 1, problemas: [], neutralizados: [{ indice: 0, sku: 'x', nome: 'Jante ~~~~\n@renatovalente5 [clique](https://mal.example)', descricao: 'fora de venda', efeitos: ['fora_de_venda'], motivos: ['O peso está em falta.'] }] };
    const f = avisarEm({ relatorio: hostil });
    const linhas = f.aviso.split('\n');
    const dentro = linhas.slice(linhas.indexOf('~~~~') + 1, linhas.lastIndexOf('~~~~'));
    certo(f.accoes.length === 1 && /^issue create/.test(f.accoes[0]) && /1 produto\(s\) mudaram na loja/.test(f.aviso), 'publicou mas tirou um produto de venda: abre a issue', f.accoes.join('|'));
    certo(linhas.filter((l) => l.startsWith('~~~')).length === 2 && dentro.length === 1 && dentro[0].startsWith('- NA LOJA · Jante ~~~~ @renatovalente5'), 'um nome hostil fica dentro do bloco ~~~~, numa linha só (não fecha o bloco nem vira menção)', JSON.stringify(dentro));
    const g = avisarEm({ construir: 'failure', publicar: 'skipped', relatorio: { problemas: [{ classe: 'bloqueia', ecra: 'Loja online › Pagamentos', mensagem: 'O interruptor dos pagamentos online não está gravado.' }, { classe: 'avisa', ecra: 'X', mensagem: 'só aviso' }], neutralizados: [] } });
    certo(/- PÁRA · Loja online › Pagamentos — O interruptor/.test(g.aviso) && !/só aviso/.test(g.aviso), 'a guarda parou: a issue diz o quê e onde se corrige');
    const h = avisarEm({ ensaio: 'true' });
    certo(h.accoes.length === 2 && /^issue create --title Publicação parada — ensaio do aviso --body-file ensaio\.md$/.test(h.accoes[0]) && /^issue close 42 --comment Ensaio terminado/.test(h.accoes[1]), 'ensaiar_aviso: abre e fecha uma issue de ensaio, à parte', h.accoes.join('|'));
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
      }
    }
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
