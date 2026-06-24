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
import { computeSendAt } from "@/lib/schedule";

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
        send_at: computeSendAt(anchorValue, apiSlots[idx]?.offset_days ?? 0, apiSlots[idx]?.offset_time ?? ""),
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
        send_at: computeSendAt(anchorValue, gruposSlots[idx]?.offset_days ?? 0, gruposSlots[idx]?.offset_time ?? ""),
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
    const current = campaign.touches.find((t) => t.sort_order === sort_order);
    const mergedSteps = (fields.window_steps ?? []).map((w, i) => {
      const prev = current?.window_steps?.[i];
      return prev?.asset_id ? { ...w, asset_id: prev.asset_id } : w;
    });
    const { error } = await supabase
      .from("campaign_touches")
      .update({ ...fields, window_steps: mergedSteps })
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

export async function setTouchStepAssetAction(campaignId: string, sortOrder: number, stepIndex: number, assetId: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("campaign_touches").select("window_steps").eq("campaign_id", campaignId).eq("sort_order", sortOrder).single();
  if (error) throw new Error(`Falha ao carregar toque: ${error.message}`);
  const steps = ((data?.window_steps ?? []) as { media: string; caption: string; asset_id?: string }[]).map((s, i) => i === stepIndex ? (assetId ? { ...s, asset_id: assetId } : (() => { const { asset_id, ...rest } = s; return rest; })()) : s);
  const { error: e2 } = await supabase.from("campaign_touches").update({ window_steps: steps }).eq("campaign_id", campaignId).eq("sort_order", sortOrder);
  if (e2) throw new Error(`Falha ao anexar mídia: ${e2.message}`);
  revalidatePath(`/campanhas/${campaignId}`);
}

export async function setPostAssetAction(campaignId: string, sortOrder: number, assetId: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("campaign_group_posts").update({ asset_id: assetId || null }).eq("campaign_id", campaignId).eq("sort_order", sortOrder);
  if (error) throw new Error(`Falha ao anexar mídia: ${error.message}`);
  revalidatePath(`/campanhas/${campaignId}`);
}

export async function duplicateCampaignAction(campaignId: string, newAnchor: string, newName: string): Promise<string> {
  const src = await getCampaign(campaignId);
  if (!src) throw new Error("Campanha não encontrada.");
  const recipe = src.recipe_id ? await getRecipe(src.recipe_id) : null;

  const anchorLabel = recipe?.inputs.find((i) => i.is_anchor)?.label;
  const inputs = { ...src.inputs };
  if (anchorLabel && newAnchor) inputs[anchorLabel] = newAnchor;
  const anchorValue = anchorLabel ? (inputs[anchorLabel] ?? "") : "";
  const apiSlots = recipe?.slots.filter((s) => s.track === "api") ?? [];
  const gruposSlots = recipe?.slots.filter((s) => s.track === "grupos") ?? [];

  const supabase = await createServerSupabase();
  const { data: campaign, error } = await supabase.from("campaigns")
    .insert({ recipe_id: src.recipe_id, name: newName.trim() || `${src.name} (cópia)`, inputs })
    .select("id").single();
  if (error) throw new Error(`Falha ao duplicar campanha: ${error.message}`);
  const newId = campaign.id as string;

  if (src.touches.length > 0) {
    const { error: e1 } = await supabase.from("campaign_touches").insert(src.touches.map((t, idx) => ({
      campaign_id: newId, sort_order: t.sort_order,
      offset_label: t.offset_label, role: t.role, meta_category: t.meta_category,
      template_body: t.template_body, buttons: t.buttons, window_steps: t.window_steps,
      fallback_copy: t.fallback_copy, crm_action: t.crm_action, risk_flag: t.risk_flag,
      template_name: recipe ? buildCode(recipe.recipe_type, apiSlots[idx]?.code ?? "", anchorValue) : t.template_name,
      send_at: recipe ? computeSendAt(anchorValue, apiSlots[idx]?.offset_days ?? 0, apiSlots[idx]?.offset_time ?? "") : t.send_at,
    })));
    if (e1) throw new Error(`Falha ao duplicar toques: ${e1.message}`);
  }
  if (src.group_posts.length > 0) {
    const { error: e2 } = await supabase.from("campaign_group_posts").insert(src.group_posts.map((p, idx) => ({
      campaign_id: newId, sort_order: p.sort_order,
      offset_label: p.offset_label, role: p.role, communities: p.communities,
      copy: p.copy, media: p.media, asset_id: p.asset_id,
      message_code: recipe ? buildCode(recipe.recipe_type, gruposSlots[idx]?.code ?? "", anchorValue) : p.message_code,
      send_at: recipe ? computeSendAt(anchorValue, gruposSlots[idx]?.offset_days ?? 0, gruposSlots[idx]?.offset_time ?? "") : p.send_at,
    })));
    if (e2) throw new Error(`Falha ao duplicar posts: ${e2.message}`);
  }
  revalidatePath("/campanhas");
  return newId;
}
