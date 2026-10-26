#!/bin/sh
# Copia o tracker do Umami (/app/public/script.js da imagem) para src/web/public/a/u.js e imprime o SRI.
# Uso (raiz do repo): ops/analytics/vendor-tracker.sh 3.4.0
# Depois: atualize UMAMI_VERSION e UMAMI_SCRIPT_SRI em src/web/analytics/core.ts, a tag em ops/analytics/compose.yaml
# e docs/PLAN.md > Analytics (Umami); rode npm test e rebuild do web. Detalhes no PLAN.
set -eu
v="${1:?informe a versão do Umami, ex.: 3.4.0}"
img="ghcr.io/umami-software/umami:$v"
out="src/web/public/a/u.js"
[ -d src/web/public ] || { echo "rode na raiz do repo" >&2; exit 1; }
docker pull "$img" >/dev/null
cid=$(docker create "$img")
trap 'docker rm "$cid" >/dev/null' EXIT
mkdir -p "$(dirname "$out")"
docker cp "$cid:/app/public/script.js" "$out"
echo "versão:  $v"
echo "arquivo: $out ($(wc -c < "$out" | tr -d ' ') bytes)"
echo "SRI:     sha384-$(openssl dgst -sha384 -binary "$out" | openssl base64 -A)"
