import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ENDPOINTS, MENTEE_NOTE_MAX, normalizePhoneBR, SPECIALTIES_BY_TRACK } from '@tw/shared';
import {
  ApiError, Button, CheckboxField, EmptyState, ErrorState, Hero, Overlay, SelectField, SkeletonList,
  TextArea, TextField, call, maskPhone, useQuery,
} from '../../ui';
import { track } from '../../analytics';
import { FALLBACK_AREAS } from './lib/areas';
import { loadJourney, savePersonalPath } from './lib/journey';
import { TurnstileError, useTurnstile } from './lib/turnstile';
import { SlotMentorPicker, type SlotChoice } from './SlotMentorPicker';
import Privacidade from './Privacidade';
import { useFlowPaths, useToten } from '../../shell/toten/context';
import './public.css';

type Field = 'name' | 'email' | 'phone' | 'linkedin' | 'area' | 'mentor' | 'note' | 'consent';
const NOTE_MAX = MENTEE_NOTE_MAX;

interface Values {
  name: string;
  email: string;
  phone: string;
  linkedin: string;
  area: string;
  theme: string;
  choice: SlotChoice | null;
  note: string;
  consent: boolean;
}

function validate(v: Values): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (v.name.trim().split(/\s+/).length < 2) e.name = 'Informe nome e sobrenome.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) e.email = 'Digite um e-mail válido.';
  if (v.phone.replace(/\D/g, '').length !== 11 || !normalizePhoneBR(v.phone)) e.phone = 'Use DDD + celular com 9 na frente: (00) 90000-0000.';
  if (v.linkedin && !/^([a-z0-9-]{3,100}|(https?:\/\/)?(www\.)?linkedin\.com\/in\/[a-z0-9-]{3,100}\/?)$/i.test(v.linkedin.trim())) {
    e.linkedin = 'Use seu usuário ou o link completo do perfil.';
  }
  if (!v.choice) e.mentor = 'Escolha o horário e a mentora.';
  if (v.note.length > NOTE_MAX) e.note = `Use no máximo ${NOTE_MAX} caracteres.`;
  if (!v.consent) e.consent = 'Precisamos do seu consentimento para continuar.';
  return e;
}

/** P4 · Inscrição na mentoria (E01, E02) · RN01, RN02 */
export default function P4Inscricao() {
  const navigate = useNavigate();
  const paths = useFlowPaths();
  const toten = useToten();
  const [privacy, setPrivacy] = useState(false);
  const event = useQuery((s) => call(ENDPOINTS.E01, { signal: s }), []);
  const journey = useMemo(() => loadJourney(), []);

  const [values, setValues] = useState<Values>({
    name: '', email: '', phone: '', linkedin: '', area: journey?.area ?? '', theme: '', choice: null, note: '', consent: false,
  });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ network: boolean; text: string } | null>(null);
  const [already, setAlready] = useState(false);
  const alreadyRef = useRef<HTMLDivElement>(null);
  // o aviso fica no topo do formulário e o envio é no fim: leva a pessoa até ele
  useEffect(() => { if (already) alreadyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [already]);
  const [slotsEmpty, setSlotsEmpty] = useState(false);
  const [taken, setTaken] = useState(false);
  /** Sobe depois de um SLOT_UNAVAILABLE: refaz E58 e E59. */
  const [refresh, setRefresh] = useState(0);

  const tsBox = useRef<HTMLDivElement>(null);
  // O contêiner só existe depois que E01 carrega e as inscrições estão abertas.
  // O admin pode desligar o Turnstile no A7 (pessoas em VPN barradas): aí o widget nem é montado.
  const formReady = event.status === 'success' && event.data.registrationOpen && event.data.turnstileEnabled;
  /** A Cloudflare pediu um toque na caixa: a caixa vem para o meio da tela, com aviso. */
  const [challenge, setChallenge] = useState(false);
  const getToken = useTurnstile(tsBox, formReady, {
    onInteractive: () => {
      setChallenge(true);
      tsBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  });

  const errors = validate(values);
  const shown = (f: Field) => (touched[f] ? errors[f] : undefined);
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setValues((p) => ({ ...p, [k]: val }));
  const touch = (f: Field) => setTouched((p) => ({ ...p, [f]: true }));

  if (event.status === 'loading') return <div className="tw-page"><SkeletonList rows={4} height={64} /></div>;
  if (event.status === 'error') return <div className="tw-page"><ErrorState error={event.error} onRetry={event.reload} /></div>;
  const ev = event.data;
  const areas = ev.areas.length ? ev.areas : FALLBACK_AREAS;
  // área que não está na lista do evento (jornada antiga) não vale: o campo mostraria uma e o envio levaria outra
  const effArea = areas.some((a) => a.key === values.area) ? values.area : '';
  if (!effArea) errors.area = 'Escolha uma trilha.';
  const themes = SPECIALTIES_BY_TRACK.find((t) => t.key === effArea)?.specialties ?? [];

  if (!ev.registrationOpen) {
    return (
      <div className="tw-page" data-testid="p4-closed">
        <EmptyState title="Inscrições encerradas" text="As inscrições para a mentoria estão fechadas no momento." />
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setAlready(false);
    setTaken(false);
    setTouched({ name: true, email: true, phone: true, linkedin: true, area: true, mentor: true, note: true, consent: true });
    if (Object.keys(errors).length > 0) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const turnstileToken = ev.turnstileEnabled ? await getToken().catch((err: unknown) => {
        // código da Cloudflare vai para a medição: diz por que a verificação falhou (VPN, rede, navegador)
        const code = err instanceof TurnstileError ? err.code : 'erro';
        throw new ApiError(0, 'TURNSTILE_FAILED', 'Não conseguimos confirmar que você é uma pessoa. Se aparecer uma caixa de verificação acima do botão, toque nela. Depois, toque em "Quero ser mentorada" de novo.', { turnstile: code });
      }) : undefined;
      const res = await call(ENDPOINTS.E02, {
        body: {
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone,
          ...(values.linkedin.trim() ? { linkedin: values.linkedin.trim() } : {}),
          area: effArea,
          ...(values.theme ? { theme: values.theme } : {}),
          slotId: values.choice!.slotId,
          mentorId: values.choice!.mentorId,
          ...(values.note.trim() ? { note: values.note.trim() } : {}),
          ...(journey?.scores ? { quizScores: journey.scores } : {}),
          consent: { accepted: true, version: ev.consentVersion },
          ...(turnstileToken ? { turnstileToken } : {}),
        },
      });
      if (res.status === 'already_registered') {
        track('inscricao_erro', { codigo: 'ALREADY_REGISTERED' });
        setAlready(true);
        return;
      }
      track('inscricao_concluida', { area: effArea, periodo: values.choice!.period });
      const links = { personalPath: res.personalPath, shortPath: res.shortPath };
      savePersonalPath(links);
      navigate(paths.ok, { state: { ...links, appointment: res.appointment } });
    } catch (err) {
      const ae = err instanceof ApiError ? err : null;
      const tsCode = (ae?.details as { turnstile?: string } | undefined)?.turnstile;
      track('inscricao_erro', { codigo: tsCode ? `TURNSTILE_${tsCode.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`.slice(0, 40) : ae?.code ?? 'UNKNOWN' });
      if (ae?.code === 'NETWORK') setFormError({ network: true, text: '' });
      else if (ae?.code === 'REGISTRATION_CLOSED') setFormError({ network: false, text: 'As inscrições estão fechadas no momento.' });
      else if (ae?.code === 'VALIDATION_ERROR') setFormError({ network: false, text: (ae.details as { field?: string } | undefined)?.field ? ae.message : 'Confira os campos e tente de novo.' });
      else if (ae?.code === 'SLOT_UNAVAILABLE') {
        // outra pessoa pegou a vaga entre a lista e o envio: nada foi gravado, escolhe de novo
        set('choice', null);
        setTaken(true);
        setRefresh((n) => n + 1);
      } else if (ae?.code === 'RATE_LIMITED') setFormError({ network: false, text: 'Muitas tentativas. Aguarde um instante e tente de novo.' });
      else setFormError({ network: false, text: ae?.message ?? 'Não foi possível enviar agora. Tente de novo.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="tw-page">
      <Hero eyebrow="Inscrição" title="Quero uma mentoria">
        <p>Leva 1 minuto. Escolha o horário e a mentora da sua trilha; a mesa é definida automaticamente.</p>
      </Hero>

      <form className="tw-stack" onSubmit={submit} noValidate data-testid="p4-form">
        {already && (
          <div className="tw-banner tw-banner--err" role="alert" data-testid="p4-already" ref={alreadyRef}>
            <span><strong>Você já está inscrita na mentoria.</strong> Não é possível fazer outra inscrição com o mesmo e-mail ou celular. Procure alguém da organização do evento para ajudar com a sua inscrição.</span>
          </div>
        )}
        {formError && (
          <div className="tw-banner tw-banner--err" role="alert" data-testid="p4-form-error">
            {formError.network ? (
              <><strong>Não conseguimos enviar agora</strong><span>Seus dados continuam preenchidos. Confira a conexão e toque em enviar de novo.</span></>
            ) : <span>{formError.text}</span>}
          </div>
        )}
        <TextField label="Nome completo" placeholder="Como você quer ser chamada" name="name" autoComplete="name" value={values.name} error={shown('name')} ok={values.name && !errors.name ? 'Tudo certo' : undefined}
          onChange={(e) => set('name', e.target.value)} onBlur={() => touch('name')} data-testid="p4-name" />
        <TextField label="E-mail" placeholder="voce@email.com" name="email" type="email" inputMode="email" autoComplete="email" value={values.email} error={shown('email')} ok={values.email && !errors.email ? 'Uma inscrição por e-mail' : undefined}
          onChange={(e) => { set('email', e.target.value); setAlready(false); }} onBlur={() => touch('email')} data-testid="p4-email" />
        <TextField label="Celular" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" value={values.phone}
          error={shown('phone')} ok={values.phone && !errors.phone ? 'Número válido' : undefined} onChange={(e) => { set('phone', maskPhone(e.target.value)); setAlready(false); }} onBlur={() => touch('phone')} data-testid="p4-phone" />
        <TextField label="LinkedIn" optional name="linkedin" autoComplete="off" placeholder="seu-usuario ou link do perfil" value={values.linkedin}
          error={shown('linkedin')} ok={values.linkedin && !errors.linkedin ? 'A mentora verá seu perfil' : undefined} onChange={(e) => set('linkedin', e.target.value)} onBlur={() => touch('linkedin')} data-testid="p4-linkedin" />
        <SelectField label="Trilha de interesse" hint={journey?.area === effArea ? 'Preenchida com o resultado da sua jornada. Pode trocar.' : undefined} name="area" value={effArea} error={shown('area')}
          onChange={(e) => setValues((p) => ({ ...p, area: e.target.value, theme: '', choice: null }))} onBlur={() => touch('area')} data-testid="p4-area">
          {!effArea && <option value="" disabled>Selecione uma trilha</option>}
          {areas.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </SelectField>
        {themes.length > 0 && (
          <SelectField label="Tema de interesse" optional hint="Um assunto dentro da trilha escolhida." name="theme" value={values.theme}
            onChange={(e) => set('theme', e.target.value)} data-testid="p4-theme">
            <option value="">Selecione um tema</option>
            {themes.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectField>
        )}
        {effArea && <SlotMentorPicker area={effArea} refresh={refresh} taken={taken} value={values.choice} error={shown('mentor')}
          onChange={(c) => { set('choice', c); touch('mentor'); setTaken(false); }} onEmptyChange={setSlotsEmpty} />}
        <TextArea label="O que você quer conversar?" optional name="note" rows={3} maxLength={NOTE_MAX + 40} placeholder="Ex.: como migrar de suporte para backend"
          hint={<span className="tw-counter">{values.note.length}/{NOTE_MAX}</span>} value={values.note} error={shown('note')}
          onChange={(e) => set('note', e.target.value)} onBlur={() => touch('note')} data-testid="p4-note" />
        <CheckboxField name="consent" checked={values.consent} error={shown('consent')}
          onChange={(e) => { set('consent', e.target.checked); touch('consent'); }} data-testid="p4-consent"
          label={<>Concordo com o uso dos meus dados para organizar a mentoria, conforme o {toten
            // no toten uma aba nova não teria como ser fechada: o aviso abre por cima
            ? <button type="button" className="tw-link" style={{ padding: 0, border: 0, background: 'none', font: 'inherit' }} onClick={(e) => { e.preventDefault(); setPrivacy(true); }}>aviso de privacidade</button>
            : <a className="tw-link" href="/privacidade" target="_blank" rel="noopener noreferrer">aviso de privacidade</a>}.</>} />
        <div className={challenge ? 'tw-ts tw-ts--ask' : 'tw-ts'} data-testid="p4-turnstile">
          {challenge && <strong role="status">Toque na caixa abaixo para confirmar que você é uma pessoa.</strong>}
          <div ref={tsBox} />
        </div>
        {ev.turnstileEnabled && <p className="tw-field__hint" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>Verificação de segurança automática ativa</p>}
        <Button type="submit" size="lg" block loading={submitting} disabled={slotsEmpty} data-testid="p4-submit">Quero ser mentorada</Button>
      </form>
      {toten && <Overlay title="Aviso de privacidade" open={privacy} onClose={() => setPrivacy(false)}><Privacidade /></Overlay>}
    </div>
  );
}
