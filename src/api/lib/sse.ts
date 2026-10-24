import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../ctx.js';
import { decodeToken, type StreamClient } from './stream-hub.js';

/**
 * Abre uma conexão SSE (E27, E38). Frames: `event: ready` ao conectar, `: ping` a cada 20 s,
 * `id:` = resume token do Change Stream. Last-Event-ID reenvia o que a conexão perdeu.
 */
export function openSse(ctx: AppContext, req: FastifyRequest, reply: FastifyReply, kind: 'mentor' | 'admin', userId: string): void {
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const write = (chunk: string) => {
    if (!raw.writableEnded && !raw.destroyed) raw.write(chunk);
  };
  const client: StreamClient = {
    kind,
    userId,
    send(type, data, id) {
      write(`${id ? `id: ${id}\n` : ''}event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    },
  };
  write('retry: 3000\n\n');
  const hub = ctx.hub;
  if (!hub) {
    client.send('degraded', { reason: 'no_change_stream' });
  } else {
    client.send('ready', { serverNow: ctx.now().toISOString() });
    const unsubscribe = hub.subscribe(client);
    const last = req.headers['last-event-id'];
    const token = typeof last === 'string' && last ? decodeToken(last) : null;
    if (token) void hub.replay(token, client);
    const ping = setInterval(() => write(': ping\n\n'), 20_000);
    const cleanup = () => {
      clearInterval(ping);
      unsubscribe();
    };
    raw.on('close', cleanup);
    req.raw.on('close', cleanup);
    return;
  }
  const ping = setInterval(() => write(': ping\n\n'), 20_000);
  raw.on('close', () => clearInterval(ping));
}
