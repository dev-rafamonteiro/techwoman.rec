import { useState, type FormEvent } from 'react';
import { ENDPOINTS, type BradescoMentorInput, type BradescoMentorView } from '@tw/shared';
import { Button, CheckboxField, EmptyState, ErrorState, SkeletonList, TextArea, TextField, call, useQuery, useToast } from '../../ui';
import { PageHead, errMsg, useTitle } from './lib/common';

interface FormValue {
  name: string;
  expertise: string;
  city: string;
  linkedin: string;
  photoUrl: string;
  bio: string;
  themeNames: string[];
  domainLists: string[];
  slotLines: string;
  active: boolean;
}

const EMPTY: FormValue = {
  name: '', expertise: '', city: '', linkedin: '', photoUrl: '', bio: '',
  themeNames: ['', ''], domainLists: ['', ''], slotLines: '', active: true,
};

function fromMentor(mentor: BradescoMentorView): FormValue {
  return {
    name: mentor.name,
    expertise: mentor.expertise,
    city: mentor.city,
    linkedin: mentor.linkedin ?? '',
    photoUrl: mentor.photoUrl ?? '',
    bio: mentor.bio,
    themeNames: [mentor.themes[0]?.name ?? '', mentor.themes[1]?.name ?? ''],
    domainLists: mentor.themes.map((theme) => theme.domains.join(', ')).concat(['']).slice(0, 2),
    slotLines: mentor.slots.map((slot) => `${slot.id}|${slot.time}|${slot.topic}`).join('\n'),
    active: mentor.active,
  };
}

function toInput(form: FormValue): BradescoMentorInput {
  const themes = form.themeNames.flatMap((name, index) => {
    const cleanName = name.trim();
    if (!cleanName) return [];
    return [{
      name: cleanName,
      domains: form.domainLists[index]!.split(',').map((domain) => domain.trim()).filter(Boolean),
    }];
  });
  const lines = form.slotLines.split(/\r?\n/).filter((line) => line.trim());
  const slots = lines.map((line, index) => {
    const [id, time, ...topicParts] = line.split('|');
    const topic = topicParts.join('|').trim();
    if (!id?.trim() || !time?.trim() || !topic) throw new Error(`Confira a linha ${index + 1} dos horários.`);
    return { id: id.trim(), time: time.trim(), topic };
  });
  return {
    name: form.name.trim(),
    expertise: form.expertise.trim(),
    city: form.city.trim(),
    linkedin: form.linkedin.trim() || null,
    photoUrl: form.photoUrl.trim() || null,
    bio: form.bio.trim(),
    themes,
    slots,
    active: form.active,
  };
}

export default function A10MentorasBradesco() {
  useTitle('Mentoras Bradesco');
  const toast = useToast();
  const list = useQuery((signal) => call(ENDPOINTS.E49AdminList, { signal }), []);
  const [selected, setSelected] = useState<BradescoMentorView | null>(null);
  const [form, setForm] = useState<FormValue>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const startNew = () => {
    setSelected(null);
    setForm(EMPTY);
    setFormError('');
    setFormOpen(true);
  };
  const startEdit = (mentor: BradescoMentorView) => {
    setSelected(mentor);
    setForm(fromMentor(mentor));
    setFormError('');
    setFormOpen(true);
  };
  const change = <K extends keyof FormValue>(key: K, value: FormValue[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    let body: BradescoMentorInput;
    try {
      body = toInput(form);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Confira os dados informados.');
      return;
    }
    setSaving(true);
    try {
      if (selected) {
        await call(ENDPOINTS.E51, { params: { id: selected.id }, body });
        toast.success('Mentora atualizada.');
      } else {
        await call(ENDPOINTS.E49AdminCreate, { body });
        toast.success('Mentora cadastrada.');
      }
      setSelected(null);
      setForm(EMPTY);
      setFormOpen(false);
      await list.refetch();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Confira')) setFormError(error.message);
      else toast.error(errMsg(error));
    } finally {
      setSaving(false);
    }
  };

  if (list.status === 'loading') return <div className="tw-page"><SkeletonList rows={4} /></div>;
  if (list.status === 'error') return <div className="tw-page"><ErrorState error={list.error} onRetry={list.reload} /></div>;

  return (
    <div className="tw-page">
      <PageHead title="Mentoras Bradesco" sub="Gerencie perfis, temas comerciais, domínios e horários da jornada." />
      <p>Horários reservados ficam bloqueados para novas participantes. Para preencher horários futuros, edite a mentora e inclua novas linhas.</p>
      <div className="tw-row" style={{ justifyContent: 'space-between', marginBlock: 20 }}>
        <strong>{list.data.items.length} mentoras cadastradas</strong>
        <Button onClick={startNew}>Cadastrar mentora</Button>
      </div>

      {list.data.items.length === 0 ? (
        <EmptyState title="Nenhuma mentora cadastrada" text="Cadastre as mentoras da planilha para começar a receber recomendações e reservas." />
      ) : (
        <div className="tw-stack">
          {list.data.items.map((mentor) => (
            <article key={mentor.id} className="tw-card">
              <div className="tw-row" style={{ justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{mentor.name}</h2>
                  <p style={{ margin: '6px 0' }}>{mentor.expertise} · {mentor.city} · {mentor.active ? 'Ativa' : 'Inativa'}</p>
                  <p style={{ margin: 0 }}>{mentor.slots.filter((slot) => slot.available).length} horários livres de {mentor.slots.length}</p>
                </div>
                <Button variant="secondary" onClick={() => startEdit(mentor)}>Editar</Button>
              </div>
              <div className="tw-row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
                {mentor.themes.flatMap((theme) => [theme.name, ...theme.domains]).map((label, index) => <span className="tw-pub__tag" key={`${mentor.id}-${index}`}>{label}</span>)}
              </div>
            </article>
          ))}
        </div>
      )}

      {formOpen && (
        <form className="tw-stack" onSubmit={(event) => void save(event)} style={{ marginTop: 28, padding: 24, border: '1px solid var(--tw-lilac-200)', borderRadius: 18 }}>
          <div className="tw-row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{selected ? 'Editar mentora' : 'Nova mentora'}</h2>
            <Button type="button" variant="secondary" onClick={() => setForm(EMPTY)}>Limpar</Button>
          </div>
          <TextField label="Nome" required maxLength={120} value={form.name} onChange={(event) => change('name', event.target.value)} />
          <TextField label="Expertise" required maxLength={160} value={form.expertise} onChange={(event) => change('expertise', event.target.value)} />
          <TextField label="Cidade" required maxLength={80} value={form.city} onChange={(event) => change('city', event.target.value)} />
          <TextField label="LinkedIn" type="url" value={form.linkedin} onChange={(event) => change('linkedin', event.target.value)} />
          <TextField label="Foto (URL)" type="url" value={form.photoUrl} onChange={(event) => change('photoUrl', event.target.value)} />
          <TextArea label="Biografia" maxLength={1200} value={form.bio} onChange={(event) => change('bio', event.target.value)} />
          {[0, 1].map((index) => (
            <div className="tw-stack" key={index}>
              <TextField label={`Tema comercial ${index + 1}`} maxLength={120} value={form.themeNames[index]} onChange={(event) => change('themeNames', form.themeNames.map((value, i) => i === index ? event.target.value : value))} />
              <TextArea label={`Domínios do tema ${index + 1}`} hint="Separe os domínios por vírgula." value={form.domainLists[index]} onChange={(event) => change('domainLists', form.domainLists.map((value, i) => i === index ? event.target.value : value))} />
            </div>
          ))}
          <TextArea
            label="Horários e assuntos"
            hint={'Uma linha por horário: HH:mm|horário exibido|tema. Ex.: 10:00|10h–10h45|Gestão de pessoas'}
            value={form.slotLines}
            onChange={(event) => change('slotLines', event.target.value)}
            rows={7}
          />
          <CheckboxField label="Mentora ativa para recomendações e reservas" checked={form.active} onChange={(event) => change('active', event.target.checked)} />
          {formError && <p role="alert" className="tw-field__error">{formError}</p>}
          <div className="tw-row">
            <Button type="submit" loading={saving}>Salvar mentora</Button>
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancelar</Button>
          </div>
        </form>
      )}
    </div>
  );
}
