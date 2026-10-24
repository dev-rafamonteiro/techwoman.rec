import { useState } from 'react';
import { Button } from './Button';

/**
 * Revelação única de senha provisória (A3, A8). Campo mascarado, "Copiar" e o aviso "Não será mostrada de novo".
 * Mostre uma vez: o pai deve descartar `secret` do estado ao fechar.
 */
export function SecretReveal({ secret, onSendEmail, onDone }: { secret: string; onSendEmail?: () => void | Promise<void>; onDone?: () => void }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(secret); setCopied(true); } catch { setShown(true); }
  };
  return (
    <div className="tw-secret" role="group" aria-label="Senha provisória">
      <strong>Senha provisória</strong>
      <div className="tw-secret__row">
        <output className="tw-secret__value" aria-live="polite">{shown ? secret : '•'.repeat(Math.min(secret.length, 14))}</output>
        <Button variant="mint" onClick={() => setShown((s) => !s)} aria-pressed={shown}>{shown ? 'Ocultar' : 'Mostrar'}</Button>
      </div>
      <div className="tw-row">
        <Button variant="primary" onClick={copy}>{copied ? 'Copiado ✓' : 'Copiar'}</Button>
        {onSendEmail && (
          <Button variant="secondary" loading={sending} onClick={async () => { setSending(true); try { await onSendEmail(); } finally { setSending(false); } }}>Enviar por e-mail</Button>
        )}
        {onDone && <Button variant="ghost" onClick={onDone} style={{ color: '#fff' }}>Já guardei, fechar</Button>}
      </div>
      <span className="tw-secret__warn">Não será mostrada de novo. A mentora troca a senha no primeiro acesso.</span>
    </div>
  );
}
