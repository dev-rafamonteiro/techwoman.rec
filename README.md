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
npm run db:seed             # evento, mesas e super admin (se SUPER_ADMIN_EMAIL definido)
npm run dev                 # api + web com reload
```

Use `MONGODB_URI=mongodb://localhost:27017/?directConnection=true` (e `MONGODB_URI_TEST` igual) no `.env` local.
Para índices e seed sem gravar nada no `.env`, exporte as variáveis só no shell:

```sh
MONGODB_URI='mongodb://localhost:27017/?directConnection=true' MONGODB_DB=techwoman_dev \
  SUPER_ADMIN_EMAIL=admin@dev.local SUPER_ADMIN_PASSWORD='<senha-de-dev-com-12+-caracteres>' \
  npm run db:seed
```

Para os testes de integração use `MONGODB_URI_TEST` (mesma URI) com bancos próprios (ex. `tw_e2e`).
O mongo-local é necessário porque transações e Change Streams (SSE, E38) exigem replica set.

## Testes

```sh
npm test                    # unitários
npm run test:integration    # integração, usa MONGODB_URI_TEST (mongo-local no ar)
npm run test:e2e            # Playwright (API :3100, vite :5180, banco tw_e2e; E2E_API_PORT/E2E_WEB_PORT mudam; E2E_BASE_URL usa stack já no ar)
```

## Stack completa com containers

```sh
docker compose -f ops/compose.dev.yaml up --build   # mongo-local + api + worker + web
# front em http://localhost:8080, API em http://localhost:8080/api/
docker compose -f ops/compose.dev.yaml down
```

E-mail: `api` e `worker` leem `EMAIL_PROVIDER`, `EMAIL_API_KEY` e `EMAIL_FROM` do `.env` da raiz. Com
`EMAIL_PROVIDER=resend` e a chave preenchida, as notificações saem pelo Resend (domínio `techwoman.dev` verificado);
sem isso, o worker só registra em log. WhatsApp fica desligado (`WHATSAPP_ENABLED=false`). Os testes E2E forçam
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
- `mongodb-atlas-local` não reinicia limpo sobre dados de um container anterior (erro RSGhost / keyfile ausente), então o dev não usa volume: `stop`/`start` preserva os dados, `down` zera o banco. Para persistir, rode índices e seed de novo (`npm run db:indexes`, `npm run db:seed`).
- Healthcheck do mongo-local combina `db.runCommand({ping:1})` e `db.hello().isWritablePrimary` via `CMD-SHELL` (só o ping responde antes de o replica set eleger primário e a API caía com NotPrimaryOrSecondary); `CMD` com `--eval` contendo espaços foi quebrado em argumentos pelo Podman.
- Imagens sem prefixo de registry são resolvidas como `docker.io/...` pelo Podman.
