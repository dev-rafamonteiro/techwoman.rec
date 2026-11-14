import { useState } from 'react';
import { ENDPOINTS, FEEDBACK_ITEMS, type AdminFeedbackItem, type FeedbackItem, type RaffleDraw } from '@tw/shared';
import { Button, EmptyState, ErrorState, Overlay, SkeletonList, call, formatDateTime, maskPhone, usePolling, useQuery, useToast } from '../../ui';
import { BarChart, PageHead, errMsg, useTitle } from './lib/common';
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

const phoneFmt = (p: string | null) => (p ? maskPhone(p.replace(/^\+55/, '')) : 'sem celular');

/**
 * RN28 · Sorteio entre quem respondeu a pesquisa (E62–E64): "Fazer sorteio" sorteia uma por vez e mostra o nome;
 * "Últimas sorteadas" lista as sorteadas (ID, nome, e-mail, celular) e "Limpar" devolve todas ao sorteio.
 */
function Raffle() {
  const toast = useToast();
  const [open, setOpen] = useState<'draw' | 'list' | null>(null);
  const [winner, setWinner] = useState<RaffleDraw | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery((signal) => call(ENDPOINTS.E62, { signal }), []);
  const eligible = q.status === 'success' ? q.data.eligible : null;
  const draws = q.status === 'success' ? q.data.draws : [];

  const openDraw = () => { setWinner(null); setOpen('draw'); void q.refetch(); };
  const openList = () => { setOpen('list'); void q.refetch(); };
  const draw = async () => {
    setBusy(true);
    try {
      const r = await call(ENDPOINTS.E63, { body: {} });
      setWinner(r.draw);
      await q.refetch();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const clear = async () => {
    if (!window.confirm('Limpar a lista de sorteadas? Todas as que responderam a pesquisa voltam a concorrer.')) return;
    setBusy(true);
    try {
      const r = await call(ENDPOINTS.E64, {});
      toast.success(r.cleared ? `Lista limpa: ${r.cleared} ${r.cleared === 1 ? 'sorteada voltou' : 'sorteadas voltaram'} ao sorteio.` : 'A lista já estava vazia.');
      setWinner(null);
      await q.refetch();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <Button onClick={openDraw} data-testid="a10-raffle-open">Fazer sorteio</Button>
      <Button variant="secondary" onClick={openList} data-testid="a10-raffle-list">Últimas sorteadas</Button>

      <Overlay title="Sorteio" open={open === 'draw'} onClose={() => setOpen(null)}>
        <div className="a10-raffle" data-testid="a10-raffle">
          {winner ? (
            <div className="a10-raffle__winner" role="status" data-testid="a10-raffle-winner">
              <span className="a10-raffle__label">Sorteada</span>
              <strong className="a10-raffle__name">{winner.name}</strong>
              <span className="a10-raffle__meta">{winner.email} · {phoneFmt(winner.phone)}</span>
            </div>
          ) : (
            <p className="a10-raffle__hint">Concorrem as participantes que responderam a pesquisa de satisfação. Quem já foi sorteada não entra de novo até a lista ser limpa.</p>
          )}
          <p className="a10-raffle__count" data-testid="a10-raffle-eligible">
            {eligible == null ? 'Carregando…' : eligible === 0 ? 'Ninguém para sortear: todas as que responderam já foram sorteadas.' : `${eligible} ${eligible === 1 ? 'participante concorre' : 'participantes concorrem'}`}
          </p>
          <Button size="lg" block loading={busy} disabled={!eligible} onClick={() => void draw()} data-testid="a10-raffle-draw">{winner ? 'Sortear de novo' : 'Sortear'}</Button>
        </div>
      </Overlay>

      <Overlay title="Últimas sorteadas" open={open === 'list'} onClose={() => setOpen(null)}>
        <div className="a10-raffle" data-testid="a10-raffle-draws">
          {q.status === 'error' ? <ErrorState error={q.error} onRetry={q.reload} /> : draws.length === 0 ? (
            <EmptyState title="Ninguém sorteada ainda" text="As sorteadas aparecem aqui, da mais recente para a mais antiga." />
          ) : (
            <ol className="a10-draws">
              {draws.map((d) => (
                <li key={d.id} className="a10-draw" data-testid="a10-raffle-draw-item">
                  <div className="a10-answer__head"><strong>{d.name}</strong><span className="a10-answer__meta">{formatDateTime(d.drawnAt)}</span></div>
                  <span className="a10-draw__line">{d.email} · {phoneFmt(d.phone)}</span>
                  <span className="a10-draw__id">ID {d.menteeId}</span>
                </li>
              ))}
            </ol>
          )}
          <Button variant="danger" block loading={busy} disabled={draws.length === 0} onClick={() => void clear()} data-testid="a10-raffle-clear">Limpar</Button>
        </div>
      </Overlay>
    </>
  );
}

/** A10 · Avaliações (E49): médias, distribuição das notas e respostas da avaliação feita em P6 (E09). */
export default function A10Avaliacoes() {
  useTitle('Avaliações');
  const q = useQuery((signal) => call(ENDPOINTS.E49, { signal }), []);
  usePolling(() => q.refetch(), 60000);
  const [filter, setFilter] = useState<Filter>('all');

  const head = <PageHead title="Avaliações" sub="O que as participantes acharam do evento, da palestra e da mentoria. Atualiza a cada minuto."><Raffle /></PageHead>;
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
