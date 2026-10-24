import type { FastifyInstance } from "fastify";

export interface SseFrame {
  event: string;
  id?: string;
  data: any;
  raw: string;
}

export interface SseConn {
  frames: SseFrame[];
  waitFor(pred: (f: SseFrame) => boolean, timeoutMs?: number): Promise<SseFrame>;
  close(): void;
}

/** Abre um stream SSE de verdade (app.listen em porta efêmera) com o cookie da sessão. */
export async function openSse(app: FastifyInstance, path: string, cookie: string, headers: Record<string, string> = {}): Promise<SseConn & { status: number }> {
  if (!app.server.listening) await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const ac = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { cookie, accept: "text/event-stream", ...headers }, signal: ac.signal });
  const frames: SseFrame[] = [];
  const waiters: (() => void)[] = [];
  (async () => {
    const dec = new TextDecoder();
    let buf = "";
    try {
      for await (const chunk of res.body as any) {
        buf += dec.decode(chunk, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const raw = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (!raw.trim() || raw.startsWith(":")) continue;
          const f: SseFrame = { event: "message", data: null, raw };
          for (const line of raw.split("\n")) {
            if (line.startsWith("event:")) f.event = line.slice(6).trim();
            else if (line.startsWith("id:")) f.id = line.slice(3).trim();
            else if (line.startsWith("data:")) {
              const d = line.slice(5).trim();
              try { f.data = JSON.parse(d); } catch { f.data = d; }
            }
          }
          frames.push(f);
          waiters.splice(0).forEach((w) => w());
        }
      }
    } catch { /* abortado */ }
  })();
  return {
    status: res.status,
    frames,
    close: () => ac.abort(),
    async waitFor(pred, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const hit = frames.find(pred);
        if (hit) return hit;
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`SSE: timeout; frames=${JSON.stringify(frames.map((f) => f.event))}`);
        await new Promise<void>((r) => { waiters.push(r); setTimeout(r, Math.min(left, 200)); });
      }
    },
  };
}
