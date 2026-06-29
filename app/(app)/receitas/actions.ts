"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

export type SaveInput = {
  label: string;
  field_type: string;
  required: boolean;
  is_anchor: boolean;
};

export type SaveSlot = {
  track: "api" | "grupos";
  offset_label: string;
  code: string;
  role: string;
  meta_category: "UTILITY" | "MARKETING" | null;
  target_communities: string | null;
  suggested_media: string;
  offset_days: number;
  offset_time: string;
};

export type SaveRecipePayload = {
  name: string;
  description: string;
  active: boolean;
  inputs: SaveInput[];
  slots: SaveSlot[];
};

export async function createRecipeAction(): Promise<string> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("recipes")
    .insert({ name: "Nova receita", recipe_type: "custom" })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar receita: ${error.message}`);
  revalidatePath("/receitas");
  return data.id as string;
}

export async function deleteRecipeAction(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw new Error(`Falha ao remover receita: ${error.message}`);
  revalidatePath("/receitas");
}

export async function saveRecipeAction(id: string, payload: SaveRecipePayload): Promise<void> {
  const supabase = await createServerSupabase();

  // Salva tudo numa única transação atômica (função save_recipe — migração 0010).
  // O sort_order é derivado da ordem dos arrays dentro da função (with ordinality).
  const { error } = await supabase.rpc("save_recipe", {
    p_id: id,
    p_name: payload.name,
    p_description: payload.description,
    p_active: payload.active,
    p_inputs: payload.inputs,
    p_slots: payload.slots,
  });
  if (error) throw new Error(`Falha ao salvar receita: ${error.message}`);

  revalidatePath("/receitas");
  revalidatePath(`/receitas/${id}`);
}
