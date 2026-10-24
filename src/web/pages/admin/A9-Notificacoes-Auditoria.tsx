import { useEffect, useState } from 'react';
import { ENDPOINTS, OUTBOX_CHANNELS, OUTBOX_STATUSES, OUTBOX_TYPES, type AuditEntryView, type OutboxItemView } from '@tw/shared';
import { Button, DataTable, ErrorState, SelectField, SkeletonList, TextField, call, formatDateTime, useQuery, useToast, type Column } from '../../ui';
import { PageHead, errMsg, useDebounced, useTitle } from './lib/common';

const STATUS_PT = { pending: 'Na fila', sending: 'Enviando', sent: 'Enviada', failed: 'Falhou', skipped: 'Ignorada' } as const;
const TYPE_PT = { registered: 'Inscrição recebida', invite: 'Convite', confirmed: 'Confirmação', reminder: 'Lembrete', expired: 'Convite expirado', cancelled: 'Cancelamento', moved: 'Mudança de horário', staff_password: 'Senha provisória' } as const;

/** A9 · Notificações (E44) e Auditoria (E45). */
export default function A9NotificacoesAuditoria() {
  useTitle('Notificações e auditoria');
  const [tab, setTab] = useState<'notif' | 'audit'>('notif');
  return (
    <div className="tw-page">
      <PageHead title="Notificações e auditoria" />
      <div className="adm-tabs" role="tablist">
        <button role="tab" id="tab-notif" aria-selected={tab === 'notif'} aria-controls="p-notif" onClick={() => setTab('notif')}>Notificações</button>
        <button role="tab" id="tab-audit" aria-selected={tab === 'audit'} aria-controls="p-audit" onClick={() => setTab('audit')}>Auditoria</button>
      </div>
      <div role="tabpanel" id={tab === 'notif' ? 'p-notif' : 'p-audit'} aria-labelledby={`tab-${tab}`}>{tab === 'notif' ? <Notifications /> : <Audit />}</div>
    </div>
  );
}

function Notifications() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [type, setType] = useState('');
  const first = useQuery((signal) => call(ENDPOINTS.E44List, { query: { status: (status || undefined) as OutboxItemView['status'] | undefined, channel: (channel || undefined) as OutboxItemView['channel'] | undefined, type: (type || undefined) as OutboxItemView['type'] | undefined }, signal }), [status, channel, type]);
  const [extra, setExtra] = useState<OutboxItemView[]>([]);
  const [patched, setPatched] = useState<Record<string, OutboxItemView>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { setExtra([]); setPatched({}); setCursor(first.status === 'success' ? first.data.nextCursor : null); }, [first.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = async () => {
    try {
      const r = await call(ENDPOINTS.E44List, { query: { status: (status || undefined) as OutboxItemView['status'] | undefined, channel: (channel || undefined) as OutboxItemView['channel'] | undefined, type: (type || undefined) as OutboxItemView['type'] | undefined, cursor: cursor! } });
      setExtra((x) => [...x, ...r.items]); setCursor(r.nextCursor);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const retry = async (i: OutboxItemView) => {
    setBusy(i.id);
    try { const r = await call(ENDPOINTS.E44Retry, { params: { id: i.id } }); setPatched((p) => ({ ...p, [i.id]: r.item })); toast.success('Reenvio na fila.'); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };

  const columns: Column<OutboxItemView>[] = [
    { key: 'channel', header: 'Canal', render: (i) => (i.channel === 'email' ? 'E-mail' : 'WhatsApp'), text: (i) => i.channel },
    { key: 'to', header: 'Destinatária', render: (i) => i.to, text: (i) => i.to },
    { key: 'type', header: 'Modelo', render: (i) => TYPE_PT[i.type], text: (i) => TYPE_PT[i.type] },
    { key: 'status', header: 'Status', render: (i) => <span title={i.lastError ?? undefined}>{STATUS_PT[i.status]}{i.lastError ? ` · ${i.lastError}` : ''}</span>, text: (i) => STATUS_PT[i.status] },
    { key: 'att', header: 'Tentativas', render: (i) => i.attempts, text: (i) => i.attempts },
    { key: 'at', header: 'Criada em', render: (i) => formatDateTime(i.createdAt), text: (i) => i.createdAt },
    { key: 'act', header: 'Ação', render: (i) => (i.status === 'failed' ? <Button size="sm" variant="secondary" loading={busy === i.id} onClick={() => void retry(i)}>Reenviar</Button> : null) },
  ];
  const filters = (
    <>
      <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos</option>{OUTBOX_STATUSES.map((s) => <option key={s} value={s}>{STATUS_PT[s]}</option>)}</SelectField>
      <SelectField label="Canal" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">Todos</option>{OUTBOX_CHANNELS.map((c) => <option key={c} value={c}>{c === 'email' ? 'E-mail' : 'WhatsApp'}</option>)}</SelectField>
      <SelectField label="Modelo" value={type} onChange={(e) => setType(e.target.value)}><option value="">Todos</option>{OUTBOX_TYPES.map((t) => <option key={t} value={t}>{TYPE_PT[t]}</option>)}</SelectField>
    </>
  );
  if (first.status === 'loading') return <SkeletonList rows={5} height={56} />;
  if (first.status === 'error') return <ErrorState error={first.error} onRetry={first.reload} />;
  const rows = [...first.data.items, ...extra].map((i) => patched[i.id] ?? i);
  return (
    <div className="tw-stack">
      <DataTable caption="Notificações" columns={columns} rows={rows} rowKey={(i) => i.id} filters={filters} exportName="notificacoes.csv" emptyTitle="Nenhuma notificação" emptyText="Quando houver envios, eles aparecem aqui." />
      {cursor && <Button variant="secondary" onClick={() => void more()}>Carregar mais</Button>}
    </div>
  );
}

function Audit() {
  const toast = useToast();
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const da = useDebounced(action), du = useDebounced(actorId);
  const first = useQuery((signal) => call(ENDPOINTS.E45, { query: { action: da || undefined, actorId: du || undefined }, signal }), [da, du]);
  const [extra, setExtra] = useState<AuditEntryView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  useEffect(() => { setExtra([]); setCursor(first.status === 'success' ? first.data.nextCursor : null); }, [first.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const more = async () => {
    try { const r = await call(ENDPOINTS.E45, { query: { action: da || undefined, actorId: du || undefined, cursor: cursor! } }); setExtra((x) => [...x, ...r.items]); setCursor(r.nextCursor); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const columns: Column<AuditEntryView>[] = [
    { key: 'at', header: 'Quando', render: (a) => formatDateTime(a.at), text: (a) => a.at },
    { key: 'who', header: 'Quem', render: (a) => `${a.actorName ?? 'Sistema'} (${a.actorRole})`, text: (a) => a.actorName ?? 'Sistema' },
    { key: 'action', header: 'Ação', render: (a) => a.action, text: (a) => a.action },
    { key: 'entity', header: 'Entidade', render: (a) => `${a.entity}${a.entityId ? ` · ${a.entityId}` : ''}`, text: (a) => a.entity },
  ];
  const filters = (
    <>
      <TextField label="Ação" placeholder="ex.: mentor.created" value={action} onChange={(e) => setAction(e.target.value)} />
      <TextField label="ID do usuário" value={actorId} onChange={(e) => setActorId(e.target.value)} />
    </>
  );
  if (first.status === 'loading') return <SkeletonList rows={5} height={56} />;
  if (first.status === 'error') return <ErrorState error={first.error} onRetry={first.reload} />;
  return (
    <div className="tw-stack">
      <DataTable caption="Auditoria" columns={columns} rows={[...first.data.items, ...extra]} rowKey={(a) => a.id} filters={filters} exportName="auditoria.csv" emptyTitle="Nenhum registro" emptyText="Ajuste os filtros." />
      {cursor && <Button variant="secondary" onClick={() => void more()}>Carregar mais</Button>}
    </div>
  );
}
