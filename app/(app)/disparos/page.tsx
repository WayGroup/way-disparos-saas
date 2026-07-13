import { listSyncedGroups, listActiveGroups } from "@/lib/db/communities";
import { listAssets } from "@/lib/db/assets";
import { listSends, countSendsByStatus, getAppSettings } from "@/lib/db/sends";
import { getEvolutionConfig } from "@/lib/evolution/config";
import { evoConnectionState } from "@/lib/evolution/client";
import type { EvoConnectionState } from "@/lib/evolution/types";
import { DisparosView } from "./_components/disparos-view";

export const dynamic = "force-dynamic";

export default async function DisparosPage() {
  const [groups, activeGroups, assets, sends, counts, settings] = await Promise.all([
    listSyncedGroups(),
    listActiveGroups(),
    listAssets(),
    listSends(),
    countSendsByStatus(),
    getAppSettings(),
  ]);

  // A Evolution pode estar fora do ar ou mal configurada; a página não pode cair junto —
  // é dela que sai o botão de pânico.
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
      sends={sends}
      counts={counts}
      paused={settings.sends_paused}
      pausedReason={settings.paused_reason}
    />
  );
}
