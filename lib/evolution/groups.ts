import type { EvoGroup } from "@/lib/evolution/types";

/**
 * Lê a resposta de `/group/fetchAllGroups` e devolve os grupos que interessam.
 *
 * Puro de propósito, fora do `client.ts`: aquele arquivo é `server-only` e não pode ser
 * importado por teste. A leitura da resposta é onde mora o risco de erro — o `fetch` em
 * si não é o que quebra.
 *
 * Tolerante por natureza: a Evolution devolve um array em caso normal, mas um objeto de
 * erro quando algo dá errado com HTTP 200. Nesse caso a lista vazia é a resposta certa —
 * quem decide o que fazer com "nenhum grupo" é o `assessSyncRisk`, que barra a
 * desativação em massa antes de qualquer escrita.
 */
export function parseGroupList(data: unknown): EvoGroup[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
    .filter((g) => typeof g.id === "string" && (g.id as string).endsWith("@g.us"))
    .map((g) => ({
      id: g.id as string,
      subject: typeof g.subject === "string" ? g.subject : "",
      size: typeof g.size === "number" ? g.size : undefined,
      pictureUrl: typeof g.pictureUrl === "string" ? g.pictureUrl : null,
      isCommunity: typeof g.isCommunity === "boolean" ? g.isCommunity : undefined,
      announce: typeof g.announce === "boolean" ? g.announce : undefined,
    }));
}
