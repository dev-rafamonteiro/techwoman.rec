import { useState } from 'react';
import { ENDPOINTS, FEEDBACK_ITEMS, type AdminFeedbackItem, type FeedbackItem } from '@tw/shared';
import { EmptyState, ErrorState, SkeletonList, call, formatDateTime, usePolling, useQuery } from '../../ui';
import { BarChart, PageHead, useTitle } from './lib/common';
import './lib/a10.css';

const ITEM_PT: Record<FeedbackItem, string> = { event: 'Evento', talk: 'Palestra', mentoring: 'Mentoria' };
const FILTERS = [
  ['all', 'Todas'],
  ['comment', 'Com comentário'],
  ['low', 'Alguma nota até 2'],
] as const;
type Filter = (typeof FILTERS)[number][0];

const fmt = (n: number | null) => (n == null ? '–' : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Uma resposta: participante, mentora, as três notas e o comentário. */
function Answer({ a }: { a: AdminFeedbackItem }) {
  return (
    <li className="a10-answer" data-testid="a10-answer">
      <div className="a10-answer__head">
        <strong>{a.menteeName}</strong>
        <span className="a10-answer__meta">{a.mentorName ? `com ${a.mentorName} · ` : ''}{formatDateTime(a.createdAt)}</span>
      </div>
      <dl className="a10-answer__rates">
        {FEEDBACK_ITEMS.map((k) => (
          <div key={k} data-low={a.ratings[k] <= 2}>
            <dt>{ITEM_PT[k]}</dt>
            <dd aria-label={`${a.ratings[k]} de 5`}><span aria-hidden="true">{stars(a.ratings[k])}</span></dd>
          </div>
        ))}
      </dl>
      {a.comment && <p className="a10-answer__comment">{a.comment}</p>}
    </li>
  );
}

/** A10 · Avaliações (E49): médias, distribuição das notas e respostas da avaliação feita em P6 (E09). */
export default function A10Avaliacoes() {
  useTitle('Avaliações');
  const q = useQuery((signal) => call(ENDPOINTS.E49, { signal }), []);
  usePolling(() => q.refetch(), 60000);
  const [filter, setFilter] = useState<Filter>('all');

  const head = <PageHead title="Avaliações" sub="O que as participantes acharam do evento, da palestra e da mentoria. Atualiza a cada minuto." />;
  if (q.status === 'loading') return <div className="tw-page">{head}<SkeletonList rows={4} height={90} /></div>;
  if (q.status === 'error') return <div className="tw-page">{head}<ErrorState error={q.error} onRetry={q.reload} /></div>;
  const d = q.data;
  const rate = d.doneCount ? Math.round((d.total / d.doneCount) * 100) : null;
  const shown = d.items.filter((a) => (filter === 'comment' ? !!a.comment : filter === 'low' ? FEEDBACK_ITEMS.some((k) => a.ratings[k] <= 2) : true));
  const withComment = d.items.filter((a) => a.comment).length;

  return (
    <div className="tw-page tw-stack a10">
      {head}
      <div className="adm-kpis" data-testid="a10-kpis">
        <div className="adm-kpi adm-kpi--p" data-testid="kpi-answers">
          <span className="adm-kpi__label">Respostas</span>
          <strong>{d.total}</strong>
          <span className="adm-kpi__note">{rate == null ? 'nenhuma mentoria concluída' : `${rate}% das ${d.doneCount} concluídas`}</span>
        </div>
        {FEEDBACK_ITEMS.map((k) => (
          <div className="adm-kpi" key={k} data-testid={`kpi-${k}`}>
            <span className="adm-kpi__label">Média · {ITEM_PT[k]}</span>
            <strong>{fmt(d.summary[k].average)}<small className="a10-of"> / 5</small></strong>
            <span className="adm-kpi__note">{d.total ? `${d.summary[k].counts[4]} deram 5 estrelas` : ''}</span>
          </div>
        ))}
        <div className="adm-kpi adm-kpi--o" data-testid="kpi-comments">
          <span className="adm-kpi__label">Com comentário</span>
          <strong>{withComment}</strong>
          <span className="adm-kpi__note" />
        </div>
      </div>

      {d.total === 0 ? (
        <section className="adm-panel"><EmptyState title="Nenhuma avaliação ainda" text="A avaliação abre para a participante na página dela depois que a mentora conclui a mentoria." /></section>
      ) : (
        <>
          <div className="adm-charts a10-charts">
            {FEEDBACK_ITEMS.map((k) => (
              <section className="adm-panel" key={k} aria-label={`Notas · ${ITEM_PT[k]}`} data-testid={`a10-dist-${k}`}>
                <BarChart title={ITEM_PT[k]} label={`Notas para ${ITEM_PT[k].toLowerCase()}`} columns={['Nota', 'Respostas']} unit="respostas"
                  data={[5, 4, 3, 2, 1].map((n) => ({ label: `${n} ${n === 1 ? 'estrela' : 'estrelas'}`, value: d.summary[k].counts[n - 1]! }))} />
              </section>
            ))}
          </div>

          <section className="adm-panel" data-testid="a10-answers">
            <div className="adm-panel__head">
              <h2>Respostas</h2>
              <div className="a10-filters" role="group" aria-label="Filtrar respostas">
                {FILTERS.map(([k, label]) => (
                  <button key={k} type="button" className="adm-pillbtn" aria-pressed={filter === k} onClick={() => setFilter(k)} data-testid={`a10-filter-${k}`}>{label}</button>
                ))}
              </div>
            </div>
            {shown.length === 0 ? <EmptyState title="Nenhuma resposta com esse filtro" /> : <ul className="a10-answers">{shown.map((a) => <Answer key={a.menteeId} a={a} />)}</ul>}
          </section>
        </>
      )}
    </div>
  );
}
