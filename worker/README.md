# Pagamentos online (ifthenpay + Cloudflare Worker)

O site funciona **sem isto** (modo *encomenda/reserva* por WhatsApp). Este Worker liga o
**pagamento online** (MB WAY / Multibanco) quando as contas estiverem prontas.

## Passos (uma vez)

1. **Conta ifthenpay** (o dono da loja): registar em <https://www.ifthenpay.com> com NIF + IBAN.
   Obter as chaves: **MB WAY key**, **Multibanco key** e **chave anti-phishing**.
2. **Conta Cloudflare** (grátis): <https://dash.cloudflare.com> (não precisa de cartão para Workers).
3. Instalar e publicar o Worker:
   ```bash
   cd worker
   npm i -g wrangler        # ou: npx wrangler ...
   wrangler login
   wrangler secret put IFT_MBWAY_KEY      # colar a chave (fica encriptada na Cloudflare)
   wrangler secret put IFT_MB_KEY
   wrangler secret put IFT_ANTIPHISHING
   wrangler deploy
   ```
   → fica em `https://armazem-dos-pneus-pay.<subdominio>.workers.dev`
4. No painel ifthenpay, definir o **URL de callback**:
   `https://<o-teu-worker>.workers.dev/callback?key=<CHAVE_ANTIPHISHING>`
5. No site, em `assets/js/checkout.js`, definir `PAY_ENDPOINT` para o URL do Worker e mudar
   `data/settings.json` → `payment.mode` para `"online"`. (Há um comentário no checkout.js a indicar onde.)

> As **chaves secretas ficam só na Cloudflare** (nunca no repositório). O Worker revalida
> sempre os preços a partir de `data/products.json` — o cliente nunca decide o valor a pagar.
