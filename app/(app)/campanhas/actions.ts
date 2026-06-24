"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getRecipe } from "@/lib/db/recipes";
import { getCampaign } from "@/lib/db/campaigns";
import { listBrandBlocks } from "@/lib/db/brand-knowledge";
import { compileBrandKnowledge } from "@/lib/ai/brand";
import { generateCampaign } from "@/lib/ai/generate";
import { refineCampaign } from "@/lib/ai/refine";
import { buildCode } from "@/lib/ai/nomenclature";

export type TouchFields = {
  offset_label: string;
  role: string;
  meta_category: "UTILITY" | "MARKETING";
  template_body: string;
  buttons: { type: "quick_reply" | "url"; text: string; url: string }[];
  window_steps: { media: string; caption: string }[];
  fallback_copy: string;
  crm_action: string;
  risk_flag: boolean;
  template_name: string;
};

export type PostFields = {
  offset_label: string;
  role: string;
  communities: string;
  copy: string;
  media: string;
  message_code: string;
};

export async function generateCampaignAction(
  recipeId: string,
  name: string,
  inputs: Record<string, string>,
): Promise<string> {
  const recipe = await getRecipe(recipeId);
  if (!recipe) throw new Error("Receita não encontrada.");
  const brandText = compileBrandKnowledge(await listBrandBlocks());

  const content = await generateCampaign(recipe, inputs, brandText);

  const anchorLabel = recipe.inputs.find((i) => i.is_anchor)?.label;
  const anchorValue = anchorLabel ? (inputs[anchorLabel] ?? "") : "";
  const apiSlots = recipe.slots.filter((s) => s.track === "api");
  const gruposSlots = recipe.slots.filter((s) => s.track === "grupos");

  const supabase = await createServerSupabase();
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({ recipe_id: recipeId, name: name.trim() || recipe.name, inputs })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao salvar campanha: ${error.message}`);
  const campaignId = campaign.id as string;

  if (content.touches.length > 0) {
    const { error: e1 } = await supabase.from("campaign_touches").insert(
      content.touches.map((t, idx) => ({
        campaign_id: campaignId,
        sort_order: idx,
        ...t,
        template_name: buildCode(recipe.recipe_type, apiSlots[idx]?.code ?? "", anchorValue),
      })),
    );
    if (e1) throw new Error(`Falha ao salvar toques: ${e1.message}`);
  }
  if (content.group_posts.length > 0) {
    const { error: e2 } = await supabase.from("campaign_group_posts").insert(
      content.group_posts.map((p, idx) => ({
        campaign_id: campaignId,
        sort_order: idx,
        ...p,
        message_code: buildCode(recipe.recipe_type, gruposSlots[idx]?.code ?? "", anchorValue),
      })),
    );
    if (e2) throw new Error(`Falha ao salvar posts: ${e2.message}`);
  }

  revalidatePath("/campanhas");
  return campaignId;
}

export async function approveCampaignAction(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "aprovada", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Falha ao aprovar campanha: ${error.message}`);
  revalidatePath("/campanhas");
  revalidatePath(`/campanhas/${id}`);
}

export async function refineCampaignAction(
  campaignId: string,
  message: string,
): Promise<string> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Escreva o que você quer ajustar.");
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campanha não encontrada.");
  const brandText = compileBrandKnowledge(await listBrandBlocks());

  const result = await refineCampaign(campaign, trimmed, brandText);

  const supabase = await createServerSupabase();

  // Persiste mensagem do usuário
  const { error: e1 } = await supabase.from("chat_messages").insert({
    campaign_id: campaignId,
    role: "user",
    content: trimmed,
  });
  if (e1) throw new Error(`Falha ao salvar mensagem do usuário: ${e1.message}`);

  // Aplica atualizações de toques por (campaign_id, sort_order)
  for (const touch of result.touch_updates) {
    const { sort_order, ...fields } = touch;
    const { error } = await supabase
      .from("campaign_touches")
      .update(fields)
      .eq("campaign_id", campaignId)
      .eq("sort_order", sort_order);
    if (error) throw new Error(`Falha ao atualizar toque ${sort_order}: ${error.message}`);
  }

  // Aplica atualizações de posts por (campaign_id, sort_order)
  for (const post of result.group_post_updates) {
    const { sort_order, ...fields } = post;
    const { error } = await supabase
      .from("campaign_group_posts")
      .update(fields)
      .eq("campaign_id", campaignId)
      .eq("sort_order", sort_order);
    if (error) throw new Error(`Falha ao atualizar post ${sort_order}: ${error.message}`);
  }

  // Persiste reply do assistente
  const { error: e2 } = await supabase.from("chat_messages").insert({
    campaign_id: campaignId,
    role: "assistant",
    content: result.reply,
  });
  if (e2) throw new Error(`Falha ao salvar reply do assistente: ${e2.message}`);

  revalidatePath(`/campanhas/${campaignId}`);
  return result.reply;
}

export async function updateTouchAction(
  campaignId: string,
  sortOrder: number,
  fields: TouchFields,
): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("campaign_touches")
    .update(fields)
    .eq("campaign_id", campaignId)
    .eq("sort_order", sortOrder);
  if (error) throw new Error(`Falha ao atualizar toque: ${error.message}`);
  revalidatePath(`/campanhas/${campaignId}`);
}

export async function updateGroupPostAction(
  campaignId: string,
  sortOrder: number,
  fields: PostFields,
): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("campaign_group_posts")
    .update(fields)
    .eq("campaign_id", campaignId)
    .eq("sort_order", sortOrder);
  if (error) throw new Error(`Falha ao atualizar post: ${error.message}`);
  revalidatePath(`/campanhas/${campaignId}`);
}
