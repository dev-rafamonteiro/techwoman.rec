import { useState } from 'react';
import { ENDPOINTS, TableInUseDetailsSchema, type E40PutBody, type TableView } from '@tw/shared';
import { ApiError, Button, DataTable, ErrorState, LinkButton, Overlay, SkeletonList, TextField, call, formatTime, useQuery, useToast, type Column } from '../../ui';
import { PageHead, errMsg, useTitle } from './lib/common';

type InUse = ReturnType<typeof TableInUseDetailsSchema.parse>;
interface Edit { id?: string; number: string; name: string; location: string }

const toBody = (tables: readonly TableView[]): E40PutBody['tables'] =>
  tables.map((t) => ({ id: t.id, number: t.number, name: t.name, location: t.location, active: t.active }));

/** A6 · Mesas (E40, só super admin). Cada ação grava a lista inteira (PUT substitui). */
export default function A6Mesas() {
  useTitle('Mesas');
  const toast = useToast();
  const q = useQuery((s) => call(ENDPOINTS.E40Get, { signal: s }), []);
  const [n, setN] = useState('20');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [inUse, setInUse] = useState<InUse | null>(null);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');

  const put = async (tables: E40PutBody['tables'], ok: string): Promise<boolean> => {
    setBusy(true);
    try {
      await call(ENDPOINTS.E40Put, { body: { tables } });
      toast.success(ok);
      await q.refetch();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TABLE_IN_USE') {
        const p = TableInUseDetailsSchema.safeParse(e.details);
        setInUse(p.success ? p.data : { appointments: [] });
      } else if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') setFormErr(e.message);
      else toast.error(errMsg(e));
      return false;
    } finally { setBusy(false); }
  };

  const current = q.status === 'success' ? q.data.tables : [];

  const toggle = (t: TableView) => put(toBody(current).map((x) => (x.id === t.id ? { ...x, active: !t.active } : x)), t.active ? `Mesa ${t.number} desativada.` : `Mesa ${t.number} ativada.`);

  const generate = () => {
    const count = Math.min(200, Math.max(1, Math.floor(Number(n)) || 0));
    const have = new Set(current.map((t) => t.number));
    const extra: E40PutBody['tables'] = [];
    for (let i = 1; i <= count; i++) if (!have.has(i)) extra.push({ number: i, name: null, location: null, active: true });
    if (extra.length === 0) return toast.success(`As mesas de 1 a ${count} já existem.`);
    void put([...toBody(current), ...extra], `${extra.length} mesas criadas.`);
  };

  const save = async () => {
    if (!edit) return;
    const number = Number(edit.number);
    if (!Number.isInteger(number) || number < 1 || number > 500) return setFormErr('O número deve ficar entre 1 e 500.');
    if (current.some((t) => t.number === number && t.id !== edit.id)) return setFormErr('Já existe uma mesa com este número.');
    setFormErr('');
    const fields = { number, name: edit.name.trim() || null, location: edit.location.trim() || null };
    const tables = edit.id ? toBody(current).map((x) => (x.id === edit.id ? { ...x, ...fields } : x)) : [...toBody(current), { ...fields, active: true }];
    if (await put(tables, edit.id ? 'Mesa atualizada.' : 'Mesa adicionada.')) setEdit(null);
  };

  const columns: Column<TableView>[] = [
    { key: 'table', header: 'Mesa', render: (t) => <strong>Mesa {t.number}{t.name ? ` · ${t.name}` : ''}</strong>, text: (t) => t.number },
    { key: 'loc', header: 'Localização', render: (t) => t.location ?? '—', text: (t) => t.location ?? '' },
    { key: 'status', header: 'Situação', render: (t) => (t.active ? 'Ativa' : 'Inativa'), text: (t) => (t.active ? 'Ativa' : 'Inativa') },
    {
      key: 'actions', header: 'Ações',
      render: (t) => (
        <div className="tw-row">
          <Button size="sm" variant="secondary" onClick={() => { setFormErr(''); setEdit({ id: t.id, number: String(t.number), name: t.name ?? '', location: t.location ?? '' }); }}>Editar</Button>
          <Button size="sm" variant={t.active ? 'danger' : 'mint'} disabled={busy} onClick={() => void toggle(t)}>{t.active ? 'Desativar' : 'Ativar'}</Button>
        </div>
      ),
    },
  ];

  const filters = (
    <>
      <Button variant="secondary" onClick={() => { setFormErr(''); setEdit({ number: String(Math.max(0, ...current.map((t) => t.number)) + 1), name: '', location: '' }); }}>Adicionar mesa</Button>
      <TextField label="Gerar mesas de 1 a N" type="number" min={1} max={200} value={n} onChange={(e) => setN(e.target.value)} />
      <Button variant="secondary" loading={busy} onClick={generate}>Gerar 1 a N</Button>
    </>
  );

  return (
    <div className="tw-page tw-stack">
      <PageHead title="Mesas" sub="Só super admin." />
      {q.status === 'loading' && <SkeletonList rows={5} height={56} />}
      {q.status === 'error' && <ErrorState error={q.error} onRetry={q.reload} />}
      {q.status === 'success' && (
        <div data-testid="a6-table">
          <DataTable caption="Lista de mesas" columns={columns} rows={q.data.tables} rowKey={(t) => t.id} filters={filters} exportName="mesas.csv"
            emptyTitle="Nenhuma mesa cadastrada" emptyText="Use “Gerar 1 a N” ou “Adicionar mesa”." />
        </div>
      )}
      <Overlay title={edit?.id ? 'Editar mesa' : 'Adicionar mesa'} open={!!edit} onClose={() => setEdit(null)}>
        {edit && (
          <div className="tw-stack">
            {formErr && <div className="adm-note" role="alert">{formErr}</div>}
            <TextField label="Número" type="number" min={1} max={500} value={edit.number} onChange={(e) => setEdit({ ...edit, number: e.target.value })} />
            <TextField label="Nome" optional value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <TextField label="Localização" optional placeholder="Área B" value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} />
            <div className="tw-row"><Button loading={busy} onClick={() => void save()}>Salvar</Button><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button></div>
          </div>
        )}
      </Overlay>
      <Overlay title="Realocar mentorias antes de desativar" open={!!inUse} onClose={() => setInUse(null)}>
        {inUse && (
          <div className="tw-stack" data-testid="tables-realocar">
            <p>Estas mentorias futuras estão na mesa que você quer desativar. Mova cada uma no mapa de mesas e tente de novo.</p>
            <ul className="adm-list">
              {inUse.appointments.map((a) => <li key={a.id}><span>Mesa {a.tableNumber} · {formatTime(a.startAt)}</span><span>{a.mentorName} com {a.menteeName}</span></li>)}
            </ul>
            <LinkButton to="/admin/mapa">Abrir mapa de mesas</LinkButton>
          </div>
        )}
      </Overlay>
    </div>
  );
}
