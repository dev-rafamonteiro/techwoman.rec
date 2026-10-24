import { useEffect, useState } from 'react';
import { formatCountdown } from '../format';

/**
 * Contador regressivo até `expiresAt`. Vermelho (cor + fundo) nos 3 min finais.
 * `serverNow` corrige a diferença entre o relógio do celular e o do servidor (E03).
 */
export function Countdown({ expiresAt, serverNow, label, onExpire }: { expiresAt: string; serverNow?: string; label: string; onExpire?: () => void }) {
  const offset = serverNow ? new Date(serverNow).getTime() - Date.now() : 0;
  const remaining = () => Math.max(0, Math.round((new Date(expiresAt).getTime() - (Date.now() + offset)) / 1000));
  const [sec, setSec] = useState(remaining);

  useEffect(() => {
    setSec(remaining());
    const id = setInterval(() => {
      const r = remaining();
      setSec(r);
      if (r === 0) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, serverNow]);

  const urgent = sec <= 180;
  return (
    <div className={`tw-countdown${urgent ? ' tw-countdown--urgent' : ''}`} role="timer" aria-live="off">
      <span className="tw-countdown__label">{label}</span>
      <span className="tw-countdown__value">{formatCountdown(sec)}</span>
      {urgent && <span className="tw-sr-only">Menos de 3 minutos</span>}
    </div>
  );
}
