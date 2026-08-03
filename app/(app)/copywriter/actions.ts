"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCopyChat } from "@/lib/db/copy-chats";
import { compileBrandKnowledge } from "@/lib/ai/brand";
import { listBrandBlocks } from "@/lib/db/brand-knowledge";
import { generateCopyReply, chatTitleFrom, type Attachment } from "@/lib/ai/copy-chat";
import { listLinks } from "@/lib/db/links";
import { validateRecipeDraft, toSaveRecipePayload, formatRecipeSeal, type RecipeDraft } from "@/lib/ai/recipe-tool";

export async function createCopyChatAction(): Promise<string> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("copy_chats")
    .insert({})
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar conversa: ${error.message}`);
  revalidatePath("/copywriter");
  return data.id as string;
}

export async function sendCopyMessageAction(
  chatId: string,
  message: string,
  attachments: Attachment[] = [],
): Promise<string> {
  const trimmed = message.trim();
  if (!trimmed && attachments.length === 0) throw new Error("Escreva sua mensagem ou anexe um arquivo.");

  const data = await getCopyChat(chatId);
  if (!data) throw new Error("Conversa não encontrada.");

  const supabase = await createServerSupabase();

  const { error: e1 } = await supabase
    .from("copy_messages")
    .insert({ chat_id: chatId, role: "user", content: trimmed, attachments });
  if (e1) throw new Error(`Falha ao salvar mensagem: ${e1.message}`);

  if (data.chat.title === "Nova conversa") {
    const title = trimmed ? chatTitleFrom(trimmed) : "Imagem/arquivo";
    await supabase
      .from("copy_chats")
      .update({ title })
      .eq("id", chatId);
  }

  const history = [
    ...data.messages.map((m) => ({ role: m.role, content: m.content, attachments: m.attachments ?? [] })),
    { role: "user" as const, content: trimmed, attachments },
  ];

  const brandText = compileBrandKnowledge(await listBrandBlocks());
  const linkLabels = (await listLinks()).map((l) => l.label);

  // Executor da tool criar_receita: cria um RASCUNHO (active=false) reusando save_recipe.
  // Vive na action porque toca o banco; o lib/ai só recebe o callback.
  async function onCreateRecipe(
    draft: RecipeDraft,
  ): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
    const v = validateRecipeDraft(draft);
    if (!v.ok) return { ok: false, error: v.error };
    const recipeName = draft.name.trim() || "Receita sem nome";
    const { data: rec, error: eRec } = await supabase
      .from("recipes")
      .insert({ name: recipeName, recipe_type: "custom", active: false })
      .select("id")
      .single();
    if (eRec) return { ok: false, error: `Falha ao criar a receita: ${eRec.message}` };
    const id = rec.id as string;
    const payload = toSaveRecipePayload(draft);
    const { error: eSave } = await supabase.rpc("save_recipe", {
      p_id: id,
      p_name: recipeName,
      p_description: draft.description ?? "",
      p_active: false,
      p_inputs: payload.inputs,
      p_slots: payload.slots,
    });
    if (eSave) {
      await supabase.from("recipes").delete().eq("id", id); // rollback do rascunho órfão
      return { ok: false, error: `Falha ao salvar a receita: ${eSave.message}` };
    }
    return { ok: true, id, name: recipeName };
  }

  const { reply, createdRecipes } = await generateCopyReply(history, brandText, { linkLabels, onCreateRecipe });

  // O link do rascunho é derivado no servidor (não confiado ao texto do modelo).
  const seal = formatRecipeSeal(createdRecipes);
  const finalReply = seal ? `${reply}\n\n${seal}` : reply;

  const { error: e2 } = await supabase
    .from("copy_messages")
    .insert({ chat_id: chatId, role: "assistant", content: finalReply });
  if (e2) throw new Error(`Falha ao salvar resposta: ${e2.message}`);

  await supabase
    .from("copy_chats")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", chatId);

  if (createdRecipes.length > 0) revalidatePath("/receitas");
  revalidatePath("/copywriter");
  revalidatePath(`/copywriter/${chatId}`);
  return finalReply;
}

export async function deleteCopyChatAction(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("copy_chats").delete().eq("id", id);
  if (error) throw new Error(`Falha ao remover conversa: ${error.message}`);
  revalidatePath("/copywriter");
}
