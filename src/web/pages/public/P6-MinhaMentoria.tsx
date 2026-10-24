import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ENDPOINTS, type E03Response, type PreferredPeriod } from '@tw/shared';
import {
  ApiError, type BodyOf, Button, Card, Countdown, ErrorState, ExternalButton, Hero, LinkButton, PERIOD_LABELS, RadioCards, SkeletonList,
  StatusBadge, PriorityBadge, TextField, call, formatRange, formatTime, getMenteeToken, setMenteeToken, useToast, usePolling,
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
        <p>Confira o link ou peça um novo para o seu e-mail.</p>
      </Hero>
      {state === 'sent' ? (
        <Card accent><p role="status">Se houver uma inscrição com esse e-mail, enviamos o link da sua página.</p></Card>
      ) : (
        <form className="tw-stack" onSubmit={submit} noValidate>
          <TextField label="E-mail da inscrição" type="email" inputMode="email" autoComplete="email" value={email} error={error ?? undefined}
            onChange={(e) => setEmail(e.target.value)} data-testid="p6-resend-email" />
          <div ref={box} aria-hidden="true" />
          <Button type="submit" block loading={state === 'sending'} data-testid="p6-resend">Reenviar link por e-mail</Button>
        </form>
      )}
      <LinkButton to="/mentoria/inscricao" variant="ghost" block>Fazer nova inscrição</LinkButton>
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
  const fresh = <p className="tw-field__hint" data-testid="p6-fresh">{freshAt && Date.now() - freshAt < 60000 ? 'Atualizado agora' : 'Atualiza sozinho a cada 30 s'}</p>;

  const periodEditor = (
    <Card>
      {editing ? (
        <div className="tw-stack">
          <RadioCards legend="Período preferido" name="period" options={PERIODS} value={period ?? mentee.preferredPeriod} onChange={setPeriod}
            hint="É só uma preferência. O horário final é definido pela mentora e você confirma." />
          <div className="tw-row">
            <Button loading={busy === 'pref'} onClick={() => period && void act('pref', { action: 'update_preference', preferredPeriod: period }, 'Preferência atualizada.')} data-testid="p6-save-period">Salvar</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>Voltar</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" block onClick={() => { setPeriod(mentee.preferredPeriod); setEditing(true); }} data-testid="p6-edit-period">Editar período preferido</Button>
      )}
    </Card>
  );

  const cancelBlock = confirmCancel ? (
    <Card>
      <p><strong>Cancelar mesmo?</strong> Sua inscrição sai da fila e a mentora é avisada.</p>
      <div className="tw-row">
        <Button variant="danger" loading={busy === 'cancel'} onClick={() => void act('cancel', { action: 'cancel' })} data-testid="p6-cancel-yes">Cancelar inscrição</Button>
        <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Voltar</Button>
      </div>
    </Card>
  ) : (
    <Button variant="danger-link" block onClick={() => setConfirmCancel(true)} data-testid="p6-cancel">Cancelar inscrição</Button>
  );

  let body: JSX.Element;
  let testid: string;

  if (mentee.status === 'invited' && ap && ap.status === 'invited') {
    testid = 'p6-proposto';
    const t = ap.expiresAt ? formatTime(ap.expiresAt) : null;
    body = (
      <>
        <Card accent>
          <StatusBadge status="invited" />
          <h2 className="tw-title tw-title--ink">{tableLabel(ap.table)} · {formatTime(ap.slot.startAt)}</h2>
          <p>{ap.mentor.name} quer te mentorar · {ap.durationMinutes} min · {formatRange(ap.slot.startAt, ap.slot.endAt)} (horário de Recife)</p>
          {ap.mentor.linkedin && <ExternalButton variant="ghost" size="sm" href={/^https?:/i.test(ap.mentor.linkedin) ? ap.mentor.linkedin : `https://www.linkedin.com/in/${ap.mentor.linkedin}`} target="_blank">LinkedIn de {ap.mentor.name}</ExternalButton>}
          {ap.expiresAt && <Countdown expiresAt={ap.expiresAt} serverNow={serverNow} label={`Responda até ${t}`} onExpire={() => void load(true)} />}
        </Card>
        {declining ? (
          <Card>
            <p><strong>Qual o motivo?</strong></p>
            <div className="tw-stack">
              <Button variant="secondary" block loading={busy === 'decline-schedule'} onClick={() => void act('decline-schedule', { action: 'decline', reason: 'schedule' })} data-testid="p6-decline-schedule">Horário não serve</Button>
              <Button variant="secondary" block loading={busy === 'decline-interest'} onClick={() => void act('decline-interest', { action: 'decline', reason: 'no_interest' })} data-testid="p6-decline-interest">Não tenho mais interesse</Button>
              <Button variant="ghost" block onClick={() => setDeclining(false)}>Voltar</Button>
            </div>
          </Card>
        ) : (
          <div className="tw-stack">
            <Button size="lg" block variant="mint" loading={busy === 'accept'} onClick={() => void act('accept', { action: 'accept' }, 'Mentoria confirmada!')} data-testid="p6-accept">Aceitar</Button>
            <Button variant="secondary" block onClick={() => setDeclining(true)} data-testid="p6-decline">Recusar</Button>
          </div>
        )}
      </>
    );
  } else if ((mentee.status === 'confirmed') && ap && (ap.status === 'confirmed' || ap.status === 'in_progress')) {
    testid = 'p6-confirmada';
    body = (
      <>
        <Card accent>
          <StatusBadge status="confirmed" />
          <h2 className="tw-title tw-title--ink">{tableLabel(ap.table)} · {formatTime(ap.slot.startAt)} · com {ap.mentor.name.split(' ')[0]}</h2>
          <p>Chegue 5 minutos antes. Horário de Recife.</p>
        </Card>
        <Button variant="secondary" block data-testid="p6-ics" onClick={() => downloadIcs('mentoria-tech-woman.ics', buildIcs({
          uid: `${ap.id}`, startAt: ap.slot.startAt, endAt: ap.slot.endAt, summary: `Mentoria Tech Woman com ${ap.mentor.name}`,
          location: tableLabel(ap.table), description: `Mentoria de ${ap.durationMinutes} min com ${ap.mentor.name}. Chegue 5 minutos antes.`,
        }))}>Adicionar à agenda</Button>
        {cancelBlock}
      </>
    );
  } else if (mentee.status === 'done') {
    testid = 'p6-concluida';
    body = <Card accent><StatusBadge status="done" /><h2 className="tw-title tw-title--ink">Obrigada, {first}!</h2><p>Esperamos que a conversa tenha sido boa.</p></Card>;
  } else if (mentee.status === 'cancelled' || mentee.status === 'no_show') {
    testid = 'p6-encerrada';
    body = (
      <>
        <Card>
          <StatusBadge status={mentee.status === 'no_show' ? 'no_show' : 'cancelled'} />
          <p>Sua inscrição está encerrada.</p>
        </Card>
        {event.registrationOpen && <LinkButton to="/mentoria/inscricao" block data-testid="p6-new">Fazer nova inscrição</LinkButton>}
      </>
    );
  } else {
    // waiting (inclui devolvida à fila com prioridade, RN06/RN07)
    testid = 'p6-aguardando';
    const note =
      lastOutcome === 'declined_schedule' ? 'Tudo bem! Sua inscrição continua ativa e com prioridade.'
      : lastOutcome === 'expired' ? 'O prazo para responder terminou e o horário foi liberado. Você continua na fila.'
      : lastOutcome === 'cancelled_by_staff' ? 'Sua mentoria foi cancelada. Você voltou para a fila com prioridade.'
      : null;
    body = (
      <>
        {note && <Card accent><p role="status" data-testid="p6-outcome">{note}</p></Card>}
        <Card>
          <StatusBadge status="waiting" label="Aguardando mentora" />{mentee.priority && <> <PriorityBadge /></>}
          <p><strong>Sua inscrição está ativa</strong></p>
          <p>Área: {area}</p>
          <p>Período preferido: {PERIOD_LABELS[mentee.preferredPeriod]}</p>
        </Card>
        {periodEditor}
        {cancelBlock}
      </>
    );
  }

  return (
    <div className="tw-page tw-stack" data-testid={testid}>
      <Hero title={`Oi, ${first}!`} />
      {body}
      {fresh}
    </div>
  );
}
