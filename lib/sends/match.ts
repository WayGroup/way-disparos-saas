import { slugifyIdentifier } from "@/lib/text";

export type MatchableCommunity = {
  id: string;
  name: string;
  identifier: string;
  wa_subject: string;
};

const ALL_TOKENS = new Set(["todas", "todos", "todas-as-comunidades", "todos-os-grupos", "geral"]);

/**
 * Resolve o texto livre que a IA escreveu ("Comunidade Ouro, Alunos") contra os grupos
 * reais sincronizados do WhatsApp. É só uma sugestão: quem decide é o multi-select.
 */
export function matchCommunities(freeText: string, communities: MatchableCommunity[]): string[] {
  if (!freeText.trim()) return [];

  const tokens = freeText
    .split(/[,;/+]|\se\s/i)
    .map((t) => slugifyIdentifier(t))
    .filter(Boolean);

  if (tokens.some((t) => ALL_TOKENS.has(t))) {
    return communities.map((c) => c.id);
  }

  const keysOf = (c: MatchableCommunity) =>
    [c.identifier, slugifyIdentifier(c.name), slugifyIdentifier(c.wa_subject)].filter(Boolean);

  const matched = new Set<string>();

  for (const token of tokens) {
    const exact = communities.find((c) => keysOf(c).includes(token));
    if (exact) {
      matched.add(exact.id);
      continue;
    }
    // Fallback: "ouro" casa com "comunidade-ouro". Só se não houver match exato.
    const partial = communities.find((c) =>
      keysOf(c).some((k) => k.includes(token) || token.includes(k)),
    );
    if (partial) matched.add(partial.id);
  }

  return [...matched];
}
