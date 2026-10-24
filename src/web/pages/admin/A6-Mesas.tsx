import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ENDPOINTS, TableInUseDetailsSchema, type E40PutBody, type TableView } from '@tw/shared';
import { ApiError, Button, DataTable, ErrorState, Overlay, SkeletonList, TextField, call, formatTime, saveBlob, toCsv, useQuery, useToast, type Column } from '../../ui';
import { PageHead, Switch, errMsg, useTitle } from './lib/common';
import './lib/a4-a6.css';

type InUse = ReturnType<typeof TableInUseDetailsSchema.parse>;
interface Edit { id?: string; number: string; name: string; location: string }

const toBody = (tables: readonly TableView[]): E40PutBody['tables'] =>
  tables.map((t) => ({ id: t.id, number: t.number, name: t.name, location: t.location, active: t.active }));

/** A6 · Mesas (E40, só super admin). Cada ação grava a lista inteira (PUT substitui). Visual: design/admin/A6-mesas.html. */
export default function A6Mesas() {
  useTitle('Mesas');
  const toast = useToast();
  const q = useQuery((s) => call(ENDPOINTS.E40Get, { signal: s }), []);
  const [n, setN] = useState('20');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [inUse, setInUse] = useState<(InUse & { number: number | null }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');

  const put = async (tables: E40PutBody['tables'], ok: string, number: number | null = null): Promise<boolean> => {
    setBusy(true);
    try {
      await call(ENDPOINTS.E40Put, { body: { tables } });
      toast.success(ok);
      setInUse(null);
      await q.refetch();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TABLE_IN_USE') {
        const p = TableInUseDetailsSchema.safeParse(e.details);
        setInUse({ ...(p.success ? p.data : { appointments: [] }), number });
      } else if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') setFormErr(e.message);
      else toast.error(errMsg(e));
      return false;
    } finally { setBusy(false); }
  };

  const current = q.status === 'success' ? q.data.tables : [];
  const active = current.filter((t) => t.active).length;

  const toggle = (t: TableView) => {
    if (busy) return;
    void put(toBody(current).map((x) => (x.id === t.id ? { ...x, active: !t.active } : x)), t.active ? `Mesa ${t.number} desativada.` : `Mesa ${t.number} ativada.`, t.active ? t.number : null);
  };

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
    { key: 'table', header: 'Mesa', render: (t) => <span className="a6-num">Mesa {t.number}{t.name ? ` · ${t.name}` : ''}</span>, text: (t) => t.number },
    { key: 'loc', header: 'Localização', render: (t) => t.location ?? <span className="a4-muted">—</span>, text: (t) => t.location ?? '' },
    { key: 'status', header: 'Situação', render: (t) => <Switch checked={t.active} label={t.active ? 'Ativa' : 'Inativa'} onChange={() => toggle(t)} />, text: (t) => (t.active ? 'Ativa' : 'Inativa') },
    {
      key: 'actions', header: 'Ações',
      render: (t) => <button type="button" className="a6-edit" aria-label={`Editar mesa ${t.number}`} onClick={() => { setFormErr(''); setEdit({ id: t.id, number: String(t.number), name: t.name ?? '', location: t.location ?? '' }); }}>Editar</button>,
    },
  ];

  const exportCsv = () => saveBlob(new Blob([toCsv(current, columns)], { type: 'text/csv;charset=utf-8' }), 'mesas.csv');

  return (
    <div className="tw-page a6">
      <PageHead title="Mesas" sub={q.status === 'success' ? `${active} ${active === 1 ? 'ativa' : 'ativas'} de ${current.length} · só super admin` : 'Só super admin.'}>
        <div className="a6-gen">
          <label htmlFor="a6-gerar-n">Gerar mesas de 1 a</label>
          <input id="a6-gerar-n" className="a46-in" type="number" min={1} max={200} value={n} onChange={(e) => setN(e.target.value)} />
          <button type="button" className="a46-pill" disabled={busy || q.status !== 'success'} onClick={generate}>Gerar</button>
          <button type="button" className="a46-pill a46-pill--cta" disabled={q.status !== 'success'} onClick={() => { setFormErr(''); setEdit({ number: String(Math.max(0, ...current.map((t) => t.number)) + 1), name: '', location: '' }); }}>+ Adicionar mesa</button>
          <button type="button" className="a46-pill" disabled={current.length === 0} onClick={exportCsv}>Exportar CSV</button>
        </div>
      </PageHead>
      {inUse && (
        <div className="a6-alert" role="alert" data-testid="tables-realocar">
          <strong>
            {inUse.number ? `Mesa ${inUse.number} tem` : 'A mesa tem'} {inUse.appointments.length} {inUse.appointments.length === 1 ? 'mentoria futura' : 'mentorias futuras'}. Realoque antes de desativar:
          </strong>
          {inUse.appointments.length > 0 && (
            <ul>{inUse.appointments.map((a) => <li key={a.id}>{formatTime(a.startAt)} · Mesa {a.tableNumber} · {a.mentorName} com {a.menteeName}</li>)}</ul>
          )}
          <div className="a6-alert__acts">
            <Link className="a46-pill a46-pill--dark" to="/admin/mapa">Realocar no mapa de mesas</Link>
            <button type="button" className="a46-pill a46-pill--keep" onClick={() => setInUse(null)}>Manter ativa</button>
          </div>
        </div>
      )}
      {q.status === 'loading' && <SkeletonList rows={5} height={56} />}
      {q.status === 'error' && <ErrorState error={q.error} onRetry={q.reload} />}
      {q.status === 'success' && (
        <div data-testid="a6-table">
          <DataTable caption="Lista de mesas" columns={columns} rows={q.data.tables} rowKey={(t) => t.id} exportName="mesas.csv"
            emptyTitle="Nenhuma mesa cadastrada" emptyText="Use “Gerar” ou “+ Adicionar mesa”." />
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
    </div>
  );
}
