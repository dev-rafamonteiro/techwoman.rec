import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_REMINDERS, DEFAULT_WHATSAPP_LISTS, ENDPOINTS, MAX_REMINDERS, WHATSAPP_LIST_VARS, invalidWhatsappListVariable, type E41PutBody, type EventConfig, type ReminderRule, type WhatsappListKind } from '@tw/shared';
import { ApiError, ErrorState, SkeletonList, Overlay, SelectField, TextArea, TextField, call, callBlob, endpointUrl, saveBlob, useQuery, useToast } from '../../ui';
import { PageHead, Switch, errMsg, useTitle } from './lib/common';
import './lib/a7-a9.css';

/** `emailSubjects` (assuntos dos 9 layouts) é do contrato de E41 combinado com o backend; ids de src/api/notifications/templates/email/subjects.ts. */
type EmailLayoutId = '01-inscricao-recebida' | '02-convite-horario' | '03-confirmacao' | '04-convite-expirado' | '05-cancelamento-mentora' | '06-acesso-mentora' | '07-inscricao-cancelada' | '08-horario-liberado' | '09-aviso-mentora';
type Draft = Omit<EventConfig, 'id' | 'slots'> & { emailSubjects?: Partial<Record<EmailLayoutId, string>> };
const EMAIL_LAYOUTS: [EmailLayoutId, string][] = [
  ['01-inscricao-recebida', 'Inscrição recebida'], ['02-convite-horario', 'Convite de horário'], ['03-confirmacao', 'Confirmação'],
  ['04-convite-expirado', 'Convite expirado'], ['05-cancelamento-mentora', 'Cancelamento pela mentora'], ['06-acesso-mentora', 'Acesso da mentora'],
  ['07-inscricao-cancelada', 'Inscrição cancelada'], ['08-horario-liberado', 'Horário liberado'], ['09-aviso-mentora', 'Aviso à mentora (mentoria confirmada cancelada)'],
];
const TEMPLATE_LABELS: [keyof EventConfig['templates'], string][] = [
  ['registered', 'Inscrição recebida'], ['invite', 'Convite de horário'], ['confirmed', 'Confirmação'],
  ['reminder', 'Lembrete'], ['expired', 'Convite expirado'], ['cancelled', 'Cancelamento pela mentora'],
];
/** Quando o texto editável ainda é usado, já que o convite e o primeiro lembrete vão como menu pelo WhatsApp. */
const TEMPLATE_HINTS: Partial<Record<keyof EventConfig['templates'], string>> = {
  invite: 'Usado quando o WhatsApp sai em texto simples (sem menu).',
  reminder: 'Usado nos lembretes depois do primeiro; o primeiro pelo WhatsApp vai como menu de presença.',
};
/** Menus do WhatsApp (RN18, RN20): só título e texto mudam; rodapé, botão e opções são fixos. */
const LIST_BLOCKS: { kind: WhatsappListKind; label: string; options: [string, string] }[] = [
  { kind: 'invite', label: 'Convite (menu do WhatsApp)', options: ['Aceito', 'Não posso'] },
  { kind: 'presence', label: 'Confirmação de presença (menu do WhatsApp)', options: ['Sim, confirmo', 'Não poderei ir'] },
];
const LIST_SAMPLE: Record<string, string> = { nome: 'Ana', mentora: 'Tatiana Barros', horario: '9h00', mesa: 'Mesa 5', prazo: '8h50', minutos: '15', link: 'https://techwoman.dev/l/IEO31Kd' };
const fillSample = (t: string) => t.replace(/\{(\w+)\}/g, (m, k: string) => LIST_SAMPLE[k] ?? m);

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const fmt = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** Prévia ao vivo da grade de horários (mesma regra do servidor: sessão + intervalo, até caber no fim). */
export function previewSlots(d: Pick<Draft, 'startTime' | 'endTime' | 'slotMinutes' | 'gapMinutes'>): string[] {
  const out: string[] = [];
  const end = toMin(d.endTime);
  if (!d.slotMinutes || d.slotMinutes < 5) return out;
  for (let t = toMin(d.startTime); t + d.slotMinutes <= end && out.length < 100; t += d.slotMinutes + d.gapMinutes) out.push(`${fmt(t)} – ${fmt(t + d.slotMinutes)}`);
  return out;
}

/** A7 · Configurações do evento (E41) e QR Code (E42), só super admin. */
export default function A7Configuracoes() {
  useTitle('Configurações do evento');
  const toast = useToast();
  const q = useQuery((s) => call(ENDPOINTS.E41Get, { signal: s }), []);
  const lock = useQuery((s) => call(ENDPOINTS.E38, { signal: s }), []);
  const [d, setD] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewId, setPreviewId] = useState<EmailLayoutId>('01-inscricao-recebida');
  const [preview, setPreview] = useState<{ subject: string; html: string; error: string }>({ subject: '', html: '', error: '' });
  useEffect(() => {
    if (!previewOpen) return;
    const ctrl = new AbortController();
    setPreview({ subject: '', html: '', error: '' });
    call(ENDPOINTS.E46, { params: { tipo: previewId }, signal: ctrl.signal })
      .then((j) => setPreview({ subject: j.subject, html: j.html, error: '' }))
      .catch((e) => { if (!ctrl.signal.aborted) setPreview({ subject: '', html: '', error: 'Não foi possível carregar a prévia.' }); void e; });
    return () => ctrl.abort();
  }, [previewOpen, previewId]);
  const [gridError, setGridError] = useState('');
  const lockRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (gridError) lockRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [gridError]);

  useEffect(() => {
    if (q.status === 'success') { const { id: _i, slots: _s, ...rest } = q.data.event; setD(rest); }
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = lock.status === 'success' ? lock.data.appointments.filter((a) => ['invited', 'confirmed', 'in_progress'].includes(a.status)).length : 0;
  const hasActive = activeCount > 0;
  const [newArea, setNewArea] = useState('');
  const slots = useMemo(() => (d ? previewSlots(d) : []), [d]);

  if (q.status === 'loading' || !d) return <div className="tw-page tw-stack"><PageHead title="Configurações do evento" sub="Só o super admin vê esta área." />{q.status === 'error' ? <ErrorState error={q.error} onRetry={q.reload} /> : <SkeletonList rows={4} />}</div>;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => (p ? { ...p, [k]: v } : p));
  const num = (k: 'slotMinutes' | 'gapMinutes' | 'responseWindowMinutes' | 'minLeadMinutes') => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value));
  const timesInvalid = toMin(d.endTime) <= toMin(d.startTime);
  // Lembretes antes de cada mentoria (até 10): tempos de 1 a 1440 min, sem repetir, ao menos um canal cada.
  const reminders: ReminderRule[] = d.reminders ?? DEFAULT_REMINDERS;
  const setReminder = (i: number, r: Partial<ReminderRule>) => set('reminders', reminders.map((x, j) => (j === i ? { ...x, ...r } : x)));
  const toggleChannel = (i: number, c: 'email' | 'whatsapp') => {
    const has = reminders[i]!.channels.includes(c);
    setReminder(i, { channels: has ? reminders[i]!.channels.filter((x) => x !== c) : [...reminders[i]!.channels, c] });
  };
  const addReminder = () => {
    const used = new Set(reminders.map((r) => r.minutesBefore));
    const next = [60, 30, 15, 10, 5, 2, 1, 45, 20, 120].find((m) => !used.has(m)) ?? 1;
    set('reminders', [...reminders, { minutesBefore: next, channels: ['whatsapp'] }]);
  };
  const reminderError = reminders.some((r) => !Number.isInteger(r.minutesBefore) || r.minutesBefore < 1 || r.minutesBefore > 1440)
    ? 'Use de 1 a 1440 minutos (até 24 h) em cada lembrete.'
    : new Set(reminders.map((r) => r.minutesBefore)).size !== reminders.length
      ? 'Dois lembretes com o mesmo tempo: use tempos diferentes.'
      : reminders.some((r) => r.channels.length === 0) ? 'Escolha ao menos um canal em cada lembrete.' : '';
  const reminderSummary = [...reminders].sort((a, b) => b.minutesBefore - a.minutesBefore).map((r) => `${r.minutesBefore} min`).join(', ');

  const lists = d.whatsappLists ?? DEFAULT_WHATSAPP_LISTS;
  const setList = (kind: WhatsappListKind, f: 'title' | 'description', v: string) => set('whatsappLists', { ...lists, [kind]: { ...lists[kind], [f]: v } });
  const badListVar = invalidWhatsappListVariable(lists);
  const listError = (kind: WhatsappListKind, f: 'title' | 'description') =>
    !lists[kind][f].trim() ? 'Preencha este campo.' : badListVar?.field === `whatsappLists.${kind}.${f}` ? `{${badListVar.variable}} não existe nesta mensagem.` : undefined;
  const listsInvalid = LIST_BLOCKS.some(({ kind }) => !!listError(kind, 'title') || !!listError(kind, 'description'));

  const save = async () => {
    setSaving(true); setGridError('');
    const body: E41PutBody = { ...d, areas: d.areas.map((a) => ({ key: a.key || slug(a.label), label: a.label.trim() })) };
    try {
      const r = await call(ENDPOINTS.E41Put, { body });
      const { id: _i, slots: _s, ...rest } = r.event; setD(rest);
      toast.success('Configurações salvas.');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'GRID_LOCKED') setGridError('Há mentorias marcadas. Horários, duração e intervalo não podem mudar até cancelá-las ou movê-las.');
      else if (e instanceof ApiError && e.code === 'CONFLICT') toast.conflict('Outra pessoa alterou as configurações.', () => void q.reload());
      else toast.error(errMsg(e));
    } finally { setSaving(false); }
  };

  const qr = async (kind: 'png' | 'svg') => {
    try { saveBlob(await callBlob(kind === 'png' ? ENDPOINTS.E42Png : ENDPOINTS.E42Svg), `qrcode-inscricao.${kind}`); } catch (e) { toast.error(errMsg(e)); }
  };

  const addArea = () => {
    const label = newArea.trim();
    if (!label || d.areas.some((a) => a.label.toLowerCase() === label.toLowerCase())) return;
    set('areas', [...d.areas, { key: slug(label), label }]);
    setNewArea('');
  };

  return (
    <div className="tw-page tw-stack a79 a7">
      <PageHead title="Configurações do evento" sub="Só o super admin vê esta área.">
        <button type="button" className="a79-btn a79-btn--o a79-btn--lg" disabled={saving || timesInvalid || d.areas.length === 0 || !!reminderError || listsInvalid} aria-busy={saving || undefined} onClick={() => void save()}>
          {saving && <span className="tw-spinner" aria-hidden="true" />}Salvar configurações
        </button>
      </PageHead>
      {gridError && <div className="a79-alert" role="alert" data-testid="grid-locked" ref={lockRef} tabIndex={-1}>{gridError}</div>}

      <div className="a7-cols">
        <div className="a7-main">
          <section className="a7-sec" aria-labelledby="a7-evento">
            <h2 id="a7-evento">Evento</h2>
            <div className="a7-grid">
              <TextField label="Nome" value={d.name} onChange={(e) => set('name', e.target.value)} />
              <TextField label="Data" type="date" value={d.date} onChange={(e) => set('date', e.target.value)} />
              <TextField label="Local" optional value={d.location ?? ''} onChange={(e) => set('location', e.target.value || null)} />
              <TextField label="Fuso" value={d.timezone} onChange={(e) => set('timezone', e.target.value)} />
            </div>
            <div className="a7-insc" data-on={d.registrationOpen}>
              <span className="a7-insc__txt">
                <strong>Inscrições {d.registrationOpen ? 'abertas' : 'fechadas'}</strong>
                <span>Fechadas, o formulário mostra um aviso e não aceita novas inscrições.</span>
              </span>
              <Switch label="Inscrições abertas" checked={d.registrationOpen} onChange={(v) => set('registrationOpen', v)} />
            </div>
          </section>

          <section className="a7-sec" aria-labelledby="a7-grade">
            <div className="a7-sec__head"><h2 id="a7-grade">Grade de sessões</h2><span className="a79-hint">Fuso {d.timezone}</span></div>
            {hasActive && (
              <div className="a7-lock" role="status">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                Há {activeCount} {activeCount === 1 ? 'mentoria ativa' : 'mentorias ativas'}: horário, duração e intervalo ficam bloqueados.
              </div>
            )}
            <div className="a7-grid a7-grid--4">
              <TextField label="Hora de início" type="time" value={d.startTime} disabled={hasActive} onChange={(e) => set('startTime', e.target.value)} />
              <TextField label="Hora de fim" type="time" value={d.endTime} disabled={hasActive} onChange={(e) => set('endTime', e.target.value)} error={timesInvalid ? 'O fim deve ser depois do início.' : undefined} />
              <TextField label="Duração da sessão (min)" type="number" min={5} max={180} value={d.slotMinutes} disabled={hasActive} onChange={num('slotMinutes')} />
              <TextField label="Intervalo entre sessões (min)" type="number" min={0} max={60} value={d.gapMinutes} disabled={hasActive} onChange={num('gapMinutes')} />
            </div>
            <div className="a7-preview" aria-live="polite" data-testid="grid-preview">
              <strong>Prévia: {slots.length} {slots.length === 1 ? 'sessão' : 'sessões'} no dia</strong>
              {slots.length === 0 ? <p className="a79-hint" style={{ margin: 0 }}>Nenhum horário cabe nesses valores.</p> : (
                <ul className="a7-chips" aria-label="Prévia da grade de horários">{slots.map((l) => <li key={l} title={l}>{l.split(' – ')[0]}</li>)}</ul>
              )}
            </div>
          </section>

          <section className="a7-sec" aria-labelledby="a7-convites">
            <h2 id="a7-convites">Convites</h2>
            <div className="a7-grid a7-grid--2">
              <TextField label="Prazo para responder (min)" type="number" min={1} max={120} value={d.responseWindowMinutes} onChange={num('responseWindowMinutes')} />
              <TextField label="Antecedência mínima do convite (min)" type="number" min={0} max={120} value={d.minLeadMinutes} onChange={num('minLeadMinutes')} />
            </div>
          </section>

          <section className="a7-sec" aria-labelledby="a7-lembretes" data-testid="a7-reminders">
            <div className="a7-sec__head"><h2 id="a7-lembretes">Lembretes antes da mentoria</h2><span className="a79-hint">{reminders.length} de {MAX_REMINDERS}</span></div>
            <p className="a79-hint" style={{ margin: 0 }}>
              {reminders.length ? `A participante recebe ${reminders.length === 1 ? 'um lembrete' : `${reminders.length} lembretes`} antes de cada mentoria confirmada: ${reminderSummary} antes do início.` : 'Nenhum lembrete: a participante não é avisada antes da mentoria.'}
              {' '}Sem WhatsApp disponível (desligado ou sem telefone), o lembrete vai por e-mail. Vale para as mentorias confirmadas depois de salvar.
            </p>
            <ul className="a7-rems">
              {reminders.map((r, i) => (
                <li key={i} className="a7-rem" data-testid={`reminder-${i}`}>
                  <label className="a7-rem__min">
                    <input className="tw-input" type="number" min={1} max={1440} value={r.minutesBefore} aria-label={`Lembrete ${i + 1}: minutos antes`}
                      onChange={(e) => setReminder(i, { minutesBefore: Number(e.target.value) })} />
                    <span>min antes</span>
                  </label>
                  <label className="a7-rem__ch"><input type="checkbox" checked={r.channels.includes('email')} onChange={() => toggleChannel(i, 'email')} />E-mail</label>
                  <label className="a7-rem__ch"><input type="checkbox" checked={r.channels.includes('whatsapp')} onChange={() => toggleChannel(i, 'whatsapp')} />WhatsApp</label>
                  <button type="button" className="a7-rem__del" aria-label={`Remover lembrete de ${r.minutesBefore} min`} onClick={() => set('reminders', reminders.filter((_, j) => j !== i))}>×</button>
                </li>
              ))}
            </ul>
            {reminderError && <p role="alert" className="a7-rem__err">{reminderError}</p>}
            <div><button type="button" className="a79-btn a79-btn--line" disabled={reminders.length >= MAX_REMINDERS} onClick={addReminder} data-testid="reminder-add">+ Adicionar lembrete</button></div>
          </section>

          <section className="a7-sec" aria-labelledby="a7-areas" style={{ gap: 12 }}>
            <h2 id="a7-areas">Áreas disponíveis</h2>
            <ul className="a7-areas">
              {d.areas.map((a, i) => (
                <li key={a.key || i} className="a7-area">{a.label}
                  <button type="button" disabled={d.areas.length <= 1} aria-label={`Remover área ${a.label}`} onClick={() => set('areas', d.areas.filter((_, j) => j !== i))}>×</button>
                </li>
              ))}
            </ul>
            <div className="a7-addarea">
              <label htmlFor="a7-nova-area" className="a79-sr">Nova área</label>
              <input id="a7-nova-area" className="tw-input" placeholder="Nova área" maxLength={60} value={newArea} onChange={(e) => setNewArea(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }} />
              <button type="button" className="a79-btn a79-btn--line" onClick={addArea}>Adicionar</button>
            </div>
          </section>

          <section className="a7-sec" aria-labelledby="a7-assuntos">
            <div className="a7-sec__head"><h2 id="a7-assuntos">Assuntos dos e-mails</h2><span className="a79-hint">Só o assunto é editável. O HTML dos 9 e-mails é fixo no código.</span></div>
            <div className="a7-subjects">
              {EMAIL_LAYOUTS.map(([id, label]) => (
                <TextField key={id} label={label} maxLength={200} value={d.emailSubjects?.[id] ?? ''} data-testid={`subject-${id}`}
                  onChange={(e) => set('emailSubjects', { ...d.emailSubjects, [id]: e.target.value })} />
              ))}
            </div>
            <div><button type="button" className="a79-btn a79-btn--line" onClick={() => setPreviewOpen(true)} data-testid="email-preview-open">Prévia dos e-mails</button></div>
          </section>

          <section className="a7-sec" aria-labelledby="a7-lists" data-testid="a7-lists">
            <div className="a7-sec__head"><h2 id="a7-lists">Menus do WhatsApp</h2><span className="a79-hint">As opções e o rodapé são fixos: as respostas da participante dependem deles.</span></div>
            {LIST_BLOCKS.map(({ kind, label, options }) => (
              <div key={kind} className="a7-list" data-testid={`a7-list-${kind}`}>
                <div className="a7-list__fields">
                  <h3>{label}</h3>
                  <TextField label="Título" maxLength={60} value={lists[kind].title} onChange={(e) => setList(kind, 'title', e.target.value)} error={listError(kind, 'title')} />
                  <TextArea label="Texto" rows={4} maxLength={1000} value={lists[kind].description} onChange={(e) => setList(kind, 'description', e.target.value)} error={listError(kind, 'description')}
                    hint={`Variáveis: ${WHATSAPP_LIST_VARS[kind].map((v) => `{${v}}`).join(' ')}`} />
                </div>
                <div className="a7-wa" aria-label={`Prévia: ${label}`}>
                  <div className="a7-wa__bubble">
                    <strong>{fillSample(lists[kind].title)}</strong>
                    <p>{fillSample(kind === 'invite' && !lists[kind].description.includes('{link}') ? `${lists[kind].description}\nDetalhes: {link}` : lists[kind].description)}</p>
                    <small>Se preferir, responda SIM ou NÃO</small>
                    <span className="a7-wa__btn">☰ Responder</span>
                  </div>
                  <ul className="a7-wa__opts" aria-label="Opções fixas">{options.map((o) => <li key={o}><span aria-hidden="true">○</span>{o}</li>)}</ul>
                  <small className="tw-field__hint">Prévia com dados de exemplo.</small>
                </div>
              </div>
            ))}
          </section>

          <section className="a7-sec" aria-labelledby="a7-msgs">
            <div className="a7-sec__head"><h2 id="a7-msgs">Textos do WhatsApp</h2><span className="a79-hint">Variáveis: {'{nome}'} {'{mentora}'} {'{mesa}'} {'{horario}'}</span></div>
            <div className="a7-msgs">
              {TEMPLATE_LABELS.map(([k, label]) => (
                <TextArea key={k} label={label} rows={2} maxLength={1000} hint={TEMPLATE_HINTS[k]} value={d.templates[k]} onChange={(e) => set('templates', { ...d.templates, [k]: e.target.value })} />
              ))}
            </div>
          </section>
        </div>

        <section className="a7-qr" data-testid="qr" aria-labelledby="a7-qr">
          <h2 id="a7-qr">QR Code da inscrição</h2>
          <div className="a7-qr__img"><img src={endpointUrl(ENDPOINTS.E42Svg)} alt="QR Code da página de inscrição" /></div>
          <span className="a7-qr__hint">Leva para a página de inscrição na mentoria.</span>
          <div className="tw-row">
            <button type="button" className="a79-btn a79-btn--o" onClick={() => void qr('png')}>Baixar PNG</button>
            <button type="button" className="a79-btn a79-btn--line" onClick={() => void qr('svg')}>Baixar SVG</button>
          </div>
        </section>
      </div>

      <Overlay title="Prévia dos e-mails" open={previewOpen} onClose={() => setPreviewOpen(false)}>
        <div className="tw-stack" data-testid="email-preview">
          <SelectField label="Layout" value={previewId} onChange={(e) => setPreviewId(e.target.value as EmailLayoutId)}>
            {EMAIL_LAYOUTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </SelectField>
          {preview.error && <p role="alert">{preview.error}</p>}
          {preview.subject && <p><b>Assunto:</b> {preview.subject}</p>}
          <iframe title={`Prévia do e-mail ${EMAIL_LAYOUTS.find(([id]) => id === previewId)?.[1] ?? ''}`} sandbox="" srcDoc={preview.html}
            style={{ width: '100%', height: '70vh', border: '1px solid var(--tw-border, #ddd)', borderRadius: 8, background: '#fff' }} />
          <small className="tw-field__hint">Dados de exemplo.</small>
        </div>
      </Overlay>
    </div>
  );
}
