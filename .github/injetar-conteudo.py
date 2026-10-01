#!/usr/bin/env python3
"""
Escreve no HTML publicado o que o dono muda no painel: contactos, horário,
serviços, textos da página inicial, marcas e dados da empresa (data/site.json e
data/empresa.json), e — nos Termos — os portes, os prazos e o custo de
devolução das definições da loja (data/settings.json).

PORQUÊ NA PUBLICAÇÃO, E NÃO NO BROWSER
--------------------------------------
O Google lê o HTML que chega, e o telefone, o horário e a morada são o que
mais conta numa pesquisa local. Escrito por JavaScript depois de a página
abrir, o Google via o valor antigo e o cliente via-o piscar. Aqui o valor sai
já escrito, e o JSON-LD (dados estruturados) diz o mesmo que a página.

OS MARCADORES (ver o §5.2 do plano do painel)
---------------------------------------------
Todos são HTML válido: a página em bruto continua a abrir, com os valores de
reserva que lá estão escritos.
  1. Texto ou bloco:  <!--ap:telefone-->935 218 857<!--/ap:telefone-->
     O que está entre os dois é trocado pelo valor (escapado) ou pelo bloco
     gerado (serviços, horário…). Um bloco de vários itens (serviços, marcas,
     destaques, parágrafos) separa-os com a indentação da linha onde o
     marcador abre — a página publicada fica igual à escrita à mão.
  2. Variante:  <!--ap:portes se=a-combinar-->A<!--ap:portes senao-->B<!--/ap:portes-->
     Fica o ramo que a condição escolhe; o outro sai (os marcadores ficam, e
     injectar duas vezes dá o mesmo). Dentro de um ramo pode haver marcadores.
  3. Atributo:  <a href="…" data-ap-href="tel">  ou  data-ap-attr="data-map-embed:mapa-embed"
     Só esse atributo, dessa tag, é reescrito. Nos wa.me muda só o número: a
     mensagem pré-escrita (?text=…) fica como está.
  4. Meta para o JavaScript:  <meta name="ap:whatsapp" content="…" data-ap-meta />
  5. JSON-LD:  <script type="application/ld+json" data-ap-jsonld> — lido,
     actualizado no nó …/#business, e escrito outra vez (cada «<» como \\u003c,
     para um texto com «</script>» não sair do bloco).

Um nome desconhecido, um marcador aberto sem fecho, uma condição que não é a
do marcador ou um dado obrigatório em falta PARAM a publicação (exit 1), com
uma mensagem que diz em que ecrã do painel se corrige. O guardas.mjs tem as
mesmas listas (a bateria confere-as com --listas) e pára antes, no passo
«Conferir o conteúdo»; isto é a segunda rede.

Corre ANTES do injetar-imagens.py, que depois troca as fotografias no HTML e
no JSON-LD por substituição de texto (e continua a encontrá-las: o json.dumps
não escapa as barras).

Uso: injetar-conteudo.py <_site> [data/site.json] [data/empresa.json] [data/settings.json]
     injetar-conteudo.py --listas     (as listas fechadas, em JSON)
     injetar-conteudo.py --casos <raiz> <casos.json>   (só para a bateria)
Só a biblioteca-padrão do Python 3.
"""
import html
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote, urlsplit

# ---------------------------------------------------------------------------
# As listas fechadas. IGUAIS às do .github/guardas.mjs (MARCADORES, ATRIBUTOS,
# METAS, VARIANTES) — a bateria (test-guardas.mjs) compara-as.
# ---------------------------------------------------------------------------
MARCADORES = [
    'telefone', 'telefone-2', 'telefones', 'whatsapp', 'email', 'nota-chamada',
    'morada-rua', 'morada-localidade', 'morada-cp-localidade', 'morada-linha',
    'nif', 'denominacao', 'nome', 'registo',
    'horario', 'servicos', 'servicos-frase', 'marcas', 'marcas-chip',
    'topo-sobretitulo', 'topo-titulo', 'topo-frase', 'topo-destaques',
    'sobre-titulo', 'sobre-texto', 'sobre-pontos', 'contactos-frase', 'rodape-frase',
    'portes', 'devolucao', 'custo-devolucao', 'prazo-entrega', 'prazo-maximo',
    'ral', 'facebook', 'atualizacao',
]
ATRIBUTOS = [
    'tel', 'tel-2', 'whatsapp', 'whatsapp-orcamento', 'whatsapp-orcamento-servico', 'mailto',
    'facebook', 'mapa-embed', 'mapa-link', 'ral-url', 'livro-reclamacoes',
]
METAS = ['ap:whatsapp', 'ap:telefone']
# Os marcadores que são variantes, e a condição de cada um. Um marcador de
# texto não leva condição; uma variante leva sempre a sua.
VARIANTES = {
    'portes': 'a-combinar',     # shipping.quote_later ligado
    'devolucao': 'loja-paga',   # returns.return_cost_eur vazio (ou zero)
    'facebook': 'existe',       # contactos.facebook preenchido
}

E_CONT = 'Contactos e horário'
E_SERV = 'Serviços'
E_TEXT = 'Textos da página inicial'
E_EMP = 'Dados da empresa'
E_PRAZOS = 'Loja online › Prazos e devoluções'
E_PORTES = 'Loja online › Portes'

DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']
NOME_DIA = {'seg': 'Segunda', 'ter': 'Terça', 'qua': 'Quarta', 'qui': 'Quinta', 'sex': 'Sexta', 'sab': 'Sábado', 'dom': 'Domingo'}
ABREV_DIA = {'seg': 'Seg.', 'ter': 'Ter.', 'qua': 'Qua.', 'qui': 'Qui.', 'sex': 'Sex.', 'sab': 'Sáb.', 'dom': 'Dom.'}
DIA_SCHEMA = {'seg': 'Monday', 'ter': 'Tuesday', 'qua': 'Wednesday', 'qui': 'Thursday', 'sex': 'Friday', 'sab': 'Saturday', 'dom': 'Sunday'}

# Os desenhos dos serviços, tal e qual estavam no index.html, mais um genérico
# para um serviço novo. Iguais a ICONES_SERVICOS do regras.mjs.
ICONES = {
    'montagem': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    'alinhamento': '<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    'furos': '<svg viewBox="0 0 24 24"><path d="M4 13l6-6 10 10-6 6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 8l3 3" stroke="currentColor" stroke-width="1.8"/></svg>',
    'travoes': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    'amortecedores': '<svg viewBox="0 0 24 24"><path d="M12 3v18" stroke="currentColor" stroke-width="1.8"/><path d="M8 6l8 0M8 10l8 0M8 14l8 0M8 18l8 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    'oleo': '<svg viewBox="0 0 24 24"><path d="M12 3s5 5.5 5 9a5 5 0 01-10 0c0-3.5 5-9 5-9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    'embraiagem': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    'distribuicao': '<svg viewBox="0 0 24 24"><path d="M4 8h10a3 3 0 013 3v0a3 3 0 01-3 3H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 5v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    'ac': '<svg viewBox="0 0 24 24"><path d="M12 2v20M5 6l14 12M19 6L5 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    # Uma chave de bocas: serve a qualquer serviço de oficina.
    'generico': '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 015.2-.9l-2.6 2.6.4 2.3 2.3.4 2.6-2.6a4 4 0 01-5.5 5.2L9 21.4a2 2 0 01-2.8-2.8l8.1-8.1a4 4 0 01.4-4.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
}

# O QUE É UM ESPAÇO: o mesmo que no JavaScript (String.prototype.trim e \s),
# porque é com ele que o .github/regras.mjs decide o que está vazio — no painel,
# no Worker do painel e na guarda do CI. O strip() e o \s do Python contam
# outros (U+001C–U+001F, U+0085) e não contam o U+FEFF: um título que fosse só
# U+0085 passava no painel e parava aqui, e um segundo telefone que fosse só
# U+FEFF estava vazio lá e era um telefone mal escrito cá. As regras daqui têm
# de ser IGUAIS OU MAIS LARGAS do que as do regras.mjs (o test-guardas.mjs
# prova-o campo a campo): este é o último passo antes de publicar, e um valor
# que só ele recusa pára a publicação inteira.
ESPACOS_JS = ''.join(chr(c) for c in (
    0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, *range(0x2000, 0x200b),
    0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff))
_ESPACO = re.escape(ESPACOS_JS)


def aparar(t):
    """O trim() do JavaScript."""
    return t.strip(ESPACOS_JS)


RE_HORA = re.compile(r'(?:[01][0-9]|2[0-3]):[0-5][0-9]')
RE_WHATSAPP = re.compile(r'[0-9]{9,15}')
RE_TELEFONE = re.compile(r'\+?[0-9][0-9 ]{7,18}[0-9]')
RE_EMAIL = re.compile('[^' + _ESPACO + '@<>"\',;]+@[^' + _ESPACO + '@<>"\',;]+\\.[^' + _ESPACO + '@<>"\',;]+')
RE_CP = re.compile(r'[0-9]{4}-[0-9]{3}')
RE_NIF = re.compile(r'[0-9]{9}')
RE_URL = re.compile('https://[^' + _ESPACO + '"\'<>\\\\]+')
TOKEN = re.compile(r'<!--\s*(/?)ap:([^\s>]*?)(\s[^>]*?)?\s*-->')


class Falha(Exception):
    """Pára a publicação. `ecra` é o ecrã do painel onde se corrige (vai para
    o título da anotação ::error, que o painel e a issue mostram)."""
    def __init__(self, mensagem, ecra=None):
        super().__init__(mensagem)
        self.ecra = ecra


class MarcaSemPar(ValueError):
    """Um * que sobra no **negrito**/*itálico* (só o com_marcas a lança: uma
    outra ValueError a meio do gerar() não pode passar por um * sem par)."""


def falha(mensagem, ecra=None):
    if ecra:
        mensagem += f' Corrige-se no painel, em «{ecra}».'
    raise Falha(mensagem, ecra)


def falha_da_pagina(ficheiro, linha, mensagem):
    raise Falha(f'{ficheiro}, linha {linha}: {mensagem} Só o Renato o pode corrigir.', 'Publicação')


# ---------------------------------------------------------------------------
# Texto
# ---------------------------------------------------------------------------
def escapar(t):
    return html.escape(t, quote=False)


def com_marcas(t):
    """Escapa e só DEPOIS troca **x** por <strong> e *x* por <em>: um «<» do
    dono nunca chega a ser uma etiqueta. Um * que fique sem par pára (o
    regras.mjs recusa-o antes, no painel)."""
    e = escapar(t)
    e = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', e)
    e = re.sub(r'\*(.+?)\*', r'<em>\1</em>', e)
    if '*' in e:
        raise MarcaSemPar('um * sem par')
    return e


def sem_marcas(t):
    t = re.sub(r'\*\*(.+?)\*\*', r'\1', t)
    return re.sub(r'\*(.+?)\*', r'\1', t)


def euros(x):
    return f'{x:.2f}'.replace('.', ',') + ' €'


def e_numero(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def e_inteiro(v):
    return isinstance(v, int) and not isinstance(v, bool)


def inteiro_de(v):
    """O inteiro que o JavaScript vê (Number.isInteger): 2 e 2.0 são 2; o
    resto, None."""
    if e_inteiro(v):
        return v
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return None


# ---------------------------------------------------------------------------
# Os dados, lidos e conferidos uma vez
# ---------------------------------------------------------------------------
class Dados:
    def __init__(self, site, empresa, settings):
        if not isinstance(site, dict):
            falha('Os contactos e textos do site não têm a forma certa.', E_CONT)
        if not isinstance(empresa, dict):
            falha('Os dados da empresa não têm a forma certa.', E_EMP)
        if not isinstance(settings, dict):
            falha('As definições da loja não têm a forma certa.', 'Loja online')
        self.site, self.empresa, self.settings = site, empresa, settings
        c = self._obj(site, 'contactos', E_CONT, 'Os contactos da loja')
        self.telefone = self._telefone(c, 'telefone', 'O telefone', obrigatorio=True)
        self.telefone2 = self._telefone(c, 'telefone2', 'O segundo telefone', obrigatorio=False)
        self.whatsapp = self._texto(c, 'whatsapp', E_CONT, 'O WhatsApp')
        # 9 algarismos é um número sem o indicativo: o wa.me lia «912345678»
        # como +91 (Índia). A mesma regra do regras.mjs.
        if not RE_WHATSAPP.fullmatch(self.whatsapp) or len(self.whatsapp) == 9 or self.whatsapp.startswith('0'):
            falha('O WhatsApp não está bem escrito (só algarismos, com o indicativo do país à frente: 351…).', E_CONT)
        self.email = self._texto(c, 'email', E_CONT, 'O email da loja')
        if not RE_EMAIL.fullmatch(self.email):
            falha('O email da loja não está bem escrito.', E_CONT)
        self.facebook = self._url(c, 'facebook', E_CONT, 'O endereço do Facebook', obrigatorio=False)
        self.nota_chamada = self._texto(c, 'nota_chamada', E_CONT, 'A nota do preço da chamada')

        e = empresa
        self.nome = self._texto(e, 'nome', E_EMP, 'O nome da loja')
        self.denominacao = self._texto(e, 'denominacao', E_EMP, 'A denominação da empresa')
        self.nif = self._texto(e, 'nif', E_EMP, 'O NIF')
        if not RE_NIF.fullmatch(self.nif):
            falha('O NIF tem de ter 9 algarismos.', E_EMP)
        m = self._obj(e, 'morada', E_EMP, 'A morada')
        self.rua = self._texto(m, 'rua', E_EMP, 'A rua da morada')
        self.cp = self._texto(m, 'cp', E_EMP, 'O código postal')
        if not RE_CP.fullmatch(self.cp):
            falha('O código postal escreve-se 0000-000.', E_EMP)
        self.localidade = self._texto(m, 'localidade', E_EMP, 'A localidade')
        self.concelho = self._texto(m, 'concelho', E_EMP, 'O concelho', obrigatorio=False)
        # O distrito só vai para o JSON-LD, e para a guarda um distrito que não
        # é texto é só um aviso: fica de fora, em vez de parar a publicação.
        dist = m.get('distrito')
        self.distrito = aparar(dist) if isinstance(dist, str) else ''
        ral = self._obj(e, 'ral', E_EMP, 'A entidade de resolução de litígios')
        self.ral_nome = self._texto(ral, 'nome', E_EMP, 'O nome da entidade de resolução de litígios')
        self.ral_url = self._url(ral, 'url', E_EMP, 'O endereço da entidade de resolução de litígios')
        self.livro = self._url(e, 'livro_reclamacoes', E_EMP, 'O endereço do Livro de Reclamações')
        cap = e.get('capital_social')
        if cap is not None and not (e_numero(cap) and cap > 0):
            falha('O capital social tem de ser um valor em euros, ou ficar vazio.', E_EMP)
        self.capital = cap
        self.conservatoria = self._texto(e, 'conservatoria', E_EMP, 'A conservatória', obrigatorio=False)
        # O mapa e as coordenadas não são obrigatórios: errados, ficam de fora
        # (para a guarda são só um aviso — não se pára a loja por isto).
        g = e.get('geo')
        self.geo = g if (isinstance(g, dict) and e_numero(g.get('lat')) and e_numero(g.get('lng'))
                         and abs(g['lat']) <= 90 and abs(g['lng']) <= 180) else None
        mapa = e.get('mapa')
        self.mapa = mapa if isinstance(mapa, str) and RE_URL.fullmatch(aparar(mapa)) else None

        self.horario = self._horario(self._obj(site, 'horario', E_CONT, 'O horário'))
        self.nota_horario = self._texto(site['horario'], 'nota', E_CONT, 'A nota do horário', obrigatorio=False)
        self.servicos = self._servicos(site.get('servicos'))
        t = self._obj(site, 'textos', E_TEXT, 'Os textos da página inicial')
        self.topo = self._obj(t, 'topo', E_TEXT, 'Os textos do topo')
        self.textos = t
        marcas = site.get('marcas')
        if not isinstance(marcas, list) or not all(isinstance(x, str) and aparar(x) for x in marcas):
            falha('A lista das marcas não está bem preenchida.', E_TEXT)
        self.marcas = [aparar(x) for x in marcas]

        # Definições da loja: o que vai para os Termos.
        sh = settings.get('shipping') if isinstance(settings.get('shipping'), dict) else {}
        self.portes_a_combinar = sh.get('quote_later') is True   # ausente = cobrados (como o checkout e o Worker)
        d = settings.get('delivery')
        if not isinstance(d, dict):
            falha('Os prazos de entrega não estão gravados.', E_PRAZOS)
        # «2.0» é inteiro para o JavaScript (o JSON.parse dá 2), e não para o Python.
        mn, mx, lim = (inteiro_de(d.get(k)) for k in ('estimate_min_days', 'estimate_max_days', 'max_days'))
        if not all(x is not None and 1 <= x <= 30 for x in (mn, mx, lim)) or mn > mx or mx > lim:
            falha('Os prazos de entrega não estão bem preenchidos (números inteiros de 1 a 30, mínimo ≤ máximo ≤ prazo máximo).', E_PRAZOS)
        self.prazo_min, self.prazo_max, self.prazo_limite = mn, mx, lim
        r = settings.get('returns') if isinstance(settings.get('returns'), dict) else {}
        rc = r.get('return_cost_eur')
        if rc is not None and not (e_numero(rc) and rc >= 0):
            falha('O custo de devolução tem de ser um valor em euros, ou ficar vazio.', E_PRAZOS)
        # Vazio ou zero: a loja paga (o mesmo que o checkout diz).
        self.custo_devolucao = rc if (e_numero(rc) and rc > 0) else None
        # {página: 'AAAA-MM-DD'} — ver datas_das_mudancas(); o main() preenche-o.
        self.mudancas = {}

    # --- ajudantes de leitura ------------------------------------------
    @staticmethod
    def _obj(o, k, ecra, nome):
        v = o.get(k) if isinstance(o, dict) else None
        if not isinstance(v, dict):
            falha(f'{nome}: não está gravado.', ecra)
        return v

    @staticmethod
    def _texto(o, k, ecra, nome, obrigatorio=True):
        v = o.get(k) if isinstance(o, dict) else None
        if v is None or (isinstance(v, str) and not aparar(v)):
            if obrigatorio:
                falha(f'{nome}: está vazio.', ecra)
            return ''
        if not isinstance(v, str):
            falha(f'{nome}: tem de ser texto.', ecra)
        return aparar(v)

    def _telefone(self, o, k, nome, obrigatorio):
        v = self._texto(o, k, E_CONT, nome, obrigatorio)
        if v and not (RE_TELEFONE.fullmatch(v) and 9 <= len(re.sub(r'\D', '', v)) <= 15):
            falha(f'{nome} não está bem escrito (só algarismos e espaços, ex.: 935 218 857).', E_CONT)
        return v

    def _url(self, o, k, ecra, nome, obrigatorio=True):
        v = self._texto(o, k, ecra, nome, obrigatorio)
        if v and not RE_URL.fullmatch(v):
            falha(f'{nome} tem de começar por https://', ecra)
        return v

    @staticmethod
    def _horario(h):
        dias = h.get('dias')
        if not isinstance(dias, dict):
            falha('O horário não está gravado.', E_CONT)
        out = {}
        for dia in DIAS:
            v = dias.get(dia)
            nome = f'O horário de {NOME_DIA[dia].lower()}'
            if not isinstance(v, list) or len(v) > 2:
                falha(f'{nome} não está bem preenchido.', E_CONT)
            iv = []
            for x in v:
                if not (isinstance(x, dict) and isinstance(x.get('abre'), str) and isinstance(x.get('fecha'), str)
                        and RE_HORA.fullmatch(x['abre']) and RE_HORA.fullmatch(x['fecha']) and x['abre'] < x['fecha']):
                    falha(f'{nome}: as horas escrevem-se HH:MM e abre antes de fechar.', E_CONT)
                iv.append((x['abre'], x['fecha']))
            iv.sort()
            if len(iv) == 2 and iv[1][0] < iv[0][1]:
                falha(f'{nome}: os dois períodos sobrepõem-se.', E_CONT)
            out[dia] = iv
        return out

    @staticmethod
    def _servicos(sv):
        if not isinstance(sv, list) or not 1 <= len(sv) <= 12:
            falha('A lista de serviços tem de ter de 1 a 12 serviços.', E_SERV)
        out = []
        for i, s in enumerate(sv):
            if not isinstance(s, dict):
                falha(f'O {i + 1}.º serviço não está preenchido.', E_SERV)
            titulo = Dados._texto(s, 'titulo', E_SERV, f'O título do {i + 1}.º serviço')
            texto = Dados._texto(s, 'texto', E_SERV, f'O texto do serviço «{titulo}»')
            icone = s.get('icone')
            if icone not in ICONES:
                falha(f'O serviço «{titulo}» tem um desenho que não existe.', E_SERV)
            out.append({'titulo': titulo, 'texto': texto, 'icone': icone})
        return out

    # --- valores derivados ---------------------------------------------
    @staticmethod
    def internacional(t):
        """«935 218 857» → «+351935218857» (tel: e JSON-LD)."""
        d = re.sub(r'\D', '', t)
        if aparar(t).startswith('+'):
            return '+' + d
        if d.startswith('00'):
            return '+' + d[2:]
        return '+351' + d if len(d) == 9 else '+' + d

    def whatsapp_legivel(self):
        """«351935218857» → «935 218 857» (o cartão «WhatsApp» da página)."""
        d = self.whatsapp
        if d.startswith('351') and len(d) == 12:
            n = d[3:]
            return f'{n[0:3]} {n[3:6]} {n[6:9]}'
        return '+' + d

    def morada_localidade(self):
        c = self.concelho
        return self.localidade + (f', {c}' if c and c.lower() != self.localidade.lower() else '')

    def morada_cp_localidade(self):
        return f'{self.cp} {self.morada_localidade()}'

    def morada_linha(self):
        return f'{self.rua}, {self.morada_cp_localidade()}'

    def pesquisa_do_mapa(self):
        """O que se procura no Google Maps: a rua sem a vírgula do número
        («Travessa do Navega 436 F»), o código postal e a localidade."""
        rua = re.sub(r'\s*,\s*', ' ', self.rua)
        return quote(f'{rua}, {self.morada_cp_localidade()}', safe='')

    def grupos_do_horario(self):
        """Dias SEGUIDOS com os mesmos períodos juntam-se: [(['seg'…'sex'], [('09:00','19:00')]), …]."""
        grupos = []
        for dia in DIAS:
            iv = self.horario[dia]
            if grupos and grupos[-1][1] == iv:
                grupos[-1][0].append(dia)
            else:
                grupos.append(([dia], iv))
        return grupos


# ---------------------------------------------------------------------------
# «Última atualização» das páginas legais
# ---------------------------------------------------------------------------
# Os Termos e a Privacidade mudam de conteúdo quando o dono muda prazos,
# devolução, portes, morada, RAL… no painel — e a data escrita à mão ficava
# «julho de 2026»: um cliente não conseguia saber que versão aceitou (achado
# L6-11). O marcador <!--ap:atualizacao-->julho de 2026<!--/ap:atualizacao-->
# escreve o mais recente de dois: a data que lá está (a da última vez que o
# Renato mudou o texto) e o mês do último commit dos dados que mudou o que a
# página DIZ (o <article>, publicado). A segunda sai do histórico do git
# (o CI faz checkout com o histórico todo); sem ele, fica a primeira.
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
         'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
FICHEIROS_DOS_DADOS = ['data/site.json', 'data/empresa.json', 'data/settings.json']
HISTORICO_MAXIMO = 400   # commits dos dados a percorrer, no máximo


def mes_do_texto(t):
    """«julho de 2026» → (2026, 7); outra coisa → None."""
    m = re.fullmatch(r'\s*([a-zç]+) de ([0-9]{4})\s*', t)
    if not m or m.group(1) not in MESES:
        return None
    return int(m.group(2)), MESES.index(m.group(1)) + 1


def texto_do_mes(ano_mes):
    return f'{MESES[ano_mes[1] - 1]} de {ano_mes[0]}'


def o_que_a_pagina_diz(texto, d, rel):
    """O texto legal publicado (o <article>), com os dados `d`."""
    out = injetar_html(texto, d, rel)
    m = re.search(r'<article\b.*?</article>', out, re.S)
    return m.group(0) if m else out


def datas_das_mudancas(paginas, raiz_git=None):
    """{rel: 'AAAA-MM-DD'} — o último commit dos dados que mudou o que cada
    página diz. `paginas` = {rel: texto}. Sem git, sem histórico ou com dados
    antigos que já não se lêem: {} para essa página (vale a data escrita)."""
    raiz_git = Path(raiz_git or Path(__file__).resolve().parent.parent)

    def git(*a):
        r = subprocess.run(['git', '-C', str(raiz_git), *a], capture_output=True, text=True, encoding='utf-8')
        if r.returncode != 0:
            raise OSError(r.stderr.strip()[:200])
        return r.stdout

    cache = {}

    def dados_em(rev):
        if rev not in cache:
            try:
                site, empresa, settings = (json.loads(git('show', f'{rev}:{f}')) for f in FICHEIROS_DOS_DADOS)
                cache[rev] = Dados(site, empresa, settings)
            except (OSError, ValueError, Falha):
                cache[rev] = None
        return cache[rev]

    try:
        # Só o repositório DESTA publicação: uma cópia sem .git dentro de outro
        # repositório (o ensaio do painel) não pode ler o histórico do outro.
        if Path(git('rev-parse', '--show-toplevel').strip()).resolve() != raiz_git.resolve():
            return {}
        log = [l.split('\t') for l in git('log', '--first-parent', '--format=%H%x09%cs', '-n', str(HISTORICO_MAXIMO),
                                          '--', *FICHEIROS_DOS_DADOS).splitlines() if '\t' in l]
    except (OSError, FileNotFoundError):
        return {}
    pendentes = dict(paginas)
    out = {}
    for commit, data in log:
        if not pendentes:
            break
        depois, antes = dados_em(commit), dados_em(commit + '^')
        if depois is None or antes is None:
            break   # o começo dos dados (antes do A2), ou dados que já não se lêem
        for rel, texto in list(pendentes.items()):
            try:
                mudou = o_que_a_pagina_diz(texto, depois, rel) != o_que_a_pagina_diz(texto, antes, rel)
            except Falha:
                mudou = False
            if mudou:
                out[rel] = data
                del pendentes[rel]
    return out


def data_da_atualizacao(reserva, mudanca, ficheiro, linha):
    escrita = mes_do_texto(reserva)
    if escrita is None:
        falha_da_pagina(ficheiro, linha, f'o marcador «atualizacao» tem de ter uma data como «julho de 2026» (tem «{reserva.strip()[:40]}»).')
    if mudanca:
        ano, mes = int(mudanca[:4]), int(mudanca[5:7])
        if (ano, mes) > escrita:
            return texto_do_mes((ano, mes))
    return texto_do_mes(escrita)


# ---------------------------------------------------------------------------
# O que cada marcador escreve
# ---------------------------------------------------------------------------
def hora(hhmm):
    h, m = hhmm.split(':')
    return f'{int(h)}h' + ('' if m == '00' else m)


def linhas_do_horario(d):
    linhas = []
    for dias, iv in d.grupos_do_horario():
        if not iv:
            continue   # um dia fechado não aparece
        rotulo = NOME_DIA[dias[0]] if len(dias) == 1 else f'{ABREV_DIA[dias[0]]} a {ABREV_DIA[dias[-1]]}'
        linhas.append(f'{rotulo}: ' + ' e '.join(f'{hora(a)} – {hora(f)}' for a, f in iv))
    return linhas or ['Encerrado']


def gerar(nome, d, indent, ecra_de):
    """O conteúdo de um marcador de texto/bloco. `indent` é o que está à
    esquerda da linha onde o marcador abre (os blocos de vários itens
    separam-se por uma mudança de linha com essa indentação)."""
    sep = '\n' + indent
    t = d.textos
    try:
        if nome == 'telefone':
            return escapar(d.telefone)
        if nome == 'telefone-2':
            return escapar(d.telefone2)
        if nome == 'telefones':
            tels = [x for x in (d.telefone, d.telefone2) if x]
            return ''.join(f'<a href="tel:{Dados.internacional(x)}">{escapar(x)}</a>' for x in tels)
        if nome == 'whatsapp':
            return escapar(d.whatsapp_legivel())
        if nome == 'email':
            return escapar(d.email)
        if nome == 'nota-chamada':
            return escapar(d.nota_chamada)
        if nome == 'morada-rua':
            return escapar(d.rua)
        if nome == 'morada-localidade':
            return escapar(d.morada_localidade())
        if nome == 'morada-cp-localidade':
            return escapar(d.morada_cp_localidade())
        if nome == 'morada-linha':
            return escapar(d.morada_linha())
        if nome == 'nif':
            return escapar(d.nif)
        if nome == 'denominacao':
            return escapar(d.denominacao)
        if nome == 'nome':
            return escapar(d.nome)
        if nome == 'registo':
            # CSC art. 171.º: só quando o contabilista confirmar e o dono os
            # preencher. Vazios, não se escreve nada.
            partes = []
            if d.capital is not None:
                partes.append(f'Capital social: {euros(d.capital)}')
            if d.conservatoria:
                partes.append(f'Matriculada na {d.conservatoria}')
            return escapar(' ' + '. '.join(partes) + '.') if partes else ''
        if nome == 'horario':
            out = '<strong>' + '<br>'.join(escapar(x) for x in linhas_do_horario(d)) + '</strong>'
            if d.nota_horario:
                out += f'<span class="contact__note">{com_marcas(d.nota_horario)}</span>'
            return out
        if nome == 'servicos':
            return sep.join(
                f'<article class="svc" data-reveal><span class="svc__ic">{ICONES[s["icone"]]}</span>'
                f'<h3>{com_marcas(s["titulo"])}</h3><p>{com_marcas(s["texto"])}</p></article>'
                for s in d.servicos)
        if nome == 'servicos-frase':
            return com_marcas(Dados._texto(Dados._obj(t, 'servicos', E_TEXT, 'Serviços › frase'), 'frase', E_TEXT, 'Serviços › frase'))
        if nome == 'marcas':
            uma = ''.join(f'<span>{escapar(m)}</span><i>•</i>' for m in d.marcas)
            return uma + sep + uma if uma else ''   # duas voltas: a faixa corre sem emenda
        if nome == 'marcas-chip':
            n = len(d.marcas)
            return 'Todas as marcas' if n == 0 else ('+1 marca' if n == 1 else f'+{n} marcas')
        if nome == 'topo-sobretitulo':
            return com_marcas(Dados._texto(d.topo, 'sobretitulo', E_TEXT, 'Topo › sobretítulo'))
        if nome == 'topo-titulo':
            t1, t2, t3 = (com_marcas(Dados._texto(d.topo, k, E_TEXT, f'Topo › título ({k[-1]}.ª linha)')) for k in ('titulo1', 'titulo2', 'titulo3'))
            return f'<span class="hero__t1">{t1}</span><span class="hl hero__t2">{t2}</span><span class="hero__t3">{t3}</span>'
        if nome == 'topo-frase':
            frase = com_marcas(Dados._texto(d.topo, 'frase', E_TEXT, 'Topo › frase'))
            destaque = Dados._texto(d.topo, 'frase_destaque', E_TEXT, 'Topo › frase em destaque', obrigatorio=False)
            return frase + (f' <strong>{com_marcas(destaque)}</strong>' if destaque else '')
        if nome == 'topo-destaques':
            lista = d.topo.get('destaques')
            if not isinstance(lista, list) or not all(isinstance(x, str) and aparar(x) for x in lista):
                falha('Topo › destaques: não estão bem preenchidos.', E_TEXT)
            return sep.join(f'<li>{com_marcas(aparar(x))}</li>' for x in lista)
        if nome == 'sobre-titulo':
            return com_marcas(Dados._texto(Dados._obj(t, 'sobre', E_TEXT, 'Sobre'), 'titulo', E_TEXT, 'Sobre › título'))
        if nome == 'sobre-texto':
            ps = Dados._obj(t, 'sobre', E_TEXT, 'Sobre').get('paragrafos')
            if not isinstance(ps, list) or not ps or not all(isinstance(x, str) and aparar(x) for x in ps):
                falha('Sobre › parágrafos: não estão bem preenchidos.', E_TEXT)
            return sep.join(f'<p>{com_marcas(aparar(x))}</p>' for x in ps)
        if nome == 'sobre-pontos':
            ps = Dados._obj(t, 'sobre', E_TEXT, 'Sobre').get('pontos')
            if not isinstance(ps, list) or not all(isinstance(x, str) and aparar(x) for x in ps):
                falha('Sobre › pontos: não estão bem preenchidos.', E_TEXT)
            return sep.join(f'<li><span aria-hidden="true">✓</span> {com_marcas(aparar(x))}</li>' for x in ps)
        if nome == 'contactos-frase':
            return com_marcas(Dados._texto(Dados._obj(t, 'contactos', E_TEXT, 'Contactos › frase'), 'frase', E_TEXT, 'Contactos › frase'))
        if nome == 'rodape-frase':
            return com_marcas(Dados._texto(Dados._obj(t, 'rodape', E_TEXT, 'Rodapé › frase'), 'frase', E_TEXT, 'Rodapé › frase'))
        if nome == 'custo-devolucao':
            if d.custo_devolucao is None:
                falha('Falta o custo de devolução.', E_PRAZOS)
            return escapar(euros(d.custo_devolucao))
        if nome == 'prazo-entrega':
            a, b = d.prazo_min, d.prazo_max
            if a == b:
                return '1 dia útil' if a == 1 else f'{a} dias úteis'
            return f'{a} a {b} dias úteis'
        if nome == 'prazo-maximo':
            n = d.prazo_limite
            return '1 dia' if n == 1 else f'{n} dias'
        if nome == 'ral':
            try:
                dominio = urlsplit(d.ral_url).netloc
            except ValueError:   # o urlsplit recusa alguns endereços que o browser aceita
                dominio = d.ral_url
            return (f'<strong>{escapar(d.ral_nome)}</strong> (<a href="{html.escape(d.ral_url, quote=True)}" '
                    f'target="_blank" rel="noopener">{escapar(dominio)}</a>)')
    except MarcaSemPar:
        falha('Um texto tem um * sem par (o **negrito** e o *itálico* abrem e fecham).', ecra_de.get(nome, E_TEXT))
    raise Falha(f'O marcador «{nome}» não sabe o que escrever (defeito do injector).')


ECRA_DO_MARCADOR = {
    'servicos': E_SERV, 'horario': E_CONT,
}


def condicao(nome, d):
    if nome == 'portes':
        return d.portes_a_combinar
    if nome == 'devolucao':
        return d.custo_devolucao is None
    if nome == 'facebook':
        return bool(d.facebook)
    raise Falha(f'A variante «{nome}» não tem condição (defeito do injector).')


def valor_do_atributo(nome, atual, d, ficheiro, linha):
    """O valor NOVO do atributo, já pronto a ir para dentro das aspas."""
    if nome in ('whatsapp', 'whatsapp-orcamento', 'whatsapp-orcamento-servico'):
        # Só o número muda: a mensagem pré-escrita fica como está escrita.
        m = re.match(r'https://wa\.me/[0-9]+', atual)
        if not m:
            falha_da_pagina(ficheiro, linha, f'o data-ap-href="{nome}" está numa ligação que não é do WhatsApp (https://wa.me/…).')
        return 'https://wa.me/' + d.whatsapp + atual[m.end():]
    if nome == 'tel':
        v = 'tel:' + Dados.internacional(d.telefone)
    elif nome == 'tel-2':
        if not d.telefone2:
            falha('Falta o segundo telefone, que a página usa.', E_CONT)
        v = 'tel:' + Dados.internacional(d.telefone2)
    elif nome == 'mailto':
        v = 'mailto:' + d.email
    elif nome == 'facebook':
        if not d.facebook:
            falha_da_pagina(ficheiro, linha, 'uma ligação ao Facebook está fora do marcador <!--ap:facebook se=existe-->, e o Facebook está vazio.')
        v = d.facebook
    elif nome == 'mapa-embed':
        v = f'https://www.google.com/maps?hl=pt&q={d.pesquisa_do_mapa()}&z=15&output=embed'
    elif nome == 'mapa-link':
        v = f'https://www.google.com/maps/search/?api=1&query={d.pesquisa_do_mapa()}'
    elif nome == 'ral-url':
        v = d.ral_url
    elif nome == 'livro-reclamacoes':
        v = d.livro
    else:
        falha_da_pagina(ficheiro, linha, f'o atributo «{nome}» não existe.')
    return html.escape(v, quote=True)


# ---------------------------------------------------------------------------
# Os marcadores de uma página
# ---------------------------------------------------------------------------
def linha_de(texto, pos):
    return texto.count('\n', 0, pos) + 1


def indentacao(texto, pos):
    inicio = texto.rfind('\n', 0, pos) + 1
    return re.match(r'[ \t]*', texto[inicio:pos]).group(0)


def arvore(texto, ficheiro):
    """Os marcadores de uma página, como árvore. Pára em tudo o que não bate
    certo: nome desconhecido, fecho sem abertura, aberto sem fecho, «senão»
    fora de uma variante, condição que não é a do marcador."""
    raiz = {'nome': None, 'filhos': []}
    pilha = [raiz]
    for m in TOKEN.finditer(texto):
        fecho, nome, resto = m.group(1), m.group(2), (m.group(3) or '').strip()
        linha = linha_de(texto, m.start())
        if nome not in MARCADORES:
            falha_da_pagina(ficheiro, linha, f'o marcador «{nome}» não existe.')
        topo = pilha[-1]
        if fecho:
            if topo is raiz or topo['nome'] != nome:
                falha_da_pagina(ficheiro, linha, f'o marcador «{nome}» fecha sem ter aberto.')
            topo['fecho'] = m
            pilha.pop()
        elif resto == 'senao':
            if topo is raiz or topo['nome'] != nome or not topo['cond'] or topo['senao']:
                falha_da_pagina(ficheiro, linha, f'o «senão» de «{nome}» está fora de sítio.')
            topo['senao'] = m
        else:
            cond = None
            if resto:
                mm = re.fullmatch(r'se=([a-z0-9-]+)', resto)
                if not mm:
                    falha_da_pagina(ficheiro, linha, f'o marcador «{nome}» tem «{resto}», que não se percebe.')
                cond = mm.group(1)
            if nome in VARIANTES and cond != VARIANTES[nome]:
                falha_da_pagina(ficheiro, linha, f'o marcador «{nome}» é uma variante e tem de ser «se={VARIANTES[nome]}».')
            if nome not in VARIANTES and cond:
                falha_da_pagina(ficheiro, linha, f'o marcador «{nome}» não é uma variante (não leva «se=»).')
            if topo is not raiz and not topo['cond']:
                falha_da_pagina(ficheiro, linha, f'o marcador «{nome}» está dentro de «{topo["nome"]}», que é trocado por inteiro.')
            no = {'nome': nome, 'abre': m, 'cond': cond, 'senao': None, 'fecho': None, 'filhos': [], 'linha': linha}
            topo['filhos'].append(no)
            pilha.append(no)
    if len(pilha) > 1:
        no = pilha[-1]
        falha_da_pagina(ficheiro, no['linha'], f'o marcador «{no["nome"]}» abre e não fecha.')
    return raiz


def trocar_marcadores(texto, d, ficheiro, conta):
    def regiao(filhos, ini, fim):
        partes, pos = [], ini
        for no in filhos:
            partes.append(texto[pos:no['abre'].start()])
            partes.append(um(no))
            pos = no['fecho'].end()
        partes.append(texto[pos:fim])
        return ''.join(partes)

    def um(no):
        a, s, f = no['abre'], no['senao'], no['fecho']
        conta[no['nome']] = conta.get(no['nome'], 0) + 1
        if no['nome'] == 'atualizacao':
            # A data depende da página e do que já lá está (injectar duas vezes dá o mesmo).
            reserva = texto[a.end():f.start()]
            return a.group(0) + escapar(data_da_atualizacao(reserva, d.mudancas.get(ficheiro), ficheiro, no['linha'])) + f.group(0)
        if not no['cond']:
            return a.group(0) + gerar(no['nome'], d, indentacao(texto, a.start()), ECRA_DO_MARCADOR) + f.group(0)
        sim = condicao(no['nome'], d)
        fim_se = s.start() if s else f.start()
        filhos_se = [x for x in no['filhos'] if x['abre'].start() < fim_se]
        ramo_se = regiao(filhos_se, a.end(), fim_se) if sim else ''
        if not s:
            return a.group(0) + ramo_se + f.group(0)
        filhos_senao = [x for x in no['filhos'] if x['abre'].start() > s.start()]
        ramo_senao = '' if sim else regiao(filhos_senao, s.end(), f.start())
        return a.group(0) + ramo_se + s.group(0) + ramo_senao + f.group(0)

    raiz = arvore(texto, ficheiro)
    return regiao(raiz['filhos'], 0, len(texto))


def atributos_da_tag(tag):
    out = {}
    for m in re.finditer(r'([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|\'([^\']*)\'|([^\s"\'>]+))', tag):
        out[m.group(1).lower()] = m.group(3) if m.group(3) is not None else (m.group(4) if m.group(4) is not None else m.group(5))
    return out


def valor_na_tag(tag, atributo, ficheiro, linha):
    """(início, fim, valor) do atributo dentro da tag — o valor tal como está
    escrito, ainda com as entidades (&amp;)."""
    m = re.search(r'(?<![-\w:.])' + re.escape(atributo) + r'\s*=\s*(?:"([^"]*)"|\'([^\']*)\')', tag)
    if not m:
        falha_da_pagina(ficheiro, linha, f'a etiqueta com o marcador não tem o atributo «{atributo}» (entre aspas).')
    g = 1 if m.group(1) is not None else 2
    return m.start(g), m.end(g), m.group(g)


def trocar_valor(tag, atributo, calcular, ficheiro, linha):
    ini, fim, atual = valor_na_tag(tag, atributo, ficheiro, linha)
    return tag[:ini] + calcular(atual) + tag[fim:]


def trocar_atributos(texto, d, ficheiro, conta):
    def troca(m):
        tag = m.group(0)
        linha = linha_de(texto, m.start())
        a = atributos_da_tag(tag)
        if 'data-ap-href' in a:
            nome = a['data-ap-href']
            if nome not in ATRIBUTOS:
                falha_da_pagina(ficheiro, linha, f'data-ap-href="{nome}" não existe.')
            tag = trocar_valor(tag, 'href', lambda atual: valor_do_atributo(nome, atual, d, ficheiro, linha), ficheiro, linha)
            conta['@' + nome] = conta.get('@' + nome, 0) + 1
        if 'data-ap-attr' in a:
            alvo, _, nome = a['data-ap-attr'].partition(':')
            if not alvo or nome not in ATRIBUTOS:
                falha_da_pagina(ficheiro, linha, f'data-ap-attr="{a["data-ap-attr"]}" não existe.')
            tag = trocar_valor(tag, alvo, lambda atual: valor_do_atributo(nome, atual, d, ficheiro, linha), ficheiro, linha)
            conta['@' + nome] = conta.get('@' + nome, 0) + 1
        return tag
    return re.sub(r'<[a-zA-Z][^>]*\bdata-ap-(?:href|attr)\s*=[^>]*>', troca, texto)


def trocar_metas(texto, d, ficheiro, conta):
    valores = {'ap:whatsapp': d.whatsapp, 'ap:telefone': d.telefone}

    def troca(m):
        tag = m.group(0)
        linha = linha_de(texto, m.start())
        nome = atributos_da_tag(tag).get('name')
        if nome not in METAS:
            falha_da_pagina(ficheiro, linha, f'a meta «{nome}» não existe.')
        tag = trocar_valor(tag, 'content', lambda _atual: html.escape(valores[nome], quote=True), ficheiro, linha)
        conta['meta ' + nome] = conta.get('meta ' + nome, 0) + 1
        return tag
    return re.sub(r'<meta\b[^>]*\bdata-ap-meta\b[^>]*>', troca, texto)


# ---------------------------------------------------------------------------
# JSON-LD
# ---------------------------------------------------------------------------
def horario_schema(d):
    out = []
    for dias, iv in d.grupos_do_horario():
        dia = DIA_SCHEMA[dias[0]] if len(dias) == 1 else [DIA_SCHEMA[x] for x in dias]
        # Um dia fechado leva 00:00–00:00 (é assim que o Google o lê).
        for a, f in (iv or [('00:00', '00:00')]):
            out.append({'@type': 'OpeningHoursSpecification', 'dayOfWeek': dia, 'opens': a, 'closes': f})
    return out


def por_ou_tirar(no, chave, valor):
    if valor is None:
        no.pop(chave, None)
    else:
        no[chave] = valor


def actualizar_negocio(no, d):
    """O nó …/#business. As chaves que já lá estão ficam onde estão (a ordem
    não conta para o Google, mas conta para comparar); o que não vem daqui
    (descrição, imagens, área servida, preços) fica como está."""
    no['telephone'] = Dados.internacional(d.telefone)
    no['email'] = d.email
    no['legalName'] = d.denominacao
    no['vatID'] = 'PT' + d.nif
    no['taxID'] = d.nif
    morada = no.get('address') if isinstance(no.get('address'), dict) else {}
    morada['@type'] = 'PostalAddress'
    morada['streetAddress'] = d.rua
    morada['addressLocality'] = d.localidade
    por_ou_tirar(morada, 'addressRegion', d.distrito or None)
    morada['postalCode'] = d.cp
    morada['addressCountry'] = 'PT'
    no['address'] = morada
    por_ou_tirar(no, 'geo', {'@type': 'GeoCoordinates', 'latitude': d.geo['lat'], 'longitude': d.geo['lng']} if d.geo else None)
    por_ou_tirar(no, 'hasMap', d.mapa)
    # O Facebook do painel vai à frente; sai o que lá estava escrito à mão
    # (facebook.com) e o que uma injecção anterior lá pôs — que pode não ter
    # «facebook.com» em minúsculas (www.Facebook.com, fb.me…, qualquer https que
    # o painel deixe gravar). Sem isto, injectar duas vezes duplicava-o, a
    # prova de idempotência falhava e a publicação parava (achado L8-02).
    fb = d.facebook.lower() if d.facebook else None
    outros = [x for x in (no.get('sameAs') or [])
              if isinstance(x, str) and 'facebook.com' not in x.lower() and x.lower() != fb]
    por_ou_tirar(no, 'sameAs', ([d.facebook] if d.facebook else []) + outros or None)
    no['openingHoursSpecification'] = horario_schema(d)
    catalogo = no.get('hasOfferCatalog') if isinstance(no.get('hasOfferCatalog'), dict) else {'@type': 'OfferCatalog', 'name': 'Serviços de oficina'}
    catalogo['itemListElement'] = [
        {'@type': 'Offer', 'itemOffered': {'@type': 'Service', 'name': sem_marcas(s['titulo']), 'description': sem_marcas(s['texto'])}}
        for s in d.servicos]
    no['hasOfferCatalog'] = catalogo


def trocar_jsonld(texto, d, ficheiro, conta):
    def troca(m):
        linha = linha_de(texto, m.start())
        try:
            dados = json.loads(m.group(2))
        except ValueError as e:
            falha_da_pagina(ficheiro, linha, f'os dados estruturados (JSON-LD) não se lêem ({e}).')
        nos = dados.get('@graph') if isinstance(dados, dict) and isinstance(dados.get('@graph'), list) else [dados]
        negocio = [n for n in nos if isinstance(n, dict) and str(n.get('@id', '')).endswith('#business')]
        if len(negocio) != 1:
            falha_da_pagina(ficheiro, linha, 'os dados estruturados (JSON-LD) não têm o nó «#business».')
        actualizar_negocio(negocio[0], d)
        base = indentacao(texto, m.start())
        corpo = json.dumps(dados, ensure_ascii=False, indent=2).replace('<', '\\u003c')
        conta['JSON-LD'] = conta.get('JSON-LD', 0) + 1
        return m.group(1) + '\n' + '\n'.join(base + x for x in corpo.split('\n')) + '\n' + base + '</script>'
    return re.sub(r'(<script\b[^>]*\bdata-ap-jsonld\b[^>]*>)(.*?)</script>', troca, texto, flags=re.S)


# ---------------------------------------------------------------------------
def injetar_html(texto, d, ficheiro, conta=None):
    conta = {} if conta is None else conta
    texto = trocar_marcadores(texto, d, ficheiro, conta)
    texto = trocar_atributos(texto, d, ficheiro, conta)
    texto = trocar_metas(texto, d, ficheiro, conta)
    texto = trocar_jsonld(texto, d, ficheiro, conta)
    return texto


def injetar_pagina(antes, d, rel, conta=None):
    """Uma página como a publicação a escreve, com as provas: injectar outra
    vez não muda nada, os marcadores continuam todos certos, e o texto
    escreve-se em UTF-8. É ESTA função que o .github/test-guardas.mjs corre no
    diferencial (regras.mjs contra o injector), pelo --casos."""
    depois = injetar_html(antes, d, rel, conta)
    if injetar_html(depois, d, rel) != depois:
        raise Falha(f'{rel}: injectar duas vezes não dá o mesmo (defeito do injector).')
    arvore(depois, rel)
    try:
        depois.encode('utf-8')
    except UnicodeEncodeError:
        raise Falha(f'{rel}: um texto tem um carácter partido (metade de um emoji ou de um símbolo), '
                    'que não se consegue escrever. Procure no painel o texto colado há pouco e escreva-o outra vez.')
    return depois


def conferir_casos(raiz, ficheiro):
    """Só para a bateria: {paginas: [rel], casos: [{site, empresa, settings}]}
    → para cada caso, null se publicava, ou a mensagem com que parava. O
    mesmo código que publica (Dados e injetar_pagina), sobre as páginas de
    <raiz>."""
    pedido = json.loads(Path(ficheiro).read_text(encoding='utf-8'))
    paginas = [(rel, (Path(raiz) / rel).read_text(encoding='utf-8')) for rel in pedido['paginas']]
    out = []
    for c in pedido['casos']:
        try:
            d = Dados(c.get('site'), c.get('empresa'), c.get('settings'))
            for rel, texto in paginas:
                injetar_pagina(texto, d, rel)
            out.append(None)
        except Falha as e:
            out.append(str(e))
        except Exception as e:   # um rebentamento sem Falha: também pára a publicação
            out.append(f'REBENTOU ({type(e).__name__}: {e})')
    print(json.dumps(out))
    return 0


def anotacao_de_erro(mensagem, ecra):
    """A linha ::error do GitHub (escapada como no guardas.mjs). Sem ela, a
    mensagem só ficava no registo do passo: o painel lê as anotações do job
    que falhou e mostrava, no lugar dela, os avisos dos pneus de um passo que
    tinha passado (achado L8-03)."""
    def esc(t):
        return str(t).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    titulo = esc(ecra or 'Publicação').replace(':', '%3A').replace(',', '%2C')
    return f'::error title={titulo}::{esc(mensagem)}'


def ler_json(caminho, ecra):
    p = Path(caminho)
    if not p.is_file():
        falha(f'Falta o ficheiro {caminho}.', ecra)
    try:
        return json.loads(p.read_text(encoding='utf-8'))
    except ValueError as e:
        falha(f'O ficheiro {caminho} não se consegue ler ({e}).', ecra)


def main(args):
    if args[:1] == ['--listas']:
        print(json.dumps({'marcadores': MARCADORES, 'atributos': ATRIBUTOS, 'metas': METAS,
                          'variantes': VARIANTES, 'icones': list(ICONES)}, ensure_ascii=False))
        return 0
    if args[:1] == ['--casos'] and len(args) == 3:
        return conferir_casos(args[1], args[2])
    if not args:
        print(__doc__.strip().split('\n\n')[-2], file=sys.stderr)
        return 2
    raiz = Path(args[0])
    caminhos = (args[1:] + ['data/site.json', 'data/empresa.json', 'data/settings.json'][len(args) - 1:])[:3]
    try:
        d = Dados(ler_json(caminhos[0], E_CONT), ler_json(caminhos[1], E_EMP), ler_json(caminhos[2], 'Loja online'))
        paginas = sorted(p for p in raiz.rglob('*.html') if p.is_file())
        if not paginas:
            falha(f'Não há páginas em {raiz}/.')
        com_data = {p.relative_to(raiz).as_posix(): p.read_text(encoding='utf-8') for p in paginas}
        com_data = {rel: t for rel, t in com_data.items() if '<!--ap:atualizacao-->' in t}
        if com_data:
            d.mudancas = datas_das_mudancas(com_data)
            for rel, data in sorted(d.mudancas.items()):
                print(f'    {rel}: o que a página diz mudou com os dados de {data}')
        total = {}
        for p in paginas:
            rel = p.relative_to(raiz).as_posix()
            antes = p.read_text(encoding='utf-8')
            conta = {}
            depois = injetar_pagina(antes, d, rel, conta)
            if depois != antes:
                p.write_text(depois, encoding='utf-8')
            if conta:
                n = sum(conta.values())
                print(f'    {rel}: {n} ({", ".join(f"{k} {v}" for k, v in sorted(conta.items()))})')
            for k, v in conta.items():
                total[k] = total.get(k, 0) + v
        print(f'    {sum(total.values())} trocas em {len(paginas)} páginas; verificado ✓')
    except Falha as e:
        print(anotacao_de_erro(e, e.ecra), flush=True)
        print(f'ERRO: {e}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
