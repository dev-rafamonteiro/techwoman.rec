import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ENDPOINTS, PASSWORD_MIN_LENGTH } from '@tw/shared';
import { ApiError, Button, Card, CheckboxField, Hero, TextField, call, useAuth, useQuery, useToast } from '../../ui';

/** M2 · Primeiro acesso / troca de senha (E13) + conferência do perfil (E28) */
export default function M2NovaSenha() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const event = useQuery((s) => call(ENDPOINTS.E01, { signal: s }), []);
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [linkedin, setLinkedin] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [areas, setAreas] = useState<Set<string> | null>(null);
  const [profileTouched, setProfileTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = useMemo(() => ({
    current: current ? undefined : 'Informe a senha provisória.',
    pw: pw.length >= PASSWORD_MIN_LENGTH ? undefined : `A nova senha precisa ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`,
    confirm: confirm === pw ? undefined : 'As senhas não são iguais.',
    name: name.trim().length >= 2 ? undefined : 'Informe seu nome.',
    photo: !photoUrl || /^https:\/\/\S+$/.test(photoUrl) ? undefined : 'Use um endereço https://',
  }), [current, pw, confirm, name, photoUrl]);
  const valid = !errors.current && !errors.pw && !errors.confirm && !errors.name && !errors.photo;
  const shown = <K extends keyof typeof errors>(k: K) => (touched ? errors[k] : undefined);
  const areaList = event.status === 'success' ? event.data.areas : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!valid) return;
    setSubmitting(true);
    try {
      await call(ENDPOINTS.E13, { body: { currentPassword: current, newPassword: pw } });
      if (profileTouched) {
        try {
          await call(ENDPOINTS.E28, {
            body: {
              name: name.trim(),
              ...(linkedin.trim() ? { linkedin: linkedin.trim() } : {}),
              ...(photoUrl.trim() ? { photoUrl: photoUrl.trim() } : {}),
              ...(areas ? { areas: [...areas] } : {}),
            },
          });
        } catch (pe) {
          toast.error(pe instanceof ApiError ? pe.message : 'A senha foi trocada, mas não foi possível salvar o perfil. Edite depois.');
        }
      }
      const u = await refresh();
      navigate(u?.homePath ?? '/mentora/aguardando', { replace: true });
    } catch (err) {
      const ae = err instanceof ApiError ? err : null;
      if (ae?.code === 'INVALID_CREDENTIALS') setError('A senha atual não confere.');
      else if (ae?.code === 'WEAK_PASSWORD') setError(`Senha fraca. Use no mínimo ${PASSWORD_MIN_LENGTH} caracteres e evite senhas comuns.`);
      else setError(ae?.message ?? 'Não foi possível trocar a senha agora. Tente de novo.');
    } finally {
      setSubmitting(false);
    }
  }

  const toggleArea = (key: string) => {
    setProfileTouched(true);
    setAreas((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="tw-page tw-stack">
      <Hero title="Crie sua nova senha"><p>No primeiro acesso é obrigatório trocar a senha provisória.</p></Hero>
      <form className="tw-stack" onSubmit={submit} noValidate data-testid="m2-form">
        {error && <div className="tw-card" role="alert" data-testid="m2-error">{error}</div>}
        <TextField label="Senha provisória" type="password" autoComplete="current-password" value={current} error={shown('current')}
          onChange={(e) => setCurrent(e.target.value)} data-testid="m2-current" />
        <TextField label="Nova senha" type="password" autoComplete="new-password" value={pw} error={shown('pw')}
          hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`} ok={pw.length >= PASSWORD_MIN_LENGTH ? 'Tamanho ok' : undefined}
          onChange={(e) => setPw(e.target.value)} data-testid="m2-new" />
        <TextField label="Confirmar senha" type="password" autoComplete="new-password" value={confirm} error={shown('confirm')}
          onChange={(e) => setConfirm(e.target.value)} data-testid="m2-confirm" />

        <Card>
          <h2 className="tw-title tw-title--ink">Confira seu perfil</h2>
          <div className="tw-stack">
            <TextField label="Nome" autoComplete="name" value={name} error={shown('name')}
              onChange={(e) => { setName(e.target.value); setProfileTouched(true); }} data-testid="m2-name" />
            <TextField label="LinkedIn" optional value={linkedin} hint="Pode ser só o usuário ou a URL completa."
              onChange={(e) => { setLinkedin(e.target.value); setProfileTouched(true); }} data-testid="m2-linkedin" />
            <TextField label="Foto (endereço da imagem)" optional type="url" value={photoUrl} error={shown('photo')}
              onChange={(e) => { setPhotoUrl(e.target.value); setProfileTouched(true); }} data-testid="m2-photo" />
            {areaList.length > 0 && (
              <fieldset className="tw-stack" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="tw-field__label">Áreas de atuação</legend>
                {areaList.map((a) => (
                  <CheckboxField key={a.key} label={a.label} checked={areas?.has(a.key) ?? false} onChange={() => toggleArea(a.key)} />
                ))}
              </fieldset>
            )}
          </div>
        </Card>
        <Button type="submit" size="lg" block loading={submitting} data-testid="m2-submit">Salvar e continuar</Button>
      </form>
    </div>
  );
}
