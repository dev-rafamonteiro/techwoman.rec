import { useEffect, useRef, useState } from 'react';
import { M5ScheduleDrawer } from '../mentora/M5ScheduleDrawer';
import { ENDPOINTS, type E23Response, MENTEE_STATUSES, PREFERRED_PERIODS, type E35Query, type E36Body, type MenteeAdminView, type MenteeStatus } from '@tw/shared';
import {
  Button, DataTable, ErrorState, PriorityBadge, SelectField, SkeletonList, STATUS_LOOK, StatusBadge,
  call, callBlob, formatDateTime, formatTime, saveBlob, useQuery, useToast, PERIOD_LABELS, maskPhone, type Column,
} from '../../ui';
import { PageHead, errMsg, useAreas, useDebounced, useTitle } from './lib/common';
import './lib/a4-a6.css';

const phoneFmt = (p: string | null) => (p ? maskPhone(p.replace(/^\+55/, '')) : '—');
const linkedinUrl = (v: string) => (/^https?:/i.test(v) ? v : v.includes('linkedin.com') ? `https://${v}` : `https://www.linkedin.com/in/${v}`);

const NOTIF_TYPE: Record<string, string> = { registered: 'Inscrição recebida', invite: 'Convite', confirmed: 'Confirmação', reminder: 'Lembrete', expired: 'Convite expirado', cancelled: 'Cancelamento', moved: 'Mudança de horário', staff_password: 'Senha provisória' };
/** Situação da notificação: texto e tom (design: verde enviada, vermelho falhou). */
const NOTIF_STATUS: Record<string, [string, string]> = { pending: ['Na fila', 'wait'], sending: ['Enviando', 'wait'], sent: ['Enviada', 'ok'], failed: ['Falhou', 'fail'], skipped: ['Ignorada', 'skip'] };

const STATUS_BADGE: Record<MenteeStatus, Parameters<typeof StatusBadge>[0]['status']> = {
  waiting: 'waiting', invited: 'invited', confirmed: 'confirmed', done: 'done', no_show: 'no_show', cancelled: 'cancelled',
};

/** A4 · Participantes (E35, E36, E37, E39). Visual: design/admin/A4-participantes.html. */
export default function A4Participantes() {
  useTitle('Participantes');
  const toast = useToast();
  const { areas, label: areaLabel } = useAreas();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [area, setArea] = useState('');
  const [period, setPeriod] = useState('');
  const [priority, setPriority] = useState('');
  const dq = useDebounced(q);

  const filters = (): Omit<E35Query, 'cursor'> => ({
    q: dq.trim().length >= 2 ? dq.trim() : undefined, status: (status || undefined) as MenteeStatus | undefined, area: area || undefined,
    period: (period || undefined) as (typeof PREFERRED_PERIODS)[number] | undefined, priority: priority === 'true' || priority === 'false' ? priority : undefined,
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

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await callBlob(ENDPOINTS.E37, { query: filters() });
      saveBlob(blob, 'participantes.csv');
    } catch (e) { toast.error(errMsg(e)); } finally { setExporting(false); }
  };

  const columns: Column<MenteeAdminView>[] = [
    { key: 'name', header: 'Nome', render: (m) => <span className={`a4-name${m.id === openId ? ' a4-name--sel' : ''}`}>{m.name}{m.priority && <PriorityBadge />}</span>, text: (m) => `${m.name}${m.priority ? ' (prioridade)' : ''}` },
    { key: 'email', header: 'E-mail', render: (m) => <span className="a4-muted">{m.email}</span>, text: (m) => m.email },
    { key: 'phone', header: 'WhatsApp', render: (m) => <span className="a4-nowrap">{phoneFmt(m.phone)}</span>, text: (m) => phoneFmt(m.phone) },
    { key: 'area', header: 'Área', render: (m) => areaLabel(m.area), text: (m) => areaLabel(m.area) },
    { key: 'period', header: 'Período', render: (m) => PERIOD_LABELS[m.preferredPeriod], text: (m) => PERIOD_LABELS[m.preferredPeriod] },
    { key: 'status', header: 'Status', render: (m) => <StatusBadge status={STATUS_BADGE[m.status]} />, text: (m) => STATUS_LOOK[m.status].label },
    { key: 'mentor', header: 'Mentora', render: (m) => m.mentorName ?? '—', text: (m) => m.mentorName ?? '' },
    { key: 'table', header: 'Mesa', render: (m) => (m.table ? m.table.number : '—'), text: (m) => m.table?.number ?? '' },
    { key: 'slot', header: 'Horário', render: (m) => (m.slot ? formatTime(m.slot.startAt) : '—'), text: (m) => (m.slot ? formatTime(m.slot.startAt) : '') },
    { key: 'at', header: 'Inscrita', render: (m) => <span className="a4-muted">{formatTime(m.createdAt)}</span>, text: (m) => m.createdAt },
  ];

  const rows = first.status === 'success' ? [...first.data.items, ...extra] : [];
  const sub = first.status === 'success' ? `${rows.length}${cursor ? '+' : ''} ${rows.length === 1 && !cursor ? 'participante' : 'participantes'} com os filtros atuais` : undefined;
  return (
    <div className="tw-page a4">
      <PageHead title="Participantes" sub={sub}>
        <button type="button" className="a46-pill" disabled={exporting} aria-busy={exporting || undefined} onClick={() => void exportCsv()}>Exportar CSV (filtros aplicados)</button>
      </PageHead>
      <div className="a4-filters" role="search" aria-label="Filtrar participantes">
        <label htmlFor="a4-q" className="tw-sr-only">Buscar</label>
        <input id="a4-q" className="a46-in" type="search" placeholder="Nome, e-mail ou telefone" title="Busca por nome, e-mail, telefone ou assunto do comentário" maxLength={200} value={q} onChange={(e) => setQ(e.target.value)} />
        <label htmlFor="a4-status" className="tw-sr-only">Status</label>
        <select id="a4-status" className="a46-sel" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {MENTEE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LOOK[s].label}</option>)}
        </select>
        <label htmlFor="a4-area" className="tw-sr-only">Área</label>
        <select id="a4-area" className="a46-sel" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Todas as áreas</option>{areas.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
        <label htmlFor="a4-period" className="tw-sr-only">Período preferido</label>
        <select id="a4-period" className="a46-sel" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="">Todos os períodos</option>{PREFERRED_PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
        </select>
        <label htmlFor="a4-prio" className="tw-sr-only">Prioridade</label>
        <select id="a4-prio" className="a46-sel" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Todas as prioridades</option><option value="true">★ Só prioridade</option><option value="false">Sem prioridade</option>
        </select>
      </div>
      <div className="a4-body">
        <div className="a4-list">
          {first.status === 'loading' && <SkeletonList rows={5} height={56} />}
          {first.status === 'error' && <ErrorState error={first.error} onRetry={first.reload} />}
          {first.status === 'success' && (
            <>
              <DataTable caption="Lista de participantes" columns={columns} rows={rows} rowKey={(m) => m.id} onRowClick={(m) => setOpenId(m.id)}
                onExport={exportCsv} emptyTitle="Nenhuma participante encontrada" emptyText="Limpe os filtros ou aguarde novas inscrições." />
              {cursor && <Button variant="secondary" loading={loadingMore} onClick={() => void more()}>Carregar mais</Button>}
            </>
          )}
        </div>
        {openId && <Detail key={openId} id={openId} onClose={() => setOpenId(null)} onChanged={reloadAll} areaLabel={areaLabel} />}
      </div>
    </div>
  );
}

function Detail({ id, onClose, onChanged, areaLabel }: { id: string; onClose: () => void; onChanged: () => Promise<void>; areaLabel: (k: string) => string }) {
  const toast = useToast();
  const ref = useRef<HTMLElement>(null);
  const d = useQuery((s) => call(ENDPOINTS.E35Detail, { params: { id }, signal: s }), [id]);
  const [busy, setBusy] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  // Painel lateral no lugar (design): foca ao abrir, traz para a vista no celular e fecha com Esc.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !scheduling) onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [scheduling, onClose]);

  const act = async (body: E36Body, ok: string) => {
    setBusy(true);
    try {
      await call(ENDPOINTS.E36, { params: { id }, body });
      toast.success(ok);
      await Promise.all([onChanged(), d.refetch()]);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const m = d.status === 'success' ? d.data.mentee : null;
  const score = m?.quizScores[m.area];
  return (
    <>
      <aside ref={ref} tabIndex={-1} className="a4-panel" aria-label="Detalhe da participante">
        <div className="a4-panel__head">
          <div>
            <h2>{m?.name ?? 'Participante'}</h2>
            {m && <div className="a4-badges"><StatusBadge status={STATUS_BADGE[m.status]} />{m.priority && <PriorityBadge />}</div>}
          </div>
          <button type="button" className="a46-x" aria-label="Fechar detalhe" onClick={onClose}>×</button>
        </div>
        {d.status === 'loading' && <SkeletonList rows={3} height={70} />}
        {d.status === 'error' && <ErrorState error={d.error} onRetry={d.reload} />}
        {m && d.status === 'success' && (
          <div className="tw-stack" style={{ gap: 16 }} data-testid="mentee-panel">
            <dl className="a4-dl">
              <dt>E-mail</dt><dd>{m.email}</dd>
              <dt>WhatsApp</dt><dd>{phoneFmt(m.phone)}</dd>
              <dt>LinkedIn</dt><dd>{m.linkedin ? <a href={linkedinUrl(m.linkedin)} target="_blank" rel="noopener noreferrer">{m.linkedin.replace(/^https?:\/\/(www\.)?/i, '')}</a> : '—'}</dd>
              <dt>Área</dt><dd>{areaLabel(m.area)}{score != null ? ` · jornada: ${score} pts` : ''}</dd>
              <dt>Período</dt><dd>{PERIOD_LABELS[m.preferredPeriod]}</dd>
              <dt>Comentário</dt><dd>{m.note ?? '—'}</dd>
              <dt>Mentora</dt><dd>{m.mentorName ?? '—'}</dd>
              <dt>Mesa e horário</dt><dd>{m.table && m.slot ? `Mesa ${m.table.number} às ${formatTime(m.slot.startAt)}` : '—'}</dd>
              <dt>Inscrita</dt><dd>{formatDateTime(m.createdAt)}</dd>
              <dt>Consentimento</dt><dd>{m.consent ? `${m.consent.version} em ${formatDateTime(m.consent.acceptedAt)}` : '—'}</dd>
            </dl>
            <section className="a4-sec"><h3>Linha do tempo</h3>
              {d.data.timeline.length === 0 ? <p>Sem eventos ainda.</p> : (
                <ol className="a4-timeline">{d.data.timeline.map((t, i) => <li key={i}><time dateTime={t.at}>{formatTime(t.at)}</time><span>{t.label}</span></li>)}</ol>
              )}
            </section>
            <section className="a4-sec"><h3>Notificações enviadas</h3>
              {d.data.notifications.length === 0 ? <p>Nenhuma notificação.</p> : (
                <ul className="a4-notifs">
                  {d.data.notifications.map((n) => {
                    const [label, tone] = NOTIF_STATUS[n.status] ?? [n.status, 'skip'];
                    return (
                      <li key={n.id}>
                        <span>{NOTIF_TYPE[n.type] ?? n.type} · {n.channel === 'email' ? 'e-mail' : 'WhatsApp'}</span>
                        <strong className={`is-${tone}`}>{label}{n.attempts > 1 ? ` (${n.attempts} tentativas)` : ''}</strong>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <div className="a4-actions">
              {m.status === 'waiting' && <button type="button" className="a4-act a4-act--dark" disabled={busy} onClick={() => setScheduling(true)}>Agendar manualmente</button>}
              <button type="button" className="a4-act a4-act--plum" disabled={busy} onClick={() => void act({ action: 'set_priority', priority: !m.priority }, m.priority ? 'Prioridade removida.' : 'Prioridade marcada.')}>{m.priority ? 'Desmarcar prioridade' : 'Marcar prioridade'}</button>
              <button type="button" className="a4-act" disabled={busy} onClick={() => void act({ action: 'resend_link' }, 'Link pessoal reenviado.')}>Reenviar link pessoal</button>
              {m.status !== 'cancelled' && m.status !== 'done' && (
                <button type="button" className="a4-act a4-act--danger" disabled={busy} onClick={() => { if (window.confirm(`Cancelar a inscrição de ${m.name}?`)) void act({ action: 'cancel' }, 'Inscrição cancelada.'); }}>Cancelar inscrição</button>
              )}
            </div>
          </div>
        )}
      </aside>
      {m && <ManualSchedule areaLabel={areaLabel} open={scheduling} mentee={m} onClose={() => setScheduling(false)} onDone={async () => { setScheduling(false); await Promise.all([onChanged(), d.refetch()]); }} />}
    </>
  );
}

/** Agendar manualmente (E39): M5ScheduleDrawer do web-app com mentorPicker, loadOptions (E38 + disponibilidade) e onSubmit (E39Create). */
function ManualSchedule({ open, mentee, areaLabel, onClose, onDone }: { areaLabel: (k: string) => string; open: boolean; mentee: MenteeAdminView; onClose: () => void; onDone: () => Promise<void> }) {
  const mentors = useQuery((s) => call(ENDPOINTS.E31List, { query: { status: 'active' }, signal: s }), []);
  const [mentorId, setMentorId] = useState('');
  useEffect(() => { if (!open) setMentorId(''); }, [open]);
  const mentor = mentors.status === 'success' ? mentors.data.items.find((m) => m.id === mentorId) : undefined;

  const loadOptions = async (slotId?: string): Promise<E23Response> => {
    const sched = await call(ENDPOINTS.E38);
    const active = sched.appointments.filter((a) => ['invited', 'confirmed', 'in_progress'].includes(a.status));
    const slots = sched.slots
      .filter((s) => mentor?.availability.includes(s.id) && !active.some((a) => a.slotId === s.id && a.mentor.id === mentorId))
      .map((s) => ({ ...s, preferred: false }));
    const selectedSlotId = slots.find((s) => s.id === slotId)?.id ?? slots[0]?.id ?? null;
    const tables = sched.tables.filter((t) => t.active).map((t) => ({ ...t, free: !active.some((a) => a.slotId === selectedSlotId && a.table.id === t.id) }));
    return { slots, selectedSlotId, tables, suggestedTableId: tables.find((t) => t.free)?.id ?? null, previousTableId: null };
  };
  const onSubmit = (b: { menteeId: string; slotId: string; tableId: string; mentorId?: string }) =>
    call(ENDPOINTS.E39Create, { body: { menteeId: b.menteeId, slotId: b.slotId, tableId: b.tableId, mentorId: b.mentorId ?? mentorId } });

  const picker = (
    <div data-testid="manual-schedule">
      {mentors.status === 'loading' && <SkeletonList rows={1} height={56} />}
      {mentors.status === 'error' && <ErrorState error={mentors.error} onRetry={mentors.reload} />}
      {mentors.status === 'success' && (
        <SelectField label="Mentora" value={mentorId} onChange={(e) => setMentorId(e.target.value)}>
          <option value="">Escolha…</option>
          {mentors.data.items.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </SelectField>
      )}
    </div>
  );
  return (
    <M5ScheduleDrawer open={open} onClose={onClose} mentee={mentee} areaLabel={areaLabel} mentorId={mentorId} mentorPicker={picker}
      loadOptions={loadOptions} onSubmit={onSubmit} submitLabel="Agendar" helpText="O admin agenda em nome da mentora; a participante recebe o convite."
      onDone={() => void onDone()} />
  );
}
