#!/usr/bin/env bash
# =============================================================
# Instala a chave do Resend na Cloudflare — mas só depois de ENVIAR um email
# de verdade com ela.
#
# Validar com um envio real, e não só perguntando se a chave existe, testa de
# uma vez as três coisas que podem estar mal e que de outra forma só se
# descobririam quando um cliente não recebesse a confirmação da encomenda:
#   1. a chave é válida;
#   2. pertence à conta que é dona de armazemdospneus.pt;
#   3. o domínio está verificado, logo o Resend entrega a terceiros.
#
# Uso:  bash worker/instalar-chave-resend.sh
# Envia um email de teste para o Gmail da loja. A chave não aparece no ecrã,
# não fica no histórico da shell e não é escrita em ficheiro nenhum.
# =============================================================
set -uo pipefail
cd "$(dirname "$0")"

readonly DE='Armazém dos Pneus <encomendas@armazemdospneus.pt>'
readonly PARA='armazemdospneus2019@gmail.com'
# Impressão da chave antiga, já revogada. Se reaparecer, foi copiada do sítio errado.
readonly FP_ANTIGA='9863e873'

printf 'Cola a chave do Resend (re_…) e prime Enter:\n> '
IFS= read -rs KEY
printf '\n\n'
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"

falhar() { printf '  ✗ %s\n\n' "$1"; exit 1; }

[ -n "$KEY" ] || falhar 'Não colaste nada.'

case "$KEY" in
  re_*) printf '  ✓ tipo: chave do Resend\n' ;;
  rk_*|sk_*) falhar 'Essa é uma chave da Stripe, não do Resend.' ;;
  *) falhar 'Não começa por re_ — verifica se copiaste o valor certo.' ;;
esac

FP="$(printf '%s' "$KEY" | shasum -a 256 | cut -c1-8)"
[ "$FP" != "$FP_ANTIGA" ] || falhar 'É a chave ANTIGA, já revogada. Copia a nova de resend.com/api-keys, não de uma conversa nem do histórico.'
printf '  ✓ impressão digital: %s (diferente da antiga)\n' "$FP"

printf '  … a enviar um email de teste para %s\n' "$PARA"
CORPO=$(printf '{"from":"%s","to":["%s"],"subject":"Teste de configuracao — Armazem dos Pneus","text":"Se recebeste este email, o envio automatico das encomendas esta a funcionar.\\n\\nEnviado pela verificacao de configuracao. Podes apagar."}' "$DE" "$PARA")

RESP="$(curl -s -w '\n%{http_code}' -X POST 'https://api.resend.com/emails' \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d "$CORPO")"
CODE="$(printf '%s' "$RESP" | tail -n1)"
BODY="$(printf '%s' "$RESP" | sed '$d')"

case "$CODE" in
  200)
    printf '  ✓ o Resend aceitou e enviou (HTTP 200)\n'
    printf '    → confirma que chegou a %s antes de continuares\n\n' "$PARA"
    ;;
  401|400)
    falhar "O Resend recusa a chave: $(printf '%s' "$BODY" | head -c 160)"
    ;;
  403)
    falhar "Chave válida mas o envio foi recusado — normalmente o domínio não está verificado NESTA conta: $(printf '%s' "$BODY" | head -c 200)"
    ;;
  422)
    falhar "O Resend recusou o remetente ou o destinatário: $(printf '%s' "$BODY" | head -c 200)"
    ;;
  000) falhar 'Não foi possível contactar o Resend. Verifica a ligação.' ;;
  *)   falhar "O Resend respondeu HTTP $CODE: $(printf '%s' "$BODY" | head -c 160)" ;;
esac

printf 'A instalar na Cloudflare…\n'
if printf '%s' "$KEY" | npx wrangler secret put RESEND_API_KEY; then
  printf '\n  ✓ instalada. Leva ~15 s a propagar.\n'
  printf '  Confirma em:\n  https://armazem-dos-pneus-pay.renato-lima-valente-dcb.workers.dev/health?probe=1\n\n'
else
  falhar 'O wrangler falhou a instalar. Estás autenticado? (npx wrangler whoami)'
fi
