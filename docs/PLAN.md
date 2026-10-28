# SDD 2 — Funcional e Backend: Mentoria Tech Woman

Oct 23, 2026 · @Felipe

## Visão geral e decisões de arquitetura

O sistema é uma API Node.js com MongoDB Atlas, em containers Docker atrás do Cloudflare, que implementa as telas do SDD 1 (códigos P, M e A) e garante, por índices únicos e transações, que nenhuma participante, mesa ou mentora fique em dois lugares no mesmo horário.

**Escopo:** inscrição de participantes, login e painel das mentoras, painel admin/super admin, agendamento mesa × horário, notificações e tempo real. A gamificação existente continua no front; o back só recebe o resultado.

| Tema | Decisão | Motivo |
| --- | --- | --- |
| Runtime | Node.js 24 LTS + TypeScript | Stack que o time já usa |
| Framework HTTP | Fastify + Zod (validação e tipos) | Leve, rápido, schema por rota |
| Banco | MongoDB Atlas, região São Paulo, driver oficial (sem ODM) | Transações, Change Streams e controle fino dos índices |
| Front | Site atual + telas novas em React + Vite (TypeScript) no mesmo build | Reaproveita home e gamificação; SPA servida como estático |
| Tempo real | Server-Sent Events alimentados por Change Streams | Unidirecional, simples atrás de proxy, reconexão nativa |
| Fila de notificações | Coleção `outbox` no MongoDB + container `worker` | Sem broker extra; reprocessamento e auditoria no mesmo banco |
| Autenticação | E-mail + senha (argon2id), JWT curto em cookie httpOnly + sessão no banco | Revogação imediata (desativar mentora) |
| Participante | Sem senha; link pessoal com token aleatório | Fricção mínima no evento |
| Agenda | Grade fixa de horários gerada pela configuração do evento | Elimina sobreposição parcial; conflito vira chave única |
| Distribuição | A mentora escolhe a participante (sem round robin) | Decisão da conversa de 23/10 |
| Infra | Docker Compose em VM própria, exposta só via Cloudflare Tunnel | Nenhuma porta pública aberta |
| Domínio | techwoman.dev | Sem domínio ou marca Bradesco |

**Números de referência para dimensionamento:** cerca de 2.500 mulheres no evento; 45 a 50 mentoras; 20 mesas; evento das 8h00 às 18h00, com grade de mentoria das 10h00 às 16h45: 9 sessões de 45 min, sem intervalo, e até 180 mentorias em 20 mesas. A capacidade é bem menor que o público, por isso as telas avisam que a inscrição não garante vaga.

**Portabilidade:** há discussão interna sobre internalizar o site depois. Tudo fica em containers, configurável por variáveis de ambiente e sem dependência do Cloudflare no código (Turnstile e Tunnel são plugáveis).

**Busca:** a busca livre roda no MongoDB Atlas com Atlas Search (`$search`, por palavra, com acentos e erros de digitação). Não há busca por significado (vetores/embeddings): decisão de 24/10. Detalhes na seção "Busca no Atlas".

## Arquitetura e segregação com Docker

São quatro containers em três redes Docker: só o `cloudflared` fala com a internet de entrada, só `api` e `worker` falam com o Atlas, e o `web` nunca enxerga o banco.

&#91;embedded content: arquitetura · 4 containers, 3 redes, Atlas e provedores\]

A requisição entra pelo Cloudflare, atravessa o túnel até o Nginx e chega à API pela rede interna; o worker não recebe tráfego, só lê a fila no Atlas e envia mensagens.

| Container | Imagem / base | Função | Redes |
| --- | --- | --- | --- |
| `cloudflared` | cloudflare/cloudflared | Túnel de saída para o Cloudflare; nenhuma porta publicada no host | `edge` |
| `web` | nginx:alpine + build do front | Serve a SPA e faz proxy de `/api/*` e do link curto `/l/*` (E48) para a API; cabeçalhos de segurança | `edge`, `app` |
| `api` | node:24-alpine (multi-stage, usuário não root) | REST, autenticação, regras de agenda, SSE | `app`, `egress` |
| `worker` | mesma imagem da API, comando diferente | Consome `outbox`, envia e-mail/WhatsApp, expira convites, dispara lembretes | `egress` |
| `mongo-local` (só perfil `dev`) | mongodb/mongodb-atlas-local | Banco local com replica set para transações e Change Streams | `app` |

**Redes:**

- `edge`: ponte entre túnel e Nginx.
- `app`: marcada `internal: true`; sem saída para a internet. Só `web` → `api`.
- `egress`: saída para Atlas (IP da VM liberado na Access List) e para os provedores de mensagem.

**Variante com Nginx Proxy Manager (`ops/compose.npm.yaml`):** em servidor que já tem o Nginx Proxy Manager (NPM) na rede docker externa `npm_network`, o `cloudflared` fica de fora (ele está no profile `tunnel` e só sobe com `--profile tunnel`) e a subida é `docker compose -f ops/compose.yaml -f ops/compose.npm.yaml up -d --build`. Containers com nome fixo: `techwoman-web` (redes `edge`, `app` e `npm_network`), `techwoman-api` (`app`, `egress`; não entra na `npm_network`) e `techwoman-worker` (`egress`, `npm_network`). O fluxo é NPM (TLS de `techwoman.dev`) → `http://techwoman-web:8080` → nginx do projeto → `api:3000`, sem porta publicada no host. O worker fala com o WAHA pelo container (`http://waha:3000`) e o WAHA chama o webhook pelo container (`http://techwoman-web:8080/api/webhooks/waha`), sem passar pelo domínio. O nginx do projeto continua necessário: serve o build do SPA, aplica os cabeçalhos de segurança/CSP e faz o `/l/` do encurtador; o NPM só termina o TLS e repassa tudo. O IP real do cliente vem de um único cabeçalho confiável, escolhido por `CLIENT_IP_HEADER` no web (o entrypoint gera `/tmp/client-ip.conf`): `x-real-ip` nesta variante (o NPM sobrescreve o `X-Real-IP` com o IP do cliente; o `CF-Connecting-IP` é ignorado porque o cliente o forjaria) e `cf` no Cloudflare Tunnel (`CF-Connecting-IP`, posto pela borda); sem o cabeçalho, vale o peer. Se a Cloudflare passar a fazer proxy na frente do NPM, o `X-Real-IP` vira o IP da borda: o NPM precisa então de `real_ip_header CF-Connecting-IP` com `set_real_ip_from` das faixas da Cloudflare. Com `container_name` fixo não há `--scale api=N`.

**Analytics:** o Umami roda numa stack separada (`ops/analytics/compose.yaml`, projeto `umami`), fora das redes do app e da `npm_network`; o NPM o alcança só pela rede `umami_edge`. Ver Analytics (Umami).

**Regras de container:** filesystem somente leitura (`read_only: true` + `tmpfs` para `/tmp`), `no-new-privileges`, limites de CPU e memória por serviço, `healthcheck` em todos, segredos via Docker secrets (URI do Atlas, chave JWT, chaves de e-mail/WhatsApp/Turnstile), nunca em variável no `compose.yaml`.

**Escala no dia:** `docker compose up -d --scale api=4`. O Nginx resolve `api` pelo DNS interno do Docker e distribui as requisições. A API é sem estado (sessão no Mongo), então qualquer réplica atende qualquer requisição, inclusive SSE.

```yaml
# compose.yaml (esqueleto)
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel run
    secrets: [cf_tunnel_token]
    networks: [edge]
    restart: unless-stopped
  web:
    build: ./web
    read_only: true
    tmpfs: [/var/cache/nginx, /var/run]
    networks: [edge, app]
    depends_on: { api: { condition: service_healthy } }
  api:
    build: ./api
    command: ["node", "dist/server.js"]
    read_only: true
    tmpfs: [/tmp]
    security_opt: ["no-new-privileges:true"]
    secrets: [mongo_uri, jwt_secret, turnstile_secret]
    networks: [app, egress]
    healthcheck: { test: ["CMD", "node", "dist/health.js"], interval: 10s }
    deploy: { resources: { limits: { cpus: "1.5", memory: 768M } } }
  worker:
    build: ./api
    command: ["node", "dist/worker.js"]
    read_only: true
    secrets: [mongo_uri, email_api_key, whatsapp_token, waha_api_key]
    networks: [egress]
  mongo-local:
    image: mongodb/mongodb-atlas-local:latest
    profiles: [dev]
    networks: [app]
networks:
  edge: {}
  app: { internal: true }
  egress: {}
secrets:
  mongo_uri: { file: ./secrets/mongo_uri }
  # demais segredos no mesmo formato
```

**Estrutura do repositório:**

```
/web        front (P, M, A), Dockerfile do Nginx, nginx.conf
/api        src/routes, src/domain (regras), src/db (índices, migrações), src/worker
/api/scripts  seed-super-admin, create-indexes, import-mentoras
/ops        compose.yaml, compose.dev.yaml, k6 (teste de carga)
```

## Perfis e matriz de permissões

Um usuário de staff pode ter mais de um papel (`roles: ["mentor", "admin"]`); a participante não é usuária e só age sobre a própria inscrição, pelo token do link pessoal.

| Ação | Participante (token) | Mentora | Admin | Super admin |
| --- | --- | --- | --- | --- |
| Inscrever-se, ver e responder a própria mentoria | Sim | — | — | — |
| Editar a própria disponibilidade | — | Sim | — | — |
| Ver fila de aguardando (sem e-mail/telefone) | — | Sim | Sim (com contato) | Sim (com contato) |
| Convidar participante para a própria agenda | — | Sim | — | — |
| Agendar, mover ou cancelar em nome de qualquer mentora | — | — | Sim | Sim |
| Cadastrar, editar, desativar mentora; redefinir senha | — | — | Sim | Sim |
| Importar mentoras por CSV | — | — | Sim | Sim |
| Ver e exportar participantes com contato | — | — | Sim | Sim |
| Configurar evento, grade, mesas e textos | — | — | — | Sim |
| Criar admins e super admins | — | — | — | Sim |
| Ver auditoria | — | — | Sim | Sim |

**Implementação:**

- Middleware `requireRole(...roles)` em todas as rotas `/api/mentor/*` e `/api/admin/*`; rotas de super admin usam `requireRole("super_admin")`.
- Escopo por dono: toda rota de mentora filtra por `mentorId = session.userId` no próprio filtro da query, nunca só no front.
- Projeção por papel: a fila vista pela mentora usa uma projeção sem `email`, `phone` e `consent`.
- O primeiro super admin é criado pelo script `seed-super-admin` na implantação; não existe rota pública para isso.
- Invariante: sempre existe ao menos um super admin ativo; a API recusa a operação que violaria isso.

## Modelo de dados MongoDB Atlas e índices

São oito coleções principais (mais a auxiliar \`idempotency\_keys\`, com TTL); a regra "ninguém em dois lugares ao mesmo tempo" mora em três índices únicos parciais da coleção `appointments`, e não no código.

| Coleção | Guarda | Telas |
| --- | --- | --- |
| `events` | Configuração do evento e grade de horários materializada | A7, todas |
| `users` | Staff: mentoras, admins, super admins (com disponibilidade) | M1–M3, A2, A3, A8 |
| `sessions` | Sessões de login revogáveis | M1, todas autenticadas |
| `tables` | Mesas | A6, M5, A5 |
| `mentees` | Participantes inscritas e status na fila | P4–P6, M4, A4 |
| `appointments` | Convites e mentorias (mesa × horário × mentora × participante) | M5, M6, A5, P6 |
| `outbox` | Notificações a enviar e lembretes agendados | A9 |
| `audit_logs` | Trilha de auditoria | A9 |
| `presence_checks` | Pergunta enviada pelo WhatsApp com resposta direta, uma por mentoria: convite (RN20) e confirmação de presença (RN18) | P6, A9 |
| `whatsapp_inbound` | Mensagens recebidas do WAHA já processadas (deduplicação, TTL de 7 dias) | — |
| `short_links` | Links curtos `/l/<código>` que levam ao link pessoal ou ao `.ics` da participante (E48) | P5, e-mails, WhatsApp |

### events

```json
{
  "_id": "techwoman-2026",
  "name": "Tech Woman", "date": "2026-11-14", "timezone": "America/Recife",
  "startTime": "10:00", "endTime": "16:45", "slotMinutes": 45, "gapMinutes": 0,
  "slots": [ { "id": "s01", "startAt": "2026-11-14T12:00:00Z", "endAt": "2026-11-14T12:40:00Z" } ],
  "responseWindowMinutes": 15, "minLeadMinutes": 10,
  "registrationOpen": true,
  "areas": [ { "key": "dados", "label": "Dados" } ],
  "templates": { "invite": "{mentora} quer te mentorar às {horario}..." },
  "version": 3
}
```

`whatsappLists` (opcional; ausente = `DEFAULT_WHATSAPP_LISTS` em `@tw/shared`): título e texto editáveis em A7 das List Messages do WhatsApp, `{ invite: { title, description }, presence: { title, description } }`. `title` até 60 caracteres e `description` até 1000. Variáveis aceitas: no `invite`, `{nome}`, `{mentora}`, `{horario}`, `{mesa}`, `{prazo}` e `{link}`; no `presence`, `{nome}`, `{mentora}`, `{horario}`, `{mesa}`, `{minutos}` e `{link}`. E41 recusa variável desconhecida (`VALIDATION_ERROR` com `field` = `whatsappLists.<lista>.<campo>`). Rodapé, botão e opções (texto e `rowId`) continuam fixos no código, porque as decisões de E47 dependem deles; se o texto do convite não tiver `{link}`, o worker acrescenta "Detalhes: <link>" numa linha nova.

`slots` é recalculado ao salvar A7 e gravado em UTC; a API recusa a mudança se algum `appointment` ativo usar um horário que deixaria de existir.

### users

Campos: `name`, `email` (minúsculo), `roles`, `passwordHash` (argon2id), `mustChangePassword`, `status` (`active` | `disabled`), `linkedin`, `phone` (WhatsApp da mentora, E.164, opcional: mesmo formato e normalização do telefone da participante, `normalizePhoneBR` de `@tw/shared`; ausente ou `null` = sem telefone, os avisos à mentora vão só por e-mail; editável em A3 por E31/E32, na importação E33 pela coluna `whatsapp` e pela própria mentora em M2 por E28; só ela e o admin veem), `organization` (interno), `areas[]`, `bio`, `photoUrl`, `availability[]` (ids de slot), `lastLoginAt`, `failedLogins`, `lockedUntil`, `createdBy`.

### mentees

Campos: `eventId`, `name`, `email`, `emailNorm`, `phone` (E.164), `linkedin`, `area`, `quizScores{}`, `preferredPeriod` (`morning` | `early_afternoon` | `late_afternoon` | `any`), `note`, `consent{version, acceptedAt}`, `status`, `priority`, `priorityReason`, `queuedAt`, `currentAppointmentId`, `tokenHash`, `tokenVersion` (versão do token; incrementar revoga o link pessoal e os links curtos), `createdAt`.

### appointments

Campos: `eventId`, `menteeId`, `mentorId`, `tableId`, `slotId`, `startAt`, `endAt`, `status`, `slotLock`, `menteeLock`, `expiresAt` (prazo do convite), `respondedAt`, `declineReason`, `createdBy{userId, role}`, `history[]` (de, para, quem, quando).

As duas travas são campos booleanos mantidos junto com o status:

| Status | `slotLock` (mesa e mentora ocupadas) | `menteeLock` (participante ocupada) |
| --- | --- | --- |
| `invited`, `confirmed`, `in_progress` | true | true |
| `done`, `no_show` | true | ausente |
| `declined`, `expired`, `cancelled` | ausente | ausente |

### outbox e audit\_logs

- `outbox`: `type`, `channel` (`email` | `whatsapp`), `to`, `menteeId`, `appointmentId`, `payload`, `status` (`pending` | `sending` | `sent` | `failed` | `skipped`), `attempts`, `nextAttemptAt`, `lastError`, `dedupeKey`.
- `audit_logs`: `at`, `actorId`, `actorRole`, `action`, `entity`, `entityId`, `before`, `after`, `ip`.
- `presence_checks` (sem validador; `_id` = `appointmentId`): `kind` (`invite` | `presence`; ausente = `presence`), `menteeId`, `phone` (só dígitos, ex.: `5511996604159`), `messageId` (hash final do id da mensagem no WAHA), `status` (`pending` | `confirmed` | `cancelled` | `closed`), `sentAt`, `answeredAt`, `answer{kind: "list" | "text", text, interpretation: "confirm" | "cancel" | null}`. Índice `{ phone: 1, status: 1, sentAt: -1 }`.
- `whatsapp_inbound` (sem validador; `_id` = hash final do id da mensagem recebida): `receivedAt`, `expireAt` (TTL), `phone`, `result` (`confirm` | `cancel` | `unclear` | `ignored`). Serve só para descartar o mesmo evento reenviado pelo WAHA.
- `short_links` (sem validador; `_id` = código de 7 caracteres base62): `menteeId`, `kind` (`personal` | `calendar`), `tokenVersion` (o da participante quando o link foi criado), `createdAt`, `expireAt` (fim do evento + 7 dias; TTL). O token não é gravado: E48 o deriva na hora. Regras em Notificações > Links curtos.

### Índices

```js
// unicidade e conflitos de agenda
db.appointments.createIndex({ eventId: 1, tableId: 1, slotId: 1 },  { unique: true, partialFilterExpression: { slotLock: true } })
db.appointments.createIndex({ eventId: 1, mentorId: 1, slotId: 1 }, { unique: true, partialFilterExpression: { slotLock: true } })
db.appointments.createIndex({ eventId: 1, menteeId: 1 },             { unique: true, partialFilterExpression: { menteeLock: true } })

// consultas
db.appointments.createIndex({ eventId: 1, mentorId: 1, startAt: 1 })
db.appointments.createIndex({ status: 1, expiresAt: 1 })
db.mentees.createIndex({ eventId: 1, emailNorm: 1 }, { unique: true })
db.mentees.createIndex({ tokenHash: 1 }, { unique: true })
db.mentees.createIndex({ eventId: 1, status: 1, priority: -1, queuedAt: 1 })
db.mentees.createIndex({ eventId: 1, area: 1, status: 1 })
db.users.createIndex({ email: 1 }, { unique: true })
db.tables.createIndex({ eventId: 1, number: 1 }, { unique: true })
db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
db.outbox.createIndex({ status: 1, nextAttemptAt: 1 })
db.outbox.createIndex({ dedupeKey: 1 }, { unique: true })
db.audit_logs.createIndex({ eventId: 1, at: -1 })
db.short_links.createIndex({ menteeId: 1, kind: 1, tokenVersion: 1 }, { unique: true })  // nome: short_link_mentee_kind_version
db.short_links.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 })  // nome: short_link_ttl
```

Os índices são criados pelo script `create-indexes`, executado no start da API (idempotente). Validação de schema (`$jsonSchema`) em `mentees`, `appointments` e `users` com `validationLevel: "strict"`. Campo novo num validador (ex.: `users.phone`) muda o validador gravado: antes de subir a API nova, rode uma vez `npm run db:indexes` com um usuário dbAdmin (o usuário da aplicação só tem `readWrite` e a API não roda `collMod` quando o validador é igual).

## Regras de negócio e máquina de estados

Toda mudança de status da mentoria atualiza, na mesma transação, o status da participante, as travas de agenda, a auditoria e a `outbox`.

&#91;embedded content: estados da mentoria · 8 status e o efeito na participante\]

A linha de cima é o caminho feliz; as caixas de baixo e a de cima liberam mesa e horário e dizem para onde a participante volta.

| Status da mentoria | Status da participante | Quem leva até ele |
| --- | --- | --- |
| `invited` | `invited` | Mentora (M5) ou admin (A4/A5) |
| `confirmed` | `confirmed` | Participante aceita (P6) ou mentora confirma presencialmente (M6) |
| `in_progress` | `confirmed` | Mentora clica "Iniciar" (M6), opcional |
| `done` | `done` | Mentora conclui (M6) |
| `no_show` | `no_show` | Mentora ou admin, a partir de 10 min após o início |
| `declined` | `waiting` + prioridade, ou `cancelled` | Participante recusa (depende do motivo) |
| `expired` | `waiting` | Worker, quando o prazo do convite vence |
| `cancelled` | `waiting` + prioridade, ou `cancelled` | Mentora/admin (participante volta com prioridade) ou a própria participante |

### Regras

1. **RN01 · Inscrição única.** Uma inscrição por e-mail normalizado por evento. E-mail já inscrito e ativo: não cria outra e reenvia o link pessoal. Inscrição `cancelled` ou `no_show`: reativa como `waiting`, sem prioridade, com novo `queuedAt`.
2. **RN02 · Janela de inscrição.** Só aceita com `registrationOpen = true` e antes do início do último horário do dia.
3. **RN03 · Ordem da fila.** Fila = participantes `waiting`, ordenadas por `priority` (true primeiro) e depois `queuedAt` (mais antiga primeiro). Voltar à fila por recusa ou cancelamento da mentora mantém o `queuedAt` original.
4. **RN04 · Convite válido.** Só cria convite se: mentora ativa; horário na disponibilidade dela; horário começa em pelo menos `minLeadMinutes` (10); mesa ativa e livre; mentora livre no horário; participante `waiting`. Admin pode ignorar a disponibilidade e a antecedência, com aviso.
5. **RN05 · Prazo do convite.** `expiresAt` = o menor entre agora + `responseWindowMinutes` (15) e o início do horário menos 5 min.
6. **RN06 · Resposta da participante.** Aceitar só se o convite ainda for `invited` e não vencido. Recusar com "Horário não serve" devolve à fila com `priority = true` e `priorityReason = "declined_schedule"`. Recusar com "Não tenho mais interesse" encerra a inscrição (`cancelled`).
7. **RN07 · Expiração.** O worker, a cada 30 s, marca como `expired` todo convite `invited` com `expiresAt` vencido; a participante volta para `waiting` sem ganhar prioridade e recebe aviso.
8. **RN08 · Confirmação presencial.** A mentora pode confirmar um convite `invited` quando a participante está na mesa; o registro guarda quem confirmou.
9. **RN09 · Não compareceu.** Permitido só para `confirmed` e a partir de `startAt` + 10 min.
10. **RN10 · Cancelamento pela mentora ou admin.** `invited` ou `confirmed` vira `cancelled`; a participante volta para a fila com `priority = true` (`priorityReason = "cancelled_by_staff"`); mesa e horário ficam livres na hora.
11. **RN11 · Disponibilidade.** A mentora não consegue remover da disponibilidade um horário com mentoria `invited`, `confirmed` ou `in_progress`.
12. **RN12 · Desativar mentora.** Bloqueado enquanto ela tiver mentorias futuras ativas; a API devolve a lista para o admin realocar ou cancelar. Desativar revoga todas as sessões dela.
13. **RN13 · Mesa sugerida.** Em M5, sugere a mesa da mentoria anterior mais próxima da mentora, se estiver livre no horário escolhido; senão, a mesa livre de menor número.
14. **RN14 · Período preferido.** Manhã = horários que começam antes de 12h00; início da tarde = 12h00 a 14h59; fim da tarde = 15h00 em diante (horário de Recife). Só pode ser alterado enquanto a participante está `waiting`.
15. **RN15 · Lembretes.** Ao confirmar (ou mover), agenda na `outbox` um lembrete por regra configurada em A7 (`events.reminders`: até 10, cada uma com minutos antes do início, de 1 a 1440, e canais e-mail/WhatsApp; padrão: um lembrete 15 min antes pelo WhatsApp). Regras cujo horário já passou são puladas; se todas passaram e a mentoria não começou, sai um só, agora. WhatsApp indisponível (desligado ou sem telefone) cai para e-mail. No envio, o worker confere o status atual e descarta (`skipped`) se não estiver mais `confirmed`. As regras valem para as mentorias confirmadas depois de salvas.
16. **RN16 · Mudança de grade.** Alterar horários, duração ou intervalo do evento é recusado se existir qualquer mentoria ativa.
17. **RN17 · Auditoria.** Toda escrita feita por staff e toda mudança de status gera um registro em `audit_logs`.
18. **RN18 · Confirmação de presença pelo WhatsApp.** O primeiro lembrete de cada mentoria (pela ordem de envio) que sai pelo WhatsApp vai como List Message pedindo a confirmação de presença (título e texto de `events.whatsappLists.presence`, editáveis em A7; rodapé, botão e opções fixos); os demais lembretes são texto. A marca vem de `enqueueReminders`, no item `whatsapp` desse lembrete (`payload.presenceCheck: true`); o gêmeo por e-mail, se houver, continua lembrete comum. Os minutos do texto ("faltam X minutos") são calculados no envio: `ceil((startAt − agora) / 60 s)`. As opções da lista têm `rowId` `confirmar:<appointmentId>` e `cancelar:<appointmentId>`. Ao enviar, o worker grava `presence_checks` (`pending`, `messageId`, `phone`). Resposta recebida em E47:
    - Toque na lista: o `rowId` diz a mentoria. Texto digitado: procura o `presence_checks` `pending` mais recente do telefone (`_data.Info.SenderAlt` ou `from`, sem `@…` e sem `:N`) e interpreta o texto (sim/não, com frases comuns; dúvida ou sinais dos dois lados = não entendido). Sem `pending` para o telefone: ignora, sem resposta.
    - Confirmar: `presence_checks.status = confirmed`; a mentoria continua `confirmed`; envia `presence_confirmed`.
    - Cancelar: se a mentoria ainda está `confirmed` e não começou, aplica a transição `mentee_reschedule` (RN19) com ator participante; `presence_checks.status = cancelled`; envia `presence_cancelled` com o link pessoal. Se a mentoria já não está `confirmed`, marca `closed` e não responde.
    - Não entendido: mantém `pending` e envia `presence_unclear`.
    - Mesma mensagem recebida de novo (o WAHA repete o webhook): descartada por `whatsapp_inbound`.
19. **RN19 · Trocar de horário pela participante.** A transição `mentee_reschedule` (de `confirmed`, antes do início) cancela a mentoria (mesa e horário livres na hora) e devolve a participante à fila com `priority = true`, `priorityReason = "declined_schedule"`, `lastOutcome = "declined_schedule"` e o `queuedAt` original. Vem do "Não poderei ir" do WhatsApp (RN18) ou do "Trocar de horário" em P6 (E04 `reschedule`). Uma participante `waiting` com `lastOutcome = "declined_schedule"` pode escolher sozinha um horário livre pelo link pessoal: E07 lista os horários futuros (respeitando `minLeadMinutes`) em que existe mentora ativa da área dela, com o horário na disponibilidade, sem mentoria ativa nele, e uma mesa ativa livre; `matchesPeriod` marca os do período preferido (RN14). E08 reconfere tudo na transação, escolhe a mentora com menos mentorias ativas no evento (empate: nome), a mesa pela RN13, e cria a mentoria já `confirmed` (`createdBy` = a mentora escolhida, `confirmedBy` e `history` com ator participante, auditoria `appointment.self_book`); a participante vira `confirmed` sem prioridade, e saem `confirmed` e os lembretes (RN15, RN18). Mentoras e admins continuam podendo convidá-la pela fila enquanto ela não escolhe.
20. **RN20 · Convite pelo WhatsApp com resposta direta.** O item `whatsapp` do `invite` sai como List Message (título e texto de `events.whatsappLists.invite`, editáveis em A7; rodapé, botão e opções fixos, UI-SPEC) com as opções "Aceito" (`rowId` `aceitar:<appointmentId>`) e "Não posso" (`recusar:<appointmentId>`). Ao enviar, o worker grava `presence_checks` com `kind = invite`, `pending` (o lembrete de presença da mesma mentoria, depois, substitui o registro com `kind = presence`). Resposta recebida em E47, com a mesma correlação da RN18 (`rowId`, ou texto pelo `pending` mais recente do telefone, de qualquer `kind`):
    - Aceito (ou texto de confirmação): se o convite ainda está `invited` e não venceu, aplica `accept` com ator participante, como E04 (sai a `confirmed` normal, que é a resposta, e os lembretes); `presence_checks.status = confirmed`. Se não está mais `invited` ou venceu: `closed` e envia `invite_closed`.
    - Não posso (ou texto de recusa): não muda nada no sistema; envia `invite_decline_link` com o link pessoal, onde ela recusa com o motivo (RN06). O registro continua `pending`: ela ainda pode tocar "Aceito" enquanto o convite valer.
    - Não entendido: mantém `pending` e envia `invite_unclear`.

## API REST ligada às telas

Cada endpoint tem um código E-xx, o mesmo citado nas telas do SDD 1; todas as rotas ficam sob `/api` (exceção: o link curto público `/l/<código>`, que Nginx e Vite reescrevem para a rota da API `/api/l/<código>`, E48), recebem e devolvem JSON validado por Zod e respondem erros no formato `{ "code": "TABLE_TAKEN", "message": "..." }`.

### Público e participante

| Código | Método e rota | Telas | Regra / observação |
| --- | --- | --- | --- |
| E01 | `GET /public/event` | P1, P4 | Nome, data, local, áreas, períodos, inscrições abertas |
| E02 | `POST /public/mentees` | P4 | Turnstile obrigatório; RN01, RN02; devolve 201 (inscrição nova ou reativada pela RN01) com `token`, `personalPath` (`/mentoria/minha?t=<token>`, usado no botão de P5) e `shortPath` (`/l/<código>`, `kind = personal`, o link que P5 mostra e copia), ou 200 `ALREADY_REGISTERED` (reenvia o link, sem devolvê-lo). O link curto é criado depois do commit da transação da inscrição |
| E03 | `GET /public/me` (header `X-Mentee-Token`) | P6 | Status, convite ativo (mentora, mesa, horário, prazo) |
| E04 | `POST /public/me/actions` | P6 | `{ action: "accept" \| "decline" \| "cancel" \| "reschedule" \| "update_preference", reason?, preferredPeriod? }`; RN06, RN14, RN19 (`reschedule` só de `confirmed`) |
| E05 | `POST /public/resend-link` | P6 | Sempre 202, exista ou não o e-mail (sem enumeração) |
| E07 | `GET /public/me/slots` | P6 | RN19; horários livres para ela escolher: `{ items: [{ slotId, startAt, endAt, matchesPeriod }] }`; `INVALID_STATE` (409) fora do estado permitido |
| E08 | `POST /public/me/book` | P6 | RN19; `{ slotId }` com `Idempotency-Key`; o sistema escolhe mentora e mesa e cria a mentoria já `confirmed`; 409 `SLOT_UNAVAILABLE` se o horário acabou de ser ocupado |
| E06 | `GET /public/calendar.ics?t=<token>` | P6, e-mail 3 | Só para mentoria confirmada; `text/calendar`; `UID` = id da mentoria raiz da cadeia de moves (estável); 404 em qualquer outro status |
| E48 | `GET /l/:code` (rota da API `/api/l/:code`; link público `<PUBLIC_BASE_URL>/l/<código>`) | E-mails, WhatsApp, P5 | Público, sem login e sem CSRF; não executa ação. Sempre 302 sem corpo, com `Location` relativo: `kind = personal` → `/mentoria/minha?t=<token>`, `kind = calendar` → `/api/public/calendar.ics?t=<token>`, com o token derivado na hora do `tokenVersion` atual. Código inexistente, formato inválido (o parâmetro aceita qualquer texto de até 64 caracteres, sem 422), revogado (`tokenVersion` do link ≠ atual), vencido (`expireAt` já passou) ou de participante que não existe mais → 302 para `/mentoria/minha` (P6 mostra "Link inválido"), resposta idêntica nos cinco casos. Cabeçalhos `Cache-Control: no-store` e `Referrer-Policy: no-referrer`. Rate limit próprio por IP: 600 por minuto. Código E48 escolhido depois de E47 (E09 segue livre). Regras em Notificações > Links curtos |

### Autenticação

| Código | Método e rota | Telas | Regra / observação |
| --- | --- | --- | --- |
| E10 | `POST /auth/login` | M1 | Cria sessão; bloqueio de 5 min após 5 falhas |
| E11 | `POST /auth/logout` | Todas | Revoga a sessão |
| E12 | `GET /auth/me` | Todas | Usuário, papéis, `mustChangePassword` |
| E13 | `POST /auth/change-password` | M2 | Exige senha atual; revoga as demais sessões |

### Mentora

| Código | Método e rota | Telas | Regra / observação |
| --- | --- | --- | --- |
| E20 | `GET /mentor/availability` | M3 | Horários do dia + quais estão travados por mentoria |
| E21 | `PUT /mentor/availability` | M3 | `{ slotIds: [] }`; RN11 |
| E22 | `GET /mentor/queue?area=&period=&priority=&q=&cursor=` | M4 | Fila (RN03) sem contato; paginação por cursor, 30 itens. Com q, usa o Atlas Search (seção Busca no Atlas), até 50 itens sem cursor |
| E23 | `GET /mentor/options?menteeId=&slotId=` | M5 | Horários livres da mentora e mesas livres no horário, com mesa sugerida (RN13) |
| E24 | `POST /mentor/appointments` | M5 | `{ menteeId, slotId, tableId }`; RN04, RN05; conflitos 409: `MENTEE_TAKEN`, `TABLE_TAKEN`, `MENTOR_BUSY`, `SLOT_UNAVAILABLE` |
| E25 | `GET /mentor/appointments` | M6 | Agenda do dia da mentora |
| E26 | `PATCH /mentor/appointments/:id` | M6 | `{ action: "confirm_in_person" \| "start" \| "finish" \| "no_show" \| "cancel", reason? }`; RN08–RN10 |
| E27 | `GET /mentor/stream` (SSE) | M4, M6 | Eventos `queue.added`, `queue.removed`, `appointment.updated` |
| E28 | `PATCH /mentor/profile` | M2 | Nome, LinkedIn, WhatsApp (`phone`), foto, áreas, bio |

### Admin e super admin

| Código | Método e rota | Telas | Papel |
| --- | --- | --- | --- |
| E30 | `GET /admin/dashboard` | A1 | Admin |
| E31 | `GET /admin/mentors`, `POST /admin/mentors` | A2, A3 | Admin; POST devolve a senha provisória uma única vez; `phone` (WhatsApp) opcional |
| E32 | `PATCH /admin/mentors/:id` | A3 | Admin; desativar segue RN12; papel admin só por super admin; `phone` (WhatsApp) opcional, `null` apaga |
| E33 | `POST /admin/mentors/import` (multipart CSV, `?dryRun=true`) | A3 | Admin; prévia linha a linha, depois confirma. Colunas: `nome`, `email`, `linkedin`, `organizacao`, `areas`, `disponibilidade` e `whatsapp` (opcional; telefone com DDD, inválido é erro da linha; sem a coluna, o telefone de quem já existe não muda) |
| E34 | `POST /admin/mentors/:id/reset-password` | A2, A3 | Admin |
| E35 | `GET /admin/mentees?status=&area=&priority=&q=&cursor=` | A4 | Admin |
| E36 | `PATCH /admin/mentees/:id` | A4 | Admin; prioridade, cancelar, reenviar link |
| E37 | `GET /admin/mentees/export.csv` | A4 | Admin; mesmos filtros do E35 |
| E38 | `GET /admin/schedule` (+ SSE `/admin/stream`) | A5 | Admin; grade mesa × horário |
| E39 | `POST /admin/appointments`, `PATCH /admin/appointments/:id` | A4, A5 | Admin; criar em nome de uma mentora, mover, cancelar, no-show, confirmar |
| E40 | `GET /admin/tables`, `PUT /admin/tables` | A6 | Super admin |
| E41 | `GET /admin/event`, `PUT /admin/event` | A7 | Super admin; RN16 |
| E42 | `GET /admin/event/qrcode.(png\|svg)` | A7 | Super admin |
| E43 | `GET/POST/PATCH /admin/users` | A8 | Super admin; mantém ao menos um super admin ativo |
| E44 | `GET /admin/notifications`, `POST /admin/notifications/:id/retry` | A9 | Admin |
| E45 | `GET /admin/audit` | A9 | Admin |
| E46 | `GET /admin/email-preview/:tipo` | A7 | Admin; renderiza um dos 9 layouts de e-mail com dados de exemplo |

### Webhooks

| Código | Rota | Origem | Regras |
| --- | --- | --- | --- |
| E47 | `POST /webhooks/waha` | WAHA (webhook da sessão) | Sem CSRF e sem login. Valida `X-Webhook-Hmac` (HMAC-SHA512 em hex do corpo bruto, UTF-8, chave `WAHA_WEBHOOK_HMAC_KEY`, comparação em tempo constante) antes de ler o JSON; inválida → 401. Responde 200 em menos de 10 s. Só trata `event: "message"` que não seja `fromMe` nem de grupo (`@g.us`); RN18 |

**Mover mentoria (E39 com `action: "move"`)** é feito na mesma transação: o registro antigo vira `cancelled` (sem prioridade, motivo `moved`) e um novo nasce `confirmed`, mantendo a confirmação da participante, que recebe aviso com o novo horário/mesa.

## Concorrência e consistência

Quando duas mentoras clicam na mesma participante ao mesmo tempo, uma ganha e a outra recebe 409 `MENTEE_TAKEN`; quem decide é o índice único do MongoDB, não uma checagem prévia no código.

**Criação do convite (E24), numa transação com `readConcern: "snapshot"` e `writeConcern: "majority"`:**

```ts
await session.withTransaction(async () => {
  const mentee = await mentees.findOneAndUpdate(
    { _id: menteeId, eventId, status: "waiting" },
    { $set: { status: "invited", updatedAt: now }, $inc: { version: 1 } },
    { session, returnDocument: "after" }
  );
  if (!mentee) throw conflict("MENTEE_TAKEN");
  assertSlotIsValid(slot, mentor, now);            // RN04: disponibilidade e antecedência
  const appt = await appointments.insertOne({       // índices únicos barram mesa e mentora ocupadas
    eventId, menteeId, mentorId, tableId, slotId, startAt, endAt,
    status: "invited", slotLock: true, menteeLock: true,
    expiresAt: computeExpiry(now, startAt)          // RN05
  }, { session });
  await mentees.updateOne({ _id: menteeId }, { $set: { currentAppointmentId: appt.insertedId } }, { session });
  await outbox.insertMany(inviteMessages(mentee, appt), { session });
  await audit.insertOne(auditEntry("appointment.invite", actor, appt), { session });
});
```

- Erro `E11000` em `insertOne` é traduzido pelo nome do índice: `tableId_slotId` vira `TABLE_TAKEN`; `mentorId_slotId` vira `MENTOR_BUSY`; `menteeId` vira `MENTEE_TAKEN`. A transação é desfeita inteira, incluindo o status da participante.
- `withTransaction` repete sozinho em `TransientTransactionError`; o cliente não precisa repetir.
- **Toda transição de status é condicional ao status atual** (`{ _id, status: "invited" }` no filtro). Se a participante aceitar no mesmo segundo em que o worker expira o convite, só uma das duas escritas encontra o documento e a outra recebe `INVITE_EXPIRED` ou nada a fazer.
- **Mover (E39):** na mesma transação, primeiro retira as travas do registro antigo (`$unset: { slotLock, menteeLock }`), depois insere o novo. A ordem importa por causa do índice de participante.
- **Liberar mesa/horário** é só remover `slotLock` do registro; não há documento de "vaga" para ficar inconsistente.
- **Idempotência:** E24, E26 e E04 aceitam o header `Idempotency-Key`; a chave fica 10 min em `idempotency_keys` (TTL) para que um toque duplo no celular não gere dois convites.

**Tempo real:** cada réplica da API abre um Change Stream em `mentees` e `appointments` filtrado por `eventId` (com `fullDocument: "updateLookup"`) e repassa por SSE só o que cada conexão pode ver (projeção sem contato para mentoras). Reconexão do navegador usa `Last-Event-ID` = resume token. Se o Change Stream cair, o front faz polling de E22/E25 a cada 10 s até voltar.

## Busca no Atlas

A busca livre roda no Atlas Search (`$search`): acha por palavra, ignora acentos e tolera erros de digitação. Não há busca por significado nem embeddings (decisão de 24/10: só full text).

| Onde | Tela | Endpoint | Como |
| --- | --- | --- | --- |
| Fila da mentora, busca livre | M4 | E22 com `q` | `$search` em `mentees_text` (nome, comentário) |
| Participantes no admin | A4 | E35 com `q` | `$search` em `mentees_text` (nome, e-mail, telefone, comentário) |
| Mentoras no admin | A2 | E31 com `q` | `$search` em `staff_text` (nome, e-mail, áreas, bio) |
| Fila sem busca | M4, A4 | E22, E35 sem `q` | Consulta comum com índice B-tree (RN03); não passa pelo Atlas Search |

### Índices do Atlas Search

Criados pelo script `create-indexes` (`src/db/search-indexes.ts`) com `createSearchIndex`, junto com os índices B-tree, de forma idempotente (cria se falta, atualiza se a definição mudou, não faz nada se igual). `npm run db:indexes -- --wait` espera ficarem consultáveis.

```js
// participantes
db.mentees.createSearchIndex("mentees_text", "search", {
  mappings: { dynamic: false, fields: {
    eventId: { type: "token" }, status: { type: "token" }, area: { type: "token" }, priority: { type: "boolean" },
    name:  [ { type: "string", analyzer: "lucene.portuguese" }, { type: "autocomplete", foldDiacritics: true } ],
    note:  { type: "string", analyzer: "lucene.portuguese" },
    email: { type: "string", analyzer: "lucene.keyword" },
    phone: { type: "string", analyzer: "lucene.keyword" }
  } }
})

// mentoras: staff_text -> name (string + autocomplete), email (keyword), areas (token), bio (lucene.portuguese), status, roles (token)
```

### Consulta (E22 com `q`)

```js
[
  { $search: { index: "mentees_text", compound: {
      should: [   // erro de digitação: o fuzzy é da consulta (o índice não muda); o acerto exato pesa mais
        { text: { query: q, path: ["name", "note"], score: { boost: { value: 3 } } } },
        { text: { query: q, path: ["name", "note"], fuzzy: { maxEdits: 2, maxExpansions: 50 } } },  // 2 se há palavra com 7+ letras, senão 1
        { autocomplete: { query: q, path: "name", score: { boost: { value: 2 } } } },
        { autocomplete: { query: q, path: "name", fuzzy: { maxEdits: 1, maxExpansions: 50 } } }
      ],
      filter: [
        { equals: { path: "eventId", value: eventId } },
        { equals: { path: "status", value: "waiting" } }
        // + area (in) e priority, quando filtrados
      ],
      minimumShouldMatch: 1 } } },
  { $limit: 100 },                                        // 200 quando há filtro de período
  { $match: { eventId: eventId, status: "waiting" } },   // lê o documento atual, não o índice; + area, priority, preferredPeriod
  { $limit: 50 },
  { $project: { /* projeção positiva de MenteeStaffView: nunca email, phone, consent, tokenHash */ } }
]
```

### Regras

- **Consistência:** os índices de busca são atualizados de forma assíncrona, com segundos de atraso. Por isso o `$match` de status vem depois da busca e usa o documento atual. Área e prioridade entram no filtro do `$search` e de novo no `$match`; o período (fora do índice) só no `$match`, por isso a busca pega 200 candidatos quando ele é filtrado. A SSE continua removendo cards, e o convite segue protegido pelo índice único (seção Concorrência).
- **Erros de digitação:** "filipe", "felpe", "fleipe", "phelipe" e "fil" encontram "Felipe"; sem acento encontra com acento (`lucene.portuguese` e `foldDiacritics`). Teste em `busca-api-e22.test.ts`.
- **Contato fora da busca:** a projeção sem `email` e `phone` vale também nos resultados de busca da mentora. Só E35 (admin) devolve contato.
- **Falha da busca:** se o `$search` falhar (ex.: índice em construção), E22, E31 e E35 respondem 503 (`code: INTERNAL`, `Retry-After: 5`) e a tela mostra o estado de erro com "tentar de novo". A busca nunca causa erro 500.
- **Limites do `q`:** de 2 a 200 caracteres; resultado de busca traz no máximo 50 itens, sem cursor. O CSV de E37 com `q` continua com o filtro por expressão regular, para não truncar em 50 linhas.
- **Ambientes:** o banco da aplicação é sempre o Atlas (`MONGODB_URI`); o usuário do banco só tem `readWrite`, então a API não roda `collMod` quando o validador não mudou. Os testes de integração usam o `mongodb-atlas-local` (`MONGODB_URI_TEST`), que executa `$search`.

### Testes da busca

- [x] `$search` com filtros e acentos no `mongodb-atlas-local` ("transicao" encontra "transição").
- [x] Participante já convidada nunca aparece no resultado, mesmo com o índice de busca atrasado.
- [x] Nenhuma resposta de E22 contém `email` ou `phone`.
- [x] Falha simulada do `$search` responde 503 em E22, E31 e E35; sem `q`, 200.

## Notificações

E-mail é o canal obrigatório do MVP e WhatsApp entra como segundo canal se os modelos de mensagem forem aprovados a tempo; a página pessoal (P6) funciona mesmo que nenhuma mensagem chegue. Com WhatsApp ligado, todo aviso à participante sai pelos dois canais, para que nenhum dependa só do WhatsApp; a exceção são as respostas a um toque no próprio WhatsApp (`presence_*`, `invite_*`), e o `slot_released` desse mesmo toque, que vai só por e-mail para ela não receber duas mensagens no WhatsApp. `notifyChannels` (entrada opcional de `applyTransition`) restringe os canais do aviso da transição à participante: vale a interseção com os canais disponíveis. O aviso à mentora (`mentor_slot_released`) segue a mesma regra de canais com o telefone dela (`users.phone`): e-mail, mais WhatsApp se ligado e se ela tiver telefone; `notifyChannels` não vale para ele.

**Fluxo:** a API grava na `outbox` dentro da mesma transação da mudança de status (padrão outbox); o `worker` lê as pendentes, envia e marca o resultado. Nada é enviado direto de dentro da requisição HTTP.

**Aviso à mentora:** o plano da transição (`planTransition`) traz `notifyMentor` (motivo do `mentor_slot_released`, um de `MENTOR_SLOT_RELEASED_REASONS` em `@tw/shared`, ou null), preenchido só com ator participante: `mentee_cancel` de `confirmed` e `mentee_reschedule` → `confirmed_cancelled`; `decline_schedule` e `decline_no_interest` → `invite_declined`; `mentee_cancel` de `invited` → `invite_cancelled`. `applyTransition` lê a mentora da mentoria e grava o aviso com `enqueueMentorNotifications` (`src/api/lib/outbox.ts`), separado do aviso à participante e sem `notifyChannels`. Uma mensagem que chegue pelo WhatsApp do telefone da mentora em E47 não acha `presence_checks` `pending` (eles só existem para a participante) e é ignorada.

| Gatilho | Tipo | Canais | `dedupeKey` |
| --- | --- | --- | --- |
| Inscrição criada ou link reenviado | `registered` | E-mail, WhatsApp | `registered:<menteeId>:<n>` |
| Convite criado (no WhatsApp, List Message com resposta direta, RN20) | `invite` | E-mail, WhatsApp | `invite:<appointmentId>` |
| Confirmada | `confirmed` | E-mail, WhatsApp | `confirmed:<appointmentId>` |
| Lembretes antes da mentoria (A7, até 10; padrão 15 min por e-mail e WhatsApp); o primeiro pelo WhatsApp é a List Message de presença (RN18) | `reminder` | Canais da regra (WhatsApp sem telefone ou desligado vira e-mail) | `reminder:<appointmentId>:<minutos>` |
| Convite expirado | `expired` | E-mail, WhatsApp | `expired:<appointmentId>` |
| Cancelada pela mentora/admin ou movida | `cancelled` / `moved` | E-mail, WhatsApp | `cancelled:<appointmentId>` |
| Inscrição cancelada pela própria participante (E04 `cancel`, ou recusa do convite com "Não tenho mais interesse") | `registration_cancelled` | E-mail, WhatsApp | `registration_cancelled:<menteeId>:<version da participante depois do cancelamento>` |
| Horário liberado pela própria participante, que volta à fila com prioridade (E04 `decline` com motivo `schedule`, E04 `reschedule` de P6, ou "Não vou" no WhatsApp, RN18) | `slot_released` | E-mail, WhatsApp (pelo "Não vou" do WhatsApp, só e-mail: a resposta `presence_cancelled` já vai pelo WhatsApp; E47 passa `notifyChannels: ["email"]` para `applyTransition`) | `slot_released:<appointmentId>` |
| Horário da mentora liberado pela participante (só quando ela mesma age, nunca mentora/admin nem expiração): mentoria confirmada cancelada por ela (E04 `cancel` ou `reschedule` de P6, "Não vou" no WhatsApp, RN18), convite recusado (E04 `decline`, qualquer motivo) ou inscrição cancelada com convite pendente (E04 `cancel`) | `mentor_slot_released` (para a mentora: `userId` = mentora, `menteeId` = null, `appointmentId` = a mentoria; `payload.reason` = `confirmed_cancelled` \| `invite_declined` \| `invite_cancelled`) | E-mail, WhatsApp (se ligado e `users.phone` preenchido; o "Não vou" do WhatsApp não restringe este aviso) | `mentor_slot_released:<appointmentId>` |
| Senha provisória enviada pelo admin | `staff_password` | E-mail | `pwd:<userId>:<n>` |
| Resposta à confirmação de presença (RN18) | `presence_confirmed` / `presence_cancelled` / `presence_unclear` | WhatsApp | `presence:<id da mensagem recebida>` |
| Resposta ao convite pelo WhatsApp (RN20) | `invite_closed` / `invite_decline_link` / `invite_unclear` | WhatsApp | `presence:<id da mensagem recebida>` |

**Worker:**

- Laço a cada 2 s: pega até 50 itens com `status: "pending"` e `nextAttemptAt <= agora`, trocando para `sending` com `findOneAndUpdate` (cada item é processado por um só worker, mesmo com mais de uma réplica).
- Antes de enviar, relê a mentoria; se o status não combina mais com a mensagem (ex.: lembrete de mentoria cancelada), marca `skipped`. `registration_cancelled` só sai se a participante ainda estiver `cancelled` (se ela se inscreveu de novo antes do envio, o item vira `skipped`). `slot_released` só sai se a participante ainda estiver `waiting` (se já recebeu outro convite, foi confirmada ou cancelou antes do envio, o item vira `skipped`). `mentor_slot_released` só exige que a mentoria exista (sem ela, `skipped`); o worker lê a mentora por `userId` e o nome da participante pelo `menteeId` da mentoria, e como o item não tem `menteeId`, nenhum link com o token da participante entra na mensagem.
- Falha: até 5 tentativas com espera de 30 s, 1, 2, 4 e 8 min; depois `failed`, visível em A9 com "Reenviar".
- Itens presos em `sending` há mais de 2 min voltam para `pending`.
- No mesmo laço roda a expiração de convites (RN07).

**Provedores (interface `Notifier`, trocável por variável de ambiente):**

- E-mail: serviço transacional (ex.: Amazon SES ou Resend) com domínio techwoman.dev verificado (SPF, DKIM, DMARC).
- WhatsApp: `WHATSAPP_TRANSPORT=waha | cloud` (padrão `cloud`).
  - `waha`: WAHA (WhatsApp HTTP API, engine GOWS), envio direto. Texto por `POST {WAHA_URL}/api/sendText` e a List Message de presença por `POST {WAHA_URL}/api/sendList` (`sendButtons` não existe no GOWS), com `X-Api-Key` = `WAHA_API_KEY`/`WAHA_API_KEY_FILE` e `session` = `WAHA_SESSION` (padrão `default`); `chatId` = telefone só com dígitos + `@c.us`. O envio devolve o id da mensagem (`true_<chatId>_<hash>`); o worker guarda o `<hash>`. Respostas chegam por E47: a sessão do WAHA precisa ter, em `config.webhooks`, a URL pública de E47 com `events: ["message"]` e `hmac.key` = `WAHA_WEBHOOK_HMAC_KEY`/`WAHA_WEBHOOK_HMAC_KEY_FILE` (só a API lê essa chave). Em dev, WAHA local em `http://host.containers.internal:3000`. Erros: 400/401/404 e 501 são permanentes; rede, 5xx, 408 e 429 tentam de novo.
  - `cloud`: WhatsApp Business Cloud API (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`), só texto; exige modelos aprovados.
  - `WHATSAPP_ENABLED=true` liga o canal; desligado, tudo vai por e-mail.
- Os textos vêm dos modelos de A7 (o lembrete aceita também `{minutos}`); as variáveis são substituídas no worker. As List Messages (convite e presença), as respostas (`presence_*`, `invite_*`) a inscrição cancelada pela participante (`registration_cancelled`), o horário liberado por ela (`slot_released`) e o aviso à mentora (`mentor_slot_released`, um texto por `payload.reason`) têm texto fixo no código (UI-SPEC, Mensagens enviadas). Todo link de mensagem com o token da participante sai como link curto `<PUBLIC_BASE_URL>/l/<código>` (E48), que redireciona para P6 (ou para E06, no `link_agenda`).

**Arquivo .ics:** gerado pelo endpoint E06 e também anexado ao e-mail de confirmação (detalhes em Layouts de e-mail, abaixo).

### Links curtos

Todo link com o token da participante que o sistema envia ou mostra (e-mails, WhatsApp, P5) sai curto: `<PUBLIC_BASE_URL>/l/<código>`, ex.: `https://techwoman.dev/l/IEO31Kd`. E48 redireciona para o link longo. Links sem token (`link_login`, `link_painel`, `link_privacidade`, `link_inscricao`) ficam como estão.

- **Código:** 7 caracteres do alfabeto base62 (`0-9A-Za-z`), sorteados um a um com `crypto.randomInt` (sem viés de módulo); cerca de 3,5 × 10¹² combinações. É credencial equivalente ao token.
- **Tipos (`kind`):** `personal` leva a P6 (`/mentoria/minha?t=<token>`) e vale para `link_minha_mentoria` e o `{link}` do WhatsApp; `calendar` leva a E06 (`/api/public/calendar.ics?t=<token>`) e vale só para `link_agenda` (layout 3: `confirmed`, `moved`, `reminder`).
- **Um código por participante, tipo e versão do token:** get-or-create pelo índice único `short_link_mentee_kind_version`. Procura `{ menteeId, kind, tokenVersion }`; se não houver, insere com código novo. Duplicate key nesse índice (corrida da mesma participante) → relê e usa o existente; duplicate key no `_id` (código já usado) → sorteia outro, até 5 tentativas. Reenviar o link devolve o mesmo código.
- **Onde nasce:** no worker, ao processar cada item da `outbox` (depois da checagem de `skipped` e antes de renderizar; erro de banco aqui segue o retry normal, não vira `failed` de renderização), e em E02, depois do commit da transação da inscrição (nunca dentro dela, onde um duplicate key abortaria a inscrição). As funções que montam o e-mail e o WhatsApp recebem os links prontos.
- **Revogação:** E48 compara o `tokenVersion` gravado no link com o atual da participante. Mudou (ex.: anonimização em E36) ou a participante não existe mais → link inválido. A versão nova ganha código novo no próximo envio. Links longos já enviados antes desta mudança continuam válidos (sem migração); itens da `outbox` reenviados depois já saem curtos, porque o link é montado no envio.
- **Validade:** `expireAt` = fim do evento (`date` + `endTime` no `timezone` de `events`) + 7 dias, gravado na criação. O índice TTL `short_link_ttl` apaga o documento depois disso, e E48 também confere `expireAt` (o TTL do MongoDB roda a cada minuto). Quando E41 muda `date`, `endTime` ou `timezone`, a mesma transação recalcula `expireAt` de todos os `short_links`.
- **Roteamento:** a rota da API é `/api/l/:code`; o caminho público `/l/` não é rota do React.
  - Nginx: bloco `location /l/` antes de `location /`, com `set $api_upstream http://api:3000;` antes de `rewrite ^/l/(.*)$ /api/l/$1 break;` (o `break` encerra as diretivas de rewrite seguintes, `set` inclusive), `proxy_pass $api_upstream;` e os mesmos `proxy_set_header` (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`) de `/api/`, `proxy_hide_header Referrer-Policy` e `proxy_hide_header Cache-Control` (para não duplicar), e `add_header` (todos com `always`) de `Cache-Control "no-store"`, `Referrer-Policy "no-referrer"`, `Strict-Transport-Security`, `X-Content-Type-Options` e `X-Frame-Options` (um `add_header` dentro do `location` descarta os do `server`, por isso eles se repetem). Mudar o `nginx.conf` exige rebuild do container `web`; até lá, o `/l/` não funciona no compose de dev (porta 8080).
  - Vite (dev, 5173): chave de proxy em regex `'^/l/'` para a API com `rewrite: (p) => '/api' + p`. A chave `'/l'` casaria por prefixo com `/login`, `/logo` etc.
  - Produção: quem servir o app em `techwoman.dev` também encaminha `/l/` para a API.
- **Logs:** o serializador de `req.url` troca o código por `***` (`/l/***`, `/api/l/***`), como já tira a query.

**Testes dos links curtos**

- [ ] E48 responde 302 com o `Location` certo para `personal` e `calendar`, com `Cache-Control: no-store` e `Referrer-Policy: no-referrer`.
- [ ] Código inexistente, formato inválido e `tokenVersion` antigo (depois de E36 anonimizar) dão a mesma resposta.
- [ ] Get-or-create idempotente: reenviar o mesmo tipo reaproveita o código; corrida em paralelo gera um só documento por `menteeId` + `kind` + `tokenVersion`.
- [ ] `short_links` não guarda o token; anonimizar em E36 apaga os links da participante.
- [ ] E-mails e WhatsApp saem com `/l/<código>` no lugar de `/mentoria/minha?t=`.
- [ ] Rate limit por IP de E48.
- [ ] `expireAt` = fim do evento + 7 dias; link vencido dá a mesma resposta de inexistente; E41 mudando a data recalcula `expireAt`.

### Layouts de e-mail

Os 9 layouts HTML do design substituem o e-mail em texto simples enviado hoje. O worker preenche as variáveis e envia HTML com versão em texto; o WhatsApp continua usando os textos de A7.

| # | Layout | Tipo na `outbox` | Disparado por | Assunto | Variáveis próprias |
| --- | --- | --- | --- | --- | --- |
| 1 | Inscrição recebida | `registered` | E02 cria a inscrição ou reenvia o link (RN01) | Recebemos sua inscrição na mentoria do Tech Woman | `nome`, `link_minha_mentoria` |
| 2 | Convite de horário | `invite` | E24, E39 | {{mentora\_nome}} quer te mentorar às {{horario}} | `nome`, `mentora_nome`, `mentora_linkedin`, `mesa`, `horario`, `prazo`, `link_minha_mentoria` |
| 3 | Confirmação | `confirmed`, `moved`, `reminder` (só o fallback do WhatsApp) | E04 aceitar, E26 confirmar presencial, E39 mover, lembrete RN15 | Combinado: {{horario}} na {{mesa}} (movida: "Sua mentoria mudou"; lembrete: "Sua mentoria começa às {{horario}}") | `nome`, `mentora_nome`, `mesa`, `horario`, `link_minha_mentoria`, `link_agenda` + anexo `.ics` |
| 4 | Convite expirado | `expired` | Worker (RN07) | O prazo para confirmar sua mentoria terminou | `nome`, `link_minha_mentoria` |
| 5 | Cancelamento pela mentora | `cancelled` | E26 ou E39 com cancelamento (RN10) | Sua mentoria das {{horario}} foi cancelada | `nome`, `horario`, `link_minha_mentoria` |
| 6 | Acesso da mentora | `staff_password` | A3 "Enviar por e-mail" (E31, E34) e importação (E33) | Seu acesso ao painel de mentoras do Tech Woman | `mentora_nome`, `email_login`, `senha_provisoria`, `link_login`, `validade_senha` |
| 7 | Inscrição cancelada | `registration_cancelled` | E04 cancel / decline no_interest | Sua inscrição na mentoria do Tech Woman foi cancelada | `nome`, `link_inscricao` |
| 8 | Horário liberado | `slot_released` | E04 decline schedule / reschedule, "Não vou" no WhatsApp (RN18, só o e-mail) | Seu horário das {{horario}} foi liberado | `nome`, `horario`, `link_minha_mentoria` |
| 9 | Aviso à mentora | `mentor_slot_released` | Participante cancela a mentoria confirmada, recusa o convite ou cancela a inscrição com convite pendente (E04, "Não vou" no WhatsApp) | Por `payload.reason`: `confirmed_cancelled` "{{nome}} cancelou a mentoria das {{horario}}"; `invite_declined` "{{nome}} recusou o convite das {{horario}}"; `invite_cancelled` "Convite das {{horario}} encerrado" | `mentora_nome`, `nome`, `horario`, `mesa`, `link_painel`, `motivo` |

Variáveis comuns a todos: `evento_nome`, `evento_data`, `evento_local`, `link_privacidade`, `ano`.

Layout 9 (aviso à mentora): `link_painel` = `<PUBLIC_BASE_URL>/entrar` (M1, sem token; com sessão, leva ao painel). `motivo` é a frase do motivo, montada no worker (`message.ts`) a partir de `payload.reason`, com `nome` e `horario` (e `mesa` em `confirmed_cancelled`) já preenchidos; os textos estão na UI-SPEC, Mensagens enviadas. O assunto padrão do layout (`EMAIL_SUBJECTS`) é o de `confirmed_cancelled` e os outros dois motivos usam as variantes `MENTOR_SLOT_RELEASED_SUBJECTS` em `subjects.ts`; como no layout 3, um assunto editado em A7 vale só para o padrão (`confirmed_cancelled`), e as variantes continuam fixas.

Layout 3 (confirmação, mudança e lembrete): além do texto do design, um segundo parágrafo diz "Não vai conseguir ir? Pela sua página você cancela ou troca o horário." O botão "Ver minha mentoria" leva a P6, onde ficam "Cancelar" e "Trocar de horário" (RN19).

`link_inscricao` (layout 7) = `<PUBLIC_BASE_URL>/mentoria/inscricao` (P4, sem token): a participante cancelada faz uma nova inscrição, e E02 reativa a inscrição cancelada.

**Regras de implementação**

- **Arquivos:** originais do design em `design/email/source/` (somente leitura). Templates de produção em `src/api/notifications/templates/email/` como `01-inscricao-recebida.html` + `.txt`, e assim por diante até `09-aviso-mentora`; assuntos em `subjects.ts`.
- **Placeholders:** `{{variavel}}`, sempre com escape de HTML. Todo dado de exemplo fixo no layout (nome, horário, mesa) vira placeholder. Variável faltando é erro de renderização: o item vai para `failed` e nunca sai com `{{...}}` cru.
- **Compatibilidade com clientes de e-mail:** CSS embutido nos elementos no build (juice), layout em tabela com largura máxima de 600 px, imagens com URL absoluta em `https://techwoman.dev/email/` e texto `alt`, sem JavaScript, com texto de pré-visualização (preheader).
- **Links nunca executam ação:** botões levam a P6 pelo link curto (`/l/<código>`, que E48 redireciona para `/mentoria/minha?t=<token>`; o redirect só lê), onde a participante aceita ou recusa. Filtros antispam abrem links automaticamente, então um link que aceita o convite por GET aceitaria sozinho.
- **Adicionar à agenda (layout 3):** o botão aponta para E06 pelo link curto de `kind = calendar`; E06 devolve `text/calendar` da mentoria confirmada: título, mesa, horário em America/Recife, 45 min, local do evento. O mesmo `.ics` vai anexado (`METHOD:PUBLISH`, `UID` = id da mentoria raiz da cadeia `movedFromId`, que não muda quando a mentoria é movida, e `SEQUENCE` = número de moves, para a agenda atualizar o evento em vez de duplicar).
- **Senha provisória (layout 6):** nunca fica em texto puro no banco. Na `outbox`, a senha vai cifrada (AES-256-GCM, chave no Docker secret `outbox_key`); o worker decifra só no envio e remove o campo (`$unset`) ao marcar `sent` ou `failed`. Logs e A9 mostram "senha oculta". A senha provisória vale 72 h (`users.tempPasswordExpiresAt`); depois disso o login orienta a pedir nova senha ao admin.
- **Remetente:** `Tech Woman <mentoria@techwoman.dev>`, com Reply-To configurável. Nenhuma menção ao Bradesco.
- **Prévia:** E46 renderiza qualquer layout com dados de exemplo; A7 usa isso no botão "Prévia dos e-mails". O HTML é fixo no código; em A7 só se editam os assuntos (`events.emailSubjects`, por id de layout, validados contra as variáveis do layout em E41) e os textos do WhatsApp.
- **Transporte:** `EMAIL_TRANSPORT=smtp | ses | resend` (`EMAIL_PROVIDER` aceito como nome antigo). SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`/`SMTP_PASS_FILE`, `SMTP_SECURE`; SES: `AWS_REGION`; `EMAIL_REPLY_TO` opcional. Em dev, o container Mailpit (perfil `dev`, rede `egress`) recebe todos os e-mails via SMTP e mostra numa interface web; nada sai para fora.

**Testes dos e-mails**

- [x] Os 9 layouts renderizam com dados de exemplo sem nenhum `{{` sobrando; snapshot do HTML e do texto.
- [x] Todos os links são absolutos e nenhum executa ação.
- [x] O `.ics` de E06 e o anexo passam num parser de iCalendar, com horário certo em America/Recife.
- [x] Depois do envio do layout 6, a senha não aparece na `outbox`, nos logs nem em A9.
- [x] No E2E, os e-mails 1, 2 e 3 chegam ao Mailpit no fluxo inscrição → convite → aceite.

## Segurança e LGPD

O sistema guarda nome, e-mail, telefone e LinkedIn de cerca de 2.500 pessoas, então o padrão é coletar o mínimo, mostrar contato só para admin e apagar depois do evento.

**Autenticação e sessão**

- Senhas com argon2id; senha provisória aleatória de 12 caracteres, troca obrigatória no primeiro acesso (M2).
- Cookie `sid` httpOnly, `Secure`, `SameSite=Lax`, validade de 12 h; JWT de 15 min com renovação silenciosa contra a coleção `sessions`. Desativar usuário ou trocar senha revoga as sessões.
- Proteção CSRF por header obrigatório `X-Requested-With` + checagem de `Origin` nas rotas que escrevem.
- Bloqueio de login: 5 falhas em 10 min travam a conta por 5 min.

**Token da participante**

- 32 bytes em base64url no link, derivados por HMAC-SHA256 de segredo + `menteeId` + `tokenVersion` (`MENTEE_TOKEN_SECRET`); no banco só o SHA-256 (`tokenHash`). Enviado à API por header, nunca registrado em log.
- Link curto (`/l/<código>`, E48): credencial equivalente ao token, código aleatório de 7 caracteres base62; rate limit de 600 por minuto por IP em E48, mesma resposta para código inexistente ou revogado (sem enumeração), nunca em log (caminho mascarado); revogado quando `tokenVersion` muda.
- Link vale até 7 dias após o evento.

**Borda e API**

- Cloudflare: TLS, WAF gerenciado, Turnstile em E02 e E05, rate limit alto por IP (300 requisições de inscrição a cada 10 min), porque o Wi-Fi do evento sai por poucos IPs; a defesa principal contra robôs é o Turnstile.
- API: `@fastify/rate-limit` por sessão; Zod com `strict()` em todo corpo (rejeita campos extras); limite de 1 MB por requisição, 2 MB no CSV.
- Nginx: CSP restrita a self e Turnstile (com o analytics ligado, `connect-src` também aceita `UMAMI_HOST_URL`; ver Analytics (Umami)), HSTS, `X-Content-Type-Options`, `Referrer-Policy: same-origin` (em `/l/`, `no-referrer`, para o código não vazar no cabeçalho `Referer`).
- Atlas: usuário de banco só com `readWrite` no banco do evento; Access List só com o IP da VM; backup contínuo ligado.
- Logs sem dados pessoais: e-mail mascarado (`j***@g***.com`), telefone nunca.

**LGPD**

- Consentimento explícito em P4, com versão do texto e data gravadas.
- Finalidade única: organizar a mentoria do evento. Dados não são usados para outro fim nem compartilhados com patrocinadores.
- Mentoras não veem e-mail nem telefone das participantes (projeção por papel), nem nos resultados de busca. O WhatsApp da própria mentora (`users.phone`) só aparece para ela (M2) e para o admin (A3).
- Exportação CSV (E37) registrada na auditoria.
- Retenção: 30 dias após o evento, um job anonimiza `mentees` (mantém área e status para estatística) e apaga `outbox` e `short_links`. Prazo a validar com a organização.
- Pedido de exclusão: admin cancela e anonimiza a participante em A4 (E36 `anonymize`, que na mesma transação incrementa `tokenVersion` e apaga a `outbox` e os `short_links` dela).

## Infra do dia do evento, observabilidade e testes

A carga esperada é pequena para o tamanho da máquina; o risco real é conflito de agenda e falha de mensagem, então os testes focam concorrência e o runbook foca contingência.

**Ambientes**

| Ambiente | Onde | Banco | Uso |
| --- | --- | --- | --- |
| dev | Máquina de cada dev, `compose.dev.yaml` | `mongodb-atlas-local` (perfil `dev`) | Desenvolvimento e testes de integração |
| homolog | VM, 2 vCPU / 4 GB, `homolog.techwoman.dev` | Atlas M10 (banco `tw_homolog`) | Validação com Rafaela e organização |
| produção | VM, 8 vCPU / 16 GB no dia, `techwoman.dev` | Atlas M30 de 13/11 a 15/11, depois volta a M10 | Evento |

**Estimativa de carga:** 2.500 inscrições ao longo do dia, com picos após palestras; 50 mentoras com SSE aberto; poucos admins. Meta: aguentar 200 inscrições por minuto e 100 requisições por segundo mistas, com p95 abaixo de 300 ms.

**Observabilidade**

- Logs JSON (pino) em stdout, com `requestId`, rota, status e tempo; rotação pelo driver de log do Docker. A URL vai sem query e com o código do link curto mascarado (`/l/***`, `/api/l/***`).
- `GET /health` (processo vivo) e `GET /ready` (ping no Atlas) usados pelo `healthcheck` e pelo monitor externo.
- Alertas do Atlas: conexões, CPU, latência de operação e falhas de eleição de primário.
- Monitor externo de uptime em `/ready` a cada 1 min, com alerta no WhatsApp/e-mail do Felipe.
- Painel A1 + A9 servem de monitoramento de negócio no dia.

**Testes obrigatórios antes de 10/11**

- [ ] Unitários das regras RN01–RN17 (funções puras de `src/domain`).
- [ ] Integração com `mongodb-atlas-local`: índices únicos, transações, Change Streams.
- [ ] Concorrência: 50 mentoras simuladas convidando as mesmas 10 participantes ao mesmo tempo, com resultado esperado de zero duplicidade de participante, mesa ou mentora.
- [ ] Corrida aceitar × expirar no mesmo segundo: só um vence.
- [ ] E2E (Playwright) do fluxo principal: P4 → M4/M5 → P6 aceitar → M6 concluir; e da recusa por horário voltando com prioridade.
- [ ] Carga com k6 no ambiente de homolog escalado igual à produção.
- [ ] Teste de restauração do backup do Atlas.

**Runbook**

1. 12/11: congelar código (só correções críticas); testes de carga e concorrência finais.
2. 13/11: Atlas para M30, VM para 8 vCPU / 16 GB, `--scale api=4`; teste de fumaça completo; QR Code impresso apontando para `techwoman.dev/mentoria/inscricao`; mentoras recebem a senha provisória.
3. 14/11, 8h: login de teste com uma mentora em cada mesa; abrir inscrições (A7).
4. Durante o evento: Felipe ou admin no balcão de apoio com A1, A5 e A9 abertos. A cada hora, exportar a agenda (E37) como contingência; se o site cair, o balcão segue pela última exportação.
5. 15/11: fechar inscrições, exportar tudo, voltar Atlas e VM ao tamanho normal.
6. 14/12: job de anonimização, que também apaga `outbox` e `short_links` (prazo a confirmar).

## Analytics (Umami)

Medição de uso anônima e sem cookies, com Umami self-hosted em `analytics.techwoman.dev`. Só as páginas públicas são medidas, a query string nunca sai do navegador e nenhum dado pessoal entra nos eventos.

**Stack separada** (`ops/analytics/compose.yaml`, projeto compose `umami`, sobe e cai sem tocar no app):

| Serviço | Imagem (versão fixa) | Container | Redes |
| --- | --- | --- | --- |
| `umami` | `ghcr.io/umami-software/umami:3.4.0` (lançada em 17/09/2026; índice `sha256:85909afc45bdcda1917394594a087421fdbb05610fded0fa9f6fb861abb2f367`) | sem `container_name` (nome DNS `umami`, para escalar) | `umami_internal`, `umami_edge` |
| `umami-db` | `postgres:16.14-alpine` | `umami-db` | `umami_internal` |

- Nenhuma porta publicada no host. Volume do Postgres: `umami_db` (nome fixo, fora do prefixo do projeto).
- `umami_internal` (`internal: true`): só `umami` ↔ `umami-db`.
- `umami_edge` (externa, criada antes com `docker network create --internal umami_edge`): só `umami` e o Nginx Proxy Manager (`docker network connect umami_edge nginx-proxy-manager`). Se o container do NPM for recriado, o `network connect` precisa ser refeito. Como as duas redes são `internal`, o Umami não tem saída para a internet; o NPM continua com a saída das redes dele.
- Isolamento: o Umami não entra na `npm_network` nem em rede `techwoman_*`; não enxerga web, api, worker, WAHA nem o Atlas. O NPM só fala com ele por `http://umami:3000`.
- Telemetria e checagem de versão desligadas (`DISABLE_TELEMETRY=1`, `DISABLE_UPDATES=1`). `COLLECT_API_ENDPOINT` não é usado (com ele o Umami reescreveria o `script.js` na partida, o que falha com filesystem somente leitura).
- Endurecimento: `read_only: true`; `umami` com `tmpfs` em `/tmp` e `/app/.next/cache` e `cap_drop: [ALL]`; `umami-db` com `tmpfs` em `/tmp` e `/var/run/postgresql`, `cap_drop: [ALL]` e `cap_add` só de `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETUID`, `SETGID` (o entrypoint do Postgres parte como root e cai para o uid 70); `no-new-privileges`; `restart: unless-stopped`; log `json-file` com `max-size: 10m` e `max-file: 3`. Healthchecks: `curl` em `http://127.0.0.1:3000/api/heartbeat` no `umami` e `pg_isready` no `umami-db`. Testado com Podman: os dois sobem saudáveis assim, inclusive com volume vazio.

**Variáveis** (`ops/analytics/.env`, gitignored; nomes em `ops/analytics/.env.example`):

| Variável | Uso |
| --- | --- |
| `UMAMI_DB_PASSWORD` | Senha do Postgres; monta o `DATABASE_URL` (`postgresql://umami:<senha>@umami-db:5432/umami`). Gere com `openssl rand -hex 24` (hex, para não precisar escapar na URL) |
| `UMAMI_APP_SECRET` | Vira o `APP_SECRET` do Umami (assina as sessões do painel). Gere com `openssl rand -hex 32` |
| `UMAMI_CPUS`, `UMAMI_MEM` | Limites do `umami`; padrão `1.0` e `768M` |
| `UMAMI_DB_CPUS`, `UMAMI_DB_MEM` | Limites do `umami-db`; padrão `0.5` e `512M` |

**Limites e escala no dia do evento:** o servidor tem 4 vCPU e 7,4 GB; o site espera ~200 req/s e o analytics recebe uma fração disso (um pageview por troca de tela pública e poucos eventos). Para o dia, suba os limites no `ops/analytics/.env` (ex.: `UMAMI_CPUS=2.0`, `UMAMI_MEM=1024M`, `UMAMI_DB_CPUS=1.0`, `UMAMI_DB_MEM=768M`) e rode o `up -d` de novo; se ainda faltar, `--scale umami=2` (o serviço não tem `container_name` e o NPM resolve `umami` pelo DNS da rede `umami_edge`, com o alias `umami`). Depois do evento, volte os valores e rode o `up -d`.

**Script do tracker (vendorizado):**

- Arquivo `src/web/public/a/u.js`: cópia exata de `/app/public/script.js` do Umami 3.4.0 (4.773 bytes, `sha384-ZMxgpYfO/phGz4GiYTIZhcauuGKTb2onmOB5gsiigjmBR38DGAmIna5J1Y/dM/13`), tirada da camada da imagem no GHCR e conferida byte a byte com a imagem do Docker Hub. É servida pelo nginx do web na mesma origem, em `/a/u.js?v=3.4.0` (a query só fura o cache do navegador quando a versão muda), com `integrity` (SRI) e `crossorigin="anonymous"`. O script de `analytics.techwoman.dev/script.js` não é usado pelo site.
- Constantes em `src/web/analytics/core.ts`: `UMAMI_VERSION` e `UMAMI_SCRIPT_SRI`. Um teste unitário recalcula o sha384 do arquivo e compara com a constante.
- Para atualizar o Umami: troque a tag em `ops/analytics/compose.yaml`; rode `ops/analytics/vendor-tracker.sh <versão>` (extrai `/app/public/script.js` da imagem para `src/web/public/a/u.js` e imprime o SRI); atualize `UMAMI_VERSION` e `UMAMI_SCRIPT_SRI` e esta seção; `npm test`; rebuild do web (`up -d --build web`), porque o script vai no build. Só a troca de `UMAMI_HOST_URL`/`UMAMI_WEBSITE_ID` dispensa rebuild.

**Configuração em runtime (web):**

| Variável (container `web`) | Uso |
| --- | --- |
| `UMAMI_HOST_URL` | Origem do Umami, só `https://host` sem caminho e sem barra final (ex.: `https://analytics.techwoman.dev`). Obrigatória quando `UMAMI_WEBSITE_ID` está preenchida |
| `UMAMI_WEBSITE_ID` | UUID do site no Umami. Vazia (padrão) = analytics desligado: nenhuma meta, nenhum script, CSP sem origem extra |

- O `ops/web-entrypoint.sh` valida as duas (UUID; `^https://[A-Za-z0-9.-]+(:porta)?$`) e sai com erro se forem inválidas, como faz com `CLIENT_IP_HEADER`. Gera `/tmp/csp.conf` (a linha `add_header Content-Security-Policy` inteira; com o analytics ligado, `connect-src 'self' <UMAMI_HOST_URL>`) e `/tmp/analytics.conf` (vazio quando desligado; ligado, um `sub_filter` que injeta no `</head>` do `index.html` as metas `tw-umami-website-id` e `tw-umami-host-url`). `script-src` continua `'self'` (mais o Turnstile): o script é da mesma origem.
- A SPA lê as metas na partida (`src/web/analytics/index.ts`). Sem as metas (dev com Vite, testes, `UMAMI_WEBSITE_ID` vazia), `track` e os pageviews não fazem nada.

**Como o tracker é usado (só páginas públicas, sem query string):**

- Páginas públicas (lista fechada, caminho exato): `/` (P1), `/jornada` (P2), `/jornada/resultado` (P3), `/mentoria/inscricao` (P4), `/mentoria/inscricao/ok` (P5), `/mentoria/minha` (P6), `/privacidade`. Nunca: `/admin*`, `/mentora*`, `/entrar*` (M1, M2), `/_ui`, 404 e qualquer outro caminho.
- O script só é injetado quando a primeira rota pública é aberta; quem entra direto em `/admin` ou `/entrar` não baixa o script.
- Atributos: `data-website-id`, `data-host-url` (envio para `<UMAMI_HOST_URL>/api/send`), `data-auto-track="false"` (o script não intercepta o `history` nem cliques), `data-exclude-search="true"`, `data-exclude-hash="true"`, `data-do-not-track="true"` (navegador com Do Not Track não envia nada) e `data-before-send="__twUmamiBeforeSend"`.
- Pageview: o componente `RouteAnalytics` (em `App.tsx`) chama `umami.track()` a cada troca de caminho público. Eventos: o helper `track(nome, dados?)` de `src/web/analytics`.
- Filtro `__twUmamiBeforeSend` (função global chamada pelo script antes de cada envio, segunda barreira): descarta tudo que não for do tipo `event` (pageview e evento; `identify` e `performance` nunca saem); descarta se o caminho atual do roteador não for público; reescreve `url` com o caminho atual sem query e sem hash (com `auto-track` desligado o script congelaria a URL da primeira página); troca `title` por um rótulo fixo da rota (`P1 · Home` etc.; o título da aba pode ter ficado de uma tela do admin); `referrer` fica só no primeiro pageview da carga da página e só se for de outra origem, e mesmo assim só origem + caminho (sem query e sem hash); do próprio site, em eventos e nos pageviews seguintes, vai vazio. O filtro só aceita envios iniciados por `track`/`RouteAnalytics` (o caminho é capturado na chamada); uma chamada direta a `window.umami` é descartada.
- `track` só aceita os nomes da tabela abaixo e, de cada um, só as propriedades listadas, com valor de formato fechado (categoria, nunca texto livre); qualquer outra propriedade é descartada. Nunca entram nome, e-mail, telefone, LinkedIn, comentário, token, código de link curto ou ids.

**Eventos** (nomes em snake_case; telas em SDD 1):

| Evento | Tela e momento | Propriedades |
| --- | --- | --- |
| `inscricao_concluida` | P4, E02 respondeu 201 (inscrição nova ou reativada) | `area` (chave da área), `periodo` (`morning` \| `early_afternoon` \| `late_afternoon` \| `any`) |
| `inscricao_erro` | P4, envio falhou ou E02 respondeu 200 `ALREADY_REGISTERED` | `codigo` (código do erro em maiúsculas, ex.: `ALREADY_REGISTERED`, `NETWORK`, `RATE_LIMITED`, `TURNSTILE_FAILED`) |
| `link_reenviado` | P6 "Link inválido", E05 aceito | — |
| `convite_aceito` | P6, E04 `accept` com sucesso | — |
| `convite_recusado` | P6, E04 `decline` com sucesso | `motivo` (`horario` \| `sem_interesse`) |
| `inscricao_cancelada` | P6, E04 `cancel` com sucesso | — |
| `horario_trocado` | P6, E04 `reschedule` com sucesso | — |
| `horario_escolhido` | P6, E08 com sucesso | — |
| `agenda_adicionada` | P6, toque em "Adicionar à agenda (.ics)" | — |
| `preferencia_atualizada` | P6, E04 `update_preference` com sucesso | `periodo` |

**Política de dados:** sem cookies (o Umami identifica a sessão por um hash de IP + user agent + site com sal rotativo, calculado no servidor dele; o IP não é guardado, só país/região/cidade aproximados derivados dele, além de navegador, sistema, dispositivo, idioma e tamanho de tela); sem dado pessoal nos eventos; sem query string nem hash (o `?t=<token>` de P6 nunca sai do navegador); só páginas públicas; sem rastreio entre sites; Do Not Track respeitado; dados ficam no nosso servidor (Postgres `umami_db`). O aviso de privacidade (`/privacidade`) explica isso em um parágrafo (texto em SDD 1, P · Privacidade).

**Proxy host no NPM (`analytics.techwoman.dev`):**

- Details: domínio `analytics.techwoman.dev`, esquema `http`, host `umami`, porta `3000`; Block Common Exploits ligado; Websockets desligado.
- SSL: Let's Encrypt, Force SSL, HTTP/2 e HSTS ligados.
- Advanced: o painel (`/`, login e API do painel) fica restrito a uma lista de IPs; só a coleta (`/api/send`) e o `script.js` ficam públicos. O NPM já gera o `location /`, então o Advanced não pode redefini-lo: o `allow`/`deny` vai no nível do server (o `location /` do NPM herda) e as duas rotas públicas ganham `location` próprio com `allow all` (dentro de um `location`, `allow`/`deny` substituem os herdados).

```nginx
# Painel só para a lista abaixo (troque pelos IPs da equipe; um allow por linha)
allow 203.0.113.10;
deny all;

# Coleta pública (POST e o preflight OPTIONS do CORS)
location = /api/send {
  allow all;
  limit_except POST OPTIONS { deny all; }
  client_max_body_size 64k;
  include conf.d/include/proxy.conf;   # o proxy.conf do NPM já faz o proxy_pass para umami:3000
}

# Script público (o site usa a cópia vendorizada; este fica para teste)
location = /script.js {
  allow all;
  include conf.d/include/proxy.conf;   # o proxy.conf do NPM já faz o proxy_pass para umami:3000
}
```

- Antes de confiar no snippet, confira no servidor que o `/data/nginx/proxy_host/<n>.conf` gerado define `$forward_scheme`, `$server` e `$port` e que o `conf.d/include/proxy.conf` do NPM termina em `proxy_pass $forward_scheme://$server:$port$request_uri;` (por isso o snippet não repete o `proxy_pass`, que daria "directive is duplicate"); depois `docker exec nginx-proxy-manager nginx -t`. O snippet foi validado com `nginx -t` num server montado como o do NPM 2.x. Teste de fora da lista: `curl -I https://analytics.techwoman.dev/` dá 403 e `curl -X OPTIONS -H 'Origin: https://techwoman.dev' -H 'Access-Control-Request-Method: POST' -I https://analytics.techwoman.dev/api/send` dá 204.
- `analytics.techwoman.dev` deve ficar só DNS na Cloudflare (nuvem cinza). Se passar pelo proxy da Cloudflare, o `allow` veria IPs da Cloudflare e o NPM precisaria de `real_ip_header CF-Connecting-IP` com `set_real_ip_from` das faixas dela (mesmo caso do host principal, em Arquitetura).
- O preflight do CORS foi testado: `OPTIONS /api/send` responde 204 com `Access-Control-Allow-Origin: *`, e `POST /api/send` responde 200.

**Implantação (ordem importa: o id do site só existe com o Umami no ar):**

```sh
# 0. Primeiro deploy deste recurso: rebuild do web (nginx.conf, entrypoint, SPA e u.js mudaram). Sem ele, a imagem
#    antiga ignora UMAMI_* sem erro. Pode ir com UMAMI_WEBSITE_ID ainda vazio (analytics desligado).
docker compose -f ops/compose.yaml -f ops/compose.npm.yaml up -d --build
# 1. Rede de borda (uma vez) e NPM nela (refazer se o container do NPM for recriado)
docker network create --internal umami_edge
docker network connect umami_edge nginx-proxy-manager
# 2. Segredos e subida da stack
cp ops/analytics/.env.example ops/analytics/.env   # preencha com openssl rand -hex 24 / -hex 32
docker compose -p umami --env-file ops/analytics/.env -f ops/analytics/compose.yaml up -d
docker compose -p umami --env-file ops/analytics/.env -f ops/analytics/compose.yaml ps   # os dois "healthy"
# 3. NPM: proxy host analytics.techwoman.dev -> http://umami:3000, SSL Let's Encrypt + Force SSL, Advanced acima
# 4. Painel: entrar com admin / umami, trocar a senha, criar o site "techwoman.dev" e copiar o Website ID
# 5. App: no .env da raiz, UMAMI_HOST_URL=https://analytics.techwoman.dev e UMAMI_WEBSITE_ID=<id>; com a imagem do passo 0,
#    trocar UMAMI_* só exige recriar o web (sem --build)
docker compose -f ops/compose.yaml -f ops/compose.npm.yaml up -d web
```

Desligar o analytics: esvazie `UMAMI_WEBSITE_ID` e recrie o web. Sempre passe `--env-file ops/analytics/.env` e `-p umami` (o `.env` implícito do compose não é o desta pasta).

## Cronograma até 14/11 e pendências

São três semanas até o evento: o código congela em Nov 12, 2026 e o evento acontece em Nov 14, 2026; a aprovação do WhatsApp corre em paralelo desde já porque não depende do time.

&#91;embedded content: cronograma · 7 frentes e 3 marcos até o evento\]

Admin e inscrição vêm antes do painel da mentora porque a importação da lista de mentoras precisa estar pronta para elas testarem o login em homologação.

**Pendências que bloqueiam o desenvolvimento**

- [ ] Rafaela: lista oficial das \~50 mentoras (nome, e-mail, LinkedIn, organização, horários) no modelo CSV de A3.
- [ ] Rafaela: confirmar campos da inscrição (data de nascimento entra?) e a lista final de áreas da gamificação.
- [x] Horário do evento: das 8h às 18h.
- [ ] Definir provedor de e-mail e abrir a conta WhatsApp Business com os modelos de mensagem.
- [ ] Texto do aviso de privacidade e quem é a controladora dos dados (sem citar o Bradesco).
- [ ] Confirmar a stack do front atual hospedado no Cloudflare para decidir se as telas novas entram no mesmo projeto.
- [ ] Quem opera o painel admin no dia (contas de admin a criar em A8).

**Assumido neste SDD (mudar aqui se a decisão for outra):** grade fixa 40 + 5 min; prazo de 15 min para aceitar convite; uma mentoria por participante; perguntas da gamificação fixas no código (configuração pelo admin fica para a fase 2).
