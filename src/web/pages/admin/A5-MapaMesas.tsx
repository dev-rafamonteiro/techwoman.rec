import { useEffect, useMemo, useState } from 'react';
import { ADMIN_STREAM_EVENT_TYPES, ENDPOINTS, type AdminAppointmentView, type AdminStreamEvent, type E39PatchBody } from '@tw/shared';
import {
  ApiError, Button, CheckboxField, ConnectionBar, ErrorState, Overlay, PriorityBadge, SelectField, SkeletonList, StatusBadge, TablePicker,
  call, formatRange, formatTime, useEventStream, useQuery, useToast,
} from '../../ui';
import { PageHead, errMsg, useTitle } from './lib/common';

/** A5 · Mapa de mesas: grade mesa × horário em tempo real (E38 + SSE), ações de E39. */
export default function A5MapaMesas() {
  useTitle('Mapa de mesas');
  const toast = useToast();
  const q = useQuery((signal) => call(ENDPOINTS.E38, { signal }), []);
  const [live, setLive] = useState<Map<string, AdminAppointmentView>>(new Map());
  const [view, setView] = useState<'now' | 'all'>('now');
  const [selected, setSelected] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [skew, setSkew] = useState(0);

  useEffect(() => { const id = setInterval(() => setNowMs(Date.now()), 15000); return () => clearInterval(id); }, []);
  useEffect(() => { if (q.status === 'success') { setLive(new Map()); setSkew(new Date(q.data.serverNow).getTime() - Date.now()); } }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const stream = useEventStream<AdminStreamEvent>({
    endpoint: ENDPOINTS.E38Stream,
    eventTypes: ADMIN_STREAM_EVENT_TYPES,
    onEvent: (ev) => { if (ev.type === 'appointment.updated') setLive((m) => new Map(m).set(ev.data.appointment.id, ev.data.appointment)); },
    refetch: () => q.refetch(),
  });

  const appts = useMemo(() => {
    if (q.status !== 'success') return [] as AdminAppointmentView[];
    const byId = new Map(q.data.appointments.map((a) => [a.id, a]));
    live.forEach((a, id) => byId.set(id, a));
    // Apenas mentorias que ocupam célula (RN: slotLock).
    return [...byId.values()].filter((a) => !['cancelled', 'declined', 'expired'].includes(a.status));
  }, [q.data, live]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.status === 'loading') return <div className="tw-page"><PageHead title="Mapa de mesas" /><SkeletonList rows={4} height={80} /></div>;
  if (q.status === 'error') return <div className="tw-page"><PageHead title="Mapa de mesas" /><ErrorState error={q.error} onRetry={q.reload} /></div>;

  const { slots, tables } = q.data;
  const activeTables = tables.filter((t) => t.active);
  const now = nowMs + skew;
  const currentIdx = slots.findIndex((s) => new Date(s.startAt).getTime() <= now && now < new Date(s.endAt).getTime());
  const nextIdx = slots.findIndex((s) => new Date(s.startAt).getTime() > now);
  const focusIdx = currentIdx >= 0 ? currentIdx : nextIdx;
  const visibleSlots = view === 'all' || focusIdx < 0 ? slots : slots.slice(Math.max(0, focusIdx - 1), focusIdx + 3);
  const cell = (slotId: string, tableId: string) => appts.find((a) => a.slotId === slotId && a.table.id === tableId);
  const sel = appts.find((a) => a.id === selected) ?? null;

  return (
    <div className="tw-page tw-stack">
      <PageHead title="Mapa de mesas" sub={`${activeTables.length} mesas × ${slots.length} horários.`}>
        <Button size="sm" variant={view === 'now' ? 'primary' : 'secondary'} aria-pressed={view === 'now'} onClick={() => setView('now')}>Agora</Button>
        <Button size="sm" variant={view === 'all' ? 'primary' : 'secondary'} aria-pressed={view === 'all'} onClick={() => setView('all')}>Dia inteiro</Button>
      </PageHead>
      <ConnectionBar status={stream.status} lastUpdateAt={stream.lastUpdateAt} />
      {activeTables.length === 0 || slots.length === 0 ? (
        <ErrorState title="Grade sem mesas ou horários" error={new ApiError(0, 'NOT_FOUND', 'Peça a um super admin para configurar mesas (A6) e horários (A7).')} />
      ) : (
        <div className="adm-grid-wrap" tabIndex={0} role="region" aria-label="Grade de mesas por horário" data-testid="a5-grid">
          <table className="adm-grid">
            <thead><tr><th scope="col">Horário</th>{activeTables.map((t) => <th key={t.id} scope="col">Mesa {t.number}{t.location ? <small> · {t.location}</small> : null}</th>)}</tr></thead>
            <tbody>
              {visibleSlots.map((s) => (
                <tr key={s.id} className={slots.indexOf(s) === currentIdx ? 'adm-now' : undefined} aria-current={slots.indexOf(s) === currentIdx ? 'time' : undefined} data-testid={`row-${s.id}`}>
                  <th scope="row">{formatTime(s.startAt)}{slots.indexOf(s) === currentIdx && <small> agora</small>}</th>
                  {activeTables.map((t) => {
                    const a = cell(s.id, t.id);
                    return (
                      <td key={t.id} data-testid={`cell-${s.id}-${t.id}`}>
                        {a ? (
                          <button type="button" className="adm-cell" onClick={() => setSelected(a.id)} aria-label={`${a.mentor.name} e ${a.mentee.name}, mesa ${t.number}, ${formatTime(s.startAt)}`}>
                            <strong>{a.mentor.name}</strong><small>{a.mentee.name}</small><StatusBadge status={a.status} />
                          </button>
                        ) : <span className="adm-cell adm-cell--free" style={{ cursor: 'default' }}>Livre</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Overlay title={sel ? `Mesa ${sel.table.number} · ${formatTime(sel.startAt)}` : 'Mentoria'} open={!!sel} onClose={() => setSelected(null)}>
        {sel && <CellDetail a={sel} slots={slots} tables={activeTables} appts={appts} onDone={async () => { setSelected(null); await q.refetch(); }} onConflict={(m) => toast.conflict(m, q.refetch)} />}
      </Overlay>
    </div>
  );
}

function CellDetail({ a, slots, tables, appts, onDone, onConflict }: {
  a: AdminAppointmentView; slots: { id: string; startAt: string; endAt: string }[]; tables: { id: string; number: number; name: string | null; location: string | null }[];
  appts: AdminAppointmentView[]; onDone: () => Promise<void>; onConflict: (m: string) => void;
}) {
  const toast = useToast();
  const [moving, setMoving] = useState(false);
  const [slotId, setSlotId] = useState(a.slotId);
  const [tableId, setTableId] = useState<string | null>(null);
  const [ignore, setIgnore] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (body: E39PatchBody, ok: string) => {
    setBusy(true);
    try {
      await call(ENDPOINTS.E39Patch, { params: { id: a.id }, body });
      toast.success(ok);
      await onDone();
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) onConflict(e.message); else toast.error(errMsg(e));
    } finally { setBusy(false); }
  };
  const taken = new Set(appts.filter((x) => x.slotId === slotId && x.id !== a.id).map((x) => x.table.id));
  const canAct = ['invited', 'confirmed', 'in_progress'].includes(a.status);

  return (
    <div className="tw-stack" data-testid="cell-detail">
      <p style={{ margin: 0 }}>{a.mentor.name} com {a.mentee.name} <StatusBadge status={a.status} />{a.mentee.priority && <> <PriorityBadge /></>}</p>
      <p style={{ margin: 0 }} className="adm-sub">{formatRange(a.startAt, a.endAt)}{a.table.location ? ` · ${a.table.location}` : ''}</p>
      {canAct && !moving && (
        <div className="tw-stack" style={{ gap: 8 }}>
          {a.status === 'confirmed' && <Button variant="secondary" block disabled={busy} onClick={() => setMoving(true)}>Mover para outra mesa ou horário</Button>}
          {a.status === 'invited' && <Button variant="mint" block disabled={busy} onClick={() => void run({ action: 'confirm_in_person' }, 'Presença confirmada.')}>Confirmar presencialmente</Button>}
          {a.status === 'confirmed' && <Button variant="secondary" block disabled={busy || Date.now() < new Date(a.startAt).getTime() + 10 * 60000} title={Date.now() < new Date(a.startAt).getTime() + 10 * 60000 ? 'Disponível 10 min depois do início.' : undefined} onClick={() => { if (window.confirm('Marcar como não compareceu?')) void run({ action: 'no_show' }, 'Marcada como não compareceu.'); }}>Marcar não compareceu</Button>}
          <Button variant="danger-link" block disabled={busy} onClick={() => { if (window.confirm('Cancelar esta mentoria? A participante volta para a fila com prioridade.')) void run({ action: 'cancel' }, 'Mentoria cancelada.'); }}>Cancelar</Button>
        </div>
      )}
      {moving && (
        <div className="tw-stack">
          <SelectField label="Novo horário" value={slotId} onChange={(e) => { setSlotId(e.target.value); setTableId(null); }}>
            {slots.map((s) => <option key={s.id} value={s.id}>{formatTime(s.startAt)}</option>)}
          </SelectField>
          <TablePicker value={tableId} onChange={setTableId} suggestedId={slotId === a.slotId ? null : a.table.id}
            tables={tables.map((t) => ({ ...t, busy: taken.has(t.id) || (slotId === a.slotId && t.id === a.table.id) }))} />
          <CheckboxField label="Ignorar disponibilidade e antecedência mínima" checked={ignore} onChange={(e) => setIgnore(e.target.checked)} />
          <div className="tw-row">
            <Button disabled={!tableId} loading={busy} onClick={() => void run({ action: 'move', slotId, tableId: tableId!, ignoreAvailability: ignore, ignoreLeadTime: ignore }, 'Mentoria movida.')}>Mover</Button>
            <Button variant="ghost" onClick={() => setMoving(false)}>Voltar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
