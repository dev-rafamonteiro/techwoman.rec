import { useCallback, useEffect, useState } from 'react';
import { ENDPOINTS, localMinutesOfDay, type MenteeStaffView, type PreferredPeriod, type Slot } from '@tw/shared';
import { ApiError, Button, EmptyState, ErrorState, MenteeCard, Overlay, PERIOD_LABELS, SelectField, SkeletonList, TextField, call, formatTime, useAuth } from '../../ui';

type ConcretePeriod = Exclude<PreferredPeriod, 'any'>;
const SEARCH_MIN = 2;
const SEARCH_MAX = 200;
const sortQueue = (a: MenteeStaffView, b: MenteeStaffView) =>
  Number(b.priority) - Number(a.priority) || new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();

/** RN14 · período do horário: manhã antes de 12h00, início da tarde até 14h59, fim da tarde a partir de 15h00 (Recife). */
export function periodOfSlot(startAt: string, timezone: string): ConcretePeriod {
  const m = localMinutesOfDay(new Date(startAt), timezone);
  return m < 12 * 60 ? 'morning' : m < 15 * 60 ? 'early_afternoon' : 'late_afternoon';
}

/**
 * M6 · horário livre → escolher participante. Lista a fila (E22) já filtrada pelo período do horário tocado,
 * somando quem marcou "Qualquer horário" (também serve). Escolher abre o M5 nesse horário (fluxo normal de convite).
 */
export function M6PickMentee({ slot, timezone, open, onClose, onPick, areaLabel }: {
  slot: Slot | null;
  timezone: string;
  open: boolean;
  onClose: () => void;
  onPick: (mentee: MenteeStaffView) => void;
  areaLabel: (key: string) => string;
}) {
  const { user } = useAuth();
  const [period, setPeriod] = useState<ConcretePeriod>('morning');
  const [mineOnly, setMineOnly] = useState(true);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MenteeStaffView[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  // ao abrir: período do horário pré-selecionado e filtros limpos
  useEffect(() => {
    if (!open || !slot) return;
    setPeriod(periodOfSlot(slot.startAt, timezone));
    setMineOnly(true);
    setSearch('');
    setQ('');
  }, [open, slot?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim().length >= SEARCH_MIN ? search.trim().slice(0, SEARCH_MAX) : ''), 300);
    return () => clearTimeout(t);
  }, [search]);

  const areas = mineOnly && user?.areas.length ? user.areas.join(',') : undefined;
  const load = useCallback(async () => {
    setItems(null);
    try {
      const base = { ...(areas ? { area: areas } : {}), ...(q ? { q } : {}) };
      const [exact, any] = await Promise.all([
        call(ENDPOINTS.E22, { query: { ...base, period } }),
        call(ENDPOINTS.E22, { query: { ...base, period: 'any' as const } }),
      ]);
      const seen = new Set<string>();
      const merged = [...exact.items, ...any.items].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
      // com busca, a ordem é a relevância do servidor; sem busca, a ordem da fila (RN03)
      setItems(q ? merged : merged.sort(sortQueue));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK', 'Sem conexão.'));
    }
  }, [areas, q, period]);

  useEffect(() => {
    if (open && slot) void load();
  }, [open, slot?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!slot) return null;
  const when = formatTime(slot.startAt);

  return (
    <Overlay title={`Escolher participante · ${when}`} open={open} onClose={onClose}>
      <div className="tw-stack" data-testid="m6-pick">
        <p className="mt-hint">
          Quem prefere {PERIOD_LABELS[period].toLowerCase()} ou marcou "Qualquer horário". Ao escolher, você define a mesa e envia o convite para as {when}.
        </p>
        <SelectField label="Período" value={period} onChange={(e) => setPeriod(e.target.value as ConcretePeriod)} data-testid="m6-pick-period">
          {(['morning', 'early_afternoon', 'late_afternoon'] as const).map((k) => <option key={k} value={k}>{PERIOD_LABELS[k]}</option>)}
        </SelectField>
        <div className="mt-chips">
          <button type="button" className="tw-chip" aria-pressed={mineOnly} onClick={() => setMineOnly((v) => !v)} data-testid="m6-pick-mine">Só minhas áreas</button>
        </div>
        <TextField label="Buscar por nome ou assunto" type="search" maxLength={SEARCH_MAX} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="m6-pick-search" />

        {error && !items ? (
          <ErrorState error={error} onRetry={() => void load()} />
        ) : !items ? (
          <SkeletonList rows={3} height={110} />
        ) : items.length === 0 ? (
          <EmptyState title="Ninguém aguardando nesse período" text={mineOnly ? 'Tente incluir todas as áreas ou outro período.' : 'Tente outro período.'}
            action={mineOnly ? <Button variant="secondary" onClick={() => setMineOnly(false)}>Ver todas as áreas</Button> : undefined} />
        ) : (
          <ul className="m4-list" data-testid="m6-pick-list">
            {items.map((m) => (
              <li key={m.id} className={m.priority ? 'm4-prio' : undefined}>
                <MenteeCard mentee={m} areaLabel={areaLabel}
                  actions={<Button onClick={() => onPick(m)} data-testid="m6-pick-choose">Escolher</Button>} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Overlay>
  );
}
