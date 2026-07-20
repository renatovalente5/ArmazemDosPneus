# Backoffice — Armazém dos Pneus (Pages CMS)

O site usa o **[Pages CMS](https://pagescms.org)** (gratuito) para o cliente gerir a loja
**sem tocar em código**. Cada alteração é gravada no repositório e o site atualiza em 1–2 min.

## Ativar (uma vez — feito pelo Renato)

1. Ir a **https://app.pagescms.org** e **Sign in with GitHub** (conta `renatovalente5`).
2. Instalar a **GitHub App "Pages CMS"** no repositório `renatovalente5/ArmazemDosPneus`
   (Sign in → *Install/authorize* → escolher o repo).
3. Abrir o repo no Pages CMS. Ele lê o ficheiro **`.pages.yml`** e mostra 3 secções:
   - **Produtos** — adicionar/editar/remover pneus, jantes, baterias, óleos (nome, categoria,
     marca, medida, estação, estado, preço, peso, imagem, etiqueta UE, destaque, disponível).
   - **Imagens do site** — imagem do topo (hero) e da secção "Sobre".
   - **Definições** — contactos da loja, escalões de portes (por peso) e modo de pagamento.
4. **Convidar o cliente**: em *Settings → Collaborators*, convidar por **email**
   (o cliente entra com um link, **sem precisar de conta GitHub**).

## Dia a dia (cliente)

- Entrar em **`/admin`** no site (ou em app.pagescms.org) → editar → **Save**.
- As imagens carregadas vão para `assets/uploads/` automaticamente.
- **Encomendas**: chegam por **WhatsApp** (935 218 857). A fatura é emitida manualmente
  no programa de faturação da loja (ver README / pagamento).

## Notas
- Enviar imagens já com tamanho web (≤ 1600px) para o site ficar rápido.
- O botão "View on GitHub" que aparece nas imagens do Pages CMS é da ferramenta deles
  (não é possível escondê-lo). Com o repositório privado, não expõe nada.
