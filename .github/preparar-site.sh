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
# worker/ (ids do KV, origens permitidas), os .md internos, a configuração do
# backoffice (.pages.yml: o Pages CMS lê-a do repositório, não do site) e a
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
  --exclude '.pages.yml' \
  --exclude 'wrangler.jsonc' \
  --exclude '/wrangler.toml' \
  --exclude '/scripts' \
  ${DENTRO[@]+"${DENTRO[@]}"}

# --- as fotografias do backoffice, reduzidas e escritas no HTML ----------
# Sem isto o index.html publicava o caminho antigo e o main.js trocava-o já
# depois de a página estar pintada (via-se a antiga e logo a nova, e as duas
# eram descarregadas). Ver .github/injetar-imagens.py.
echo "--- imagens do backoffice ---"
"$PYTHON" .github/injetar-imagens.py "$SITE" data/content.json

echo "--- ficheiros publicados ---"
find "$SITE" -type f | sort | sed "s|^$SITE/|  |"
