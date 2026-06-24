import Anthropic from "@anthropic-ai/sdk";
import type { CampaignWithContent } from "@/lib/db/types";
import { SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { REFINE_SCHEMA } from "@/lib/ai/refine-schema";
import { buildRefinePrompt } from "@/lib/ai/refine-prompt";

export type TouchUpdate = {
  sort_order: number;
  offset_label: string;
  role: string;
  meta_category: "UTILITY" | "MARKETING";
  template_body: string;
  buttons: { type: "quick_reply" | "url"; text: string; url: string }[];
  window_steps: { media: string; caption: string }[];
  fallback_copy: string;
  crm_action: string;
  risk_flag: boolean;
};

export type GroupPostUpdate = {
  sort_order: number;
  offset_label: string;
  role: string;
  communities: string;
  copy: string;
  media: string;
};

export type RefineResult = {
  reply: string;
  touch_updates: TouchUpdate[];
  group_post_updates: GroupPostUpdate[];
};

export async function refineCampaign(
  campaign: CampaignWithContent,
  userMessage: string,
  brandText: string,
): Promise<RefineResult> {
  const client = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente (servidor)
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildRefinePrompt(campaign, userMessage, brandText) }],
    output_config: { format: { type: "json_schema", schema: REFINE_SCHEMA } },
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("O refino não retornou conteúdo de texto.");
  }
  return JSON.parse(textBlock.text) as RefineResult;
}
