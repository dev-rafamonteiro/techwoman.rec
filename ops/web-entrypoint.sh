#!/bin/sh
# Descobre o DNS do runtime (Docker 127.0.0.11, Podman = gateway) para o nginx re-resolver "api" a cada chamada.
set -eu
ns=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
case "$ns" in *:*) ns="[$ns]";; esac
echo "resolver ${ns:-127.0.0.11} valid=5s ipv6=off;" > /tmp/resolver.conf
exec "$@"
