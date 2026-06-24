import { describe, it, expect } from "vitest";
import { computeSendAt, formatSendAt } from "@/lib/schedule";

describe("computeSendAt", () => {
  it("soma dias e usa hora fixa", () => {
    expect(computeSendAt("2026-06-27T19:00", -1, "14:00")).toBe("2026-06-26 14:00");
  });
  it("hora vazia usa a hora da âncora", () => {
    expect(computeSendAt("2026-06-27T19:07", 0, "")).toBe("2026-06-27 19:07");
  });
  it("âncora inválida retorna vazio", () => {
    expect(computeSendAt("", -1, "14:00")).toBe("");
    expect(computeSendAt("xx", 0, "")).toBe("");
  });
});

describe("formatSendAt", () => {
  it("formata em pt-BR curto", () => {
    expect(formatSendAt("2026-06-26 14:00")).toBe("sex 26/06 · 14:00");
  });
  it("vazio retorna vazio", () => {
    expect(formatSendAt("")).toBe("");
  });
});
