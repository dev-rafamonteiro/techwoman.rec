import { useEffect, useRef, useState } from 'react';
import { ENDPOINTS, type E43PatchBody, type UserView } from '@tw/shared';
import { ApiError, CheckboxField, DataTable, ErrorState, SecretReveal, SelectField, SkeletonList, TextField, call, formatDateTime, useAuth, useQuery, useToast, type Column } from '../../ui';
import { PageHead, errMsg, useTitle } from './lib/common';
import './lib/a7-a9.css';

const roleLabel = (u: UserView) => (u.roles.includes('super_admin') ? 'Super admin' : 'Admin');

/** A8 · Administradores (E43, só super admin; invariante do último super admin). */
export default function A8Administradores() {
  useTitle('Administradores');
  const toast = useToast();
  const { user: me } = useAuth();
  const q = useQuery((s) => call(ENDPOINTS.E43List, { signal: s }), []);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ title: string; password: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastSuper, setLastSuper] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'admin' as 'admin' | 'super_admin', sendPasswordByEmail: true });
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const secretRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (secret) secretRef.current?.focus(); }, [secret]);
  useEffect(() => { if (creating) formRef.current?.querySelector('input')?.focus(); }, [creating]);

  const patch = async (u: UserView, body: E43PatchBody, ok: string) => {
    setBusy(u.id);
    setLastSuper(false);
    try {
      const r = await call(ENDPOINTS.E43Patch, { params: { id: u.id }, body });
      if (r.provisionalPassword) setSecret({ title: `Nova senha de ${u.name}`, password: r.provisionalPassword });
      else toast.success(ok);
      await q.refetch();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'LAST_SUPER_ADMIN') setLastSuper(true);
      else toast.error(errMsg(e));
    } finally { setBusy(null); }
  };

  const create = async () => {
    setFormErr('');
    if (form.name.trim().length < 2) return setFormErr('Informe o nome.');
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setFormErr('Informe um e-mail válido.');
    setSaving(true);
    try {
      const r = await call(ENDPOINTS.E43Create, { body: { name: form.name.trim(), email: form.email.trim(), roles: [form.role], sendPasswordByEmail: form.sendPasswordByEmail } });
      setCreating(false);
      setForm({ name: '', email: '', role: 'admin', sendPasswordByEmail: true });
      setSecret({ title: `Senha de ${r.user.name}`, password: r.provisionalPassword });
      await q.refetch();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_TAKEN') setFormErr('Já existe uma conta com este e-mail.'); else setFormErr(errMsg(e));
    } finally { setSaving(false); }
  };

  const columns: Column<UserView>[] = [
    { key: 'name', header: 'Nome', render: (u) => <>{u.name}{u.id === me?.id && <> <span className="a8-you">(você)</span></>}</>, text: (u) => u.name },
    { key: 'email', header: 'E-mail', render: (u) => <span className="a79-muted">{u.email}</span>, text: (u) => u.email },
    {
      key: 'role', header: 'Papel', text: roleLabel,
      render: (u) => {
        const self = u.id === me?.id;
        const isSuper = u.roles.includes('super_admin');
        const lockedSelf = self && isSuper;
        return (
          <>
            <label className="a79-sr" htmlFor={`a8-role-${u.id}`}>Papel de {u.name}</label>
            <select id={`a8-role-${u.id}`} className="a8-role" value={isSuper ? 'super_admin' : 'admin'} disabled={busy === u.id || lockedSelf}
              title={lockedSelf ? 'Você não pode remover o próprio papel.' : undefined}
              onChange={(e) => {
                const next = e.target.value as 'admin' | 'super_admin';
                if (window.confirm(`Trocar o papel de ${u.name} para ${next === 'super_admin' ? 'Super admin' : 'Admin'}?`)) void patch(u, { roles: [next] }, 'Papel atualizado.');
              }}>
              <option value="admin">Admin</option><option value="super_admin">Super admin</option>
            </select>
          </>
        );
      },
    },
    { key: 'last', header: 'Último acesso', render: (u) => <span className="a79-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}</span>, text: (u) => u.lastLoginAt ?? '' },
    { key: 'status', header: 'Status', render: (u) => <span className={`a79-pill ${u.status === 'active' ? 'a79-pill--m' : 'a79-pill--r'}`}>{u.status === 'active' ? 'Ativo' : 'Desativado'}</span>, text: (u) => (u.status === 'active' ? 'Ativo' : 'Desativado') },
    {
      key: 'actions', header: 'Ações',
      render: (u) => {
        const self = u.id === me?.id;
        const active = u.status === 'active';
        return (
          <div className="a8-acts">
            <button type="button" className="a79-txtbtn" disabled={busy === u.id} onClick={() => { if (window.confirm(`Redefinir a senha de ${u.name}?`)) void patch(u, { resetPassword: true }, ''); }}>Redefinir senha</button>
            <button type="button" className={`a79-txtbtn ${active ? 'a79-txtbtn--r' : 'a79-txtbtn--m'}`} disabled={busy === u.id || (self && active)} title={self && active ? 'Você não pode desativar a própria conta.' : undefined}
              onClick={() => void patch(u, { status: active ? 'disabled' : 'active' }, active ? 'Usuário desativado.' : 'Usuário reativado.')}>{active ? 'Desativar' : 'Ativar'}</button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="tw-page tw-stack a79 a8">
      <PageHead title="Administradores" sub="Admin opera o dia do evento. Super admin também configura evento, mesas e acessos.">
        <button type="button" className="a79-btn a79-btn--o" aria-expanded={creating} aria-controls="a8-novo" onClick={() => { setCreating((v) => !v); setFormErr(''); }}>+ Novo administrador</button>
      </PageHead>

      {creating && (
        <form id="a8-novo" ref={formRef} className="a8-form" aria-label="Novo administrador" noValidate onSubmit={(e) => { e.preventDefault(); void create(); }}>
          {formErr && <div className="a79-alert" role="alert">{formErr}</div>}
          <div className="a8-f1">
            <TextField label="Nome" value={form.name} autoComplete="off" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="a8-f2">
            <TextField label="E-mail (login)" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="a8-f3">
            <SelectField label="Papel" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'super_admin' })}>
              <option value="admin">Admin</option><option value="super_admin">Super admin</option>
            </SelectField>
          </div>
          <div className="a8-form__check"><CheckboxField label="Enviar a senha provisória por e-mail ao salvar" checked={form.sendPasswordByEmail} onChange={(e) => setForm({ ...form, sendPasswordByEmail: e.target.checked })} /></div>
          <button type="submit" className="a79-btn a79-btn--p" disabled={saving} aria-busy={saving || undefined}>{saving && <span className="tw-spinner" aria-hidden="true" />}Criar e gerar senha</button>
        </form>
      )}

      {secret && (
        <div className="a8-secret" role="alertdialog" aria-labelledby="a8-secret-title" ref={secretRef} tabIndex={-1}>
          <div className="a8-secret__head">
            <strong id="a8-secret-title">{secret.title}</strong>
            <button type="button" className="a8-secret__x" aria-label="Fechar" onClick={() => setSecret(null)}>×</button>
          </div>
          <SecretReveal secret={secret.password} />
        </div>
      )}

      {lastSuper && <div className="a79-alert" role="alert" data-testid="last-super-admin">Precisa existir pelo menos um super admin ativo. Promova outra pessoa antes de fazer esta alteração.</div>}
      {q.status === 'loading' && <SkeletonList rows={4} height={56} />}
      {q.status === 'error' && <ErrorState error={q.error} onRetry={q.reload} />}
      {q.status === 'success' && <DataTable caption="Administradores" columns={columns} rows={q.data.items} rowKey={(u) => u.id} exportName="administradores.csv" emptyTitle="Nenhum administrador" emptyText="Crie o primeiro com “Novo administrador”." />}
      <span className="a79-hint">Regras: ninguém remove o próprio papel de super admin, e o último super admin ativo não pode ser desativado.</span>
    </div>
  );
}
