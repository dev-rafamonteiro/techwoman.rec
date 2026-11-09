import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { E39Patch } from '@tw/shared';
import { mapDuplicateKeyError } from '@tw/db';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { AppError, notFound } from '../lib/errors.js';
import { actorForRoute } from '../lib/audit.js';
import { route } from '../lib/route.js';
import { adminAppointmentViews } from '../services/admin-views.js';
import { applyTransition } from '../services/transitions.js';
import { moveAppointment } from '../services/move.js';

export function registerAdminAppointmentRoutes(app: FastifyInstance, ctx: AppContext): void {
  // E39 · PATCH /admin/appointments/:id · mover, cancelar, no-show, confirmar presencialmente
  // (POST /admin/appointments, a criação, fica em routes/invite.ts junto com E24)
  route(app, ctx, E39Patch, async ({ req, user, params, body, idem }) => {
    if ((body.action === 'reopen' || body.action === 'release') && !user.roles.includes('super_admin')) {
      throw new AppError('FORBIDDEN', 'Só super admin corrige uma mentoria concluída.');
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
      } else {
        const action = body.action === 'cancel' ? 'staff_cancel' : body.action;
        const res = await applyTransition(ctx, session, { appointmentId: id, action, actor, reason: body.action === 'cancel' ? (body.reason ?? null) : null, ip: req.ip }).catch((err: unknown) => {
          // reopen devolve a trava da participante: outra mentoria ativa dela bate no índice único
          if (mapDuplicateKeyError(err) === 'MENTEE_TAKEN') throw new AppError('MENTEE_TAKEN', 'Esta participante já tem outra mentoria ativa.');
          throw err;
        });
        if (!res) throw notFound('Mentoria');
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
