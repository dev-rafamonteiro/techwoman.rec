import { useEffect, useMemo, useState } from 'react';
import { ADMIN_STREAM_EVENT_TYPES, ENDPOINTS, type AdminAppointmentView, type AdminStreamEvent, type E39PatchBody } from '@tw/shared';
import {
  ApiError, Button, CheckboxField, ConnectionBar, EmptyState, ErrorState, Overlay, PriorityBadge, SkeletonList, STATUS_LOOK, StatusBadge,
  call, formatDateTime, formatRange, formatTime, phoneFromE164, useAuth, useEventStream, useQuery, useToast,
} from '../../ui';
import { PageHead, errMsg, useAreas, useTitle } from './lib/common';
import { nowWindow } from './lib/now-window';
import './lib/a4-a6.css';

/** Legenda do design (cor + texto); "Em andamento" usa o tom de Confirmada. */
const linkedinUrl = (v: string) => (/^https?:/i.test(v) ? v : v.includes('linkedin.com') ? `https://${v}` : `https://www.linkedin.com/in/${v}`);

const LEGEND = [['invited', 'Horário proposto'], ['confirmed', 'Confirmada'], ['done', 'Concluída'], ['negative', 'Não compareceu'], ['free', 'Livre']] as const;

/** A5 · Mapa de mesas: grade em tempo real, uma linha por mesa e uma coluna por horário (E38 + SSE), ações de E39. Visual: design/admin/A5-mapa-de-mesas.html. */
export default function A5MapaMesas() {
  useTitle('Mapa de mesas');
  const toast = useToast();
  const { label: areaLabel } = useAreas();
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

  if (q.status === 'loading') return <div className="tw-page a5"><PageHead title="Mapa de mesas" /><SkeletonList rows={4} height={80} /></div>;
  if (q.status === 'error') return <div className="tw-page a5"><PageHead title="Mapa de mesas" /><ErrorState error={q.error} onRetry={q.reload} /></div>;

  const { slots, tables } = q.data;
  const activeTables = tables.filter((t) => t.active);
  const now = nowMs + skew;
  const win = nowWindow(slots, now);
  const currentIdx = win.currentIdx;
  const visibleSlots = view === 'all' ? slots : win.visible;
  const cell = (slotId: string, tableId: string) => appts.find((a) => a.slotId === slotId && a.table.id === tableId);
  const sel = appts.find((a) => a.id === selected) ?? null;
  const occupiedNow = currentIdx >= 0 ? activeTables.filter((t) => cell(slots[currentIdx]!.id, t.id)).length : null;
  const sub = [`${activeTables.length} mesas × ${slots.length} horários`, `agora ${formatTime(new Date(now).toISOString())}`, occupiedNow != null ? `ocupação agora ${occupiedNow}/${activeTables.length}` : null].filter(Boolean).join(' · ');

  return (
    <div className="tw-page a5">
      <PageHead title="Mapa de mesas" sub={sub}>
        <ConnectionBar status={stream.status} lastUpdateAt={stream.lastUpdateAt} />
        <div className="a5-seg" role="radiogroup" aria-label="Período exibido">
          <button type="button" role="radio" aria-checked={view === 'now'} onClick={() => setView('now')}>Agora</button>
          <button type="button" role="radio" aria-checked={view === 'all'} onClick={() => setView('all')}>Dia inteiro</button>
        </div>
      </PageHead>
      <ul className="a5-legend" aria-label="Legenda">
        {LEGEND.map(([tone, label]) => <li key={tone} className={`a5-t--${tone}`}>{label}</li>)}
      </ul>
      {sel && (
        <CellDetail key={sel.id} a={sel} slots={slots} tables={activeTables} appts={appts} areaLabel={areaLabel} onClose={() => setSelected(null)}
          onDone={async () => { setSelected(null); await q.refetch(); }} onConflict={(m) => toast.conflict(m, q.refetch)} />
      )}
      {activeTables.length === 0 || slots.length === 0 ? (
        <ErrorState title="Grade sem mesas ou horários" error={new ApiError(0, 'NOT_FOUND', 'Peça a um super admin para configurar mesas (A6) e horários (A7).')} />
      ) : visibleSlots.length === 0 ? (
        <EmptyState title="Nenhum horário daqui em diante" text="Os horários de hoje já passaram." action={<Button variant="secondary" onClick={() => setView('all')}>Ver o dia inteiro</Button>} />
      ) : (
        <div className="a5-wrap" tabIndex={0} role="region" aria-label="Grade de horários por mesa" data-testid="a5-grid">
          <table className="a5-grid" style={{ minWidth: 80 + visibleSlots.length * 72 }}>
            <thead>
              <tr>
                <th scope="col">Mesa</th>
                {visibleSlots.map((s) => {
                  const isNow = slots.indexOf(s) === currentIdx;
                  return <th key={s.id} scope="col" aria-current={isNow ? 'time' : undefined} data-testid={`col-${s.id}`}>{formatTime(s.startAt)}{isNow && <small>AGORA</small>}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {activeTables.map((t) => (
                <tr key={t.id}>
                  <th scope="row">Mesa {t.number}{t.location ? <span>{t.location}</span> : null}</th>
                  {visibleSlots.map((s) => {
                    const a = cell(s.id, t.id);
                    return (
                      <td key={s.id} data-testid={`cell-${s.id}-${t.id}`}>
                        {a ? (
                          <button type="button" className={`a5-cell a5-t--${STATUS_LOOK[a.status].tone}`} aria-pressed={a.id === selected}
                            onClick={() => setSelected(a.id === selected ? null : a.id)}
                            title={`${a.mentor.name} com ${a.mentee.name}`}
                            aria-label={`Mesa ${t.number}, ${formatTime(s.startAt)}, ${a.mentor.name} com ${a.mentee.name}, ${STATUS_LOOK[a.status].label}`}>
                            <i>Mentora</i><b>{a.mentor.name}</b><i>Participante</i><b>{a.mentee.name}</b><small>{STATUS_LOOK[a.status].label}</small>
                          </button>
                        ) : <span className="a5-cell a5-t--free" aria-label={`Mesa ${t.number}, ${formatTime(s.startAt)}, livre`}>Livre</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CellDetail({ a, slots, tables, appts, areaLabel, onClose, onDone, onConflict }: {
  a: AdminAppointmentView; slots: { id: string; startAt: string; endAt: string }[]; tables: { id: string; number: number; name: string | null; location: string | null }[];
  appts: AdminAppointmentView[]; areaLabel: (k: string) => string; onClose: () => void; onDone: () => Promise<void>; onConflict: (m: string) => void;
}) {
  const toast = useToast();
  const { hasRole } = useAuth();
  const [slotId, setSlotId] = useState(a.slotId);
  const [tableId, setTableId] = useState('');
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
  const canCancel = a.status === 'invited' || a.status === 'confirmed';
  const isSuper = hasRole('super_admin');
  const canReopen = isSuper && (a.status === 'done' || a.status === 'no_show');
  const canRelease = isSuper && (a.status === 'done' || a.status === 'no_show' || a.status === 'in_progress');
  const noShowEarly = Date.now() < new Date(a.startAt).getTime() + 10 * 60000;
  const title = `Mesa ${a.table.number} · ${formatTime(a.startAt)}`;
  const m = a.mentee;

  return (
    <Overlay open title={title} onClose={onClose}>
      <div className="a5-detail" data-testid="cell-detail">
        <div className="tw-row" style={{ gap: 6 }}><StatusBadge status={a.status} />{m.priority && <PriorityBadge />}</div>
        <dl className="a5-info">
          <dt>Horário</dt><dd>{formatRange(a.startAt, a.endAt)}</dd>
          <dt>Mesa</dt><dd>{a.table.number}{a.table.location ? ` · ${a.table.location}` : ''}</dd>
          <dt>Mentora</dt><dd><b>{a.mentor.name}</b></dd>
          <dt>Participante</dt><dd><b>{m.name}</b></dd>
          <dt>E-mail</dt><dd><a href={`mailto:${m.email}`}>{m.email}</a></dd>
          <dt>Celular</dt><dd>{m.phone ? phoneFromE164(m.phone) : '—'}</dd>
          <dt>LinkedIn</dt><dd>{m.linkedin ? <a href={linkedinUrl(m.linkedin)} target="_blank" rel="noopener noreferrer">{m.linkedin.replace(/^https?:\/\/(www\.)?/i, '')}</a> : '—'}</dd>
          <dt>Área</dt><dd>{areaLabel(m.area)}</dd>
          {m.theme && <><dt>Tema</dt><dd>{m.theme}</dd></>}
          {m.note && <><dt>Observação</dt><dd>{m.note}</dd></>}
        </dl>
        {a.history.length > 0 && (
          <div>
            <h3 className="a5-detail__sub">Histórico</h3>
            <ol className="a5-history">
              {a.history.map((h, i) => <li key={i}>{formatDateTime(h.at)} · {STATUS_LOOK[h.to].label}</li>)}
            </ol>
          </div>
        )}
        <div className="a5-detail__acts">
          {a.status === 'invited' && <button type="button" className="a46-pill a46-pill--cta" disabled={busy} onClick={() => void run({ action: 'confirm_in_person' }, 'Presença confirmada.')}>Confirmar presencialmente</button>}
          {a.status === 'confirmed' && (
            <button type="button" className="a46-pill" disabled={busy || noShowEarly} title={noShowEarly ? 'Disponível 10 min depois do início.' : undefined}
              onClick={() => { if (window.confirm('Marcar como não compareceu?')) void run({ action: 'no_show' }, 'Marcada como não compareceu.'); }}>Não compareceu</button>
          )}
          {canCancel && (
            <button type="button" className="a46-pill a46-pill--danger" disabled={busy} data-testid="a5-cancel"
              onClick={() => { if (window.confirm('Cancelar esta mentoria? A participante volta para a fila com prioridade.')) void run({ action: 'cancel' }, 'Mentoria cancelada.'); }}>Cancelar</button>
          )}
          {canReopen && (
            <button type="button" className="a46-pill" disabled={busy} data-testid="a5-reopen"
              onClick={() => { if (window.confirm('Voltar esta mentoria para confirmada?')) void run({ action: 'reopen' }, 'Mentoria voltou para confirmada.'); }}>Voltar para confirmada</button>
          )}
          {canRelease && (
            <button type="button" className="a46-pill a46-pill--danger" disabled={busy} data-testid="a5-release"
              onClick={() => { if (window.confirm('Cancelar esta mentoria e liberar a mesa? A participante volta para a fila com prioridade.')) void run({ action: 'release' }, 'Mesa liberada.'); }}>Cancelar e liberar a mesa</button>
          )}
        </div>
        {a.status === 'confirmed' && (
          <div className="a5-move">
            <label htmlFor="a5-mv-mesa">Mover para</label>
            <select id="a5-mv-mesa" className="a46-sel" value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">Escolha a mesa</option>
              {tables.map((t) => {
                const same = slotId === a.slotId && t.id === a.table.id;
                const busyT = taken.has(t.id);
                return <option key={t.id} value={t.id} disabled={same || busyT}>Mesa {t.number}{same ? ' (atual)' : busyT ? ' (ocupada)' : ' (livre)'}</option>;
              })}
            </select>
            <select aria-label="Horário" className="a46-sel" value={slotId} onChange={(e) => {
              // sugere a mesma mesa no novo horário, se estiver livre (como a sugestão do TablePicker)
              const v = e.target.value;
              const free = !appts.some((x) => x.slotId === v && x.id !== a.id && x.table.id === a.table.id);
              setSlotId(v); setTableId(v !== a.slotId && free ? a.table.id : '');
            }}>
              {slots.map((s) => <option key={s.id} value={s.id}>{formatTime(s.startAt)}</option>)}
            </select>
            <button type="button" className="a46-pill a46-pill--dark" disabled={!tableId || busy}
              onClick={() => void run({ action: 'move', slotId, tableId, ignoreAvailability: ignore, ignoreLeadTime: ignore }, 'Mentoria movida.')}>Mover</button>
            <CheckboxField label="Ignorar disponibilidade e antecedência mínima" checked={ignore} onChange={(e) => setIgnore(e.target.checked)} />
          </div>
        )}
      </div>
    </Overlay>
  );
}
