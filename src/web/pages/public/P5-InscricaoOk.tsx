import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Card, LinkButton } from '../../ui';
import { loadPersonalPath } from './lib/journey';

/** P5 · Inscrição recebida (link pessoal vem de E02 e é guardado por P4) */
export default function P5InscricaoOk() {
  const location = useLocation();
  const path = (location.state as { personalPath?: string } | null)?.personalPath ?? loadPersonalPath();
  const link = path ? `${window.location.origin}${path}` : null;
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
    <div className="tw-page tw-stack" data-testid="p5">
      <Card accent>
        <h1 className="tw-title tw-title--ink">Recebemos sua inscrição!</h1>
        <p>Em breve uma mentora vai propor um horário e uma mesa. Você vai receber o aviso por e-mail e WhatsApp.</p>
      </Card>
      <Card>
        <h2 className="tw-title tw-title--ink">O que acontece agora</h2>
        <ol>
          <li>Uma mentora da sua área escolhe sua inscrição.</li>
          <li>Você recebe horário e mesa e tem 15 minutos para confirmar.</li>
          <li>Chegue 5 minutos antes na mesa indicada.</li>
        </ol>
      </Card>
      {link && (
        <>
          <LinkButton to={path!} size="lg" block data-testid="p5-track">Acompanhar minha mentoria</LinkButton>
          <Card>
            <p><strong>Salve este link</strong></p>
            <p className="tw-field__hint">É a sua página pessoal. Por ela você confirma o horário que a mentora propuser.</p>
            <p className="tw-field__hint" data-testid="p5-link" style={{ wordBreak: 'break-all' }}>{link}</p>
            <Button variant="secondary" block onClick={() => void copy()} data-testid="p5-copy" aria-live="polite">
              {copied ? 'Copiado ✓' : 'Copiar'}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
