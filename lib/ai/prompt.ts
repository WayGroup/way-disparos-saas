import type { RecipeWithChildren, RecipeSlot } from "@/lib/db/types";

export const SYSTEM_PROMPT = `Você é o Lucas Arruda, mentor da Way Group, escrevendo copy de disparos de WhatsApp na 1ª pessoa.
Regras inegociáveis:
- Português do Brasil, frases curtas, direto, SEM hype, anti-guru.
- NUNCA mencione "Wesley", preço, ou nome de tier/plano.
- O CTA de cada toque segue o PAPEL do toque: convite → reservar a vaga; lembrete/é hoje → confirmar presença; faltam 30 min / ao vivo → entrar na sala (use o link informado nos inputs); fechamento/pós → a Sessão Estratégica gratuita. Quando o papel indicar a Sessão Estratégica, use o link da Sessão informado nos inputs. Nunca cite preço/tier em nenhum CTA.
- Trilha API individual: cada toque tem um TEMPLATE leve (pago) que termina puxando um clique de botão; a mídia persuasiva (casos, números, notícia, áudios) vai só na JANELA de 24h (grátis), nunca no template; e um FALLBACK que nunca queima o lead (reconhece e mantém a porta aberta).
- Marque risk_flag = true quando o template "UTILITY" tiver conteúdo promocional demais (risco de reclassificação da Meta).
- Trilha de Grupos: um post único (copy + mídia) para as comunidades indicadas, sem template/janela/fallback.
- Use {{1}} para o primeiro nome do lead nos templates da API.
- Se houver um campo de "Links para incluir" (ferramentas como MZHUB, CNPJ, Gestor Seller etc.), cite esses links nas mensagens onde fizer sentido apresentá-los; use a URL exatamente como informada e NUNCA invente URLs.
- Botões dos templates da API: cada botão é {type, text, url}. Use type "quick_reply" (texto curto que volta como clique, url="") ou "url" (abre link — preencha url com uma URL informada nos inputs/links, NUNCA invente). No máximo 3 botões curtos por template.
Responda APENAS no formato estruturado pedido.`;

function describeSlots(slots: RecipeSlot[], track: "api" | "grupos"): string {
  return slots
    .filter((s) => s.track === track)
    .map((s, i) => {
      const extra = track === "api"
        ? `categoria Meta sugerida: ${s.meta_category ?? "UTILITY"}`
        : `comunidades-alvo: ${s.target_communities ?? ""}`;
      return `${i + 1}. [${s.offset_label}] ${s.role} — mídia sugerida: ${s.suggested_media} — ${extra}`;
    })
    .join("\n");
}

export function buildGenerationUserPrompt(
  recipe: RecipeWithChildren,
  inputs: Record<string, string>,
  brandText: string,
): string {
  const inputsText = recipe.inputs
    .map((i) => `- ${i.label}: ${inputs[i.label] ?? ""}`)
    .join("\n");
  return `# Base de conhecimento da marca\n${brandText}\n\n# Campanha: ${recipe.name}\n${recipe.description}\n\n# Dados desta campanha\n${inputsText}\n\n# Esqueleto — trilha API individual (gere "touches" nesta ordem)\n${describeSlots(recipe.slots, "api")}\n\n# Esqueleto — trilha Grupos (gere "group_posts" nesta ordem)\n${describeSlots(recipe.slots, "grupos")}\n\nGere a copy de cada toque e post seguindo as regras. Mantenha exatamente a quantidade e a ordem dos slots acima.`;
}
