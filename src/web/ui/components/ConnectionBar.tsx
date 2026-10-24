import { useEffect, useState } from 'react';
import type { StreamStatus } from '../../net/useEventStream';

/** Faixa de conexão: "Reconectando…" ou "Atualizado agora / há N s". */
export function ConnectionBar({ status, lastUpdateAt, idleText }: { status: StreamStatus; lastUpdateAt: number | null; idleText?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);
  if (status === 'reconnecting' || status === 'connecting') {
    return (
      <div className="tw-conn tw-conn--reconnecting" role="status">
        <span className="tw-conn__dot" aria-hidden="true" />
        Reconectando…
      </div>
    );
  }
  const secs = lastUpdateAt ? Math.round((Date.now() - lastUpdateAt) / 1000) : null;
  const when = secs === null || secs < 10 ? 'agora' : secs < 60 ? `há ${secs} s` : `há ${Math.round(secs / 60)} min`;
  return (
    <div className="tw-conn" role="status">
      <span className="tw-conn__dot" aria-hidden="true" />
      Atualizado {when}
      {status === 'polling' ? ' · modo consulta' : idleText ? ` · ${idleText}` : ''}
    </div>
  );
}

/** Versão para páginas sem SSE (P6): "Atualizado agora · esta página se atualiza sozinha". */
export function FreshnessNote({ text }: { text: string }) {
  return (
    <div className="tw-conn">
      <span className="tw-conn__dot" aria-hidden="true" />
      {text}
    </div>
  );
}
