import { useState } from 'react';
import { ENDPOINTS, type AdminStreamEvent } from '@tw/shared';
import { ADMIN_STREAM_EVENT_TYPES } from '@tw/shared';
import { Link } from 'react-router-dom';
import { ApiError, Countdown, ConnectionBar, ErrorState, SkeletonList, EmptyState, call, useToast, formatDayShort, formatTime, usePolling, useQuery, useEventStream } from '../../ui';
import { BarChart, LineChart, PageHead, Switch, useTitle } from './lib/common';

/** Tipos de "Precisa de atenção": etiqueta, tom e ação (design/admin/A1-dashboard.html). */
const KIND = {
  invite_expiring: { tag: 'Convite expirando', tone: 'o', action: 'Ver no mapa', to: '/admin/mapa' },
  table_late: { tag: 'Mentoria atrasada', tone: 'r', action: 'Ver no mapa', to: '/admin/mapa' },
  priority_waiting: { tag: 'Prioridade na fila', tone: 'p', action: 'Agendar manualmente', to: '/admin/participantes' },
} as const;

/** A1 · Dashboard (E30, atualização a cada 15 s; SSE de E38 antecipa a atualização). */
export default function A1Dashboard() {
  useTitle('Dashboard');
  const q = useQuery((signal) => call(ENDPOINTS.E30, { signal }), []);
  const [, setTick] = useState(0);
  const toast = useToast();
  // RN25 · liga/desliga o cancelamento pela mentora (E61); null = vale o que veio de E30
  const [cancelOn, setCancelOn] = useState<boolean | null>(null);
  const [savingCancel, setSavingCancel] = useState(false);
  usePolling(() => q.refetch(), 15000);
  const stream = useEventStream<AdminStreamEvent>({
    endpoint: ENDPOINTS.E38Stream,
    eventTypes: ADMIN_STREAM_EVENT_TYPES,
    onEvent: () => void q.refetch().then(() => setTick((n) => n + 1)),
    refetch: () => q.refetch(),
    pollMs: 15000,
  });

  if (q.status === 'loading') return <div className="tw-page"><PageHead title="Dashboard" /><SkeletonList rows={4} height={90} /></div>;
  if (q.status === 'error') return <div className="tw-page"><PageHead title="Dashboard" /><ErrorState error={q.error} onRetry={q.reload} /></div>;
  const d = q.data;
  const mentorCancel = cancelOn ?? d.mentorCancelEnabled;
  const toggleMentorCancel = async (enabled: boolean) => {
    if (savingCancel) return;
    setSavingCancel(true);
    setCancelOn(enabled);
    try {
      const r = await call(ENDPOINTS.E61, { body: { enabled } });
      // volta a valer o E30, que também mostra a mudança feita por outra administradora
      await q.refetch();
      setCancelOn(null);
      toast.success(r.mentorCancelEnabled ? 'As mentoras podem cancelar pela agenda.' : 'Cancelamento pela mentora desligado: ela só pede às administradoras.');
    } catch (e) {
      setCancelOn(null);
      toast.error((e as ApiError).message || 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSavingCancel(false);
    }
  };
  const now = new Date(d.serverNow).getTime();
  const expiringSoon = d.attention.filter((a) => a.kind === 'invite_expiring' && new Date(a.at).getTime() - now < 3 * 60000).length;
  const neverLogged = d.mentors.total - d.mentors.loggedIn;
  const over = d.overCapacitySlots;
  // [chave, rótulo, valor, nota, tom]: tons do design (n neutro, o laranja, m menta, g cinza, r vermelho, p roxo escuro)
  const kpis: [string, string, string | number, string, string][] = [
    ['registered', 'Inscritas', d.counts.registered, '', 'n'],
    ['waiting', 'Aguardando', d.counts.waiting, '', 'n'],
    ['invites', 'Convites pendentes', d.counts.invitesPending, expiringSoon ? `${expiringSoon} ${expiringSoon === 1 ? 'expira' : 'expiram'} em < 3 min` : '', 'o'],
    ['confirmed', 'Confirmadas', d.counts.confirmed, '', 'm'],
    // RN21: atendidas (cada participante uma vez), com a divisão na mesa / fora da mesa
    ['done', 'Concluídas', d.counts.attended.total, `${d.counts.attended.atTable} na mesa · ${d.counts.attended.walkIn} fora da mesa`, 'g'],
    ['walkins', 'Atendimentos fora da mesa', d.counts.walkIns, 'registros das mentoras', 'g'],
    ['noshow', 'Não compareceu', d.counts.noShow, '', 'r'],
    ['tables', 'Mesas ocupadas agora', `${d.tables.occupiedNow}/${d.tables.total}`, '', 'p'],
    // RN22: horário com mais mentoras do que mesas (só por ação do admin) vira nota laranja no mesmo card
    ['capacity', 'Sessões livres hoje', d.remainingCapacity, over.length ? `Mais mentoras que mesas: ${over.map((s) => formatTime(s.startAt)).slice(0, 3).join(', ')}${over.length > 3 ? '…' : ''}` : 'capacidade restante', over.length ? 'o' : 'n'],
    ['mentorfree', 'Horários disponíveis', d.mentorFreeSlots, 'livres nas agendas das mentoras ativas', 'n'],
    ['mentors', 'Mentoras com login', `${d.mentors.loggedIn}/${d.mentors.total}`, neverLogged > 0 ? `${neverLogged} nunca ${neverLogged === 1 ? 'acessou' : 'acessaram'}` : '', 'n'],
  ];
  const hours = d.registeredByHour.map((h) => ({ label: formatTime(h.hour).replace(/h00$/, 'h'), value: h.count }));
  const text = (a: (typeof d.attention)[number]) => {
    const table = a.tableNumber ? `Mesa ${a.tableNumber}` : 'mesa';
    if (a.kind === 'invite_expiring') return `Convite de ${a.mentorName ?? 'uma mentora'} para ${a.menteeName}${a.tableNumber ? ` (${table})` : ''} expira em`;
    if (a.kind === 'table_late') return `${table} às ${formatTime(a.at)}: ${a.mentorName ?? 'a mentora'} ainda não iniciou a sessão com ${a.menteeName}`;
    return `${a.menteeName} está com prioridade na fila desde ${formatTime(a.at)}`;
  };
  return (
    <div className="tw-page tw-stack">
      <PageHead title="Dashboard" sub={`${formatDayShort(d.serverNow).replace(/^./, (c) => c.toUpperCase())} · agora ${formatTime(d.serverNow)} (horário de Recife)`}>
        <ConnectionBar status={stream.status} lastUpdateAt={stream.lastUpdateAt} idleText="a cada 15 s" />
      </PageHead>
      <div className="a1-toggle" data-on={mentorCancel} data-testid="a1-mentor-cancel">
        <span className="a1-toggle__txt">
          <strong>Cancelamento pela mentora {mentorCancel ? 'ligado' : 'desligado'}</strong>
          <span>{mentorCancel
            ? 'A mentora cancela a mentoria pela agenda dela; a participante volta para a fila com prioridade.'
            : 'A mentora não cancela: ao tocar em cancelar, ela escreve o motivo e as administradoras recebem o pedido por e-mail.'}</span>
        </span>
        <Switch label="Cancelamento pela mentora ligado" checked={mentorCancel} onChange={(v) => void toggleMentorCancel(v)} />
      </div>
      <div className="adm-kpis" data-testid="a1-kpis">
        {kpis.map(([k, label, v, note, tone]) => (
          <div className={`adm-kpi adm-kpi--${tone}`} key={k} data-testid={`kpi-${k}`}>
            <span className="adm-kpi__label">{label}</span>
            <strong>{v}</strong>
            <span className="adm-kpi__note">{note}</span>
          </div>
        ))}
      </div>
      <div className="adm-charts">
        <section className="adm-panel" aria-label="Inscritas por área">
          {d.registeredByArea.length === 0
            ? <><h2>Inscritas por área</h2><EmptyState title="Sem inscrições ainda" text="Quando as participantes se inscreverem, o gráfico aparece aqui." /></>
            : <BarChart title="Inscritas por área" label="Inscritas por área" data={[...d.registeredByArea].sort((a, b) => b.count - a.count).map((a) => ({ label: a.label, value: a.count }))} />}
        </section>
        <section className="adm-panel" aria-label="Inscrições por hora">
          {hours.length === 0 ? <><h2>Inscrições por hora</h2><EmptyState title="Sem inscrições ainda" /></> : <LineChart title="Inscrições por hora" label="Inscrições por hora" data={hours} />}
        </section>
      </div>
      <section className="adm-panel" data-testid="a1-attention"><h2>Precisa de atenção</h2>
        {d.attention.length === 0 ? <EmptyState title="Nada pendente" text="Nenhum convite, mesa ou prioridade exige ação agora." /> : (
          <ul className="adm-list">
            {d.attention.map((a, i) => (
              <li key={`${a.kind}-${a.appointmentId ?? a.menteeId ?? i}`}>
                <span className={`adm-tag adm-tag--${KIND[a.kind].tone}`}>{KIND[a.kind].tag}</span>
                <span className="adm-list__text">
                  {text(a)}{a.kind === 'invite_expiring' && <> <Countdown expiresAt={a.at} serverNow={d.serverNow} label="" /></>}
                </span>
                <Link className="adm-list__act" to={KIND[a.kind].to}>{KIND[a.kind].action}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
