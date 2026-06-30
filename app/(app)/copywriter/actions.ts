"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCopyChat } from "@/lib/db/copy-chats";
import { compileBrandKnowledge } from "@/lib/ai/brand";
import { listBrandBlocks } from "@/lib/db/brand-knowledge";
import { generateCopyReply, chatTitleFrom } from "@/lib/ai/copy-chat";

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

export async function sendCopyMessageAction(chatId: string, message: string): Promise<string> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Escreva sua mensagem.");

  const data = await getCopyChat(chatId);
  if (!data) throw new Error("Conversa não encontrada.");

  const supabase = await createServerSupabase();

  const { error: e1 } = await supabase
    .from("copy_messages")
    .insert({ chat_id: chatId, role: "user", content: trimmed });
  if (e1) throw new Error(`Falha ao salvar mensagem: ${e1.message}`);

  if (data.chat.title === "Nova conversa") {
    await supabase
      .from("copy_chats")
      .update({ title: chatTitleFrom(trimmed) })
      .eq("id", chatId);
  }

  const history = [
    ...data.messages.map((m) => ({ role: m.role, content: m.content, attachments: m.attachments ?? [] })),
    { role: "user" as const, content: trimmed, attachments: [] },
  ];

  const brandText = compileBrandKnowledge(await listBrandBlocks());
  const reply = await generateCopyReply(history, brandText);

  const { error: e2 } = await supabase
    .from("copy_messages")
    .insert({ chat_id: chatId, role: "assistant", content: reply });
  if (e2) throw new Error(`Falha ao salvar resposta: ${e2.message}`);

  await supabase
    .from("copy_chats")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", chatId);

  revalidatePath("/copywriter");
  revalidatePath(`/copywriter/${chatId}`);
  return reply;
}

export async function deleteCopyChatAction(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("copy_chats").delete().eq("id", id);
  if (error) throw new Error(`Falha ao remover conversa: ${error.message}`);
  revalidatePath("/copywriter");
}
