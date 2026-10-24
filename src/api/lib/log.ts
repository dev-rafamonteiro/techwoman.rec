/** E-mail mascarado para logs: j***@g***.com (PLAN, "Segurança e LGPD"). Telefone nunca é registrado. */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  const [host = '', ...tld] = domain.split('.');
  return `${user.slice(0, 1)}***@${host.slice(0, 1)}***${tld.length ? '.' + tld.join('.') : ''}`;
}
