import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ENDPOINTS, MENTOR_BIO_MAX, type UserView } from '@tw/shared';
import {
  ApiError, Button, CheckboxField, ErrorState, Overlay, SecretReveal, SkeletonList, SlotToggleGrid, TextArea, TextField,
  call, formatTime, useAuth, useQuery, useToast,
} from '../../ui';
import { PageHead, errMsg, useAreas, useTitle } from './lib/common';

interface FormState {
  name: string; email: string; linkedin: string; organization: string; areas: string[]; bio: string; photoUrl: string;
  availability: Set<string>; alsoAdmin: boolean; sendPasswordByEmail: boolean;
}
const EMPTY: FormState = { name: '', email: '', linkedin: '', organization: '', areas: [], bio: '', photoUrl: '', availability: new Set(), alsoAdmin: false, sendPasswordByEmail: true };

const fromUser = (u: UserView): FormState => ({
  name: u.name, email: u.email, linkedin: u.linkedin ?? '', organization: u.organization ?? '', areas: u.areas, bio: u.bio ?? '',
  photoUrl: u.photoUrl ?? '', availability: new Set(u.availability), alsoAdmin: u.roles.includes('admin'), sendPasswordByEmail: false,
});

/** A3 · Cadastro/edição de mentora (E31 criar, E32 editar) com revelação única de senha. */
export default function A3FormMentora() {
  const { id } = useParams();
  const editing = !!id;
  useTitle(editing ? 'Editar mentora' : 'Nova mentora');
  const nav = useNavigate();
  const toast = useToast();
  const { hasRole } = useAuth();
  const isSuper = hasRole('super_admin');
  const { areas } = useAreas();

  const slots = useQuery((s) => call(ENDPOINTS.E38, { signal: s }), []);
  const mentors = useQuery(async (s) => (editing ? call(ENDPOINTS.E31List, { signal: s }) : null), [id]);
  const [f, setF] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState<{ password: string; email: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const mentor = mentors.status === 'success' && mentors.data ? mentors.data.items.find((m) => m.id === id) : undefined;
  useEffect(() => {
    if (mentor && !loaded) { setF(fromUser(mentor)); setLoaded(true); }
  }, [mentor, loaded]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  if (editing && mentors.status === 'loading') return <div className="tw-page"><SkeletonList rows={4} /></div>;
  if (editing && mentors.status === 'error') return <div className="tw-page"><ErrorState error={mentors.error} onRetry={mentors.reload} /></div>;
  if (editing && !mentor) return <div className="tw-page"><ErrorState title="Mentora não encontrada" onRetry={() => nav('/admin/mentoras')} /></div>;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = 'Informe o nome completo.';
    if (!editing && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Informe um e-mail válido.';
    if (f.bio.length > MENTOR_BIO_MAX) e.bio = `No máximo ${MENTOR_BIO_MAX} caracteres.`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const common = {
      name: f.name.trim(), linkedin: f.linkedin.trim() || null, organization: f.organization.trim() || null,
      areas: f.areas, bio: f.bio.trim() || null, photoUrl: f.photoUrl.trim() || null, availability: [...f.availability],
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
        setSecret({ password: r.provisionalPassword, email: r.user.email });
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_TAKEN') setErrors({ email: 'Já existe uma conta com este e-mail.' });
      else if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') setErrors({ form: e.message });
      else toast.error(errMsg(e));
    } finally { setSaving(false); }
  };

  const closeSecret = () => { setSecret(null); nav('/admin/mentoras'); };
  const slotOptions = slots.status === 'success' ? slots.data.slots.map((s) => ({ id: s.id, label: formatTime(s.startAt) })) : [];

  return (
    <div className="tw-page">
      <PageHead title={editing ? 'Editar mentora' : 'Nova mentora'} />
      <form className="adm-form" onSubmit={submit} noValidate data-testid="a3-form">
        {errors.form && <div className="adm-note adm-wide" role="alert">{errors.form}</div>}
        <TextField label="Nome completo" value={f.name} onChange={(e) => set('name', e.target.value)} error={errors.name} autoComplete="off" />
        <TextField label="E-mail (login)" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} error={errors.email} disabled={editing} hint={editing ? 'O e-mail de login não pode ser alterado.' : undefined} />
        <TextField label="LinkedIn" optional value={f.linkedin} onChange={(e) => set('linkedin', e.target.value)} />
        <TextField label="Organização" optional hint="Uso interno, nunca aparece para a participante." value={f.organization} onChange={(e) => set('organization', e.target.value)} />
        <fieldset className="adm-wide" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="tw-field__label">Áreas de atuação</legend>
          <div className="tw-row">
            {areas.map((a) => (
              <CheckboxField key={a.key} label={a.label} checked={f.areas.includes(a.key)}
                onChange={(e) => set('areas', e.target.checked ? [...f.areas, a.key] : f.areas.filter((k) => k !== a.key))} />
            ))}
          </div>
        </fieldset>
        <div className="adm-wide">
          <TextArea label="Mini bio" optional maxLength={MENTOR_BIO_MAX + 50} value={f.bio} onChange={(e) => set('bio', e.target.value)} error={errors.bio} hint={`${f.bio.length}/${MENTOR_BIO_MAX}`} />
        </div>
        <TextField label="Foto (endereço da imagem)" optional type="url" value={f.photoUrl} onChange={(e) => set('photoUrl', e.target.value)} />
        <div className="adm-wide">
          <strong>Disponibilidade inicial</strong>
          {slots.status === 'loading' && <SkeletonList rows={1} height={60} />}
          {slots.status === 'error' && <ErrorState error={slots.error} onRetry={slots.reload} />}
          {slots.status === 'success' && (
            <SlotToggleGrid legend="Horários disponíveis" slots={slotOptions} selected={f.availability}
              onToggle={(sid) => set('availability', (() => { const n = new Set(f.availability); if (n.has(sid)) n.delete(sid); else n.add(sid); return n; })())} />
          )}
        </div>
        {isSuper && <CheckboxField label="Também é admin" checked={f.alsoAdmin} onChange={(e) => set('alsoAdmin', e.target.checked)} />}
        {!editing && <CheckboxField label="Enviar a senha provisória por e-mail ao salvar" checked={f.sendPasswordByEmail} onChange={(e) => set('sendPasswordByEmail', e.target.checked)} />}
        <div className="tw-row adm-wide">
          <Button type="submit" loading={saving}>{editing ? 'Salvar alterações' : 'Cadastrar mentora'}</Button>
          <Button variant="ghost" onClick={() => nav('/admin/mentoras')}>Cancelar</Button>
        </div>
      </form>
      <Overlay title="Mentora cadastrada" open={!!secret} onClose={closeSecret}>
        {secret && (
          <div className="tw-stack">
            <p>Entregue esta senha para {secret.email}. Ela troca no primeiro acesso.</p>
            <SecretReveal secret={secret.password} onDone={closeSecret} />
          </div>
        )}
      </Overlay>
    </div>
  );
}
