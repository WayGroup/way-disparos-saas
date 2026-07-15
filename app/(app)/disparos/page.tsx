import { listSyncedGroups, listActiveGroups } from "@/lib/db/communities";
import { listAssets } from "@/lib/db/assets";
import {
  listQueueSends,
  listHistorySends,
  listSendCampaigns,
  getAppSettings,
  type HistoryPage,
  type SendCampaign,
} from "@/lib/db/sends";
import type { SendStatus } from "@/lib/db/types";
import { getEvolutionConfig } from "@/lib/evolution/config";
import { evoConnectionState } from "@/lib/evolution/client";
import type { EvoConnectionState } from "@/lib/evolution/types";
import { DisparosView } from "./_components/disparos-view";

export const dynamic = "force-dynamic";

const HISTORY_STATUSES: SendStatus[] = ["enviado", "cancelado"];

export default async function DisparosPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; campanha?: string; status?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "historico" ? "historico" : "fila";
  const campaignId = sp.campanha ?? "";
  const historyStatus = HISTORY_STATUSES.includes(sp.status as SendStatus) ? sp.status! : "";
  const page = Math.max(1, Number(sp.pagina) || 1);

  // A fila é sempre carregada (é pequena) — alimenta a aba Fila e o badge de atenção.
  // O histórico e a lista de campanhas só quando o modo Histórico está aberto.
  const [groups, activeGroups, assets, queueSends, settings, history, campaigns] =
    await Promise.all([
      listSyncedGroups(),
      listActiveGroups(),
      listAssets(),
      listQueueSends(),
      getAppSettings(),
      view === "historico"
        ? listHistorySends({
            campaignId: campaignId || undefined,
            status: (historyStatus || undefined) as SendStatus | undefined,
            page,
          })
        : Promise.resolve<HistoryPage | null>(null),
      view === "historico" ? listSendCampaigns() : Promise.resolve<SendCampaign[]>([]),
    ]);

  let state: EvoConnectionState | null = null;
  let configError: string | null = null;
  try {
    state = await evoConnectionState(getEvolutionConfig(process.env));
  } catch (e) {
    configError = e instanceof Error ? e.message : "Falha ao falar com a Evolution.";
  }

  return (
    <DisparosView
      state={state}
      configError={configError}
      groups={groups}
      activeGroups={activeGroups}
      assets={assets}
      paused={settings.sends_paused}
      pausedReason={settings.paused_reason}
      view={view}
      queueSends={queueSends}
      history={history}
      campaigns={campaigns}
      campaignId={campaignId}
      historyStatus={historyStatus}
    />
  );
}
