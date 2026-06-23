import { createServerSupabase } from "@/lib/supabase/server";
import type { Community } from "@/lib/db/types";

export async function listCommunities(): Promise<Community[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(`Falha ao carregar comunidades: ${error.message}`);
  return (data ?? []) as Community[];
}
