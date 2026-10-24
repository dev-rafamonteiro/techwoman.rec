import { useState } from 'react';
import { ENDPOINTS, type E43PatchBody, type UserView } from '@tw/shared';
import { ApiError, Button, CheckboxField, DataTable, ErrorState, Overlay, SecretReveal, SelectField, SkeletonList, TextField, call, formatDateTime, useAuth, useQuery, useToast, type Column } from '../../ui';
import { PageHead, errMsg, useTitle } from './lib/common';

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
    { key: 'name', header: 'Nome', render: (u) => <strong>{u.name}{u.id === me?.id ? ' (você)' : ''}</strong>, text: (u) => u.name },
    { key: 'email', header: 'E-mail', render: (u) => u.email, text: (u) => u.email },
    { key: 'role', header: 'Papel', render: (u) => roleLabel(u), text: roleLabel },
    { key: 'status', header: 'Status', render: (u) => (u.status === 'active' ? 'Ativo' : 'Desativado'), text: (u) => u.status },
    { key: 'last', header: 'Último acesso', render: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'), text: (u) => u.lastLoginAt ?? '' },
    {
      key: 'actions', header: 'Ações',
      render: (u) => {
        const self = u.id === me?.id;
        const isSuper = u.roles.includes('super_admin');
        return (
          <div className="tw-row">
            <Button size="sm" variant="secondary" disabled={busy === u.id || (self && isSuper)} title={self && isSuper ? 'Você não pode remover o próprio papel.' : undefined}
              onClick={() => { if (window.confirm(`Trocar o papel de ${u.name} para ${isSuper ? 'Admin' : 'Super admin'}?`)) void patch(u, { roles: [isSuper ? 'admin' : 'super_admin'] }, 'Papel atualizado.'); }}>Trocar papel</Button>
            <Button size="sm" variant="secondary" disabled={busy === u.id} onClick={() => { if (window.confirm(`Redefinir a senha de ${u.name}?`)) void patch(u, { resetPassword: true }, ''); }}>Redefinir senha</Button>
            <Button size="sm" variant={u.status === 'active' ? 'danger' : 'mint'} disabled={busy === u.id || (self && u.status === 'active')}
              onClick={() => void patch(u, { status: u.status === 'active' ? 'disabled' : 'active' }, u.status === 'active' ? 'Usuário desativado.' : 'Usuário reativado.')}>{u.status === 'active' ? 'Desativar' : 'Ativar'}</Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="tw-page">
      <PageHead title="Administradores" sub="Só super admin."><Button onClick={() => setCreating(true)}>Novo administrador</Button></PageHead>
      {lastSuper && <div className="adm-note" role="alert" data-testid="last-super-admin">Precisa existir pelo menos um super admin ativo. Promova outra pessoa antes de fazer esta alteração.</div>}
      {q.status === 'loading' && <SkeletonList rows={4} height={56} />}
      {q.status === 'error' && <ErrorState error={q.error} onRetry={q.reload} />}
      {q.status === 'success' && <DataTable caption="Administradores" columns={columns} rows={q.data.items} rowKey={(u) => u.id} exportName="administradores.csv" emptyTitle="Nenhum administrador" emptyText="Crie o primeiro com “Novo administrador”." />}
      <Overlay title="Novo administrador" open={creating} onClose={() => setCreating(false)}>
        <div className="tw-stack">
          {formErr && <div className="adm-note" role="alert">{formErr}</div>}
          <TextField label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <SelectField label="Papel" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'super_admin' })}>
            <option value="admin">Admin</option><option value="super_admin">Super admin</option>
          </SelectField>
          <CheckboxField label="Enviar a senha provisória por e-mail ao salvar" checked={form.sendPasswordByEmail} onChange={(e) => setForm({ ...form, sendPasswordByEmail: e.target.checked })} />
          <Button loading={saving} onClick={() => void create()}>Criar</Button>
        </div>
      </Overlay>
      <Overlay title={secret?.title ?? 'Senha provisória'} open={!!secret} onClose={() => setSecret(null)}>
        {secret && <SecretReveal secret={secret.password} onDone={() => setSecret(null)} />}
      </Overlay>
    </div>
  );
}
