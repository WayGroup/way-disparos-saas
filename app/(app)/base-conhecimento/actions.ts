"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { slugifyIdentifier } from "@/lib/text";

export async function updateBlockAction(blockKey: string, content: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("brand_knowledge")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("block_key", blockKey);
  if (error) throw new Error(`Falha ao salvar bloco: ${error.message}`);
  revalidatePath("/base-conhecimento");
}

export async function addCommunityAction(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Nome da comunidade é obrigatório.");
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("communities")
    .insert({ name: trimmed, identifier: slugifyIdentifier(trimmed), sort_order: 99 });
  if (error) throw new Error(`Falha ao adicionar comunidade: ${error.message}`);
  revalidatePath("/base-conhecimento");
}

export async function removeCommunityAction(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("communities").delete().eq("id", id);
  if (error) throw new Error(`Falha ao remover comunidade: ${error.message}`);
  revalidatePath("/base-conhecimento");
}
