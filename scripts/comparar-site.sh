#!/usr/bin/env bash
# =============================================================
# PROVA DE QUE A INJECÇÃO NÃO MUDA O SITE (nem o SEO) sem querer — §5.6 do
# plano do painel.
#
# Constrói a _site com o CI de <base> e com o de <depois>, cada um com os SEUS
# ficheiros e o seu pages.yml (os passos extraídos do YAML e corridos tal e
# qual, como o .github/provar-publicacao.sh), mas sobre os MESMOS dados: os
# products.json, settings.json e content.json de <depois> vão também para a
# árvore de <base>. Depois compara:
#   (1) cada *.html, com os marcadores <!--ap:…-->, os atributos data-ap-* e
#       as metas ap:* retirados, e o JSON-LD posto de parte: igual byte a byte,
#       menos as diferenças ESPERADAS (lista abaixo, cada uma com a razão);
#   (2) o JSON-LD de cada página, lido dos dois lados: igual como dados, menos
#       os caminhos esperados;
#   (3) o resto da _site: igual byte a byte, menos os ficheiros esperados.
# Uma diferença que não esteja na lista, ou uma esperada que não apareceu
# (a lista envelheceu), falha (exit 1). Nada sai para a rede, nada é publicado.
#
# Uso (bash; no Mac o python3 do sistema é o do Xcode):
#   PYTHON=<python com Pillow> scripts/comparar-site.sh <base> [depois]
# Ex.: PYTHON=… scripts/comparar-site.sh a01-ci-guardas HEAD
# =============================================================
set -euo pipefail
BASE="${1:?uso: comparar-site.sh <base> [depois]}"
DEPOIS="${2:-HEAD}"
PY="${PYTHON:-python3}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
"$PY" -c 'import PIL' 2>/dev/null || { echo "Preciso de um python com Pillow: PYTHON=<caminho> $0 $*" >&2; exit 2; }

E="$(mktemp -d "${TMPDIR:-/tmp}/ap-comparar-XXXXXX")"
trap 'rm -rf "$E"' EXIT
mkdir -p "$E/bin"
printf '#!/bin/sh\nexec "%s" "$@"\n' "$PY" > "$E/bin/python3"; chmod +x "$E/bin/python3"   # os YAML chamam «python3»
export PATH="$E/bin:$PATH"

# O run: de um passo, tal e qual (o mesmo que o .github/test-guardas.mjs faz).
cat > "$E/passo.mjs" <<'JS'
import { readFileSync } from 'node:fs';
const [, , ficheiro, nome] = process.argv;
const linhas = readFileSync(ficheiro, 'utf8').split('\n');
const ind = (l) => l.match(/^ */)[0].length;
const i0 = linhas.findIndex((l) => l.trim() === `- name: ${nome}`);
if (i0 < 0) process.exit(3);
let fim = linhas.length;
for (let i = i0 + 1; i < linhas.length; i++) if (linhas[i].trim() && ind(linhas[i]) <= ind(linhas[i0])) { fim = i; break; }
const r = linhas.slice(i0, fim).findIndex((l) => /^\s*run:/.test(l));
if (r < 0) process.exit(3);
const m = linhas[i0 + r].match(/^\s*run:\s*(.*)$/);
if (m[1] && m[1] !== '|') { process.stdout.write(m[1] + '\n'); process.exit(0); }
const corpo = linhas.slice(i0 + r + 1, fim);
while (corpo.length && !corpo[corpo.length - 1].trim()) corpo.pop();
const base = Math.min(...corpo.filter((l) => l.trim()).map(ind));
process.stdout.write(corpo.map((l) => l.slice(base)).join('\n') + '\n');
JS

# construir <commit> <pasta> → escreve em <pasta>/RESULTADO o caminho da _site final
construir() {
  local commit="$1" d="$2" passo yaml
  mkdir -p "$d/repo" "$d/runner-temp"
  git -C "$REPO" archive "$commit" | tar -x -C "$d/repo"
  for f in products settings content; do
    git -C "$REPO" show "$DEPOIS:data/$f.json" > "$d/repo/data/$f.json"   # os MESMOS dados dos dois lados
  done
  yaml="$d/repo/.github/workflows/pages.yml"
  for passo in 'Conferir o conteúdo' 'Preparar o que vai ser publicado' 'Preparar para a Cloudflare' 'Embrulhar'; do
    if node "$E/passo.mjs" "$yaml" "$passo" > "$d/passo.sh"; then
      echo "  · $passo"
      ( cd "$d/repo" && RUNNER_TEMP="$d/runner-temp" bash -e "$d/passo.sh" ) > "$d/log.txt" 2>&1 || { tail -30 "$d/log.txt"; exit 1; }
    fi
  done
  if node "$E/passo.mjs" "$yaml" 'Abrir e conferir o que vai ser publicado' > "$d/passo.sh"; then
    mkdir "$d/publicar" && cp "$d/runner-temp/site.tgz" "$d/publicar/"
    echo "  · Abrir e conferir o que vai ser publicado"
    ( cd "$d/publicar" && ZONA_ID= bash -e "$d/passo.sh" ) > "$d/log.txt" 2>&1 || { tail -30 "$d/log.txt"; exit 1; }
    echo "$d/publicar/_site" > "$d/RESULTADO"
  else
    echo "$d/repo/_site" > "$d/RESULTADO"
  fi
}

echo "=== o CI de $(git -C "$REPO" rev-parse --short "$BASE") ($BASE)"
construir "$BASE" "$E/a"
echo "=== o CI de $(git -C "$REPO" rev-parse --short "$DEPOIS") ($DEPOIS), sobre os mesmos dados"
construir "$DEPOIS" "$E/b"
A="$(cat "$E/a/RESULTADO")"; B="$(cat "$E/b/RESULTADO")"

cat > "$E/comparar.py" <<'PYC'
import difflib, json, re, sys
from pathlib import Path

A, B = Path(sys.argv[1]), Path(sys.argv[2])

# ---------------------------------------------------------------------------
# AS DIFERENÇAS ESPERADAS — cada uma com a razão. Uma diferença que não esteja
# aqui falha; uma daqui que não apareça também (a lista tem de dizer a verdade).
# ---------------------------------------------------------------------------
# (ficheiro, texto que sai, texto que entra, razão)
HTML = [
    ('index.html', '<strong>+9 marcas</strong>', '<strong>+8 marcas</strong>',
     'o chip das marcas passa a ser contado da lista (8 marcas); dizia 9 à mão (§5.1)'),
    ('index.html', 'Os horários são os mesmos que o site mostra', 'são escritos na publicação',
     'comentário do JSON-LD: passa a dizer de onde vêm os dados (só o comentário)'),
    ('obrigado.html', '<p class="co__note">Chamada para a rede móvel nacional.</p>', '<p class="co__note">(Chamada para a rede móvel nacional)</p>',
     'a nota do preço da chamada passa a ser a do painel, igual em todas as páginas'),
    ('legal/livre-resolucao.html', '(chamada para a rede móvel nacional)', '(Chamada para a rede móvel nacional)',
     'a nota do preço da chamada passa a ser a do painel, igual em todas as páginas'),
]
# (ficheiro, caminho no JSON-LD (expressão regular), razão)
JSONLD = [
    ('index.html', r'^@graph\[0\]\.hasOfferCatalog\.itemListElement\[\d+\]\.itemOffered\.(name|description)$',
     'os serviços dos dados estruturados passam a ser os do painel: o nome é o título visível e a descrição o texto visível (antes eram nomes escritos à mão, diferentes dos da página)'),
]
# ficheiros: (caminho (expressão regular), 'novo'|'mudou', razão, tem de aparecer?)
# As do A3 podem não aparecer: o plano publica o A3 antes do A2, e então a base
# já as tem.
FICHEIROS = [
    (r'^data/site\.json$', 'novo', 'os contactos, horário, serviços e textos (painel: Contactos e horário, Serviços, Textos)', True),
    (r'^data/empresa\.json$', 'novo', 'os dados da empresa (painel: Dados da empresa)', True),
    (r'^assets/js/(catalog|main|checkout|obrigado)\.js$', 'mudou', 'o WhatsApp e o telefone passam a vir das metas ap:* (com o valor de hoje como recurso)', True),
    (r'^assets/js/cart\.js$', 'mudou', 'A3: o carrinho actualiza o nome e a fotografia com o catálogo, e uma fotografia que falhe mostra o logótipo', False),
]
# ---------------------------------------------------------------------------

JSONLD_RE = re.compile(r'(<script\b[^>]*type="application/ld\+json"[^>]*>)(.*?)(</script>)', re.S)

def normalizar(texto):
    """Os marcadores, os atributos data-ap-* e as metas ap:* saem; o JSON-LD
    fica de parte (compara-se como dados)."""
    metas = len(re.findall(r'<meta name="ap:[^"]*" content="[^"]*" data-ap-meta />', texto))
    t = re.sub(r'\n[ \t]*<meta name="ap:[^"]*" content="[^"]*" data-ap-meta />', '', texto)
    t = re.sub(r'<!--\s*/?ap:[^>]*?-->', '', t)
    t = re.sub(r'\s+data-ap-(?:href|attr)="[^"]*"', '', t)
    t = re.sub(r'\s+data-ap-jsonld\b', '', t)
    blocos = []
    def guardar(m):
        blocos.append(m.group(2))
        return m.group(1) + f'«JSON-LD n.º {len(blocos)}»' + m.group(3)
    t = JSONLD_RE.sub(guardar, t)
    return t, blocos, metas

def diferencas_json(a, b, caminho=''):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in list(a) + [k for k in b if k not in a]:
            c = f'{caminho}.{k}' if caminho else k
            if k not in a: yield c, '(ausente)', b[k]
            elif k not in b: yield c, a[k], '(ausente)'
            else: yield from diferencas_json(a[k], b[k], c)
    elif isinstance(a, list) and isinstance(b, list):
        for i in range(max(len(a), len(b))):
            c = f'{caminho}[{i}]'
            if i >= len(a): yield c, '(ausente)', b[i]
            elif i >= len(b): yield c, a[i], '(ausente)'
            else: yield from diferencas_json(a[i], b[i], c)
    elif a != b or type(a) != type(b):
        yield caminho, a, b

def ficheiros(raiz):
    return {p.relative_to(raiz).as_posix() for p in raiz.rglob('*') if p.is_file()}

fa, fb = ficheiros(A), ficheiros(B)
inesperadas, usadas = [], set()
curto = lambda s, n=160: (s if len(s) <= n else s[:n] + '…').replace('\n', '⏎')

def esperado_ficheiro(rel, tipo):
    for i, (rx, t, razao, _) in enumerate(FICHEIROS):
        if t == tipo and re.search(rx, rel):
            usadas.add(('f', i)); return razao
    return None

print('=== (3) os ficheiros')
for rel in sorted(fb - fa):
    r = esperado_ficheiro(rel, 'novo')
    print(f'  {"esperado" if r else "INESPERADO"}: novo {rel}' + (f' — {r}' if r else ''))
    if not r: inesperadas.append(f'ficheiro novo {rel}')
for rel in sorted(fa - fb):
    print(f'  INESPERADO: desapareceu {rel}'); inesperadas.append(f'ficheiro a menos {rel}')

total_metas = 0; paginas = 0; iguais_html = 0
for rel in sorted(fa & fb):
    ba, bb = (A / rel).read_bytes(), (B / rel).read_bytes()
    if not rel.endswith('.html'):
        if ba != bb:
            r = esperado_ficheiro(rel, 'mudou')
            print(f'  {"esperado" if r else "INESPERADO"}: mudou {rel}' + (f' — {r}' if r else ''))
            if not r: inesperadas.append(f'ficheiro mudado {rel}')
        continue
    paginas += 1
    ta, ja, ma = normalizar(ba.decode('utf-8'))
    tb, jb, mb = normalizar(bb.decode('utf-8'))
    total_metas += mb
    if ma:
        inesperadas.append(f'{rel}: a base já tinha metas ap:*')
    # (1) o HTML
    if ta == tb:
        iguais_html += 1
    else:
        la, lb = ta.split('\n'), tb.split('\n')
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, la, lb, autojunk=False).get_opcodes():
            if op == 'equal': continue
            sai, entra = '\n'.join(la[i1:i2]), '\n'.join(lb[j1:j2])
            razao = None
            for i, (f, x, y, rz) in enumerate(HTML):
                if f == rel and x in sai and y in entra:
                    usadas.add(('h', i)); razao = rz; break
            print(f'  {"esperado" if razao else "INESPERADO"}: {rel} (linha {i1 + 1})' + (f' — {razao}' if razao else ''))
            print(f'      antes:  {curto(sai)}')
            print(f'      depois: {curto(entra)}')
            if not razao: inesperadas.append(f'{rel} linha {i1 + 1}')
    # (2) o JSON-LD
    if len(ja) != len(jb):
        inesperadas.append(f'{rel}: {len(ja)} blocos JSON-LD antes, {len(jb)} depois'); continue
    for n, (xa, xb) in enumerate(zip(ja, jb), 1):
        try:
            da, db = json.loads(xa), json.loads(xb)
        except ValueError as e:
            inesperadas.append(f'{rel}: JSON-LD n.º {n} não se lê ({e})'); continue
        for caminho, va, vb in diferencas_json(da, db):
            razao = None
            for i, (f, rx, rz) in enumerate(JSONLD):
                if f == rel and re.search(rx, caminho):
                    usadas.add(('j', i)); razao = rz; break
            if razao:
                print(f'  esperado: {rel} JSON-LD {caminho}: {json.dumps(va, ensure_ascii=False)} → {json.dumps(vb, ensure_ascii=False)}')
            else:
                print(f'  INESPERADO: {rel} JSON-LD {caminho}: {json.dumps(va, ensure_ascii=False)} → {json.dumps(vb, ensure_ascii=False)}')
                inesperadas.append(f'{rel} JSON-LD {caminho}')

# ---------------------------------------------------------------------------
# A prova de SEO: cada página continua com as mesmas ligações de contacto, e o
# JSON-LD do negócio lê-se e tem o que o Google usa numa pesquisa local.
# ---------------------------------------------------------------------------
print('\n=== as ligações de contacto em cada página (antes → depois)')
LIG = [('tel:', r'href="tel:\+[0-9]{9,15}"'), ('wa.me', r'href="https://wa\.me/[0-9]{9,15}[?"]'), ('mailto:', r'href="mailto:[^"@]+@[^"]+"')]
for rel in sorted(x for x in fa & fb if x.endswith('.html')):
    ta_, tb_ = (A / rel).read_text(encoding='utf-8'), (B / rel).read_text(encoding='utf-8')
    ca = [len(re.findall(rx, ta_)) for _, rx in LIG]; cb = [len(re.findall(rx, tb_)) for _, rx in LIG]
    print(f'  {rel:30} ' + '  '.join(f'{n} {x}→{y}' for (n, _), x, y in zip(LIG, ca, cb)))
    if ca != cb:
        inesperadas.append(f'{rel}: as ligações de contacto mudaram ({ca} → {cb})')
print('\n=== o JSON-LD do negócio (index.html)')
negocio = None
for bloco in normalizar((B / 'index.html').read_text(encoding='utf-8'))[1]:
    try:
        d = json.loads(bloco)
    except ValueError as e:
        inesperadas.append(f'JSON-LD do index.html não se lê: {e}'); continue
    for no in d.get('@graph', [d]):
        if str(no.get('@id', '')).endswith('#business'):
            negocio = no
if not negocio:
    inesperadas.append('o index.html não tem o nó #business no JSON-LD')
else:
    faltas = []
    tipos = negocio.get('@type') if isinstance(negocio.get('@type'), list) else [negocio.get('@type')]
    if not {'AutoRepair', 'AutoPartsStore'} & set(tipos): faltas.append('@type')
    if not re.fullmatch(r'\+351[0-9]{9}', str(negocio.get('telephone', ''))): faltas.append('telephone')
    ad = negocio.get('address') or {}
    faltas += [f'address.{k}' for k in ('streetAddress', 'addressLocality', 'postalCode', 'addressCountry') if not ad.get(k)]
    oh = negocio.get('openingHoursSpecification') or []
    if not oh or not all(re.fullmatch(r'[0-9]{2}:[0-9]{2}', x.get('opens', '')) and re.fullmatch(r'[0-9]{2}:[0-9]{2}', x.get('closes', '')) for x in oh): faltas.append('openingHoursSpecification')
    if not negocio.get('geo'): faltas.append('geo')
    for k in ('email', 'vatID', 'legalName'):
        if not negocio.get(k): faltas.append(k)
    print(f'  {negocio.get("name")}: {negocio.get("telephone")} · {ad.get("streetAddress")}, {ad.get("postalCode")} {ad.get("addressLocality")} · {len(oh)} horários · {len((negocio.get("hasOfferCatalog") or {}).get("itemListElement") or [])} serviços' + (f' — FALTA: {", ".join(faltas)}' if faltas else ' — completo'))
    if faltas:
        inesperadas.append('JSON-LD do negócio sem ' + ', '.join(faltas))
    if '</' in (B / 'index.html').read_text(encoding='utf-8').split('data-ap-jsonld')[1].split('</script>')[0]:
        inesperadas.append('o JSON-LD tem um «</» por escapar')

print(f'\n=== {paginas} páginas: {iguais_html} com o HTML igual byte a byte (sem os marcadores); {total_metas} metas ap:* acrescentadas')
if total_metas != 2 * (paginas - 1):   # todas menos a do Pages CMS (admin/)
    inesperadas.append(f'esperava {2 * (paginas - 1)} metas ap:* (2 por página, menos a admin/), há {total_metas}')
por_usar = [f'HTML: {HTML[i][0]} «{HTML[i][1]}»' for i in range(len(HTML)) if ('h', i) not in usadas] + \
           [f'JSON-LD: {JSONLD[i][0]} {JSONLD[i][1]}' for i in range(len(JSONLD)) if ('j', i) not in usadas] + \
           [f'ficheiro: {FICHEIROS[i][0]}' for i in range(len(FICHEIROS)) if ('f', i) not in usadas and FICHEIROS[i][3]]
for x in por_usar:
    print(f'  ESPERADA E NÃO APARECEU: {x}')
if inesperadas or por_usar:
    print(f'\nDIFERENTE: {len(inesperadas)} diferença(s) inesperada(s), {len(por_usar)} esperada(s) que não apareceu(ram).')
    sys.exit(1)
print('\nLIMPO: só as diferenças esperadas, cada uma com a razão.')
PYC

# A guarda da guarda: uma mudança num título tem de ser apanhada.
# (Só a mudança do título: a cópia leva exactamente os mesmos ficheiros.)
cp -R "$B" "$E/mutante"
"$PY" - "$E/mutante/index.html" <<'MUT'
import sys
p = sys.argv[1]
t = open(p, encoding='utf-8').read()
x = '<h2 class="section-title">Muito mais do que pneus</h2>'
assert t.count(x) == 1, 'o título de ensaio já não está no index.html'
open(p, 'w', encoding='utf-8').write(t.replace(x, x.replace('pneus', 'pneu')))
MUT
if "$PY" "$E/comparar.py" "$A" "$E/mutante" > "$E/mutante.txt" 2>&1 || ! grep -q 'INESPERADO: index.html' "$E/mutante.txt"; then
  echo "a comparação não vê uma mudança num título: não prova nada"; exit 1
fi

echo "=== comparar"
"$PY" "$E/comparar.py" "$A" "$B"
