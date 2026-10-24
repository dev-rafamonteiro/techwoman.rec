import { useEffect, useState } from 'react';
import { ENDPOINTS, MENTEE_STATUSES, PREFERRED_PERIODS, type E35Query, type E36Body, type MenteeAdminView, type MenteeStatus } from '@tw/shared';
import {
  AreaBadge, Button, CheckboxField, DataTable, ErrorState, Overlay, PriorityBadge, SelectField, SkeletonList, SlotSingleChoice, StatusBadge,
  TablePicker, TextField, call, callBlob, formatDateTime, formatTime, saveBlob, useQuery, useToast, PERIOD_LABELS, type Column,
} from '../../ui';
import { PageHead, errMsg, useAreas, useDebounced, useTitle } from './lib/common';

const STATUS_BADGE: Record<MenteeStatus, Parameters<typeof StatusBadge>[0]['status']> = {
  waiting: 'waiting', invited: 'invited', confirmed: 'confirmed', done: 'done', no_show: 'no_show', cancelled: 'cancelled',
};

/** A4 · Participantes (E35, E36, E37, E39). */
export default function A4Participantes() {
  useTitle('Participantes');
  const toast = useToast();
  const { areas, label: areaLabel } = useAreas();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [area, setArea] = useState('');
  const [period, setPeriod] = useState('');
  const [priority, setPriority] = useState(false);
  const dq = useDebounced(q);

  const filters = (): Omit<E35Query, 'cursor'> => ({
    q: dq || undefined, status: (status || undefined) as MenteeStatus | undefined, area: area || undefined,
    period: (period || undefined) as (typeof PREFERRED_PERIODS)[number] | undefined, priority: priority ? 'true' : undefined,
  });
  const first = useQuery((signal) => call(ENDPOINTS.E35, { query: filters(), signal }), [dq, status, area, period, priority]);
  const [extra, setExtra] = useState<MenteeAdminView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => { setExtra([]); setCursor(first.status === 'success' ? first.data.nextCursor : null); }, [first.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const r = await call(ENDPOINTS.E35, { query: { ...filters(), cursor } });
      setExtra((e) => [...e, ...r.items]);
      setCursor(r.nextCursor);
    } catch (e) { toast.error(errMsg(e)); } finally { setLoadingMore(false); }
  };

  const [openId, setOpenId] = useState<string | null>(null);
  const reloadAll = async () => { await first.refetch(); };

  const exportCsv = async () => {
    try {
      const blob = await callBlob(ENDPOINTS.E37, { query: filters() });
      saveBlob(blob, 'participantes.csv');
    } catch (e) { toast.error(errMsg(e)); }
  };

  const columns: Column<MenteeAdminView>[] = [
    { key: 'name', header: 'Nome', render: (m) => <strong>{m.name}</strong>, text: (m) => m.name },
    { key: 'email', header: 'E-mail', render: (m) => m.email, text: (m) => m.email },
    { key: 'phone', header: 'WhatsApp', render: (m) => m.phone ?? '—', text: (m) => m.phone ?? '' },
    { key: 'area', header: 'Área', render: (m) => <AreaBadge label={areaLabel(m.area)} />, text: (m) => areaLabel(m.area) },
    { key: 'period', header: 'Período', render: (m) => PERIOD_LABELS[m.preferredPeriod], text: (m) => PERIOD_LABELS[m.preferredPeriod] },
    { key: 'status', header: 'Status', render: (m) => <StatusBadge status={STATUS_BADGE[m.status]} />, text: (m) => m.status },
    { key: 'prio', header: 'Prioridade', render: (m) => (m.priority ? <PriorityBadge /> : '—'), text: (m) => (m.priority ? 'Sim' : 'Não') },
    { key: 'mentor', header: 'Mentora', render: (m) => m.mentorName ?? '—', text: (m) => m.mentorName ?? '' },
    { key: 'table', header: 'Mesa', render: (m) => (m.table ? m.table.number : '—'), text: (m) => m.table?.number ?? '' },
    { key: 'slot', header: 'Horário', render: (m) => (m.slot ? formatTime(m.slot.startAt) : '—'), text: (m) => (m.slot ? formatTime(m.slot.startAt) : '') },
    { key: 'at', header: 'Inscrita em', render: (m) => formatDateTime(m.createdAt), text: (m) => m.createdAt },
  ];

  const toolbar = (
    <>
      <div className="tw-toolbar__grow"><TextField label="Buscar" placeholder="Nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Todos</option>
        {MENTEE_STATUSES.map((s) => <option key={s} value={s}>{s === 'waiting' ? 'Aguardando' : s === 'invited' ? 'Horário proposto' : s === 'confirmed' ? 'Confirmada' : s === 'done' ? 'Concluída' : s === 'no_show' ? 'Não compareceu' : 'Cancelada'}</option>)}
      </SelectField>
      <SelectField label="Área" value={area} onChange={(e) => setArea(e.target.value)}>
        <option value="">Todas</option>{areas.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
      </SelectField>
      <SelectField label="Período" value={period} onChange={(e) => setPeriod(e.target.value)}>
        <option value="">Todos</option>{PREFERRED_PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
      </SelectField>
      <CheckboxField label="Só prioridade" checked={priority} onChange={(e) => setPriority(e.target.checked)} />
    </>
  );

  const rows = first.status === 'success' ? [...first.data.items, ...extra] : [];
  return (
    <div className="tw-page">
      <PageHead title="Participantes" />
      {first.status === 'loading' && <SkeletonList rows={5} height={56} />}
      {first.status === 'error' && <ErrorState error={first.error} onRetry={first.reload} />}
      {first.status === 'success' && (
        <div className="tw-stack">
          <DataTable caption="Lista de participantes" columns={columns} rows={rows} rowKey={(m) => m.id} filters={toolbar} onRowClick={(m) => setOpenId(m.id)}
            onExport={exportCsv} emptyTitle="Nenhuma participante encontrada" emptyText="Limpe os filtros ou aguarde novas inscrições." />
          {cursor && <Button variant="secondary" loading={loadingMore} onClick={() => void more()}>Carregar mais</Button>}
        </div>
      )}
      <Detail id={openId} onClose={() => setOpenId(null)} onChanged={reloadAll} areaLabel={areaLabel} />
    </div>
  );
}

function Detail({ id, onClose, onChanged, areaLabel }: { id: string | null; onClose: () => void; onChanged: () => Promise<void>; areaLabel: (k: string) => string }) {
  const toast = useToast();
  const d = useQuery(async (s) => (id ? call(ENDPOINTS.E35Detail, { params: { id }, signal: s }) : null), [id]);
  const [busy, setBusy] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const act = async (body: E36Body, ok: string) => {
    if (!id) return;
    setBusy(true);
    try {
      await call(ENDPOINTS.E36, { params: { id }, body });
      toast.success(ok);
      await Promise.all([onChanged(), d.refetch()]);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const m = d.status === 'success' && d.data ? d.data.mentee : null;
  return (
    <>
      <Overlay title={m?.name ?? 'Participante'} open={!!id} onClose={onClose} side>
        {d.status === 'loading' && <SkeletonList rows={3} height={70} />}
        {d.status === 'error' && <ErrorState error={d.error} onRetry={d.reload} />}
        {m && d.status === 'success' && d.data && (
          <div className="tw-stack" data-testid="mentee-panel">
            <div className="tw-row"><StatusBadge status={STATUS_BADGE[m.status]} />{m.priority && <PriorityBadge />}</div>
            <dl className="adm-dl">
              <dt>E-mail</dt><dd>{m.email}</dd>
              <dt>WhatsApp</dt><dd>{m.phone ?? '—'}</dd>
              <dt>LinkedIn</dt><dd>{m.linkedin ?? '—'}</dd>
              <dt>Área</dt><dd>{areaLabel(m.area)}</dd>
              <dt>Período</dt><dd>{PERIOD_LABELS[m.preferredPeriod]}</dd>
              <dt>Recado</dt><dd>{m.note ?? '—'}</dd>
              <dt>Mentora</dt><dd>{m.mentorName ?? '—'}</dd>
              <dt>Mesa e horário</dt><dd>{m.table && m.slot ? `Mesa ${m.table.number} às ${formatTime(m.slot.startAt)}` : '—'}</dd>
              <dt>Consentimento</dt><dd>{m.consent ? `${m.consent.version} em ${formatDateTime(m.consent.acceptedAt)}` : '—'}</dd>
            </dl>
            <div className="tw-row">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act({ action: 'set_priority', priority: !m.priority }, m.priority ? 'Prioridade removida.' : 'Prioridade marcada.')}>{m.priority ? 'Desmarcar prioridade' : 'Marcar prioridade'}</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act({ action: 'resend_link' }, 'Link pessoal reenviado.')}>Reenviar link pessoal</Button>
              {m.status === 'waiting' && <Button size="sm" disabled={busy} onClick={() => setScheduling(true)}>Agendar manualmente</Button>}
              {m.status !== 'cancelled' && m.status !== 'done' && (
                <Button size="sm" variant="danger" disabled={busy} onClick={() => { if (window.confirm(`Cancelar a inscrição de ${m.name}?`)) void act({ action: 'cancel' }, 'Inscrição cancelada.'); }}>Cancelar inscrição</Button>
              )}
            </div>
            <section><h3>Linha do tempo</h3>
              {d.data.timeline.length === 0 ? <p>Sem eventos ainda.</p> : (
                <ul className="adm-list">{d.data.timeline.map((t, i) => <li key={i}><span>{t.label}</span><span>{formatDateTime(t.at)}</span></li>)}</ul>
              )}
            </section>
            <section><h3>Notificações enviadas</h3>
              {d.data.notifications.length === 0 ? <p>Nenhuma notificação.</p> : (
                <ul className="adm-list">{d.data.notifications.map((n) => <li key={n.id}><span>{n.type} · {n.channel === 'email' ? 'e-mail' : 'WhatsApp'}</span><span>{n.status} ({n.attempts}) · {formatDateTime(n.at)}</span></li>)}</ul>
              )}
            </section>
          </div>
        )}
      </Overlay>
      {m && <ManualSchedule open={scheduling} mentee={m} onClose={() => setScheduling(false)} onDone={async () => { setScheduling(false); await Promise.all([onChanged(), d.refetch()]); }} />}
    </>
  );
}

/** Agendar manualmente (E39): mesmo fluxo de M5, com escolha da mentora. */
function ManualSchedule({ open, mentee, onClose, onDone }: { open: boolean; mentee: MenteeAdminView; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast();
  const mentors = useQuery((s) => call(ENDPOINTS.E31List, { query: { status: 'active' }, signal: s }), []);
  const sched = useQuery((s) => call(ENDPOINTS.E38, { signal: s }), [open]);
  const [mentorId, setMentorId] = useState('');
  const [slotId, setSlotId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [ignore, setIgnore] = useState(false);
  const [saving, setSaving] = useState(false);

  const busyIds = (sid: string | null) => new Set(sched.status === 'success' ? sched.data.appointments.filter((a) => a.slotId === sid && ['invited', 'confirmed', 'in_progress'].includes(a.status)).map((a) => a.table.id) : []);
  const mentorBusy = (sid: string) => sched.status === 'success' && sched.data.appointments.some((a) => a.slotId === sid && a.mentor.id === mentorId && ['invited', 'confirmed', 'in_progress'].includes(a.status));
  const mentor = mentors.status === 'success' ? mentors.data.items.find((m) => m.id === mentorId) : undefined;

  const submit = async () => {
    if (!slotId || !tableId || !mentorId) return;
    setSaving(true);
    try {
      const r = await call(ENDPOINTS.E39Create, { body: { menteeId: mentee.id, mentorId, slotId, tableId, ignoreAvailability: ignore, ignoreLeadTime: ignore } });
      toast.success(r.warnings.length ? 'Agendada, com avisos de disponibilidade ou antecedência.' : 'Mentoria agendada.');
      await onDone();
    } catch (e) { toast.error(errMsg(e)); await sched.refetch(); } finally { setSaving(false); }
  };

  return (
    <Overlay title={`Agendar ${mentee.name}`} open={open} onClose={onClose}>
      {(mentors.status === 'loading' || sched.status === 'loading') && <SkeletonList rows={2} height={60} />}
      {mentors.status === 'error' && <ErrorState error={mentors.error} onRetry={mentors.reload} />}
      {sched.status === 'error' && <ErrorState error={sched.error} onRetry={sched.reload} />}
      {mentors.status === 'success' && sched.status === 'success' && (
        <div className="tw-stack" data-testid="manual-schedule">
          <SelectField label="Mentora" value={mentorId} onChange={(e) => { setMentorId(e.target.value); setSlotId(null); setTableId(null); }}>
            <option value="">Escolha…</option>
            {mentors.data.items.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </SelectField>
          {mentorId && (
            <SlotSingleChoice legend="Horário" value={slotId} onChange={(s) => { setSlotId(s); setTableId(null); }}
              slots={sched.data.slots.filter((s) => !mentorBusy(s.id)).map((s) => ({ id: s.id, label: formatTime(s.startAt), caption: mentor?.availability.includes(s.id) ? 'Disponível' : 'Fora da disponibilidade' }))} />
          )}
          {slotId && (
            <TablePicker value={tableId} onChange={setTableId}
              tables={sched.data.tables.filter((t) => t.active).map((t) => ({ id: t.id, number: t.number, name: t.name, location: t.location, busy: busyIds(slotId).has(t.id) }))} />
          )}
          <CheckboxField label="Ignorar disponibilidade e antecedência mínima" checked={ignore} onChange={(e) => setIgnore(e.target.checked)} />
          <Button disabled={!mentorId || !slotId || !tableId} loading={saving} onClick={() => void submit()}>Agendar</Button>
        </div>
      )}
    </Overlay>
  );
}
