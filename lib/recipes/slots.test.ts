import { describe, it, expect } from "vitest";
import { groupSlotsByTrack } from "@/lib/recipes/slots";
import type { RecipeSlot } from "@/lib/db/types";

function slot(partial: Partial<RecipeSlot>): RecipeSlot {
  return {
    id: "s", recipe_id: "r", track: "api", offset_label: "0", role: "x",
    meta_category: null, target_communities: null, suggested_media: "", sort_order: 0,
    ...partial,
  };
}

describe("groupSlotsByTrack", () => {
  it("separa por trilha preservando ordem", () => {
    const slots = [
      slot({ id: "1", track: "api", sort_order: 0 }),
      slot({ id: "2", track: "grupos", sort_order: 0 }),
      slot({ id: "3", track: "api", sort_order: 1 }),
    ];
    const out = groupSlotsByTrack(slots);
    expect(out.api.map((s) => s.id)).toEqual(["1", "3"]);
    expect(out.grupos.map((s) => s.id)).toEqual(["2"]);
  });

  it("retorna listas vazias quando não há slots", () => {
    expect(groupSlotsByTrack([])).toEqual({ api: [], grupos: [] });
  });
});
