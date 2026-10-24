import { useState, type ChangeEvent } from 'react';
import { ENDPOINTS, MENTOR_IMPORT_COLUMNS, MENTOR_IMPORT_FIELD, MENTOR_IMPORT_MAX_BYTES, type E33Response } from '@tw/shared';
import { Button, EmptyState, LinkButton, SelectField, StatusBadge, callForm, saveBlob, useToast, type Column, DataTable } from '../../ui';
import { PageHead, errMsg, useTitle } from './lib/common';

type ImportRow = E33Response['rows'][number];
type OnExisting = 'update' | 'skip';

const STEPS = ['Baixar modelo', 'Enviar arquivo', 'Prévia', 'Confirmar'];
const csvEsc = (v: string) => `"${v.replace(/"/g, '""')}"`;
const csvBlob = (lines: string[][]) => new Blob(['﻿' + lines.map((l) => l.map(csvEsc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });

/** A3 · Importação de mentoras em 4 passos (E33, dryRun antes de gravar). */
export default function A3ImportMentoras() {
  useTitle('Importar mentoras');
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [onExisting, setOnExisting] = useState<OnExisting>('skip');
  const [preview, setPreview] = useState<E33Response | null>(null);
  const [result, setResult] = useState<E33Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState('');

  const send = async (dryRun: boolean): Promise<E33Response> => {
    const form = new FormData();
    form.append(MENTOR_IMPORT_FIELD, file!);
    return callForm(ENDPOINTS.E33, { query: { dryRun: dryRun ? 'true' : 'false', onExisting }, form });
  };

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFileError('');
    if (f && f.size > MENTOR_IMPORT_MAX_BYTES) { setFile(null); setFileError('O arquivo passa de 2 MB.'); return; }
    if (f && !/\.csv$/i.test(f.name)) { setFile(null); setFileError('Envie um arquivo .csv.'); return; }
    setFile(f);
  };

  const runPreview = async () => {
    setBusy(true);
    try { setPreview(await send(true)); setStep(3); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try { setResult(await send(false)); setStep(4); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const downloadTemplate = () =>
    saveBlob(csvBlob([[...MENTOR_IMPORT_COLUMNS], ['Maria Silva', 'maria@exemplo.com', 'linkedin.com/in/maria', 'Empresa X', 'backend|dados', '09:00|09:45']]), 'modelo-mentoras.csv');
  const downloadPasswords = () => {
    if (!result) return;
    saveBlob(csvBlob([['nome', 'email', 'senha_provisoria'], ...result.credentials.map((c) => [c.name, c.email, c.provisionalPassword])]), 'senhas-provisorias.csv');
  };

  const columns: Column<ImportRow>[] = [
    { key: 'line', header: 'Linha', render: (r) => r.line, text: (r) => r.line },
    { key: 'name', header: 'Nome', render: (r) => r.data.name, text: (r) => r.data.name },
    { key: 'email', header: 'E-mail', render: (r) => r.data.email, text: (r) => r.data.email },
    {
      key: 'status', header: 'Situação',
      render: (r) => r.status === 'valid' ? <StatusBadge status="confirmed" label="Válida" />
        : r.status === 'exists' ? <StatusBadge status="invited" label={onExisting === 'update' ? 'Já existe: atualizar' : 'Já existe: ignorar'} />
        : <span><StatusBadge status="cancelled" label="Com erro" /> {r.errors.join('; ')}</span>,
      text: (r) => r.status,
    },
  ];

  return (
    <div className="tw-page tw-stack">
      <PageHead title="Importar mentoras"><LinkButton to="/admin/mentoras" variant="ghost">Voltar à lista</LinkButton></PageHead>
      <ol className="adm-steps" aria-label="Passos">
        {STEPS.map((s, i) => <li key={s} aria-current={step === i + 1 ? 'step' : undefined}>{i + 1}. {s}</li>)}
      </ol>

      {step === 1 && (
        <section className="adm-panel tw-stack">
          <p>Baixe o modelo, preencha uma mentora por linha e salve como CSV. Colunas: {MENTOR_IMPORT_COLUMNS.join(', ')}. Em áreas e disponibilidade, separe os valores com |.</p>
          <div className="tw-row"><Button variant="secondary" onClick={downloadTemplate}>Baixar modelo CSV</Button><Button onClick={() => setStep(2)}>Já tenho o arquivo</Button></div>
        </section>
      )}

      {step === 2 && (
        <section className="adm-panel tw-stack">
          <label className="tw-field__label" htmlFor="csv">Arquivo CSV (até 2 MB)</label>
          <input id="csv" data-testid="csv-input" type="file" accept=".csv,text/csv" onChange={pick} />
          {fileError && <span className="tw-field__error" role="alert">{fileError}</span>}
          <SelectField label="E-mails que já existem" value={onExisting} onChange={(e) => setOnExisting(e.target.value as OnExisting)}>
            <option value="skip">Ignorar</option><option value="update">Atualizar</option>
          </SelectField>
          <div className="tw-row"><Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button><Button disabled={!file} loading={busy} onClick={() => void runPreview()}>Ver prévia</Button></div>
        </section>
      )}

      {step === 3 && preview && (
        <section className="tw-stack">
          <p data-testid="import-summary">{preview.summary.valid} válidas, {preview.summary.errors} com erro, {preview.summary.existing} já existentes ({onExisting === 'update' ? 'serão atualizadas' : 'serão ignoradas'}).</p>
          <DataTable caption="Prévia da importação" columns={columns} rows={preview.rows} rowKey={(r) => String(r.line)} emptyTitle="O arquivo não tem linhas" emptyText="Confira o modelo e envie de novo." />
          <div className="tw-row">
            <Button variant="ghost" onClick={() => setStep(2)}>Trocar arquivo</Button>
            <Button loading={busy} disabled={preview.summary.valid + (onExisting === 'update' ? preview.summary.existing : 0) === 0} onClick={() => void confirm()}>Confirmar importação</Button>
          </div>
        </section>
      )}

      {step === 4 && result && (
        <section className="adm-panel tw-stack" data-testid="import-done">
          <h2>Importação concluída</h2>
          <p>{result.summary.created} criadas, {result.summary.updated} atualizadas, {result.summary.skipped} ignoradas.</p>
          {result.credentials.length > 0 ? (
            <>
              <p className="adm-note">As senhas provisórias aparecem só neste arquivo e não serão mostradas de novo. Baixe agora.</p>
              <div className="tw-row"><Button onClick={downloadPasswords}>Baixar CSV com as senhas</Button><LinkButton to="/admin/mentoras" variant="secondary">Ir para a lista</LinkButton></div>
            </>
          ) : <EmptyState title="Nenhuma conta nova" action={<LinkButton to="/admin/mentoras">Ir para a lista</LinkButton>} />}
        </section>
      )}
    </div>
  );
}
