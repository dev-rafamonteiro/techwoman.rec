import { useEffect, useState, type FormEvent } from 'react';
import { ENDPOINTS, SEARCH_Q_MAX, SEARCH_Q_MIN, WALK_IN_NOTE_MAX, type Area, type E50Response, type E51Body, type E51Response, type ScheduledTable, type WalkInSituation } from '@tw/shared';
import { ApiError, Button, CheckboxField, EmptyState, ErrorState, MenteeCard, Overlay, SelectField, SkeletonList, StatusBadge, TextArea, TextField, call, formatTime, maskPhone, useToast, type BadgeStatus } from '../../ui';

type Found = E50Response['items'][number];
type NewForm = { name: string; email: string; phone: string; area: string; consent: boolean; note: string };
const EMPTY_FORM: NewForm = { name: '', email: '', phone: '', area: '', consent: false, note: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Selo da situação (RN21): texto da tela sobre a cor de status existente. */
const SITUATION: Record<WalkInSituation, { status: BadgeStatus; label: (f: Found) => string }> = {
  waiting: { status: 'waiting', label: () => 'Na fila' },
  scheduled: { status: 'confirmed', label: (f) => (f.startAt ? `Mentoria agendada às ${formatTime(f.startAt)}` : 'Mentoria agendada') },
  done: { status: 'done', label: () => 'Já atendida' },
  no_show: { status: 'no_show', label: () => 'Não compareceu' },
  walked_in_by_me: { status: 'done', label: () => 'Atendida por você fora da mesa' },
};

function validate(f: NewForm): Partial<Record<keyof NewForm, string>> {
  const e: Partial<Record<keyof NewForm, string>> = {};
  if (f.name.trim().length < 2) e.name = 'Informe o nome.';
  if (!EMAIL_RE.test(f.email.trim())) e.email = 'Informe um e-mail válido.';
  if (f.phone && f.phone.replace(/\D/g, '').length < 10) e.phone = 'Use DDD + número: (00) 00000-0000.';
  if (!f.area) e.area = 'Escolha a trilha.';
  if (!f.consent) e.consent = 'Ela precisa concordar com o aviso de privacidade.';
  return e;
}

/** Aviso da mentoria na mesa que o registro cancela (RN21). */
export function scheduledWarning(name: string, sc: ScheduledTable): string {
  return `${name} tem mentoria marcada às ${formatTime(sc.startAt)} na ${sc.tableLabel} com ${sc.mentorName}. Ao registrar o atendimento fora da mesa, essa mentoria será cancelada.`;
}

/** Mensagem do toast de sucesso conforme o que a API fez (ela sempre recebe o e-mail do atendimento). */
export function successText(r: E51Response): string {
  const first = r.name.split(' ')[0];
  const head = r.outcome === 'linked' ? `Esse e-mail já estava inscrito: o atendimento foi registrado para ${r.name}.` : `Atendimento com ${first} registrado.`;
  const sc = r.cancelledAppointment;
  const cancelled = sc ? ` A mentoria das ${formatTime(sc.startAt)} na ${sc.tableLabel} com ${sc.mentorName} foi cancelada.` : '';
  return `${head}${cancelled} Ela vai receber por e-mail o agradecimento e o link para avaliar a mentoria.`;
}

/**
 * M7 · Atendimento fora da mesa (RN21; E50, E51). Aberta pelo M6. Busca a participante (tolerante a erro de
 * digitação, 300 ms, mínimo 2 letras) e registra; não achou, faz o cadastro rápido com o aceite do aviso de
 * privacidade e confere o e-mail antes de enviar. Não usa mesa nem horário.
 */
export function M7ForaDaMesa({ open, onClose, onDone, areas, areaLabel }: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  areas: readonly Area[];
  areaLabel: (key: string) => string;
}) {
  const toast = useToast();
  const [step, setStep] = useState<'search' | 'new' | 'confirm'>('search');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Found[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [chosen, setChosen] = useState<Found | null>(null);
  const [note, setNote] = useState('');
  const [form, setForm] = useState<NewForm>(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [retry, setRetry] = useState(0);

  // ao abrir: tudo limpo
  useEffect(() => {
    if (!open) return;
    setStep('search');
    setSearch('');
    setQ('');
    setItems(null);
    setChosen(null);
    setNote('');
    setForm(EMPTY_FORM);
    setTouched(false);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim().length >= SEARCH_Q_MIN ? search.trim().slice(0, SEARCH_Q_MAX) : ''), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open || !q) { setItems(null); return; }
    const ctrl = new AbortController();
    setItems(null);
    setError(null);
    call(ENDPOINTS.E50, { query: { q }, signal: ctrl.signal })
      .then((r) => { setItems(r.items); setError(null); })
      .catch((e) => { if (!ctrl.signal.aborted) setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK', 'Sem conexão.')); });
    return () => ctrl.abort();
  }, [open, q, retry]);

  async function submit(body: E51Body) {
    setSending(true);
    try {
      const r = await call(ENDPOINTS.E51, { body });
      toast.success(successText(r));
      onDone();
    } catch (e) {
      const ae = e instanceof ApiError ? e : new ApiError(0, 'NETWORK', 'Sem conexão.');
      toast.error(ae.message || 'Não foi possível registrar. Tente de novo.');
      // a situação mudou (ou ela já foi registrada): volta à busca e refaz a consulta para o selo ficar certo
      if (ae.isConflict) { setChosen(null); setRetry((n) => n + 1); }
    } finally {
      setSending(false);
    }
  }

  const errors = validate(form);
  const shown = (k: keyof NewForm) => (touched ? errors[k] : undefined);
  const set = <K extends keyof NewForm>(k: K, v: NewForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const goConfirm = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length === 0) setStep('confirm');
  };
  const newBody = (): E51Body => ({
    newMentee: { name: form.name.trim(), email: form.email.trim(), ...(form.phone ? { phone: form.phone } : {}), area: form.area },
    consentAccepted: true,
    ...(form.note.trim() ? { note: form.note.trim() } : {}),
  });
  const noteField = (value: string, onChange: (v: string) => void) => (
    <TextArea label="Anotação" optional rows={2} maxLength={WALK_IN_NOTE_MAX} value={value} onChange={(e) => onChange(e.target.value)}
      hint="Só a organização vê. Ex.: assunto da conversa." data-testid="m7-note" />
  );

  return (
    <Overlay title="Atendimento fora da mesa" open={open} onClose={onClose}>
      <div className="tw-stack" data-testid="m7">
        {step === 'search' && (
          chosen ? (
            <>
              <MenteeCard mentee={chosen.mentee} areaLabel={areaLabel} variant="full" />
              <p className="mt-hint">Registra a conversa que você teve com {chosen.mentee.name.split(' ')[0]} fora das mesas. Ela fica como atendida, não entra na fila e recebe por e-mail o agradecimento com o seu nome, o seu LinkedIn e o link para avaliar.</p>
              {chosen.scheduled && <p className="m7-warning" role="alert" data-testid="m7-scheduled-warning">{scheduledWarning(chosen.mentee.name, chosen.scheduled)}</p>}
              {noteField(note, setNote)}
              <Button block variant={chosen.scheduled ? 'danger' : 'primary'} loading={sending} onClick={() => void submit({ menteeId: chosen.mentee.id, ...(note.trim() ? { note: note.trim() } : {}) })} data-testid="m7-confirm-existing">
                {chosen.scheduled ? 'Cancelar a mentoria e registrar' : 'Registrar atendimento'}
              </Button>
              <Button variant="ghost" block onClick={() => setChosen(null)}>Voltar à busca</Button>
            </>
          ) : (
            <>
              <p className="mt-hint">Conversou com uma participante fora das mesas? Busque pelo nome e registre. Não usa mesa nem horário.</p>
              <TextField label="Buscar participante" type="search" autoFocus maxLength={SEARCH_Q_MAX} value={search} onChange={(e) => setSearch(e.target.value)}
                hint="Digite pelo menos 2 letras. Erros de digitação são aceitos." data-testid="m7-search" />
              {!q ? null : error && !items ? (
                <ErrorState error={error} title="Não foi possível buscar" onRetry={() => setRetry((n) => n + 1)} />
              ) : !items ? (
                <SkeletonList rows={2} height={100} />
              ) : items.length === 0 ? (
                <EmptyState title="Ninguém encontrado" text="Confira o nome ou faça o cadastro rápido." />
              ) : (
                <ul className="m4-list" data-testid="m7-results">
                  {items.map((f) => {
                    const look = SITUATION[f.situation];
                    const mine = f.situation === 'walked_in_by_me';
                    return (
                      <li key={f.mentee.id}>
                        <MenteeCard mentee={f.mentee} areaLabel={areaLabel}
                          actions={<>
                            <StatusBadge status={look.status} label={look.label(f)} />
                            <Button size="sm" disabled={mine} onClick={() => { setChosen(f); setNote(''); }} data-testid="m7-pick">Registrar</Button>
                          </>} />
                      </li>
                    );
                  })}
                </ul>
              )}
              <Button variant="secondary" block onClick={() => { setStep('new'); setForm((f) => ({ ...f, name: f.name || (/@/.test(search) ? '' : search.trim()) })); }} data-testid="m7-new">
                Não achei, cadastrar
              </Button>
            </>
          )
        )}

        {step === 'new' && (
          <form className="tw-stack" onSubmit={goConfirm} noValidate data-testid="m7-form">
            <p className="mt-hint">Cadastro rápido: ela fica como atendida e recebe por e-mail o agradecimento com o seu nome, o seu LinkedIn e o link da página dela, onde pode avaliar a mentoria.</p>
            <TextField label="Nome" autoComplete="off" maxLength={120} value={form.name} error={shown('name')} onChange={(e) => set('name', e.target.value)} data-testid="m7-name" />
            <TextField label="E-mail" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" maxLength={254} value={form.email} error={shown('email')} onChange={(e) => set('email', e.target.value)} data-testid="m7-email" />
            <TextField label="Celular" optional type="tel" inputMode="tel" placeholder="(00) 00000-0000" value={form.phone} error={shown('phone')} onChange={(e) => set('phone', maskPhone(e.target.value))} data-testid="m7-phone" />
            <SelectField label="Trilha" value={form.area} error={shown('area')} onChange={(e) => set('area', e.target.value)} data-testid="m7-area">
              <option value="">Escolha…</option>
              {areas.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </SelectField>
            {noteField(form.note, (v) => set('note', v))}
            <CheckboxField label={<>Ela concordou com o <a className="tw-link" href="/privacidade" target="_blank" rel="noopener noreferrer">aviso de privacidade</a></>}
              checked={form.consent} error={shown('consent')} onChange={(e) => set('consent', e.target.checked)} data-testid="m7-consent" />
            <Button type="submit" block data-testid="m7-continue">Continuar</Button>
            <Button variant="ghost" block onClick={() => setStep('search')}>Voltar à busca</Button>
          </form>
        )}

        {step === 'confirm' && (
          <div className="tw-stack" data-testid="m7-confirm">
            <p className="m7-email-label">Confira o e-mail:</p>
            <p className="m7-email" data-testid="m7-email-check">{form.email.trim().toLowerCase()}</p>
            <p className="mt-hint">É para ele que vai o link da participante. Leia junto com ela antes de registrar.</p>
            <Button block loading={sending} onClick={() => void submit(newBody())} data-testid="m7-submit">E-mail certo, registrar</Button>
            <Button variant="secondary" block disabled={sending} onClick={() => setStep('new')} data-testid="m7-fix">Corrigir</Button>
          </div>
        )}
      </div>
    </Overlay>
  );
}
