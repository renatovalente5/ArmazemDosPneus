# Armazém dos Pneus — Loja online + Oficina

E-commerce da **Armazém dos Pneus** (Motivar & Lucrar Unipessoal Lda) — venda de pneus novos e
seminovos, jantes, baterias e peças, e serviços de oficina em Arada, Ovar.
_"Os nossos clientes são a nossa prioridade!"_

Site estático (HTML/CSS/JS) em **GitHub Pages**, com **backoffice** (Pages CMS) e **pagamentos**
via **ifthenpay** (MB WAY / Multibanco / cartão) através de uma **Cloudflare Worker**.

## Estrutura
```
index.html          Página principal (loja + serviços)
admin/              Acesso ao backoffice (Pages CMS)
.pages.yml          Configuração do backoffice
worker/             Cloudflare Worker (checkout ifthenpay) — segredos NÃO ficam aqui
assets/css|js|img|fonts|uploads
data/               products.json, services.json, content.json, settings.json
legal/              privacidade, cookies, termos de venda
_source/            Fotos em alta + logo vetorial (NÃO publicado — ver .gitignore)
```

## Ver localmente
```bash
python3 _source/dev-server.py 8096   # http://localhost:8096
```

## Contactos
Tel/WhatsApp: 935 218 857 · Email: armazemdospneus2019@gmail.com
Morada: Travessa do Navega 436 F, 3885-183 Arada, Ovar · Facebook: /armazem.dospeneus
