import { describe, it, expect } from "vitest";
import { formatOffsetLabel, codeFromRole, nextSlotDefaults, padTime } from "@/lib/recipe-slots";

describe("formatOffsetLabel", () => {
  it("dia negativo com hora cheia", () => expect(formatOffsetLabel(-1, "14:00")).toBe("D-1 · 14h"));
  it("dia zero com hora cheia", () => expect(formatOffsetLabel(0, "09:00")).toBe("D0 · 09h"));
  it("hora quebrada mantém os minutos", () => expect(formatOffsetLabel(0, "19:07")).toBe("D0 · 19h07"));
  it("dia positivo sem hora", () => expect(formatOffsetLabel(2, "")).toBe("D+2"));
  it("dia zero sem hora", () => expect(formatOffsetLabel(0, "")).toBe("D0"));
  it("hora inválida é ignorada", () => expect(formatOffsetLabel(-3, "14h")).toBe("D-3"));
  // O agendador aceita "9:00" e dispara às 09:00 — o rótulo tem que concordar.
  it("hora legada de 1 dígito é reconhecida e zero-padded", () =>
    expect(formatOffsetLabel(0, "9:00")).toBe("D0 · 09h"));
});

describe("padTime", () => {
  it("zero à esquerda quando falta", () => expect(padTime("9:00")).toBe("09:00"));
  it("mantém a hora já normalizada", () => expect(padTime("14:30")).toBe("14:30"));
  it("vazio continua vazio", () => expect(padTime("")).toBe(""));
  it("inválida vira vazio", () => expect(padTime("14h")).toBe(""));
});

describe("codeFromRole", () => {
  it("papel vira slug", () => expect(codeFromRole("Convite — reserve sua vaga")).toBe("convite-reserve-sua-vaga"));
  it("vazio continua vazio", () => expect(codeFromRole("")).toBe(""));
});

describe("nextSlotDefaults", () => {
  it("sem último slot → dia 0 às 10:00", () =>
    expect(nextSlotDefaults(undefined)).toEqual({ offset_days: 0, offset_time: "10:00" }));
  it("herda dia e hora do último", () =>
    expect(nextSlotDefaults({ offset_days: -1, offset_time: "14:00" })).toEqual({ offset_days: -1, offset_time: "14:00" }));
  it("último sem hora → 10:00", () =>
    expect(nextSlotDefaults({ offset_days: 3, offset_time: "" })).toEqual({ offset_days: 3, offset_time: "10:00" }));
});
