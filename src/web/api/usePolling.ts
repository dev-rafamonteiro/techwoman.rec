import { useEffect, useRef } from 'react';

/** Repete `fn` a cada `ms` e quando a aba volta ao foco (P6: 30 s; A1: 15 s). */
export function usePolling(fn: () => void | Promise<unknown>, ms: number, enabled = true): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const run = () => void Promise.resolve(ref.current()).catch(() => undefined);
    const id = setInterval(run, ms);
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', run);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', run);
    };
  }, [ms, enabled]);
}
