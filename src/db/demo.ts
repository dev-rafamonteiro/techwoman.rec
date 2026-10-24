import { createHash, createHmac } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import type { PreferredPeriod } from '@tw/shared';
import { getCollections } from './collections.js';
import { hashPassword } from './password.js';
import type { AppointmentDoc, EventDoc, MenteeDoc, UserDoc } from './types.js';

/**
 * Massa de demonstração: coordenação, mentoras e participantes em vários estados da fila (A1, A5, M3, M4, P6).
 * Só grava no banco (sem outbox): nada é enviado ao carregar. Os e-mails seguem `emailTemplate`, onde `{slug}`
 * vira `tw-demo-<nome>`; o padrão usa os endereços de teste do Resend (simulam entrega sem afetar a reputação).
 */
export const DEMO_EMAIL_TEMPLATE = 'delivered+{slug}@resend.dev';
const SLUG_PREFIX = 'tw-demo-';

export interface DemoOptions {
  event: EventDoc;
  password: string;
  /** Mesmo segredo da API (MENTEE_TOKEN_SECRET), para os links pessoais impressos funcionarem. */
  menteeTokenSecret: string;
  emailTemplate?: string;
  now?: Date;
}

export interface DemoResult {
  admins: string[];
  mentors: string[];
  mentees: number;
  appointments: number;
  /** Links pessoais (P6) de uma participante por estado. */
  links: { name: string; status: string; path: string }[];
}

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const emailFor = (template: string, name: string) => template.replace('{slug}', SLUG_PREFIX + slugify(name)).toLowerCase();

function demoEmailRegex(template: string): RegExp {
  const [pre, post] = template.toLowerCase().split('{slug}');
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${esc(pre ?? '')}${SLUG_PREFIX}[a-z0-9-]+${esc(post ?? '')}$`);
}

// Mesma derivação de src/api/lib/tokens.ts (menteeToken + hashMenteeToken).
const menteeToken = (secret: string, id: ObjectId, v: number) =>
  createHmac('sha256', secret).update(`mentee-token:${String(id)}:${v}`).digest('base64url');
const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

const ADMINS = ['Rafaela Coordenação'];

// [nome, organização, áreas, horários (índices da grade, a partir de 0)]
const MENTORS: [string, string, string[], number[]][] = [
  ['Ana Beatriz Lima', 'Cesar School', ['backend', 'cloud'], [0, 1, 2, 3, 6, 7]],
  ['Juliana Ferraz', 'Porto Digital', ['frontend', 'ux'], [0, 1, 2, 4, 5, 8]],
  ['Camila Rocha', 'Neurotech', ['dados'], [1, 2, 3, 4, 9, 10]],
  ['Larissa Monteiro', 'Accenture', ['produto'], [0, 2, 4, 6, 8, 10]],
  ['Patrícia Albuquerque', 'CI&T', ['cloud', 'backend'], [3, 4, 5, 6, 7, 8]],
  ['Renata Souza', 'Avanade', ['ux', 'produto'], [5, 6, 7, 8, 9, 10, 11]],
  ['Fernanda Cavalcanti', 'Jusbrasil', ['dados', 'backend'], [0, 1, 6, 7, 10, 11]],
  ['Mariana Teixeira', 'ThoughtWorks', ['frontend'], [2, 3, 4, 5, 9, 11]],
  ['Gabriela Nunes', 'Stone', ['backend', 'dados'], [4, 5, 6, 7, 8, 9]],
  ['Tatiana Barros', 'Zup', ['produto', 'ux'], [0, 1, 2, 9, 10, 11]],
];

const MENTEE_NAMES = [
  'Alice Ramos', 'Bianca Oliveira', 'Carolina Mendes', 'Daniela Costa', 'Eduarda Pires', 'Flávia Santos',
  'Giovanna Melo', 'Helena Araújo', 'Isabela Freitas', 'Jéssica Moura', 'Karina Lopes', 'Letícia Barbosa',
  'Manuela Gomes', 'Natália Ribeiro', 'Olívia Martins', 'Paula Carvalho', 'Quésia Duarte', 'Rebeca Farias',
  'Sabrina Torres', 'Thaís Correia', 'Úrsula Vieira', 'Vanessa Dias', 'Wanessa Pereira', 'Yasmin Batista',
  'Amanda Cunha', 'Beatriz Fontes', 'Clara Siqueira', 'Débora Macedo', 'Elisa Rangel', 'Fabiana Queiroz',
  'Gisele Tavares', 'Ingrid Moreira', 'Joana Bezerra', 'Lívia Assis', 'Mirela Campos', 'Nayara Leão',
  'Priscila Azevedo', 'Raquel Brandão', 'Sofia Pacheco', 'Valéria Coelho',
];

const NOTES = [
  'Quero migrar de suporte para desenvolvimento.',
  'Estou no último ano da faculdade e busco o primeiro estágio.',
  'Trabalho com testes e quero ir para dados.',
  null,
  'Voltando ao mercado depois da licença-maternidade.',
  null,
  'Quero entender como montar um portfólio.',
];

const PERIODS: PreferredPeriod[] = ['morning', 'early_afternoon', 'late_afternoon', 'any'];

/** Apaga a massa de demonstração anterior (identificada pelo padrão de e-mail). */
export async function clearDemo(db: Db, eventId: string, template = DEMO_EMAIL_TEMPLATE): Promise<number> {
  const c = getCollections(db);
  const re = demoEmailRegex(template);
  const menteeIds = (await c.mentees.find({ eventId, emailNorm: re }, { projection: { _id: 1 } }).toArray()).map((m) => m._id);
  const userIds = (await c.users.find({ email: re }, { projection: { _id: 1 } }).toArray()).map((u) => u._id);
  await c.appointments.deleteMany({ eventId, $or: [{ menteeId: { $in: menteeIds } }, { mentorId: { $in: userIds } }] });
  await c.outbox.deleteMany({ eventId, $or: [{ menteeId: { $in: menteeIds } }, { userId: { $in: userIds } }] });
  await c.sessions.deleteMany({ userId: { $in: userIds } });
  await c.mentees.deleteMany({ _id: { $in: menteeIds } });
  await c.users.deleteMany({ _id: { $in: userIds } });
  return menteeIds.length + userIds.length;
}

export async function hasDemo(db: Db, eventId: string, template = DEMO_EMAIL_TEMPLATE): Promise<boolean> {
  return (await getCollections(db).mentees.countDocuments({ eventId, emailNorm: demoEmailRegex(template) }, { limit: 1 })) > 0;
}

export async function seedDemo(db: Db, opts: DemoOptions): Promise<DemoResult> {
  const { event, menteeTokenSecret } = opts;
  const template = opts.emailTemplate ?? DEMO_EMAIL_TEMPLATE;
  const now = opts.now ?? new Date();
  const c = getCollections(db);
  const passwordHash = await hashPassword(opts.password);
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  const areaKeys = event.areas.map((a) => a.key);

  const user = (name: string, roles: UserDoc['roles'], extra: Partial<UserDoc> = {}): UserDoc => ({
    _id: new ObjectId(),
    name,
    email: emailFor(template, name),
    roles,
    passwordHash,
    mustChangePassword: false,
    status: 'active',
    linkedin: null,
    organization: null,
    areas: [],
    bio: null,
    photoUrl: null,
    availability: [],
    lastLoginAt: null,
    failedLogins: 0,
    failedLoginWindowStart: null,
    lockedUntil: null,
    passwordChangedAt: now,
    passwordResetCount: 0,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...extra,
  });

  const admins = ADMINS.map((n) => user(n, ['super_admin']));
  const mentors = MENTORS.map(([name, organization, areas, slots]) =>
    user(name, ['mentor'], {
      organization,
      areas: areas.filter((a) => areaKeys.includes(a)),
      availability: slots.map((i) => event.slots[i]?.id).filter((s): s is string => !!s),
      linkedin: `https://www.linkedin.com/in/${slugify(name)}`,
      bio: `${areas.map((a) => event.areas.find((x) => x.key === a)?.label ?? a).join(' e ')} na ${organization}.`,
      createdBy: admins[0]!._id,
    }),
  );

  const mentees: MenteeDoc[] = MENTEE_NAMES.map((name, i) => {
    const _id = new ObjectId();
    const area = areaKeys[i % areaKeys.length]!;
    const queuedAt = minutesAgo(600 - i * 12);
    const scores = Object.fromEntries(areaKeys.map((k, j) => [k, k === area ? 8 + (i % 3) : (i * 7 + j * 3) % 7]));
    return {
      _id,
      eventId: event._id,
      name,
      email: emailFor(template, name),
      emailNorm: emailFor(template, name),
      phone: `+55819${String(90000000 + i * 104729).slice(0, 8)}`,
      linkedin: i % 3 === 0 ? `https://www.linkedin.com/in/${slugify(name)}` : null,
      area,
      quizScores: scores,
      preferredPeriod: PERIODS[i % PERIODS.length]!,
      note: NOTES[i % NOTES.length] ?? null,
      consent: { version: event.consentVersion, acceptedAt: queuedAt },
      status: 'waiting',
      priority: false,
      priorityReason: null,
      queuedAt,
      currentAppointmentId: null,
      lastOutcome: null,
      tokenHash: sha256Hex(menteeToken(menteeTokenSecret, _id, 1)),
      tokenVersion: 1,
      linkSendCount: 1,
      anonymizedAt: null,
      version: 1,
      createdAt: queuedAt,
      updatedAt: queuedAt,
    };
  });

  // Prioridade (RN da fila): uma recusou o horário, outra teve a mentoria cancelada pela equipe.
  Object.assign(mentees[30]!, { priority: true, priorityReason: 'declined_schedule', lastOutcome: 'declined_schedule' });
  Object.assign(mentees[31]!, { priority: true, priorityReason: 'cancelled_by_staff', lastOutcome: 'cancelled_by_staff' });

  // Agendamentos: 9 confirmadas e 3 convites pendentes, sem colisão de mesa, mentora ou participante.
  const tables = await c.tables.find({ eventId: event._id, active: true }).sort({ number: 1 }).toArray();
  if (!tables.length) throw new Error(`evento "${event._id}" sem mesas: rode antes npm run db:seed`);
  const usedTable = new Set<string>();
  const usedMentor = new Set<string>();
  const appointments: AppointmentDoc[] = [];
  const plan: { mentee: number; status: 'confirmed' | 'invited' }[] = [
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((m) => ({ mentee: m, status: 'confirmed' as const })),
    ...[9, 10, 11].map((m) => ({ mentee: m, status: 'invited' as const })),
  ];
  for (const [k, p] of plan.entries()) {
    const mentee = mentees[p.mentee]!;
    let picked: { mentor: UserDoc; slotId: string } | undefined;
    for (let off = 0; off < mentors.length && !picked; off++) {
      const mentor = mentors[(k + off) % mentors.length]!;
      const slotId = mentor.availability.find((s) => !usedMentor.has(`${mentor._id}:${s}`));
      if (slotId) picked = { mentor, slotId };
    }
    if (!picked) continue;
    const slot = event.slots.find((s) => s.id === picked.slotId)!;
    const table = tables.find((t) => !usedTable.has(`${t._id}:${slot.id}`))!;
    usedTable.add(`${table._id}:${slot.id}`);
    usedMentor.add(`${picked.mentor._id}:${slot.id}`);
    const createdAt = p.status === 'invited' ? minutesAgo(2 + k % 5) : minutesAgo(240 - k * 10);
    const by = { userId: picked.mentor._id, role: 'mentor' as const };
    const history: AppointmentDoc['history'] = [{ from: null, to: 'invited', by, at: createdAt, reason: null }];
    const confirmedAt = new Date(createdAt.getTime() + 4 * 60_000);
    if (p.status === 'confirmed') history.push({ from: 'invited', to: 'confirmed', by: { userId: null, role: 'mentee' }, at: confirmedAt, reason: null });
    const appt: AppointmentDoc = {
      _id: new ObjectId(),
      eventId: event._id,
      menteeId: mentee._id,
      mentorId: picked.mentor._id,
      tableId: table._id,
      slotId: slot.id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      status: p.status,
      slotLock: true,
      menteeLock: true,
      expiresAt: p.status === 'invited' ? new Date(createdAt.getTime() + event.responseWindowMinutes * 60_000) : null,
      respondedAt: p.status === 'confirmed' ? confirmedAt : null,
      declineReason: null,
      createdBy: by,
      confirmedBy: p.status === 'confirmed' ? { userId: null, role: 'mentee' } : null,
      movedFromId: null,
      history,
      createdAt,
      updatedAt: p.status === 'confirmed' ? confirmedAt : createdAt,
    };
    appointments.push(appt);
    Object.assign(mentee, { status: p.status, currentAppointmentId: appt._id, version: 2, updatedAt: appt.updatedAt });
  }

  await c.users.insertMany([...admins, ...mentors]);
  await c.mentees.insertMany(mentees);
  if (appointments.length) await c.appointments.insertMany(appointments);

  const sample = (status: string, filter: (m: MenteeDoc) => boolean) => {
    const m = mentees.find(filter);
    return m ? [{ name: m.name, status, path: `/mentoria/minha?t=${menteeToken(menteeTokenSecret, m._id, m.tokenVersion)}` }] : [];
  };
  return {
    admins: admins.map((u) => u.email),
    mentors: mentors.map((u) => u.email),
    mentees: mentees.length,
    appointments: appointments.length,
    links: [
      ...sample('aguardando', (m) => m.status === 'waiting' && !m.priority),
      ...sample('aguardando com prioridade', (m) => m.priority),
      ...sample('convite pendente', (m) => m.status === 'invited'),
      ...sample('confirmada', (m) => m.status === 'confirmed'),
    ],
  };
}
