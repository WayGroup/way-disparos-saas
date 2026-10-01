import { describe, it, expect } from "vitest";
import { buildManualTouch, type ManualTouchInput } from "@/lib/campaign-manual-touch";

/** Âncora com hora: sem hora, `new Date("2026-08-18")` vira meia-noite UTC e o dia local vira 17. */
const ANCORA = "2026-08-18 19:07";

const CTX = { existing: [{ sort_order: 0 }, { sort_order: 4 }], recipeType: "webinario", anchor: ANCORA };

function input(over: Partial<ManualTouchInput> = {}): ManualTouchInput {
  return {
    offset_label: "D-1",
    role: "Lembrete",
    meta_category: "UTILITY",
    template_body: "Oi {{1}}, é amanhã.",
    offset_days: -1,
    offset_time: "14:00",
    ...over,
  };
}

describe("buildManualTouch", () => {
  it("numera por maior + 1, nao pela contagem", () => {
    // Toque excluído deixa buraco: com 0 e 4, o próximo é 5 — nunca 2.
    expect(buildManualTouch(input(), CTX).sort_order).toBe(5);
  });

  it("o primeiro toque de uma trilha vazia comeca em zero", () => {
    expect(buildManualTouch(input(), { ...CTX, existing: [] }).sort_order).toBe(0);
  });

  it("monta o nome do template a partir do papel e da ancora", () => {
    expect(buildManualTouch(input(), CTX).template_name).toBe("webinario_lembrete_1808");
  });

  it("calcula a data a partir da ancora, dos dias e da hora", () => {
    expect(buildManualTouch(input(), CTX).send_at).toBe("2026-08-17 14:00");
  });

  it("sem ancora, o toque nasce sem data", () => {
    expect(buildManualTouch(input(), { ...CTX, anchor: "" }).send_at).toBe("");
  });

  it("passa rotulo, papel, categoria e corpo sem alterar", () => {
    const d = buildManualTouch(
      input({ offset_label: "D0", meta_category: "MARKETING", template_body: "Corpo" }),
      CTX,
    );
    expect(d.offset_label).toBe("D0");
    expect(d.role).toBe("Lembrete");
    expect(d.meta_category).toBe("MARKETING");
    expect(d.template_body).toBe("Corpo");
  });

  it("nao devolve os campos que o banco preenche sozinho", () => {
    // buttons, window_steps, fallback_copy, crm_action, risk_flag e utility_alt têm valor
    // padrão na tabela; escrevê-los aqui seria repetir o schema em dois lugares.
    expect(Object.keys(buildManualTouch(input(), CTX)).sort()).toEqual([
      "meta_category",
      "offset_label",
      "role",
      "send_at",
      "sort_order",
      "template_body",
      "template_name",
    ]);
  });
});
