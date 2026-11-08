import type { ClientSession, ObjectId } from 'mongodb';
import type { SlotCapacityInfo } from '@tw/shared';
import type { EventDoc } from '@tw/db';
import type { AppContext } from '../ctx.js';
import { isDuplicateKey } from '../lib/errors.js';
import { iso } from '../lib/views.js';
import type { SlotCapacity } from '../domain/index.js';

/**
 * RN22 · Limite de mentoras por horário = mesas ativas do evento. Contagem = mentoras (papel mentor, status active)
 * com o horário na disponibilidade. Com `session`, lê no snapshot da transação.
 */
export async function slotCapacity(
  ctx: AppContext,
  eventId: string,
  opts: { session?: ClientSession; excludeUserId?: ObjectId; slotIds?: readonly string[] } = {},
): Promise<{ capacity: number; counts: Map<string, number> }> {
  const s = opts.session ? { session: opts.session } : {};
  const match: Record<string, unknown> = { roles: 'mentor', status: 'active' };
  if (opts.excludeUserId) match['_id'] = { $ne: opts.excludeUserId };
  if (opts.slotIds) match['availability'] = { $in: [...opts.slotIds] };
  const [capacity, rows] = await Promise.all([
    ctx.c.tables.countDocuments({ eventId, active: true }, s),
    ctx.c.users
      .aggregate<{ _id: string; n: number }>(
        [
          { $match: match },
          { $project: { availability: 1 } },
          { $unwind: '$availability' },
          ...(opts.slotIds ? [{ $match: { availability: { $in: [...opts.slotIds] } } }] : []),
          { $group: { _id: '$availability', n: { $sum: 1 } } },
        ],
        s,
      )
      .toArray(),
  ]);
  return { capacity, counts: new Map(rows.map((r) => [r._id, r.n])) };
}

const counterId = (eventId: string, slotId: string) => `${eventId}:${slotId}`;

/**
 * RN22 · Garante os documentos de trava (`slot_counters`) dos horários, FORA da transação: dois upserts concorrentes
 * do mesmo `_id` dentro de transações dariam E11000 (não é erro transitório). Idempotente.
 */
export async function ensureSlotCounters(ctx: AppContext, eventId: string, slotIds: readonly string[]): Promise<void> {
  if (slotIds.length === 0) return;
  const now = ctx.now();
  try {
    await ctx.c.slotCounters.bulkWrite(
      slotIds.map((slotId) => ({
        updateOne: {
          filter: { _id: counterId(eventId, slotId) },
          update: { $setOnInsert: { eventId, slotId, n: 0, updatedAt: now } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  } catch (err) {
    // corrida entre dois upserts do mesmo horário: o documento existe, que é o que importa
    if (!isDuplicateKey(err)) throw err;
  }
}

/**
 * RN22 · Escreve na trava de cada horário dentro da transação, ANTES de contar as mentoras. Duas transações que
 * adicionam o mesmo horário escrevem no mesmo documento: a segunda recebe WriteConflict (TransientTransactionError),
 * `withTransaction` repete e a recontagem já enxerga a gravação da primeira. Sem isso a contagem (só leitura) não
 * protege contra write skew.
 */
export async function touchSlotCounters(ctx: AppContext, session: ClientSession, eventId: string, slotIds: readonly string[]): Promise<void> {
  if (slotIds.length === 0) return;
  await ctx.c.slotCounters.updateMany(
    { _id: { $in: slotIds.map((s) => counterId(eventId, s)) } },
    { $inc: { n: 1 }, $set: { updatedAt: ctx.now() } },
    { session },
  );
}

/** RN22 · Lotação no formato da API (ISO do início do horário). */
export function toSlotCapacityInfo(event: EventDoc, list: readonly SlotCapacity[]): SlotCapacityInfo[] {
  const start = new Map(event.slots.map((s) => [s.id, s.startAt]));
  return list.flatMap((s) => {
    const at = start.get(s.slotId);
    return at ? [{ slotId: s.slotId, startAt: iso(at), mentorsAvailable: s.mentorsAvailable, capacity: s.capacity }] : [];
  });
}
