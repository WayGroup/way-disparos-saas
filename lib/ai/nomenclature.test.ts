import { describe, it, expect } from "vitest";
import { buildCode } from "@/lib/ai/nomenclature";

describe("buildCode", () => {
  it("monta tipo_papel_DDMM a partir da âncora datetime-local", () => {
    expect(buildCode("webinario", "convite", "2026-06-23T19:07")).toBe("webinario_convite_2306");
  });
  it("normaliza o code (minúsculo, sem espaços/acentos)", () => {
    expect(buildCode("webinario", "É Hoje", "2026-06-23T19:07")).toBe("webinario_e-hoje_2306");
  });
  it("sem data quando a âncora é vazia/ inválida", () => {
    expect(buildCode("promo", "abertura", "")).toBe("promo_abertura");
    expect(buildCode("promo", "abertura", "xx")).toBe("promo_abertura");
  });
});
