import { useEffect, useState } from 'react';
import { ENDPOINTS, TableInUseDetailsSchema, type E40PutBody } from '@tw/shared';
import { ApiError, Button, CheckboxField, EmptyState, ErrorState, Overlay, SkeletonList, TextField, call, formatTime, useQuery, useToast } from '../../ui';
import { LinkButton } from '../../ui';
import { PageHead, errMsg, useTitle } from './lib/common';

interface Row { id?: string; key: string; number: number; name: string; location: string; active: boolean }
let seq = 0;
const newKey = () => `n${++seq}`;

/** A6 · Mesas (E40, só super admin). */
export default function A6Mesas() {
  useTitle('Mesas');
  const toast = useToast();
  const q = useQuery((s) => call(ENDPOINTS.E40Get, { signal: s }), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [n, setN] = useState('20');
  const [inUse, setInUse] = useState<ReturnType<typeof TableInUseDetailsSchema.parse> | null>(null);

  useEffect(() => {
    if (q.status === 'success') {
      setRows(q.data.tables.map((t) => ({ id: t.id, key: t.id, number: t.number, name: t.name ?? '', location: t.location ?? '', active: t.active })));
      setDirty(false);
    }
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (key: string, patch: Partial<Row>) => { setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x))); setDirty(true); };
  const add = () => { setRows((r) => [...r, { key: newKey(), number: Math.max(0, ...r.map((x) => x.number)) + 1, name: '', location: '', active: true }]); setDirty(true); };
  const generate = () => {
    const count = Math.min(200, Math.max(1, Math.floor(Number(n)) || 0));
    setRows((r) => {
      const have = new Set(r.map((x) => x.number));
      const extra: Row[] = [];
      for (let i = 1; i <= count; i++) if (!have.has(i)) extra.push({ key: newKey(), number: i, name: '', location: '', active: true });
      return [...r, ...extra].sort((a, b) => a.number - b.number);
    });
    setDirty(true);
  };
  const remove = (key: string) => { setRows((r) => r.filter((x) => x.key !== key)); setDirty(true); };

  const numbers = rows.map((r) => r.number);
  const dupes = new Set(numbers.filter((v, i) => numbers.indexOf(v) !== i));
  const invalid = rows.some((r) => !Number.isInteger(r.number) || r.number < 1 || r.number > 500) || dupes.size > 0;

  const save = async () => {
    setSaving(true);
    const body: E40PutBody = { tables: rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), number: r.number, name: r.name.trim() || null, location: r.location.trim() || null, active: r.active })) };
    try {
      await call(ENDPOINTS.E40Put, { body });
      toast.success('Mesas salvas.');
      await q.reload();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TABLE_IN_USE') {
        const p = TableInUseDetailsSchema.safeParse(e.details);
        setInUse(p.success ? p.data : { appointments: [] });
      } else toast.error(errMsg(e));
    } finally { setSaving(false); }
  };

  return (
    <div className="tw-page tw-stack">
      <PageHead title="Mesas">
        <Button variant="secondary" onClick={add}>Adicionar mesa</Button>
        <Button disabled={!dirty || invalid} loading={saving} onClick={() => void save()}>Salvar mesas</Button>
      </PageHead>
      {q.status === 'loading' && <SkeletonList rows={5} height={56} />}
      {q.status === 'error' && <ErrorState error={q.error} onRetry={q.reload} />}
      {q.status === 'success' && (
        <>
          <div className="tw-toolbar">
            <TextField label="Gerar mesas de 1 a N" type="number" min={1} max={200} value={n} onChange={(e) => setN(e.target.value)} />
            <Button variant="secondary" onClick={generate}>Gerar 1 a N</Button>
          </div>
          {invalid && <div className="adm-note" role="alert">Cada mesa precisa de um número único entre 1 e 500.</div>}
          {rows.length === 0 ? <EmptyState title="Nenhuma mesa cadastrada" text="Use “Gerar 1 a N” ou “Adicionar mesa”." /> : (
            <div className="tw-scroll" role="region" aria-label="Lista de mesas" tabIndex={0}>
              <table className="tw-data" data-testid="a6-table">
                <thead><tr><th>Número</th><th>Nome</th><th>Localização</th><th>Ativa</th><th><span className="tw-sr-only">Remover</span></th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td><input className="tw-input" aria-label="Número da mesa" type="number" min={1} max={500} value={r.number} onChange={(e) => edit(r.key, { number: Number(e.target.value) })} style={{ width: 90 }} /></td>
                      <td><input className="tw-input" aria-label={`Nome da mesa ${r.number}`} value={r.name} onChange={(e) => edit(r.key, { name: e.target.value })} /></td>
                      <td><input className="tw-input" aria-label={`Localização da mesa ${r.number}`} placeholder="Área B" value={r.location} onChange={(e) => edit(r.key, { location: e.target.value })} /></td>
                      <td><CheckboxField label={r.active ? 'Ativa' : 'Inativa'} checked={r.active} onChange={(e) => edit(r.key, { active: e.target.checked })} /></td>
                      <td><Button size="sm" variant="danger-link" onClick={() => remove(r.key)}>Remover</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <Overlay title="Realocar mentorias antes de mudar a mesa" open={!!inUse} onClose={() => setInUse(null)}>
        {inUse && (
          <div className="tw-stack" data-testid="tables-realocar">
            <p>Estas mentorias futuras estão em mesas que você quer desativar ou remover. Mova cada uma no mapa de mesas e salve de novo.</p>
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
