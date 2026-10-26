#!/bin/sh
# Descobre o DNS do runtime (Docker 127.0.0.11, Podman = gateway) para o nginx re-resolver "api" a cada chamada.
set -eu
ns=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
case "$ns" in *:*) ns="[$ns]";; esac
echo "resolver ${ns:-127.0.0.11} valid=5s ipv6=off;" > /tmp/resolver.conf
# Cabeçalho confiável para o IP do cliente (ver nginx.conf). Sem ele, cai no peer ($remote_addr).
case "${CLIENT_IP_HEADER:-x-real-ip}" in
  cf) h='$http_cf_connecting_ip' ;;
  x-real-ip) h='$http_x_real_ip' ;;
  *) echo "CLIENT_IP_HEADER inválido: use cf ou x-real-ip" >&2; exit 1 ;;
esac
echo "map $h \$client_ip { default $h; '' \$remote_addr; }" > /tmp/client-ip.conf
# Analytics (Umami; docs/PLAN.md > Analytics (Umami)). UMAMI_WEBSITE_ID vazio = desligado: sem metas e CSP só com 'self'.
wid="${UMAMI_WEBSITE_ID:-}"
host="${UMAMI_HOST_URL:-}"
connect="'self'"
: > /tmp/analytics.conf
nl='
'
case "$wid$host" in *"$nl"*) echo "UMAMI_WEBSITE_ID/UMAMI_HOST_URL com quebra de linha" >&2; exit 1 ;; esac
if [ -n "$wid" ]; then
  echo "$wid" | grep -Eqi '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' \
    || { echo "UMAMI_WEBSITE_ID inválido: use o UUID do site no Umami" >&2; exit 1; }
  echo "$host" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' \
    || { echo "UMAMI_HOST_URL inválido: use https://host, sem caminho e sem barra final" >&2; exit 1; }
  connect="'self' $host"
  {
    echo "sub_filter '</head>' '<meta name=\"tw-umami-website-id\" content=\"$wid\"><meta name=\"tw-umami-host-url\" content=\"$host\"></head>';"
    echo "sub_filter_once on;"
  } > /tmp/analytics.conf
fi
echo "add_header Content-Security-Policy \"default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src $connect; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'\" always;" > /tmp/csp.conf
exec "$@"
