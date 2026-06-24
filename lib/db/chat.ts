import { createServerSupabase } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/db/types";

export async function listChatMessages(campaignId: string): Promise<ChatMessage[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at");
  if (error) throw new Error(`Falha ao carregar mensagens: ${error.message}`);
  return (data ?? []) as ChatMessage[];
}
