import { describe, it, expect } from "vitest";
import { formatOffsetLabel, codeFromRole, nextSlotDefaults, padTime, splitOffsetMinutes, joinOffsetMinutes, isLegacyAutoLabel } from "@/lib/recipe-slots";

describe("formatOffsetLabel", () => {
  it("dia negativo com hora cheia", () => expect(formatOffsetLabel(-1, "14:00")).toBe("D-1 · 14h"));
  it("dia zero com hora cheia", () => expect(formatOffsetLabel(0, "09:00")).toBe("D0 · 09h"));
  it("hora quebrada mantém os minutos", () => expect(formatOffsetLabel(0, "19:07")).toBe("D0 · 19h07"));
  it("dia positivo sem hora fixa lê como relativo", () => expect(formatOffsetLabel(2, "")).toBe("D+2 · na hora"));
  it("dia zero sem hora fixa lê como relativo", () => expect(formatOffsetLabel(0, "")).toBe("D0 · na hora"));
  it("hora inválida cai no relativo", () => expect(formatOffsetLabel(-3, "14h")).toBe("D-3 · na hora"));
  it("deslocamento em horas", () => expect(formatOffsetLabel(0, "", -60)).toBe("D0 · 1h antes"));
  it("deslocamento em minutos", () => expect(formatOffsetLabel(0, "", 13)).toBe("D0 · 13min depois"));
  it("deslocamento misto", () => expect(formatOffsetLabel(-1, "", -90)).toBe("D-1 · 1h30 antes"));
  it("hora fixa ignora o deslocamento", () => expect(formatOffsetLabel(0, "14:00", -60)).toBe("D0 · 14h"));
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
  it("sem último slot → dia 0 às 10:00 fixas", () =>
    expect(nextSlotDefaults(undefined)).toEqual({ offset_days: 0, offset_time: "10:00", offset_minutes: 0 }));
  it("herda o modo de hora fixa do último", () =>
    expect(nextSlotDefaults({ offset_days: -1, offset_time: "14:00", offset_minutes: 0 })).toEqual({ offset_days: -1, offset_time: "14:00", offset_minutes: 0 }));
  it("herda o modo relativo do último (hora vazia + deslocamento)", () =>
    expect(nextSlotDefaults({ offset_days: 3, offset_time: "", offset_minutes: -60 })).toEqual({ offset_days: 3, offset_time: "", offset_minutes: -60 }));
});

describe("splitOffsetMinutes", () => {
  it("zero vira antes 0h0min", () =>
    expect(splitOffsetMinutes(0)).toEqual({ sign: "antes", hours: 0, minutes: 0 }));
  it("negativo vira antes", () =>
    expect(splitOffsetMinutes(-90)).toEqual({ sign: "antes", hours: 1, minutes: 30 }));
  it("positivo vira depois", () =>
    expect(splitOffsetMinutes(13)).toEqual({ sign: "depois", hours: 0, minutes: 13 }));
});

describe("joinOffsetMinutes", () => {
  it("antes é negativo", () => expect(joinOffsetMinutes("antes", 1, 30)).toBe(-90));
  it("depois é positivo", () => expect(joinOffsetMinutes("depois", 0, 13)).toBe(13));
  it("zero continua zero", () => expect(joinOffsetMinutes("antes", 0, 0)).toBe(0));
  it("ida e volta preserva", () => {
    const s = splitOffsetMinutes(-90);
    expect(joinOffsetMinutes(s.sign, s.hours, s.minutes)).toBe(-90);
  });
});

describe("isLegacyAutoLabel", () => {
  it("rótulo antigo derivado pelo sistema (só o dia) não é 'à mão'", () => {
    expect(isLegacyAutoLabel("D0")).toBe(true);
    expect(isLegacyAutoLabel("D-1")).toBe(true);
    expect(isLegacyAutoLabel("D+2")).toBe(true);
  });
  it("rótulo escrito à mão é detectado", () =>
    expect(isLegacyAutoLabel("D0 · 19h07 (ao vivo)")).toBe(false));
  it("rótulo de seed com a intenção da cadência é detectado", () => {
    expect(isLegacyAutoLabel("+1 dia")).toBe(false);
    expect(isLegacyAutoLabel("0")).toBe(false);
  });
  it("vazio não conta", () => expect(isLegacyAutoLabel("")).toBe(false));
});
