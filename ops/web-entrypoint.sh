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
exec "$@"
