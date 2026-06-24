import { createServerSupabase } from "@/lib/supabase/server";
import type { StandardLink } from "@/lib/db/types";

export async function listLinks(): Promise<StandardLink[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("links").select("*").order("sort_order");
  if (error) throw new Error(`Falha ao carregar links: ${error.message}`);
  return (data ?? []) as StandardLink[];
}
