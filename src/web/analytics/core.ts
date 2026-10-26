/**
 * Analytics (Umami) · regras puras, sem DOM nem import.meta (os testes unitários importam este arquivo no Node).
 * Contrato em docs/PLAN.md > Analytics (Umami) e eventos por tela em docs/UI-SPEC.md > Medição de uso.
 */

/** Versão do Umami de onde saiu src/web/public/a/u.js (mesma tag de ops/analytics/compose.yaml). */
export const UMAMI_VERSION = '3.4.0';
/** SRI do src/web/public/a/u.js; um teste recalcula e compara. Ao trocar o script, atualize os dois. */
export const UMAMI_SCRIPT_SRI = 'sha384-ZMxgpYfO/phGz4GiYTIZhcauuGKTb2onmOB5gsiigjmBR38DGAmIna5J1Y/dM/13';
export const UMAMI_SCRIPT_SRC = `/a/u.js?v=${UMAMI_VERSION}`;
/** Nome da função global que o script chama antes de cada envio (data-before-send). */
export const BEFORE_SEND_GLOBAL = '__twUmamiBeforeSend';
/** Metas injetadas pelo nginx (ops/web-entrypoint.sh -> /tmp/analytics.conf). */
export const META_WEBSITE_ID = 'tw-umami-website-id';
export const META_HOST_URL = 'tw-umami-host-url';

/** Páginas públicas medidas (caminho exato) e o rótulo fixo que vai no lugar do título da aba. */
export const PUBLIC_ROUTES: Readonly<Record<string, string>> = {
  '/': 'P1 · Home',
  '/jornada': 'P2 · Jornada',
  '/jornada/resultado': 'P3 · Resultado',
  '/mentoria/inscricao': 'P4 · Inscrição',
  '/mentoria/inscricao/ok': 'P5 · Inscrição recebida',
  '/mentoria/minha': 'P6 · Minha mentoria',
  '/privacidade': 'Privacidade',
};

/** Caminho sem query, sem hash e sem barra final (exceto a raiz). */
export function normalizePath(path: string): string {
  const p = path.split(/[?#]/)[0] ?? '';
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

export function isPublicPath(path: string): boolean {
  return Object.prototype.hasOwnProperty.call(PUBLIC_ROUTES, normalizePath(path));
}

export interface AnalyticsConfig {
  websiteId: string;
  hostUrl: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?$/;

/** Config válida ou null (analytics desligado). Mesmas regras do entrypoint. */
export function parseConfig(websiteId: string | null | undefined, hostUrl: string | null | undefined): AnalyticsConfig | null {
  const id = (websiteId ?? '').trim();
  const host = (hostUrl ?? '').trim();
  if (!UUID.test(id) || !HOST.test(host)) return null;
  return { websiteId: id, hostUrl: host };
}

const AREA = /^[a-z0-9_-]{1,40}$/;
const PERIODS = ['morning', 'early_afternoon', 'late_afternoon', 'any'] as const;
const oneOf = (values: readonly string[]) => (v: unknown) => typeof v === 'string' && values.includes(v);
const isArea = (v: unknown) => typeof v === 'string' && AREA.test(v);
const isPeriod = oneOf(PERIODS);
const isCode = (v: unknown) => typeof v === 'string' && /^[A-Z][A-Z0-9_]{0,39}$/.test(v);

/** Eventos permitidos e, de cada um, as propriedades aceitas com o formato do valor. */
export const EVENTS = {
  inscricao_concluida: { area: isArea, periodo: isPeriod },
  inscricao_erro: { codigo: isCode },
  link_reenviado: {},
  convite_aceito: {},
  convite_recusado: { motivo: oneOf(['horario', 'sem_interesse']) },
  inscricao_cancelada: {},
  horario_trocado: {},
  horario_escolhido: {},
  agenda_adicionada: {},
  preferencia_atualizada: { periodo: isPeriod },
} as const satisfies Record<string, Record<string, (v: unknown) => boolean>>;

export type EventName = keyof typeof EVENTS;
export type EventData<N extends EventName> = { [K in keyof (typeof EVENTS)[N]]?: string };

export function isEventName(name: unknown): name is EventName {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(EVENTS, name);
}

/** Só as propriedades da lista do evento, com valor no formato certo; o resto é descartado. */
export function cleanEventData(name: EventName, data: unknown): Record<string, string> | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const rules = EVENTS[name] as Record<string, (v: unknown) => boolean>;
  const out: Record<string, string> = {};
  for (const [k, check] of Object.entries(rules)) {
    const v = (data as Record<string, unknown>)[k];
    if (check(v)) out[k] = v as string;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Referrer: só de outra origem, e só origem + caminho; do próprio site (ou inválido), vazio. */
export function sanitizeReferrer(referrer: unknown, siteOrigin: string): string {
  if (typeof referrer !== 'string' || !referrer) return '';
  try {
    const u = new URL(referrer, siteOrigin);
    if (u.origin === siteOrigin || !/^https?:$/.test(u.protocol)) return '';
    return u.origin + u.pathname;
  } catch {
    return '';
  }
}

/**
 * Contexto do filtro: caminho atual do roteador, origem do site e se o referrer externo pode ir junto
 * (só no primeiro pageview da carga da página; com auto-track desligado o script repetiria o mesmo referrer).
 */
export interface SendContext {
  path: string;
  origin: string;
  keepReferrer: boolean;
}

/**
 * Filtro chamado pelo script do Umami antes de cada envio (data-before-send).
 * Devolve o payload reescrito ou null (descarta). Só passa `event` (pageview e evento) em página pública;
 * url = caminho sem query e sem hash, title = rótulo fixo da rota, referrer limpo, data só da lista do evento.
 */
export function beforeSend(type: unknown, payload: unknown, ctx: SendContext): Record<string, unknown> | null {
  if (type !== 'event' || !payload || typeof payload !== 'object') return null;
  const path = normalizePath(ctx.path);
  if (!isPublicPath(path)) return null;
  const p = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {
    website: p.website,
    hostname: p.hostname,
    screen: p.screen,
    language: p.language,
    url: path,
    title: PUBLIC_ROUTES[path],
    referrer: ctx.keepReferrer && p.name === undefined ? sanitizeReferrer(p.referrer, ctx.origin) : '',
  };
  if (p.name !== undefined) {
    if (!isEventName(p.name)) return null;
    out.name = p.name;
    const data = cleanEventData(p.name, p.data);
    if (data) out.data = data;
  }
  return out;
}

/** O que o código usa do `window.umami` do script. */
export interface UmamiLike {
  track: (name?: string, data?: Record<string, string>) => unknown;
}

export interface AnalyticsDeps {
  /** Config lida das metas; null = desligado. */
  config: () => AnalyticsConfig | null;
  /** Caminho atual (location.pathname). */
  path: () => string;
  /** Origem do site (location.origin). */
  origin: () => string;
  /** Injeta o script uma vez e resolve com window.umami (null se falhar). */
  load: (cfg: AnalyticsConfig) => Promise<UmamiLike | null>;
}

export interface Analytics {
  track: <N extends EventName>(name: N, data?: EventData<N>) => void;
  pageview: (path: string) => void;
  /** Vai em window[BEFORE_SEND_GLOBAL]. */
  hook: (type: unknown, payload: unknown) => Record<string, unknown> | null;
}

/**
 * Helper do analytics. Tudo é no-op com a config desligada ou fora de página pública; o script só é carregado
 * na primeira chamada vinda de página pública. O hook só deixa passar envios iniciados aqui (o caminho é
 * capturado na chamada: o script chama o before-send de forma síncrona dentro de umami.track).
 */
export function createAnalytics(deps: AnalyticsDeps): Analytics {
  let ctx: SendContext | null = null;
  let referrerUsed = false;

  const send = (path: string, isPageview: boolean, fire: (u: UmamiLike) => unknown) => {
    const cfg = deps.config();
    if (!cfg || !isPublicPath(path)) return;
    void deps.load(cfg).then((u) => {
      if (!u) return;
      ctx = { path, origin: deps.origin(), keepReferrer: isPageview && !referrerUsed };
      if (isPageview) referrerUsed = true;
      try {
        void fire(u);
      } catch {
        // analytics nunca quebra a tela
      } finally {
        ctx = null;
      }
    }, () => undefined);
  };

  return {
    track(name, data) {
      if (!isEventName(name)) return;
      const clean = cleanEventData(name, data);
      send(normalizePath(deps.path()), false, (u) => u.track(name, clean));
    },
    pageview(path) {
      send(normalizePath(path), true, (u) => u.track());
    },
    hook(type, payload) {
      if (!ctx) return null;
      return beforeSend(type, payload, ctx);
    },
  };
}
