#!/usr/bin/env node
/* A GUARDA DO CONTEÚDO, NO CI (job «construir», que não tem segredos).
 *
 * Lê os JSON de data/ e corre as regras de .github/regras.mjs — as MESMAS que o
 * painel mostra por baixo dos campos e que o Worker do painel confere ao
 * gravar. Acrescenta o que só o repositório tem: os marcadores das páginas
 * (fase A2) e o que o Worker dos pagamentos tem escrito (prazos, contactos,
 * morada), para avisar quando o site e os emails das encomendas deixaram de
 * dizer o mesmo.
 *
 * O PRINCÍPIO: um problema de um produto nunca pára a publicação. O
 * interruptor dos pagamentos, o stock a 0 de uma peça vendida e as correcções
 * de preço têm de passar sempre. Só pára o que não se pode pôr num estado
 * seguro sem inventar um valor (classe «bloqueia»).
 *
 *   node .github/guardas.mjs [--raiz <pasta>] [--relatorio-em <ficheiro>]
 *       Sai com 1 só se houver um «bloqueia». No máximo 9 ::error e 9
 *       ::warning (o GitHub guarda 10 de cada por passo e 50 por job), mais
 *       «e mais N»: uma lista cortada não pode passar por completa. A lista
 *       INTEIRA vai para o resumo da corrida ($GITHUB_STEP_SUMMARY) e para o
 *       relatório (que o job «avisar» põe na issue).
 *
 *   node .github/guardas.mjs --neutralizar <_site>
 *       Escreve <_site>/data/products.json — a cópia que o site e o Worker dos
 *       pagamentos lêem — com os produtos partidos fora de venda. SÓ quando
 *       há alguma coisa a neutralizar: senão a _site fica byte a byte como
 *       estava. Chamado pelo .github/preparar-site.sh.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FICHEIROS, OBRIGATORIOS, problemas, neutralizar, serializar, terminacaoDe } from './regras.mjs';

const RAIZ_DO_REPOSITORIO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_ANOTACOES = 9;

/* ------------------------------------------------------------------ */
/* Os marcadores das páginas (fase A2, §5.2 do plano)                  */
/* ------------------------------------------------------------------ */

/* A lista fechada do .github/injetar-conteudo.py (A2). Um nome que não esteja
   aqui, ou um marcador aberto sem fecho, pára a publicação: o injector deixava
   o valor de reserva, ou comia o resto da página. */
export const MARCADORES = [
  'telefone', 'telefone-2', 'telefones', 'whatsapp', 'email', 'nota-chamada',
  'morada-rua', 'morada-cp-localidade', 'morada-linha', 'nif', 'denominacao', 'identificacao',
  'horario', 'servicos', 'servicos-frase', 'marcas', 'marcas-chip',
  'topo-sobretitulo', 'topo-titulo', 'topo-frase', 'topo-destaques',
  'sobre-titulo', 'sobre-texto', 'sobre-pontos', 'contactos-frase', 'rodape-frase',
  'portes', 'ral',
  // O dono muda os prazos e o custo de devolução: os Termos acompanham-nos.
  'prazo-entrega', 'prazo-maximo', 'devolucao',
];
export const ATRIBUTOS = [
  'tel', 'tel-2', 'whatsapp', 'whatsapp-orcamento', 'whatsapp-orcamento-servico', 'mailto',
  'facebook', 'mapa-embed', 'mapa-link', 'ral-url', 'livro-reclamacoes',
];
/* As metas que o JS lê (catalog.js, main.js, checkout.js, obrigado.js). Só se
   exigem quando o site.json for obrigatório (OBRIGATORIOS, no A2), e não na
   página do Pages CMS (admin/), que sai na fase G. */
export const METAS = ['ap:whatsapp', 'ap:telefone'];
const SEM_METAS = /^admin\//;

function atributosDaTag(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  }
  return out;
}

export function problemasDoHtml(caminho, html, { exigirMetas = false } = {}) {
  const out = [];
  const ecra = 'Publicação';
  const bloqueia = (chave, mensagem) => out.push({ classe: 'bloqueia', chave: `html:${caminho}:${chave}`, ficheiro: caminho, ecra, mensagem: `${caminho}: ${mensagem} Só o Renato o pode corrigir.` });
  const linhaDe = (i) => html.slice(0, i).split('\n').length;

  const pilha = [];
  for (const m of html.matchAll(/<!--\s*(\/?)ap:([^\s>]*?)(\s[^>]*?)?\s*-->/g)) {
    const [, fecho, nome, resto = ''] = m;
    const linha = linhaDe(m.index);
    if (!MARCADORES.includes(nome)) { bloqueia(`desconhecido:${linha}`, `o marcador «${nome}» (linha ${linha}) não existe.`); continue; }
    if (fecho) {
      const topo = pilha.pop();
      if (!topo || topo.nome !== nome) {
        bloqueia(`fecho:${linha}`, `o marcador «${nome}» fecha na linha ${linha} sem ter aberto${topo ? ` (estava aberto «${topo.nome}», da linha ${topo.linha})` : ''}.`);
        if (topo) pilha.push(topo);
      }
    } else if (/^\s*senao\s*$/.test(resto)) {
      const topo = pilha[pilha.length - 1];
      if (!topo || topo.nome !== nome || !topo.variante || topo.senao) bloqueia(`senao:${linha}`, `o «senão» de «${nome}» (linha ${linha}) está fora de sítio.`);
      else topo.senao = true;
    } else {
      pilha.push({ nome, linha, variante: /\bse=/.test(resto), senao: false });
    }
  }
  for (const x of pilha) bloqueia(`aberto:${x.linha}`, `o marcador «${x.nome}» abre na linha ${x.linha} e não fecha.`);

  for (const m of html.matchAll(/<[a-zA-Z][^>]*\bdata-ap-(?:href|attr)\s*=[^>]*>/g)) {
    const a = atributosDaTag(m[0]);
    const linha = linhaDe(m.index);
    if (a['data-ap-href'] !== undefined && !ATRIBUTOS.includes(a['data-ap-href'])) bloqueia(`href:${linha}`, `data-ap-href="${a['data-ap-href']}" (linha ${linha}) não existe.`);
    if (a['data-ap-attr'] !== undefined) {
      const [attr, nome] = a['data-ap-attr'].split(':');
      if (!attr || !ATRIBUTOS.includes(nome)) bloqueia(`attr:${linha}`, `data-ap-attr="${a['data-ap-attr']}" (linha ${linha}) não existe.`);
    }
  }

  if (exigirMetas && !SEM_METAS.test(caminho)) {
    const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => atributosDaTag(m[0]));
    for (const nome of METAS) {
      if (!metas.some((a) => a.name === nome && a.content)) bloqueia(`meta:${nome}`, `falta a meta «${nome}» (o JavaScript da página lê o contacto dela).`);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* O Worker dos pagamentos: o que ele ainda tem escrito               */
/* ------------------------------------------------------------------ */

/* Até à fase W o Worker dos pagamentos tem os prazos em DELIVERY_* (página da
   Stripe e emails), o telefone e o email em STORE_*, e a morada, o NIF e «a
   loja paga a devolução» escritos no código. O dono muda estes valores no
   painel; o Worker só muda com um deploy do Renato. Enquanto houver cópias,
   compara-se e AVISA-SE (nunca pára: o site está certo, os emails é que estão
   atrasados). Quando a fase W tirar as cópias, não há nada a comparar e os
   avisos deixam de aparecer sozinhos. */
export function varsDoToml(toml) {
  const vars = {};
  let dentro = false;
  for (const l of String(toml || '').split('\n')) {
    const t = l.trim();
    if (/^\[.*\]$/.test(t)) { dentro = t === '[vars]'; continue; }
    if (!dentro) continue;
    const m = t.match(/^([A-Z0-9_]+)\s*=\s*"([^"]*)"/);
    if (m) vars[m[1]] = m[2];
  }
  return vars;
}

const soDigitos = (s) => String(s ?? '').replace(/[^0-9]/g, '');
const lerJson = (t) => { try { return typeof t === 'string' ? JSON.parse(t) : t; } catch { return undefined; } };

export function avisosDoWorker(dados, { wranglerToml = '', fontes = '' } = {}) {
  const out = [];
  const vars = varsDoToml(wranglerToml);
  const avisa = (chave, ecra, ficheiro, mensagem) => out.push({ classe: 'avisa', chave: `worker:${chave}`, ficheiro, ecra, lembrete: true, mensagem: `${mensagem} O Renato tem de actualizar o Worker dos pagamentos.` });

  const s = lerJson(dados.settings);
  const d = s && s.delivery;
  if (d && typeof d === 'object') {
    const pares = [['estimate_min_days', 'DELIVERY_MIN_DAYS'], ['estimate_max_days', 'DELIVERY_MAX_BUSINESS_DAYS'], ['max_days', 'DELIVERY_MAX_DAYS']];
    const diferentes = pares.filter(([k, v]) => vars[v] !== undefined && String(d[k]) !== vars[v]);
    if (diferentes.length) {
      const dizem = [];
      if (vars.DELIVERY_MIN_DAYS !== undefined && vars.DELIVERY_MAX_BUSINESS_DAYS !== undefined) dizem.push(`entrega em ${vars.DELIVERY_MIN_DAYS} a ${vars.DELIVERY_MAX_BUSINESS_DAYS} dias úteis`);
      if (vars.DELIVERY_MAX_DAYS !== undefined) dizem.push(`prazo máximo de ${vars.DELIVERY_MAX_DAYS} dias`);
      avisa('delivery', 'Loja online › Prazos e devoluções', FICHEIROS.settings, `Os prazos de entrega mudaram, mas os emails das encomendas e a página de pagamento da Stripe ainda dizem ${dizem.join(' e ')}.`);
    }
  }
  const r = s && s.returns;
  if (r && typeof r.return_cost_eur === 'number' && r.return_cost_eur > 0 && /suportados pela loja/.test(fontes)) {
    avisa('devolucao', 'Loja online › Prazos e devoluções', FICHEIROS.settings, 'O custo de devolução passou a ser do cliente, mas os emails das encomendas ainda dizem que a loja paga a devolução.');
  }

  const site = lerJson(dados.site);
  const c = site && site.contactos;
  if (c && typeof c === 'object') {
    const telefones = new Set([...(vars.STORE_PHONE ? [vars.STORE_PHONE] : []), ...[...fontes.matchAll(/['"`](\d{3} \d{3} \d{3})['"`]/g)].map((m) => m[1])]);
    const antigos = [...telefones].filter((t) => soDigitos(t) !== soDigitos(c.telefone));
    if (c.telefone && antigos.length) avisa('telefone', 'Contactos e horário', FICHEIROS.site, `O telefone mudou no painel, mas os emails das encomendas ainda dizem ${antigos.join(', ')}.`);
    if (vars.STORE_EMAIL && c.email && vars.STORE_EMAIL.trim().toLowerCase() !== String(c.email).trim().toLowerCase()) {
      avisa('email', 'Contactos e horário', FICHEIROS.site, `O email mudou no painel, mas os emails das encomendas ainda dizem ${vars.STORE_EMAIL}.`);
    }
  }

  const e = lerJson(dados.empresa);
  if (e && typeof e === 'object') {
    const nifs = [...new Set([...fontes.matchAll(/NIF\s+(\d{9})/g)].map((m) => m[1]))];
    if (e.nif && nifs.some((n) => n !== String(e.nif))) avisa('nif', 'Dados da empresa', FICHEIROS.empresa, `O NIF mudou no painel, mas os emails das encomendas ainda dizem ${nifs.join(', ')}.`);
    const m = e.morada;
    const cps = [...new Set([...fontes.matchAll(/\b(\d{4}-\d{3})\b/g)].map((x) => x[1]))];
    if (m && typeof m === 'object' && cps.length && (cps.some((cp) => cp !== m.cp) || (m.rua && !fontes.includes(m.rua)))) {
      avisa('morada', 'Dados da empresa', FICHEIROS.empresa, 'A morada mudou no painel, mas a página de pagamento e os emails das encomendas ainda têm a antiga.');
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Ler o repositório                                                    */
/* ------------------------------------------------------------------ */

export function lerDados(raiz) {
  const dados = {};
  for (const [qual, rel] of Object.entries(FICHEIROS)) {
    const p = join(raiz, rel);
    dados[qual] = existsSync(p) ? readFileSync(p, 'utf8') : undefined;
  }
  return dados;
}

/* Uma fotografia existe se for um ficheiro normal DENTRO da pasta (nada de
   ligações simbólicas nem de «..» a sair dela). */
export function imagemExisteEm(raiz) {
  const base = resolve(raiz);
  return (caminho) => {
    const p = resolve(base, String(caminho).replace(/^\/+/, ''));
    if (!p.startsWith(base + sep)) return false;
    try { return lstatSync(p).isFile(); } catch { return false; }
  };
}

const FORA = new Set(['.git', '.github', '_site', '_source', 'worker', 'node_modules', '.wrangler']);
export function paginasHtml(raiz) {
  const out = [];
  const andar = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (FORA.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) andar(p);
      else if (e.isFile() && e.name.endsWith('.html')) out.push(relative(raiz, p).split(sep).join('/'));
    }
  };
  andar(raiz);
  return out.sort();
}

function fontesDoWorker(raiz) {
  const pasta = join(raiz, 'worker', 'src');
  if (!existsSync(pasta)) return '';
  return readdirSync(pasta).filter((f) => f.endsWith('.js')).sort().map((f) => readFileSync(join(pasta, f), 'utf8')).join('\n');
}

export function conferir(raiz) {
  const dados = lerDados(raiz);
  const lista = problemas(dados, { imagemExiste: imagemExisteEm(raiz) });
  const exigirMetas = OBRIGATORIOS.includes('site');
  for (const pagina of paginasHtml(raiz)) lista.push(...problemasDoHtml(pagina, readFileSync(join(raiz, pagina), 'utf8'), { exigirMetas }));
  const toml = join(raiz, 'worker', 'wrangler.toml');
  lista.push(...avisosDoWorker(dados, { wranglerToml: existsSync(toml) ? readFileSync(toml, 'utf8') : '', fontes: fontesDoWorker(raiz) }));
  const ordem = { bloqueia: 0, neutraliza: 1, avisa: 2 };
  // Os lembretes (o artigo de teste, os pneus à espera da etiqueta) vão para o
  // fim: não podem tapar, nas 9 anotações, um aviso que pede alguma coisa.
  lista.sort((a, b) => ordem[a.classe] - ordem[b.classe] || (a.lembrete ? 1 : 0) - (b.lembrete ? 1 : 0));
  const efeitos = neutralizar(dados, lista).efeitos.map((e) => ({ ...e, descricao: descreverEfeitos(e) }));
  return { dados, lista, efeitos };
}

const DESCRICAO = { retirar: 'retirado da loja', fora_de_venda: 'fora de venda', sem_imagem: 'sem fotografia (aparece o logótipo)' };
export const descreverEfeitos = (e) => e.efeitos.map((x) => DESCRICAO[x] || x).join(' e ');

/* ------------------------------------------------------------------ */
/* As saídas                                                            */
/* ------------------------------------------------------------------ */

/* Os comandos do GitHub: %, \r e \n escapam-se na mensagem; nas
   propriedades, também : e , */
const escMsg = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => escMsg(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function anotacoes(lista) {
  const linhas = [];
  const grupos = [['error', lista.filter((p) => p.classe === 'bloqueia')], ['warning', lista.filter((p) => p.classe !== 'bloqueia')]];
  for (const [tipo, grupo] of grupos) {
    for (const p of grupo.slice(0, MAX_ANOTACOES)) {
      const prefixo = p.classe === 'neutraliza' ? 'Tirado de venda na loja: ' : '';
      linhas.push(`::${tipo} file=${escProp(p.ficheiro || '')},title=${escProp(p.ecra || 'Guarda do conteúdo')}::${escMsg(prefixo + p.mensagem)}`);
    }
    if (grupo.length > MAX_ANOTACOES) {
      linhas.push(`::${tipo} title=Guarda do conteúdo::${escMsg(`e mais ${grupo.length - MAX_ANOTACOES} problemas — veja o resumo desta corrida ou o painel`)}`);
    }
  }
  return linhas;
}

const escMd = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MAX_RESUMO = 900 * 1024;   // o GitHub aceita até 1 MiB por passo

export function resumo(lista, efeitos) {
  const conta = (c) => lista.filter((p) => p.classe === c).length;
  const n = { bloqueia: conta('bloqueia'), neutraliza: conta('neutraliza'), avisa: conta('avisa') };
  const l = ['## Guarda do conteúdo', ''];
  if (n.bloqueia) l.push(`**A publicação parou**: ${n.bloqueia} problema(s) que não se podem contornar. A loja continua como estava.`);
  else l.push('A publicação segue.');
  if (efeitos.length) l.push('', `**${efeitos.length} produto(s) mudaram na loja** por terem dados com problemas (o ficheiro do repositório não mudou; corrige-se no painel):`, '', ...efeitos.map((e) => `- ${escMd(e.nome || e.sku || `produto n.º ${e.indice + 1}`)}: **${escMd(descreverEfeitos(e))}** — ${escMd(e.motivos.join(' '))}`));
  l.push('', `Problemas: ${n.bloqueia} que param · ${n.neutraliza} de produtos · ${n.avisa} avisos.`);
  if (lista.length) {
    l.push('', '| | Onde se corrige | O quê |', '|---|---|---|');
    const nome = { bloqueia: 'PÁRA', neutraliza: 'produto', avisa: 'aviso' };
    for (const p of lista) l.push(`| ${nome[p.classe]} | ${escMd(p.ecra)} | ${escMd(p.mensagem)} |`);
  }
  let texto = l.join('\n') + '\n';
  if (new TextEncoder().encode(texto).length > MAX_RESUMO) {
    texto = texto.slice(0, MAX_RESUMO / 2) + '\n\n… (o resto está no relatório desta corrida)\n';
  }
  return texto;
}

export function relatorio(lista, efeitos) {
  const conta = (c) => lista.filter((p) => p.classe === c).length;
  return { versao: 1, bloqueia: conta('bloqueia'), neutraliza: conta('neutraliza'), avisa: conta('avisa'), problemas: lista, neutralizados: efeitos };
}

/* ------------------------------------------------------------------ */
/* Os dois modos                                                       */
/* ------------------------------------------------------------------ */

function modoConferir(raiz, relatorioEm) {
  const { lista, efeitos } = conferir(raiz);
  for (const linha of anotacoes(lista)) console.log(linha);
  console.log('');
  const nome = { bloqueia: 'PÁRA   ', neutraliza: 'PRODUTO', avisa: 'AVISO  ' };
  for (const p of lista) console.log(`  ${nome[p.classe]} ${p.ecra} — ${p.mensagem}`);
  for (const e of efeitos) console.log(`  NA LOJA: ${e.nome || e.sku} — ${descreverEfeitos(e)}`);
  const nb = lista.filter((p) => p.classe === 'bloqueia').length;
  console.log(`\nGuarda do conteúdo: ${nb} que param, ${lista.filter((p) => p.classe === 'neutraliza').length} de produtos (${efeitos.length} mudam na loja), ${lista.filter((p) => p.classe === 'avisa').length} avisos.`);
  if (relatorioEm) writeFileSync(relatorioEm, JSON.stringify(relatorio(lista, efeitos), null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumo(lista, efeitos));
  return nb ? 1 : 0;
}

function modoNeutralizar(site) {
  const dados = lerDados(site);
  const lista = problemas(dados, { imagemExiste: imagemExisteEm(site) });
  const nb = lista.filter((p) => p.classe === 'bloqueia');
  if (nb.length) {
    // Nunca devia chegar aqui: o passo «Conferir o conteúdo» já parou. Mas este
    // ficheiro também corre no ensaio, e uma cópia com um «bloqueia» não se publica.
    for (const p of nb) console.error(`PÁRA: ${p.ecra} — ${p.mensagem}`);
    return 1;
  }
  const { products, efeitos, mudou } = neutralizar(dados, lista);
  if (!mudou) { console.log('    nenhum: a cópia publicada é o ficheiro tal e qual'); return 0; }
  const destino = join(site, FICHEIROS.products);
  writeFileSync(destino, serializar(products, terminacaoDe(dados.products)));
  for (const e of efeitos) console.log(`    na loja: ${e.nome || e.sku} — ${descreverEfeitos(e)}`);
  // A prova: a cópia escrita já não tem nada a neutralizar.
  const depois = lerDados(site);
  if (neutralizar(depois, problemas(depois, { imagemExiste: imagemExisteEm(site) })).mudou) {
    console.error('ERRO: a cópia neutralizada ainda tem produtos a neutralizar');
    return 1;
  }
  return 0;
}

export function principal(args) {
  const opcao = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined; };
  for (const nome of ['--raiz', '--relatorio-em', '--neutralizar']) {
    if (args.includes(nome) && !opcao(nome)) { console.error(`${nome} precisa de um valor`); return 2; }
  }
  const site = opcao('--neutralizar');
  if (site) return modoNeutralizar(resolve(site));
  return modoConferir(resolve(opcao('--raiz') || RAIZ_DO_REPOSITORIO), opcao('--relatorio-em'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = principal(process.argv.slice(2));
}
