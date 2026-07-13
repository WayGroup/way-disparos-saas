import { createServerSupabase } from "@/lib/supabase/server";
import type { Campaign, CampaignTouch, CampaignGroupPost, CampaignWithContent } from "@/lib/db/types";

export async function listCampaigns(): Promise<(Campaign & { recipe_name: string | null })[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*, recipes(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao carregar campanhas: ${error.message}`);
  return (data ?? []).map((c: Record<string, unknown>) => ({
    ...(c as Campaign),
    recipe_name: (c.recipes as { name: string } | null)?.name ?? null,
  }));
}

export async function getCampaign(id: string): Promise<CampaignWithContent | null> {
  const supabase = await createServerSupabase();
  const { data: campaign, error } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao carregar campanha: ${error.message}`);
  if (!campaign) return null;
  const { data: touches, error: e1 } = await supabase
    .from("campaign_touches").select("*").eq("campaign_id", id).order("sort_order");
  if (e1) throw new Error(`Falha ao carregar toques: ${e1.message}`);
  const { data: posts, error: e2 } = await supabase
    .from("campaign_group_posts")
    .select("*, campaign_group_post_communities(community_id)")
    .eq("campaign_id", id)
    .order("sort_order");
  if (e2) throw new Error(`Falha ao carregar posts: ${e2.message}`);

  const group_posts = (posts ?? []).map((p: Record<string, unknown>) => {
    const { campaign_group_post_communities: links, ...post } = p;
    return {
      ...(post as Omit<CampaignGroupPost, "community_ids">),
      community_ids: ((links ?? []) as { community_id: string }[]).map((l) => l.community_id),
    };
  });

  return {
    ...(campaign as Campaign),
    touches: (touches ?? []) as CampaignTouch[],
    group_posts,
  };
}
