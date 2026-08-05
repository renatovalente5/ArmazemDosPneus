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

Zero dependências de runtime — fala com a API por `fetch()`. O `wrangler` é só
ferramenta de desenvolvimento.

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
npx wrangler dev                    # :8787
stripe listen --forward-to http://localhost:8787/stripe/webhook
python3 ../_source/dev-server.py 8096
node ../_source/test-worker.mjs     # testes das partes puras (46 asserções)
```

O `stripe listen` imprime um `whsec_` **local**, diferente do do dashboard — é
esse que vai para o `.dev.vars`. Em local, apontar `PRODUCTS_URL` e
`SETTINGS_URL` para `http://localhost:8096/data/…`.

## Consultar encomendas sem backoffice

```bash
npx wrangler kv key list --binding ORDERS --prefix "order:"
npx wrangler kv key get "order:AP-20260731-ab12cd34" --binding ORDERS
```

Cada encomenda tem `status`: `criada` → `aguarda_pagamento` →
`aguarda_multibanco` → `paga` (ou `falhou`, `expirou`,
`voucher_expirado_a_aguardar`, `reembolsada`, `contestada`).

## Limites do plano gratuito

100.000 pedidos/dia e **1.000 escritas KV/dia**. Cada encomenda gasta 4-6
escritas → cerca de 150-200 encomendas/dia. Folgado.

O rate limit é *best-effort* em memória, deliberadamente **não** em KV: um
atacante a bater na rota esgotaria a quota de escritas, que é a mesma das
encomendas.

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
  venham no corpo do pedido são ignorados (testado em `_source/test-worker.mjs`).
