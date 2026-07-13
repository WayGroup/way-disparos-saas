import { describe, it, expect } from "vitest";
import { withJitter, JITTER_MIN_MS, JITTER_MAX_MS } from "@/lib/sends/jitter";

const BASE = "2026-07-20T13:00:00.000Z";

describe("withJitter", () => {
  it("devolve vazio para count 0 ou negativo", () => {
    expect(withJitter(BASE, 0)).toEqual([]);
    expect(withJitter(BASE, -1)).toEqual([]);
  });

  it("um único grupo sai exatamente na base, sem espaçamento", () => {
    expect(withJitter(BASE, 1)).toEqual([BASE]);
  });

  it("com rng no piso, espaça 20s entre grupos", () => {
    expect(withJitter(BASE, 3, { rng: () => 0 })).toEqual([
      "2026-07-20T13:00:00.000Z",
      "2026-07-20T13:00:20.000Z",
      "2026-07-20T13:00:40.000Z",
    ]);
  });

  it("com rng no teto, espaça 60s entre grupos", () => {
    expect(withJitter(BASE, 3, { rng: () => 1 })).toEqual([
      "2026-07-20T13:00:00.000Z",
      "2026-07-20T13:01:00.000Z",
      "2026-07-20T13:02:00.000Z",
    ]);
  });

  it("com rng real, a série é crescente e todo gap fica na faixa anti-ban", () => {
    const out = withJitter(BASE, 12);
    const times = out.map((iso) => new Date(iso).getTime());
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      expect(gap).toBeGreaterThanOrEqual(JITTER_MIN_MS);
      expect(gap).toBeLessThanOrEqual(JITTER_MAX_MS);
    }
  });

  it("respeita min/max customizados", () => {
    const out = withJitter(BASE, 2, { minMs: 5000, maxMs: 5000 });
    expect(out[1]).toBe("2026-07-20T13:00:05.000Z");
  });

  it("devolve vazio para base inválida", () => {
    expect(withJitter("não é data", 3)).toEqual([]);
    expect(withJitter("", 3)).toEqual([]);
  });
});
