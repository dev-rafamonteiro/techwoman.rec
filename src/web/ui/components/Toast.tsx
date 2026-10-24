import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'conflict';
interface ToastItem { id: number; kind: ToastKind; message: string; actionLabel?: string; onAction?: () => void }

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  /** Conflito (409): mostra a ação "Atualizar" que recarrega os dados da tela. */
  conflict: (message: string, onRefresh: () => void) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((t: Omit<ToastItem, 'id'>, ttl: number) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    success: (m) => push({ kind: 'success', message: m }, 4000),
    error: (m) => push({ kind: 'error', message: m }, 7000),
    conflict: (m, onRefresh) => push({ kind: 'conflict', message: m, actionLabel: 'Atualizar', onAction: onRefresh }, 10000),
  }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="tw-toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`tw-toast tw-toast--${t.kind}`} role={t.kind === 'success' ? 'status' : 'alert'}>
            <span className="tw-toast__msg">{t.kind === 'success' ? 'Pronto: ' : t.kind === 'error' ? 'Erro: ' : 'Atenção: '}{t.message}</span>
            {t.actionLabel && (
              <button type="button" className="tw-toast__action" onClick={() => { t.onAction?.(); dismiss(t.id); }}>{t.actionLabel}</button>
            )}
            <button type="button" className="tw-toast__close" aria-label="Fechar aviso" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast fora do ToastProvider');
  return v;
}
