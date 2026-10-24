/** Escapa uma célula CSV e neutraliza injeção de fórmula (=, +, -, @) aberta no Excel. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // telefones E.164 (+5581...) são seguros; qualquer outro texto iniciado por =, +, -, @ ganha apóstrofo
  if (/^[=+\-@\t\r]/.test(s) && !/^\+\d+$/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvLine = (cells: unknown[]) => cells.map(csvCell).join(',');
