import { useEffect, useMemo, useState } from 'react';
import { ENDPOINTS, type E20Response } from '@tw/shared';
import { ApiError, Button, EmptyState, ErrorState, SkeletonList, SlotToggleGrid, call, formatTime, slotShortcut, useQuery, useToast } from '../../ui';
import { recifeHHmm } from './lib/format';
import '../public/public.css';

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

  return (
    <div className="tw-page tw-stack" data-testid="m3">
      <header><h1 className="tw-ptitle">Minha disponibilidade</h1><p className="tw-psub">Marque os horários em que você pode mentorar. Horário de Recife.</p></header>
      <div className="tw-row">
        <Button variant="secondary" size="sm" onClick={() => shortcut('morning')} data-testid="m3-morning">Manhã inteira</Button>
        <Button variant="secondary" size="sm" onClick={() => shortcut('afternoon')} data-testid="m3-afternoon">Tarde inteira</Button>
        <Button variant="ghost" size="sm" onClick={() => shortcut('clear')} data-testid="m3-clear">Limpar</Button>
      </div>
      <SlotToggleGrid legend="Horários disponíveis" slots={options} selected={new Set([...selected].filter((id) => !lockedIds.has(id)))}
        onToggle={(id) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
      {selected.size === 0 && <p role="status" data-testid="m3-empty-warning">Você ainda não marcou nenhum horário. Marque ao menos um para poder mentorar.</p>}
      {lockedIds.size > 0 && <p className="tw-field__hint">Horário com mentoria marcada fica travado. Para liberar, cancele a mentoria em Minha agenda.</p>}
      <Button size="lg" block loading={saving} onClick={() => void save()} data-testid="m3-save">Salvar disponibilidade</Button>
    </div>
  );
}
