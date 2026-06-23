import type { RecipeSlot } from "@/lib/db/types";

export function groupSlotsByTrack(slots: RecipeSlot[]): { api: RecipeSlot[]; grupos: RecipeSlot[] } {
  return {
    api: slots.filter((s) => s.track === "api"),
    grupos: slots.filter((s) => s.track === "grupos"),
  };
}
