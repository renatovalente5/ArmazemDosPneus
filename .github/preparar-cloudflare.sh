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
#
# O /admin ERA a página do Pages CMS, o editor antigo, que saiu (out 2026): o
# dono usa o painel em backoffice.armazemdospneus.pt. Quem tiver o endereço
# antigo guardado vai lá parar, por um 301 para fora do domínio. O /admin/*
# casa também o /admin/ e o /admin/index.html, mas não o /admin: cada um tem a
# sua regra (ensaiado no wrangler dev). Uma pasta admin/ ou uma admin.html na
# _site nunca seriam servidas (a regra vem antes dos ficheiros), por isso param
# aqui, com a razão (::error para o painel), em vez de ficarem mortas em
# silêncio.
PAINEL='https://backoffice.armazemdospneus.pt/'
for x in admin admin.html; do
  if [ -e "$x" ]; then
    MSG="A _site tem «$x», mas o /admin reencaminha para o painel ($PAINEL) e nada lá seria servido: tem de sair do repositório. Só o Renato o pode corrigir."
    echo "::error title=Publicação::$MSG"
    echo "ERRO: $MSG" >&2
    exit 1
  fi
done
{
  echo "# Gerado por .github/preparar-cloudflare.sh no CI — não editar à mão."
  echo "/ /index.html 200"
  echo "/index / 301"
  echo "/admin $PAINEL 301"
  echo "/admin/* $PAINEL 301"
  find . -mindepth 2 -name index.html | sed 's|^\./||; s|/index\.html$||' | sort | while read -r pasta; do
    echo "/$pasta/ /$pasta/index.html 200"
    echo "/$pasta /$pasta/ 301"
    echo "/$pasta/index /$pasta/ 301"
  done
  find . -name '*.html' ! -name index.html ! -name 404.html | sed 's|^\./||; s|\.html$||' | sort | while read -r pagina; do
    echo "/$pagina /$pagina.html 301"
  done
} > _redirects

# --- _headers -------------------------------------------------
# · As fotos que o CI reduz levam o resumo do conteúdo no nome
#   (assets/uploads/opt/<slot>-<sha>.jpg, ver injetar-imagens.py): um ano.
# · As tipografias não mudam de nome quando mudam: um dia.
#   UMA REGRA POR FICHEIRO QUE EXISTE, e não «opt/*»: o _headers casa pela
#   morada e não pela resposta, e a 404 de um nome que não existe levava
#   também o ano de cache — um browser que a pedisse uma vez ficava com ela.
# · O resto (HTML, CSS, JS, data/*.json que o backoffice edita) revalida
#   sempre — é o que a Cloudflare faz por omissão.
# · Em tudo: sem adivinhar tipos, nenhum site de fora mete estas páginas num
#   iframe, e o Vary que o GitHub mandava (as respostas saem comprimidas
#   conforme o browser). A regra /* não leva Cache-Control: duas regras que
#   apanhem o mesmo ficheiro JUNTAM os valores.
{
  find assets/uploads/opt -type f 2>/dev/null | sort | while read -r f; do
    printf '/%s\n  Cache-Control: public, max-age=31536000, immutable\n' "$f"
  done
  find assets/fonts -type f 2>/dev/null | sort | while read -r f; do
    printf '/%s\n  Cache-Control: public, max-age=86400\n' "$f"
  done
  cat <<'H'
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Content-Security-Policy: frame-ancestors 'self'
  Vary: Accept-Encoding
H
} > _headers
if [ "$(grep -c '^/' _headers)" -gt 100 ]; then
  echo "O _headers passou das 100 regras que a Cloudflare aceita" >&2; exit 1
fi

# --- .assetsignore --------------------------------------------
# O CNAME e o .nojekyll são do GitHub Pages; não se publicam na Cloudflare.
printf '%s\n' CNAME .nojekyll > .assetsignore

echo "--- _redirects ($(grep -vc '^#' _redirects) regras) ---"
cat _redirects
echo "--- _headers ($(grep -c '^/' _headers) regras) ---"
cat _headers
