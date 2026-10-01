# Armazém dos Pneus — Loja online + Oficina

E-commerce da **Armazém dos Pneus** (Motivar & Lucrar, Unipessoal, Lda.) — venda de pneus novos e
seminovos, jantes, baterias e peças, e serviços de oficina em Arada, Ovar.
_"Os nossos clientes são a nossa prioridade!"_

**https://armazemdospneus.pt** — site estático (HTML/CSS/JS) num **Worker da Cloudflare** só de
ficheiros (`wrangler.jsonc`, publicado pelo CI em `.github/workflows/pages.yml`; o GitHub Pages
foi deixado em setembro de 2026 porque os termos dele proíbem lojas), com um **painel** próprio
para o dono (https://backoffice.armazemdospneus.pt/, num repositório privado à parte) e
**pagamentos online** (cartão, MB WAY, Multibanco, Klarna) via **Stripe**, através de um
**Cloudflare Worker**.

A chave secreta vive apenas como segredo na Cloudflare. Nunca no repositório, nunca no browser.

## Estrutura
```
index.html          Página principal (loja + serviços)
loja.html           Catálogo completo
checkout.html       Finalizar encomenda
obrigado.html       Retorno do pagamento (pago / à espera de referência / erro)
worker/             Cloudflare Worker de pagamentos — ver worker/README.md
assets/css|js|img|fonts|uploads
data/               products.json, content.json, settings.json; site.json (contactos, horário,
                    serviços, textos, marcas) e empresa.json (dados legais) — escritos nas
                    páginas na publicação, ver «Conteúdo nas páginas»
legal/              privacidade, cookies, termos, formulário de livre resolução
_source/            Fotos em alta + logo vetorial (NÃO publicado — ver .gitignore)
.github/            O CI: pages.yml, as guardas do conteúdo e o que monta a _site
```

## Documentação

| Ficheiro | Para quem |
|---|---|
| **[ENCOMENDAS.md](ENCOMENDAS.md)** | Quem trata das encomendas. Fatura no mesmo dia, estados, reembolsos |
| **[BACKOFFICE.md](BACKOFFICE.md)** | O dono: o painel (backoffice.armazemdospneus.pt), ecrã a ecrã |
| **[worker/README.md](worker/README.md)** | Quem mexe no código dos pagamentos |

## Ver localmente
```bash
python3 _source/dev-server.py 8096   # http://localhost:8096
cd worker && npm test                # a bateria do Worker (serve os data/*.json sozinha)
cd worker && npx wrangler dev        # Worker em :8787, com chaves de TESTE
```

## Publicação e guardas
O CI (`.github/workflows/pages.yml`) tem três jobs:
- **construir** — corre o código do repositório e **não tem segredos**: `.github/guardas.mjs`
  confere os dados com as regras de `.github/regras.mjs` (as mesmas do painel) e
  `.github/preparar-site.sh` monta a `_site`;
- **publicar** — tem o token da Cloudflare e **não corre nada do repositório** (sem checkout;
  a config do wrangler e as verificações de fuga estão escritas no YAML);
- **avisar** — abre (trancada), comenta ou fecha a issue «Publicação parada» — só a aberta
  pelo bot; um erro do `gh` fica como aviso e não marca a corrida como falhada.

O painel substituiu o **Pages CMS** (o editor antigo) em outubro de 2026: saiu o `.pages.yml`
(e o `preparar-site.sh` pára se ele voltar — dois editores sobre os mesmos ficheiros
atropelam-se), e o `/admin`, que era a página dele, reencaminha (301) para o painel. A barreira
dos três jobs só existe **sem a App do Pages CMS** no acesso a este repositório: ela tem a
permissão Workflows (e Administration, e Actions). Tirar o repositório da instalação dela
(github.com/settings/installations → Pages CMS → Configure) — sem desinstalar a App, que serve
outros sites.

Se a publicação parar depois da guarda (no injector, ou numa fotografia que não se abre), a
mensagem sai como `::error` (o painel mostra-a) e vai para a issue.

Um produto com dados partidos sai de venda **só na cópia publicada** e o resto publica; só um
problema de estrutura (JSON ilegível, o interruptor dos pagamentos, os portes, os prazos, os
dados legais) pára a publicação. As regras recusam tudo o que o injector recusaria (o
`test-guardas.mjs` prova-o com o diferencial, campo a campo, contra o injector verdadeiro): o
que o painel grava, publica.

Os prazos, o custo de devolução, o telefone, o email e os dados da empresa chegam também à
página de pagamento e aos emails das encomendas: o Worker dos pagamentos lê-os dos mesmos JSON
(ver [worker/README.md](worker/README.md)), por isso o dono muda-os no painel e não há cópias a
acertar. Nesses campos as regras de `.github/regras.mjs` são iguais ou mais apertadas do que as
do Worker (`worker/src/termos.js`) — o que o painel deixa gravar chega aos emails —, e o
`test-guardas.mjs` prova-o contra o código dele, campo a campo.

```bash
PYTHON=<python com Pillow> node .github/test-guardas.mjs   # a bateria das guardas e do CI
<python com Pillow> .github/test-injetar.py                # a bateria do injector do conteúdo
PYTHON=<python com Pillow> PLAYWRIGHT=<pasta do playwright> node .github/test-checkout.mjs   # a loja e o checkout no Chromium, com o Worker verdadeiro
PYTHON=<python com Pillow> .github/provar-publicacao.sh <base> [commit]   # uma mudança ao CI não muda o site (diff -r)
PYTHON=<python com Pillow> scripts/comparar-site.sh <base> [depois]       # a injecção não muda o site nem o SEO sem querer
```

## Conteúdo nas páginas
Os contactos, o horário, os serviços, os textos da página inicial, as marcas e os dados da
empresa **não se escrevem no HTML**: vivem em `data/site.json` e `data/empresa.json` (o dono
muda-os no painel) e `.github/injetar-conteudo.py` escreve-os nas páginas publicadas e no JSON-LD.
Nos Termos, também os portes, os prazos e o custo de devolução de `data/settings.json`. No HTML
ficam **marcadores** com o valor de hoje lá dentro (a página em bruto continua a abrir):
`<!--ap:telefone-->935 218 857<!--/ap:telefone-->`, `data-ap-href="tel"`, as metas `ap:*` que o
JavaScript lê, e variantes como `<!--ap:portes se=a-combinar-->…<!--ap:portes senao-->…<!--/ap:portes-->`.
A lista fechada dos nomes está no injector e no `.github/guardas.mjs` (a bateria confere que
são iguais); um nome desconhecido ou um marcador aberto pára a publicação.

## Diagnóstico rápido
```
https://armazem-dos-pneus-pay.renato-lima-valente-dcb.workers.dev/health?probe=1
```
Diz se a chave da Stripe é válida e de produção, se a do Resend pertence à conta dona do
domínio, e quantos artigos o servidor está a ver.

## Contactos
Tel/WhatsApp: 935 218 857 · Email: armazemdospneus2019@gmail.com
Morada: Travessa do Navega 436 F, 3885-183 Arada, Ovar · Facebook: /armazem.dospeneus
