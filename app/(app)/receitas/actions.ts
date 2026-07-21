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
  offset_minutes: number;
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
  const id = data.id as string;

  // Toda receita nasce com os dois campos que o agendamento exige: um nome interno
  // e a data-âncora (sem âncora, computeSendAt não tem de onde partir).
  const { error: eInputs } = await supabase.from("recipe_inputs").insert([
    { recipe_id: id, label: "Nome interno", field_type: "texto", required: true, is_anchor: false, sort_order: 0 },
    { recipe_id: id, label: "Data e hora do evento", field_type: "data_hora", required: true, is_anchor: true, sort_order: 1 },
  ]);
  if (eInputs) {
    // rollback compensatório: não deixar receita órfã sem âncora
    await supabase.from("recipes").delete().eq("id", id);
    throw new Error(`Falha ao criar os campos padrão da receita: ${eInputs.message}`);
  }

  revalidatePath("/receitas");
  return id;
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
