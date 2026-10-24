import { createHash, randomBytes } from "node:crypto";
import { EVENT_ID, buildSlots } from "./event.js";

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export function buildMentorDocs(count = 50, slotIds = buildSlots().map((s) => s.id)) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Mentora ${i + 1}`,
    email: `mentora${i + 1}@techwoman.test`,
    roles: ["mentor"],
    status: "active",
    mustChangePassword: false,
    areas: ["dados"],
    availability: slotIds,
    failedLogins: 0,
    createdAt: new Date(),
  }));
}

/** Participantes `waiting`; devolve também o token em claro para chamar E03/E04. */
export function buildMenteeDocs(count = 10, eventId = EVENT_ID) {
  const base = Date.now() - count * 60_000;
  return Array.from({ length: count }, (_, i) => {
    const token = randomBytes(32).toString("base64url");
    const email = `participante${i + 1}@exemplo.test`;
    return {
      token,
      doc: {
        eventId,
        name: `Participante ${i + 1}`,
        email,
        emailNorm: email,
        phone: `+5581999${String(100000 + i)}`,
        area: "dados",
        preferredPeriod: "any",
        consent: { version: "1", acceptedAt: new Date() },
        status: "waiting",
        priority: false,
        queuedAt: new Date(base + i * 60_000),
        tokenHash: sha256(token),
        version: 1,
        createdAt: new Date(base),
      },
    };
  });
}
