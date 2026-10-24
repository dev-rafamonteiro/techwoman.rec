import { useCallback, useEffect, useMemo, useState } from 'react';
import { ENDPOINTS, MENTOR_STREAM_EVENT_TYPES, type E25Response, type E26Body, type MentorAppointmentView, type MentorStreamEvent } from '@tw/shared';
import {
  ApiError, Button, Card, ConnectionBar, Countdown, EmptyState, ErrorState, Hero, MenteeCard, Overlay, SkeletonList, StatusBadge, TextArea,
  call, formatRange, formatTime, useEventStream, useQuery, useToast,
} from '../../ui';
import { FALLBACK_AREAS } from '../public/lib/areas';
import { noShowAllowed, startsSoon } from './lib/format';

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

  const stream = useEventStream<MentorStreamEvent>({
    endpoint: ENDPOINTS.E27, eventTypes: MENTOR_STREAM_EVENT_TYPES, refetch: load,
    onEvent: (ev) => {
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
  if (data.slots.length === 0) return <div className="tw-page"><EmptyState title="Sua agenda está vazia" text="Marque seus horários disponíveis para receber convites." /></div>;

  const serverOffset = new Date(data.serverNow).getTime() - Date.now();
  const now = nowMs + serverOffset;

  const renderRow = ({ slot, appointment: ap }: Row) => {
    const next = slot.id === nextId;
    const soon = isActive(ap) && startsSoon(ap.startAt, now);
    return (
      <li key={slot.id} data-testid="m6-row" data-slot={slot.id} data-status={ap?.status ?? 'free'}>
        <Card accent={next}>
          <div className="tw-row">
            <strong>{formatRange(slot.startAt, slot.endAt)}</strong>
            <StatusBadge status={ap ? ap.status : 'free'} />
            {next && <span className="tw-badge tw-badge--area">Próxima mentoria</span>}
            {soon && <span className="tw-badge tw-badge--invited" data-testid="m6-soon" role="status">Começa em 5 min</span>}
          </div>
          {ap ? (
            <div className="tw-stack">
              <p>Mesa {ap.table.number}{ap.table.location ? ` · ${ap.table.location}` : ''}</p>
              {ap.status === 'invited' && ap.expiresAt && <Countdown expiresAt={ap.expiresAt} serverNow={data.serverNow} label="Aguardando confirmação" onExpire={() => void load()} />}
              {(ap.status === 'confirmed' || ap.status === 'in_progress' || ap.status === 'invited') && (
                <MenteeCard mentee={ap.mentee} areaLabel={areaLabel} variant="full" nowMs={now} />
              )}
              {ap.status !== 'confirmed' && ap.status !== 'in_progress' && ap.status !== 'invited' && <p>{ap.mentee.name}</p>}
              <div className="tw-row">
                {ap.status === 'invited' && (
                  <>
                    <Button variant="secondary" loading={busy === `${ap.id}:cancel`} onClick={() => void act(ap, { action: 'cancel' }, 'Convite cancelado.')} data-testid="m6-cancel-invite">Cancelar convite</Button>
                    <Button loading={busy === `${ap.id}:confirm_in_person`} onClick={() => void act(ap, { action: 'confirm_in_person' }, 'Mentoria confirmada presencialmente.')} data-testid="m6-confirm-person">Confirmar presencialmente</Button>
                  </>
                )}
                {ap.status === 'confirmed' && (
                  <>
                    <Button loading={busy === `${ap.id}:start`} onClick={() => void act(ap, { action: 'start' }, 'Mentoria iniciada.')} data-testid="m6-start">Iniciar</Button>
                    <Button variant="secondary" disabled={!noShowAllowed(ap.startAt, now)} loading={busy === `${ap.id}:no_show`}
                      onClick={() => void act(ap, { action: 'no_show' }, 'Marcada como não compareceu.')} data-testid="m6-noshow"
                      title={noShowAllowed(ap.startAt, now) ? undefined : 'Liberado 10 min após o início'}>Não compareceu</Button>
                    <Button variant="danger-link" onClick={() => setCancelFor(ap)} data-testid="m6-cancel">Cancelar</Button>
                  </>
                )}
                {ap.status === 'in_progress' && (
                  <Button loading={busy === `${ap.id}:finish`} onClick={() => void act(ap, { action: 'finish' }, 'Mentoria concluída.')} data-testid="m6-finish">Concluir</Button>
                )}
              </div>
              {ap.status === 'confirmed' && !noShowAllowed(ap.startAt, now) && <p className="tw-field__hint">“Não compareceu” fica disponível 10 min após o início.</p>}
            </div>
          ) : (
            <p className="tw-field__hint">Horário livre</p>
          )}
        </Card>
      </li>
    );
  };

  return (
    <div className="tw-page tw-stack" data-testid="m6">
      <Hero title="Minha agenda"><p>Horário de Recife.</p></Hero>
      <ConnectionBar status={stream.status} lastUpdateAt={stream.lastUpdateAt} />
      <ol className="tw-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{data.slots.map(renderRow)}</ol>

      <Overlay title="Cancelar mentoria" open={!!cancelFor} onClose={() => setCancelFor(null)}>
        <div className="tw-stack">
          <p>{cancelFor ? `Cancelar a mentoria das ${formatTime(cancelFor.startAt)} com ${cancelFor.mentee.name}? Ela volta para a fila com prioridade.` : ''}</p>
          <TextArea label="Motivo" optional rows={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="m6-cancel-reason" />
          <Button variant="danger" block loading={!!cancelFor && busy === `${cancelFor.id}:cancel`}
            onClick={() => cancelFor && void act(cancelFor, { action: 'cancel', ...(reason.trim() ? { reason: reason.trim() } : {}) }, 'Mentoria cancelada.')} data-testid="m6-cancel-confirm">Cancelar mentoria</Button>
          <Button variant="ghost" block onClick={() => setCancelFor(null)}>Voltar</Button>
        </div>
      </Overlay>
    </div>
  );
}
