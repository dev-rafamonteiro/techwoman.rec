import { useCallback, useEffect, useMemo, useState } from 'react';
import { ENDPOINTS, MENTOR_STREAM_EVENT_TYPES, type E25Response, type E26Body, type MentorAppointmentView, type MenteeStaffView, type MentorStreamEvent, type Slot } from '@tw/shared';
import {
  ApiError, AreaBadge, Button, ConnectionBar, Countdown, EmptyState, ErrorState, Overlay, SkeletonList, StatusBadge, TextArea,
  call, formatDayShort, formatTime, LinkButton, useEventStream, usePolling, useQuery, useToast,
} from '../../ui';
import { FALLBACK_AREAS } from '../public/lib/areas';
import { noShowAllowed, startsSoon } from './lib/format';
import '../public/public.css';
import { M5ScheduleDrawer } from './M5ScheduleDrawer';
import { M6PickMentee } from './M6PickMentee';
import './mentora.css';
import './m4.css';
import './m6.css';

/** Linha da agenda: horário da grade do evento; `available` false = fora da disponibilidade da mentora. */
type Row = { slot: Slot; appointment: MentorAppointmentView | null; available: boolean };
const ACTIVE = ['invited', 'confirmed', 'in_progress'] as const;
const isActive = (a: MentorAppointmentView | null): a is MentorAppointmentView => !!a && (ACTIVE as readonly string[]).includes(a.status);

/** M6 · Minha agenda (E25, E26, E27) · RN08, RN09, RN10 */
export default function M6Agenda() {
  const toast = useToast();
  const event = useQuery((s) => call(ENDPOINTS.E01, { signal: s }), []);
  const areas = event.status === 'success' && event.data.areas.length ? event.data.areas : FALLBACK_AREAS;
  const areaLabel = useCallback((key: string) => areas.find((a) => a.key === key)?.label ?? key, [areas]);
  // grade inteira do dia (E20) para mostrar também os horários fora da disponibilidade
  const grid = useQuery((s) => call(ENDPOINTS.E20, { signal: s }), []);

  const [data, setData] = useState<E25Response | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<MentorAppointmentView | null>(null);
  const [reason, setReason] = useState('');
  // horário livre tocado → lista de participantes → M5 já nesse horário
  const [pickSlot, setPickSlot] = useState<Slot | null>(null);
  const [chosen, setChosen] = useState<MenteeStaffView | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await call(ENDPOINTS.E25));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK', 'Sem conexão.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const [degraded, setDegraded] = useState(false);
  usePolling(load, 10000, degraded);
  const stream = useEventStream<MentorStreamEvent | { type: 'degraded' | 'resync'; data: unknown }>({
    endpoint: ENDPOINTS.E27, eventTypes: [...MENTOR_STREAM_EVENT_TYPES, 'degraded', 'resync'], refetch: load,
    onEvent: (ev) => {
      if (ev.type === 'degraded') { setDegraded(true); return; }
      if (ev.type === 'resync') { void load(); return; }
      if (ev.type !== 'appointment.updated') return;
      const ap = ev.data.appointment;
      setData((p) => p && {
        ...p,
        slots: p.slots.map((r) => (r.slot.id === ap.slotId ? { ...r, appointment: ap } : r)),
      });
    },
  });

  const nextId = useMemo(() => {
    const row = data?.slots.find((r) => isActive(r.appointment) && new Date(r.slot.endAt).getTime() > nowMs);
    return row?.slot.id ?? null;
  }, [data, nowMs]);

  async function act(ap: MentorAppointmentView, body: E26Body, ok: string) {
    setBusy(`${ap.id}:${body.action}`);
    try {
      const r = await call(ENDPOINTS.E26, { params: { id: ap.id }, body });
      setData((p) => p && { ...p, slots: p.slots.map((row) => (row.slot.id === r.appointment.slotId ? { ...row, appointment: r.appointment } : row)) });
      toast.success(ok);
      setCancelFor(null);
      setReason('');
    } catch (e) {
      const ae = e as ApiError;
      if (ae.isConflict) toast.conflict(ae.message || 'A mentoria mudou. Atualize a agenda.', () => void load());
      else toast.error(ae.message || 'Não foi possível concluir. Tente de novo.');
      if (ae.isConflict) void load();
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <div className="tw-page"><ErrorState error={error} onRetry={() => void load()} /></div>;
  if (!data) return <div className="tw-page"><SkeletonList rows={5} height={100} /></div>;
  if (data.slots.length === 0) return <div className="tw-page"><EmptyState title="Você ainda não marcou horários" text="Marque sua disponibilidade para aparecer aqui." action={<LinkButton to="/mentora/disponibilidade">Ir para Disponibilidade</LinkButton>} /></div>;

  const serverOffset = new Date(data.serverNow).getTime() - Date.now();
  const now = nowMs + serverOffset;

  const li = (v: string) => (/^https?:/i.test(v) ? v : v.includes('linkedin.com') ? `https://${v}` : `https://www.linkedin.com/in/${v}`);

  // Linhas: a grade do dia (E20) com a mentoria de cada horário (E25); sem E20, só os horários da mentora.
  const byId = new Map(data.slots.map((r) => [r.slot.id, r.appointment]));
  const rows: Row[] = grid.status === 'success'
    ? grid.data.slots.map((g) => ({ slot: g.slot, appointment: byId.get(g.slot.id) ?? null, available: g.available || byId.has(g.slot.id) }))
    : data.slots.map((r) => ({ ...r, available: true }));
  const activeCount = data.slots.filter((r) => isActive(r.appointment)).length;
  const freeCount = data.slots.filter((r) => !r.appointment && new Date(r.slot.endAt).getTime() > now).length;
  const day = formatDayShort(data.slots[0]!.slot.startAt).replace(/^./, (c) => c.toUpperCase());

  const tags = (ap: MentorAppointmentView) => (
    <div className="m6-card__tags">
      <AreaBadge label={areaLabel(ap.mentee.area)} />
      <span className="m6-table">Mesa {ap.table.number}</span>
      {ap.mentee.linkedin && <a className="m6-li" href={li(ap.mentee.linkedin)} target="_blank" rel="noopener noreferrer">LinkedIn ↗<span className="tw-sr-only"> (abre em nova aba)</span></a>}
    </div>
  );
  const note = (ap: MentorAppointmentView) => ap.mentee.note ? <p className="m6-card__note">“{ap.mentee.note}”</p> : null;

  const renderCard = ({ slot, appointment: ap, available }: Row) => {
    const past = new Date(slot.endAt).getTime() <= now;
    if (!ap) {
      if (!available) return <div className="m6-card m6-card--empty m6-card--off"><span>Fora da sua disponibilidade</span><StatusBadge status="free" label="Indisponível" /></div>;
      if (past) return <div className="m6-card m6-card--empty"><span>Ficou livre</span><StatusBadge status="free" /></div>;
      return (
        <div className="m6-card m6-card--free">
          <div className="m6-card__head"><span>Horário livre</span><StatusBadge status="free" /></div>
          <Button variant="secondary" className="m6-pickbtn" onClick={() => setPickSlot(slot)} data-testid="m6-pick-open">+ Escolher participante</Button>
        </div>
      );
    }
    const soon = isActive(ap) && startsSoon(ap.startAt, now);
    const cls = `m6-card${ap.status === 'invited' ? ' m6-card--invited' : ''}${soon || (slot.id === nextId && ap.status !== 'invited') ? ' m6-card--soon' : ''}`;
    return (
      <div className={cls}>
        {soon && <span className="m6-soon" data-testid="m6-soon" role="status">Começa em 5 min</span>}
        <div className="m6-card__head">
          <span className="m6-card__name">{ap.mentee.name}</span>
          <StatusBadge status={ap.status} />
        </div>
        {tags(ap)}
        {isActive(ap) && note(ap)}
        {ap.status === 'invited' && (
          <>
            {ap.expiresAt && <div className="m6-wait"><Countdown expiresAt={ap.expiresAt} serverNow={data.serverNow} label="Aguardando confirmação" onExpire={() => void load()} /></div>}
            <div className="m6-card__actions">
              <Button loading={busy === `${ap.id}:confirm_in_person`} onClick={() => void act(ap, { action: 'confirm_in_person' }, 'Mentoria confirmada presencialmente.')} data-testid="m6-confirm-person">Confirmar presencialmente</Button>
              <Button variant="secondary" className="m6-btn-outline-danger" loading={busy === `${ap.id}:cancel`} onClick={() => void act(ap, { action: 'cancel' }, 'Convite cancelado.')} data-testid="m6-cancel-invite">Cancelar convite</Button>
            </div>
          </>
        )}
        {ap.status === 'confirmed' && (
          <>
            <div className="m6-card__actions">
              <Button loading={busy === `${ap.id}:start`} onClick={() => void act(ap, { action: 'start' }, 'Mentoria iniciada.')} data-testid="m6-start">Iniciar</Button>
              <Button variant="secondary" disabled={!noShowAllowed(ap.startAt, now)} loading={busy === `${ap.id}:no_show`}
                onClick={() => void act(ap, { action: 'no_show' }, 'Marcada como não compareceu.')} data-testid="m6-noshow">Não compareceu</Button>
              <Button variant="secondary" className="m6-btn-outline-danger" onClick={() => setCancelFor(ap)} data-testid="m6-cancel">Cancelar</Button>
            </div>
            {!noShowAllowed(ap.startAt, now) && <span className="m6-card__hint">"Não compareceu" é liberado 10 min após o início.</span>}
          </>
        )}
        {ap.status === 'in_progress' && (
          <div className="m6-card__actions">
            <Button loading={busy === `${ap.id}:finish`} onClick={() => void act(ap, { action: 'finish' }, 'Mentoria concluída.')} data-testid="m6-finish">Concluir</Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="tw-page" data-testid="m6">
      <header className="mt-hero">
        <span className="mt-hero__when">{day} · agora {formatTime(new Date(now).toISOString())} · horário de Recife</span>
        <h1 className="mt-hero__title">Minha agenda</h1>
        <span className="mt-hero__counts" data-testid="m6-counts">
          {activeCount} {activeCount === 1 ? 'mentoria ativa' : 'mentorias ativas'} · {freeCount} {freeCount === 1 ? 'horário livre' : 'horários livres'}
        </span>
      </header>
      <div className="mt-live"><ConnectionBar status={stream.status} lastUpdateAt={stream.lastUpdateAt} /></div>
      <ol className="m6-timeline">
        {rows.map((row) => (
          <li key={row.slot.id} className={`m6-row${new Date(row.slot.endAt).getTime() <= now ? ' m6-row--past' : ''}`}
            data-testid="m6-row" data-slot={row.slot.id} data-status={row.appointment?.status ?? (row.available ? 'free' : 'off')}>
            <span className="m6-time">{formatTime(row.slot.startAt)}</span>
            {renderCard(row)}
          </li>
        ))}
      </ol>

      <M6PickMentee slot={pickSlot} timezone={data.timezone} open={!!pickSlot && !chosen} areaLabel={areaLabel}
        onClose={() => setPickSlot(null)} onPick={(m) => setChosen(m)} />
      <M5ScheduleDrawer open={!!chosen} mentee={chosen} areaLabel={areaLabel} initialSlotId={pickSlot?.id}
        onClose={() => setChosen(null)}
        onDone={(r) => { setChosen(null); if (r === 'sent') setPickSlot(null); void load(); }} />

      <Overlay title="Cancelar mentoria" open={!!cancelFor} onClose={() => setCancelFor(null)}>
        <div className="tw-stack">
          <p>{cancelFor ? `${cancelFor.mentee.name.split(' ')[0]} volta para a fila com prioridade e será avisada.` : ''}</p>
          <TextArea label="Motivo" optional rows={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="m6-cancel-reason" />
          <Button variant="danger" block loading={!!cancelFor && busy === `${cancelFor.id}:cancel`}
            onClick={() => cancelFor && void act(cancelFor, { action: 'cancel', ...(reason.trim() ? { reason: reason.trim() } : {}) }, 'Mentoria cancelada.')} data-testid="m6-cancel-confirm">Cancelar mentoria</Button>
          <Button variant="ghost" block onClick={() => setCancelFor(null)}>Manter</Button>
        </div>
      </Overlay>
    </div>
  );
}
