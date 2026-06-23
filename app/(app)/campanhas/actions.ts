"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getRecipe } from "@/lib/db/recipes";
import { listBrandBlocks } from "@/lib/db/brand-knowledge";
import { compileBrandKnowledge } from "@/lib/ai/brand";
import { generateCampaign } from "@/lib/ai/generate";

export async function generateCampaignAction(
  recipeId: string,
  name: string,
  inputs: Record<string, string>,
): Promise<string> {
  const recipe = await getRecipe(recipeId);
  if (!recipe) throw new Error("Receita não encontrada.");
  const brandText = compileBrandKnowledge(await listBrandBlocks());

  const content = await generateCampaign(recipe, inputs, brandText);

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
      content.touches.map((t, idx) => ({ campaign_id: campaignId, sort_order: idx, ...t })),
    );
    if (e1) throw new Error(`Falha ao salvar toques: ${e1.message}`);
  }
  if (content.group_posts.length > 0) {
    const { error: e2 } = await supabase.from("campaign_group_posts").insert(
      content.group_posts.map((p, idx) => ({ campaign_id: campaignId, sort_order: idx, ...p })),
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
