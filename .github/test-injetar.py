#!/usr/bin/env python3
"""
A BATERIA DO .github/injetar-conteudo.py.

Corre em local (no Mac, com o python do venv: o python3 do sistema é o do Xcode):

    <python> .github/test-injetar.py

O que prova:
  · cada marcador, cada atributo, as metas e o JSON-LD, sobre páginas pequenas;
  · o escape: um «<» do dono nunca vira etiqueta, «</script>» não sai do JSON-LD,
    as aspas não partem um atributo, e o **negrito**/*itálico* só DEPOIS do escape;
  · o horário: dias seguidos juntam-se, dois períodos, dias fechados, minutos;
  · injectar duas vezes dá o mesmo;
  · as falhas: cada uma pára, com a mensagem que diz onde se corrige;
  · O CAMINHO DO CLIENTE (memória testar-o-caminho-do-cliente): sobre as
    páginas VERDADEIRAS do repositório, muda-se cada campo de site.json,
    empresa.json e settings.json, um a um, e confere-se que o valor novo
    aparece onde deve e o antigo desaparece de todas as páginas.
"""
import copy
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True   # nada de .github/__pycache__ ao importar o injector
RAIZ = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('injetar', RAIZ / '.github' / 'injetar-conteudo.py')
I = importlib.util.module_from_spec(spec)
spec.loader.exec_module(I)

passou = 0
falhou = 0


def certo(c, descricao, extra=''):
    global passou, falhou
    if c:
        passou += 1
        print(f'  ✓ {descricao}')
    else:
        falhou += 1
        print(f'  ✗ {descricao}' + (f'  — {extra}' if extra else ''))


def secao(t):
    print(f'\n— {t}')


def ler(rel):
    return (RAIZ / rel).read_text(encoding='utf-8')


SITE = json.loads(ler('data/site.json'))
EMPRESA = json.loads(ler('data/empresa.json'))
SETTINGS = json.loads(ler('data/settings.json'))
PAGINAS = sorted(p.relative_to(RAIZ).as_posix() for p in RAIZ.rglob('*.html')
                 if not ({'.git', '_site', '_source', 'node_modules', 'worker', '.github'} & set(p.relative_to(RAIZ).parts)))
HTML = {rel: ler(rel) for rel in PAGINAS}


def dados(site=None, empresa=None, settings=None):
    return I.Dados(copy.deepcopy(site or SITE), copy.deepcopy(empresa or EMPRESA), copy.deepcopy(settings or SETTINGS))


def injetar(html, d=None, ficheiro='pagina.html'):
    return I.injetar_html(html, d or dados(), ficheiro)


def falha_de(f):
    """A mensagem da Falha que f() levanta, ou None se não levantar."""
    try:
        f()
    except I.Falha as e:
        return str(e)
    return None


def visivel(html):
    """O HTML sem comentários (os marcadores e as notas para quem mantém o
    site): é o que o browser e o Google lêem."""
    return re.sub(r'<!--.*?-->', '', html, flags=re.S)


def site_publicado(site=None, empresa=None, settings=None):
    d = dados(site, empresa, settings)
    return {rel: visivel(I.injetar_html(t, d, rel)) for rel, t in HTML.items()}


def em_todas(publicado, texto):
    return sum(t.count(texto) for t in publicado.values())


def jsonld(html):
    m = re.search(r'<script\b[^>]*data-ap-jsonld[^>]*>(.*?)</script>', html, re.S)
    return json.loads(m.group(1)) if m else None


def negocio(html):
    d = jsonld(html)
    return next(n for n in d['@graph'] if str(n.get('@id', '')).endswith('#business'))


# =============================================================================
secao('as páginas do repositório, com os dados do repositório')
d0 = dados()
for rel in PAGINAS:
    depois = I.injetar_html(HTML[rel], d0, rel)
    # Só o JSON-LD (reescrito) e os ramos das variantes que não servem mudam.
    limpo = lambda t: re.sub(r'<script\b[^>]*data-ap-jsonld[^>]*>.*?</script>', '', t, flags=re.S)
    # Os Termos e o checkout têm variantes (portes, devolução): a página em bruto
    # mostra os dois ramos, a publicada só o que vale.
    igual = visivel(limpo(depois)) == visivel(limpo(HTML[rel])) or rel in ('legal/termos.html', 'checkout.html')
    certo(igual, f'{rel}: injectar os dados de hoje não muda nada do que se vê (os valores de reserva são os de hoje)')
    certo(I.injetar_html(depois, d0, rel) == depois, f'{rel}: injectar outra vez dá o mesmo')
termos = visivel(I.injetar_html(HTML['legal/termos.html'], d0, 'legal/termos.html'))
certo('não estão incluídos' in termos and 'calculados pelo peso total' not in termos, 'Termos: com os portes a combinar fica só esse ramo')
certo('suportados pela loja' in termos and 'suportados pelo cliente' not in termos, 'Termos: com a devolução vazia, «suportados pela loja»')
certo(visivel(termos).count('<strong>') == visivel(HTML['legal/termos.html']).count('<strong>') - 2, 'Termos: os dois ramos que não servem saíram inteiros (os 2 negritos do ramo da devolução a cargo do cliente)')
jl = jsonld(I.injetar_html(HTML['index.html'], d0, 'index.html'))
n0 = next(n for n in jl['@graph'] if n['@id'].endswith('#business'))
certo(n0['telephone'] == '+351935218857' and n0['vatID'] == 'PT516324950' and n0['address']['postalCode'] == '3885-183', 'JSON-LD: telefone, NIF e código postal escritos a partir dos dados')
certo(n0['openingHoursSpecification'] == [
    {'@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], 'opens': '09:00', 'closes': '19:00'},
    {'@type': 'OpeningHoursSpecification', 'dayOfWeek': 'Saturday', 'opens': '09:00', 'closes': '13:00'},
    {'@type': 'OpeningHoursSpecification', 'dayOfWeek': 'Sunday', 'opens': '00:00', 'closes': '00:00'}], 'JSON-LD: o horário de hoje sai igual ao que estava escrito à mão')
certo(n0['areaServed'][0]['name'] == 'Ovar' and n0['priceRange'] == '€€' and n0['image'], 'JSON-LD: o que não vem do painel (área servida, preços, imagens) fica como estava')

# =============================================================================
secao('cada marcador de texto, numa página pequena')
d = dados()
casos = {
    'telefone': '935 218 857', 'telefone-2': '932 948 572', 'whatsapp': '935 218 857',
    'email': SITE['contactos']['email'], 'nota-chamada': '(Chamada para a rede móvel nacional)',
    'morada-rua': 'Travessa do Navega, 436 F', 'morada-localidade': 'Arada, Ovar',
    'morada-cp-localidade': '3885-183 Arada, Ovar', 'morada-linha': 'Travessa do Navega, 436 F, 3885-183 Arada, Ovar',
    'nif': '516324950', 'denominacao': 'Motivar &amp; Lucrar, Unipessoal, Lda.', 'nome': 'Armazém dos Pneus', 'registo': '',
    'telefones': '<a href="tel:+351935218857">935 218 857</a><a href="tel:+351932948572">932 948 572</a>',
    'horario': '<strong>Seg. a Sex.: 9h – 19h<br>Sábado: 9h – 13h</strong>',
    'marcas-chip': '+8 marcas', 'prazo-entrega': '2 a 5 dias úteis', 'prazo-maximo': '30 dias',
    'topo-sobretitulo': 'Novos · Seminovos · Preços de revenda',
    'topo-titulo': '<span class="hero__t1">Pneus e oficina</span><span class="hl hero__t2">ao melhor preço</span><span class="hero__t3">em Ovar</span>',
    'ral': '<strong>CNIACC — Centro Nacional de Informação e Arbitragem de Conflitos de Consumo</strong> (<a href="https://www.cniacc.pt" target="_blank" rel="noopener">www.cniacc.pt</a>)',
}
for nome, esperado in casos.items():
    saida = injetar(f'<p><!--ap:{nome}-->RESERVA<!--/ap:{nome}--></p>', d)
    certo(saida == f'<p><!--ap:{nome}-->{esperado}<!--/ap:{nome}--></p>', f'{nome} → {esperado[:60] or "(vazio)"}', saida)
testados = set(casos) | {'servicos', 'servicos-frase', 'marcas', 'topo-frase', 'topo-destaques', 'sobre-titulo', 'sobre-texto',
                         'sobre-pontos', 'contactos-frase', 'rodape-frase', 'portes', 'devolucao', 'custo-devolucao', 'facebook'}
certo(testados == set(I.MARCADORES), 'todos os marcadores da lista têm um caso nesta bateria', ', '.join(sorted(set(I.MARCADORES) ^ testados)))

bloco = injetar('<ul>\n      <!--ap:topo-destaques--><li>x</li><!--/ap:topo-destaques-->\n    </ul>', d)
certo(bloco == '<ul>\n      <!--ap:topo-destaques--><li>Montagem &amp; equilibragem</li>\n      <li>Alinhamento de direção</li>\n      <li>Todas as marcas</li><!--/ap:topo-destaques-->\n    </ul>',
      'um bloco de vários itens separa-os com a indentação da linha do marcador', bloco)
marcas = injetar('  <!--ap:marcas-->x<!--/ap:marcas-->', d)
certo(marcas.count('<span>Lassa</span><i>•</i>') == 2 and '\n  <span>Michelin</span>' in marcas, 'as marcas: duas voltas (a faixa corre sem emenda), uma por linha')
serv = injetar('<!--ap:servicos-->x<!--/ap:servicos-->', d)
certo(serv.count('<article class="svc" data-reveal>') == 9 and I.ICONES['montagem'] in serv and '<h3>Montagem &amp; Equilibragem</h3>' in serv, 'os 9 serviços, com o desenho e o título escapado')
sobre = injetar('<!--ap:sobre-texto-->x<!--/ap:sobre-texto-->', d)
certo(sobre.startswith('<!--ap:sobre-texto--><p>No <strong>Armazém dos Pneus</strong> encontra') and '<em>os nossos clientes são a nossa prioridade!</em></p>' in sobre, 'Sobre: **negrito** e *itálico* viram <strong> e <em>')
certo(injetar('<!--ap:topo-frase-->x<!--/ap:topo-frase-->', d).endswith(' <strong>Os nossos clientes são a nossa prioridade!</strong><!--/ap:topo-frase-->'), 'topo: a frase e a frase em destaque, em negrito')
certo('<li><span aria-hidden="true">✓</span> Orçamentos sem compromisso</li>' in injetar('<!--ap:sobre-pontos-->x<!--/ap:sobre-pontos-->', d), 'Sobre: os pontos com o visto')
for nome, chave in [('servicos-frase', 'servicos'), ('contactos-frase', 'contactos'), ('sobre-titulo', 'sobre')]:
    val = SITE['textos'][chave]['frase' if chave != 'sobre' else 'titulo']
    certo(injetar(f'<!--ap:{nome}-->x<!--/ap:{nome}-->', d) == f'<!--ap:{nome}-->{val}<!--/ap:{nome}-->', f'{nome}: o texto do painel')
certo('<em>Os nossos clientes são a nossa prioridade!</em>' in injetar('<!--ap:rodape-frase-->x<!--/ap:rodape-frase-->', d), 'rodapé: o slogan em itálico')

# =============================================================================
secao('as variantes')
V = '<!--ap:portes se=a-combinar-->A<!--ap:portes senao-->B<!--/ap:portes-->'
s_cobrados = copy.deepcopy(SETTINGS); s_cobrados['shipping']['quote_later'] = False
certo(injetar(V) == '<!--ap:portes se=a-combinar-->A<!--ap:portes senao--><!--/ap:portes-->', 'portes a combinar: fica o primeiro ramo')
certo(injetar(V, dados(settings=s_cobrados)) == '<!--ap:portes se=a-combinar--><!--ap:portes senao-->B<!--/ap:portes-->', 'portes cobrados: fica o «senão»')
s_sem = copy.deepcopy(SETTINGS); del s_sem['shipping']['quote_later']
certo(injetar(V, dados(settings=s_sem)).endswith('senao-->B<!--/ap:portes-->'), 'portes: sem o interruptor gravado, cobrados (como o checkout e o Worker)')
DV = '<!--ap:devolucao se=loja-paga-->loja<!--ap:devolucao senao-->cliente <!--ap:custo-devolucao-->0<!--/ap:custo-devolucao--><!--/ap:devolucao-->'
s_dev = copy.deepcopy(SETTINGS); s_dev['returns']['return_cost_eur'] = 6.5
certo(visivel(injetar(DV)) == 'loja', 'devolução vazia: a loja paga')
certo(visivel(injetar(DV, dados(settings=s_dev))) == 'cliente 6,50 €', 'devolução de 6,50 €: o cliente paga, com o valor (e o marcador de dentro do ramo trocado)')
s_zero = copy.deepcopy(SETTINGS); s_zero['returns']['return_cost_eur'] = 0
certo(visivel(injetar(DV, dados(settings=s_zero))) == 'loja', 'devolução a zero: a loja paga (o mesmo que o checkout diz)')
s_semr = copy.deepcopy(SETTINGS); del s_semr['returns']
certo(visivel(injetar(DV, dados(settings=s_semr))) == 'loja', 'sem o bloco returns (o Pages CMS apaga as chaves vazias): a loja paga')
FB = '<!--ap:facebook se=existe--><a href="x" data-ap-href="facebook">f</a><!--/ap:facebook-->'
certo('href="https://www.facebook.com/armazem.dospeneus/"' in injetar(FB), 'Facebook preenchido: a ligação fica, com o endereço do painel')
sem_fb = copy.deepcopy(SITE); sem_fb['contactos']['facebook'] = ''
certo(visivel(injetar(FB, dados(site=sem_fb))) == '', 'Facebook vazio: a ligação sai')
certo(injetar(V, dados(settings=s_cobrados)) == injetar(injetar(V, dados(settings=s_cobrados)), dados(settings=s_cobrados)), 'variante: injectar duas vezes dá o mesmo')

# =============================================================================
secao('os atributos e as metas')
A = lambda nome, href='x': injetar(f'<a href="{href}" data-ap-href="{nome}">t</a>')
certo(A('tel') == '<a href="tel:+351935218857" data-ap-href="tel">t</a>', 'tel')
certo(A('tel-2') == '<a href="tel:+351932948572" data-ap-href="tel-2">t</a>', 'tel-2')
certo(A('mailto') == f'<a href="mailto:{SITE["contactos"]["email"]}" data-ap-href="mailto">t</a>', 'mailto')
certo(A('whatsapp-orcamento', 'https://wa.me/1?text=Ol%C3%A1%21') == '<a href="https://wa.me/351935218857?text=Ol%C3%A1%21" data-ap-href="whatsapp-orcamento">t</a>', 'wa.me: muda só o número, a mensagem fica como está escrita')
certo(A('whatsapp', 'https://wa.me/1') == '<a href="https://wa.me/351935218857" data-ap-href="whatsapp">t</a>', 'wa.me sem mensagem')
certo(A('mapa-link') == '<a href="https://www.google.com/maps/search/?api=1&amp;query=Travessa%20do%20Navega%20436%20F%2C%203885-183%20Arada%2C%20Ovar" data-ap-href="mapa-link">t</a>', 'mapa-link: a pesquisa pela morada, com o & escapado')
certo(injetar('<button data-map-embed="x" data-ap-attr="data-map-embed:mapa-embed">') == '<button data-map-embed="https://www.google.com/maps?hl=pt&amp;q=Travessa%20do%20Navega%20436%20F%2C%203885-183%20Arada%2C%20Ovar&amp;z=15&amp;output=embed" data-ap-attr="data-map-embed:mapa-embed">', 'data-ap-attr: só esse atributo')
certo(A('ral-url') == '<a href="https://www.cniacc.pt" data-ap-href="ral-url">t</a>' and A('livro-reclamacoes') == '<a href="https://www.livroreclamacoes.pt/inicio" data-ap-href="livro-reclamacoes">t</a>', 'ral-url e livro-reclamacoes')
certo(injetar("<a data-ap-href='tel' class=x href='y'>") == "<a data-ap-href='tel' class=x href='tel:+351935218857'>", 'atributo em qualquer ordem e com aspas simples')
certo(injetar('<meta name="ap:whatsapp" content="x" data-ap-meta /><meta name="ap:telefone" content="y" data-ap-meta />') == '<meta name="ap:whatsapp" content="351935218857" data-ap-meta /><meta name="ap:telefone" content="935 218 857" data-ap-meta />', 'as duas metas')
certo(set(I.ATRIBUTOS) == {'tel', 'tel-2', 'whatsapp', 'whatsapp-orcamento', 'whatsapp-orcamento-servico', 'mailto', 'facebook', 'mapa-embed', 'mapa-link', 'ral-url', 'livro-reclamacoes'}, 'a lista dos atributos é a desta bateria')

# =============================================================================
secao('o escape')
h = copy.deepcopy(SITE)
h['servicos'][0]['titulo'] = 'Pneus <b>"já"</b> </script><!--'
h['servicos'][0]['texto'] = 'Texto & **forte** e *leve*'
h['textos']['topo']['titulo1'] = '<img src=x onerror=alert(1)>'
h['contactos']['facebook'] = 'https://www.facebook.com/a?b=1&c=2'
dh = dados(site=h)
sv = injetar('<!--ap:servicos-->x<!--/ap:servicos-->', dh)
certo('<h3>Pneus &lt;b&gt;"já"&lt;/b&gt; &lt;/script&gt;&lt;!--</h3>' in sv, 'um título com etiquetas sai escapado, e «<!--» não abre um comentário')
certo('<p>Texto &amp; <strong>forte</strong> e <em>leve</em></p>' in sv, 'o & escapa-se e as marcas viram negrito/itálico depois do escape')
certo('&lt;img src=x onerror=alert(1)&gt;' in injetar('<!--ap:topo-titulo-->x<!--/ap:topo-titulo-->', dh), 'uma etiqueta no título do topo não chega a ser etiqueta')
certo('href="https://www.facebook.com/a?b=1&amp;c=2"' in injetar(FB, dh), 'o & de um endereço escapa-se dentro do atributo')
aspas = copy.deepcopy(SITE); aspas['contactos']['facebook'] = 'https://www.facebook.com/a" onclick="x'
certo(falha_de(lambda: dados(site=aspas)) is not None, 'um endereço com aspas não passa (não chega a partir o atributo)')
jh = injetar('<script type="application/ld+json" data-ap-jsonld>{"@graph":[{"@id":"https://x/#business"}]}</script>', dh)
certo('</script><!--' not in jh.split('data-ap-jsonld>')[1].split('</script>')[0] and '\\u003c/script>' in jh, 'JSON-LD: «</script>» num título sai como \\u003c/script> e não fecha o bloco')
certo(jsonld(jh)['@graph'][0]['hasOfferCatalog']['itemListElement'][0]['itemOffered']['name'] == 'Pneus <b>"já"</b> </script><!--', 'e o JSON-LD, lido, diz o título tal e qual')
certo(jsonld(jh)['@graph'][0]['hasOfferCatalog']['itemListElement'][0]['itemOffered']['description'] == 'Texto & forte e leve', 'no JSON-LD as marcas de negrito e itálico saem')

# =============================================================================
secao('o horário')


def horario(dias, nota=''):
    s = copy.deepcopy(SITE)
    s['horario'] = {'dias': {k: dias.get(k, []) for k in I.DIAS}, 'nota': nota}
    return dados(site=s)


def iv(*pares):
    return [{'abre': a, 'fecha': f} for a, f in pares]


H = lambda d: visivel(injetar('<!--ap:horario-->x<!--/ap:horario-->', d))
semana = {k: iv(('08:30', '12:30'), ('14:00', '18:00')) for k in ['seg', 'ter', 'qua', 'qui', 'sex']}
dh = horario(semana, 'Fechado nos feriados.')
certo(H(dh) == '<strong>Seg. a Sex.: 8h30 – 12h30 e 14h – 18h</strong><span class="contact__note">Fechado nos feriados.</span>', 'dois períodos, minutos quando não são 00, sábado e domingo fechados omitidos, e a nota por baixo', H(dh))
esp = negocio(injetar('<script type="application/ld+json" data-ap-jsonld>{"@graph":[{"@id":"x#business"}]}</script>', dh))['openingHoursSpecification']
certo(len(esp) == 3 and esp[0]['opens'] == '08:30' and esp[1]['opens'] == '14:00' and esp[2] == {'@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Saturday', 'Sunday'], 'opens': '00:00', 'closes': '00:00'}, 'JSON-LD: um por período, e os dias fechados seguidos juntos com 00:00', json.dumps(esp))
salteado = horario({'seg': iv(('09:00', '19:00')), 'ter': iv(('10:00', '19:00')), 'qua': iv(('09:00', '19:00')), 'sab': iv(('09:00', '13:00'))})
certo(H(salteado) == '<strong>Segunda: 9h – 19h<br>Terça: 10h – 19h<br>Quarta: 9h – 19h<br>Sábado: 9h – 13h</strong>', 'só se juntam dias SEGUIDOS; um dia sozinho leva o nome inteiro', H(salteado))
certo(H(horario({})) == '<strong>Encerrado</strong>', 'todos os dias fechados: «Encerrado»')
certo(H(horario({'sab': iv(('09:00', '13:00')), 'dom': iv(('09:00', '13:00'))})) == '<strong>Sáb. a Dom.: 9h – 13h</strong>', 'dois dias seguidos: abreviados, com «a»')
certo(H(horario({'seg': iv(('14:00', '18:00'), ('09:00', '12:00'))})) == '<strong>Segunda: 9h – 12h e 14h – 18h</strong>', 'os períodos saem por ordem, mesmo gravados ao contrário')

# =============================================================================
secao('os prazos e o registo')
P = lambda s: visivel(injetar('<!--ap:prazo-entrega-->x<!--/ap:prazo-entrega-->|<!--ap:prazo-maximo-->x<!--/ap:prazo-maximo-->', dados(settings=s)))
sp = copy.deepcopy(SETTINGS); sp['delivery'].update(estimate_min_days=3, estimate_max_days=7, max_days=20)
certo(P(sp) == '3 a 7 dias úteis|20 dias', 'prazos mudados')
sp['delivery'].update(estimate_min_days=1, estimate_max_days=1, max_days=1)
certo(P(sp) == '1 dia útil|1 dia', 'um dia: no singular')
e2 = copy.deepcopy(EMPRESA); e2.update(capital_social=5000, conservatoria='Conservatória do Registo Comercial de Ovar')
certo(visivel(injetar('NIF 1.<!--ap:registo-->x<!--/ap:registo--> Sede', dados(empresa=e2))) == 'NIF 1. Capital social: 5000,00 €. Matriculada na Conservatória do Registo Comercial de Ovar. Sede', 'registo (CSC art. 171.º): capital social e conservatória, quando preenchidos')
certo(visivel(injetar('NIF 1.<!--ap:registo-->x<!--/ap:registo--> Sede')) == 'NIF 1. Sede', 'registo: vazios, não se escreve nada')

# Achados L6-06/L7-02: o resumo do checkout.html não tinha marcadores — sem o
# settings.json no browser, dizia os valores escritos à mão.
spc = copy.deepcopy(SETTINGS); spc['delivery'].update(estimate_min_days=3, estimate_max_days=7, max_days=20); spc['returns']['return_cost_eur'] = 6.5
co = visivel(I.injetar_html(HTML['checkout.html'], dados(settings=spc), 'checkout.html'))
certo('Entrega em <span id="recap-prazo">3 a 7 dias úteis</span>, nunca mais de <span id="recap-max">20 dias</span>.' in co
      and 'no valor de 6,50 €.</span>' in co and 'suportados pela loja' not in co,
      'checkout.html: o resumo (prazos e devolução) sai escrito pela publicação, como nos Termos')
co0 = visivel(I.injetar_html(HTML['checkout.html'], dados(), 'checkout.html'))
certo('nunca mais de <span id="recap-max">30 dias</span>.' in co0 and '<span id="recap-devolucao">os custos de devolução são suportados pela loja.</span>' in co0,
      '   e com os valores de hoje diz o mesmo de sempre')

# =============================================================================
secao('o geo e o mapa inválidos ficam de fora (para a guarda são só aviso)')
JL = '<script type="application/ld+json" data-ap-jsonld>{"@graph":[{"@id":"x#business","geo":{"latitude":1},"hasMap":"y"}]}</script>'
certo('geo' in negocio(injetar(JL)) and negocio(injetar(JL))['hasMap'] == EMPRESA['mapa'], 'válidos: entram')
for desc, mudar in [('coordenadas como texto', lambda e: e.update(geo={'lat': 'norte', 'lng': 1})), ('latitude 200', lambda e: e.update(geo={'lat': 200, 'lng': 1})),
                    ('sem coordenadas', lambda e: e.pop('geo')), ('mapa sem https', lambda e: e.update(mapa='http://maps.app.goo.gl/x')), ('sem mapa', lambda e: e.pop('mapa'))]:
    e3 = copy.deepcopy(EMPRESA); mudar(e3)
    msg = falha_de(lambda: injetar(JL, dados(empresa=e3)))
    n = negocio(injetar(JL, dados(empresa=e3))) if msg is None else {}
    chave = 'geo' if 'coord' in desc or 'latitude' in desc else 'hasMap'
    certo(msg is None and chave not in n, f'{desc}: publica, e «{chave}» sai do JSON-LD', msg or '')

# =============================================================================
secao('o «vazio» e o «espaço» são os do JavaScript (o regras.mjs decide com eles)')
# Achado L3-01: o painel e a guarda (trim() e \s do JavaScript) aceitavam
# valores que aqui (strip() e \s do Python) paravam a publicação inteira.
# O injector tem de ser IGUAL OU MAIS LARGO do que as regras.
def sem_falha(desc, f, extra=lambda r: True):
    try:
        r = f()
    except I.Falha as e:
        certo(False, desc, f'parou: {e}')
        return None
    certo(extra(r), desc, repr(r)[:200])
    return r


s_feff = copy.deepcopy(SITE); s_feff['contactos']['telefone2'] = '\ufeff'
sem_falha('segundo telefone que é só U+FEFF: está vazio (como para o trim() do painel), e não é um telefone mal escrito',
          lambda: dados(site=s_feff), lambda d: d.telefone2 == '')
s_fb = copy.deepcopy(SITE); s_fb['contactos']['facebook'] = '\ufeff'
sem_falha('Facebook que é só U+FEFF: está vazio, e a ligação sai', lambda: visivel(injetar(FB, dados(site=s_fb))), lambda h: 'facebook' not in h.lower())
s_85 = copy.deepcopy(SITE); s_85['servicos'][0]['texto'] = '\u0085'
sem_falha('texto de serviço que é só U+0085: não está vazio para o trim() do painel, e aqui também não (as regras recusam-no antes)',
          lambda: dados(site=s_85))
s_1c = copy.deepcopy(SITE); s_1c['textos']['rodape']['frase'] = '\u001c'
sem_falha('frase que é só U+001C: idem', lambda: injetar('<!--ap:rodape-frase-->x<!--/ap:rodape-frase-->', dados(site=s_1c)))
s_url = copy.deepcopy(SITE); s_url['contactos']['facebook'] = 'https://www.facebook.com/a\u001fb'
sem_falha('Facebook com U+001F lá dentro: o \\s do JavaScript não o apanha, e o daqui também não', lambda: dados(site=s_url), lambda d: d.facebook.endswith('a\u001fb'))
s_tel = copy.deepcopy(SITE); s_tel['contactos']['telefone'] = '\ufeff935 218 857\u3000'
sem_falha('telefone com U+FEFF e U+3000 nas pontas: tirados, como faz o trim()', lambda: dados(site=s_tel), lambda d: d.telefone == '935 218 857')
s_85p = copy.deepcopy(SITE); s_85p['contactos']['telefone'] = '935 218 857\u0085'
certo(falha_de(lambda: dados(site=s_85p)) is not None, 'mas um telefone com U+0085 no fim continua mal escrito (o trim() do painel também não o tira)')
e_dist = copy.deepcopy(EMPRESA); e_dist['morada']['distrito'] = 5
r = sem_falha('distrito que não é texto (para a guarda é só aviso): publica, e sai do JSON-LD',
              lambda: negocio(injetar(JL, dados(empresa=e_dist))), lambda n: 'addressRegion' not in n['address'])
st_f = copy.deepcopy(SETTINGS); st_f['delivery'].update(estimate_min_days=2.0, estimate_max_days=5.0, max_days=30.0)
sem_falha('prazos escritos 2.0, 5.0 e 30.0 (o JSON.parse do JavaScript lê inteiros): publica, e diz «2 a 5 dias úteis»',
          lambda: visivel(injetar('<!--ap:prazo-entrega-->x<!--/ap:prazo-entrega-->|<!--ap:prazo-maximo-->x<!--/ap:prazo-maximo-->', dados(settings=st_f))),
          lambda h: h == '2 a 5 dias úteis|30 dias')
st_q = copy.deepcopy(SETTINGS); st_q['delivery'].update(estimate_min_days=2.5)
certo(falha_de(lambda: dados(settings=st_q)) is not None, 'mas 2.5 continua a não ser um prazo')
e_ral = copy.deepcopy(EMPRESA); e_ral['ral']['url'] = 'https://ex\u2100mple.pt'
msg = falha_de(lambda: injetar('<!--ap:ral-->x<!--/ap:ral-->', dados(empresa=e_ral)))
certo(msg is None or '* sem par' not in msg, 'um endereço que o urlsplit recusa (ValueError) não passa por «um * sem par»', msg or '')

# Achado L8-02: um Facebook sem «facebook.com» em minúsculas ficava duas vezes
# no sameAs à segunda injecção, e a prova de idempotência parava a publicação.
for fbx in ('https://www.Facebook.com/ArmazemDosPneus', 'https://fb.me/armazemdospneus', 'https://www.instagram.com/armazemdospneus'):
    sfb = copy.deepcopy(SITE); sfb['contactos']['facebook'] = fbx
    d_fb = dados(site=sfb)
    uma = I.injetar_html(HTML['index.html'], d_fb, 'index.html')
    duas = I.injetar_html(uma, d_fb, 'index.html')
    same = negocio(uma).get('sameAs') or []
    certo(duas == uma and same.count(fbx) == 1 and not any('facebook.com/armazem.dospeneus' in x for x in same),
          f'Facebook «{fbx}»: injectar duas vezes dá o mesmo, e o sameAs tem-no uma vez (e já não o antigo)', repr(same))

# =============================================================================
secao('as falhas: cada uma pára, e diz onde se corrige')
S = lambda f: (lambda s: (f(s), s)[1])(copy.deepcopy(SITE))
Emp = lambda f: (lambda e: (f(e), e)[1])(copy.deepcopy(EMPRESA))
Set = lambda f: (lambda s: (f(s), s)[1])(copy.deepcopy(SETTINGS))
FALHAS_DADOS = [
    ('sem telefone', dict(site=S(lambda s: s['contactos'].pop('telefone'))), 'Contactos e horário'),
    ('telefone com letras', dict(site=S(lambda s: s['contactos'].update(telefone='93x 218 857'))), 'Contactos e horário'),
    ('WhatsApp com +', dict(site=S(lambda s: s['contactos'].update(whatsapp='+351935218857'))), 'Contactos e horário'),
    ('WhatsApp sem o 351 (o wa.me lia +91, a Índia)', dict(site=S(lambda s: s['contactos'].update(whatsapp='912345678'))), 'Contactos e horário'),
    ('WhatsApp com 00351', dict(site=S(lambda s: s['contactos'].update(whatsapp='00351912345678'))), 'Contactos e horário'),
    ('email sem @', dict(site=S(lambda s: s['contactos'].update(email='loja'))), 'Contactos e horário'),
    ('Facebook sem https', dict(site=S(lambda s: s['contactos'].update(facebook='http://facebook.com/x'))), 'Contactos e horário'),
    ('sem a nota da chamada', dict(site=S(lambda s: s['contactos'].update(nota_chamada=''))), 'Contactos e horário'),
    ('hora 9:00', dict(site=S(lambda s: s['horario']['dias'].update(seg=[{'abre': '9:00', 'fecha': '19:00'}]))), 'Contactos e horário'),
    ('abre depois de fechar', dict(site=S(lambda s: s['horario']['dias'].update(seg=[{'abre': '19:00', 'fecha': '09:00'}]))), 'Contactos e horário'),
    ('períodos sobrepostos', dict(site=S(lambda s: s['horario']['dias'].update(seg=iv(('09:00', '14:00'), ('13:00', '19:00'))))), 'Contactos e horário'),
    ('um dia em falta', dict(site=S(lambda s: s['horario']['dias'].pop('qua'))), 'Contactos e horário'),
    ('serviço com um desenho que não existe', dict(site=S(lambda s: s['servicos'][0].update(icone='foguete'))), 'Serviços'),
    ('nenhum serviço', dict(site=S(lambda s: s.update(servicos=[]))), 'Serviços'),
    ('sem o título do topo', dict(site=S(lambda s: s['textos']['topo'].pop('titulo2'))), 'Textos da página inicial'),
    ('marcas com um nome vazio', dict(site=S(lambda s: s['marcas'].append(' '))), 'Textos da página inicial'),
    ('NIF com 8 algarismos', dict(empresa=Emp(lambda e: e.update(nif='51632495'))), 'Dados da empresa'),
    ('código postal sem hífen', dict(empresa=Emp(lambda e: e['morada'].update(cp='3885183'))), 'Dados da empresa'),
    ('sem rua', dict(empresa=Emp(lambda e: e['morada'].pop('rua'))), 'Dados da empresa'),
    ('RAL sem https', dict(empresa=Emp(lambda e: e['ral'].update(url='www.cniacc.pt'))), 'Dados da empresa'),
    ('capital social negativo', dict(empresa=Emp(lambda e: e.update(capital_social=-1))), 'Dados da empresa'),
    ('prazo máximo de 31 dias', dict(settings=Set(lambda s: s['delivery'].update(max_days=31))), 'Loja online › Prazos e devoluções'),
    ('estimativa ao contrário', dict(settings=Set(lambda s: s['delivery'].update(estimate_min_days=9))), 'Loja online › Prazos e devoluções'),
    ('custo de devolução como texto', dict(settings=Set(lambda s: s['returns'].update(return_cost_eur='5'))), 'Loja online › Prazos e devoluções'),
]
for desc, kw, ecra in FALHAS_DADOS:
    msg = falha_de(lambda: site_publicado(**kw))   # o caminho inteiro: ler os dados e escrever as páginas
    certo(msg is not None and f'«{ecra}»' in msg, f'{desc} → pára, e diz «{ecra}»', msg or 'não parou')
negrito = copy.deepcopy(SITE); negrito['textos']['sobre']['paragrafos'][0] = 'No **Armazém dos Pneus encontra'
msg = falha_de(lambda: injetar('<!--ap:sobre-texto-->x<!--/ap:sobre-texto-->', dados(site=negrito)))
certo(msg is not None and '*' in msg and '«Textos da página inicial»' in msg, 'um ** sem par pára, e diz onde', msg or 'não parou')
FALHAS_PAGINA = [
    ('marcador desconhecido', '<!--ap:telefonee-->x<!--/ap:telefonee-->', 'não existe'),
    ('aberto sem fecho', '<p><!--ap:telefone-->x</p>', 'abre e não fecha'),
    ('fecho sem abertura', 'x<!--/ap:telefone-->', 'fecha sem ter aberto'),
    ('fecho trocado', '<!--ap:telefone-->x<!--/ap:email-->', 'fecha sem ter aberto'),
    ('«senão» fora de uma variante', '<!--ap:telefone-->x<!--ap:telefone senao-->y<!--/ap:telefone-->', 'fora de sítio'),
    ('dois «senão»', '<!--ap:portes se=a-combinar-->a<!--ap:portes senao-->b<!--ap:portes senao-->c<!--/ap:portes-->', 'fora de sítio'),
    ('condição errada', '<!--ap:portes se=sempre-->a<!--/ap:portes-->', 'tem de ser «se=a-combinar»'),
    ('variante sem condição', '<!--ap:facebook-->a<!--/ap:facebook-->', 'é uma variante'),
    ('condição num texto', '<!--ap:telefone se=existe-->a<!--/ap:telefone-->', 'não é uma variante'),
    ('marcador dentro de um texto', '<!--ap:morada-linha--><!--ap:nif-->1<!--/ap:nif--><!--/ap:morada-linha-->', 'trocado por inteiro'),
    ('atributo desconhecido', '<a href="x" data-ap-href="twitter">', 'não existe'),
    ('atributo sem o href', '<a data-ap-href="tel">', 'não tem o atributo «href»'),
    ('data-ap-attr sem alvo', '<b data-ap-attr="mapa-embed">', 'não existe'),
    ('wa.me numa ligação que não é do WhatsApp', '<a href="tel:1" data-ap-href="whatsapp-orcamento">', 'não é do WhatsApp'),
    ('meta desconhecida', '<meta name="ap:fax" content="1" data-ap-meta>', 'não existe'),
    ('JSON-LD ilegível', '<script type="application/ld+json" data-ap-jsonld>{x</script>', 'não se lêem'),
    ('JSON-LD sem o #business', '<script type="application/ld+json" data-ap-jsonld>{"@id":"x"}</script>', '«#business»'),
]
for desc, html, pedaco in FALHAS_PAGINA:
    msg = falha_de(lambda: injetar(html))
    certo(msg is not None and pedaco in msg and 'Só o Renato' in msg and 'linha 1' in msg, f'{desc} → pára, com a linha', msg or 'não parou')
msg = falha_de(lambda: injetar(FB.replace('<!--ap:facebook se=existe-->', '').replace('<!--/ap:facebook-->', ''), dados(site=sem_fb)))
certo(msg is not None and 'Facebook' in msg, 'uma ligação ao Facebook fora da variante, com o Facebook vazio: pára', msg or 'não parou')

# =============================================================================
secao('o caminho do cliente: cada campo mudado, sobre as páginas verdadeiras')
HOJE = site_publicado()


def muda(desc, novo_aparece, antigo_some, site=None, empresa=None, settings=None, minimo=1, excepto=()):
    pub = site_publicado(site, empresa, settings)
    n_novo = em_todas(pub, novo_aparece)
    restos = {rel: t.count(antigo_some) for rel, t in pub.items() if antigo_some in t and rel not in excepto}
    antes = em_todas(HOJE, antigo_some)
    certo(n_novo >= minimo and not restos and antes > 0,
          f'{desc}: «{novo_aparece}» aparece {n_novo}×, e o antigo (estava {antes}×) desapareceu de todas as páginas',
          f'novo {n_novo}×; o antigo ainda em {restos}')
    return pub


c = lambda f: (lambda s: (f(s), s)[1])(copy.deepcopy(SITE))
e_ = lambda f: (lambda e: (f(e), e)[1])(copy.deepcopy(EMPRESA))
pub = muda('telefone', '912 345 678', 'tel:+351935218857', site=c(lambda s: s['contactos'].update(telefone='912 345 678')), minimo=10)
certo(em_todas(pub, 'tel:+351912345678') == em_todas(HOJE, 'tel:+351935218857'), '   e cada ligação tel: passou para o número novo')
certo(all(t.count('935 218 857') == (1 if rel == 'index.html' else 0) for rel, t in pub.items()), '   o 935 218 857 só fica no cartão do WhatsApp (que é outro campo)')
certo(negocio(pub['index.html'])['telephone'] == '+351912345678', '   e o JSON-LD diz o número novo')
pub = muda('segundo telefone vazio', 'tel:+351935218857', '932 948 572', site=c(lambda s: s['contactos'].pop('telefone2')))
pub = muda('WhatsApp', 'https://wa.me/351912000111', 'wa.me/351935218857', site=c(lambda s: s['contactos'].update(whatsapp='351912000111')), minimo=9)
certo('<strong>912 000 111</strong>' in pub['index.html'] and all('content="351912000111"' in t for rel, t in pub.items() if not rel.startswith('admin/')), '   o cartão «WhatsApp» mostra o número novo, e a meta ap:whatsapp de cada página também')
pub = muda('email', 'loja@exemplo.pt', SITE['contactos']['email'], site=c(lambda s: s['contactos'].update(email='loja@exemplo.pt')), minimo=10)
certo(em_todas(pub, 'mailto:loja@exemplo.pt') == em_todas(HOJE, 'mailto:' + SITE['contactos']['email']), '   e cada mailto:')
muda('nota da chamada', '(Chamada para a rede fixa nacional)', 'rede móvel', site=c(lambda s: s['contactos'].update(nota_chamada='(Chamada para a rede fixa nacional)')), minimo=8)
pub = muda('Facebook vazio', 'footer__social', 'facebook.com/armazem', site=c(lambda s: s['contactos'].update(facebook='')))
certo('sameAs' not in negocio(pub['index.html']), '   e o sameAs sai do JSON-LD')
muda('Facebook mudado', 'https://www.facebook.com/outra.pagina/', 'facebook.com/armazem', site=c(lambda s: s['contactos'].update(facebook='https://www.facebook.com/outra.pagina/')), minimo=3)
pub = muda('rua', 'Rua Nova, 12', 'Travessa do Navega', empresa=e_(lambda e: e['morada'].update(rua='Rua Nova, 12')), minimo=8)
certo(em_todas(pub, 'Navega%20436') == 0, '   e os dois endereços do mapa deixaram de procurar a rua antiga')
certo('Rua%20Nova%2012%2C%203885-183' in pub['index.html'] and negocio(pub['index.html'])['address']['streetAddress'] == 'Rua Nova, 12', '   o mapa procura a rua nova, e o JSON-LD diz a rua nova')
pub = muda('código postal', '4000-123', '3885-183', empresa=e_(lambda e: e['morada'].update(cp='4000-123')), minimo=8)
pub = muda('localidade e concelho iguais', '4000-123 Porto<', '3885-183', empresa=e_(lambda e: e['morada'].update(cp='4000-123', localidade='Porto', concelho='Porto')), minimo=3)
certo('Porto, Porto' not in ''.join(pub.values()), '   «Porto, Porto» não se repete: o concelho só aparece quando é outro')
muda('NIF', '500000000', '516324950', empresa=e_(lambda e: e.update(nif='500000000')), minimo=9)
muda('denominação', 'Outra Empresa, Lda.', 'Motivar', empresa=e_(lambda e: e.update(denominacao='Outra Empresa, Lda.')), minimo=6)
pub = muda('nome', 'Pneus do Norte', '«Armazém dos Pneus»', empresa=e_(lambda e: e.update(nome='Pneus do Norte')), minimo=8)
pub = muda('RAL', 'Centro de Arbitragem X', 'CNIACC', empresa=e_(lambda e: e.update(ral={'nome': 'Centro de Arbitragem X', 'url': 'https://www.x.pt/'})))
certo('<a href="https://www.x.pt/" target="_blank" rel="noopener">www.x.pt</a>' in pub['legal/termos.html'], '   a ligação e o domínio mostrado são os novos')
muda('Livro de Reclamações', 'https://www.livroreclamacoes.pt/novo', 'href="https://www.livroreclamacoes.pt/inicio"', empresa=e_(lambda e: e.update(livro_reclamacoes='https://www.livroreclamacoes.pt/novo')), minimo=7)
pub = site_publicado(empresa=e_(lambda e: e.update(capital_social=5000, conservatoria='Conservatória do Registo Comercial de Ovar')))
certo('NIF 516324950. Capital social: 5000,00 €. Matriculada na Conservatória do Registo Comercial de Ovar. Sede:' in pub['legal/termos.html'], 'capital social e conservatória: entram na identificação dos Termos')
pub = muda('horário', 'Seg. a Sex.: 8h30 – 12h30 e 14h – 18h', '9h – 19h', site=c(lambda s: s['horario']['dias'].update({k: iv(('08:30', '12:30'), ('14:00', '18:00')) for k in ['seg', 'ter', 'qua', 'qui', 'sex']})))
certo(negocio(pub['index.html'])['openingHoursSpecification'][0]['opens'] == '08:30', '   e o JSON-LD diz o horário novo')
novo_servico = {'id': 'diagnostico', 'titulo': 'Diagnóstico', 'texto': 'Diagnóstico **eletrónico** multimarca.', 'icone': 'generico'}
pub = muda('serviços: tirar um e pôr outro', '<h3>Diagnóstico</h3><p>Diagnóstico <strong>eletrónico</strong> multimarca.</p>', 'Embraiagem', site=c(lambda s: s.update(servicos=[x for x in s['servicos'] if x['id'] != 'embraiagem'] + [novo_servico])))
certo(I.ICONES['generico'] in pub['index.html'] and [x['itemOffered']['name'] for x in negocio(pub['index.html'])['hasOfferCatalog']['itemListElement']][-1] == 'Diagnóstico', '   com o desenho genérico, e no JSON-LD')
pub = muda('marcas: mais a Achilles', '<strong>+9 marcas</strong>', '+8 marcas', site=c(lambda s: s['marcas'].append('Achilles')))
certo(pub['index.html'].count('<span>Achilles</span>') == 2, '   e a Achilles entra nas duas voltas da faixa')
for desc, caminho in [('topo › sobretítulo', ('topo', 'sobretitulo')), ('topo › 1.ª linha do título', ('topo', 'titulo1')), ('topo › frase', ('topo', 'frase')),
                      ('topo › frase em destaque', ('topo', 'frase_destaque')), ('serviços › frase', ('servicos', 'frase')), ('Sobre › título', ('sobre', 'titulo')),
                      ('contactos › frase', ('contactos', 'frase')), ('rodapé › frase', ('rodape', 'frase'))]:
    antigo = I.com_marcas(SITE['textos'][caminho[0]][caminho[1]])
    # O slogan também está na descrição da página (SEO, do Renato) e no rodapé
    # (outro campo): o que tem de sumir é o do destaque, em negrito.
    antigo = f'<strong>{antigo}</strong>' if caminho[1] == 'frase_destaque' else antigo
    muda(desc, f'Texto novo de ensaio ({desc})', antigo, site=c(lambda s: s['textos'][caminho[0]].update({caminho[1]: f'Texto novo de ensaio ({desc})'})))
muda('topo › destaques', '<li>Ensaio de destaque</li>', '<li>Todas as marcas</li>', site=c(lambda s: s['textos']['topo'].update(destaques=['Ensaio de destaque'])))
muda('Sobre › parágrafos', '<p>Um parágrafo só.</p>', 'enorme variedade', site=c(lambda s: s['textos']['sobre'].update(paragrafos=['Um parágrafo só.'])))
muda('Sobre › pontos', 'Ponto de ensaio', 'Oficina multimarca com serviço rápido', site=c(lambda s: s['textos']['sobre'].update(pontos=['Ponto de ensaio'])))
st = lambda f: (lambda s: (f(s), s)[1])(copy.deepcopy(SETTINGS))
# O checkout.html fica de fora: lá, estes três textos são escritos pelo
# checkout.js a partir do mesmo settings.json, ao abrir (o formulário está
# escondido sem JavaScript). Conferido no browser.
NO_CHECKOUT = ('checkout.html',)
muda('Termos: portes cobrados', 'segundo a tabela apresentada no checkout', 'não estão incluídos', settings=st(lambda s: s['shipping'].update(quote_later=False)), excepto=NO_CHECKOUT)
muda('Termos: devolução a cargo do cliente', '<strong>suportados pelo cliente</strong>, no valor de <strong>6,50 €</strong>', 'suportados pela loja', settings=st(lambda s: s['returns'].update(return_cost_eur=6.5)), excepto=NO_CHECKOUT)
pub = muda('Termos: prazos', 'a estimativa é de 3 a 7 dias úteis', '2 a 5 dias úteis', settings=st(lambda s: s['delivery'].update(estimate_min_days=3, estimate_max_days=7, max_days=20)), excepto=NO_CHECKOUT)
certo('excede <strong>20 dias</strong>' in pub['legal/termos.html'], '   e o prazo máximo também')

# =============================================================================
secao('a linha de comandos')
with tempfile.TemporaryDirectory() as tmp:
    t = Path(tmp)
    for rel, texto in HTML.items():
        (t / 'site' / rel).parent.mkdir(parents=True, exist_ok=True)
        (t / 'site' / rel).write_text(texto, encoding='utf-8')
    py = sys.executable
    script = str(RAIZ / '.github' / 'injetar-conteudo.py')
    r = subprocess.run([py, script, str(t / 'site'), str(RAIZ / 'data/site.json'), str(RAIZ / 'data/empresa.json'), str(RAIZ / 'data/settings.json')], capture_output=True, text=True)
    certo(r.returncode == 0 and 'verificado ✓' in r.stdout and 'index.html:' in r.stdout, 'sobre uma cópia das páginas: sai com 0 e diz o que trocou em cada página', r.stderr)
    primeira = {rel: (t / 'site' / rel).read_text(encoding='utf-8') for rel in HTML}
    r2 = subprocess.run([py, script, str(t / 'site'), str(RAIZ / 'data/site.json'), str(RAIZ / 'data/empresa.json'), str(RAIZ / 'data/settings.json')], capture_output=True, text=True)
    certo(r2.returncode == 0 and all((t / 'site' / rel).read_text(encoding='utf-8') == primeira[rel] for rel in HTML), 'correr outra vez sobre o resultado não muda nada')
    mau = copy.deepcopy(SITE); del mau['contactos']['email']
    (t / 'mau.json').write_text(json.dumps(mau), encoding='utf-8')
    r3 = subprocess.run([py, script, str(t / 'site'), str(t / 'mau.json'), str(RAIZ / 'data/empresa.json'), str(RAIZ / 'data/settings.json')], capture_output=True, text=True)
    certo(r3.returncode == 1 and 'ERRO' in r3.stderr and '«Contactos e horário»' in r3.stderr, 'um dado em falta: sai com 1 e diz o ecrã do painel', r3.stderr.strip())
    # Achado L8-03: a mensagem só ficava no registo; o painel lê as anotações.
    anot = [l for l in r3.stdout.split('\n') if l.startswith('::error ')]
    certo(len(anot) == 1 and anot[0].startswith('::error title=Contactos e horário::') and 'email da loja' in anot[0]
          and '«Contactos e horário»' in anot[0], '   e escreve-a como anotação ::error, com o ecrã no título (é o que o painel e a issue mostram)', r3.stdout[-300:])
    certo(all((t / 'site' / rel).read_text(encoding='utf-8') == primeira[rel] for rel in HTML), '   e não escreveu nenhuma página')
    (t / 'site' / 'partida.html').write_text('<p><!--ap:telefone-->x</p>', encoding='utf-8')
    r4 = subprocess.run([py, script, str(t / 'site'), str(RAIZ / 'data/site.json'), str(RAIZ / 'data/empresa.json'), str(RAIZ / 'data/settings.json')], capture_output=True, text=True)
    certo(r4.returncode == 1 and 'partida.html, linha 1' in r4.stderr, 'uma página com um marcador partido: sai com 1 e diz a página e a linha', r4.stderr.strip())
    certo('::error title=Publicação::partida.html, linha 1%3A' not in r4.stdout and '::error title=Publicação::partida.html, linha 1: ' in r4.stdout,
          '   e a anotação vai para «Publicação» (os «:» só se escapam no título)', r4.stdout[-300:])
    r5 = subprocess.run([py, script, str(t / 'nada')], capture_output=True, text=True, cwd=str(RAIZ))
    certo(r5.returncode == 1 and 'Não há páginas' in r5.stderr, 'uma pasta sem páginas: sai com 1', r5.stderr.strip())
    r6 = subprocess.run([py, script, '--listas'], capture_output=True, text=True)
    certo(r6.returncode == 0 and json.loads(r6.stdout)['marcadores'] == I.MARCADORES, '--listas diz as listas fechadas, em JSON')

# =============================================================================
secao('A3 — injetar-imagens.py: uma foto do telemóvel «deitada» sai direita')
try:
    from PIL import Image
except ImportError:
    Image = None
certo(Image is not None, f'há Pillow neste python ({sys.executable}) — no Mac, o do venv')
if Image is not None:
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        (t / 'assets' / 'uploads').mkdir(parents=True)
        # 300×200 guardados deitados, com o canto de cima à esquerda vermelho, e
        # Orientation 6 («rodar 90° no sentido do relógio para ver»): de pé, é
        # uma foto 200×300 com o vermelho no canto de cima à DIREITA.
        im = Image.new('RGB', (300, 200), (240, 240, 240))
        im.paste((220, 0, 0), (0, 0, 60, 40))
        exif = Image.Exif(); exif[0x0112] = 6
        im.save(t / 'assets' / 'uploads' / 'rodada.jpg', 'JPEG', quality=95, exif=exif.tobytes())
        Image.new('RGB', (300, 200), (10, 120, 10)).save(t / 'assets' / 'uploads' / 'direita.jpg', 'JPEG', quality=95)
        (t / 'index.html').write_text('<img data-img="hero" src="assets/uploads/x.jpg"><img data-img="sobre" src="assets/uploads/y.jpg">', encoding='utf-8')
        (t / 'content.json').write_text(json.dumps({'hero': {'image': '/assets/uploads/rodada.jpg'}, 'sobre': {'image': '/assets/uploads/direita.jpg'}}), encoding='utf-8')
        r = subprocess.run([sys.executable, str(RAIZ / '.github' / 'injetar-imagens.py'), str(t), str(t / 'content.json')], capture_output=True, text=True)
        certo(r.returncode == 0 and 'verificado ✓' in r.stdout, 'o injetar-imagens.py corre sobre as duas fotos', r.stderr.strip()[-300:])
        html = (t / 'index.html').read_text(encoding='utf-8')
        caminhos = dict(re.findall(r'data-img="(\w+)" src="([^"]+)"', html))
        if len(caminhos) == 2:
            with Image.open(t / caminhos['hero']) as h:
                w, hgt = h.size
                sem_exif = h.getexif().get(0x0112) is None
                canto_dir = h.convert('RGB').getpixel((w - 10, 10))
                canto_esq = h.convert('RGB').getpixel((10, 10))
            certo((w, hgt) == (200, 300), f'a foto deitada sai de pé: {w}×{hgt} (era 300×200 com Orientation 6)')
            certo(canto_dir[0] > 150 and canto_dir[1] < 80 and canto_esq[0] > 200 and canto_esq[1] > 200, 'rodada para o lado certo: o vermelho está no canto de cima à direita', f'direita {canto_dir}, esquerda {canto_esq}')
            certo(sem_exif, 'e o JPEG publicado não leva EXIF (nem a orientação, nem o GPS)')
            with Image.open(t / caminhos['sobre']) as so:
                certo(so.size == (300, 200), 'uma foto sem orientação fica como estava')
        else:
            certo(False, 'o index.html ficou com as duas fotos escritas', html)
        # Uma fotografia que existe mas não se abre (a guarda só vê se existe):
        # a publicação pára, e diz porquê ao painel (achado L8-03).
        (t / 'assets' / 'uploads' / 'estragada.jpg').write_bytes(b'isto nao e um jpeg')
        (t / 'content.json').write_text(json.dumps({'hero': {'image': '/assets/uploads/estragada.jpg'}, 'sobre': {'image': '/assets/uploads/direita.jpg'}}), encoding='utf-8')
        r = subprocess.run([sys.executable, str(RAIZ / '.github' / 'injetar-imagens.py'), str(t), str(t / 'content.json')], capture_output=True, text=True)
        certo(r.returncode == 1 and 'Traceback' not in r.stderr and 'ERRO: A fotografia do topo' in r.stderr
              and '::error title=Fotografias do site::A fotografia do topo (assets/uploads/estragada.jpg) não se consegue abrir' in r.stdout,
              'uma fotografia estragada: pára sem rebentar, e diz em «Fotografias do site» qual (::error)', (r.stdout + r.stderr)[-400:])

print(f'\n{passou} passaram, {falhou} falharam')
sys.exit(1 if falhou else 0)
