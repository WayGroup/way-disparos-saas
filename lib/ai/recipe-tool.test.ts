import { describe, it, expect } from "vitest";
import { validateRecipeDraft, toSaveRecipePayload, formatRecipeSeal, type RecipeDraft } from "@/lib/ai/recipe-tool";

function draft(over: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: "Webinário",
    description: "d",
    inputs: [
      { label: "Nome interno", field_type: "texto", required: true, is_anchor: false },
      { label: "Data e hora do evento", field_type: "data_hora", required: true, is_anchor: true },
    ],
    slots: [
      { track: "grupos", role: "Convite", offset_days: -1, offset_time: "", offset_minutes: -60, meta_category: null, suggested_media: "Vídeo", code: "" },
    ],
    ...over,
  };
}

describe("validateRecipeDraft", () => {
  it("draft válido passa", () => expect(validateRecipeDraft(draft())).toEqual({ ok: true }));
  it("sem input reclama", () =>
    expect(validateRecipeDraft(draft({ inputs: [] })).ok).toBe(false));
  it("sem âncora reclama", () =>
    expect(validateRecipeDraft(draft({ inputs: [{ label: "x", field_type: "texto", required: true, is_anchor: false }] })).ok).toBe(false));
  it("duas âncoras reclama", () =>
    expect(validateRecipeDraft(draft({ inputs: [
      { label: "a", field_type: "data_hora", required: true, is_anchor: true },
      { label: "b", field_type: "data_hora", required: true, is_anchor: true },
    ] })).ok).toBe(false));
  it("âncora que não é data_hora reclama", () =>
    expect(validateRecipeDraft(draft({ inputs: [{ label: "a", field_type: "texto", required: true, is_anchor: true }] })).ok).toBe(false));
  it("sem slot reclama", () =>
    expect(validateRecipeDraft(draft({ slots: [] })).ok).toBe(false));
  it("slot api sem categoria reclama", () =>
    expect(validateRecipeDraft(draft({ slots: [
      { track: "api", role: "Toque", offset_days: 0, offset_time: "10:00", offset_minutes: 0, meta_category: null, suggested_media: "", code: "" },
    ] })).ok).toBe(false));
});

describe("toSaveRecipePayload", () => {
  it("mapeia inputs e slots com defaults", () => {
    const p = toSaveRecipePayload(draft());
    expect(p.inputs).toEqual([
      { label: "Nome interno", field_type: "texto", required: true, is_anchor: false },
      { label: "Data e hora do evento", field_type: "data_hora", required: true, is_anchor: true },
    ]);
    expect(p.slots[0]).toEqual({
      track: "grupos", code: "", role: "Convite", meta_category: null, target_communities: null,
      suggested_media: "Vídeo", offset_days: -1, offset_time: "", offset_minutes: -60, offset_label: "",
    });
  });
  it("zera meta_category de slot grupos mesmo se vier preenchido", () => {
    const p = toSaveRecipePayload(draft({ slots: [
      { track: "grupos", role: "x", offset_days: 0, offset_time: "", offset_minutes: 0, meta_category: "UTILITY", suggested_media: "", code: "" },
    ] }));
    expect(p.slots[0].meta_category).toBeNull();
  });
});

describe("formatRecipeSeal", () => {
  it("vazio quando nada criado", () => expect(formatRecipeSeal([])).toBe(""));
  it("traz nome e caminho do editor", () => {
    const s = formatRecipeSeal([{ id: "abc", name: "Webinário" }]);
    expect(s).toContain("Webinário");
    expect(s).toContain("/receitas/abc");
  });
});
