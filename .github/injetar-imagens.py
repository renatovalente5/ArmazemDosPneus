#!/usr/bin/env python3
"""
Escreve no HTML publicado as fotos que o cliente escolheu no backoffice, já
reduzidas.

O PROBLEMA QUE ISTO RESOLVE
---------------------------
1. O index.html traz o caminho da foto escrito à mão e o main.js trocava-o
   depois de a página estar pintada. Pior: a <img> do topo tem
   fetchpriority="high", portanto o browser era explicitamente mandado carregar
   a foto ANTIGA primeiro. Via-se a antiga e mudava logo para a nova, e as duas
   eram descarregadas (medido: 289 KB + 309 KB).

2. As referências absolutas nos dados estruturados (JSON-LD) nunca eram
   tocadas pelo main.js — eram três, image[0], image[1] e primaryImageOfPage —
   e ficavam a anunciar ao Google uma foto que já não é a da página.

3. O cliente carrega o que vem do telemóvel. A foto que pôs no topo era um PNG
   de 2,4 MB, contra os 289 KB da anterior. Como o HTML passa a apontar-lhe
   directamente e com prioridade alta, sem reduzir trocava-se um piscar de
   olhos por uma página muito mais lenta. E uma foto do telemóvel pode vir
   «deitada», com a orientação só no EXIF: aplica-se antes de reduzir.

O original fica intacto no repositório; o que vai para o site é um JPEG
redimensionado. O nome leva um resumo do conteúdo — sem isso, um nome fixo
ficava em cache no browser e o cliente mudava a foto sem ninguém ver a nova, ou
seja o problema original de volta pela porta do lado.

Falha em vez de publicar quando algo não bate certo: um HTML a apontar para uma
foto que não existe é pior do que uma publicação falhada.

Uso: injetar-imagens.py [raiz_do_site] [content.json]
"""
import hashlib
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

SITE = 'https://armazemdospneus.pt'
# O topo mostra a foto num contentor de 460 px (.hero__media), portanto 1400 px
# no lado maior cobre ecrãs de 2x com folga. Acima disto só se pagam bytes.
LADO_MAX = 1400
QUALIDADE = 82
PASTA_OPT = 'assets/uploads/opt'

# data-img no HTML  ->  caminho dentro do content.json
MAPA = {
    'hero': ('hero', 'image'),
    'sobre': ('sobre', 'image'),
}


def relativo(p):
    """Mesma normalização do main.js: o Pages CMS grava com barra à frente
    (media.output = /assets/uploads) e o HTML usa caminhos relativos."""
    return re.sub(r'^/+', '', (p or '').strip())


def otimizar(origem, raiz, slot):
    """Cria o JPEG reduzido dentro de raiz e devolve o caminho relativo."""
    with Image.open(origem) as im:
        antes = im.size
        # A orientação do telemóvel: uma foto tirada ao alto guarda os pixels
        # deitados e uma etiqueta EXIF (Orientation) a dizer como a rodar. O
        # JPEG que sai daqui não leva o EXIF, portanto a rotação tem de ser
        # aplicada aos pixels — sem isto, uma foto posta à mão com Orientation
        # ≠ 1 saía deitada no site. Um EXIF estragado não pára a publicação:
        # fica a foto como está, e avisa-se.
        try:
            im = ImageOps.exif_transpose(im)
        except Exception as e:  # noqa: BLE001 — qualquer EXIF ilegível
            print(f'    AVISO: {slot}: não consegui ler a orientação da foto ({e}); fica como está')
        im = im.convert('RGB')  # descarta alfa: um JPEG não o tem
        if max(im.size) > LADO_MAX:
            im.thumbnail((LADO_MAX, LADO_MAX), Image.LANCZOS)
        depois = im.size
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=QUALIDADE, optimize=True, progressive=True)

    dados = buf.getvalue()
    rel = f'{PASTA_OPT}/{slot}-{hashlib.sha256(dados).hexdigest()[:10]}.jpg'
    destino = raiz / rel
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(dados)

    kb_a, kb_d = origem.stat().st_size / 1024, len(dados) / 1024
    print(f'    {slot}: {antes[0]}x{antes[1]} {kb_a:,.0f} KB -> '
          f'{depois[0]}x{depois[1]} {kb_d:,.0f} KB (-{100 - kb_d / kb_a * 100:.0f}%)')
    return rel


def main():
    raiz = Path(sys.argv[1] if len(sys.argv) > 1 else '_site')
    dados = Path(sys.argv[2] if len(sys.argv) > 2 else 'data/content.json')

    conteudo = json.loads(dados.read_text(encoding='utf-8'))
    pagina = raiz / 'index.html'
    if not pagina.exists():
        sys.exit(f'ERRO: {pagina} não existe')

    html = pagina.read_text(encoding='utf-8')
    finais = {}   # slot -> caminho que tem de ficar no HTML
    trocas = []   # (slot, antigo, novo)

    for slot, (sec, campo) in MAPA.items():
        origem_rel = relativo((conteudo.get(sec) or {}).get(campo))
        if not origem_rel:
            sys.exit(f'ERRO: content.json não tem {sec}.{campo}')
        origem = raiz / origem_rel
        if not origem.exists():
            sys.exit(f'ERRO: {sec}.{campo} aponta para "{origem_rel}", '
                     f'que não existe em {raiz}/')

        novo = otimizar(origem, raiz, slot)
        finais[slot] = novo

        # a tag inteira, sem depender da ordem dos atributos
        m = re.search(r'<img\b[^>]*\bdata-img="' + re.escape(slot) + r'"[^>]*>', html)
        if not m:
            sys.exit(f'ERRO: não encontrei <img data-img="{slot}"> em {pagina}')
        tag = m.group(0)
        ms = re.search(r'\bsrc="([^"]*)"', tag)
        if not ms:
            sys.exit(f'ERRO: a <img data-img="{slot}"> não tem src')
        antigo = relativo(ms.group(1))
        if antigo == novo:
            continue

        # 1) o src da própria tag
        html = html[:m.start()] + tag[:ms.start(1)] + novo + tag[ms.end(1):] + html[m.end():]
        # 2) as referências absolutas (JSON-LD)
        n_abs = html.count(f'{SITE}/{antigo}')
        html = html.replace(f'{SITE}/{antigo}', f'{SITE}/{novo}')
        trocas.append((slot, antigo, novo, n_abs))

    pagina.write_text(html, encoding='utf-8')
    for slot, antigo, novo, n_abs in trocas:
        print(f'    {slot}: {antigo} -> {novo}  (+{n_abs} no JSON-LD)')

    # --- confirmação: o que ficou escrito é o que devia ---
    final = pagina.read_text(encoding='utf-8')
    for slot, esperado in finais.items():
        tag = re.search(r'<img\b[^>]*\bdata-img="' + re.escape(slot) + r'"[^>]*>', final).group(0)
        obtido = relativo(re.search(r'\bsrc="([^"]*)"', tag).group(1))
        if obtido != esperado:
            sys.exit(f'ERRO na verificação: {slot} ficou "{obtido}", esperado "{esperado}"')
        if not (raiz / esperado).exists():
            sys.exit(f'ERRO na verificação: {esperado} não existe em {raiz}/')
    for slot, antigo, _novo, _n in trocas:
        if f'{SITE}/{antigo}' in final:
            sys.exit(f'ERRO na verificação: ainda há referências a {SITE}/{antigo}')
    print('    verificado ✓')


if __name__ == '__main__':
    main()
