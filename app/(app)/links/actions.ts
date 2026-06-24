"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

export async function addLinkAction(label: string, url: string, description: string): Promise<void> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Dê um nome ao link.");
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("links")
    .insert({ label: trimmed, url: url.trim(), description: description.trim(), sort_order: 99 });
  if (error) throw new Error(`Falha ao adicionar link: ${error.message}`);
  revalidatePath("/links");
}

export async function updateLinkAction(
  id: string,
  fields: { label: string; url: string; description: string },
): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("links")
    .update({ label: fields.label.trim(), url: fields.url.trim(), description: fields.description.trim() })
    .eq("id", id);
  if (error) throw new Error(`Falha ao salvar link: ${error.message}`);
  revalidatePath("/links");
}

export async function removeLinkAction(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("links").delete().eq("id", id);
  if (error) throw new Error(`Falha ao remover link: ${error.message}`);
  revalidatePath("/links");
}
