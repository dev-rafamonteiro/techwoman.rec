import { ObjectId } from 'mongodb';
import type { PresenceCheckDoc, WhatsappInboundDoc } from '@tw/db';
import { runTxn, type AppContext } from '../ctx.js';
import { AppError, isDuplicateKey } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { enqueuePresenceReply } from '../lib/outbox.js';
import { applyTransition } from './transitions.js';
import {
  interpretPresenceText,
  parsePresenceRowId,
  wahaListReplyRowId,
  wahaMessageHash,
  wahaSenderPhone,
  WHATSAPP_INBOUND_TTL_DAYS,
  type PresenceAnswer,
  type WahaMessageLike,
} from '../domain/index.js';

type InboundResult = WhatsappInboundDoc['result'];

/**
 * Celular brasileiro com e sem o nono dígito (o WhatsApp de números antigos às vezes vem sem ele):
 * `5511996604159` <-> `551196604159`. Outros números: só o próprio.
 */
function phoneVariants(phone: string): string[] {
  if (/^55\d{2}9\d{8}$/.test(phone)) return [phone, phone.slice(0, 4) + phone.slice(5)];
  if (/^55\d{2}[6-9]\d{7}$/.test(phone)) return [phone, `${phone.slice(0, 4)}9${phone.slice(4)}`];
  return [phone];
}

/**
 * RN18 · Resposta à confirmação de presença recebida pelo WhatsApp (E47), já autenticada e filtrada (`message`,
 * nem `fromMe` nem grupo). Tudo numa transação: o registro em `whatsapp_inbound` é a primeira escrita, então o mesmo
 * evento reenviado pelo WAHA cai no índice de `_id` e é descartado; erro de banco desfaz tudo e o WAHA tenta de novo.
 */
export async function handlePresenceReply(ctx: AppContext, p: WahaMessageLike, ip: string | null): Promise<InboundResult | 'duplicate'> {
  const inboundId = wahaMessageHash(p.id);
  const phone = wahaSenderPhone(p).replace(/\D/g, '');
  const actor = { userId: null, role: 'mentee' as const };
  try {
    return await runTxn(ctx, async (session) => {
      const now = ctx.now();
      const { c } = ctx;
      await c.whatsappInbound.insertOne(
        { _id: inboundId, receivedAt: now, expireAt: new Date(now.getTime() + WHATSAPP_INBOUND_TTL_DAYS * 86_400_000), phone, result: 'ignored' },
        { session },
      );
      const finish = async (result: InboundResult) => {
        if (result !== 'ignored') await c.whatsappInbound.updateOne({ _id: inboundId }, { $set: { result } }, { session });
        return result;
      };
      if (!phone) return finish('ignored');

      // toque na lista: o rowId diz a mentoria; texto (ou opção que não é nossa): o pedido pendente mais recente
      const rowId = wahaListReplyRowId(p);
      const row = parsePresenceRowId(rowId);
      const phones = { $in: phoneVariants(phone) };
      let check: PresenceCheckDoc | null;
      let answer: PresenceAnswer | null;
      if (row) {
        // opção de uma lista já respondida ou de outra mentoria: ignora (não responde por outra)
        check = await c.presenceChecks.findOne({ _id: new ObjectId(row.appointmentId), phone: phones, status: 'pending' }, { session });
        answer = row.answer;
      } else {
        check = await c.presenceChecks.findOne({ phone: phones, status: 'pending' }, { session, sort: { sentAt: -1 } });
        answer = interpretPresenceText(p.body);
      }
      if (!check) return finish('ignored');

      const [appt, mentee] = await Promise.all([
        c.appointments.findOne({ _id: check._id }, { session }),
        c.mentees.findOne({ _id: check.menteeId }, { session }),
      ]);
      const answerDoc: PresenceCheckDoc['answer'] = { kind: rowId ? 'list' : 'text', text: p.body ?? null, interpretation: answer };
      const close = async () => {
        await c.presenceChecks.updateOne({ _id: check._id, status: 'pending' }, { $set: { status: 'closed', answeredAt: now, answer: answerDoc } }, { session });
        return finish('ignored');
      };
      // a mentoria já não está confirmada (cancelada, movida, começou...): fecha sem responder
      if (!appt || !mentee || appt.status !== 'confirmed') return close();

      if (answer === null) {
        await enqueuePresenceReply(ctx, session, { type: 'presence_unclear', mentee, appointmentId: appt._id, inboundId });
        return finish('unclear');
      }

      if (answer === 'confirm') {
        await c.presenceChecks.updateOne({ _id: check._id, status: 'pending' }, { $set: { status: 'confirmed', answeredAt: now, answer: answerDoc } }, { session });
        await enqueuePresenceReply(ctx, session, { type: 'presence_confirmed', mentee, appointmentId: appt._id, inboundId });
        await writeAudit(ctx, session, { actor, action: 'presence.confirm', entity: 'appointment', entityId: appt._id, after: { presence: 'confirmed', kind: answerDoc.kind }, ip });
        return finish('confirm');
      }

      // cancelar: RN19 (`mentee_reschedule`), só se ainda não começou; a auditoria vem de applyTransition
      if (appt.startAt.getTime() <= now.getTime()) return close();
      let res;
      try {
        res = await applyTransition(ctx, session, { appointmentId: appt._id, action: 'mentee_reschedule', actor, scope: { menteeId: mentee._id }, ip });
      } catch (err) {
        // corrida com outra mudança de status: trata como "já não está confirmada"
        if (err instanceof AppError && err.code === 'INVALID_STATE') return close();
        throw err;
      }
      if (!res) return close();
      // applyTransition fechou o pedido (`closed`); aqui ele vira `cancelled`
      await c.presenceChecks.updateOne({ _id: check._id }, { $set: { status: 'cancelled', answeredAt: now, answer: answerDoc } }, { session });
      await enqueuePresenceReply(ctx, session, { type: 'presence_cancelled', mentee: res.mentee, appointmentId: appt._id, inboundId });
      return finish('cancel');
    });
  } catch (err) {
    if (isDuplicateKey(err)) return 'duplicate';
    throw err;
  }
}
