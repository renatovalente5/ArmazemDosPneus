#!/usr/bin/env bash
# =============================================================
# O que vai ser publicado: a pasta _site.
# Corre no job «construir» do CI (.github/workflows/pages.yml), que NÃO tem
# segredos, e no ensaio do painel — o mesmo ficheiro nos dois sítios, para o
# ensaio correr exactamente o que o CI corre.
# Uso (a partir de qualquer pasta): .github/preparar-site.sh _site
# No Mac, PYTHON=<python com Pillow> (o python3 do sistema é o do Xcode).
#
# AS VERIFICAÇÕES DE FUGA NÃO ESTÃO AQUI (nada de worker/, .github/, .md,
# ligações simbólicas…). Estão no pages.yml, no job que publica: este ficheiro
# muda-o qualquer um que possa escrever no repositório, e o YAML não.
# =============================================================
set -euo pipefail
SITE="${1:?uso: preparar-site.sh <pasta>}"
PYTHON="${PYTHON:-python3}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"

# O Pages CMS (o editor antigo) saiu em outubro de 2026: o dono edita no painel
# (backoffice.armazemdospneus.pt), e é o único editor. Um .pages.yml que volte
# ao repositório trazia de volta um segundo editor sobre os mesmos ficheiros —
# o Pages CMS reescreve o JSON inteiro e apaga as chaves que não conhece —, e
# os dois atropelavam-se. Pára antes de fazer seja o que for.
if [ -e "$RAIZ/.pages.yml" ]; then
  echo "ERRO: o .pages.yml voltou ao repositório, mas o Pages CMS saiu e o painel é o único editor: tire o ficheiro do repositório. É uma avaria técnica, e não um problema do conteúdo." >&2
  exit 1
fi

# Uma pasta que já traga ficheiros misturava-os com os desta publicação.
if [ -e "$SITE" ] && [ -n "$(ls -A "$SITE" 2>/dev/null)" ]; then
  echo "A pasta $SITE já tem ficheiros: apague-a primeiro." >&2; exit 1
fi
mkdir -p "$SITE"
SITE="$(cd "$SITE" && pwd)"
cd "$RAIZ"

# A pasta de destino, se estiver dentro do repositório, não se copia a si
# própria.
DENTRO=()
case "$SITE/" in "$RAIZ"/*) DENTRO=(--exclude "/${SITE#"$RAIZ"/}") ;; esac

# --- copiar tudo menos o que não deve ser servido ao público -------------
# worker/ (ids do KV, origens permitidas), os .md internos e a configuração
# do wrangler. Nada disso são segredos, mas também não têm razão para estar
# públicos, e um Disallow no robots.txt esconde do Google e não do público.
rsync -a ./ "$SITE"/ \
  --exclude '.git' \
  --exclude '.github' \
  --exclude '_site' \
  --exclude 'worker' \
  --exclude '_source' \
  --exclude '*.md' \
  --exclude '.gitignore' \
  --exclude 'wrangler.jsonc' \
  --exclude '/wrangler.toml' \
  --exclude '/scripts' \
  ${DENTRO[@]+"${DENTRO[@]}"}

# --- contactos, horário, serviços, textos e dados da empresa --------------
# O que o dono muda no painel (data/site.json, data/empresa.json, e os prazos,
# a devolução e os portes do data/settings.json nos Termos) escrito no HTML
# publicado, e no JSON-LD. ANTES das fotografias: o injetar-imagens.py troca
# depois as fotos no HTML e no JSON-LD que este escreveu. Ver
# .github/injetar-conteudo.py.
echo "--- contactos, textos e dados da empresa ---"
"$PYTHON" .github/injetar-conteudo.py "$SITE" data/site.json data/empresa.json data/settings.json

# --- as fotografias do backoffice, reduzidas e escritas no HTML ----------
# Sem isto o index.html publicava o caminho antigo e o main.js trocava-o já
# depois de a página estar pintada (via-se a antiga e logo a nova, e as duas
# eram descarregadas). Ver .github/injetar-imagens.py.
echo "--- imagens do backoffice ---"
"$PYTHON" .github/injetar-imagens.py "$SITE" data/content.json

# --- produtos partidos: fora de venda na cópia publicada -------------------
# A cópia _site/data/products.json é a que o catálogo, o carrinho, o checkout
# e o Worker dos pagamentos lêem. Um produto com um problema (etiqueta UE em
# falta num pneu à venda, preço inválido, referência repetida…) sai de venda
# AQUI, e o resto publica. O ficheiro do repositório não muda. Sem nada a
# neutralizar, a cópia fica byte a byte igual ao ficheiro. Ver .github/guardas.mjs.
echo "--- produtos com problemas (mudam só na cópia publicada) ---"
node .github/guardas.mjs --neutralizar "$SITE"

echo "--- ficheiros publicados ---"
find "$SITE" -type f | sort | sed "s|^$SITE/|  |"
