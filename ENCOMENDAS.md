# Encomendas da loja online — guia do dia a dia

Guia para quem trata das encomendas do **armazemdospneus.pt**. Não é preciso saber
nada de informática para o seguir.

---

## O que acontece quando alguém compra

1. O cliente escolhe os artigos no site e vai a "Finalizar encomenda".
2. É levado a uma página segura da **Stripe** para pagar (cartão, MB WAY, Multibanco ou Klarna).
   Os dados do cartão nunca passam pelo nosso site.
3. Assim que o pagamento entra, chega um email com o assunto:

   > **PAGAMENTO CONFIRMADO AP-20260805-xxxxxxxx — 312,89 €**

   Esse email traz **tudo** o que é preciso: os artigos, o total, a forma de entrega,
   a morada, o telefone e o **NIF do cliente**.
4. O cliente recebe automaticamente a confirmação da encomenda dele. Não é preciso fazer nada.

---

## ⚠️ A fatura tem de sair no MESMO DIA

Esta é a única obrigação com prazo, e não é negociável.

**A fatura tem a data em que o dinheiro entra**, não a data em que o cliente fez a
encomenda. Com o Multibanco, o cliente pode pagar três dias depois de encomendar — e a
fatura é do dia do pagamento.

O email **PAGAMENTO CONFIRMADO** é o sinal de partida. Quando ele chega:

1. Emitir a fatura no programa de faturação, com a data de **hoje**, na série **ONLINE**.
2. Linhas separadas: **artigos** (IVA 23%), **portes** (IVA 23%) e **ecovalor**.
3. Enviar a fatura ao cliente.

> Não faturar, ou faturar com data errada, é coima. Não esperar pelo fim da semana.

Se o email trouxer no assunto **VERIFICAR VALOR**, significa que o valor cobrado não é o
que esperávamos. **Não emitir a fatura** sem antes confirmar o valor real no painel da
Stripe, e avisar o Renato.

---

## Ver as encomendas

**No telemóvel** (mais prático): instalar a app **Stripe Dashboard** e ligar as
notificações. Cada pagamento dá um aviso, e dá para reembolsar ali mesmo.

**No computador:** `dashboard.stripe.com/payments`

---

## Estados de uma encomenda, e o que fazer

| Estado | O que significa | O que fazer |
|---|---|---|
| **Pago** | O dinheiro entrou | Emitir a fatura hoje e preparar a encomenda |
| **À espera de referência Multibanco** | O cliente escolheu referência e ainda não pagou | **Nada.** Não preparar, não faturar |
| **Referência expirou** | Passaram os 7 dias e o pagamento pode ainda estar a caminho | Esperar. Só faturar se e quando entrar |
| **Falhou** ou **Expirou** | O cliente não chegou a pagar | Nada. A encomenda não existe |
| **Reembolsado** | Devolvemos o dinheiro | Emitir **nota de crédito** no programa de faturação |
| **Contestado** | O cliente contestou a cobrança no banco | **Urgente** — ver abaixo |

---

## Referência Multibanco: o cuidado a ter

Quando o cliente escolhe referência, ela é **válida 7 dias** e pode ainda ser paga com
alguns dias de atraso depois disso.

**Durante esse tempo o stock não fica reservado** — e é isso que está escrito nos termos
do site, portanto está protegido. Mas na prática significa que, se for uma peça única
(uma jante, um pneu seminovo), é melhor marcá-la como indisponível no backoffice logo que
alguém peça a referência, para não vender duas vezes a mesma peça.

**Nunca preparar nem despachar uma encomenda antes do email PAGAMENTO CONFIRMADO.**

---

## Reembolsar

`dashboard.stripe.com/payments` → clicar no pagamento → **Refund**. Também dá pela app.

Duas coisas a saber:

- **A comissão da Stripe não volta.** Num reembolso de 300 € pagos por Multibanco, a loja
  fica com cerca de 9 € de custo. Não é a Stripe a ser injusta — é assim em todos os
  sistemas de pagamento.
- **É preciso emitir nota de crédito** no programa de faturação. O reembolso na Stripe não
  substitui o documento fiscal.

O cliente tem **14 dias** desde que recebe os artigos para desistir da compra sem dar
explicação, e o reembolso tem de ser feito em 14 dias, **incluindo os portes de entrega**.

---

## Se um cliente contestar a cobrança

Chega um aviso da Stripe. Responder com provas (comprovativo de entrega, conversa com o
cliente, fotos da montagem).

**Atenção ao prazo:** no cartão há semanas para responder; **no MB WAY há apenas 7 dias de
calendário**. Não deixar para depois.

O **Multibanco não tem contestações** — quando o dinheiro entra por referência, entra para
ficar.

---

## Pôr os pneus à venda online

Os pneus estão de fora por enquanto. A lei obriga a mostrar, em cada pneu novo vendido
à distância, informação que ainda falta no catálogo.

Para cada **pneu novo**, no backoffice:
- **Etiqueta UE — Classe de ruído (A/B/C)** — o valor em dB já lá está, falta a letra
- **ID EPREL** — o número da ficha do produto, que vem do fabricante
- Classe do pneu (C1, C2 ou C3) e os pictogramas de neve/gelo, se aplicáveis

Para cada **pneu seminovo**:
- **Código DOT** (a semana e o ano de fabrico, ex. `3221`)
- **Sulco medido em mm**
- **Garantia em meses** (mínimo 12)

Depois de preencher, marcar **Disponível** e o pneu passa a vender-se. Não é preciso mexer
em código nem chamar ninguém.

---

## Ainda em falta (falar com o Renato)

- **Preço da montagem** — tem de estar publicado no site
- **Custo real de devolução de um pneu ou jante** — enquanto não existir, a loja suporta
  esses custos por lei; para os cobrar ao cliente é preciso indicar o valor

---

## Desligar os pagamentos numa emergência

Se algo correr mal — a Stripe em baixo, um problema com as chaves, uma cobrança
errada — dá para desligar os pagamentos sozinho, sem ninguém:

No backoffice → **Definições → Pagamento → "Pagamentos online"** → escolher
**`reserva`** → **Save**.

A partir daí, quem tentar finalizar uma encomenda vê uma mensagem a explicar que
o pagamento online está indisponível, com os botões de **telefone** e de
**WhatsApp**. As encomendas continuam a entrar, por telefone, como antes de haver
loja online.

Para voltar a ligar, o mesmo caminho e escolher **`online`**.

> Isto é aplicado também do lado do servidor, não é apenas um aviso no ecrã:
> com o interruptor em `reserva`, nenhuma cobrança é possível.

## Se algo parecer avariado

Abrir esta página, que diz onde está o problema:

`https://armazem-dos-pneus-pay.renato-lima-valente-dcb.workers.dev/health?probe=1`

Se aparecer `"stripe_probe": "ok"` e `"email_probe": "ok"`, os pagamentos e os emails estão
bons. Se aparecer outra coisa, enviar essa página ao Renato — ela diz-lhe logo o que se
passa, sem ter de investigar.
