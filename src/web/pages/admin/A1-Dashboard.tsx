import { useState } from 'react';
import { ENDPOINTS, type AdminStreamEvent } from '@tw/shared';
import { ADMIN_STREAM_EVENT_TYPES } from '@tw/shared';
import { Countdown, ConnectionBar, ErrorState, SkeletonList, EmptyState, call, formatTime, usePolling, useQuery, useEventStream } from '../../ui';
import { BarChart, LineChart, PageHead, useTitle } from './lib/common';

const KIND_LABEL = {
  invite_expiring: 'Convite prestes a expirar',
  table_late: 'Mesa com mentoria atrasada',
  priority_waiting: 'Prioridade esperando há mais de 30 min',
} as const;

/** A1 · Dashboard (E30, atualização a cada 15 s; SSE de E38 antecipa a atualização). */
export default function A1Dashboard() {
  useTitle('Dashboard');
  const q = useQuery((signal) => call(ENDPOINTS.E30, { signal }), []);
  const [, setTick] = useState(0);
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
  const kpis: [string, string, string | number][] = [
    ['registered', 'Inscritas', d.counts.registered],
    ['waiting', 'Aguardando', d.counts.waiting],
    ['invites', 'Convites pendentes', d.counts.invitesPending],
    ['confirmed', 'Confirmadas', d.counts.confirmed],
    ['done', 'Concluídas', d.counts.done],
    ['noshow', 'Não compareceu', d.counts.noShow],
    ['tables', 'Mesas ocupadas agora', `${d.tables.occupiedNow}/${d.tables.total}`],
    ['capacity', 'Sessões livres no dia', d.remainingCapacity],
    ['mentors', 'Mentoras com login', `${d.mentors.loggedIn}/${d.mentors.total}`],
  ];
  const hours = d.registeredByHour.map((h) => ({ label: formatTime(h.hour).replace(/h00$/, 'h'), value: h.count }));
  return (
    <div className="tw-page tw-stack">
      <PageHead title="Dashboard"><ConnectionBar status={stream.status} lastUpdateAt={stream.lastUpdateAt} /></PageHead>
      <div className="adm-kpis" data-testid="a1-kpis">
        {kpis.map(([k, label, v]) => (
          <div className="adm-kpi" key={k} data-testid={`kpi-${k}`}><strong>{v}</strong><span>{label}</span></div>
        ))}
      </div>
      <div className="adm-charts">
        <section className="adm-panel"><h2>Inscritas por área</h2>
          {d.registeredByArea.length === 0 ? <EmptyState title="Sem inscrições ainda" text="Quando as participantes se inscreverem, o gráfico aparece aqui." /> : <BarChart label="Inscritas por área" data={d.registeredByArea.map((a) => ({ label: a.label, value: a.count }))} />}
        </section>
        <section className="adm-panel"><h2>Inscrições por hora</h2>
          {hours.length === 0 ? <EmptyState title="Sem inscrições ainda" /> : <LineChart label="Inscrições por hora" data={hours} />}
        </section>
      </div>
      <section className="adm-panel" data-testid="a1-attention"><h2>Precisa de atenção</h2>
        {d.attention.length === 0 ? <EmptyState title="Nada pendente" text="Nenhum convite, mesa ou prioridade exige ação agora." /> : (
          <ul className="adm-list">
            {d.attention.map((a, i) => (
              <li key={`${a.kind}-${a.appointmentId ?? a.menteeId ?? i}`}>
                <span><strong>{KIND_LABEL[a.kind]}</strong> · {a.menteeName}{a.mentorName ? ` com ${a.mentorName}` : ''}{a.tableNumber ? ` · mesa ${a.tableNumber}` : ''}</span>
                <span>{a.kind === 'invite_expiring' ? <Countdown expiresAt={a.at} serverNow={d.serverNow} label="Expira em" /> : `desde ${formatTime(a.at)}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
