import { useState } from 'react';
import type { MenteeStaffView } from '@tw/shared';
import {
  AreaBadge, Button, Card, CheckboxField, ConnectionBar, Countdown, DataTable, EmptyState, ErrorState, MenteeCard, NoPermission, Overlay,
  PriorityBadge, RadioCards, SecretReveal, SelectField, SkeletonList, SlotSingleChoice, SlotToggleGrid, StatusBadge, TablePicker, TextArea, TextField,
  useToast, type BadgeStatus,
} from './index';

const mentee: MenteeStaffView = {
  id: '1', name: 'Joana Lima', area: 'backend', preferredPeriod: 'early_afternoon', linkedin: 'joanalima', note: 'Quero migrar de suporte para backend',
  priority: true, priorityReason: 'declined_schedule', status: 'waiting', queuedAt: new Date(Date.now() - 25 * 60000).toISOString(),
};
const slots = ['9h00', '9h45', '10h30', '11h15', '12h00', '12h45'].map((label, i) => ({ id: String(i), label, locked: i === 2, caption: 'Marina', preferred: i === 1 }));

/** Catálogo visual dos componentes (rota /_ui, só em desenvolvimento). */
export default function Gallery() {
  const toast = useToast();
  const [sel, setSel] = useState<Set<string>>(new Set(['0']));
  const [one, setOne] = useState<string | null>('1');
  const [table, setTable] = useState<string | null>('7');
  const [period, setPeriod] = useState<'morning' | 'any' | null>('morning');
  const [open, setOpen] = useState(false);
  const statuses: BadgeStatus[] = ['waiting', 'invited', 'confirmed', 'in_progress', 'done', 'no_show', 'cancelled', 'expired'];
  return (
    <div className="tw-page tw-stack">
      <h1 className="tw-title tw-title--ink">Catálogo de componentes</h1>
      <div className="tw-row">{statuses.map((s) => <StatusBadge key={s} status={s} />)}<PriorityBadge /><AreaBadge label="Backend" /></div>
      <div className="tw-row">
        <Button>Primário</Button><Button variant="secondary">Secundário</Button><Button variant="mint">Menta</Button><Button variant="danger">Perigo</Button><Button variant="ghost">Ghost</Button><Button loading>Salvando</Button>
      </div>
      <Card>
        <div className="tw-stack">
          <TextField label="Nome completo" placeholder="Como você quer ser chamada" />
          <TextField label="E-mail" error="Digite um e-mail válido." defaultValue="joana@" />
          <TextField label="LinkedIn" optional ok="A mentora verá seu perfil" defaultValue="joanalima" />
          <SelectField label="Área de interesse" hint="Preenchida com o resultado da sua jornada."><option>Backend</option></SelectField>
          <RadioCards legend="Período preferido" name="p" value={period} onChange={setPeriod} options={[{ value: 'morning', label: 'Manhã' }, { value: 'any', label: 'Qualquer horário' }]} />
          <TextArea label="O que você quer conversar?" optional />
          <CheckboxField label="Concordo com o uso dos meus dados" />
        </div>
      </Card>
      <MenteeCard mentee={mentee} areaLabel={() => 'Backend'} actions={<Button size="sm">Mentorar</Button>} />
      <MenteeCard mentee={mentee} areaLabel={() => 'Backend'} variant="full" showStatus />
      <SlotToggleGrid legend="Disponibilidade" slots={slots} selected={sel} onToggle={(id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
      <SlotSingleChoice legend="Horário" slots={slots.filter((s) => !s.locked)} value={one} onChange={setOne} />
      <TablePicker tables={[1, 2, 3, 7, 8].map((n) => ({ id: String(n), number: n, busy: n === 2 }))} value={table} onChange={setTable} suggestedId="7" />
      <Countdown label="Responda até 14h05" expiresAt={new Date(Date.now() + 9.5 * 60000).toISOString()} />
      <Countdown label="Responda até 14h05" expiresAt={new Date(Date.now() + 170000).toISOString()} />
      <ConnectionBar status="live" lastUpdateAt={Date.now()} />
      <ConnectionBar status="reconnecting" lastUpdateAt={null} />
      <div className="tw-row">
        <Button variant="secondary" onClick={() => toast.success('Horário salvo.')}>Toast sucesso</Button>
        <Button variant="secondary" onClick={() => toast.error('Não foi possível salvar.')}>Toast erro</Button>
        <Button variant="secondary" onClick={() => toast.conflict('A Mesa 7 acabou de ser ocupada nesse horário', () => undefined)}>Toast conflito</Button>
        <Button variant="secondary" onClick={() => setOpen(true)}>Abrir gaveta</Button>
      </div>
      <DataTable
        caption="Mentoras"
        rows={[{ n: 'Ana', e: 'ana@x.com', s: 'waiting' as const }, { n: 'Bia', e: 'bia@x.com', s: 'confirmed' as const }]}
        rowKey={(r) => r.e}
        columns={[{ key: 'n', header: 'Nome', render: (r) => r.n, text: (r) => r.n }, { key: 'e', header: 'E-mail', render: (r) => r.e, text: (r) => r.e }, { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.s} /> }]}
        filters={<TextField label="Buscar" />}
        onRowClick={() => undefined}
      />
      <SecretReveal secret="Tw-9f3k2q-81xz" onSendEmail={() => undefined} />
      <SkeletonList rows={2} />
      <EmptyState title="Ninguém aguardando agora" text="Novas inscrições aparecem aqui sozinhas." />
      <ErrorState onRetry={() => undefined} />
      <NoPermission homePath="/" />
      <Overlay title="Agendar mentoria" open={open} onClose={() => setOpen(false)}><p>Conteúdo da gaveta (celular) ou modal (desktop).</p></Overlay>
    </div>
  );
}
