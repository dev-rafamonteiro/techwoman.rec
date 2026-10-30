import { useEffect, useId, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ENDPOINTS, MENTOR_BIO_MAX, MENTOR_THEME_MAX, type UserView } from '@tw/shared';
import {
  ApiError, Button, CheckboxField, ErrorState, LinkButton, SkeletonList, SlotToggleGrid,
  call, formatTime, maskPhone, optionalPhoneError, phoneFromE164, useAuth, useQuery, useToast,
} from '../../ui';
import { PageHead, errMsg, useTitle } from './lib/common';
import './lib/a2-a3.css';

interface FormState {
  name: string; email: string; linkedin: string; phone: string; organization: string; areas: string[]; theme1: string; theme2: string; domains1: string; domains2: string; bio: string; photoUrl: string;
  availability: Set<string>; alsoAdmin: boolean; sendPasswordByEmail: boolean;
}
const EMPTY: FormState = { name: '', email: '', linkedin: '', phone: '', organization: '', areas: [], theme1: '', theme2: '', domains1: '', domains2: '', bio: '', photoUrl: '', availability: new Set(), alsoAdmin: false, sendPasswordByEmail: true };

const fromUser = (u: UserView): FormState => ({
  name: u.name, email: u.email, linkedin: u.linkedin ?? '', phone: phoneFromE164(u.phone), organization: u.organization ?? '', areas: u.areas, theme1: u.themes[0] ?? '', theme2: u.themes[1] ?? '', domains1: (u.themeDomains[0] ?? []).join('; '), domains2: (u.themeDomains[1] ?? []).join('; '), bio: u.bio ?? '',
  photoUrl: u.photoUrl ?? '', availability: new Set(u.availability), alsoAdmin: u.roles.includes('admin'), sendPasswordByEmail: false,
});

const splitDomains = (s: string) => s.split(';').map((d) => d.trim()).filter(Boolean);
/** Tema sem texto sai junto com os domínios dele, para os índices de `themes` e `themeDomains` seguirem alinhados. */
function themesBody(f: FormState): { themes: string[]; themeDomains: string[][] } {
  const pairs = [[f.theme1, f.domains1], [f.theme2, f.domains2]].filter(([t]) => t!.trim());
  return { themes: pairs.map(([t]) => t!.trim()), themeDomains: pairs.map(([, d]) => splitDomains(d!)) };
}

/** Campo do design: rótulo 700 com nota em cinza ao lado, dica ou erro abaixo. */
function Field({ label, note, hint, error, ...rest }: { label: string; note?: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const msg = error ?? hint;
  return (
    <div className="tw-field">
      <label className="tw-field__label" htmlFor={id}>{label}{note && <> <span className="a3f-note">{note}</span></>}</label>
      <input {...rest} id={id} className="tw-input" aria-invalid={error ? true : undefined} aria-describedby={msg ? `${id}-msg` : undefined} />
      {error ? <span id={`${id}-msg`} className="tw-field__error" role="alert"><span aria-hidden="true">⚠ </span>{error}</span>
        : hint ? <span id={`${id}-msg`} className="tw-field__hint">{hint}</span> : null}
    </div>
  );
}

/** Senha provisória da mentora recém-criada, mostrada uma única vez (design A3 "senha-gerada"). */
function CreatedCard({ name, email, password, emailed }: { name: string; email: string; password: string; emailed: boolean }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(password); setCopied(true); } catch { setShown(true); }
  };
  return (
    <div className="a3f-done a23-secret" role="alertdialog" aria-label="Senha provisória gerada" data-testid="a3-secret">
      <div className="tw-stack" style={{ gap: 2 }}>
        <span className="a3f-done__title">Mentora cadastrada!</span>
        <p>Esta é a senha provisória de {name} ({email}). <strong>Não será mostrada de novo.</strong> Ela troca no primeiro acesso.</p>
      </div>
      <div className="a23-secret__btns">
        <output className="a23-secret__value" aria-live="polite">{shown ? password : '•'.repeat(Math.min(password.length, 14))}</output>
        <button type="button" className="a23-secret__ghost" aria-pressed={shown} onClick={() => setShown((s) => !s)}>{shown ? 'Ocultar' : 'Mostrar'}</button>
        <button type="button" className="a23-secret__cta" onClick={() => void copy()}>{copied ? 'Copiada ✓' : 'Copiar'}</button>
        {emailed && <span className="a3f-done__sent">Enviada por e-mail ✓</span>}
      </div>
      <Link to="/admin/mentoras">Voltar para a lista</Link>
    </div>
  );
}

/** A3 · Cadastro/edição de mentora (E31 criar, E32 editar) com revelação única de senha. */
export default function A3FormMentora() {
  const { id } = useParams();
  const editing = !!id;
  useTitle(editing ? 'Editar mentora' : 'Nova mentora');
  const nav = useNavigate();
  const toast = useToast();
  const { hasRole } = useAuth();
  const isSuper = hasRole('super_admin');

  const slots = useQuery((s) => call(ENDPOINTS.E38, { signal: s }), []);
  const mentors = useQuery(async (s) => (editing ? call(ENDPOINTS.E31List, { signal: s }) : null), [id]);
  const [f, setF] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState<{ password: string; email: string; name: string; emailed: boolean } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const mentor = mentors.status === 'success' && mentors.data ? mentors.data.items.find((m) => m.id === id) : undefined;
  useEffect(() => {
    if (mentor && !loaded) { setF(fromUser(mentor)); setLoaded(true); }
  }, [mentor, loaded]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const title = editing ? 'Editar mentora' : 'Nova mentora';
  const back = <Link className="a23-back" to="/admin/mentoras">← Mentoras</Link>;
  if (editing && mentors.status === 'loading') return <div className="tw-page a23">{back}<SkeletonList rows={4} /></div>;
  if (editing && mentors.status === 'error') return <div className="tw-page a23">{back}<ErrorState error={mentors.error} onRetry={mentors.reload} /></div>;
  if (editing && !mentor) return <div className="tw-page a23">{back}<ErrorState title="Mentora não encontrada" onRetry={() => nav('/admin/mentoras')} /></div>;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = 'Informe o nome completo.';
    if (!editing && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Informe um e-mail válido.';
    const phoneError = optionalPhoneError(f.phone);
    if (phoneError) e.phone = phoneError;
    if (f.bio.length > MENTOR_BIO_MAX) e.bio = `No máximo ${MENTOR_BIO_MAX} caracteres.`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const common = {
      name: f.name.trim(), linkedin: f.linkedin.trim() || null, phone: f.phone.trim() || null, organization: f.organization.trim() || null,
      areas: f.areas, ...themesBody(f), bio: f.bio.trim() || null, photoUrl: f.photoUrl.trim() || null, availability: [...f.availability],
    };
    try {
      if (editing) {
        await call(ENDPOINTS.E32, { params: { id: id! }, body: { ...common, ...(isSuper ? { alsoAdmin: f.alsoAdmin } : {}) } });
        toast.success('Mentora atualizada.');
        nav('/admin/mentoras');
      } else {
        const r = await call(ENDPOINTS.E31Create, {
          body: { ...common, email: f.email.trim(), alsoAdmin: isSuper && f.alsoAdmin, sendPasswordByEmail: f.sendPasswordByEmail },
        });
        setSecret({ password: r.provisionalPassword, email: r.user.email, name: r.user.name, emailed: f.sendPasswordByEmail });
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_TAKEN') setErrors({ email: 'Já existe uma conta com este e-mail.' });
      else if (e instanceof ApiError && e.code === 'VALIDATION_ERROR' && (e.details as { field?: string } | undefined)?.field === 'phone') setErrors({ phone: e.message });
      else if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') setErrors({ form: e.message });
      else toast.error(errMsg(e));
    } finally { setSaving(false); }
  };

  const slotOptions = slots.status === 'success' ? slots.data.slots.map((s) => ({ id: s.id, label: formatTime(s.startAt) })) : [];
  const chosen = slotOptions.filter((s) => f.availability.has(s.id)).length;

  return (
    <div className="tw-page a23">
      <div className="a23-headcol">
        {back}
        <PageHead title={title} sub={editing ? 'O e-mail é o login dela e não pode ser alterado.' : 'O e-mail é o login dela. A senha provisória é gerada ao salvar.'} />
      </div>
      {secret ? <CreatedCard {...secret} /> : (
        <form className="a3f-form" aria-label={editing ? 'Edição de mentora' : 'Cadastro de mentora'} onSubmit={submit} noValidate data-testid="a3-form">
          {errors.form && <div className="a3f-error" role="alert">{errors.form}</div>}
          <div className="a23-card a3f-card">
            <h2>Dados</h2>
            <Field label="Nome completo" value={f.name} onChange={(e) => set('name', e.target.value)} error={errors.name} autoComplete="off" />
            <Field label="E-mail" note="(login)" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} error={errors.email} disabled={editing} hint={editing ? 'O e-mail de login não pode ser alterado.' : undefined} />
            <Field label="LinkedIn" note="(opcional)" value={f.linkedin} onChange={(e) => set('linkedin', e.target.value)} />
            <Field label="WhatsApp" note="(opcional)" type="tel" inputMode="tel" placeholder="(00) 00000-0000" value={f.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} error={errors.phone}
              hint="Para avisar a mentora quando uma participante liberar o horário dela. Sem WhatsApp, o aviso vai só por e-mail." data-testid="a3-phone" />
            <Field label="Organização" note="(uso interno, nunca aparece para a participante)" placeholder="Onde ela trabalha" value={f.organization} onChange={(e) => set('organization', e.target.value)} />
            <Field label="Tema comercial 1" note="(opcional)" maxLength={MENTOR_THEME_MAX} value={f.theme1} onChange={(e) => set('theme1', e.target.value)} data-testid="a3-theme1" />
            <Field label="Domínios do tema 1" note="(separados por ;)" value={f.domains1} onChange={(e) => set('domains1', e.target.value)} data-testid="a3-domains1" />
            <Field label="Tema comercial 2" note="(opcional)" maxLength={MENTOR_THEME_MAX} value={f.theme2} onChange={(e) => set('theme2', e.target.value)} data-testid="a3-theme2" />
            <Field label="Domínios do tema 2" note="(separados por ;)" value={f.domains2} onChange={(e) => set('domains2', e.target.value)} data-testid="a3-domains2" />
            <div className="tw-field a3f-bio">
              <label className="tw-field__label" htmlFor="a3-bio">Mini bio <span className="a3f-note">(opcional)</span></label>
              <textarea id="a3-bio" className="tw-textarea" rows={6} maxLength={MENTOR_BIO_MAX + 50} value={f.bio} onChange={(e) => set('bio', e.target.value)}
                aria-invalid={errors.bio ? true : undefined} aria-describedby="a3-bio-msg" />
              {errors.bio ? <span id="a3-bio-msg" className="tw-field__error" role="alert"><span aria-hidden="true">⚠ </span>{errors.bio}</span>
                : <span id="a3-bio-msg" className="tw-field__hint">{f.bio.length}/{MENTOR_BIO_MAX}</span>}
            </div>
            <div className="a3f-photo">
              {f.photoUrl.trim() ? <img className="a3f-avatar" src={f.photoUrl.trim()} alt="" /> : <span className="a3f-avatar" aria-hidden="true" />}
              <Field label="Foto" note="(opcional, endereço da imagem)" type="url" value={f.photoUrl} onChange={(e) => set('photoUrl', e.target.value)} />
            </div>
            {isSuper && (
              <div className="a3f-check">
                <CheckboxField label={<>Também é admin <span className="a3f-note">· só super admin vê esta opção</span></>} checked={f.alsoAdmin} onChange={(e) => set('alsoAdmin', e.target.checked)} />
              </div>
            )}
            {!editing && (
              <div className="a3f-check">
                <CheckboxField label="Enviar a senha provisória por e-mail ao salvar" checked={f.sendPasswordByEmail} onChange={(e) => set('sendPasswordByEmail', e.target.checked)} />
              </div>
            )}
          </div>

          <div className="a23-card a3f-disp">
            <div className="a3f-disp__head">
              <h2>Disponibilidade inicial</h2>
              {slots.status === 'success' && <span className="a23-small">{chosen} de {slotOptions.length}</span>}
            </div>
            <span className="a23-small">A mentora pode ajustar depois, pelo celular.</span>
            {slots.status === 'loading' && <SkeletonList rows={1} height={60} />}
            {slots.status === 'error' && <ErrorState error={slots.error} onRetry={slots.reload} />}
            {slots.status === 'success' && (
              <SlotToggleGrid legend="Horários disponíveis" slots={slotOptions} selected={f.availability}
                onToggle={(sid) => set('availability', (() => { const n = new Set(f.availability); if (n.has(sid)) n.delete(sid); else n.add(sid); return n; })())} />
            )}
          </div>

          <div className="a23-actions a23-actions--end a3f-foot">
            <LinkButton to="/admin/mentoras" variant="secondary" className="a23-btn a23-btn--lg">Cancelar</LinkButton>
            <Button type="submit" loading={saving} className="a23-btn a23-btn--lg">{editing ? 'Salvar alterações' : 'Salvar e gerar senha'}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
