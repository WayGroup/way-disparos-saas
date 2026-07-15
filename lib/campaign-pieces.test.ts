import { describe, it, expect } from "vitest";
import {
  pieceDateKey,
  pieceTime,
  formatDayHeader,
  groupByDate,
  monthMatrix,
  weekDays,
  stepMediaMissing,
  type Piece,
} from "@/lib/campaign-pieces";

describe("pieceDateKey/pieceTime", () => {
  it("extrai data e hora", () => {
    expect(pieceDateKey("2026-07-14 19:07")).toBe("2026-07-14");
    expect(pieceTime("2026-07-14 19:07")).toBe("19:07");
  });
  it("vazio quando inválido", () => {
    expect(pieceDateKey("")).toBe("");
    expect(pieceTime("xx")).toBe("");
  });
});

describe("formatDayHeader", () => {
  it("formata ddd dd/MM", () => {
    // 14/07/2026 é terça-feira (getDay() === 2)
    expect(formatDayHeader("2026-07-14")).toBe("ter 14/07");
  });
  it("sem data", () => {
    expect(formatDayHeader("")).toBe("sem data");
  });
});

describe("groupByDate", () => {
  it("agrupa por dia, ordena por hora, sem-data por último", () => {
    const p = (key: string, send_at: string): Piece => ({
      key,
      id: key,
      track: "api",
      sort_order: 0,
      send_at,
      role: "",
      offset_label: "",
      message: "",
      buttons: [],
      badge: "",
    });
    const g = groupByDate([
      p("a", "2026-07-14 19:00"),
      p("b", "2026-07-13 14:00"),
      p("c", ""),
      p("d", "2026-07-14 09:00"),
    ]);
    expect(g.map((x) => x.dateKey)).toEqual(["2026-07-13", "2026-07-14", ""]);
    expect(g[1].pieces.map((x) => x.key)).toEqual(["d", "a"]); // 09:00 antes de 19:00
    expect(g[2].label).toBe("sem data");
  });
});

describe("monthMatrix", () => {
  it("semanas começam na segunda e cobrem o mês", () => {
    const m = monthMatrix(2026, 6); // julho/2026 (month0=6)
    expect(m[0].length).toBe(7);
    expect(m.flat()).toContain("2026-07-14");
    // primeira coluna é segunda-feira
    const first = new Date(m[0][0] + "T00:00:00");
    expect(first.getDay()).toBe(1); // 1 = segunda
  });
  it("inclui dias do mês anterior e seguinte para completar semanas", () => {
    const m = monthMatrix(2026, 6); // julho começa em quarta (2026-07-01)
    // semana que contém 01/07 começa na segunda 29/06
    expect(m[0][0]).toBe("2026-06-29");
  });
});

describe("weekDays", () => {
  it("retorna 7 dias de segunda a domingo contendo o dateKey dado", () => {
    const w = weekDays("2026-07-14"); // terça → seg 13 até dom 19
    expect(w.length).toBe(7);
    expect(w[0]).toBe("2026-07-13"); // segunda
    expect(w[6]).toBe("2026-07-19"); // domingo
    expect(w).toContain("2026-07-14");
  });
});

describe("stepMediaMissing", () => {
  it("acusa falta só quando o passo pede mídia e não tem asset", () => {
    expect(stepMediaMissing([{ media: "Vídeo 20s", asset_id: undefined }])).toBe(true);
    expect(stepMediaMissing([{ media: "Vídeo 20s", asset_id: "a1" }])).toBe(false);
    expect(stepMediaMissing([{ media: "", asset_id: undefined }])).toBe(false); // passo só-texto
    expect(stepMediaMissing([])).toBe(false);
  });
  it("basta um passo com mídia faltando entre vários", () => {
    expect(
      stepMediaMissing([
        { media: "", asset_id: undefined },
        { media: "Card contagem", asset_id: undefined },
      ])
    ).toBe(true);
  });
});
