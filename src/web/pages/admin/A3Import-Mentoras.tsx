import { useState, type ChangeEvent, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { ENDPOINTS, MENTOR_IMPORT_COLUMNS, MENTOR_IMPORT_FIELD, MENTOR_IMPORT_MAX_BYTES, type E33Response } from '@tw/shared';
import { Button, DataTable, LinkButton, SelectField, callForm, saveBlob, useToast, type Column } from '../../ui';
import { PageHead, errMsg, useAreas, useTitle } from './lib/common';
import './lib/a2-a3.css';

type ImportRow = E33Response['rows'][number];
type OnExisting = 'update' | 'skip';

const STEPS = ['Baixar modelo', 'Enviar arquivo', 'Conferir prévia', 'Confirmar'];
const TEMPLATE_ROW = ['Maria Silva', 'maria@exemplo.com', 'linkedin.com/in/maria', 'Empresa X', 'backend|dados', '10:00|10:45', '(81) 99999-1234'];
const csvEsc = (v: string) => `"${v.replace(/"/g, '""')}"`;
const csvBlob = (lines: string[][]) => new Blob(['﻿' + lines.map((l) => l.map(csvEsc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });

/** A3 · Importação de mentoras em 4 passos (E33, dryRun antes de gravar). */
export default function A3ImportMentoras() {
  useTitle('Importar mentoras');
  const toast = useToast();
  const { label: areaLabel } = useAreas();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [onExisting, setOnExisting] = useState<OnExisting>('skip');
  const [preview, setPreview] = useState<E33Response | null>(null);
  const [result, setResult] = useState<E33Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [over, setOver] = useState(false);

  const send = async (dryRun: boolean): Promise<E33Response> => {
    const form = new FormData();
    form.append(MENTOR_IMPORT_FIELD, file!);
    return callForm(ENDPOINTS.E33, { query: { dryRun: dryRun ? 'true' : 'false', onExisting }, form });
  };

  const accept = (f: File | null) => {
    setFileError('');
    if (f && f.size > MENTOR_IMPORT_MAX_BYTES) { setFile(null); setFileError('O arquivo passa de 2 MB.'); return; }
    if (f && !/\.csv$/i.test(f.name)) { setFile(null); setFileError('Envie um arquivo .csv.'); return; }
    setFile(f);
  };
  const pick = (e: ChangeEvent<HTMLInputElement>) => accept(e.target.files?.[0] ?? null);
  const drop = (e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files?.[0] ?? null); };

  const runPreview = async () => {
    setBusy(true);
    try { setPreview(await send(true)); setStep(3); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try { setResult(await send(false)); setStep(4); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const downloadTemplate = () => saveBlob(csvBlob([[...MENTOR_IMPORT_COLUMNS], TEMPLATE_ROW]), 'modelo-mentoras.csv');
  const downloadPasswords = () => {
    if (!result) return;
    saveBlob(csvBlob([['nome', 'email', 'senha_provisoria'], ...result.credentials.map((c) => [c.name, c.email, c.provisionalPassword])]), 'senhas-provisorias.csv');
  };

  const resultOf = (r: ImportRow) => r.status === 'valid' ? { label: 'Válida', tone: 'ok' } : r.status === 'exists' ? { label: 'Já existe', tone: 'gray' } : { label: 'Com erro', tone: 'err' };
  const todo = (r: ImportRow) => r.status === 'exists' ? (onExisting === 'update' ? 'Atualizar dados' : 'Ignorar') : r.status === 'error' ? r.errors.join('; ') : '';
  const columns: Column<ImportRow>[] = [
    { key: 'line', header: 'Linha', render: (r) => r.line, text: (r) => r.line },
    { key: 'name', header: 'Nome', render: (r) => r.data.name, text: (r) => r.data.name },
    { key: 'email', header: 'E-mail', render: (r) => r.data.email, text: (r) => r.data.email },
    { key: 'areas', header: 'Áreas', render: (r) => r.data.areas.map(areaLabel).join(', ') || '—', text: (r) => r.data.areas.map(areaLabel).join(', ') },
    {
      key: 'status', header: 'Resultado',
      render: (r) => { const s = resultOf(r); return <span className={`a23-pill a23-pill--${s.tone}`}>{s.label}</span>; },
      text: (r) => resultOf(r).label,
    },
    { key: 'todo', header: 'O que fazer', render: (r) => <span className={r.status === 'error' ? 'a3i-err' : undefined}>{todo(r)}</span>, text: todo },
  ];
  const toImport = preview ? preview.summary.valid + (onExisting === 'update' ? preview.summary.existing : 0) : 0;

  return (
    <div className="tw-page a23">
      <div className="a23-headcol">
        <Link className="a23-back" to="/admin/mentoras">← Mentoras</Link>
        <PageHead title="Importar lista de mentoras" />
      </div>
      <ol className="a3i-steps" aria-label="Etapas">
        {STEPS.map((s, i) => {
          const n = i + 1;
          return (
            <li key={s} aria-current={step === n ? 'step' : undefined} data-done={n < step || undefined}>
              <span aria-hidden="true">{n < step ? '✓' : n}</span>{s}{n < step && <span className="a23-sr"> (concluída)</span>}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <section className="a23-card a3i-card">
          <h2>1. Baixe o modelo</h2>
          <p className="a23-muted">Preencha uma linha por mentora. Áreas e horários separados por barra vertical (|).</p>
          <pre className="a3i-pre">{MENTOR_IMPORT_COLUMNS.join(',')}{'\n'}{TEMPLATE_ROW.join(',')}</pre>
          <div className="a23-actions">
            <Button variant="secondary" className="a23-btn" onClick={downloadTemplate}>Baixar modelo CSV</Button>
            <Button className="a23-btn" onClick={() => setStep(2)}>Próximo</Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="a23-card a3i-card">
          <h2>2. Envie o arquivo</h2>
          <input id="csv" className="a3i-file" data-testid="csv-input" type="file" accept=".csv,text/csv" onChange={pick} aria-describedby="csv-msg" />
          <label htmlFor="csv" className="a3i-drop" data-over={over || undefined}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
            <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--tw-purple-600)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
            <strong>{file ? file.name : 'Arraste o CSV aqui ou clique para escolher'}</strong>
            <span className="a23-small">{file ? 'Clique para trocar o arquivo' : 'Arquivo CSV até 2 MB · UTF-8'}</span>
          </label>
          <span id="csv-msg" aria-live="polite">{fileError && <span className="tw-field__error" role="alert">{fileError}</span>}</span>
          <SelectField label="E-mails que já existem" value={onExisting} onChange={(e) => setOnExisting(e.target.value as OnExisting)}>
            <option value="skip">Ignorar</option><option value="update">Atualizar dados</option>
          </SelectField>
          <div className="a23-actions">
            <Button variant="secondary" className="a23-btn" onClick={() => setStep(1)}>Voltar</Button>
            <Button className="a23-btn" disabled={!file} loading={busy} onClick={() => void runPreview()}>Ver prévia</Button>
          </div>
        </section>
      )}

      {step === 3 && preview && (
        <section className="a23-card a3i-prev">
          <DataTable
            caption="Prévia da importação" columns={columns} rows={preview.rows} rowKey={(r) => String(r.line)} exportName="previa-mentoras.csv"
            emptyTitle="O arquivo não tem linhas" emptyText="Confira o modelo e envie de novo."
            filters={(
              <div className="a3i-prevhead">
                <h2>3. Prévia{file ? ` · ${file.name}` : ''}</h2>
                <div className="a3i-chips" data-testid="import-summary"
                  aria-label={`${preview.summary.valid} válidas, ${preview.summary.errors} com erro, ${preview.summary.existing} já existentes (${onExisting === 'update' ? 'serão atualizadas' : 'serão ignoradas'})`}>
                  <span className="a23-pill a23-pill--ok">✓ {preview.summary.valid} {preview.summary.valid === 1 ? 'válida' : 'válidas'}</span>
                  <span className="a23-pill a23-pill--err">⚠ {preview.summary.errors} com erro</span>
                  <span className="a23-pill a23-pill--gray">↻ {preview.summary.existing} já {preview.summary.existing === 1 ? 'existe' : 'existem'} ({onExisting === 'update' ? 'atualizar' : 'ignorar'})</span>
                </div>
              </div>
            )}
          />
          <span className="a23-small">Linhas com erro não serão importadas. Corrija no arquivo e envie de novo, se quiser.</span>
          <div className="a23-actions a23-actions--end">
            <Button variant="secondary" className="a23-btn" onClick={() => setStep(2)}>Enviar outro arquivo</Button>
            <Button className="a23-btn" loading={busy} disabled={toImport === 0} onClick={() => void confirm()}>
              {`Importar ${toImport} ${toImport === 1 ? 'mentora' : 'mentoras'}`}
            </Button>
          </div>
        </section>
      )}

      {step === 4 && result && (
        <section className="a3i-done" data-testid="import-done">
          <h2>4. Importação concluída</h2>
          <p>{result.summary.created} {result.summary.created === 1 ? 'mentora criada' : 'mentoras criadas'} · {result.summary.updated} {result.summary.updated === 1 ? 'atualizada' : 'atualizadas'} · {result.summary.skipped} {result.summary.skipped === 1 ? 'ignorada' : 'ignoradas'}.</p>
          {result.credentials.length > 0 ? (
            <>
              <span className="a3i-done__note">O arquivo com as senhas provisórias só pode ser baixado agora e não será mostrado de novo. Guarde em local seguro.</span>
              <div className="a23-actions">
                <Button className="a23-btn" onClick={downloadPasswords}>Baixar CSV com senhas provisórias</Button>
                <LinkButton to="/admin/mentoras" variant="secondary" className="a23-btn">Ver mentoras</LinkButton>
              </div>
            </>
          ) : (
            <>
              <span className="a3i-done__note">Nenhuma conta nova foi criada, então não há senhas para baixar.</span>
              <div className="a23-actions"><LinkButton to="/admin/mentoras" variant="secondary" className="a23-btn">Ver mentoras</LinkButton></div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
