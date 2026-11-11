// Carga de superlotação: mentoradas fictícias ocupando toda mesa em todo horário + fila de espera.
// Não altera mentoras (só cria agendamentos com elas) nem inscrições reais; não grava na outbox (nenhum e-mail sai).
// Etiqueta: e-mail delivered+tw-carga-NNN@resend.dev. MODE=limpar apaga tudo que tem a etiqueta.
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';

const MODE = process.env.MODE ?? 'carregar';
const WAITING = 50;
const TAG = /^delivered\+tw-carga-\d+@resend\.dev$/;
const email = (n) => `delivered+tw-carga-${String(n).padStart(3, '0')}@resend.dev`;

const cli = new MongoClient(readFileSync(process.env.MONGODB_URI_FILE, 'utf8').trim());
await cli.connect();
const db = cli.db(process.env.MONGODB_DB);
const ev = await db.collection('events').findOne({ _id: process.env.EVENT_ID });
const M = db.collection('mentees');
const A = db.collection('appointments');

const fake = (await M.find({ eventId: ev._id, emailNorm: TAG }, { projection: { _id: 1 } }).toArray()).map((m) => m._id);
if (MODE === 'limpar') {
  const a = await A.deleteMany({ eventId: ev._id, menteeId: { $in: fake } });
  const m = await M.deleteMany({ _id: { $in: fake } });
  console.log(`limpo: ${m.deletedCount} mentoradas e ${a.deletedCount} agendamentos de carga`);
  await cli.close();
  process.exit(0);
}
if (fake.length) throw new Error(`já existe carga (${fake.length} mentoradas): rode MODE=limpar antes`);

const FIRST = ['Ana', 'Beatriz', 'Carla', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Juliana', 'Larissa', 'Mariana', 'Natália', 'Olívia', 'Patrícia', 'Rafaela', 'Sofia', 'Tatiane', 'Vanessa', 'Yasmin'];
const LAST = ['Silva', 'Souza', 'Oliveira', 'Lima', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho', 'Araújo', 'Ribeiro', 'Gomes', 'Barbosa'];
const now = new Date();
const areaKeys = ev.areas.map((a) => a.key);
const PERIOD = (startAt) => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: ev.timezone }).format(startAt));
  return h < 12 ? 'morning' : h < 15 ? 'early_afternoon' : 'late_afternoon';
};
let n = 0;
const mentee = (area, extra) => {
  n++;
  const _id = new ObjectId();
  const at = new Date(now.getTime() - (400 - n) * 60_000);
  return {
    _id, eventId: ev._id,
    name: `Teste Lotação ${FIRST[n % FIRST.length]} ${LAST[(n * 7) % LAST.length]} ${String(n).padStart(3, '0')}`,
    email: email(n), emailNorm: email(n),
    phone: `+5581990${String(n).padStart(6, '0')}`,
    linkedin: null, area,
    quizScores: Object.fromEntries(areaKeys.map((k, j) => [k, k === area ? 9 : (n + j) % 6])),
    preferredPeriod: 'any', note: null,
    consent: { version: ev.consentVersion, acceptedAt: at },
    status: 'waiting', priority: false, priorityReason: null, queuedAt: at,
    currentAppointmentId: null, lastOutcome: null,
    tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'), tokenVersion: 1, linkSendCount: 0,
    anonymizedAt: null, version: 1, createdAt: at, updatedAt: at,
    ...extra,
  };
};

const tables = await db.collection('tables').find({ eventId: ev._id, active: true }).sort({ number: 1 }).toArray();
const mentors = await db.collection('users').find({ roles: 'mentor', status: 'active' }, { projection: { _id: 1, areas: 1, availability: 1 } }).toArray();
const locked = await A.find({ eventId: ev._id, slotLock: true }, { projection: { tableId: 1, mentorId: 1, slotId: 1 } }).toArray();
const usedTable = new Set(locked.map((a) => `${a.tableId}:${a.slotId}`));
const usedMentor = new Set(locked.map((a) => `${a.mentorId}:${a.slotId}`));

const mentees = [];
const appts = [];
let outside = 0;
for (const [si, slot] of ev.slots.entries()) {
  // primeiro quem marcou o horário; faltando, outras mentoras ativas (só o agendamento, a mentora não muda)
  const avail = mentors.filter((m) => (m.availability ?? []).includes(slot.id));
  const rest = mentors.filter((m) => !(m.availability ?? []).includes(slot.id));
  const pool = [...avail, ...rest].filter((m) => !usedMentor.has(`${m._id}:${slot.id}`));
  for (const table of tables) {
    if (usedTable.has(`${table._id}:${slot.id}`)) continue;
    const mentor = pool.shift();
    if (!mentor) break;
    if (!(mentor.availability ?? []).includes(slot.id)) outside++;
    usedMentor.add(`${mentor._id}:${slot.id}`);
    usedTable.add(`${table._id}:${slot.id}`);
    const createdAt = new Date(now.getTime() - (300 - si * 20) * 60_000);
    const by = { userId: null, role: 'mentee' };
    const apptId = new ObjectId();
    const area = mentor.areas?.[0] ?? areaKeys[0];
    const m = mentee(area, { status: 'confirmed', currentAppointmentId: apptId, version: 2, preferredPeriod: PERIOD(slot.startAt), updatedAt: createdAt });
    mentees.push(m);
    appts.push({
      _id: apptId, eventId: ev._id, menteeId: m._id, mentorId: mentor._id, tableId: table._id, slotId: slot.id,
      startAt: slot.startAt, endAt: slot.endAt, status: 'confirmed', slotLock: true, menteeLock: true,
      expiresAt: null, respondedAt: createdAt, declineReason: null, createdBy: { userId: mentor._id, role: 'mentor' }, confirmedBy: by, movedFromId: null,
      history: [{ from: null, to: 'confirmed', by, at: createdAt, reason: null }],
      createdAt, updatedAt: createdAt,
    });
  }
}
for (let i = 0; i < WAITING; i++) mentees.push(mentee(areaKeys[i % areaKeys.length]));

await M.insertMany(mentees);
const r = await A.insertMany(appts, { ordered: false }).catch((e) => ({ insertedCount: e.result?.insertedCount ?? 0, err: e.message }));
console.log(`carga: ${mentees.length} mentoradas (${appts.length} com mesa, ${WAITING} na fila), ${r.insertedCount} agendamentos gravados; ${outside} fora da disponibilidade marcada pela mentora`);
if (r.err) console.log('conflitos (vaga pega por inscrição real no meio):', r.err);
const total = await A.countDocuments({ eventId: ev._id, slotLock: true });
console.log(`ocupação: ${total}/${tables.length * ev.slots.length} lugares`);
await cli.close();
