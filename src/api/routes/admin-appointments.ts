import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { E39Patch } from '@tw/shared';
import { mapDuplicateKeyError } from '@tw/db';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { AppError, notFound } from '../lib/errors.js';
import { actorForRoute, writeAudit } from '../lib/audit.js';
import { route } from '../lib/route.js';
import { adminAppointmentViews } from '../services/admin-views.js';
import { applyTransition } from '../services/transitions.js';
import { moveAppointment } from '../services/move.js';

export function registerAdminAppointmentRoutes(app: FastifyInstance, ctx: AppContext): void {
  // E39 · PATCH /admin/appointments/:id · mover, cancelar, no-show, confirmar presencialmente
  // (POST /admin/appointments, a criação, fica em routes/invite.ts junto com E24)
  route(app, ctx, E39Patch, async ({ req, user, params, body, idem }) => {
    if ((body.action === 'reopen' || body.action === 'release') && !user.roles.includes('super_admin')) {
      throw new AppError('FORBIDDEN', 'Só super admin pode fazer esta correção.');
    }
    if (!ObjectId.isValid(params.id)) throw new AppError('VALIDATION_ERROR', 'Identificador inválido.');
    const id = new ObjectId(params.id);
    const event = await loadEvent(ctx);
    const actor = actorForRoute(req, 'admin');
    const { apptId, warnings } = await runTxn(ctx, async (session) => {
      let apptId = id;
      let warnings: ('OUTSIDE_MENTOR_AVAILABILITY' | 'LEAD_TIME_SHORT')[] = [];
      if (body.action === 'move') {
        const moved = await moveAppointment(ctx, session, { appointmentId: id, slotId: body.slotId, tableId: new ObjectId(body.tableId), ignoreAvailability: body.ignoreAvailability, ignoreLeadTime: body.ignoreLeadTime, actor, ip: req.ip });
        apptId = moved.appointment._id;
        warnings = moved.warnings;
      } else if (body.action === 'change_mentor') {
        if (!ObjectId.isValid(body.mentorId)) throw new AppError('VALIDATION_ERROR', 'Mentora inválida.');
        const old = await ctx.c.appointments.findOne({ _id: id }, { session });
        if (!old) throw notFound('Mentoria');
        const moved = await moveAppointment(ctx, session, {
          appointmentId: id, slotId: old.slotId, tableId: old.tableId, mentorId: new ObjectId(body.mentorId),
          reason: body.mentorNoShow ? 'mentor_no_show' : 'mentor_changed',
          ignoreAvailability: body.ignoreAvailability, ignoreLeadTime: true, actor, ip: req.ip,
        }).catch((err: unknown) => {
          if (mapDuplicateKeyError(err) === 'MENTOR_BUSY') throw new AppError('MENTOR_BUSY', 'Essa mentora já tem mentoria nesse horário.');
          throw err;
        });
        apptId = moved.appointment._id;
        warnings = moved.warnings.filter((w) => w !== 'LEAD_TIME_SHORT');
        // a falta da mentora original fica nos logs (A9), ligada a ela
        if (body.mentorNoShow) {
          await writeAudit(ctx, session, { actor, action: 'mentor.no_show', entity: 'user', entityId: old.mentorId, after: { appointmentId: String(apptId), slotId: old.slotId, tableId: String(old.tableId) }, ip: req.ip });
        }
      } else {
        const action = body.action === 'cancel' ? 'staff_cancel' : body.action;
        const mentorNoShow = body.action === 'cancel' && body.mentorNoShow;
        const reason = body.action === 'cancel' ? (mentorNoShow ? 'mentor_no_show' : (body.reason ?? null)) : null;
        const res = await applyTransition(ctx, session, { appointmentId: id, action, actor, reason, ip: req.ip }).catch((err: unknown) => {
          // reopen devolve a trava da participante: outra mentoria ativa dela bate no índice único
          if (mapDuplicateKeyError(err) === 'MENTEE_TAKEN') throw new AppError('MENTEE_TAKEN', 'Esta participante já tem outra mentoria ativa.');
          throw err;
        });
        if (!res) throw notFound('Mentoria');
        // mentora não apareceu e não há outra livre: a participante volta à fila e a falta fica nos logs (A9), ligada a ela
        if (mentorNoShow) {
          await writeAudit(ctx, session, { actor, action: 'mentor.no_show', entity: 'user', entityId: res.appointment.mentorId, after: { appointmentId: String(id), slotId: res.appointment.slotId, tableId: String(res.appointment.tableId) }, ip: req.ip });
        }
      }
      return { apptId, warnings };
    });
    const a = await ctx.c.appointments.findOne({ _id: apptId });
    if (!a) throw notFound('Mentoria');
    const [view] = await adminAppointmentViews(ctx, event, [a]);
    if (!view) throw notFound('Mentoria');
    const out = { appointment: view, warnings };
    void idem;
    return out;
  });
}
