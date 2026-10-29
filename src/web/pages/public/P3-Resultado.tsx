import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { INITIAL_BRADESCO_MENTORS } from '@tw/shared';
import { Brand, Button, CheckboxField, EmptyState, LinkButton, SelectField, TextField } from '../../ui';
import { saveJourney } from './lib/journey';
import { AREAS, PERFIS, TRACOS, calcXp, computeResult, loadAnswers, loadMentorJourney, saveAnswers, saveMentorJourney } from './lib/journeyData';
import { rankMentors, type MentorMatch } from './lib/mentorMatching';
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
  const [showAll, setShowAll] = useState(false);
  const [selectedMentor, setSelectedMentor] = useState<MentorMatch | null>(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [mockReservations, setMockReservations] = useState<Set<string>>(() => new Set());
  const [booking, setBooking] = useState({ name: '', email: '', phone: '', consent: false });
  const [bookingError, setBookingError] = useState('');
  const [bookingResult, setBookingResult] = useState<{ mentorName: string; slotTime: string; topic: string; eventDate: string } | null>(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const initialMentors = useMemo(() => INITIAL_BRADESCO_MENTORS.map((mentor) => ({
    id: `initial-${mentor.name}`,
    name: mentor.name,
    expertise: mentor.expertise,
    city: mentor.city,
    linkedin: mentor.linkedin,
    bio: mentor.bio,
    photoUrl: mentor.photoUrl,
    themes: mentor.themes.map((theme) => ({ name: theme.name, domains: [...theme.domains] })),
    slots: mentor.slots.map((slot) => ({ ...slot, available: true, reserved: false })),
  })), []);
  const matches = useMemo(
    () => rankMentors(initialMentors, answers ?? {}, matchingAnswers, tieSeed),
    [initialMentors, answers, matchingAnswers, tieSeed],
  );
  const allMatches = useMemo(
    () => rankMentors(initialMentors, answers ?? {}, matchingAnswers, tieSeed, true),
    [initialMentors, answers, matchingAnswers, tieSeed],
  );

  useEffect(() => {
    if (r && top) saveJourney({ area: top, scores: r.score });
  }, [r, top]);

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
      const slot = selectedMentor.slots.find((item) => item.id === selectedSlot && item.available);
      if (!slot) {
        setBookingError('Esse horário não está mais disponível para o teste. Escolha outro.');
        return;
      }
      setBookingResult({
        mentorName: selectedMentor.name,
        slotTime: slot.time,
        topic: slot.topic,
        eventDate: 'Teste local',
      });
      setMockReservations((current) => new Set(current).add(`${selectedMentor.id}:${slot.id}`));
      setSelectedMentor(null);
      setSelectedSlot('');
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
          <p role="status" style={{ margin: '16px 0', padding: 16, borderRadius: 16, background: '#fff2e8' }}>
            Modo de testes: mentoras e horários simulados. Nenhuma reserva será enviada ao serviço.
          </p>
          {matches.length === 0 && (
            <EmptyState title="Não encontramos mentoras para este recorte" text="As respostas selecionadas não encontraram perfis compatíveis nesta trilha. Refaça a jornada escolhendo outra área ou explore o catálogo completo." action={<LinkButton to="/mentoras-bradesco">Ver mentoras</LinkButton>} />
          )}
          {recommendations.length > 0 && (
            <>
              {showAll && primaryRecommendations.length > 0 && (
                <h3>Outras mentoras do catálogo</h3>
              )}
              <div className="tw-p3__mentor-grid">
                {recommendations.map((mentor) => {
                  const availableSlots = mentor.slots.filter((slot) => (
                    slot.available && !mockReservations.has(`${mentor.id}:${slot.id}`)
                  ));
                  return (
                    <article className="tw-p3__mentor-card" key={mentor.id}>
                      {mentor.photoUrl && <img src={mentor.photoUrl} alt="" loading="lazy" />}
                      {matches[0]?.id === mentor.id && <span className="tw-pub__eyebrow">Maior match para você</span>}
                      <span className="tw-p3__mentor-match">{mentor.match}% Match</span>
                      <h3>{mentor.name}</h3>
                      <p>{mentor.expertise}</p>
                      {availableSlots.length > 0
                        ? <Button onClick={() => { setSelectedMentor(mentor); setSelectedSlot(availableSlots[0]!.id); setBookingError(''); }}>Simular reserva</Button>
                        : <Button disabled>Sem horários livres</Button>}
                    </article>
                  );
                })}
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
              <h3>Reserva de teste simulada!</h3>
              <p>{bookingResult.mentorName} · {bookingResult.slotTime} · {bookingResult.eventDate}</p>
              <p>{bookingResult.topic}</p>
              <p>O horário foi removido desta tela. A reserva não foi enviada ao serviço.</p>
            </div>
          )}
          {selectedMentor && (
            <form className="tw-stack" onSubmit={(event) => { event.preventDefault(); void reserve(); }} style={{ marginTop: 24 }}>
              <h3>Reservar com {selectedMentor.name}</h3>
              <SelectField label="Horário disponível" value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value)} required>
                {selectedMentor.slots
                  .filter((slot) => slot.available && !mockReservations.has(`${selectedMentor.id}:${slot.id}`))
                  .map((slot) => <option key={slot.id} value={slot.id}>{slot.time} · {slot.topic}</option>)}
              </SelectField>
              <TextField label="Nome completo" autoComplete="name" required maxLength={120} value={booking.name} onChange={(event) => setBooking((value) => ({ ...value, name: event.target.value }))} />
              <TextField label="E-mail" type="email" autoComplete="email" required maxLength={254} value={booking.email} onChange={(event) => setBooking((value) => ({ ...value, email: event.target.value }))} />
              <TextField label="WhatsApp com DDD" type="tel" autoComplete="tel" required maxLength={20} value={booking.phone} onChange={(event) => setBooking((value) => ({ ...value, phone: event.target.value }))} />
              <CheckboxField label={<>Li e aceito o <Link to="/privacidade" target="_blank" rel="noreferrer">aviso de privacidade</Link> para realizar a reserva.</>} checked={booking.consent} onChange={(event) => setBooking((value) => ({ ...value, consent: event.target.checked }))} />
              {bookingError && <p role="alert" className="tw-field__error">{bookingError}</p>}
              <div className="tw-row">
                <Button type="submit" loading={bookingBusy}>Simular reserva</Button>
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
          <span>Esta simulação não altera a agenda real da mentora.</span>
        </div>
      </div>
    </div>
  );
}
