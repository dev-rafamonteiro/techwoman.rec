import { useEffect, useMemo, useState } from 'react';
import { ENDPOINTS, type E53Body, type MenteeStaffView, type PreferredPeriod, type Slot } from '@tw/shared';
import { ApiError, Button, CheckboxField, ErrorState, MenteeCard, Overlay, SelectField, TextArea, TextField, call } from '../../ui';

type Mode = 'existing' | 'new';
type Area = { key: string; label: string };
type NewAttendee = {
  name: string;
  email: string;
  phone: string;
  linkedin: string;
  area: string;
  preferredPeriod: PreferredPeriod;
  note: string;
  consentAccepted: boolean;
};

const EMPTY_ATTENDEE: NewAttendee = {
  name: '',
  email: '',
  phone: '',
  linkedin: '',
  area: '',
  preferredPeriod: 'any',
  note: '',
  consentAccepted: false,
};

const PERIOD_OPTIONS: { value: PreferredPeriod; label: string }[] = [
  { value: 'morning', label: 'Manhã' },
  { value: 'early_afternoon', label: 'Início da tarde' },
  { value: 'late_afternoon', label: 'Fim da tarde' },
  { value: 'any', label: 'Qualquer horário' },
];

export function M6ExtraSessionDrawer({
  open, onClose, slots, areas, now, areaLabel, onDone,
}: {
  open: boolean;
  onClose: () => void;
  slots: Slot[];
  areas: readonly Area[];
  now: number;
  areaLabel: (key: string) => string;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>('existing');
  const [slotId, setSlotId] = useState('');
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<MenteeStaffView[] | null>(null);
  const [selected, setSelected] = useState<MenteeStaffView | null>(null);
  const [attendee, setAttendee] = useState<NewAttendee>(EMPTY_ATTENDEE);
  const [consentError, setConsentError] = useState(false);
  const [searchError, setSearchError] = useState<ApiError | null>(null);
  const [searchRetry, setSearchRetry] = useState(0);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [sending, setSending] = useState(false);
  const [searching, setSearching] = useState(false);
  const completedSlots = useMemo(() => slots.filter((slot) => new Date(slot.endAt).getTime() <= now), [slots, now]);

  useEffect(() => {
    if (!open) return;
    setMode('existing');
    setSlotId('');
    setSearch('');
    setMatches(null);
    setSelected(null);
    setAttendee({ ...EMPTY_ATTENDEE, area: areas[0]?.key ?? '' });
    setConsentError(false);
    setSearchError(null);
    setSubmitError(null);
  }, [open, areas]);

  useEffect(() => {
    const q = search.trim();
    if (!open || mode !== 'existing' || q.length < 2 || selected) {
      setMatches(null);
      setSearchError(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      call(ENDPOINTS.E52, { query: { q }, signal: controller.signal })
        .then((result) => { setMatches(result.items); setSearchError(null); })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setSearchError(error instanceof ApiError ? error : new ApiError(0, 'NETWORK', 'Sem conexão.'));
        })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, mode, search, selected, searchRetry]);

  function setField<K extends keyof NewAttendee>(key: K, value: NewAttendee[K]) {
    setAttendee((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setSubmitError(null);
    if (!slotId) {
      setSubmitError(new ApiError(0, 'VALIDATION_ERROR', 'Escolha o horário da sessão realizada.'));
      return;
    }
    if (mode === 'existing' && !selected) {
      setSubmitError(new ApiError(0, 'VALIDATION_ERROR', 'Busque e selecione a mentorada atendida.'));
      return;
    }
    if (mode === 'new' && !attendee.consentAccepted) {
      setConsentError(true);
      return;
    }

    const body: E53Body = mode === 'existing'
      ? { type: 'existing', slotId, menteeId: selected!.id }
      : {
          type: 'new',
          slotId,
          attendee: {
            name: attendee.name,
            email: attendee.email,
            phone: attendee.phone,
            linkedin: attendee.linkedin || undefined,
            area: attendee.area,
            preferredPeriod: attendee.preferredPeriod,
            note: attendee.note || undefined,
            consentAccepted: true,
          },
        };
    setSending(true);
    try {
      await call(ENDPOINTS.E53, { body });
      onDone();
      onClose();
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error : new ApiError(0, 'NETWORK', 'Não foi possível registrar. Tente de novo.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Overlay title="Registrar sessão extra realizada" open={open} onClose={onClose}>
      <div className="tw-stack" data-testid="m6-extra-session">
        <p>O registro será salvo como realizado e não enviará convite nem notificação à mentorada. Selecione um horário já encerrado.</p>
        <SelectField label="Horário da sessão" value={slotId} onChange={(event) => setSlotId(event.target.value)} data-testid="m6-extra-slot">
          <option value="">Escolha um horário</option>
          {completedSlots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Recife', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(slot.startAt))}
              {' – '}
              {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Recife', hour: '2-digit', minute: '2-digit' }).format(new Date(slot.endAt))}
            </option>
          ))}
        </SelectField>
        {completedSlots.length === 0 && <p role="status">Ainda não há horários encerrados disponíveis para registrar.</p>}

        <div className="tw-btnrow" role="group" aria-label="Tipo de cadastro">
          <Button variant={mode === 'existing' ? 'primary' : 'secondary'} onClick={() => { setMode('existing'); setSelected(null); setSubmitError(null); }} aria-pressed={mode === 'existing'}>Já cadastrada</Button>
          <Button variant={mode === 'new' ? 'primary' : 'secondary'} onClick={() => { setMode('new'); setSelected(null); setSubmitError(null); }} aria-pressed={mode === 'new'}>Nova mentorada</Button>
        </div>

        {mode === 'existing' ? (
          selected ? (
            <div className="tw-stack">
              <MenteeCard mentee={selected} areaLabel={areaLabel} variant="full" />
              <Button variant="secondary" onClick={() => setSelected(null)}>Trocar mentorada</Button>
            </div>
          ) : (
            <>
              <TextField label="Buscar mentorada cadastrada" type="search" value={search} onChange={(event) => setSearch(event.target.value)} hint="Digite pelo menos 2 letras do nome." data-testid="m6-extra-search" />
              {searchError && <ErrorState error={searchError} onRetry={() => setSearchRetry((value) => value + 1)} />}
              {searching && <p role="status">Buscando…</p>}
              {matches?.length ? (
                <ul className="m4-list">
                  {matches.map((mentee) => (
                    <li key={mentee.id}>
                      <MenteeCard mentee={mentee} areaLabel={areaLabel}
                        actions={<Button onClick={() => setSelected(mentee)}>Selecionar</Button>} />
                    </li>
                  ))}
                </ul>
              ) : matches && <p role="status">Nenhuma mentorada encontrada.</p>}
            </>
          )
        ) : (
          <>
            <TextField label="Nome completo" value={attendee.name} onChange={(event) => setField('name', event.target.value)} />
            <TextField label="E-mail" type="email" autoComplete="email" value={attendee.email} onChange={(event) => setField('email', event.target.value)} />
            <TextField label="WhatsApp" type="tel" value={attendee.phone} onChange={(event) => setField('phone', event.target.value)} />
            <TextField label="LinkedIn" optional value={attendee.linkedin} onChange={(event) => setField('linkedin', event.target.value)} />
            <SelectField label="Área de interesse" value={attendee.area} onChange={(event) => setField('area', event.target.value)}>
              <option value="">Escolha uma área</option>
              {areas.map((area) => <option key={area.key} value={area.key}>{area.label}</option>)}
            </SelectField>
            <SelectField label="Período preferido" value={attendee.preferredPeriod} onChange={(event) => setField('preferredPeriod', event.target.value as PreferredPeriod)}>
              {PERIOD_OPTIONS.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
            </SelectField>
            <TextArea label="Comentário" optional rows={3} maxLength={500} value={attendee.note} onChange={(event) => setField('note', event.target.value)} />
            <CheckboxField label="A mentorada autorizou o registro desses dados para a mentoria." checked={attendee.consentAccepted}
              error={consentError ? 'Confirme a autorização da mentorada.' : undefined}
              onChange={(event) => { setField('consentAccepted', event.target.checked); setConsentError(false); }} />
          </>
        )}

        {submitError && <p role="alert">{submitError.message}</p>}
        <Button size="lg" block loading={sending} disabled={!slotId || completedSlots.length === 0 || (mode === 'new' && areas.length === 0)} onClick={() => void submit()} data-testid="m6-extra-save">Salvar como realizada</Button>
      </div>
    </Overlay>
  );
}
