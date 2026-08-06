# Armazém dos Pneus — Loja online + Oficina

E-commerce da **Armazém dos Pneus** (Motivar & Lucrar, Unipessoal, Lda.) — venda de pneus novos e
seminovos, jantes, baterias e peças, e serviços de oficina em Arada, Ovar.
_"Os nossos clientes são a nossa prioridade!"_

**https://armazemdospneus.pt** — site estático (HTML/CSS/JS) em **GitHub Pages**, com
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

## Diagnóstico rápido
```
https://armazem-dos-pneus-pay.renato-lima-valente-dcb.workers.dev/health?probe=1
```
Diz se a chave da Stripe é válida e de produção, se a do Resend pertence à conta dona do
domínio, e quantos artigos o servidor está a ver.

## Contactos
Tel/WhatsApp: 935 218 857 · Email: armazemdospneus2019@gmail.com
Morada: Travessa do Navega 436 F, 3885-183 Arada, Ovar · Facebook: /armazem.dospeneus
