import { useEffect, useMemo, useState } from 'react';
import { ADMIN_STREAM_EVENT_TYPES, ENDPOINTS, type AdminAppointmentView, type AdminStreamEvent, type E39PatchBody, type MenteeAdminView, type MentorListItem } from '@tw/shared';
import {
  ApiError, Button, CheckboxField, ConnectionBar, EmptyState, ErrorState, Overlay, PriorityBadge, SkeletonList, STATUS_LOOK, StatusBadge,
  call, formatDateTime, formatRange, formatTime, phoneFromE164, useAuth, useEventStream, useQuery, useToast,
} from '../../ui';
import { PageHead, errMsg, useAreas, useTitle } from './lib/common';
import { nowWindow } from './lib/now-window';
import { mentorsFreeAt, trackFirst } from './lib/free-mentors';
import './lib/a4-a6.css';

/** Legenda do design (cor + texto); "Em andamento" usa o tom de Confirmada. */
const linkedinUrl = (v: string) => (/^https?:/i.test(v) ? v : v.includes('linkedin.com') ? `https://${v}` : `https://www.linkedin.com/in/${v}`);

/** Motivos no histórico da mentoria que valem um texto (troca de mesa ou de mentora). */
const REASON_PT: Record<string, string> = { moved: 'movida', mentor_changed: 'mentora trocada', mentor_no_show: 'mentora não compareceu; trocada' };

const LEGEND = [['invited', 'Horário proposto'], ['confirmed', 'Confirmada'], ['done', 'Concluída'], ['negative', 'Não compareceu'], ['free', 'Livre']] as const;

/** A5 · Mapa de mesas: grade em tempo real, uma linha por mesa e uma coluna por horário (E38 + SSE), ações de E39. Visual: design/admin/A5-mapa-de-mesas.html. */
export default function A5MapaMesas() {
  useTitle('Mapa de mesas');
  const toast = useToast();
  const { label: areaLabel } = useAreas();
  const q = useQuery((signal) => call(ENDPOINTS.E38, { signal }), []);
  // mentoras ativas: para trocar a mentora de uma mentoria e para puxar alguém da fila numa mesa livre
  const mentorList = useQuery((signal) => call(ENDPOINTS.E31List, { query: { status: 'active' }, signal }), []);
  const mentors = mentorList.status === 'success' ? mentorList.data.items : [];
  const [freeCell, setFreeCell] = useState<{ slotId: string; tableId: string } | null>(null);
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
        <CellDetail key={sel.id} a={sel} slots={slots} tables={activeTables} appts={appts} mentors={mentors} areaLabel={areaLabel} onClose={() => setSelected(null)}
          onDone={async () => { setSelected(null); await q.refetch(); }} onConflict={(m) => toast.conflict(m, q.refetch)} />
      )}
      {freeCell && (() => {
        const slot = slots.find((s) => s.id === freeCell.slotId);
        const table = activeTables.find((t) => t.id === freeCell.tableId);
        return slot && table ? (
          <PullFromQueue key={`${slot.id}-${table.id}`} slot={slot} table={table} appts={appts} mentors={mentors} areaLabel={areaLabel}
            onClose={() => setFreeCell(null)} onDone={async () => { setFreeCell(null); await q.refetch(); }} onConflict={(m) => toast.conflict(m, q.refetch)} />
        ) : null;
      })()}
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
                        ) : (
                          <button type="button" className="a5-cell a5-t--free" onClick={() => setFreeCell({ slotId: s.id, tableId: t.id })} data-testid={`free-${s.id}-${t.id}`}
                            aria-label={`Mesa ${t.number}, ${formatTime(s.startAt)}, livre: puxar alguém da fila de espera`}>Livre</button>
                        )}
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

function CellDetail({ a, slots, tables, appts, mentors, areaLabel, onClose, onDone, onConflict }: {
  a: AdminAppointmentView; slots: { id: string; startAt: string; endAt: string }[]; tables: { id: string; number: number; name: string | null; location: string | null }[];
  mentors: MentorListItem[];
  appts: AdminAppointmentView[]; areaLabel: (k: string) => string; onClose: () => void; onDone: () => Promise<void>; onConflict: (m: string) => void;
}) {
  const toast = useToast();
  const { hasRole } = useAuth();
  const [slotId, setSlotId] = useState(a.slotId);
  const [tableId, setTableId] = useState('');
  const [ignore, setIgnore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newMentorId, setNewMentorId] = useState('');
  const [mentorNoShow, setMentorNoShow] = useState(true);

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
  // troca de mentora (time de testes): as livres da trilha da participante; sem nenhuma da trilha, todas as livres
  const swap = trackFirst(mentorsFreeAt(mentors, appts, a.slotId, a.mentor.id), m.area);

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
              {a.history.map((h, i) => <li key={i}>{formatDateTime(h.at)} · {STATUS_LOOK[h.to].label}{h.reason && REASON_PT[h.reason] ? ` · ${REASON_PT[h.reason]}` : ''}</li>)}
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
              onClick={() => { if (window.confirm('Devolver para a lista de espera? A mentoria é cancelada e a participante volta para a fila com prioridade.')) void run({ action: 'cancel' }, 'Participante devolvida para a lista de espera.'); }}>Devolver para a lista de espera</button>
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
          <div className="a5-move" data-testid="a5-swap">
            <label htmlFor="a5-swap-mentora">Trocar mentora</label>
            {swap.mentors.length === 0 ? (
              <span className="tw-field__hint">Nenhuma mentora livre neste horário. Se a mentora não veio, devolva a participante para a lista de espera.</span>
            ) : (
              <>
                <select id="a5-swap-mentora" className="a46-sel" value={newMentorId} onChange={(e) => setNewMentorId(e.target.value)}>
                  <option value="">{swap.otherTracks ? 'Escolha (nenhuma livre da trilha)' : `Escolha (trilha ${areaLabel(m.area)})`}</option>
                  {swap.mentors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <button type="button" className="a46-pill a46-pill--dark" disabled={!newMentorId || busy} data-testid="a5-swap-go"
                  onClick={() => void run({ action: 'change_mentor', mentorId: newMentorId, mentorNoShow }, 'Mentora trocada.')}>Trocar</button>
                <CheckboxField label={`Registrar que ${a.mentor.name} não compareceu`} checked={mentorNoShow} onChange={(e) => setMentorNoShow(e.target.checked)} />
              </>
            )}
          </div>
        )}
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

/**
 * Mesa livre no mapa: puxa alguém da fila de espera (E35 waiting, prioridade primeiro, depois quem entrou antes) para uma
 * mentora livre no horário (as da trilha dela; sem nenhuma, todas). Cria o convite (E39); "está aqui" já confirma.
 */
function PullFromQueue({ slot, table, appts, mentors, areaLabel, onClose, onDone, onConflict }: {
  slot: { id: string; startAt: string; endAt: string }; table: { id: string; number: number; location: string | null };
  appts: AdminAppointmentView[]; mentors: MentorListItem[]; areaLabel: (k: string) => string;
  onClose: () => void; onDone: () => Promise<void>; onConflict: (m: string) => void;
}) {
  const toast = useToast();
  const queue = useQuery(async (signal) => {
    const all: MenteeAdminView[] = [];
    let cursor: string | undefined;
    do {
      const page = await call(ENDPOINTS.E35, { query: { status: 'waiting', ...(cursor ? { cursor } : {}) }, signal });
      all.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return all.sort((x, y) => Number(y.priority) - Number(x.priority) || x.queuedAt.localeCompare(y.queuedAt));
  }, []);
  const [menteeId, setMenteeId] = useState('');
  const [mentorId, setMentorId] = useState('');
  // horário em andamento ou quase: a participante está no local, confirma na hora (o convite venceria antes de ela responder)
  const [here, setHere] = useState(new Date(slot.startAt).getTime() - Date.now() < 30 * 60_000);
  const [busy, setBusy] = useState(false);
  const mentee = queue.status === 'success' ? queue.data.find((x) => x.id === menteeId) : undefined;
  const free = mentee ? trackFirst(mentorsFreeAt(mentors, appts, slot.id), mentee.area) : null;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await call(ENDPOINTS.E39Create, { body: { menteeId, mentorId, slotId: slot.id, tableId: table.id, ignoreLeadTime: true } });
      if (here) await call(ENDPOINTS.E39Patch, { params: { id: r.appointment.id }, body: { action: 'confirm_in_person' } });
      toast.success(here ? 'Mentoria agendada e confirmada.' : 'Convite enviado à participante.');
      await onDone();
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) onConflict(e.message); else toast.error(errMsg(e));
    } finally { setBusy(false); }
  };

  return (
    <Overlay open title={`Mesa ${table.number} · ${formatTime(slot.startAt)} · livre`} onClose={onClose}>
      <div className="a5-detail" data-testid="a5-pull">
        <h3 className="a5-detail__sub">Puxar da lista de espera</h3>
        {queue.status === 'loading' && <SkeletonList rows={3} height={48} />}
        {queue.status === 'error' && <ErrorState error={queue.error} onRetry={queue.reload} />}
        {queue.status === 'success' && queue.data.length === 0 && <p className="tw-field__hint">Ninguém na lista de espera.</p>}
        {queue.status === 'success' && queue.data.length > 0 && (
          <ul className="a5-queue" aria-label="Lista de espera">
            {queue.data.map((x) => (
              <li key={x.id}>
                <label className={x.id === menteeId ? 'is-on' : undefined}>
                  <input type="radio" name="a5-pull-mentee" checked={x.id === menteeId} onChange={() => { setMenteeId(x.id); setMentorId(''); }} />
                  <span className="a5-queue__txt">
                    <span className="a5-queue__name"><b>{x.name}</b>{x.priority && <PriorityBadge />}</span>
                    <small>{areaLabel(x.area)} · na fila desde {formatDateTime(x.queuedAt)}</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {mentee && free && (
          <div className="a5-move">
            <label htmlFor="a5-pull-mentora">Mentora</label>
            {free.mentors.length === 0 ? (
              <span className="tw-field__hint">Nenhuma mentora livre neste horário.</span>
            ) : (
              <>
                <select id="a5-pull-mentora" className="a46-sel" value={mentorId} onChange={(e) => setMentorId(e.target.value)}>
                  <option value="">{free.otherTracks ? 'Escolha (nenhuma livre da trilha)' : `Escolha (trilha ${areaLabel(mentee.area)})`}</option>
                  {free.mentors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <button type="button" className="a46-pill a46-pill--dark" disabled={!mentorId || busy} data-testid="a5-pull-go" onClick={() => void submit()}>Agendar</button>
                <CheckboxField label="A participante está aqui: confirmar na hora" checked={here} onChange={(e) => setHere(e.target.checked)} />
              </>
            )}
          </div>
        )}
      </div>
    </Overlay>
  );
}
