import { createServerSupabase } from "@/lib/supabase/server";
import type { CopyChat, CopyMessage } from "@/lib/db/types";

export async function listCopyChats(): Promise<CopyChat[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("copy_chats").select("*").order("updated_at", { ascending: false });
  if (error) throw new Error(`Falha ao carregar conversas: ${error.message}`);
  return (data ?? []) as CopyChat[];
}

export async function getCopyChat(id: string): Promise<{ chat: CopyChat; messages: CopyMessage[] } | null> {
  const supabase = await createServerSupabase();
  const { data: chat, error } = await supabase.from("copy_chats").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao carregar conversa: ${error.message}`);
  if (!chat) return null;
  const { data: messages, error: e2 } = await supabase.from("copy_messages").select("*").eq("chat_id", id).order("created_at");
  if (e2) throw new Error(`Falha ao carregar mensagens: ${e2.message}`);
  return { chat: chat as CopyChat, messages: (messages ?? []) as CopyMessage[] };
}
