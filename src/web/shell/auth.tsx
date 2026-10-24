import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ENDPOINTS, type E10Body, type Role, type SessionUser } from '@tw/shared';
import { ApiError, call, onPasswordChangeRequired, onSessionExpired } from '../net/client';
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

export const loginUrl = (next?: string) => {
  const n = safeNext(next);
  return n && n !== '/' ? `/entrar?next=${encodeURIComponent(n)}` : '/entrar';
};

/** Só aceita rota de retorno interna: começa com "/", sem "//", sem "\\", sem caracteres de controle nem esquema. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(next) || /^\/[a-z][a-z0-9+.-]*:/i.test(next)) return null;
  try {
    if (/[\\\u0000-\u001f]/.test(decodeURIComponent(next))) return null;
  } catch {
    return null;
  }
  return next;
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

  // Senha provisória exigida no meio do uso (sessão mudou): vai para M2 com a rota de retorno (?next=, validada).
  useEffect(() => onPasswordChangeRequired(() => {
    setUser((u) => (u ? { ...u, mustChangePassword: true } : u));
    const here = window.location.pathname + window.location.search;
    if (!here.startsWith('/entrar')) {
      const n = safeNext(here);
      navigate(n && n !== '/' ? `/entrar/nova-senha?next=${encodeURIComponent(n)}` : '/entrar/nova-senha', { replace: true });
    }
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
  if (user.mustChangePassword && !allowPasswordChange) return <Navigate to={loc.pathname === '/' ? '/entrar/nova-senha' : `/entrar/nova-senha?next=${encodeURIComponent(safeNext(loc.pathname + loc.search) ?? '/')}`} replace />;
  if (roles && !roles.some((r) => user.roles.includes(r))) return <NoPermission homePath={user.homePath} />;
  return <>{children}</>;
}
