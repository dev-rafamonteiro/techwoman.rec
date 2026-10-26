import { describe, expect, it } from "vitest";
import { parseOptionalPhone } from "../../src/api/lib/normalize.js";
import { optionalPhoneError, phoneFromE164 } from "../../src/web/ui/format.js";

/** WhatsApp opcional da mentora (M2, A3; E28, E31, E32): o formulário recusa o mesmo que a API. */
describe("telefone da mentora", () => {
  const casos: [string, boolean][] = [
    ["(81) 98888-7777", true],
    ["(81) 3333-4444", true],
    ["+55 81 98888-7777", true],
    ["(81) 89999-1234", false], // 11 dígitos sem o 9 na frente
    ["(05) 98888-7777", false], // DDD inválido
    ["(81) 9888-777", false],
  ];

  it("formulário e API concordam", () => {
    for (const [v, valido] of casos) {
      expect(optionalPhoneError(v), v).toBe(valido ? undefined : "Telefone inválido. Informe DDD e número.");
      if (valido) expect(parseOptionalPhone(v), v).toMatch(/^\+55\d{10,11}$/);
      else expect(() => parseOptionalPhone(v), v).toThrow("Telefone inválido");
    }
  });

  it("vazio: sem erro no formulário; null e undefined passam direto na API", () => {
    expect(optionalPhoneError("")).toBeUndefined();
    expect(parseOptionalPhone(null)).toBeNull();
    expect(parseOptionalPhone(undefined)).toBeUndefined();
  });

  it("E.164 para a máscara do campo", () => {
    expect(phoneFromE164("+5581988887777")).toBe("(81) 98888-7777");
    expect(phoneFromE164(null)).toBe("");
  });
});
