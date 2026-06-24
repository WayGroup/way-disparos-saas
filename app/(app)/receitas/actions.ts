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

  const { error: upErr } = await supabase
    .from("recipes")
    .update({
      name: payload.name,
      description: payload.description,
      active: payload.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (upErr) throw new Error(`Falha ao salvar receita: ${upErr.message}`);

  const { error: delInputsErr } = await supabase.from("recipe_inputs").delete().eq("recipe_id", id);
  if (delInputsErr) throw new Error(`Falha ao limpar inputs: ${delInputsErr.message}`);
  const { error: delSlotsErr } = await supabase.from("recipe_slots").delete().eq("recipe_id", id);
  if (delSlotsErr) throw new Error(`Falha ao limpar slots: ${delSlotsErr.message}`);

  if (payload.inputs.length > 0) {
    const { error } = await supabase.from("recipe_inputs").insert(
      payload.inputs.map((i, idx) => ({ recipe_id: id, ...i, sort_order: idx })),
    );
    if (error) throw new Error(`Falha ao salvar inputs: ${error.message}`);
  }
  if (payload.slots.length > 0) {
    const { error } = await supabase.from("recipe_slots").insert(
      payload.slots.map((s, idx) => ({ recipe_id: id, ...s, sort_order: idx })),
    );
    if (error) throw new Error(`Falha ao salvar slots: ${error.message}`);
  }

  revalidatePath("/receitas");
  revalidatePath(`/receitas/${id}`);
}
