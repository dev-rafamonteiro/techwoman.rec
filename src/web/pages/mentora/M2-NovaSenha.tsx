import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { canonicalSpecialty, ENDPOINTS, PASSWORD_MIN_LENGTH, SPECIALTIES_BY_TRACK } from '@tw/shared';
import { ApiError, Button, SelectField, TextField, call, maskPhone, optionalPhoneError, phoneFromE164, useAuth, useToast } from '../../ui';
import { safeNext } from '../../shell/auth';
import '../public/public.css';
import { MentorPhotoField } from './lib/MentorPhotoField';

/** M2 · Primeiro acesso / troca de senha (E13) + conferência do perfil (E28) */
export default function M2NovaSenha() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Perfil (E28) só existe para quem tem o papel de mentora; admin só troca a senha (E13).
  const isMentor = !!user?.roles.includes('mentor');
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [linkedin, setLinkedin] = useState(user?.linkedin ?? '');
  const [phone, setPhone] = useState(phoneFromE164(user?.phone));
  const [theme1, setTheme1] = useState(canonicalSpecialty(user?.themes[0] ?? ''));
  const [theme2, setTheme2] = useState(canonicalSpecialty(user?.themes[1] ?? ''));
  const [profileTouched, setProfileTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = useMemo(() => ({
    current: current ? undefined : 'Informe a senha provisória.',
    pw: pw.length >= PASSWORD_MIN_LENGTH ? undefined : `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    confirm: confirm === pw ? undefined : 'As senhas não são iguais.',
    name: !isMentor || name.trim().length >= 2 ? undefined : 'Informe seu nome.',
    phone: optionalPhoneError(phone),
  }), [current, pw, confirm, name, phone]);
  const valid = !errors.current && !errors.pw && !errors.confirm && !errors.name && !errors.phone;
  const shown = <K extends keyof typeof errors>(k: K) => (touched ? errors[k] : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!valid) return;
    setSubmitting(true);
    try {
      await call(ENDPOINTS.E13, { body: { currentPassword: current, newPassword: pw } });
      if (isMentor && profileTouched) {
        try {
          await call(ENDPOINTS.E28, {
            body: {
              name: name.trim(),
              ...(linkedin.trim() ? { linkedin: linkedin.trim() } : {}),
              phone: phone.trim() || null,
              themes: [theme1, theme2].map((t) => canonicalSpecialty(t.trim())).filter(Boolean),
            },
          });
        } catch (pe) {
          toast.error(pe instanceof ApiError ? pe.message : 'A senha foi trocada, mas não foi possível salvar o perfil. Edite depois.');
        }
      }
      const u = await refresh();
      navigate(safeNext(params.get('next')) ?? u?.homePath ?? '/mentora/aguardando', { replace: true });
    } catch (err) {
      const ae = err instanceof ApiError ? err : null;
      if (ae?.code === 'INVALID_CREDENTIALS') setError('A senha atual não confere.');
      else if (ae?.code === 'WEAK_PASSWORD') setError(`Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      else setError(ae?.message ?? 'Não foi possível trocar a senha agora. Tente de novo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="tw-page tw-stack">
      <header><h1 className="tw-ptitle">Crie sua senha</h1><p className="tw-psub">É seu primeiro acesso. Troque a senha provisória e confira seus dados.</p></header>
      <form className="tw-stack" onSubmit={submit} noValidate data-testid="m2-form">
        {error && <div className="tw-card" role="alert" data-testid="m2-error">{error}</div>}
        <TextField label="Senha provisória" type="password" showPasswordToggle autoComplete="current-password" value={current} error={shown('current')}
          onChange={(e) => setCurrent(e.target.value)} data-testid="m2-current" />
        <TextField label="Nova senha" type="password" showPasswordToggle autoComplete="new-password" value={pw} error={shown('pw')}
          hint={<>{pw.length >= PASSWORD_MIN_LENGTH ? '✓' : '✗'} Mínimo de {PASSWORD_MIN_LENGTH} caracteres</>}
          onChange={(e) => setPw(e.target.value)} data-testid="m2-new" />
        <TextField label="Confirmar senha" type="password" showPasswordToggle autoComplete="new-password" value={confirm} error={shown('confirm')} hint={<>{confirm && confirm === pw ? '✓' : '✗'} Confirmação igual à nova senha</>}
          onChange={(e) => setConfirm(e.target.value)} data-testid="m2-confirm" />

        {isMentor && (<>
        <h2 className="tw-ptitle" style={{ fontSize: 17 }}>Seu perfil</h2>
        <TextField label="Nome completo" autoComplete="name" value={name} error={shown('name')}
          onChange={(e) => { setName(e.target.value); setProfileTouched(true); }} data-testid="m2-name" />
        <TextField label="LinkedIn" optional value={linkedin} placeholder="seu-usuario ou link do perfil"
          onChange={(e) => { setLinkedin(e.target.value); setProfileTouched(true); }} data-testid="m2-linkedin" />
        <TextField label="Celular" optional type="tel" inputMode="tel" autoComplete="tel" value={phone} error={shown('phone')} placeholder="(00) 00000-0000"
          onChange={(e) => { setPhone(maskPhone(e.target.value)); setProfileTouched(true); }} data-testid="m2-phone" />
        <MentorPhotoField />
        <SelectField label="Tema comercial 1" optional value={theme1}
          onChange={(e) => { setTheme1(e.target.value); setProfileTouched(true); }} data-testid="m2-theme1">
          <option value="">Selecione um tema</option>
          {SPECIALTIES_BY_TRACK.map((track) => (
            <optgroup key={track.key} label={track.label}>
              {track.specialties.map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}
            </optgroup>
          ))}
        </SelectField>
        <SelectField label="Tema comercial 2" optional value={theme2}
          onChange={(e) => { setTheme2(e.target.value); setProfileTouched(true); }} data-testid="m2-theme2">
          <option value="">Selecione um tema</option>
          {SPECIALTIES_BY_TRACK.map((track) => (
            <optgroup key={track.key} label={track.label}>
              {track.specialties.map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}
            </optgroup>
          ))}
        </SelectField>
        </>)}
        <Button type="submit" size="lg" block loading={submitting} data-testid="m2-submit">Salvar e continuar</Button>
      </form>
    </div>
  );
}
