import { slugifyIdentifier } from "@/lib/text";

export function buildCode(recipeType: string, slotCode: string, anchor: string): string {
  const base = `${slugifyIdentifier(recipeType)}_${slugifyIdentifier(slotCode)}`;
  const d = anchor ? new Date(anchor) : null;
  if (!d || Number.isNaN(d.getTime())) return base;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base}_${pad(d.getDate())}${pad(d.getMonth() + 1)}`;
}
