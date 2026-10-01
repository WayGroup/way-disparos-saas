import { describe, it, expect } from "vitest";
import { derivarCampos, resolverAncora } from "@/lib/campaign-piece-fields";

/** Âncora com hora: sem hora, `new Date("2026-08-18")` vira meia-noite UTC e o dia local vira 17. */
const ANCORA = "2026-08-18 19:07";

const CTX = { existing: [{ sort_order: 0 }, { sort_order: 4 }], recipeType: "webinario", anchor: ANCORA };

describe("derivarCampos", () => {
  it("numera por maior + 1, nao pela contagem", () => {
    // Peça excluída deixa buraco: com 0 e 4, o próximo é 5 — nunca 2.
    expect(derivarCampos({ role: "Lembrete", offset_days: 0, offset_time: "" }, CTX).sort_order).toBe(5);
  });

  it("comeca em zero quando a trilha esta vazia", () => {
    const r = derivarCampos({ role: "Lembrete", offset_days: 0, offset_time: "" }, { ...CTX, existing: [] });
    expect(r.sort_order).toBe(0);
  });

  it("monta o codigo a partir do tipo de receita, do papel e da ancora", () => {
    expect(derivarCampos({ role: "Lembrete", offset_days: 0, offset_time: "" }, CTX).code).toBe(
      "webinario_lembrete_1808",
    );
  });

  it("calcula a data a partir da ancora, dos dias e da hora", () => {
    expect(derivarCampos({ role: "Lembrete", offset_days: -1, offset_time: "14:00" }, CTX).send_at).toBe(
      "2026-08-17 14:00",
    );
  });

  it("sem ancora, o codigo perde o sufixo de data e a data fica vazia", () => {
    const r = derivarCampos({ role: "Lembrete", offset_days: -1, offset_time: "14:00" }, { ...CTX, anchor: "" });
    expect(r.code).toBe("webinario_lembrete");
    expect(r.send_at).toBe("");
  });
});

describe("resolverAncora", () => {
  const campaign = { inputs: { data_do_evento: "2026-08-18 19:07", outro_campo: "x" } };
  const recipe = { inputs: [{ label: "outro_campo", is_anchor: false }, { label: "data_do_evento", is_anchor: true }] };

  it("acha o input marcado como ancora e devolve o valor dela na campanha", () => {
    expect(resolverAncora(campaign, recipe)).toBe("2026-08-18 19:07");
  });

  it("receita nula devolve vazio", () => {
    expect(resolverAncora(campaign, null)).toBe("");
  });

  it("nenhum input marcado como ancora devolve vazio", () => {
    const semAncora = { inputs: [{ label: "outro_campo", is_anchor: false }] };
    expect(resolverAncora(campaign, semAncora)).toBe("");
  });

  it("campanha sem valor para o input ancora devolve vazio", () => {
    const semValor = { inputs: { outro_campo: "x" } };
    expect(resolverAncora(semValor, recipe)).toBe("");
  });
});
