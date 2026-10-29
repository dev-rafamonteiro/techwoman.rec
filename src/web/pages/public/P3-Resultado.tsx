import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ENDPOINTS, INITIAL_BRADESCO_MENTORS } from '@tw/shared';
import { ApiError, Brand, Button, CheckboxField, EmptyState, ErrorState, LinkButton, SelectField, SkeletonList, TextField, call, useQuery } from '../../ui';
import { saveJourney } from './lib/journey';
import { AREAS, PERFIS, TRACOS, calcXp, computeResult, loadAnswers, loadMentorJourney, saveAnswers, saveMentorJourney } from './lib/journeyData';
import { rankMentors, type MentorMatch } from './lib/mentorMatching';
import { mountTurnstile, type TurnstileHandle } from './lib/turnstile';
import './public.css';

/** P3 · Resultado da gamificação. Grava {area, scores} para P4 pré-preencher a inscrição. */
export default function P3Resultado() {
  const navigate = useNavigate();
  const answers = useMemo(() => loadAnswers(), []);
  const r = useMemo(() => (answers ? computeResult(answers) : null), [answers]);
  const top = r?.ranking[0];
  const mentorJourney = useMemo(() => loadMentorJourney(), []);
  const matchingAnswers = mentorJourney?.answers ?? { 0: 1, 1: 1, 2: 1 };
  const tieSeed = mentorJourney?.tieSeed ?? 'legacy-results';
  const mentorData = useQuery((signal) => call(ENDPOINTS.E49Public, { signal }), []);
  const [showAll, setShowAll] = useState(false);
  const [selectedMentor, setSelectedMentor] = useState<MentorMatch | null>(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [booking, setBooking] = useState({ name: '', email: '', phone: '', consent: false });
  const [bookingError, setBookingError] = useState('');
  const [bookingResult, setBookingResult] = useState<{ mentorName: string; slotTime: string; topic: string; eventDate: string } | null>(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const turnstileBox = useRef<HTMLDivElement>(null);
  const turnstile = useRef<TurnstileHandle | null>(null);
  const initialMentors = useMemo(() => INITIAL_BRADESCO_MENTORS.map((mentor) => ({
    id: `initial-${mentor.name}`,
    name: mentor.name,
    expertise: mentor.expertise,
    city: mentor.city,
    linkedin: mentor.linkedin,
    bio: mentor.bio,
    photoUrl: mentor.photoUrl,
    themes: mentor.themes.map((theme) => ({ name: theme.name, domains: [...theme.domains] })),
    slots: mentor.slots.map((slot) => ({ ...slot, available: false })),
  })), []);
  const matches = useMemo(
    () => {
      const mentors = mentorData.status === 'success'
        ? mentorData.data.items
        : mentorData.status === 'error'
          ? initialMentors
          : [];
      return rankMentors(mentors, answers ?? {}, matchingAnswers, tieSeed);
    },
    [mentorData, initialMentors, answers, matchingAnswers, tieSeed],
  );
  const allMatches = useMemo(() => {
    const mentors = mentorData.status === 'success'
      ? mentorData.data.items
      : mentorData.status === 'error'
        ? initialMentors
        : [];
    return rankMentors(mentors, answers ?? {}, matchingAnswers, tieSeed, true);
  }, [mentorData, initialMentors, answers, matchingAnswers, tieSeed]);

  useEffect(() => {
    if (r && top) saveJourney({ area: top, scores: r.score });
  }, [r, top]);

  useEffect(() => {
    if (!selectedMentor || !turnstileBox.current) return;
    let active = true;
    mountTurnstile(turnstileBox.current).then((handle) => {
      if (active) turnstile.current = handle;
      else handle.destroy();
    }, () => undefined);
    return () => {
      active = false;
      turnstile.current?.destroy();
      turnstile.current = null;
    };
  }, [selectedMentor]);

  if (!answers || !r || !top) {
    return (
      <div className="tw-pub">
        <header className="tw-pub__head"><Brand height={44} /><span /><Link className="tw-pub__back" to="/">Voltar ao início</Link></header>
        <div className="tw-page"><EmptyState title="Você ainda não fez a jornada" text="Responda as perguntas para ver seu resultado." action={<LinkButton to="/jornada">Começar jornada</LinkButton>} /></div>
      </div>
    );
  }
  const second = r.ranking[1]!;
  const nivel = r.nivelDe(top);
  const perfil = PERFIS[r.perfil]!;
  const f = r.tracos.map((t) => TRACOS[t]!.frase);
  const xp = calcXp(answers, matchingAnswers);
  const primaryRecommendations = matches.slice(0, 3);
  const primaryIds = new Set(primaryRecommendations.map((mentor) => mentor.id));
  const recommendations = showAll
    ? [...primaryRecommendations, ...allMatches.filter((mentor) => !primaryIds.has(mentor.id))]
    : primaryRecommendations;

  async function reserve() {
    setBookingError('');
    if (!selectedMentor || !selectedSlot) {
      setBookingError('Escolha um horário disponível.');
      return;
    }
    if (booking.name.trim().split(/\s+/).length < 2) {
      setBookingError('Informe nome e sobrenome.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(booking.email.trim())) {
      setBookingError('Digite um e-mail válido.');
      return;
    }
    if (booking.phone.replace(/\D/g, '').length !== 11) {
      setBookingError('Informe WhatsApp com DDD e 11 dígitos.');
      return;
    }
    if (!booking.consent) {
      setBookingError('É necessário aceitar o aviso de privacidade para continuar.');
      return;
    }
    setBookingBusy(true);
    try {
      if (!turnstile.current) throw new ApiError(0, 'TURNSTILE_FAILED', 'Não foi possível verificar que você é uma pessoa. Recarregue a página e tente novamente.');
      const turnstileToken = await turnstile.current.getToken();
      const result = await call(ENDPOINTS.E50, {
        body: {
          mentorId: selectedMentor.id,
          slotId: selectedSlot,
          name: booking.name.trim(),
          email: booking.email.trim(),
          phone: booking.phone,
          consent: { accepted: true, version: mentorData.status === 'success' ? mentorData.data.consentVersion : '' },
          turnstileToken,
        },
      });
      setBookingResult(result);
      setSelectedMentor(null);
      setSelectedSlot('');
      await mentorData.reload();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SLOT_UNAVAILABLE') {
        setBookingError('Esse horário acabou de ser reservado. Atualizamos as opções; escolha outro.');
        await mentorData.reload();
      } else {
        setBookingError(error instanceof ApiError ? error.message : 'Não foi possível concluir a reserva. Tente novamente.');
      }
    } finally {
      setBookingBusy(false);
    }
  }

  return (
    <div className="tw-pub tw-p3" data-testid="p3" style={{ minHeight: '100vh' }}>
      <header className="tw-pub__head">
        <Brand height={44} />
        <span className="tw-p3__xp">{xp} XP</span>
        <Link className="tw-pub__back" to="/">Voltar ao início</Link>
      </header>
      <div className="tw-p3__body">
        <section className="tw-p3__dark" aria-label="Seu resultado">
          <div className="tw-row"><span className="tw-pub__eyebrow" style={{ color: '#ebc2f1' }}>Seu resultado</span><span className="tw-p3__xp" data-testid="p3-xp">{xp} XP conquistados</span></div>
          <span>Sua principal afinidade é</span>
          <h1 className="tw-p3__area" data-testid="p3-area">{AREAS[top]}</h1>
          <div className="tw-p3__subs">
            <div className="tw-p3__sub">
              <small>Aderência às respostas</small>
              <div className="tw-row"><span className="tw-p3__level">{nivel}</span>
                <span className="tw-dots" role="img" aria-label={`Nível ${nivel} de 5`}>{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= nivel ? 'on' : ''} />)}</span><span>de 5</span></div>
            </div>
            <div className="tw-p3__sub">
              <small>Seu perfil</small>
              <strong style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{perfil.nome}</strong>
              <span>{perfil.desc}</span>
            </div>
          </div>
          <p style={{ margin: 0 }}>Suas respostas indicam maior afinidade com {AREAS[top]}. Seu perfil {perfil.nome} demonstra {f[0]}, {f[1]} e {f[2]}.</p>
          <div className="tw-row">{r.tracos.map((t) => <span key={t} className="tw-p3__chip">{TRACOS[t]!.chip}</span>)}</div>
          <span>Também combina com você: <strong>{AREAS[second]}</strong></span>
        </section>

        <section className="tw-p3__cta">
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2>Encontre uma mentora para o seu momento.</h2>
            <p style={{ margin: 0 }}>Com base nas suas respostas, recomendamos mentoras alinhadas a seu momento profissional e aos temas cadastrados por elas.</p>
          </div>
          <a className="tw-p3__redo" href="#p3-mentors">Ver minhas recomendações</a>
        </section>

        <section className="tw-p3__white" id="p3-mentors">
          <span className="tw-pub__eyebrow">Match de mentoria</span>
          <h2 style={{ margin: '6px 0' }}>Mentoras para o seu próximo passo</h2>
          <p>Este questionário não tem respostas certas ou erradas. Primeiro, seu momento profissional direciona o grupo de mentoras elegíveis; as perguntas seguintes refinam a busca pelos temas, domínios e interesses que você selecionou. O percentual representa a aderência das respostas ao perfil de cada mentora.</p>
          {mentorData.status === 'loading' && <SkeletonList rows={3} height={150} />}
          {mentorData.status === 'error' && matches.length > 0 && (
            <p role="status" style={{ margin: '16px 0', padding: 16, borderRadius: 16, background: '#fff2e8' }}>
              Não foi possível consultar a disponibilidade atual. Exibimos recomendações do catálogo inicial; as reservas estarão disponíveis quando o serviço voltar.
            </p>
          )}
          {mentorData.status === 'error' && matches.length === 0 && (
            <ErrorState
              error={mentorData.error}
              onRetry={mentorData.reload}
              description="Não foi possível carregar o serviço nem o catálogo inicial de mentoras. Tente novamente mais tarde."
            />
          )}
          {mentorData.status === 'success' && matches.length === 0 && (
            <EmptyState title="Não encontramos mentoras para este recorte" text="As respostas selecionadas não encontraram perfis compatíveis nesta trilha. Refaça a jornada escolhendo outra área ou explore o catálogo completo." action={<LinkButton to="/mentoras-bradesco">Ver mentoras</LinkButton>} />
          )}
          {recommendations.length > 0 && (
            <>
              {showAll && primaryRecommendations.length > 0 && (
                <h3>Outras mentoras do catálogo</h3>
              )}
              <div className="tw-p3__mentor-grid">
                {recommendations.map((mentor) => (
                  <article className="tw-p3__mentor-card" key={mentor.id}>
                    {mentor.photoUrl && <img src={mentor.photoUrl} alt="" loading="lazy" />}
                    {matches[0]?.id === mentor.id && <span className="tw-pub__eyebrow">Maior match para você</span>}
                    <span className="tw-p3__mentor-match">{mentor.match}% Match</span>
                    <h3>{mentor.name}</h3>
                    <p>{mentor.expertise}</p>
                    <p className="tw-p3__mentor-topics">{mentor.themes.flatMap((theme) => theme.domains).slice(0, 3).join(' · ')}</p>
                    {mentorData.status === 'error'
                      ? <Button disabled>Reserva indisponível</Button>
                      : mentor.slots.some((slot) => slot.available)
                      ? <Button onClick={() => { setSelectedMentor(mentor); setSelectedSlot(mentor.slots.find((slot) => slot.available)?.id ?? ''); setBookingError(''); }}>Reservar com ela</Button>
                      : <Button disabled>Sem horários livres</Button>}
                  </article>
                ))}
              </div>
              {allMatches.length > primaryRecommendations.length && (
                <Button variant="secondary" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? 'Mostrar apenas as 3 recomendações' : `Ver outras mentoras (${allMatches.length - primaryRecommendations.length})`}
                </Button>
              )}
            </>
          )}
          {bookingResult && (
            <div className="tw-card" role="status" style={{ marginTop: 20 }}>
              <h3>Reserva confirmada!</h3>
              <p>{bookingResult.mentorName} · {bookingResult.slotTime} · {bookingResult.eventDate}</p>
              <p>{bookingResult.topic}</p>
              <p>O horário foi removido das opções disponíveis.</p>
            </div>
          )}
          {selectedMentor && (
            <form className="tw-stack" onSubmit={(event) => { event.preventDefault(); void reserve(); }} style={{ marginTop: 24 }}>
              <h3>Reservar com {selectedMentor.name}</h3>
              <SelectField label="Horário disponível" value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value)} required>
                {selectedMentor.slots.filter((slot) => slot.available).map((slot) => <option key={slot.id} value={slot.id}>{slot.time} · {slot.topic}</option>)}
              </SelectField>
              <TextField label="Nome completo" autoComplete="name" required maxLength={120} value={booking.name} onChange={(event) => setBooking((value) => ({ ...value, name: event.target.value }))} />
              <TextField label="E-mail" type="email" autoComplete="email" required maxLength={254} value={booking.email} onChange={(event) => setBooking((value) => ({ ...value, email: event.target.value }))} />
              <TextField label="WhatsApp com DDD" type="tel" autoComplete="tel" required maxLength={20} value={booking.phone} onChange={(event) => setBooking((value) => ({ ...value, phone: event.target.value }))} />
              <CheckboxField label={<>Li e aceito o <Link to="/privacidade" target="_blank" rel="noreferrer">aviso de privacidade</Link> para realizar a reserva.</>} checked={booking.consent} onChange={(event) => setBooking((value) => ({ ...value, consent: event.target.checked }))} />
              <div ref={turnstileBox} />
              {bookingError && <p role="alert" className="tw-field__error">{bookingError}</p>}
              <div className="tw-row">
                <Button type="submit" loading={bookingBusy}>Confirmar reserva</Button>
                <Button type="button" variant="secondary" onClick={() => setSelectedMentor(null)}>Cancelar</Button>
              </div>
            </form>
          )}
        </section>

        <section className="tw-p3__white">
          <h2 style={{ margin: 0 }}>Suas áreas de afinidade</h2>
          {r.ranking.map((k, idx) => (
            <div key={k}>
              <div className="tw-row" style={{ justifyContent: 'space-between' }}><span>{AREAS[k]}</span><span>nível {r.nivelDe(k)}</span></div>
              <div className="tw-aff__track"><div className={`tw-aff__bar${idx === 0 ? ' tw-aff__bar--1' : ''}`} style={{ width: `${r.pct(k)}%` }} /></div>
            </div>
          ))}
        </section>

        <div className="tw-row">
          <button type="button" className="tw-p3__redo" onClick={() => { saveAnswers(null); saveMentorJourney(null); navigate('/jornada'); }} data-testid="p3-redo">Refazer a jornada</button>
          <span>A reserva confirmada bloqueia o horário escolhido na agenda da mentora.</span>
        </div>
      </div>
    </div>
  );
}
