import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ical from "node-ical";
import { Client, loadApi } from "../helpers/app.js";
import { bootApi, type Booted } from "../helpers/boot.js";
import { getCollections } from "../../src/db/collections.js";

/**
 * PLAN, "Testes dos e-mails", caixa 3: o `.ics` de E06 e o anexo do e-mail 3 passam num parser de iCalendar
 * (node-ical), com horário certo em America/Recife. Regras: METHOD:PUBLISH, UID = id da mentoria, 40 min,
 * UID = id da mentoria raiz da cadeia (estável depois do move) e SEQUENCE incrementada a cada move, 404 fora de mentoria confirmada.
 */
const api = await loadApi();
const RECIFE = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Recife", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

describe.skipIf(!api)("E06 calendar.ics e anexo do e-mail 3", () => {
  let b: Booted;
  let mentee: Client;
  let apptId: string;
  let startAt: Date;
  const slotIdx = 6; // 08:00 + 6 x 45 min = 12:30 em Recife

  beforeAll(async () => {
    b = await bootApi(api!, "ics", { mentors: 2, mentees: 2, tables: 20 });
    mentee = Client.asMentee(b.app, b.w.mentees[0]!.token);
  });
  afterAll(async () => b?.close());

  // E06: GET /public/calendar.ics?t=<token> (link do e-mail 3, aberto sem cookie nem header)
  const ics = () => b.anon.get(`/api/public/calendar.ics?t=${encodeURIComponent(b.w.mentees[0]!.token)}`);
  const parse = (body: unknown) => Object.values(ical.sync.parseICS(String(body))).filter((e: any) => e.type === "VEVENT") as any[];

  it("404 antes da confirmação (sem mentoria e com convite pendente)", async () => {
    expect((await ics()).status).toBe(404);
    expect((await b.invite(0, 0, slotIdx, 0)).status).toBe(201);
    expect((await ics()).status).toBe(404);
  });

  it("confirmada: text/calendar que passa no node-ical, 1 VEVENT, UID = id da mentoria, 40 min, 12:30 em America/Recife", async () => {
    const acc = await mentee.post("/api/public/me/actions", { action: "accept" });
    expect(acc.status).toBe(200);
    const c = getCollections(b.t.db);
    const appt = (await c.appointments.findOne({ menteeId: b.w.mentees[0]!.doc._id, status: "confirmed" }))!;
    apptId = String(appt._id);
    startAt = appt.startAt;

    const r = await ics();
    expect(r.status).toBe(200);
    expect(String(r.headers["content-type"])).toMatch(/^text\/calendar/);
    const raw = typeof r.body === "string" ? r.body : String(r.body);
    expect(raw).toMatch(/^BEGIN:VCALENDAR/);
    expect(raw).toMatch(/METHOD:PUBLISH/);
    const events = parse(raw);
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.uid).toBe(apptId);
    expect(new Date(ev.start).getTime()).toBe(startAt.getTime());
    expect(RECIFE(new Date(ev.start))).toBe("12:30");
    expect(new Date(ev.end).getTime() - new Date(ev.start).getTime()).toBe(40 * 60_000);
    expect(String(ev.summary)).toMatch(/Mesa|mesa|Mentoria/);
    expect(String(ev.location ?? "") + String(ev.description ?? "")).toMatch(/Mesa \d+|mesa|Recife/i);
    // o horário não pode estar em UTC "cru" sem fuso: ou é UTC (Z) ou tem TZID=America/Recife
    expect(raw).toMatch(/DTSTART(;TZID=America\/Recife:\d{8}T123000|:\d{8}T153000Z)/);
  });

  it("anexo do e-mail de confirmação (worker) é o mesmo .ics: METHOD:PUBLISH, mesmo UID e mesmo horário", async () => {
    const n = new api!.MemoryNotifier!();
    await api!.processOutbox!(b.t.db, { notifier: n, now: b.clock.now });
    const msg = n.sent.find((m: any) => m.type === "confirmed" && m.channel === "email") as any;
    expect(msg, "e-mail 3 (confirmed) enviado").toBeTruthy();
    const att = (msg.attachments ?? []).find((a: any) => /\.ics$/i.test(a.filename ?? ""));
    expect(att, "anexo .ics no e-mail 3").toBeTruthy();
    expect(att.contentType ?? att.mimeType ?? "").toMatch(/text\/calendar/);
    const raw = Buffer.isBuffer(att.content) ? att.content.toString("utf8") : String(att.content);
    expect(raw).toMatch(/METHOD:PUBLISH/);
    const [ev] = parse(raw);
    expect(ev.uid).toBe(apptId);
    expect(new Date(ev.start).getTime()).toBe(startAt.getTime());
    expect(RECIFE(new Date(ev.start))).toBe("12:30");
  });

  it("mover (E39): o .ics tem o novo horário, mesmo UID (raiz da cadeia) e SEQUENCE +1 a cada move", async () => {
    const before = parse((await ics()).body)[0];
    const seqBefore = Number(before.sequence ?? 0);
    const mv = await b.admin.patch(`/api/admin/appointments/${apptId}`, { action: "move", slotId: b.w.slotIds[slotIdx + 1]!, tableId: String(b.w.tables[1]!._id) });
    expect(mv.status).toBe(200);
    const r = await ics();
    expect(r.status).toBe(200);
    const [after] = parse(r.body);
    expect(RECIFE(new Date(after.start))).toBe("13:15");
    expect(Number(after.sequence ?? 0)).toBe(seqBefore + 1);
    expect(after.uid, "UID estável: id da mentoria raiz da cadeia").toBe(apptId);
    // segundo move: UID segue o mesmo e SEQUENCE sobe de novo
    const cur = await getCollections(b.t.db).appointments.findOne({ menteeId: b.w.mentees[0]!.doc._id, status: "confirmed" });
    const mv2 = await b.admin.patch(`/api/admin/appointments/${cur!._id}`, { action: "move", slotId: b.w.slotIds[slotIdx + 2]!, tableId: String(b.w.tables[2]!._id) });
    expect(mv2.status).toBe(200);
    const [again] = parse((await ics()).body);
    expect(again.uid).toBe(apptId);
    expect(Number(again.sequence ?? 0)).toBe(seqBefore + 2);
    expect(RECIFE(new Date(again.start))).toBe("14:00");
  });
});
