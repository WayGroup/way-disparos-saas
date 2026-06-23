import { createServerSupabase } from "@/lib/supabase/server";
import type { Recipe, RecipeInput, RecipeSlot, RecipeWithChildren } from "@/lib/db/types";

export async function listRecipes(): Promise<Recipe[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("recipes").select("*").order("created_at");
  if (error) throw new Error(`Falha ao carregar receitas: ${error.message}`);
  return (data ?? []) as Recipe[];
}

export async function getRecipe(id: string): Promise<RecipeWithChildren | null> {
  const supabase = await createServerSupabase();
  const { data: recipe, error } = await supabase.from("recipes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao carregar receita: ${error.message}`);
  if (!recipe) return null;

  const { data: inputs, error: e1 } = await supabase
    .from("recipe_inputs").select("*").eq("recipe_id", id).order("sort_order");
  if (e1) throw new Error(`Falha ao carregar inputs: ${e1.message}`);

  const { data: slots, error: e2 } = await supabase
    .from("recipe_slots").select("*").eq("recipe_id", id).order("sort_order");
  if (e2) throw new Error(`Falha ao carregar slots: ${e2.message}`);

  return {
    ...(recipe as Recipe),
    inputs: (inputs ?? []) as RecipeInput[],
    slots: (slots ?? []) as RecipeSlot[],
  };
}
