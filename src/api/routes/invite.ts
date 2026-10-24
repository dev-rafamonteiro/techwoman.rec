import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { E24, E39Create } from '@tw/shared';
import { loadEvent, runTxn, type AppContext } from '../ctx.js';
import { AppError, notFound } from '../lib/errors.js';
import { actorForRoute } from '../lib/audit.js';
import { respond, route } from '../lib/route.js';
import { toMentorAppointmentView } from '../lib/views.js';
import { adminAppointmentViews } from '../services/admin-views.js';
import { createInvite } from '../services/invite.js';

const oid = (s: string) => {
  if (!ObjectId.isValid(s)) throw new AppError('VALIDATION_ERROR', 'Identificador inválido.');
  return new ObjectId(s);
};

/** E24 (POST /mentor/appointments) e E39 criar (POST /admin/appointments). */
export function registerInviteRoutes(app: FastifyInstance, ctx: AppContext): void {
  route(app, ctx, E24, async ({ req, user, body, idem }) => {
    const out = await runTxn(ctx, async (session) => {
      const { appointment, mentee, table } = await createInvite(ctx, session, {
        menteeId: oid(body.menteeId),
        mentorId: user._id,
        slotId: body.slotId,
        tableId: oid(body.tableId),
        actor: actorForRoute(req, 'mentor'),
        createdByRole: 'mentor',
        ip: req.ip,
      });
      const resBody = { appointment: toMentorAppointmentView(appointment, mentee, table) };
      // a resposta fica salva na mesma transação do convite (sem janela entre commit e gravação)
      await idem?.markDone(session, { status: 201, body: resBody });
      return resBody;
    });
    return respond(201, out);
  });

  route(app, ctx, E39Create, async ({ req, user, body }) => {
    const event = await loadEvent(ctx);
    const role = user.roles.includes('super_admin') ? 'super_admin' : 'admin';
    const { appointment, warnings } = await runTxn(ctx, (session) =>
      createInvite(ctx, session, {
        menteeId: oid(body.menteeId),
        mentorId: oid(body.mentorId),
        slotId: body.slotId,
        tableId: oid(body.tableId),
        actor: actorForRoute(req, 'admin'),
        createdByRole: role,
        override: { ignoreAvailability: body.ignoreAvailability, ignoreLeadTime: body.ignoreLeadTime },
        ip: req.ip,
      }),
    );
    const a = await ctx.c.appointments.findOne({ _id: appointment._id });
    const [view] = a ? await adminAppointmentViews(ctx, event, [a]) : [];
    if (!view) throw notFound('Mentoria');
    return respond(201, { appointment: view, warnings });
  });
}
