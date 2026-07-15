import { describe, it, expect } from "vitest";
import { buildTimeline, countdown, dayKey, dayLabel, shortStamp, timeLabel } from "@/lib/sends/timeline";

// 20/07/2026 às 10:00 em São Paulo = 13:00 UTC
const NOW = new Date("2026-07-20T13:00:00.000Z");

const send = (id: string, iso: string) => ({ id, scheduled_at: iso });

describe("dayKey e timeLabel", () => {
  it("usam o fuso de São Paulo, não o UTC", () => {
    // 01:00 UTC do dia 21 ainda é 22:00 do dia 20 em São Paulo.
    expect(dayKey("2026-07-21T01:00:00.000Z")).toBe("2026-07-20");
    expect(timeLabel("2026-07-21T01:00:00.000Z")).toBe("22:00");
  });

  it("meia-noite de São Paulo", () => {
    expect(timeLabel("2026-07-20T03:00:00.000Z")).toBe("00:00");
  });
});

describe("shortStamp", () => {
  it("carimba data e hora no fuso de São Paulo", () => {
    expect(shortStamp("2026-07-14T22:07:00.000Z")).toBe("14/07 · 19:07");
  });
  it("vira o dia corretamente à noite (UTC já é o dia seguinte)", () => {
    expect(shortStamp("2026-07-21T01:30:00.000Z")).toBe("20/07 · 22:30");
  });
});

describe("dayLabel", () => {
  it("dá nome aos dias próximos", () => {
    expect(dayLabel("2026-07-20T14:00:00.000Z", NOW)).toBe("hoje");
    expect(dayLabel("2026-07-21T14:00:00.000Z", NOW)).toBe("amanhã");
    expect(dayLabel("2026-07-19T14:00:00.000Z", NOW)).toBe("ontem");
  });

  it("datas distantes viram dia da semana + data", () => {
    // 22/07/2026 é uma quarta-feira
    expect(dayLabel("2026-07-22T14:00:00.000Z", NOW)).toBe("qua · 22 jul");
  });
});

describe("buildTimeline", () => {
  it("ordena cronologicamente e agrupa por dia", () => {
    const t = buildTimeline(
      [
        send("c", "2026-07-21T14:00:00.000Z"),
        send("a", "2026-07-20T11:00:00.000Z"),
        send("b", "2026-07-20T14:00:00.000Z"),
      ],
      NOW,
    );

    expect(t.days.map((d) => d.label)).toEqual(["hoje", "amanhã"]);
    expect(t.days[0].sends.map((s) => s.id)).toEqual(["a", "b"]);
    expect(t.days[1].sends.map((s) => s.id)).toEqual(["c"]);
  });

  it("marca o primeiro envio que ainda não venceu — é onde vai a divisória do AGORA", () => {
    const t = buildTimeline(
      [
        send("passado", "2026-07-20T11:00:00.000Z"),
        send("futuro", "2026-07-20T14:00:00.000Z"),
      ],
      NOW,
    );
    expect(t.firstFutureId).toBe("futuro");
    expect(t.nextAt).toBe("2026-07-20T14:00:00.000Z");
  });

  it("fila toda no passado não tem divisória", () => {
    const t = buildTimeline([send("a", "2026-07-20T11:00:00.000Z")], NOW);
    expect(t.firstFutureId).toBeNull();
    expect(t.nextAt).toBeNull();
  });

  it("fila toda no futuro põe a divisória no topo", () => {
    const t = buildTimeline([send("a", "2026-07-20T14:00:00.000Z")], NOW);
    expect(t.firstFutureId).toBe("a");
  });

  it("fila vazia não explode", () => {
    expect(buildTimeline([], NOW)).toEqual({ days: [], nextAt: null, firstFutureId: null });
  });
});

describe("countdown", () => {
  it("minutos", () => {
    expect(countdown("2026-07-20T13:12:00.000Z", NOW)).toBe("em 12 min");
  });

  it("horas", () => {
    expect(countdown("2026-07-20T16:00:00.000Z", NOW)).toBe("em 3 h");
  });

  it("dias", () => {
    expect(countdown("2026-07-24T13:00:00.000Z", NOW)).toBe("em 4 dias");
  });

  it("vencido é agora", () => {
    expect(countdown("2026-07-20T12:00:00.000Z", NOW)).toBe("agora");
  });
});
