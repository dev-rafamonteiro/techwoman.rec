import { Suspense, lazy, type ComponentType } from 'react';
import { Navigate, Outlet, useParams, type RouteObject } from 'react-router-dom';
import { NotFoundState } from '../ui/components/States';
import { SkeletonList } from '../ui/components/States';
import { RequireRole } from './auth';
const Gallery = lazy(() => import('../ui/Gallery'));
import { AdminLayout, BareLayout, MentorLayout, ParticipantLayout } from './layouts';

/**
 * Páginas: src/web/pages/<area>/<codigo>*.tsx com `export default` do componente.
 * Convenção de nome (o roteador procura por prefixo): public/P1*.tsx, public/P2*.tsx, public/P3*.tsx, public/P4*.tsx, public/P5*.tsx,
 * public/P6*.tsx, mentora/M1*.tsx … mentora/M4*.tsx, mentora/M6*.tsx, admin/A1*.tsx … admin/A9*.tsx.
 * A3 tem 3 rotas: A3Form*.tsx (nova e :id) e A3Import*.tsx (importar). M5 é gaveta de M4 (componente, não rota).
 * Tela ainda sem arquivo mostra um aviso "em construção" (não quebra o build).
 */
const modules = import.meta.glob<{ default: ComponentType }>('../pages/**/*.tsx');

function Missing({ code }: { code: string }) {
  return <div className="tw-page"><h1 className="tw-state__title">Tela {code} em construção</h1></div>;
}

const cache = new Map<string, ComponentType>();
export function page(area: 'public' | 'mentora' | 'admin', code: string): ComponentType {
  const key = `${area}/${code}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const path = Object.keys(modules).find((p) => {
    const rest = p.replace(`../pages/${area}/`, '');
    return p.startsWith(`../pages/${area}/`) && rest.startsWith(code) && !/^[0-9]/.test(rest.slice(code.length));
  });
  const C = path
    ? lazy(modules[path] as () => Promise<{ default: ComponentType }>)
    : () => <Missing code={code} />;
  const Wrapped: ComponentType = () => (
    <Suspense fallback={<div style={{ padding: 16 }}><SkeletonList rows={3} /></div>}><C /></Suspense>
  );
  cache.set(key, Wrapped);
  return Wrapped;
}

const el = (area: 'public' | 'mentora' | 'admin', code: string) => {
  const C = page(area, code);
  return <C />;
};

const STAFF: readonly ('mentor' | 'admin' | 'super_admin')[] = ['admin', 'super_admin'];
const guard = (roles: readonly ('mentor' | 'admin' | 'super_admin')[], child: JSX.Element) => <RequireRole roles={roles}>{child}</RequireRole>;

/** /mentoria/minha?t=<token> com o layout participante. */
export const routes: RouteObject[] = [
  { element: <BareLayout />, children: [
    { path: '/', element: el('public', 'P1') },
    { path: '/jornada', element: el('public', 'P2') },
    { path: '/jornada/resultado', element: el('public', 'P3') },
    // QR Code do cartaz aponta para techwoman.dev/cadastro: leva à jornada (QR → gamificação → resultado → inscrição).
    { path: '/cadastro', element: <Navigate to="/jornada" replace /> },
  ] },
  { element: <ParticipantLayout title="Mentoria · 14/11" />, children: [
    { path: '/mentoria/inscricao', element: el('public', 'P4') },
    { path: '/mentoria/inscricao/ok', element: el('public', 'P5') },
  ] },
  { element: <ParticipantLayout title="Privacidade" />, children: [
    // Aviso de privacidade (LGPD), linkado em P4. Arquivo: pages/public/Privacidade*.tsx.
    { path: '/privacidade', element: el('public', 'Privacidade') },
  ] },
  { element: <ParticipantLayout title="Minha mentoria" />, children: [
    { path: '/mentoria/minha', element: el('public', 'P6') },
  ] },
  { element: <ParticipantLayout title="Entrar" />, children: [
    { path: '/entrar', element: el('mentora', 'M1') },
    { path: '/entrar/nova-senha', element: <RequireRole allowPasswordChange>{el('mentora', 'M2')}</RequireRole> },
  ] },
  { element: <RequireRole roles={['mentor']}><MentorLayout /></RequireRole>, children: [
    { path: '/mentora', element: <Navigate to="/mentora/aguardando" replace /> },
    { path: '/mentora/aguardando', element: el('mentora', 'M4') },
    { path: '/mentora/agenda', element: el('mentora', 'M6') },
    { path: '/mentora/disponibilidade', element: el('mentora', 'M3') },
  ] },
  { element: <RequireRole roles={STAFF}><AdminLayout /></RequireRole>, children: [
    { path: '/admin', element: el('admin', 'A1') },
    { path: '/admin/mentoras', element: el('admin', 'A2') },
    { path: '/admin/mentoras/nova', element: el('admin', 'A3Form') },
    { path: '/admin/mentoras/importar', element: el('admin', 'A3Import') },
    { path: '/admin/mentoras/:id', element: el('admin', 'A3Form') },
    { path: '/admin/participantes', element: el('admin', 'A4') },
    { path: '/admin/mapa', element: el('admin', 'A5') },
    { path: '/admin/mesas', element: guard(['super_admin'], el('admin', 'A6')) },
    { path: '/admin/evento', element: guard(['super_admin'], el('admin', 'A7')) },
    { path: '/admin/usuarios', element: guard(['super_admin'], el('admin', 'A8')) },
    { path: '/admin/logs', element: el('admin', 'A9') },
  ] },
  ...(import.meta.env.DEV ? [{ path: '/_ui', element: <Suspense fallback={null}><Gallery /></Suspense> }] : []),
  { path: '*', element: <div className="tw-page"><NotFoundState /></div> },
];

/** Para as páginas lerem `:id` de A3 sem importar o router. */
export function useRouteId(): string | undefined {
  return useParams<{ id: string }>().id;
}
export { Outlet };
