import { useCallback, useEffect, useMemo, useState } from 'react';
import { ENDPOINTS, MENTOR_STREAM_EVENT_TYPES, type E25Response, type E26Body, type MentorAppointmentView, type MentorStreamEvent } from '@tw/shared';
import {
  ApiError, AreaBadge, Button, Card, ConnectionBar, Countdown, EmptyState, ErrorState, Overlay, SkeletonList, StatusBadge, TextArea,
  call, formatDayShort, formatRange, formatTime, LinkButton, useEventStream, usePolling, useQuery, useToast,
} from '../../ui';
import { FALLBACK_AREAS } from '../public/lib/areas';
import { noShowAllowed, startsSoon } from './lib/format';
import '../public/public.css';

type Row = E25Response['slots'][number];
const ACTIVE = ['invited', 'confirmed', 'in_progress'] as const;
const isActive = (a: MentorAppointmentView | null): a is MentorAppointmentView => !!a && (ACTIVE as readonly string[]).includes(a.status);

/** M6 · Minha agenda (E25, E26, E27) · RN08, RN09, RN10 */
export default function M6Agenda() {
  const toast = useToast();
  const event = useQuery((s) => call(ENDPOINTS.E01, { signal: s }), []);
  const areas = event.status === 'success' && event.data.areas.length ? event.data.areas : FALLBACK_AREAS;
  const areaLabel = useCallback((key: string) => areas.find((a) => a.key === key)?.label ?? key, [areas]);

  const [data, setData] = useState<E25Response | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<MentorAppointmentView | null>(null);
  const [reason, setReason] = useState('');
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

  const renderRow = ({ slot, appointment: ap }: Row) => {
    const next = slot.id === nextId;
    const soon = isActive(ap) && startsSoon(ap.startAt, now);
    const done = ap && (ap.status === 'done' || ap.status === 'no_show');
    const head = ap && !done ? `${formatTime(slot.startAt)} · Mesa ${ap.table.number}` : formatTime(slot.startAt);
    const first = ap?.mentee.name.split(' ')[0];
    return (
      <li key={slot.id} data-testid="m6-row" data-slot={slot.id} data-status={ap?.status ?? 'free'}>
        <Card accent={next}>
          <div className="tw-stack" style={{ gap: 10 }}>
            <div className="tw-row" style={{ justifyContent: 'space-between' }}>
              <strong>{head}</strong>
              <StatusBadge status={ap ? ap.status : 'free'} />
            </div>
            {!ap && <span className="tw-psub" style={{ margin: 0 }}>Horário livre</span>}
            {ap && done && <span>{ap.mentee.name} · {areaLabel(ap.mentee.area)} · Mesa {ap.table.number}</span>}
            {ap && ap.status === 'invited' && (
              <>
                <span>{ap.mentee.name} · {areaLabel(ap.mentee.area)}</span>
                {ap.expiresAt && <Countdown expiresAt={ap.expiresAt} serverNow={data.serverNow} label="Aguardando confirmação" onExpire={() => void load()} />}
                <div className="tw-row">
                  <Button variant="secondary" loading={busy === `${ap.id}:cancel`} onClick={() => void act(ap, { action: 'cancel' }, 'Convite cancelado.')} data-testid="m6-cancel-invite">Cancelar convite</Button>
                  <Button variant="mint" loading={busy === `${ap.id}:confirm_in_person`} onClick={() => void act(ap, { action: 'confirm_in_person' }, 'Mentoria confirmada presencialmente.')} data-testid="m6-confirm-person">Confirmar presencialmente</Button>
                </div>
              </>
            )}
            {ap && ap.status === 'confirmed' && (
              <>
                <strong>{ap.mentee.name}</strong>
                <div className="tw-row">
                  <AreaBadge label={areaLabel(ap.mentee.area)} />
                  {ap.mentee.linkedin && <a className="tw-link" href={li(ap.mentee.linkedin)} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
                </div>
                {ap.mentee.note && <p className="tw-mentee__note">“{ap.mentee.note}”</p>}
                {soon && <span className="tw-pill tw-pill--soft" data-testid="m6-soon" role="status">Começa em 5 min</span>}
                <div className="tw-row">
                  <Button loading={busy === `${ap.id}:start`} onClick={() => void act(ap, { action: 'start' }, 'Mentoria iniciada.')} data-testid="m6-start">Iniciar</Button>
                  <Button variant="secondary" disabled={!noShowAllowed(ap.startAt, now)} loading={busy === `${ap.id}:no_show`}
                    onClick={() => void act(ap, { action: 'no_show' }, 'Marcada como não compareceu.')} data-testid="m6-noshow">Não compareceu</Button>
                  <Button variant="danger-link" onClick={() => setCancelFor(ap)} data-testid="m6-cancel">Cancelar</Button>
                </div>
                {!noShowAllowed(ap.startAt, now) && <span className="tw-field__hint">"Não compareceu" é liberado 10 min após o início.</span>}
              </>
            )}
            {ap && ap.status === 'in_progress' && (
              <>
                <span>{ap.mentee.name} · {areaLabel(ap.mentee.area)} · em andamento</span>
                <div className="tw-row">
                  <Button loading={busy === `${ap.id}:finish`} onClick={() => void act(ap, { action: 'finish' }, 'Mentoria concluída.')} data-testid="m6-finish">Concluir</Button>
                </div>
              </>
            )}
            {ap && !isActive(ap) && !done && <span>{first}</span>}
          </div>
        </Card>
      </li>
    );
  };

  return (
    <div className="tw-page tw-stack" data-testid="m6">
      <header><h1 className="tw-ptitle">Minha agenda</h1><p className="tw-psub">{formatDayShort(data.slots[0]!.slot.startAt).replace(/^./, (c) => c.toUpperCase())} · horário de Recife</p></header>
      <ConnectionBar status={stream.status} lastUpdateAt={stream.lastUpdateAt} />
      <ol className="tw-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{data.slots.map(renderRow)}</ol>

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
