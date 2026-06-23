import { createServerSupabase } from "@/lib/supabase/server";
import type { BrandBlock } from "@/lib/db/types";

export async function listBrandBlocks(): Promise<BrandBlock[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("brand_knowledge")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(`Falha ao carregar base de conhecimento: ${error.message}`);
  return (data ?? []) as BrandBlock[];
}
