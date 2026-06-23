import Anthropic from "@anthropic-ai/sdk";
import type { RecipeWithChildren, CampaignTouch, CampaignGroupPost } from "@/lib/db/types";
import { SYSTEM_PROMPT, buildGenerationUserPrompt } from "@/lib/ai/prompt";
import { GENERATION_SCHEMA } from "@/lib/ai/schema";

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
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildGenerationUserPrompt(recipe, inputs, brandText) }],
    output_config: { format: { type: "json_schema", schema: GENERATION_SCHEMA } },
    // Se a versão instalada do SDK não tipar `thinking`/`output_config`, faça o cast
    // do objeto de params (ex.: `as Anthropic.MessageCreateParamsNonStreaming`) — não remova os campos.
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("A geração não retornou conteúdo de texto.");
  }
  return JSON.parse(textBlock.text) as GeneratedContent;
}
