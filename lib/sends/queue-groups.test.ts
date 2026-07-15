import { describe, it, expect } from "vitest";
import { partitionQueue, isStuck, type QueueSend } from "@/lib/sends/queue-groups";
import type { SendStatus } from "@/lib/db/types";

const NOW = new Date("2026-07-20T13:00:00.000Z");

function send(over: Partial<QueueSend> & { id?: string } = {}) {
  return {
    id: over.id ?? "x",
    status: "pendente" as SendStatus,
    campaign_status: "aprovada" as string | null,
    claimed_at: null as string | null,
    scheduled_at: "2026-07-20T14:00:00.000Z",
    ...over,
  };
}

describe("isStuck", () => {
  it("enviando reivindicado há mais de 10 min está preso", () => {
    const s = send({ status: "enviando", claimed_at: "2026-07-20T12:40:00.000Z" });
    expect(isStuck(s, NOW)).toBe(true);
  });

  it("enviando recente não está preso", () => {
    const s = send({ status: "enviando", claimed_at: "2026-07-20T12:58:00.000Z" });
    expect(isStuck(s, NOW)).toBe(false);
  });

  it("outros status nunca estão presos", () => {
    expect(isStuck(send({ status: "pendente" }), NOW)).toBe(false);
    expect(isStuck(send({ status: "falhou" }), NOW)).toBe(false);
  });
});

describe("partitionQueue", () => {
  it("falha e expirado vão para atenção; a sair vai para próximos", () => {
    const sends = [
      send({ id: "ok", status: "pendente" }),
      send({ id: "falha", status: "falhou" }),
      send({ id: "exp", status: "expirado" }),
    ];
    const { attention, upcoming } = partitionQueue(sends, NOW);
    expect(attention.map((s) => s.id).sort()).toEqual(["exp", "falha"]);
    expect(upcoming.map((s) => s.id)).toEqual(["ok"]);
  });

  it("enviando preso vai para atenção; enviando recente vai para próximos", () => {
    const sends = [
      send({ id: "preso", status: "enviando", claimed_at: "2026-07-20T12:40:00.000Z" }),
      send({ id: "vivo", status: "enviando", claimed_at: "2026-07-20T12:59:00.000Z" }),
    ];
    const { attention, upcoming } = partitionQueue(sends, NOW);
    expect(attention.map((s) => s.id)).toEqual(["preso"]);
    expect(upcoming.map((s) => s.id)).toEqual(["vivo"]);
  });

  it("aguardando (pendente de rascunho) é próximo, não atenção", () => {
    const s = send({ status: "pendente", campaign_status: "rascunho" });
    const { attention, upcoming } = partitionQueue([s], NOW);
    expect(attention).toEqual([]);
    expect(upcoming).toHaveLength(1);
  });

  it("atenção vem com o problema mais recente primeiro", () => {
    const sends = [
      send({ id: "antigo", status: "falhou", scheduled_at: "2026-07-20T08:00:00.000Z" }),
      send({ id: "novo", status: "falhou", scheduled_at: "2026-07-20T12:00:00.000Z" }),
    ];
    const { attention } = partitionQueue(sends, NOW);
    expect(attention.map((s) => s.id)).toEqual(["novo", "antigo"]);
  });

  it("lista vazia não explode", () => {
    expect(partitionQueue([], NOW)).toEqual({ attention: [], upcoming: [] });
  });
});
