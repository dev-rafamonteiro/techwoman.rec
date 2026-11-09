import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ENDPOINTS, MentorHasAppointmentsDetailsSchema, type MentorHasAppointmentsDetails, type MentorListItem } from '@tw/shared';
import { ApiError, Button, CheckboxField, DataTable, ErrorState, LinkButton, Overlay, SelectField, SkeletonList, TextField, call, formatTime, useQuery, useToast, type Column } from '../../ui';
import { PageHead, errMsg, useAreas, useDebounced, useTitle } from './lib/common';
import './lib/a2-a3.css';

type StatusFilter = '' | 'active' | 'disabled' | 'never_logged_in';

/** Rótulo e tom do status (design: Ativa menta, Nunca acessou cinza, Desativada vermelho). */
function statusOf(m: MentorListItem): { label: string; tone: 'ok' | 'gray' | 'err' } {
  if (m.status === 'disabled') return { label: 'Desativada', tone: 'err' };
  if (m.neverLoggedIn) return { label: 'Nunca acessou', tone: 'gray' };
  return { label: 'Ativa', tone: 'ok' };
}

const dayKey = (d: Date) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Recife' }).format(d);

/** "hoje, 13h20", "ontem, 18h40" ou "12/11, 20h05" (horário de Recife), como no design. */
function lastAccess(iso: string): string {
  const d = new Date(iso);
  const day = dayKey(d);
  if (day === dayKey(new Date())) return `hoje, ${formatTime(iso)}`;
  if (day === dayKey(new Date(Date.now() - 86400000))) return `ontem, ${formatTime(iso)}`;
  return `${day.slice(0, 5)}, ${formatTime(iso)}`;
}

/** Copia o e-mail da mentora; o ícone vira um ✓ por um instante. */
function CopyEmail({ email }: { email: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(email); setCopied(true); } catch { toast.error('Não foi possível copiar o e-mail.'); }
  };
  return (
    <button type="button" className="a2-copy" aria-label={`Copiar e-mail ${email}`} title={copied ? 'Copiado' : 'Copiar e-mail'} data-copied={copied || undefined} data-testid="a2-copy-email" onClick={() => void copy()}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {copied ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>}
      </svg>
    </button>
  );
}

/** Resultado de "Redefinir senha": a senha provisória fica oculta até tocar no olho e é mostrada uma única vez. */
function ResetResult({ email, password, emailed, onClose }: { email: string; password: string; emailed: boolean; onClose: () => void }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(password); setCopied(true); } catch { setShown(true); }
  };
  return (
    <div className="tw-stack" data-testid="a2-secret">
      <p>{emailed ? <>A nova senha foi enviada para <strong>{email}</strong>.</> : 'A senha foi redefinida.'} A mentora troca a senha no primeiro acesso.</p>
      <div className="a2-pass">
        <output className="a2-pass__value" aria-live="polite" data-testid="a2-secret-value">{shown ? password : '•'.repeat(Math.min(password.length, 14))}</output>
        <button type="button" className="a2-pass__eye" aria-label="Mostrar senha" aria-pressed={shown} title={shown ? 'Ocultar senha' : 'Mostrar senha'} data-testid="a2-secret-eye" onClick={() => setShown((s) => !s)}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />{shown && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </div>
      <p className="a23-small">Esta senha não será mostrada de novo depois que você fechar.</p>
      <div className="tw-row"><Button onClick={() => void copy()}>{copied ? 'Copiada ✓' : 'Copiar senha'}</Button><Button variant="ghost" onClick={onClose}>Fechar</Button></div>
    </div>
  );
}

/** A2 · Mentoras (E31, E32, E34). */
export default function A2Mentoras() {
  useTitle('Mentoras');
  const toast = useToast();
  const { areas, label: areaLabel } = useAreas();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [area, setArea] = useState('');
  const dq = useDebounced(q);
  const list = useQuery(
    (signal) => call(ENDPOINTS.E31List, { query: { q: dq.trim().length >= 2 ? dq.trim() : undefined, status: status || undefined, area: area || undefined }, signal }),
    [dq, status, area],
  );
  // mantém a tabela (e o foco na busca) enquanto um novo filtro carrega
  const last = useRef<MentorListItem[] | null>(null);
  if (list.status === 'success') last.current = list.data.items;
  const items = list.status === 'success' ? list.data.items : list.status === 'loading' ? last.current : null;
  const filtered = !!(q.trim() || status || area);
  const clear = () => { setQ(''); setStatus(''); setArea(''); };

  const [secret, setSecret] = useState<{ password: string; emailed: boolean } | null>(null);
  const [realocar, setRealocar] = useState<{ name: string; details: MentorHasAppointmentsDetails } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (m: MentorListItem) => {
    const next = m.status === 'active' ? 'disabled' : 'active';
    setBusy(m.id);
    try {
      await call(ENDPOINTS.E32, { params: { id: m.id }, body: { status: next } });
      toast.success(next === 'disabled' ? `${m.name} foi desativada.` : `${m.name} foi reativada.`);
      await list.refetch();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'MENTOR_HAS_APPOINTMENTS') {
        const parsed = MentorHasAppointmentsDetailsSchema.safeParse(e.details);
        setRealocar({ name: m.name, details: parsed.success ? parsed.data : { appointments: [] } });
      } else toast.error(errMsg(e));
    } finally { setBusy(null); }
  };

  const [resetFor, setResetFor] = useState<MentorListItem | null>(null);
  const [sendByEmail, setSendByEmail] = useState(true);
  const closeReset = () => { setResetFor(null); setSecret(null); };
  const reset = async () => {
    const m = resetFor;
    if (!m) return;
    setBusy(m.id);
    try {
      const r = await call(ENDPOINTS.E34, { params: { id: m.id }, body: { sendByEmail } });
      setSecret({ password: r.provisionalPassword, emailed: sendByEmail });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };

  const columns: Column<MentorListItem>[] = [
    { key: 'name', header: 'Nome', render: (m) => m.name, text: (m) => m.name },
    { key: 'email', header: 'E-mail', render: (m) => <span className="a2-email"><span className="a2-clip a2-clip--email" title={m.email}>{m.email}</span><CopyEmail email={m.email} /></span>, text: (m) => m.email },
    { key: 'org', header: 'Organização (interno)', render: (m) => (m.organization ? <span className="a2-clip a2-clip--org" title={m.organization}>{m.organization}</span> : '—'), text: (m) => m.organization ?? '' },
    { key: 'themes', header: 'Temas e domínios', render: (m) => (m.themes.length ? (
      <div className="a2-themes">{m.themes.map((t, i) => (
        <div key={i}><strong>{t}</strong>{m.themeDomains[i]?.length ? <span>{m.themeDomains[i]!.join(' · ')}</span> : null}</div>
      ))}</div>
    ) : '—'), text: (m) => m.themes.map((t, i) => [t, ...(m.themeDomains[i] ?? [])].join(': ')).join(' | ') },
    { key: 'slots', header: 'Horários disp.', render: (m) => m.availableSlots, text: (m) => m.availableSlots },
    // RN21: concluídas = na mesa + fora da mesa (a divisão fica na coluna "Fora da mesa")
    { key: 'appts', header: 'Confirm. / concl.', render: (m) => `${m.confirmedCount} / ${m.attendedCount}`, text: (m) => `${m.confirmedCount}/${m.attendedCount}` },
    { key: 'walkins', header: 'Fora da mesa', render: (m) => (m.walkInCount ? `${m.walkInCount} de ${m.attendedCount}` : 0), text: (m) => m.walkInCount },
    { key: 'last', header: 'Último acesso', render: (m) => (m.lastLoginAt ? lastAccess(m.lastLoginAt) : '—'), text: (m) => m.lastLoginAt ?? '' },
    {
      key: 'status', header: 'Status',
      render: (m) => { const s = statusOf(m); return <span className={`a23-pill a23-pill--${s.tone}`} data-testid={`status-${m.id}`}>{s.label}</span>; },
      text: (m) => statusOf(m).label,
    },
    {
      key: 'actions', header: 'Ações',
      render: (m) => (
        <div data-testid="mentor-actions" role="group" aria-label={`Ações de ${m.name}`}>
          <Link className="a2-act" to={`/admin/mentoras/${m.id}`}>Editar</Link>
          <button type="button" className="a2-act" onClick={() => { setSendByEmail(true); setResetFor(m); }}>Redefinir senha</button>
          <button type="button" className={`a2-act ${m.status === 'active' ? 'a2-act--off' : 'a2-act--on'}`} disabled={busy === m.id} aria-busy={busy === m.id || undefined} onClick={() => void toggle(m)}>
            {m.status === 'active' ? 'Desativar' : 'Ativar'}
          </button>
          <Link className="a2-act" to={`/admin/mapa?mentora=${m.id}`}>Ver agenda</Link>
        </div>
      ),
    },
  ];

  const filters = (
    <>
      <div className="tw-toolbar__grow"><TextField label="Buscar mentora" type="search" placeholder="Nome, e-mail, área ou tema da bio" maxLength={200} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
        <option value="">Todos os status</option><option value="active">Ativa</option><option value="never_logged_in">Nunca acessou</option><option value="disabled">Desativada</option>
      </SelectField>
      <SelectField label="Área" value={area} onChange={(e) => setArea(e.target.value)}>
        <option value="">Todas as áreas</option>
        {areas.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
      </SelectField>
    </>
  );

  const never = items ? items.filter((m) => m.neverLoggedIn).length : 0;
  const sub = !items ? undefined
    : filtered ? `${items.length} ${items.length === 1 ? 'mentora' : 'mentoras'} com esses filtros`
    : `${items.length} ${items.length === 1 ? 'mentora' : 'mentoras'} · ${items.length - never} já ${items.length - never === 1 ? 'acessou' : 'acessaram'} · ${never} nunca ${never === 1 ? 'acessou' : 'acessaram'}`;

  return (
    <div className="tw-page a23 a2">
      <PageHead title="Mentoras" sub={sub}>
        <LinkButton to="/admin/mentoras/importar" variant="secondary" className="a23-btn">Importar lista (CSV)</LinkButton>
        <LinkButton to="/admin/mentoras/nova" className="a23-btn">+ Nova mentora</LinkButton>
      </PageHead>
      {!items && list.status === 'loading' && <SkeletonList rows={5} height={56} />}
      {list.status === 'error' && <ErrorState error={list.error} onRetry={list.reload} />}
      {items && (
        <div aria-busy={list.status === 'loading' || undefined} className={filtered && items.length === 0 ? 'a2-noresult' : undefined}>
          <DataTable
            caption="Lista de mentoras" columns={columns} rows={items} rowKey={(m) => m.id} filters={filters}
            exportName="mentoras.csv"
            emptyTitle={filtered ? 'Nenhuma mentora com esses filtros' : 'Nenhuma mentora encontrada'}
            emptyText={filtered ? 'Ajuste a busca ou limpe os filtros.' : 'Cadastre uma mentora ou importe a lista em CSV.'}
          />
          {filtered && items.length === 0 && (
            <div className="a2-empty" role="status">Nenhuma mentora com esses filtros. <button type="button" onClick={clear}>Limpar filtros</button></div>
          )}
        </div>
      )}
      {/* key: ao trocar a confirmação pelo resultado, o foco volta para a janela */}
      <Overlay key={secret ? 'result' : 'confirm'} title={secret ? 'Senha redefinida' : 'Redefinir senha'} open={!!resetFor} onClose={closeReset}>
        {secret && resetFor ? <ResetResult email={resetFor.email} password={secret.password} emailed={secret.emailed} onClose={closeReset} /> : (
          <div className="tw-stack">
            <p>Redefinir a senha de {resetFor?.name}? A senha atual deixa de valer e as sessões são encerradas.</p>
            <CheckboxField label="Enviar a nova senha por e-mail" checked={sendByEmail} onChange={(e) => setSendByEmail(e.target.checked)} />
            <div className="tw-row"><Button loading={busy === resetFor?.id} onClick={() => void reset()}>Redefinir</Button><Button variant="ghost" onClick={closeReset}>Cancelar</Button></div>
          </div>
        )}
      </Overlay>
      <Overlay title="Realocar mentorias antes de desativar" open={!!realocar} onClose={() => setRealocar(null)}>
        {realocar && (
          <div className="tw-stack" data-testid="realocar-lista">
            <p>{realocar.name} tem mentorias futuras. Mova ou cancele cada uma no mapa de mesas e tente desativar de novo.</p>
            <ul className="adm-list">
              {realocar.details.appointments.map((a) => (
                <li key={a.id}><span>{formatTime(a.startAt)} · mesa {a.tableNumber}</span><span>{a.menteeName}</span></li>
              ))}
            </ul>
            <LinkButton to="/admin/mapa" onClick={() => setRealocar(null)}>Abrir mapa de mesas</LinkButton>
          </div>
        )}
      </Overlay>
    </div>
  );
}
