"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { assetKindFromMime } from "@/lib/assets/kind";

export async function registerAssetAction(input: {
  filename: string;
  storagePath: string;
  mime: string;
  size: number;
}): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("assets").insert({
    filename: input.filename,
    storage_path: input.storagePath,
    kind: assetKindFromMime(input.mime),
    mime_type: input.mime,
    size_bytes: input.size,
  });
  if (error) throw new Error(`Falha ao registrar mídia: ${error.message}`);
  revalidatePath("/midias");
}

export async function deleteAssetAction(id: string, storagePath: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error: storageError } = await supabase.storage.from("assets").remove([storagePath]);
  if (storageError) throw new Error(`Falha ao remover arquivo: ${storageError.message}`);
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) throw new Error(`Falha ao remover mídia: ${error.message}`);
  revalidatePath("/midias");
}
