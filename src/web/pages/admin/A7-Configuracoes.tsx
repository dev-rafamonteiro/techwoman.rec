import { useEffect, useMemo, useState } from 'react';
import { ENDPOINTS, type E41PutBody, type EventConfig } from '@tw/shared';
import { ApiError, Button, ErrorState, SkeletonList, Card, SlotToggleGrid, TextArea, TextField, call, callBlob, endpointUrl, saveBlob, useQuery, useToast } from '../../ui';
import { PageHead, Switch, errMsg, useTitle } from './lib/common';

type Draft = Omit<EventConfig, 'id' | 'slots'>;
const TEMPLATE_LABELS: [keyof EventConfig['templates'], string][] = [
  ['registered', 'Inscrição recebida'], ['invite', 'Convite de horário'], ['confirmed', 'Confirmação'],
  ['reminder', 'Lembrete'], ['expired', 'Convite expirado'], ['cancelled', 'Cancelamento pela mentora'],
];
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
  const [gridError, setGridError] = useState('');

  useEffect(() => {
    if (q.status === 'success') { const { id: _i, slots: _s, ...rest } = q.data.event; setD(rest); }
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasActive = lock.status === 'success' && lock.data.appointments.some((a) => ['invited', 'confirmed', 'in_progress'].includes(a.status));
  const slots = useMemo(() => (d ? previewSlots(d) : []), [d]);

  if (q.status === 'loading' || !d) return q.status === 'error' ? <div className="tw-page"><ErrorState error={q.error} onRetry={q.reload} /></div> : <div className="tw-page"><SkeletonList rows={4} /></div>;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => (p ? { ...p, [k]: v } : p));
  const num = (k: 'slotMinutes' | 'gapMinutes' | 'responseWindowMinutes' | 'minLeadMinutes') => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value));
  const timesInvalid = toMin(d.endTime) <= toMin(d.startTime);

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

  return (
    <div className="tw-page tw-stack">
      <PageHead title="Configurações do evento" sub="Só super admin." />
      {gridError && <div className="adm-note" role="alert" data-testid="grid-locked">{gridError}</div>}
      {hasActive && <div className="adm-note">Há mentorias ativas: horário, duração e intervalo ficam bloqueados.</div>}

      <Card className="tw-stack"><b>Evento</b><div className="adm-form">
        <TextField label="Nome do evento" value={d.name} onChange={(e) => set('name', e.target.value)} />
        <TextField label="Data" type="date" value={d.date} onChange={(e) => set('date', e.target.value)} />
        <TextField label="Local" optional value={d.location ?? ''} onChange={(e) => set('location', e.target.value || null)} />
        <TextField label="Fuso horário" value={d.timezone} onChange={(e) => set('timezone', e.target.value)} />
        <TextField label="Início" type="time" value={d.startTime} disabled={hasActive} onChange={(e) => set('startTime', e.target.value)} />
        <TextField label="Fim" type="time" value={d.endTime} disabled={hasActive} onChange={(e) => set('endTime', e.target.value)} error={timesInvalid ? 'O fim deve ser depois do início.' : undefined} />
        <TextField label="Duração da sessão (min)" type="number" min={5} max={180} value={d.slotMinutes} disabled={hasActive} onChange={num('slotMinutes')} />
        <TextField label="Intervalo entre sessões (min)" type="number" min={0} max={60} value={d.gapMinutes} disabled={hasActive} onChange={num('gapMinutes')} />
      </div>
        <div aria-live="polite" data-testid="grid-preview"><b>Prévia da grade</b>
          {slots.length === 0 ? <p>Nenhum horário cabe nesses valores.</p> : (
            <SlotToggleGrid legend="Prévia da grade de horários" disabled caption="Horário gerado" selected={new Set()} onToggle={() => undefined} slots={slots.map((l) => ({ id: l, label: l.split(' – ')[0]! }))} />
          )}
        </div>
      </Card>
      <Card className="tw-stack"><b>Convites</b><div className="adm-form">
        <TextField label="Prazo para responder ao convite (min)" type="number" min={1} max={120} value={d.responseWindowMinutes} onChange={num('responseWindowMinutes')} />
        <TextField label="Antecedência mínima do convite (min)" type="number" min={0} max={120} value={d.minLeadMinutes} onChange={num('minLeadMinutes')} />
        <div className="adm-wide"><Switch label="Inscrições abertas" checked={d.registrationOpen} onChange={(v) => set('registrationOpen', v)} /></div>
      </div>
        <div className="tw-stack"><b>Áreas disponíveis</b>
          <div className="tw-row">
            {d.areas.map((a, i) => (
              <button key={a.key || i} type="button" className="adm-chip adm-chip--on" disabled={d.areas.length <= 1} aria-label={`Remover área ${a.label}`} onClick={() => set('areas', d.areas.filter((_, j) => j !== i))}>{a.label} ✕</button>
            ))}
            <button type="button" className="adm-chip" onClick={() => { const label = window.prompt('Nome da nova área')?.trim(); if (label) set('areas', [...d.areas, { key: slug(label), label }]); }}>+ Adicionar</button>
          </div>
        </div>
      </Card>

      

      

      <Card className="tw-stack"><b>Mensagens</b><div className="adm-form">
        <p className="adm-wide adm-sub">Variáveis: {'{nome}'}, {'{mentora}'}, {'{mesa}'}, {'{horario}'}.</p>
        {TEMPLATE_LABELS.map(([k, label]) => (
          <TextArea key={k} label={label} maxLength={1000} value={d.templates[k]} onChange={(e) => set('templates', { ...d.templates, [k]: e.target.value })} />
        ))}
      </div></Card>

      <Card className="tw-stack"><div data-testid="qr" className="tw-stack">
        <b>QR Code da inscrição</b>
        <img className="adm-qr" src={endpointUrl(ENDPOINTS.E42Svg)} alt="QR Code da página de inscrição" />
        <div className="tw-row"><Button variant="secondary" onClick={() => void qr('png')}>Baixar PNG</Button><Button variant="secondary" onClick={() => void qr('svg')}>Baixar SVG</Button></div>
      </div></Card>

      <div><Button loading={saving} disabled={timesInvalid || d.areas.length === 0} onClick={() => void save()}>Salvar configurações</Button></div>
    </div>
  );
}
