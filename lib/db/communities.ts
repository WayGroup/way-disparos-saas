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

/**
 * Os grupos que podem receber disparo: existem no WhatsApp (`active`) E foram
 * escolhidos por alguém (`enabled`). Sincronizar 200 grupos não habilita nenhum.
 */
export async function listActiveGroups(): Promise<Community[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .not("wa_group_id", "is", null)
    .eq("active", true)
    .eq("enabled", true)
    .order("wa_subject");
  if (error) throw new Error(`Falha ao carregar grupos: ${error.message}`);
  return (data ?? []) as Community[];
}

/** Todos os grupos sincronizados, habilitados ou não. É a lista da tela de Conexão. */
export async function listSyncedGroups(): Promise<Community[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .not("wa_group_id", "is", null)
    .order("wa_subject");
  if (error) throw new Error(`Falha ao carregar grupos: ${error.message}`);
  return (data ?? []) as Community[];
}
