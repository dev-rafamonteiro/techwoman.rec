import { useEffect, useState } from 'react';
import { ENDPOINTS, type E58Item, type SlotMentor } from '@tw/shared';
import { useToten } from '../../shell/toten/context';
import { ErrorState, ExternalButton, PERIOD_LABELS, RadioCards, SkeletonList, call, formatTime, useQuery } from '../../ui';

type Period = E58Item['period'];
const PERIODS: readonly Period[] = ['morning', 'early_afternoon', 'late_afternoon'];
const NO_PHOTO = '/mentoras/sem-foto.png';
const vagas = (n: number) => `${n} ${n === 1 ? 'vaga' : 'vagas'}`;

export interface SlotChoice {
  slotId: string;
  mentorId: string;
  period: Period;
}

function MentorCard({ mentor, area, checked, onSelect }: { mentor: SlotMentor; area: string; checked: boolean; onSelect: () => void }) {
  const [failed, setFailed] = useState(false);
  const toten = useToten();
  const photo = mentor.photoUrl && !failed ? mentor.photoUrl : NO_PHOTO;
  return (
    <div className="tw-mentor-pick">
      <label className="tw-mentor-pick__main">
        <input type="radio" name="mentor" checked={checked} onChange={onSelect} data-testid={`p4-mentor-${mentor.id}`} />
        <img src={photo} alt="" loading="lazy" decoding="async" width={56} height={56} onError={() => setFailed(true)} />
        <span className="tw-mentor-pick__text">
          <strong>{mentor.name}</strong>
          {mentor.areas.length > 0 && (
            <span className="tw-mentor-pick__tracks" aria-label={`Trilhas: ${mentor.areas.map((a) => a.label).join(', ')}`}>
              {mentor.areas.map((a) => <span key={a.key} className={a.key === area ? 'is-mine' : undefined}>{a.label}</span>)}
            </span>
          )}
          {mentor.bio && <small>{mentor.bio}</small>}
        </span>
      </label>
      {/* no toten o link abriria uma aba sem volta */}
      {mentor.linkedin && !toten && <ExternalButton size="sm" href={mentor.linkedin} target="_blank" rel="noopener noreferrer">Ver LinkedIn</ExternalButton>}
    </div>
  );
}

/** Segunda etapa: até 5 mentoras livres no horário, ao acaso (E59). */
function MentorList({ area, slot, value, onSelect }: { area: string; slot: E58Item; value: string | null; onSelect: (id: string) => void }) {
  const q = useQuery((signal) => call(ENDPOINTS.E59, { signal, params: { slotId: slot.slotId }, query: { area } }), [area, slot.slotId]);
  if (q.status === 'loading') return <SkeletonList rows={3} height={72} />;
  if (q.status === 'error') return <ErrorState error={q.error} onRetry={() => void q.reload()} />;
  if (q.data.items.length === 0) return <p className="tw-field__hint" data-testid="p4-no-mentors">Esse horário acabou de lotar. Escolha outro.</p>;
  return (
    <fieldset className="tw-field" style={{ border: 0, padding: 0, margin: 0 }} data-testid="p4-mentors">
      <legend className="tw-field__label" style={{ padding: 0, marginBottom: 8 }}>Escolha sua mentora às {formatTime(slot.startAt)}</legend>
      {q.data.otherTracks && (
        <p className="tw-field__hint" style={{ marginTop: 0 }} data-testid="p4-other-tracks">
          Nenhuma mentora da sua trilha está livre nesse horário. Estas são de outras trilhas e também podem conversar com você.
        </p>
      )}
      <div className="tw-stack">
        {q.data.items.map((m) => <MentorCard key={m.id} mentor={m} area={area} checked={value === m.id} onSelect={() => onSelect(m.id)} />)}
      </div>
    </fieldset>
  );
}

function Picker({ area, value, onChange, onEmptyChange }: {
  area: string;
  value: SlotChoice | null;
  onChange: (c: SlotChoice | null) => void;
  onEmptyChange: (empty: boolean) => void;
}) {
  const q = useQuery((signal) => call(ENDPOINTS.E58, { signal, query: { area } }), [area]);
  const [period, setPeriod] = useState<Period | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const empty = q.status === 'success' && q.data.items.length === 0;
  useEffect(() => onEmptyChange(empty), [empty, onEmptyChange]);

  if (q.status === 'loading') return <SkeletonList rows={2} height={56} />;
  if (q.status === 'error') return <ErrorState error={q.error} onRetry={() => void q.reload()} />;
  if (empty) {
    return (
      <div className="tw-banner tw-banner--err" role="alert" data-testid="p4-no-slots">
        Não há horários disponíveis nesta trilha. Procure uma organizadora do evento.
      </div>
    );
  }
  const items = q.data.items;
  const total = (p: Period) => items.filter((s) => s.period === p).reduce((n, s) => n + s.available, 0);
  const slots = items.filter((s) => s.period === period);
  const slot = slots.find((s) => s.slotId === slotId) ?? null;
  return (
    <>
      <RadioCards legend="Período" name="period" value={period} stacked
        options={PERIODS.map((p) => ({ value: p, label: `${PERIOD_LABELS[p]} · ${vagas(total(p))}` }))}
        hint="As vagas são uma visão geral da sua trilha, pelas mentoras e mesas livres. A mentora é escolhida na etapa seguinte."
        onChange={(p) => { setPeriod(p); setSlotId(null); onChange(null); }} />
      {period && slots.length === 0 && <p className="tw-field__hint" data-testid="p4-period-empty">Sem vagas nesse período. Escolha outro.</p>}
      {slots.length > 0 && (
        <RadioCards legend="Horário" name="slot" value={slotId} stacked
          options={slots.map((s) => ({ value: s.slotId, label: `${formatTime(s.startAt)} · ${vagas(s.available)}${s.otherTracks ? ' · outras trilhas' : ''}` }))}
          onChange={(id) => { setSlotId(id); onChange(null); }} />
      )}
      {slot && <MentorList area={area} slot={slot} value={value?.mentorId ?? null} onSelect={(mentorId) => onChange({ slotId: slot.slotId, mentorId, period: slot.period })} />}
    </>
  );
}

/** P4 · período com vagas, horário e mentora (E58, E59) · RN24. `refresh` sobe depois de um SLOT_UNAVAILABLE e recomeça a escolha. */
export function SlotMentorPicker({ area, refresh, taken, error, value, onChange, onEmptyChange }: {
  area: string;
  refresh: number;
  taken: boolean;
  error?: string;
  value: SlotChoice | null;
  onChange: (c: SlotChoice | null) => void;
  onEmptyChange: (empty: boolean) => void;
}) {
  return (
    <div className="tw-stack">
      {taken && <div className="tw-banner tw-banner--err" role="alert" data-testid="p4-taken">Essa vaga acabou de ser ocupada. Escolha outro horário ou mentora.</div>}
      <Picker key={`${area}:${refresh}`} area={area} value={value} onChange={onChange} onEmptyChange={onEmptyChange} />
      {error && <span className="tw-field__error" role="alert" data-testid="p4-mentor-error"><span aria-hidden="true">⚠ </span>{error}</span>}
    </div>
  );
}
