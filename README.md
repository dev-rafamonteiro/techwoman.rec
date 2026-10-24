# techwoman.rec
O Tech Woman Recife 2026 é um evento que visa ajudar mulheres a descobrir carreiras em tecnologia alinhadas ao seu perfil, interesses e habilidades, conectando-as com mentoras experientes da área.

## Estrutura

- `index.html`, `jornada.html`, `css/`, `js/`, `assets/`: site estático original (intacto).
- `docs/PLAN.md` (backend, regras RN, endpoints E) e `docs/UI-SPEC.md` (telas P, M, A): especificações.
- `src/shared` (`@tw/shared`), `src/db` (`@tw/db`), `src/api` (`@tw/api`: server, worker, health), `src/web` (`@tw/web`), `tests` (`@tw/tests`): monorepo npm workspaces.
- `ops/`: Dockerfiles, `nginx.conf`, `compose.yaml` (produção) e `compose.dev.yaml` (local).

## Desenvolvimento

Requisitos: Node 24 (imagens usam `node:24-alpine`; Node mais novo funciona local) e Docker ou Podman.

```sh
cp .env.example .env        # preencha localmente; nunca commite
npm install
npm run mongo:up            # sobe só o mongo-local (replica set) em localhost:27017
npm run db:indexes          # cria índices
npm run db:seed             # dados iniciais / super admin
npm run dev                 # api + web com reload
```

Use `MONGODB_URI=mongodb://localhost:27017/?directConnection=true` (e `MONGODB_URI_TEST` igual) no `.env` local.
O mongo-local é necessário porque transações e Change Streams (SSE, E38) exigem replica set.

## Testes

```sh
npm test                    # unitários
npm run test:integration    # integração, usa MONGODB_URI_TEST (mongo-local no ar)
npm run test:e2e            # Playwright
```

## Stack completa com containers

```sh
docker compose -f ops/compose.dev.yaml up --build   # mongo-local + api + worker + web
# front em http://localhost:8080, API em http://localhost:8080/api/
docker compose -f ops/compose.dev.yaml down
```

Produção (`ops/compose.yaml`): `cloudflared`, `web`, `api`, `worker`; redes `edge`, `app` (`internal: true`) e `egress`;
nenhuma porta publicada. Segredos em arquivos `ops/secrets/<nome>` (gitignored): `mongo_uri`, `jwt_secret`,
`turnstile_secret`, `email_api_key`, `whatsapp_token`, `cf_tunnel_token`. A aplicação lê `VAR` ou `VAR_FILE`.

```sh
EVENT_ID=... PUBLIC_BASE_URL=https://techwoman.dev docker compose -f ops/compose.yaml up -d --build --scale api=4
```

## Docker x Podman (encontrado até agora)

- `docker` aqui é alias para Podman 5.7; `podman compose` delega ao `docker-compose` (não há `podman-compose`).
- Redes `internal: true` e portas publicadas: o mongo-local do dev fica numa rede comum para publicar 27017.
- DNS: o Docker usa `127.0.0.11`, o Podman usa o gateway da rede. Por isso o `web` descobre o resolver em `/etc/resolv.conf` na partida (`ops/web-entrypoint.sh`) e o Nginx re-resolve `api` a cada requisição (escala com `--scale api=N`).
- Nginx roda sem root na porta 8080, com `pid` e temporários em `/tmp` (tmpfs, filesystem read-only).
- Imagens sem prefixo de registry são resolvidas como `docker.io/...` pelo Podman.
