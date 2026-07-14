import { describe, it, expect } from "vitest";
import { partitionSchedulable, type LabeledPiece } from "@/lib/sends/reschedule";

// 20/07/2026 às 10:00 em São Paulo
const NOW = new Date("2026-07-20T13:00:00.000Z");

const alvo = { community_id: "c1", wa_group_id: "1@g.us", wa_subject: "G1" };

const base = (over: Partial<LabeledPiece> = {}): LabeledPiece => ({
  post_id: "p1",
  label: "Convite",
  send_at: "2026-07-20 18:00", // no futuro
  payload: { text: "oi", media: null },
  targets: [alvo],
  ...over,
});

describe("partitionSchedulable", () => {
  it("separa o que dá para agendar do que não dá", () => {
    const ok = base({ post_id: "p1" });
    const semGrupo = base({ post_id: "p2", targets: [] });
    const { schedulable, blocked } = partitionSchedulable([ok, semGrupo], NOW);
    expect(schedulable.map((p) => p.post_id)).toEqual(["p1"]);
    expect(blocked.map((i) => i.post_id)).toEqual(["p2"]);
  });

  it("tudo válido não bloqueia nada", () => {
    const { schedulable, blocked, stale } = partitionSchedulable([base()], NOW);
    expect(schedulable).toHaveLength(1);
    expect(blocked).toEqual([]);
    expect(stale).toEqual([]);
  });

  it("peça sem texto e sem mídia é bloqueada", () => {
    const { schedulable, blocked } = partitionSchedulable(
      [base({ payload: { text: "", media: null } })],
      NOW,
    );
    expect(schedulable).toEqual([]);
    expect(blocked[0].message).toMatch(/sem texto e sem mídia/);
  });

  it("peça com data inválida é bloqueada", () => {
    const { schedulable, blocked } = partitionSchedulable([base({ send_at: "amanhã" })], NOW);
    expect(schedulable).toEqual([]);
    expect(blocked[0].message).toMatch(/inválida/);
  });

  it("lista vazia não explode", () => {
    expect(partitionSchedulable([], NOW)).toEqual({ schedulable: [], blocked: [], stale: [] });
  });
});

// A regra: um envio só sai se estiver atrasado no máximo 2 horas.
describe("peças vencidas não entram na fila", () => {
  it("peça de ontem é vencida — nunca é agendada", () => {
    const ontem = base({ send_at: "2026-07-19 10:00" });
    const { schedulable, stale, blocked } = partitionSchedulable([ontem], NOW);
    expect(schedulable).toEqual([]);
    expect(stale.map((p) => p.label)).toEqual(["Convite"]);
    // Vencida não é "inválida": não bloqueia a aprovação, só fica de fora.
    expect(blocked).toEqual([]);
  });

  it("atraso de 30 minutos ainda sai — worker pode ter engasgado", () => {
    const atrasada = base({ send_at: "2026-07-20 09:30" });
    const { schedulable, stale } = partitionSchedulable([atrasada], NOW);
    expect(schedulable).toHaveLength(1);
    expect(stale).toEqual([]);
  });

  it("atraso de 3 horas já é velho demais", () => {
    const velha = base({ send_at: "2026-07-20 07:00" });
    const { schedulable, stale } = partitionSchedulable([velha], NOW);
    expect(schedulable).toEqual([]);
    expect(stale).toHaveLength(1);
  });

  it("campanha meio vencida: só as peças futuras entram na fila", () => {
    const pieces = [
      base({ post_id: "p1", label: "Aviso -3 dias", send_at: "2026-07-17 10:00" }),
      base({ post_id: "p2", label: "Lembrete -1 dia", send_at: "2026-07-19 10:00" }),
      base({ post_id: "p3", label: "Hoje à noite", send_at: "2026-07-20 20:00" }),
    ];
    const { schedulable, stale } = partitionSchedulable(pieces, NOW);
    expect(schedulable.map((p) => p.post_id)).toEqual(["p3"]);
    expect(stale.map((p) => p.label)).toEqual(["Aviso -3 dias", "Lembrete -1 dia"]);
  });

  // Numa campanha toda peça tem hora marcada. `send_at` vazio ali é erro, não "agora".
  it("peça de campanha sem data é bloqueada, não tratada como 'agora'", () => {
    const { schedulable, blocked, stale } = partitionSchedulable([base({ send_at: "" })], NOW);
    expect(schedulable).toEqual([]);
    expect(stale).toEqual([]);
    expect(blocked[0].message).toMatch(/Sem data/);
  });
});
