# Backoffice — Armazém dos Pneus (Pages CMS)

O site usa o **[Pages CMS](https://pagescms.org)** (gratuito) para o cliente gerir a loja
**sem tocar em código**. Cada alteração é gravada no repositório e o site atualiza em 1–2 min.

## Ativar (uma vez — feito pelo Renato)

1. Ir a **https://app.pagescms.org** e **Sign in with GitHub** (conta `renatovalente5`).
2. Instalar a **GitHub App "Pages CMS"** no repositório `renatovalente5/ArmazemDosPneus`
   (Sign in → *Install/authorize* → escolher o repo).
3. Abrir o repo no Pages CMS. Ele lê o ficheiro **`.pages.yml`** e mostra 3 secções:
   - **Produtos** — adicionar/editar/remover pneus, jantes, baterias, óleos.
     A lista aparece fechada, um produto por linha, com nome, medida e preço no resumo.
     Cada campo tem a explicação por baixo, no próprio backoffice — incluindo o que
     acontece se ficar mal preenchido. Vale a pena ler antes de perguntar.
     · **Preço**, **Stock** e **Peso** são obrigatórios: são eles que decidem o que é
       cobrado e quanto custam os portes.
     · **Disponível** — o interruptor para tirar algo de venda sem apagar a ficha.
     · **Etiqueta UE** (pneus novos) e **Seminovo** (DOT, sulco, garantia) — campos
       agrupados pelo prefixo do nome. Um pneu novo sem classe de ruído e sem ficha
       EPREL não pode ser anunciado; ver `ENCOMENDAS.md`.
     · **Código interno** — está no fim do formulário, porque quase nunca se toca.
       **Não alterar** num produto já existente: carrinhos guardados nos telemóveis
       dos clientes deixam de o encontrar e o pagamento é recusado.
   - **Imagens do site** — imagem do topo (hero) e da secção "Sobre".
   - **Definições** — portes por peso, prazos de entrega, devoluções, montagem,
     o interruptor dos pagamentos online e os contactos usados no aviso de avaria.
4. **Convidar o cliente**: em *Settings → Collaborators*, convidar por **email**
   (o cliente entra com um link, **sem precisar de conta GitHub**).

## Dia a dia (cliente)

- Entrar em **`/admin`** no site (ou em app.pagescms.org) → editar → **Save**.
- As imagens carregadas vão para `assets/uploads/` automaticamente.
- **Encomendas**: a loja recebe **pagamentos online** (cartão, MB WAY, Multibanco, Klarna).
  Cada pagamento gera um email com os dados do cliente e o NIF, e **a fatura tem de sair no
  mesmo dia**. Ver **[ENCOMENDAS.md](ENCOMENDAS.md)** — é o guia do dia a dia.
  Os pedidos de orçamento e de serviços de oficina continuam a chegar por WhatsApp (935 218 857).

## Notas
- Enviar imagens já com tamanho web (≤ 1600px) para o site ficar rápido.
- O botão "View on GitHub" que aparece nas imagens do Pages CMS é da ferramenta deles
  (não é possível escondê-lo). Com o repositório privado, não expõe nada.
