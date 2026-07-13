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

/** Só as comunidades que têm grupo de WhatsApp vinculado e ativo — as que dá para enviar. */
export async function listActiveGroups(): Promise<Community[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .not("wa_group_id", "is", null)
    .eq("active", true)
    .order("sort_order");
  if (error) throw new Error(`Falha ao carregar grupos: ${error.message}`);
  return (data ?? []) as Community[];
}
