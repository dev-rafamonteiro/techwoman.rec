import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ENDPOINTS, MentorHasAppointmentsDetailsSchema, type MentorHasAppointmentsDetails, type MentorListItem } from '@tw/shared';
import { ApiError, Button, CheckboxField, DataTable, ErrorState, LinkButton, Overlay, SecretReveal, SelectField, SkeletonList, TextField, call, formatDateTime, formatTime, useQuery, useToast, type Column } from '../../ui';
import { PageHead, errMsg, useAreas, useDebounced, useTitle } from './lib/common';

type StatusFilter = '' | 'active' | 'disabled' | 'never_logged_in';

function statusOf(m: MentorListItem): { label: string; key: string } {
  if (m.status === 'disabled') return { label: 'Desativada', key: 'disabled' };
  if (m.neverLoggedIn) return { label: 'Nunca acessou', key: 'never' };
  return { label: 'Ativa', key: 'active' };
}

/** A2 · Mentoras (E31, E32, E34). */
export default function A2Mentoras() {
  useTitle('Mentoras');
  const toast = useToast();
  const { areas, label: areaLabel } = useAreas();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [area, setArea] = useState('');
  const dq = useDebounced(q);
  const list = useQuery(
    (signal) => call(ENDPOINTS.E31List, { query: { q: dq || undefined, status: status || undefined, area: area || undefined }, signal }),
    [dq, status, area],
  );
  const [secret, setSecret] = useState<{ name: string; id: string; password: string } | null>(null);
  const [realocar, setRealocar] = useState<{ name: string; details: MentorHasAppointmentsDetails } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<MentorListItem | null>(null);

  const toggle = async (m: MentorListItem) => {
    const next = m.status === 'active' ? 'disabled' : 'active';
    setBusy(m.id);
    try {
      await call(ENDPOINTS.E32, { params: { id: m.id }, body: { status: next } });
      toast.success(next === 'disabled' ? `${m.name} foi desativada.` : `${m.name} foi reativada.`);
      await list.refetch();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'MENTOR_HAS_APPOINTMENTS') {
        const parsed = MentorHasAppointmentsDetailsSchema.safeParse(e.details);
        setRealocar({ name: m.name, details: parsed.success ? parsed.data : { appointments: [] } });
      } else toast.error(errMsg(e));
    } finally { setBusy(null); }
  };

  const [resetFor, setResetFor] = useState<MentorListItem | null>(null);
  const [sendByEmail, setSendByEmail] = useState(true);
  const reset = async () => {
    const m = resetFor;
    if (!m) return;
    setBusy(m.id);
    try {
      const r = await call(ENDPOINTS.E34, { params: { id: m.id }, body: { sendByEmail } });
      setResetFor(null);
      if (sendByEmail) toast.success('Senha provisória enviada por e-mail.');
      setSecret({ name: m.name, id: m.id, password: r.provisionalPassword });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };

  const columns: Column<MentorListItem>[] = [
    { key: 'name', header: 'Nome', render: (m) => <strong>{m.name}</strong>, text: (m) => m.name },
    { key: 'email', header: 'E-mail', render: (m) => m.email, text: (m) => m.email },
    { key: 'org', header: 'Organização', render: (m) => m.organization ?? '—', text: (m) => m.organization ?? '' },
    { key: 'areas', header: 'Áreas', render: (m) => m.areas.map(areaLabel).join(', ') || '—', text: (m) => m.areas.map(areaLabel).join(', ') },
    { key: 'slots', header: 'Horários', render: (m) => m.availableSlots, text: (m) => m.availableSlots },
    { key: 'appts', header: 'Mentorias', render: (m) => `${m.confirmedCount}/${m.doneCount}`, text: (m) => `${m.confirmedCount}/${m.doneCount}` },
    { key: 'last', header: 'Último acesso', render: (m) => (m.lastLoginAt ? formatDateTime(m.lastLoginAt) : '—'), text: (m) => m.lastLoginAt ?? '' },
    { key: 'status', header: 'Status', render: (m) => <span data-testid={`status-${m.id}`}>{statusOf(m).label}</span>, text: (m) => statusOf(m).label },
    {
      key: 'actions', header: 'Ações',
      render: (m) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Button variant="secondary" size="sm" aria-haspopup="dialog" aria-label={`Ações de ${m.name}`} onClick={() => setMenuFor(m)}>Ações ⋯</Button>
        </div>
      ),
    },
  ];

  const filters = (
    <>
      <div className="tw-toolbar__grow"><TextField label="Buscar" placeholder="Nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
        <option value="">Todos</option><option value="active">Ativa</option><option value="disabled">Desativada</option><option value="never_logged_in">Nunca acessou</option>
      </SelectField>
      <SelectField label="Área" value={area} onChange={(e) => setArea(e.target.value)}>
        <option value="">Todas</option>
        {areas.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
      </SelectField>
    </>
  );

  return (
    <div className="tw-page">
      <PageHead title="Mentoras" sub="Organização é de uso interno e nunca aparece para a participante.">
        <LinkButton to="/admin/mentoras/importar" variant="secondary">Importar lista (CSV)</LinkButton>
        <LinkButton to="/admin/mentoras/nova">Nova mentora</LinkButton>
      </PageHead>
      {list.status === 'loading' && <SkeletonList rows={5} height={56} />}
      {list.status === 'error' && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.status === 'success' && (
        <DataTable
          caption="Lista de mentoras" columns={columns} rows={list.data.items} rowKey={(m) => m.id} filters={filters}
          exportName="mentoras.csv" emptyTitle="Nenhuma mentora encontrada" emptyText="Cadastre uma mentora ou importe a lista em CSV."
        />
      )}
      <Overlay title={menuFor?.name ?? 'Ações'} open={!!menuFor} onClose={() => setMenuFor(null)}>
        {menuFor && (
          <div className="tw-stack" style={{ gap: 8 }} data-testid="mentor-actions">
            <LinkButton to={`/admin/mentoras/${menuFor.id}`} variant="secondary" block>Editar</LinkButton>
            <Button variant="secondary" block onClick={() => { const m = menuFor; setMenuFor(null); setSendByEmail(true); setResetFor(m); }}>Redefinir senha</Button>
            <Button variant={menuFor.status === 'active' ? 'danger' : 'mint'} block onClick={() => { const m = menuFor; setMenuFor(null); void toggle(m); }}>{menuFor.status === 'active' ? 'Desativar' : 'Ativar'}</Button>
            <LinkButton to={`/admin/mapa?mentora=${menuFor.id}`} variant="ghost" block>Ver agenda</LinkButton>
          </div>
        )}
      </Overlay>
      <Overlay title="Redefinir senha" open={!!resetFor} onClose={() => setResetFor(null)}>
        <div className="tw-stack">
          <p>Redefinir a senha de {resetFor?.name}? A senha atual deixa de valer e as sessões são encerradas.</p>
          <CheckboxField label="Enviar a nova senha por e-mail" checked={sendByEmail} onChange={(e) => setSendByEmail(e.target.checked)} />
          <div className="tw-row"><Button loading={busy === resetFor?.id} onClick={() => void reset()}>Redefinir</Button><Button variant="ghost" onClick={() => setResetFor(null)}>Cancelar</Button></div>
        </div>
      </Overlay>
      <Overlay title={`Senha de ${secret?.name ?? ''}`} open={!!secret} onClose={() => setSecret(null)}>
        {secret && <SecretReveal secret={secret.password} onDone={() => setSecret(null)} />}
      </Overlay>
      <Overlay title="Realocar mentorias antes de desativar" open={!!realocar} onClose={() => setRealocar(null)}>
        {realocar && (
          <div className="tw-stack" data-testid="realocar-lista">
            <p>{realocar.name} tem mentorias futuras. Mova ou cancele cada uma no mapa de mesas e tente desativar de novo.</p>
            <ul className="adm-list">
              {realocar.details.appointments.map((a) => (
                <li key={a.id}><span>{formatTime(a.startAt)} · mesa {a.tableNumber}</span><span>{a.menteeName}</span></li>
              ))}
            </ul>
            <LinkButton to="/admin/mapa" onClick={() => setRealocar(null)}>Abrir mapa de mesas</LinkButton>
          </div>
        )}
      </Overlay>
    </div>
  );
}
