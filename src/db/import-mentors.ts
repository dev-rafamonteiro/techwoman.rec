import { parse } from 'csv-parse/sync';
import { ObjectId, type Db } from 'mongodb';
import { z } from 'zod';
import { EmailSchema, zonedParts, type E33Response, type ImportRow } from '@tw/shared';
import { getCollections } from './collections.js';
import { generateProvisionalPassword, hashPassword } from './password.js';
import type { EventDoc, UserDoc } from './types.js';

export class ImportFormatError extends Error {}

export interface ImportOptions {
  event: EventDoc;
  dryRun: boolean;
  /** O que fazer com e-mails já existentes. Padrão: skip. */
  onExisting?: 'update' | 'skip';
  createdBy?: ObjectId | null;
  now?: Date;
}

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normHeader = (h: string) => stripAccents(h.trim().toLowerCase()).replace(/[^a-z]/g, '');

function detectDelimiter(text: string): string {
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  return (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
}

const splitList = (v: string | undefined) =>
  (v ?? '')
    .split(/[;|,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Converte "s03", "09:45", "9h45" ou "9h" em id de horário da grade. */
function slotIdFor(token: string, event: EventDoc): string | null {
  const t = token.trim().toLowerCase();
  if (/^s\d{2}$/.test(t)) return event.slots.some((s) => s.id === t) ? t : null;
  const m = /^(\d{1,2})(?:[h:](\d{2})?)?$/.exec(t);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2] ?? 0);
  const slot = event.slots.find((s) => {
    const p = zonedParts(s.startAt, event.timezone);
    return p.hour === hh && p.minute === mm;
  });
  return slot?.id ?? null;
}

function areaKeyFor(token: string, event: EventDoc): string | null {
  const t = stripAccents(token.trim().toLowerCase());
  const hit = event.areas.find((a) => a.key.toLowerCase() === t || stripAccents(a.label.toLowerCase()) === t);
  return hit?.key ?? null;
}

const NameSchema = z.string().trim().min(2).max(120);

/**
 * Importa mentoras de um CSV (A3, E33). Colunas: nome, email, linkedin, organizacao, areas, disponibilidade
 * (listas separadas por `;`, `|` ou `,`). Aceita separador `,` ou `;` e BOM. Com `dryRun` só valida (prévia linha a linha).
 * Sem `dryRun` grava e devolve as senhas provisórias (uma única vez).
 */
export async function importMentors(db: Db, csvText: string, opts: ImportOptions): Promise<E33Response> {
  const { users } = getCollections(db);
  const now = opts.now ?? new Date();
  const onExisting = opts.onExisting ?? 'skip';

  let records: Record<string, string>[];
  try {
    records = parse(csvText, {
      columns: (header: string[]) => header.map(normHeader),
      bom: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: detectDelimiter(csvText),
      relax_column_count: true,
    });
  } catch (err) {
    throw new ImportFormatError(`CSV inválido: ${(err as Error).message}`);
  }
  if (records.length > 0) {
    const cols = Object.keys(records[0]!);
    for (const required of ['nome', 'email']) {
      if (!cols.includes(required)) throw new ImportFormatError(`Coluna obrigatória ausente: ${required}`);
    }
  }
  if (records.length > 500) throw new ImportFormatError('Máximo de 500 linhas por importação.');

  const emails = records.map((r) => (r['email'] ?? '').toLowerCase());
  const existingByEmail = new Map<string, UserDoc>();
  for (const u of await users.find({ email: { $in: emails.filter(Boolean) } }).toArray()) existingByEmail.set(u.email, u);

  const seen = new Set<string>();
  const rows: ImportRow[] = records.map((r, i) => {
    const errors: string[] = [];
    const name = NameSchema.safeParse(r['nome'] ?? '');
    if (!name.success) errors.push('Nome inválido ou ausente.');
    const email = EmailSchema.safeParse(r['email'] ?? '');
    if (!email.success) errors.push('E-mail inválido.');
    const emailV = email.success ? email.data : (r['email'] ?? '').toLowerCase();
    if (email.success) {
      if (seen.has(emailV)) errors.push('E-mail duplicado no arquivo.');
      seen.add(emailV);
    }
    const areas: string[] = [];
    for (const tok of splitList(r['areas'])) {
      const k = areaKeyFor(tok, opts.event);
      if (k) areas.push(k);
      else errors.push(`Área desconhecida: ${tok}`);
    }
    const availability: string[] = [];
    for (const tok of splitList(r['disponibilidade'])) {
      const id = slotIdFor(tok, opts.event);
      if (id) availability.push(id);
      else errors.push(`Horário inexistente na grade: ${tok}`);
    }
    const linkedin = (r['linkedin'] ?? '').trim();
    const organization = (r['organizacao'] ?? '').trim();
    const exists = email.success && existingByEmail.has(emailV);
    return {
      line: i + 2,
      status: errors.length ? 'error' : exists ? 'exists' : 'valid',
      errors,
      data: {
        name: name.success ? name.data : (r['nome'] ?? ''),
        email: emailV,
        linkedin: linkedin || null,
        organization: organization || null,
        areas: [...new Set(areas)],
        availability: [...new Set(availability)],
      },
    };
  });

  const summary = { valid: 0, errors: 0, existing: 0, created: 0, updated: 0, skipped: 0 };
  for (const r of rows) {
    if (r.status === 'valid') summary.valid++;
    else if (r.status === 'error') summary.errors++;
    else summary.existing++;
  }
  const credentials: E33Response['credentials'] = [];

  if (!opts.dryRun) {
    for (const row of rows) {
      if (row.status === 'error') continue;
      const d = row.data;
      if (row.status === 'exists') {
        if (onExisting === 'skip') {
          summary.skipped++;
          continue;
        }
        await users.updateOne(
          { email: d.email },
          {
            $set: {
              name: d.name,
              linkedin: d.linkedin,
              organization: d.organization,
              areas: d.areas,
              availability: d.availability,
              updatedAt: now,
            },
            $addToSet: { roles: 'mentor' },
          },
        );
        summary.updated++;
        continue;
      }
      const password = generateProvisionalPassword();
      try {
        await users.insertOne({
          _id: new ObjectId(),
          name: d.name,
          email: d.email,
          roles: ['mentor'],
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
          status: 'active',
          linkedin: d.linkedin,
          organization: d.organization,
          areas: d.areas,
          bio: null,
          photoUrl: null,
          availability: d.availability,
          lastLoginAt: null,
          failedLogins: 0,
          failedLoginWindowStart: null,
          lockedUntil: null,
          passwordChangedAt: null,
          passwordResetCount: 0,
          createdBy: opts.createdBy ?? null,
          createdAt: now,
          updatedAt: now,
        });
        credentials.push({ email: d.email, name: d.name, provisionalPassword: password });
        summary.created++;
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
        row.status = 'error';
        row.errors.push('E-mail já cadastrado (criado durante a importação).');
        summary.errors++;
      }
    }
  }

  return { dryRun: opts.dryRun, rows, summary, credentials };
}
