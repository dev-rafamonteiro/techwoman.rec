import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ENDPOINTS, type E03Response, type PreferredPeriod } from '@tw/shared';
import {
  ApiError, type BodyOf, Button, Card, Countdown, ErrorState, Hero, LinkButton, PERIOD_LABELS, RadioCards, SkeletonList,
  StatusBadge, PriorityBadge, TextField, call, formatDayShort, formatRange, formatTime, getMenteeToken, setMenteeToken, useToast, usePolling,
} from '../../ui';
import { FALLBACK_AREAS } from './lib/areas';
import { buildIcs, downloadIcs } from './lib/format';
import { mountTurnstile, type TurnstileHandle } from './lib/turnstile';

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
      setState('sent');
    } catch (err) {
      setState('idle');
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar agora. Tente de novo.');
    }
  }

  return (
    <div className="tw-page tw-stack" data-testid="p6-invalid">
      <Hero title="Não encontramos sua inscrição">
        <p>O link pode estar incompleto. Informe seu e-mail e enviamos o link certo.</p>
      </Hero>
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

/** P6 · Minha mentoria (E03, E04) · RN05, RN06, RN07 */
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
    if (token) setMenteeToken(token);
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
      setMe(next);
      setFreshAt(Date.now());
      setDeclining(false);
      setConfirmCancel(false);
      setEditing(false);
      if (ok) toast.success(ok);
    } catch (e) {
      const ae = e as ApiError;
      if (ae.isConflict) {
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
  const fresh = <p className="tw-field__hint" data-testid="p6-fresh">{(freshAt && Date.now() - freshAt < 60000 ? 'Atualizado agora' : 'Atualizada') + ' · esta página se atualiza sozinha'}</p>;
  const li = (v: string) => (/^https?:/i.test(v) ? v : v.includes('linkedin.com') ? `https://${v}` : `https://www.linkedin.com/in/${v}`);

  const cancelDialog = (
    <Card>
      <div role="alertdialog" aria-label="Confirmar cancelamento" className="tw-stack">
        <p><strong>Cancelar mesmo?</strong></p>
        <p>Sua inscrição sai da fila e a mentora é avisada.</p>
        <div className="tw-row">
          <Button variant="danger" loading={busy === 'cancel'} onClick={() => void act('cancel', { action: 'cancel' })} data-testid="p6-cancel-yes">Sim, cancelar</Button>
          <Button variant="ghost" onClick={() => setConfirmCancel(false)} data-testid="p6-cancel-no">Manter</Button>
        </div>
      </div>
    </Card>
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
        <Card>
          <div className="tw-stack">
            <div className="tw-row">
              <span className="tw-avatar" aria-hidden="true">{ap.mentor.name.charAt(0)}</span>
              <div>
                <strong>{ap.mentor.name}</strong>
                {ap.mentor.linkedin && <><br /><a className="tw-link" href={li(ap.mentor.linkedin)} target="_blank" rel="noopener noreferrer">Ver LinkedIn</a></>}
              </div>
            </div>
            <div className="tw-row">
              <div><small>MESA</small><br /><strong data-testid="p6-table">{ap.table.number}</strong></div>
              <div><small>HORÁRIO</small><br /><strong data-testid="p6-time">{formatTime(ap.slot.startAt)}</strong></div>
            </div>
            <span>Sessão de {ap.durationMinutes} min ({formatRange(ap.slot.startAt, ap.slot.endAt).replace(' às ', ' às ')}) · horário de Recife</span>
            {ap.expiresAt && <Countdown expiresAt={ap.expiresAt} serverNow={serverNow} label={`Responda até ${t}`} onExpire={() => void load(true)} />}
            {declining ? (
              <div className="tw-stack">
                <strong>Por que você vai recusar?</strong>
                <Button variant="secondary" block loading={busy === 'decline-schedule'} onClick={() => void act('decline-schedule', { action: 'decline', reason: 'schedule' })} data-testid="p6-decline-schedule">Horário não serve</Button>
                <Button variant="secondary" block loading={busy === 'decline-interest'} onClick={() => void act('decline-interest', { action: 'decline', reason: 'no_interest' })} data-testid="p6-decline-interest">Não tenho mais interesse</Button>
                <Button variant="ghost" block onClick={() => setDeclining(false)}>Voltar</Button>
              </div>
            ) : (
              <div className="tw-row">
                <Button size="lg" variant="mint" loading={busy === 'accept'} onClick={() => void act('accept', { action: 'accept' }, 'Mentoria confirmada!')} data-testid="p6-accept">Aceitar</Button>
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
    body = confirmCancel ? cancelDialog : (
      <>
        <Card accent>
          <strong data-testid="p6-summary">Mesa {ap.table.number} · {formatTime(ap.slot.startAt)} · com {ap.mentor.name.split(' ')[0]}</strong>
          <p>{formatDayShort(ap.slot.startAt).replace(/^./, (c) => c.toUpperCase())} · {ap.durationMinutes} min · horário de Recife</p>
          <p>Chegue 5 minutos antes</p>
        </Card>
        <Card>
          <div className="tw-row">
            <span className="tw-avatar" aria-hidden="true">{ap.mentor.name.charAt(0)}</span>
            <strong>{ap.mentor.name}</strong>
            {ap.mentor.linkedin && <a className="tw-link" href={li(ap.mentor.linkedin)} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
          </div>
        </Card>
        <Button variant="secondary" block data-testid="p6-ics" onClick={() => downloadIcs('mentoria-tech-woman.ics', buildIcs({
          uid: `${ap.id}`, startAt: ap.slot.startAt, endAt: ap.slot.endAt, summary: `Mentoria Tech Woman com ${ap.mentor.name}`,
          location: tableLabel(ap.table), description: `Mentoria de ${ap.durationMinutes} min com ${ap.mentor.name}. Chegue 5 minutos antes.`,
        }))}>Adicionar à agenda (.ics)</Button>
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
  } else if (mentee.status === 'waiting' && lastOutcome === 'expired') {
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
      : 'Assim que uma mentora escolher você, avisamos por e-mail e WhatsApp e o convite aparece aqui.';
    body = confirmCancel ? cancelDialog : (
      <>
        <p data-testid="p6-outcome">{text}</p>
        <Card>
          <dl>
            <dt>Área</dt><dd>{area}</dd>
            <dt>Período preferido</dt><dd>{PERIOD_LABELS[mentee.preferredPeriod]}</dd>
          </dl>
          {editing && (
            <RadioCards legend="Novo período preferido" name="period" options={PERIODS} value={period ?? mentee.preferredPeriod} onChange={setPeriod} />
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
      <Hero eyebrow={`Oi, ${first}!`} title={title}><div className="tw-row">{badge}</div></Hero>
      {body}
      {fresh}
    </div>
  );
}
