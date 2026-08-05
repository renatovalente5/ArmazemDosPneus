#!/usr/bin/env bash
# =============================================================
# Instala a chave restrita da Stripe na Cloudflare — mas só depois de
# confirmar que ela é do tipo certo e que a Stripe a aceita.
#
# Existe porque instalar às cegas com `wrangler secret put` deixa passar
# erros silenciosos: chave de teste em produção, chave já apagada, chave
# cortada a meio. Nenhum deles dá erro na instalação — só mais tarde, com
# clientes a tentar pagar.
#
# Uso:  bash worker/instalar-chave-stripe.sh
# A chave não aparece no ecrã, não fica no histórico da shell e não é
# escrita em ficheiro nenhum.
# =============================================================
set -uo pipefail
cd "$(dirname "$0")"

# Impressão digital da chave antiga, já apagada na Stripe. Se aparecer outra
# vez, é porque foi copiada do sítio errado.
readonly FP_ANTIGA='66f74cac'

printf 'Cola a chave restrita da Stripe (rk_live_…) e prime Enter:\n> '
IFS= read -rs KEY
printf '\n\n'

# Remove espaços, tabs e newlines que venham colados na cópia.
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"

falhar() { printf '  ✗ %s\n\n' "$1"; exit 1; }

[ -n "$KEY" ] || falhar 'Não colaste nada.'

case "$KEY" in
  rk_live_*) printf '  ✓ tipo: chave restrita de produção\n' ;;
  rk_test_*) falhar 'É uma chave de TESTE (rk_test_). Sai da "Área restrita"/Sandbox e usa o modo de produção.' ;;
  sk_test_*) falhar 'É a chave secreta de TESTE. Precisas da chave RESTRITA de produção (rk_live_).' ;;
  sk_live_*) falhar 'É a chave secreta completa (sk_live_). Usa a RESTRITA (rk_live_) — dá acesso à conta toda.' ;;
  pk_*)      falhar 'É a chave publicável. Precisas da restrita (rk_live_).' ;;
  *)         falhar 'Não começa por rk_live_ — verifica se copiaste o valor inteiro.' ;;
esac

if [ "${#KEY}" -lt 100 ]; then
  falhar "Só tem ${#KEY} caracteres; uma chave da Stripe tem ~107. Deve ter ficado cortada."
fi
printf '  ✓ comprimento: %s caracteres\n' "${#KEY}"

FP="$(printf '%s' "$KEY" | shasum -a 256 | cut -c1-8)"
if [ "$FP" = "$FP_ANTIGA" ]; then
  falhar 'É a chave ANTIGA, que já foi apagada na Stripe. Copia a nova do ecrã da Stripe (Chaves restritas → Prod), não de uma conversa ou do histórico.'
fi
printf '  ✓ impressão digital: %s (diferente da antiga)\n' "$FP"

printf '  … a perguntar à Stripe se aceita a chave\n'
CODE="$(curl -s -o /dev/null -w '%{http_code}' \
  'https://api.stripe.com/v1/checkout/sessions?limit=1' -u "$KEY:")"

case "$CODE" in
  200) printf '  ✓ a Stripe aceita (HTTP 200)\n\n' ;;
  401) falhar 'A Stripe recusa esta chave (401): não existe ou foi apagada.' ;;
  403) falhar 'Chave válida mas sem permissões (403): falta Checkout Sessions = Write e PaymentIntents = Read.' ;;
  000) falhar 'Não foi possível contactar a Stripe. Verifica a ligação à internet.' ;;
  *)   falhar "A Stripe respondeu HTTP $CODE — inesperado. Não instalei nada." ;;
esac

printf 'A instalar na Cloudflare…\n'
if printf '%s' "$KEY" | npx wrangler secret put STRIPE_RESTRICTED_KEY; then
  printf '\n  ✓ instalada. Leva ~15 s a propagar.\n'
  printf '  Confirma em:\n  https://armazem-dos-pneus-pay.renato-lima-valente-dcb.workers.dev/health?probe=1\n'
  printf '  Deve dizer  stripe_probe: ok  e  modo_chave: produção\n\n'
else
  falhar 'O wrangler falhou a instalar. Estás autenticado? (npx wrangler whoami)'
fi
