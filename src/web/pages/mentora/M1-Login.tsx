import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, Button, Card, Hero, SkeletonList, TextField, useAuth } from '../../ui';
import { safeNext } from '../../shell/auth';

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  ACCOUNT_DISABLED: 'Esta conta está desativada. Procure a organização no balcão de apoio.',
  ACCOUNT_LOCKED: 'Muitas tentativas. Por segurança, o acesso fica bloqueado por 5 minutos. Tente de novo depois.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  NETWORK: 'Sem conexão. Confira a internet e tente de novo.',
};

/** M1 · Login (E10; redirecionamento por perfil via E12) */
export default function M1Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [forgot, setForgot] = useState(false);

  if (loading) return <div className="tw-page"><SkeletonList rows={2} height={64} /></div>;
  if (user) return <Navigate to={user.mustChangePassword ? '/entrar/nova-senha' : next ?? user.homePath} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setEmailError('Informe um e-mail válido.');
      return;
    }
    setEmailError(undefined);
    setSubmitting(true);
    try {
      const u = await login({ email: email.trim(), password });
      navigate(u.mustChangePassword ? '/entrar/nova-senha' : next ?? u.homePath, { replace: true });
    } catch (err) {
      const ae = err instanceof ApiError ? err : null;
      setError((ae && MESSAGES[ae.code]) ?? 'Não foi possível entrar agora. Tente de novo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="tw-page tw-stack">
      <Hero title="Entrar"><p>Área da mentora e da organização.</p></Hero>
      <form className="tw-stack" onSubmit={submit} noValidate data-testid="m1-form">
        {error && <div className="tw-card" role="alert" data-testid="m1-error">{error}</div>}
        <TextField label="E-mail" type="email" inputMode="email" autoComplete="username" value={email} error={emailError}
          onChange={(e) => setEmail(e.target.value)} data-testid="m1-email" />
        <TextField label="Senha" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} data-testid="m1-password" />
        <Button type="submit" size="lg" block loading={submitting} disabled={!password || !email} data-testid="m1-submit">Entrar</Button>
      </form>
      <Button variant="ghost" block onClick={() => setForgot((v) => !v)} aria-expanded={forgot} data-testid="m1-forgot">Esqueci minha senha</Button>
      {forgot && <Card><p role="status" data-testid="m1-forgot-text">Procure a organização no balcão de apoio.</p></Card>}
    </div>
  );
}
