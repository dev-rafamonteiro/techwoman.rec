#!/usr/bin/env bash
# Deploy automático no servidor (cron a cada ~30s, docs/PLAN.md > Deploy automático). Quando a main tem commit novo e o
# job build-test do CI passou nele: atualiza o repo e roda o mesmo `up -d --build` do deploy manual.
#
# Estado em ~/.techwoman-deploy: deployed-sha (no ar), failed-sha (deploy falhou; só tenta de novo com outro commit),
# deploy.log e PAUSED (se existir, não publica nada: `touch ~/.techwoman-deploy/PAUSED`).
set -euo pipefail
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin"

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${DEPLOY_STATE_DIR:-$HOME/.techwoman-deploy}"
CHECK_RUNS_URL="https://api.github.com/repos/dev-rafamonteiro/techwoman.rec/commits"
CI_CHECK="build-test"
# A API do GitHub sem token aceita 60 consultas por hora; 90s dá 40, mesmo com um commit preso em CI falho.
CI_POLL_SECONDS="${DEPLOY_CI_POLL_SECONDS:-90}"

mkdir -p "$STATE_DIR"
LOG="$STATE_DIR/deploy.log"
exec 2>>"$LOG"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >>"$LOG"; }

# Registra só quando a mensagem muda: o script roda a cada 30s
log_once() {
  if [ "$(cat "$STATE_DIR/last-message" 2>/dev/null || true)" != "$*" ]; then
    echo "$*" >"$STATE_DIR/last-message"
    log "$*"
  fi
}

exec 9>"$STATE_DIR/lock"
if ! flock -n 9; then exit 0; fi

if [ -e "$STATE_DIR/PAUSED" ]; then
  log_once "Pausado (PAUSED existe)"
  exit 0
fi

cd "$APP_DIR"

if [ ! -f "$STATE_DIR/deployed-sha" ]; then git rev-parse HEAD >"$STATE_DIR/deployed-sha"; fi

if ! target="$(git ls-remote origin refs/heads/main | cut -f1)" || [ -z "$target" ]; then
  log_once "AVISO: não consegui ler a main no GitHub"
  exit 0
fi

if [ "$target" = "$(cat "$STATE_DIR/deployed-sha")" ]; then exit 0; fi
if [ "$target" = "$(cat "$STATE_DIR/failed-sha" 2>/dev/null || true)" ]; then exit 0; fi

now="$(date +%s)"
read -r polled_sha polled_at 2>/dev/null <"$STATE_DIR/ci-poll" || { polled_sha=""; polled_at=0; }
if [ "$polled_sha" = "$target" ] && [ $((now - polled_at)) -lt "$CI_POLL_SECONDS" ]; then exit 0; fi
echo "$target $now" >"$STATE_DIR/ci-poll"

if ! ci="$(curl -fsS --max-time 15 -H 'Accept: application/vnd.github+json' "$CHECK_RUNS_URL/$target/check-runs?check_name=$CI_CHECK" |
  jq -er '.check_runs | sort_by(.started_at) | last | if . == null or .status != "completed" then "pending" else .conclusion end')"; then
  log_once "AVISO: não consegui ler o CI de ${target:0:7}"
  exit 0
fi

case "$ci" in
  success) ;;
  pending)
    log_once "${target:0:7}: aguardando o CI"
    exit 0
    ;;
  *)
    # sem failed-sha: se alguém rodar o CI de novo e passar, o deploy sai
    log_once "${target:0:7}: CI terminou em $ci, não publicado"
    exit 0
    ;;
esac

log "${target:0:7}: publicando"
if out="$(git fetch -q origin main 2>&1 &&
  git merge -q --ff-only "$target" 2>&1 &&
  GIT_SHA="$target" docker compose --progress plain -p techwoman --env-file .env -f ops/compose.yaml -f ops/compose.npm.yaml up -d --build --wait 2>&1)"; then
  echo "$target" >"$STATE_DIR/deployed-sha"
  rm -f "$STATE_DIR/failed-sha"
  # só as imagens antigas deste projeto: o servidor é compartilhado
  docker image prune -f --filter "label=com.docker.compose.project=techwoman" >/dev/null 2>&1 || true
  log "${target:0:7}: publicado"
else
  echo "$target" >"$STATE_DIR/failed-sha"
  log "ERRO: deploy de ${target:0:7} falhou. Últimas linhas:"
  echo "$out" | tail -n 40 >>"$LOG"
fi
