export type ConsensusResult =
  | { uniform: true; ids: string[] }
  | { uniform: false; customized: number };

const key = (ids: string[]) => [...ids].sort().join("|");

/**
 * O cabeçalho da campanha só pode dizer "os grupos da campanha são estes" se todas as
 * peças concordarem. Não existe grupo-da-campanha persistido: a peça é a fonte de
 * verdade, e pode divergir.
 *
 * Se divergirem, o cabeçalho diz isso — em vez de mentir mostrando os grupos de uma
 * peça qualquer como se fossem os de todas.
 */
export function groupConsensus(posts: { community_ids: string[] }[]): ConsensusResult {
  if (posts.length === 0) return { uniform: true, ids: [] };

  const counts = new Map<string, number>();
  for (const p of posts) {
    const k = key(p.community_ids);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  if (counts.size === 1) return { uniform: true, ids: [...posts[0].community_ids].sort() };

  const majority = Math.max(...counts.values());
  return { uniform: false, customized: posts.length - majority };
}
