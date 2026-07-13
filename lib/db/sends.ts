import { createServerSupabase } from "@/lib/supabase/server";
import type { AppSettings, ScheduledSend } from "@/lib/db/types";
import { displayStatus, type DisplayStatus } from "@/lib/sends/status";

export type SendWithContext = ScheduledSend & {
  campaign_name: string | null;
  /** Necessário para saber se um `pendente` está travado por falta de aprovação. */
  campaign_status: string | null;
  post_role: string | null;
};

function toContext(row: Record<string, unknown>): SendWithContext {
  const { campaigns, campaign_group_posts, ...send } = row;
  const campaign = campaigns as { name: string; status: string } | null;
  return {
    ...(send as ScheduledSend),
    campaign_name: campaign?.name ?? null,
    campaign_status: campaign?.status ?? null,
    post_role: (campaign_group_posts as { role: string } | null)?.role ?? null,
  };
}

export async function listSends(
  filter: { status?: DisplayStatus; campaignId?: string; limit?: number } = {},
): Promise<SendWithContext[]> {
  const supabase = await createServerSupabase();
  let query = supabase
    .from("scheduled_sends")
    .select("*, campaigns(name, status), campaign_group_posts(role)")
    .order("scheduled_at", { ascending: false })
    .limit(filter.limit ?? 300);

  if (filter.campaignId) query = query.eq("campaign_id", filter.campaignId);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar envios: ${error.message}`);

  const sends = (data ?? []).map(toContext);

  // "aguardando" não existe no banco — é derivado. Por isso o filtro é aplicado aqui,
  // e não como um .eq() na query.
  if (!filter.status) return sends;
  return sends.filter((s) => displayStatus(s) === filter.status);
}

export async function countSendsByStatus(): Promise<Record<DisplayStatus, number>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("scheduled_sends")
    .select("status, campaigns(status)");
  if (error) throw new Error(`Falha ao contar envios: ${error.message}`);

  const counts: Record<DisplayStatus, number> = {
    aguardando: 0,
    pendente: 0,
    enviando: 0,
    enviado: 0,
    falhou: 0,
    cancelado: 0,
  };

  for (const row of data ?? []) {
    const r = row as unknown as {
      status: ScheduledSend["status"];
      campaigns: { status: string } | null;
    };
    counts[displayStatus({ status: r.status, campaign_status: r.campaigns?.status ?? null })]++;
  }

  return counts;
}

export async function getAppSettings(): Promise<AppSettings> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("app_settings").select("*").eq("id", true).single();
  if (error) throw new Error(`Falha ao carregar configurações: ${error.message}`);
  return data as AppSettings;
}
