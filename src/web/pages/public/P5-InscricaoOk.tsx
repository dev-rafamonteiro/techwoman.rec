import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { E02Created } from '@tw/shared';
import { Button, LinkButton, formatRange } from '../../ui';
import { loadPersonalPath, type PersonalLinks } from './lib/journey';
import { useToten } from '../../shell/toten/context';
import './public.css';

/** Toten: a confirmação fica na tela por esse tempo e a jornada volta ao início para a próxima pessoa. */
const TOTEN_RESTART_S = 30;

/** P5 · Mentoria confirmada (links de E02, guardados por P4; RN24) */
export default function P5InscricaoOk() {
  const location = useLocation();
  const state = location.state as (PersonalLinks & { appointment?: E02Created['appointment']; waiting?: boolean }) | null;
  const appointment = state?.appointment ?? null;
  /** Sem horário livre na inscrição: entrou na fila de espera (E02 com `appointment: null`). */
  const waiting = state?.waiting === true;
  const links = state?.personalPath ? state : loadPersonalPath();
  const path = links?.personalPath ?? null;
  // mostra e copia o link curto (E48); o botão navega pelo caminho longo, porque /l/ não é rota do React
  const shown = links?.shortPath ?? path;
  const link = shown ? `${window.location.origin}${shown}` : null;
  const [copied, setCopied] = useState(false);
  const toten = useToten();
  const [left, setLeft] = useState(TOTEN_RESTART_S);
  useEffect(() => {
    if (!toten) return;
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [toten]);
  useEffect(() => {
    if (toten && left <= 0) toten.restart();
  }, [toten, left]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const t = document.createElement('textarea');
      t.value = link;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="tw-p5" data-testid="p5">
      <div className="tw-shapes" aria-hidden="true">
        <span className="tw-shape tw-shape--check">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <span className="tw-shape tw-shape--square" />
        <span className="tw-shape tw-shape--half" />
      </div>
      <h1 className="tw-title">{appointment ? 'Mentoria confirmada!' : waiting ? 'Você está na fila de espera!' : 'Inscrição confirmada!'}</h1>
      {appointment
        ? <p data-testid="p5-appointment"><strong>{appointment.tableLabel}</strong> · {formatRange(appointment.startAt, appointment.endAt)} · com {appointment.mentorName}</p>
        : waiting
          ? <p data-testid="p5-waiting">Sua inscrição foi recebida. Todos os horários estavam ocupados, então você entrou na fila de espera. Se preferir, procure uma organizadora do evento.</p>
          : <p>Os detalhes da sua mentoria estão na sua página pessoal e no e-mail de confirmação.</p>}
      {toten ? (
        // tela compartilhada: o link pessoal é credencial, vai só por e-mail
        <>
          <p data-testid="p5-toten-email">Enviamos para o seu e-mail o link da sua página pessoal, para acompanhar, trocar ou cancelar a mentoria.</p>
          <Button size="lg" block onClick={toten.restart} data-testid="p5-toten-restart">Nova inscrição</Button>
          <small aria-live="polite">A tela volta ao início em {Math.max(left, 0)} s.</small>
        </>
      ) : <>
      {path && <LinkButton to={path} size="lg" block data-testid="p5-track">Acompanhar minha mentoria</LinkButton>}
      {link && (
        <div className="tw-linkbox">
          <strong>Salve este link</strong>
          <small>É a sua página pessoal. Por ela você acompanha, troca ou cancela sua mentoria.</small>
          <div className="tw-linkrow">
            <code data-testid="p5-link">{link.replace(/^https?:\/\//, '')}</code>
            <Button size="sm" onClick={() => void copy()} data-testid="p5-copy" aria-live="polite">{copied ? 'Copiado ✓' : 'Copiar'}</Button>
          </div>
        </div>
      )}
      </>}
      <strong>O que acontece agora</strong>
      {waiting ? (
        <ol className="tw-steps">
          <li>Você recebe por e-mail a confirmação da inscrição, com o link da sua página pessoal.</li>
          <li>Quando uma mentora for associada a você, enviamos outro e-mail com o horário e a mesa.</li>
          <li>Acompanhe tudo pela sua página pessoal.</li>
        </ol>
      ) : (
        <ol className="tw-steps">
          <li>Você recebe a confirmação por e-mail.</li>
          <li>Se precisar, troque o horário pela sua página pessoal.</li>
          <li>Chegue 5 minutos antes na mesa indicada.</li>
        </ol>
      )}
    </div>
  );
}
