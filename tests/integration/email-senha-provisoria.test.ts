import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";

/**
 * PLAN, "Testes dos e-mails", caixa 4: depois do envio do layout 6 (`staff_password`), a senha provisória
 * não aparece na `outbox`, nos logs nem em A9 (E44). Antes do envio ela fica cifrada (AES-256-GCM), nunca em texto puro.
 */
const api = await loadApi();

describe.skipIf(!api?.processOutbox || !api?.MemoryNotifier)("layout 6: senha provisória na outbox, nos logs e em A9", () => {
  let b: Booted;
  const written: string[] = [];
  const spies: { mockRestore(): void }[] = [];

  beforeAll(async () => {
    const capture = (chunk: unknown) => {
      written.push(typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : JSON.stringify(chunk));
      return true;
    };
    spies.push(vi.spyOn(process.stdout, "write").mockImplementation(capture as never));
    spies.push(vi.spyOn(process.stderr, "write").mockImplementation(capture as never));
    for (const m of ["log", "info", "warn", "error", "debug"] as const) spies.push(vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void written.push(a.map(String).join(" "))));
    b = await bootApi(api!, "senha", { mentors: 2, mentees: 1 });
  });
  afterAll(async () => {
    spies.forEach((s) => s.mockRestore());
    await b?.close();
  });

  const outbox = () => b.t.db.collection("outbox");
  const allOutbox = async () => JSON.stringify(await outbox().find({}).toArray());

  async function reset(mentorIdx: number): Promise<string> {
    const mentorId = String(b.w.mentors[mentorIdx]!._id);
    const r = await b.admin.post(`/api/admin/mentors/${mentorId}/reset-password`, { sendByEmail: true });
    expect(r.status).toBe(200);
    expect(typeof r.body.provisionalPassword).toBe("string");
    return r.body.provisionalPassword as string;
  }

  it("enquanto pendente: a senha não está em texto puro na outbox (cifrada)", async () => {
    const pwd = await reset(0);
    const item = await outbox().findOne({ type: "staff_password", to: b.w.mentors[0]!.email });
    expect(item?.status).toBe("pending");
    expect(JSON.stringify(item)).not.toContain(pwd);
    expect(item?.secret, "OutboxDoc.secret guarda a senha cifrada (AES-256-GCM)").toBeTruthy();
  });

  it("depois do envio: e-mail leva a senha, a outbox (inteira) não, o campo é removido e logs/A9 não a mostram", async () => {
    const pwd = await reset(1);
    const n = new api!.MemoryNotifier!();
    const r = await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now });
    expect(r.failed).toBe(0);

    const msg = n.sent.find((m: any) => m.type === "staff_password" && m.to === b.w.mentors[1]!.email) as any;
    expect(msg, "e-mail staff_password enviado").toBeTruthy();
    expect(JSON.stringify(msg), "o e-mail precisa entregar a senha").toContain(pwd);

    const item = await outbox().findOne({ type: "staff_password", to: b.w.mentors[1]!.email });
    expect(item?.status).toBe("sent");
    expect(item?.secret, "campo cifrado removido com $unset").toBeUndefined();
    expect(Object.keys(item?.payload ?? {})).toEqual([]);
    expect(await allOutbox()).not.toContain(pwd);

    expect(written.join("\n")).not.toContain(pwd);

    const list = await b.admin.get("/api/admin/notifications?type=staff_password");
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(pwd);
    expect(list.body.items.length).toBeGreaterThan(0);
  });

  it("falha permanente: ao marcar failed a senha também sai da outbox, dos logs e de A9", async () => {
    const pwd = await reset(0);
    const n = new api!.MemoryNotifier!();
    n.failNext(1, true);
    const r = await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now });
    expect(r.failed).toBeGreaterThan(0);
    const item = await outbox().findOne({ type: "staff_password", status: "failed" });
    expect(item).toBeTruthy();
    expect(await allOutbox()).not.toContain(pwd);
    expect(written.join("\n")).not.toContain(pwd);
    const list = await b.admin.get("/api/admin/notifications?status=failed");
    expect(JSON.stringify(list.body)).not.toContain(pwd);
  });
});
