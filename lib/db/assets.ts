import { createServerSupabase } from "@/lib/supabase/server";
import type { Asset } from "@/lib/db/types";

export async function listAssets(): Promise<Asset[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao carregar mídias: ${error.message}`);
  return (data ?? []) as Asset[];
}
