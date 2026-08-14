import { describe, it, expect } from "vitest";
import { buildManualGroupPost, type ManualPostInput } from "@/lib/campaign-manual-post";

/** Âncora com hora: sem hora, `new Date("2026-08-18")` vira meia-noite UTC e o dia local vira 17. */
const ANCORA = "2026-08-18 19:07";

const EXISTENTES = [
  { sort_order: 0, community_ids: ["g1", "g2", "g3"] },
  { sort_order: 1, community_ids: ["g1"] },
  { sort_order: 2, community_ids: [] },
];

function ctx(over: Partial<Parameters<typeof buildManualGroupPost>[1]> = {}) {
  return { existing: EXISTENTES, recipeType: "webinario", anchor: ANCORA, ...over };
}

function input(over: Partial<ManualPostInput> = {}): ManualPostInput {
  return {
    offset_label: "D-1",
    role: "Lembrete",
    copy: "Amanhã tem.",
    media: "",
    offset_days: -1,
    offset_time: "14:00",
    ...over,
  };
}

describe("buildManualGroupPost", () => {
  it("numera a partir da maior existente", () => {
    expect(buildManualGroupPost(input(), ctx()).sort_order).toBe(3);
  });

  it("a primeira peça de uma trilha vazia começa em zero e sem grupos", () => {
    const draft = buildManualGroupPost(input(), ctx({ existing: [] }));
    expect(draft.sort_order).toBe(0);
    expect(draft.community_ids).toEqual([]);
  });

  it("herda os grupos da peça que tem mais grupos", () => {
    expect(buildManualGroupPost(input(), ctx()).community_ids).toEqual(["g1", "g2", "g3"]);
  });

  it("deixa `communities` vazio — peça à mão não tem sugestão da IA", () => {
    expect(buildManualGroupPost(input(), ctx()).communities).toBe("");
  });

  it("monta o código da mensagem a partir do tipo de receita, do papel e da âncora", () => {
    expect(buildManualGroupPost(input(), ctx()).message_code).toBe("webinario_lembrete_1808");
  });

  it("calcula a data a partir da âncora, dos dias e da hora", () => {
    expect(buildManualGroupPost(input(), ctx()).send_at).toBe("2026-08-17 14:00");
  });

  it("sem âncora, a peça nasce sem data (o validador reclama na aprovação)", () => {
    const draft = buildManualGroupPost(input(), ctx({ anchor: "" }));
    expect(draft.send_at).toBe("");
    expect(draft.message_code).toBe("webinario_lembrete");
  });

  it("copia rótulo, papel, mensagem e mídia sem alterar", () => {
    const draft = buildManualGroupPost(
      input({ offset_label: "D0", role: "Lembrete", copy: "Texto", media: "Print da tela" }),
      ctx(),
    );
    expect(draft.offset_label).toBe("D0");
    expect(draft.role).toBe("Lembrete");
    expect(draft.copy).toBe("Texto");
    expect(draft.media).toBe("Print da tela");
  });
});
