/** Cloudflare Turnstile invisível (E02, E05). Site key por env do Vite: VITE_TURNSTILE_SITE_KEY. */

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Chave de teste da Cloudflare (sempre passa), só para desenvolvimento sem chave configurada.
const DEV_FALLBACK_KEY = '1x00000000000000000000AA';
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading: Promise<TurnstileApi> | null = null;
function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    s.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function turnstileSiteKey(): string | null {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  return key || (import.meta.env.DEV ? DEV_FALLBACK_KEY : null);
}

export interface TurnstileHandle {
  /** Executa o desafio invisível e devolve o token. */
  getToken: () => Promise<string>;
  destroy: () => void;
}

/** Cria o widget invisível dentro de `container`. Rejeita com Error('turnstile') se não carregar. */
export async function mountTurnstile(container: HTMLElement): Promise<TurnstileHandle> {
  const siteKey = turnstileSiteKey();
  if (!siteKey) throw new Error('turnstile');
  const api = await loadScript();
  let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
  const id = api.render(container, {
    sitekey: siteKey,
    size: 'invisible',
    callback: (token: string) => pending?.resolve(token),
    'error-callback': () => pending?.reject(new Error('turnstile')),
    'expired-callback': () => undefined,
  });
  return {
    getToken: () =>
      new Promise<string>((resolve, reject) => {
        pending = { resolve, reject };
        api.reset(id);
        api.execute(id);
      }),
    destroy: () => api.remove(id),
  };
}
