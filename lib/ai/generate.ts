import Anthropic from "@anthropic-ai/sdk";
import type { RecipeWithChildren, CampaignTouch, CampaignGroupPost } from "@/lib/db/types";
import { SYSTEM_PROMPT, buildGenerationUserPrompt } from "@/lib/ai/prompt";
import { GENERATION_SCHEMA } from "@/lib/ai/schema";
import { friendlyAnthropicError } from "@/lib/ai/anthropic-error";

export type GeneratedContent = {
  touches: Omit<CampaignTouch, "id" | "campaign_id" | "sort_order">[];
  group_posts: Omit<CampaignGroupPost, "id" | "campaign_id" | "sort_order">[];
};

export async function generateCampaign(
  recipe: RecipeWithChildren,
  inputs: Record<string, string>,
  brandText: string,
): Promise<GeneratedContent> {
  const client = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente (servidor)
  // Streaming evita timeout de request em gerações longas (~30-60s); finalMessage() junta tudo.
  const params = {
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildGenerationUserPrompt(recipe, inputs, brandText) }],
    output_config: { format: { type: "json_schema", schema: GENERATION_SCHEMA } },
  };
  let response;
  try {
    const stream = client.messages.stream(params as Parameters<typeof client.messages.stream>[0]);
    response = await stream.finalMessage();
  } catch (e) {
    // Erro da API (sem créditos, rate limit, chave inválida) vira mensagem clara em vez
    // do críptico "Server Components render".
    throw friendlyAnthropicError(e);
  }

  if (response.stop_reason === "max_tokens") {
    throw new Error("A campanha ficou grande demais e a resposta foi cortada. Tente uma receita com menos peças.");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("A geração não retornou conteúdo de texto.");
  }
  try {
    return JSON.parse(textBlock.text) as GeneratedContent;
  } catch {
    throw new Error("A IA devolveu uma resposta incompleta. Tente gerar de novo.");
  }
}
