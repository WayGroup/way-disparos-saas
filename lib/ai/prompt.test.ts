import { describe, it, expect } from "vitest";
import { buildGenerationUserPrompt } from "@/lib/ai/prompt";
import type { RecipeWithChildren } from "@/lib/db/types";

const recipe: RecipeWithChildren = {
  id: "r", name: "Webinário quinzenal", description: "d", recipe_type: "webinario",
  active: true, created_at: "", updated_at: "",
  inputs: [
    { id: "i1", recipe_id: "r", label: "Data e hora do webinário", field_type: "data_hora", required: true, is_anchor: true, sort_order: 0 },
  ],
  slots: [
    { id: "s1", recipe_id: "r", track: "api", code: "webinario_convite_2706", offset_label: "-3 dias", role: "Convite ao webinário", meta_category: "UTILITY", target_communities: null, suggested_media: "Vídeo Lucas", sort_order: 0 },
    { id: "s2", recipe_id: "r", track: "grupos", code: "webinario_convite_2706", offset_label: "-3 dias", role: "Convite", meta_category: null, target_communities: "1, 2, 3", suggested_media: "Vídeo convite", sort_order: 0 },
  ],
};

describe("buildGenerationUserPrompt", () => {
  it("inclui base, inputs preenchidos e os slots das duas trilhas", () => {
    const out = buildGenerationUserPrompt(recipe, { "Data e hora do webinário": "27/06 20h" }, "BASE_WAY");
    expect(out).toContain("BASE_WAY");
    expect(out).toContain("27/06 20h");
    expect(out).toContain("Convite ao webinário");
    expect(out).toContain("Convite"); // slot de grupo
    expect(out).toContain("UTILITY");
    expect(out).toContain("1, 2, 3"); // comunidades do slot de grupo
  });
});
