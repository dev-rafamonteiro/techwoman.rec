import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '@tw/shared';
import { Brand } from '../ui/components/Layout';
import { Overlay } from '../ui/components/Overlay';
import { useAuth } from './auth';

/** Participante (P4–P6): faixa de topo + coluna única de até 480 px (centralizada no desktop). */
export function ParticipantLayout({ title }: { title: string }) {
  return (
    <div className="tw-app tw-app--participant">
      <header className="tw-topbar">
        <Brand />
        <span className="tw-topbar__title">{title}</span>
      </header>
      <main className="tw-main"><Outlet /></main>
    </div>
  );
}

/** Páginas públicas que trazem o próprio cabeçalho (P1, P2, P3). */
export function BareLayout() {
  return <Outlet />;
}

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

const MENTOR_ITEMS = [
  { to: '/mentora/aguardando', label: 'Aguardando', icon: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M21 21v-2a4 4 0 0 0-3-3.9M17 3.1a4 4 0 0 1 0 7.8' },
  { to: '/mentora/agenda', label: 'Minha agenda', icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2' },
  { to: '/mentora/disponibilidade', label: 'Disponibilidade', icon: 'M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20' },
] as const;

/** Seletor "Painel admin / Área da mentora" para quem tem os dois papéis. */
function AreaSwitch({ current }: { current: 'admin' | 'mentor' }) {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  if (!(hasRole('mentor') && hasRole('admin', 'super_admin'))) return null;
  return (
    <select className="tw-areaswitch" aria-label="Trocar de área" value={current} onChange={(e) => navigate(e.target.value === 'admin' ? '/admin' : '/mentora/aguardando')}>
      <option value="admin">Painel admin</option>
      <option value="mentor">Área da mentora</option>
    </select>
  );
}

/** Mentora: barra inferior no celular (Aguardando · Minha agenda · Disponibilidade · Sair), navegação no topo em tablet/desktop. */
export function MentorLayout() {
  const { logout, user } = useAuth();
  return (
    <div className="tw-app tw-app--mentor">
      <header className="tw-topbar">
        <Brand to="/mentora/aguardando" />
        <nav className="tw-topnav" aria-label="Área da mentora">
          {MENTOR_ITEMS.map((i) => <NavLink key={i.to} to={i.to}>{i.label}</NavLink>)}
          <button type="button" onClick={() => void logout()}>Sair</button>
        </nav>
        <div className="tw-topbar__right">
          <AreaSwitch current="mentor" />
          {user && <span className="tw-topbar__title">{user.name.split(' ')[0]}</span>}
        </div>
      </header>
      <main className="tw-main"><Outlet /></main>
      <nav className="tw-tabbar" aria-label="Área da mentora">
        {MENTOR_ITEMS.map((i) => (
          <NavLink key={i.to} to={i.to} className="tw-tab"><Icon d={i.icon} />{i.label}</NavLink>
        ))}
        <button type="button" className="tw-tab" onClick={() => void logout()}><Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />Sair</button>
      </nav>
    </div>
  );
}

interface AdminItem { to: string; label: string; roles?: readonly Role[]; end?: boolean }
/** Menu do admin (UI-SPEC): itens sem permissão não aparecem. A6, A7 e A8 só para super admin. */
export const ADMIN_ITEMS: readonly AdminItem[] = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/participantes', label: 'Participantes' },
  { to: '/admin/mapa', label: 'Mapa de mesas' },
  { to: '/admin/mentoras', label: 'Mentoras' },
  { to: '/admin/mesas', label: 'Mesas', roles: ['super_admin'] },
  { to: '/admin/evento', label: 'Evento', roles: ['super_admin'] },
  { to: '/admin/usuarios', label: 'Administradores', roles: ['super_admin'] },
  { to: '/admin/logs', label: 'Logs' },
];

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const { hasRole, logout } = useAuth();
  const items = ADMIN_ITEMS.filter((i) => !i.roles || hasRole(...i.roles));
  return (
    <ul className="tw-navlist">
      {items.map((i) => (
        <li key={i.to}><NavLink to={i.to} end={i.end} onClick={onNavigate}>{i.label}</NavLink></li>
      ))}
      <li><button type="button" onClick={() => void logout()}>Sair</button></li>
    </ul>
  );
}

const ADMIN_TITLES: [string, string][] = [
  ['/admin/participantes', 'Participantes'], ['/admin/mapa', 'Mapa de mesas'], ['/admin/mentoras', 'Mentoras'], ['/admin/mesas', 'Mesas'],
  ['/admin/evento', 'Configurações do evento'], ['/admin/usuarios', 'Administradores'], ['/admin/logs', 'Notificações e auditoria'],
];

/** Admin: menu lateral (desktop) ou gaveta (tablet/celular), seletor de área e título da seção. */
export function AdminLayout(): ReactNode {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const title = ADMIN_TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'Dashboard';
  return (
    <div className="tw-admin">
      <aside className="tw-sidebar" aria-label="Menu do painel admin">
        <Brand to="/admin" />
        <nav aria-label="Painel admin"><AdminNav /></nav>
      </aside>
      <div className="tw-admin__col">
        <header className="tw-topbar">
          <div className="tw-topbar__right">
            <button type="button" className="tw-menubtn" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)}>☰</button>
            <Brand to="/admin" />
            <span className="tw-topbar__title">{title}</span>
          </div>
          <AreaSwitch current="admin" />
        </header>
        <main className="tw-main"><Outlet /></main>
      </div>
      <Overlay title="Menu" open={open} onClose={() => setOpen(false)} side>
        <nav className="tw-drawer-nav" aria-label="Painel admin"><AdminNav onNavigate={() => setOpen(false)} /></nav>
      </Overlay>
    </div>
  );
}
