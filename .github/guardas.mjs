#!/usr/bin/env node
/* A GUARDA DO CONTEÚDO, NO CI (job «construir», que não tem segredos).
 *
 * Lê os JSON de data/ e corre as regras de .github/regras.mjs — as MESMAS que o
 * painel mostra por baixo dos campos e que o Worker do painel confere ao
 * gravar. Acrescenta o que só o repositório tem: os marcadores das páginas
 * (fase A2).
 *
 * O Worker dos pagamentos NÃO entra aqui. Desde a fase W-dados ele lê os
 * prazos, a devolução, os contactos e a empresa dos mesmos JSON (com o
 * retrato na encomenda), e já não há cópias suas a comparar; a guarda de que
 * o que o painel deixa gravar chega aos emails está nas regras (iguais ou
 * mais apertadas do que as do worker/src/termos.js) e é provada pelo
 * .github/test-guardas.mjs, que também confere que o worker/src não volta a
 * ter esses valores escritos à mão. Um aviso aqui seria para o dono, e uma
 * diferença no código do Worker não é coisa que ele possa corrigir.
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

/* As listas fechadas do .github/injetar-conteudo.py — IGUAIS às de lá (a
   bateria confere-as com «injetar-conteudo.py --listas»). Um nome que não
   esteja aqui, um marcador aberto sem fecho, uma variante com a condição
   errada ou um marcador dentro de outro que é trocado por inteiro param a
   publicação AQUI, com a mensagem certa, e não mais à frente no injector. */
export const MARCADORES = [
  'telefone', 'telefone-2', 'telefones', 'whatsapp', 'email', 'nota-chamada',
  'morada-rua', 'morada-localidade', 'morada-cp-localidade', 'morada-linha',
  'nif', 'denominacao', 'nome', 'registo',
  'horario', 'servicos', 'servicos-frase', 'marcas', 'marcas-chip',
  'topo-sobretitulo', 'topo-titulo', 'topo-frase', 'topo-destaques',
  'sobre-titulo', 'sobre-texto', 'sobre-pontos', 'contactos-frase', 'rodape-frase',
  // O dono muda os portes, os prazos e o custo de devolução: os Termos acompanham-nos.
  'portes', 'devolucao', 'custo-devolucao', 'prazo-entrega', 'prazo-maximo',
  'ral', 'facebook',
  // «Última atualização» das páginas legais (o injector calcula-a do histórico).
  'atualizacao',
];
/* Os marcadores que são variantes (<!--ap:x se=…-->A<!--ap:x senao-->B<!--/ap:x-->),
   e a condição de cada um. Os outros não levam condição. */
export const VARIANTES = { portes: 'a-combinar', devolucao: 'loja-paga', facebook: 'existe' };
export const ATRIBUTOS = [
  'tel', 'tel-2', 'whatsapp', 'whatsapp-orcamento', 'whatsapp-orcamento-servico', 'mailto',
  'facebook', 'mapa-embed', 'mapa-link', 'ral-url', 'livro-reclamacoes',
];
/* As metas que o JS lê (catalog.js, main.js, checkout.js, obrigado.js). Exigem-se
   quando o site.json é obrigatório (OBRIGATORIOS, desde o A2), e não na página
   do Pages CMS (admin/), que sai na fase G. */
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
    const [, fecho, nome, restoBruto = ''] = m;
    const resto = restoBruto.trim();
    const linha = linhaDe(m.index);
    if (!MARCADORES.includes(nome)) { bloqueia(`desconhecido:${linha}`, `o marcador «${nome}» (linha ${linha}) não existe.`); continue; }
    if (fecho) {
      const topo = pilha.pop();
      if (!topo || topo.nome !== nome) {
        bloqueia(`fecho:${linha}`, `o marcador «${nome}» fecha na linha ${linha} sem ter aberto${topo ? ` (estava aberto «${topo.nome}», da linha ${topo.linha})` : ''}.`);
        if (topo) pilha.push(topo);
      }
    } else if (resto === 'senao') {
      const topo = pilha[pilha.length - 1];
      if (!topo || topo.nome !== nome || !topo.variante || topo.senao) bloqueia(`senao:${linha}`, `o «senão» de «${nome}» (linha ${linha}) está fora de sítio.`);
      else topo.senao = true;
    } else {
      const cond = (resto.match(/^se=([a-z0-9-]+)$/) || [])[1];
      if (resto && !cond) bloqueia(`resto:${linha}`, `o marcador «${nome}» (linha ${linha}) tem «${resto}», que não se percebe.`);
      else if (VARIANTES[nome] && cond !== VARIANTES[nome]) bloqueia(`variante:${linha}`, `o marcador «${nome}» (linha ${linha}) é uma variante e tem de ser «se=${VARIANTES[nome]}».`);
      else if (!VARIANTES[nome] && cond) bloqueia(`variante:${linha}`, `o marcador «${nome}» (linha ${linha}) não é uma variante (não leva «se=»).`);
      const pai = pilha[pilha.length - 1];
      if (pai && !pai.variante) bloqueia(`dentro:${linha}`, `o marcador «${nome}» (linha ${linha}) está dentro de «${pai.nome}», que é trocado por inteiro.`);
      pilha.push({ nome, linha, variante: Boolean(cond), senao: false });
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

export function conferir(raiz) {
  const dados = lerDados(raiz);
  const lista = problemas(dados, { imagemExiste: imagemExisteEm(raiz) });
  const exigirMetas = OBRIGATORIOS.includes('site');
  for (const pagina of paginasHtml(raiz)) lista.push(...problemasDoHtml(pagina, readFileSync(join(raiz, pagina), 'utf8'), { exigirMetas }));
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
