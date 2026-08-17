import { describe, it, expect } from "vitest";
import { dropAlreadyLive, partitionSchedulable, type LabeledPiece } from "@/lib/sends/reschedule";

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
    const { schedulable, blocked, past } = partitionSchedulable([base()], NOW);
    expect(schedulable).toHaveLength(1);
    expect(blocked).toEqual([]);
    expect(past).toEqual([]);
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
    expect(partitionSchedulable([], NOW)).toEqual({ schedulable: [], blocked: [], past: [] });
  });
});

// A REGRA: nada é agendado para trás. Nenhuma peça no passado entra na fila.
describe("nada é agendado para trás", () => {
  it("peça de ontem nunca é agendada", () => {
    const ontem = base({ send_at: "2026-07-19 10:00" });
    const { schedulable, past, blocked } = partitionSchedulable([ontem], NOW);
    expect(schedulable).toEqual([]);
    expect(past.map((p) => p.label)).toEqual(["Convite"]);
    // No passado não é "inválida": não bloqueia a aprovação, só fica de fora.
    expect(blocked).toEqual([]);
  });

  it("um minuto no passado já é passado — sem tolerância", () => {
    const { schedulable, past } = partitionSchedulable([base({ send_at: "2026-07-20 09:59" })], NOW);
    expect(schedulable).toEqual([]);
    expect(past).toHaveLength(1);
  });

  it("exatamente agora conta como passado — a hora já chegou", () => {
    const { schedulable, past } = partitionSchedulable([base({ send_at: "2026-07-20 10:00" })], NOW);
    expect(schedulable).toEqual([]);
    expect(past).toHaveLength(1);
  });

  it("um minuto à frente entra na fila", () => {
    const { schedulable, past } = partitionSchedulable([base({ send_at: "2026-07-20 10:01" })], NOW);
    expect(schedulable).toHaveLength(1);
    expect(past).toEqual([]);
  });

  it("campanha meio vencida: SÓ as peças futuras entram na fila", () => {
    const pieces = [
      base({ post_id: "p1", label: "Aviso -3 dias", send_at: "2026-07-17 10:00" }),
      base({ post_id: "p2", label: "Lembrete -1 dia", send_at: "2026-07-19 10:00" }),
      base({ post_id: "p3", label: "Hoje de manhã", send_at: "2026-07-20 08:00" }),
      base({ post_id: "p4", label: "Hoje à noite", send_at: "2026-07-20 20:00" }),
    ];
    const { schedulable, past } = partitionSchedulable(pieces, NOW);
    expect(schedulable.map((p) => p.post_id)).toEqual(["p4"]);
    expect(past.map((p) => p.label)).toEqual([
      "Aviso -3 dias",
      "Lembrete -1 dia",
      "Hoje de manhã",
    ]);
  });

  // Numa campanha toda peça tem hora marcada. `send_at` vazio ali é erro, não "agora".
  it("peça de campanha sem data é bloqueada, não tratada como 'agora'", () => {
    const { schedulable, blocked, past } = partitionSchedulable([base({ send_at: "" })], NOW);
    expect(schedulable).toEqual([]);
    expect(past).toEqual([]);
    expect(blocked[0].message).toMatch(/Sem data/);
  });
});

describe("dropAlreadyLive", () => {
  const planejado = (post_id: string | null, wa_group_id: string) => ({
    post_id,
    wa_group_id,
    scheduled_at: "2026-08-17T17:00:00.000Z",
  });

  it("não reenfileira o par (peça, grupo) que já recebeu", () => {
    // O caso real que derrubou a produção: "Enviar agora" numa peça com hora ainda no
    // futuro deixa linhas `enviado` de pé, e o replanejamento tentava recriá-las.
    const planned = [planejado("p1", "g1@g.us"), planejado("p1", "g2@g.us")];
    const live = [{ post_id: "p1", wa_group_id: "g1@g.us" }];
    expect(dropAlreadyLive(planned, live).map((s) => s.wa_group_id)).toEqual(["g2@g.us"]);
  });

  it("a mesma peça em grupo que ainda não recebeu continua sendo enfileirada", () => {
    const planned = [planejado("p1", "g9@g.us")];
    const live = [{ post_id: "p1", wa_group_id: "g1@g.us" }];
    expect(dropAlreadyLive(planned, live)).toHaveLength(1);
  });

  it("peça diferente no mesmo grupo não é confundida", () => {
    const planned = [planejado("p2", "g1@g.us")];
    const live = [{ post_id: "p1", wa_group_id: "g1@g.us" }];
    expect(dropAlreadyLive(planned, live)).toHaveLength(1);
  });

  it("sem nada vivo, devolve o plano inteiro", () => {
    const planned = [planejado("p1", "g1@g.us"), planejado("p1", "g2@g.us")];
    expect(dropAlreadyLive(planned, [])).toHaveLength(2);
  });

  it("linha viva sem peça (disparo avulso) não bloqueia nada", () => {
    // O índice único do banco só cobre post_id não-nulo; avulso não entra na conta.
    const planned = [planejado("p1", "g1@g.us")];
    const live = [{ post_id: null, wa_group_id: "g1@g.us" }];
    expect(dropAlreadyLive(planned, live)).toHaveLength(1);
  });

  it("planejado sem peça nunca é descartado", () => {
    const planned = [planejado(null, "g1@g.us")];
    const live = [{ post_id: null, wa_group_id: "g1@g.us" }];
    expect(dropAlreadyLive(planned, live)).toHaveLength(1);
  });
});
