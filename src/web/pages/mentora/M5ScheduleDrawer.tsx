import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ENDPOINTS, type E23Response, type MenteeStaffView } from '@tw/shared';
import { ApiError, Button, ErrorState, MenteeCard, Overlay, SkeletonList, SlotSingleChoice, TablePicker, call, formatTime, useToast } from '../../ui';

/**
 * M5 · Agendar mentoria (gaveta no celular, modal no desktop). E23 a cada troca de horário, E24 ao enviar · RN04, RN05, RN13.
 *
 * Reutilizado por A4 (agendar manualmente): o admin passa `loadOptions(slotId)` e `onSubmit(...)` próprios
 * (E38 + E39Create), `mentorPicker` (seletor de mentora) e `warnings` (avisos de override, RN04).
 * `loadOptions` devolve o formato de E23; ambos lançam ApiError em falha (409 trata os conflitos).
 */
export interface ScheduleDrawerProps {
  open: boolean;
  onClose: () => void;
  mentee: MenteeStaffView | null;
  areaLabel: (key: string) => string;
  /** Padrão: E23 da mentora. `slotId` ausente = horário preferido/primeiro livre. */
  loadOptions?: (slotId?: string) => Promise<E23Response>;
  /** Padrão: E24. Deve lançar ApiError em conflito (409). `mentorId` só é preenchido quando a prop `mentorId` é passada (admin). */
  onSubmit?: (input: { menteeId: string; slotId: string; tableId: string; mentorId?: string }) => Promise<unknown>;
  /** Mentora escolhida (admin). Mudar o valor recarrega as opções. */
  mentorId?: string;
  /** Seletor de mentora (A4), mostrado no topo. */
  mentorPicker?: ReactNode;
  /** Avisos de override do admin (RN04), mostrados acima do botão. */
  warnings?: readonly string[];
  /** Chamado após o convite enviado, ou quando um conflito exige atualizar a tela de trás (ex.: refetch de M4). */
  onDone: (result: 'sent' | 'conflict') => void;
  /** Rótulo do botão. Padrão: "Enviar convite". */
  submitLabel?: string;
  /** Texto de apoio abaixo do botão. */
  helpText?: string;
  /** Horário já escolhido ao abrir (ex.: a mentora tocou num horário livre da agenda, M6). Padrão: o preferido dela. */
  initialSlotId?: string;
}

/** Mensagem curta por details.reason de SLOT_UNAVAILABLE (RN04). */
const UNAVAILABLE_TEXT: Record<string, string> = {
  lead_time: 'Esse horário está muito próximo para enviar o convite.',
  not_available: 'Você não está disponível nesse horário.',
  not_in_event: 'Esse horário não faz parte do evento.',
  mentor_inactive: 'Sua conta não pode enviar convites agora.',
  table_inactive: 'Essa mesa não está ativa.',
};

const defaultSubmit = ({ menteeId, slotId, tableId }: { menteeId: string; slotId: string; tableId: string }) => call(ENDPOINTS.E24, { body: { menteeId, slotId, tableId } });

export function M5ScheduleDrawer({ open, onClose, mentee, areaLabel, loadOptions, onSubmit = defaultSubmit, mentorId, mentorPicker, warnings, onDone, initialSlotId, submitLabel = 'Enviar convite', helpText = 'Ela tem até 15 min para confirmar; se não confirmar, o horário volta a ficar livre.' }: ScheduleDrawerProps) {
  const toast = useToast();
  const [opts, setOpts] = useState<E23Response | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const loadRef = useRef<(slotId?: string) => Promise<E23Response>>(async () => { throw new Error('sem mentee'); });
  loadRef.current = loadOptions ?? ((slotId) => call(ENDPOINTS.E23, { query: { menteeId: mentee!.id, ...(slotId ? { slotId } : {}) } }));

  const load = useCallback(async (slot?: string, keepTable = false) => {
    if (!mentee) return;
    try {
      const r = await loadRef.current(slot);
      setOpts(r);
      setError(null);
      setSlotId(r.selectedSlotId);
      setTableId((prev) => {
        const free = (id: string | null) => !!id && r.tables.some((t) => t.id === id && t.free);
        if (keepTable && free(prev)) return prev;
        return free(r.suggestedTableId) ? r.suggestedTableId : null;
      });
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK', 'Sem conexão.'));
    }
  }, [mentee]);

  useEffect(() => {
    if (open && mentee) {
      setOpts(null);
      setError(null);
      setSlotId(null);
      setTableId(null);
      void load(initialSlotId);
    }
  }, [open, mentee?.id, mentorId, initialSlotId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mentee) return null;
  const first = mentee.name.split(' ')[0];

  async function send() {
    if (!mentee || !slotId || !tableId) return;
    setSending(true);
    try {
      await onSubmit({ menteeId: mentee.id, slotId, tableId, ...(mentorId ? { mentorId } : {}) });
      toast.success(`Convite enviado para ${first}.`);
      onClose();
      onDone('sent');
    } catch (e) {
      const ae = e as ApiError;
      const slotText = opts?.slots.find((s) => s.id === slotId);
      const when = slotText ? formatTime(slotText.startAt) : '';
      const table = opts?.tables.find((t) => t.id === tableId);
      if (ae.code === 'MENTEE_TAKEN') {
        toast.conflict(`Outra mentora acabou de convidar a ${first}`, () => onDone('conflict'));
        onClose();
        onDone('conflict');
      } else if (ae.code === 'TABLE_TAKEN') {
        toast.conflict(`${table ? `A Mesa ${table.number}` : 'A mesa'} acabou de ser ocupada nesse horário`, () => void load(slotId ?? undefined));
        void load(slotId ?? undefined);
      } else if (ae.code === 'MENTOR_BUSY') {
        toast.conflict(`Você já tem uma mentoria às ${when}`, () => void load());
        void load();
      } else if (ae.code === 'SLOT_UNAVAILABLE') {
        const reason = (ae.details as { reason?: string } | undefined)?.reason;
        toast.conflict(UNAVAILABLE_TEXT[reason ?? ''] ?? 'Esse horário não está mais disponível.', () => void load());
        void load();
      } else if (ae.isConflict) {
        toast.conflict(ae.message || 'Não foi possível agendar. Atualize e tente de novo.', () => void load());
        void load();
      } else toast.error(ae.message || 'Não foi possível enviar o convite. Tente de novo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Overlay title="Agendar mentoria" open={open} onClose={onClose}>
      <div className="tw-stack" data-testid="m5">
        {mentorPicker}
        <MenteeCard mentee={mentee} areaLabel={areaLabel} variant="full" />
        {error ? (
          <ErrorState error={error} onRetry={() => void load(slotId ?? undefined)} />
        ) : !opts ? (
          <SkeletonList rows={3} height={56} />
        ) : opts.slots.length === 0 ? (
          <p role="status" data-testid="m5-no-slots">Você não tem horários livres disponíveis. Ajuste sua disponibilidade para mentorar.</p>
        ) : (
          <>
            <SlotSingleChoice legend="Horário" value={slotId}
              slots={opts.slots.map((s) => ({ id: s.id, label: formatTime(s.startAt), preferred: s.preferred, caption: 'Livre' }))}
              onChange={(id) => { setSlotId(id); void load(id, true); }} />
            <TablePicker tables={opts.tables.map((t) => ({ id: t.id, number: t.number, name: t.name, location: t.location, busy: !t.free }))}
              value={tableId} onChange={setTableId} suggestedId={opts.suggestedTableId} />
            {warnings && warnings.length > 0 && (
              <ul className="tw-card" role="status" data-testid="m5-warnings">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            )}
            <Button size="lg" block loading={sending} disabled={!slotId || !tableId} onClick={() => void send()} data-testid="m5-send">{submitLabel}</Button>
            <p className="tw-field__hint">{helpText}</p>
          </>
        )}
      </div>
    </Overlay>
  );
}

export default M5ScheduleDrawer;
