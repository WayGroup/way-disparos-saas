import { describe, it, expect } from "vitest";
import {
  planCommunitySync,
  uniqueIdentifier,
  assessSyncRisk,
  type SyncableCommunity,
  type SyncPlan,
} from "@/lib/evolution/sync";
import type { EvoGroup } from "@/lib/evolution/types";

function community(over: Partial<SyncableCommunity> = {}): SyncableCommunity {
  return {
    id: "c1",
    name: "Comunidade Ouro",
    identifier: "comunidade-ouro",
    wa_group_id: null,
    wa_subject: "",
    active: true,
    ...over,
  };
}

function group(over: Partial<EvoGroup> = {}): EvoGroup {
  return { id: "120363000000000001@g.us", subject: "Comunidade Ouro", ...over };
}

describe("uniqueIdentifier", () => {
  it("devolve o slug quando está livre", () => {
    expect(uniqueIdentifier("Comunidade Ouro", new Set())).toBe("comunidade-ouro");
  });

  it("sufixa em colisão", () => {
    expect(uniqueIdentifier("Comunidade Ouro", new Set(["comunidade-ouro"]))).toBe("comunidade-ouro-2");
  });

  it("pula sufixos já usados", () => {
    const taken = new Set(["comunidade-ouro", "comunidade-ouro-2", "comunidade-ouro-3"]);
    expect(uniqueIdentifier("Comunidade Ouro", taken)).toBe("comunidade-ouro-4");
  });

  it("cai em 'grupo' quando o nome não gera slug", () => {
    expect(uniqueIdentifier("🔥🔥", new Set())).toBe("grupo");
  });
});

describe("planCommunitySync", () => {
  it("insere grupo que ainda não existe", () => {
    const plan = planCommunitySync([], [group()]);
    expect(plan.insert).toEqual([
      {
        name: "Comunidade Ouro",
        identifier: "comunidade-ouro",
        wa_group_id: "120363000000000001@g.us",
        wa_subject: "Comunidade Ouro",
      },
    ]);
    expect(plan.update).toEqual([]);
    expect(plan.deactivate).toEqual([]);
  });

  it("vincula comunidade existente sem JID pelo nome, ignorando acento e caixa", () => {
    const existing = [community({ id: "c9", name: "comunidade OURO" })];
    const plan = planCommunitySync(existing, [group({ subject: "Comunidade Ouro" })]);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([
      { id: "c9", wa_group_id: "120363000000000001@g.us", wa_subject: "Comunidade Ouro", active: true },
    ]);
  });

  it("é idempotente: rodar de novo com o mesmo estado não gera plano", () => {
    const existing = [
      community({ wa_group_id: "120363000000000001@g.us", wa_subject: "Comunidade Ouro" }),
    ];
    const plan = planCommunitySync(existing, [group()]);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.deactivate).toEqual([]);
  });

  it("atualiza quando o grupo foi renomeado no WhatsApp", () => {
    const existing = [
      community({ wa_group_id: "120363000000000001@g.us", wa_subject: "Nome Antigo" }),
    ];
    const plan = planCommunitySync(existing, [group({ subject: "Nome Novo" })]);
    expect(plan.update).toEqual([
      { id: "c1", wa_group_id: "120363000000000001@g.us", wa_subject: "Nome Novo", active: true },
    ]);
  });

  it("reativa comunidade que voltou a aparecer", () => {
    const existing = [
      community({
        wa_group_id: "120363000000000001@g.us",
        wa_subject: "Comunidade Ouro",
        active: false,
      }),
    ];
    const plan = planCommunitySync(existing, [group()]);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].active).toBe(true);
  });

  it("desativa comunidade cujo grupo sumiu da Evolution", () => {
    const existing = [
      community({ id: "c1", wa_group_id: "120363000000000001@g.us", wa_subject: "Comunidade Ouro" }),
      community({ id: "c2", wa_group_id: "120363000000000002@g.us", wa_subject: "Sumiu" }),
    ];
    const plan = planCommunitySync(existing, [group()]);
    expect(plan.deactivate).toEqual(["c2"]);
  });

  it("não desativa comunidade que nunca foi vinculada a um grupo", () => {
    const existing = [community({ id: "c5", wa_group_id: null })];
    const plan = planCommunitySync(existing, []);
    expect(plan.deactivate).toEqual([]);
  });

  it("usa o JID como nome quando o grupo vem sem subject", () => {
    const plan = planCommunitySync([], [group({ subject: "" })]);
    expect(plan.insert[0].name).toBe("120363000000000001@g.us");
    expect(plan.insert[0].wa_subject).toBe("");
  });

  it("não colide identifier entre dois grupos de mesmo nome", () => {
    const groups = [
      group({ id: "120363000000000001@g.us", subject: "Alunos" }),
      group({ id: "120363000000000002@g.us", subject: "Alunos" }),
    ];
    const plan = planCommunitySync([], groups);
    expect(plan.insert.map((i) => i.identifier)).toEqual(["alunos", "alunos-2"]);
  });

  it("não vincula duas vezes a mesma comunidade sem JID", () => {
    const existing = [community({ id: "c1", name: "Alunos", identifier: "alunos" })];
    const groups = [
      group({ id: "120363000000000001@g.us", subject: "Alunos" }),
      group({ id: "120363000000000002@g.us", subject: "Alunos" }),
    ];
    const plan = planCommunitySync(existing, groups);
    expect(plan.update).toHaveLength(1);
    expect(plan.insert).toHaveLength(1);
    expect(plan.insert[0].wa_group_id).toBe("120363000000000002@g.us");
  });
});

/** N comunidades vinculadas e ativas, com ids c1..cN. */
function linked(n: number): SyncableCommunity[] {
  return Array.from({ length: n }, (_, i) =>
    community({
      id: `c${i + 1}`,
      wa_group_id: `12036300000000000${i + 1}@g.us`,
      wa_subject: `Grupo ${i + 1}`,
    }),
  );
}

function planWith(deactivate: string[]): SyncPlan {
  return { insert: [], update: [], deactivate };
}

describe("assessSyncRisk", () => {
  it("recusa quando a Evolution devolve zero grupos e há grupos vinculados", () => {
    const existing = linked(2);
    expect(assessSyncRisk(planWith(["c1", "c2"]), existing, 0)).toEqual({
      kind: "empty",
      total: 2,
    });
  });

  it("deixa passar a primeira sincronização de todas", () => {
    expect(assessSyncRisk(planWith([]), [], 0)).toEqual({ kind: "ok" });
  });

  it("pede confirmação ao desativar mais da metade", () => {
    const existing = linked(10);
    const plan = planWith(["c1", "c2", "c3", "c4", "c5", "c6"]);
    expect(assessSyncRisk(plan, existing, 4)).toEqual({
      kind: "mass",
      deactivating: 6,
      total: 10,
    });
  });

  it("não pede confirmação ao desativar exatamente metade", () => {
    const existing = linked(10);
    const plan = planWith(["c1", "c2", "c3", "c4", "c5"]);
    expect(assessSyncRisk(plan, existing, 5)).toEqual({ kind: "ok" });
  });

  it("não reclama de sincronização sem desativação", () => {
    expect(assessSyncRisk(planWith([]), linked(3), 3)).toEqual({ kind: "ok" });
  });

  it("ignora comunidades já inativas na contagem", () => {
    const existing = [
      community({ id: "c1", wa_group_id: "120363000000000001@g.us" }),
      community({ id: "c2", wa_group_id: "120363000000000002@g.us", active: false }),
      community({ id: "c3", wa_group_id: "120363000000000003@g.us", active: false }),
    ];
    // Só c1 entra no total; desativar c1 é 1 de 1, ou seja, mais da metade.
    expect(assessSyncRisk(planWith(["c1"]), existing, 5)).toEqual({
      kind: "mass",
      deactivating: 1,
      total: 1,
    });
  });
});
