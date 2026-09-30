# Armazém dos Pneus — Loja online + Oficina

E-commerce da **Armazém dos Pneus** (Motivar & Lucrar, Unipessoal, Lda.) — venda de pneus novos e
seminovos, jantes, baterias e peças, e serviços de oficina em Arada, Ovar.
_"Os nossos clientes são a nossa prioridade!"_

**https://armazemdospneus.pt** — site estático (HTML/CSS/JS) num **Worker da Cloudflare** só de
ficheiros (`wrangler.jsonc`, publicado pelo CI em `.github/workflows/pages.yml`; o GitHub Pages
foi deixado em setembro de 2026 porque os termos dele proíbem lojas), com
**backoffice** (Pages CMS) e **pagamentos online** (cartão, MB WAY, Multibanco, Klarna) via
**Stripe**, através de um **Cloudflare Worker**.

A chave secreta vive apenas como segredo na Cloudflare. Nunca no repositório, nunca no browser.

## Estrutura
```
index.html          Página principal (loja + serviços)
loja.html           Catálogo completo
checkout.html       Finalizar encomenda
obrigado.html       Retorno do pagamento (pago / à espera de referência / erro)
admin/              Acesso ao backoffice (Pages CMS)
.pages.yml          Configuração do backoffice
worker/             Cloudflare Worker de pagamentos — ver worker/README.md
assets/css|js|img|fonts|uploads
data/               products.json, content.json, settings.json
legal/              privacidade, cookies, termos, formulário de livre resolução
_source/            Fotos em alta + logo vetorial (NÃO publicado — ver .gitignore)
.github/            O CI: pages.yml, as guardas do conteúdo e o que monta a _site
```

## Documentação

| Ficheiro | Para quem |
|---|---|
| **[ENCOMENDAS.md](ENCOMENDAS.md)** | Quem trata das encomendas. Fatura no mesmo dia, estados, reembolsos |
| **[BACKOFFICE.md](BACKOFFICE.md)** | Quem edita produtos e imagens |
| **[worker/README.md](worker/README.md)** | Quem mexe no código dos pagamentos |

## Ver localmente
```bash
python3 _source/dev-server.py 8096   # http://localhost:8096
cd worker && npm test                # 48 asserções (precisa do dev server acima)
cd worker && npx wrangler dev        # Worker em :8787, com chaves de TESTE
```

## Publicação e guardas
O CI (`.github/workflows/pages.yml`) tem três jobs:
- **construir** — corre o código do repositório e **não tem segredos**: `.github/guardas.mjs`
  confere os dados com as regras de `.github/regras.mjs` (as mesmas do painel) e
  `.github/preparar-site.sh` monta a `_site`;
- **publicar** — tem o token da Cloudflare e **não corre nada do repositório** (sem checkout;
  a config do wrangler e as verificações de fuga estão escritas no YAML);
- **avisar** — abre, comenta ou fecha a issue «Publicação parada».

Um produto com dados partidos sai de venda **só na cópia publicada** e o resto publica; só um
problema de estrutura (JSON ilegível, o interruptor dos pagamentos, os portes, os prazos, os
dados legais) pára a publicação.

```bash
PYTHON=<python com Pillow> node .github/test-guardas.mjs   # a bateria das guardas e do CI
PYTHON=<python com Pillow> .github/provar-publicacao.sh <base> [commit]   # uma mudança ao CI não muda o site (diff -r)
```

## Diagnóstico rápido
```
https://armazem-dos-pneus-pay.renato-lima-valente-dcb.workers.dev/health?probe=1
```
Diz se a chave da Stripe é válida e de produção, se a do Resend pertence à conta dona do
domínio, e quantos artigos o servidor está a ver.

## Contactos
Tel/WhatsApp: 935 218 857 · Email: armazemdospneus2019@gmail.com
Morada: Travessa do Navega 436 F, 3885-183 Arada, Ovar · Facebook: /armazem.dospeneus
