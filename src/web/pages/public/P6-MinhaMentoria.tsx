import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ENDPOINTS, type E03Response, type E07Item, type PreferredPeriod } from '@tw/shared';
import {
  ApiError, type BodyOf, Button, Card, Countdown, EmptyState, ErrorState, ExternalButton, LinkButton, PERIOD_LABELS, RadioCards, SkeletonList, SlotSingleChoice,
  StatusBadge, PriorityBadge, TextField, call, endpointUrl, formatDayShort, formatRange, formatTime, getMenteeToken, setMenteeToken, useQuery, useToast, usePolling,
} from '../../ui';
import { track } from '../../analytics';
import { FALLBACK_AREAS } from './lib/areas';
import { mountTurnstile, type TurnstileHandle } from './lib/turnstile';
import './public.css';

type Me = E03Response;
const PERIODS = (Object.entries(PERIOD_LABELS) as [PreferredPeriod, string][]).map(([value, label]) => ({ value, label }));
const tableLabel = (t: { number: number; name: string | null }) => `Mesa ${t.number}${t.name ? ` · ${t.name}` : ''}`;

/** Link inválido: "Não encontramos sua inscrição" + reenvio por e-mail (E05). */
function InvalidLink() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const ts = useRef<TurnstileHandle | null>(null);
  useEffect(() => {
    let alive = true;
    if (box.current) mountTurnstile(box.current).then((h) => (alive ? (ts.current = h) : h.destroy()), () => undefined);
    return () => {
      alive = false;
      ts.current?.destroy();
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('Informe um e-mail válido.');
      return;
    }
    setError(null);
    setState('sending');
    try {
      if (!ts.current) throw new ApiError(0, 'TURNSTILE_FAILED', 'Não foi possível verificar que você é uma pessoa. Recarregue a página.');
      const turnstileToken = await ts.current.getToken();
      await call(ENDPOINTS.E05, { body: { email: email.trim(), turnstileToken } });
      track('link_reenviado');
      setState('sent');
    } catch (err) {
      setState('idle');
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar agora. Tente de novo.');
    }
  }

  return (
    <div className="tw-page tw-stack" data-testid="p6-invalid" style={{ paddingTop: "var(--space-6)" }}>
      <span className="tw-qmark" aria-hidden="true">?</span>
      <h1 className="tw-title tw-title--ink">Não encontramos sua inscrição</h1>
      <p>O link pode estar incompleto. Informe seu e-mail e enviamos o link certo.</p>
      {state === 'sent' ? (
        <Card accent><p role="status" data-testid="p6-resent">Link enviado ✓ Confira seu e-mail</p></Card>
      ) : (
        <form className="tw-stack" onSubmit={submit} noValidate>
          <TextField label="E-mail da inscrição" placeholder="voce@email.com" type="email" inputMode="email" autoComplete="email" value={email} error={error ?? undefined}
            onChange={(e) => setEmail(e.target.value)} data-testid="p6-resend-email" />
          <div ref={box} aria-hidden="true" />
          <Button type="submit" block loading={state === 'sending'} data-testid="p6-resend">Reenviar link por e-mail</Button>
        </form>
      )}
    </div>
  );
}

/** "Escolha um novo horário" (E07, E08) · RN19: só em waiting com lastOutcome = declined_schedule. Erro de E07 fica neste bloco. */
function ChooseSlot({ onBooked, onStale }: { onBooked: (next: Me) => void; onStale: () => void }) {
  const toast = useToast();
  const q = useQuery((signal) => call(ENDPOINTS.E07, { signal }), []);
  const [pending, setPending] = useState<E07Item | null>(null);
  const [booking, setBooking] = useState(false);
  const [taken, setTaken] = useState(false);

  async function book(slot: E07Item) {
    setBooking(true);
    try {
      const next = await call(ENDPOINTS.E08, { body: { slotId: slot.slotId } });
      track('horario_escolhido');
      setPending(null);
      onBooked(next);
    } catch (e) {
      const ae = e instanceof ApiError ? e : new ApiError(0, 'NETWORK', 'Sem conexão.');
      setPending(null);
      if (ae.code === 'SLOT_UNAVAILABLE') {
        // Outra pessoa pegou o horário entre a lista e o toque: avisa e recarrega a lista.
        setTaken(true);
        void q.refetch();
      } else if (ae.code === 'INVALID_STATE') onStale();
      else toast.error(ae.message || 'Não foi possível concluir agora. Tente de novo.');
    } finally {
      setBooking(false);
    }
  }

  let content: JSX.Element;
  if (q.status === 'loading') content = <SkeletonList rows={3} height={56} />;
  else if (q.status === 'error') content = <ErrorState error={q.error} onRetry={() => void q.reload()} />;
  else if (q.data.items.length === 0) content = <EmptyState title="Nenhum horário livre agora" text="Nenhum horário livre agora. Você continua na fila com prioridade e uma mentora pode te chamar." />;
  else if (pending) {
    content = (
      <div role="alertdialog" aria-label="Confirmar horário" className="tw-stack" data-testid="p6-book-dialog">
        <strong>Confirmar mentoria às {formatTime(pending.startAt)}?</strong>
        <span>{formatRange(pending.startAt, pending.endAt)} · horário de Recife</span>
        <div className="tw-btnrow">
          <Button size="sm" loading={booking} onClick={() => void book(pending)} data-testid="p6-book-confirm">Confirmar</Button>
          <Button variant="secondary" size="sm" disabled={booking} onClick={() => setPending(null)} data-testid="p6-book-back">Voltar</Button>
        </div>
      </div>
    );
  } else {
    const items = q.data.items;
    content = (
      <>
        {taken && <p className="tw-slotmsg" role="alert" data-testid="p6-slot-taken">Esse horário acabou de ser ocupado. Escolha outro.</p>}
        <SlotSingleChoice legend="Horários livres" value={null} preferredLabel="Seu período preferido" testId="p6-slots" itemTestId="p6-slot"
          slots={items.map((i) => ({ id: i.slotId, label: formatTime(i.startAt), caption: formatRange(i.startAt, i.endAt), preferred: i.matchesPeriod }))}
          onChange={(id) => {
            setTaken(false);
            setPending(items.find((i) => i.slotId === id) ?? null);
          }} />
      </>
    );
  }

  return (
    <Card accent>
      <div className="tw-stack tw-p6-choose" data-testid="p6-choose">
        <h2>Escolha um novo horário</h2>
        {content}
      </div>
    </Card>
  );
}

/** Evento de uso de cada ação de E04 que deu certo (docs/UI-SPEC.md > Medição de uso). */
function trackAction(body: BodyOf<typeof ENDPOINTS.E04>) {
  if (body.action === 'accept') track('convite_aceito');
  else if (body.action === 'decline') track('convite_recusado', { motivo: body.reason === 'schedule' ? 'horario' : 'sem_interesse' });
  else if (body.action === 'cancel') track('inscricao_cancelada');
  else if (body.action === 'reschedule') track('horario_trocado');
  else if (body.action === 'update_preference') track('preferencia_atualizada', { periodo: body.preferredPeriod });
}

/** P6 · Minha mentoria (E03, E04, E07, E08) · RN05, RN06, RN07, RN19 */
export default function P6MinhaMentoria() {
  const [params] = useSearchParams();
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [period, setPeriod] = useState<PreferredPeriod | null>(null);
  const [freshAt, setFreshAt] = useState<number | null>(null);

  const token = params.get('t');
  useEffect(() => {
    if (token) {
      setMenteeToken(token);
      // Tira o token da barra de endereço (histórico, capturas de tela); ele fica só na sessão.
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, [token]);

  const load = useCallback(async (silent: boolean) => {
    if (!token && !getMenteeToken()) {
      setInvalid(true);
      return;
    }
    if (token) setMenteeToken(token);
    try {
      const data = await call(ENDPOINTS.E03);
      setMe(data);
      setInvalid(false);
      setError(null);
      setFreshAt(Date.now());
    } catch (e) {
      const ae = e instanceof ApiError ? e : new ApiError(0, 'NETWORK', 'Sem conexão.');
      if (ae.status === 401 || ae.status === 404) setInvalid(true);
      else if (!silent) setError(ae);
    }
  }, [token]);

  useEffect(() => {
    void load(false);
  }, [load]);
  usePolling(() => load(true), 30000, !invalid);

  async function act(key: string, body: BodyOf<typeof ENDPOINTS.E04>, ok?: string) {
    setBusy(key);
    try {
      const next = await call(ENDPOINTS.E04, { body });
      trackAction(body);
      setMe(next);
      setFreshAt(Date.now());
      setDeclining(false);
      setConfirmCancel(false);
      setEditing(false);
      if (ok) toast.success(ok);
    } catch (e) {
      const ae = e as ApiError;
      if (ae.code === 'INVITE_EXPIRED') {
        // O convite expirou: recarrega e a tela mostra "O prazo para responder terminou" (você continua na fila).
        void load(true);
      } else if (ae.isConflict) {
        toast.conflict(ae.message, () => void load(true));
        void load(true);
      } else toast.error(ae.message || 'Não foi possível concluir agora. Tente de novo.');
    } finally {
      setBusy(null);
    }
  }

  if (invalid) return <InvalidLink />;
  if (error) return <div className="tw-page"><ErrorState error={error} onRetry={() => { setError(null); void load(false); }} /></div>;
  if (!me) return <div className="tw-page"><SkeletonList rows={3} height={90} /></div>;

  const { mentee, appointment: ap, lastOutcome, event, serverNow } = me;
  const area = FALLBACK_AREAS.find((a) => a.key === mentee.area)?.label ?? mentee.area;
  const first = mentee.name.split(' ')[0];
  const fresh = <p className="tw-fresh" data-testid="p6-fresh">{(freshAt && Date.now() - freshAt < 60000 ? 'Atualizado agora' : 'Atualizada') + ' · esta página se atualiza sozinha'}</p>;
  const li = (v: string) => (/^https?:/i.test(v) ? v : v.includes('linkedin.com') ? `https://${v}` : `https://www.linkedin.com/in/${v}`);

  // Confirmada: "Cancelar" abre a escolha entre trocar de horário (RN19) e encerrar a inscrição.
  const cancelChoice = (
    <div role="alertdialog" aria-label="Cancelar mentoria" className="tw-stack" data-testid="p6-cancel-dialog">
      <strong>O que você prefere?</strong>
      <button type="button" className="tw-choice" disabled={busy !== null} onClick={() => void act('reschedule', { action: 'reschedule' }, 'Mentoria cancelada. Escolha um novo horário.')} data-testid="p6-reschedule">
        Trocar de horário<small>Esta mentoria é cancelada e você volta para a fila com prioridade para escolher outro horário.</small>
      </button>
      <button type="button" className="tw-choice" disabled={busy !== null} onClick={() => void act('cancel', { action: 'cancel' })} data-testid="p6-cancel-interest">
        Não tenho mais interesse<small>Sua inscrição sai da fila e a mentora é avisada.</small>
      </button>
      <Button variant="ghost" block onClick={() => setConfirmCancel(false)} data-testid="p6-cancel-no">Voltar</Button>
    </div>
  );

  const cancelDialog = (
    <div role="alertdialog" aria-label="Confirmar cancelamento" className="tw-dialog" data-testid="p6-cancel-dialog">
      <strong>Cancelar mesmo?</strong>
      <p>Sua inscrição sai da fila e a mentora é avisada.</p>
      <div className="tw-btnrow">
        <Button variant="danger" size="sm" loading={busy === 'cancel'} onClick={() => void act('cancel', { action: 'cancel' })} data-testid="p6-cancel-yes">Sim, cancelar</Button>
        <Button variant="secondary" size="sm" onClick={() => setConfirmCancel(false)} data-testid="p6-cancel-no">Manter</Button>
      </div>
    </div>
  );

  let badge: JSX.Element;
  let title: string;
  let body: JSX.Element;
  let testid: string;

  if (mentee.status === 'invited' && ap && ap.status === 'invited') {
    testid = 'p6-proposto';
    badge = <StatusBadge status="invited" />;
    title = 'Uma mentora quer te mentorar!';
    const t = ap.expiresAt ? formatTime(ap.expiresAt) : null;
    body = (
      <>
        <Card accent>
          <div className="tw-stack">
            <div className="tw-mentorrow">
              <span className="tw-avatar" aria-hidden="true">{ap.mentor.name.charAt(0)}</span>
              <div>
                <strong>{ap.mentor.name}</strong>
                {ap.mentor.linkedin && <a className="tw-link" href={li(ap.mentor.linkedin)} target="_blank" rel="noopener noreferrer">Ver LinkedIn</a>}
              </div>
            </div>
            <div className="tw-stats">
              <div className="tw-stat"><small>MESA</small><strong data-testid="p6-table">{ap.table.number}</strong></div>
              <div className="tw-stat"><small>HORÁRIO</small><strong data-testid="p6-time">{formatTime(ap.slot.startAt)}</strong></div>
            </div>
            <span>Sessão de {ap.durationMinutes} min ({formatRange(ap.slot.startAt, ap.slot.endAt)}) · horário de Recife</span>
            {ap.expiresAt && <Countdown expiresAt={ap.expiresAt} serverNow={serverNow} label={`Responda até ${t}`} onExpire={() => void load(true)} />}
            {declining ? (
              <div className="tw-stack">
                <strong>Por que você vai recusar?</strong>
                <button type="button" className="tw-choice" disabled={busy !== null} onClick={() => void act('decline-schedule', { action: 'decline', reason: 'schedule' })} data-testid="p6-decline-schedule">Horário não serve</button>
                <button type="button" className="tw-choice" disabled={busy !== null} onClick={() => void act('decline-interest', { action: 'decline', reason: 'no_interest' })} data-testid="p6-decline-interest">Não tenho mais interesse</button>
                <Button variant="ghost" block onClick={() => setDeclining(false)}>Voltar</Button>
              </div>
            ) : (
              <div className="tw-btnrow">
                <Button size="lg" loading={busy === 'accept'} onClick={() => void act('accept', { action: 'accept' }, 'Mentoria confirmada!')} data-testid="p6-accept">Aceitar</Button>
                <Button size="lg" variant="secondary" onClick={() => setDeclining(true)} data-testid="p6-decline">Recusar</Button>
              </div>
            )}
          </div>
        </Card>
        {t && <p className="tw-field__hint">Se você não responder até {t}, o horário é liberado e você continua na fila.</p>}
      </>
    );
  } else if (mentee.status === 'confirmed' && ap && (ap.status === 'confirmed' || ap.status === 'in_progress')) {
    testid = 'p6-confirmada';
    badge = <StatusBadge status="confirmed" />;
    title = 'Mentoria confirmada';
    body = confirmCancel ? cancelChoice : (
      <>
        <Card dark className="tw-confirm">
          <div className="tw-stack">
            <h2 data-testid="p6-summary">Mesa {ap.table.number} · {formatTime(ap.slot.startAt)} · com {ap.mentor.name.split(' ')[0]}</h2>
            <span>{formatDayShort(ap.slot.startAt).replace(/^./, (c) => c.toUpperCase())} · {ap.durationMinutes} min · horário de Recife</span>
            <span className="tw-pill">Chegue 5 minutos antes</span>
          </div>
        </Card>
        <Card>
          <div className="tw-mentorrow">
            <span className="tw-avatar" aria-hidden="true">{ap.mentor.name.charAt(0)}</span>
            <div>
              <strong>{ap.mentor.name}</strong>
              {ap.mentor.areas[0] && <small>{FALLBACK_AREAS.find((x) => x.key === ap.mentor.areas[0])?.label ?? ap.mentor.areas[0]}</small>}
            </div>
            {ap.mentor.linkedin && <a className="tw-link" href={li(ap.mentor.linkedin)} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
          </div>
        </Card>
        <ExternalButton variant="mint" block data-testid="p6-ics" download="mentoria-tech-woman.ics" onClick={() => track('agenda_adicionada')}
          href={endpointUrl(ENDPOINTS.E06, { query: { t: getMenteeToken() ?? '' } })}>Adicionar à agenda (.ics)</ExternalButton>
        <Button variant="danger-link" block onClick={() => setConfirmCancel(true)} data-testid="p6-cancel">Cancelar mentoria</Button>
      </>
    );
  } else if (mentee.status === 'done') {
    testid = 'p6-concluida';
    badge = <StatusBadge status="done" />;
    title = 'Obrigada por participar!';
    body = <p data-testid="p6-final">Esperamos que a conversa tenha aberto caminhos. Conte como foi para nós.</p>;
  } else if (mentee.status === 'cancelled' || mentee.status === 'no_show') {
    testid = 'p6-encerrada';
    badge = <StatusBadge status={mentee.status === 'no_show' ? 'no_show' : 'cancelled'} />;
    title = 'Sua inscrição foi cancelada';
    body = (
      <>
        <p data-testid="p6-final">Sua inscrição não está mais na fila. Se o evento ainda estiver aberto, você pode se inscrever de novo.</p>
        {event.registrationOpen && <LinkButton to="/mentoria/inscricao" block data-testid="p6-new">Fazer nova inscrição</LinkButton>}
      </>
    );
  } else if ((mentee.status === 'waiting' && lastOutcome === 'expired') || (mentee.status === 'invited' && ap?.status === 'expired')) {
    // Convite vencido ainda não varrido pelo worker (RN07): o backend já devolve appointment.status = expired.
    testid = 'p6-expirada';
    badge = <StatusBadge status="expired" />;
    title = 'O prazo para responder terminou';
    body = <p data-testid="p6-final">O prazo para responder terminou e o horário foi liberado. Você continua na fila.</p>;
  } else {
    // waiting (inclui devolvida à fila com prioridade, RN06/RN07)
    testid = lastOutcome ? 'p6-recusada' : 'p6-aguardando';
    badge = <><StatusBadge status="waiting" label="Aguardando mentora" />{mentee.priority && <PriorityBadge />}</>;
    title = lastOutcome === 'declined_schedule' ? 'Tudo bem! Você continua na fila' : 'Sua inscrição está ativa';
    const text =
      lastOutcome === 'declined_schedule' ? 'Tudo bem! Sua inscrição continua ativa e com prioridade. Se quiser, ajuste o período preferido.'
      : lastOutcome === 'cancelled_by_staff' ? 'Sua mentoria foi cancelada. Você voltou para a fila com prioridade.'
      : 'Assim que uma mentora for atribuída a você, avisamos por e-mail e WhatsApp e o convite aparece aqui.';
    body = confirmCancel ? cancelDialog : (
      <>
        <p data-testid="p6-outcome">{text}</p>
        {lastOutcome === 'declined_schedule' && (
          // Remonta ao trocar o período preferido: o destaque (matchesPeriod) vem do servidor.
          <ChooseSlot key={mentee.preferredPeriod}
            onBooked={(next) => { setMe(next); setFreshAt(Date.now()); toast.success('Mentoria confirmada!'); }}
            onStale={() => void load(true)} />
        )}
        <Card>
          <dl style={{ margin: 0 }}>
            <div className="tw-kv"><dt>Área</dt><dd>{area}</dd></div>
            <div className="tw-kv"><dt>Período preferido</dt><dd>{PERIOD_LABELS[mentee.preferredPeriod]}</dd></div>
          </dl>
          {editing && (
            <div className="tw-choicegrid" role="radiogroup" aria-label="Novo período preferido">
              {PERIODS.map((o) => (
                <button key={o.value} type="button" role="radio" className="tw-choice" aria-checked={(period ?? mentee.preferredPeriod) === o.value} onClick={() => setPeriod(o.value)}>{o.label}</button>
              ))}
            </div>
          )}
          <Button variant="secondary" block loading={busy === 'pref'} data-testid={editing ? 'p6-save-period' : 'p6-edit-period'}
            onClick={() => {
              if (!editing) { setPeriod(mentee.preferredPeriod); setEditing(true); return; }
              if (period && period !== mentee.preferredPeriod) void act('pref', { action: 'update_preference', preferredPeriod: period }, 'Preferência atualizada.');
              else setEditing(false);
            }}>{editing ? 'Salvar período' : 'Editar período preferido'}</Button>
        </Card>
        <Button variant="danger-link" block onClick={() => setConfirmCancel(true)} data-testid="p6-cancel">Cancelar inscrição</Button>
      </>
    );
  }

  return (
    <div className="tw-page tw-stack" data-testid={testid}>
      <div className="tw-hero" data-testid="p6-hero">
        <span className="tw-greet">Oi, {first}!</span>
        <div className="tw-row">{badge}</div>
        <h1 className="tw-title tw-title--sm" data-testid="p6-title">{title}</h1>
      </div>
      {body}
      {fresh}
    </div>
  );
}
