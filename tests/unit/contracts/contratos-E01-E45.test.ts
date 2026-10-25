import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ENDPOINTS,
  ENDPOINT_LIST,
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  SCHEDULE_CONFLICT_CODES,
  E02BodySchema,
  E04BodySchema,
  E08BodySchema,
  E10BodySchema,
  E21BodySchema,
  E24BodySchema,
  E26BodySchema,
  E39CreateBodySchema,
  E39PatchBodySchema,
  buildPath,
  fullPath,
} from "@tw/shared";

const PLAN_CODES = [
  "E01", "E02", "E03", "E04", "E05", "E07", "E08",
  "E10", "E11", "E12", "E13",
  "E20", "E21", "E22", "E23", "E24", "E25", "E26", "E27", "E28",
  "E30", "E31", "E32", "E33", "E34", "E35", "E36", "E37", "E38", "E39",
  "E40", "E41", "E42", "E43", "E44", "E45", "E47", "E48",
];

/** Todo objeto Zod do corpo precisa ser .strict() (PLAN: segurança, "Zod com strict() em todo corpo"). */
function nonStrictObjects(schema: z.ZodType, path = "$"): string[] {
  const def = (schema as unknown as { def?: Record<string, any> }).def ?? {};
  const type = def.type as string | undefined;
  const bad: string[] = [];
  if (type === "object") {
    if (def.catchall?.def?.type !== "never") bad.push(path);
    for (const [k, v] of Object.entries(def.shape ?? {})) bad.push(...nonStrictObjects(v as z.ZodType, `${path}.${k}`));
  } else if (type === "union") {
    (def.options as z.ZodType[]).forEach((o, i) => bad.push(...nonStrictObjects(o, `${path}|${i}`)));
  } else if (["optional", "nullable", "default", "readonly"].includes(type ?? "")) {
    bad.push(...nonStrictObjects(def.innerType, path));
  } else if (type === "array") {
    bad.push(...nonStrictObjects(def.element, `${path}[]`));
  } else if (type === "pipe") {
    bad.push(...nonStrictObjects(def.in, path));
  }
  return bad;
}

describe("contratos: catálogo E01–E48", () => {
  it("todo código do PLAN aparece em ENDPOINTS", () => {
    const codes = new Set(ENDPOINT_LIST.map((e) => e.code));
    for (const c of PLAN_CODES) expect(codes.has(c), `falta ${c}`).toBe(true);
  });

  it("papéis: rotas de mentora = mentor; admin = admin/super_admin; E40/E41/E42/E43 = só super_admin", () => {
    for (const e of ENDPOINT_LIST) {
      if (e.auth !== "staff" || e.path.startsWith("/auth/")) continue;
      expect(e.roles?.length, `${e.code} ${e.path} sem roles`).toBeGreaterThan(0);
      if (e.path.startsWith("/mentor/")) expect(e.roles).toEqual(["mentor"]);
      if (["E40", "E41", "E42", "E43"].includes(e.code)) expect(e.roles).toEqual(["super_admin"]);
    }
  });

  it("E04, E08, E24, E26 aceitam Idempotency-Key; E02 exige Turnstile; E47 sem CSRF", () => {
    expect(ENDPOINTS.E04.idempotent).toBe(true);
    expect(ENDPOINTS.E08.idempotent).toBe(true);
    expect(ENDPOINTS.E47.auth).toBe("public");
    expect(ENDPOINTS.E47.csrf).toBe(false);
    expect(ENDPOINTS.E24.idempotent).toBe(true);
    expect(ENDPOINTS.E26.idempotent).toBe(true);
    expect(ENDPOINTS.E02.turnstile).toBe(true);
  });

  it("E48: público, GET /l/:code; código fora do formato não dá 422 (vira '')", () => {
    expect(ENDPOINTS.E48.auth).toBe("public");
    expect([ENDPOINTS.E48.method, ENDPOINTS.E48.path]).toEqual(["GET", "/l/:code"]);
    const p = ENDPOINTS.E48.params as z.ZodType;
    expect(p.parse({ code: "IEO31Kd" })).toEqual({ code: "IEO31Kd" });
    expect(p.parse({ code: "x".repeat(65) })).toEqual({ code: "" });
  });

  it("buildPath/fullPath", () => {
    expect(buildPath("/mentor/appointments/:id", { id: "a b" })).toBe("/mentor/appointments/a%20b");
    expect(fullPath("/auth/me")).toBe("/api/auth/me");
    expect(() => buildPath("/x/:id")).toThrow();
  });
});

describe("contratos: erros", () => {
  it("todo código de erro tem status HTTP", () => {
    for (const c of ERROR_CODES) expect(ERROR_HTTP_STATUS[c], `sem status para ${c}`).toBeTypeOf("number");
  });
  it("conflitos de agenda E24 são 409 (PLAN: Concorrência)", () => {
    expect([...SCHEDULE_CONFLICT_CODES].sort()).toEqual(["MENTEE_TAKEN", "MENTOR_BUSY", "SLOT_UNAVAILABLE", "TABLE_TAKEN"]);
    for (const c of SCHEDULE_CONFLICT_CODES) expect(ERROR_HTTP_STATUS[c]).toBe(409);
    expect(ERROR_HTTP_STATUS.INVITE_EXPIRED).toBe(409);
  });
});

describe("contratos: corpos .strict() (rejeitam campos extras)", () => {
  for (const [name, e] of Object.entries(ENDPOINTS)) {
    if (!e.body) continue;
    it(`${name} ${e.method} ${e.path}`, () => {
      expect(nonStrictObjects(e.body as z.ZodType)).toEqual([]);
    });
  }
});

describe("contratos: aceita/rejeita (E02, E04, E10, E21, E24, E26, E39)", () => {
  const e02 = {
    name: "Maria Silva", email: "  Maria@Exemplo.COM ", phone: "(81) 99999-1234", area: "dados",
    preferredPeriod: "any", consent: { accepted: true, version: "1" }, turnstileToken: "t",
  };
  it("E02 normaliza e-mail e aceita o mínimo", () => {
    const r = E02BodySchema.parse(e02);
    expect(r.email).toBe("maria@exemplo.com");
  });
  it("E02 rejeita extra, consent false, período inválido, nome curto", () => {
    expect(E02BodySchema.safeParse({ ...e02, admin: true }).success).toBe(false);
    expect(E02BodySchema.safeParse({ ...e02, consent: { accepted: false, version: "1" } }).success).toBe(false);
    expect(E02BodySchema.safeParse({ ...e02, preferredPeriod: "night" }).success).toBe(false);
    expect(E02BodySchema.safeParse({ ...e02, name: "A" }).success).toBe(false);
    expect(E02BodySchema.safeParse({ ...e02, note: "x".repeat(281) }).success).toBe(false);
  });
  it("E04: ações válidas e inválidas (RN06, RN14)", () => {
    expect(E04BodySchema.safeParse({ action: "accept" }).success).toBe(true);
    expect(E04BodySchema.safeParse({ action: "decline", reason: "schedule" }).success).toBe(true);
    expect(E04BodySchema.safeParse({ action: "decline", reason: "no_interest" }).success).toBe(true);
    expect(E04BodySchema.safeParse({ action: "decline" }).success).toBe(false);
    expect(E04BodySchema.safeParse({ action: "decline", reason: "x" }).success).toBe(false);
    expect(E04BodySchema.safeParse({ action: "accept", reason: "schedule" }).success).toBe(false);
    expect(E04BodySchema.safeParse({ action: "update_preference", preferredPeriod: "morning" }).success).toBe(true);
    expect(E04BodySchema.safeParse({ action: "update_preference" }).success).toBe(false);
    expect(E04BodySchema.safeParse({ action: "hack" }).success).toBe(false);
    expect(E04BodySchema.safeParse({ action: "reschedule" }).success).toBe(true);
    expect(E04BodySchema.safeParse({ action: "reschedule", reason: "schedule" }).success).toBe(false);
  });
  it("E08: só slotId (RN19)", () => {
    expect(E08BodySchema.safeParse({ slotId: "s01" }).success).toBe(true);
    expect(E08BodySchema.safeParse({}).success).toBe(false);
    expect(E08BodySchema.safeParse({ slotId: "s01", mentorId: "u" }).success).toBe(false);
  });
  it("E10: login", () => {
    expect(E10BodySchema.safeParse({ email: "A@B.com", password: "x" }).success).toBe(true);
    expect(E10BodySchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(E10BodySchema.safeParse({ email: "a@b.com", password: "x", remember: 1 }).success).toBe(false);
  });
  it("E21: slotIds", () => {
    expect(E21BodySchema.safeParse({ slotIds: ["s01", "s02"] }).success).toBe(true);
    expect(E21BodySchema.safeParse({ slotIds: "s01" }).success).toBe(false);
    expect(E21BodySchema.safeParse({}).success).toBe(false);
  });
  it("E24: exige menteeId, slotId, tableId e nada além (mentorId vem da sessão)", () => {
    const ok = { menteeId: "m1", slotId: "s01", tableId: "t1" };
    expect(E24BodySchema.safeParse(ok).success).toBe(true);
    expect(E24BodySchema.safeParse({ ...ok, mentorId: "outra" }).success).toBe(false);
    expect(E24BodySchema.safeParse({ menteeId: "m1", slotId: "s01" }).success).toBe(false);
  });
  it("E26: ações da mentora", () => {
    for (const action of ["confirm_in_person", "start", "finish", "no_show", "cancel"])
      expect(E26BodySchema.safeParse({ action }).success, action).toBe(true);
    expect(E26BodySchema.safeParse({ action: "move" }).success).toBe(false);
  });
  it("E39: criar com defaults de override e mover/cancelar", () => {
    const c = E39CreateBodySchema.parse({ menteeId: "m", mentorId: "u", slotId: "s01", tableId: "t" });
    expect(c.ignoreAvailability).toBe(false);
    expect(c.ignoreLeadTime).toBe(false);
    expect(E39PatchBodySchema.safeParse({ action: "move", slotId: "s02", tableId: "t" }).success).toBe(true);
    expect(E39PatchBodySchema.safeParse({ action: "move", slotId: "s02" }).success).toBe(false);
    expect(E39PatchBodySchema.safeParse({ action: "cancel", reason: "x" }).success).toBe(true);
    expect(E39PatchBodySchema.safeParse({ action: "finish" }).success).toBe(false);
  });
});
