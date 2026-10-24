import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ENDPOINTS, type E10Body, type Role, type SessionUser } from '@tw/shared';
import { ApiError, call, onSessionExpired } from '../net/client';
import { NoPermission, SkeletonList } from '../ui/components/States';

interface AuthValue {
  /** null = sem sessão (ou ainda carregando; veja `loading`). */
  user: SessionUser | null;
  loading: boolean;
  hasRole: (...roles: Role[]) => boolean;
  /** Rota de retorno guardada quando a sessão expirou. */
  login: (body: E10Body) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<SessionUser | null>;
}

const Ctx = createContext<AuthValue | null>(null);

export const loginUrl = (next?: string) => (next && next !== '/' ? `/entrar?next=${encodeURIComponent(next)}` : '/entrar');

/** Só aceita rota de retorno interna (evita open redirect). */
export function safeNext(next: string | null | undefined): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      const { user: u } = await call(ENDPOINTS.E12);
      setUser(u);
      return u;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status === 401) setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Sessão expirada em qualquer chamada de staff: volta para M1 mantendo a rota de retorno.
  useEffect(() => onSessionExpired(() => {
    setUser(null);
    const here = window.location.pathname + window.location.search;
    if (!here.startsWith('/entrar')) navigate(loginUrl(here), { replace: true });
  }), [navigate]);

  const value = useMemo<AuthValue>(() => ({
    user,
    loading,
    hasRole: (...roles) => !!user && roles.some((r) => user.roles.includes(r)),
    login: async (body) => {
      const { user: u } = await call(ENDPOINTS.E10, { body });
      setUser(u);
      return u;
    },
    logout: async () => {
      try { await call(ENDPOINTS.E11); } finally { setUser(null); navigate('/entrar', { replace: true }); }
    },
    refresh,
  }), [user, loading, refresh, navigate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fora do AuthProvider');
  return v;
}

/**
 * Guarda de rota por papel (E12). Sem sessão: M1 com ?next=. Senha provisória: M2. Sem papel: "Você não tem acesso a esta área".
 * `roles` omitido = qualquer usuário logado.
 */
export function RequireRole({ roles, children, allowPasswordChange }: { roles?: readonly Role[]; children: ReactNode; allowPasswordChange?: boolean }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div style={{ padding: 16 }}><SkeletonList rows={3} /></div>;
  if (!user) return <Navigate to={loginUrl(loc.pathname + loc.search)} replace />;
  if (user.mustChangePassword && !allowPasswordChange) return <Navigate to="/entrar/nova-senha" replace />;
  if (roles && !roles.some((r) => user.roles.includes(r))) return <NoPermission homePath={user.homePath} />;
  return <>{children}</>;
}
