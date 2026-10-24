import type { ChangeStream, ChangeStreamDocument, Document } from 'mongodb';

import type { AdminStreamEvent, MentorStreamEvent } from '@tw/shared';
import type { AppointmentDoc, MenteeDoc } from '@tw/db';
import type { AppContext } from '../ctx.js';
import { toAdminAppointmentView, toMenteeAdminView, toMenteeStaffView, toMentorAppointmentView } from './views.js';

export interface StreamClient {
  kind: 'mentor' | 'admin';
  userId: string;
  /** Envia um evento SSE já serializado pelo cliente. */
  send(type: string, data: unknown, id?: string): void;
}

type ClientEvent = { type: string; data: unknown };

const encodeToken = (t: unknown) => Buffer.from(JSON.stringify(t)).toString('base64url');
export const decodeToken = (s: string): Document | null => {
  try {
    return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Document;
  } catch {
    return null;
  }
};

/**
 * Tempo real (E27, E38): cada réplica abre Change Streams em `appointments` e `mentees` (filtrados por eventId, com
 * fullDocument updateLookup) e repassa por SSE só o que cada conexão pode ver (mentora: sem contato).
 * Se o stream cair, reconecta com backoff e avisa os clientes (`resync`); o front faz polling enquanto isso.
 */
export class StreamHub {
  private readonly clients = new Set<StreamClient>();
  private streams: ChangeStream[] = [];
  private stopped = false;
  private retry = 0;
  private lastTokens: Record<string, unknown> = {};

  constructor(private readonly ctx: AppContext) {}

  get size(): number {
    return this.clients.size;
  }

  subscribe(client: StreamClient): () => void {
    this.clients.add(client);
    return () => this.clients.delete(client);
  }

  start(): void {
    this.stopped = false;
    this.open('appointments');
    this.open('mentees');
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await Promise.all(this.streams.map((s) => s.close().catch(() => undefined)));
    this.streams = [];
  }

  private pipeline() {
    return [{ $match: { operationType: { $in: ['insert', 'update', 'replace'] }, 'fullDocument.eventId': this.ctx.config.eventId } }];
  }

  private open(which: 'appointments' | 'mentees', startAfter?: Document): void {
    const coll = which === 'appointments' ? this.ctx.c.appointments : this.ctx.c.mentees;
    let cs: ChangeStream;
    try {
      cs = coll.watch(this.pipeline(), { fullDocument: 'updateLookup', ...(startAfter ? { startAfter } : {}) }) as unknown as ChangeStream;
    } catch (err) {
      this.ctx.log.warn({ err }, 'change stream indisponível');
      return;
    }
    this.streams.push(cs);
    cs.on('change', (change) => {
      this.retry = 0;
      this.lastTokens[which] = change._id;
      void this.dispatch(which, change as ChangeStreamDocument<Document>, this.clients).catch((err) => this.ctx.log.warn({ err }, 'falha ao despachar evento SSE'));
    });
    cs.on('error', (err) => {
      this.ctx.log.warn({ err: (err as Error).message }, 'change stream caiu');
      this.streams = this.streams.filter((s) => s !== cs);
      void cs.close().catch(() => undefined);
      if (this.stopped) return;
      for (const c of this.clients) c.send('resync', {});
      const delay = Math.min(30_000, 500 * 2 ** this.retry++);
      setTimeout(() => !this.stopped && this.open(which, this.lastTokens[which] as Document | undefined), delay).unref();
    });
  }

  /** Reenvia ao cliente o que perdeu (Last-Event-ID = resume token). Eventos são idempotentes no front. */
  async replay(token: Document, client: StreamClient): Promise<void> {
    for (const which of ['appointments', 'mentees'] as const) {
      const coll = which === 'appointments' ? this.ctx.c.appointments : this.ctx.c.mentees;
      let cs: ChangeStream | null = null;
      try {
        cs = coll.watch(this.pipeline(), { fullDocument: 'updateLookup', startAfter: token, maxAwaitTimeMS: 300 }) as unknown as ChangeStream;
        for (let i = 0; i < 500; i++) {
          const change = await cs.tryNext();
          if (!change) break;
          await this.dispatch(which, change as ChangeStreamDocument<Document>, [client]);
        }
      } catch {
        client.send('resync', {});
        return;
      } finally {
        await cs?.close().catch(() => undefined);
      }
    }
  }

  private async dispatch(which: 'appointments' | 'mentees', change: ChangeStreamDocument<Document>, targets: Iterable<StreamClient>): Promise<void> {
    const list = [...targets];
    if (list.length === 0) return;
    const id = encodeToken(change._id);
    const doc = (change as { fullDocument?: Document }).fullDocument;
    if (!doc) return;
    const updated = (change as { updateDescription?: { updatedFields?: Record<string, unknown> } }).updateDescription?.updatedFields ?? {};
    const keys = Object.keys(updated);
    const touched = (...fields: string[]) => change.operationType !== 'update' || fields.some((f) => keys.some((k) => k === f || k.startsWith(`${f}.`)));

    if (which === 'appointments') {
      const appt = doc as AppointmentDoc;
      const [mentee, table, mentor, event] = await Promise.all([
        this.ctx.c.mentees.findOne({ _id: appt.menteeId }),
        this.ctx.c.tables.findOne({ _id: appt.tableId }),
        this.ctx.c.users.findOne({ _id: appt.mentorId }),
        this.ctx.c.events.findOne({ _id: this.ctx.config.eventId }),
      ]);
      if (!mentee || !table || !mentor || !event) return;
      const forMentor: MentorStreamEvent = { type: 'appointment.updated', data: { appointment: toMentorAppointmentView(appt, mentee, table) } };
      const forAdmin: AdminStreamEvent = { type: 'appointment.updated', data: { appointment: toAdminAppointmentView(appt, mentee, mentor, table, event) } };
      for (const c of list) {
        if (c.kind === 'admin') c.send(forAdmin.type, forAdmin.data, id);
        else if (c.userId === appt.mentorId.toHexString()) c.send(forMentor.type, forMentor.data, id);
      }
      return;
    }

    const mentee = doc as MenteeDoc;
    let adminView: ReturnType<typeof toMenteeAdminView> | null = null;
    const getAdminView = async () => (adminView ??= toMenteeAdminView(mentee));
    const events: { mentor?: ClientEvent; admin?: ClientEvent[] } = {};

    if (mentee.status === 'waiting' && touched('status', 'priority', 'priorityReason', 'queuedAt', 'area', 'preferredPeriod', 'note', 'name', 'linkedin')) {
      events.mentor = { type: 'queue.added', data: { mentee: toMenteeStaffView(mentee) } };
      events.admin = [{ type: 'queue.added', data: { mentee: await getAdminView() } }];
    } else if (mentee.status !== 'waiting' && change.operationType === 'update' && touched('status')) {
      let byMentorId: string | null = null;
      let byMentorName: string | null = null;
      if (mentee.status === 'invited' && mentee.currentAppointmentId) {
        const a = await this.ctx.c.appointments.findOne({ _id: mentee.currentAppointmentId }, { projection: { mentorId: 1 } });
        const m = a ? await this.ctx.c.users.findOne({ _id: a.mentorId }, { projection: { name: 1 } }) : null;
        byMentorId = a?.mentorId.toHexString() ?? null;
        byMentorName = m?.name ?? null;
      }
      const reason = mentee.status === 'invited' ? 'invited' : mentee.status === 'cancelled' ? 'cancelled' : 'no_longer_waiting';
      for (const c of list) {
        if (c.kind === 'mentor') {
          c.send('queue.removed', { menteeId: String(mentee._id), menteeName: mentee.name, reason, byMentorName: byMentorId && byMentorId !== c.userId ? byMentorName : null, byMe: byMentorId === c.userId }, id);
        } else {
          c.send('queue.removed', { menteeId: String(mentee._id) }, id);
        }
      }
    }
    if (events.mentor || events.admin) {
      for (const c of list) {
        if (c.kind === 'mentor' && events.mentor) c.send(events.mentor.type, events.mentor.data, id);
        if (c.kind === 'admin') for (const e of events.admin ?? []) c.send(e.type, e.data, id);
      }
    }
    const view = await getAdminView();
    for (const c of list) if (c.kind === 'admin') c.send('mentee.updated', { mentee: view }, id);
  }
}

