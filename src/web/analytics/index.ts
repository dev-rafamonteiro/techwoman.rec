/**
 * Analytics (Umami) no navegador: lê as metas do nginx, injeta o script vendorizado (src/web/public/a/u.js)
 * com SRI na primeira página pública e expõe `track` e `RouteAnalytics`. Regras em ./core.ts e docs/PLAN.md.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  BEFORE_SEND_GLOBAL, META_HOST_URL, META_WEBSITE_ID, UMAMI_SCRIPT_SRC, UMAMI_SCRIPT_SRI,
  createAnalytics, parseConfig, type AnalyticsConfig, type EventData, type EventName, type UmamiLike,
} from './core';

export type { EventName } from './core';

let config: AnalyticsConfig | null | undefined;
function readConfig(): AnalyticsConfig | null {
  if (config === undefined) {
    const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;
    config = parseConfig(meta(META_WEBSITE_ID), meta(META_HOST_URL));
  }
  return config;
}

let loading: Promise<UmamiLike | null> | null = null;
function loadScript(cfg: AnalyticsConfig): Promise<UmamiLike | null> {
  if (loading) return loading;
  (window as unknown as Record<string, unknown>)[BEFORE_SEND_GLOBAL] = analytics.hook;
  loading = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = UMAMI_SCRIPT_SRC;
    s.integrity = UMAMI_SCRIPT_SRI;
    s.crossOrigin = 'anonymous';
    s.async = true;
    const attrs: Record<string, string> = {
      'data-website-id': cfg.websiteId,
      'data-host-url': cfg.hostUrl,
      'data-auto-track': 'false',
      'data-exclude-search': 'true',
      'data-exclude-hash': 'true',
      'data-do-not-track': 'true',
      'data-before-send': BEFORE_SEND_GLOBAL,
    };
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve((window as unknown as { umami?: UmamiLike }).umami ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return loading;
}

const analytics = createAnalytics({
  config: readConfig,
  path: () => window.location.pathname,
  origin: () => window.location.origin,
  load: loadScript,
});

/** Evento de uso (tabela em docs/PLAN.md > Analytics). No-op com analytics desligado ou fora de página pública. */
export function track<N extends EventName>(name: N, data?: EventData<N>): void {
  analytics.track(name, data);
}

/** Conta um pageview a cada troca de caminho público. Fica dentro do BrowserRouter. */
export function RouteAnalytics(): null {
  const { pathname } = useLocation();
  useEffect(() => {
    analytics.pageview(pathname);
  }, [pathname]);
  return null;
}
