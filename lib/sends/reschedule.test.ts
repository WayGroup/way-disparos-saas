import { describe, it, expect } from "vitest";
import { partitionSchedulable, type LabeledPiece } from "@/lib/sends/reschedule";

const alvo = { community_id: "c1", wa_group_id: "1@g.us", wa_subject: "G1" };

const base = (over: Partial<LabeledPiece> = {}): LabeledPiece => ({
  post_id: "p1",
  label: "Convite",
  send_at: "2026-07-20 10:00",
  payload: { text: "oi", media: null },
  targets: [alvo],
  ...over,
});

describe("partitionSchedulable", () => {
  it("separa o que dá para agendar do que não dá", () => {
    const ok = base({ post_id: "p1" });
    const semGrupo = base({ post_id: "p2", targets: [] });
    const { schedulable, blocked } = partitionSchedulable([ok, semGrupo]);
    expect(schedulable.map((p) => p.post_id)).toEqual(["p1"]);
    expect(blocked.map((i) => i.post_id)).toEqual(["p2"]);
  });

  it("tudo válido não bloqueia nada", () => {
    const { schedulable, blocked } = partitionSchedulable([base()]);
    expect(schedulable).toHaveLength(1);
    expect(blocked).toEqual([]);
  });

  it("peça sem texto e sem mídia é bloqueada", () => {
    const { schedulable, blocked } = partitionSchedulable([
      base({ payload: { text: "", media: null } }),
    ]);
    expect(schedulable).toEqual([]);
    expect(blocked[0].message).toMatch(/sem texto e sem mídia/);
  });

  it("peça com data inválida é bloqueada", () => {
    const { schedulable, blocked } = partitionSchedulable([base({ send_at: "amanhã" })]);
    expect(schedulable).toEqual([]);
    expect(blocked[0].message).toMatch(/inválida/);
  });

  it("lista vazia não explode", () => {
    expect(partitionSchedulable([])).toEqual({ schedulable: [], blocked: [] });
  });
});
