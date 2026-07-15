import { slugifyIdentifier } from "@/lib/text";

/** Próximo sort_order livre: max + 1, ou 0 se não houver peças. */
export function nextSortOrder(items: { sort_order: number }[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((i) => i.sort_order)) + 1;
}

/**
 * Grupos que uma peça nova herda: os do post com MAIS grupos selecionados;
 * empate → menor sort_order; [] se nenhum post tiver grupos.
 */
export function pickReferenceGroups(
  posts: { sort_order: number; community_ids: string[] }[],
): string[] {
  let best: { sort_order: number; community_ids: string[] } | null = null;
  for (const p of posts) {
    if (p.community_ids.length === 0) continue;
    if (
      !best ||
      p.community_ids.length > best.community_ids.length ||
      (p.community_ids.length === best.community_ids.length && p.sort_order < best.sort_order)
    ) {
      best = p;
    }
  }
  return best ? best.community_ids : [];
}

/** Código curto p/ buildCode a partir do papel da peça nova. */
export function slugCode(role: string): string {
  return slugifyIdentifier(role);
}

/** Selo factual do que o refino inseriu; "" quando nada foi adicionado. */
export function formatAddedSeal(addedPosts: number, addedTouches: number): string {
  const parts: string[] = [];
  if (addedPosts > 0) parts.push(`${addedPosts} ${addedPosts > 1 ? "posts" : "post"}`);
  if (addedTouches > 0) parts.push(`${addedTouches} ${addedTouches > 1 ? "toques" : "toque"}`);
  if (parts.length === 0) return "";
  const plural = addedPosts + addedTouches > 1;
  return `✓ ${parts.join(" e ")} adicionado${plural ? "s" : ""}.\n\n`;
}
