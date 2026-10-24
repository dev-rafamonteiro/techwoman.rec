import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './client';

export type QueryState<T> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'error'; data: undefined; error: ApiError }
  | { status: 'success'; data: T; error: undefined };

/**
 * Carrega dados e expõe os estados obrigatórios (carregando, erro) para a tela.
 * `refetch` recarrega sem voltar ao esqueleto (mantém `data`).
 */
export function useQuery<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<QueryState<T>>({ status: 'loading', data: undefined, error: undefined });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const seq = useRef(0);

  const run = useCallback(async (silent: boolean) => {
    const my = ++seq.current;
    const ctrl = new AbortController();
    if (!silent) setState({ status: 'loading', data: undefined, error: undefined });
    try {
      const data = await fetcherRef.current(ctrl.signal);
      if (my === seq.current) setState({ status: 'success', data, error: undefined });
      return data;
    } catch (e) {
      if (my !== seq.current) return undefined;
      const err = e instanceof ApiError ? e : new ApiError(0, 'NETWORK', 'Sem conexão. Confira a internet e tente de novo.');
      // Atualização silenciosa que falha mantém os dados antigos na tela.
      setState((prev) => (silent && prev.status === 'success' ? prev : { status: 'error', data: undefined, error: err }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    void run(false);
    return () => {
      seq.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, refetch: () => run(true), reload: () => run(false) };
}
