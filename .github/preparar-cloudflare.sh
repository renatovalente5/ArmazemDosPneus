#!/usr/bin/env bash
# =============================================================
# O que a Cloudflare precisa na _site, além das páginas.
# Corre no CI depois de «Preparar o que vai ser publicado»
# (.github/workflows/pages.yml). Uso: .github/preparar-cloudflare.sh _site
# =============================================================
set -euo pipefail
SITE="${1:?uso: preparar-cloudflare.sh <pasta>}"
cd "$SITE"

# --- _redirects -----------------------------------------------
# O wrangler.jsonc serve as moradas .html tal como estão (html_handling
# «none»), porque é isso que dizem os canonicals, o sitemap e as ligações.
# O que o GitHub Pages resolvia sozinho passa a estar aqui, gerado a partir
# das páginas que EXISTEM (uma página nova entra sem ninguém se lembrar):
#   · a raiz e cada pasta com index.html: reescrita (200) para o index.html;
#   · a pasta sem barra: 301 para a pasta com barra;
#   · a página sem .html (/loja): 301 para a morada canónica (/loja.html).
#     O GitHub servia-a com 200 sem canonicalizar; aqui passa a redirigir.
# As regras de _redirects aplicam-se ANTES dos ficheiros, mesmo que exista um
# ficheiro na morada — por isso nunca há uma regra genérica (/:pagina), que
# apanharia o robots.txt e o sitemap.xml.
{
  echo "# Gerado por .github/preparar-cloudflare.sh no CI — não editar à mão."
  echo "/ /index.html 200"
  find . -mindepth 2 -name index.html | sed 's|^\./||; s|/index\.html$||' | sort | while read -r pasta; do
    echo "/$pasta/ /$pasta/index.html 200"
    echo "/$pasta /$pasta/ 301"
  done
  find . -name '*.html' ! -name index.html ! -name 404.html | sed 's|^\./||; s|\.html$||' | sort | while read -r pagina; do
    echo "/$pagina /$pagina.html 301"
  done
} > _redirects

# --- _headers -------------------------------------------------
# · As fotos que o CI reduz levam o resumo do conteúdo no nome
#   (assets/uploads/opt/<slot>-<sha>.jpg, ver injetar-imagens.py): um ano.
# · As tipografias não mudam de nome quando mudam: um dia.
# · O resto (HTML, CSS, JS, data/*.json que o backoffice edita) revalida
#   sempre — é o que a Cloudflare faz por omissão.
# · Em tudo: sem adivinhar tipos, e nenhum site de fora mete estas páginas
#   num iframe. A regra /* não leva Cache-Control: duas regras que apanhem o
#   mesmo ficheiro JUNTAM os valores.
cat > _headers <<'H'
/assets/uploads/opt/*
  Cache-Control: public, max-age=31536000, immutable
/assets/fonts/*
  Cache-Control: public, max-age=86400
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Content-Security-Policy: frame-ancestors 'self'
H

# --- .assetsignore --------------------------------------------
# O CNAME e o .nojekyll são do GitHub Pages; não se publicam na Cloudflare.
printf '%s\n' CNAME .nojekyll > .assetsignore

echo "--- _redirects ($(grep -vc '^#' _redirects) regras) ---"
cat _redirects
