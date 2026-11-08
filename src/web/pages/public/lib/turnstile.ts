import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * Cloudflare Turnstile (E02, E05). Site key por env do Vite: VITE_TURNSTILE_SITE_KEY.
 * Fica escondido e só roda no envio (`execution: 'execute'`); só aparece se a Cloudflare pedir interação
 * (`appearance: 'interaction-only'`). O tamanho `invisible` não existe na API atual: widget invisível é um modo
 * escolhido no painel da Cloudflare, não um parâmetro do render.
 */

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

/** Sem resposta da Cloudflare nesse prazo, o envio falha com mensagem em vez de carregar para sempre. */
const TOKEN_TIMEOUT_MS = 120_000;

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
  /** Executa o desafio e devolve o token. */
  getToken: () => Promise<string>;
  destroy: () => void;
}

/** Cria o widget invisível dentro de `container`. Rejeita com Error('turnstile') se não carregar. */
export async function mountTurnstile(container: HTMLElement): Promise<TurnstileHandle> {
  const siteKey = turnstileSiteKey();
  if (!siteKey) throw new Error('turnstile');
  const api = await loadScript();
  let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
  let used = false;
  const fail = () => pending?.reject(new Error('turnstile'));
  // um elemento por widget: montar de novo no mesmo contêiner (StrictMode, remontagem) não colide com o anterior
  const el = container.appendChild(document.createElement('div'));
  const id = api.render(el, {
    sitekey: siteKey,
    size: 'flexible',
    execution: 'execute',
    appearance: 'interaction-only',
    callback: (token: string) => pending?.resolve(token),
    'error-callback': fail,
    'timeout-callback': fail,
    'unsupported-callback': fail,
    'expired-callback': () => undefined,
  });
  return {
    getToken: () =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('turnstile')), TOKEN_TIMEOUT_MS);
        const done = <A>(f: (a: A) => void) => (a: A) => {
          clearTimeout(timer);
          pending = null;
          f(a);
        };
        pending = { resolve: done(resolve), reject: done(reject) };
        // cada token vale uma vez: limpa o anterior antes de pedir outro (no primeiro, o reset só atrasa o desafio)
        if (used) api.reset(id);
        used = true;
        api.execute(id);
      }),
    destroy: () => {
      api.remove(id);
      el.remove();
    },
  };
}

/**
 * Monta o widget em `box` enquanto `enabled` e devolve `getToken`, que espera a montagem terminar (clique antes do
 * script carregar não falha) e rejeita com Error('turnstile') se a montagem ou o desafio falharem.
 */
export function useTurnstile(box: RefObject<HTMLElement>, enabled = true): () => Promise<string> {
  const handle = useRef<Promise<TurnstileHandle> | null>(null);
  useEffect(() => {
    if (!enabled || !box.current) return;
    const p = mountTurnstile(box.current);
    handle.current = p;
    p.catch(() => undefined);
    return () => {
      handle.current = null;
      p.then((h) => h.destroy(), () => undefined);
    };
  }, [enabled, box]);
  return useCallback(async () => {
    if (!handle.current) throw new Error('turnstile');
    return (await handle.current).getToken();
  }, []);
}
