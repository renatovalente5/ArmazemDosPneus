# Worker de pagamentos — Armazém dos Pneus (Stripe)

Back-end serverless na Cloudflare que cria os pagamentos e recebe as confirmações
da Stripe. O site (GitHub Pages) é estático e **nunca** vê a chave secreta.

> Substituiu a integração ifthenpay (que nunca foi ativada). O cliente contratou
> a Stripe em julho de 2026.

## Como funciona

```
checkout.html                 Worker                      Stripe
  │                              │                           │
  │ POST /checkout               │                           │
  │ { items:[{sku,qty}],         │                           │
  │   entrega, cliente }         │                           │
  │   (nunca preços!)            │                           │
  ├─────────────────────────────►│                           │
  │                              │ lê products.json e        │
  │                              │ settings.json e RECALCULA │
  │                              │ tudo em cêntimos          │
  │                              ├──────────────────────────►│ cria Checkout Session
  │◄─────────────────────────────┤   { url }                 │
  │                                                          │
  └──── redirect ───────────────────────────────────────────►│ checkout.stripe.com
                                                             │ MB WAY / cartão / Multibanco
                                 │◄─────────────────────────┤ webhooks
                                 │  grava estado em KV,      │
                                 │  email ao dono + cliente  │
```

**A fonte da verdade do pagamento é o webhook, não o redirect.** Com Multibanco o
cliente nunca chega à página de sucesso: recebe uma referência e paga dias depois.

### Regras que não se podem quebrar

`checkout.session.completed` **não significa que foi pago.** Com Multibanco chega
com `payment_status: "unpaid"`. Dinheiro recebido é `payment_status !== 'unpaid'`,
ou os eventos `async_payment_succeeded` / `payment_intent.succeeded`.

`payment_intent.processing`, no Multibanco, significa **"a referência expirou e
corre o prazo suplementar"** — não significa que o cliente pagou.

## Ficheiros

| Ficheiro | Papel |
|---|---|
| `src/index.js` | Router, validações, criação da sessão, webhook, `/order` |
| `src/pricing.js` | Recalcula preços, peso e portes a partir dos JSON do site |
| `src/stripe.js` | Cliente REST mínimo + verificação HMAC do webhook |
| `src/mail.js` | Emails: aviso ao dono, confirmação legal ao cliente, referência MB |
| `src/termos.js` | O que se promete ao cliente (prazos, devolução, contactos, empresa): lê-o dos JSON do site, valida-o e guarda o retrato na encomenda |
| `src/email-html.js` | O HTML dos emails (tabelas, estilos em linha, modo escuro) |
| `test.mjs`, `test/` | A bateria (`npm test`) e a mesma prova no workerd (`npm run test:workerd`) |

Zero dependências de runtime — fala com a API por `fetch()`. O `wrangler` é só
ferramenta de desenvolvimento.

## O que se promete ao cliente

Prazos de entrega, custo da devolução, contactos e dados da empresa **não estão
escritos neste Worker**: o dono muda-os no painel e o Worker lê-os do site, no
`/checkout`, com a mesma cache de 60 s do catálogo:

| Ficheiro do site | Campos | Onde aparecem |
|---|---|---|
| `data/settings.json` | `delivery.estimate_min_days`, `estimate_max_days`, `max_days` | página da Stripe (envio), confirmação ao cliente |
| `data/settings.json` | `returns.return_cost_eur` | confirmação ao cliente: número > 0 = o cliente paga esse valor; `null`/ausente/0 = a loja paga (a mesma regra do checkout) |
| `data/site.json` | `contactos.telefone`, `contactos.email` | confirmação, referência Multibanco, reply-to, mensagem da Madeira/Açores |
| `data/empresa.json` | `nome`, `denominacao`, `nif`, `morada`, `livro_reclamacoes` | página da Stripe (levantamento), confirmação ao cliente |

**Retrato.** O `/checkout` guarda na encomenda (`order.termos`) o que disse ao
cliente nesse momento. Os emails que saem depois (webhook — com Multibanco, dias
depois) repetem o retrato, e não o que o site disser entretanto.

**Recurso.** Um ficheiro que ainda não existe (404), ou um valor fora da regra,
não chega aos emails: esse grupo usa os valores de sempre (`DELIVERY_*`,
`STORE_PHONE`, `STORE_EMAIL` e a empresa escrita em `src/termos.js`). Cada grupo
cai inteiro (prazos; denominação + NIF; morada). Um `site.json` ou `empresa.json`
que **existe e não se lê** (5xx, rede, JSON partido, mais de 64 KiB) **pára o
`/checkout` com 503**: o recurso é a empresa e os contactos de 30 set, que o
dono já mudou no painel, e não se promete isso a um cliente. Encomendas criadas
antes desta versão não têm retrato e usam o recurso — foi isso que se lhes
prometeu. Cada leitura que não é «ok» e os valores recusados ficam no registo
(`termos: site.json não se leu…`, `termos: valores recusados…`).

**Condições mostradas.** O `checkout.js` manda no pedido as condições que a
página mostrou (`condicoes`: prazos e custo da devolução). Se as do retrato
forem piores para o cliente, o `/checkout` responde **409** com as novas, sem
sessão nem escrita, e a página mostra-as antes de o cliente confirmar outra vez.
Numa encomenda com montagem, o retrato guarda também o preço da montagem que o
checkout mostrou (`termos.montagem.preco_eur`).

**Regras** (o painel tem de ser igual ou mais apertado, senão o que o dono grava
não chega aos emails — o `.github/regras.mjs` é, e o `.github/test-guardas.mjs`
prova-o contra este `termos.js`; quem mudar uma regra aqui corre essa bateria): prazos inteiros, 1 ≤ mínimo ≤ máximo estimado ≤ 30,
prazo máximo 1–30; custo da devolução número 0–1000 (ou `null`); telefone com
9–15 algarismos e só `+ ( ) . -` e espaços; email sem espaços nem `< > ,`; NIF
com 9 algarismos, o primeiro ≠ 0, e o de controlo certo; rua 3–120, localidade
2–60, concelho opcional, sem `[ ] : < > * _` (a Stripe desenha Markdown), código
postal `0000-000`; Livro de Reclamações só `https://`.

Depois de publicar, `/health?probe=1` diz de onde vem cada grupo:
`termos.origem` (`dados` ou `recurso`), `termos.ficheiros` e `termos.recusados`.

## Deploy (pela primeira vez)

Pré-requisitos: conta Cloudflare (plano gratuito, sem cartão) e Node instalado.

```bash
cd worker
npm install
npx wrangler login
```

**1. Criar o armazenamento das encomendas** e colar os dois ids no `wrangler.toml`:

```bash
npx wrangler kv namespace create ORDERS
npx wrangler kv namespace create ORDERS --preview
```

**2. Publicar o Worker** (antes dos segredos — cada `secret put` faz deploy imediato):

```bash
npx wrangler deploy
```

**3. Instalar os segredos.** O valor é pedido no terminal e nunca fica em ficheiro:

```bash
npx wrangler secret put STRIPE_RESTRICTED_KEY
npx wrangler secret put RESEND_API_KEY
```

> Usar uma **chave restrita** (`rk_live_…`), criada em *Developers → API keys →
> Create restricted key*, com **apenas**: *Checkout Sessions* = **write**,
> *PaymentIntents* / *Charges* / *Refunds* = **read**. Nunca a `sk_live`: uma
> chave restrita comprometida não move dinheiro nem altera a conta.

**4. Registar o webhook** no dashboard da Stripe (*Developers → Webhooks → Add
endpoint*), com o URL `https://<worker>/stripe/webhook` e estes eventos:

```
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
payment_intent.requires_action        ← indispensável: é daqui que vem a referência Multibanco
payment_intent.succeeded
payment_intent.processing
payment_intent.payment_failed
charge.refunded
charge.dispute.created
```

Copiar o *signing secret* e instalar:

```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

**5. Limpar os segredos antigos do ifthenpay**, se existirem nesta conta:

```bash
npx wrangler secret delete IFT_MBWAY_KEY
npx wrangler secret delete IFT_MB_KEY
npx wrangler secret delete IFT_ANTIPHISHING
```

**6. Confirmar:**

```bash
curl https://<worker>/health     # todos os has_* devem estar true
npx wrangler tail                # ver os eventos a chegar em tempo real
```

> ⚠️ **Test mode e live mode têm webhooks e segredos SEPARADOS.** Registar o
> endpoint nos dois, e nunca misturar o `whsec` de um com a chave do outro.

## Desenvolvimento local

```bash
cp .dev.vars.example .dev.vars      # preencher com chaves de TESTE
npm run dev                         # :8787 (junta http://localhost:8096 às origens, com --var)
stripe listen --forward-to http://localhost:8787/stripe/webhook
python3 ../_source/dev-server.py 8096
npm test                            # a bateria: sem rede, sem Stripe, sem servidor à parte
npm run test:workerd                # a mesma prova no runtime verdadeiro (precisa do npm install)
```

O `http://localhost:8096` **não** está no `ALLOWED_ORIGINS` do `wrangler.toml`:
em produção, uma página em localhost não pode chamar o `/checkout`.

A bateria conduz o Worker inteiro (`/checkout`, webhooks assinados, emails) e
compara-o com o Worker de antes da fase W-dados, tirado do git (commit
`7683ab4`): precisa do histórico (num clone raso, `git fetch --unshallow`).

O `stripe listen` imprime um `whsec_` **local**, diferente do do dashboard — é
esse que vai para o `.dev.vars`. Em local, apontar `PRODUCTS_URL`,
`SETTINGS_URL`, `SITE_DATA_URL` e `EMPRESA_URL` para `http://localhost:8096/data/…`
(já está no `.dev.vars.example`).

## Consultar encomendas sem backoffice

```bash
npx wrangler kv key list --binding ORDERS --prefix "order:"
npx wrangler kv key get "order:AP-20260731-ab12cd34" --binding ORDERS
```

Cada encomenda tem `status`: `aguarda_pagamento` (gravada quando a Stripe cria a
sessão; as antigas podem estar em `criada` ou `erro_stripe`) →
`aguarda_multibanco` → `paga` (ou `falhou`, `expirou`,
`voucher_expirado_a_aguardar`, `parcialmente_reembolsada`, `reembolsada`,
`contestada`). O estado não recua: um evento atrasado não desfaz um pagamento,
um reembolso nem uma contestação, e cada evento relê a encomenda antes de gravar
e junta só o que mudou (`juntarEncomenda`). O KV não tem escrita condicional:
dois eventos no mesmo milissegundo ainda podem perder um campo um do outro.

## Limites do plano gratuito

100.000 pedidos/dia e **1.000 escritas KV/dia — da conta inteira** (os outros
projectos da conta também escrevem). Um `/checkout` grava 2 vezes (a encomenda e
a sessão); um evento da Stripe grava a encomenda só se a mudou, e as marcas
`evt:`/`seen:` só nos que mandam emails. Uma encomenda paga gasta cerca de 6–8.

Um `/checkout` forjado gasta 3 (o checkout e a sessão expirada). O travão: o
binding `TRAVAO_CHECKOUT` (`[[ratelimits]]` no `wrangler.toml`, 5 por minuto por
IP, em todos os isolates da localização) e, sem ele, o de memória. Não chega
contra um ataque de muitos IPs — isso pede Turnstile no checkout, ou as
encomendas fora do KV (D1 ou um Durable Object).

Se o Resend falhar, o webhook responde 500 e a Stripe reentrega (até 3 dias):
os emails saem antes da resposta, e as marcas só depois deles.

## Notas de segurança

- Os segredos ficam encriptados na Cloudflare e não são legíveis depois de
  definidos — nem por nós. Para os mudar, define outra vez.
- `/checkout` e `/order` só respondem a origens em `ALLOWED_ORIGINS` (403 fora).
- `/stripe/webhook` **não** tem CORS, verificação de Origin nem rate limit — de
  propósito. A Stripe não é um browser, e um 403 ou 429 daqui provoca reentregas
  em ciclo.
- O **NIF, a matrícula e as notas nunca são enviados para a Stripe.** Ficam no KV
  e no email ao dono. A Stripe recebe só o número da encomenda e o modo de entrega.
- O valor cobrado é sempre recalculado no servidor. Preços, portes e totais que
  venham no corpo do pedido são ignorados (testado em `test.mjs`).
