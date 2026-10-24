/** Telefone brasileiro (com ou sem máscara/+55) para E.164. Devolve null se inválido. */
export function normalizePhoneBR(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== '9') return null;
  return `+55${d}`;
}

/** LinkedIn: aceita só o usuário, "linkedin.com/in/x" ou a URL completa; guarda a URL completa. Null se vazio ou inválido. */
export function normalizeLinkedin(input: string | null | undefined): string | null | undefined {
  if (input === null || input === undefined) return input;
  const v = input.trim();
  if (!v) return null;
  const m = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|company)\/([A-Za-z0-9\-_%.]{2,100})\/?(?:\?.*)?$/i.exec(v);
  if (m) return `https://www.linkedin.com/in/${m[1]}`;
  if (/^[A-Za-z0-9\-_%.]{2,100}$/.test(v)) return `https://www.linkedin.com/in/${v}`;
  return undefined;
}
