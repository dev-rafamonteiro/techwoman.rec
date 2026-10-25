# techwoman.rec
O Tech Woman Recife 2026 é um evento que visa ajudar mulheres a descobrir carreiras em tecnologia alinhadas ao seu perfil, interesses e habilidades, conectando-as com mentoras experientes da área.

## Estrutura

- `docs/PLAN.md` (backend, regras RN, endpoints E) e `docs/UI-SPEC.md` (telas P, M, A): especificações.
- `src/shared` (`@tw/shared`), `src/db` (`@tw/db`), `src/api` (`@tw/api`: server, worker, health), `src/web` (`@tw/web`), `tests` (`@tw/tests`): monorepo npm workspaces.
- `ops/`: Dockerfiles, `nginx.conf`, `compose.yaml` (produção) e `compose.dev.yaml` (local).

## Desenvolvimento

Requisitos: Node 24 (imagens usam `node:24-alpine`; Node mais novo funciona local) e Docker ou Podman.

```sh
cp .env.example .env        # preencha localmente; nunca commite
npm install
npm run db:indexes -- --wait # índices, validadores e Atlas Search no banco do MONGODB_URI (Atlas)
npm run db:seed             # evento, mesas e super admin (se SUPER_ADMIN_EMAIL definido)
npm run dev                 # api + web com reload
```

O banco da aplicação é sempre o Atlas: `MONGODB_URI` no `.env` aponta para o cluster (banco `techwoman`), tanto no
host quanto nos containers (`env_file`); o compose não cria banco local para api e worker. O usuário do banco só tem
`readWrite`: a API não roda `collMod` quando o validador já está igual; se um validador mudar, aplique com um usuário
dbAdmin (`npm run db:indexes`).

O mongo-local existe só para os testes de integração (`MONGODB_URI_TEST`; `tests/helpers/env.ts` recusa Atlas):
`npm run mongo:up` o sobe no perfil `test`. Transações e Change Streams (SSE, E38) exigem replica set, por isso
mongodb-atlas-local.

## Testes

```sh
npm test                    # unitários
npm run mongo:up            # mongo-local (perfil test) em localhost:27017
npm run test:integration    # integração, usa MONGODB_URI_TEST (mongo-local no ar)
npm run test:e2e            # Playwright (API :3100, vite :5180, banco tw_e2e; E2E_API_PORT/E2E_WEB_PORT mudam; E2E_BASE_URL usa stack já no ar)
```

## Stack completa com containers

```sh
docker compose -f ops/compose.dev.yaml --profile dev up --build   # api + worker (Atlas) + web + mailpit
# front em http://localhost:8080, API em http://localhost:8080/api/
docker compose -f ops/compose.dev.yaml down
```

E-mail: `api` e `worker` leem `EMAIL_PROVIDER`, `EMAIL_API_KEY` e `EMAIL_FROM` do `.env` da raiz. Com
`EMAIL_PROVIDER=resend` e a chave preenchida, as notificações saem pelo Resend (domínio `techwoman.dev` verificado);
sem isso, o worker só registra em log. WhatsApp fica desligado até `WHATSAPP_ENABLED=true` no `.env` da raiz; em dev o
compose usa `WHATSAPP_TRANSPORT=waha` com o WAHA local (`WAHA_URL=http://host.containers.internal:3000`,
`WAHA_SESSION=default`) e lê `WAHA_API_KEY` (worker) e `WAHA_WEBHOOK_HMAC_KEY` (api, E47) do `.env` da raiz. Os testes E2E forçam
`EMAIL_PROVIDER=console` e não enviam nada.

### Massa de demonstração

Com a stack de pé, carregue evento, mesas e a massa (1 coordenação, 10 mentoras, 40 participantes: 28 na fila,
2 com prioridade, 3 convites pendentes e 9 confirmadas). `MENTEE_TOKEN_SECRET` tem de ser o mesmo da API
(o valor de dev está em `ops/compose.dev.yaml`) para os links pessoais impressos funcionarem.

```sh
export MONGODB_URI='mongodb://localhost:27017/?directConnection=true' MONGODB_DB=techwoman EVENT_ID=dev
export SEED_REGISTRATION_OPEN=true MENTEE_TOKEN_SECRET='<o mesmo de ops/compose.dev.yaml>'
npm run db:seed
npm run db:seed:demo               # imprime logins, senha (uma vez) e links pessoais de exemplo
npm run db:seed:demo -- --reset    # apaga a massa anterior e recria (DEMO_PASSWORD fixa a senha)
```

Os e-mails da massa são `delivered+tw-demo-<nome>@resend.dev` (endereços de teste do Resend: simulam entrega).
Para receber de verdade, use `DEMO_EMAIL_TEMPLATE='voce+{slug}@seu-dominio'`. Os convites pendentes vencem em
15 minutos (RN da janela de resposta); recarregue com `--reset` antes da apresentação.

### E-mail de dev (Mailpit) e chave da outbox

- **Mailpit** (`axllent/mailpit`, perfil `dev`, rede `egress`): recebe todo e-mail de dev; nada sai para fora. Suba só ele com
  `docker compose -f ops/compose.dev.yaml --profile dev up -d mailpit`. Interface web em http://127.0.0.1:8025 (só loopback).
  SMTP sem autenticação nem TLS: **containers** (`api`, `worker`) usam `SMTP_HOST=mailpit` `SMTP_PORT=1025` (já definidos no compose);
  **host** (worker ou testes rodando fora do compose) usa `SMTP_HOST=127.0.0.1` `SMTP_PORT=1025`. No `.env` da raiz (processos no host) use `EMAIL_TRANSPORT=smtp`; nos containers o compose já força `smtp`.
  Limpar a caixa: `curl -X DELETE http://127.0.0.1:8025/api/v1/messages`; listar: `GET /api/v1/messages`.
- **`outbox_key`**: Docker secret com a chave AES-256-GCM da senha provisória na `outbox` (32 bytes aleatórios em base64, sem quebra de linha).
  Produção: arquivo `ops/secrets/outbox_key` (gitignored; gere com `head -c 32 /dev/urandom | base64 | tr -d '\n' > ops/secrets/outbox_key`),
  lido via `OUTBOX_KEY_FILE=/run/secrets/outbox_key` em `api` e `worker`. Dev: `OUTBOX_KEY` fixo em `ops/compose.dev.yaml`
  (só de dev). No host, exporte `OUTBOX_KEY` (ou `OUTBOX_KEY_FILE=ops/secrets/outbox_key`).
- **Variáveis novas** (`.env.example`, sem valores): `EMAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`/`SMTP_PASS_FILE`, `SMTP_SECURE`, `AWS_REGION`,
  `EMAIL_FROM`, `EMAIL_REPLY_TO`, `OUTBOX_KEY`/`OUTBOX_KEY_FILE`, `PUBLIC_BASE_URL`.
  WhatsApp (RN18): `WHATSAPP_TRANSPORT` (`waha` | `cloud`, padrão `cloud`), `WAHA_URL`, `WAHA_SESSION`, `WAHA_API_KEY`/`WAHA_API_KEY_FILE`
  (só o worker), `WAHA_WEBHOOK_HMAC_KEY`/`WAHA_WEBHOOK_HMAC_KEY_FILE` (só a API).
- Nota histórica: `autoEmbed` (voyage-4) não funciona no `mongodb-atlas-local` (8.3.4 e 8.3.13: `voyage-4 not registered yet`); a busca é só full text (`$search`).

Produção (`ops/compose.yaml`): `cloudflared` (profile `tunnel`), `web`, `api`, `worker`; redes `edge`, `app` (`internal: true`) e `egress`;
nenhuma porta publicada. Segredos em arquivos `ops/secrets/<nome>` (gitignored): `mongo_uri`, `jwt_secret`,
`turnstile_secret`, `email_api_key`, `outbox_key`, `whatsapp_token`, `waha_api_key`, `waha_webhook_hmac_key`, `cf_tunnel_token`
(todos precisam existir, mesmo vazios, para o `up`). A aplicação lê `VAR` ou `VAR_FILE`.

O `cloudflared` está no profile `tunnel` (fora por padrão). Com Cloudflare Tunnel:

```sh
EVENT_ID=... PUBLIC_BASE_URL=https://techwoman.dev docker compose -f ops/compose.yaml --profile tunnel up -d --build --scale api=4
```

**Variante com Nginx Proxy Manager** (servidor que já tem o NPM na rede docker externa `npm_network`): override `ops/compose.npm.yaml`.

```sh
docker compose -f ops/compose.yaml -f ops/compose.npm.yaml up -d --build   # EVENT_ID, PUBLIC_BASE_URL etc. no .env
```

- Containers: `techwoman-web` (redes `edge`, `app`, `npm_network`), `techwoman-api` (`app`, `egress`, fora da `npm_network`),
  `techwoman-worker` (`egress`, `npm_network`). Nenhuma porta publicada no host.
- Fluxo: internet → NPM (TLS de `techwoman.dev`) → `http://techwoman-web:8080` → nginx do projeto → `/api/*` e `/l/*` para `api:3000`.
  No NPM, o proxy host aponta para `techwoman-web`, porta `8080`, esquema `http`.
- WhatsApp: o worker fala com o WAHA pelo container (`WAHA_URL=http://waha:3000`) e o WAHA chama o webhook pelo container
  `http://techwoman-web:8080/api/webhooks/waha` (HMAC no `X-Webhook-Hmac`), sem passar pelo domínio.
- O nginx do projeto continua necessário: serve o build do SPA, aplica os cabeçalhos de segurança/CSP e faz o `/l/` do
  encurtador (E48). O NPM só termina o TLS e repassa tudo. O IP real vem só do `X-Real-IP` (que o NPM
  sobrescreve com o IP do cliente; `CLIENT_IP_HEADER=x-real-ip` no override) e, sem ele, do peer. O `CF-Connecting-IP` é
  ignorado nessa variante porque o cliente o forjaria; no Cloudflare Tunnel (`compose.yaml`) vale `CLIENT_IP_HEADER=cf`.
- O `container_name` fixo impede `--scale api=N`; para escalar, tire o `container_name` da `api` no override.

## Docker x Podman (encontrado até agora)

- `docker` aqui é alias para Podman 5.7; `podman compose` delega ao `docker-compose` (não há `podman-compose`).
- Redes `internal: true` e portas publicadas: o mongo-local do dev fica numa rede comum para publicar 27017.
- DNS: o Docker usa `127.0.0.11`, o Podman usa o gateway da rede. Por isso o `web` descobre o resolver em `/etc/resolv.conf` na partida (`ops/web-entrypoint.sh`) e o Nginx re-resolve `api` a cada requisição (escala com `--scale api=N`).
- Nginx roda sem root na porta 8080, com `pid` e temporários em `/tmp` (tmpfs, filesystem read-only).
- `mongodb-atlas-local` não reinicia limpo sobre dados de um container anterior (erro RSGhost / keyfile ausente), então o dev não usa volume: `stop`/`start` preserva os dados, `down` zera o banco. Para persistir, rode índices e seed de novo (`npm run db:indexes`, `npm run db:seed`).
- Healthcheck do mongo-local combina `db.runCommand({ping:1})` e `db.hello().isWritablePrimary` via `CMD-SHELL` (só o ping responde antes de o replica set eleger primário e a API caía com NotPrimaryOrSecondary); `CMD` com `--eval` contendo espaços foi quebrado em argumentos pelo Podman.
- Imagens sem prefixo de registry são resolvidas como `docker.io/...` pelo Podman.
