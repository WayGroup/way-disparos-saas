import { describe, it, expect } from "vitest";
import { planSends, validateSchedulable, type PlanPiece, type PlanTarget } from "@/lib/sends/plan";

const NOW = new Date("2026-07-20T13:00:00.000Z");
const FLOOR = { rng: () => 0 }; // gaps determinísticos de 20s

function target(n: number): PlanTarget {
  return {
    community_id: `c${n}`,
    wa_group_id: `12036300000000000${n}@g.us`,
    wa_subject: `Grupo ${n}`,
  };
}

function piece(over: Partial<PlanPiece> = {}): PlanPiece {
  return {
    post_id: "p1",
    send_at: "2026-07-20 10:00",
    payload: { text: "Bom dia", media: null },
    targets: [target(1)],
    ...over,
  };
}

describe("planSends", () => {
  it("uma peça em 3 grupos vira 3 linhas, espaçadas e em ordem", () => {
    const out = planSends([piece({ targets: [target(1), target(2), target(3)] })], FLOOR);

    expect(out).toHaveLength(3);
    expect(out.map((s) => s.community_id)).toEqual(["c1", "c2", "c3"]);
    expect(out.every((s) => s.post_id === "p1")).toBe(true);
    // 10:00 em São Paulo é 13:00 UTC.
    expect(out.map((s) => s.scheduled_at)).toEqual([
      "2026-07-20T13:00:00.000Z",
      "2026-07-20T13:00:20.000Z",
      "2026-07-20T13:00:40.000Z",
    ]);
  });

  it("o jitter reinicia a cada peça: o 1º grupo de cada uma cai no send_at exato", () => {
    const out = planSends(
      [
        piece({ post_id: "p1", send_at: "2026-07-20 10:00", targets: [target(1), target(2)] }),
        piece({ post_id: "p2", send_at: "2026-07-20 15:00", targets: [target(1), target(2)] }),
      ],
      FLOOR,
    );

    expect(out).toHaveLength(4);
    expect(out[0].scheduled_at).toBe("2026-07-20T13:00:00.000Z");
    expect(out[2].scheduled_at).toBe("2026-07-20T18:00:00.000Z");
  });

  it("send_at vazio agenda para agora", () => {
    const out = planSends([piece({ send_at: "" })], { ...FLOOR, now: NOW });
    expect(out[0].scheduled_at).toBe("2026-07-20T13:00:00.000Z");
  });

  it("peça sem grupo não produz linha nenhuma", () => {
    expect(planSends([piece({ targets: [] })], FLOOR)).toEqual([]);
  });

  it("send_at inválido não produz linha (validate é quem reclama antes)", () => {
    expect(planSends([piece({ send_at: "ontem" })], FLOOR)).toEqual([]);
  });

  it("send_at no passado é preservado — o worker envia no próximo tick", () => {
    const out = planSends([piece({ send_at: "2020-01-01 08:00" })], { ...FLOOR, now: NOW });
    expect(out[0].scheduled_at).toBe("2020-01-01T11:00:00.000Z");
  });

  it("leva o payload e o snapshot do grupo para cada linha", () => {
    const out = planSends([piece({ payload: { text: "Oi", media: null } })], FLOOR);
    expect(out[0].payload).toEqual({ text: "Oi", media: null });
    expect(out[0].wa_group_id).toBe("120363000000000001@g.us");
    expect(out[0].wa_subject).toBe("Grupo 1");
  });
});

describe("validateSchedulable", () => {
  const labeled = (over: Partial<PlanPiece> = {}) => ({ ...piece(over), label: "Convite (-3 dias)" });

  it("caso feliz não gera problema", () => {
    expect(validateSchedulable([labeled()])).toEqual([]);
  });

  it("reclama de peça sem data", () => {
    const issues = validateSchedulable([labeled({ send_at: "" })]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/Sem data/);
  });

  it("reclama de data inválida", () => {
    const issues = validateSchedulable([labeled({ send_at: "20/07 às 10h" })]);
    expect(issues[0].message).toMatch(/inválida/);
  });

  it("reclama de peça sem grupo selecionado", () => {
    const issues = validateSchedulable([labeled({ targets: [] })]);
    expect(issues[0].message).toMatch(/Nenhum grupo/);
  });

  it("reclama de grupo sem JID", () => {
    const semJid = { community_id: "c9", wa_group_id: "", wa_subject: "Órfão" };
    const issues = validateSchedulable([labeled({ targets: [semJid] })]);
    expect(issues[0].message).toMatch(/não está vinculado/);
  });

  // REGRA DE OURO: só grupo. Um número privado não pode nem ser agendado.
  it("recusa destino que não é grupo — nem chega a entrar na fila", () => {
    const privado = {
      community_id: "c9",
      wa_group_id: "5511999999999@s.whatsapp.net",
      wa_subject: "Fulano",
    };
    const issues = validateSchedulable([labeled({ targets: [privado] })]);
    expect(issues[0].message).toMatch(/não é um grupo/);
  });

  it("reclama de peça sem texto e sem mídia", () => {
    const issues = validateSchedulable([labeled({ payload: { text: "", media: null } })]);
    expect(issues[0].message).toMatch(/sem texto e sem mídia/);
  });

  it("acumula problemas de peças diferentes, com o rótulo de cada uma", () => {
    const issues = validateSchedulable([
      { ...piece({ post_id: "p1", targets: [] }), label: "Convite" },
      { ...piece({ post_id: "p2", send_at: "" }), label: "Lembrete" },
    ]);
    expect(issues.map((i) => i.label)).toEqual(["Convite", "Lembrete"]);
  });
});
