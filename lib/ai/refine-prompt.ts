import type { CampaignWithContent } from "@/lib/db/types";

export function buildRefinePrompt(
  campaign: CampaignWithContent,
  userMessage: string,
  brandText: string,
  anchorLabel: string,
  anchorValue: string,
): string {
  const touches = campaign.touches
    .map(
      (t) =>
        `- [API] sort_order ${t.sort_order} · ${t.offset_label} · envia ${t.send_at || "—"} · ${t.role} · ${t.meta_category}\n  template: ${t.template_body}\n  botões: ${t.buttons.map((b) => b.type === "url" ? `${b.text} → ${b.url}` : b.text).join(" | ")}\n  janela: ${t.window_steps.map((w) => `${w.media}: ${w.caption}`).join(" / ")}\n  fallback: ${t.fallback_copy}\n  crm: ${t.crm_action} · risco: ${t.risk_flag}`,
    )
    .join("\n");
  const posts = campaign.group_posts
    .map(
      (p) =>
        `- [GRUPOS] sort_order ${p.sort_order} · ${p.offset_label} · envia ${p.send_at || "—"} · ${p.role}\n  copy: ${p.copy}\n  mídia: ${p.media}`,
    )
    .join("\n");

  return `# Base de conhecimento da marca\n${brandText}\n\n# Âncora da campanha\n${anchorLabel || "(sem âncora)"}: ${anchorValue || "(não informada)"}\nCada peça é agendada por um offset em dias relativo a esta âncora (negativo = antes). Compare o "envia" de cada peça com a âncora para inferir o offset atual.\n\n# Estado atual da campanha "${campaign.name}"\n## Trilha API individual\n${touches}\n\n## Trilha Grupos\n${posts}\n\n# Pedido do usuário\n${userMessage}\n\nAplique SÓ o que o pedido pede, respeitando as regras da marca.\n\n- Para EDITAR uma peça existente: devolva o objeto COMPLETO em touch_updates/group_post_updates com o MESMO sort_order. Não inclua peças que você não alterou.\n- Para ADICIONAR peças novas: use new_touches/new_group_posts. Cada peça nova precisa de offset_days (int, negativo = antes da âncora), offset_time ("HH:mm") e offset_label (rótulo humano coerente, ex. "D-7"). NÃO invente sort_order para peças novas — o sistema atribui.\n- Para EXCLUIR peças: liste o sort_order de cada uma em deleted_touches (trilha API) e/ou deleted_group_posts (trilha Grupos). Exclua APENAS o que o usuário pediu explicitamente para remover/apagar — nunca por conta própria. A exclusão é feita pelo sistema; basta listar os sort_order.\n- No reply (chat curto), relate APENAS o que você de fato devolveu: quantas peças adicionadas, editadas e removidas. Nunca afirme ter criado, alterado ou apagado algo que não esteja em new_touches/new_group_posts/touch_updates/group_post_updates/deleted_touches/deleted_group_posts.`;
}
