import { createServerSupabase } from "@/lib/supabase/server";
import type { AppSettings, ScheduledSend, SendStatus } from "@/lib/db/types";

export type SendWithContext = ScheduledSend & {
  campaign_name: string | null;
  /** Necessário para saber se um `pendente` está travado por falta de aprovação. */
  campaign_status: string | null;
  post_role: string | null;
};

// A Fila é o que ainda está aberto: vai sair, está saindo, ou falhou e pede decisão.
const LIVE_STATUSES: SendStatus[] = ["pendente", "enviando", "falhou", "expirado"];
// O Histórico é o que terminou de vez.
const DONE_STATUSES: SendStatus[] = ["enviado", "cancelado"];

export const HISTORY_PAGE_SIZE = 40;

const SELECT = "*, campaigns(name, status), campaign_group_posts(role)";

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

/**
 * A Fila: tudo que ainda está aberto. Não pagina — é pequeno por natureza (você só
 * agenda até certo ponto à frente, e falhas se resolvem). O limite alto é só um freio
 * de segurança, não uma janela de paginação.
 */
export async function listQueueSends(): Promise<SendWithContext[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("scheduled_sends")
    .select(SELECT)
    .in("status", LIVE_STATUSES)
    .order("scheduled_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(`Falha ao carregar a fila: ${error.message}`);
  return (data ?? []).map(toContext);
}

export type HistoryFilter = {
  campaignId?: string;
  /** Só faz sentido dentro do Histórico: 'enviado' | 'cancelado'. Vazio = ambos. */
  status?: SendStatus;
  page?: number;
};

export type HistoryPage = {
  sends: SendWithContext[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * O Histórico: o que já terminou, como um livro-caixa. Aqui o volume cresce, então
 * aqui mora a paginação e o filtro por campanha — do lado do servidor, para não
 * arrastar milhares de linhas até o browser.
 */
export async function listHistorySends(filter: HistoryFilter = {}): Promise<HistoryPage> {
  const supabase = await createServerSupabase();
  const page = Math.max(1, filter.page ?? 1);
  const from = (page - 1) * HISTORY_PAGE_SIZE;
  const to = from + HISTORY_PAGE_SIZE - 1;

  const statuses = filter.status ? [filter.status] : DONE_STATUSES;

  let query = supabase
    .from("scheduled_sends")
    .select(SELECT, { count: "exact" })
    .in("status", statuses)
    .order("scheduled_at", { ascending: false })
    .range(from, to);

  if (filter.campaignId) query = query.eq("campaign_id", filter.campaignId);

  const { data, error, count } = await query;
  if (error) throw new Error(`Falha ao carregar o histórico: ${error.message}`);

  const total = count ?? 0;
  return {
    sends: (data ?? []).map(toContext),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
  };
}

export type SendCampaign = { id: string; name: string };

/** As campanhas que têm algum envio — alimenta o filtro do Histórico. */
export async function listSendCampaigns(): Promise<SendCampaign[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("scheduled_sends")
    .select("campaign_id, campaigns(name)")
    .not("campaign_id", "is", null)
    .limit(5000);
  if (error) throw new Error(`Falha ao carregar campanhas: ${error.message}`);

  const seen = new Map<string, string>();
  for (const row of data ?? []) {
    const r = row as unknown as { campaign_id: string; campaigns: { name: string } | null };
    if (r.campaign_id && !seen.has(r.campaign_id)) {
      seen.set(r.campaign_id, r.campaigns?.name ?? "campanha");
    }
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAppSettings(): Promise<AppSettings> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("app_settings").select("*").eq("id", true).single();
  if (error) throw new Error(`Falha ao carregar configurações: ${error.message}`);
  return data as AppSettings;
}
