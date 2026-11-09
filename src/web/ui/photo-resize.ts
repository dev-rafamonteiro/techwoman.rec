const PHOTO_MAX_SIDE = 640;
const PHOTO_QUALITY = 0.85;
/** Limite do arquivo escolhido, antes de reduzir: uma foto de celular passa longe disso. */
export const PHOTO_INPUT_MAX_BYTES = 25 * 1024 * 1024;

/** Medidas para caber em `max` no maior lado, sem ampliar. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Reduz a imagem no navegador e devolve um JPEG. Rejeita se o navegador não souber abrir o arquivo (ex.: HEIC no Chrome). */
export async function resizePhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const size = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('canvas indisponível');
  // PNG transparente: sem o fundo, a parte transparente vira preto no JPEG
  g.fillStyle = '#fff';
  g.fillRect(0, 0, size.width, size.height);
  g.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('falha ao gerar a imagem'))), 'image/jpeg', PHOTO_QUALITY);
  });
}

/** Corpo multipart de E55/E56. */
export function photoForm(blob: Blob): FormData {
  const form = new FormData();
  form.append('file', blob, 'foto.jpg');
  return form;
}
