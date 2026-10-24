import { useEffect, useRef, useState } from 'react';
import { endpointUrl } from './client';
import type { EndpointDef } from '@tw/shared';

/** live = SSE aberto; reconnecting = tentando de novo (faixa "Reconectando…"); polling = SSE indisponível, atualizando por consulta. */
export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'polling';

export interface UseEventStreamOptions<T> {
  /** Endpoint SSE (E27 ou E38Stream). */
  endpoint: EndpointDef;
  /** Tipos de evento (`event:` do frame) a escutar, ex.: MENTOR_STREAM_EVENT_TYPES. */
  eventTypes: readonly string[];
  /** Recebe { type, data } já com o JSON do frame interpretado. */
  onEvent: (event: T) => void;
  /** Carga completa da tela (E22/E25/E38). Chamada ao conectar/reconectar e a cada `pollMs` no modo polling. */
  refetch: () => void | Promise<unknown>;
  enabled?: boolean;
  /** Intervalo do polling de fallback. Padrão 5 s. */
  pollMs?: number;
  /** Falhas seguidas antes de cair para polling. Padrão 3. */
  maxFailures?: number;
}

/**
 * Hook de SSE com reconexão exponencial e fallback de polling.
 * Ao (re)conectar chama `refetch` para não perder eventos entre quedas.
 */
export function useEventStream<T = { type: string; data: unknown }>(opts: UseEventStreamOptions<T>) {
  const { enabled = true, pollMs = 5000, maxFailures = 3 } = opts;
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const latest = useRef(opts);
  latest.current = opts;
  const url = endpointUrl(opts.endpoint);
  const typesKey = opts.eventTypes.join(',');

  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let failures = 0;
    let disposed = false;

    const touch = () => setLastUpdateAt(Date.now());
    const refetch = () => {
      void Promise.resolve(latest.current.refetch()).then(touch, () => undefined);
    };
    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = undefined;
    };
    const startPolling = () => {
      if (pollTimer) return;
      setStatus('polling');
      refetch();
      pollTimer = setInterval(refetch, pollMs);
    };

    const connect = () => {
      if (disposed) return;
      es = new EventSource(url, { withCredentials: true });
      es.addEventListener('ready', () => {
        failures = 0;
        stopPolling();
        setStatus('live');
        refetch();
      });
      for (const type of typesKey.split(',').filter(Boolean)) {
        es.addEventListener(type, (ev) => {
          try {
            latest.current.onEvent({ type, data: JSON.parse((ev as MessageEvent<string>).data) } as T);
            touch();
          } catch {
            /* frame inválido: ignora */
          }
        });
      }
      es.onerror = () => {
        failures += 1;
        // O EventSource reconecta sozinho (readyState CONNECTING) mantendo Last-Event-ID; se fechou, recriamos.
        if (failures >= maxFailures) startPolling();
        else setStatus('reconnecting');
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          const delay = Math.min(15000, 1000 * 2 ** Math.min(failures, 4));
          retryTimer = setTimeout(connect, delay);
        }
      };
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    document.addEventListener('visibilitychange', onVisible);
    connect();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
      stopPolling();
    };
  }, [enabled, url, typesKey, pollMs, maxFailures]);

  return { status, lastUpdateAt };
}
