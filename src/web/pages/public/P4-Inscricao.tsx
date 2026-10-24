import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ENDPOINTS, type PreferredPeriod } from '@tw/shared';
import {
  ApiError, Button, CheckboxField, EmptyState, ErrorState, Hero, PERIOD_LABELS, RadioCards, SelectField, SkeletonList,
  TextArea, TextField, call, maskPhone, useQuery,
} from '../../ui';
import { FALLBACK_AREAS } from './lib/areas';
import { loadJourney, savePersonalPath } from './lib/journey';
import { mountTurnstile, type TurnstileHandle } from './lib/turnstile';

type Field = 'name' | 'email' | 'phone' | 'linkedin' | 'area' | 'preferredPeriod' | 'note' | 'consent';
const NOTE_MAX = 280;

interface Values {
  name: string;
  email: string;
  phone: string;
  linkedin: string;
  area: string;
  preferredPeriod: PreferredPeriod | null;
  note: string;
  consent: boolean;
}

function validate(v: Values): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (v.name.trim().split(/\s+/).length < 2) e.name = 'Informe nome e sobrenome.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) e.email = 'Digite um e-mail válido.';
  if (v.phone.replace(/\D/g, '').length !== 11) e.phone = 'Use DDD + número: (00) 00000-0000.';
  if (v.linkedin && !/^([a-z0-9-]{3,100}|(https?:\/\/)?(www\.)?linkedin\.com\/in\/[a-z0-9-]{3,100}\/?)$/i.test(v.linkedin.trim())) {
    e.linkedin = 'Use seu usuário ou o link completo do perfil.';
  }
  if (!v.area) e.area = 'Escolha uma área de interesse.';
  if (!v.preferredPeriod) e.preferredPeriod = 'Escolha um período.';
  if (v.note.length > NOTE_MAX) e.note = `Use no máximo ${NOTE_MAX} caracteres.`;
  if (!v.consent) e.consent = 'Precisamos do seu consentimento para continuar.';
  return e;
}

/** P4 · Inscrição na mentoria (E01, E02) · RN01, RN02 */
export default function P4Inscricao() {
  const navigate = useNavigate();
  const event = useQuery((s) => call(ENDPOINTS.E01, { signal: s }), []);
  const journey = useMemo(() => loadJourney(), []);

  const [values, setValues] = useState<Values>({
    name: '', email: '', phone: '', linkedin: '', area: journey?.area ?? '', preferredPeriod: null, note: '', consent: false,
  });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ network: boolean; text: string } | null>(null);
  const [already, setAlready] = useState(false);

  const tsBox = useRef<HTMLDivElement>(null);
  const ts = useRef<TurnstileHandle | null>(null);
  useEffect(() => {
    let alive = true;
    if (tsBox.current) {
      mountTurnstile(tsBox.current).then((h) => (alive ? (ts.current = h) : h.destroy()), () => undefined);
    }
    return () => {
      alive = false;
      ts.current?.destroy();
      ts.current = null;
    };
  }, []);

  const errors = validate(values);
  const shown = (f: Field) => (touched[f] ? errors[f] : undefined);
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setValues((p) => ({ ...p, [k]: val }));
  const touch = (f: Field) => setTouched((p) => ({ ...p, [f]: true }));

  if (event.status === 'loading') return <div className="tw-page"><SkeletonList rows={4} height={64} /></div>;
  if (event.status === 'error') return <div className="tw-page"><ErrorState error={event.error} onRetry={event.reload} /></div>;
  const ev = event.data;
  const areas = ev.areas.length ? ev.areas : FALLBACK_AREAS;
  const periods = ev.periods.length
    ? ev.periods.map((p) => ({ value: p.key, label: p.label }))
    : (Object.entries(PERIOD_LABELS) as [PreferredPeriod, string][]).map(([value, label]) => ({ value, label }));

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
    setTouched({ name: true, email: true, phone: true, linkedin: true, area: true, preferredPeriod: true, note: true, consent: true });
    if (Object.keys(errors).length > 0) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSubmitting(true);
    try {
      if (!ts.current) throw new ApiError(0, 'TURNSTILE_FAILED', 'Não foi possível verificar que você é uma pessoa. Recarregue a página e tente de novo.');
      const turnstileToken = await ts.current.getToken().catch(() => {
        throw new ApiError(0, 'TURNSTILE_FAILED', 'Não foi possível verificar que você é uma pessoa. Tente de novo.');
      });
      const res = await call(ENDPOINTS.E02, {
        body: {
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone,
          ...(values.linkedin.trim() ? { linkedin: values.linkedin.trim() } : {}),
          area: values.area,
          preferredPeriod: values.preferredPeriod!,
          ...(values.note.trim() ? { note: values.note.trim() } : {}),
          ...(journey?.scores ? { quizScores: journey.scores } : {}),
          consent: { accepted: true, version: ev.consentVersion },
          turnstileToken,
        },
      });
      if (res.status === 'already_registered') {
        setAlready(true);
        return;
      }
      savePersonalPath(res.personalPath);
      navigate('/mentoria/inscricao/ok', { state: { personalPath: res.personalPath } });
    } catch (err) {
      const ae = err instanceof ApiError ? err : null;
      if (ae?.code === 'NETWORK') setFormError({ network: true, text: '' });
      else if (ae?.code === 'REGISTRATION_CLOSED') setFormError({ network: false, text: 'As inscrições estão fechadas no momento.' });
      else if (ae?.code === 'VALIDATION_ERROR') setFormError({ network: false, text: 'Confira os campos e tente de novo.' });
      else if (ae?.code === 'RATE_LIMITED') setFormError({ network: false, text: 'Muitas tentativas. Aguarde um instante e tente de novo.' });
      else setFormError({ network: false, text: ae?.message ?? 'Não foi possível enviar agora. Tente de novo.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="tw-page">
      <Hero eyebrow="Inscrição" title="Quero uma mentoria">
        <p>Leva 1 minuto. Uma mentora da sua área vai propor horário e mesa.</p>
      </Hero>

      <form className="tw-stack" onSubmit={submit} noValidate data-testid="p4-form">
        {already && (
          <div className="tw-card tw-card--accent" role="status" data-testid="p4-already">
            Você já tem uma inscrição. Enviamos de novo o link da sua página para seu e-mail.
          </div>
        )}
        {formError && (
          <div className="tw-card" role="alert" data-testid="p4-form-error">
            {formError.network ? (
              <><strong>Não conseguimos enviar agora</strong><br />Seus dados continuam preenchidos. Confira a conexão e toque em enviar de novo.</>
            ) : formError.text}
          </div>
        )}
        <TextField label="Nome completo" placeholder="Como você quer ser chamada" name="name" autoComplete="name" value={values.name} error={shown('name')} ok={values.name && !errors.name ? 'Tudo certo' : undefined}
          onChange={(e) => set('name', e.target.value)} onBlur={() => touch('name')} data-testid="p4-name" />
        <TextField label="E-mail" placeholder="voce@email.com" name="email" type="email" inputMode="email" autoComplete="email" value={values.email} error={shown('email')} ok={values.email && !errors.email ? 'Uma inscrição por e-mail' : undefined}
          onChange={(e) => { set('email', e.target.value); setAlready(false); }} onBlur={() => touch('email')} data-testid="p4-email" />
        <TextField label="WhatsApp" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" value={values.phone}
          error={shown('phone')} ok={values.phone && !errors.phone ? 'Vamos avisar o convite por aqui' : undefined} onChange={(e) => set('phone', maskPhone(e.target.value))} onBlur={() => touch('phone')} data-testid="p4-phone" />
        <TextField label="LinkedIn" optional name="linkedin" autoComplete="off" placeholder="seu-usuario ou link do perfil" value={values.linkedin}
          error={shown('linkedin')} ok={values.linkedin && !errors.linkedin ? 'A mentora verá seu perfil' : undefined} onChange={(e) => set('linkedin', e.target.value)} onBlur={() => touch('linkedin')} data-testid="p4-linkedin" />
        <SelectField label="Área de interesse" hint={journey ? "Preenchida com o resultado da sua jornada. Pode trocar." : undefined} name="area" value={values.area} error={shown('area')}
          onChange={(e) => set('area', e.target.value)} onBlur={() => touch('area')} data-testid="p4-area">
          <option value="">Selecione</option>
          {areas.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </SelectField>
        <RadioCards legend="Período preferido" name="preferredPeriod" options={periods} value={values.preferredPeriod}
          error={shown('preferredPeriod')} hint="É só uma preferência. O horário final é definido pela mentora e você confirma."
          onChange={(v) => { set('preferredPeriod', v); touch('preferredPeriod'); }} />
        <TextArea label="O que você quer conversar?" optional name="note" rows={3} maxLength={NOTE_MAX + 40} placeholder="Ex.: como migrar de suporte para backend"
          hint={`${values.note.length}/${NOTE_MAX}`} value={values.note} error={shown('note')}
          onChange={(e) => set('note', e.target.value)} onBlur={() => touch('note')} data-testid="p4-note" />
        <CheckboxField name="consent" checked={values.consent} error={shown('consent')}
          onChange={(e) => { set('consent', e.target.checked); touch('consent'); }} data-testid="p4-consent"
          label={<>Concordo com o uso dos meus dados para organizar a mentoria, conforme o <a className="tw-link" href="/privacidade" target="_blank" rel="noopener noreferrer">aviso de privacidade</a>.</>} />
        <div ref={tsBox} aria-hidden="true" />
        <p className="tw-field__hint">Verificação de segurança automática ativa</p>
        <Button type="submit" size="lg" block loading={submitting} data-testid="p4-submit">Quero ser mentorada</Button>
        <p className="tw-field__hint">A inscrição não garante a mentoria; as vagas são limitadas pela agenda das mentoras.</p>
      </form>
    </div>
  );
}
