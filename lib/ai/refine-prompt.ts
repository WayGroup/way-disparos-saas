import type { CampaignWithContent } from "@/lib/db/types";

export function buildRefinePrompt(
  campaign: CampaignWithContent,
  userMessage: string,
  brandText: string,
): string {
  const touches = campaign.touches
    .map(
      (t) =>
        `- [API] sort_order ${t.sort_order} · ${t.offset_label} · ${t.role} · ${t.meta_category}\n  template: ${t.template_body}\n  botões: ${t.buttons.join(" | ")}\n  janela: ${t.window_steps.map((w) => `${w.media}: ${w.caption}`).join(" / ")}\n  fallback: ${t.fallback_copy}\n  crm: ${t.crm_action} · risco: ${t.risk_flag}`,
    )
    .join("\n");
  const posts = campaign.group_posts
    .map(
      (p) =>
        `- [GRUPOS] sort_order ${p.sort_order} · ${p.offset_label} · ${p.role} · comunidades ${p.communities}\n  copy: ${p.copy}\n  mídia: ${p.media}`,
    )
    .join("\n");

  return `# Base de conhecimento da marca\n${brandText}\n\n# Estado atual da campanha "${campaign.name}"\n## Trilha API individual\n${touches}\n\n## Trilha Grupos\n${posts}\n\n# Pedido do usuário\n${userMessage}\n\nAplique SÓ o que o pedido pede, respeitando as regras da marca. Retorne uma resposta curta de chat (reply) explicando o que mudou, e a lista de atualizações: para cada toque/post alterado, devolva o objeto COMPLETO atualizado com o mesmo sort_order e trilha. Não inclua toques/posts que você não alterou.`;
}
