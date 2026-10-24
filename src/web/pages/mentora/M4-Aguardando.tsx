import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ENDPOINTS, MENTOR_STREAM_EVENT_TYPES, type E22Response, type MenteeStaffView, type MentorStreamEvent, type PreferredPeriod } from '@tw/shared';
import {
  ApiError, Button, CheckboxField, ConnectionBar, EmptyState, ErrorState, MenteeCard, PERIOD_LABELS, SelectField, SkeletonList,
  TextField, call, formatTime, useAuth, useEventStream, usePolling, useQuery,
} from '../../ui';
import { FALLBACK_AREAS } from '../public/lib/areas';
import { M5ScheduleDrawer } from './M5ScheduleDrawer';
import '../public/public.css';

const LEAVE_MS = 350;
/** Frames de controle do E27: `degraded` = cair para polling de 10 s; `resync` = recarregar tudo. */
type ControlEvent = { type: 'degraded' | 'resync'; data: unknown };
const sortQueue = (a: MenteeStaffView, b: MenteeStaffView) =>
  Number(b.priority) - Number(a.priority) || new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();

/** M4 · Participantes aguardando (E22, E23/E24 via M5, E25, E27) · RN03, RN13 */
export default function M4Aguardando() {
  const event = useQuery((s) => call(ENDPOINTS.E01, { signal: s }), []);
  const areas = event.status === 'success' && event.data.areas.length ? event.data.areas : FALLBACK_AREAS;
  const areaLabel = useCallback((key: string) => areas.find((a) => a.key === key)?.label ?? key, [areas]);

  const { user } = useAuth();
  const [areaFilter, setAreaFilter] = useState<Set<string>>(() => new Set(user?.areas ?? []));
  const [degraded, setDegraded] = useState(false);
  const [period, setPeriod] = useState<PreferredPeriod | ''>('');
  const [onlyPriority, setOnlyPriority] = useState(false);
  const [search, setSearch] = useState('');
  const [panel, setPanel] = useState<'areas' | 'period' | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const [items, setItems] = useState<MenteeStaffView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [meta, setMeta] = useState<Pick<E22Response, 'freeSlots' | 'hasAvailability'> | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([]);
  const [selected, setSelected] = useState<MenteeStaffView | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const filterKey = `${[...areaFilter].sort().join(',')}|${period}|${onlyPriority}|${q}`;
  const query = useMemo(() => ({
    ...(areaFilter.size ? { area: [...areaFilter].join(',') } : {}),
    ...(period ? { period } : {}),
    ...(onlyPriority ? { priority: 'true' as const } : {}),
    ...(q ? { q } : {}),
  }), [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const queryRef = useRef(query);
  queryRef.current = query;
  const seq = useRef(0);

  const loadFirst = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await call(ENDPOINTS.E22, { query: queryRef.current });
      if (my !== seq.current) return;
      setItems(r.items);
      setNextCursor(r.nextCursor);
      setMeta({ freeSlots: r.freeSlots, hasAvailability: r.hasAvailability });
      setError(null);
      setLoaded(true);
    } catch (e) {
      if (my !== seq.current) return;
      setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK', 'Sem conexão.'));
    }
  }, []);

  useEffect(() => {
    setLoaded(false);
    void loadFirst();
  }, [loadFirst, filterKey]);

  const agenda = useQuery((s) => call(ENDPOINTS.E25, { signal: s }), []);
  const next = useMemo(() => {
    if (agenda.status !== 'success') return null;
    return agenda.data.slots
      .map((s) => s.appointment)
      .filter((a): a is NonNullable<typeof a> => !!a && (a.status === 'confirmed' || a.status === 'invited' || a.status === 'in_progress') && new Date(a.endAt).getTime() > nowMs)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0] ?? null;
  }, [agenda, nowMs]);

  const matches = (m: MenteeStaffView) =>
    (areaFilter.size === 0 || areaFilter.has(m.area)) && (!period || m.preferredPeriod === period) && (!onlyPriority || m.priority) &&
    (!q || m.name.toLowerCase().includes(q.toLowerCase()));

  const notify = (text: string) => {
    const id = Date.now() + Math.random();
    setNotices((p) => [...p, { id, text }]);
    setTimeout(() => setNotices((p) => p.filter((n) => n.id !== id)), 6000);
  };

  const onEvent = (ev: MentorStreamEvent | ControlEvent) => {
    if (ev.type === 'degraded') { setDegraded(true); return; }
    if (ev.type === 'resync') { void loadFirst(); void agenda.refetch(); return; }
    if (ev.type === 'queue.added') {
      const m = ev.data.mentee;
      // queue.added é upsert: reaparece quando prioridade ou preferência mudam.
      setItems((p) => {
        const rest = p.filter((x) => x.id !== m.id);
        return matches(m) ? [...rest, m].sort(sortQueue) : rest;
      });
      setMeta((p) => p);
    } else if (ev.type === 'queue.removed') {
      const d = ev.data;
      const wasShown = items.some((x) => x.id === d.menteeId);
      if (d.reason === 'invited' && !d.byMe && wasShown) {
        notify(`${d.menteeName.split(' ')[0]} acabou de ser escolhida por outra mentora`);
        setSelected((s) => (s?.id === d.menteeId ? null : s));
      }
      setLeaving((p) => new Set(p).add(d.menteeId));
      setTimeout(() => {
        setItems((p) => p.filter((x) => x.id !== d.menteeId));
        setLeaving((p) => { const n = new Set(p); n.delete(d.menteeId); return n; });
      }, LEAVE_MS);
    } else {
      void agenda.refetch();
      void loadFirst();
    }
  };

  const stream = useEventStream<MentorStreamEvent | ControlEvent>({
    endpoint: ENDPOINTS.E27, eventTypes: [...MENTOR_STREAM_EVENT_TYPES, 'degraded', 'resync'], onEvent,
    refetch: () => Promise.all([loadFirst(), agenda.refetch()]),
  });

  usePolling(() => Promise.all([loadFirst(), agenda.refetch()]), 10000, degraded);

  async function more() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const r = await call(ENDPOINTS.E22, { query: { ...queryRef.current, cursor: nextCursor } });
      setItems((p) => [...p, ...r.items.filter((n) => !p.some((x) => x.id === n.id))].sort(sortQueue));
      setNextCursor(r.nextCursor);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Não foi possível carregar mais.');
    } finally {
      setLoadingMore(false);
    }
  }

  const toggleArea = (key: string) => setAreaFilter((p) => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const filtered = areaFilter.size > 0 || !!period || onlyPriority || !!q;

  return (
    <div className="tw-page tw-stack" data-testid="m4">
      <header><h1 className="tw-ptitle">Participantes aguardando</h1></header>
      <div className="tw-darkcard">
        <strong data-testid="m4-free">Seus horários livres hoje: {meta?.freeSlots ?? '–'}</strong>
        {next && <span data-testid="m4-next">Próximo atendimento: {formatTime(next.startAt)} · Mesa {next.table.number} · {next.mentee.name.split(' ')[0]}</span>}
      </div>
      <ConnectionBar status={stream.status} lastUpdateAt={stream.lastUpdateAt} />

      {meta && !meta.hasAvailability && (
        <div className="tw-card" role="status" data-testid="m4-no-availability">
          Você ainda não marcou nenhum horário. Marque ao menos um para poder mentorar. <Link className="tw-link" to="/mentora/disponibilidade">Ir para Disponibilidade</Link>
        </div>
      )}
      <div aria-live="polite" className="tw-stack">
        {notices.map((n) => <div key={n.id} className="tw-card" role="status" data-testid="m4-notice">{n.text}</div>)}
      </div>

      <div className="tw-stack" style={{ gap: 8 }}>
        <div className="tw-chips">
          <button type="button" className="tw-chip" aria-expanded={panel === 'areas'} aria-pressed={areaFilter.size > 0} onClick={() => setPanel(panel === 'areas' ? null : 'areas')} data-testid="m4-areas">Minhas áreas ▾</button>
          <button type="button" className="tw-chip" aria-expanded={panel === 'period'} aria-pressed={!!period} onClick={() => setPanel(panel === 'period' ? null : 'period')} data-testid="m4-period-chip">Período ▾</button>
          <button type="button" className="tw-chip" aria-pressed={onlyPriority} onClick={() => setOnlyPriority((v) => !v)} data-testid="m4-priority">Só prioridade</button>
        </div>
        {panel === 'areas' && (
          <fieldset className="tw-pop" style={{ margin: 0 }}>
            <legend className="tw-sr-only">Áreas</legend>
            {areas.map((a) => <CheckboxField key={a.key} label={a.label} checked={areaFilter.has(a.key)} onChange={() => toggleArea(a.key)} />)}
          </fieldset>
        )}
        {panel === 'period' && (
          <div className="tw-pop">
            <SelectField label="Período preferido" value={period} onChange={(e) => setPeriod(e.target.value as PreferredPeriod | '')} data-testid="m4-period">
              <option value="">Todos</option>
              {(Object.entries(PERIOD_LABELS) as [PreferredPeriod, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </SelectField>
          </div>
        )}
        <TextField label="Buscar por nome" placeholder="Nome da participante" type="search" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="m4-search" />
        {areaFilter.size > 0 && <button type="button" className="tw-linkbtn" onClick={() => setAreaFilter(new Set())} data-testid="m4-all-areas">Ver todas as áreas</button>}
      </div>

      {error && !loaded ? (
        <ErrorState error={error} onRetry={() => void loadFirst()} />
      ) : !loaded ? (
        <SkeletonList rows={4} height={120} />
      ) : items.length === 0 ? (
        <EmptyState title="Ninguém aguardando agora" text={filtered ? 'Nenhuma participante com esses filtros.' : 'Novas inscrições aparecem aqui sozinhas.'}
          action={filtered ? <Button variant="secondary" onClick={() => { setAreaFilter(new Set()); setPeriod(''); setOnlyPriority(false); setSearch(''); }}>Limpar filtros</Button> : undefined} />
      ) : (
        <ul className="tw-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }} data-testid="m4-list">
          {items.map((m) => (
            <li key={m.id}>
              <MenteeCard mentee={m} areaLabel={areaLabel} nowMs={nowMs} leaving={leaving.has(m.id)}
                actions={<Button block onClick={() => setSelected(m)} disabled={leaving.has(m.id)} data-testid="m4-mentor">Mentorar</Button>} />
            </li>
          ))}
        </ul>
      )}
      {nextCursor && <Button variant="secondary" block loading={loadingMore} onClick={() => void more()}>Carregar mais</Button>}

      <M5ScheduleDrawer open={!!selected} mentee={selected} areaLabel={areaLabel} onClose={() => setSelected(null)}
        onDone={() => { void loadFirst(); void agenda.refetch(); }} />
    </div>
  );
}
