#!/usr/bin/env bash
# =============================================================
# PROVA DE QUE UMA MUDANÇA AO CI NÃO MUDA O SITE.
# Constrói a _site com os passos do pages.yml de <base> e com os do <commit>,
# os dois sobre os ficheiros do MESMO <commit>, e compara byte a byte
# (diff -r). Os passos correm tal como estão escritos em cada YAML (extraídos,
# nunca reescritos). Com o pages.yml em três jobs, a _site que conta é a que o
# job «publicar» abre do embrulho, depois das verificações de fuga.
# Nada sai para a rede e nada é publicado.
#
# Uso (bash; no Mac o python3 do sistema é o do Xcode):
#   PYTHON=<python com Pillow> .github/provar-publicacao.sh <base> [commit]
# Ex.: a prova do A0 foi  .github/provar-publicacao.sh 7683ab4 HEAD
# =============================================================
set -euo pipefail
BASE="${1:?uso: provar-publicacao.sh <base> [commit]}"
COMMIT="${2:-HEAD}"
PY="${PYTHON:-python3}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
"$PY" -c 'import PIL' 2>/dev/null || { echo "Preciso de um python com Pillow: PYTHON=<caminho> $0 $*" >&2; exit 2; }

E="$(mktemp -d "${TMPDIR:-/tmp}/ap-prova-XXXXXX")"
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

# construir <yaml> <pasta> → escreve em <pasta>/RESULTADO o caminho da _site final
construir() {
  local yaml="$1" d="$2" passo
  mkdir -p "$d/repo" "$d/runner-temp"
  git -C "$REPO" archive "$COMMIT" | tar -x -C "$d/repo"
  if grep -q -- '- name: Abrir e conferir o que vai ser publicado' "$yaml"; then
    for passo in 'Conferir o conteúdo' 'Preparar o que vai ser publicado' 'Preparar para a Cloudflare' 'Embrulhar'; do
      if node "$E/passo.mjs" "$yaml" "$passo" > "$d/passo.sh"; then
        echo "  · $passo"; ( cd "$d/repo" && RUNNER_TEMP="$d/runner-temp" bash -e "$d/passo.sh" ) > "$d/log.txt" 2>&1 || { tail -20 "$d/log.txt"; exit 1; }
      fi
    done
    mkdir "$d/publicar" && cp "$d/runner-temp/site.tgz" "$d/publicar/"
    node "$E/passo.mjs" "$yaml" 'Abrir e conferir o que vai ser publicado' > "$d/passo.sh"
    echo "  · Abrir e conferir o que vai ser publicado"
    ( cd "$d/publicar" && ZONA_ID= bash -e "$d/passo.sh" ) > "$d/log.txt" 2>&1 || { tail -20 "$d/log.txt"; exit 1; }
    echo "$d/publicar/_site" > "$d/RESULTADO"
  else
    for passo in 'Preparar o que vai ser publicado' 'Preparar para a Cloudflare'; do
      node "$E/passo.mjs" "$yaml" "$passo" > "$d/passo.sh"
      echo "  · $passo"; ( cd "$d/repo" && bash -e "$d/passo.sh" ) > "$d/log.txt" 2>&1 || { tail -20 "$d/log.txt"; exit 1; }
    done
    echo "$d/repo/_site" > "$d/RESULTADO"
  fi
}

git -C "$REPO" show "$BASE:.github/workflows/pages.yml" > "$E/base.yml"
git -C "$REPO" show "$COMMIT:.github/workflows/pages.yml" > "$E/commit.yml"
echo "=== o CI de $(git -C "$REPO" rev-parse --short "$BASE") sobre $(git -C "$REPO" rev-parse --short "$COMMIT")"
construir "$E/base.yml" "$E/a"
echo "=== o CI de $(git -C "$REPO" rev-parse --short "$COMMIT") sobre o mesmo"
construir "$E/commit.yml" "$E/b"
A="$(cat "$E/a/RESULTADO")"; B="$(cat "$E/b/RESULTADO")"
test -f "$A/index.html" && test -f "$B/index.html" || { echo "uma das _site ficou sem index.html"; exit 1; }

# A guarda da guarda: o diff tem de saber dizer «diferente».
cp -R "$B" "$E/mutante"; printf 'x' >> "$E/mutante/index.html"
if diff -r -q "$A" "$E/mutante" > /dev/null; then echo "o diff não vê diferenças: a prova não prova nada"; exit 1; fi

echo "=== diff -r"
if diff -r "$A" "$B"; then
  echo "IGUAIS, byte a byte: $(find "$B" -type f | wc -l | tr -d ' ') ficheiros (incluindo os que começam por ponto)"
else
  echo "DIFERENTES (acima)"; exit 1
fi
