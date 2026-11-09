import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { Binary, type ObjectId } from 'mongodb';
import { API_PREFIX, buildPath, E57, MENTOR_PHOTO_MAX_BYTES, type MentorPhotoResponse } from '@tw/shared';
import type { AppContext } from '../ctx.js';
import { actorForRoute, writeAudit } from './audit.js';
import { AppError } from './errors.js';

const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** Sem o `?v=`. URL completa como as de /mentoras/*: E28, E31 e E32 validam o photoUrl como URL. */
const photoAddress = (ctx: AppContext, mentorId: ObjectId) => ctx.config.publicBaseUrl + API_PREFIX + buildPath(E57.path, { id: mentorId.toHexString() });

/** E55/E56: guarda o JPEG do campo `file` e aponta o photoUrl da mentora para E57. */
export async function saveMentorPhoto(ctx: AppContext, req: FastifyRequest, mentorId: ObjectId, area: 'mentor' | 'admin'): Promise<MentorPhotoResponse> {
  const file = await req.file({ limits: { fileSize: MENTOR_PHOTO_MAX_BYTES, files: 1 } });
  if (!file) throw new AppError('VALIDATION_ERROR', 'Envie a imagem no campo "file".');
  const buf = await file.toBuffer();
  if (file.file.truncated) throw new AppError('PAYLOAD_TOO_LARGE', 'A imagem passa do tamanho permitido.');
  if (!isJpeg(buf)) throw new AppError('VALIDATION_ERROR', 'Envie uma imagem em JPEG.');
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  const now = ctx.now();
  await ctx.c.mentorPhotos.replaceOne({ _id: mentorId }, { data: new Binary(buf), contentType: 'image/jpeg', hash, updatedAt: now }, { upsert: true });
  const photoUrl = `${photoAddress(ctx, mentorId)}?v=${hash}`;
  await ctx.c.users.updateOne({ _id: mentorId }, { $set: { photoUrl, updatedAt: now } });
  await writeAudit(ctx, undefined, { actor: actorForRoute(req, area), action: 'user.photo_upload', entity: 'user', entityId: mentorId, after: { size: buf.length }, ip: req.ip });
  return { photoUrl };
}

/** E28/E32: se o photoUrl deixou de apontar para a foto carregada, ela não fica guardada à toa (LGPD). */
export async function forgetReplacedPhoto(ctx: AppContext, mentorId: ObjectId, photoUrl: string | null): Promise<void> {
  if (photoUrl?.startsWith(`${photoAddress(ctx, mentorId)}?`)) return;
  await ctx.c.mentorPhotos.deleteOne({ _id: mentorId });
}
