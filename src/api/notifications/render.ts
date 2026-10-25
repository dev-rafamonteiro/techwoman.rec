import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EMAIL_COMMON_VARS,
  EMAIL_SUBJECTS,
  EMAIL_TEMPLATE_IDS,
  EMAIL_TEMPLATE_VARS,
  type EmailTemplateId,
} from './templates/email/subjects.js';

/** Variável faltando ou `{{...}}` sobrando: o item da outbox vai para `failed` e nada é enviado. */
export class RenderError extends Error {}

const DIR = fileURLToPath(new URL('./templates/email/', import.meta.url));
const cache = new Map<string, string>();

function readTemplate(file: string): string {
  let src = cache.get(file);
  if (src === undefined) {
    try {
      src = readFileSync(DIR + file, 'utf8');
    } catch {
      throw new RenderError(`modelo de e-mail ausente: ${file}`);
    }
    cache.set(file, src);
  }
  return src;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Troca `{{variavel}}`; variável não informada é erro. `escape` aplica escape de HTML (só no `.html`). */
export function fillPlaceholders(src: string, vars: Readonly<Record<string, string | undefined>>, escape: boolean, where: string): string {
  const out = src.replace(PLACEHOLDER, (_m, name: string) => {
    const v = vars[name];
    if (v === undefined) throw new RenderError(`variável "${name}" ausente em ${where}`);
    return escape ? escapeHtml(v) : v;
  });
  if (out.includes('{{')) throw new RenderError(`placeholder sem fechamento em ${where}`);
  return out;
}

export const isEmailTemplateId = (v: string): v is EmailTemplateId => (EMAIL_TEMPLATE_IDS as readonly string[]).includes(v);

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Renderiza um dos 9 layouts. Todas as variáveis declaradas do layout e as comuns precisam estar em `vars`
 * (mesmo que o HTML não use alguma); `subjectTemplate` substitui o assunto padrão.
 */
export function renderEmail(id: EmailTemplateId, vars: Readonly<Record<string, string | undefined>>, subjectTemplate?: string): RenderedEmail {
  const required = [...EMAIL_COMMON_VARS, ...EMAIL_TEMPLATE_VARS[id]];
  const missing = required.filter((k) => vars[k] === undefined);
  if (missing.length) throw new RenderError(`variáveis ausentes para ${id}: ${missing.join(', ')}`);
  return {
    subject: fillPlaceholders(subjectTemplate ?? EMAIL_SUBJECTS[id], vars, false, `assunto de ${id}`),
    html: fillPlaceholders(readTemplate(`${id}.html`), vars, true, `${id}.html`),
    text: fillPlaceholders(readTemplate(`${id}.txt`), vars, false, `${id}.txt`),
  };
}

interface SampleData {
  common: Record<string, string>;
  templates: Record<string, Record<string, string>>;
}

/** E46: renderiza um layout com os dados de exemplo (`fixtures/sample-data.json`). */
export function renderEmailPreview(id: EmailTemplateId): RenderedEmail {
  let data: SampleData;
  try {
    data = JSON.parse(readFileSync(DIR + 'fixtures/sample-data.json', 'utf8')) as SampleData;
  } catch {
    throw new RenderError('dados de exemplo dos e-mails ausentes');
  }
  return renderEmail(id, { ...data.common, ...data.templates[id] });
}

/** Primeira variável de assunto que o layout não conhece (assunto editado em A7), ou null. */
export function invalidSubjectVariable(subjects: Partial<Record<string, string>> | undefined): { layout: string; variable: string } | null {
  for (const [layout, subject] of Object.entries(subjects ?? {})) {
    if (!subject || !isEmailTemplateId(layout)) continue;
    const allowed = new Set<string>([...EMAIL_COMMON_VARS, ...EMAIL_TEMPLATE_VARS[layout]]);
    for (const m of subject.matchAll(PLACEHOLDER)) if (!allowed.has(m[1]!)) return { layout, variable: m[1]! };
  }
  return null;
}
