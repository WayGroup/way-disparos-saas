import { describe, it, expect } from "vitest";
import { computeSendAt, formatSendAt, toInstant } from "@/lib/schedule";

describe("toInstant", () => {
  it("converte o horário de São Paulo no instante UTC", () => {
    expect(toInstant("2026-07-20 14:00")).toBe("2026-07-20T17:00:00.000Z");
  });

  it("meia-noite vira 03:00 UTC", () => {
    expect(toInstant("2026-07-20 00:00")).toBe("2026-07-20T03:00:00.000Z");
  });

  it("atravessa a virada do ano corretamente", () => {
    expect(toInstant("2026-12-31 23:30")).toBe("2027-01-01T02:30:00.000Z");
  });

  it("aceita offset customizado", () => {
    expect(toInstant("2026-07-20 14:00", "+00:00")).toBe("2026-07-20T14:00:00.000Z");
  });

  it("devolve null para formato inválido", () => {
    expect(toInstant("")).toBeNull();
    expect(toInstant("20/07/2026 14:00")).toBeNull();
    expect(toInstant("2026-07-20T14:00")).toBeNull();
    expect(toInstant("2026-07-20 14:00:00")).toBeNull();
  });

  it("devolve null para data que não existe", () => {
    expect(toInstant("2026-02-31 14:00")).toBeNull();
  });
});

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
