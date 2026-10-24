# UI kit Tech Woman (@tw/web)

Tudo sai de `src/web/ui/index.ts`. Tokens em `ui/tokens.css`, estilos dos componentes em `ui/components/components.css` (classes `tw-*`), layouts em `shell/`.

```tsx
import { Button, StatusBadge, PriorityBadge, MenteeCard, SlotToggleGrid, SlotSingleChoice, TablePicker,
  Countdown, ConnectionBar, useToast, DataTable, SecretReveal, SkeletonList, EmptyState, ErrorState,
  NoPermission, Overlay, call, ApiError, useQuery, useEventStream, usePolling, useAuth, formatTime } from '../../ui';
```

## Páginas (donos: web-app, web-admin)
- Arquivo `src/web/pages/<area>/<codigo>*.tsx` com `export default function` do componente. O roteador (`shell/routes.tsx`) acha por prefixo do código: `public/P1…P6`, `mentora/M1…M4, M6`, `admin/A1, A2, A4…A9`, e A3 em dois arquivos `A3Form*.tsx` (rotas `nova` e `:id`) e `A3Import*.tsx`. Sem arquivo, a rota mostra "Tela X em construção".
- Não renderize header, menu nem barra inferior: o layout da rota já traz. P1, P2 e P3 usam `BareLayout` (trazem o próprio cabeçalho). P4/P5/P6/M1/M2 usam a coluna de 480 px com a faixa de topo.
- `:id` de A3: `useParams()`. Token de P6: `?t=` → `setMenteeToken(t)` e depois `call(ENDPOINTS.E03)`.

## Chamadas à API
```ts
const me = await call(ENDPOINTS.E03);                                  // header X-Mentee-Token automático
await call(ENDPOINTS.E04, { body: { action: 'accept' } });             // Idempotency-Key gerada
await call(ENDPOINTS.E24, { body: { menteeId, slotId, tableId } });    // ApiError: e.code === 'TABLE_TAKEN', e.isConflict
const blob = await callBlob(ENDPOINTS.E37, { query }); saveBlob(blob, 'participantes.csv');
```
Todas as escritas levam `X-Requested-With`, cookie de sessão (`credentials: 'include'`). Erro vira `ApiError { status, code, message, details }` (`NETWORK` quando sem rede). 401 em rota de staff leva a `/entrar?next=<rota>` sozinho.

## Dados e tempo real
- `useQuery(fetcher, deps)` → `{status:'loading'|'error'|'success', data, error, refetch, reload}`: use com `SkeletonList`, `ErrorState onRetry={reload}`, `EmptyState`.
- `useEventStream({ endpoint: ENDPOINTS.E27, eventTypes: MENTOR_STREAM_EVENT_TYPES, onEvent, refetch })` → `{status, lastUpdateAt}`; reconecta com espera crescente e cai para polling de 5 s; chama `refetch` ao (re)conectar. Passe `status` e `lastUpdateAt` à `ConnectionBar`.
- `usePolling(fn, 30000)` para P6 (30 s e ao focar a aba) e A1 (15 s).

## Padrões
- Horário: `formatTime(iso)` → `14h20` (Recife); `formatRange`, `formatCountdown`.
- Conflito 409: `toast.conflict('Outra mentora acabou de convidar a Joana', refetch)` (ação "Atualizar").
- Status: sempre `StatusBadge`/`PriorityBadge` (cor + texto). Campos: `TextField` etc. (rótulo, erro e dica ligados por `aria-describedby`).
- Papéis: `useAuth().hasRole('super_admin')`; a guarda de rota já é aplicada pelo roteador (E12).
- Senha provisória: `SecretReveal` (A3, A8); descarte o valor ao fechar.
