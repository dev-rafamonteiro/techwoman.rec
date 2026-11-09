import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ApiError } from '../../net/client';
import { PHOTO_INPUT_MAX_BYTES, resizePhoto } from '../photo-resize';
import { Button } from './Button';

export { photoForm } from '../photo-resize';

interface PhotoUploadProps {
  url: string | null;
  /** Recebe o JPEG já reduzido e envia (E55/E56). */
  onFile: (blob: Blob) => Promise<void>;
  onRemove?: () => Promise<void>;
  testId?: string;
}

const UNREADABLE = 'Não foi possível abrir esta imagem. Use uma foto em JPG ou PNG.';

/** Foto da mentora: escolhe o arquivo, reduz no navegador e envia na hora, sem depender do "Salvar" da tela. */
export function PhotoUpload({ url, onFile, onRemove, testId }: PhotoUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : UNREADABLE);
    } finally {
      setBusy(false);
    }
  };

  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    if (file.size > PHOTO_INPUT_MAX_BYTES) {
      setError('Esta imagem é grande demais. Escolha um arquivo menor.');
      return;
    }
    void run(async () => onFile(await resizePhoto(file)));
  };

  return (
    <div className="tw-photoup" data-testid={testId}>
      {url && !broken ? <img className="tw-photoup__img" src={url} alt="" onError={() => setBroken(true)} /> : <span className="tw-photoup__img" aria-hidden="true" />}
      <div className="tw-photoup__body">
        <span className="tw-field__label">Foto <span className="tw-field__hint">(opcional)</span></span>
        <div className="tw-photoup__actions">
          <Button variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}>{url ? 'Trocar foto' : 'Carregar foto'}</Button>
          {url && onRemove && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(onRemove)}>Remover</Button>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={choose} data-testid={testId && `${testId}-input`} />
        {error ? <span className="tw-field__error" role="alert"><span aria-hidden="true">⚠ </span>{error}</span> : <span className="tw-field__hint">JPG, PNG ou WebP.</span>}
      </div>
    </div>
  );
}
