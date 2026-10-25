import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, LinkButton } from '../../ui';
import { loadPersonalPath, type PersonalLinks } from './lib/journey';
import './public.css';

/** P5 · Inscrição recebida (links de E02, guardados por P4) */
export default function P5InscricaoOk() {
  const location = useLocation();
  const state = location.state as PersonalLinks | null;
  const links = state?.personalPath ? state : loadPersonalPath();
  const path = links?.personalPath ?? null;
  // mostra e copia o link curto (E48); o botão navega pelo caminho longo, porque /l/ não é rota do React
  const shown = links?.shortPath ?? path;
  const link = shown ? `${window.location.origin}${shown}` : null;
  const [copied, setCopied] = useState(false);

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
      <h1 className="tw-title">Recebemos sua inscrição!</h1>
      <p>Em breve uma mentora vai propor um horário e uma mesa. Você vai receber o aviso por e-mail e WhatsApp.</p>
      {path && <LinkButton to={path} size="lg" block data-testid="p5-track">Acompanhar minha mentoria</LinkButton>}
      {link && (
        <div className="tw-linkbox">
          <strong>Salve este link</strong>
          <small>É a sua página pessoal. Por ela você confirma o horário que a mentora propuser.</small>
          <div className="tw-linkrow">
            <code data-testid="p5-link">{link.replace(/^https?:\/\//, '')}</code>
            <Button size="sm" onClick={() => void copy()} data-testid="p5-copy" aria-live="polite">{copied ? 'Copiado ✓' : 'Copiar'}</Button>
          </div>
        </div>
      )}
      <strong>O que acontece agora</strong>
      <ol className="tw-steps">
        <li>Uma mentora da sua área escolhe sua inscrição.</li>
        <li>Você recebe horário e mesa e tem 15 minutos para confirmar.</li>
        <li>Chegue 5 minutos antes na mesa indicada.</li>
      </ol>
    </div>
  );
}
