import { useEffect, useMemo, useState } from 'react';
import { ENDPOINTS, type E20Response } from '@tw/shared';
import { ApiError, Button, EmptyState, ErrorState, SkeletonList, SlotToggleGrid, call, formatDayShort, formatTime, slotShortcut, useQuery, useToast } from '../../ui';
import { recifeHHmm } from './lib/format';
import '../public/public.css';
import './mentora.css';
import './m3.css';

/** M3 · Minha disponibilidade (E20, E21) · RN11 */
export default function M3Disponibilidade() {
  const toast = useToast();
  const q = useQuery((s) => call(ENDPOINTS.E20, { signal: s }), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const apply = (d: E20Response) => {
    const on = new Set(d.slots.filter((s) => s.available).map((s) => s.slot.id));
    setSelected(on);
    setSaved(on);
  };
  useEffect(() => {
    if (q.status === 'success') apply(q.data);
  }, [q.status === 'success' ? q.data : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(
    () => (q.status === 'success' ? q.data.slots.map((s) => ({
      id: s.slot.id,
      label: formatTime(s.slot.startAt),
      locked: !!s.locked,
      caption: s.locked?.menteeName,
      startHHmm: recifeHHmm(s.slot.startAt),
    })) : []),
    [q],
  );

  if (q.status === 'loading') return <div className="tw-page"><SkeletonList rows={6} height={64} /></div>;
  if (q.status === 'error') return <div className="tw-page"><ErrorState error={q.error} onRetry={q.reload} /></div>;
  if (options.length === 0) return <div className="tw-page"><EmptyState title="Sem horários neste evento" text="A organização ainda não definiu a grade de horários." /></div>;

  const lockedIds = new Set(q.data.slots.filter((s) => s.locked).map((s) => s.slot.id));
  // Atalhos nunca desligam horários travados (RN11).
  const shortcut = (kind: 'morning' | 'afternoon' | 'clear') => {
    const next = slotShortcut(options, kind);
    lockedIds.forEach((id) => next.add(id));
    setSelected(next);
  };

  async function save() {
    setSaving(true);
    try {
      apply(await call(ENDPOINTS.E21, { body: { slotIds: [...new Set([...selected, ...lockedIds])] } }));
      toast.success('Disponibilidade salva.');
    } catch (e) {
      const ae = e as ApiError;
      if (ae.code === 'SLOT_IN_USE') toast.conflict('Esse horário já tem uma mentoria marcada. Cancele a mentoria em Minha agenda antes de desligá-lo.', () => void q.reload());
      else toast.error(ae.message || 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  const marked = [...selected].filter((id) => !lockedIds.has(id)).length + lockedIds.size;
  const dirty = selected.size !== saved.size || [...selected].some((id) => !saved.has(id));
  const day = formatDayShort(q.data.slots[0]!.slot.startAt).replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="tw-page m3" data-testid="m3">
      <header className="mt-hero">
        <span className="mt-hero__when">{day} · horário de Recife</span>
        <h1 className="mt-hero__title">Minha disponibilidade</h1>
        <span className="mt-hero__counts" data-testid="m3-counts">
          {marked} de {options.length} horários marcados{lockedIds.size ? ` · ${lockedIds.size} com mentoria` : ''}
        </span>
      </header>
      <div className="mt-section">
        <p className="mt-hint">Toque nos horários em que você pode mentorar. As participantes só podem ser chamadas nesses horários.</p>
        <div className="mt-chips">
          <button type="button" className="tw-chip" onClick={() => shortcut('morning')} data-testid="m3-morning">Manhã inteira</button>
          <button type="button" className="tw-chip" onClick={() => shortcut('afternoon')} data-testid="m3-afternoon">Tarde inteira</button>
          <button type="button" className="tw-chip" onClick={() => shortcut('clear')} data-testid="m3-clear">Limpar</button>
        </div>
        <div className="m3-legend" aria-hidden="true">
          <span><i className="on" />Disponível</span><span><i className="off" />Indisponível</span><span><i className="lock" />Com mentoria</span>
        </div>
        <SlotToggleGrid legend="Horários disponíveis" slots={options} selected={new Set([...selected].filter((id) => !lockedIds.has(id)))}
          onToggle={(id) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
        {selected.size === 0 && <p role="status" className="mt-hint" data-testid="m3-empty-warning">Você ainda não marcou nenhum horário. Marque ao menos um para poder mentorar.</p>}
        {lockedIds.size > 0 && <p className="mt-hint">Horário com mentoria marcada fica travado. Para liberar, cancele a mentoria em Minha agenda.</p>}
      </div>
      <div className="m3-savebar">
        <span className={`m3-savebar__state${dirty ? ' m3-savebar__state--dirty' : ''}`} role="status">{dirty ? 'Alterações não salvas' : 'Tudo salvo'}</span>
        <Button loading={saving} disabled={!dirty} onClick={() => void save()} data-testid="m3-save">Salvar disponibilidade</Button>
      </div>
    </div>
  );
}
