import { describe, expect, it } from "vitest";
import { fitWithin } from "../../src/web/ui/photo-resize.js";

describe("Foto da mentora · redução no navegador", () => {
  it("reduz pelo maior lado e mantém a proporção", () => {
    expect(fitWithin(4000, 3000, 640)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(3000, 4000, 640)).toEqual({ width: 480, height: 640 });
  });
  it("não amplia imagem pequena", () => {
    expect(fitWithin(300, 200, 640)).toEqual({ width: 300, height: 200 });
  });
  it("imagem muito estreita não fica com lado zero", () => {
    expect(fitWithin(10000, 2, 640)).toEqual({ width: 640, height: 1 });
  });
});
