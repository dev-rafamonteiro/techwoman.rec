import { useEffect, useState } from 'react';
import { ENDPOINTS, OUTBOX_CHANNELS, OUTBOX_STATUSES, OUTBOX_TYPES, type AuditEntryView, type OutboxItemView } from '@tw/shared';
import { DataTable, ErrorState, SkeletonList, call, formatDateTime, useQuery, useToast, type Column } from '../../ui';
import { PageHead, errMsg, useDebounced, useTitle } from './lib/common';
import './lib/a7-a9.css';

const STATUS_PT = { pending: 'Na fila', sending: 'Enviando', sent: 'Enviada', failed: 'Falhou', skipped: 'Ignorada' } as const;
/** Tons dos selos de status (design: na fila cinza, enviada menta, falhou vermelho). */
const STATUS_TONE = { pending: '', sending: 'a79-pill--l', sent: 'a79-pill--m', failed: 'a79-pill--r', skipped: 'a79-pill--g' } as const;
/** Tom do selo da ação de auditoria pelo código gravado (login cinza, convite laranja, cancelamento vermelho, override roxo, mentora lilás, aceite menta). */
function actionTone(a: string): string {
  if (/cancel|expire|no_show|decline|disable|anonymize/.test(a)) return 'a79-pill--r';
  if (/^appointment\.(move|move_to|updated)$|^move_cancel$|priority/.test(a)) return 'a79-pill--p';
  if (/invite/.test(a)) return 'a79-pill--o';
  if (/accept|confirm|start|finish|enable/.test(a)) return 'a79-pill--m';
  if (/^mentor\./.test(a)) return 'a79-pill--l';
  return '';
}
const ROLE_PT: Record<string, string> = { super_admin: 'Super admin', admin: 'Admin', mentor: 'Mentora', mentee: 'Participante', system: 'Sistema' };
const TYPE_PT = { registered: 'Inscrição recebida', invite: 'Convite', confirmed: 'Confirmação', reminder: 'Lembrete', expired: 'Convite expirado', cancelled: 'Cancelamento', moved: 'Mudança de horário', registration_cancelled: 'Inscrição cancelada', slot_released: 'Horário liberado', staff_password: 'Senha provisória', presence_confirmed: 'Presença confirmada', presence_cancelled: 'Presença: não poderá ir', presence_unclear: 'Presença: resposta não entendida', invite_closed: 'Convite: não está mais disponível', invite_decline_link: 'Convite: link para recusar', invite_unclear: 'Convite: resposta não entendida' } as const;

/** A9 · Notificações (E44) e Auditoria (E45). */
export default function A9NotificacoesAuditoria() {
  useTitle('Notificações e auditoria');
  const [tab, setTab] = useState<'notif' | 'audit'>('notif');
  // contagem de falhas para o selo da aba (E44 filtrado por status; "+" quando há mais páginas)
  const failed = useQuery((signal) => call(ENDPOINTS.E44List, { query: { status: 'failed' }, signal }), []);
  const failedN = failed.status === 'success' ? failed.data.items.length : 0;
  const failedLabel = failed.status === 'success' && failedN > 0 ? `${failedN}${failed.data.nextCursor ? '+' : ''} ${failedN === 1 && !failed.data.nextCursor ? 'falhou' : 'falharam'}` : '';
  const tabs = [['notif', 'Notificações'], ['audit', 'Auditoria']] as const;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tab === 'notif' ? 'audit' : 'notif';
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  return (
    <div className="tw-page tw-stack a79 a9">
      <PageHead title="Notificações e auditoria" sub="Envios de e-mail e WhatsApp e o registro de quem fez o quê." />
      <div className="a9-tabs" role="tablist" aria-label="Tipo de registro" onKeyDown={onKey}>
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`p-${k}`} tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}>
            {label}{k === 'notif' && failedLabel && <span className="a79-pill a79-pill--r">{failedLabel}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`p-${tab}`} aria-labelledby={`tab-${tab}`}>{tab === 'notif' ? <Notifications onRetried={() => void failed.refetch()} /> : <Audit />}</div>
    </div>
  );
}

function Notifications({ onRetried }: { onRetried: () => void }) {
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
    try { const r = await call(ENDPOINTS.E44Retry, { params: { id: i.id } }); setPatched((p) => ({ ...p, [i.id]: r.item })); toast.success('Reenvio na fila.'); onRetried(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };

  const columns: Column<OutboxItemView>[] = [
    { key: 'at', header: 'Horário', render: (i) => <span className="a9-when">{formatDateTime(i.createdAt)}</span>, text: (i) => i.createdAt },
    { key: 'channel', header: 'Canal', render: (i) => (i.channel === 'email' ? 'E-mail' : 'WhatsApp'), text: (i) => i.channel },
    { key: 'to', header: 'Destinatária', render: (i) => <strong>{i.to}</strong>, text: (i) => i.to },
    { key: 'type', header: 'Modelo', render: (i) => (i.type === 'staff_password' ? `${TYPE_PT[i.type]} · senha oculta` : TYPE_PT[i.type]), text: (i) => TYPE_PT[i.type] },
    { key: 'status', header: 'Status', render: (i) => <><span className={`a79-pill ${STATUS_TONE[i.status]}`} title={i.lastError ?? undefined}>{STATUS_PT[i.status]}</span>{i.lastError && <small>{i.lastError}</small>}</>, text: (i) => STATUS_PT[i.status] },
    { key: 'att', header: 'Tentativas', render: (i) => i.attempts, text: (i) => i.attempts },
    { key: 'act', header: 'Ação', render: (i) => (i.status === 'failed' ? <button type="button" className="a79-rowbtn" disabled={busy === i.id} aria-busy={busy === i.id || undefined} onClick={() => void retry(i)}>{busy === i.id && <span className="tw-spinner" aria-hidden="true" />}Reenviar</button> : null) },
  ];
  const filters = (
    <>
      <select className="a79-select" aria-label="Canal" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">Todos os canais</option>{OUTBOX_CHANNELS.map((c) => <option key={c} value={c}>{c === 'email' ? 'E-mail' : 'WhatsApp'}</option>)}</select>
      <select className="a79-select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos os status</option>{OUTBOX_STATUSES.map((s) => <option key={s} value={s}>{STATUS_PT[s]}</option>)}</select>
      <select className="a79-select" aria-label="Modelo" value={type} onChange={(e) => setType(e.target.value)}><option value="">Todos os modelos</option>{OUTBOX_TYPES.map((t) => <option key={t} value={t}>{TYPE_PT[t]}</option>)}</select>
    </>
  );
  if (first.status === 'loading') return <SkeletonList rows={5} height={56} />;
  if (first.status === 'error') return <ErrorState error={first.error} onRetry={first.reload} />;
  const rows = [...first.data.items, ...extra].map((i) => patched[i.id] ?? i);
  return (
    <div className="tw-stack">
      <DataTable caption="Notificações" columns={columns} rows={rows} rowKey={(i) => i.id} filters={filters} exportName="notificacoes.csv" emptyTitle="Nenhuma notificação" emptyText="Quando houver envios, eles aparecem aqui." />
      {cursor && <button type="button" className="a79-btn a79-btn--line a9-more" onClick={() => void more()}>Carregar mais</button>}
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
    { key: 'at', header: 'Quando', render: (a) => <span className="a9-when">{formatDateTime(a.at)}</span>, text: (a) => a.at },
    { key: 'who', header: 'Quem', render: (a) => <><strong>{a.actorName ?? 'Sistema'}</strong> <small>{ROLE_PT[a.actorRole] ?? a.actorRole}</small></>, text: (a) => a.actorName ?? 'Sistema' },
    { key: 'action', header: 'Ação', render: (a) => <span className={`a79-pill ${actionTone(a.action)}`}>{a.action}</span>, text: (a) => a.action },
    { key: 'entity', header: 'Detalhe', render: (a) => `${a.entity}${a.entityId ? ` · ${a.entityId}` : ''}`, text: (a) => a.entity },
  ];
  const filters = (
    <>
      <input type="search" className="a79-search" aria-label="Ação" placeholder="Ação (ex.: mentor.create)" value={action} onChange={(e) => setAction(e.target.value)} />
      <input type="search" className="a79-search" aria-label="ID do usuário" placeholder="ID do usuário" value={actorId} onChange={(e) => setActorId(e.target.value)} />
    </>
  );
  if (first.status === 'loading') return <SkeletonList rows={5} height={56} />;
  if (first.status === 'error') return <ErrorState error={first.error} onRetry={first.reload} />;
  return (
    <div className="tw-stack">
      <DataTable caption="Auditoria" columns={columns} rows={[...first.data.items, ...extra]} rowKey={(a) => a.id} filters={filters} exportName="auditoria.csv" emptyTitle="Nenhum registro" emptyText="Ajuste os filtros." />
      {cursor && <button type="button" className="a79-btn a79-btn--line a9-more" onClick={() => void more()}>Carregar mais</button>}
    </div>
  );
}
