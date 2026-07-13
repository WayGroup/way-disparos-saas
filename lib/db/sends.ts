import { createServerSupabase } from "@/lib/supabase/server";
import type { AppSettings, ScheduledSend, SendStatus } from "@/lib/db/types";

export type SendWithContext = ScheduledSend & {
  campaign_name: string | null;
  post_role: string | null;
};

export async function listSends(
  filter: { status?: SendStatus; campaignId?: string; limit?: number } = {},
): Promise<SendWithContext[]> {
  const supabase = await createServerSupabase();
  let query = supabase
    .from("scheduled_sends")
    .select("*, campaigns(name), campaign_group_posts(role)")
    .order("scheduled_at", { ascending: false })
    .limit(filter.limit ?? 200);

  if (filter.status) query = query.eq("status", filter.status);
  if (filter.campaignId) query = query.eq("campaign_id", filter.campaignId);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar envios: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const { campaigns, campaign_group_posts, ...send } = row;
    return {
      ...(send as ScheduledSend),
      campaign_name: (campaigns as { name: string } | null)?.name ?? null,
      post_role: (campaign_group_posts as { role: string } | null)?.role ?? null,
    };
  });
}

export async function countSendsByStatus(): Promise<Record<SendStatus, number>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("scheduled_sends").select("status");
  if (error) throw new Error(`Falha ao contar envios: ${error.message}`);

  const counts: Record<SendStatus, number> = {
    pendente: 0,
    enviando: 0,
    enviado: 0,
    falhou: 0,
    cancelado: 0,
  };
  for (const row of data ?? []) counts[(row as { status: SendStatus }).status]++;
  return counts;
}

export async function getAppSettings(): Promise<AppSettings> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("app_settings").select("*").eq("id", true).single();
  if (error) throw new Error(`Falha ao carregar configurações: ${error.message}`);
  return data as AppSettings;
}
